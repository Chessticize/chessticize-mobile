type ReleaseConfigGlobals = typeof globalThis & {
  __CHESSTICIZE_ENABLE_TEST_CONTROLS__?: boolean;
  __CHESSTICIZE_PRACTICE_DEBUG__?: boolean;
  __DEV__?: boolean;
};

export function isReactNativeDevBuild(globals: ReleaseConfigGlobals = globalThis): boolean {
  return globals.__DEV__ === true;
}

export function arePracticeTestControlsEnabled(globals: ReleaseConfigGlobals = globalThis): boolean {
  if (globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ !== undefined) {
    return globals.__CHESSTICIZE_ENABLE_TEST_CONTROLS__;
  }
  return isReactNativeDevBuild(globals);
}

export function isPracticeDebugEnabled(globals: ReleaseConfigGlobals = globalThis): boolean {
  return globals.__CHESSTICIZE_PRACTICE_DEBUG__ === true;
}

export function shouldSuppressLogBoxWarnings(globals: ReleaseConfigGlobals = globalThis): boolean {
  return isReactNativeDevBuild(globals);
}
