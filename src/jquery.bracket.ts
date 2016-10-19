/**
 * jQuery Bracket
 *
 * Copyright (c) 2011-2016, Teijo Laine,
 * http://aropupu.fi/bracket/
 *
 * Licenced under the MIT licence
 */

/// <reference path="../lib/jquery.d.ts" />

(function($) {
  class Option<T> {
    static of<V>(value: V | null): Option<V> {
      return new Option(value);
    }

    get() {
      if (this.val === null) {
        throw new Error('Trying to get() empty Option');
      }
      return this.val;
    }

    orElse(defaultValue) {
      return (this.val === null) ? defaultValue : this.val;
    }

    orElseGet(defaultProvider) {
      return (this.val === null) ? defaultProvider() : this.val;
    }

    map<U>(f: (T) => U): Option<U | T> {
      return (this.val === null) ? this : new Option(f(this.val));
    }

    toNull() {
      return (this.val === null) ? null : this.val;
    }

    isEmpty(): boolean {
      return this.val === null;
    }

    private constructor(private val: T | null) {
      if (this.val === undefined) {
        throw new Error('Option cannot contain undefined');
      }
    }
  }

  interface Connector {
    height: number;
    shift: number;
  }

  interface ConnectorProvider {
    (tc: JQuery, match: Match): Connector | null;
  }

  enum BranchType {
    TBD,
    BYE
  }

  class TeamBlock {
    constructor(readonly source: (() => TeamBlock), // Where base of the information propagated from
                public name: Option<any>,
                readonly id: number, // Order in which team is in a match, 0 or 1
                public idx: number,
                public score: number | null) { }

    // Recursively check if branch ends into a BYE
    public emptyBranch(): BranchType {
      if (!this.name.isEmpty()) {
        return BranchType.TBD;
      } else {
        try {
          return this.source().emptyBranch();
        } catch (e) {
          if (e instanceof EndOfBranchException) {
            return BranchType.BYE;
          } else {
            throw new Error('Unexpected exception type');
          }
        }
      }
    }

  }

  interface Match {
    el: JQuery;
    id: number;
    round: () => Round;
    connectorCb: (cb: ConnectorProvider | null) => void;
    connect: (cb: ConnectorProvider) => void;
    winner: () => TeamBlock;
    loser: () => TeamBlock;
    first: () => TeamBlock;
    second: () => TeamBlock;
    setAlignCb: (cb: (JQuery) => void) => void;
    render: () => void;
    results: () => [number | null, number | null];
  }

  interface MatchSource {
    source: () => TeamBlock;
  }

  interface BoolCallback {
    (): boolean;
  }

  interface Bracket {
    el: JQuery;
    addRound: (BoolCallback?) => Round;
    dropRound: () => void;
    round: (id: number) => Round;
    size: () => number;
    final: () => Match;
    winner: () => TeamBlock;
    loser: () => TeamBlock;
    render: () => void;
    results: () => Array<Array<[number | null, number | null]>>;
  }

  // http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
  function isNumber(n: any): boolean {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function EndOfBranchException() {
    this.message = 'Root of information for this team';
    this.name = 'EndOfBranchException';
  }

  class MatchResult {
    private static teamsInResultOrder(match: MatchResult) {
      const aBye = match.a.name.isEmpty();
      const bBye = match.b.name.isEmpty();

      if (bBye && !aBye) {
        if (match.b.emptyBranch() === BranchType.BYE) {
          return [match.a, match.b];
        } else {
          return [];
        }
      } else if (aBye && !bBye) {
        if (match.a.emptyBranch() === BranchType.BYE) {
          return [match.b, match.a];
        } else {
          return [];
        }
      } else if (isNumber(match.a.score) && isNumber(match.b.score)) {
        if (match.a.score > match.b.score) {
          return [match.a, match.b];
        }
        else if (match.a.score < match.b.score) {
          return [match.b, match.a];
        }
      }
      return [];
    }

    // Arbitrary (either parent) source is required so that branch emptiness
    // can be determined by traversing to the beginning.
    private static emptyTeam(source: () => TeamBlock): TeamBlock {
      return new TeamBlock(source, Option.of(null), -1, -1, null);
    }

    constructor(readonly a: TeamBlock, readonly b: TeamBlock) { return; }

    winner(): TeamBlock {
      return MatchResult.teamsInResultOrder(this)[0] || MatchResult.emptyTeam(this.a.source);
    }

    loser(): TeamBlock {
      return MatchResult.teamsInResultOrder(this)[1] || MatchResult.emptyTeam(this.a.source);
    }
  }

  interface DoneCallback {
    (val: string, next?: boolean): void;
  }

  interface Decorator {
    edit: (span: JQuery, name: string, done_fn: DoneCallback) => void;
    render: (container: JQuery, team: string, score: any) => void;
  }

  interface InitData {
    teams: Array<[any, any]>;
    results: Array<Array<any>>;
  }

  interface Options {
    el: JQuery;
    init: InitData;
    save: (data: any, userData: any) => void;
    userData: any;
    decorator: Decorator;
    skipConsolationRound: boolean;
    skipSecondaryFinal: boolean;
    skipGrandFinalComeback: boolean;
    dir: string;
    onMatchClick: (data: any) => void;
    onMatchHover: (data: any, hover: boolean) => void;
  }

  function depth(a): number {
    function df(a, d: number): number {
      if (a instanceof Array) {
        return df(a[0], d + 1);
      }
      return d;
    }

    return df(a, 0);
  }

  function wrap(a, d: number) {
    if (d > 0) {
      a = wrap([a], d - 1);
    }
    return a;
  }

  function trackHighlighter(teamIndex: number, cssClass: string | null, container: JQuery) {
    const elements = container.find('.team[data-teamid=' + teamIndex + ']');
    const addedClass = !cssClass ? 'highlight' : cssClass;

    return {
      highlight() {
        elements.each(function() {
          $(this).addClass(addedClass);

          if ($(this).hasClass('win')) {
            $(this).parent().find('.connector').addClass(addedClass);
          }
        });
      },

      deHighlight() {
        elements.each(function() {
          $(this).removeClass(addedClass);
          $(this).parent().find('.connector').removeClass(addedClass);
        });
      }
    };
  }

  function postProcess(container: JQuery, w: Bracket, f: Bracket) {
    const source = f || w;
    const winner = source.winner();
    const loser = source.loser();

    if (winner && loser) {
      if (!winner.name.isEmpty()) {
        trackHighlighter(winner.idx, 'highlightWinner', container).highlight();
      }
      if (!loser.name.isEmpty()) {
        trackHighlighter(loser.idx, 'highlightLoser', container).highlight();
      }
    }

    container.find('.team').mouseover(function() {
      const i = parseInt($(this).attr('data-teamid'), 10);
      // Don't highlight BYEs
      if (i === -1) {
        return;
      }
      const track = trackHighlighter(i, null, container);
      track.highlight();
      $(this).mouseout(function() {
        track.deHighlight();
        $(this).unbind('mouseout');
      });
    });
  }

  function defaultEdit(span: JQuery, data: any, done: DoneCallback): void {
    const input = $('<input type="text">');
    input.val(data);
    span.empty().append(input);
    input.focus();
    input.blur(function() {
      done(input.val());
    });
    input.keydown(function(e) {
      const key = (e.keyCode || e.which);
      if (key === 9 /*tab*/ || key === 13 /*return*/ || key === 27 /*esc*/) {
        e.preventDefault();
        done(input.val(), (key !== 27));
      }
    });
  }

  function defaultRender(container: JQuery, team: string, score: any): void {
    container.append(team);
  }

  function winnerBubbles(match: Match): boolean {
    const el = match.el;
    const winner = el.find('.team.win');
    winner.append('<div class="bubble">1st</div>');
    const loser = el.find('.team.lose');
    loser.append('<div class="bubble">2nd</div>');
    return true;
  }

  function consolationBubbles(match: Match): boolean {
    const el = match.el;
    const winner = el.find('.team.win');
    winner.append('<div class="bubble third">3rd</div>');
    const loser = el.find('.team.lose');
    loser.append('<div class="bubble fourth">4th</div>');
    return true;
  }

  const winnerMatchSources = (teams: [any, any], m: number) => (): [MatchSource, MatchSource] => [
    {source: () => new TeamBlock(() => { throw new EndOfBranchException(); }, teams[m][0], 0, (m * 2), null)},
    {source: () => new TeamBlock(() => { throw new EndOfBranchException(); }, teams[m][1], 1, (m * 2 + 1), null)}
  ];

  const winnerAlignment = (match: Match, skipConsolationRound: boolean) => (tC: JQuery) => {
    tC.css('top', '');
    tC.css('position', 'absolute');
    if (skipConsolationRound) {
      tC.css('top', (match.el.height() / 2 - tC.height() / 2) + 'px');
    }
    else {
      tC.css('bottom', (-tC.height() / 2) + 'px');
    }
  };

  function prepareWinners(winners: Bracket, teams: [any, any], isSingleElimination: boolean,
                          skipConsolationRound: boolean, skipGrandFinalComeback: boolean) {
    const roundCount = Math.log(teams.length * 2) / Math.log(2);
    var matchCount = teams.length;
    var round;

    for (var r = 0; r < roundCount; r += 1) {
      round = winners.addRound();

      for (var m = 0; m < matchCount; m += 1) {
        const teamCb = (r === 0) ? winnerMatchSources(teams, m) : null;
        if (!(r === roundCount - 1 && isSingleElimination) && !(r === roundCount - 1 && skipGrandFinalComeback)) {
          round.addMatch(teamCb);
        }
        else {
          const match = round.addMatch(teamCb, winnerBubbles);
          if (!skipGrandFinalComeback) {
            match.setAlignCb(winnerAlignment(match, skipConsolationRound));
          }
        }
      }
      matchCount /= 2;
    }

    if (isSingleElimination) {
      winners.final().connectorCb(function() {
        return null;
      });

      if (teams.length > 1 && !skipConsolationRound) {
        const prev = winners.final().round().prev();
        const third = prev.map(p => p.match(0).loser).toNull();
        const fourth = prev.map(p => p.match(1).loser).toNull();
        const consol = round.addMatch(function() {
            return [
              {source: third},
              {source: fourth}
            ];
          },
          consolationBubbles);

        consol.setAlignCb(function(tC: JQuery) {
          const height = (winners.el.height()) / 2;
          consol.el.css('height', (height) + 'px');

          const topShift = tC.height();

          tC.css('top', (topShift) + 'px');
        });

        consol.connectorCb(function() {
          return null;
        });
      }
    }
  }

  const loserMatchSources = (winners, losers, matchCount: number, m, n, r) => (): [MatchSource, MatchSource] => {
    /* first round comes from winner bracket */
    if (n % 2 === 0 && r === 0) {
      return [
        {source: winners.round(0).match(m * 2).loser},
        {source: winners.round(0).match(m * 2 + 1).loser}
      ];
    }
    else { /* match with dropped */
      /* To maximize the time it takes for two teams to play against
       * eachother twice, WB losers are assigned in reverse order
       * every second round of LB */
      const winnerMatch = (r % 2 === 0) ? (matchCount - m - 1) : m;
      return [
        {source: losers.round(r * 2).match(m).winner},
        {source: winners.round(r + 1).match(winnerMatch).loser}
      ];
    }
  };

  const loserAlignment = (teamCon: JQuery, match: Match) => () => teamCon.css('top', (match.el.height() / 2 - teamCon.height() / 2) + 'px');

  function prepareLosers(winners: Bracket, losers: Bracket, teamCount: number, skipGrandFinalComeback: boolean) {
    const roundCount = Math.log(teamCount * 2) / Math.log(2) - 1;
    var matchCount = teamCount / 2;

    for (var r = 0; r < roundCount; r += 1) {
      /* if player cannot rise back to grand final, last round of loser
       * bracket will be player between two LB players, eliminating match
       * between last WB loser and current LB winner */
      const subRounds = (skipGrandFinalComeback && r === (roundCount - 1) ? 1 : 2);
      for (var n = 0; n < subRounds; n += 1) {
        const round = losers.addRound();

        for (var m = 0; m < matchCount; m += 1) {
          const teamCb = (!(n % 2 === 0 && r !== 0)) ? loserMatchSources(winners, losers, matchCount, m, n, r) : null;
          const isLastMatch = r === roundCount - 1 && skipGrandFinalComeback;
          const match = round.addMatch(teamCb, isLastMatch ? consolationBubbles : null);
          match.setAlignCb(loserAlignment(match.el.find('.teamContainer'), match));

          if (isLastMatch) {
            // Override default connector
            match.connectorCb(function() {
              return null;
            });
          }
          else if (r < roundCount - 1 || n < 1) {
            const cb = (n % 2 === 0) ? (tC, match): Connector => {
              // inside lower bracket
              const connectorOffset = tC.height() / 4;
              var height = 0;
              var shift = 0;

              if (match.winner().id === 0) {
                shift = connectorOffset;
              }
              else if (match.winner().id === 1) {
                height = -connectorOffset * 2;
                shift = connectorOffset;
              }
              else {
                shift = connectorOffset * 2;
              }
              return {height: height, shift: shift};
            } : null;
            match.connectorCb(cb);
          }
        }
      }
      matchCount /= 2;
    }
  }

  function prepareFinals(finals: Bracket, winners: Bracket, losers: Bracket,
                         skipSecondaryFinal: boolean, skipConsolationRound: boolean, topCon: JQuery) {
    const round = finals.addRound();
    const match = round.addMatch(function() {
        return [
          {source: winners.winner},
          {source: losers.winner}
        ];
      },
      function(match) {
        /* Track if container has been resized for final rematch */
        var _isResized = false;
        /* LB winner won first final match, need a new one */
        if (!skipSecondaryFinal && (!match.winner().name.isEmpty() && match.winner().name === losers.winner().name)) {
          if (finals.size() === 2) {
            return false;
          }
          /* This callback is ugly, would be nice to make more sensible solution */
          const round = finals.addRound(function() {
            const rematch = ((!match.winner().name.isEmpty() && match.winner().name === losers.winner().name));
            if (_isResized === false) {
              if (rematch) {
                _isResized = true;
                topCon.css('width', (parseInt(topCon.css('width'), 10) + 140) + 'px');
              }
            }
            if (!rematch && _isResized) {
              _isResized = false;
              finals.dropRound();
              topCon.css('width', (parseInt(topCon.css('width'), 10) - 140) + 'px');
            }
            return rematch;
          });
          /* keep order the same, WB winner top, LB winner below */
          const match2 = round.addMatch(function() {
              return [
                {source: match.first},
                {source: match.second}
              ];
            },
            winnerBubbles);

          match.connectorCb(function(tC): Connector {
            return {height: 0, shift: tC.height() / 2};
          });

          match2.connectorCb(function() {
            return null;
          });
          match2.setAlignCb(function(tC) {
            const height = (winners.el.height() + losers.el.height());
            match2.el.css('height', (height) + 'px');

            const topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height();

            tC.css('top', (topShift) + 'px');
          });
          return false;
        }
        else {
          return winnerBubbles(match);
        }
      });

    match.setAlignCb(function(tC) {
      var height = (winners.el.height() + losers.el.height());
      if (!skipConsolationRound) {
        height /= 2;
      }
      match.el.css('height', (height) + 'px');

      const topShift: number = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height();

      tC.css('top', (topShift) + 'px');
    });

    if (!skipConsolationRound) {
      const prev = losers.final().round().prev();
      const consol = round.addMatch(function() {
          return [
            {source: prev.get().match(0).loser},
            {source: losers.loser}
          ];
        },
        consolationBubbles);
      consol.setAlignCb(function(tC) {
        const height = (winners.el.height() + losers.el.height()) / 2;
        consol.el.css('height', (height) + 'px');

        const topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 + tC.height() / 2 - height;

        tC.css('top', (topShift) + 'px');
      });

      match.connectorCb(function(): Connector | null {
        return null;
      });
      consol.connectorCb(function(): Connector | null {
        return null;
      });
    }

    winners.final().connectorCb(function(tC): Connector | null {
      var shift;
      var height;

      const connectorOffset = tC.height() / 4;
      const topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height() / 2;
      const matchupOffset = topShift - winners.el.height() / 2;
      if (winners.winner().id === 0) {
        height = matchupOffset + connectorOffset * 2;
        shift = connectorOffset;
      }
      else if (winners.winner().id === 1) {
        height = matchupOffset;
        shift = connectorOffset * 3;
      }
      else {
        height = matchupOffset + connectorOffset;
        shift = connectorOffset * 2;
      }
      height -= tC.height() / 2;
      return {height: height, shift: shift};
    });

    losers.final().connectorCb(function(tC): Connector {
      var shift;
      var height;

      const connectorOffset = tC.height() / 4;
      const topShift = (winners.el.height() / 2 + winners.el.height() + losers.el.height() / 2) / 2 - tC.height() / 2;
      const matchupOffset = topShift - winners.el.height() / 2;
      if (losers.winner().id === 0) {
        height = matchupOffset;
        shift = connectorOffset * 3;
      }
      else if (losers.winner().id === 1) {
        height = matchupOffset + connectorOffset * 2;
        shift = connectorOffset;
      }
      else {
        height = matchupOffset + connectorOffset;
        shift = connectorOffset * 2;
      }
      height += tC.height() / 2;
      return {height: -height, shift: -shift};
    });
  }

  class Round {
    private roundCon: JQuery = $('<div class="round"></div>');
    private matches: Array<Match> = [];

    constructor(readonly bracket: Bracket,
                private previousRound: Option<Round>,
                private roundIdx: number,
                // TODO: results should be enforced to be correct by now
                private _results: Option<Array<[number | null, number | null, any]>>,
                private doRenderCb: BoolCallback,
                private mkMatch,
                private isFirstBracket: boolean) {}

    get el(){
      return this.roundCon;
    }
    get id() {
      return this.roundIdx;
    }
    addMatch(teamCb: (() => [MatchSource, MatchSource]) | null, renderCb: ((match: Match) => boolean) | null): Match {
      const matchIdx = this.matches.length;
      const teams = (teamCb !== null) ? teamCb() : [
        {source: this.bracket.round(this.roundIdx - 1).match(matchIdx * 2).winner},
        {source: this.bracket.round(this.roundIdx - 1).match(matchIdx * 2 + 1).winner}
      ];
      const teamA = teams[0].source;
      const teamB = teams[1].source;
      const matchResult: MatchResult = new MatchResult(
          new TeamBlock(teamA, teamA().name, 0, teamA().idx, null),
          new TeamBlock(teamB, teamB().name, 1, teamB().idx, null));
      const match = this.mkMatch(this, matchResult, matchIdx,
          this._results.map(r => r[matchIdx] === undefined
              ? null
              : (r[matchIdx].length >= 2 /*may be empty array, e.g. initialized with 'results: []'*/
                  ? r[matchIdx]
                  : [null, null])), renderCb,
          this.isFirstBracket);
      this.matches.push(match);
      return match;
    }
    match(id: number): Match {
      return this.matches[id];
    }
    prev(): Option<Round> {
      return this.previousRound;
    }
    size(): number {
      return this.matches.length;
    }
    render() {
      this.roundCon.empty();
      if (typeof(this.doRenderCb) === 'function' && !this.doRenderCb()) {
        return;
      }
      this.roundCon.appendTo(this.bracket.el);
      this.matches.forEach(m => m.render());
    }
    results(): Array<[number | null, number | null]> {
      return this.matches.reduce((agg: Array<[number | null, number | null]>, m) => agg.concat([m.results()]), []);
    }
  }

  function mkBracket(bracketCon: JQuery,
                     results: Option<Array<Array<[number | null, number | null, any]>>>,
                     mkMatch, isFirstBracket: boolean): Bracket {
    const rounds: Array<Round> = [];

    return {
      el: bracketCon,
      addRound(doRenderCb: BoolCallback): Round {
        const id = rounds.length;
        const previous = (id > 0) ? rounds[id - 1] : null;

        // Rounds may be undefined if init score array does not match number of teams
        const roundResults = results.map(r => (r[id] === undefined) ? null : r[id]);

        const round = new Round(this, Option.of(previous), id, roundResults, doRenderCb, mkMatch, isFirstBracket);
        rounds.push(round);
        return round;
      },
      dropRound() {
        rounds.pop();
      },
      round(id: number): Round {
        return rounds[id];
      },
      size(): number {
        return rounds.length;
      },
      final(): Match {
        return rounds[rounds.length - 1].match(0);
      },
      winner(): TeamBlock {
        return rounds[rounds.length - 1].match(0).winner();
      },
      loser(): TeamBlock {
        return rounds[rounds.length - 1].match(0).loser();
      },
      render() {
        bracketCon.empty();
        /* Length of 'rounds' can increase during render in special case when
         LB win in finals adds new final round in match render callback.
         Therefore length must be read on each iteration. */
        for (var i = 0; i < rounds.length; i += 1) {
          rounds[i].render();
        }
      },
      results(): Array<Array<[number | null, number | null]>> {
        return rounds.reduce((agg: Array<Array<[number | null, number | null]>>, r) => agg.concat([r.results()]), []);
      }
    };
  }

  function connector(height: number, shift: number, teamCon: JQuery, align: string) {
    const width = parseInt($('.round:first').css('margin-right'), 10) / 2;
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
    if (height < 2) {
      height = 0;
    }

    const src = $('<div class="connector"></div>').appendTo(teamCon);
    src.css('height', height);
    src.css('width', width + 'px');
    src.css(align, (-width - 2) + 'px');

    if (shift >= 0) {
      src.css('top', shift + 'px');
    }
    else {
      src.css('bottom', (-shift) + 'px');
    }

    if (drop) {
      src.css('border-bottom', 'none');
    }
    else {
      src.css('border-top', 'none');
    }

    const dst = $('<div class="connector"></div>').appendTo(src);
    dst.css('width', width + 'px');
    dst.css(align, -width + 'px');
    if (drop) {
      dst.css('bottom', '0px');
    }
    else {
      dst.css('top', '0px');
    }

    return src;
  }

  function countRounds(teamCount, isSingleElimination, skipGrandFinalComeback) {
    if (isSingleElimination) {
      return Math.log(teamCount * 2) / Math.log(2);
    }
    else if (skipGrandFinalComeback) {
      return Math.max(2, (Math.log(teamCount * 2) / Math.log(2) - 1) * 2 - 1); // DE - grand finals
    }
    else {
      return (Math.log(teamCount * 2) / Math.log(2) - 1) * 2 + 1; // DE + grand finals
    }
  }

  function exportData(data) {
    const output = $.extend(true, {}, data);
    output.teams = output.teams.map(ts => ts.map(t => t.toNull()));
    return output;
  }

  const JqueryBracket = function(opts: Options) {
    const align = opts.dir === 'lr' ? 'right' : 'left';
    var resultIdentifier;

    if (!opts) {
      throw Error('Options not set');
    }
    if (!opts.el) {
      throw Error('Invalid jQuery object as container');
    }
    if (!opts.init && !opts.save) {
      throw Error('No bracket data or save callback given');
    }
    if (opts.userData === undefined) {
      opts.userData = null;
    }

    if (opts.decorator && (!opts.decorator.edit || !opts.decorator.render)) {
      throw Error('Invalid decorator input');
    }
    else if (!opts.decorator) {
      opts.decorator = {edit: defaultEdit, render: defaultRender};
    }

    var data;
    if (!opts.init) {
      opts.init = {
        teams: [
          [Option.of(null), Option.of(null)]
        ],
        results: []
      };
    }

    data = opts.init;

    const topCon = $('<div class="jQBracket ' + opts.dir + '"></div>').appendTo(opts.el.empty());

    var w, l, f;

    function renderAll(save: boolean): void {
      resultIdentifier = 0;
      w.render();
      if (l) {
        l.render();
      }
      if (f && !opts.skipGrandFinalComeback) {
        f.render();
      }
      postProcess(topCon, w, f);

      if (save) {
        data.results[0] = w.results();
        if (l) {
          data.results[1] = l.results();
        }
        if (f && !opts.skipGrandFinalComeback) {
          data.results[2] = f.results();
        }
        if (opts.save) {
          opts.save(exportData(data), opts.userData);
        }
      }
    }

    function teamElement(round: number, match: MatchResult, team: TeamBlock,
                         opponent: TeamBlock, isReady: boolean,
                         isFirstBracket: boolean) {
      const rId = resultIdentifier;
      const sEl = $('<div class="score" data-resultid="result-' + rId + '"></div>');
      const score = (team.name.isEmpty() || opponent.name.isEmpty() || !isReady)
          ? '--'
          : (team.score === null || !isNumber(team.score) ? '--' : team.score);
      sEl.text(score);

      resultIdentifier += 1;

      const name = team.name.orElseGet(() => {
        const type = team.emptyBranch();
        if (type === BranchType.BYE) {
          return 'BYE';
        } else if (type === BranchType.TBD) {
          return 'TBD';
        } else {
          throw new Error(`Unexpected branch type ${type}`);
        }
      });
      const tEl = $('<div class="team"></div>');
      const nEl = $('<div class="label"></div>').appendTo(tEl);

      if (round === 0) {
        tEl.attr('data-resultid', 'team-' + rId);
      }

      opts.decorator.render(nEl, name, score);

      if (isNumber(team.idx)) {
        tEl.attr('data-teamid', team.idx);
      }

      if (team.name.isEmpty()) {
        tEl.addClass('na');
      }
      else if (match.winner().name === team.name) {
        tEl.addClass('win');
      }
      else if (match.loser().name === team.name) {
        tEl.addClass('lose');
      }

      tEl.append(sEl);

      // Only first round of BYEs can be edited
      if ((!team.name.isEmpty() || (team.name.isEmpty() && round === 0 && isFirstBracket)) && typeof(opts.save) === 'function') {
        nEl.addClass('editable');
        nEl.click(function() {
          const span = $(this);

          function editor() {
            function done_fn(val, next: boolean) {
              opts.init.teams[~~(team.idx / 2)][team.idx % 2] = Option.of(val || null);

              renderAll(true);
              span.click(editor);
              const labels = opts.el.find('.team[data-teamid=' + (team.idx + 1) + '] div.label:first');
              if (labels.length && next === true && round === 0) {
                $(labels).click();
              }
            }

            span.unbind();
            opts.decorator.edit(span, team.name.toNull(), done_fn);
          }

          editor();
        });
        if (!team.name.isEmpty() && !opponent.name.isEmpty() && isReady) {
          sEl.addClass('editable');
          sEl.click(function() {
            const span = $(this);

            function editor() {
              span.unbind();

              const score = !isNumber(team.score) ? '0' : span.text();
              const input = $('<input type="text">');

              input.val(score);
              span.empty().append(input);

              input.focus().select();
              input.keydown(function(e) {
                if (!isNumber($(this).val())) {
                  $(this).addClass('error');
                }
                else {
                  $(this).removeClass('error');
                }

                const key = (e.keyCode || e.which);
                if (key === 9 || key === 13 || key === 27) {
                  e.preventDefault();
                  $(this).blur();
                  if (key === 27) {
                    return;
                  }

                  const next = topCon.find('div.score[data-resultid=result-' + (rId + 1) + ']');
                  if (next) {
                    next.click();
                  }
                }
              });
              input.blur(function() {
                var val = input.val();
                if ((!val || !isNumber(val)) && !isNumber(team.score)) {
                  val = '0';
                }
                else if ((!val || !isNumber(val)) && isNumber(team.score)) {
                  val = team.score;
                }

                span.html(val);
                if (isNumber(val)) {
                  team.score = parseInt(val, 10);
                  renderAll(true);
                }
                span.click(editor);
              });
            }

            editor();
          });
        }
      }
      return tEl;
    }

    function mkMatch(round: Round, match: MatchResult, idx: number,
                     results: Option<[number, number, any]>, renderCb: Function,
                     isFirstBracket: boolean): Match {
      const matchCon = $('<div class="match"></div>');
      const teamCon: JQuery = $('<div class="teamContainer"></div>');

      var connectorCb: ConnectorProvider | null = null;
      var alignCb: ((JQuery) => void) | null = null;

      if (!opts.save) {
        const matchUserData = results.map(r => r.length < 3 ? null : r[2]).toNull();

        if (opts.onMatchHover) {
          teamCon.hover(function () {
            opts.onMatchHover(matchUserData, true);
          }, function () {
            opts.onMatchHover(matchUserData, false);
          });
        }

        if (opts.onMatchClick) {
          teamCon.click(function () { opts.onMatchClick(matchUserData); });
        }
      }

      match.a.name = match.a.source().name;
      match.b.name = match.b.source().name;

      match.a.score = results.map(r => r[0]).toNull();
      match.b.score = results.map(r => r[1]).toNull();

      /* match has score even though teams haven't yet been decided */
      /* todo: would be nice to have in preload check, maybe too much work */
      if ((!match.a.name || !match.b.name) && (isNumber(match.a.score) || isNumber(match.b.score))) {
        console.log('ERROR IN SCORE DATA: ' + match.a.source().name + ': ' +
          match.a.score + ', ' + match.b.source().name + ': ' + match.b.score);
        match.a.score = match.b.score = null;
      }

      return {
        el: matchCon,
        id: idx,
        round(): Round {
          return round;
        },
        connectorCb(cb: ConnectorProvider) {
          connectorCb = cb;
        },
        connect(cb: ConnectorProvider) {
          const connectorOffset = teamCon.height() / 4;
          const matchupOffset = matchCon.height() / 2;
          var shift;
          var height;

          if (!cb || cb === null) {
            if (idx % 2 === 0) { // dir == down
              if (this.winner().id === 0) {
                shift = connectorOffset;
                height = matchupOffset;
              }
              else if (this.winner().id === 1) {
                shift = connectorOffset * 3;
                height = matchupOffset - connectorOffset * 2;
              }
              else {
                shift = connectorOffset * 2;
                height = matchupOffset - connectorOffset;
              }
            }
            else { // dir == up
              if (this.winner().id === 0) {
                shift = -connectorOffset * 3;
                height = -matchupOffset + connectorOffset * 2;
              }
              else if (this.winner().id === 1) {
                shift = -connectorOffset;
                height = -matchupOffset;
              }
              else {
                shift = -connectorOffset * 2;
                height = -matchupOffset + connectorOffset;
              }
            }
          }
          else {
            const info = cb(teamCon, this);
            if (info === null) { /* no connector */
              return;
            }
            shift = info.shift;
            height = info.height;
          }
          teamCon.append(connector(height, shift, teamCon, align));
        },
        winner() { return match.winner(); },
        loser() { return match.loser(); },
        first(): TeamBlock {
          return match.a;
        },
        second(): TeamBlock {
          return match.b;
        },
        setAlignCb(cb: (JQuery) => void) {
          alignCb = cb;
        },
        render() {
          matchCon.empty();
          teamCon.empty();

          // This shouldn't be done at render-time
          match.a.name = match.a.source().name;
          match.b.name = match.b.source().name;
          match.a.idx = match.a.source().idx;
          match.b.idx = match.b.source().idx;

          const isDoubleBye = match.a.name.isEmpty() && match.b.name.isEmpty();
          if (isDoubleBye) {
            teamCon.addClass('np');
          }
          else if (!match.winner().name) {
            teamCon.addClass('np');
          }
          else {
            teamCon.removeClass('np');
          }

          // Coerce truthy/falsy "isset()" for Typescript
          const isReady = !match.a.name.isEmpty() && !match.b.name.isEmpty();

          teamCon.append(teamElement(round.id, match, match.a, match.b, isReady, isFirstBracket));
          teamCon.append(teamElement(round.id, match, match.b, match.a, isReady, isFirstBracket));

          matchCon.appendTo(round.el);
          matchCon.append(teamCon);

          this.el.css('height', (round.bracket.el.height() / round.size()) + 'px');
          teamCon.css('top', (this.el.height() / 2 - teamCon.height() / 2) + 'px');

          /* todo: move to class */
          if (alignCb !== null) {
            alignCb(teamCon);
          }

          const isLast = (typeof(renderCb) === 'function') ? renderCb(this) : false;
          if (!isLast) {
            this.connect(connectorCb);
          }
        },
        results(): [number | null, number | null] {
          // Either team is bye -> reset (mutate) scores from that match
          const hasBye = match.a.name.isEmpty() || match.b.name.isEmpty();
          if (hasBye) {
            match.a.score = match.b.score = null;
          }
          return [match.a.score, match.b.score];
        }
      };
    }

    /* wrap data to into necessary arrays */
    const r = wrap(data.results, 4 - depth(data.results));
    data.results = r;

    const isSingleElimination = (r.length <= 1);

    if (opts.skipSecondaryFinal && isSingleElimination) {
      $.error('skipSecondaryFinal setting is viable only in double elimination mode');
    }

    if (opts.save) {
      embedEditButtons(topCon, data, opts);
    }

    var fEl, wEl, lEl;

    if (isSingleElimination) {
      wEl = $('<div class="bracket"></div>').appendTo(topCon);
    }
    else {
      if (!opts.skipGrandFinalComeback) {
        fEl = $('<div class="finals"></div>').appendTo(topCon);
      }
      wEl = $('<div class="bracket"></div>').appendTo(topCon);
      lEl = $('<div class="loserBracket"></div>').appendTo(topCon);
    }

    const height = data.teams.length * 64;

    wEl.css('height', height);

    // reserve space for consolation round
    if (isSingleElimination && data.teams.length <= 2 && !opts.skipConsolationRound) {
      topCon.css('height', height + 40);
    }

    if (lEl) {
      lEl.css('height', wEl.height() / 2);
    }

    const roundCount = countRounds(data.teams.length, isSingleElimination, opts.skipGrandFinalComeback);

    if (opts.save) {
      topCon.css('width', roundCount * 140 + 40);
    }
    else {
      topCon.css('width', roundCount * 140 + 10);
    }

    w = mkBracket(wEl, Option.of(r[0] || null), mkMatch, true);

    if (!isSingleElimination) {
      l = mkBracket(lEl, Option.of(r[1] || null), mkMatch, false);
      if (!opts.skipGrandFinalComeback) {
        f = mkBracket(fEl, Option.of(r[2] || null), mkMatch, false);
      }
    }

    prepareWinners(w, data.teams, isSingleElimination, opts.skipConsolationRound, opts.skipGrandFinalComeback && !isSingleElimination);

    if (!isSingleElimination) {
      prepareLosers(w, l, data.teams.length, opts.skipGrandFinalComeback);
      if (!opts.skipGrandFinalComeback) {
        prepareFinals(f, w, l, opts.skipSecondaryFinal, opts.skipConsolationRound, topCon);
      }
    }

    renderAll(false);

    return {
      data() {
        return exportData(opts.init);
      }
    };
  };

  function embedEditButtons(topCon: JQuery, data: any, opts: Options) {
    const tools = $('<div class="tools"></div>').appendTo(topCon);
    const inc = $('<span class="increment">+</span>').appendTo(tools);
    inc.click(function () {
      const len = data.teams.length;
      for (var i = 0; i < len; i += 1) {
        data.teams.push([Option.of(null), Option.of(null)]);
      }
      return JqueryBracket(opts);
    });

    if (data.teams.length > 1 && data.results.length === 1 ||
        data.teams.length > 2 && data.results.length === 3) {
      const dec = $('<span class="decrement">-</span>').appendTo(tools);
      dec.click(function () {
        if (data.teams.length > 1) {
          data.teams = data.teams.slice(0, data.teams.length / 2);
          return JqueryBracket(opts);
        }
      });
    }

    if (data.results.length === 1 && data.teams.length > 1) {
      const type = $('<span class="doubleElimination">de</span>').appendTo(tools);
      type.click(function () {
        if (data.teams.length > 1 && data.results.length < 3) {
          data.results.push([], []);
          return JqueryBracket(opts);
        }
      });
    }
    else if (data.results.length === 3 && data.teams.length > 1) {
      const type = $('<span class="singleElimination">se</span>').appendTo(tools);
      type.click(function () {
        if (data.results.length === 3) {
          data.results = data.results.slice(0, 1);
          return JqueryBracket(opts);
        }
      });
    }
  }


  const methods = {
    init(originalOpts: Options) {
      const opts = $.extend(true, {}, originalOpts); // Do not mutate inputs
      const that = this;
      opts.el = this;
      if (opts.save && (opts.onMatchClick || opts.onMatchHover)) {
        $.error('Match callbacks may not be passed in edit mode (in conjunction with save callback)');
      }
      const log2 = Math.log2(opts.init.teams.length);
      if (log2 !== Math.floor(log2)) {
        $.error(`"teams" property must have 2^n number of team pairs, i.e. 1, 2, 4, etc. Got ${opts.init.teams.length} team pairs.`);
      }
      opts.dir = opts.dir || 'lr';
      opts.init.teams = !opts.init.teams || opts.init.teams.length === 0 ? [[null, null]] : opts.init.teams;
      opts.init.teams = opts.init.teams.map(ts => ts.map(t => Option.of(t)));
      opts.skipConsolationRound = opts.skipConsolationRound || false;
      opts.skipSecondaryFinal = opts.skipSecondaryFinal || false;
      if (opts.dir !== 'lr' && opts.dir !== 'rl') {
        $.error('Direction must be either: "lr" or "rl"');
      }
      const bracket = JqueryBracket(opts);
      $(this).data('bracket', {target: that, obj: bracket});
      return bracket;
    },
    data() {
      const bracket = $(this).data('bracket');
      return bracket.obj.data();
    }
  };

  $.fn.bracket = function(method) {
    if (methods[method]) {
      return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
    } else if (typeof method === 'object' || !method) {
      return methods.init.apply(this, arguments);
    } else {
      $.error('Method ' + method + ' does not exist on jQuery.bracket');
    }
  };
})(jQuery);
