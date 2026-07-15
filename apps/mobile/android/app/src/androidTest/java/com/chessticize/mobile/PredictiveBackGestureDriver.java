package com.chessticize.mobile;

import android.graphics.Point;
import android.os.SystemClock;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;

/**
 * Test-only public-UI driver for a Predictive Back gesture that crosses and retreats.
 * It only injects touchscreen input through UiAutomator; it never calls app stores,
 * handlers, native product modules, or test-only product state.
 */
public final class PredictiveBackGestureDriver {
  // UiDevice guarantees only a 5 ms minimum delay per swipe step, while exact API 36 CI
  // delivered these steps at roughly display-frame cadence (16-20 ms). Use a nominal
  // 60 Hz frame interval so the requested gesture duration remains bounded in CI.
  private static final int UI_AUTOMATOR_FRAME_DURATION_MS = 16;
  private static final long COMPLETION_MARGIN_MS = 5_000L;
  private static final Object GESTURE_LOCK = new Object();

  private static GestureState activeGesture;

  private PredictiveBackGestureDriver() {}

  public static void startCancelledPredictiveBack(
      int widthPixels,
      int heightPixels,
      int durationMs
  ) {
    if (widthPixels <= 0 || heightPixels <= 0 || durationMs <= 0) {
      throw new IllegalArgumentException("Display dimensions and duration must be positive.");
    }

    GestureState state = new GestureState(durationMs + COMPLETION_MARGIN_MS);
    Thread worker = new Thread(
        () -> injectCancelledPredictiveBack(state, widthPixels, heightPixels, durationMs),
        "chessticize-cancelled-predictive-back"
    );
    synchronized (GESTURE_LOCK) {
      if (activeGesture != null) {
        throw new IllegalStateException("A cancelled Predictive Back gesture is already active.");
      }
      activeGesture = state;
    }
    try {
      worker.start();
    } catch (RuntimeException | Error failure) {
      synchronized (GESTURE_LOCK) {
        if (activeGesture == state) {
          activeGesture = null;
        }
      }
      throw failure;
    }
  }

  public static void awaitCancelledPredictiveBack() {
    GestureState state;
    synchronized (GESTURE_LOCK) {
      state = activeGesture;
      if (state == null) {
        throw new IllegalStateException("No cancelled Predictive Back gesture is active.");
      }
      long deadlineMs = SystemClock.uptimeMillis() + state.timeoutMs;
      boolean terminal = false;
      try {
        while (!state.complete) {
          long remainingMs = deadlineMs - SystemClock.uptimeMillis();
          if (remainingMs <= 0) {
            throw new IllegalStateException("Cancelled Predictive Back gesture timed out.");
          }
          GESTURE_LOCK.wait(remainingMs);
        }
        terminal = true;
        rethrowGestureFailure(state.failure);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(
            "Interrupted while awaiting cancelled Predictive Back gesture.",
            interrupted
        );
      } finally {
        if (terminal && activeGesture == state) {
          activeGesture = null;
        }
      }
    }
  }

  private static void injectCancelledPredictiveBack(
      GestureState state,
      int widthPixels,
      int heightPixels,
      int durationMs
  ) {
    try {
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
          durationMs / segmentCount / UI_AUTOMATOR_FRAME_DURATION_MS
      );
      boolean injected = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
          .swipe(path, segmentSteps);
      if (!injected) {
        throw new IllegalStateException("Unable to inject cancelled Predictive Back gesture.");
      }
    } catch (Throwable failure) {
      synchronized (GESTURE_LOCK) {
        state.failure = failure;
      }
    } finally {
      synchronized (GESTURE_LOCK) {
        state.complete = true;
        GESTURE_LOCK.notifyAll();
      }
    }
  }

  private static void rethrowGestureFailure(Throwable failure) {
    if (failure == null) {
      return;
    }
    if (failure instanceof RuntimeException) {
      throw (RuntimeException) failure;
    }
    if (failure instanceof Error) {
      throw (Error) failure;
    }
    throw new IllegalStateException("Cancelled Predictive Back gesture failed.", failure);
  }

  private static final class GestureState {
    private final long timeoutMs;
    private boolean complete;
    private Throwable failure;

    private GestureState(long timeoutMs) {
      this.timeoutMs = timeoutMs;
    }
  }
}
