package com.chessticize.mobile

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Build
import android.view.HapticFeedbackConstants
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

internal object MoveFeedbackPolicy {
  fun shouldPlaySound(
    ringerMode: Int,
    interruptionFilter: Int,
    musicStreamVolume: Int,
  ): Boolean =
    ringerMode == AudioManager.RINGER_MODE_NORMAL &&
      interruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL &&
      musicStreamVolume > 0
}

class MoveFeedbackModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val notificationManager =
    reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val soundPool = SoundPool.Builder()
    .setMaxStreams(4)
    .setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_GAME)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build(),
    )
    .build()
  private val loadedSounds = mutableSetOf<Int>()
  private val moveSoundId: Int
  private val captureSoundId: Int

  init {
    soundPool.setOnLoadCompleteListener { _, sampleId, status ->
      if (status == 0) {
        synchronized(loadedSounds) {
          loadedSounds.add(sampleId)
        }
      }
    }
    moveSoundId = loadSound("move-feedback/move.mp3")
    captureSoundId = loadSound("move-feedback/capture.mp3")
  }

  override fun getName(): String = "MoveFeedback"

  @ReactMethod
  fun play(cue: String, playSound: Boolean, playHaptic: Boolean, promise: Promise) {
    val soundId = when (cue) {
      "move" -> moveSoundId
      "capture" -> captureSoundId
      else -> {
        promise.reject("invalid_cue", "Move feedback cue must be move or capture.")
        return
      }
    }

    if (playSound && shouldPlaySound()) {
      val ready = synchronized(loadedSounds) {
        loadedSounds.contains(soundId)
      }
      if (ready) {
        val volume = if (cue == "capture") 0.3f else 1.0f
        soundPool.play(soundId, volume, volume, 1, 0, 1.0f)
      }
    }

    if (playHaptic) {
      reactApplicationContext.runOnUiQueueThread {
        val feedbackConstant = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          HapticFeedbackConstants.CONFIRM
        } else {
          HapticFeedbackConstants.KEYBOARD_TAP
        }
        reactApplicationContext.currentActivity
          ?.window
          ?.decorView
          ?.performHapticFeedback(feedbackConstant)
      }
    }

    promise.resolve(null)
  }

  override fun invalidate() {
    soundPool.release()
    synchronized(loadedSounds) {
      loadedSounds.clear()
    }
    super.invalidate()
  }

  private fun shouldPlaySound(): Boolean =
    try {
      MoveFeedbackPolicy.shouldPlaySound(
        ringerMode = audioManager.ringerMode,
        interruptionFilter = notificationManager.currentInterruptionFilter,
        musicStreamVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC),
      )
    } catch (_: RuntimeException) {
      false
    }

  private fun loadSound(assetPath: String): Int =
    reactApplicationContext.assets.openFd(assetPath).use { descriptor ->
      soundPool.load(descriptor, 1)
    }
}

class MoveFeedbackPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(MoveFeedbackModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
