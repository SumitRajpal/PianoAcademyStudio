cmake_minimum_required(VERSION 3.13)
project(piano_engine)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 17)

find_package(oboe REQUIRED CONFIG)

set(PIANO_SHARED_DIR ../../../../../src/motion/scenes/PianoMaster/CorePianoNotesDetection/shared)

add_library(piano_engine SHARED
    OboeInput.cpp
    OnLoad.cpp
    ${PIANO_SHARED_DIR}/NativePianoEngine.cpp
)

target_include_directories(piano_engine PUBLIC
    .
    ${PIANO_SHARED_DIR}
)

target_link_libraries(piano_engine
    oboe::oboe
    android
    log
)
