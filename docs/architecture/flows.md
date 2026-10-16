# Data flows

Claude keeps this file true. Each flow is a `##` heading followed by a `flow` code block of steps joined with `->`. A flow can wrap onto more lines.

- A step is a module, written as it appears in the architecture map (for example `audio/detection`), or one of the outside steps: `mic`, `speaker`, `headphones`, `screen`, `user`, `midi`, `storage`, `network`.
- The checker (`npm run arch:check`, and the Stop hook) fails if a step isn't a module, or if two neighbouring modules have no connection in the code.
- `/arch hot-path` walks every flow that starts at the mic or at playback, and warns when a JS-thread module sits inside it.

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
