package com.chessticize.mobile

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppSystemBarAppearanceTest {
  @After
  fun reset() {
    AppSystemBarAppearance.dark = null
  }

  @Test
  fun `bars follow the system appearance until the app reports its own`() {
    assertTrue(AppSystemBarAppearance.barsDark(systemNight = true))
    assertFalse(AppSystemBarAppearance.barsDark(systemNight = false))
  }

  @Test
  fun `an app appearance opposite to the system wins`() {
    AppSystemBarAppearance.dark = true
    assertTrue(AppSystemBarAppearance.barsDark(systemNight = false))

    AppSystemBarAppearance.dark = false
    assertFalse(AppSystemBarAppearance.barsDark(systemNight = true))
  }
}
