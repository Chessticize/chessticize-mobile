#include <jni.h>

#include <functional>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "bitboard.h"
#include "engine.h"
#include "misc.h"
#include "position.h"
#include "search.h"
#include "tune.h"
#include "uci.h"
#include "ucioption.h"

using namespace Stockfish;

namespace {

constexpr auto StartFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

JavaVM* javaVm = nullptr;
std::once_flag stockfishInitFlag;

void initStockfishStatics() {
  std::call_once(stockfishInitFlag, [] {
    Bitboards::init();
    Position::init();
  });
}

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

std::vector<std::string> splitMoves(const std::string& movesText) {
  std::vector<std::string> moves;
  std::istringstream input(movesText);
  std::string move;
  while (input >> move) {
    moves.push_back(move);
  }
  return moves;
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

  void emit(std::string line) const {
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

class StockfishRunner {
 public:
  StockfishRunner(JNIEnv* environment, jobject module) :
      engine(std::nullopt),
      emitter(environment, module) {
    Tune::init(engine.get_options());
    configureCallbacks();
    setOption("Threads", "1");
    setOption("Hash", "32");
  }

  ~StockfishRunner() {
    engine.stop();
    engine.wait_for_search_finished();
  }

  void handle(const std::string& command) {
    std::istringstream input(command);
    std::string token;
    input >> token;

    if (token == "uci") {
      emitter.emit("id name Chessticize Stockfish 18");
      emitter.emit("uciok");
      return;
    }
    if (token == "isready") {
      emitter.emit("readyok");
      return;
    }
    if (token == "setoption") {
      engine.wait_for_search_finished();
      engine.get_options().setoption(input);
      return;
    }
    if (token == "ucinewgame") {
      engine.search_clear();
      return;
    }
    if (token == "position") {
      applyPosition(command);
      return;
    }
    if (token == "go") {
      Search::LimitsType limits = UCIEngine::parse_limits(input);
      engine.go(limits);
      return;
    }
    if (token == "stop" || token == "quit") {
      engine.stop();
    }
  }

 private:
  Engine engine;
  JavaLineEmitter emitter;

  void configureCallbacks() {
    engine.set_on_update_no_moves([this](const Engine::InfoShort& info) {
      std::stringstream output;
      output << "info depth " << info.depth << " score " << UCIEngine::format_score(info.score);
      emitter.emit(output.str());
    });

    engine.set_on_update_full([this](const Engine::InfoFull& info) {
      std::stringstream output;
      output << "info"
             << " depth " << info.depth
             << " seldepth " << info.selDepth
             << " multipv " << info.multiPV
             << " score " << UCIEngine::format_score(info.score);
      if (!info.bound.empty()) {
        output << " " << info.bound;
      }
      output << " nodes " << info.nodes
             << " nps " << info.nps
             << " hashfull " << info.hashfull
             << " tbhits " << info.tbHits
             << " time " << info.timeMs
             << " pv " << info.pv;
      emitter.emit(output.str());
    });

    engine.set_on_bestmove([this](std::string_view bestmove, std::string_view ponder) {
      std::string line = "bestmove " + std::string(bestmove);
      if (!ponder.empty()) {
        line += " ponder " + std::string(ponder);
      }
      emitter.emit(line);
    });

    engine.set_on_verify_networks([this](std::string_view message) {
      std::istringstream lines{std::string(message)};
      std::string line;
      while (std::getline(lines, line)) {
        if (!line.empty()) {
          emitter.emit("info string " + line);
        }
      }
    });
  }

  void setOption(const std::string& name, const std::string& value) {
    std::istringstream option("name " + name + " value " + value);
    engine.get_options().setoption(option);
  }

  void applyPosition(const std::string& command) {
    engine.wait_for_search_finished();
    const std::string fenPrefix = "position fen ";
    const std::string startposPrefix = "position startpos";
    const std::string movesMarker = " moves ";

    if (command.rfind(fenPrefix, 0) == 0) {
      std::string fenAndMoves = command.substr(fenPrefix.size());
      std::vector<std::string> moves;
      const size_t movesIndex = fenAndMoves.find(movesMarker);
      if (movesIndex != std::string::npos) {
        moves = splitMoves(fenAndMoves.substr(movesIndex + movesMarker.size()));
        fenAndMoves = fenAndMoves.substr(0, movesIndex);
      }
      engine.set_position(fenAndMoves, moves);
      return;
    }

    if (command.rfind(startposPrefix, 0) == 0) {
      std::vector<std::string> moves;
      const size_t movesIndex = command.find(movesMarker);
      if (movesIndex != std::string::npos) {
        moves = splitMoves(command.substr(movesIndex + movesMarker.size()));
      }
      engine.set_position(StartFEN, moves);
    }
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
    jobject module) {
  initStockfishStatics();
  auto runner = std::make_unique<StockfishRunner>(environment, module);
  return reinterpret_cast<jlong>(runner.release());
}

extern "C" JNIEXPORT void JNICALL
Java_com_chessticize_mobile_NativeStockfishEngineModule_nativeSend(
    JNIEnv* environment,
    jobject module,
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
