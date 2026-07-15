cmake_minimum_required(VERSION 3.22.1)
project(appmodules LANGUAGES CXX)

# Retain React Native's New Architecture application target and module
# registration before composing the independent Stockfish JNI library.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

set(STOCKFISH_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../native/stockfish/Stockfish/src")

file(GLOB STOCKFISH_SOURCES CONFIGURE_DEPENDS
  "${STOCKFISH_SOURCE_DIR}/*.cpp"
  "${STOCKFISH_SOURCE_DIR}/nnue/*.cpp"
  "${STOCKFISH_SOURCE_DIR}/nnue/features/*.cpp"
  "${STOCKFISH_SOURCE_DIR}/syzygy/*.cpp"
)

add_library(stockfish SHARED
  stockfish/NativeStockfishEngine.cpp
  ${STOCKFISH_SOURCES}
)
set_property(TARGET stockfish PROPERTY INTERPROCEDURAL_OPTIMIZATION FALSE)

target_include_directories(stockfish PRIVATE "${STOCKFISH_SOURCE_DIR}")
target_compile_features(stockfish PRIVATE cxx_std_20)
target_compile_definitions(stockfish PRIVATE IS_64BIT USE_PTHREADS NDEBUG NNUE_EMBEDDING_OFF)
target_compile_options(stockfish PRIVATE
  -O3
  -fno-exceptions
  -fno-rtti
  -funroll-loops
)
target_link_options(stockfish PRIVATE
  "-Wl,-z,max-page-size=16384"
  "-Wl,-z,common-page-size=16384"
)

if(ANDROID_ABI STREQUAL "arm64-v8a")
  target_compile_definitions(stockfish PRIVATE USE_POPCNT USE_NEON=8)
elseif(ANDROID_ABI STREQUAL "x86_64")
  target_compile_definitions(stockfish PRIVATE USE_SSE2)
  target_compile_options(stockfish PRIVATE -msse2)
else()
  message(FATAL_ERROR "Unsupported Stockfish Android ABI: ${ANDROID_ABI}")
endif()

find_library(android-log-lib log)
target_link_libraries(stockfish PRIVATE ${android-log-lib})
