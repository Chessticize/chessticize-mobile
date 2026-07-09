# App Store Readiness Plan

Status date: 2026-07-03. This is the active goal document. The V1 behavioral
work (2026-07-03) made every visible surface real within the v1 scope; a
same-day audit of the merged result found the foundation gaps below. The goal:
**ship Chessticize Mobile 1.0 to the App Store** — a truthful, durable,
local-first training app.

`docs/ui-design/MOBILE_UI_DESIGN.md` remains authoritative for screen behavior.
Work milestone-by-milestone; within a milestone, one draft feature PR per
numbered item per `AGENTS.md > Branch And PR Workflow`.

## Milestone 1 — Real local persistence (blocks everything)

Status: complete. The mobile app now uses a device SQLite adapter behind the
existing `PracticeStore` interface, persistence survives relaunch in Detox, the
dev puzzle-source switch scopes selection without replacing the service, and
settings state is persisted through the same backend boundary.

1. Add a device SQLite adapter (e.g. `op-sqlite` or `expo-sqlite`) implementing
   the existing `PracticeStore` interface, sharing the schema and the shared
   store behavior tests with `SqliteStore`. Wire the mobile backend to it;
   keep `MemoryStore` as the test fake it already is.
2. Persistence must survive app relaunch (E2E: relaunch and assert history,
   rating, review queue, and custom configs are intact).
3. Do not recreate the service when the dev puzzle-source switch changes
   (currently a `useMemo` on `puzzleSource` wipes state even in dev).
4. Persist real settings state, such as notification preferences, rather than
   `useState`-only.

## Milestone 2 — Honest sync story (App Review risk)

Status: implementation complete, device validation required. The shipped
Settings screen exposes real user-controllable iCloud Sync backed by a CloudKit
private database snapshot, not a fabricated status surface. The app does not expose
incomplete local export/delete controls, and the sync setting defaults on while
remaining user-controllable.

1. Remove the earlier simulated iCloud state: no upload approval prompt and no
   fabricated "last synced" timestamp.
   Status: complete. The Settings UI now shows only the real sync switch,
   current sync status, and a manual Sync Now action.
2. Implement real progress sync: storage import/merge, `ProgressSyncTransport`
   with a maintained fake, CloudKit adapter + entitlement, domain merge engine,
   and truthful UI state.
   Status: complete. Ratings, history, review queue, and sprint session exports
   merge through the storage boundary before the merged snapshot is written back
   to private iCloud.
3. Before App Store submission, validate on at least two Apple devices signed
   into the same iCloud account. Confirm the default enabled sync uploads a
   snapshot on one device and imports the first device's rating/history/review
   queue on the second device without deleting local-only progress.

## Milestone 3 — Functional fixes from the 2026-07-03 audit

History:

1. Rating trend chart inputs aggregate only the current 20-row page
   (`buildHistoryView` builds `puzzleStats` from the paged slice; the chart
   further takes `.slice(-8)`). Compute the rating trend series in the domain
   over the full filtered range, not the page.
   Status: complete. `HistoryView.performance` is computed in the core domain
   from the full filtered range before paging. The mobile History screen now
   defaults to all puzzle attempts and renders a rating trend only after a
   rating bucket is selected, while `HistoryView.attempts` remains the paged row
   slice.
2. Mode and sprint-speed filters are degenerate: the history view is scoped to
   one `ratingKey`, which already encodes mode and speed, so other mode/speed
   chips silently return empty pages. Either make the history view span rating
   keys with real cross-key filters, or remove the dead chips and present the
   rating-key bucket honestly.
   Status: complete. The 1.0 History screen defaults to all rating-key buckets,
   exposes the bucket selector at the top level for quick sprint-type focus,
   and removes separate History mode/speed chips that could only narrow a
   selected bucket into empty or redundant states.
3. The History wrong-only shortcut must not force-reset the active time range
   and must not change the rating trend chart.
   Status: complete. The front-page shortcut toggles only the wrong-result row
   filter. History shows the rating trend only after a rating bucket is
   selected, and that series intentionally ignores the correct/wrong result
   filter while still respecting time range, rating bucket, source, side, theme,
   rating range, and review status.
4. Row review-queue membership matches by `puzzleId` only while the
   review-status filter matches `puzzleId + mode + ratingKey`; a row can show a
   due date from another mode's queue entry. Unify on the keyed match.
   Status: complete. History puzzle stats, row lookup, and the review-status
   filter now all use the same `puzzleId + mode + ratingKey` key, so queue
   labels and difficulty badges cannot leak across sprint modes or rating
   buckets for the same puzzle.
5. Review-source rows render 0s elapsed (`startedAt` defaults to
   `completedAt`). Record real elapsed time for scheduled review attempts.
   Status: complete. Official scheduled-review attempts now pass the measured
   review start timestamp into the backend, use one completion timestamp for
   storage and UI refresh, and advance the app-shell clock before rebuilding
   History so review rows render the real elapsed duration immediately.

Review queue:

6. `lapseCount` never resets, and every queue item is born from a mistake with
   `lapseCount ≥ 1`, so every item classifies as "Hard" forever and the
   "Failed again" filter matches everything. Distinguish the original sprint
   miss from review-time lapses (e.g. start at 0, increment only on failed
   scheduled reviews, decay on success) so Easy/Medium/Hard and Failed-again
   are meaningful.
   Status: complete. Sprint mistakes now create or refresh queue rows with
   `lapseCount = 0` and do not count as review-time lapses. Failed Scheduled
   Review attempts increment lapses, successful Scheduled Review attempts decay
   lapses toward zero, first due reviews classify as Medium, and "Failed
   again" filters only review-time lapses.
7. "Overdue" is computed as `dueAt <= now` — identical to "due" — everywhere
   (badge, summary, filter). Define overdue as meaningfully late (e.g. > 24h
   past due) and use it consistently.
   Status: complete. Review due state is now a core-tested rule: a queue item
   is due at `dueAt`, but it becomes overdue only when it is more than 24 hours
   past `dueAt`. The Practice badge, Review summary, Overdue filter,
   difficulty details, and queue row due labels all use that shared definition.
8. A Standard or legacy Blitz review timeout or unsolvable position dead-ends: the wrong
   result is recorded but no Continue affordance appears (that exists only on
   the Arrow Duel path). Show the solution or a Continue button after a
   recorded wrong, mirroring the Arrow Duel flow.
   Status: complete. Standard and legacy Blitz due reviews now enter a post-wrong state
   after either an incorrect move or timeout: the official wrong result is
   recorded once, board puzzle gestures are disabled, Analysis remains
   available, and the same Continue affordance used by Arrow Duel advances to
   the next due item.
9. "Start Review" only starts the first context group and silently leaves the
   rest of a mixed queue due. Chain groups in sequence (or make grouped starts
   explicit in the default view).
   Status: complete. The default Start Review action now queues every visible
   due context group and advances into the next group when the current group
   exits. Expanded per-group and per-item starts remain explicit single-group
   starts.
10. Orphaned queue entries (puzzle no longer resolvable) are hidden from the
    due list but linger in `review_queue` and inflate `totalCount`. Clean them
    up.
    Status: complete. `PracticeService` now exposes a store-level cleanup for
    orphaned review queue rows, and the Review tab runs it before computing due
    items and total queue counts. Memory and SQLite stores share the same
    behavior, so missing local puzzles are removed rather than hidden-only.

Arrow Duel / analysis:

11. Candidate order is seeded per live session but not stored with the attempt;
    review reconstruction uses a default seed, so replayed candidate order can differ
    from what the user actually saw. Persist the order (or seed) on the attempt
    and reuse it in review (spec requires stored-with-attempt).
    Status: complete. Arrow Duel attempts now persist the displayed candidate
    order in MemoryStore and SQLite, including scheduled-review attempts.
    History and post-sprint review reconstruction pass that stored order back
    into the Arrow Duel domain state, with SQLite migration coverage for
    existing `attempts` tables.
12. The Analysis panel's candidate list is empty at checkmate; the `1-0`/`0-1`
    terminal line exists but only renders on the guided review path. Inject it
    into the Analysis list too.
    Status: complete. Terminal positions now produce a domain-level
    current-position analysis row, so the Analysis panel shows `1-0`/`0-1`
    checkmate instead of an empty candidate list.
13. The session loading skeleton toggles on/off synchronously and never paints.
    Either defer heavy start work a frame or drop the dead code.
    Status: complete. The unreachable loading skeleton state, component, and
    styles were removed; sprint start/resume stays immediate and covered by the
    Practice screen component test.

Scheduler polish (low priority):

14. First correct review jumps 1d → 3d because `successStreak` indexes past the
    24h rung; confirm intended or shift the index.
    Status: complete. Successful scheduled reviews now keep `successStreak` as
    a 1-based persisted count but use it as a 0-based interval index, so the
    first correct review schedules 24h and the second schedules 72h.
15. Next-due dates render as UTC calendar days; use local-time formatting.
    Status: complete. Review and history due-date labels now use a shared local
    calendar formatter instead of slicing UTC ISO strings, with a timezone
    regression test covering the previous off-by-one-day case.

## Milestone 4 — Review reminder notifications

Design approved 2026-07-03; the "Review Reminder Notifications" section of
`MOBILE_UI_DESIGN.md` is the spec. Implementation steps, in order:

1. Domain: a pure `computeNextReminder(queue, usageHistory, settings, now)`
   function in `packages/core` returning the next reminder (local time, due
   count, copy) or none — smart default time from the median session-start
   hour over the trailing 14 days (minimum 5 sessions), fallback 19:00 local;
   at most one per day; none when zero items will be due. Unit-test the
   histogram, fallback, and zero-due cases first.
   Status: complete. `packages/core` now exposes `computeNextReminder` as a
   pure domain decision with smart, fixed, and off settings; it projects the
   next local reminder time with a due count and Review-tab copy, and unit
   tests cover smart history, same-session deduplication, fallback, future due
   projection, disabled reminders, zero-due suppression, and validation.
2. Settings persistence for the reminder preference (smart / fixed time / off)
   — depends on Milestone 1.
   Status: complete. The storage boundary now exposes a typed persisted review
   reminder preference API for smart, fixed local time, and off states; the
   service maps it to the core scheduler settings, validates fixed `HH:mm`
   local times, clears stale fixed times when switching modes, and MemoryStore
   plus SQLite tests cover persistence and SQLite reopen behavior.
3. A `ReminderScheduler` interface with a maintained fake; the real adapter
   wraps `UNUserNotificationCenter` (local notifications only, no push
   entitlement). Re-schedule on queue change and on app background.
   Status: complete. The mobile backend now exposes a `ReviewReminderScheduler`
   port with a maintained fake, a native iOS adapter backed by
   `UNUserNotificationCenter`, and app-shell orchestration that replaces the
   pending local review reminder when the queue/settings decision changes and
   when the app backgrounds. Permission prompts remain deferred to the
   contextual UI step.
4. UI: Notifications section in Settings; contextual permission ask after the
   first completed review session; denied state links to system settings and
   never re-prompts. Tapping the notification opens the Review tab.
   Status: complete. Settings now has a Notifications section for smart,
   fixed-time, and off reminder preferences; the app asks for notification
   permission only after the first completed scheduled review session, keeps
   denied users on an iOS Settings link, and routes review reminder taps to the
   Review tab through a native/fake notification client port.
5. E2E/component coverage via the fake scheduler (flow 9 in Milestone 6).
   Status: component coverage added for the Settings controls, permission
   prompt, denied-state Settings link, scheduler rescheduling, and notification
   route navigation. Full Detox flow coverage remains part of Milestone 6.

## Milestone 5 — App Store submission requirements

1. **Licensing (decided 2026-07-03, execute the checklist).** Owner decision:
   keep Stockfish embedded and ship the whole app as plain GPL-3.0-or-later
   with the public repo as the published source (the Lichess route); the
   residual App Store/GPL tension and the permanently-public source are
   accepted; no App Store license exception. Execution checklist, which is the
   LICENSE file's own release gate:
   - Replace the LICENSE stub with the complete GPLv3 license text
     (SPDX GPL-3.0-or-later).
   - Add a THIRD_PARTY_NOTICES file covering Stockfish (GPLv3, Stockfish
     authors, the exact version/commit built, link to its source), the Lichess
     puzzle database (CC0), the chessboard library, and React Native
     dependency notices.
   - Update the in-app Settings license row to name the shipped Stockfish
     version, state GPL-3.0-or-later, and link to the public repository as the
     source offer.
   - Tag a repository release for every binary submitted to App Store Connect
     so published source always matches the shipped build; document this rule
     in the README.
   Status: implementation complete. `LICENSE` now contains the full GPLv3 text
   with SPDX GPL-3.0-or-later, `THIRD_PARTY_NOTICES.md` records Stockfish 18,
   the upstream `sf_18` tag commit, Lichess puzzle data, the chessboard
   package, and React Native runtime dependency notices, the Settings license
   row names Stockfish 18 and the public source repository, and the README
   links the release source policy. `pnpm app-store:third-party-audit`
   machine-checks the notice inventory against the final lockfile, bundled
   Stockfish/NNUE artifacts, and Lichess puzzle manifest. Release-time
   execution still requires running that audit from the final submitted
   lockfile and manually reading the notices for license correctness. The
   current build-1 source release has been published as
   `ios-v1.0.0-build-1` from commit
   `380f73c70a916d6494609fce8f334ef4f4094626`; use that tag only for an App
   Store Connect binary archived from that exact commit, otherwise create a new
   tag and release for the submitted binary.
2. **App identity**: final display name, bundle identifier, version/build
   scheme, app icon set (all slots), launch screen matching the app background.
   Status: implementation complete. The iOS target now uses the display name
   `Chessticize`, bundle identifier `com.chessticize.mobile`, marketing
   version `1.0`, build `1`, a complete iPhone/iPad/marketing AppIcon catalog,
   and a launch screen using the app background `#F8FAFC` instead of the React
   Native template copy.
3. **Privacy**: App Privacy questionnaire answers (Data Not Collected / no
   tracking while iCloud Sync stores data only in the user's private
   Apple iCloud account), a privacy policy URL, `PrivacyInfo.xcprivacy` privacy
   manifest (required-reason APIs from RN and SQLite deps),
   `ITSAppUsesNonExemptEncryption = false` in Info.plist.
   Status: implementation complete. `docs/APP_PRIVACY_DISCLOSURE.md` records
   the 1.0 App Store Connect answer as Data Not Collected / no tracking, points
   the privacy policy URL to the public repository document, documents optional
   private iCloud Sync, and captures the release re-audit gate.
   `docs/PRIVACY_POLICY.md` is the public policy.
   `PrivacyInfo.xcprivacy` declares no tracking and no collected data while
   preserving the required-reason API entries currently needed by React Native
   and SQLite dependencies. `Info.plist` sets
   `ITSAppUsesNonExemptEncryption = false` and no longer declares an unused
   location permission string.
4. **Release configuration**: dev-only puzzle-source switch verified hidden in
   release (already gated on `__DEV__`), LogBox suppression acceptable, no
   debug menus reachable, Metro not required.
   Status: implementation complete. Release gating now lives in
   `apps/mobile/src/releaseConfig.ts`, so test-only puzzle source controls,
   Stockfish diagnostics, and debug tracing are behind explicit development or
   test-harness flags. `App.tsx` suppresses LogBox only in React Native
   development builds, not production-like module loads. The release
   configuration tests verify that the puzzle-source switch is hidden with
   `__DEV__ = false`, can still be enabled by the Jest harness, and does not
   require Metro or a debug menu surface in app code.
5. **Device targets**: decide iPhone-only vs iPad support
   (`TARGETED_DEVICE_FAMILY`), adaptive orientation masks, minimum iOS version;
   verify layout on iPhone SE-size, current-flagship portrait/landscape, and
   iPad portrait/landscape simulators (design doc QA rule).
   Status: implementation complete. `docs/DEVICE_TARGETS.md` records the 1.0
   decision to ship iPhone+iPad adaptive orientation support, with minimum iOS
   15.1. The iOS target now uses `TARGETED_DEVICE_FAMILY = "1,2"`,
   `Info.plist` declares iPhone portrait/landscape and iPad all-orientation
   masks without `UIRequiresFullScreen`, and mobile tests cover both the native
   target metadata and compact portrait, compact landscape phone, iPad, and
   split-width layout smoke renders.
6. **Store assets**: screenshots (6.7" and 6.1" minimum), description,
   keywords, support URL.
   Status: implementation complete. `docs/STORE_ASSETS.md` now records the
   1.0 App Store Connect metadata draft, including description, subtitle,
   promotional text, keywords, support URL, privacy policy URL, category
   choices, screenshot scenes, capture checklist, and the current Apple
   screenshot-spec source of truth. The committed validation test enforces the
   metadata character/byte limits and required public URLs.
   `pnpm app-store:screenshot-audit` verifies the final local screenshot export
   contains the required 6.9-inch and 6.1-inch scene sets at accepted Apple
   portrait dimensions. Release-time execution still requires final sanitized
   screenshots from a release or production-like build before uploading to App
   Store Connect.
7. **TestFlight pass**: internal build, manual QA checklist covering the E2E
   flow list below on a physical device, including kill-and-relaunch
   persistence and offline (airplane-mode) practice.
   Status: repo preparation complete; external execution pending.
   `docs/TESTFLIGHT_QA.md` now defines the TestFlight setup inputs, preflight
   gates, physical-device matrix, manual QA checklist, evidence log, and
   completion rule. The actual pass still requires an App Store Connect upload,
   an internal TestFlight group, a physical iPhone install through TestFlight,
   and a filled evidence log before this item can be marked complete. The
   current source release tag is
   `ios-v1.0.0-build-1`
   (`380f73c70a916d6494609fce8f334ef4f4094626`), so the uploaded build must be
   archived from that exact commit or the source release must be regenerated.
   The repo now also exposes `pnpm app-store:preflight`, which machine-checks the
   automatable release artifacts and reports the manual release gates that
   cannot be completed from the repository. `pnpm app-store:testflight-evidence`
   collects the automatable preflight, notice-audit, local signing-readiness,
   release-manifest, and final screenshot-audit outputs under
   `scratch/testflight-qa/` for the physical-device pass evidence bundle.
   `pnpm app-store:signing-readiness` reports the current upload machine's
   Apple Developer Team ID, Xcode command line tools, and Apple distribution
   signing identity readiness before archive/upload.

## Milestone 6 — Automated coverage of key user flows

Detox E2E currently covers four smoke tests (board renders, arrows render, one
correct move, mistake-review navigation). Target flow list (each a Detox spec
asserting through public UI and stable testIDs):

1. Standard sprint fail → Sprint Results fields → Play Again. *(added 2026-07-03)*
2. Arrow Duel choice via a board candidate move → score strip updates.
   Candidate arrows are the input surface; separate A/B chips are intentionally
   absent. *(added 2026-07-03; updated 2026-07-05)*
3. Sprint mistakes → Review tab shows scheduled queue state and next-due
   estimate. *(added 2026-07-03)*
4. History after a sprint: rows render, wrong-only filter, open a row into
   Analysis Review, navigate, exit. *(added 2026-07-03)*
5. Custom sprint: open setup, change timing, live target-count update, start
   session, abandon with confirmation. *(added 2026-07-03)*
6. Settings: verify iCloud Sync, notification, profile, and About rows remain
   reachable without local-data reset/export affordances.
   *(added 2026-07-03; updated after removing rating reset and local-data UI.)*
7. Relaunch persistence: kill and relaunch, assert rating/history/queue intact.
   *(added 2026-07-03; strengthened to assert persisted review queue totals
   after relaunch.)*
8. Scheduled due review completion (needs a time-travel or fixture seam to make
   items due within a test run — design a public fixture path per AGENTS.md,
   never a test-only backdoor in product code).
   *(added 2026-07-03; covered through a dev/test-harness launch clock that
   creates future-due review rows through real sprint UI, relaunches after the
   due interval, and opens the scheduled Review session in Detox. Completion is
   covered by a component behavior test through the Review board `onMove`
   contract, which records a correct `scheduled_review` attempt and returns to
   the due queue.)*
9. Review reminder scheduling (fake notification interface).
   *(added 2026-07-03; covered through a native notification launch fixture
   that reports authorized permission, schedules a local review reminder from
   Settings, asserts the scheduled payload, and clears it when reminders are
   turned off.)*
10. Dev/test Review controls for time-shifting the next future due review date
   and scheduling a short-delay test notification through the same storage and
   notification interfaces used by production code. *(component covered; dev
   controls must not ship in release builds.)*

## Milestone 7 — Core Pack expansion to the full offline library

Owner decision 2026-07-04: regenerate the bundled Core Pack per
`docs/PUZZLE_PACK_SAMPLING.md` — all puzzles Arrow Duel eligible, quality
filters (Popularity >= 70, NbPlays >= 100, RatingDeviation <= 100), rating
600–2200, ~1.4M puzzles targeting ≈ 700 MB install (hard cap 800 MB), shipped
as a prebuilt read-only SQLite asset with stratified bucket/theme/mate-pattern
quotas and a deterministic seeded draw. That spec is authoritative for filter
thresholds, quotas, packaging, and acceptance criteria; it also requires
aligning `SERVER_PUZZLE_MIN_RATING` with the pack floor.

## In-Flight Owner Fine-Tuning (do not modify)

Owner-identified gap and tuning track, recorded 2026-07-04. Both items live on
branch `codex/server-compatible-ratings` (draft PR #109) and are **pending
owner acceptance — no agent may modify, rebase, split, or close that branch or
PR until the owner signs off**:

1. **Server-compatible Glicko sprint ratings.** The owner identified that local
   sprint rating math must be ported to the server's Glicko implementation so
   local ratings stay compatible with the server-side rating semantics. The
   port is committed on the branch ("Port sprint ratings to server Glicko").
2. **Chessboard gesture patch tuning.** Working-tree changes to
   `patches/react-native-chessboard@0.2.0.patch`, the gesture patch test, and
   the practice screen are part of the same owner tuning pass.

After owner acceptance, document the final Glicko rating rules (parameters,
rating periods, deviation handling, and any migration for existing stored
ratings) in the domain docs, and remember that changing `patches/` or the
lockfile requires `pnpm mobile:ios` before any simulator verification.

## Out of scope for 1.0

- Pack downloading/import/removal and the Packs tab. Puzzle data attribution
  lives in Settings for 1.0.
- Game Review.
- Android.
- Chess.com / Lichess account import.
