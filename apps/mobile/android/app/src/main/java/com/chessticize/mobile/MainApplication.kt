package com.chessticize.mobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    val packages =
      PackageList(this).packages.apply {
        add(ApplicationMetadataPackage())
        add(ChessticizeTestLaunchConfigPackage())
        add(MobilePredictiveBackPackage())
        add(NativeStockfishEnginePackage())
        add(ReviewReminderNotificationsPackage())
      }
    getDefaultReactHost(
      context = applicationContext,
      packageList = packages,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
