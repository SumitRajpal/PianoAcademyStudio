# 0003. The note engine becomes a workspace package; the app compiles its native code

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** the owner, approving [migration step 2's spec](../specs/migration-step-2-move-the-engine.md) on 2026-11-04

## Context

UI Phase 1 puts everything detection-related in one local native package, `packages/CoreEngine/`, created with npm workspaces. Step 1 untangled the engine, so it now imports nothing from the app. Today the app's Xcode project and Android CMake compile the engine's C++ and audio code straight from `src/`, and the app's codegen config reads the engine's TurboModule spec. Phase 3 moves the bindings to Nitro once a spike passes on the iPhone, and Nitro generates a library's podspec, Android build and autolinking itself.

## Options

1. **Source move.** The package holds every engine file. The app's Xcode project, CMake file and codegen config point at the package's paths. Smallest native change; the package is a folder for the native builds, not yet a library.
2. **A full native library now.** A podspec, an Android library with C++ module autolinking, and the codegen config in the package. A real boundary for the native builds, but autolinking pure C++ TurboModule libraries still has open fixes upstream, and Nitro would replace all of it.

## Decision

Option 1. The import name is `@pianoacademy/core-engine`.

## Consequences

- The TypeScript boundary is real now: the app imports the engine by its package name, and the `audio-no-ui` rule forbids the package any import of app code.
- The native boundary arrives with Nitro, which makes the package a library with its own podspec, Android build and autolinking. Until then, a change to the engine's native files still means editing the app's Xcode project or CMake file.
- `config.mjs`, `.claude/`, `CLAUDE.md` and CI follow the new path.
