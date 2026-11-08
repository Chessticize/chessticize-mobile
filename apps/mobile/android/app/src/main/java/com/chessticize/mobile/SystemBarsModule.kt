package com.chessticize.mobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager

/**
 * The app's effective appearance as last reported by JavaScript, so the system bars follow an
 * in-app Light or Dark override (#632). Null until JavaScript reports, which leaves the bars on
 * the system appearance that the launch window also uses.
 */
internal object AppSystemBarAppearance {
  @Volatile
  var dark: Boolean? = null

  fun barsDark(systemNight: Boolean): Boolean = dark ?: systemNight
}

class SystemBarsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ChessticizeSystemBars"

  @ReactMethod
  fun setAppearance(scheme: String) {
    AppSystemBarAppearance.dark = when (scheme) {
      "dark" -> true
      "light" -> false
      else -> return
    }
    UiThreadUtil.runOnUiThread {
      (reactApplicationContext.currentActivity as? MainActivity)?.syncSystemBars()
    }
  }
}

class SystemBarsPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(SystemBarsModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
