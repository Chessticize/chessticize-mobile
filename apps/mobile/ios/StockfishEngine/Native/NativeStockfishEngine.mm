#import "NativeStockfishEngine.h"

#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#include "../Stockfish/src/bitboard.h"
#include "../Stockfish/src/engine.h"
#include "../Stockfish/src/misc.h"
#include "../Stockfish/src/position.h"
#include "../Stockfish/src/search.h"
#include "../Stockfish/src/tune.h"
#include "../Stockfish/src/uci.h"
#include "../Stockfish/src/ucioption.h"

using namespace Stockfish;

namespace {

constexpr NSString* StockfishLineEvent = @"StockfishEngineLine";
constexpr auto StartFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

std::once_flag stockfishInitFlag;

void initStockfishStatics() {
  std::call_once(stockfishInitFlag, [] {
    Bitboards::init();
    Position::init();
  });
}

std::string toStdString(NSString* value) {
  return value == nil ? std::string() : std::string([value UTF8String]);
}

NSString* toNSString(std::string_view value) {
  return [[NSString alloc] initWithBytes:value.data()
                                  length:value.size()
                                encoding:NSUTF8StringEncoding];
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

class StockfishRunner {
 public:
  explicit StockfishRunner(std::function<void(std::string)> emitLine) :
      engine(std::nullopt),
      emit(std::move(emitLine)) {
    Tune::init(engine.get_options());
    configureCallbacks();
    configureBundledNetworks();
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
      emit("id name Chessticize Stockfish 18");
      emit("uciok");
      return;
    }
    if (token == "isready") {
      emit("readyok");
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
      return;
    }
  }

 private:
  Engine engine;
  std::function<void(std::string)> emit;
  std::string currentFen = StartFEN;

  void configureCallbacks() {
    engine.set_on_update_no_moves([this](const Engine::InfoShort& info) {
      std::stringstream output;
      output << "info depth " << info.depth << " score " << UCIEngine::format_score(info.score);
      emit(output.str());
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
      emit(output.str());
    });

    engine.set_on_bestmove([this](std::string_view bestmove, std::string_view ponder) {
      std::string line = "bestmove " + std::string(bestmove);
      if (!ponder.empty()) {
        line += " ponder " + std::string(ponder);
      }
      emit(line);
    });

    engine.set_on_verify_networks([this](std::string_view message) {
      std::istringstream lines{std::string(message)};
      std::string line;
      while (std::getline(lines, line)) {
        if (!line.empty()) {
          emit("info string " + line);
        }
      }
    });
  }

  void configureBundledNetworks() {
    NSString* bigPath = [[NSBundle mainBundle] pathForResource:@"nn-c288c895ea92" ofType:@"nnue"];
    NSString* smallPath = [[NSBundle mainBundle] pathForResource:@"nn-37f18f62d772" ofType:@"nnue"];
    if (bigPath != nil) {
      setOption("EvalFile", toStdString(bigPath));
    } else {
      emit("info string bundled NNUE network nn-c288c895ea92.nnue not found in app bundle");
    }
    if (smallPath != nil) {
      setOption("EvalFileSmall", toStdString(smallPath));
    } else {
      emit("info string bundled NNUE network nn-37f18f62d772.nnue not found in app bundle");
    }
  }

  void setOption(const std::string& name, const std::string& value) {
    std::istringstream option("name " + name + " value " + value);
    engine.get_options().setoption(option);
  }

  void applyPosition(const std::string& command) {
    engine.wait_for_search_finished();

    const std::string fenPrefix = "position fen ";
    const std::string startposPrefix = "position startpos";
    if (command.rfind(fenPrefix, 0) == 0) {
      std::string fenAndMoves = command.substr(fenPrefix.size());
      std::vector<std::string> moves;
      const std::string movesMarker = " moves ";
      size_t movesIndex = fenAndMoves.find(movesMarker);
      if (movesIndex != std::string::npos) {
        moves = splitMoves(fenAndMoves.substr(movesIndex + movesMarker.size()));
        fenAndMoves = fenAndMoves.substr(0, movesIndex);
      }
      currentFen = fenAndMoves;
      engine.set_position(fenAndMoves, moves);
      return;
    }

    if (command.rfind(startposPrefix, 0) == 0) {
      std::vector<std::string> moves;
      const std::string movesMarker = " moves ";
      size_t movesIndex = command.find(movesMarker);
      if (movesIndex != std::string::npos) {
        moves = splitMoves(command.substr(movesIndex + movesMarker.size()));
      }
      currentFen = StartFEN;
      engine.set_position(StartFEN, moves);
    }
  }
};

}  // namespace

@implementation NativeStockfishEngine {
  dispatch_queue_t _engineQueue;
  std::unique_ptr<StockfishRunner> _runner;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  if ((self = [super init])) {
    _engineQueue = dispatch_queue_create("app.chessticize.stockfish", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (NSArray<NSString*>*)supportedEvents {
  return @[ StockfishLineEvent ];
}

RCT_REMAP_METHOD(start,
                 startWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(_engineQueue, ^{
    @try {
      initStockfishStatics();
      if (self->_runner == nullptr) {
        __weak NativeStockfishEngine* weakSelf = self;
        self->_runner = std::make_unique<StockfishRunner>([weakSelf](std::string line) {
          NativeStockfishEngine* strongSelf = weakSelf;
          if (strongSelf == nil) {
            return;
          }
          NSString* nativeLine = toNSString(line);
          dispatch_async(dispatch_get_main_queue(), ^{
            [strongSelf sendEventWithName:StockfishLineEvent body:@{ @"line": nativeLine }];
          });
        });
      }
      resolve(nil);
    } @catch (NSException* exception) {
      reject(@"stockfish_start_failed", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(send:(NSString*)command) {
  std::string nativeCommand = toStdString(command);
  dispatch_async(_engineQueue, ^{
    if (self->_runner == nullptr) {
      return;
    }
    self->_runner->handle(nativeCommand);
  });
}

RCT_EXPORT_METHOD(terminate) {
  dispatch_async(_engineQueue, ^{
    self->_runner.reset();
  });
}

@end
