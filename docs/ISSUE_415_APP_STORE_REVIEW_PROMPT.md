# Issue 415 In-App Review Request

This document records the approved product contract for issue
[#415](https://github.com/Chessticize/chessticize-mobile/issues/415). The
Interaction Lab scenario remains the reviewable design reference for the
production review-request wiring.

## Product decision

The in-app review prompt uses a positive puzzle milestone:

- the current result is a positive completed puzzle session:
  - a won Standard, Blitz, Arrow Duel, or Custom Sprint (rated or unrated),
  - a completed Focused Run with at least 60% accuracy (`correct >= 1` and
    `correct / (correct + mistakes) >= 0.6`), or
  - a completed Survival Run that either solved at least 10 puzzles or cleared
    the band's eligible pool;
- the user has reached at least **2** positive completed sessions across at
  least **2** distinct local calendar dates, **or** at least **3** positive
  completed sessions (including on a single date);
- the completed result screen has remained stable for **1 second**;
- no guide, confirmation, analysis, other modal, or active puzzle timer is
  present.

The app must not request a review after a failed Sprint, wrong move, timeout,
abandon action, low-accuracy Focused Run, low-score Survival Run, error, crash
recovery, first launch, onboarding, or an in-progress puzzle. Navigating away,
backgrounding the app while on the result screen, or presenting another modal
during the one-second idle window cancels that request attempt. Backgrounding
mid-sprint to pause and resume later does not disqualify that session if the
player returns and wins it. The delay lets the completed result settle before
any platform-owned sheet can take focus, while preserving a clear cancellation
window for a user who moves on immediately.

## Native boundary

Chessticize calls the supported platform review API: StoreKit on iOS and Google
Play In-App Review on Android. It must not show a custom pre-prompt, ask whether
the user likes the app, or condition the native request on a favorable answer.
The platform owns the rating sheet and may choose not to display it.

The puzzle result remains complete and usable whether or not the system sheet
appears. Play Again, Done, History, and other result actions do not wait for a
rating and do not depend on the sheet's outcome.

The Interaction Lab therefore shows the real successful puzzle Sprint Result
and marks the platform exit as a native boundary. It deliberately does not
imitate a platform system sheet in browser UI.

Stable story:

`Practice / App Store review request · eligible puzzle milestone`

## Local eligibility and cooldown

Production derives successful Sprint counts and distinct local dates from
existing on-device history. It adds only the local suppression state needed
for respectful request attempts:

- the app version for the last platform review request attempt;
- the local timestamp of that attempt.

An eligible request requires at least 30 elapsed days since the previous
request attempt (platform APIs enforce their own additional per-version and
annual display quotas). The app records an attempt when it invokes the platform
flow because neither platform guarantees that a sheet appears.
No new account, server event, analytics event, or personal-data collection is
needed.

## Production test contract

The implementation phase must cover:

- the second positive completed session across a second local date becomes
  eligible;
- the third positive completed session on a single local date becomes eligible;
- one positive session or two on a single local date remains ineligible;
- unrated Custom Sprints, high-accuracy Focused Runs (≥ 60%), and strong
  Survival Runs (≥ 10 solved or pool cleared) are eligible;
- failed, timed-out, abandoned, low-accuracy Focused, low-score Survival,
  onboarding, and active-modal states remain suppressed;
- the 30-day cooldown gate remains suppressed before 30 days and re-opens after
  30 days;
- the one-second request is cancelled by navigation, backgrounding on the
  result screen, or a new modal, while backgrounding mid-sprint does not cancel
  a later win;
- an attempted request that produces no system sheet does not block or change
  the result flow;
- eligibility remains local and creates no analytics or network dependency.

## Android implementation and test boundary

Android uses Google Play In-App Review `com.google.android.play:review:2.0.2`.
It requests `ReviewInfo` only after the result is stable, then launches the
flow with the resumed activity. If preparation fails, the activity changes, or
the app backgrounds before launch, the request resolves as unavailable and the
result remains unaffected. A launched flow resolves as attempted even when
Google does not show a sheet; the API does not reveal display or submission.

The native integration test uses Google's `FakeReviewManager` only to verify
the API boundary. That fake does not render a dialog. A visible Android rating
sheet needs an install obtained through an internal test track or internal app
sharing on a device with a working Play Store; internal app sharing disables
review submission. The Google Play Core SDK is subject to its
[SDK terms](https://developer.android.com/guide/playcore/license) in addition
to the Google APIs Terms of Service.

## Opt-in native milestone capture

After building the selected platform's Detox app, run the dedicated acceptance
journey from the repository root:

```sh
pnpm --filter ChessticizeMobile exec detox test --configuration ios.sim.debug --config e2e/app-review-request.config.js
pnpm --filter ChessticizeMobile exec detox test --configuration android.attached.e2e --config e2e/app-review-request.config.js
```

Select the dedicated simulator with the normal `DETOX_IOS_DEVICE`,
`DETOX_IOS_DEVICE_UDID`, or `DETOX_ANDROID_DEVICE` variables. The journey uses
the existing test-only one-puzzle Sprint and clock controls. It completes
one Sprint on the first local date and a second on the next, retaining the
production review eligibility and one-second delay. It captures the default
Practice screen and each successful result. A passing journey proves those
public UI steps; inspect the final screenshot separately to determine whether
the platform actually displayed its rating sheet. No fake review dialog is
shown, and the journey remains outside the ordinary E2E suites.

## Platform references

- [Requesting App Store reviews](https://developer.apple.com/documentation/StoreKit/requesting-app-store-reviews)
- [Human Interface Guidelines: Ratings and reviews](https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews)
- [App Review Guidelines, section 5.6.1](https://developer.apple.com/app-store/review/guidelines/)
- [`AppStore.requestReview(in:)`](https://developer.apple.com/documentation/storekit/appstore/requestreview%28in%3A%29-1q8qs/)
- [Google Play In-App Review integration](https://developer.android.com/guide/playcore/in-app-review/kotlin-java)
- [Google Play In-App Review testing](https://developer.android.com/guide/playcore/in-app-review/test)
