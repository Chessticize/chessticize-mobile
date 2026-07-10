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
