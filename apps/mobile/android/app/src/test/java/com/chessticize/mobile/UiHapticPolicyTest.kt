package com.chessticize.mobile

import android.os.Build
import android.view.HapticFeedbackConstants
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UiHapticPolicyTest {
  @Test
  fun `each intent maps to its platform feedback constant on current Android`() {
    val sdk = Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    assertEquals(HapticFeedbackConstants.SEGMENT_TICK, UiHapticPolicy.feedbackConstant("selection", sdk))
    assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, UiHapticPolicy.feedbackConstant("impactLight", sdk))
    assertEquals(HapticFeedbackConstants.CONFIRM, UiHapticPolicy.feedbackConstant("success", sdk))
    assertEquals(HapticFeedbackConstants.REJECT, UiHapticPolicy.feedbackConstant("warning", sdk))
  }

  @Test
  fun `older Android falls back to constants it supports`() {
    val sdk = Build.VERSION_CODES.N
    assertEquals(HapticFeedbackConstants.CLOCK_TICK, UiHapticPolicy.feedbackConstant("selection", sdk))
    assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, UiHapticPolicy.feedbackConstant("impactLight", sdk))
    assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, UiHapticPolicy.feedbackConstant("success", sdk))
    assertEquals(HapticFeedbackConstants.LONG_PRESS, UiHapticPolicy.feedbackConstant("warning", sdk))
  }

  @Test
  fun `unknown intents map to nothing`() {
    assertNull(UiHapticPolicy.feedbackConstant("heavy", Build.VERSION_CODES.UPSIDE_DOWN_CAKE))
  }
}
