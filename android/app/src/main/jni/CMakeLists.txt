cmake_minimum_required(VERSION 3.13)
project(piano_engine)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 17)

find_package(oboe REQUIRED CONFIG)

# The note engine package (ADR 0003): the app compiles its C++ core, its
# binding and its Android audio input.
set(CORE_ENGINE_DIR ../../../../../packages/CoreEngine)

add_library(piano_engine SHARED
    OnLoad.cpp
    ${CORE_ENGINE_DIR}/android/OboeInput.cpp
    ${CORE_ENGINE_DIR}/bindings/NativePianoEngine.cpp
)

target_include_directories(piano_engine PUBLIC
    .
    ${CORE_ENGINE_DIR}/cpp/legacy
    ${CORE_ENGINE_DIR}/bindings
    ${CORE_ENGINE_DIR}/android
)

target_link_libraries(piano_engine
    oboe::oboe
    android
    log
)
