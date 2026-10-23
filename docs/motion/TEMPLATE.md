# Motion: scene or effect name

- **Library:** React Native Skia (+ Reanimated) for piano-related motion; Rive for non-piano animation
- **Look and timing file:** `xLook.ts` or `*Design.ts`, where every number lives

## Trigger

What starts it: a note event (onset or confirmed pitch), playback position, app state, or time.

## Timeline

| Time (ms) | What happens | Easing / curve |
|---|---|---|
| 0 | | |

## Sync

- **Clock:** the audio clock (stream time) or frame time.
- **Tolerance:** how far it may drift from the sound (for example ±1 frame at 120 fps = 8.3 ms).
- **Latency it hides or shows:** onset vs. confirmed pitch.

## Variants

- **Reduce Motion:** the calmer version, chosen by the motion settings file. It follows the phone's setting unless the in-app setting overrides it.
- **Quality tiers:** what drops first when frames are missed.

## Budget

- UI-thread time per frame (8.3 ms total at 120 fps, shared with everything else).
- Textures baked once; nothing re-blurred per frame.

## Checks

- Moments to render as golden frames (headless), and what each should show.
- What the owner checks on the phone (Release build).
