package com.chessticize.mobile

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX react-host-create-start")
    val packages =
      PackageList(this).packages.apply {
        add(ChessticizeTestLaunchConfigPackage())
        Log.i(STARTUP_TAG, "$STARTUP_PREFIX predictive-package-before-add")
        add(MobilePredictiveBackPackage())
        Log.i(STARTUP_TAG, "$STARTUP_PREFIX predictive-package-after-add")
        add(NativeStockfishEnginePackage())
      }
    getDefaultReactHost(
      context = applicationContext,
      packageList = packages,
    ).also {
      Log.i(STARTUP_TAG, "$STARTUP_PREFIX react-host-create-complete")
    }
  }

  override fun onCreate() {
    super.onCreate()
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX application-before-load-react-native")
    loadReactNative(this)
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX application-after-load-react-native")
  }

  private companion object {
    const val STARTUP_TAG = "ChessticizeStartup"
    const val STARTUP_PREFIX = "[DEBUG-pr201-api24-startup]"
  }
}
