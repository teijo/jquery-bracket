/**
 * jQuery Bracket
 *
 * Copyright (c) 2011-2018, Teijo Laine,
 * http://aropupu.fi/bracket/
 *
 * Licenced under the MIT licence
 */

// tslint:disable-next-line: no-reference
/// <reference path="../lib/jquery.d.ts" />

enum EntryState {
  EMPTY_BYE = "empty-bye",
  EMPTY_TBD = "empty-tbd",
  ENTRY_NO_SCORE = "entry-no-score",
  ENTRY_DEFAULT_WIN = "entry-default-win",
  ENTRY_COMPLETE = "entry-complete"
}

type BracketDoneCallback<TTeam> = (val: TTeam, next?: boolean) => void;

interface BracketDecorator<TTeam, TScore> {
  edit: (
    span: JQuery,
    name: TTeam | null,
    doneFn: BracketDoneCallback<TTeam>
  ) => void;
  render: (
    container: JQuery,
    team: TTeam | null,
    score: TScore | null,
    entryState: EntryState
  ) => void;
}

interface BracketInitData<TTeam, TScore, TMData> {
  teams?: Array<[TTeam | null, TTeam | null]>;
  results?: Array<Array<Array<[TScore, TScore] | [TScore, TScore, TMData]>>>;
}

interface BracketOptions<TTeam, TScore, TMData, TUData> {
  init?: BracketInitData<TTeam, TScore, TMData>;
  save?: (
    data: BracketInitData<TTeam, TScore, TMData>,
    userData: TUData
  ) => void;
  userData?: TUData;
  decorator: BracketDecorator<TTeam, TScore>;
  skipConsolationRound?: boolean;
  skipSecondaryFinal?: boolean;
  skipGrandFinalComeback?: boolean;
  dir?: string;
  onMatchClick?: (data: TMData) => void;
  onMatchHover?: (data: TMData, hover: boolean) => void;
  disableToolbar?: boolean;
  disableTeamEdit?: boolean;
  disableHighlight?: boolean;
  teamWidth?: number;
  scoreWidth?: number;
  roundMargin?: number;
  matchMargin?: number;
  centerConnectors?: boolean;
}

($ => {
  class Option<A> {
    public static of<A>(value: A | null): Option<A> {
      return new Option(value);
    }

    public static empty<A>(): Option<A> {
      return new Option<A>(null);
    }

    protected constructor(private val: A | null) {
      if (val instanceof Option) {
        throw new Error("Trying to wrap Option into an Option");
      }
      if (this.val === undefined) {
        throw new Error("Option cannot contain undefined");
      }
    }

    public get(): A {
      if (this.val === null) {
        throw new Error("Trying to get() empty Option");
      }
      return this.val;
    }

    public orElse(defaultValue: A): A {
      return this.val === null ? defaultValue : this.val;
    }

    public orElseGet(defaultProvider: () => A): A {
      return this.val === null ? defaultProvider() : this.val;
    }

    public map<B>(f: (A) => B): Option<B> {
      return this.val === null ? Option.empty() : new Option(f(this.val));
    }

    public forEach(f: (A) => void): Option<A> {
      if (this.val !== null) {
        f(this.val);
      }
      return this;
    }

    public toNull() {
      return this.val === null ? null : this.val;
    }

    public isEmpty(): boolean {
      return this.val === null;
    }
  }

  interface Connector {
    height: number;
    shift: number;
  }

  type ConnectorProvider<TTeam, TScore, TMData, TUData> = (
    tc: JQuery,
    match: Match<TTeam, TScore, TMData, TUData>
  ) => Connector;

  class ResultObject<TScore, TMData> {
    constructor(
      readonly first: Option<TScore>,
      readonly second: Option<TScore>,
      readonly matchData: TMData | undefined
    ) {
      if (!first || !second) {
        throw new Error("Cannot create ResultObject with undefined scores");
      }
      return;
    }
  }

  type MatchCallback<TTeam, TScore, TMData, TUData> = (
    round: Round<TTeam, TScore, TMData, TUData>,
    match: MatchResult<TTeam, TScore>,
    seed: number,
    results: Option<ResultObject<TScore, TMData>>,
    renderCb: Option<RenderCallback<TTeam, TScore, TMData, TUData>>,
    isFirstBracket: boolean,
    opts: Options<TTeam, TScore, TMData, TUData>
  ) => Match<TTeam, TScore, TMData, TUData>;

  type RenderCallback<TTeam, TScore, TMData, TUData> = (
    match: Match<TTeam, TScore, TMData, TUData>
  ) => boolean;

  enum BranchType {
    TBD,
    BYE,
    END
  }

  class Order {
    public static first(): Order {
      return new Order(true);
    }

    public static second(): Order {
      return new Order(false);
    }

    private constructor(private isFirst: boolean) {}

    public map<A>(first: A, second: A): A {
      return this.isFirst ? first : second;
    }
  }

  // Hack to get the branch leaf (round 0) "name" lazily if it's modified
  type NameGetter<TTeam> = () => Option<TTeam>;

  class TeamBlock<TTeam, TScore> {
    get name() {
      return typeof this.nameOrGetter === "function"
        ? this.nameOrGetter()
        : this.nameOrGetter;
    }

    set name(value: Option<TTeam>) {
      this.nameOrGetter = value;
    }

    constructor(
      readonly source: (() => TeamBlock<TTeam, TScore>), // Where base of the information propagated from
      private nameOrGetter: Option<TTeam> | NameGetter<TTeam>,
      readonly order: Option<Order>,
      public seed: Option<number>,
      public score: Option<TScore>
    ) {}

    // A pair of teams is created simultaneously for a match so the sibling
    // cannot be passed in constructor
    public sibling: () => TeamBlock<TTeam, TScore> = () => {
      throw new Error("No sibling asigned");
    };

    // Recursively check if branch ends into a BYE
    public emptyBranch(): BranchType {
      if (!this.name.isEmpty()) {
        if (this.sibling().name.isEmpty()) {
          // If there is only one team assigned to a match, it cannot
          // yield TBD as the sole team automatically propagates to next
          // match. The issue arises with double elimination when winner
          // bracket team propagates and the defaulted match is referenced
          // from loser bracket -> there won't be a team dropping to loser
          // bracket, so we need to resolve that branch as handled with BYE.
          return BranchType.BYE;
        } else {
          // Two teams so branch will yield a result later
          return BranchType.TBD;
        }
      } else {
        try {
          const sourceType = this.source().emptyBranch();
          if (sourceType === BranchType.TBD) {
            return BranchType.TBD;
          } else if (sourceType === BranchType.END) {
            return BranchType.BYE;
          }
          const sourceSiblingType = this.source()
            .sibling()
            .emptyBranch();
          if (sourceSiblingType === BranchType.TBD) {
            return BranchType.TBD;
          }
          return BranchType.BYE;
        } catch (e) {
          if (e instanceof EndOfBranchException) {
            return BranchType.END;
          } else {
            throw new Error(
              `Unexpected exception type (message: "${e.message}")`
            );
          }
        }
      }
    }
  }

  interface MatchSource<TTeam, TScore> {
    source: () => TeamBlock<TTeam, TScore>;
  }

  type BoolCallback = () => boolean;

  // http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
  function isNumber(n: any): boolean {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function EndOfBranchException() {
    this.message = "Root of information for this team";
    this.name = "EndOfBranchException";
  }

  class MatchResult<TTeam, TScore> {
    private static teamsInResultOrder<TTeam, TScore>(
      match: MatchResult<TTeam, TScore>
    ) {
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
      } else if (!match.a.score.isEmpty() && !match.b.score.isEmpty()) {
        if (match.a.score.get() > match.b.score.get()) {
          return [match.a, match.b];
        } else if (match.a.score.get() < match.b.score.get()) {
          return [match.b, match.a];
        }
      }
      return [];
    }

    // Arbitrary (either parent) source is required so that branch emptiness
    // can be determined by traversing to the beginning.
    private static emptyTeam<TTeam, TScore>(
      source: () => TeamBlock<TTeam, TScore>,
      sibling: TeamBlock<TTeam, TScore>
    ): TeamBlock<TTeam, TScore> {
      const teamBlock = new TeamBlock(
        source,
        Option.empty(),
        Option.empty(),
        Option.empty(),
        Option.empty<TScore>()
      );
      teamBlock.sibling = () => sibling;
      return teamBlock;
    }

    constructor(
      readonly a: TeamBlock<TTeam, TScore>,
      readonly b: TeamBlock<TTeam, TScore>
    ) {
      return;
    }

    public winner(): TeamBlock<TTeam, TScore> {
      return (
        MatchResult.teamsInResultOrder(this)[0] ||
        MatchResult.emptyTeam(this.a.source, this.b)
      );
    }

    public loser(): TeamBlock<TTeam, TScore> {
      return (
        MatchResult.teamsInResultOrder(this)[1] ||
        MatchResult.emptyTeam(this.b.source, this.a)
      );
    }
  }

  type BracketResult<TScore, TMData> = Array<
    Array<ResultObject<TScore, TMData>>
  >;

  interface InitData<TTeam, TScore, TMData> {
    teams: Array<[Option<TTeam>, Option<TTeam>]>;
    results: Array<BracketResult<TScore, TMData>>;
  }

  interface Extension<TScore> {
    evaluateScore(val: string, previousVal: TScore | null);
    scoreToString(score: TScore | null): string;
  }

  interface Options<TTeam, TScore, TMData, TUData> {
    // TODO: expose via public interface
    extension: Extension<TScore>;
    el: JQuery;
    init: InitData<TTeam, TScore, TMData>;
    save?: (
      data: BracketInitData<TTeam, TScore, TMData>,
      userData: TUData | undefined
    ) => void;
    userData: TUData | undefined;
    decorator: BracketDecorator<TTeam, TScore>;
    skipConsolationRound: boolean;
    skipSecondaryFinal: boolean;
    skipGrandFinalComeback: boolean;
    dir: "lr" | "rl";
    onMatchClick: (data: TMData | undefined) => void;
    onMatchHover: (data: TMData | undefined, hover: boolean) => void;
    disableToolbar?: boolean;
    disableTeamEdit: boolean;
    disableHighlight: boolean;
    teamWidth: number;
    scoreWidth: number;
    roundMargin: number;
    matchMargin: number;
    centerConnectors: boolean;
  }

  function depth(a): number {
    function df(arrayOrValue, d: number): number {
      if (arrayOrValue instanceof Array) {
        return df(arrayOrValue[0], d + 1);
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

  function trackHighlighter(
    teamIndex: number,
    cssClass: string | null,
    container: JQuery
  ) {
    const elements = container.find(".team[data-teamid=" + teamIndex + "]");
    const addedClass = !cssClass ? "highlight" : cssClass;

    return {
      highlight() {
        elements.each(function() {
          $(this).addClass(addedClass);

          if ($(this).hasClass("win")) {
            $(this)
              .parent()
              .find(".connector")
              .addClass(addedClass);
          }
        });
      },

      deHighlight() {
        elements.each(function() {
          $(this).removeClass(addedClass);
          $(this)
            .parent()
            .find(".connector")
            .removeClass(addedClass);
        });
      }
    };
  }

  function postProcess<TTeam, TScore, TMData, TUData>(
    container: JQuery,
    w: Bracket<TTeam, TScore, TMData, TUData>,
    f: Bracket<TTeam, TScore, TMData, TUData>
  ) {
    const source = f || w;
    const winner = source.winner();
    const loser = source.loser();

    if (winner && loser) {
      if (!winner.name.isEmpty()) {
        trackHighlighter(
          winner.seed.get(),
          "highlightWinner",
          container
        ).highlight();
      }
      if (!loser.name.isEmpty()) {
        trackHighlighter(
          loser.seed.get(),
          "highlightLoser",
          container
        ).highlight();
      }
    }

    container.find(".team").mouseover(function() {
      const teamId = $(this).attr("data-teamid");
      // Don't highlight BYEs
      if (teamId === undefined) {
        return;
      }
      const track = trackHighlighter(parseInt(teamId, 10), null, container);
      track.highlight();
      $(this).mouseout(function() {
        track.deHighlight();
        $(this).unbind("mouseout");
      });
    });
  }

  function defaultEdit(
    span: JQuery,
    data: string,
    done: BracketDoneCallback<string>
  ): void {
    const input = $('<input type="text">');
    input.val(data);
    span.empty().append(input);
    input.focus();
    input.blur(() => {
      done(input.val());
    });
    input.keydown(e => {
      const key = e.keyCode || e.which;
      if (key === 9 /*tab*/ || key === 13 /*return*/ || key === 27 /*esc*/) {
        e.preventDefault();
        done(input.val(), key !== 27);
      }
    });
  }

  function defaultRender(
    container: JQuery,
    team: string,
    score: number,
    state: EntryState
  ): void {
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

  function winnerBubbles<TTeam, TScore, TMData, TUData>(
    match: Match<TTeam, TScore, TMData, TUData>
  ): boolean {
    const el = match.el;
    const winner = el.find(".team.win");
    winner.append('<div class="bubble">1st</div>');
    const loser = el.find(".team.lose");
    loser.append('<div class="bubble">2nd</div>');
    return true;
  }

  function consolationBubbles<TTeam, TScore, TMData, TUData>(
    match: Match<TTeam, TScore, TMData, TUData>
  ): boolean {
    const el = match.el;
    const winner = el.find(".team.win");
    winner.append('<div class="bubble third">3rd</div>');
    const loser = el.find(".team.lose");
    loser.append('<div class="bubble fourth">4th</div>');
    return true;
  }

  const endOfBranch = () => {
    throw new EndOfBranchException();
  };
  const winnerMatchSources = <TTeam, TScore>(
    teams: Array<[Option<TTeam>, Option<TTeam>]>,
    m: number
  ) => (): [MatchSource<TTeam, TScore>, MatchSource<TTeam, TScore>] => {
    const teamA = new TeamBlock(
      endOfBranch,
      () => teams[m][0],
      Option.of(Order.first()),
      Option.of<number>(m * 2),
      Option.empty<TScore>()
    );
    const teamB = new TeamBlock(
      endOfBranch,
      () => teams[m][1],
      Option.of(Order.second()),
      Option.of<number>(m * 2 + 1),
      Option.empty<TScore>()
    );

    teamA.sibling = () => teamB;
    teamB.sibling = () => teamA;

    return [
      {
        source: () => teamA
      },
      {
        source: () => teamB
      }
    ];
  };

  const winnerAlignment = <TTeam, TScore, TMData, TUData>(
    match: Match<TTeam, TScore, TMData, TUData>,
    skipConsolationRound: boolean
  ) => (tC: JQuery) => {
    // Unless this is reset, the height calculation below will behave
    // incorrectly. No idea why.
    tC.css("top", "");
    const height = tC.height();

    tC.css({
      bottom: skipConsolationRound ? "" : -height / 2 + "px",
      position: "absolute",
      top: skipConsolationRound ? match.el.height() / 2 - height / 2 + "px" : ""
    });
  };

  function prepareWinners<TTeam, TScore, TMData, TUData>(
    winners: Bracket<TTeam, TScore, TMData, TUData>,
    teams: Array<[Option<TTeam>, Option<TTeam>]>,
    isSingleElimination: boolean,
    opts: Options<TTeam, TScore, TMData, TUData>,
    skipGrandFinalComeback: boolean
  ) {
    const roundCount = Math.log(teams.length * 2) / Math.log(2);
    let matchCount = teams.length;
    let round;

    for (let r = 0; r < roundCount; r += 1) {
      round = winners.addRound(Option.empty());

      for (let m = 0; m < matchCount; m += 1) {
        const teamCb =
          r === 0 ? winnerMatchSources<TTeam, TScore>(teams, m) : null;
        if (
          !(r === roundCount - 1 && isSingleElimination) &&
          !(r === roundCount - 1 && skipGrandFinalComeback)
        ) {
          round.addMatch(teamCb, Option.empty());
        } else {
          const match = round.addMatch(teamCb, Option.of(winnerBubbles));
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
        const prev = winners
          .final()
          .getRound()
          .prev();
        const third = prev.map(p => () => p.match(0).loser()).toNull();
        const fourth = prev.map(p => () => p.match(1).loser()).toNull();
        const consol = round.addMatch(
          () => [{ source: third }, { source: fourth }],
          Option.of(consolationBubbles)
        );

        consol.setAlignCb((tC: JQuery) => {
          const height = winners.el.height() / 2;
          consol.el.css({ height });

          const top = tC.height() / 2 + opts.matchMargin;
          tC.css({ top });
        });

        consol.setConnectorCb(Option.empty());
      }
    }
  }

  const loserMatchSources = <TTeam, TScore, TMData, TUData>(
    winners: Bracket<TTeam, TScore, TMData, TUData>,
    losers: Bracket<TTeam, TScore, TMData, TUData>,
    matchCount: number,
    m: number,
    n: number,
    r: number
  ) => (): [MatchSource<TTeam, TScore>, MatchSource<TTeam, TScore>] => {
    /* first round comes from winner bracket */
    if (n % 2 === 0 && r === 0) {
      return [
        {
          source: () =>
            winners
              .round(0)
              .match(m * 2)
              .loser()
        },
        {
          source: () =>
            winners
              .round(0)
              .match(m * 2 + 1)
              .loser()
        }
      ];
    } else {
      /* match with dropped */
      /* To maximize the time it takes for two teams to play against
       * eachother twice, WB losers are assigned in reverse order
       * every second round of LB */
      const winnerMatch = r % 2 === 0 ? matchCount - m - 1 : m;
      return [
        {
          source: () =>
            losers
              .round(r * 2)
              .match(m)
              .winner()
        },
        {
          source: () =>
            winners
              .round(r + 1)
              .match(winnerMatch)
              .loser()
        }
      ];
    }
  };

  const loserAlignment = <TTeam, TScore, TMData, TUData>(
    teamCon: JQuery,
    match: Match<TTeam, TScore, TMData, TUData>
  ) => () => {
    const top = match.el.height() / 2 - teamCon.height() / 2;
    return teamCon.css({ top });
  };

  const mkMatchConnector = <TTeam, TScore, TMData, TUData>(
    centerConnectors: boolean
  ) => (tC, match: Match<TTeam, TScore, TMData, TUData>): Connector => {
    // inside lower bracket
    const connectorOffset = tC.height() / 4;
    const center = { height: 0, shift: connectorOffset * 2 };
    return match
      .winner()
      .order.map(order =>
        order.map(
          centerConnectors ? center : { height: 0, shift: connectorOffset },
          centerConnectors
            ? center
            : {
                height: -connectorOffset * 2,
                shift: connectorOffset
              }
        )
      )
      .orElse(center);
  };

  function prepareLosers<TTeam, TScore, TMData, TUData>(
    winners: Bracket<TTeam, TScore, TMData, TUData>,
    losers: Bracket<TTeam, TScore, TMData, TUData>,
    teamCount: number,
    skipGrandFinalComeback: boolean,
    centerConnectors: boolean
  ) {
    const roundCount = Math.log(teamCount * 2) / Math.log(2) - 1;
    let matchCount = teamCount / 2;

    for (let r = 0; r < roundCount; r += 1) {
      /* if player cannot rise back to grand final, last round of loser
       * bracket will be player between two LB players, eliminating match
       * between last WB loser and current LB winner */
      const subRounds = skipGrandFinalComeback && r === roundCount - 1 ? 1 : 2;
      for (let n = 0; n < subRounds; n += 1) {
        const round = losers.addRound(Option.empty());

        for (let m = 0; m < matchCount; m += 1) {
          const teamCb = !(n % 2 === 0 && r !== 0)
            ? loserMatchSources<TTeam, TScore, TMData, TUData>(
                winners,
                losers,
                matchCount,
                m,
                n,
                r
              )
            : null;
          const isLastMatch = r === roundCount - 1 && skipGrandFinalComeback;
          const match = round.addMatch(
            teamCb,
            Option.of(isLastMatch ? consolationBubbles : null)
          );
          match.setAlignCb(
            loserAlignment(match.el.find(".teamContainer"), match)
          );

          if (isLastMatch) {
            // Override default connector
            match.setConnectorCb(Option.empty());
          } else if (r < roundCount - 1 || n < 1) {
            const cb = n % 2 === 0 ? mkMatchConnector(centerConnectors) : null;
            match.setConnectorCb(Option.of(cb));
          }
        }
      }
      matchCount /= 2;
    }
  }

  function prepareFinals<TTeam, TScore, TMData, TUData>(
    finals: Bracket<TTeam, TScore, TMData, TUData>,
    winners: Bracket<TTeam, TScore, TMData, TUData>,
    losers: Bracket<TTeam, TScore, TMData, TUData>,
    opts: Options<TTeam, TScore, TMData, TUData>,
    resizeContainer: () => void
  ) {
    const round = finals.addRound(Option.empty());
    const finalMatch = round.addMatch(
      () => [
        { source: () => winners.winner() },
        { source: () => losers.winner() }
      ],
      Option.of(match => {
        /* Track if container has been resized for final rematch */
        let isResized = false;
        /* LB winner won first final match, need a new one */
        if (
          !opts.skipSecondaryFinal &&
          (!match.winner().name.isEmpty() &&
            match.winner().name === losers.winner().name)
        ) {
          if (finals.size() === 2) {
            return false;
          }
          /* This callback is ugly, would be nice to make more sensible solution */
          const doRenderCb = () => {
            const rematch =
              !match.winner().name.isEmpty() &&
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
          const finalRound = finals.addRound(
            Option.of<BoolCallback>(doRenderCb)
          );
          /* keep order the same, WB winner top, LB winner below */
          const match2 = finalRound.addMatch(
            () => [
              { source: () => match.first() },
              { source: () => match.second() }
            ],
            Option.of(winnerBubbles)
          );

          match.setConnectorCb(
            Option.of(tC => ({ height: 0, shift: tC.height() / 2 }))
          );

          match2.setConnectorCb(Option.empty());
          match2.setAlignCb(tC => {
            const height = winners.el.height() + losers.el.height();
            match2.el.css({ height });

            const top =
              (winners.el.height() / 2 +
                winners.el.height() +
                losers.el.height() / 2) /
                2 -
              tC.height();
            tC.css({ top });
          });
          return false;
        } else {
          if (finals.size() === 2) {
            finals.dropRound();
          } else if (finals.size() > 2) {
            throw new Error("Unexpected number of final rounds");
          }
          return winnerBubbles(match);
        }
      })
    );

    finalMatch.setAlignCb(tC => {
      const height: number =
        (winners.el.height() + losers.el.height()) /
        (opts.skipConsolationRound ? 1 : 2);
      finalMatch.el.css({ height });

      const top: number =
        (winners.el.height() / 2 +
          winners.el.height() +
          losers.el.height() / 2) /
          2 -
        tC.height();
      tC.css({ top });
    });

    if (!opts.skipConsolationRound) {
      const prev = losers
        .final()
        .getRound()
        .prev();
      const consol = round.addMatch(
        () => [
          {
            source: () =>
              prev
                .get()
                .match(0)
                .loser()
          },
          { source: () => losers.loser() }
        ],
        Option.of(consolationBubbles)
      );
      consol.setAlignCb(tC => {
        const height = (winners.el.height() + losers.el.height()) / 2;
        consol.el.css({ height });

        const top =
          (winners.el.height() / 2 +
            winners.el.height() +
            losers.el.height() / 2) /
            2 +
          tC.height() / 2 -
          height;
        tC.css({ top });
      });

      finalMatch.setConnectorCb(Option.empty());
      consol.setConnectorCb(Option.empty());
    }

    winners.final().setConnectorCb(
      Option.of(tC => {
        const connectorOffset = tC.height() / 4;
        const topShift =
          (winners.el.height() / 2 +
            winners.el.height() +
            losers.el.height() / 2) /
            2 -
          tC.height() / 2;
        const matchupOffset = topShift - winners.el.height() / 2;

        const { height, shift } = winners
          .winner()
          .order.map(order =>
            order.map(
              {
                height: matchupOffset + connectorOffset * 2,
                shift: connectorOffset * (opts.centerConnectors ? 2 : 1)
              },
              {
                height:
                  matchupOffset +
                  connectorOffset * (opts.centerConnectors ? 2 : 0),
                shift: connectorOffset * (opts.centerConnectors ? 2 : 3)
              }
            )
          )
          .orElse({
            height:
              matchupOffset + connectorOffset * (opts.centerConnectors ? 2 : 1),
            shift: connectorOffset * 2
          });

        return { height: height - tC.height() / 2, shift };
      })
    );

    losers.final().setConnectorCb(
      Option.of(tC => {
        const connectorOffset = tC.height() / 4;
        const topShift =
          (winners.el.height() / 2 +
            winners.el.height() +
            losers.el.height() / 2) /
            2 -
          tC.height() / 2;
        const matchupOffset = topShift - winners.el.height() / 2;

        const { height, shift } = losers
          .winner()
          .order.map(order =>
            order.map(
              {
                height:
                  matchupOffset +
                  connectorOffset * (opts.centerConnectors ? 2 : 0),
                shift: connectorOffset * (opts.centerConnectors ? 2 : 3)
              },
              {
                height: matchupOffset + connectorOffset * 2,
                shift: connectorOffset * (opts.centerConnectors ? 2 : 1)
              }
            )
          )
          .orElse({
            height:
              matchupOffset + connectorOffset * (opts.centerConnectors ? 2 : 1),
            shift: connectorOffset * 2
          });

        return { height: -(height + tC.height() / 2), shift: -shift };
      })
    );
  }

  function teamState<TTeam, TScore>(
    team: TeamBlock<TTeam, TScore>,
    opponent: TeamBlock<TTeam, TScore>,
    score: Option<TScore>
  ): EntryState {
    return team.name
      .map(() =>
        score
          .map<EntryState>(() => EntryState.ENTRY_COMPLETE)
          .orElseGet(
            () =>
              opponent.emptyBranch() === BranchType.BYE
                ? EntryState.ENTRY_DEFAULT_WIN
                : EntryState.ENTRY_NO_SCORE
          )
      )
      .orElseGet(() => {
        const type = team.emptyBranch();
        switch (type) {
          case BranchType.BYE:
            return EntryState.EMPTY_BYE;
          case BranchType.TBD:
            return EntryState.EMPTY_TBD;
          default:
            throw new Error(`Unexpected branch type ${type}`);
        }
      });
  }

  class Round<TTeam, TScore, TMData, TUData> {
    private containerWidth = this.opts.teamWidth + this.opts.scoreWidth;
    private roundCon: JQuery = $(
      `<div class="round" style="width: ${
        this.containerWidth
      }px; margin-right: ${this.opts.roundMargin}px"/>`
    );
    private matches: Array<Match<TTeam, TScore, TMData, TUData>> = [];

    constructor(
      readonly bracket: Bracket<TTeam, TScore, TMData, TUData>,
      private previousRound: Option<Round<TTeam, TScore, TMData, TUData>>,
      readonly roundNumber: number,
      // TODO: results should be enforced to be correct by now
      private roundResults: Option<Array<ResultObject<TScore, TMData>>>,
      private doRenderCb: Option<BoolCallback>,
      private mkMatch: MatchCallback<TTeam, TScore, TMData, TUData>,
      private isFirstBracket: boolean,
      private opts: Options<TTeam, TScore, TMData, TUData>
    ) {}

    get el() {
      return this.roundCon;
    }
    public addMatch(
      teamCb:
        | (() => [MatchSource<TTeam, TScore>, MatchSource<TTeam, TScore>])
        | null,
      renderCb: Option<RenderCallback<TTeam, TScore, TMData, TUData>>
    ): Match<TTeam, TScore, TMData, TUData> {
      const matchIdx = this.matches.length;
      const teams =
        teamCb !== null
          ? teamCb()
          : [
              {
                source: () =>
                  this.bracket
                    .round(this.roundNumber - 1)
                    .match(matchIdx * 2)
                    .winner()
              },
              {
                source: () =>
                  this.bracket
                    .round(this.roundNumber - 1)
                    .match(matchIdx * 2 + 1)
                    .winner()
              }
            ];
      const teamA = () => teams[0].source();
      const teamB = () => teams[1].source();

      const teamABlock = new TeamBlock<TTeam, TScore>(
        teamA,
        teamA().name,
        Option.of(Order.first()),
        teamA().seed,
        Option.empty<TScore>()
      );
      const teamBBlock = new TeamBlock<TTeam, TScore>(
        teamB,
        teamB().name,
        Option.of(Order.second()),
        teamB().seed,
        Option.empty<TScore>()
      );

      teamABlock.sibling = () => teamBBlock;
      teamBBlock.sibling = () => teamABlock;

      const matchResult: MatchResult<TTeam, TScore> = new MatchResult(
        teamABlock,
        teamBBlock
      );
      const match = this.mkMatch(
        this,
        matchResult,
        matchIdx,
        this.roundResults.map(r => {
          return r[matchIdx] === undefined ? null : r[matchIdx];
        }),
        renderCb,
        this.isFirstBracket,
        this.opts
      );
      this.matches.push(match);
      return match;
    }
    public match(id: number): Match<TTeam, TScore, TMData, TUData> {
      return this.matches[id];
    }
    public prev(): Option<Round<TTeam, TScore, TMData, TUData>> {
      return this.previousRound;
    }
    public size(): number {
      return this.matches.length;
    }
    public render(): void {
      this.roundCon.empty();
      if (!this.doRenderCb.isEmpty() && !this.doRenderCb.get()()) {
        return;
      }
      this.roundCon.appendTo(this.bracket.el);
      this.matches.forEach(m => m.render());
    }
    public results(): Array<ResultObject<TScore, TMData>> {
      return this.matches.reduce(
        (agg: Array<ResultObject<TScore, TMData>>, m) =>
          agg.concat([m.results()]),
        []
      );
    }
  }

  class Bracket<TTeam, TScore, TMData, TUData> {
    private rounds: Array<Round<TTeam, TScore, TMData, TUData>> = [];

    constructor(
      private bracketCon: JQuery,
      private initResults: Option<Array<Array<ResultObject<TScore, TMData>>>>,
      private mkMatch: MatchCallback<TTeam, TScore, TMData, TUData>,
      private isFirstBracket: boolean,
      private opts: Options<TTeam, TScore, TMData, TUData>
    ) {}
    get el(): JQuery {
      return this.bracketCon;
    }
    public addRound(
      doRenderCb: Option<BoolCallback>
    ): Round<TTeam, TScore, TMData, TUData> {
      const id = this.rounds.length;
      const previous =
        id > 0
          ? Option.of(this.rounds[id - 1])
          : Option.empty<Round<TTeam, TScore, TMData, TUData>>();

      // Rounds may be undefined if init score array does not match number of teams
      const roundResults = this.initResults.map<
        Array<ResultObject<TScore, TMData>>
      >(
        r =>
          r[id] === undefined
            ? new ResultObject(
                Option.empty<TScore>(),
                Option.empty<TScore>(),
                undefined
              )
            : r[id]
      );

      const round = new Round(
        this,
        previous,
        id,
        roundResults,
        doRenderCb,
        this.mkMatch,
        this.isFirstBracket,
        this.opts
      );
      this.rounds.push(round);
      return round;
    }
    public dropRound(): void {
      this.rounds.pop();
    }
    public round(id: number): Round<TTeam, TScore, TMData, TUData> {
      return this.rounds[id];
    }
    public size(): number {
      return this.rounds.length;
    }
    public final(): Match<TTeam, TScore, TMData, TUData> {
      return this.rounds[this.rounds.length - 1].match(0);
    }
    public winner(): TeamBlock<TTeam, TScore> {
      return this.rounds[this.rounds.length - 1].match(0).winner();
    }
    public loser(): TeamBlock<TTeam, TScore> {
      return this.rounds[this.rounds.length - 1].match(0).loser();
    }
    public render(): void {
      this.bracketCon.empty();
      /* Length of 'rounds' can increase during render in special case when
       LB win in finals adds new final round in match render callback.
       Therefore length must be read on each iteration. */
      for (const round of this.rounds) {
        round.render();
      }
    }
    public results(): Array<Array<ResultObject<TScore, TMData>>> {
      return this.rounds.reduce(
        (agg: Array<Array<ResultObject<TScore, TMData>>>, r) =>
          agg.concat([r.results()]),
        []
      );
    }
  }

  const calculateHeight = height => {
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

    return { height, drop: true };
  };

  function createConnector(
    roundMargin: number,
    connector: Connector,
    align: "right" | "left"
  ): JQuery {
    const shift = connector.shift;
    const { height, drop } = calculateHeight(connector.height);
    const width = roundMargin / 2;

    // Subtract 1 due to line thickness and alignment mismatch caused by
    // combining top and bottom alignment
    const doShift = shift >= 0;

    const src = $('<div class="connector"></div>').css({
      [align]: -width - 2,
      borderBottom: drop ? "none" : "",
      borderTop: !drop ? "none" : "",
      bottom: !doShift ? -shift - 1 : "",
      height,
      top: doShift ? shift - 1 : "",
      width
    });

    const dst = $('<div class="connector"></div>').css({
      [align]: -width,
      bottom: drop ? 0 : "",
      top: !drop ? 0 : "",
      width
    });

    return src.append(dst);
  }

  function countRounds(
    teamCount: number,
    isSingleElimination: boolean,
    skipGrandFinalComeback: boolean,
    skipSecondaryFinal: boolean,
    results
  ) {
    if (isSingleElimination) {
      return Math.log(teamCount * 2) / Math.log(2);
    } else if (skipGrandFinalComeback) {
      return Math.max(2, (Math.log(teamCount * 2) / Math.log(2) - 1) * 2 - 1); // DE - grand finals
    } else {
      // Loser bracket winner has won first match in grand finals,
      // this requires a new match unless explicitely skipped
      const hasGrandFinalRematch =
        !skipSecondaryFinal &&
        (results.length === 3 && results[2].length === 2);
      return (
        (Math.log(teamCount * 2) / Math.log(2) - 1) * 2 +
        1 +
        (hasGrandFinalRematch ? 1 : 0)
      ); // DE + grand finals
    }
  }

  function exportData<TScore, TMData>(data) {
    const output = $.extend(true, {}, data);
    output.teams = output.teams.map(ts => ts.map(t => t.toNull()));
    output.results = output.results.map(brackets =>
      brackets.map(rounds =>
        rounds.map((matches: ResultObject<TScore, TMData>) => {
          if (matches.matchData !== undefined) {
            return [
              matches.first.toNull(),
              matches.second.toNull(),
              matches.matchData
            ];
          } else {
            return [matches.first.toNull(), matches.second.toNull()];
          }
        })
      )
    );
    return output;
  }

  class ResultId {
    private counter = 0;
    public get() {
      return this.counter;
    }
    public getNext(): number {
      return ++this.counter;
    }
    public reset(): void {
      this.counter = 0;
    }
  }

  function createTeam<TTeam, TScore, TMData, TUData>(
    roundNumber: number,
    match: MatchResult<TTeam, TScore>,
    team: TeamBlock<TTeam, TScore>,
    opponent: TeamBlock<TTeam, TScore>,
    isReady: boolean,
    isFirstBracket: boolean,
    opts: Options<TTeam, TScore, TMData, TUData>,
    resultId: ResultId,
    topCon: JQuery,
    renderAll: (r: boolean) => void
  ): JQuery {
    const resultIdAttribute =
      team.name.isEmpty() || opponent.name.isEmpty()
        ? ""
        : `data-resultid="result-${resultId.getNext()}"`;
    const sEl = $(
      `<div class="score" style="width: ${
        opts.scoreWidth
      }px;" ${resultIdAttribute}></div>`
    );
    const score =
      team.name.isEmpty() || opponent.name.isEmpty() || !isReady
        ? Option.empty<TScore>()
        : team.score;
    const scoreString = opts.extension.scoreToString(score.toNull());

    sEl.text(scoreString);

    const tEl = $(
      `<div class="team" style="width: ${opts.teamWidth +
        opts.scoreWidth}px;"></div>`
    );
    const nEl = $(
      `<div class="label" style="width: ${opts.teamWidth}px;"></div>`
    ).appendTo(tEl);

    opts.decorator.render(
      nEl,
      team.name.toNull(),
      team.score.toNull(),
      teamState(team, opponent, team.score)
    );

    team.seed.forEach(seed => {
      tEl.attr("data-teamid", seed);
    });

    if (team.name.isEmpty()) {
      tEl.addClass("na");
    } else if (match.winner().name === team.name) {
      tEl.addClass("win");
    } else if (match.loser().name === team.name) {
      tEl.addClass("lose");
    }

    tEl.append(sEl);

    // Only first round of BYEs can be edited
    if (
      (!team.name.isEmpty() ||
        (team.name.isEmpty() && roundNumber === 0 && isFirstBracket)) &&
      typeof opts.save === "function"
    ) {
      if (!opts.disableTeamEdit) {
        nEl.addClass("editable");
        nEl.click(function() {
          const span = $(this);

          function editor() {
            function done_fn(val, next: boolean) {
              // Needs to be taken before possible null is assigned below
              const teamId = team.seed.get();

              opts.init.teams[~~(teamId / 2)][teamId % 2] = Option.of<TTeam>(
                val || null
              );

              renderAll(true);
              span.click(editor);
              const labels = opts.el.find(
                ".team[data-teamid=" + (teamId + 1) + "] div.label:first"
              );
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
        const rId = resultId.get();

        sEl.addClass("editable");
        sEl.click(function() {
          const span = $(this);

          function editor() {
            span.unbind();

            const initialScore = !isNumber(team.score) ? "0" : span.text();
            const input = $('<input type="text">');

            input.val(initialScore);
            span.empty().append(input);

            input.focus().select();
            input.keydown(function(e) {
              if (!isNumber($(this).val())) {
                $(this).addClass("error");
              } else {
                $(this).removeClass("error");
              }

              const key = e.keyCode || e.which;
              if (key === 9 || key === 13 || key === 27) {
                e.preventDefault();
                $(this).blur();
                if (key === 27) {
                  return;
                }

                const next = topCon.find(
                  "div.score[data-resultid=result-" + (rId + 1) + "]"
                );
                if (next) {
                  next.click();
                }
              }
            });
            input.blur(() => {
              let val = opts.extension.evaluateScore(
                input.val(),
                team.score.toNull()
              );
              if (val === null) {
                val = team.score;
              }

              span.html(val);
              if (isNumber(val)) {
                team.score = Option.of<TScore>(val);
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

  class Match<TTeam, TScore, TMData, TUData> {
    private matchCon: JQuery;
    private teamCon: JQuery;
    private connectorCb: Option<
      ConnectorProvider<TTeam, TScore, TMData, TUData>
    > = Option.empty();
    private alignCb: ((JQuery) => void) | null;
    private matchUserData: TMData | undefined;

    constructor(
      private round: Round<TTeam, TScore, TMData, TUData>,
      private match: MatchResult<TTeam, TScore>,
      private seed: number,
      results: Option<ResultObject<TScore, TMData>>,
      private renderCb: Option<RenderCallback<TTeam, TScore, TMData, TUData>>,
      private isFirstBracket: boolean,
      private opts: Options<TTeam, TScore, TMData, TUData>,
      private resultId: ResultId,
      private topCon: JQuery,
      private renderAll: (r: boolean) => void
    ) {
      this.matchCon = $('<div class="match"></div>');
      this.teamCon = $('<div class="teamContainer"></div>');

      this.alignCb = null;

      this.matchUserData = !results.isEmpty()
        ? results.get().matchData
        : undefined;

      if (!opts.save) {
        // The hover and click callbacks are bound by jQuery to the element
        const userData = this.matchUserData;
        this.teamCon.hover(
          () => {
            opts.onMatchHover(userData, true);
          },
          () => {
            opts.onMatchHover(userData, false);
          }
        );

        this.teamCon.click(() => {
          opts.onMatchClick(userData);
        });
      }

      match.a.name = match.a.source().name;
      match.b.name = match.b.source().name;

      match.a.score = results.map(r => r.first.toNull());
      match.b.score = results.map(r => r.second.toNull());

      /* match has score even though teams haven't yet been decided */
      /* todo: would be nice to have in preload check, maybe too much work */
      if (
        (!match.a.name || !match.b.name) &&
        (isNumber(match.a.score) || isNumber(match.b.score))
      ) {
        console.warn(
          `ERROR IN SCORE DATA: ${match.a.source().name}: ${match.a.score}, ${
            match.b.source().name
          }: ${match.b.score}`
        );
        match.a.score = match.b.score = Option.empty<TScore>();
      }
    }

    get el() {
      return this.matchCon;
    }
    public getRound(): Round<TTeam, TScore, TMData, TUData> {
      return this.round;
    }
    public setConnectorCb(
      cb: Option<ConnectorProvider<TTeam, TScore, TMData, TUData>>
    ): void {
      this.connectorCb = cb;
    }
    public connect(
      cb: Option<ConnectorProvider<TTeam, TScore, TMData, TUData>>
    ): void {
      const align = this.opts.dir === "lr" ? "right" : "left";
      const connectorOffset = this.teamCon.height() / 4;
      const matchupOffset = this.matchCon.height() / 2;
      const result = cb
        .map(connectorCb => connectorCb(this.teamCon, this))
        .orElseGet(() => {
          if (this.seed % 2 === 0) {
            // dir == down
            return this.winner()
              .order.map(order =>
                order.map(
                  {
                    height: matchupOffset,
                    shift:
                      connectorOffset * (this.opts.centerConnectors ? 2 : 1)
                  },
                  {
                    height:
                      matchupOffset -
                      connectorOffset * (this.opts.centerConnectors ? 0 : 2),
                    shift:
                      connectorOffset * (this.opts.centerConnectors ? 2 : 3)
                  }
                )
              )
              .orElse({
                height:
                  matchupOffset -
                  connectorOffset * (this.opts.centerConnectors ? 0 : 1),
                shift: connectorOffset * 2
              });
          } else {
            // dir == up
            return this.winner()
              .order.map(order =>
                order.map(
                  {
                    height:
                      -matchupOffset +
                      connectorOffset * (this.opts.centerConnectors ? 0 : 2),
                    shift:
                      -connectorOffset * (this.opts.centerConnectors ? 2 : 3)
                  },
                  {
                    height: -matchupOffset,
                    shift:
                      -connectorOffset * (this.opts.centerConnectors ? 2 : 1)
                  }
                )
              )
              .orElse({
                height:
                  -matchupOffset +
                  connectorOffset * (this.opts.centerConnectors ? 0 : 1),
                shift: -connectorOffset * 2
              });
          }
        });

      this.teamCon.append(
        createConnector(this.opts.roundMargin, result, align)
      );
    }
    public winner() {
      return this.match.winner();
    }
    public loser() {
      return this.match.loser();
    }
    public first(): TeamBlock<TTeam, TScore> {
      return this.match.a;
    }
    public second(): TeamBlock<TTeam, TScore> {
      return this.match.b;
    }
    public setAlignCb(cb: (JQuery) => void) {
      this.alignCb = cb;
    }
    public render() {
      this.matchCon.empty();
      this.teamCon.empty();

      // This shouldn't be done at render-time
      this.match.a.name = this.match.a.source().name;
      this.match.b.name = this.match.b.source().name;
      this.match.a.seed = this.match.a.source().seed;
      this.match.b.seed = this.match.b.source().seed;

      const isDoubleBye =
        this.match.a.name.isEmpty() && this.match.b.name.isEmpty();
      if (isDoubleBye) {
        this.teamCon.addClass("np");
      } else if (!this.match.winner().name) {
        this.teamCon.addClass("np");
      } else {
        this.teamCon.removeClass("np");
      }

      // Coerce truthy/falsy "isset()" for Typescript
      const isReady =
        !this.match.a.name.isEmpty() && !this.match.b.name.isEmpty();

      this.teamCon.append(
        createTeam(
          this.round.roundNumber,
          this.match,
          this.match.a,
          this.match.b,
          isReady,
          this.isFirstBracket,
          this.opts,
          this.resultId,
          this.topCon,
          this.renderAll
        )
      );
      this.teamCon.append(
        createTeam(
          this.round.roundNumber,
          this.match,
          this.match.b,
          this.match.a,
          isReady,
          this.isFirstBracket,
          this.opts,
          this.resultId,
          this.topCon,
          this.renderAll
        )
      );

      this.matchCon.appendTo(this.round.el);
      this.matchCon.append(this.teamCon);

      const height = this.round.bracket.el.height() / this.round.size();
      this.el.css({ height });

      const top = this.el.height() / 2 - this.teamCon.height() / 2;
      this.teamCon.css({ top });

      /* todo: move to class */
      if (this.alignCb !== null) {
        this.alignCb(this.teamCon);
      }

      const isLast = this.renderCb.map(cb => cb(this)).orElse(false);
      if (!isLast) {
        this.connect(this.connectorCb);
      }
    }
    public results(): ResultObject<TScore, TMData> {
      // Either team is bye -> reset (mutate) scores from that match
      const hasBye = this.match.a.name.isEmpty() || this.match.b.name.isEmpty();
      if (hasBye) {
        this.match.a.score = this.match.b.score = Option.empty<TScore>();
      }
      return new ResultObject<TScore, TMData>(
        this.match.a.score,
        this.match.b.score,
        this.matchUserData
      );
    }
  }

  const undefinedToNull = value => (value === undefined ? null : value);

  const wrapResults = <TScore, TMData>(
    initResults
  ): Array<BracketResult<TScore, TMData>> =>
    initResults.map(brackets =>
      brackets.map(rounds =>
        rounds.map(
          (matches: [TScore, TScore, TMData]) =>
            new ResultObject(
              Option.of<TScore>(undefinedToNull(matches[0])),
              Option.of<TScore>(undefinedToNull(matches[1])),
              matches[2]
            )
        )
      )
    );

  const JqueryBracket = <TTeam, TScore, TMData, TUData>(
    opts: Options<TTeam, TScore, TMData, TUData>
  ) => {
    const resultId = new ResultId();

    const data = opts.init;

    const isSingleElimination = data.results.length <= 1;

    // 45 === team height x2 + 1px margin
    const height =
      data.teams.length * 45 + data.teams.length * opts.matchMargin;

    const topCon = $('<div class="jQBracket ' + opts.dir + '"></div>').appendTo(
      opts.el.empty()
    );

    function resizeContainer() {
      const roundCount = countRounds(
        data.teams.length,
        isSingleElimination,
        opts.skipGrandFinalComeback,
        opts.skipSecondaryFinal,
        data.results
      );

      topCon.css({
        // reserve space for consolation round
        height:
          isSingleElimination &&
          data.teams.length <= 2 &&
          !opts.skipConsolationRound
            ? height + 40
            : "",
        width: opts.disableToolbar
          ? roundCount * (opts.teamWidth + opts.scoreWidth + opts.roundMargin) +
            10
          : roundCount * (opts.teamWidth + opts.scoreWidth + opts.roundMargin) +
            40
      });
    }

    let w;
    let l;
    let f;

    function renderAll(save: boolean): void {
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
      $.error(
        "skipSecondaryFinal setting is viable only in double elimination mode"
      );
    }

    if (!opts.disableToolbar) {
      topCon.append(createToolbar(data, opts));
    }

    let fEl;
    let wEl;
    let lEl;

    if (isSingleElimination) {
      wEl = $('<div class="bracket"></div>').appendTo(topCon);
    } else {
      if (!opts.skipGrandFinalComeback) {
        fEl = $('<div class="finals"></div>').appendTo(topCon);
      }
      wEl = $('<div class="bracket"></div>').appendTo(topCon);
      lEl = $('<div class="loserBracket"></div>').appendTo(topCon);
    }

    wEl.css({ height });

    if (lEl) {
      lEl.css({ height: height / 2 });
    }

    resizeContainer();

    const mkMatch = (
      round: Round<TTeam, TScore, TMData, TUData>,
      match: MatchResult<TTeam, TScore>,
      seed: number,
      results: Option<ResultObject<TScore, TMData>>,
      renderCb: Option<RenderCallback<TTeam, TScore, TMData, TUData>>,
      isFirstBracket: boolean,
      options: Options<TTeam, TScore, TMData, TUData>
    ): Match<TTeam, TScore, TMData, TUData> => {
      return new Match(
        round,
        match,
        seed,
        results,
        renderCb,
        isFirstBracket,
        options,
        resultId,
        topCon,
        renderAll
      );
    };

    w = new Bracket(
      wEl,
      Option.of(data.results[0] || null),
      mkMatch,
      true,
      opts
    );

    if (!isSingleElimination) {
      l = new Bracket(
        lEl,
        Option.of(data.results[1] || null),
        mkMatch,
        false,
        opts
      );
      if (!opts.skipGrandFinalComeback) {
        f = new Bracket(
          fEl,
          Option.of(data.results[2] || null),
          mkMatch,
          false,
          opts
        );
      }
    }

    prepareWinners(
      w,
      data.teams,
      isSingleElimination,
      opts,
      opts.skipGrandFinalComeback && !isSingleElimination
    );

    if (!isSingleElimination) {
      prepareLosers(
        w,
        l,
        data.teams.length,
        opts.skipGrandFinalComeback,
        opts.centerConnectors
      );
      if (!opts.skipGrandFinalComeback) {
        prepareFinals(f, w, l, opts, resizeContainer);
      }
    }

    renderAll(false);

    return {
      data(): InitData<TTeam, TScore, TMData> {
        return exportData(opts.init);
      }
    };
  };

  function createIncrementButton(onClick) {
    return $('<span class="increment">+</span>').click(onClick);
  }

  function createDecrementButton(onClick) {
    return $('<span class="decrement">-</span>').click(onClick);
  }

  function createDoubleEliminationButton(onClick) {
    return $('<span class="doubleElimination">de</span>').click(onClick);
  }

  function createSingleEliminationButton(onClick) {
    return $('<span class="singleElimination">se</span>').click(onClick);
  }

  function createToolbar<TTeam, TScore, TMData, TUData>(
    data: InitData<TTeam, TScore, TMData>,
    opts: Options<TTeam, TScore, TMData, TUData>
  ) {
    const teamCount = data.teams.length;
    const resultCount = data.results.length;

    const incrementButton = () =>
      createIncrementButton(() => {
        for (let i = 0; i < teamCount; i += 1) {
          data.teams.push([Option.empty(), Option.empty()]);
        }
        return JqueryBracket(opts);
      });

    const decrementButton = () =>
      createDecrementButton(() => {
        if (teamCount > 1) {
          data.teams = data.teams.slice(0, teamCount / 2);
          return JqueryBracket(opts);
        }
      });

    const doubleEliminationButton = () =>
      createDoubleEliminationButton(() => {
        if (teamCount > 1 && resultCount < 3) {
          data.results.push([], []);
          return JqueryBracket(opts);
        }
      });

    const singleEliminationButton = () =>
      createSingleEliminationButton(() => {
        if (resultCount === 3) {
          data.results = data.results.slice(0, 1);
          return JqueryBracket(opts);
        }
      });

    const tools = $('<div class="tools"></div>');

    tools.append(incrementButton());

    if (
      (teamCount > 1 && resultCount === 1) ||
      (teamCount > 2 && resultCount === 3)
    ) {
      tools.append(decrementButton());
    }

    if (resultCount === 1 && teamCount > 1) {
      tools.append(doubleEliminationButton());
    } else if (resultCount === 3 && teamCount > 1) {
      tools.append(singleEliminationButton());
    }

    return tools;
  }

  const getNumber = (expected: any): number => {
    if (typeof expected !== "number") {
      throw new Error("Value is not a number");
    }
    return expected;
  };

  const getBoolean = (expected: any): boolean => {
    if (typeof expected !== "boolean") {
      throw new Error("Value is not a boolean");
    }
    return expected;
  };

  const getPositiveOrZero = (expected: any): number => {
    const value = getNumber(expected);
    if (value < expected) {
      throw new Error(`Value must be greater than ${expected}, got ${value}`);
    }
    return value;
  };

  const isPow2 = x => x & (x - 1);

  function assertOptions<TTeam, TScore, TMData, TUData>(
    opts: Options<TTeam, TScore, TMData, TUData>
  ) {
    // Assert correct permutation of options

    if (!opts.save && opts.disableTeamEdit) {
      $.error(
        'disableTeamEdit can be used only if the bracket is editable, i.e. "save" callback given'
      );
    }
    if (!opts.disableToolbar && opts.disableTeamEdit) {
      $.error(
        'disableTeamEdit requires also resizing to be disabled, initialize with "disableToolbar: true"'
      );
    }
  }

  function parseOptions<TTeam, TScore, TMData, TUData>(
    input: BracketOptions<TTeam, TScore, TMData, TUData>,
    context: JQuery,
    extension: Extension<TScore>
  ): Options<TTeam, TScore, TMData, TUData> {
    const opts: Options<TTeam, TScore, TMData, TUData> = {
      centerConnectors: !input.hasOwnProperty("centerConnectors")
        ? false
        : getBoolean(input.centerConnectors),
      decorator: input.decorator,
      dir: parseDir(input.dir),
      disableHighlight: !input.hasOwnProperty("disableHighlight")
        ? false
        : getBoolean(input.disableHighlight),
      disableTeamEdit: !input.hasOwnProperty("disableTeamEdit")
        ? false
        : getBoolean(input.disableTeamEdit),
      disableToolbar: input.disableToolbar,
      el: context,
      // TODO: expose via public interface
      extension,
      init: parseInit(input.init),
      matchMargin: !input.hasOwnProperty("matchMargin")
        ? 20
        : getPositiveOrZero(input.matchMargin),
      onMatchClick: input.onMatchClick
        ? input.onMatchClick
        : () => {
            return;
          },
      onMatchHover: input.onMatchHover
        ? input.onMatchHover
        : () => {
            return;
          },
      roundMargin: !input.hasOwnProperty("roundMargin")
        ? 40
        : getPositiveOrZero(input.roundMargin),
      save: input.save,
      scoreWidth: !input.hasOwnProperty("scoreWidth")
        ? 30
        : getPositiveOrZero(input.scoreWidth),
      skipConsolationRound: input.skipConsolationRound || false,
      skipGrandFinalComeback: input.skipGrandFinalComeback || false,
      skipSecondaryFinal: input.skipSecondaryFinal || false,
      teamWidth: !input.hasOwnProperty("teamWidth")
        ? 70
        : getPositiveOrZero(input.teamWidth),
      userData: input.userData
    };

    assertOptions(opts);

    return opts;
  }

  function parseDir(input: string | undefined): "lr" | "rl" {
    if (input === undefined) {
      return "lr";
    } else {
      if (input !== "lr" && input !== "rl") {
        throw new Error('Direction must be either: "lr" or "rl"');
      }
      return input;
    }
  }

  function defaultEvaluateScore(
    val: string,
    previousVal: number | null
  ): number | null {
    if ((!val || !isNumber(val)) && !isNumber(previousVal)) {
      return 0;
    } else if (isNumber(val)) {
      return parseInt(val, 10);
    }
    return null;
  }

  function parseInit<TTeam, TScore, TMData, TUData>(
    rawInit?: BracketInitData<TTeam, TScore, TMData>
  ): InitData<TTeam, TScore, TMData> {
    const value: BracketInitData<TTeam, TScore, TMData> = rawInit
      ? rawInit
      : {
          results: [],
          teams: [[null, null]]
        };
    if (value.teams === undefined) {
      throw new Error("Teams missing");
    }
    if (value.results === undefined) {
      throw new Error("Results missing");
    }
    const log2Result = isPow2(value.teams.length);
    if (log2Result !== Math.floor(log2Result)) {
      $.error(
        `"teams" property must have 2^n number of team pairs, i.e. 1, 2, 4, etc. Got ${
          value.teams.length
        } team pairs.`
      );
    }

    /* wrap data to into necessary arrays */
    const r = wrap(value.results, 4 - depth(value.results));
    const results = wrapResults<TScore, TMData>(r);

    return {
      results,
      teams:
        !value.teams || value.teams.length === 0
          ? [[Option.empty<TTeam>(), Option.empty<TTeam>()]]
          : value.teams.map(
              ts =>
                ts.map(
                  t => (t === null ? Option.empty<TTeam>() : Option.of(t))
                ) as [Option<TTeam>, Option<TTeam>]
            )
    };
  }

  function init<TTeam, TScore, TMData, TUData>(
    ctx: JQuery,
    originalOpts: BracketOptions<TTeam, TScore, TMData, TUData> | undefined,
    extension: Extension<TScore>
  ) {
    if (!originalOpts) {
      throw Error("Options not set");
    }
    if (!originalOpts.init && !originalOpts.save) {
      throw Error("No bracket data or save callback given");
    }

    const opts: BracketOptions<TTeam, TScore, TMData, TUData> = $.extend(
      true,
      {},
      originalOpts
    ); // Do not mutate inputs

    if (opts.decorator && (!opts.decorator.edit || !opts.decorator.render)) {
      throw Error("Invalid decorator input");
    }

    if (opts.save && (opts.onMatchClick || opts.onMatchHover)) {
      $.error(
        "Match callbacks may not be passed in edit mode (in conjunction with save callback)"
      );
    }

    const disableToolbarType = typeof opts.disableToolbar;
    const disableToolbarGiven = opts.hasOwnProperty("disableToolbar");
    if (disableToolbarGiven && disableToolbarType !== "boolean") {
      $.error(`disableToolbar must be a boolean, got ${disableToolbarType}`);
    }
    if (!opts.save && disableToolbarGiven) {
      $.error(
        'disableToolbar can be used only if the bracket is editable, i.e. "save" callback given'
      );
    }
    if (!disableToolbarGiven) {
      opts.disableToolbar = opts.save === undefined;
    }

    const internalOpts = parseOptions<TTeam, TScore, TMData, TUData>(
      originalOpts,
      ctx,
      extension
    );
    const bracket = JqueryBracket(internalOpts);
    $(ctx).data("bracket", { target: ctx, obj: bracket });
    return bracket;
  }

  function isInit<TTeam, TScore, TMData, TUData>(
    arg: any
  ): arg is undefined | BracketOptions<TTeam, TScore, TMData, TUData> {
    return typeof arg === "object" || arg === undefined;
  }

  $.fn.bracket = function(method: any) {
    if (typeof method === "string" && method === "data") {
      const bracket = $(this).data("bracket");
      return bracket.obj.data();
    } else if (isInit(method)) {
      const options = method as BracketOptions<string, number, any, any>;

      return init<string, number, any, any>(
        this,
        {
          ...options,
          decorator: options.decorator
            ? options.decorator
            : { edit: defaultEdit, render: defaultRender }
        },
        {
          evaluateScore: defaultEvaluateScore,
          scoreToString: (score: number | null) =>
            score === null ? "--" : score.toString()
        }
      );
    } else {
      $.error("Method " + method + " does not exist on jQuery.bracket");
    }
  };
})(jQuery);
