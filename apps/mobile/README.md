# Chessticize Mobile POC

This is the Bare React Native iOS-first proof of concept for Chessticize Mobile.

The POC includes:

- A playable Practice screen for Standard Sprint and Arrow Duel.
- Reused `react-native-chessboard` board rendering.
- A local backend path using `PracticeService` plus `MemoryStore`, backed by the same core rules used by Node tests.
- Fixture puzzles from `fixtures/puzzles/presolved-sample.json`.
- Component behavior tests with `react-test-renderer`.
- Detox iOS E2E configuration and specs.

The current Codex host has full Xcode at `/Applications/Xcode.app`, but the Xcode license has not been accepted for this user session. iOS simulator build and Detox execution require the license to be accepted from a Terminal session before they can run. Metro iOS bundling, TypeScript, and component tests are verified.

## Commands

From the repository root:

```sh
pnpm mobile:typecheck
pnpm mobile:test
pnpm mobile:doctor:ios
pnpm --filter ChessticizeMobile exec react-native bundle --entry-file index.js --platform ios --dev true --bundle-output /tmp/chessticize-mobile-ios.jsbundle --assets-dest /tmp/chessticize-mobile-assets --reset-cache
```

On a Mac with full Xcode:

```sh
sudo DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -license accept
pnpm mobile:doctor:ios
pnpm mobile:ios
pnpm mobile:e2e:build:ios
pnpm mobile:e2e:test:ios
```

The Detox build command runs `scripts/ios-build-for-detox.sh`. It checks Xcode simulator access, installs Ruby dependencies through Bundler when needed, runs CocoaPods, and then builds the iOS simulator app.

## GUI Automation

Detox specs live in `e2e/practice.e2e.js`. They cover:

- Completing a Standard multi-step sprint.
- Viewing the completed attempt in History.
- Selecting the wrong Arrow Duel candidate.
- Seeing the Arrow Duel review output and due Review queue.

Component tests live in `__tests__/PracticePocScreen.test.tsx` and exercise the same public UI flow without launching a simulator.

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
