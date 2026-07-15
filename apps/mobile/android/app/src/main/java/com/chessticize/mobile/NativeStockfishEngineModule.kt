package com.chessticize.mobile

import android.system.Os
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
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val STOCKFISH_LINE_EVENT = "StockfishEngineLine"
private const val STOCKFISH_NNUE_ASSET_DIRECTORY = "stockfish"
private const val STOCKFISH_NNUE_STORAGE_DIRECTORY = "stockfish-nnue"
private val STOCKFISH_NNUE_FILE_PATTERN = Regex("^nn-([a-f0-9]{12})\\.nnue$")

private data class StockfishNnueAsset(
  val fileName: String,
) {
  val assetPath: String = "$STOCKFISH_NNUE_ASSET_DIRECTORY/$fileName"
  val digestPrefix: String = checkNotNull(STOCKFISH_NNUE_FILE_PATTERN.matchEntire(fileName)) {
    "Invalid canonical Stockfish NNUE filename: $fileName"
  }.groupValues[1]
}

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
        // A retained JS runtime uses this signal to repeat the UCI handshake
        // after Activity destruction has torn down the native runner.
        val created = nativeHandle == 0L
        if (created) {
          ensureNativeLibraryLoaded()
          val (bigNetwork, smallNetwork) = materializeBundledNetworks(reactApplicationContext)
          nativeHandle = nativeCreate(bigNetwork.absolutePath, smallNetwork.absolutePath)
          check(nativeHandle != 0L) { "The on-device engine could not be initialized." }
        }
        promise.resolve(created)
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

  private external fun nativeCreate(bigNetworkPath: String, smallNetworkPath: String): Long
  private external fun nativeSend(handle: Long, command: String)
  private external fun nativeDestroy(handle: Long)

  private companion object {
    private val bigNetworkAsset = StockfishNnueAsset("nn-c288c895ea92.nnue")
    private val smallNetworkAsset = StockfishNnueAsset("nn-37f18f62d772.nnue")

    @Volatile
    private var nativeLibraryLoaded = false

    @Synchronized
    fun materializeBundledNetworks(
      reactContext: ReactApplicationContext,
    ): Pair<File, File> = Pair(
      materializeBundledNetwork(reactContext, bigNetworkAsset),
      materializeBundledNetwork(reactContext, smallNetworkAsset),
    )

    private fun materializeBundledNetwork(
      reactContext: ReactApplicationContext,
      asset: StockfishNnueAsset,
    ): File {
      val directory = File(reactContext.noBackupFilesDir, STOCKFISH_NNUE_STORAGE_DIRECTORY)
      check(directory.isDirectory || directory.mkdirs()) {
        "Could not create private Stockfish NNUE storage."
      }

      val target = File(directory, asset.fileName)
      if (isCanonicalNetworkFile(target, asset.digestPrefix)) {
        return target
      }

      if (target.exists()) {
        check(target.delete()) { "Could not replace an invalid Stockfish NNUE file." }
      }

      val temp = File.createTempFile("${asset.fileName}.", ".tmp", directory)
      try {
        reactContext.assets.open(asset.assetPath).use { input ->
          FileOutputStream(temp).use { output ->
            input.copyTo(output)
            output.fd.sync()
          }
        }
        check(isCanonicalNetworkFile(temp, asset.digestPrefix)) {
          "Bundled Stockfish NNUE asset ${asset.fileName} failed its content check."
        }
        Os.rename(temp.absolutePath, target.absolutePath)
        check(isCanonicalNetworkFile(target, asset.digestPrefix)) {
          "Installed Stockfish NNUE asset ${asset.fileName} failed its content check."
        }
        return target
      } finally {
        if (temp.exists()) {
          temp.delete()
        }
      }
    }

    private fun isCanonicalNetworkFile(file: File, digestPrefix: String): Boolean =
      file.isFile && runCatching { sha256(file).startsWith(digestPrefix) }.getOrDefault(false)

    private fun sha256(file: File): String {
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().buffered().use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) {
            break
          }
          digest.update(buffer, 0, count)
        }
      }
      return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }

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
