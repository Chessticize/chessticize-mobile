#include <jni.h>

#include <memory>
#include <string>
#include <utility>

#include "StockfishRunner.h"

using Chessticize::StockfishBridge::StockfishRunner;

namespace {

JavaVM* javaVm = nullptr;

std::string toStdString(JNIEnv* environment, jstring value) {
  if (value == nullptr) {
    return {};
  }
  const char* characters = environment->GetStringUTFChars(value, nullptr);
  std::string result = characters == nullptr ? std::string() : std::string(characters);
  if (characters != nullptr) {
    environment->ReleaseStringUTFChars(value, characters);
  }
  return result;
}

class JavaLineEmitter {
 public:
  JavaLineEmitter(JNIEnv* environment, jobject module) :
      moduleReference(environment->NewGlobalRef(module)) {
    jclass moduleClass = environment->GetObjectClass(module);
    emitMethod = environment->GetMethodID(moduleClass, "emitLine", "(Ljava/lang/String;)V");
    environment->DeleteLocalRef(moduleClass);
  }

  ~JavaLineEmitter() {
    JNIEnv* environment = currentEnvironment();
    if (environment != nullptr && moduleReference != nullptr) {
      environment->DeleteGlobalRef(moduleReference);
    }
  }

  void emit(const std::string& line) const {
    bool attached = false;
    JNIEnv* environment = currentEnvironment(&attached);
    if (environment == nullptr || moduleReference == nullptr || emitMethod == nullptr) {
      return;
    }
    jstring nativeLine = environment->NewStringUTF(line.c_str());
    environment->CallVoidMethod(moduleReference, emitMethod, nativeLine);
    environment->DeleteLocalRef(nativeLine);
    if (environment->ExceptionCheck()) {
      environment->ExceptionClear();
    }
    if (attached) {
      javaVm->DetachCurrentThread();
    }
  }

 private:
  jobject moduleReference;
  jmethodID emitMethod;

  static JNIEnv* currentEnvironment(bool* attached = nullptr) {
    if (javaVm == nullptr) {
      return nullptr;
    }
    JNIEnv* environment = nullptr;
    const jint state = javaVm->GetEnv(reinterpret_cast<void**>(&environment), JNI_VERSION_1_6);
    if (state == JNI_OK) {
      return environment;
    }
    if (state != JNI_EDETACHED ||
        javaVm->AttachCurrentThread(&environment, nullptr) != JNI_OK) {
      return nullptr;
    }
    if (attached != nullptr) {
      *attached = true;
    }
    return environment;
  }
};

StockfishRunner* runnerFromHandle(jlong handle) {
  return reinterpret_cast<StockfishRunner*>(handle);
}

}  // namespace

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  javaVm = vm;
  return JNI_VERSION_1_6;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_chessticize_mobile_NativeStockfishEngineModule_nativeCreate(
    JNIEnv* environment,
    jobject module,
    jstring bigNetworkPath,
    jstring smallNetworkPath) {
  auto emitter = std::make_shared<JavaLineEmitter>(environment, module);
  auto runner = std::make_unique<StockfishRunner>(
      [emitter](std::string line) {
        emitter->emit(line);
      },
      toStdString(environment, bigNetworkPath),
      toStdString(environment, smallNetworkPath));
  return reinterpret_cast<jlong>(runner.release());
}

extern "C" JNIEXPORT void JNICALL
Java_com_chessticize_mobile_NativeStockfishEngineModule_nativeSend(
    JNIEnv* environment,
    jobject,
    jlong handle,
    jstring command) {
  StockfishRunner* runner = runnerFromHandle(handle);
  if (runner != nullptr) {
    runner->handle(toStdString(environment, command));
  }
}

extern "C" JNIEXPORT void JNICALL
Java_com_chessticize_mobile_NativeStockfishEngineModule_nativeDestroy(
    JNIEnv*,
    jobject,
    jlong handle) {
  delete runnerFromHandle(handle);
}
