package com.chessticize.mobile

import android.app.NotificationManager
import android.media.AudioManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MoveFeedbackPolicyTest {
  @Test
  fun `sound plays only in normal ringer mode with no DND filter and audible media volume`() {
    assertTrue(
      MoveFeedbackPolicy.shouldPlaySound(
        AudioManager.RINGER_MODE_NORMAL,
        NotificationManager.INTERRUPTION_FILTER_ALL,
        5,
      ),
    )
    assertFalse(
      MoveFeedbackPolicy.shouldPlaySound(
        AudioManager.RINGER_MODE_VIBRATE,
        NotificationManager.INTERRUPTION_FILTER_ALL,
        5,
      ),
    )
    assertFalse(
      MoveFeedbackPolicy.shouldPlaySound(
        AudioManager.RINGER_MODE_SILENT,
        NotificationManager.INTERRUPTION_FILTER_ALL,
        5,
      ),
    )
    assertFalse(
      MoveFeedbackPolicy.shouldPlaySound(
        AudioManager.RINGER_MODE_NORMAL,
        NotificationManager.INTERRUPTION_FILTER_PRIORITY,
        5,
      ),
    )
    assertFalse(
      MoveFeedbackPolicy.shouldPlaySound(
        AudioManager.RINGER_MODE_NORMAL,
        NotificationManager.INTERRUPTION_FILTER_ALL,
        0,
      ),
    )
  }
}
