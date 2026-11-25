package com.chessticize.mobile

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.uimanager.ViewManager

class ApplicationMetadataModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ApplicationMetadata"

  override fun getConstants(): Map<String, Any> = mapOf(
    "versionName" to BuildConfig.VERSION_NAME,
    "buildNumber" to BuildConfig.VERSION_CODE.toString(),
    "preferredLanguages" to readPreferredLanguageTags(),
  )

  private fun readPreferredLanguageTags(): List<String> {
    val appLocales = AppCompatDelegate.getApplicationLocales()
    val locales = if (!appLocales.isEmpty) {
      appLocales
    } else {
      LocaleListCompat.getAdjustedDefault()
    }
    return (0 until locales.size()).mapNotNull { index ->
      locales[index]?.toLanguageTag()
    }
  }
}

class ApplicationMetadataPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(ApplicationMetadataModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
