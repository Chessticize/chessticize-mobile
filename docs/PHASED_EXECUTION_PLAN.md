# Chessticize Mobile Phased Execution Plan

## 1. Product Summary

Chessticize Mobile is an offline-first mobile app for Puzzle Sprint and Arrow Duel. The app targets iOS first and Android later. It must work without a network connection after installation, keep local progress and ELO, support mistake review with spaced repetition, and provide optional iCloud sync for Apple devices.

The implementation choice is Bare React Native with TypeScript. This keeps the app close to the existing React/TypeScript web implementation while still allowing native SQLite, native Stockfish, CloudKit, and iOS/Android release builds.

The app must not maintain a custom chessboard widget. It will use an existing React Native chessboard library through a small adapter and an Arrow Duel overlay layer.

The app must have a clear frontend/backend split inside the mobile codebase. The frontend is the React Native UI shell. The backend is the local domain and application core that owns rules, state transitions, persistence orchestration, sync merge, and analysis orchestration.

## 2. Key Architecture Decisions

### Platform

- Use Bare React Native, not managed Expo, because the app needs native Stockfish, SQLite asset handling, CloudKit, and deeper build control.
- Implement iOS first. Android remains part of the architecture, but Android release is a later phase.
- Keep all business logic in TypeScript backend/domain modules independent from React components and React Native APIs.

### Frontend And Local Backend Split

The repository must separate UI code from reusable local backend logic.

Proposed structure:

- `apps/mobile`: React Native app shell, screens, navigation, accessibility labels, visual state, and platform wiring.
- `packages/core`: pure TypeScript domain core for ELO, sprint state machines, Arrow Duel rules, spaced repetition, history filtering, puzzle selection policies, sync merge rules, and deterministic clocks/randomness abstractions.
- `packages/storage`: SQLite repositories, migrations, fixture database helpers, and repository contract tests.
- `packages/engine`: Stockfish service interface, native bridge adapter, analysis orchestration, and engine contract tests.
- `packages/sync`: sync event model, CloudKit adapter, fake sync transport, merge/rebuild logic, and sync contract tests.
- `tools/puzzle-pack-builder`: presolved CSV to SQLite pack builder, manifest generation, validation, and pack-size reports.

Dependency direction:

- `apps/mobile` may depend on `packages/core`, `packages/storage`, `packages/engine`, and `packages/sync`.
- `packages/core` must not depend on React, React Native, SQLite bindings, CloudKit, Stockfish native modules, navigation, gestures, or UI libraries.
- React components may dispatch typed intents and render view models. They must not calculate ELO, decide sprint outcomes, schedule reviews, choose puzzles, merge sync events, or validate Arrow Duel answers.
- Backend/domain behavior must be testable in Node without an iOS simulator or Android emulator.

### Chessboard

- Primary candidate: `react-native-chessboard`.
- Maintain only a `BoardAdapter` and Arrow Duel overlay. Do not fork or reimplement board rendering, piece movement, gestures, promotion, or orientation logic unless the spike proves every reusable option fails.
- First fallback: `dawikk-chessboard`.
- Last fallback: an iOS-native board such as ChessboardKit only if React Native board options fail and Android is explicitly postponed.

### Local Storage

- Use two SQLite databases:
  - Read-only puzzle pack database bundled with the app or imported by the user.
  - Writable user database for progress, ELO, attempts, review scheduling, settings, and sync metadata.
- Do not sync puzzle pack contents. Sync only user progress and settings.

### Stockfish

- Vendor official Stockfish source and build native binaries for iOS first.
- Expose a small UCI bridge to JavaScript: start, set option, position, go, stop, bestmove, info, and quit.
- Default runtime profile: one thread, small hash, bounded depth/time, no tablebases.
- Use precomputed puzzle metadata for sprint selection. Use Stockfish for review, explanation, and analysis, not for the hot path of selecting every puzzle.

### Licensing

- Use GPL-3.0-or-later for the app unless legal review selects a stricter compatible license.
- Release must include source availability, build scripts, Stockfish notices, data source notices, and full third-party license inventory.
- App Store distribution with embedded GPLv3 software is a legal release gate and must be reviewed before submission.

## 3. Data Model And Offline Behavior

### Puzzle Pack

Build `puzzles_core.sqlite` from the presolved Lichess-derived CSV data. The core pack should be ELO-targeted instead of full-size by default.

Puzzle attribution and licensing:

- The puzzle corpus is derived from the Lichess puzzle database.
- Chessticize adds presolved metadata such as Stockfish evaluation, Stockfish best move, and evaluation after the first move.
- Puzzle packs must include source attribution, source dataset identifiers, generated manifest hashes, and license notices.
- The Lichess open database page currently lists database exports under CC0; public redistribution is still blocked until the current puzzle database license terms are verified and included correctly at release time.

Core pack default:

- Prefer lower and middle ELO ranges because most users need those first.
- Initial target range: 600-1800, adjusted by actual size and coverage.
- Preserve theme balance for common themes.
- Keep a strong Arrow Duel subset by requiring legal candidates, distinct best/blunder moves, and a clear evaluation gap.
- If the pack is still too large, remove low-popularity puzzles, repeated near-duplicates, high-ELO puzzles, rare themes, and ambiguous Arrow Duel positions first.

The pack manifest must include source dataset identifiers, build timestamp, row count, rating range, theme coverage, Arrow Duel count, filters, and source license notes.

### User Database

The user database stores:

- User settings, including iCloud sync enabled state.
- Sprint configs, including custom duration, per-puzzle time, max mistakes, mode, and theme.
- Attempts and sprint sessions.
- ELO ratings by ELO type and reset generation.
- Review queue state and review events.
- Sync metadata, device ID, record revisions, and pending upload/download state.

### ELO

- Keep separate ELO records per ELO type, for example `mixed 5/20`, `mixed 5/10`, `arrowduel 5/30`, and custom `{theme} {duration}/{perPuzzle}`.
- Default rating is 600, rating deviation is 350, volatility is 0.06, and rating floor is 600.
- Standard, Blitz, Arrow Duel, theme sprint, and each custom sprint speed keep separate statistics and rating buckets.
- A sprint win increases the relevant ELO type; a failure by time, abandon, or three mistakes lowers it.
- Reset ELO starts a new generation by default and preserves historical attempts. Deleting history is a separate destructive action.

### Review Terminology

The product has two different review concepts and they must remain separate in the domain model, storage schema, UI copy, and tests.

- **Analysis Review** is an unscored exploration surface opened immediately after a sprint, immediately after a scheduled review batch, or from a History row. It is used to replay, retry, and analyze puzzles the user wants to inspect. It does not create attempt history, does not change ELO, and does not update spaced repetition scheduling.
- **Scheduled Review** is the official spaced repetition flow for previously missed puzzles. It is scored per puzzle, updates the review queue, records review attempts in History, and advances or resets the spaced repetition schedule.

If UI copy must use the shorter word "Review", the implementation context must disambiguate which concept is active. Internal APIs should use explicit names such as `analysisReview`, `scheduledReview`, `reviewAttempt`, or `reviewQueue` instead of ambiguous names.

### Spaced Repetition Review

Wrong puzzles enter a review queue.

Default intervals:

- First wrong answer: review in 1 day.
- First successful review: review again in 3 days.
- Subsequent successful reviews: 7 days, 14 days, 30 days, then 60 days.
- Failed review: shorten the next interval to the next quick review window, default 6 hours or 1 day depending on prior history.

The scheduler stores due date, interval, review count, success streak, lapse count, last result, and last reviewed time. A failed scheduled review resets or contracts the schedule for that puzzle. A successful scheduled review advances the interval according to the curve.

Scheduled reviews are tracked per puzzle and per practice context. Standard, Blitz, Arrow Duel, theme sprint, and custom sprint speeds should not be mixed into one undifferentiated queue when their training intent differs. A puzzle missed in a 20-second Standard Sprint should be reviewed with the same normal puzzle solving flow and a 20-second target pace. A puzzle missed in Arrow Duel should be reviewed through the Arrow Duel flow.

Scheduled review sessions can be stopped or exited at any time. Completed items are recorded immediately. Unseen items remain in the queue with their existing due state.

### Arrow Duel Review

Arrow Duel review must show both original candidate arrows:

- Correct Stockfish best move: green.
- Blunder or inferior move: red.
- User's original selection: highlighted with an additional marker.

If the user selected the wrong move, the app should automatically play the opponent response or punishment line. Prefer the puzzle solution line when it explains the tactic. Fall back to local Stockfish short analysis when the stored line is insufficient.

During the punishment line, the analysis panel should describe the current position, not the original two candidates. If the current position is checkmate, show the game result such as `1-0` or `0-1`. If it is not terminal, show the current-position evaluation or forced mate distance. The original green/red candidate arrows remain useful at the initial Arrow Duel review position, but they must not be reused as if they evaluated later punishment-line positions.

### History

History is an event browser for all solved puzzle work that should be remembered:

- Sprint attempts, including correct and wrong attempts.
- Official scheduled review attempts, including correct and wrong review results.

Analysis Review sessions are intentionally excluded from History because they are exploratory. Retrying or analyzing a puzzle from a sprint result, scheduled review result, or History row must not create another history row unless the user starts an official Scheduled Review item.

History filters must support:

- Time range: 7 days, 30 days, 90 days, 1 year, and all time.
- Mode and sprint type: Standard, Blitz, Arrow Duel, theme sprint, and custom sprint speeds.
- Attempt source: sprint attempt or scheduled review attempt.
- Result: correct, wrong, or all.
- Side to move, puzzle theme, puzzle rating, rating key, and review status when available.

Tapping a History row opens Analysis Review with the original attempt context. The user can retry the puzzle, analyze with Stockfish, and navigate previous/next rows within the active History filter without changing official history or review scheduling.

## 4. iCloud Sync Strategy

### Default

iCloud sync should be enabled by default for new iOS installs when the user is signed into iCloud, but the app must show a clear first-run or Settings-level control. The app remains fully usable when iCloud is unavailable or disabled.

Rationale:

- Apple presents iCloud and CloudKit as seamless cross-device sync for app data.
- Users generally expect progress to follow them across Apple devices when an app offers iCloud sync.
- This app is offline-first and privacy-sensitive, so sync must be transparent, easy to disable, and local-first.

Existing local-only users who upgrade to a sync-capable version should see an explicit prompt before the first upload. Fresh installs can default to sync on with visible disclosure and a Settings toggle.

### Scope

Sync only user progress:

- Attempts.
- Sprint sessions.
- ELO reset events and materialized ratings.
- Review events and materialized review queue.
- Custom sprint configs.
- Selected user settings.

Do not sync:

- Puzzle pack files.
- Stockfish binaries.
- Derived caches.
- Large analysis logs unless a future version adds explicit export.

### Sync Model

Use CloudKit private database on iOS. Android does not participate in iCloud sync in v1. Cross-platform iOS/Android sync would require a separate optional account-backed sync service and is out of scope for the first mobile release.

Use an event-log-first model:

- Immutable progress events are the source of truth.
- Local SQLite materialized tables are rebuilt or updated from events.
- Attempts and review events merge by stable event ID.
- Settings and custom sprint configs use revision-based last-writer-wins.
- ELO reset is an event that starts a new generation.
- When devices conflict, preserve all attempt/review events and recompute derived state.

Sync must support offline writes. When connectivity returns, the app uploads pending events and downloads remote changes. Local practice must never block on CloudKit.

## 5. User Experience Direction

The detailed mobile UI direction, sanitized current-web observation, palette, and screen drafts live in [Mobile UI Design](ui-design/MOBILE_UI_DESIGN.md).

The UI should be quiet, clean, and practice-focused.

- No landing page in the app shell. Open directly into practice.
- Use a five-tab navigation structure: Practice, Review, History, Packs, Settings.
- Practice screen contains mode selector, current ELO, timer, mistake count, board, and primary action area.
- Review screen starts with due mistakes and supports filters.
- History supports quick filters including "Wrong in the last 7 days".
- History owns performance charts and analytics with quick ranges for 7 days, 30 days, 1 year, and all time, segmented by sprint type, sprint speed, theme, result, and mistake/review status.
- Packs includes bundled/imported puzzle packs, pack coverage, imports/removals, source attribution, and license notes.
- Settings includes ELO reset, history delete, iCloud sync toggle, export/delete data, and about/version information.

Visual design:

- Neutral background and text colors.
- One restrained accent color.
- State colors only for correct, wrong, warning, and selection.
- No gradients, decorative blobs, emoji, or marketing-style cards.
- Cards only for repeated items, modals, or framed tools. Avoid nested cards.
- Buttons and controls must have stable dimensions and accessible labels.

## 6. Automated Testing Strategy

### Unit Tests

Use Jest or Vitest for pure TypeScript modules:

- ELO calculations.
- ELO type parsing.
- Sprint target puzzle calculation.
- Sprint completion/failure rules.
- Arrow Duel candidate generation and validation.
- Puzzle pack filtering.
- Spaced repetition scheduling.
- Sync merge/rebuild rules.
- View-model generation for frontend screens when it contains presentation-independent state mapping.

Unit tests must primarily target `packages/core` and other backend/domain packages. UI-only state should stay thin enough that component and E2E tests can cover it.

### Integration Tests

Use real SQLite fixture databases for:

- Puzzle selection.
- History filters.
- Review queue due/overdue behavior.
- ELO reset generations.
- Pack manifest validation.
- Local event log replay.

Use the real Stockfish bridge in native integration tests for:

- UCI handshake.
- Fixed-position best move.
- Stop/cancel.
- Background lifecycle behavior.

Use a maintained fake sync transport for deterministic sync behavior tests. The fake must share contract tests with the CloudKit adapter where practical.

### Component Tests

Use React Native Testing Library:

- Test visible text, accessibility labels, and user interactions.
- Avoid testing implementation state, component props, or internal stores.
- Cover practice controls, Arrow Duel choice UI, review queue states, history filters, and settings toggles.

### GUI End-to-End Tests

Use Detox as the primary E2E framework.

Initial iOS E2E journeys:

- Launch app with fixture pack and local-only mode.
- Start a Puzzle Sprint and solve a known puzzle.
- Fail a known puzzle and verify it enters Review.
- Complete a due review and verify the next review date changes.
- Start Arrow Duel, choose the wrong arrow, and verify colored review arrows plus automatic punishment-line playback.
- Use History to filter "Wrong in the last 7 days".
- Reset ELO and verify history remains.
- Toggle iCloud sync off and verify practice still works.

Use Maestro only for lightweight smoke flows or screenshot-style release checks. Keep Appium as a fallback for future device-lab requirements.

CI policy:

- Run unit, lint, typecheck, and SQLite integration tests on every PR.
- Run iOS Detox locally during active feature work and in scheduled/on-demand macOS CI once the app scaffold exists.
- Add Android Detox or equivalent GUI automation before Android release.

## 7. Phased Delivery

### Phase 0: Repository And Planning

Deliverables:

- Public repository.
- English README.
- English phased execution plan.
- AGENTS.md with testing and documentation rules.
- License direction documented.

Exit criteria:

- The repository is public or ready to push to a public remote.
- The plan documents architecture, sync, testing, and staged delivery.

### Phase 1: Architecture Spike

Deliverables:

- Bare React Native app skeleton.
- Initial workspace/package layout with `apps/mobile`, `packages/core`, `packages/storage`, `packages/engine`, `packages/sync`, and `tools/puzzle-pack-builder`.
- First backend/domain APIs for sprint state, ELO type parsing, and Arrow Duel candidate validation with Node-based unit tests.
- `react-native-chessboard` integration on iOS simulator.
- Arrow Duel two-arrow overlay proof of concept.
- SQLite fixture pack loaded from app bundle.
- Stockfish native bridge handshake on iOS.
- Minimal Detox test launching the app and interacting with the board screen.

Exit criteria:

- Reused chessboard is acceptable for orientation, drag/tap, highlights, and overlay alignment.
- No custom board widget is introduced.
- Frontend screens consume backend/domain public APIs instead of embedding business rules.
- Stockfish can analyze a fixed FEN locally.
- Fixture SQLite can be read offline.
- E2E harness works on iOS simulator.

### Phase 2: Offline Practice MVP

Deliverables:

- Puzzle Sprint.
- Arrow Duel.
- Local ELO by ELO type.
- Custom sprint configs.
- History with filters.
- Clean practice-focused UI.
- Backend/domain implementation for all MVP rules with high-coverage unit tests and SQLite integration tests.

Exit criteria:

- App can be installed, opened in airplane mode, and used for complete Sprint and Arrow Duel sessions.
- Core practice behavior can be tested without launching the mobile UI.
- Focused unit, integration, component, and initial Detox tests pass.

### Phase 3: Review And Analysis

Deliverables:

- Mistake review queue.
- Spaced repetition scheduler.
- Arrow Duel colored review arrows.
- Wrong-choice punishment-line playback.
- Stockfish analysis screen.

Exit criteria:

- Wrong puzzles reliably enter review.
- Correct reviews expand intervals.
- Failed reviews shorten intervals.
- Arrow Duel review explains wrong choices offline.

### Phase 4: Puzzle Pack Pipeline

Deliverables:

- CSV-to-SQLite pack builder.
- ELO-targeted core pack.
- Pack manifest.
- Optional imported extension pack support.
- Pack validation tests.

Exit criteria:

- Core pack size is acceptable for App Store distribution.
- Lower/middle ELO coverage is strong.
- Arrow Duel eligibility is deterministic and validated.
- App works with only the bundled pack.

### Phase 5: iCloud Sync

Deliverables:

- CloudKit private database adapter.
- Sync toggle.
- Event-log upload/download.
- Conflict merge and materialized-state rebuild.
- Local-only mode.
- Upgrade prompt for users with existing local progress.

Exit criteria:

- App remains usable offline with sync enabled or disabled.
- Two iOS devices can converge to the same progress state.
- Disabling sync stops upload/download without deleting local progress.
- Sync tests cover merge behavior with a maintained fake transport.

### Phase 6: iOS Release Readiness

Deliverables:

- Accessibility pass.
- Performance pass.
- License and source distribution review.
- App Store metadata draft.
- TestFlight build.
- Release regression suite.

Exit criteria:

- GPL/App Store compliance is reviewed.
- Core flows pass on simulator and at least one physical device.
- TestFlight build is ready for external testing.

### Phase 7: Android Port

Deliverables:

- Android build.
- Android Stockfish native bridge.
- Android SQLite pack loading.
- Android GUI automation.
- Android release packaging review.

Exit criteria:

- Android supports offline practice, review, history, and local ELO.
- Android release does not claim iCloud sync.
- Any future cross-platform sync decision is documented separately.

## 8. Research References

- Apple CloudKit overview: https://developer.apple.com/icloud/cloudkit/
- Apple iCloud backup and sync behavior: https://support.apple.com/en-us/108770
- React Native testing overview: https://reactnative.dev/docs/testing-overview
- Detox project setup: https://wix.github.io/Detox/docs/introduction/project-setup/
- Maestro documentation: https://docs.maestro.dev/
- Appium documentation: https://appium.io/docs/en/latest/intro/
- React Native chessboard candidate: https://www.npmjs.com/package/react-native-chessboard
- Stockfish source: https://github.com/official-stockfish/Stockfish
- GNU GPL FAQ: https://www.gnu.org/licenses/gpl-faq.html
