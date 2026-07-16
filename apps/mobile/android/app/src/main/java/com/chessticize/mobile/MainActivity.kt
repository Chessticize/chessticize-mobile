package com.chessticize.mobile

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

interface ReactNativeBackCallbackController {
  fun setReactNativeBackHandlingEnabled(enabled: Boolean)
}

class MainActivity : ReactActivity(), ReactNativeBackCallbackController, ReviewReminderPermissionHost {
  private var reviewReminderPermissionCallback: ((Boolean) -> Unit)? = null
  private val reactNativeBackPressedCallback: OnBackPressedCallback by lazy(LazyThreadSafetyMode.NONE) {
    val callbackField = ReactActivity::class.java.getDeclaredField("mBackPressedCallback")
    @Suppress("DEPRECATION")
    callbackField.isAccessible = true
    callbackField.get(this) as OnBackPressedCallback
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    ChessticizeTestLaunchArguments.capture(intent)
    ReviewReminderRouteBus.capture(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    ChessticizeTestLaunchArguments.capture(intent)
    ReviewReminderRouteBus.capture(intent)
  }

  override fun requestReviewReminderPermission(callback: (Boolean) -> Unit): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      callback(true)
      return true
    }
    if (reviewReminderPermissionCallback != null) {
      return false
    }
    reviewReminderPermissionCallback = callback
    requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), REVIEW_REMINDER_PERMISSION_REQUEST_CODE)
    return true
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REVIEW_REMINDER_PERMISSION_REQUEST_CODE) {
      return
    }
    val callback = reviewReminderPermissionCallback
    reviewReminderPermissionCallback = null
    callback?.invoke(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
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
  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  private companion object {
    const val REVIEW_REMINDER_PERMISSION_REQUEST_CODE = 182
  }
}
