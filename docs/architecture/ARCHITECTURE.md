# Architecture

> Generated from the code by `npm run arch:build`. Everything between the `arch:generated` markers is rewritten on every build. Claude maintains the Conventions section at the end; the generator leaves it alone.

<!-- arch:generated:start -->

## 1. Overview

| Plane | Thread | Modules | Holds |
|---|---|---|---|
| AUDIO | audio | 0 | mic capture, playback, DSP, onset and pitch detection (native audio thread) |
| SYNC | any | 0 | shared clock, latency compensation, event stream (lock-free) |
| MOTION | ui | 11 | animation drivers, scenes and rendering (UI thread + GPU) |
| SHARED | any | 2 | types, utilities and music-theory tables usable from any thread |
| PLATFORM | native | 2 | iOS and Android projects and native modules |
| APP | js | 3 | screens, navigation, lessons, scoring, progress, storage (JS thread) |

**No problems.** Every rule passes, every module has a purpose, and every flow matches the code.

## 2. Modules

| Module | Kind | Plane | Thread | Purpose | Uses | Used by |
|---|---|---|---|---|---|---|
| `App.tsx` | entry | app | js | Root component: safe-area provider, hidden status bar and the lesson screen, full screen in landscape. | `screens/LessonScreen` | `index.js` |
| `android` | platform | platform | native | Android app project: Gradle build, MainActivity, manifest and native Android code | — | — |
| `index.js` | entry | app | js | Native entry point: registers the root App component with React Native. | `App.tsx` | — |
| `ios` | platform | platform | native | iOS app project: Xcode project, AppDelegate, Info.plist and native iOS code | — | — |
| `motion/scenes/PianoMaster` | scene | motion | ui | The piano's single source of truth on screen, in two parts: CorePiano (the keyboard, any range: 48 keys by default, 88, 108 or any other) and CoreNotes (the sheet music above it). Also owns the key state (which keys are lit, in which role) that lessons and the mic write to on the UI thread. | `motion/scenes/PianoMaster/CoreNotes`, `motion/scenes/PianoMaster/CorePiano`, `motion/scenes/PianoMaster/shared`, `shared/piano` | `screens/LessonScreen` |
| `motion/scenes/PianoMaster/CoreNotes` | module | motion | ui | The staff of a lesson, drawn with Skia and SMuFL music fonts: the staff with its clef, time signature and rests, the QuarterNotes component (heads, stems and duration bars) and the playhead. | `shared/piano` | `motion/scenes/PianoMaster` |
| `motion/scenes/PianoMaster/CorePiano` | module | motion | ui | The piano keyboard at the bottom of PianoMaster: draws any range with Skia from one WhitePianoKey and one BlackPianoKey reused at every position, with the keybed, shadows, marker dots, note names and lit keys. | `motion/scenes/PianoMaster/CorePiano/BlackPianoKey`, `motion/scenes/PianoMaster/CorePiano/BlackPianoKeyShadows`, `motion/scenes/PianoMaster/CorePiano/PianoFrameShadow`, `motion/scenes/PianoMaster/CorePiano/PianoKeybed`, `motion/scenes/PianoMaster/CorePiano/PianoKeyLabel`, `motion/scenes/PianoMaster/CorePiano/PianoKeyMarker` +3 | `motion/scenes/PianoMaster` |
| `motion/scenes/PianoMaster/CorePiano/BlackPianoKey` | module | motion | ui | The one black piano key: how it looks at rest and when lit. CorePiano draws it at every black key position. | `motion/scenes/PianoMaster/shared` | `motion/scenes/PianoMaster/CorePiano` |
| `motion/scenes/PianoMaster/CorePiano/BlackPianoKeyShadows` | module | motion | ui | The shadows the black piano keys cast on the white keys, drawn for all black keys in one blurred layer. | `motion/scenes/PianoMaster/shared` | `motion/scenes/PianoMaster/CorePiano` |
| `motion/scenes/PianoMaster/CorePiano/PianoFrameShadow` | module | motion | ui | The shadow the keyboard frame casts across the top of the white piano keys. | `motion/scenes/PianoMaster/shared` | `motion/scenes/PianoMaster/CorePiano` |
| `motion/scenes/PianoMaster/CorePiano/PianoKeyLabel` | module | motion | ui | Note names on the piano keys: which keys show one and where (pure), and the system text that draws each name. | `motion/scenes/PianoMaster/shared`, `shared/piano`, `shared/typography` | `motion/scenes/PianoMaster/CorePiano` |
| `motion/scenes/PianoMaster/CorePiano/PianoKeyMarker` | module | motion | ui | The dot under a marked piano key, such as middle C. | `motion/scenes/PianoMaster/shared` | `motion/scenes/PianoMaster/CorePiano` |
| `motion/scenes/PianoMaster/CorePiano/PianoKeybed` | module | motion | ui | The keybed under the piano keys: the colour that shows through the gaps between the keys and the frame around them. | `motion/scenes/PianoMaster/shared` | `motion/scenes/PianoMaster/CorePiano` |
| `motion/scenes/PianoMaster/CorePiano/WhitePianoKey` | module | motion | ui | The one white piano key: how it looks at rest and when lit. CorePiano draws it at every white key position. | `motion/scenes/PianoMaster/shared` | `motion/scenes/PianoMaster/CorePiano` |
| `motion/scenes/PianoMaster/shared` | module | motion | ui | What more than one part of PianoMaster uses: the key state (which keys are lit, in which role), the lit-key colours, the key shape, gradients, picture recording and the look units. | `shared/piano` | `motion/scenes/PianoMaster`, `motion/scenes/PianoMaster/CorePiano`, `motion/scenes/PianoMaster/CorePiano/BlackPianoKey`, `motion/scenes/PianoMaster/CorePiano/BlackPianoKeyShadows`, `motion/scenes/PianoMaster/CorePiano/PianoFrameShadow`, `motion/scenes/PianoMaster/CorePiano/PianoKeybed` +3 |
| `screens/LessonScreen` | screen | app | js | The lesson screen: background, top bar, staff and keyboard laid out exactly as the reference design, full screen in landscape. | `motion/scenes/PianoMaster`, `shared/piano`, `shared/typography` | `App.tsx` |
| `shared/piano` | module | shared | any | The piano model: notes, MIDI numbers, frequencies, keyboards of any size and key positions. Pure code, usable from any thread. | — | `motion/scenes/PianoMaster`, `motion/scenes/PianoMaster/CoreNotes`, `motion/scenes/PianoMaster/CorePiano`, `motion/scenes/PianoMaster/CorePiano/PianoKeyLabel`, `motion/scenes/PianoMaster/shared`, `screens/LessonScreen` |
| `shared/typography` | module | shared | any | The system fonts (SF Pro and SF Pro Rounded) and their metrics, so text can be placed by its baseline. React Native font family for SF Pro Rounded on iOS. | — | `motion/scenes/PianoMaster/CorePiano/PianoKeyLabel`, `screens/LessonScreen` |

## 3. Connections

Solid arrows are imports (labelled when a component is rendered); dashed arrows are JS → native calls.

```mermaid
flowchart LR
  subgraph plane_motion["MOTION · ui"]
    m4["motion/scenes/PianoMaster"]
    m5["motion/scenes/PianoMaster/CoreNotes"]
    m6["motion/scenes/PianoMaster/CorePiano"]
    m7["motion/scenes/PianoMaster/CorePiano/BlackPianoKey"]
    m8["motion/scenes/PianoMaster/CorePiano/BlackPianoKeyShadows"]
    m9["motion/scenes/PianoMaster/CorePiano/PianoFrameShadow"]
    m10["motion/scenes/PianoMaster/CorePiano/PianoKeyLabel"]
    m11["motion/scenes/PianoMaster/CorePiano/PianoKeyMarker"]
    m12["motion/scenes/PianoMaster/CorePiano/PianoKeybed"]
    m13["motion/scenes/PianoMaster/CorePiano/WhitePianoKey"]
    m14["motion/scenes/PianoMaster/shared"]
  end
  subgraph plane_shared["SHARED · any"]
    m16["shared/piano"]
    m17["shared/typography"]
  end
  subgraph plane_platform["PLATFORM · native"]
    m1["android"]
    m3["ios"]
  end
  subgraph plane_app["APP · js"]
    m0["App.tsx"]
    m2["index.js"]
    m15["screens/LessonScreen"]
  end
  m0 -->|renders| m15
  m2 --> m0
  m4 --> m5
  m4 --> m6
  m4 --> m14
  m4 --> m16
  m5 --> m16
  m6 --> m7
  m6 --> m8
  m6 --> m9
  m6 --> m12
  m6 -->|renders| m10
  m6 --> m11
  m6 --> m13
  m6 --> m14
  m6 --> m16
  m7 --> m14
  m8 --> m14
  m9 --> m14
  m12 --> m14
  m10 --> m14
  m10 --> m16
  m10 --> m17
  m11 --> m14
  m13 --> m14
  m14 --> m16
  m15 -->|renders| m4
  m15 --> m16
  m15 --> m17
```

## 4. Flows

_No flows yet. Add them to [flows.md](flows.md)._

## 5. Rules

| Rule | Status |
|---|---|
| Screens never touch audio internals or native modules. | ✓ |
| Features and audio are imported only through their public index.ts. | ✓ |
| Motion code may not import features, screens, state stores or audio; it uses other motion code, sync/ and shared/. | ✓ |
| Audio code has no UI imports. | ✓ |
| Code that runs every frame in motion never hands work back to the JS thread. | ✓ |
| Motion code takes durations and easing from tokens, not hard-coded numbers. | ✓ |
| Code on the UI or audio thread never imports JS-thread code. | ✓ |
| No circular imports anywhere. | ✓ |

## 6. File tree

```
App.tsx
android/app/src/main/java/com/pianoacademystudio/
  MainActivity.kt
  MainApplication.kt
index.js
ios/PianoAcademyStudio/
  AppDelegate.swift
src/
  motion/scenes/PianoMaster/
    CoreNotes/
      QuarterNotes.tsx
      drawQuarterNotes.ts
      drawStaff.ts
      index.ts
      paint.ts
      score.ts
      staffLook.ts
      useNotationTypefaces.ts
    CorePiano/
      BlackPianoKey/
        blackPianoKeyLook.ts
        drawBlackPianoKey.ts
        drawBlackPianoKeyLight.ts
        index.ts
      BlackPianoKeyShadows/
        blackPianoKeyShadowsLook.ts
        drawBlackPianoKeyShadows.ts
        index.ts
      CorePiano.tsx
      PianoFrameShadow/
        drawPianoFrameShadow.ts
        index.ts
        pianoFrameShadowLook.ts
      PianoKeyLabel/
        PianoKeyLabel.tsx
        index.ts
        layoutPianoKeyLabels.ts
        pianoKeyLabelLook.ts
      PianoKeyMarker/
        drawPianoKeyMarker.ts
        index.ts
        pianoKeyMarkerLook.ts
      PianoKeybed/
        drawPianoKeybed.ts
        index.ts
        pianoKeybedLook.ts
      WhitePianoKey/
        drawWhitePianoKey.ts
        drawWhitePianoKeyLight.ts
        index.ts
        whitePianoKeyLook.ts
      corePianoLook.ts
      drawCorePiano.ts
      index.ts
      layoutCorePiano.ts
      usePianoKeyLights.ts
    index.ts
    shared/
      index.ts
      keyRoleColors.ts
      linearGradient.ts
      pianoKeyShape.ts
      pianoLookUnits.ts
      pianoState.ts
      recordPicture.ts
  screens/LessonScreen/
    LessonScreen.tsx
    drawLessonBackground.ts
    index.ts
    lessonDesign.ts
  shared/
    piano/
      index.ts
      keyboard.ts
      notes.ts
    typography/
      index.ts
```

<!-- arch:generated:end -->

<!-- arch:conventions:start -->
## 7. Conventions

_Claude keeps this list current: decisions that aren't obvious from file names alone._

- Every module (a folder with an `index.ts`, or a single file) starts with `/** @purpose … */`. Add `@thread ui|js|audio|native|any` when it differs from its plane's default.
- `graph.json` and the generated sections of this file are rebuilt automatically. Never edit them by hand.
- Data flows live in [flows.md](flows.md) and are checked against the code.
<!-- arch:conventions:end -->
