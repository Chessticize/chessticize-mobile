package com.chessticize.mobile

import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory

interface ReactNativeBackCallbackController {
  fun setReactNativeBackHandlingEnabled(enabled: Boolean)
}

enum class ReviewReminderPermissionResult {
  GRANTED,
  DENIED,
  DISMISSED,
}

internal fun reviewReminderPermissionResult(grantResults: IntArray): ReviewReminderPermissionResult = when {
  grantResults.isEmpty() -> ReviewReminderPermissionResult.DISMISSED
  grantResults.first() == PackageManager.PERMISSION_GRANTED -> ReviewReminderPermissionResult.GRANTED
  else -> ReviewReminderPermissionResult.DENIED
}

class MainActivity : ReactActivity(), ReactNativeBackCallbackController, ReviewReminderPermissionHost {
  private var reviewReminderPermissionCallback: ((ReviewReminderPermissionResult) -> Unit)? = null
  private val reactNativeBackPressedCallback: OnBackPressedCallback by lazy(LazyThreadSafetyMode.NONE) {
    val callbackField = ReactActivity::class.java.getDeclaredField("mBackPressedCallback")
    @Suppress("DEPRECATION")
    callbackField.isAccessible = true
    callbackField.get(this) as OnBackPressedCallback
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    ChessticizeTestLaunchArguments.capture(intent)
    // react-native-screens: discard fragment state restored across Activity
    // restarts. The app always starts on Practice with fresh JavaScript state,
    // so the native tab host must not restore the previous tab selection (#612).
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(null)
    syncNavigationBarIcons()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    syncNavigationBarIcons()
  }

  /** Dark navigation bar icons on the light system appearance, light icons on dark. */
  private fun syncNavigationBarIcons() {
    val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = !night
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    ChessticizeTestLaunchArguments.capture(intent)
  }

  override fun requestReviewReminderPermission(callback: (ReviewReminderPermissionResult) -> Unit): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      callback(ReviewReminderPermissionResult.GRANTED)
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
    callback?.invoke(reviewReminderPermissionResult(grantResults))
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
