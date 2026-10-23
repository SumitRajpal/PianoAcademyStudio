# Data flows

Claude keeps this file true. Each flow is a `##` heading followed by a `flow` code block of steps joined with `->`. A flow can wrap onto more lines.

- A step is a module, written as it appears in the architecture map (for example `audio/detection`), or one of the outside steps: `mic`, `speaker`, `headphones`, `screen`, `user`, `midi`, `storage`, `network`.
- The checker (`npm run arch:check`, and the Stop hook) fails if a step isn't a module, or if two neighbouring modules have no connection in the code.
- `/arch hot-path` walks every flow that starts at the mic or at playback, and warns when a JS-thread module sits inside it. A heading ending in `(js ok)` marks a flow that crosses the JS thread on purpose (say why in its description).

Example, to replace once the audio and motion code exists:

````text
## note-feedback
Played note → the key on screen lights up.
```flow
mic -> audio/capture -> audio/detection -> sync/events
  -> motion/drivers/keyGlow -> motion/scenes/Keyboard -> screen
```
````

<!-- Add flows below this line. -->

## key-lights

A played note lights its key within one frame, without touching the JS thread: the C++ engine publishes into the lock-free LiveKeys table, and a UI-thread frame callback (`useLiveKeys`) copies changed keys into the PianoMaster key state that CorePiano draws. Details: [note-events.md](../note-events.md).

```flow
mic -> ios -> motion/scenes/PianoMaster/CorePianoNotesDetection
  -> motion/scenes/PianoMaster/shared -> motion/scenes/PianoMaster/CorePiano -> screen
```

## calibration (js ok)

Each strike during calibration reaches the screen through the JS event bus (`noteEventBus`), which checks it and flashes Correct or Wrong on the keyboard. This path crosses the JS thread on purpose: the 700 ms flashes are not frame-critical.

```flow
mic -> ios -> motion/scenes/PianoMaster/CorePianoNotesDetection -> motion/scenes/PianoMaster
  -> screens/CalibrationScreen -> motion/scenes/PianoMaster/CorePiano -> screen
```
