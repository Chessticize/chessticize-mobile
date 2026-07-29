# Stockfish Search Replacement and the Arrow Duel Analysis Crash

Date: 2026-07-29

## Question

When Analysis changes position while Stockfish is still searching, what completion
boundary should separate the old search from the replacement search, and how does
Lichess implement that boundary?

The production crash was reproduced with Arrow Duel puzzle `xBqI8`:

- Initial FEN:
  `8/8/2p1p3/1p2pkp1/1PP5/P3K1P1/6P1/8 b - - 0 1`
- Analysis move: `e5e4`
- Replacement-search FEN:
  `8/8/2p1p3/1p3kp1/1PP1p3/P3K1P1/6P1/8 w - - 0 2`
- App: Chessticize 1.3 build 1
- Result: repeatable `SIGABRT` in
  `Stockfish::Search::Worker::search<Root>` while the replacement analysis was
  still running.

## Executive conclusion

Lichess uses a single protocol owner and a latest-request-wins queue. A request
that replaces an active search sends `stop`, marks the current work as stopping,
and does **not** send the replacement `position`/`go` until the old search emits
`bestmove`. `isready` is not treated as proof that a search has finished.

That is a useful invariant for Chessticize, but binary/source correlation shows
that the reproduced `xBqI8` abort is not primarily a search-replacement race.
The immediate defect is a missing Stockfish callback:

- Stockfish 18 calls `onIter` after a root search exceeds 10,000,000 nodes.
- `StockfishRunner::configureCallbacks()` configures `onUpdateNoMoves`,
  `onUpdateFull`, `onBestmove`, and network verification, but not `onIter`.
- The crashing instruction checks the empty `std::function` used by `onIter`
  and enters the throw/abort path. The nearby symbol name for a folded throw
  helper can misleadingly look like a vector length error.

The position and move are therefore useful because the resulting MultiPV search
crosses the 10,000,000-node callback threshold. The immediate regression should
prove that this long search remains alive and reports/completes. Search
replacement serialization should be hardened and tested separately.

## What Lichess does

### Lichess web

Lichess web's protocol has one `work` slot and one `nextWork` slot. On a new
request, `compute()` replaces `nextWork`, marks the active work as
`stopRequested`, sends `stop` once, and calls `swapWork()`. `swapWork()` refuses
to start anything while `work` is still present. Only the old search's
`bestmove` handler clears `work` and calls `swapWork()`, which then applies
options, sends `position`, and sends the new `go`.

It also ignores `info` from work for which stop was requested. This prevents
late output from the old search from being attributed to the new position.

Sources:

- [Lichess web protocol: `bestmove` clears current work and starts pending work](https://github.com/lichess-org/lila/blob/622189d42a2a985962fc48613314e6952864c31b/ui/lib/src/ceval/protocol.ts#L49-L74)
- [Lichess web protocol: stop-once and guarded work swap](https://github.com/lichess-org/lila/blob/622189d42a2a985962fc48613314e6952864c31b/ui/lib/src/ceval/protocol.ts#L169-L203)

Lichess web uses `isready` during initial UCI setup, not as the boundary between
two searches. Each work item uses a single `go`; progressive UI updates come
from Stockfish's incremental `info` output rather than a separate shallow search
followed by another search.

### Current Lichess mobile

The current Lichess mobile app describes its engine service as a singleton in
which only one evaluation runs at a time and the latest caller wins. Its UCI
protocol has the same `work`/`nextWork` structure.

Mobile sends `stop` and `isready` when computing replacement work, but
`readyok` cannot start the replacement while `_work` is non-null.
`_work` is cleared only by the old search's `bestmove`; `_swapWork()` then sends
the replacement `position` and `go`.

Sources:

- [Lichess mobile service: singleton and latest-caller-wins contract](https://github.com/lichess-org/mobile/blob/833927cc062fa506a4cf8073f2ae533140ffdc12/lib/src/model/engine/evaluation_service.dart#L48-L87)
- [Lichess mobile protocol: compute, ready handling, and bestmove handoff](https://github.com/lichess-org/mobile/blob/833927cc062fa506a4cf8073f2ae533140ffdc12/lib/src/model/engine/uci_protocol.dart#L99-L136)
- [Lichess mobile protocol: stop-once and guarded work swap](https://github.com/lichess-org/mobile/blob/833927cc062fa506a4cf8073f2ae533140ffdc12/lib/src/model/engine/uci_protocol.dart#L213-L260)

Engine process start/quit operations are serialized through a future queue, and
late evaluation/move results are explicitly discarded during quit:

- [Serialized Lichess mobile engine operations](https://github.com/lichess-org/mobile/blob/833927cc062fa506a4cf8073f2ae533140ffdc12/lib/src/model/engine/evaluation_service.dart#L77-L87)
- [Ordered quit and stale-result suppression](https://github.com/lichess-org/mobile/blob/833927cc062fa506a4cf8073f2ae533140ffdc12/lib/src/model/engine/evaluation_service.dart#L498-L559)

## What Stockfish guarantees

Stockfish 18's `stop()` only raises the search stop flag. Its UCI loop answers
`isready` immediately, so `readyok` alone is not a search-finished
acknowledgement.

The actual completion sequence happens in the search worker: it stops and joins
the search threads, then invokes the `bestmove` callback. Starting a new `go`
also waits for the previous main-thread search job before it initializes the
next root search.

Sources:

- [Stockfish 18 UCI loop: `stop` and immediate `readyok`](https://github.com/official-stockfish/Stockfish/blob/cb3d4ee9b47d0c5aae855b12379378ea1439675c/src/uci.cpp#L88-L137)
- [Stockfish 18 engine: stop flag and explicit wait API](https://github.com/official-stockfish/Stockfish/blob/cb3d4ee9b47d0c5aae855b12379378ea1439675c/src/engine.cpp#L160-L200)
- [Stockfish 18 thread pool: new search waits for the old search job](https://github.com/official-stockfish/Stockfish/blob/cb3d4ee9b47d0c5aae855b12379378ea1439675c/src/thread.cpp#L284-L345)
- [Stockfish 18 search: join search threads before publishing `bestmove`](https://github.com/official-stockfish/Stockfish/blob/cb3d4ee9b47d0c5aae855b12379378ea1439675c/src/search.cpp#L210-L253)

An embedded controller can therefore use either of these completion boundaries:

1. Protocol boundary: wait for the old search's `bestmove`, as Lichess does.
2. Native boundary: on a serialized non-search thread, call
   `stop()` and `wait_for_search_finished()` before mutating options/position or
   starting another search.

The first remains valuable even when the native wrapper uses the second,
because asynchronous output delivery still needs an owner/generation so that
late lines cannot complete or update a newer request.

The replacement must not be started synchronously from Stockfish's
`onBestmove` callback itself: the main search worker has not returned from that
callback yet. Post the handoff to the serial controller queue so the callback
can return before the next `go`.

## Chessticize comparison

`analyzeFenWithUciEngine()` is a per-call protocol listener rather than a
singleton work arbiter. Cancellation sends `stop` and resolves immediately.
A replacement call may subscribe before output from the stopped search has
arrived. The shallow-to-full transition also sends `stop` followed by a new
`go`, and distinguishes completion with a local boolean rather than an engine
work identity.

The native bridge improves native-state safety in two ways:

- all commands run on a serial dispatch queue;
- applying a position calls `engine.wait_for_search_finished()` first.

However, engine output is dispatched asynchronously to the main queue. Native
search completion and JavaScript receipt of its final output are therefore
different events. The JavaScript protocol still needs a current-work owner or
generation if it reuses one transport.

### Immediate crash cause

The embedded Stockfish source invokes:

```cpp
if (rootNode && is_mainthread() && nodes > 10000000)
    main_manager()->updates.onIter(
      {depth, UCIEngine::move(move, pos.is_chess960()), moveCount + pvIdx});
```

The official Stockfish UCI adapter registers `set_on_iter`, but
`StockfishRunner::configureCallbacks()` does not. The two crash reports land on
the empty-function check for this exact call. This matches all observed
conditions:

- the failure is native and deterministic;
- simple/short searches do not fail;
- `xBqI8` fails late in a deeper MultiPV search;
- the crash can follow a move without requiring concurrent position mutation.

Sources:

- [Stockfish 18 official UCI adapter registers every search callback, including `on_iter`](https://github.com/official-stockfish/Stockfish/blob/cb3d4ee9b47d0c5aae855b12379378ea1439675c/src/uci.cpp#L79-L85)
- [Stockfish 18 invokes `onIter` after 10,000,000 root nodes](https://github.com/official-stockfish/Stockfish/blob/cb3d4ee9b47d0c5aae855b12379378ea1439675c/src/search.cpp#L1016-L1028)
- Local wrapper: `apps/mobile/native/stockfish/Bridge/StockfishRunner.cpp`
- Local async event bridge:
  `apps/mobile/ios/StockfishEngine/Native/NativeStockfishEngine.mm`
- Local UCI controller: `packages/core/src/engine-analysis.ts`

## Recommended invariants

1. Every `SearchManager::UpdateContext` callback that Stockfish may invoke is
   always initialized. Optional UI handling must use a no-op callback, not an
   empty `std::function`.
2. One engine transport has one protocol owner.
3. At most one work item is active. A replacement request overwrites one pending
   slot ("latest wins").
4. Replacement is `stop active` -> `active fully finished` -> apply
   options/position -> `go pending`.
5. `readyok` never substitutes for search completion.
6. Output belongs to a work generation. Output from a stopped generation may be
   logged, but it must not update or complete the current generation.
7. Engine terminate/start operations are serialized, and termination waits for
   the search thread before destroying callback state.

## Regression scenarios

### A. Crash regression: `xBqI8` long search

Run the real native runner in an isolated test process:

1. Initialize Stockfish 18 with the production NNUE files, `Threads=1`,
   `Hash=32`, and `MultiPV=3`.
2. Set the post-move FEN
   `8/8/2p1p3/1p3kp1/1PP1p3/P3K1P1/6P1/8 w - - 0 2`.
3. Start the same production depth-20 analysis.
4. Require the process to stay alive after the search exceeds 10,000,000 nodes.
5. Require either a well-formed `currmove` update and ultimately `bestmove`, or
   an intentionally ignored `onIter` callback and ultimately `bestmove`.

Before the callback fix, the child process should terminate with `SIGABRT`.
After the fix, it should exit normally.

### B. Protocol regression: replacement while active

Use a deterministic transport that does not emit `bestmove` immediately:

1. Start work A for the initial `xBqI8` FEN.
2. While A is emitting `info`, request work B for the `e5e4` FEN.
3. Assert that only `stop` is sent while A remains active; no B
   `position`/`go` is sent.
4. Emit late A `info`; assert that it is ignored.
5. Emit A `bestmove`; assert that B's `position` and exactly one `go` are sent.
6. Repeat with rapid B/C replacements and assert that only the latest pending
   work starts.

This proves the Lichess-style lifecycle invariant. It is complementary to, not
a substitute for, the real native long-search regression.
