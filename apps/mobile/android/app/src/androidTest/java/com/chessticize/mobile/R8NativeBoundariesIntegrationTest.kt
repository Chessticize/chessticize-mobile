@file:Suppress("DEPRECATION")

package com.chessticize.mobile

import android.app.Activity
import android.content.pm.ApplicationInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class R8NativeBoundariesIntegrationTest {
  @Test
  fun releaseReflectionBoundariesSurviveOptimization() {
    val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
    assertEquals(
      0,
      targetContext.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE,
    )

    val reactActivity = Class.forName("com.facebook.react.ReactActivity")
    val callbackField = reactActivity.getDeclaredField("mBackPressedCallback")
    assertEquals("androidx.activity.OnBackPressedCallback", callbackField.type.name)

    val delegate = Class.forName(
      "com.chessticize.mobile.MobilePredictiveBackApi34Delegate",
    )
    val constructor = delegate.declaredConstructors.single { candidate ->
      candidate.parameterTypes.size == 1
    }
    val eventSinkType = constructor.parameterTypes.single()
    val eventSink = Proxy.newProxyInstance(
      eventSinkType.classLoader,
      arrayOf(eventSinkType),
    ) { _, _, _ -> null }

    constructor.isAccessible = true
    val instance = constructor.newInstance(eventSink)
    assertNotNull(instance)

    val register = delegate.declaredMethods.single { method ->
      method.parameterTypes.contentEquals(arrayOf(Activity::class.java))
    }
    register.isAccessible = true
    register.invoke(instance, null)
  }

  @Test
  fun stockfishJniLifecycleSurvivesOptimization() {
    val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
    val reactContext = BridgeReactContext(targetContext)
    val module = NativeStockfishEngineModule(reactContext)

    try {
      assertTrue(awaitStart(module))
      assertFalse(awaitStart(module))
      module.send("stop")
      module.onHostPause()
      module.terminate()
      assertTrue(awaitStart(module))
    } finally {
      module.invalidate()
    }
  }

  private fun awaitStart(module: NativeStockfishEngineModule): Boolean {
    val completed = CountDownLatch(1)
    val resolved = AtomicReference<Any?>()
    val rejected = AtomicReference<Any?>()
    module.start(
      PromiseImpl(
        Callback { arguments ->
          resolved.set(arguments.firstOrNull())
          completed.countDown()
        },
        Callback { arguments ->
          rejected.set(arguments.firstOrNull())
          completed.countDown()
        },
      ),
    )

    assertTrue("Stockfish start timed out", completed.await(120, TimeUnit.SECONDS))
    assertNull("Stockfish start rejected: ${rejected.get()}", rejected.get())
    return resolved.get() as Boolean
  }
}
