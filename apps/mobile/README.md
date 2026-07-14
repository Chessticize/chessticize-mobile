# Chessticize Mobile

This is the Bare React Native app for Chessticize Mobile. iOS remains the
release-leading platform, and Android has a repeatable install-and-launch
baseline under the permanent `com.chessticize.mobile` identity.

The current app includes:

- A playable Practice screen for Standard Sprint and Arrow Duel.
- Reused `react-native-chessboard` board rendering.
- A local backend path using `PracticeService` plus `MemoryStore`, backed by the same core rules used by Node tests.
- Offline demo puzzles derived from `fixtures/puzzles/presolved-1000.json`.
- Component behavior tests with `react-test-renderer`.
- Detox iOS E2E configuration and specs.

## Commands

From the repository root:

```sh
pnpm mobile:typecheck
pnpm mobile:test
```

To preview the app locally on iOS, start Metro first:

```sh
pnpm --filter ChessticizeMobile start -- --host 127.0.0.1 --port 8081
```

In a second terminal, run the app on an installed simulator:

```sh
pnpm --filter ChessticizeMobile ios --terminal dumb --no-packager --simulator "iPhone 15"
```

Replace `iPhone 15` with a simulator returned by:

```sh
xcrun simctl list devices available
```

For native validation, use:

```sh
pnpm mobile:doctor:ios
pnpm mobile:e2e:build:ios
pnpm mobile:e2e:test:ios
```

The Detox build command runs `scripts/ios-build-for-detox.sh`. It checks Xcode simulator access, installs Ruby dependencies through Bundler when needed, runs CocoaPods, and then builds the iOS simulator app. Detox and simulator runs are final acceptance tools, not the default loop for ordinary UI state changes.

## Android Launch Baseline

Android builds support API 24 and newer, compile and target API 36, and package
only `arm64-v8a` and `x86_64` native libraries. The canonical platform values
live in `android/gradle.properties`; Gradle, diagnostics, SDK installation, and
ABI verification consume them. Install the pinned SDK tools, then run:

```sh
pnpm install --frozen-lockfile
pnpm mobile:install:android-sdk
pnpm fetch:core-pack
pnpm mobile:doctor:android
pnpm mobile:e2e:build:android
DETOX_ANDROID_DEVICE=emulator-5554 pnpm mobile:e2e:test:android
pnpm mobile:verify:android:abis
```

The Android test command starts and health-checks Metro, maps its port into the
emulator with `adb reverse`, and shuts Metro down after Detox completes. The
scheduled/manual Android CI workflow installs the debug APK on representative
API 24 and API 36 x86_64 emulators and verifies the real public Practice UI;
routine pull requests continue to use path-scoped fast checks.

Release packaging never uses `android/app/debug.keystore`. A release task fails
before packaging unless all four production values are provided:

- `CHESSTICIZE_ANDROID_RELEASE_STORE_FILE`
- `CHESSTICIZE_ANDROID_RELEASE_STORE_PASSWORD`
- `CHESSTICIZE_ANDROID_RELEASE_KEY_ALIAS`
- `CHESSTICIZE_ANDROID_RELEASE_KEY_PASSWORD`

The matching local Gradle properties are `chessticizeReleaseStoreFile`,
`chessticizeReleaseStorePassword`, `chessticizeReleaseKeyAlias`, and
`chessticizeReleaseKeyPassword`. Keep those values in a user-level Gradle file
or an untracked local file; never commit signing material.

## GUI Automation

Detox specs live in `e2e/practice.e2e.js`. They cover:

- Completing a Standard multi-step sprint.
- Viewing the completed attempt in History.
- Selecting the wrong Arrow Duel candidate.
- Seeing the Arrow Duel review output and due Review queue.

Component tests live in `__tests__/PracticePocScreen.test.tsx` and exercise the public UI flow without launching a simulator. They cover the app shell automation IDs, Standard board moves, Arrow Duel board moves, non-candidate Arrow Duel wrong moves, countdown expiry, History filtering, Settings, and Packs.

## Architecture Boundary

React components do not calculate ELO, puzzle success, Arrow Duel correctness, or review scheduling. They call `PracticeService`, which uses `packages/core` rules through a `PracticeStore` implementation.

`MemoryStore` is a maintained local store for the POC and tests. `SQLiteStore` remains the real Node SQLite implementation for storage integration tests.

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
