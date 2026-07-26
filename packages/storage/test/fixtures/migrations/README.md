# SQLite Migration Fixtures

These databases are immutable snapshots of schemas that shipped to users. Tests
must copy a fixture to a temporary writable path before migrating it. Do not
open a checked-in fixture through the current `SQLiteStore.migrate()` path.

## `schema-v0-ios-1.0.0.sqlite`

- Storage schema version: `0` (the release predates `PRAGMA user_version`)
- Source release: `ios-v1.0.0-build-1`
- Source schema: `packages/storage/src/sync-sqlite-store.ts` at that tag
- Generator: `generate-schema-v0-ios-1.0.0.mjs`
- Regenerate: `node packages/storage/test/fixtures/migrations/generate-schema-v0-ios-1.0.0.mjs`
- SHA-256: `f9746607dcd98c642a1b111be348dd7476ee12a239c10346b64abe069e6cad5f`

The fixture contains only synthetic data. Its expected semantic snapshot is:

- One settings row with iCloud enabled and a fixed `20:30` review reminder.
- Four puzzles spanning Standard, Arrow Duel, Custom, and review history.
- Five rating rows, including two generations for `standard 5/20`.
- Nine sprint sessions spanning active, paused, won, failed, abandoned, Custom,
  Arrow Duel, and scheduled review states.
- Six attempts spanning correct/wrong Standard, Arrow Duel candidate order,
  Custom, and scheduled review behavior.
- Two distinct Custom configurations and two review contexts.

The generator intentionally contains the released schema definition instead of
importing current storage code. Changing current migrations must never rewrite
this file or its expected checksum. A newly shipped schema requires a new
fixture and a new migration-matrix entry.

## `schema-v8-ios-1.2.1.sqlite`

- Storage schema version: `8`
- Published release: iOS 1.2.1 build 1
- Source commit: `9028826447330d67ab4c34f64a3fb7d1b5b05229`
- Source tree: `f2ab3c211d9c2a028e7aaf0d59bcf1678b087601`
- Released storage source blob:
  `packages/storage/src/sync-sqlite-store.ts` at
  `354671f1b7b72056e703a408be56ffda7af1a6c7`
- Released v8 schema snapshot blob:
  `packages/storage/test/fixtures/schema-snapshots/v8.json` at
  `6e6d2edc90a6ce12f54b76a184a0caac40eaa2f8`
- Released v8 schema snapshot SHA-256:
  `3d3403336cf1049a6853553eee80ad9738f6541be89a5fd449e928e20b9c7c23`
- Generator: `generate-schema-v8-ios-1.2.1.mjs`
- Regenerate:
  `node packages/storage/test/fixtures/migrations/generate-schema-v8-ios-1.2.1.mjs`
- File size: `176128` bytes
- SHA-256:
  `09ab34a656b6315189a4bc8e75baa64f1226492dce1cf5bb192d444822ee442b`

The generator verifies the published commit, tree, and storage-source blob,
extracts that exact commit with `git archive`, and runs the released
`SyncSQLiteStore.migrate()` implementation to create schema v8. It does not
import or call the current migration implementation. The released public store
methods then write deterministic synthetic records, and the generator validates
the resulting version, integrity, foreign keys, and representative row counts
before vacuuming the fixture.

The fixture contains only synthetic, privacy-safe data. Its expected semantic
snapshot is:

- Fixed `07:35` review reminders with iCloud disabled.
- Three synthetic puzzles covering Standard, Arrow Duel, and a Custom fork
  run.
- Four rating rows, including two generations for `standard 5/20`.
- Seven sessions covering won, failed, active, paused, Standard, Arrow Duel,
  Custom, and scheduled-review states.
- Five attempts covering correct and wrong outcomes, Arrow Duel candidate
  order, a user-marked unclear answer, Custom, and scheduled review.
- Standard and Arrow Duel built-in runs plus one Custom run whose 25-second
  legacy pace receives the current default slow/timeout policy during
  migration.
- Two review contexts: one mistake-scheduled item and one manually enrolled
  item.

The migration matrix checks the immutable checksum and released v8 golden
schema, copies the fixture to a writable temporary database, migrates it through
the real current SQLite adapter, and verifies current schema identity, public
History/Review/Run/settings/summary behavior, a new write, close/reopen, and
idempotent remigration.
