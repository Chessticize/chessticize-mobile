package com.chessticize.mobile;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.backup.BackupAgent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import com.facebook.react.bridge.BridgeReactContext;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.PromiseImpl;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A platform-only probe for the non-debuggable optimized target. AndroidX's
 * JUnit runner is compiled separately and expects unoptimized Kotlin/AndroidX
 * dependency ABIs from the target APK, so it cannot prove the production R8
 * graph without widening keep rules. This runner intentionally uses only the
 * platform Instrumentation API while crossing the app's real reflection, JNI,
 * manifest, reminder, and storage boundaries.
 */
public final class R8ValidationInstrumentation extends Instrumentation {
  private static final String RESULT_MARKER = "R8_VALIDATION_PASS";
  private static final String DATABASE_NAME = "chessticize-mobile.sqlite";
  private static final String FIXTURE_NAME = "schema-v0-ios-1.0.0.sqlite";
  private static final long FIXTURE_BYTES = 114688L;

  @Override
  public void onCreate(Bundle arguments) {
    super.onCreate(arguments);
    start();
  }

  @Override
  public void onStart() {
    Bundle results = new Bundle();
    try {
      Context targetContext = getTargetContext();
      require(
          (targetContext.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0,
          "R8 validation target must be non-debuggable");
      verifyReflectionBoundaries();
      verifyStockfishLifecycle(targetContext);
      verifyManifestEntryPoints(targetContext);
      installReleasedDatabaseFixture(targetContext, getContext());
      results.putString(REPORT_KEY_STREAMRESULT, "\n" + RESULT_MARKER + "\n");
      finish(Activity.RESULT_OK, results);
    } catch (Throwable error) {
      results.putString(
          REPORT_KEY_STREAMRESULT,
          "\nR8_VALIDATION_FAIL: " + error + "\n" + Arrays.toString(error.getStackTrace()) + "\n");
      finish(Activity.RESULT_CANCELED, results);
    }
  }

  private static void verifyReflectionBoundaries() throws Exception {
    Class<?> reactActivity = Class.forName("com.facebook.react.ReactActivity");
    Field callbackField = reactActivity.getDeclaredField("mBackPressedCallback");
    require(
        callbackField.getType().getName().equals("androidx.activity.OnBackPressedCallback"),
        "ReactActivity Back callback field type changed");

    Class<?> delegate = Class.forName(
        "com.chessticize.mobile.MobilePredictiveBackApi34Delegate");
    Constructor<?> constructor = Arrays.stream(delegate.getDeclaredConstructors())
        .filter(candidate -> candidate.getParameterCount() == 1)
        .findFirst()
        .orElseThrow(() -> new AssertionError("Predictive Back constructor is missing"));
    Class<?> eventSinkType = constructor.getParameterTypes()[0];
    Object eventSink = Proxy.newProxyInstance(
        eventSinkType.getClassLoader(),
        new Class<?>[] {eventSinkType},
        (proxy, method, arguments) -> null);
    constructor.setAccessible(true);
    Object instance = constructor.newInstance(eventSink);
    require(instance != null, "Predictive Back delegate was not constructed");

    Method register = Arrays.stream(delegate.getDeclaredMethods())
        .filter(method -> Arrays.equals(
            method.getParameterTypes(),
            new Class<?>[] {Activity.class}))
        .findFirst()
        .orElseThrow(() -> new AssertionError("Predictive Back register method is missing"));
    register.setAccessible(true);
    register.invoke(instance, new Object[] {null});
  }

  @SuppressWarnings("deprecation")
  private static void verifyStockfishLifecycle(Context targetContext) throws Exception {
    BridgeReactContext reactContext = new BridgeReactContext(targetContext);
    NativeStockfishEngineModule module = new NativeStockfishEngineModule(reactContext);
    try {
      require(awaitStart(module), "First Stockfish start must create an engine");
      require(!awaitStart(module), "Second Stockfish start must reuse its engine");
      module.send("stop");
      module.onHostPause();
      module.terminate();
      require(awaitStart(module), "Stockfish must restart after termination");
    } finally {
      module.invalidate();
    }
  }

  private static boolean awaitStart(NativeStockfishEngineModule module) throws Exception {
    CountDownLatch completed = new CountDownLatch(1);
    AtomicReference<Object> resolved = new AtomicReference<>();
    AtomicReference<Object> rejected = new AtomicReference<>();
    Callback resolve = arguments -> {
      resolved.set(arguments.length == 0 ? null : arguments[0]);
      completed.countDown();
    };
    Callback reject = arguments -> {
      rejected.set(arguments.length == 0 ? null : arguments[0]);
      completed.countDown();
    };
    module.start(new PromiseImpl(resolve, reject));
    require(completed.await(120, TimeUnit.SECONDS), "Stockfish start timed out");
    require(rejected.get() == null, "Stockfish start rejected: " + rejected.get());
    return Boolean.TRUE.equals(resolved.get());
  }

  private static void verifyManifestEntryPoints(Context context) throws Exception {
    PackageManager packageManager = context.getPackageManager();
    for (String receiverName : new String[] {
        "com.chessticize.mobile.ReviewReminderAlarmReceiver",
        "com.chessticize.mobile.ReviewReminderLifecycleReceiver"
    }) {
      ComponentName component = new ComponentName(context.getPackageName(), receiverName);
      ActivityInfo info = packageManager.getReceiverInfo(component, 0);
      require(!info.exported, receiverName + " must remain unexported");
      BroadcastReceiver receiver = (BroadcastReceiver) Class.forName(receiverName)
          .getDeclaredConstructor()
          .newInstance();
      receiver.onReceive(context, new Intent("com.chessticize.mobile.R8_PROBE_UNOWNED"));
    }

    String tapActivityName = "com.chessticize.mobile.ReviewReminderTapActivity";
    ActivityInfo tapInfo = packageManager.getActivityInfo(
        new ComponentName(context.getPackageName(), tapActivityName),
        0);
    require(!tapInfo.exported, "Review reminder tap activity must remain unexported");
    require(
        Activity.class.isAssignableFrom(Class.forName(tapActivityName)),
        "Review reminder tap activity class is missing");
    require(
        BackupAgent.class.isAssignableFrom(Class.forName(
            "com.chessticize.mobile.backup.ProgressBackupAgent")),
        "Progress Backup agent class is missing");
  }

  private static void installReleasedDatabaseFixture(
      Context targetContext,
      Context instrumentationContext) throws Exception {
    File database = targetContext.getDatabasePath(DATABASE_NAME);
    targetContext.deleteDatabase(DATABASE_NAME);
    File parent = database.getParentFile();
    require(parent != null && (parent.isDirectory() || parent.mkdirs()),
        "Could not create the target database directory");
    try (InputStream source = instrumentationContext.getAssets().open(FIXTURE_NAME);
         OutputStream target = new java.io.FileOutputStream(database)) {
      byte[] buffer = new byte[8192];
      int count;
      while ((count = source.read(buffer)) != -1) {
        target.write(buffer, 0, count);
      }
    }
    require(database.isFile(), "Released database fixture was not installed");
    require(database.length() == FIXTURE_BYTES, "Released database fixture size changed");
  }

  private static void require(boolean condition, String message) {
    if (!condition) {
      throw new AssertionError(message);
    }
  }
}
