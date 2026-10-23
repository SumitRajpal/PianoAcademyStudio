# Pressed piano keys

The inactive design is unchanged. Active white and black keys use the role
colours below, a clipped inset shadow and a short front lip. Black keys keep
dark side rails around the coloured face. Press/release is immediate; there
is no continuous animation, touch handler or audio implementation.

## Recommended input: one shared state, one update per chord

```tsx
import { useEffect } from 'react';
import {
  setPressedKeys,
  usePianoState,
  type NoteInput,
} from '/Users/mookit/Desktop/PianoAcademyStudio/src/motion/scenes/PianoMaster';
import { LessonScreen } from '/Users/mookit/Desktop/PianoAcademyStudio/src/screens/LessonScreen';

export function ControlledLesson({
  heldNotes,
}: {
  heldNotes: readonly NoteInput[];
}) {
  const piano = usePianoState();

  useEffect(() => {
    setPressedKeys(piano, heldNotes);
  }, [piano, heldNotes]);

  return <LessonScreen pianoState={piano} />;
}
```

`heldNotes` is the **complete currently pressed set** (for input that
reports changes instead, see below), for example
`['C4', 'C#4', 'E4', 'G4']`. `[]` releases all pressed keys. It accepts
MIDI numbers too, and sharps/flats are equivalent (`C#4` = `Db4` = `61`).
Invalid names or MIDI numbers throw before changing state. Notes outside the
displayed range remain in shared state but are not drawn. The default lesson
range is C2–B5, so C1 will not appear unless the keyboard range includes it.

For a standalone keyboard pass the same state to `CorePiano` through its
existing `state` prop instead. Multiple keyboards can share one state.

## High-frequency input (mic, MIDI)

Input can arrive every few milliseconds, so every input call is O(1) per key
and never goes through React:

| Input reports…                     | Call                                                        | Cost                          |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| a change: note on / note off       | `pressKey(piano, midi, level?)` / `releaseKey(piano, midi)` | O(1), no allocation           |
| what is down now, not what changed | `setPressedMidiKeys(piano, midiNotes)`                      | O(new + previously held keys) |
| stop                               | `releaseAllKeys(piano)`                                     | O(held keys)                  |
| is this key down?                  | `isKeyPressed(piano, midi)`                                 | O(1)                          |

Held keys are a sparse set: a list of held keys plus each key's slot in it. So
`setPressedMidiKeys` works out which keys were pressed and released itself,
touching only the keys in the old and new chords, never all 128 notes. An
unchanged chord, a repeated press or a release of a key that is up changes
nothing and does not redraw. Invalid MIDI numbers are ignored; a level of 0
releases.

The mic does not call these from JS. `CorePianoNotesDetection` (or
`useCorePianoNotesDetection({ pianoState })`) lights the keys on the UI thread
straight from the engine's native key table, so detected keys never wait for
the JS thread: see [note-events.md](note-events.md).

All of these are worklets. Call them on the UI thread (a worklet input
callback) or from JS, which costs one hop to the UI thread per call. Call
`isKeyPressed` on the UI thread: on JS, reading the shared value waits for the
UI thread and copies the whole state. `setPressedKeys` takes note names and is
for JS callers; it parses the names first, so prefer MIDI numbers for input.

However many keys change within one frame, the lit keys are redrawn once, on
the next frame. Static keyboard pictures stay cached; only the lit-key
pictures are recorded.

The gradients are vertical and every key of one colour shares the same top and
height, so each layer makes its shaders once per role colour
(`makePianoKeyLights`, on the JS thread, when the layout, look or colours
change). A key's light level is the paint's alpha. A redraw on the UI thread
therefore only issues draw calls: no colour parsing and no shader creation,
whatever the chord size or how often it changes.

## Roles and release behaviour

| Role    | Default face colour  |
| ------- | -------------------- |
| Pressed | Marigold `#FFB648`   |
| Target  | Warm cream `#F5E6B8` |
| Correct | Mint `#BFE8CE`       |
| Wrong   | Blush `#F2C4CB`      |

Pressed is an orange-yellow, stronger than the pastel lesson roles, so a held
key stands out and never reads as a Target. Keys the mic detects light at
least 55% strong (`CORE_PIANO_NOTES_DETECTION_LOOK.keys.softestLevel`), so a
soft strike still shows clearly.

The `CorePiano` `roles` prop overrides these defaults.

Held keys and lesson roles are **separate layers**. Input only changes held
keys; the lesson only changes roles with `lightKey`, `unlightKey` and
`unlightAllKeys` (which leave held keys held). A key shows, first match wins:

1. Correct or Wrong feedback, so the player sees it on the key they hold;
2. held down, in the Pressed colour;
3. any other role, such as Target, which shows again once the key is released.

## Validation and visual preview

Jest uses real CanvasKit raster output to check active chords, role colours,
depth, clipping, partial light levels and exact restoration on release. Its
Canvas/Reanimated mocks do **not** prove native Graphite rendering or device
frame rate; check those on iOS/Android before making performance claims.

To generate a landscape lesson preview without changing the app:

```sh
cd /Users/mookit/Desktop/PianoAcademyStudio
DESIGN_PRESSED_KEYS='C3,C#3,E3,F#3,G4' DESIGN_OUT=/tmp/piano-pressed.png \
  npm test -- --runInBand scripts/design/__tests__/lessonRender.test.ts
```

Omit `DESIGN_PRESSED_KEYS` to render the original inactive design.
