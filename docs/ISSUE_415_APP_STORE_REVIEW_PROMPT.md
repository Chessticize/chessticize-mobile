# Issue 415 App Store Review Request

This document records the approved product contract for issue
[#415](https://github.com/Chessticize/chessticize-mobile/issues/415). The
Interaction Lab scenario remains the reviewable design reference for the
production review-request wiring.

## Product decision

Version 1 uses a concrete puzzle milestone:

- the current result is a successful rated puzzle Sprint;
- the user has successfully completed at least four rated puzzle Sprints;
- those successful Sprints span at least two local calendar dates;
- the successful result screen has remained stable for two seconds;
- no guide, confirmation, analysis, other modal, or active puzzle timer is
  present.

Standard, Arrow Duel, and user-controlled Custom Sprints may count. Focused Runs
do not participate in this first trigger, so review eligibility does not depend
on personalized weakness detection.

The app must not request a review after a failed Sprint, wrong move, timeout,
abandon action, error, crash recovery, first launch, onboarding, or an
in-progress puzzle. Navigating away, backgrounding the app, or presenting
another modal during the two-second idle window cancels that request attempt.

## Native boundary

Chessticize must call Apple's supported StoreKit review-request API. It must not
show a custom pre-prompt, ask whether the user likes the app, or condition the
native request on a favorable answer. Apple's system owns the rating sheet and
may choose not to display it.

The puzzle result remains complete and usable whether or not the system sheet
appears. Play Again, Done, History, and other result actions do not wait for a
rating and do not depend on the sheet's outcome.

The Interaction Lab therefore shows the real successful puzzle Sprint Result
and marks the StoreKit exit as a native boundary. It deliberately does not
imitate Apple's system sheet in browser UI.

Stable story:

`Practice / App Store review request · eligible puzzle milestone`

## Local eligibility and cooldown

Production derives successful Sprint counts and distinct local dates from
existing on-device history. It adds only the local suppression state needed
for respectful request attempts:

- the app version for the last StoreKit request attempt;
- the local timestamp of that attempt.

An eligible request requires both a different app version and at least 120
elapsed days since the previous request attempt. The app records an attempt
when it calls StoreKit because StoreKit does not guarantee that a sheet appears.
No new account, server event, analytics event, or personal-data collection is
needed.

## Production test contract

The implementation phase must cover:

- the fourth successful rated puzzle Sprint across a second local date becomes
  eligible;
- fewer than four successful Sprints remains ineligible;
- four successes on one local date remains ineligible;
- failed, timed-out, abandoned, onboarding, and active-modal states remain
  suppressed;
- same-version and 120-day cooldown gates remain suppressed;
- the two-second request is cancelled by navigation, backgrounding, or a new
  modal;
- an attempted request that produces no system sheet does not block or change
  the result flow;
- eligibility remains local and creates no analytics or network dependency.

## Apple references

- [Requesting App Store reviews](https://developer.apple.com/documentation/StoreKit/requesting-app-store-reviews)
- [Human Interface Guidelines: Ratings and reviews](https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews)
- [App Review Guidelines, section 5.6.1](https://developer.apple.com/app-store/review/guidelines/)
- [`AppStore.requestReview(in:)`](https://developer.apple.com/documentation/storekit/appstore/requestreview%28in%3A%29-1q8qs/)
