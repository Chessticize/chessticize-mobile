package com.chessticize.mobile

import android.content.Intent
import android.os.Bundle
import android.os.Build
import android.util.Log
import androidx.activity.OnBackPressedCallback
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

interface ReactNativeBackCallbackController {
  fun setReactNativeBackHandlingEnabled(enabled: Boolean)
}

class MainActivity : ReactActivity(), ReactNativeBackCallbackController {
  private val reactNativeBackPressedCallback: OnBackPressedCallback by lazy(LazyThreadSafetyMode.NONE) {
    val callbackField = ReactActivity::class.java.getDeclaredField("mBackPressedCallback")
    @Suppress("DEPRECATION")
    callbackField.isAccessible = true
    callbackField.get(this) as OnBackPressedCallback
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX activity-before-super-on-create")
    ChessticizeTestLaunchArguments.capture(intent)
    super.onCreate(savedInstanceState)
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX activity-after-super-on-create")
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    ChessticizeTestLaunchArguments.capture(intent)
  }

  /**
   * React Native 0.86 keeps its target-36 callback private. The typed native
   * bridge owns app-level Back with one animation callback, so its registration
   * disables this competing default-priority callback. At the idle root both
   * callbacks are disabled and Android owns the predictive home animation.
   */
  override fun setReactNativeBackHandlingEnabled(enabled: Boolean) {
    if (Build.VERSION.SDK_INT < 36 || applicationInfo.targetSdkVersion < 36) {
      return
    }
    reactNativeBackPressedCallback.isEnabled = enabled
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ChessticizeMobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX activity-create-react-delegate")
    return DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
  }

  private companion object {
    const val STARTUP_TAG = "ChessticizeStartup"
    const val STARTUP_PREFIX = "[DEBUG-pr201-api24-startup]"
  }
}
