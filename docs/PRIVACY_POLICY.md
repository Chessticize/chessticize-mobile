# Chessticize Mobile Privacy Policy

Effective date: 2026-07-14

Chessticize Mobile is an offline-first chess training app. The 1.0 app does not
create Chessticize accounts, does not show ads, does not use analytics SDKs, and
does not send your training activity to Chessticize. Private platform-managed
copies are described below.

## Data Collection

Chessticize Mobile does not collect data from the app.

Training data is stored locally on your device so the app can work offline. This
local data can include puzzle ratings, sprint history, puzzle attempts, review
queue state, settings, and local notification preferences. This data is not
transmitted to Chessticize.

iCloud Sync defaults on and can be turned off in Settings. When enabled,
Chessticize Mobile stores a progress snapshot in your private iCloud account
using Apple's CloudKit service so your Apple devices can merge ratings, history,
and review queue state. Chessticize does not operate a sync server and does not
have a Chessticize account system for this data.

On Android, Android Progress Backup can copy the local progress database for
encrypted cloud restore or supported device-to-device transfer when those
features are available and enabled in Android settings. This operating-system
service is restore protection, not continuous synchronization. Chessticize does
not operate the backup service, does not receive this backup data, and does not
enable transfer between Android and iOS.

## Tracking

Chessticize Mobile does not track you across apps or websites owned by other
companies.

## Network Use

The 1.0 app is designed to practice without a network connection. Puzzle data
and Stockfish analysis run on device. iCloud Sync uses Apple's iCloud and
CloudKit network services only while it is enabled. Development builds can
connect to local developer tooling, but release builds do not require Metro or a
Chessticize server to practice.

Android Progress Backup may use Android or Google backup network services when
enabled in the device's system settings. The app does not operate that service
or add its own backup network connection.

## Notifications

If you enable review reminders, Chessticize Mobile schedules local notifications
on your device. There is no push notification server.

## Deleting Local Data

You can remove local app data by deleting Chessticize Mobile from your device.
Deleting the app removes the app's on-device storage, including local training
history, review queue state, settings, and locally cached progress.

Turning off iCloud Sync stops future sync attempts from the app. Data already
stored in iCloud is managed by your Apple ID and iCloud settings, and deleting
the app does not by itself delete existing iCloud records.

On Android, deleting the app removes its on-device storage, but Android may
retain an operating-system-managed backup according to the user's Android and
Google backup settings. A later installation or device transfer may restore
that progress database. Users manage that backup through Android settings.

## Contact

For privacy questions, email:

support@chessticize.com

You can also open an issue in the public repository:

https://github.com/Chessticize/chessticize-mobile
