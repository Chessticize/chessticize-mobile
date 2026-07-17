package com.chessticize.mobile

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
  )
}

class ApplicationMetadataPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(ApplicationMetadataModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
