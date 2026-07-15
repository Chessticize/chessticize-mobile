# Android Progress Backup Contract

Android Progress Backup is operating-system-managed restore protection for the
local progress database. It is not synchronization between active devices and
does not add a Chessticize account or a cross-platform transfer path.

## Included data

The Android backup rules explicitly allowlist only the main database:

- `chessticize-mobile.sqlite`

Android's backup parser automatically expands that database rule to the real
`chessticize-mobile.sqlite-journal` and `chessticize-mobile.sqlite-wal`
sidecars. The XML must not list those sidecars itself: every explicit database
path is expanded again, which would admit recursive suffixes such as
`chessticize-mobile.sqlite-wal-wal`. This is the behavior implemented by
[Android's `FullBackup` parser](https://android.googlesource.com/platform/frameworks/base/+/HEAD/core/java/android/app/backup/FullBackup.java#667).

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
The presence of explicit includes excludes every other eligible app file.
Bundled puzzle data and Stockfish networks remain installed application assets;
caches, logs, temporary files, generated output, and test fixtures are outside
the allowlist.

## Platform rules

- API 24-27 fails closed because those versions cannot advertise the
  client-side encryption and D2D transport flags added in API 28.
- API 28-30 allows each progress database file only when the transport reports
  either client-side encryption or device-to-device transfer.
- API 31+ uses separate `cloud-backup` and `device-transfer` sections. Cloud
  backup sets `disableIfNoEncryptionCapabilities="true"`; D2D remains available
  under Android's supported device-transfer behavior.
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

The exact-head Android workflow first runs the real APK against Android's backup
parser and LocalTransport on API 24 and API 30. It proves that API 24 emits no
database payload even when encryption is advertised, API 30 emits no database
payload without a qualifying capability, and encrypted API 30 emits exactly the
main database, journal, and WAL once while rejecting recursive suffix traps. It
also creates progress through public UI, measures the real database payload,
exercises an encrypted local cloud transport restore,
then backs up and restores the immutable released SQLite fixture through the
Android D2D transport. Both clean-install restores launch the real app and
assert preserved progress through public UI; the released fixture follows the
normal startup migration path.
