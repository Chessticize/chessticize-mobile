#include "StockfishRunner.h"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <iostream>
#include <mutex>
#include <string>
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
  int maxDepth = 0;

  StockfishRunner runner(
      [&](std::string line) {
        {
          std::lock_guard lock(mutex);
          if (line.rfind("info depth ", 0) == 0) {
            constexpr auto DepthPrefixLength =
                std::string_view("info depth ").size();
            maxDepth =
                std::max(maxDepth, std::atoi(line.c_str() + DepthPrefixLength));
          } else if (line.rfind("bestmove ", 0) == 0) {
            ++bestmoves;
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
            std::chrono::seconds(15),
            [&] { return maxDepth >= 17; })) {
      std::cerr << "xBqI8 parent search did not reach depth 17.\n";
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
  runner.handle("go depth 20");

  {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(
            lock,
            std::chrono::seconds(30),
            [&] { return bestmoves >= 3; })) {
      std::cerr << "xBqI8 replacement searches did not complete.\n";
      return 3;
    }
  }

  std::cout
      << "xBqI8 parent, shallow child, and full child searches completed.\n";
  return 0;
}
