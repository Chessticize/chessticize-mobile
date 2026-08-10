package com.chessticize.mobile

import android.content.res.AssetManager
import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream

internal object BundledPuzzlePackInstaller {
  private val allowedFilename = Regex("bundled-core-pack-v[1-9]\\d*\\.sqlite")
  private const val COPY_BUFFER_BYTES = 1024 * 1024

  @Synchronized
  fun installAtomically(
    databasesDirectory: File,
    filename: String,
    expectedBytes: Long,
    openAsset: () -> InputStream,
  ): Boolean {
    require(allowedFilename.matches(filename)) {
      "Unexpected bundled puzzle-pack filename: $filename"
    }
    require(expectedBytes > 0L) {
      "Bundled puzzle-pack byte count must be positive: $expectedBytes"
    }
    if (!databasesDirectory.exists() && !databasesDirectory.mkdirs()) {
      throw IOException("Could not create database directory: $databasesDirectory")
    }
    if (!databasesDirectory.isDirectory) {
      throw IOException("Database path is not a directory: $databasesDirectory")
    }

    val destination = File(databasesDirectory, filename)
    val staging = File(databasesDirectory, "$filename.installing")
    if (destination.isFile && destination.length() == expectedBytes) {
      staging.delete()
      return true
    }
    if (staging.exists() && !staging.delete()) {
      throw IOException("Could not discard incomplete puzzle-pack staging file: $staging")
    }

    try {
      openAsset().use { input ->
        FileOutputStream(staging).use { output ->
          input.copyTo(output, COPY_BUFFER_BYTES)
          output.fd.sync()
        }
      }
      if (staging.length() != expectedBytes) {
        throw IOException(
          "Bundled puzzle-pack copy has ${staging.length()} bytes; expected $expectedBytes",
        )
      }
      if (destination.exists() && !destination.delete()) {
        throw IOException("Could not replace incomplete puzzle-pack database: $destination")
      }
      if (!staging.renameTo(destination)) {
        throw IOException("Could not publish bundled puzzle-pack database: $destination")
      }
      return true
    } catch (error: Exception) {
      staging.delete()
      throw error
    }
  }
}

class BundledPuzzlePackInstallerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "BundledPuzzlePackInstaller"

  @ReactMethod
  fun installBundledPuzzlePack(args: ReadableMap, promise: Promise) {
    try {
      val filename = args.getString("filename")
        ?: throw IllegalArgumentException("Bundled puzzle-pack filename is required")
      val assetDirectory = args.getString("path")
        ?: throw IllegalArgumentException("Bundled puzzle-pack asset directory is required")
      require(assetDirectory == ASSET_DIRECTORY) {
        "Unexpected bundled puzzle-pack asset directory: $assetDirectory"
      }
      val expectedBytes = args.getDouble("expectedBytes").toLong()
      val databasesDirectory = reactContext.getDatabasePath(filename).parentFile
        ?: throw IOException("Android database directory is unavailable")
      val installed = BundledPuzzlePackInstaller.installAtomically(
        databasesDirectory = databasesDirectory,
        filename = filename,
        expectedBytes = expectedBytes,
        openAsset = {
          reactContext.assets.open(
            "$assetDirectory/$filename",
            AssetManager.ACCESS_STREAMING,
          )
        },
      )
      promise.resolve(installed)
    } catch (error: Exception) {
      Log.e(NAME, "Bundled puzzle-pack install failed", error)
      promise.resolve(false)
    }
  }

  companion object {
    private const val NAME = "BundledPuzzlePackInstaller"
    private const val ASSET_DIRECTORY = "puzzle-packs"
  }
}

class BundledPuzzlePackInstallerPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(BundledPuzzlePackInstallerModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
