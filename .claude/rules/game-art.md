---
paths:
  - "src/screens/game/**"
  - "docs/art-style/**"
---

# Game screens: art style and performance

The art style for game screens is shared with another AI tool. Read both files before changing any game visual; they are the source of truth:

- @.agents/rules/art-style-incredibles-3d-cgi.md
- @docs/art-style/INCREDIBLES_PIXAR_SKIA3_SPEC.md

If the imports above didn't load, open them with the Read tool. Where they conflict with older notes (for example the paper-cut look of the first EggHatch pass), these files win; mention the conflict to the owner.

Performance rules learned on EggHatch:

- Bake every atom once into GPU textures. Never replay saveLayer or blur pictures every frame.
- Draw sprites with `drawImageRectOptions` and linear filtering. Plain `drawImageRect` is nearest-neighbour on device.
- One worklet draws the whole frame. The headless render calls the same function, so render frames and look at them before reporting.
- Judge frame rate on a Release build on the owner's iPhone.
