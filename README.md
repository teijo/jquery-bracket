# jQuery Bracket library

jQuery bracket is a jQuery plugin that lets users create and display single and
double elimination brackets for tournament play.

## Documentation and examples

Documentation and examples can be found from the project site at http://www.aropupu.fi/bracket/

## Installing

Use `bower` (`npm install -g bower`) to install jQuery Bracket as a
dependency. If you want to take a manual copy of the code, pre-compiled
version can be found under `dist/`.

`bower install jquery-bracket`

You can also use `npm`:

`npm install jquery-bracket`

## Development

* Install node
* Run `npm install -g typescript` to install TypeScript globally
* Run `npm start` to get dependencies and start "watch" for changes under `src/`
* Run `npm run check` to test style conformity
* Run `npm run format` to auto-format (overwrite) files

Minified files are compiled to `dist/` directory.

## Changes

* 2018-01-24: **0.11.1** Fix `TBD` propagation and final connector bug.
* 2016-11-12: **0.11.0** Center connectors with `centerConnectors: boolean`
  and disable hover highlight with `disableHighlight: boolean`. Bug fixes.
* 2016-11-05: **0.10.0** Pass entry state to `render` decorator to allow
  custom visualization for TBD, BYE, no-score, and default win scenarios.
* 2016-10-25: **0.9.0** Resizing and partial editing support
  * Adjust bracket proportions with `teamWidth: number`,
    `scoreWidth: number`, `matchMargin: number`, `roundMargin: number`.
  * `disableTeamEdit: boolean` prevents modifying the team when in edit
    mode.
  * `disableToolbar: boolean` prevents modifying the bracket size and
    format in edit mode.
* 2016-10-16: **0.8.0** BYE matches.
  * Gives proper support for having any number of teams in a tournament
    (instead of just 2^N, i.e. 2, 4, 8...).
  * Leaving teams empty (`null`) creates a BYE branch. Any team scheduled
    against BYE will get a default win with no score, and advance
    automatically to the next match.
* 2015-12-11: **0.7.3** Do not mutate original initialization data.
* 2015-11-26: **0.7.2** Fix #49, the score initialization bug.
* 2015-11-07: **0.7.1** (hotfix) ~~0.7.0~~ including source cleanup and new feature flag:
  [`skipGrandFinalComeback`](http://www.aropupu.fi/bracket/#noGrandFinalComeback).
* 2015-10-21: Published `jquery-bracket` to Bower. You can now use
  `bower install jquery-bracket` to install the library.
* 2015-10-14: Tagged latest commit (3a4210c) as **0.6.0** to indicate it
  being the latest stable version and keep future development more flexible.
  From now on, take only a tagged version from this repository unless you're
  developing it further.
* 2013-10-29: Remove redundant styles. Make HTML more standards compliant.
  Streamline CSS and HTML to some extent with jQuery Group plugin. Markup
  and CSS in this release **are not backwards compatible!**
* 2013-10-07: `skipSecondaryFinal` boolean to finish double elimination
  tournament after first match. Skips the second match normally created if
  LB winner wins the first match. Display '--' score for non-played matches.
  Project ported to TypeScript with additional refactorings (not visible for
  library users).
* 2013-06-05: `onMatchHover` and `onMatchClick` callbacks created in order
  to allow more interaction with the bracket.
* 2013-04-03: "skipConsolationRound" option, minified distribution files
* 2013-03-14: Reversing the bracket flow with dir property
* 2012-07-10 (release 5): IE 8 support and remove "disabled" attributes as
  it messed IE8+ colors.
* 2012-07-09 (release 4): Included following fixes and added bubble for 4th
  place.
  * There is no support for second final match. If LB winner wins the
    first round in finals, you must practically score the match according
    to rounds, e.g. 1-0, 0-1 or 0-2. In the fix if LB winner wins first
    final match, a new round will be created. Fix not perfectly backwards
    compatible. LB winning brackets with old results will be displayed
    unresolved as new final round is generated.
  * Losers from WB will be assigned in same order to LB. This means that
    participants will have to play against previous opponents earlier than
    necessary. This fix is not backwards compatible! Every second round of
    WB losers will be assigned in reverse order to LB in order to maximize
    the time it takes for two teams to play against each other twice.
* 2012-04-09 (release 3): Fix bug preventing edit click of finalist in
  Firefox and Chrome.
* 2012-01-23: SASS conversion for styles. Fix bug with 2 teams.
* 2012-01-15 (release 2): Result labels and color adjustments.
* 2011-10-18 (release 1): Consolidation final support for single
  elimination.
* 2011-10-11: Bugfix: Zero not properly accepted as a result
