# iOS Development Build Isolation

Use the Debug identity for every pre-release install on a personal iPhone. It
can coexist with the App Store app and keeps both local progress and CloudKit
progress separate from production.

| Build configuration | Installed name | Bundle ID | CloudKit container | CloudKit environment |
| --- | --- | --- | --- | --- |
| Debug | Chessticize Dev | `com.chessticize.mobile.dev` | `iCloud.com.chessticize.mobile.dev` | Development |
| Release | Chessticize | `com.chessticize.mobile` | `iCloud.com.chessticize.mobile` | Provisioning-controlled production path |

The two bundle IDs give iOS separate app sandboxes, so their SQLite databases,
preferences, and uninstall lifecycle do not overlap. The separate iCloud
containers prevent either app from reading or merging the other app's private
CloudKit snapshot. Do not associate the production iCloud container with the
Dev App ID. Debug also uses the purple-banded `AppIconDev` icon so it remains
visually distinct from the App Store app on the Home Screen; Release continues
to use the production `AppIcon` asset.

## One-Time Apple Developer Setup

The repository declares the identifiers, but Apple must authorize them before
a signed physical-device build can use CloudKit:

1. Register the explicit App ID `com.chessticize.mobile.dev` for the Chessticize
   development team.
2. Enable iCloud with CloudKit for that App ID.
3. Create `iCloud.com.chessticize.mobile.dev` and associate only that container
   with the Dev App ID.
4. Regenerate the development provisioning profile, or let Xcode refresh it
   through automatic signing.
5. Confirm the signed Debug app's entitlements contain the Dev container and
   `com.apple.developer.icloud-container-environment = Development`.

Do not deploy this Dev container's schema to a production environment. It is a
disposable test data boundary, not a release data source.

## Install On A Physical Device

Connect and trust the iPhone, then run:

```sh
pnpm mobile:ios:dev:device "Device Name or UDID"
```

The device name or UDID is optional when exactly one physical iPhone or iPad is
paired. It is resolved through `xcrun devicectl list devices`, which also wakes
a paired device that `xctrace` still reports as offline. Simulators and Vision
Pro devices are ignored, and an ambiguous name is an error rather than a guess.
pnpm 11 forwards a literal `--` to the script, which then fails with a usage
error, so pass the device name without it.

The command does not need or use any iOS Simulator. It runs these steps in
order:

1. Resolve the device and sync the iOS version config.
2. Fetch the Core Pack (`pnpm fetch:core-pack`) when it is missing or does not
   match its manifest; the build fails without it.
3. Install the locked CocoaPods when `ios/Pods` is missing or stale.
4. `xcodebuild -configuration Debug -destination id=<UDID>` with
   `FORCE_BUNDLING=1`, so the JavaScript bundle is embedded and the app runs
   without Metro. No separate flag is needed for a standalone install.
5. Confirm the built app is `com.chessticize.mobile.dev` and contains
   `main.jsbundle` (about 10 MB) before touching the device.
6. `xcrun devicectl device install app`, then
   `devicectl device process launch --terminate-existing`.

Add `--dry-run` to print the resolved device and the exact commands without
building or installing anything.

The command is pinned to the Debug configuration and the Dev identity; it
accepts no `--mode` or configuration option. Do not install a locally built
Release app on a personal daily-use device for pre-release testing.

The built app is `apps/mobile/ios/build/Build/Products/Debug-iphoneos/Chessticize.app`.
To confirm a standalone launch, make sure no Metro is running
(`lsof -iTCP:8081 -sTCP:LISTEN` is empty) and open the app from the Home Screen.

After the first install, verify both `Chessticize` and `Chessticize Dev` are
present. In Dev, leave iCloud Sync enabled, complete a small practice run, use
Sync Now, relaunch, and confirm the Dev progress returns without changing the
production app's rating, History, or Review queue.

## Simulator E2E

Ordinary native-impacting PR evidence can run the risk-selected scope on Debug:

```sh
CHESSTICIZE_E2E_SCOPE=practice \
  CHESSTICIZE_E2E_VARIANTS=debug \
  DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh
```

For Release/TestFlight validation, select the affected scope and target identity
under `docs/TESTING_ARCHITECTURE.md`. Use `release` for Production-identity risk;
use `both` only when configuration differences need coverage. A release alone
does not require dual execution or full scope.

The simulator suites remain deterministic and must not depend on a signed-in
personal iCloud account. Real Dev-container CloudKit validation is a separate
physical-device diagnostic using `pnpm mobile:ios:dev:device`.
