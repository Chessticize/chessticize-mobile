# Optional TestFlight Diagnostics

This document preserves an optional 1.3.5 TestFlight diagnostic checklist and
evidence log. It is not an App Store release gate. Exact-head fast checks,
risk-scoped simulator/Detox evidence, the signed archive, and App Store Connect
processing are sufficient to submit a build.

Recheck Apple's live documentation before the pass:

- Upload builds:
  https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- TestFlight overview:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
- Add internal testers:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers

## Optional Scope

1. Upload one iOS build to App Store Connect from the exact public source commit
   that will be tagged per `docs/RELEASE_SOURCE_POLICY.md`.
2. If a device-specific problem needs investigation, configure TestFlight test
   information and create or reuse an internal testing group.
3. Add the processed build to that group and install it on the relevant device.
4. Run only the checklist items that help diagnose the problem.
5. Record the optional result in the evidence log.

Do not treat TestFlight distribution or physical-device execution as a release
prerequisite. The release decision uses CI and simulator/Detox evidence selected
under `docs/TESTING_ARCHITECTURE.md`.

## App Store Connect Inputs

| Field | Value |
| --- | --- |
| Test group | `Internal 1.3.5 QA` |
| Beta app description | `Offline chess tactics trainer for Puzzle Sprint, Arrow Duel, mistake review, local ratings, and on-device Stockfish analysis.` |
| What to test | `Choose a wrong move in Arrow Duel Replay and verify guidance appears immediately without moving the chessboard.` |
| Feedback path | `https://github.com/Chessticize/chessticize-mobile/issues` |

## Preflight Gates

Run these before uploading the build:

- [ ] `pnpm app-store:preflight`
- [ ] `pnpm app-store:signing-readiness`
- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm mobile:test`
- [ ] `pnpm mobile:typecheck`
- [ ] Record the delta, targeted, or full release-validation scope. Require the
      affected Detox suite for targeted native risk and both suites only for
      broad native risk.
- [ ] Confirm `apps/mobile/ios/ChessticizeMobile/Info.plist` still declares
      `ITSAppUsesNonExemptEncryption = false`.
- [ ] Confirm the Release Source Rule is satisfied for the uploaded commit.
- [ ] Confirm the build is not a Metro/debug build and no development puzzle
      source switch is visible.
- [ ] For first launch, a new App Store version, screenshot/metadata changes,
      or broad native risk, generate an automatable evidence bundle:
      `pnpm app-store:testflight-evidence -- --screenshot-root scratch/store-assets/final`
      after the final screenshot export is present. Use `-- --allow-dirty`
      only for local rehearsal, never for submitted-binary evidence.
- [ ] Follow `docs/APP_STORE_UPLOAD.md` to create the Release archive and upload
      it with `apps/mobile/ios/ExportOptions.app-store-connect.plist`.

## Optional Physical Device Matrix

Fill this matrix only when investigating a device-specific concern. It is not
required for a delta, first launch, adaptive-layout change, or broad native
risk.

| Device | iOS version | Apple ID role | Network state | Result |
| --- | --- | --- | --- | --- |
| TBD iPhone | TBD | Internal tester | Online and airplane mode | Pending |
| TBD iPad | TBD | Internal tester | Online and airplane mode | Pending |

## Optional Manual QA Checklist

Select only items relevant to the diagnostic question and run them from the
TestFlight-installed app. Record a note for every failure, retry, or unclear
result. Unchecked items do not block App Store submission.

### Install And Launch

- [ ] Install the build from the TestFlight app.
- [ ] Launch without a Metro server or local development machine.
- [ ] Confirm app name, app icon, launch screen, the portrait lock on a
      full-screen iPhone, and safe-area behavior.
- [ ] On iPad, confirm portrait, landscape, and a resized multitasking window
      without assuming that every wide window identifies as an iPad.
- [ ] Confirm the app opens without a network account or sign-in requirement.

### Standard Sprint

- [ ] Start a Standard sprint from Practice.
- [ ] Confirm the board renders pieces, coordinates, legal move indicators,
      timer, progress, and Mistakes counter.
- [ ] Make at least one correct move and confirm green move feedback.
- [ ] Make at least one incorrect move and confirm red feedback before the next
      transition.
- [ ] Fail a sprint after three mistakes and confirm Review is the primary
      action while Play Again remains available.
- [ ] Use Play Again and confirm a new sprint starts cleanly.

### Arrow Duel

- [ ] Start Arrow Duel.
- [ ] Confirm exactly two arrows render with the shared arrow style.
- [ ] Select the better move and confirm correct feedback.
- [ ] With Opponent reply on, confirm the full-board `What if…` preparation is
      shown for 1.5 seconds, the board does not flip, and the reply countdown
      begins only when the opponent pieces can be moved.
- [ ] Select the weaker move on another puzzle and confirm the guided mistake
      line stays in review rather than jumping away.
- [ ] Confirm the Analysis panel can be opened from Arrow Duel review.

### Post-Sprint Mistake Review

- [ ] Finish or fail a sprint with mistakes.
- [ ] Tap Review and confirm it opens the current sprint's mistake set, not the
      general Review tab queue.
- [ ] Navigate previous/next within the mistake set.
- [ ] Reset the current puzzle to the puzzle initial position.
- [ ] For an Arrow Duel Run with Opponent reply on, confirm Replay has no reply
      countdown and does not show `Solved` until the reply and complete stored
      puzzle line have been played.
- [ ] Turn Opponent reply off and confirm Replay returns to the one-choice flow.
- [ ] Tap an analysis candidate row and confirm it makes the candidate move.
- [ ] Exit the post-sprint review and confirm the app returns to Practice ready
      to start another sprint.

### History

- [ ] Open History.
- [ ] Verify History defaults to All Puzzles with top-level rating-key filters
      visible.
- [ ] Filter to 7 days, 30 days, 90 days, 1 year, and Max.
- [ ] Select a specific rating-key bucket and confirm the rating trend appears.
- [ ] Toggle wrong-only filtering and confirm rows update.
- [ ] Open a History row into Analysis Review.
- [ ] Confirm the performance summary reflects the selected time range.

### Scheduled Review

- [ ] Create at least one due review item from a sprint mistake.
- [ ] Open Review and start the due queue.
- [ ] Answer a Standard review puzzle correctly and confirm the next review date
      advances.
- [ ] Answer a review puzzle incorrectly and confirm a Continue affordance is
      shown.
- [ ] For an Arrow Duel Run with Opponent reply on, confirm Review asks for the
      reply with the Run's configured countdown; verify the countdown starts
      after the 1.5-second handoff and that a wrong reply or timeout fails the
      Review.
- [ ] Turn Opponent reply off and confirm Arrow Duel Review returns to the
      one-choice flow.
- [ ] Complete the visible due queue without corrupting sprint ratings.

### Settings

- [ ] Open Settings.
- [ ] Confirm Settings shows iCloud Sync, Notifications, Profile, and About
      sections, with iCloud Sync defaulting on.
- [ ] While signed into iCloud, confirm the default sync state reaches a
      successful sync status or exposes the real account error.
- [ ] On a second Apple device signed into the same iCloud account, confirm the
      default enabled sync imports rating, History, and Review queue data
      without deleting local-only progress.
- [ ] Turn iCloud Sync off and confirm practice still works offline.
- [ ] Change review reminder preference and confirm the UI persists after app
      relaunch.
- [ ] Open About links and confirm License, Source, Stockfish, Puzzle Data, and
      Support email targets open the expected destinations.

### Persistence And Relaunch

- [ ] Complete a sprint attempt that changes rating, history, and review queue.
- [ ] Kill the app from the app switcher.
- [ ] Relaunch from the home screen.
- [ ] Confirm rating, History rows, Review queue, settings, and custom sprint
      config survived relaunch.

### Offline Practice

- [ ] Enable airplane mode.
- [ ] Launch the app from a cold start.
- [ ] Start and complete a Standard sprint using bundled puzzles.
- [ ] Start Arrow Duel and confirm candidate arrows still render.
- [ ] Open a review/history analysis surface and confirm on-device Stockfish
      analysis works without network.
- [ ] Disable airplane mode and confirm iCloud Sync remains user controlled.

## Evidence Log

Fill this table when the pass is executed. Keep evidence links in `scratch/`
while private; only commit sanitized screenshots or logs intentionally.

Current source release candidate:

- Source commit: the commit pointed to by the `ios-v1.3.5-build-2` tag
- Release tag:
  [`ios-v1.3.5-build-2`](https://github.com/Chessticize/chessticize-mobile/releases/tag/ios-v1.3.5-build-2)
- Rule: upload only a binary archived from the exact commit pointed to by this
  tag. If any source, dependency, puzzle, native, or notice file changes before
  upload, regenerate the release manifest and publish a new tag/release for the
  submitted binary.

| Field | Value |
| --- | --- |
| Source commit | Tag target for `ios-v1.3.5-build-2` |
| Release tag | `ios-v1.3.5-build-2` |
| App Store Connect build | TBD |
| TestFlight group | TBD |
| Optional physical device and iOS version | Not run |
| Tester | TBD |
| Started at | TBD |
| Completed at | TBD |
| Result | Pending |
| Blocking issues | TBD |
| Evidence location | `scratch/testflight-qa/` |

## Automatable Evidence Bundle

Run this after final screenshots are exported and before uploading the candidate
build:

```sh
pnpm app-store:testflight-evidence -- --screenshot-root scratch/store-assets/final
```

The command writes a timestamped folder under `scratch/testflight-qa/` with:

- `preflight.json`
- `third-party-audit.json`
- `release-manifest.json`
- `screenshot-audit.json`
- `summary.json`

The bundle is local evidence for repository-controlled gates. App Store Connect
upload and processing still happen externally, but TestFlight distribution,
physical-device installation, and the optional checklist above are not required
before submission.

## Archive And Upload

Follow `docs/APP_STORE_UPLOAD.md` for the owner-executed archive and upload
step. The 1.3.5 upload path uses `xcodebuild archive`, then
`xcodebuild -exportArchive` with
`apps/mobile/ios/ExportOptions.app-store-connect.plist`. Do not count this step
as complete until App Store Connect finishes processing the uploaded build.

## Release Rule

The App Store release may proceed when:

1. The uploaded build is tied to a public source commit and release tag.
2. Exact-head fast checks and the selected simulator/Detox scope pass.
3. The signed archive passes repository checks and App Store Connect processing.
4. Required store metadata and release notes are complete.

The optional diagnostic pass is complete when its selected checklist items and
evidence log are filled. Its absence does not block submission.
