package com.chessticize.mobile

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class BundledPuzzlePackInstallerTest {
  @Test
  fun interruptedInstallDoesNotPublishAPartialDatabase() {
    val directory = Files.createTempDirectory("bundled-puzzle-pack").toFile()
    val filename = "bundled-core-pack-v5.sqlite"
    val contents = ByteArray(8_192) { index -> (index % 251).toByte() }

    assertThrows(IOException::class.java) {
      BundledPuzzlePackInstaller.installAtomically(
        databasesDirectory = directory,
        filename = filename,
        expectedBytes = contents.size.toLong(),
        openAsset = { FailingInputStream(contents, failAfterBytes = 2_048) },
      )
    }

    assertFalse(directory.resolve(filename).exists())
    assertFalse(directory.resolve("$filename.installing").exists())
  }

  @Test
  fun retryReplacesTruncatedDatabaseAndAbandonedStagingFile() {
    val directory = Files.createTempDirectory("bundled-puzzle-pack").toFile()
    val filename = "bundled-core-pack-v5.sqlite"
    val contents = "complete bundled database".toByteArray()
    directory.resolve(filename).writeBytes("truncated".toByteArray())
    directory.resolve("$filename.installing").writeBytes("abandoned".toByteArray())

    assertTrue(
      BundledPuzzlePackInstaller.installAtomically(
        databasesDirectory = directory,
        filename = filename,
        expectedBytes = contents.size.toLong(),
        openAsset = { ByteArrayInputStream(contents) },
      ),
    )

    assertArrayEquals(contents, directory.resolve(filename).readBytes())
    assertFalse(directory.resolve("$filename.installing").exists())
  }

  @Test
  fun completeDatabaseIsReusedWithoutOpeningTheAsset() {
    val directory = Files.createTempDirectory("bundled-puzzle-pack").toFile()
    val filename = "bundled-core-pack-v5.sqlite"
    val contents = "complete bundled database".toByteArray()
    directory.resolve(filename).writeBytes(contents)

    assertTrue(
      BundledPuzzlePackInstaller.installAtomically(
        databasesDirectory = directory,
        filename = filename,
        expectedBytes = contents.size.toLong(),
        openAsset = { error("complete database should not reopen the asset") },
      ),
    )

    assertArrayEquals(contents, directory.resolve(filename).readBytes())
  }

  @Test
  fun wrongLengthAssetDoesNotReplaceAnExistingDatabase() {
    val directory = Files.createTempDirectory("bundled-puzzle-pack").toFile()
    val filename = "bundled-core-pack-v5.sqlite"
    val truncated = "truncated".toByteArray()
    directory.resolve(filename).writeBytes(truncated)

    assertThrows(IOException::class.java) {
      BundledPuzzlePackInstaller.installAtomically(
        databasesDirectory = directory,
        filename = filename,
        expectedBytes = 1_024,
        openAsset = { ByteArrayInputStream("still incomplete".toByteArray()) },
      )
    }

    assertArrayEquals(truncated, directory.resolve(filename).readBytes())
    assertFalse(directory.resolve("$filename.installing").exists())
  }
}

private class FailingInputStream(
  private val contents: ByteArray,
  private val failAfterBytes: Int,
) : InputStream() {
  private var offset = 0

  override fun read(): Int {
    if (offset >= failAfterBytes) {
      throw IOException("simulated interrupted asset copy")
    }
    if (offset >= contents.size) {
      return -1
    }
    return contents[offset++].toInt() and 0xff
  }
}
