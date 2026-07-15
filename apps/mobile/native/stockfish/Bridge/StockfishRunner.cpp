#include "StockfishRunner.h"

#include <mutex>
#include <sstream>
#include <string_view>
#include <utility>
#include <vector>

#include "../Stockfish/src/bitboard.h"
#include "../Stockfish/src/engine.h"
#include "../Stockfish/src/position.h"
#include "../Stockfish/src/search.h"
#include "../Stockfish/src/tune.h"
#include "../Stockfish/src/uci.h"
#include "../Stockfish/src/ucioption.h"

using namespace Stockfish;

namespace {

constexpr auto StartFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

std::once_flag stockfishInitFlag;

void initStockfishStatics() {
  std::call_once(stockfishInitFlag, [] {
    Bitboards::init();
    Position::init();
  });
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

}  // namespace

namespace Chessticize::StockfishBridge {

class StockfishRunner::Impl {
 public:
  Impl(
      std::function<void(std::string)> emitLine,
      const std::string& bigNetworkPath,
      const std::string& smallNetworkPath) :
      engine(std::nullopt),
      emit(std::move(emitLine)) {
    Tune::init(engine.get_options());
    configureCallbacks();
    setOption("EvalFile", bigNetworkPath);
    setOption("EvalFileSmall", smallNetworkPath);
    setOption("Threads", "1");
    setOption("Hash", "32");
  }

  ~Impl() {
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
    }
  }

 private:
  Engine engine;
  std::function<void(std::string)> emit;

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

StockfishRunner::StockfishRunner(
    std::function<void(std::string)> emitLine,
    std::string bigNetworkPath,
    std::string smallNetworkPath) {
  initStockfishStatics();
  impl_ = std::make_unique<Impl>(
      std::move(emitLine),
      bigNetworkPath,
      smallNetworkPath);
}

StockfishRunner::~StockfishRunner() = default;

void StockfishRunner::handle(const std::string& command) {
  impl_->handle(command);
}

}  // namespace Chessticize::StockfishBridge
