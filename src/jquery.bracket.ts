/**
 * jQuery Bracket
 *
 * Copyright (c) 2011-2013, Teijo Laine,
 * http://aropupu.fi/bracket/
 *
 * Licenced under the MIT licence
 */

/// <reference path="../lib/jquery.d.ts" />

interface Connector {
  height: number;
  shift: number;
}

interface ConnectorProvider {
  (tc: any, match: Match): Connector;
}

interface TeamBlock {
  source: () => TeamBlock;
  name: string;
  id: number;
  idx: number;
  score: number;
}

interface MatchIndicator {
  name: string;
  idx: number;
}

interface Match {
  el: JQuery;
  id: number;
  round: any;
  connectorCb: (cb: ConnectorProvider) => void;
  connect: (cb: ConnectorProvider) => void;
  winner: () => TeamBlock;
  loser: () => TeamBlock;
  first: () => TeamBlock;
  second: () => TeamBlock;
  setAlignCb: (cb: (Object) => void) => void;
  render: () => void;
  results: () => Array<number>;
}

interface MatchSource {
  source: () => TeamBlock
}

interface Round {
  el: JQuery;
  id: number;
  bracket: Bracket;
  addMatch: (teamCb: () => Array<MatchSource>, renderCb: (match: Match) => boolean) =>  Match;
  match: (id: number) => Match
  prev: () => Round
  size: () => number;
  render: () => void;
  results: () => Array<Array<number>>;
}

interface Bracket {
  el: JQuery;
  addRound: any;
  dropRound: () => void;
  round: (id: number) => Round;
  size: () => number;
  final: () => Match;
  winner: () => TeamBlock;
  loser: () => TeamBlock;
  render: () => void;
  results: () => Array<Array<Array<number>>>;
}

interface MatchResult {
  a: TeamBlock;
  b: TeamBlock;
}

interface DoneCallback {
  (val: string, next?: boolean): void;
}

interface Decorator {
  edit: (span: JQuery, name: string, done_fn: DoneCallback) => void;
  render: (container: JQuery, team: string, score: any) => void;
}

interface Options {
  el: JQuery;
  init: any;
  save: (data: any, userData: any) => void;
  userData: any;
  decorator: Decorator;
  skipConsolationRound: boolean;
  skipSecondaryFinal: boolean;
  dir: string;
  onMatchClick: (data: any) => void;
  onMatchHover: (data: any, hover: boolean) => void;
}

(function($) {
  // http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
  function isNumber(n: any): boolean {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function depth(a): number {
    function df(a, d: number): number {
      if (a instanceof Array)
        return df(a[0], d + 1)
      return d
    }

    return df(a, 0)
  }

  function wrap(a, d: number) {
    if (d > 0)
      a = wrap([a], d - 1)
    return a
  }

  function emptyTeam(): TeamBlock {
     return {source: null, name: null, id: -1, idx: -1, score: null}
  }

  function teamsInResultOrder(match: MatchResult) {
    if (isNumber(match.a.score) && isNumber(match.b.score)) {
      if (match.a.score > match.b.score)
        return [match.a, match.b]
      else if (match.a.score < match.b.score)
        return [match.b, match.a]
    }
    return []
  }

  function matchWinner(match: MatchResult): TeamBlock {
    return teamsInResultOrder(match)[0] || emptyTeam()
  }

  function matchLoser(match: MatchResult): TeamBlock {
    return teamsInResultOrder(match)[1] || emptyTeam()
  }

  function trackHighlighter(teamIndex: number, cssClass: string, container: JQuery) {
    var elements = container.find('.team[data-teamid=' + teamIndex + ']')
    var addedClass
    if (!cssClass)
      addedClass = 'highlight'
    else
      addedClass = cssClass

    return {
      highlight: function() {
        elements.each(function() {
          $(this).addClass(addedClass)

          if ($(this).hasClass('win'))
            $(this).parent().find('.connector').addClass(addedClass)
        })
      },

      deHighlight: function() {
        elements.each(function() {
          $(this).removeClass(addedClass)
          $(this).parent().find('.connector').removeClass(addedClass)
        })
      }
    }
  }

  function postProcess(container: JQuery, w: Bracket, f: Bracket) {
    var source = f || w

    var winner = source.winner()
    var loser = source.loser()

    var winTrack = null
    var loseTrack = null

    if (winner && loser) {
      winTrack = trackHighlighter(winner.idx, 'highlightWinner', container);
      loseTrack = trackHighlighter(loser.idx, 'highlightLoser', container);
      winTrack.highlight()
      loseTrack.highlight()
    }

    container.find('.team').mouseover(function() {
      var i = $(this).attr('data-teamid')
      var track = trackHighlighter(i, null, container);
      track.highlight()
      $(this).mouseout(function() {
        track.deHighlight()
        $(this).unbind('mouseout')
      })
    })
  }

  function defaultEdit(span: JQuery, data: string, done: DoneCallback) {
    var input = $('<input type="text">')
    input.val(data)
    span.html(input)
    input.focus()
    input.blur(function() {
      done(input.val())
    })
    input.keydown(function(e) {
      var key = (e.keyCode || e.which)
      if (key === 9 /*tab*/ || key === 13 /*return*/ || key === 27 /*esc*/) {
        e.preventDefault()
        done(input.val(), (key !== 27))
      }
    })
  }

  function defaultRender(container: JQuery, team: string, score: any) {
    container.append(team)
  }

  function winnerBubbles(match: Match): boolean {
    var el = match.el
    var winner = el.find('.team.win')
    winner.append('<div class="bubble">1st</div>')
    var loser = el.find('.team.lose')
    loser.append('<div class="bubble">2nd</div>')
    return true
  }

  function consolationBubbles(match: Match): boolean {
    var el = match.el
    var winner = el.find('.team.win')
    winner.append('<div class="bubble third">3rd</div>')
    var loser = el.find('.team.lose')
    loser.append('<div class="bubble fourth">4th</div>')
    return true
  }

  function prepareWinners(winners: Bracket, teams, isSingleElimination: boolean, skipConsolationRound: boolean) {
    var rounds = Math.log(teams.length * 2) / Math.log(2);
    var matches = teams.length;
    var round

    for (var r = 0; r < rounds; r += 1) {
      round = winners.addRound()

      for (var m = 0; m < matches; m += 1) {
        var teamCb = null

        if (r === 0) {
          teamCb = function() {
            var t = teams[m]
            var i = m
            return [
              {source: function(): MatchIndicator {
                return {name: t[0], idx: (i * 2)}
              }},
              {source: function(): MatchIndicator {
                return {name: t[1], idx: (i * 2 + 1)}
              }}
            ]
          }
        }

        if (!(r === rounds - 1 && isSingleElimination)) {
          round.addMatch(teamCb)
        }
        else {
          var match = round.addMatch(teamCb, winnerBubbles)
          match.setAlignCb(function(tC) {
            tC.css('top', '');
            tC.css('position', 'absolute');
            if (skipConsolationRound)
              tC.css('top', (match.el.height() / 2 - tC.height() / 2) + 'px');
            else
              tC.css('bottom', (-tC.height() / 2) + 'px');
          })
        }
      }
      matches /= 2;
    }

    if (isSingleElimination) {
      winners.final().connectorCb(function() {
        return null
      })

      if (teams.length > 1 && !skipConsolationRound) {
        var third = winners.final().round().prev().match(0).loser
        var fourth = winners.final().round().prev().match(1).loser
        var consol = round.addMatch(function() {
            return [
              {source: third},
              {source: fourth}
            ]
          },
          consolationBubbles)

        consol.setAlignCb(function(tC) {
          var height = (winners.el.height()) / 2
          consol.el.css('height', (height) + 'px');

          var topShift = tC.height()

          tC.css('top', (topShift) + 'px');
        })

        consol.connectorCb(function() {
          return null
        })
      }
    }
  }

  function prepareLosers(winners: Bracket, losers: Bracket, teamCount: number) {
    var rounds = Math.log(teamCount * 2) / Math.log(2) - 1;
    var matches = teamCount / 2;

    for (var r = 0; r < rounds; r += 1) {
      for (var n = 0; n < 2; n += 1) {
        var round = losers.addRound()

        for (var m = 0; m < matches; m += 1) {
          var teamCb: () => Array<MatchSource> = null

          /* special cases */
          if (!(n % 2 === 0 && r !== 0)) {
            teamCb = function() {
              /* first round comes from winner bracket */
              if (n % 2 === 0 && r === 0) {
                return [
                  {source: winners.round(0).match(m * 2).loser},
                  {source: winners.round(0).match(m * 2 + 1).loser}
                ]
              }
              else { /* match with dropped */
                var winnerMatch = m
                /* To maximize the time it takes for two teams to play against
                 * eachother twice, WB losers are assigned in reverse order
                 * every second round of LB */
                if (r % 2 === 0)
                  winnerMatch = matches - m - 1
                return [
                  {source: losers.round(r * 2).match(m).winner},
                  {source: winners.round(r + 1).match(winnerMatch).loser}
                ]
              }
            }
          }

          var match = round.addMatch(teamCb)
          var teamCon = match.el.find('.teamContainer')
          match.setAlignCb(function() {
            teamCon.css('top', (match.el.height() / 2 - teamCon.height() / 2) + 'px');
          })

          if (r < rounds - 1 || n < 1) {
            var cb = null
            // inside lower bracket
            if (n % 2 === 0) {
              cb = function(tC, match): Connector {
                var connectorOffset = tC.height() / 4
                var height = 0;
                var shift = 0;

                if (match.winner().id === 0) {
                  shift = connectorOffset
                }
                else if (match.winner().id === 1) {
                  height = -connectorOffset * 2;
                  shift = connectorOffset
                }
                else {
                  shift = connectorOffset * 2
                }
                return {height: height, shift: shift}
              }
            }
            match.connectorCb(cb)
          }
        }
      }
      matches /= 2;
    }
  }

  function prepareFinals(finals: Bracket, winners: Bracket, losers: Bracket,
                         skipSecondaryFinal: boolean, skipConsolationRound: boolean, topCon: JQuery) {
    var round = finals.addRound()
    var match = round.addMatch(function() {
        return [
          {source: winners.winner},
          {source: losers.winner}
        ]
      },
      function(match) {
        /* Track if container has been resized for final rematch */
        var _isResized = false
        /* LB winner won first final match, need a new one */
        if (!skipSecondaryFinal && (match.winner().name !== null && match.winner().name === losers.winner().name)) {
          if (finals.size() === 2)
            return
          /* This callback is ugly, would be nice to make more sensible solution */
          var round = finals.addRound(function() {
            var rematch = ((match.winner().name !== null && match.winner().name === losers.winner().name))
            if (_isResized === false) {
              if (rematch) {
                _isResized = true
                topCon.css('width', (parseInt(topCon.css('width'), 10) + 140) + 'px')
              }
            }
            if (!rematch && _isResized) {
              _isResized = false
              finals.dropRound()
              topCon.css('width', (parseInt(topCon.css('width'), 10) - 140) + 'px')
            }
            return rematch
          })
          /* keep order the same, WB winner top, LB winner below */
          var match2 = round.addMatch(function() {
              return [
                {source: match.first},
                {source: match.second}
              ]
            },
            winnerBubbles)

          match.connectorCb(function(tC): Connector {
            return {height: 0, shift: tC.height() / 2}
          })

          match2.connectorCb(function() {
            return null
          })
          match2.setAlignCb(function(tC) {
            var height = (winners.el.height() + losers.el.height())
            match2.el.css('height', (height) + 'px');

            var topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height()

            tC.css('top', (topShift) + 'px')
          })
          return false
        }
        else {
          return winnerBubbles(match)
        }
      })

    match.setAlignCb(function(tC) {
      var height = (winners.el.height() + losers.el.height())
      if (!skipConsolationRound)
        height /= 2
      match.el.css('height', (height) + 'px');

      var topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height()

      tC.css('top', (topShift) + 'px')
    })

    var shift
    var height

    if (!skipConsolationRound) {
      var fourth = losers.final().round().prev().match(0).loser
      var consol = round.addMatch(function() {
          return [
            {source: fourth},
            {source: losers.loser}
          ]
        },
        consolationBubbles)
      consol.setAlignCb(function(tC) {
        var height = (winners.el.height() + losers.el.height()) / 2
        consol.el.css('height', (height) + 'px');

        var topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 + tC.height() / 2 - height

        tC.css('top', (topShift) + 'px');
      })

      match.connectorCb(function(): Connector {
        return null
      })
      consol.connectorCb(function(): Connector {
        return null
      })
    }

    winners.final().connectorCb(function(tC): Connector {
      var connectorOffset = tC.height() / 4
      var topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height() / 2
      var matchupOffset = topShift - winners.el.height() / 2
      if (winners.winner().id === 0) {
        height = matchupOffset + connectorOffset * 2
        shift = connectorOffset
      }
      else if (winners.winner().id === 1) {
        height = matchupOffset
        shift = connectorOffset * 3
      }
      else {
        height = matchupOffset + connectorOffset
        shift = connectorOffset * 2
      }
      height -= tC.height() / 2
      return {height: height, shift: shift}
    })

    losers.final().connectorCb(function(tC): Connector {
      var connectorOffset = tC.height() / 4
      var topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height() / 2
      var matchupOffset = topShift - winners.el.height() / 2
      if (losers.winner().id === 0) {
        height = matchupOffset
        shift = connectorOffset * 3
      }
      else if (losers.winner().id === 1) {
        height = matchupOffset + connectorOffset * 2
        shift = connectorOffset
      }
      else {
        height = matchupOffset + connectorOffset
        shift = connectorOffset * 2
      }
      height += tC.height() / 2
      return {height: -height, shift: -shift}
    })
  }

  function mkRound(bracket: Bracket,  previousRound: Round,
                   roundIdx: number,  results,  doRenderCb: () => boolean, mkMatch): Round {
    var matches: Array<Match> = []
    var roundCon = $('<div class="round"></div>')

    return {
      el: roundCon,
      bracket: bracket,
      id: roundIdx,
      addMatch: function(teamCb: () => Array<MatchSource>, renderCb: () => boolean): Match {
        var matchIdx = matches.length
        var teams

        if (teamCb !== null)
          teams = teamCb()
        else
          teams = [
            {source: bracket.round(roundIdx - 1).match(matchIdx * 2).winner},
            {source: bracket.round(roundIdx - 1).match(matchIdx * 2 + 1).winner}
          ]

        var match = mkMatch(this, teams, matchIdx, !results ? null : results[matchIdx], renderCb)
        matches.push(match)
        return match;
      },
      match: function(id: number): Match {
        return matches[id]
      },
      prev: function(): Round {
        return previousRound
      },
      size: function(): number {
        return matches.length
      },
      render: function() {
        roundCon.empty()
        if (typeof(doRenderCb) === 'function')
          if (!doRenderCb())
            return
        roundCon.appendTo(bracket.el)
        $.each(matches, function(i, ma) {
          ma.render()
        })
      },
      results: function() {
        var results = []
        $.each(matches, function(i, ma) {
          results.push(ma.results())
        })
        return results
      }
    }
  }

  function mkBracket(bracketCon: JQuery, results, mkMatch): Bracket {
    var rounds: Array<Round> = []

    return {
      el: bracketCon,
      addRound: function(doRenderCb: () => boolean): Round {
        var id = rounds.length
        var previous = null
        if (id > 0)
          previous = rounds[id - 1]

        var round = mkRound(this, previous, id, !results ? null : results[id], doRenderCb, mkMatch)
        rounds.push(round)
        return round;
      },
      dropRound: function() {
        rounds.pop()
      },
      round: function(id: number): Round {
        return rounds[id]
      },
      size: function(): number {
        return rounds.length
      },
      final: function(): Match {
        return rounds[rounds.length - 1].match(0)
      },
      winner: function(): TeamBlock {
        return rounds[rounds.length - 1].match(0).winner()
      },
      loser: function(): TeamBlock {
        return rounds[rounds.length - 1].match(0).loser()
      },
      render: function() {
        bracketCon.empty()
        /* Length of 'rounds' can increase during render in special case when
         LB win in finals adds new final round in match render callback.
         Therefore length must be read on each iteration. */
        for (var i = 0; i < rounds.length; i += 1)
          rounds[i].render()
      },
      results: function() {
        var results = []
        $.each(rounds, function(i, ro) {
          results.push(ro.results())
        })
        return results
      }
    }
  }

  function connector(height: number, shift: number, teamCon: JQuery, align: string) {
    var width = parseInt($('.round:first').css('margin-right'), 10) / 2
    var drop = true;
    // drop:
    // [team]'\
    //         \_[team]
    // !drop:
    //         /'[team]
    // [team]_/
    if (height < 0) {
      drop = false;
      height = -height;
    }
    /* straight lines are prettier */
    if (height < 2)
      height = 0

    var src = $('<div class="connector"></div>').appendTo(teamCon);
    src.css('height', height);
    src.css('width', width + 'px');
    src.css(align, (-width - 2) + 'px');

    if (shift >= 0)
      src.css('top', shift + 'px');
    else
      src.css('bottom', (-shift) + 'px');

    if (drop)
      src.css('border-bottom', 'none');
    else
      src.css('border-top', 'none');

    var dst = $('<div class="connector"></div>').appendTo(src);
    dst.css('width', width + 'px');
    dst.css(align, -width + 'px');
    if (drop)
      dst.css('bottom', '0px');
    else
      dst.css('top', '0px');

    return src;
  }

  function embedEditButtons(topCon: JQuery, data: any, opts: Options) {
    var tools = $('<div class="tools"></div>').appendTo(topCon)
    var inc = $('<span class="increment">+</span>').appendTo(tools)
    inc.click(function () {
      var i
      var len = data.teams.length
      for (i = 0; i < len; i += 1)
        data.teams.push(['', ''])
      return JqueryBracket(opts)
    })

    if (data.teams.length > 1 && data.results.length === 1 ||
      data.teams.length > 2 && data.results.length === 3) {
      var dec = $('<span class="decrement">-</span>').appendTo(tools)
      dec.click(function () {
        if (data.teams.length > 1) {
          data.teams = data.teams.slice(0, data.teams.length / 2)
          return JqueryBracket(opts)
        }
      })
    }

    var type
    if (data.results.length === 1 && data.teams.length > 1) {
      type = $('<span class="doubleElimination">de</span>').appendTo(tools)
      type.click(function () {
        if (data.teams.length > 1 && data.results.length < 3) {
          data.results.push([], [])
          return JqueryBracket(opts)
        }
      })
    }
    else if (data.results.length === 3 && data.teams.length > 1) {
      type = $('<span class="singleElimination">se</span>').appendTo(tools)
      type.click(function () {
        if (data.results.length === 3) {
          data.results = data.results.slice(0, 1)
          return JqueryBracket(opts)
        }
      })
    }
  }

  var JqueryBracket = function(opts: Options) {
    var align = opts.dir === 'lr' ? 'right' : 'left'
    var resultIdentifier

    if (!opts)
      throw Error('Options not set')
    if (!opts.el)
      throw Error('Invalid jQuery object as container')
    if (!opts.init && !opts.save)
      throw Error('No bracket data or save callback given')
    if (opts.userData === undefined)
      opts.userData = null

    if (opts.decorator && (!opts.decorator.edit || !opts.decorator.render))
      throw Error('Invalid decorator input')
    else if (!opts.decorator)
      opts.decorator = { edit: defaultEdit, render: defaultRender }

    var data
    if (!opts.init)
      opts.init = {teams: [
        ['', '']
      ],
        results: [] }

    data = opts.init

    var topCon = $('<div class="jQBracket ' + opts.dir + '"></div>').appendTo(opts.el.empty())

    function renderAll(save: boolean): void {
      resultIdentifier = 0
      w.render()
      if (l && f) {
        l.render()
        f.render()
      }
      postProcess(topCon, w, f)

      if (save) {
        data.results[0] = w.results()
        if (l && f) {
          data.results[1] = l.results()
          data.results[2] = f.results()
        }
        if (opts.save)
          opts.save(data, opts.userData)
      }
    }

    function mkMatch(round: Round, data: Array<TeamBlock>, idx: number,
                     results, renderCb: Function): Match {
      var match: MatchResult = {a: data[0], b: data[1]}
      function teamElement(round: number, team: TeamBlock, isReady: boolean) {
        var rId = resultIdentifier
        var sEl = $('<div class="score" data-resultid="result-' + rId + '"></div>')
        var score
        if (!team.name || !isReady) {
          score = '--'
        }
        else {
          if (!isNumber(team.score)) {
            score = '--'
          } else {
            score = team.score
          }
        }
        sEl.append(score)

        resultIdentifier += 1

        var name = !team.name ? '--' : team.name
        var tEl = $('<div class="team"></div>');
        var nEl = $('<div class="label"></div>').appendTo(tEl)

        if (round === 0)
          tEl.attr('data-resultid', 'team-' + rId)

        opts.decorator.render(nEl, name, score)

        if (isNumber(team.idx))
          tEl.attr('data-teamid', team.idx)

        if (team.name === null)
          tEl.addClass('na')
        else if (matchWinner(match).name === team.name)
          tEl.addClass('win')
        else if (matchLoser(match).name === team.name)
          tEl.addClass('lose')

        tEl.append(sEl)

        if (!(team.name === null || !isReady || !opts.save) && opts.save) {
          nEl.addClass('editable')
          nEl.click(function() {
            var span = $(this)

            function editor() {
              function done_fn(val, next: boolean) {
                if (val)
                  opts.init.teams[~~(team.idx / 2)][team.idx % 2] = val
                renderAll(true)
                span.click(editor)
                var labels = opts.el.find('.team[data-teamid=' + (team.idx + 1) + '] div.label:first')
                if (labels.length && next === true && round === 0)
                  $(labels).click()
              }

              span.unbind()
              opts.decorator.edit(span, team.name, done_fn)
            }

            editor()
          })
          if (team.name) {
            sEl.addClass('editable')
            sEl.click(function() {
              var span = $(this)

              function editor() {
                span.unbind()

                var score
                if (!isNumber(team.score))
                  score = '0'
                else
                  score = span.text()

                var input = $('<input type="text">')
                input.val(score)
                span.html(input)

                input.focus().select()
                input.keydown(function(e) {
                  if (!isNumber($(this).val()))
                    $(this).addClass('error')
                  else
                    $(this).removeClass('error')

                  var key = (e.keyCode || e.which)
                  if (key === 9 || key === 13 || key === 27) {
                    e.preventDefault()
                    $(this).blur()
                    if (key === 27)
                      return

                    var next = topCon.find('div.score[data-resultid=result-' + (rId + 1) + ']')
                    if (next)
                      next.click()
                  }
                })
                input.blur(function() {
                  var val = input.val()
                  if ((!val || !isNumber(val)) && !isNumber(team.score))
                    val = '0'
                  else if ((!val || !isNumber(val)) && isNumber(team.score))
                    val = team.score

                  span.html(val)
                  if (isNumber(val) && score !== parseInt(val, 10)) {
                    team.score = parseInt(val, 10)
                    renderAll(true)
                  }
                  span.click(editor)
                })
              }

              editor()
            })
          }
        }
        return tEl;
      }

      var connectorCb: ConnectorProvider = null
      var alignCb = null

      var matchCon = $('<div class="match"></div>')
      var teamCon = $('<div class="teamContainer"></div>')

      if (!opts.save) {
        var matchUserData = (results ? results[2] : null)

        if (opts.onMatchHover)
          teamCon.hover(function() { opts.onMatchHover(matchUserData, true) }, function() { opts.onMatchHover(matchUserData, false) })

        if (opts.onMatchClick)
          teamCon.click(function() { opts.onMatchClick(matchUserData) })
      }

      match.a.id = 0
      match.b.id = 1

      match.a.name = match.a.source().name
      match.b.name = match.b.source().name

      match.a.score = !results ? null : results[0]
      match.b.score = !results ? null : results[1]

      /* match has score even though teams haven't yet been decided */
      /* todo: would be nice to have in preload check, maybe too much work */
      if ((!match.a.name || !match.b.name) && (isNumber(match.a.score) || isNumber(match.b.score))) {
        console.log('ERROR IN SCORE DATA: ' + match.a.source().name + ': ' + match.a.score + ', ' + match.b.source().name + ': ' + match.b.score)
        match.a.score = match.b.score = null
      }

      return {
        el: matchCon,
        id: idx,
        round: function(): Round {
          return round
        },
        connectorCb: function(cb: ConnectorProvider) {
          connectorCb = cb
        },
        connect: function(cb: ConnectorProvider) {
          var connectorOffset = teamCon.height() / 4
          var matchupOffset = matchCon.height() / 2
          var shift
          var height

          if (!cb || cb === null) {
            if (idx % 2 === 0) { // dir == down
              if (this.winner().id === 0) {
                shift = connectorOffset
                height = matchupOffset
              }
              else if (this.winner().id === 1) {
                shift = connectorOffset * 3
                height = matchupOffset - connectorOffset * 2
              }
              else {
                shift = connectorOffset * 2
                height = matchupOffset - connectorOffset
              }
            }
            else { // dir == up
              if (this.winner().id === 0) {
                shift = -connectorOffset * 3
                height = -matchupOffset + connectorOffset * 2
              }
              else if (this.winner().id === 1) {
                shift = -connectorOffset
                height = -matchupOffset
              }
              else {
                shift = -connectorOffset * 2
                height = -matchupOffset + connectorOffset
              }
            }
          }
          else {
            var info = cb(teamCon, this)
            if (info === null) /* no connector */
              return
            shift = info.shift
            height = info.height
          }
          teamCon.append(connector(height, shift, teamCon, align));
        },
        winner: function() { return matchWinner(match) },
        loser: function() { return matchLoser(match) },
        first: function(): TeamBlock {
          return match.a
        },
        second: function(): TeamBlock {
          return match.b
        },
        setAlignCb: function(cb: Function) {
          alignCb = cb
        },
        render: function() {
          matchCon.empty()
          teamCon.empty()

          match.a.name = match.a.source().name
          match.b.name = match.b.source().name
          match.a.idx = match.a.source().idx
          match.b.idx = match.b.source().idx

          var isReady = false
          if ((match.a.name || match.a.name === '') &&
              (match.b.name || match.b.name === ''))
            isReady = true

          if (!matchWinner(match).name)
            teamCon.addClass('np')
          else
            teamCon.removeClass('np')

          teamCon.append(teamElement(round.id, match.a, isReady))
          teamCon.append(teamElement(round.id, match.b, isReady))

          matchCon.appendTo(round.el)
          matchCon.append(teamCon)

          this.el.css('height', (round.bracket.el.height() / round.size()) + 'px');
          teamCon.css('top', (this.el.height() / 2 - teamCon.height() / 2) + 'px');

          /* todo: move to class */
          if (alignCb)
            alignCb(teamCon)

          var isLast = false
          if (typeof(renderCb) === 'function')
            isLast = renderCb(this)

          if (!isLast)
            this.connect(connectorCb)
        },
        results: function() {
          return [match.a.score, match.b.score]
        }
      }
    }

    function isValid(data): boolean {
      var t = data.teams
      var r = data.results

      if (!t) {
        console.log('no teams', data)
        return false
      }

      if (!r)
        return true

      if (t.length < r[0][0].length) {
        console.log('more results than teams', data)
        return false
      }

      for (var b = 0; b < r.length; b += 1) {
        for (var i = 0; i < ~~(r[b].length / 2); i += 1) {
          if (r[b][2 * i].length < r[b][2 * i + 1].length) {
            console.log('previous round has less scores than next one', data)
            return false
          }
        }
      }

      for (var i = 0; i < r[0].length; i += 1) {
        if (!r[1] || !r[1][i * 2])
          break;

        if (r[0][i].length <= r[1][i * 2].length) {
          console.log('lb has more results than wb', data)
          return false
        }
      }

      try {
        $.each(r, function(i, br) {
          $.each(br, function(i, ro) {
            $.each(ro, function(i, ma) {
              if (ma.length !== 2) {
                console.log('match size not valid', ma)
                throw 'match size not valid'
              }
              /*logical xor*/
              if (!(isNumber(ma[0]) ? isNumber(ma[1]) : !isNumber(ma[1]))) {
                console.log('mixed results', ma)
                throw 'mixed results'
              }
            })
          })
        })
      }
      catch (e) {
        console.log(e)
        return false
      }

      return true
    }

    var w, l, f

    var r = data.results

    /* wrap data to into necessary arrays */
    r = wrap(r, 4 - depth(r))
    data.results = r

    var isSingleElimination = (r.length <= 1)

    if (opts.skipSecondaryFinal && isSingleElimination)
      $.error('skipSecondaryFinal setting is viable only in double elimination mode')

    if (opts.save)
      embedEditButtons(topCon, data, opts)

    var fEl, wEl, lEl

    if (isSingleElimination) {
      wEl = $('<div class="bracket"></div>').appendTo(topCon)
    }
    else {
      fEl = $('<div class="finals"></div>').appendTo(topCon)
      wEl = $('<div class="bracket"></div>').appendTo(topCon)
      lEl = $('<div class="loserBracket"></div>').appendTo(topCon)
    }

    var height = data.teams.length * 64

    wEl.css('height', height)

    // reserve space for consolation round
    if (isSingleElimination && data.teams.length <= 2 && !opts.skipConsolationRound) {
      height += 40
      topCon.css('height', height)
    }

    if (lEl)
      lEl.css('height', wEl.height() / 2)

    var rounds
    if (isSingleElimination)
      rounds = Math.log(data.teams.length * 2) / Math.log(2)
    else
      rounds = (Math.log(data.teams.length * 2) / Math.log(2) - 1) * 2 + 1

    if (opts.save)
      topCon.css('width', rounds * 140 + 40)
    else
      topCon.css('width', rounds * 140 + 10)

    w = mkBracket(wEl, !r || !r[0] ? null : r[0], mkMatch)

    if (!isSingleElimination) {
      l = mkBracket(lEl, !r || !r[1] ? null : r[1], mkMatch)
      f = mkBracket(fEl, !r || !r[2] ? null : r[2], mkMatch)
    }

    prepareWinners(w, data.teams, isSingleElimination, opts.skipConsolationRound)

    if (!isSingleElimination) {
      prepareLosers(w, l, data.teams.length);
      prepareFinals(f, w, l, opts.skipSecondaryFinal, opts.skipConsolationRound, topCon);
    }

    renderAll(false)

    return {
      data: function() {
        return opts.init
      }
    }
  }

  var methods = {
    init: function(opts: Options) {
      var that = this
      opts.el = this
      if (opts.save && (opts.onMatchClick || opts.onMatchHover))
        $.error('Match callbacks may not be passed in edit mode (in conjunction with save callback)')
      opts.dir = opts.dir || 'lr'
      opts.init.teams = !opts.init.teams || opts.init.teams.length == 0 ? [["", ""]] : opts.init.teams
      opts.skipConsolationRound = opts.skipConsolationRound || false
      opts.skipSecondaryFinal = opts.skipSecondaryFinal || false
      if (opts.dir !== 'lr' && opts.dir !== 'rl')
        $.error('Direction must be either: "lr" or "rl"')
      var bracket = JqueryBracket(opts)
      $(this).data('bracket', {target: that, obj: bracket})
      return bracket
    },
    data: function() {
      var bracket = $(this).data('bracket')
      return bracket.obj.data()
    }
  }

  $.fn.bracket = function(method) {
    if (methods[method]) {
      return methods[method].apply(this, Array.prototype.slice.call(arguments, 1))
    } else if (typeof method === 'object' || !method) {
      return methods.init.apply(this, arguments)
    } else {
      $.error('Method ' + method + ' does not exist on jQuery.bracket')
    }
  }
})(jQuery)
