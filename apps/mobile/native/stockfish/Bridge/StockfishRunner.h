#pragma once

#include <functional>
#include <memory>
#include <string>

namespace Chessticize::StockfishBridge {

class StockfishRunner {
 public:
  StockfishRunner(
      std::function<void(std::string)> emitLine,
      std::string bigNetworkPath,
      std::string smallNetworkPath);
  ~StockfishRunner();

  StockfishRunner(const StockfishRunner&) = delete;
  StockfishRunner& operator=(const StockfishRunner&) = delete;

  void handle(const std::string& command);

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace Chessticize::StockfishBridge
