package com.chessticize.mobile

import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.view.ViewTreeObserver
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.LifecycleEventListener
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
  private var handledFontScale = Float.NaN
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
    handledFontScale = resources.configuration.fontScale
    syncSystemBars()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    val fontScaleChanged = newConfig.fontScale != handledFontScale
    handledFontScale = newConfig.fontScale
    super.onConfigurationChanged(newConfig)
    syncSystemBars()
    if (fontScaleChanged) {
      publishFontScaleAfterLayout()
    }
  }

  /**
   * The activity handles `fontScale` in place (#637) instead of restarting and
   * dropping a live Run. React Native re-lays out its surfaces with the new
   * multiplier on the next layout pass, but in bridgeless mode DeviceInfo only
   * reports a new font scale to JavaScript on resume, so Dimensions and the
   * patched Text would keep the old value while the app stays in front. After
   * that layout pass, DeviceInfo re-reads the font scale and emits the change,
   * so JavaScript re-renders with a multiplier the native layout already uses.
   */
  private fun publishFontScaleAfterLayout() {
    val decorView = window.decorView
    decorView.viewTreeObserver.addOnGlobalLayoutListener(
      object : ViewTreeObserver.OnGlobalLayoutListener {
        override fun onGlobalLayout() {
          decorView.viewTreeObserver.removeOnGlobalLayoutListener(this)
          val deviceInfo = reactActivityDelegate.currentReactContext?.getNativeModule("DeviceInfo")
          (deviceInfo as? LifecycleEventListener)?.onHostResume()
        }
      },
    )
    decorView.requestLayout()
  }

  /**
   * Dark status and navigation bar icons on a light app appearance, light icons on dark. The
   * app's in-app override wins once JavaScript reports it; before that the bars follow the
   * system appearance, like the launch window.
   */
  internal fun syncSystemBars() {
    val systemNight =
      resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    val dark = AppSystemBarAppearance.barsDark(systemNight)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightNavigationBars = !dark
      isAppearanceLightStatusBars = !dark
    }
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
