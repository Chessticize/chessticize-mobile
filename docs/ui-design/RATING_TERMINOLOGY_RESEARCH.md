# Rating Terminology Research

Date: 2026-07-24
Scope: User-facing terminology for Chessticize Practice Runs and Sprint results

## Decision

Use **Rating** in the interface. Use **Run rating** when the surrounding
context does not already identify the Run.

Do not use **ELO** or **Elo** as the user-facing label. Elo is the name of one
specific rating system, while Chessticize uses a server-compatible Glicko-2
shape for Sprint ratings
([core contract](../CORE_CLI.md#rating-semantics)). The current
interface therefore asks beginners to understand an algorithm name that does
not describe the algorithm actually used.

Recommended replacements:

| Current copy | Recommended copy |
| --- | --- |
| `ELO 775` | `Rating 775` |
| `Current ELO` | `Current rating` |
| `Starting ELO` / `Initial ELO` | `Starting rating` |
| `Edit ELO` | `Edit rating` |
| `ELO (Standard)` | `Standard rating` |
| `Rating Change` | Keep `Rating change` |

At the first meaningful exposure, explain the product behavior rather than the
math:

> Each Run has its own rating. It changes after rated Sprints and helps
> Chessticize choose the right puzzle difficulty.

For a starting-rating control:

> Starting rating sets the initial puzzle difficulty for this Run.

These explanations should be available again from an information affordance or
the replayable Sprint guidance. They do not need a separate full-screen guide.

## Evidence from chess products

### Chess.com

Chess.com calls the user-visible number a **rating**. Its help center says that
every player has a rating, and its Stats experience exposes the current rating
and rating history. The underlying system is identified separately as
**Glicko**
([Chess.com rating help](https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com),
[Chess.com rating terminology and Stats UI](https://www.chess.com/terms/chess-ratings)).

Its puzzle product is more specific where needed: official help uses
**Puzzle rating**, **Puzzle Rating** in the result stats panel, and rating
points. It also warns that puzzle rating and chess rating are different
([Chess.com puzzle UI](https://support.chess.com/en/articles/8608686-how-do-puzzles-work-on-chess-com)).
The puzzle implementation is described as using Glicko-style rating logic, not
as an Elo score
([Chess.com puzzle-rating system](https://support.chess.com/en/articles/12488563-why-did-my-puzzle-rating-change)).

### Lichess

Lichess uses **rating** throughout its official user help: ratings, rated
games, rating points, rating history, and rating leaderboard. Its FAQ reserves
the algorithm name for the technical explanation and states that Lichess
ratings are calculated with **Glicko-2**
([Lichess FAQ](https://lichess.org/faq#ratings)).

Lichess's official rating-systems page explicitly distinguishes the general
concept of a rating from the algorithm used to calculate it: FIDE uses Elo,
while Lichess uses Glicko-2. It also cautions that ratings from different pools
or servers cannot be compared directly
([Lichess rating systems](https://lichess.org/page/rating-systems)).

### ChessTempo

ChessTempo's official manual calls the learner metric a **tactics rating**.
Its user-facing statistics and history fields are named **Rating**,
**User Rating**, and **Rating Change**
([ChessTempo manual](https://www.chesstempo.com/manual/en/manual.html)).

The same manual separately explains that both users and problems are rated
with the **Glicko Rating System**
([ChessTempo manual](https://www.chesstempo.com/manual/en/manual.html)).

## Product-language conclusion

Across Chess.com, Lichess, and ChessTempo, the stable pattern is:

1. **Rating** is the user-facing concept.
2. A qualifier such as **Puzzle rating** or **Tactics rating** is added only
   when multiple rating pools could be confused.
3. **Elo**, **Glicko**, and **Glicko-2** describe calculation systems in help
   or technical material; they are not required to understand the primary UI.

For Chessticize, **Run rating** is the clearest qualified form because every
saved Run owns an independent rating. It avoids implying that the number is the
user's global chess rating, a Chess.com or Lichess rating, or the fixed
difficulty rating of an individual puzzle.

## Placement recommendation

- Run card: show `Rating 775`.
- Run editor: use `Starting rating`, `Current rating`, and `Edit rating`.
- Practice progress: use `Standard rating`, `Arrow Duel rating`, or the custom
  Run name followed by `rating`.
- Sprint result: keep `Rating change`, including both the delta and old-to-new
  values.
- First Sprint or first Run creation: show the one-sentence explanation above.
- Settings guidance reset: say that Runs, **ratings**, and History remain
  unchanged.
- Technical documentation and code may retain precise names such as
  `Glicko-2`, `rating`, or legacy identifiers. This recommendation concerns
  user-facing English copy, accessibility labels, and store-facing language.
