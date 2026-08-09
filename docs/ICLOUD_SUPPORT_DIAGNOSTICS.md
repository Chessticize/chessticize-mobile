# iCloud Support Diagnostics

Chessticize for iOS can prepare a user-controlled support bundle from the
`Export Support Diagnostics` row in Settings. The row remains available when
iCloud Sync is off and when no known sync error is visible.

The bundle contains:

- `local-progress.sqlite`: a transactionally consistent SQLite backup that
  passed `PRAGMA quick_check` before packaging;
- `icloud-progress-v2.ndjson`: one line-delimited file containing a full,
  read-only capture of the current private Progress V2 zone, including record
  deletions; an empty file with `not_initialized` status is valid for a new
  account whose V2 zone does not exist yet;
- `icloud-progress-v1.json`: the legacy private CloudKit snapshot, included
  only during the bridging phase when the V1 record exists;
- `diagnostic.txt`: bounded app, sync, and last-failure fields;
- `manifest.json`: versions, account/container status, database health,
  checksums, source completeness, V2 record-family counts, pending outbox
  count, the last V1 metadata-check result, and opaque change-token
  fingerprints.

The cloud capture always starts with a nil diagnostic change token and follows
every returned page. It does not create a zone, modify records, or update the
app's persisted sync token. Once the migration marker is sealed, diagnostics
does not query V1. A missing V1 record during bridging is a complete, normal
result rather than a partial export.

The 1.4.2 app release policy is sealed even before a fresh installation has
persisted its first local marker. Diagnostics therefore reports the active
sealed phase and skips V1 when Sync is off or before the first successful sync.

The app never uploads this bundle. The user chooses any handoff through the iOS
Share Sheet. The temporary ZIP is deleted when the Share Sheet closes or the
diagnostics window closes, is swept on the next app launch, and expires after
one hour while the app remains running.

## Inspect A Received Bundle

Use the repository harness instead of opening or replacing a production app
database:

```sh
pnpm support:inspect-icloud -- /path/to/Chessticize-Support-example.zip
```

The command verifies every manifest checksum, reopens the SQLite snapshot
read-only, requires `PRAGMA quick_check` to return `ok`, validates the CloudKit
V1 JSON or V2 NDJSON shape, validates V2 payload identities and family counts,
and prints table names and aggregate record counts without printing progress
rows, raw change tokens, or the app-generated sync ID. It also accepts legacy
bundle format 1 and an already extracted bundle directory.

For a focused replay tool, import `withICloudSupportBundle` from
`scripts/lib/icloud-support-bundle.mjs`. Its callback receives a read-only local
snapshot path plus separately parsed `cloudProgress` data (and the legacy
`cloudSnapshot` compatibility field when present). Import cloud data only into
a new temporary store created for diagnosis; never pass the production
Chessticize database path to a replay.
