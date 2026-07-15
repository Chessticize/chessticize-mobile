require "json"

stockfish = JSON.parse(File.read(File.join(__dir__, "stockfish-artifacts.json")))
stockfish_root = stockfish.fetch("root")
stockfish_bridge = File.join(stockfish_root, stockfish.fetch("bridge"))
stockfish_source = File.join(stockfish_root, stockfish.fetch("source"))

Pod::Spec.new do |s|
  s.name = stockfish.fetch("podName")
  s.version = stockfish.fetch("podVersion")
  s.summary = "Offline Stockfish engine bridge for Chessticize Mobile."
  s.description = "Builds the official Stockfish engine source into the iOS app and exposes a React Native UCI transport."
  s.homepage = "https://github.com/official-stockfish/Stockfish"
  s.license = { :type => "GPL-3.0-or-later", :file => File.join(stockfish_root, stockfish.fetch("license")) }
  s.author = "The Stockfish developers"
  s.platforms = { :ios => "15.1" }
  s.source = { :path => "." }
  s.source_files = [
    "ios/StockfishEngine/Native/**/*.{h,mm}",
    File.join(stockfish_bridge, "**/*.{h,cpp}"),
    File.join(stockfish_source, "**/*.{h,cpp}")
  ]
  s.exclude_files = [
    File.join(stockfish_source, "Makefile"),
    File.join(stockfish_source, "main.cpp")
  ]
  s.resources = stockfish.fetch("nnue").map { |path| File.join(stockfish_root, path) } + ["stockfish-artifacts.json"]
  s.public_header_files = "ios/StockfishEngine/Native/**/*.h"
  s.dependency "React-Core"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "CLANG_CXX_LIBRARY" => "libc++",
    "GCC_ENABLE_CPP_EXCEPTIONS" => "NO",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) NNUE_EMBEDDING_OFF USE_PTHREADS IS_64BIT NO_PREFETCH"
  }
end
