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
Dev App ID.

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
pnpm mobile:ios:dev:device
```

With more than one physical device attached, select one explicitly:

```sh
pnpm mobile:ios:dev:device -- "Device Name or UDID"
```

The command is pinned to the Debug configuration. Do not pass `--mode Release`
or install a locally built Release app on a personal daily-use device for
pre-release testing.

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

When an iOS release candidate requires simulator E2E, run the same selected
scope against both Debug-Dev and Release-Production:

```sh
CHESSTICIZE_E2E_SCOPE=full \
  CHESSTICIZE_E2E_VARIANTS=both \
  DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh
```

The simulator suites remain deterministic and must not depend on a signed-in
personal iCloud account. Real Dev-container CloudKit validation is a separate
physical-device diagnostic using `pnpm mobile:ios:dev:device`.
