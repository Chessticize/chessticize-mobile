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
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val STOCKFISH_LINE_EVENT = "StockfishEngineLine"
private const val BIG_NETWORK = "nn-c288c895ea92.nnue"
private const val SMALL_NETWORK = "nn-37f18f62d772.nnue"
private const val BIG_NETWORK_SIZE = 108_919_594L
private const val SMALL_NETWORK_SIZE = 3_519_630L

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
          val bigNetwork = materializeNetwork(BIG_NETWORK, BIG_NETWORK_SIZE)
          val smallNetwork = materializeNetwork(SMALL_NETWORK, SMALL_NETWORK_SIZE)
          nativeHandle = nativeCreate(bigNetwork.absolutePath, smallNetwork.absolutePath)
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

  private fun materializeNetwork(name: String, expectedSize: Long): File {
    val directory = File(reactApplicationContext.filesDir, "stockfish").also {
      check(it.exists() || it.mkdirs()) { "Could not create the Stockfish data directory." }
    }
    val destination = File(directory, name)
    if (destination.isFile && destination.length() == expectedSize) {
      return destination
    }

    val temporary = File(directory, "$name.tmp")
    check(!destination.exists() || destination.delete()) { "Could not replace bundled network $name." }
    reactApplicationContext.assets.open("stockfish/$name").use { input ->
      temporary.outputStream().use { output -> input.copyTo(output) }
    }
    check(temporary.length() == expectedSize) {
      "Bundled network $name is incomplete (${temporary.length()} of $expectedSize bytes)."
    }
    check(temporary.renameTo(destination)) { "Could not install bundled network $name." }
    return destination
  }

  private external fun nativeCreate(bigNetworkPath: String, smallNetworkPath: String): Long
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
