package com.chessticize.mobile

import android.app.Activity
import android.content.Intent
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.TaskCompletionSource
import com.google.android.play.core.review.ReviewInfo
import com.google.android.play.core.review.ReviewManager
import com.google.android.play.core.review.testing.FakeReviewManager
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppStoreReviewRequestModuleIntegrationTest {
  @Test
  fun fakeReviewManagerLaunchesTheNativeReviewFlow() {
    launchScenario().use { scenario ->
      val result = AtomicReference<Boolean>()
      val completion = CountDownLatch(1)

      scenario.onActivity { activity ->
        val coordinator = PlayReviewRequestCoordinator(
          reviewManager = FakeReviewManager(activity),
          currentActivity = { activity },
          isActivityUsable = { candidate -> candidate === activity },
        )
        coordinator.request {
          result.set(it)
          completion.countDown()
        }
      }

      assertTrue(completion.await(5, TimeUnit.SECONDS))
      assertEquals(true, result.get())
    }
  }

  @Test
  fun preparationIsCancelledWhenTheHostLosesItsActivity() {
    launchScenario().use { scenario ->
      val result = AtomicReference<Boolean>()
      val completion = CountDownLatch(1)
      val manager = AtomicReference<DelayedReviewManager>()

      scenario.onActivity { activity ->
        val coordinator = PlayReviewRequestCoordinator(
          reviewManager = DelayedReviewManager(FakeReviewManager(activity)).also(manager::set),
          currentActivity = { activity },
          isActivityUsable = { candidate -> candidate === activity },
        )
        coordinator.request {
          result.set(it)
          completion.countDown()
        }
        coordinator.cancel()
        manager.get().completeSuccessfully()
      }

      assertTrue(completion.await(5, TimeUnit.SECONDS))
      assertFalse(result.get())
      assertEquals(0, manager.get().launchCount.get())
    }
  }

  @Test
  fun activityChangesBeforePreparationCompletesWithoutLaunchingTheFlow() {
    launchScenario().use { scenario ->
      val result = AtomicReference<Boolean>()
      val completion = CountDownLatch(1)
      val activityReference = AtomicReference<Activity?>()
      val manager = AtomicReference<DelayedReviewManager>()

      scenario.onActivity { activity ->
        val coordinator = PlayReviewRequestCoordinator(
          reviewManager = DelayedReviewManager(FakeReviewManager(activity)).also(manager::set),
          currentActivity = activityReference::get,
          isActivityUsable = { candidate -> candidate === activity },
        )
        activityReference.set(activity)
        coordinator.request {
          result.set(it)
          completion.countDown()
        }
        activityReference.set(null)
        manager.get().completeSuccessfully()
      }

      assertTrue(completion.await(5, TimeUnit.SECONDS))
      assertFalse(result.get())
      assertEquals(0, manager.get().launchCount.get())
    }
  }

  @Test
  fun preparationFailureResolvesUnavailableWithoutLaunchingTheFlow() {
    launchScenario().use { scenario ->
      val result = AtomicReference<Boolean>()
      val completion = CountDownLatch(1)
      val manager = AtomicReference<DelayedReviewManager>()

      scenario.onActivity { activity ->
        val coordinator = PlayReviewRequestCoordinator(
          reviewManager = DelayedReviewManager(FakeReviewManager(activity)).also(manager::set),
          currentActivity = { activity },
          isActivityUsable = { candidate -> candidate === activity },
        )
        coordinator.request {
          result.set(it)
          completion.countDown()
        }
        manager.get().failPreparation()
      }

      assertTrue(completion.await(5, TimeUnit.SECONDS))
      assertFalse(result.get())
      assertEquals(0, manager.get().launchCount.get())
    }
  }

  @Test
  fun concurrentPreparationIsRejectedWithoutReplacingTheOriginalRequest() {
    launchScenario().use { scenario ->
      val results = mutableListOf<Boolean>()
      val completion = CountDownLatch(2)

      scenario.onActivity { activity ->
        val coordinator = PlayReviewRequestCoordinator(
          reviewManager = DelayedReviewManager(FakeReviewManager(activity)),
          currentActivity = { activity },
          isActivityUsable = { candidate -> candidate === activity },
        )
        coordinator.request {
          results += it
          completion.countDown()
        }
        coordinator.request {
          results += it
          completion.countDown()
        }
        coordinator.cancel()
      }

      assertTrue(completion.await(5, TimeUnit.SECONDS))
      assertEquals(listOf(false, false), results)
    }
  }

  private class DelayedReviewManager(
    private val fakeReviewManager: FakeReviewManager,
  ) : ReviewManager {
    private val pending = TaskCompletionSource<ReviewInfo>()
    val launchCount = AtomicInteger(0)

    override fun requestReviewFlow(): Task<ReviewInfo> = pending.task

    override fun launchReviewFlow(activity: Activity, reviewInfo: ReviewInfo): Task<Void> {
      launchCount.incrementAndGet()
      return fakeReviewManager.launchReviewFlow(activity, reviewInfo)
    }

    fun completeSuccessfully() {
      val reviewInfo = checkNotNull(fakeReviewManager.requestReviewFlow().result)
      pending.setResult(reviewInfo)
    }

    fun failPreparation() {
      pending.setException(IllegalStateException("Play review preparation failed"))
    }
  }

  private fun launchScenario(): ActivityScenario<AppReviewTestActivity> =
    ActivityScenario.launch<AppReviewTestActivity>(
      Intent(
        InstrumentationRegistry.getInstrumentation().context,
        AppReviewTestActivity::class.java,
      ),
    )
}
