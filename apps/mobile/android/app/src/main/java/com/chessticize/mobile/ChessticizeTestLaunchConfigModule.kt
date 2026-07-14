package com.chessticize.mobile

import android.content.Intent
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.CopyOnWriteArraySet

class ChessticizeTestLaunchConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ChessticizeTestLaunchConfig"

  private val launchConfigChangedListener = {
    reactApplicationContext.emitDeviceEvent(LAUNCH_CONFIG_CHANGED_EVENT)
  }

  override fun initialize() {
    super.initialize()
    if (BuildConfig.DEBUG) {
      ChessticizeTestLaunchArguments.addListener(launchConfigChangedListener)
    }
  }

  override fun invalidate() {
    ChessticizeTestLaunchArguments.removeListener(launchConfigChangedListener)
    super.invalidate()
  }

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

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  companion object {
    const val LAUNCH_CONFIG_CHANGED_EVENT = "chessticizeTestLaunchConfigChanged"
  }
}

object ChessticizeTestLaunchArguments {
  private val listeners = CopyOnWriteArraySet<() -> Unit>()

  @Volatile
  var current: Map<String, String> = emptyMap()
    private set

  fun capture(intent: Intent?) {
    val next = buildMap {
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
    current = next
    listeners.forEach { listener -> listener() }
  }

  fun addListener(listener: () -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: () -> Unit) {
    listeners.remove(listener)
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
