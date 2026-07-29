# App Store Screenshot Story

This document defines the issue #410 review candidate for Chessticize's
English App Store screenshot sequence. The machine-readable contract is
[`config/app-store-marketing-story-v1.json`](../../config/app-store-marketing-story-v1.json).

The six frames are marketing assets, not release-QA evidence. The maintained
fifteen-scene capture in [`docs/STORE_ASSETS.md`](../STORE_ASSETS.md) remains a
separate visual regression and release-validation workflow. Issues #411 and
#412 must consume this contract without weakening or replacing that coverage.

## Story

| Order | Final headline | Final supporting copy | Product evidence |
| --- | --- | --- | --- |
| 1 | **Build Tactical Intuition** | Short, rating-matched Sprints build fast pattern recognition. | A healthy Standard Sprint at 8 / 15, 2:42 remaining, and no mistakes. |
| 2 | **Choose the Best Move** | Arrow Duel trains you to reject a tempting blunder before you play it. | An untouched Arrow Duel position with exactly two neutral candidate arrows. |
| 3 | **Train Your Weaknesses** | Tactical Profiles turn repeated patterns into a focused Practice Run. | The real Focused Run preview for a Fork reliability recommendation, including the current-Rating anchor and training mix. |
| 4 | **Make Every Mistake Count** | Scheduled Review brings missed and unclear puzzles back when they are due. | Two of six reviews completed today, four remaining, no overdue warning, and a small forward workload. |
| 5 | **See What Is Improving** | Track theme-by-theme progress across weeks, not just one score. | The Pins completed-speed series improving from 1.30× to 1.06× matched time across eight weeks. |
| 6 | **Private. Offline. Open Source.** | No ads. No Chessticize account. No developer data collection. | The real Settings About rows for the GPL license, public source, embedded Stockfish, and puzzle-data attribution. |

The first three frames must remain in this order. Together they explain the
core product loop without relying on the App Store description: solve,
recognize the tempting alternative, then focus training where repeated play
shows an opportunity.

## Fictional User

All six frames represent one fictional, unnamed user. No real account,
rating, date, device name, or practice history may enter the capture.

- Fixed clock: `2026-07-28T18:00:00.000Z`
- Time zone: `America/Los_Angeles`
- Locale: `en-US`
- Standard Rating: `925`
- Arrow Duel Rating: `875`
- Recent activity: 18 completed Runs in eight weeks, 52 correct this week,
  and 41 correct in the previous week
- Tactical focus: Fork solve reliability, supported by seven different
  puzzles across three ordinary mixed sessions
- Focused Run: 15 puzzles in five minutes, with 10 Fork puzzles and 5 mixed
  controls, unrated and anchored to the current Standard Rating
- Review workload: 6 scheduled today, 2 completed, 4 remaining, 0 overdue,
  3 tomorrow, 8 in the next seven days, and 12 total
- Progress highlight: completed Pin puzzles improve from `1.30×` to `1.06×`
  matched expected time, with sample size increasing from 18 to 57

The active Standard and Arrow Duel frames are deterministic snapshots. They
must not be committed as completed sessions or allowed to change the History,
Review, Rating, or Tactical Profile state used by later frames.

## Product-State Contract

### 1. Standard Sprint

Capture the real active-session shell and chessboard after eight correct
solutions. The current puzzle is neutral, the puzzle timer is below its Slow
threshold, the Sprint has `2:42` remaining, and the mistake count is zero.
Do not show feedback, guidance, pause, timeout, abandon, or an onboarding
surface.

### 2. Arrow Duel

Capture the real active Arrow Duel board after four correct choices. Both
candidate arrows are visible and neutral. No candidate has been selected and
there is no red/green answer feedback. The current puzzle timer remains below
its Slow threshold.

### 3. Tactical Profile and Focused Run

Use the Puzzle solving lane and the real Focused Run preview reached from the
Tactical Profile. The title `Fork repair`, Rating `925`, and allocation
`10 Forks / 5 Mixed practice` connect the recommendation to an action without
inventing a new screen.

The current model is provisional. The product's `Early estimate` disclosure
must remain visible; the capture must not imply that the model has been
validated or hide an unavailable-inventory result.

### 4. Scheduled Review

Use the real Review queue with a calm daily workload. The top card reads
`2 / 6`, the primary action reads `Review 4`, and the forecast is populated.
There are no overdue items. The four remaining reviews include three Standard
items and one Arrow Duel item, so the queue reinforces the shared learning
loop without becoming a backlog.

### 5. Tactical Progress

Open the real History Progress destination and select Pins. The visible
eight-week series shows completed-puzzle speed improving at every checkpoint,
ending at `1.06×` matched expected time with `24% less overhead`.

The product's `Early estimate` disclosure remains visible. Do not pair this
positive frame with the clear-weakness or worsened variants.

### 6. Trust

Use the real Settings About section as the product proof. Crop from License
through Puzzle Data so the visible rows show the GPL license, public GitHub
source, embedded Stockfish, and puzzle attribution. Exclude the app-version
row so the asset does not become stale when reused.

The composition supplies the approved privacy line. Its claims are grounded
in [`docs/APP_PRIVACY_DISCLOSURE.md`](../APP_PRIVACY_DISCLOSURE.md): Chessticize
has no developer-operated account, ads, analytics, tracking, or automatic
support upload. Optional private iCloud Sync does not send progress to a
Chessticize-operated service. Issue #417 must re-audit these claims against
the exact submitted build.

## Automation Handoff

Issue #411 should:

1. load the fictional-user dataset through a test-only release-capture
   boundary;
2. assert the stable test IDs and text in the JSON contract before capture;
3. keep active-session snapshots from mutating the shared persisted story;
4. fail if a prohibited state is visible;
5. emit one raw full-resolution image per `captureId`, plus a manifest that
   preserves `order`, `copyKey`, locale, device family, source commit, and
   puzzle-pack identity; and
6. leave the existing negative-path and fifteen-scene QA suites unchanged.

Issue #412 should treat each headline and supporting line as final input, not
copy embedded in the raw capture. It may crop and position the product UI but
must not hide a material product disclosure, cover the board or candidate
arrows, or manufacture a state that the submitted build cannot render.

## Review Checklist

- Each frame communicates one benefit and uses the final copy above.
- The first three frames work as a standalone product explanation.
- Ratings, dates, Review counts, Profile evidence, and Progress samples belong
  to the same fictional user.
- Mistakes explain Review but do not dominate any raw frame.
- No real personal data, QA-only controls, debug UI, or stale version details
  appear.
- All visible product states are reachable in the current production UI.
- Marketing generation remains separate from release QA.
