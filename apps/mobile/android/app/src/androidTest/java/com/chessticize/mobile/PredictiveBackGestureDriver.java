package com.chessticize.mobile;

import android.graphics.Point;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;

/**
 * Test-only public-UI driver for a Predictive Back gesture that crosses and retreats.
 * It only injects touchscreen input through UiAutomator; it never calls app stores,
 * handlers, native product modules, or test-only product state.
 */
public final class PredictiveBackGestureDriver {
  private static final int UI_AUTOMATOR_STEP_DURATION_MS = 5;

  private PredictiveBackGestureDriver() {}

  public static void cancelPredictiveBack(int widthPixels, int heightPixels, int durationMs) {
    if (widthPixels <= 0 || heightPixels <= 0 || durationMs <= 0) {
      throw new IllegalArgumentException("Display dimensions and duration must be positive.");
    }

    int centerY = Math.round(heightPixels / 2f);
    Point activated = new Point(Math.round(widthPixels * 0.45f), centerY);
    Point[] path = {
      new Point(1, centerY),
      activated,
      activated,
      new Point(Math.max(2, Math.round(widthPixels * 0.03f)), centerY),
    };
    int segmentCount = path.length - 1;
    int segmentSteps = Math.max(
        1,
        durationMs / segmentCount / UI_AUTOMATOR_STEP_DURATION_MS
    );
    boolean injected = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        .swipe(path, segmentSteps);
    if (!injected) {
      throw new IllegalStateException("Unable to inject cancelled Predictive Back gesture.");
    }
  }
}
