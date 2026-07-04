# TestFlight QA Pass

This document is the 1.0 TestFlight release checklist and evidence log. It is
not complete until an App Store Connect build is distributed to an internal
tester group and the physical-device checklist below is executed.

Recheck Apple's live documentation before the pass:

- TestFlight overview:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
- Add internal testers:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers

## Scope

1. Upload one iOS build to App Store Connect from the exact public source commit
   that will be tagged per `docs/RELEASE_SOURCE_POLICY.md`.
2. Configure TestFlight test information, including the features to test and a
   feedback email or support path.
3. Create or reuse an internal testing group.
4. Add the build to that internal testing group.
5. Install the build from the TestFlight app on at least one physical iPhone.
6. Run the full checklist below on the physical device.
7. Record the result in the evidence log.

Do not count simulator-only testing as the TestFlight pass. Simulator and Detox
checks are preflight evidence; this milestone requires the installed TestFlight
binary on real hardware.

## App Store Connect Inputs

| Field | Value |
| --- | --- |
| Test group | `Internal 1.0 QA` |
| Beta app description | `Offline chess tactics trainer for Puzzle Sprint, Arrow Duel, mistake review, local ratings, and on-device Stockfish analysis.` |
| What to test | `Run a Standard sprint, run Arrow Duel, fail a sprint and review mistakes, verify History filters, complete a scheduled review, verify local data controls, relaunch the app, and test offline practice in airplane mode.` |
| Feedback path | `https://github.com/Chessticize/chessticize-mobile/issues` |

## Preflight Gates

Run these before uploading the build:

- [ ] `pnpm app-store:preflight`
- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm mobile:test`
- [ ] `pnpm mobile:typecheck`
- [ ] `pnpm mobile:doctor:ios`
- [ ] `pnpm mobile:e2e:build:ios`
- [ ] `DETOX_IOS_DEVICE="iPhone 17" pnpm mobile:e2e:test:ios`
- [ ] Confirm `apps/mobile/ios/ChessticizeMobile/Info.plist` still declares
      `ITSAppUsesNonExemptEncryption = false`.
- [ ] Confirm the Release Source Rule is satisfied for the uploaded commit.
- [ ] Confirm the build is not a Metro/debug build and no development puzzle
      source switch is visible.

## Physical Device Matrix

Record at least one physical iPhone before marking the pass complete.

| Device | iOS version | Apple ID role | Network state | Result |
| --- | --- | --- | --- | --- |
| TBD | TBD | Internal tester | Online and airplane mode | Pending |

## Manual QA Checklist

Each item must be run from the TestFlight-installed app. Record a note for every
failure, retry, or unclear result.

### Install And Launch

- [ ] Install the build from the TestFlight app.
- [ ] Launch without a Metro server or local development machine.
- [ ] Confirm app name, app icon, launch screen, portrait orientation, and safe
      area behavior.
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
- [ ] Select the weaker move on another puzzle and confirm the guided mistake
      line stays in review rather than jumping away.
- [ ] Confirm the Analysis panel can be opened from Arrow Duel review.

### Post-Sprint Mistake Review

- [ ] Finish or fail a sprint with mistakes.
- [ ] Tap Review and confirm it opens the current sprint's mistake set, not the
      general Review tab queue.
- [ ] Navigate previous/next within the mistake set.
- [ ] Reset the current puzzle to the puzzle initial position.
- [ ] Tap an analysis candidate row and confirm it makes the candidate move.
- [ ] Exit the post-sprint review and confirm the app returns to Practice ready
      to start another sprint.

### History

- [ ] Open History.
- [ ] Verify required time range and rating-key filters are visible.
- [ ] Filter to 7 days, 30 days, 90 days, 1 year, and Max.
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
- [ ] Complete the visible due queue without corrupting sprint ratings.

### Settings And Local Data

- [ ] Open Settings.
- [ ] Confirm Settings describes local-only data and does not present fake
      iCloud sync state.
- [ ] Change review reminder preference and confirm the UI persists after app
      relaunch.
- [ ] Use export local data and confirm the share/export flow opens.
- [ ] Reset ELO with confirmation and confirm the displayed rating changes.
- [ ] Delete local history with confirmation and confirm History/Review update.
- [ ] Open license/source information and confirm Stockfish 18 and the public
      source repository are shown.

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
- [ ] Disable airplane mode and confirm no required sync prompt appears.

## Evidence Log

Fill this table when the pass is executed. Keep evidence links in `scratch/`
while private; only commit sanitized screenshots or logs intentionally.

| Field | Value |
| --- | --- |
| Source commit | TBD |
| Release tag | TBD |
| App Store Connect build | TBD |
| TestFlight group | TBD |
| Physical device and iOS version | TBD |
| Tester | TBD |
| Started at | TBD |
| Completed at | TBD |
| Result | Pending |
| Blocking issues | TBD |
| Evidence location | `scratch/testflight-qa/` |

## Completion Rule

Milestone 5 item 7 is complete only when:

1. The uploaded build is tied to a public source commit and release tag.
2. App Store Connect shows the build available to the internal testing group.
3. At least one internal tester installs it through TestFlight on a physical
   iPhone.
4. Every checklist item above is passed or has an explicitly accepted
   release-blocker decision.
5. The evidence log is filled with the exact build, device, tester, result, and
   evidence location.
