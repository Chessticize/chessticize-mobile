# Android Progress Backup Contract

Android Progress Backup is operating-system-managed restore protection for the
local progress database. It is not synchronization between active devices and
does not add a Chessticize account or a cross-platform transfer path.

## Included data

The Android backup rules explicitly allowlist only the main database for the
inherited restore path on API 28 and later:

- `chessticize-mobile.sqlite`

Android's XML parser automatically expands that database rule to the real
`chessticize-mobile.sqlite-journal` and `chessticize-mobile.sqlite-wal`
sidecars. The restore XML must not list those sidecars itself: every explicit database
path is expanded again, which would admit recursive suffixes such as
`chessticize-mobile.sqlite-wal-wal`. This is the behavior implemented by
[Android's `FullBackup` parser](https://android.googlesource.com/platform/frameworks/base/+/HEAD/core/java/android/app/backup/FullBackup.java#667).

Backup emission is owned by the manifest-bound `ProgressBackupAgent`, not by
default XML traversal. The application sets `android:fullBackupOnly="true"` so
Android invokes file-based full backup instead of falling back to key-value
backup. Android still requires a custom agent to implement the abstract
key-value callbacks, so `onBackup(...)` and `onRestore(...)` are deliberately
inert and never read or write key-value entities. The agent never calls
`super.onFullBackup(...)`. On API 28 and later it
reads `FullBackupDataOutput.getTransportFlags()` and emits only the canonical,
existing regular files for the main database and its exact `-journal` and
`-wal` sidecars. Each file is considered once, and the payload is selected once
when client-side encryption **or** device-to-device transfer is active,
including when both flags are active. The agent does not override file-restore
methods, so Android's default file restore path continues to enforce the XML
allowlist. See
Android's guidance for [implementing a custom backup agent](https://developer.android.com/identity/data/autobackup#ImplementBackupAgent)
and the [`fullBackupOnly` manifest attribute](https://developer.android.com/reference/android/R.attr#fullBackupOnly).

The production path is deliberate: `MOBILE_DATABASE_LAYOUT` names
`chessticize-mobile.sqlite`, `DeviceSQLiteStore.open(...)` passes that name to
OP-SQLite, and the pinned Android bridge uses `Context.getDatabasePath(...)` as
its base directory. The files therefore belong to Android's `database` backup
domain. The existing Android migration journey uses the same
`databases/chessticize-mobile.sqlite` path.

The effective three-file allowlist includes the `-journal` rollback file and
`-wal` write-ahead log because
they can contain recovery or committed transaction state that has not reached
the main database file. SQLite's `-shm` file is a derived WAL index with no
persistent content, so it is intentionally excluded and recreated after
restore. See SQLite's documentation on
[temporary files](https://www.sqlite.org/tempfiles.html).

Settings, ratings, attempts, sessions, and the review queue already live in the
progress database, so no shared preferences or extra metadata files are needed.
The agent's explicit file selection excludes every other eligible app file
during backup, and the XML includes enforce the same boundary during default
restore.
Bundled puzzle data and Stockfish networks remain installed application assets;
caches, logs, temporary files, generated output, and test fixtures are outside
the allowlist.

## Platform rules

- API 24-27 fails closed in `ProgressBackupAgent` before it touches
  `getTransportFlags()`, because those versions cannot advertise the
  client-side encryption and D2D transport flags added in API 28. The base XML
  restore rules also contain no include.
- API 28-30 XML contains one path-only main-database include for inherited file
  restore. Its former duplicated `requireFlags` backup conditions were
  redundant because the custom agent never invokes default XML backup
  traversal. During inherited restore, Android uses parsed includes for path
  membership and does not consult their backup transport requirements.
- API 28+ backup capability policy therefore lives only in
  `ProgressBackupAgent`: it emits the exact progress payload when the framework
  delivers the client-side encryption flag, the D2D flag, or both. Neither
  flag emits no app-data payload.
- API 31+ uses separate `cloud-backup` and `device-transfer` sections. Cloud
  backup sets `disableIfNoEncryptionCapabilities="true"`; D2D remains available
  under Android's supported device-transfer behavior. These sections remain the
  inherited default restore allowlist; the agent enforces the same capability
  boundary for backup.
- No `cross-platform-transfer` section is declared.

These choices follow the current Android guidance for
[Auto Backup](https://developer.android.com/identity/data/autobackup),
[Android 12 backup behavior](https://developer.android.com/about/versions/12/behavior-changes-12),
and [backup/restore testing](https://developer.android.com/identity/data/testingbackup).

## Quota guard

Android Auto Backup provides a 25 MiB per-user quota. The release guard measures
each eligible physical file once and caps the complete progress database plus
its two real SQLite sidecars at 20 MiB, preserving at
least 5 MiB (20 percent) headroom. This stricter guard leaves room for rollback
journal or WAL growth between a release measurement and Android's later backup
snapshot, and catches payload growth before Android's hard quota interrupts
cloud backup. The guard fails closed above 20 MiB:

```sh
pnpm mobile:verify:android:backup -- --database /path/to/progress.sqlite
```

For an installed debuggable evidence build:

```sh
pnpm mobile:verify:android:backup -- --adb-device emulator-5554 --json
```

The exact-head Android workflow gates the pure Java policy and canonical-file
selector before building the APK, then runs that APK against the Android backup
framework and LocalTransport on API 24, API 30, and API 36. API 24 proves the
pre-flags agent path fails closed. API 30 proves a delivered mask of `0` emits
no app-data payload through the same agent policy used on newer releases and
that LocalTransport reports the package as rejected while the overall backup
operation completes. It then performs a real inherited `bmgr restore` with an
OS-generated exact-APK manifest and deterministic positive and negative domain
entries. Exact hashes prove the main database, journal, and WAL restore, while
filesystem absence proves recursive and cross-sidecars, `-shm`, another
database, and credential- and device-protected domain traps remain excluded.
The temporary `fake_encryption_flag` used to obtain the OS-generated manifest
is skeleton generation only, not capability evidence; Android 11's
LocalTransport does not expose real encryption or D2D capability parameters.
See the authoritative
[Android 11 LocalTransport parameters](https://android.googlesource.com/platform/frameworks/base/+/android11-release/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java).

API 36 uses the authoritative Android 16 LocalTransport `is_encrypted` and
`is_device_transfer` parameters and asserts the agent receives masks `0`, `1`,
`2`, and `3`. It proves neither emits no app data and encryption-only, D2D-only,
and both produce an archive containing exactly the main database, journal, and
WAL once. Android can invoke `onFullBackup(...)` repeatedly for quota
measurement and actual emission, so agent logs may contain repeated identical
policy/result/payload groups. The harness requires every group to agree on the
mask, decision, and file set; the canonical transport archive is the
authoritative exact-once payload proof. Every payload
case rejects unique nonzero traps across credential- and device-protected root,
files, shared-preference, and database domains, plus recursive sidecar and
`-shm` traps. See the authoritative
[Android 16 LocalTransport parameters](https://android.googlesource.com/platform/frameworks/base/+/android-16.0.0_r1/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java).

The workflow also creates progress through public UI, measures the real
database payload, and exercises an encrypted local cloud transport restore.
For the released migration case, it clears the app data, seeds the immutable
schema-v0 SQLite fixture, and records its exact byte size, SHA-256, user version,
schema, package state, and absent process before backup. Because `pm clear`
marks the package stopped, the lane first proves Android 16 exposes `pm unstop`,
uses it to clear `FLAG_STOPPED` without launching an activity, and records
`stopped=false`. No activity or Detox journey launches between seeding and the
D2D BackupManager invocation; repeated stat, hash, schema, and user-version
checks prove the fixture is still unchanged. Only after clean
uninstall, reinstall, and system restore does Detox launch the public UI; that
launch exercises the normal startup migration and asserts the preserved legacy
rating and history row with the fixture-aligned clock.
