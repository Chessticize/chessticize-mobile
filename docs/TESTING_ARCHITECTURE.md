# Testing Architecture

This document defines the authoritative regression-testing strategy for
Chessticize Mobile. It covers the division of responsibility between domain
tests, storage integration tests, CLI end-to-end tests, mobile component tests,
native GUI automation, and SQLite schema migration regression tests.

The goal is comprehensive coverage of product behavior without duplicating
every business-rule branch in slow simulator tests. Tests should use the
cheapest layer that can prove a behavior and move to a higher layer only when a
real boundary is part of the risk.

## Testing Principles

1. Business-rule branches belong in the backend/domain test suite.
2. Persistence contracts belong in integration tests using real SQLite files.
3. React Native state, navigation, accessibility, and service wiring belong in
   component behavior tests.
4. Detox proves a small set of critical user journeys and native integration
   boundaries. It is not a second exhaustive domain test suite.
5. Tests should prefer real internal implementations. Maintained fakes are
   appropriate at external or native boundaries such as CloudKit, notification
   authorization, network failure, and explicit time/failure simulation.
6. Every regression found in review or production must be captured at the
   lowest layer that would have detected it reliably.
7. Code coverage percentages are supporting signals, not the definition of
   completion. Domain branch coverage and explicit journey coverage are more
   important than maximizing E2E line coverage.

## Test Layers

| Layer | Primary responsibility | Examples | Default command |
| --- | --- | --- | --- |
| Core unit | Exhaustive pure business rules and edge cases | Sprint outcomes, ELO, Arrow Duel validation, puzzle selection, review scheduling, history queries | `pnpm test:unit` |
| Storage integration | Real persistence and repository contracts | SQLite migrations, reopen behavior, transactions, review queue, ratings, sync merge | `pnpm test:integration` |
| CLI E2E | Real process and public protocol boundary | Standard sprint, Arrow Duel, serialized history/review/rating state | `pnpm test:e2e` |
| Mobile component | Rendered public UI behavior with native rendering boundaries replaced | Navigation, timers, filters, settings, injected sync/notification clients, board callback wiring | `pnpm mobile:test` |
| Mobile Detox | Full app, real simulator, real writable SQLite, real native rendering/modules | Critical journeys, relaunch persistence, chessboard gestures, Stockfish, screenshots | `pnpm mobile:e2e:test:ios` |
| Release/manual native | External account and physical-device acceptance | Real iCloud account/container, delivered notification taps, TestFlight upgrade, device-specific behavior | Release runbook |

`pnpm test:e2e` runs the CLI process tests. It does not run the mobile GUI
suite. The mobile GUI suite is built and run with
`pnpm mobile:e2e:build:ios` and `pnpm mobile:e2e:test:ios`.

## What Must Be Exhaustive

Pure domain and persistence behavior should cover all meaningful branches,
including success, failure, boundary values, invalid inputs, and recovery
behavior. This includes:

- Standard sprint target reached, maximum mistakes, timeout, abandon, pause,
  resume, puzzle exhaustion, and rating effects.
- Arrow Duel correct choice, wrong choice, non-candidate move, candidate order,
  review metadata, and sprint completion.
- Custom rating-key separation across timing, theme, and mode configurations.
- Review scheduling success/failure intervals, overdue boundaries, and context
  separation.
- History combinations such as time range, result, rating bucket, review
  status, paging, and full-range summaries.
- Sync disabled behavior, upload/import/merge behavior, idempotency, generation
  boundaries, and conflict cases.
- SQLite reopen behavior, transactions, constraints, migrations, and failure
  rollback.

These branches should not be repeated one-for-one in Detox.

## Mobile Component Coverage

Component tests should cover every important user-visible state and action that
does not require real iOS rendering or a real native module. Assert through
text, accessibility labels, test IDs, and public callbacks rather than React
implementation state.

Representative component coverage includes:

- Start, pause, resume, timeout, abandon confirmation, and result summaries.
- Standard and Arrow Duel board callback handling, including ignored illegal or
  stale callbacks.
- Custom setup variants, multiple saved configurations, theme selection, and
  the selected rating bucket/ELO.
- Review queue states, scheduled review completion, review analysis, and
  notification routing.
- History filters, paging, chart interaction, row-to-review navigation, and
  return navigation.
- Settings reachability, ELO editing, iCloud on/off/manual sync wiring, and
  notification preference/permission states.

The mocked chessboard proves props, callback wiring, and UI state. It does not
prove real piece rendering, coordinate mapping, drag competition, or promotion
interaction on iOS.

## Detox Regression Scope

Detox should cover representative cross-layer journeys rather than the
Cartesian product of all modes, endings, filters, and settings. The stable
regression suite should include the following minimum journeys:

1. Standard happy path through a real board move sequence to a successful
   result summary.
2. Standard failure through maximum mistakes, result fields, Play Again, and
   abandon confirmation.
3. Active sprint pause, app termination, relaunch without deleting data,
   resume, and another accepted move.
4. Arrow Duel through the real candidate-arrow board surface, including at
   least one accepted candidate and one wrong candidate with visible feedback
   or review impact.
5. Custom configuration through public UI, session start, and persistence of a
   representative saved configuration after relaunch.
6. Sprint mistakes to review queue, time-shifted relaunch, one completed due
   review, and the resulting queue/history update.
7. History with one representative composite filter, row-to-review navigation,
   and return to the filtered result.
8. ELO modification and persistence after relaunch.
9. Deterministic notification scheduling and disabling through the native test
   fixture.
10. Real board and Arrow Duel rendering, plus Stockfish analysis integration.

Do not add separate Detox tests for every timeout, abandon timing, Custom
theme, History filter, iCloud merge result, illegal move, or review scheduling
branch when those behaviors are already proven below the native boundary.

### Board Interaction Policy

- Chess legality, side to move, ownership, candidate validation, and promotion
  rules belong in unit/component tests.
- Keep at least one real tap-to-move or drag smoke test on iOS.
- Add a real drag or promotion Detox regression when that native interaction is
  release-critical or has regressed before.
- Do not duplicate every illegal move or opponent-piece drag case in Detox.

### External Native Services

- CI must use maintained deterministic fakes or native launch fixtures for
  notification and CloudKit states.
- Real iCloud account/container behavior must be checked in staging or on a
  signed physical/TestFlight build. Simulator CI must not depend on a logged-in
  personal account.
- Real notification delivery and tap routing should receive a physical-device
  release smoke check. CI should not wait for wall-clock notification delivery
  when the scheduling and routing ports can be tested deterministically.

## Deterministic E2E Data

Long practice flows must use small, stable puzzle fixtures with known UCI
solutions. Keep puzzle identities and solutions in a shared fixture or manifest
instead of scattering unexplained board coordinates across specs.

E2E setup must use the same public app and storage path used by the product.
Tests must not call stores, repositories, or service methods directly. Time
travel and native authorization fixtures are acceptable only when they enter
through maintained app launch/native boundaries and production code still
creates and reads the state through its normal interfaces.

Use `device.launchApp({ delete: true })` for isolated fresh-state journeys. Use
`delete: false` only when persistence, resume, or upgrade behavior is the
subject of the test. A dedicated Detox simulator is required because deleting
the app sandbox removes local SQLite history, sprint sessions, and review data.

Mobile iOS CI may cache Xcode intermediates and dependency build products, but
must exclude the final app bundle and dSYM. Pull requests restore the latest
compatible cache seeded by `main`, then still run the normal Xcode build and
the complete Detox suites. Cache hits are an acceleration mechanism, not a
substitute for building or running any regression case.

## SQLite Schema Migration Architecture

User data must survive upgrades from every previously shipped database schema
to the current schema. Schema creation and schema migration are separate
responsibilities:

- The current schema definition creates a new database.
- An ordered migration chain transforms an existing database.
- Editing a `CREATE TABLE IF NOT EXISTS` statement does not modify an existing
  user table and therefore is not a migration.

### Versioning

Use an explicit monotonically increasing SQLite schema version, preferably
`PRAGMA user_version`, with an ordered migration registry:

```ts
const CURRENT_SCHEMA_VERSION = 4;

const MIGRATIONS = [
  { from: 1, to: 2, migrate: migrateV1ToV2 },
  { from: 2, to: 3, migrate: migrateV2ToV3 },
  { from: 3, to: 4, migrate: migrateV3ToV4 }
];
```

Released migrations are append-only. Never rewrite or remove a migration that
may already have run on a user device.

The storage migration chain currently starts at schema version `1`. The
`ios-v1.0.0-build-1` release used the legacy unversioned schema and is retained
as the immutable `schema-v0-ios-1.0.0.sqlite` regression fixture. Version `1`
adds the server-compatible Glicko fields while assigning an explicit storage
schema version.

The first versioned migration must handle existing unversioned databases. A
database with `user_version = 0` and known Chessticize tables is a legacy user
database, not necessarily an empty database. Classify its known columns/tables,
apply the required compatibility migrations, validate the result, and only then
assign the baseline version. A truly empty database may be created directly at
the current version.

### Atomicity

Enable foreign keys before migration and execute the migration chain in one
transaction whenever SQLite permits it:

1. Read the current schema version.
2. Begin an immediate transaction.
3. Apply each pending migration in order.
4. Backfill and validate required data.
5. Run foreign-key validation for rebuilt relationships.
6. Update `user_version` only after that step succeeds.
7. Commit; otherwise roll back the entire chain.

For a table rebuild, create the replacement table, copy rows using explicit
column mappings and defaults, verify counts/invariants, recreate indexes, then
replace the old table inside the transaction. Do not use `SELECT *` for the
copy.

### Released-Schema Fixtures

Keep a small immutable SQLite fixture for every schema version that shipped to
users:

```text
packages/storage/test/fixtures/migrations/
  schema-v1.sqlite
  schema-v2.sqlite
  schema-v3.sqlite
  README.md
```

Fixtures must contain synthetic, privacy-safe data generated by the actual
released schema/code when possible. Each fixture should include representative
rows for:

- Settings, including iCloud and notification preferences.
- Multiple rating keys and rating generations.
- Active, paused, won, failed, and abandoned sprint sessions where supported.
- Correct/wrong Standard, Arrow Duel, Custom, and scheduled-review attempts.
- Multiple Custom configurations with distinct themes/timing/rating keys.
- Review queue and review events with multiple contexts.

The fixture README should record the schema version, source release/tag, how it
was generated, its expected semantic snapshot, and a checksum. Never build an
old fixture by calling the current `migrate()` implementation.

### Migration Regression Matrix

For every released fixture, copy it to a temporary writable path and migrate
that copy to the latest schema. The test must verify:

- `PRAGMA integrity_check` returns `ok`.
- `PRAGMA foreign_key_check` returns no violations.
- `PRAGMA user_version` equals `CURRENT_SCHEMA_VERSION`.
- Expected row counts, identifiers, timestamps, ratings, attempts, review
  contexts, settings, and Custom configurations survive.
- New columns and backfilled values have the intended semantics.
- Public `PracticeService` queries return the expected current rating, History,
  due reviews, active/resumable sprint, and settings.
- A new attempt/review/settings change can be written after migration.
- Closing, reopening, and running `migrate()` again changes nothing.

The required matrix is:

| Case | Required assertion |
| --- | --- |
| Empty database to latest | Creates the current schema and version |
| Every shipped version to latest | Preserves semantic user data |
| Latest to latest | No-op and idempotent |
| Migration called twice | Identical schema and semantic snapshot |
| Forced failure during migration | Transaction rolls back data, schema, and version |
| Corrupt or unsupported future version | Fails safely without destructive writes |
| Large representative history | Completes within the agreed startup budget |

Column-existence assertions alone are insufficient. The migration test must
exercise the public storage/service behavior users depend on.

### Native Upgrade Regression

Node SQLite integration tests are the primary migration regression suite because
they are fast and deterministic. A schema-changing release must also run one
native upgrade smoke test to cover the OP-SQLite adapter, iOS app container, and
startup migration path:

1. Install the previous released app build on a dedicated simulator or device.
2. Create representative user state through public UI.
3. Terminate the app without deleting its sandbox.
4. Install the new build over the same bundle identifier.
5. Launch the new build and allow normal startup migration to run.
6. Verify History, ratings, review queue, resumable sprint, Custom configuration,
   and settings through public UI.
7. Perform one new write to prove the migrated database remains writable.

This workflow must not use Detox's `delete: true` launch option. A normal
current-build relaunch test proves persistence, not compatibility with an older
schema.

### Migration Performance And Recovery

Migration safety includes startup behavior. Maintain a representative large
fixture, such as tens of thousands of attempts, and enforce an explicit
migration time budget on a release-representative simulator/device. Avoid a
strict timing assertion in noisy shared CI unless the runner is controlled;
record and compare the duration in the schema-change release workflow.

For a high-risk rebuild or data transformation, consider a recoverable backup
or equivalent SQLite backup strategy before migration. A migration error must
never delete or silently recreate the user database. Surface a recoverable
startup error and preserve the original file for diagnosis or retry.

SQLite schema versioning is separate from the exported/synced progress payload
schema version. If a storage change affects CloudKit/exported data, update and
test both compatibility contracts deliberately.

## Change-To-Test Matrix

| Change | Minimum validation |
| --- | --- |
| Pure sprint/ELO/review/history rule | Focused core unit tests, `pnpm test:unit`, typecheck |
| Repository/store behavior | Real SQLite integration tests, `pnpm test:integration` |
| SQLite schema or migration | Released-fixture migration matrix, rollback/idempotency checks, native upgrade smoke before release |
| CLI command or protocol | `pnpm test:e2e` |
| React Native UI state or wiring | Focused component tests, `pnpm mobile:test`, `pnpm mobile:typecheck` |
| Navigation or cross-component journey | Component coverage plus a representative Detox update |
| Real chessboard/native rendering | Detox and screenshot inspection |
| CloudKit behavior | Fake transport integration plus signed staging/manual validation |
| Notification scheduling/routing | Fake/native fixture tests plus physical-device release smoke |

## Completion Checklist

Before describing a change as complete:

- Identify the changed public behavior, edge cases, failure cases, and boundary.
- Put every business-rule branch in core or storage tests.
- Add component behavior coverage for changed visible states or actions.
- Add or update a representative E2E journey only when a real boundary changed.
- For schema changes, add the versioned migration and migration regression
  evidence before changing production reads/writes to require the new schema.
- Run the focused commands for the changed layers.
- Record intentionally skipped layers and the reason in the PR notes.
- Keep generated databases, screenshots, and private evidence out of git unless
  they are intentional sanitized fixtures.
