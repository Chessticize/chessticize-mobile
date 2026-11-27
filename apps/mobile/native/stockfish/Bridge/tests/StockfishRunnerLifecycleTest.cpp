#include "StockfishRunner.h"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <iostream>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>

using Chessticize::StockfishBridge::StockfishRunner;

namespace {

constexpr auto ParentFen =
    "8/8/2p1p3/1p2pkp1/1PP5/P3K1P1/6P1/8 b - - 0 1";
constexpr auto ChildFen =
    "8/8/2p1p3/1p3kp1/1PP1p3/P3K1P1/6P1/8 w - - 0 2";

}  // namespace

int main(int argc, char** argv) {
  if (argc != 3) {
    std::cerr << "Expected big and small NNUE paths.\n";
    return 64;
  }

  std::mutex mutex;
  std::condition_variable changed;
  int bestmoves = 0;
  int iterationUpdates = 0;
  int maxDepth = 0;
  std::string lastBestmove;
  std::string lastInfoWithPv;

  StockfishRunner runner(
      [&](std::string line) {
        {
          std::lock_guard lock(mutex);
          if (line.rfind("info depth ", 0) == 0) {
            constexpr auto DepthPrefixLength =
                std::string_view("info depth ").size();
            maxDepth =
                std::max(maxDepth, std::atoi(line.c_str() + DepthPrefixLength));
            if (line.find(" currmove ") != std::string::npos) {
              ++iterationUpdates;
            }
            if (line.find(" pv ") != std::string::npos) {
              lastInfoWithPv = line;
            }
          } else if (line.rfind("bestmove ", 0) == 0) {
            ++bestmoves;
            constexpr auto BestmovePrefixLength =
                std::string_view("bestmove ").size();
            const auto rest = line.substr(BestmovePrefixLength);
            const auto spacePos = rest.find(' ');
            lastBestmove =
                spacePos == std::string::npos ? rest : rest.substr(0, spacePos);
          }
        }
        changed.notify_all();
      },
      argv[1],
      argv[2]);

  runner.handle("setoption name MultiPV value 3");
  runner.handle(std::string("position fen ") + ParentFen);
  runner.handle("go depth 20");

  {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(
            lock,
            std::chrono::seconds(10),
            [&] { return maxDepth >= 8; })) {
      std::cerr << "xBqI8 parent search did not become active.\n";
      return 2;
    }
  }

  // Reproduce the reported Analysis transition: stop the active parent search,
  // apply e5e4, run the shallow preview, then replace it with depth 20.
  runner.handle("stop");
  runner.handle(std::string("position fen ") + ChildFen);
  runner.handle("go depth 8");
  std::this_thread::sleep_for(std::chrono::milliseconds(500));
  runner.handle("stop");

  int fullSearchIterationBaseline = 0;
  {
    std::lock_guard lock(mutex);
    fullSearchIterationBaseline = iterationUpdates;
  }
  runner.handle("go depth 20");

  // The crash boundary is Stockfish's first onIter call after 10,000,000
  // nodes. Natural depth-20 completion is CPU-dependent and is not required
  // to prove that the callback remains registered.
  {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(
            lock,
            std::chrono::seconds(45),
            [&] {
              return iterationUpdates > fullSearchIterationBaseline;
            })) {
      std::cerr
          << "xBqI8 full child search did not exercise the iteration callback.\n";
      return 3;
    }
  }

  runner.handle("stop");

  {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(
            lock,
            std::chrono::seconds(5),
            [&] { return bestmoves >= 3; })) {
      std::cerr << "xBqI8 replacement searches did not stop cleanly.\n";
      return 4;
    }
  }

  // Verify go nodes, go movetime, and go depth ... searchmoves ... primitives
  // against the real Stockfish 18 runner.
  int bestmovesBeforeNodes = 0;
  {
    std::lock_guard lock(mutex);
    bestmovesBeforeNodes = bestmoves;
    lastBestmove.clear();
    lastInfoWithPv.clear();
  }
  runner.handle("setoption name MultiPV value 1");
  runner.handle("position startpos");
  runner.handle("go nodes 5000");

  {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(
            lock,
            std::chrono::seconds(10),
            [&] { return bestmoves >= bestmovesBeforeNodes + 1; })) {
      std::cerr << "go nodes 5000 did not complete cleanly.\n";
      return 5;
    }
    if (lastBestmove.empty() ||
        lastInfoWithPv.find(" nodes ") == std::string::npos) {
      std::cerr << "go nodes 5000 did not emit expected info/bestmove.\n";
      return 6;
    }
  }

  int bestmovesBeforeMovetime = 0;
  {
    std::lock_guard lock(mutex);
    bestmovesBeforeMovetime = bestmoves;
    lastBestmove.clear();
  }
  runner.handle("go movetime 50");

  {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(
            lock,
            std::chrono::seconds(10),
            [&] { return bestmoves >= bestmovesBeforeMovetime + 1; })) {
      std::cerr << "go movetime 50 did not complete cleanly.\n";
      return 7;
    }
    if (lastBestmove.empty()) {
      std::cerr << "go movetime 50 emitted empty bestmove.\n";
      return 8;
    }
  }

  int bestmovesBeforeSearchmoves = 0;
  {
    std::lock_guard lock(mutex);
    bestmovesBeforeSearchmoves = bestmoves;
    lastBestmove.clear();
    lastInfoWithPv.clear();
  }
  runner.handle("position startpos");
  runner.handle("go depth 8 searchmoves a2a3");

  {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(
            lock,
            std::chrono::seconds(10),
            [&] { return bestmoves >= bestmovesBeforeSearchmoves + 1; })) {
      std::cerr << "go depth 8 searchmoves a2a3 did not complete cleanly.\n";
      return 9;
    }
    if (lastBestmove != "a2a3" ||
        lastInfoWithPv.find(" pv a2a3") == std::string::npos) {
      std::cerr << "go depth 8 searchmoves a2a3 did not restrict search to "
                   "a2a3 (bestmove="
                << lastBestmove << ", info=" << lastInfoWithPv << ").\n";
      return 10;
    }
  }

  std::cout
      << "xBqI8 parent, shallow child, callback-exercising full child, "
         "go nodes, go movetime, and go searchmoves searches completed.\n";
  return 0;
}
