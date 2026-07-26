# iCloud Support Diagnostics

Chessticize for iOS can prepare a user-controlled support bundle from the
`Export Support Diagnostics` row in Settings. The row remains available when
iCloud Sync is off and when no known sync error is visible.

The bundle contains:

- `local-progress.sqlite`: a transactionally consistent SQLite backup that
  passed `PRAGMA quick_check` before packaging;
- `icloud-progress-snapshot.json`: the raw private CloudKit progress payload,
  when the signed-in account and container return one;
- `diagnostic.txt`: bounded app, sync, and last-failure fields;
- `manifest.json`: versions, account/container status, database health,
  checksums, availability, and privacy declarations.

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
JSON shape, and prints table names and record counts without printing progress
rows or the app-generated sync ID. It also accepts an already extracted bundle
directory.

For a focused replay tool, import `withICloudSupportBundle` from
`scripts/lib/icloud-support-bundle.mjs`. Its callback receives a read-only local
snapshot path and the separately parsed CloudKit snapshot object. Import the
cloud object only into a new temporary store created for diagnosis; never pass
the production Chessticize database path to a replay.
