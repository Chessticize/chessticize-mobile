Pod::Spec.new do |s|
  s.name = "ChessticizeStockfish"
  s.version = "18.0.0"
  s.summary = "Offline Stockfish engine bridge for Chessticize Mobile."
  s.description = "Builds the official Stockfish engine source into the iOS app and exposes a React Native UCI transport."
  s.homepage = "https://github.com/official-stockfish/Stockfish"
  s.license = { :type => "GPL-3.0-or-later", :file => "native/stockfish/Copying.txt" }
  s.author = "The Stockfish developers"
  s.platforms = { :ios => "15.1" }
  s.source = { :path => "." }
  s.source_files = [
    "ios/StockfishEngine/Native/**/*.{h,mm}",
    "native/stockfish/Stockfish/src/**/*.{h,cpp}"
  ]
  s.exclude_files = [
    "native/stockfish/Stockfish/src/Makefile",
    "native/stockfish/Stockfish/src/main.cpp"
  ]
  s.resources = "native/stockfish/Resources/*.nnue"
  s.public_header_files = "ios/StockfishEngine/Native/**/*.h"
  s.dependency "React-Core"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "CLANG_CXX_LIBRARY" => "libc++",
    "GCC_ENABLE_CPP_EXCEPTIONS" => "NO",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) NNUE_EMBEDDING_OFF USE_PTHREADS IS_64BIT NO_PREFETCH"
  }
end
