package com.chessticize.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * An unexported notification-tap boundary is the only native entry point that
 * can authenticate and publish the review route.
 */
class ReviewReminderTapActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ReviewReminderRouteBus.captureTrustedReviewRoute()
    startActivity(
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      },
    )
    finish()
  }
}
