package com.chessticize.mobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val STOCKFISH_LINE_EVENT = "StockfishEngineLine"

class NativeStockfishEngineModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private val engineExecutor: ExecutorService =
    Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "chessticize-stockfish").apply { isDaemon = true }
    }
  private var nativeHandle: Long = 0

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "NativeStockfishEngine"

  @ReactMethod
  fun start(promise: Promise) {
    engineExecutor.execute {
      try {
        if (nativeHandle == 0L) {
          ensureNativeLibraryLoaded()
          nativeHandle = nativeCreate()
          check(nativeHandle != 0L) { "The on-device engine could not be initialized." }
        }
        promise.resolve(null)
      } catch (error: Throwable) {
        if (nativeHandle != 0L) {
          nativeDestroy(nativeHandle)
          nativeHandle = 0
        }
        promise.reject(
          "stockfish_start_failed",
          "Stockfish could not load its bundled NNUE assets. Retry analysis; reinstall the app if the problem continues.",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun send(command: String) {
    engineExecutor.execute {
      if (nativeHandle != 0L) {
        nativeSend(nativeHandle, command)
      }
    }
  }

  @ReactMethod
  fun terminate() {
    enqueueDestroy()
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  @Suppress("DEPRECATION")
  fun emitLine(line: String) {
    val payload = WritableNativeMap().apply { putString("line", line) }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(STOCKFISH_LINE_EVENT, payload)
  }

  override fun onHostResume() = Unit

  override fun onHostPause() {
    engineExecutor.execute {
      if (nativeHandle != 0L) {
        nativeSend(nativeHandle, "stop")
      }
    }
  }

  override fun onHostDestroy() {
    enqueueDestroy()
  }

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    enqueueDestroy()
    engineExecutor.shutdown()
    super.invalidate()
  }

  private fun enqueueDestroy() {
    if (engineExecutor.isShutdown) {
      return
    }
    engineExecutor.execute {
      if (nativeHandle != 0L) {
        nativeDestroy(nativeHandle)
        nativeHandle = 0
      }
    }
  }

  private external fun nativeCreate(): Long
  private external fun nativeSend(handle: Long, command: String)
  private external fun nativeDestroy(handle: Long)

  private companion object {
    @Volatile
    private var nativeLibraryLoaded = false

    @Synchronized
    fun ensureNativeLibraryLoaded() {
      if (!nativeLibraryLoaded) {
        System.loadLibrary("stockfish")
        nativeLibraryLoaded = true
      }
    }
  }
}

class NativeStockfishEnginePackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(NativeStockfishEngineModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
