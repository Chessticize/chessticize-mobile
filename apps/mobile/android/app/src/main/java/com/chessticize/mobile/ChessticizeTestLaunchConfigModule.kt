package com.chessticize.mobile

import android.content.Intent
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.uimanager.ViewManager

class ChessticizeTestLaunchConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ChessticizeTestLaunchConfig"

  override fun getConstants(): MutableMap<String, Any> {
    if (!BuildConfig.DEBUG) {
      return mutableMapOf()
    }

    val constants = mutableMapOf<String, Any>("testControlsEnabled" to true)
    constants.putAll(ChessticizeTestLaunchArguments.current)
    return constants
  }
}

object ChessticizeTestLaunchArguments {
  @Volatile
  var current: Map<String, String> = emptyMap()
    private set

  fun capture(intent: Intent?) {
    current = buildMap {
      intent?.getStringExtra("chessticizeTestNowMs")?.let {
        put("testNowMs", it)
      }
      intent?.getStringExtra("chessticizePuzzleSelectionSeed")?.let {
        put("puzzleSelectionSeed", it)
      }
      intent?.getStringExtra("chessticizeStandardTargetCorrect")?.let {
        put("standardTargetCorrect", it)
      }
    }
  }
}

class ChessticizeTestLaunchConfigPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(ChessticizeTestLaunchConfigModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
