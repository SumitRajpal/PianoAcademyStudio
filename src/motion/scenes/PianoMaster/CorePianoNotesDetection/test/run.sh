#!/usr/bin/env bash
# Note engine tests (desktop C++). Builds go to test/.build (git-ignored).
#   ./run.sh                 benchmark (quick) + scenarios + engine
#   ./run.sh quick|full|upright   the benchmark only
#   ./run.sh scenarios [section] [harsh]   the regression suite
#   ./run.sh engine          engine threads and the live key table under ThreadSanitizer, then optimised
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$DIR/.build"
mkdir -p "$BUILD"
cd "$DIR"

CXX="${CXX:-clang++}"
FLAGS=(-std=c++20 -Wall -Wextra -pthread -I../shared)

benchmark() {
  echo "Compiling benchmark..."
  "$CXX" "${FLAGS[@]}" -O3 benchmark.cpp -o "$BUILD/benchmark"
  "$BUILD/benchmark" "${1:-quick}"
}

scenarios() {
  echo "Compiling scenarios..."
  "$CXX" "${FLAGS[@]}" -O3 scenarios.cpp -o "$BUILD/scenarios"
  "$BUILD/scenarios" "$@"
}

engine() {
  echo "Compiling engine and live keys tests with ThreadSanitizer..."
  "$CXX" "${FLAGS[@]}" -O1 -g -fsanitize=thread engine_test.cpp -o "$BUILD/engine_tsan"
  "$CXX" "${FLAGS[@]}" -O1 -g -fsanitize=thread live_keys_test.cpp -o "$BUILD/live_keys_tsan"
  TSAN_OPTIONS="halt_on_error=1 exitcode=66" "$BUILD/engine_tsan"
  TSAN_OPTIONS="halt_on_error=1 exitcode=66" "$BUILD/live_keys_tsan"
  echo "Compiling engine and live keys tests (optimised, for timing)..."
  "$CXX" "${FLAGS[@]}" -O3 engine_test.cpp -o "$BUILD/engine"
  "$CXX" "${FLAGS[@]}" -O3 live_keys_test.cpp -o "$BUILD/live_keys"
  "$BUILD/engine"
  "$BUILD/live_keys"
}

case "${1:-all}" in
  quick | full | upright) benchmark "$1" ;;
  scenarios) shift; scenarios "$@" ;;
  engine) engine ;;
  all)
    benchmark quick
    scenarios
    engine
    ;;
  *)
    echo "usage: $0 [quick|full|upright|scenarios [section] [harsh]|engine|all]" >&2
    exit 2
    ;;
esac
