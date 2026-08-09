package com.chessticize.mobile

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReleasedDatabaseFixtureInstallerTest {
  @Test
  fun installsReleasedProgressDatabaseThroughTargetContext() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val targetContext = instrumentation.targetContext
    val database = targetContext.getDatabasePath(DATABASE_NAME)

    targetContext.deleteDatabase(DATABASE_NAME)
    assertTrue(database.parentFile?.let { it.isDirectory || it.mkdirs() } == true)
    instrumentation.context.assets.open(FIXTURE_NAME).use { source ->
      database.outputStream().use(source::copyTo)
    }

    assertTrue(database.isFile)
    assertEquals(FIXTURE_BYTES, database.length())
  }

  private companion object {
    const val DATABASE_NAME = "chessticize-mobile.sqlite"
    const val FIXTURE_NAME = "schema-v0-ios-1.0.0.sqlite"
    const val FIXTURE_BYTES = 114688L
  }
}
