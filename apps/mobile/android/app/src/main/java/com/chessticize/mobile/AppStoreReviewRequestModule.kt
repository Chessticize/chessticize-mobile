package com.chessticize.mobile

import android.app.Activity
import android.content.Context
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager
import com.google.android.gms.tasks.Task
import com.google.android.play.core.review.ReviewInfo
import com.google.android.play.core.review.ReviewManager
import com.google.android.play.core.review.ReviewManagerFactory

/**
 * Owns one preparation request at a time. A prepared [ReviewInfo] is valid for
 * only a short time, so the module asks for it only once the result screen is
 * already stable and abandons it whenever React Native loses its activity.
 */
internal class PlayReviewRequestCoordinator(
  private val reviewManager: ReviewManager,
  private val currentActivity: () -> Activity?,
  private val isActivityUsable: (Activity) -> Boolean,
  private val runOnUiThread: ((() -> Unit) -> Unit) = { block -> block() },
) {
  private data class PendingRequest(
    val id: Long,
    val result: (Boolean) -> Unit,
  )

  private var nextRequestId = 0L
  private var pendingRequest: PendingRequest? = null

  fun request(result: (Boolean) -> Unit) {
    val preparedForActivity = currentActivity()
    if (preparedForActivity == null || !isActivityUsable(preparedForActivity)) {
      result(false)
      return
    }

    val request = synchronized(this) {
      if (pendingRequest != null) {
        null
      } else {
        PendingRequest(++nextRequestId, result).also { pendingRequest = it }
      }
    }
    if (request == null) {
      result(false)
      return
    }

    try {
      reviewManager.requestReviewFlow().addOnCompleteListener { task ->
        runOnUiThread {
          handlePreparationResult(request.id, preparedForActivity, task)
        }
      }
    } catch (_: Exception) {
      complete(request.id, false)
    }
  }

  fun cancel() {
    val request = synchronized(this) {
      pendingRequest.also { pendingRequest = null }
    }
    request?.result?.invoke(false)
  }

  private fun handlePreparationResult(
    requestId: Long,
    preparedForActivity: Activity,
    task: Task<ReviewInfo>,
  ) {
    if (!isCurrent(requestId)) {
      return
    }
    if (!task.isSuccessful) {
      complete(requestId, false)
      return
    }

    val launchActivity = currentActivity()
    if (
      launchActivity !== preparedForActivity ||
      !isActivityUsable(preparedForActivity)
    ) {
      complete(requestId, false)
      return
    }

    try {
      reviewManager.launchReviewFlow(preparedForActivity, task.result)
      // Google does not expose whether the system sheet was displayed or a
      // review was submitted. Invoking the flow is the successful boundary.
      complete(requestId, true)
    } catch (_: Exception) {
      complete(requestId, false)
    }
  }

  private fun isCurrent(id: Long): Boolean = synchronized(this) {
    pendingRequest?.id == id
  }

  private fun complete(id: Long, requested: Boolean) {
    val request = synchronized(this) {
      pendingRequest?.takeIf { it.id == id }?.also { pendingRequest = null }
    }
    request?.result?.invoke(requested)
  }
}

class AppStoreReviewRequestModule(
  reactContext: ReactApplicationContext,
  private val reviewManagerFactory: (Context) -> ReviewManager = ReviewManagerFactory::create,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private var hostResumed = false
  private var coordinator: PlayReviewRequestCoordinator? = null

  private fun reviewCoordinator(): PlayReviewRequestCoordinator =
    coordinator ?: PlayReviewRequestCoordinator(
      reviewManager = reviewManagerFactory(reactApplicationContext),
      currentActivity = { reactApplicationContext.currentActivity },
      isActivityUsable = { activity ->
        hostResumed &&
          reactApplicationContext.currentActivity === activity &&
          !activity.isFinishing &&
          !activity.isDestroyed
      },
      runOnUiThread = ::runOnUiThread,
    ).also { coordinator = it }

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "AppStoreReviewRequest"

  @ReactMethod
  fun requestReview(promise: Promise) {
    runOnUiThread {
      try {
        reviewCoordinator().request { requested -> promise.resolve(requested) }
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  override fun onHostResume() {
    runOnUiThread { hostResumed = true }
  }

  override fun onHostPause() {
    runOnUiThread {
      hostResumed = false
      coordinator?.cancel()
    }
  }

  override fun onHostDestroy() {
    runOnUiThread {
      hostResumed = false
      coordinator?.cancel()
    }
  }

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    runOnUiThread {
      hostResumed = false
      coordinator?.cancel()
    }
    super.invalidate()
  }

  private fun runOnUiThread(block: () -> Unit) {
    if (UiThreadUtil.isOnUiThread()) {
      block()
    } else {
      UiThreadUtil.runOnUiThread { block() }
    }
  }
}

class AppStoreReviewRequestPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(AppStoreReviewRequestModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
