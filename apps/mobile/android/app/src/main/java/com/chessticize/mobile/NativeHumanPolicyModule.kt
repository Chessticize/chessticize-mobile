package com.chessticize.mobile

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val MAIA2_ASSET_DIRECTORY = "models"
private const val MAIA2_MODEL_FILENAME = "maia2-rapid-int8.onnx"
private const val MAIA2_ASSET_PATH = "$MAIA2_ASSET_DIRECTORY/$MAIA2_MODEL_FILENAME"
private const val MAIA2_STORAGE_DIRECTORY = "maia2-models"
private const val MAIA2_TENSOR_FLOATS = 18 * 8 * 8
private const val MAIA2_VOCAB_SIZE = 1880

class NativeHumanPolicyModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private val inferenceExecutor: ExecutorService =
    Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "chessticize-maia2").apply { isDaemon = true }
    }

  private var ortSession: OrtSession? = null
  private var verifiedSha256: String? = null

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "NativeHumanPolicy"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    inferenceExecutor.execute {
      try {
        val entries = reactApplicationContext.assets.list(MAIA2_ASSET_DIRECTORY)
        val present = entries?.contains(MAIA2_MODEL_FILENAME) == true
        promise.resolve(present)
      } catch (_: Throwable) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun loadModel(expectedSha256: String?, promise: Promise) {
    inferenceExecutor.execute {
      try {
        ensureSessionLoaded(expectedSha256)
        promise.resolve(true)
      } catch (error: Throwable) {
        closeSession()
        promise.reject(
          "maia2_load_failed",
          error.message ?: "Failed to load Maia-2 ONNX model.",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun scoreBatch(
    boardsBase64: String,
    eloSelf: ReadableArray,
    eloOppo: ReadableArray,
    promise: Promise,
  ) {
    inferenceExecutor.execute {
      try {
        val batchSize = eloSelf.size()
        if (batchSize <= 0 || batchSize != eloOppo.size()) {
          promise.reject(
            "maia2_invalid_batch",
            "eloSelf and eloOppo must have identical non-zero length.",
          )
          return@execute
        }

        val boardBytes = Base64.decode(boardsBase64, Base64.DEFAULT)
        val expectedBytes = batchSize * MAIA2_TENSOR_FLOATS * 4
        if (boardBytes.size != expectedBytes) {
          promise.reject(
            "maia2_invalid_boards",
            "boardsBase64 byte length (${boardBytes.size}) does not match $expectedBytes.",
          )
          return@execute
        }

        val session = ensureSessionLoaded(verifiedSha256)
        val env = OrtEnvironment.getEnvironment()

        val boardBuffer: FloatBuffer =
          ByteBuffer.wrap(boardBytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
        val selfArray = LongArray(batchSize) { index -> eloSelf.getInt(index).toLong() }
        val oppoArray = LongArray(batchSize) { index -> eloOppo.getInt(index).toLong() }

        val boardsTensor =
          OnnxTensor.createTensor(env, boardBuffer, longArrayOf(batchSize.toLong(), 18L, 8L, 8L))
        val selfTensor =
          OnnxTensor.createTensor(env, LongBuffer.wrap(selfArray), longArrayOf(batchSize.toLong()))
        val oppoTensor =
          OnnxTensor.createTensor(env, LongBuffer.wrap(oppoArray), longArrayOf(batchSize.toLong()))

        try {
          val inputs = mapOf(
            "boards" to boardsTensor,
            "elos_self" to selfTensor,
            "elos_oppo" to oppoTensor,
          )
          session.run(inputs).use { result ->
            val outputValue = result[0] as OnnxTensor
            val floatBuf = outputValue.floatBuffer
            val totalFloats = batchSize * MAIA2_VOCAB_SIZE
            if (floatBuf.remaining() < totalFloats) {
              throw IllegalStateException("Unexpected Maia-2 output size: ${floatBuf.remaining()}")
            }
            val outBytes = ByteArray(totalFloats * 4)
            val outFloatBuf =
              ByteBuffer.wrap(outBytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
            val tmp = FloatArray(totalFloats)
            floatBuf.get(tmp)
            outFloatBuf.put(tmp)
            promise.resolve(Base64.encodeToString(outBytes, Base64.NO_WRAP))
          }
        } finally {
          boardsTensor.close()
          selfTensor.close()
          oppoTensor.close()
        }
      } catch (error: Throwable) {
        promise.reject(
          "maia2_predict_failed",
          error.message ?: "Maia-2 ONNX inference failed.",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun unload(promise: Promise) {
    inferenceExecutor.execute {
      closeSession()
      promise.resolve(true)
    }
  }

  override fun onHostResume() = Unit

  override fun onHostPause() = Unit

  override fun onHostDestroy() {
    inferenceExecutor.execute { closeSession() }
  }

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    inferenceExecutor.execute { closeSession() }
    inferenceExecutor.shutdown()
    super.invalidate()
  }

  private fun closeSession() {
    try {
      ortSession?.close()
    } catch (_: Throwable) {
      // Ignore close errors during teardown.
    } finally {
      ortSession = null
    }
  }

  private fun ensureSessionLoaded(expectedSha256: String?): OrtSession {
    val normalizedExpected = expectedSha256?.removePrefix("sha256:")?.lowercase()?.takeIf { it.isNotEmpty() }
    val current = ortSession
    if (current != null && (normalizedExpected == null || normalizedExpected == verifiedSha256)) {
      return current
    }

    val modelFile = materializeModelFile(normalizedExpected)
    val env = OrtEnvironment.getEnvironment()
    val options = OrtSession.SessionOptions().apply {
      setIntraOpNumThreads(2)
      setInterOpNumThreads(1)
      setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
    }
    val created = env.createSession(modelFile.absolutePath, options)
    closeSession()
    ortSession = created
    return created
  }

  private fun materializeModelFile(expectedSha256: String?): File {
    val storageDir = File(reactApplicationContext.noBackupFilesDir, MAIA2_STORAGE_DIRECTORY)
    if (!storageDir.exists()) {
      storageDir.mkdirs()
    }
    val dest = File(storageDir, MAIA2_MODEL_FILENAME)

    if (dest.isFile) {
      val existingSha = sha256Hex(dest)
      if (expectedSha256 == null || existingSha == expectedSha256) {
        verifiedSha256 = existingSha
        return dest
      }
      dest.delete()
    }

    val tmp = File(storageDir, "$MAIA2_MODEL_FILENAME.tmp")
    val digest = MessageDigest.getInstance("SHA-256")
    reactApplicationContext.assets.open(MAIA2_ASSET_PATH).use { input ->
      FileOutputStream(tmp).use { output ->
        val buffer = ByteArray(262_144)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          digest.update(buffer, 0, read)
          output.write(buffer, 0, read)
        }
      }
    }
    val actualSha = digest.digest().joinToString("") { "%02x".format(it) }
    if (expectedSha256 != null && actualSha != expectedSha256) {
      tmp.delete()
      throw SecurityException("Maia-2 ONNX SHA-256 mismatch: expected $expectedSha256, got $actualSha")
    }
    if (!tmp.renameTo(dest)) {
      tmp.copyTo(dest, overwrite = true)
      tmp.delete()
    }
    verifiedSha256 = actualSha
    return dest
  }

  private fun sha256Hex(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(262_144)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}

class NativeHumanPolicyPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(NativeHumanPolicyModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
