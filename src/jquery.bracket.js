/**
 * jQuery Bracket
 *
 * Copyright (c) 2011-2018, Teijo Laine,
 * http://aropupu.fi/bracket/
 *
 * Licenced under the MIT licence
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
// tslint:disable-next-line: no-reference
/// <reference path="../lib/jquery.d.ts" />
(function ($) {
    var Option = /** @class */ (function () {
        function Option(val) {
            this.val = val;
            if (val instanceof Option) {
                throw new Error("Trying to wrap Option into an Option");
            }
            if (this.val === undefined) {
                throw new Error("Option cannot contain undefined");
            }
        }
        Option.of = function (value) {
            return new Option(value);
        };
        Option.empty = function () {
            return new Option(null);
        };
        Option.prototype.get = function () {
            if (this.val === null) {
                throw new Error("Trying to get() empty Option");
            }
            return this.val;
        };
        Option.prototype.orElse = function (defaultValue) {
            return this.val === null ? defaultValue : this.val;
        };
        Option.prototype.orElseGet = function (defaultProvider) {
            return this.val === null ? defaultProvider() : this.val;
        };
        Option.prototype.map = function (f) {
            return this.val === null ? Option.empty() : new Option(f(this.val));
        };
        Option.prototype.forEach = function (f) {
            if (this.val !== null) {
                f(this.val);
            }
            return this;
        };
        Option.prototype.toNull = function () {
            return this.val === null ? null : this.val;
        };
        Option.prototype.isEmpty = function () {
            return this.val === null;
        };
        return Option;
    }());
    var Score = /** @class */ (function (_super) {
        __extends(Score, _super);
        function Score() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Score.of = function (val) {
            var type = typeof val;
            var expected = "number";
            if (val !== null && type !== expected) {
                throw new Error("Invalid score format, expected " + expected + ", got " + type);
            }
            return _super.of.call(this, val);
        };
        Score.empty = function () {
            return Option.empty();
        };
        return Score;
    }(Option));
    var WinOrLose = /** @class */ (function (_super) {
        __extends(WinOrLose, _super);
        function WinOrLose() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        WinOrLose.of = function (val) {
            var type = typeof val;
            var expected = "number";
            if (val !== null && type !== expected) {
                throw new Error("Invalid score format, expected " + expected + ", got " + type);
            }
            return _super.of.call(this, val);
        };
        WinOrLose.empty = function () {
            return Option.empty();
        };
        return WinOrLose;
    }(Option));
    var ResultObject = /** @class */ (function () {
        function ResultObject(first, second, winOrLose, userData) {
            this.first = first;
            this.second = second;
            this.winOrLose = winOrLose;
            this.userData = userData;
            if (!first || !second) {
                throw new Error("Cannot create ResultObject with undefined scores");
            }
            return;
        }
        return ResultObject;
    }());
    var BranchType;
    (function (BranchType) {
        BranchType[BranchType["TBD"] = 0] = "TBD";
        BranchType[BranchType["BYE"] = 1] = "BYE";
        BranchType[BranchType["END"] = 2] = "END";
    })(BranchType || (BranchType = {}));
    var Order = /** @class */ (function () {
        function Order(isFirst) {
            this.isFirst = isFirst;
        }
        Order.first = function () {
            return new Order(true);
        };
        Order.second = function () {
            return new Order(false);
        };
        Order.prototype.map = function (first, second) {
            return this.isFirst ? first : second;
        };
        return Order;
    }());
    var TeamBlock = /** @class */ (function () {
        function TeamBlock(source, // Where base of the information propagated from
        nameOrGetter, order, seed, score) {
            this.source = source;
            this.nameOrGetter = nameOrGetter;
            this.order = order;
            this.seed = seed;
            this.score = score;
            // A pair of teams is created simultaneously for a match so the sibling
            // cannot be passed in constructor
            this.sibling = function () {
                throw new Error("No sibling asigned");
            };
        }
        Object.defineProperty(TeamBlock.prototype, "name", {
            get: function () {
                return typeof this.nameOrGetter === "function"
                    ? this.nameOrGetter()
                    : this.nameOrGetter;
            },
            set: function (value) {
                this.nameOrGetter = value;
            },
            enumerable: true,
            configurable: true
        });
        // Recursively check if branch ends into a BYE
        TeamBlock.prototype.emptyBranch = function () {
            if (!this.name.isEmpty()) {
                if (this.sibling().name.isEmpty()) {
                    // If there is only one team assigned to a match, it cannot
                    // yield TBD as the sole team automatically propagates to next
                    // match. The issue arises with double elimination when winner
                    // bracket team propagates and the defaulted match is referenced
                    // from loser bracket -> there won't be a team dropping to loser
                    // bracket, so we need to resolve that branch as handled with BYE.
                    return BranchType.BYE;
                }
                else {
                    // Two teams so branch will yield a result later
                    return BranchType.TBD;
                }
            }
            else {
                try {
                    var sourceType = this.source().emptyBranch();
                    if (sourceType === BranchType.TBD) {
                        return BranchType.TBD;
                    }
                    else if (sourceType === BranchType.END) {
                        return BranchType.BYE;
                    }
                    var sourceSiblingType = this.source()
                        .sibling()
                        .emptyBranch();
                    if (sourceSiblingType === BranchType.TBD) {
                        return BranchType.TBD;
                    }
                    return BranchType.BYE;
                }
                catch (e) {
                    if (e instanceof EndOfBranchException) {
                        return BranchType.END;
                    }
                    else {
                        throw new Error("Unexpected exception type (message: \"" + e.message + "\")");
                    }
                }
            }
        };
        return TeamBlock;
    }());
    // http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
    function isNumber(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }
    function EndOfBranchException() {
        this.message = "Root of information for this team";
        this.name = "EndOfBranchException";
    }
    var MatchResult = /** @class */ (function () {
        //constructor(readonly a: TeamBlock, readonly b: TeamBlock) {
        //   return;
        // }
        function MatchResult(a, b, winOrLose) {
            this.a = a;
            this.b = b;
            this.winOrLose = winOrLose;
            return;
        }
        MatchResult.teamsInResultOrder = function (match) {
            var aBye = match.a.name.isEmpty();
            var bBye = match.b.name.isEmpty();
            var winOrLose = match.winOrLose;
            if (!winOrLose.isEmpty()) {
                //debugger;
                var num = winOrLose.get();
                if (num == 1) {
                    return [match.a, match.b];
                }
                else {
                    return [match.b, match.a];
                }
            }
            if (bBye && !aBye) {
                if (match.b.emptyBranch() === BranchType.BYE) {
                    return [match.a, match.b];
                }
                else {
                    return [];
                }
            }
            else if (aBye && !bBye) {
                if (match.a.emptyBranch() === BranchType.BYE) {
                    return [match.b, match.a];
                }
                else {
                    return [];
                }
            }
            else if (!match.a.score.isEmpty() && !match.b.score.isEmpty()) {
                if (match.a.score.get() > match.b.score.get()) {
                    return [match.a, match.b];
                }
                else if (match.a.score.get() < match.b.score.get()) {
                    return [match.b, match.a];
                }
            }
            return [];
        };
        // Arbitrary (either parent) source is required so that branch emptiness
        // can be determined by traversing to the beginning.
        MatchResult.emptyTeam = function (source, sibling) {
            var teamBlock = new TeamBlock(source, Option.empty(), Option.empty(), Option.empty(), Score.empty());
            teamBlock.sibling = function () { return sibling; };
            return teamBlock;
        };
        MatchResult.prototype.winner = function () {
            return (MatchResult.teamsInResultOrder(this)[0] ||
                MatchResult.emptyTeam(this.a.source, this.b));
        };
        MatchResult.prototype.loser = function () {
            return (MatchResult.teamsInResultOrder(this)[1] ||
                MatchResult.emptyTeam(this.b.source, this.a));
        };
        return MatchResult;
    }());
    var EntryState;
    (function (EntryState) {
        EntryState["EMPTY_BYE"] = "empty-bye";
        EntryState["EMPTY_TBD"] = "empty-tbd";
        EntryState["ENTRY_NO_SCORE"] = "entry-no-score";
        EntryState["ENTRY_DEFAULT_WIN"] = "entry-default-win";
        EntryState["ENTRY_COMPLETE"] = "entry-complete";
    })(EntryState || (EntryState = {}));
    function depth(a) {
        function df(arrayOrValue, d) {
            if (arrayOrValue instanceof Array) {
                return df(arrayOrValue[0], d + 1);
            }
            return d;
        }
        return df(a, 0);
    }
    function wrap(a, d) {
        if (d > 0) {
            a = wrap([a], d - 1);
        }
        return a;
    }
    function trackHighlighter(teamIndex, cssClass, container) {
        var elements = container.find(".team[data-teamid=" + teamIndex + "]");
        var addedClass = !cssClass ? "highlight" : cssClass;
        return {
            highlight: function () {
                elements.each(function () {
                    $(this).addClass(addedClass);
                    if ($(this).hasClass("win")) {
                        $(this)
                            .parent()
                            .find(".connector")
                            .addClass(addedClass);
                    }
                });
            },
            deHighlight: function () {
                elements.each(function () {
                    $(this).removeClass(addedClass);
                    $(this)
                        .parent()
                        .find(".connector")
                        .removeClass(addedClass);
                });
            }
        };
    }
    function postProcess(container, w, f) {
        var source = f || w;
        var winner = source.winner();
        var loser = source.loser();
        if (winner && loser) {
            if (!winner.name.isEmpty()) {
                trackHighlighter(winner.seed.get(), "highlightWinner", container).highlight();
            }
            if (!loser.name.isEmpty()) {
                trackHighlighter(loser.seed.get(), "highlightLoser", container).highlight();
            }
        }
        container.find(".team").mouseover(function () {
            var teamId = $(this).attr("data-teamid");
            // Don't highlight BYEs
            if (teamId === undefined) {
                return;
            }
            var track = trackHighlighter(parseInt(teamId, 10), null, container);
            track.highlight();
            $(this).mouseout(function () {
                track.deHighlight();
                $(this).unbind("mouseout");
            });
        });
    }
    function defaultEdit(span, data, done) {
        var input = $('<input type="text">');
        input.val(data);
        span.empty().append(input);
        input.focus();
        input.blur(function () {
            done(input.val());
        });
        input.keydown(function (e) {
            var key = e.keyCode || e.which;
            if (key === 9 /*tab*/ || key === 13 /*return*/ || key === 27 /*esc*/) {
                e.preventDefault();
                done(input.val(), key !== 27);
            }
        });
    }
    function defaultRender(container, team, score, state) {
        switch (state) {
            case EntryState.EMPTY_BYE:
                container.append("BYE");
                return;
            case EntryState.EMPTY_TBD:
                container.append("TBD");
                return;
            case EntryState.ENTRY_NO_SCORE:
            case EntryState.ENTRY_DEFAULT_WIN:
            case EntryState.ENTRY_COMPLETE:
                container.append(team);
                return;
        }
    }
    function winnerBubbles(match) {
        var el = match.el;
        var winner = el.find(".team.win");
        winner.append('<div class="bubble">1st</div>');
        var loser = el.find(".team.lose");
        loser.append('<div class="bubble">2nd</div>');
        return true;
    }
    function consolationBubbles(match) {
        var el = match.el;
        var winner = el.find(".team.win");
        winner.append('<div class="bubble third">3rd</div>');
        var loser = el.find(".team.lose");
        loser.append('<div class="bubble fourth">4th</div>');
        return true;
    }
    var endOfBranch = function () {
        throw new EndOfBranchException();
    };
    var winnerMatchSources = function (teams, m) { return function () {
        var teamA = new TeamBlock(endOfBranch, function () { return teams[m][0]; }, Option.of(Order.first()), Option.of(m * 2), Score.empty());
        var teamB = new TeamBlock(endOfBranch, function () { return teams[m][1]; }, Option.of(Order.second()), Option.of(m * 2 + 1), Score.empty());
        teamA.sibling = function () { return teamB; };
        teamB.sibling = function () { return teamA; };
        return [
            {
                source: function () { return teamA; }
            },
            {
                source: function () { return teamB; }
            }
        ];
    }; };
    var winnerAlignment = function (match, skipConsolationRound) { return function (tC) {
        tC.css("top", "");
        tC.css("position", "absolute");
        if (skipConsolationRound) {
            tC.css("top", match.el.height() / 2 - tC.height() / 2 + "px");
        }
        else {
            tC.css("bottom", -tC.height() / 2 + "px");
        }
    }; };
    function prepareWinners(winners, teams, isSingleElimination, opts, skipGrandFinalComeback) {
        var roundCount = Math.log(teams.length * 2) / Math.log(2);
        var matchCount = teams.length;
        var round;
        for (var r = 0; r < roundCount; r += 1) {
            round = winners.addRound(Option.empty());
            for (var m = 0; m < matchCount; m += 1) {
                var teamCb = r === 0 ? winnerMatchSources(teams, m) : null;
                if (!(r === roundCount - 1 && isSingleElimination) &&
                    !(r === roundCount - 1 && skipGrandFinalComeback)) {
                    round.addMatch(teamCb, Option.empty());
                }
                else {
                    var match = round.addMatch(teamCb, Option.of(winnerBubbles));
                    if (!skipGrandFinalComeback) {
                        match.setAlignCb(winnerAlignment(match, opts.skipConsolationRound));
                    }
                }
            }
            matchCount /= 2;
        }
        if (isSingleElimination) {
            winners.final().setConnectorCb(Option.empty());
            if (teams.length > 1 && !opts.skipConsolationRound) {
                var prev = winners
                    .final()
                    .getRound()
                    .prev();
                var third_1 = prev.map(function (p) { return function () { return p.match(0).loser(); }; }).toNull();
                var fourth_1 = prev.map(function (p) { return function () { return p.match(1).loser(); }; }).toNull();
                var consol_1 = round.addMatch(function () { return [{ source: third_1 }, { source: fourth_1 }]; }, Option.of(consolationBubbles));
                consol_1.setAlignCb(function (tC) {
                    var height = winners.el.height() / 2;
                    consol_1.el.css("height", height + "px");
                    var topShift = tC.height() / 2 + opts.matchMargin;
                    tC.css("top", topShift + "px");
                });
                consol_1.setConnectorCb(Option.empty());
            }
        }
    }
    var loserMatchSources = function (winners, losers, matchCount, m, n, r) { return function () {
        /* first round comes from winner bracket */
        if (n % 2 === 0 && r === 0) {
            return [
                {
                    source: function () {
                        return winners
                            .round(0)
                            .match(m * 2)
                            .loser();
                    }
                },
                {
                    source: function () {
                        return winners
                            .round(0)
                            .match(m * 2 + 1)
                            .loser();
                    }
                }
            ];
        }
        else {
            /* match with dropped */
            /* To maximize the time it takes for two teams to play against
             * eachother twice, WB losers are assigned in reverse order
             * every second round of LB */
            var winnerMatch_1 = r % 2 === 0 ? matchCount - m - 1 : m;
            return [
                {
                    source: function () {
                        return losers
                            .round(r * 2)
                            .match(m)
                            .winner();
                    }
                },
                {
                    source: function () {
                        return winners
                            .round(r + 1)
                            .match(winnerMatch_1)
                            .loser();
                    }
                }
            ];
        }
    }; };
    var loserAlignment = function (teamCon, match) { return function () {
        return teamCon.css("top", match.el.height() / 2 - teamCon.height() / 2 + "px");
    }; };
    var mkMatchConnector = function (centerConnectors) { return function (tC, match) {
        // inside lower bracket
        var connectorOffset = tC.height() / 4;
        var center = { height: 0, shift: connectorOffset * 2 };
        return match
            .winner()
            .order.map(function (order) {
            return order.map(centerConnectors ? center : { height: 0, shift: connectorOffset }, centerConnectors
                ? center
                : {
                    height: -connectorOffset * 2,
                    shift: connectorOffset
                });
        })
            .orElse(center);
    }; };
    function prepareLosers(winners, losers, teamCount, skipGrandFinalComeback, centerConnectors) {
        var roundCount = Math.log(teamCount * 2) / Math.log(2) - 1;
        var matchCount = teamCount / 2;
        for (var r = 0; r < roundCount; r += 1) {
            /* if player cannot rise back to grand final, last round of loser
             * bracket will be player between two LB players, eliminating match
             * between last WB loser and current LB winner */
            var subRounds = skipGrandFinalComeback && r === roundCount - 1 ? 1 : 2;
            for (var n = 0; n < subRounds; n += 1) {
                var round = losers.addRound(Option.empty());
                for (var m = 0; m < matchCount; m += 1) {
                    var teamCb = !(n % 2 === 0 && r !== 0)
                        ? loserMatchSources(winners, losers, matchCount, m, n, r)
                        : null;
                    var isLastMatch = r === roundCount - 1 && skipGrandFinalComeback;
                    var match = round.addMatch(teamCb, Option.of(isLastMatch ? consolationBubbles : null));
                    match.setAlignCb(loserAlignment(match.el.find(".teamContainer"), match));
                    if (isLastMatch) {
                        // Override default connector
                        match.setConnectorCb(Option.empty());
                    }
                    else if (r < roundCount - 1 || n < 1) {
                        var cb = n % 2 === 0 ? mkMatchConnector(centerConnectors) : null;
                        match.setConnectorCb(Option.of(cb));
                    }
                }
            }
            matchCount /= 2;
        }
    }
    function prepareFinals(finals, winners, losers, opts, topCon, resizeContainer) {
        var round = finals.addRound(Option.empty());
        var finalMatch = round.addMatch(function () { return [
            { source: function () { return winners.winner(); } },
            { source: function () { return losers.winner(); } }
        ]; }, Option.of(function (match) {
            /* Track if container has been resized for final rematch */
            var isResized = false;
            /* LB winner won first final match, need a new one */
            if (!opts.skipSecondaryFinal &&
                (!match.winner().name.isEmpty() &&
                    match.winner().name === losers.winner().name)) {
                if (finals.size() === 2) {
                    return false;
                }
                /* This callback is ugly, would be nice to make more sensible solution */
                var doRenderCb = function () {
                    var rematch = !match.winner().name.isEmpty() &&
                        match.winner().name === losers.winner().name;
                    if (isResized === false) {
                        if (rematch) {
                            isResized = true;
                            resizeContainer();
                        }
                    }
                    if (!rematch && isResized) {
                        isResized = false;
                        finals.dropRound();
                        resizeContainer();
                    }
                    return rematch;
                };
                var finalRound = finals.addRound(Option.of(doRenderCb));
                /* keep order the same, WB winner top, LB winner below */
                var match2_1 = finalRound.addMatch(function () { return [
                    { source: function () { return match.first(); } },
                    { source: function () { return match.second(); } }
                ]; }, Option.of(winnerBubbles));
                match.setConnectorCb(Option.of(function (tC) { return ({ height: 0, shift: tC.height() / 2 }); }));
                match2_1.setConnectorCb(Option.empty());
                match2_1.setAlignCb(function (tC) {
                    var height = winners.el.height() + losers.el.height();
                    match2_1.el.css("height", height + "px");
                    var topShift = (winners.el.height() / 2 +
                        winners.el.height() +
                        losers.el.height() / 2) /
                        2 -
                        tC.height();
                    tC.css("top", topShift + "px");
                });
                return false;
            }
            else {
                if (finals.size() === 2) {
                    finals.dropRound();
                }
                else if (finals.size() > 2) {
                    throw new Error("Unexpected number of final rounds");
                }
                return winnerBubbles(match);
            }
        }));
        finalMatch.setAlignCb(function (tC) {
            var height = winners.el.height() + losers.el.height();
            if (!opts.skipConsolationRound) {
                height /= 2;
            }
            finalMatch.el.css("height", height + "px");
            var topShift = (winners.el.height() / 2 +
                winners.el.height() +
                losers.el.height() / 2) /
                2 -
                tC.height();
            tC.css("top", topShift + "px");
        });
        if (!opts.skipConsolationRound) {
            var prev_1 = losers
                .final()
                .getRound()
                .prev();
            var consol_2 = round.addMatch(function () { return [
                {
                    source: function () {
                        return prev_1
                            .get()
                            .match(0)
                            .loser();
                    }
                },
                { source: function () { return losers.loser(); } }
            ]; }, Option.of(consolationBubbles));
            consol_2.setAlignCb(function (tC) {
                var height = (winners.el.height() + losers.el.height()) / 2;
                consol_2.el.css("height", height + "px");
                var topShift = (winners.el.height() / 2 +
                    winners.el.height() +
                    losers.el.height() / 2) /
                    2 +
                    tC.height() / 2 -
                    height;
                tC.css("top", topShift + "px");
            });
            finalMatch.setConnectorCb(Option.empty());
            consol_2.setConnectorCb(Option.empty());
        }
        winners.final().setConnectorCb(Option.of(function (tC) {
            var connectorOffset = tC.height() / 4;
            var topShift = (winners.el.height() / 2 +
                winners.el.height() +
                losers.el.height() / 2) /
                2 -
                tC.height() / 2;
            var matchupOffset = topShift - winners.el.height() / 2;
            var _a = winners
                .winner()
                .order.map(function (order) {
                return order.map({
                    height: matchupOffset + connectorOffset * 2,
                    shift: connectorOffset * (opts.centerConnectors ? 2 : 1)
                }, {
                    height: matchupOffset +
                        connectorOffset * (opts.centerConnectors ? 2 : 0),
                    shift: connectorOffset * (opts.centerConnectors ? 2 : 3)
                });
            })
                .orElse({
                height: matchupOffset + connectorOffset * (opts.centerConnectors ? 2 : 1),
                shift: connectorOffset * 2
            }), height = _a.height, shift = _a.shift;
            return { height: height - tC.height() / 2, shift: shift };
        }));
        losers.final().setConnectorCb(Option.of(function (tC) {
            var connectorOffset = tC.height() / 4;
            var topShift = (winners.el.height() / 2 +
                winners.el.height() +
                losers.el.height() / 2) /
                2 -
                tC.height() / 2;
            var matchupOffset = topShift - winners.el.height() / 2;
            var _a = losers
                .winner()
                .order.map(function (order) {
                return order.map({
                    height: matchupOffset +
                        connectorOffset * (opts.centerConnectors ? 2 : 0),
                    shift: connectorOffset * (opts.centerConnectors ? 2 : 3)
                }, {
                    height: matchupOffset + connectorOffset * 2,
                    shift: connectorOffset * (opts.centerConnectors ? 2 : 1)
                });
            })
                .orElse({
                height: matchupOffset + connectorOffset * (opts.centerConnectors ? 2 : 1),
                shift: connectorOffset * 2
            }), height = _a.height, shift = _a.shift;
            return { height: -(height + tC.height() / 2), shift: -shift };
        }));
    }
    function teamState(team, opponent, score) {
        return team.name
            .map(function () {
            return score
                .map(function () { return EntryState.ENTRY_COMPLETE; })
                .orElseGet(function () {
                return opponent.emptyBranch() === BranchType.BYE
                    ? EntryState.ENTRY_DEFAULT_WIN
                    : EntryState.ENTRY_NO_SCORE;
            });
        })
            .orElseGet(function () {
            var type = team.emptyBranch();
            switch (type) {
                case BranchType.BYE:
                    return EntryState.EMPTY_BYE;
                case BranchType.TBD:
                    return EntryState.EMPTY_TBD;
                default:
                    throw new Error("Unexpected branch type " + type);
            }
        });
    }
    var Round = /** @class */ (function () {
        function Round(bracket, previousRound, roundNumber, 
        // TODO: results should be enforced to be correct by now
        roundResults, doRenderCb, mkMatch, isFirstBracket, opts) {
            this.bracket = bracket;
            this.previousRound = previousRound;
            this.roundNumber = roundNumber;
            this.roundResults = roundResults;
            this.doRenderCb = doRenderCb;
            this.mkMatch = mkMatch;
            this.isFirstBracket = isFirstBracket;
            this.opts = opts;
            this.containerWidth = this.opts.teamWidth + this.opts.scoreWidth;
            this.roundCon = $("<div class=\"round\" style=\"width: " + this.containerWidth + "px; margin-right: " + this.opts.roundMargin + "px\"/>");
            this.matches = [];
        }
        Object.defineProperty(Round.prototype, "el", {
            get: function () {
                return this.roundCon;
            },
            enumerable: true,
            configurable: true
        });
        Round.prototype.addMatch = function (teamCb, renderCb) {
            var _this = this;
            var matchIdx = this.matches.length;
            var teams = teamCb !== null
                ? teamCb()
                : [
                    {
                        source: function () {
                            return _this.bracket
                                .round(_this.roundNumber - 1)
                                .match(matchIdx * 2)
                                .winner();
                        }
                    },
                    {
                        source: function () {
                            return _this.bracket
                                .round(_this.roundNumber - 1)
                                .match(matchIdx * 2 + 1)
                                .winner();
                        }
                    }
                ];
            var teamA = function () { return teams[0].source(); };
            var teamB = function () { return teams[1].source(); };
            var teamABlock = new TeamBlock(teamA, teamA().name, Option.of(Order.first()), teamA().seed, Score.empty());
            var teamBBlock = new TeamBlock(teamB, teamB().name, Option.of(Order.second()), teamB().seed, Score.empty());
            teamABlock.sibling = function () { return teamBBlock; };
            teamBBlock.sibling = function () { return teamABlock; };
            var matchResult = new MatchResult(teamABlock, teamBBlock, WinOrLose.empty());
            var match = this.mkMatch(this, matchResult, matchIdx, this.roundResults.map(function (r) {
                return r[matchIdx] === undefined ? null : r[matchIdx];
            }), renderCb, this.isFirstBracket, this.opts);
            this.matches.push(match);
            return match;
        };
        Round.prototype.match = function (id) {
            return this.matches[id];
        };
        Round.prototype.prev = function () {
            return this.previousRound;
        };
        Round.prototype.size = function () {
            return this.matches.length;
        };
        Round.prototype.render = function () {
            this.roundCon.empty();
            if (!this.doRenderCb.isEmpty() && !this.doRenderCb.get()()) {
                return;
            }
            // debugger
            this.roundCon.appendTo(this.bracket.el);
            // 添加round标题
            if (this.opts.init.roundTitles) {
                this.roundCon.append('<div class="round-title" >' + this.opts.init.roundTitles[this.roundNumber] + '</div>');
            }
            this.matches.forEach(function (m) { return m.render(); });
        };
        Round.prototype.results = function () {
            return this.matches.reduce(function (agg, m) { return agg.concat([m.results()]); }, []);
        };
        return Round;
    }());
    var Bracket = /** @class */ (function () {
        function Bracket(bracketCon, initResults, mkMatch, isFirstBracket, opts) {
            this.bracketCon = bracketCon;
            this.initResults = initResults;
            this.mkMatch = mkMatch;
            this.isFirstBracket = isFirstBracket;
            this.opts = opts;
            this.rounds = [];
        }
        Object.defineProperty(Bracket.prototype, "el", {
            get: function () {
                return this.bracketCon;
            },
            enumerable: true,
            configurable: true
        });
        Bracket.prototype.addRound = function (doRenderCb) {
            var id = this.rounds.length;
            var previous = id > 0 ? Option.of(this.rounds[id - 1]) : Option.empty();
            // Rounds may be undefined if init score array does not match number of teams
            var roundResults = this.initResults.map(function (r) {
                return r[id] === undefined
                    ? new ResultObject(Score.empty(), Score.empty(), undefined, undefined)
                    : r[id];
            });
            var round = new Round(this, previous, id, roundResults, doRenderCb, this.mkMatch, this.isFirstBracket, this.opts);
            this.rounds.push(round);
            return round;
        };
        Bracket.prototype.dropRound = function () {
            this.rounds.pop();
        };
        Bracket.prototype.round = function (id) {
            return this.rounds[id];
        };
        Bracket.prototype.size = function () {
            return this.rounds.length;
        };
        Bracket.prototype.final = function () {
            return this.rounds[this.rounds.length - 1].match(0);
        };
        Bracket.prototype.winner = function () {
            return this.rounds[this.rounds.length - 1].match(0).winner();
        };
        Bracket.prototype.loser = function () {
            return this.rounds[this.rounds.length - 1].match(0).loser();
        };
        Bracket.prototype.render = function () {
            this.bracketCon.empty();
            /* Length of 'rounds' can increase during render in special case when
             LB win in finals adds new final round in match render callback.
             Therefore length must be read on each iteration. */
            for (var _i = 0, _a = this.rounds; _i < _a.length; _i++) {
                var round = _a[_i];
                round.render();
            }
        };
        Bracket.prototype.results = function () {
            return this.rounds.reduce(function (agg, r) { return agg.concat([r.results()]); }, []);
        };
        return Bracket;
    }());
    var calculateHeight = function (height) {
        // drop:
        // [team]'\
        //         \_[team]
        // !drop:
        //         /'[team]
        // [team]_/
        if (height < 0) {
            return { height: -height, drop: false };
        }
        /* straight lines are prettier */
        if (height < 2) {
            return { height: 0, drop: true };
        }
        return { height: height, drop: true };
    };
    function mkConnector(roundMargin, connector, teamCon, align) {
        var shift = connector.shift;
        var _a = calculateHeight(connector.height), height = _a.height, drop = _a.drop;
        var width = roundMargin / 2;
        var src = $('<div class="connector"></div>').appendTo(teamCon);
        src.css("height", height);
        src.css("width", width + "px");
        src.css(align, -width - 2 + "px");
        // Subtract 1 due to line thickness and alignment mismatch caused by
        // combining top and bottom alignment
        if (shift >= 0) {
            src.css("top", shift - 1 + "px");
        }
        else {
            src.css("bottom", -shift - 1 + "px");
        }
        if (drop) {
            src.css("border-bottom", "none");
        }
        else {
            src.css("border-top", "none");
        }
        var dst = $('<div class="connector"></div>').appendTo(src);
        dst.css("width", width + "px");
        dst.css(align, -width + "px");
        if (drop) {
            dst.css("bottom", "0px");
        }
        else {
            dst.css("top", "0px");
        }
        return src;
    }
    function countRounds(teamCount, isSingleElimination, skipGrandFinalComeback, skipSecondaryFinal, results) {
        if (isSingleElimination) {
            return Math.log(teamCount * 2) / Math.log(2);
        }
        else if (skipGrandFinalComeback) {
            return Math.max(2, (Math.log(teamCount * 2) / Math.log(2) - 1) * 2 - 1); // DE - grand finals
        }
        else {
            // Loser bracket winner has won first match in grand finals,
            // this requires a new match unless explicitely skipped
            var hasGrandFinalRematch = !skipSecondaryFinal &&
                (results.length === 3 && results[2].length === 2);
            return ((Math.log(teamCount * 2) / Math.log(2) - 1) * 2 +
                1 +
                (hasGrandFinalRematch ? 1 : 0)); // DE + grand finals
        }
    }
    function exportData(data) {
        var output = $.extend(true, {}, data);
        output.teams = output.teams.map(function (ts) { return ts.map(function (t) { return t.toNull(); }); });
        output.results = output.results.map(function (brackets) {
            return brackets.map(function (rounds) {
                return rounds.map(function (matches) {
                    var matchData = [matches.first.toNull(), matches.second.toNull()];
                    if (matches.userData !== undefined) {
                        matchData.push(matches.userData);
                    }
                    return matchData;
                });
            });
        });
        return output;
    }
    var ResultId = /** @class */ (function () {
        function ResultId() {
            this.counter = 0;
        }
        ResultId.prototype.get = function () {
            return this.counter;
        };
        ResultId.prototype.getNext = function () {
            return ++this.counter;
        };
        ResultId.prototype.reset = function () {
            this.counter = 0;
        };
        return ResultId;
    }());
    function teamElement(roundNumber, match, team, opponent, isReady, isFirstBracket, opts, resultId, topCon, renderAll) {
        var resultIdAttribute = team.name.isEmpty() || opponent.name.isEmpty()
            ? ""
            : "data-resultid=\"result-" + resultId.getNext() + "\"";
        var sEl = $("<div class=\"score\" style=\"width: " + opts.scoreWidth + "px;\" " + resultIdAttribute + "></div>");
        var score = team.name.isEmpty() || opponent.name.isEmpty() || !isReady
            ? Option.empty()
            : team.score.map(function (s) { return "" + s; });
        var scoreString = score.orElse("--");
        sEl.text(scoreString);
        var tEl = $("<div class=\"team\" style=\"width: " + (opts.teamWidth +
            opts.scoreWidth) + "px;\"></div>");
        var nEl = $("<div class=\"label\" style=\"width: " + opts.teamWidth + "px;\"></div>").appendTo(tEl);
        opts.decorator.render(nEl, team.name.toNull(), scoreString, teamState(team, opponent, score));
        team.seed.forEach(function (seed) {
            tEl.attr("data-teamid", seed);
        });
        if (team.name.isEmpty()) {
            tEl.addClass("na");
        }
        else if (match.winner().name === team.name) {
            tEl.addClass("win");
        }
        else if (match.loser().name === team.name) {
            tEl.addClass("lose");
        }
        tEl.append(sEl);
        // Only first round of BYEs can be edited
        if ((!team.name.isEmpty() ||
            (team.name.isEmpty() && roundNumber === 0 && isFirstBracket)) &&
            typeof opts.save === "function") {
            if (!opts.disableTeamEdit) {
                nEl.addClass("editable");
                nEl.click(function () {
                    var span = $(this);
                    function editor() {
                        function done_fn(val, next) {
                            // Needs to be taken before possible null is assigned below
                            var teamId = team.seed.get();
                            opts.init.teams[~~(teamId / 2)][teamId % 2] = Option.of(val || null);
                            renderAll(true);
                            span.click(editor);
                            var labels = opts.el.find(".team[data-teamid=" + (teamId + 1) + "] div.label:first");
                            if (labels.length && next === true && roundNumber === 0) {
                                $(labels).click();
                            }
                        }
                        span.unbind();
                        opts.decorator.edit(span, team.name.toNull(), done_fn);
                    }
                    editor();
                });
            }
            if (!team.name.isEmpty() && !opponent.name.isEmpty() && isReady) {
                var rId_1 = resultId.get();
                sEl.addClass("editable");
                sEl.click(function () {
                    var span = $(this);
                    function editor() {
                        span.unbind();
                        var initialScore = !isNumber(team.score) ? "0" : span.text();
                        var input = $('<input type="text">');
                        input.val(initialScore);
                        span.empty().append(input);
                        input.focus().select();
                        input.keydown(function (e) {
                            if (!isNumber($(this).val())) {
                                $(this).addClass("error");
                            }
                            else {
                                $(this).removeClass("error");
                            }
                            var key = e.keyCode || e.which;
                            if (key === 9 || key === 13 || key === 27) {
                                e.preventDefault();
                                $(this).blur();
                                if (key === 27) {
                                    return;
                                }
                                var next = topCon.find("div.score[data-resultid=result-" + (rId_1 + 1) + "]");
                                if (next) {
                                    next.click();
                                }
                            }
                        });
                        input.blur(function () {
                            var val = input.val();
                            if ((!val || !isNumber(val)) && !isNumber(team.score)) {
                                val = "0";
                            }
                            else if ((!val || !isNumber(val)) && isNumber(team.score)) {
                                val = team.score;
                            }
                            span.html(val);
                            if (isNumber(val)) {
                                team.score = Score.of(parseInt(val, 10));
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
    var Match = /** @class */ (function () {
        function Match(round, match, seed, results, renderCb, isFirstBracket, opts, resultId, topCon, renderAll) {
            this.round = round;
            this.match = match;
            this.seed = seed;
            this.renderCb = renderCb;
            this.isFirstBracket = isFirstBracket;
            this.opts = opts;
            this.resultId = resultId;
            this.topCon = topCon;
            this.renderAll = renderAll;
            this.connectorCb = Option.empty();
            this.matchCon = $('<div class="match"></div>');
            this.teamCon = $('<div class="teamContainer"></div>');
            this.alignCb = null;
            this.matchUserData = !results.isEmpty()
                ? results.get().userData
                : undefined;
            //debugger;
            this.winOrLose = !results.isEmpty()
                ? results.get().winOrLose
                : undefined;
            if (!opts.save) {
                // The hover and click callbacks are bound by jQuery to the element
                var userData_1 = this.matchUserData;
                if (opts.onMatchHover) {
                    this.teamCon.hover(function () {
                        opts.onMatchHover(userData_1, true);
                    }, function () {
                        opts.onMatchHover(userData_1, false);
                    });
                }
                if (opts.onMatchClick) {
                    this.teamCon.click(function () {
                        opts.onMatchClick(userData_1);
                    });
                }
            }
            match.a.name = match.a.source().name;
            match.b.name = match.b.source().name;
            match.a.score = results.map(function (r) { return r.first.toNull(); });
            match.b.score = results.map(function (r) { return r.second.toNull(); });
            match.winOrLose = results.map(function (r) { return r.winOrLose.toNull(); });
            /* match has score even though teams haven't yet been decided */
            /* todo: would be nice to have in preload check, maybe too much work */
            if ((!match.a.name || !match.b.name) &&
                (isNumber(match.a.score) || isNumber(match.b.score))) {
                console.warn("ERROR IN SCORE DATA: " + match.a.source().name + ": " + match.a.score + ", " + match.b.source().name + ": " + match.b.score);
                match.a.score = match.b.score = Score.empty();
            }
        }
        Object.defineProperty(Match.prototype, "el", {
            get: function () {
                return this.matchCon;
            },
            enumerable: true,
            configurable: true
        });
        Match.prototype.getRound = function () {
            return this.round;
        };
        Match.prototype.setConnectorCb = function (cb) {
            this.connectorCb = cb;
        };
        Match.prototype.connect = function (cb) {
            var _this = this;
            var align = this.opts.dir === "lr" ? "right" : "left";
            var connectorOffset = this.teamCon.height() / 4;
            var matchupOffset = this.matchCon.height() / 2;
            var result = cb
                .map(function (connectorCb) { return connectorCb(_this.teamCon, _this); })
                .orElseGet(function () {
                if (_this.seed % 2 === 0) {
                    // dir == down
                    return _this.winner()
                        .order.map(function (order) {
                        return order.map({
                            height: matchupOffset,
                            shift: connectorOffset * (_this.opts.centerConnectors ? 2 : 1)
                        }, {
                            height: matchupOffset -
                                connectorOffset * (_this.opts.centerConnectors ? 0 : 2),
                            shift: connectorOffset * (_this.opts.centerConnectors ? 2 : 3)
                        });
                    })
                        .orElse({
                        height: matchupOffset -
                            connectorOffset * (_this.opts.centerConnectors ? 0 : 1),
                        shift: connectorOffset * 2
                    });
                }
                else {
                    // dir == up
                    return _this.winner()
                        .order.map(function (order) {
                        return order.map({
                            height: -matchupOffset +
                                connectorOffset * (_this.opts.centerConnectors ? 0 : 2),
                            shift: -connectorOffset * (_this.opts.centerConnectors ? 2 : 3)
                        }, {
                            height: -matchupOffset,
                            shift: -connectorOffset * (_this.opts.centerConnectors ? 2 : 1)
                        });
                    })
                        .orElse({
                        height: -matchupOffset +
                            connectorOffset * (_this.opts.centerConnectors ? 0 : 1),
                        shift: -connectorOffset * 2
                    });
                }
            });
            this.teamCon.append(mkConnector(this.opts.roundMargin, result, this.teamCon, align));
        };
        Match.prototype.winner = function () {
            return this.match.winner();
        };
        Match.prototype.loser = function () {
            return this.match.loser();
        };
        Match.prototype.getWinOrLose = function () {
            return this.winOrLose;
        };
        Match.prototype.first = function () {
            return this.match.a;
        };
        Match.prototype.second = function () {
            return this.match.b;
        };
        Match.prototype.setAlignCb = function (cb) {
            this.alignCb = cb;
        };
        Match.prototype.render = function () {
            var _this = this;
            this.matchCon.empty();
            this.teamCon.empty();
            // This shouldn't be done at render-time
            this.match.a.name = this.match.a.source().name;
            this.match.b.name = this.match.b.source().name;
            this.match.a.seed = this.match.a.source().seed;
            this.match.b.seed = this.match.b.source().seed;
            var isDoubleBye = this.match.a.name.isEmpty() && this.match.b.name.isEmpty();
            if (isDoubleBye) {
                this.teamCon.addClass("np");
            }
            else if (!this.match.winner().name) {
                this.teamCon.addClass("np");
            }
            else {
                this.teamCon.removeClass("np");
            }
            // Coerce truthy/falsy "isset()" for Typescript
            var isReady = !this.match.a.name.isEmpty() && !this.match.b.name.isEmpty();
            this.teamCon.append(teamElement(this.round.roundNumber, this.match, this.match.a, this.match.b, isReady, this.isFirstBracket, this.opts, this.resultId, this.topCon, this.renderAll));
            this.teamCon.append(teamElement(this.round.roundNumber, this.match, this.match.b, this.match.a, isReady, this.isFirstBracket, this.opts, this.resultId, this.topCon, this.renderAll));
            this.matchCon.appendTo(this.round.el);
            this.matchCon.append(this.teamCon);
            this.el.css("height", this.round.bracket.el.height() / this.round.size() + "px");
            this.teamCon.css("top", this.el.height() / 2 - this.teamCon.height() / 2 + "px");
            /* todo: move to class */
            if (this.alignCb !== null) {
                this.alignCb(this.teamCon);
            }
            var isLast = this.renderCb.map(function (cb) { return cb(_this); }).orElse(false);
            if (!isLast) {
                this.connect(this.connectorCb);
            }
        };
        Match.prototype.results = function () {
            // Either team is bye -> reset (mutate) scores from that match
            var hasBye = this.match.a.name.isEmpty() || this.match.b.name.isEmpty();
            if (hasBye) {
                this.match.a.score = this.match.b.score = Score.empty();
            }
            return new ResultObject(this.match.a.score, this.match.b.score, this.winOrLose, this.matchUserData);
        };
        return Match;
    }());
    var undefinedToNull = function (value) { return (value === undefined ? null : value); };
    var wrapResults = function (initResults) {
        return initResults.map(function (brackets) {
            return brackets.map(function (rounds) {
                return rounds.map(function (matches) {
                    return new ResultObject(Score.of(undefinedToNull(matches[0])), Score.of(undefinedToNull(matches[1])), WinOrLose.of(undefinedToNull(matches[2])), matches[3]);
                });
            });
        });
    };
    var JqueryBracket = function (opts) {
        var resultId = new ResultId();
        var data = opts.init;
        var isSingleElimination = data.results.length <= 1;
        // 45 === team height x2 + 1px margin
        var height = data.teams.length * 45 + data.teams.length * opts.matchMargin;
        var topCon = $('<div class="jQBracket ' + opts.dir + '"></div>').appendTo(opts.el.empty());
        function resizeContainer() {
            var roundCount = countRounds(data.teams.length, isSingleElimination, opts.skipGrandFinalComeback, opts.skipSecondaryFinal, data.results);
            if (!opts.disableToolbar) {
                topCon.css("width", roundCount * (opts.teamWidth + opts.scoreWidth + opts.roundMargin) +
                    40);
            }
            else {
                topCon.css("width", roundCount * (opts.teamWidth + opts.scoreWidth + opts.roundMargin) +
                    10);
            }
            // reserve space for consolation round
            if (isSingleElimination &&
                data.teams.length <= 2 &&
                !opts.skipConsolationRound) {
                topCon.css("height", height + 40);
            }
        }
        var w;
        var l;
        var f;
        function renderAll(save) {
            resultId.reset();
            w.render();
            if (l) {
                l.render();
            }
            if (f && !opts.skipGrandFinalComeback) {
                f.render();
            }
            if (!opts.disableHighlight) {
                postProcess(topCon, w, f);
            }
            if (save) {
                data.results[0] = w.results();
                if (l) {
                    data.results[1] = l.results();
                }
                if (f && !opts.skipGrandFinalComeback) {
                    data.results[2] = f.results();
                }
                // Loser bracket comeback in finals might require a new round
                resizeContainer();
                if (opts.save) {
                    opts.save(exportData(data), opts.userData);
                }
            }
        }
        if (opts.skipSecondaryFinal && isSingleElimination) {
            $.error("skipSecondaryFinal setting is viable only in double elimination mode");
        }
        if (!opts.disableToolbar) {
            embedEditButtons(topCon, data, opts);
        }
        var fEl;
        var wEl;
        var lEl;
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
        wEl.css("height", height);
        if (lEl) {
            lEl.css("height", wEl.height() / 2);
        }
        resizeContainer();
        var mkMatch = function (round, match, seed, results, renderCb, isFirstBracket, options) {
            return new Match(round, match, seed, results, renderCb, isFirstBracket, options, resultId, topCon, renderAll);
        };
        w = new Bracket(wEl, Option.of(data.results[0] || null), mkMatch, true, opts);
        if (!isSingleElimination) {
            l = new Bracket(lEl, Option.of(data.results[1] || null), mkMatch, false, opts);
            if (!opts.skipGrandFinalComeback) {
                f = new Bracket(fEl, Option.of(data.results[2] || null), mkMatch, false, opts);
            }
        }
        prepareWinners(w, data.teams, isSingleElimination, opts, opts.skipGrandFinalComeback && !isSingleElimination);
        if (!isSingleElimination) {
            prepareLosers(w, l, data.teams.length, opts.skipGrandFinalComeback, opts.centerConnectors);
            if (!opts.skipGrandFinalComeback) {
                prepareFinals(f, w, l, opts, topCon, resizeContainer);
            }
        }
        renderAll(false);
        return {
            data: function () {
                return exportData(opts.init);
            }
        };
    };
    function embedEditButtons(topCon, data, opts) {
        var tools = $('<div class="tools"></div>').appendTo(topCon);
        var inc = $('<span class="increment">+</span>').appendTo(tools);
        inc.click(function () {
            var len = data.teams.length;
            for (var i = 0; i < len; i += 1) {
                data.teams.push([Option.empty(), Option.empty()]);
            }
            return JqueryBracket(opts);
        });
        if ((data.teams.length > 1 && data.results.length === 1) ||
            (data.teams.length > 2 && data.results.length === 3)) {
            var dec = $('<span class="decrement">-</span>').appendTo(tools);
            dec.click(function () {
                if (data.teams.length > 1) {
                    data.teams = data.teams.slice(0, data.teams.length / 2);
                    return JqueryBracket(opts);
                }
            });
        }
        if (data.results.length === 1 && data.teams.length > 1) {
            var type = $('<span class="doubleElimination">de</span>').appendTo(tools);
            type.click(function () {
                if (data.teams.length > 1 && data.results.length < 3) {
                    data.results.push([], []);
                    return JqueryBracket(opts);
                }
            });
        }
        else if (data.results.length === 3 && data.teams.length > 1) {
            var type = $('<span class="singleElimination">se</span>').appendTo(tools);
            type.click(function () {
                if (data.results.length === 3) {
                    data.results = data.results.slice(0, 1);
                    return JqueryBracket(opts);
                }
            });
        }
    }
    var assertNumber = function (opts, field) {
        if (opts.hasOwnProperty(field)) {
            var expectedType = "number";
            var type = typeof opts[field];
            if (type !== expectedType) {
                throw new Error("Option \"" + field + "\" is " + type + " instead of " + expectedType);
            }
        }
    };
    var assertBoolean = function (opts, field) {
        var value = opts[field];
        var expectedType = "boolean";
        var type = typeof value;
        if (type !== expectedType) {
            throw new Error("Value of " + field + " must be boolean, got " + expectedType + ", got " + type);
        }
    };
    var assertGt = function (expected, opts, field) {
        var value = opts[field];
        if (value < expected) {
            throw new Error("Value of " + field + " must be greater than " + expected + ", got " + value);
        }
    };
    var isPow2 = function (x) { return x & (x - 1); };
    var methods = {
        init: function (originalOpts) {
            var opts = $.extend(true, {}, originalOpts); // Do not mutate inputs
            if (!opts) {
                throw Error("Options not set");
            }
            if (!opts.init && !opts.save) {
                throw Error("No bracket data or save callback given");
            }
            if (opts.userData === undefined) {
                opts.userData = null;
            }
            if (opts.decorator && (!opts.decorator.edit || !opts.decorator.render)) {
                throw Error("Invalid decorator input");
            }
            else if (!opts.decorator) {
                opts.decorator = { edit: defaultEdit, render: defaultRender };
            }
            if (!opts.init) {
                opts.init = {
                    results: [],
                    teams: [[Option.empty(), Option.empty()]]
                };
            }
            opts.el = this;
            if (opts.save && (opts.onMatchClick || opts.onMatchHover)) {
                $.error("Match callbacks may not be passed in edit mode (in conjunction with save callback)");
            }
            var disableToolbarType = typeof opts.disableToolbar;
            var disableToolbarGiven = opts.hasOwnProperty("disableToolbar");
            if (disableToolbarGiven && disableToolbarType !== "boolean") {
                $.error("disableToolbar must be a boolean, got " + disableToolbarType);
            }
            if (!opts.save && disableToolbarGiven) {
                $.error('disableToolbar can be used only if the bracket is editable, i.e. "save" callback given');
            }
            if (!disableToolbarGiven) {
                opts.disableToolbar = opts.save === undefined;
            }
            var disableTeamEditType = typeof opts.disableTeamEdit;
            var disableTeamEditGiven = opts.hasOwnProperty("disableTeamEdit");
            if (disableTeamEditGiven && disableTeamEditType !== "boolean") {
                $.error("disableTeamEdit must be a boolean, got " + disableTeamEditType);
            }
            if (!opts.save && disableTeamEditGiven) {
                $.error('disableTeamEdit can be used only if the bracket is editable, i.e. "save" callback given');
            }
            if (!disableTeamEditGiven) {
                opts.disableTeamEdit = false;
            }
            if (!opts.disableToolbar && opts.disableTeamEdit) {
                $.error('disableTeamEdit requires also resizing to be disabled, initialize with "disableToolbar: true"');
            }
            /* wrap data to into necessary arrays */
            var r = wrap(opts.init.results, 4 - depth(opts.init.results));
            opts.init.results = wrapResults(r);
            assertNumber(opts, "teamWidth");
            assertNumber(opts, "scoreWidth");
            assertNumber(opts, "roundMargin");
            assertNumber(opts, "matchMargin");
            if (!opts.hasOwnProperty("teamWidth")) {
                opts.teamWidth = 70;
            }
            if (!opts.hasOwnProperty("scoreWidth")) {
                opts.scoreWidth = 30;
            }
            if (!opts.hasOwnProperty("roundMargin")) {
                opts.roundMargin = 40;
            }
            if (!opts.hasOwnProperty("matchMargin")) {
                opts.matchMargin = 20;
            }
            assertGt(0, opts, "teamWidth");
            assertGt(0, opts, "scoreWidth");
            assertGt(0, opts, "roundMargin");
            assertGt(0, opts, "matchMargin");
            if (!opts.hasOwnProperty("centerConnectors")) {
                opts.centerConnectors = false;
            }
            assertBoolean(opts, "centerConnectors");
            if (!opts.hasOwnProperty("disableHighlight")) {
                opts.disableHighlight = false;
            }
            assertBoolean(opts, "disableHighlight");
            var log2Result = isPow2(opts.init.teams.length);
            if (log2Result !== Math.floor(log2Result)) {
                $.error("\"teams\" property must have 2^n number of team pairs, i.e. 1, 2, 4, etc. Got " + opts.init.teams.length + " team pairs.");
            }
            opts.dir = opts.dir || "lr";
            opts.init.teams =
                !opts.init.teams || opts.init.teams.length === 0
                    ? [[null, null]]
                    : opts.init.teams;
            opts.init.teams = opts.init.teams.map(function (ts) {
                return ts.map(function (t) { return (t === null ? Option.empty() : Option.of(t)); });
            });
            //debugger;
            opts.skipConsolationRound = opts.skipConsolationRound || false;
            opts.skipSecondaryFinal = opts.skipSecondaryFinal || false;
            if (opts.dir !== "lr" && opts.dir !== "rl") {
                $.error('Direction must be either: "lr" or "rl"');
            }
            var bracket = JqueryBracket(opts);
            $(this).data("bracket", { target: this, obj: bracket });
            return bracket;
        },
        data: function () {
            var bracket = $(this).data("bracket");
            return bracket.obj.data();
        }
    };
    $.fn.bracket = function (method) {
        if (methods[method]) {
            return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
        }
        else if (typeof method === "object" || !method) {
            return methods.init.apply(this, arguments);
        }
        else {
            $.error("Method " + method + " does not exist on jQuery.bracket");
        }
    };
})(jQuery);
