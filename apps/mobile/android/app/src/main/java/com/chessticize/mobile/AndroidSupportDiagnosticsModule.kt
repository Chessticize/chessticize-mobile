package com.chessticize.mobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.json.JSONArray
import org.json.JSONObject

class AndroidSupportDiagnosticsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val worker = Executors.newSingleThreadScheduledExecutor()

  init {
    worker.execute {
      workRoot().deleteRecursively()
      removeExpiredArchives()
    }
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun copyText(text: String, promise: Promise) {
    try {
      val clipboard =
        reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("Chessticize diagnostic", text))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("support_clipboard_failed", "The diagnostic could not be copied.", error)
    }
  }

  @ReactMethod
  fun createSupportBundleWorkspace(diagnosticText: String, promise: Promise) {
    worker.execute {
      try {
        if (diagnosticText.toByteArray(Charsets.UTF_8).size > MAX_DIAGNOSTIC_BYTES) {
          throw SupportBundleException(
            "support_diagnostic_too_large",
            "The support diagnostic is unexpectedly large.",
          )
        }
        removeExpiredArchives()
        val directory = File(workRoot(), "$WORK_PREFIX${UUID.randomUUID()}")
        if (!directory.mkdirs()) {
          throw SupportBundleException(
            "support_directory_failed",
            "The support bundle workspace could not be created.",
          )
        }
        File(directory, DIAGNOSTIC_FILENAME).writeText(diagnosticText, Charsets.UTF_8)
        val result = Arguments.createMap().apply {
          putString(
            "databaseSnapshotPath",
            File(directory, DATABASE_FILENAME).absolutePath,
          )
          putString("workspaceUrl", Uri.fromFile(directory).toString())
        }
        promise.resolve(result)
      } catch (error: Exception) {
        reject(promise, error, "support_workspace_failed")
      }
    }
  }

  @ReactMethod
  fun finishSupportBundle(
    workspaceUrl: String,
    metadata: ReadableMap,
    promise: Promise,
  ) {
    worker.execute {
      val directory = managedFileFromUrl(workspaceUrl, workRoot(), WORK_PREFIX)
      if (directory == null || !directory.isDirectory) {
        promise.reject(
          "support_workspace_invalid",
          "The support bundle workspace is no longer available.",
        )
        return@execute
      }

      try {
        val database = File(directory, DATABASE_FILENAME)
        val diagnostic = File(directory, DIAGNOSTIC_FILENAME)
        if (!database.isFile || database.length() == 0L || !diagnostic.isFile) {
          throw SupportBundleException(
            "support_database_backup_failed",
            "The local progress snapshot was not created.",
          )
        }

        val databaseHealth = databaseHealth(database)
        if (!databaseHealth.getBoolean("integrityCheckPassed")) {
          throw SupportBundleException(
            "support_database_integrity_failed",
            "The local progress snapshot did not pass SQLite integrity checks.",
          )
        }

        val includedFiles = mutableListOf(database, diagnostic)
        val manifest = File(directory, MANIFEST_FILENAME)
        manifest.writeText(
          supportManifest(metadata, databaseHealth, includedFiles).toString(2),
          Charsets.UTF_8,
        )
        includedFiles.add(manifest)

        val archiveDirectory = archiveRoot()
        archiveDirectory.mkdirs()
        val archive = File(
          archiveDirectory,
          "$ARCHIVE_PREFIX${archiveTimestamp()}-${UUID.randomUUID()}.zip",
        )
        writeZip(archive, includedFiles)
        directory.deleteRecursively()
        worker.schedule({ archive.delete() }, ARCHIVE_LIFETIME_HOURS, TimeUnit.HOURS)

        val files = Arguments.createArray().apply {
          includedFiles.forEach { pushString(it.name) }
        }
        val result = Arguments.createMap().apply {
          putString("bundleUrl", Uri.fromFile(archive).toString())
          putArray("files", files)
          putString("kind", "complete")
        }
        promise.resolve(result)
      } catch (error: Exception) {
        reject(promise, error, "support_bundle_failed")
      }
    }
  }

  @ReactMethod
  fun shareSupportBundle(bundleUrl: String, promise: Promise) {
    val archive = managedFileFromUrl(bundleUrl, archiveRoot(), ARCHIVE_PREFIX)
    if (archive == null || !archive.isFile || archive.extension.lowercase() != "zip") {
      promise.reject(
        "support_bundle_missing",
        "The prepared support bundle is no longer available.",
      )
      return
    }

    reactApplicationContext.runOnUiQueueThread {
      try {
        val contentUri = FileProvider.getUriForFile(
          reactApplicationContext,
          "${reactApplicationContext.packageName}.support-files",
          archive,
        )
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
          type = "application/zip"
          putExtra(Intent.EXTRA_STREAM, contentUri)
          clipData = ClipData.newUri(
            reactApplicationContext.contentResolver,
            "Chessticize support bundle",
            contentUri,
          )
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(
          shareIntent,
          "Share Chessticize support bundle",
        )
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
          chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          reactApplicationContext.startActivity(chooser)
        } else {
          activity.startActivity(chooser)
        }
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject(
          "support_share_unavailable",
          "Android share options could not be opened.",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun discardSupportBundle(bundleUrl: String, promise: Promise) {
    worker.execute {
      val archive = managedFileFromUrl(bundleUrl, archiveRoot(), ARCHIVE_PREFIX)
      if (archive == null) {
        promise.reject("support_bundle_invalid", "The support bundle path is invalid.")
        return@execute
      }
      if (archive.exists() && !archive.delete()) {
        promise.reject(
          "support_bundle_discard_failed",
          "The temporary support bundle could not be removed.",
        )
        return@execute
      }
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun discardSupportBundleWorkspace(workspaceUrl: String, promise: Promise) {
    worker.execute {
      val directory = managedFileFromUrl(workspaceUrl, workRoot(), WORK_PREFIX)
      if (directory == null) {
        promise.reject(
          "support_workspace_invalid",
          "The support bundle workspace path is invalid.",
        )
        return@execute
      }
      if (directory.exists() && !directory.deleteRecursively()) {
        promise.reject(
          "support_workspace_discard_failed",
          "The temporary support workspace could not be removed.",
        )
        return@execute
      }
      promise.resolve(true)
    }
  }

  override fun invalidate() {
    worker.shutdownNow()
    super.invalidate()
  }

  private fun supportManifest(
    metadata: ReadableMap,
    databaseHealth: JSONObject,
    includedFiles: List<File>,
  ): JSONObject {
    val files = JSONArray()
    includedFiles.forEach { file ->
      files.put(
        JSONObject()
          .put("name", file.name)
          .put("bytes", file.length())
          .put("sha256", sha256(file)),
      )
    }

    val configuration = reactApplicationContext.resources.configuration
    return JSONObject()
      .put("bundleFormatVersion", 1)
      .put("createdAt", iso8601(Date()))
      .put("kind", "complete")
      .put(
        "app",
        JSONObject()
          .put("bundleIdentifier", reactApplicationContext.packageName)
          .put("version", readableString(metadata, "appVersion"))
          .put("build", readableString(metadata, "buildNumber")),
      )
      .put(
        "progressProtection",
        JSONObject()
          .put("kind", "android_managed_backup")
          .put("continuousSyncAvailable", false),
      )
      .put(
        "environment",
        JSONObject()
          .put("platform", "Android")
          .put("operatingSystemVersion", Build.VERSION.RELEASE ?: "unavailable")
          .put("apiLevel", Build.VERSION.SDK_INT)
          .put(
            "deviceFamily",
            if (configuration.smallestScreenWidthDp >= 600) "tablet" else "phone",
          ),
      )
      .put("localDatabase", databaseHealth)
      .put("files", files)
      .put(
        "privacy",
        JSONObject()
          .put("accountIdentifiersIncluded", false)
          .put("credentialsIncluded", false)
          .put("hardwareIdentifiersIncluded", false)
          .put("bundledPuzzlePackIncluded", false),
      )
  }

  private fun databaseHealth(file: File): JSONObject {
    var database: SQLiteDatabase? = null
    return try {
      database = SQLiteDatabase.openDatabase(
        file.absolutePath,
        null,
        SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS,
      )
      val integrityResult = queryString(database, "PRAGMA integrity_check") ?: "unavailable"
      JSONObject()
        .put("integrityCheck", integrityResult)
        .put("integrityCheckPassed", integrityResult.equals("ok", ignoreCase = true))
        .put("userVersion", queryLong(database, "PRAGMA user_version"))
        .put("pageCount", queryLong(database, "PRAGMA page_count"))
        .put("pageSize", queryLong(database, "PRAGMA page_size"))
        .put("bytes", file.length())
    } finally {
      database?.close()
    }
  }

  private fun queryString(database: SQLiteDatabase, sql: String): String? =
    database.rawQuery(sql, null).use { cursor ->
      if (cursor.moveToFirst()) cursor.getString(0) else null
    }

  private fun queryLong(database: SQLiteDatabase, sql: String): Long =
    database.rawQuery(sql, null).use { cursor ->
      if (cursor.moveToFirst()) cursor.getLong(0) else 0L
    }

  private fun writeZip(archive: File, files: List<File>) {
    ZipOutputStream(BufferedOutputStream(FileOutputStream(archive))).use { zip ->
      files.forEach { file ->
        zip.putNextEntry(ZipEntry(file.name))
        BufferedInputStream(FileInputStream(file)).use { input ->
          input.copyTo(zip)
        }
        zip.closeEntry()
      }
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    BufferedInputStream(FileInputStream(file)).use { input ->
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

  private fun managedFileFromUrl(
    input: String,
    root: File,
    requiredPrefix: String,
  ): File? {
    return try {
      val uri = Uri.parse(input)
      if (uri.scheme != "file") {
        return null
      }
      val candidate = File(uri.path ?: return null).canonicalFile
      val canonicalRoot = root.canonicalFile
      if (
        candidate.parentFile != canonicalRoot
        || !candidate.name.startsWith(requiredPrefix)
      ) {
        null
      } else {
        candidate
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun removeExpiredArchives() {
    val cutoff = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(ARCHIVE_LIFETIME_HOURS)
    archiveRoot().listFiles()?.forEach { file ->
      if (file.name.startsWith(ARCHIVE_PREFIX) && file.lastModified() < cutoff) {
        file.delete()
      }
    }
  }

  private fun supportRoot(): File =
    File(reactApplicationContext.cacheDir, SUPPORT_ROOT_DIRECTORY)

  private fun workRoot(): File =
    File(supportRoot(), WORK_DIRECTORY)

  private fun archiveRoot(): File =
    File(supportRoot(), ARCHIVE_DIRECTORY)

  private fun readableString(metadata: ReadableMap, key: String): String =
    if (metadata.hasKey(key) && !metadata.isNull(key)) {
      metadata.getString(key) ?: "unavailable"
    } else {
      "unavailable"
    }

  private fun reject(promise: Promise, error: Exception, fallbackCode: String) {
    val supportError = error as? SupportBundleException
    promise.reject(
      supportError?.code ?: fallbackCode,
      error.message ?: "The support bundle could not be prepared.",
      error,
    )
  }

  private fun archiveTimestamp(): String =
    SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())

  private fun iso8601(date: Date): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(date)

  companion object {
    private const val NAME = "AndroidSupportDiagnostics"
    private const val SUPPORT_ROOT_DIRECTORY = "support-diagnostics"
    private const val WORK_DIRECTORY = "work"
    private const val ARCHIVE_DIRECTORY = "archives"
    private const val WORK_PREFIX = "chessticize-support-work-"
    private const val ARCHIVE_PREFIX = "Chessticize-Support-"
    private const val DATABASE_FILENAME = "local-progress.sqlite"
    private const val DIAGNOSTIC_FILENAME = "diagnostic.txt"
    private const val MANIFEST_FILENAME = "manifest.json"
    private const val ARCHIVE_LIFETIME_HOURS = 1L
    private const val MAX_DIAGNOSTIC_BYTES = 64 * 1024
  }
}

private class SupportBundleException(
  val code: String,
  message: String,
) : Exception(message)

class AndroidSupportDiagnosticsPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(AndroidSupportDiagnosticsModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
