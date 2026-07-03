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
4. Persist settings state (sync opt-ins, notification preferences) rather than
   `useState`-only.

## Milestone 2 — Honest sync story (App Review risk)

There is no sync engine: no CloudKit code, no entitlement, no transport
interface. Shipping a simulated sync UI is misleading and an App Review
rejection risk.

1. For 1.0, replace the iCloud sync section with an honest "Local data" section:
   storage is on-device, export/delete remain, no fabricated sync status.
   Remove the fake toggle, disclosure, upload prompt, and timestamp (spec rule
   added 2026-07-03: sync status must reflect real system state).
2. Real CloudKit sync is post-1.0. When picked up, follow the build order the
   audit produced: sync metadata columns + migration, `SyncTransport` interface
   with a maintained fake, CloudKit adapter + entitlement, domain merge engine,
   then real UI state. Track as its own goal.

## Milestone 3 — Functional fixes from the 2026-07-03 audit

History:

1. Performance chart and headline stats aggregate only the current 20-row page
   (`buildHistoryView` builds `puzzleStats` from the paged slice; the chart
   further takes `.slice(-8)`). Compute chart/summary metrics in the domain
   over the full filtered range, not the page.
2. Mode and sprint-speed filters are degenerate: the history view is scoped to
   one `ratingKey`, which already encodes mode and speed, so other mode/speed
   chips silently return empty pages. Either make the history view span rating
   keys with real cross-key filters, or remove the dead chips and present the
   rating-key bucket honestly.
3. "Wrong in the last 7 days" chip is UI state that desyncs from the actual
   query when range/result change afterward; toggling it off force-resets the
   range. Derive the chip state from the query.
4. Row review-queue membership matches by `puzzleId` only while the
   review-status filter matches `puzzleId + mode + ratingKey`; a row can show a
   due date from another mode's queue entry. Unify on the keyed match.
5. Review-source rows render 0s elapsed (`startedAt` defaults to
   `completedAt`). Record real elapsed time for scheduled review attempts.

Review queue:

6. `lapseCount` never resets, and every queue item is born from a mistake with
   `lapseCount ≥ 1`, so every item classifies as "Hard" forever and the
   "Failed again" filter matches everything. Distinguish the original sprint
   miss from review-time lapses (e.g. start at 0, increment only on failed
   scheduled reviews, decay on success) so Easy/Medium/Hard and Failed-again
   are meaningful.
7. "Overdue" is computed as `dueAt <= now` — identical to "due" — everywhere
   (badge, summary, filter). Define overdue as meaningfully late (e.g. > 24h
   past due) and use it consistently.
8. A Standard/Blitz review timeout or unsolvable position dead-ends: the wrong
   result is recorded but no Continue affordance appears (that exists only on
   the Arrow Duel path). Show the solution or a Continue button after a
   recorded wrong, mirroring the Arrow Duel flow.
9. "Start Review" only starts the first context group and silently leaves the
   rest of a mixed queue due. Chain groups in sequence (or make grouped starts
   explicit in the default view).
10. Orphaned queue entries (puzzle no longer resolvable) are hidden from the
    due list but linger in `review_queue` and inflate `totalCount`. Clean them
    up.

Arrow Duel / analysis:

11. Candidate order is seeded per live session but not stored with the attempt;
    review reconstruction uses a default seed, so replayed A/B order can differ
    from what the user actually saw. Persist the order (or seed) on the attempt
    and reuse it in review (spec requires stored-with-attempt).
12. The Analysis panel's candidate list is empty at checkmate; the `1-0`/`0-1`
    terminal line exists but only renders on the guided review path. Inject it
    into the Analysis list too.
13. The session loading skeleton toggles on/off synchronously and never paints.
    Either defer heavy start work a frame or drop the dead code.

Scheduler polish (low priority):

14. First correct review jumps 1d → 3d because `successStreak` indexes past the
    24h rung; confirm intended or shift the index.
15. Next-due dates render as UTC calendar days; use local-time formatting.

## Milestone 4 — Review reminder notifications

Design approved 2026-07-03; the "Review Reminder Notifications" section of
`MOBILE_UI_DESIGN.md` is the spec. Implementation steps, in order:

1. Domain: a pure `computeNextReminder(queue, usageHistory, settings, now)`
   function in `packages/core` returning the next reminder (local time, due
   count, copy) or none — smart default time from the median session-start
   hour over the trailing 14 days (minimum 5 sessions), fallback 19:00 local;
   at most one per day; none when zero items will be due. Unit-test the
   histogram, fallback, and zero-due cases first.
2. Settings persistence for the reminder preference (smart / fixed time / off)
   — depends on Milestone 1.
3. A `ReminderScheduler` interface with a maintained fake; the real adapter
   wraps `UNUserNotificationCenter` (local notifications only, no push
   entitlement). Re-schedule on queue change and on app background.
4. UI: Notifications section in Settings; contextual permission ask after the
   first completed review session; denied state links to system settings and
   never re-prompts. Tapping the notification opens the Review tab.
5. E2E/component coverage via the fake scheduler (flow 9 in Milestone 6).

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
2. **App identity**: final display name, bundle identifier, version/build
   scheme, app icon set (all slots), launch screen matching the app background.
3. **Privacy**: App Privacy questionnaire answers (local-only data collection =
   "Data Not Collected" if truly nothing leaves device), a privacy policy URL,
   `PrivacyInfo.xcprivacy` privacy manifest (required-reason APIs from RN and
   SQLite deps), `ITSAppUsesNonExemptEncryption = false` in Info.plist.
4. **Release configuration**: dev-only puzzle-source switch verified hidden in
   release (already gated on `__DEV__`), LogBox suppression acceptable, no
   debug menus reachable, Metro not required.
5. **Device targets**: decide iPhone-only vs iPad support
   (`TARGETED_DEVICE_FAMILY`), orientation lock (portrait-first per design),
   minimum iOS version; verify layout on iPhone SE-size and current-flagship
   simulators (design doc QA rule).
6. **Store assets**: screenshots (6.7" and 6.1" minimum), description,
   keywords, support URL.
7. **TestFlight pass**: internal build, manual QA checklist covering the E2E
   flow list below on a physical device, including kill-and-relaunch
   persistence and offline (airplane-mode) practice.

## Milestone 6 — Automated coverage of key user flows

Detox E2E currently covers four smoke tests (board renders, arrows render, one
correct move, mistake-review navigation). Target flow list (each a Detox spec
asserting through public UI and stable testIDs):

1. Standard sprint fail → Sprint Results fields → Play Again. *(added 2026-07-03)*
2. Arrow Duel choice via candidate chip → score strip updates. *(added 2026-07-03)*
3. Sprint mistakes → Review tab shows scheduled queue state and next-due
   estimate. *(added 2026-07-03)*
4. History after a sprint: rows render, Wrong-7d filter, open a row into
   Analysis Review, navigate, exit. *(added 2026-07-03)*
5. Custom sprint: open setup, change timing, live target-count update, start
   session, abandon with confirmation. *(added 2026-07-03)*
6. Settings: reset ELO with confirmation; delete local history with
   confirmation; status messages. *(added 2026-07-03)*
7. Relaunch persistence: kill and relaunch, assert rating/history/queue intact.
   *(blocked on Milestone 1.)*
8. Scheduled due review completion (needs a time-travel or fixture seam to make
   items due within a test run — design a public fixture path per AGENTS.md,
   never a test-only backdoor in product code). *(blocked on Milestone 1.)*
9. Review reminder scheduling (fake notification interface). *(blocked on
   Milestone 4.)*

## Out of scope for 1.0

- Pack downloading/import/removal (Packs tab stays bundled-only).
- Game Review.
- Android.
- Chess.com / Lichess account import.
- Real CloudKit sync (Milestone 2 ships the honest local-only story; sync is
  the first post-1.0 goal).
