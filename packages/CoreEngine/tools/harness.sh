#!/usr/bin/env bash
# The evaluation harness (master 5.6; docs/harness.md). Builds go to tools/.build (git-ignored).
#   harness.sh test                       the harness's own tests (C++ and Python)
#   harness.sh synth <out> [take ...]     renders the synthetic golden takes into <out>
#   harness.sh score <takes> <runs>       scores runs against labelled takes (score.py report)
#   harness.sh inspect <take> [...]       checks takes from the phone against their meta.json
# The runner, which replays takes through Reevo 2, arrives with the engine's first stage.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$DIR/.build"
mkdir -p "$BUILD"

CXX="${CXX:-clang++}"
PYTHON="${PYTHON:-python3}"
FLAGS=(-std=c++20 -O3 -Wall -Wextra -pthread)

# Rebuilds a tool when its source or the harness headers changed.
tool() {
  local name="$1" src="$2" bin="$BUILD/$1"
  local newer=0
  for f in "$src" "$DIR"/common/*.h "$DIR"/synth/*.h "$DIR"/../test/PianoSynth.h; do
    [[ "$f" -nt "$bin" ]] && newer=1
  done
  if [[ ! -x "$bin" || $newer == 1 ]]; then
    "$CXX" "${FLAGS[@]}" "$src" -o "$bin"
  fi
  echo "$bin"
}

case "${1:-}" in
  test)
    "$(tool harness_test "$DIR/test/harness_test.cpp")"
    (cd "$DIR/score" && "$PYTHON" -m unittest -q test_score)
    (cd "$DIR/rig" && "$PYTHON" -m unittest -q test_rig)
    ;;
  synth)
    [[ $# -ge 2 ]] || { echo "usage: $0 synth <out> [take ...]" >&2; exit 2; }
    shift
    "$(tool synth_take "$DIR/synth/synth_take.cpp")" "$@"
    ;;
  score)
    [[ $# -ge 3 ]] || { echo "usage: $0 score <takes> <runs> [--out report.json]" >&2; exit 2; }
    shift
    "$PYTHON" "$DIR/score/score.py" report "$@"
    ;;
  inspect)
    [[ $# -ge 2 ]] || { echo "usage: $0 inspect <take> [<take> ...]" >&2; exit 2; }
    shift
    "$PYTHON" "$DIR/score/score.py" inspect "$@"
    ;;
  *)
    sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
