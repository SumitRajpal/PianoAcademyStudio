#!/usr/bin/env bash
# The evaluation harness (master 5.6; docs/harness.md). Builds go to tools/.build (git-ignored).
#   harness.sh test                       the harness's own tests (C++ and Python)
#   harness.sh synth <out>                renders the synthetic golden takes into <out>
#   harness.sh replay <take> --out <run> [replay options]
#   harness.sh corpus <takes> <runs>      replays every take in a folder, such as $PIANO_CORPUS
#   harness.sh check [--update]           goldens: render, replay, score, compare with goldens/baseline.json
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$DIR/.build"
mkdir -p "$BUILD"

CXX="${CXX:-clang++}"
PYTHON="${PYTHON:-python3}"
FLAGS=(-std=c++20 -O3 -Wall -Wextra -pthread)
ENGINE_SOURCES=("$DIR"/../cpp/legacy/*.h)

# Rebuilds a tool when its source, the harness headers or the engine changed.
tool() {
  local name="$1" src="$2" bin="$BUILD/$1"
  local newer=0
  for f in "$src" "$DIR"/common/*.h "$DIR"/replay/*.h "$DIR"/synth/*.h "${ENGINE_SOURCES[@]}" "$DIR"/../test/PianoSynth.h; do
    [[ "$f" -nt "$bin" ]] && newer=1
  done
  if [[ ! -x "$bin" || $newer == 1 ]]; then
    "$CXX" "${FLAGS[@]}" "$src" -o "$bin"
  fi
  echo "$bin"
}

replay_takes() {
  local takes="$1" runs="$2" replay
  replay="$(tool replay "$DIR/replay/replay.cpp")"
  for take in "$takes"/*/; do
    [[ -f "$take/audio.wav" ]] || continue
    local name args=()
    name="$(basename "$take")"
    if [[ -f "$take/replay.args" ]]; then read -r -a args < "$take/replay.args"; fi
    "$replay" "$take" --out "$runs/$name" ${args[@]+"${args[@]}"} > /dev/null
  done
}

case "${1:-}" in
  test)
    "$(tool replay_test "$DIR/test/replay_test.cpp")"
    (cd "$DIR/score" && "$PYTHON" -m unittest -q test_score)
    ;;
  synth)
    [[ $# -ge 2 ]] || { echo "usage: $0 synth <out> [take ...]" >&2; exit 2; }
    shift
    "$(tool synth_take "$DIR/synth/synth_take.cpp")" "$@"
    ;;
  replay)
    shift
    "$(tool replay "$DIR/replay/replay.cpp")" "$@"
    ;;
  corpus)
    [[ $# -eq 3 ]] || { echo "usage: $0 corpus <takes> <runs>" >&2; exit 2; }
    replay_takes "$2" "$3"
    "$PYTHON" "$DIR/score/score.py" report "$2" "$3" --out "$3/report.json"
    ;;
  check)
    out="$BUILD/goldens"
    rm -rf "$out"
    "$(tool synth_take "$DIR/synth/synth_take.cpp")" "$out/takes" > /dev/null
    replay_takes "$out/takes" "$out/runs"
    "$PYTHON" "$DIR/score/score.py" report "$out/takes" "$out/runs" --out "$out/report.json"
    echo
    if [[ "${2:-}" == "--update" ]]; then
      cp "$out/report.json" "$DIR/goldens/baseline.json"
      echo "Baseline updated: tools/goldens/baseline.json"
    else
      "$PYTHON" "$DIR/score/score.py" compare "$DIR/goldens/baseline.json" "$out/report.json" --per-take
    fi
    ;;
  *)
    sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
