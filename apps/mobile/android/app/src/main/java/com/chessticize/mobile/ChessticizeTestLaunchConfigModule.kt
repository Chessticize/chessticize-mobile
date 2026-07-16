package com.chessticize.mobile

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ViewManager

class ChessticizeTestLaunchConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ChessticizeTestLaunchConfig"

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getLaunchConfig(): WritableMap {
    val config = Arguments.createMap()
    if (!BuildConfig.DEBUG) {
      return config
    }

    config.putBoolean("testControlsEnabled", true)
    ChessticizeTestLaunchArguments.current.forEach { (key, value) ->
      config.putString(key, value)
    }
    return config
  }
}

object ChessticizeTestLaunchArguments {
  @Volatile
  var current: Map<String, String> = emptyMap()
    private set

  fun capture(intent: Intent?) {
    val launchArgs = intent?.getBundleExtra("launchArgs")
    current = buildMap {
      testLaunchArgument(intent, launchArgs, "chessticizeTestNowMs")?.let {
        put("testNowMs", it)
      }
      testLaunchArgument(intent, launchArgs, "chessticizePuzzleSelectionSeed")?.let {
        put("puzzleSelectionSeed", it)
      }
      testLaunchArgument(intent, launchArgs, "chessticizeArrowDuelTargetCorrect")?.let {
        put("arrowDuelTargetCorrect", it)
      }
      testLaunchArgument(intent, launchArgs, "chessticizeCustomTargetCorrect")?.let {
        put("customTargetCorrect", it)
      }
      testLaunchArgument(intent, launchArgs, "chessticizeStandardTargetCorrect")?.let {
        put("standardTargetCorrect", it)
      }
      testLaunchArgument(intent, launchArgs, "chessticizeTestReminderDelayMs")?.let {
        put("reviewReminderDelayMs", it)
      }
    }
  }

  private fun testLaunchArgument(intent: Intent?, launchArgs: Bundle?, key: String): String? =
    launchArgs?.getString(key) ?: intent?.getStringExtra(key)
}

class ChessticizeTestLaunchConfigPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(ChessticizeTestLaunchConfigModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
