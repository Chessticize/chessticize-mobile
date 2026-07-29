# App Store Screenshot Story

This document defines the approved issue #410 contract for Chessticize's
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
| 3 | **Focus Your Practice** | Choose themes, pace, and difficulty for the skill you want to train. | The real Custom Run editor with Fork and Pin selected, a five-minute duration, a 30-second pace, and a starting Rating of 925. |
| 4 | **Make Every Mistake Count** | Scheduled Review brings missed and unclear puzzles back when they are due. | Two of six reviews completed today, four remaining, no overdue warning, and a small forward workload. |
| 5 | **See Your Progress** | Follow your Ratings and recent Runs over time. | The real History Rating Trend for Standard at a 20-second pace over 90 days, ending at Rating 925 above recent attempt rows from Standard Runs. |
| 6 | **Private. Offline. Open Source.** | No ads. No Chessticize account. No developer data collection. | The real Settings About rows for the GPL license, public source, embedded Stockfish, and puzzle-data attribution. |

The first three frames must remain in this order. Together they explain the
core product loop without relying on the App Store description: solve,
recognize the tempting alternative, then choose the themes, pace, and
difficulty you want to practice.

## Device and Orientation Contract

The same six-frame story ships for both device families, with layouts composed
for the device rather than mechanically reused:

- iPhone uses a 6.9-inch portrait presentation as its primary marketing set.
- iPad uses a 13-inch landscape presentation as its primary marketing set.
- Every iPad raw capture must be taken while the real app is rendering its
  native responsive landscape layout. Do not rotate or crop a portrait capture,
  stretch it, or place a portrait phone-shaped UI inside a landscape canvas.
- Preserve the product's actual landscape information hierarchy, safe areas,
  board geometry, side panels, and visible controls. Composition may crop or
  position the raw image but may not invent a different app layout.
- The raw-capture manifest records device family, display group, orientation,
  pixel dimensions, source commit, and capture ID for every image.

Apple's screenshot specification, rechecked on 2026-07-28, accepts
`2752 x 2064` and `2732 x 2048` landscape images for the required 13-inch iPad
group. Issue #417 must recheck the
[live Apple specification](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
before upload.

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
- Custom Run: `Fork & Pin Focus`, using Regular Puzzles with Fork and Pin
  selected, a five-minute duration, 30 seconds per puzzle, and a starting
  Rating of `925`
- Review workload: 6 scheduled today, 2 completed, 4 remaining, 0 overdue,
  3 tomorrow, 8 in the next seven days, and 12 total
- Rating history: Standard at a 20-second pace over 90 days, with six
  non-monotonic checkpoints from `884` to the current Rating of `925`
- Recent History rows: three correct attempts from two Standard Runs, using
  bundled puzzles `01NVd`, `00ouR`, and `019YE`

The active Standard and Arrow Duel frames are deterministic snapshots. They
must not be committed as completed sessions or allowed to change the History,
Review, Rating, or saved Custom Run state used by later frames.

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

### 3. Custom Run

Use the real New Run editor reached from Practice. Set the name to
`Fork & Pin Focus`, choose Regular Puzzles, select Fork and Pin, set a
five-minute duration, 30 seconds per puzzle, and starting Rating `925`. The
visible pass rule is `Solve 10 before 5 min ends`.

This frame demonstrates deliberate user control. It must not show or imply a
model recommendation, inferred weakness, Tactical Profile, or automatic
personalization.

### 4. Scheduled Review

Use the real Review queue with a calm daily workload. The top card reads
`2 / 6`, the primary action reads `Review 4`, and the forecast is populated.
There are no overdue items. The four remaining reviews include three Standard
items and one Arrow Duel item, so the queue reinforces the shared learning
loop without becoming a backlog.

### 5. Rating and Run History

Open the real History screen, switch from Needs attention to All, expand the
filters, select `Standard · 20s pace`, and choose `90 days`. The visible Rating
Trend ends at `925`, and three ordinary attempt rows from the two most recent
Standard Runs remain visible beneath it. The latest row is puzzle `01NVd` at
Rating `918`, solved correctly at a 20-second pace in 12 seconds.

The history points include a small mid-period dip; do not manufacture a
perfect upward line. This frame must not use Tactical Progress, theme-strength
inference, or any model-derived improvement claim.

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
   preserves `order`, `copyKey`, locale, device family, display group,
   orientation, pixel dimensions, source commit, and puzzle-pack identity;
6. capture the iPhone set in portrait and the iPad set in the real native
   landscape layout; and
7. leave the existing negative-path and fifteen-scene QA suites unchanged.

Issue #412 should treat each headline and supporting line as final input, not
copy embedded in the raw capture. It may crop and position the product UI but
must not hide a material product disclosure, cover the board or candidate
arrows, or manufacture a state that the submitted build cannot render. Its
iPad templates are landscape-first and must not embed a portrait capture as
the main product proof.

## Review Checklist

- Each frame communicates one benefit and uses the final copy above.
- The first three frames work as a standalone product explanation.
- Ratings, dates, Review counts, Custom Run settings, and Rating history belong
  to the same fictional user.
- No frame depends on Tactical Profile, inferred weaknesses, or model-derived
  progress.
- Mistakes explain Review but do not dominate any raw frame.
- No real personal data, QA-only controls, debug UI, or stale version details
  appear.
- All visible product states are reachable in the current production UI.
- The iPad set uses the real 13-inch landscape layout for all six frames.
- Marketing generation remains separate from release QA.
