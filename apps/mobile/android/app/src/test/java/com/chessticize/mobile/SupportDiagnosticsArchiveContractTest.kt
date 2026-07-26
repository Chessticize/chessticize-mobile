package com.chessticize.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SupportDiagnosticsArchiveContractTest {
  @Test
  fun archiveAccessClosesAtTheEmbeddedExpiryBoundary() {
    val expiresAt = 4_600_000L
    val archiveName = SupportDiagnosticsArchiveContract.archiveName(
      timestamp = "20260726-230000",
      expiresAt = expiresAt,
      identifier = "fixture-id",
    )

    assertTrue(
      SupportDiagnosticsArchiveContract.isReadable(
        archiveName,
        now = expiresAt - 1L,
      ),
    )
    assertFalse(
      SupportDiagnosticsArchiveContract.isReadable(
        archiveName,
        now = expiresAt,
      ),
    )
    assertFalse(
      SupportDiagnosticsArchiveContract.isReadable(
        archiveName,
        now = expiresAt + 1L,
      ),
    )
  }

  @Test
  fun archiveAccessFailsClosedForUnmanagedOrMalformedNames() {
    assertFalse(
      SupportDiagnosticsArchiveContract.isReadable(
        "other.zip",
        now = 1L,
      ),
    )
    assertFalse(
      SupportDiagnosticsArchiveContract.isReadable(
        "Chessticize-Support-20260726-230000-expires-never-fixture.zip",
        now = 1L,
      ),
    )
  }
}
