# 0005. The take recorder: a tap on the capture, its own module, takes in Documents

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** the owner, approving the [take recorder spec](../specs/phase-0-slice-2-take-recorder.md) with every recommendation

## Context

Phase 0 needs real recordings (master 5.2), made on the phone exactly as the engine hears them, with each take's conditions, and copied to the Mac's corpus folder. The app runs its current engine until Reevo 2 replaces it in Phase 7, so the recorder must work beside it now and keep working after it is gone. The microphone is captured by `IosAudioInput` (RemoteIO) on the audio thread, which must never block, lock or allocate.

## Options

1. **Where to take the samples:** in the audio callback, where the capture hands them to the engine; or in the engine's analysis loop, which skips audio after a stall, so a take could lose samples.
2. **How JavaScript reaches it:** new methods on the current engine's TurboModule; or a C++ TurboModule of its own.
3. **How takes reach the Mac:** the app's Documents folder shared with the Files app and Finder; a share button per take; or both.
4. **Format:** 32-bit float, exactly the samples the engine receives; or 24-bit PCM.

## Decision

- **A tap on the capture.** One recorder for the one microphone, `piano::capture::takeRecorder()` in `packages/CoreEngine/cpp/capture/TakeRecorder.h`, the first file of Phase 1's `capture/` folder. The audio callback copies its samples into the recorder's ring, allocated up front, only while a take is armed; a writer thread per take drains the ring to the WAV file. Stopping waits until no copy is in flight, so the file ends exactly where the take ended.
- **Its own module**, `NativeTakeRecorder` (`bindings/NativeTakeRecorder.{h,cpp}`, registered by `ios/NativeTakeRecorderProvider.mm`). The current engine's module is not touched, and the recorder outlives it.
- **Takes in `Documents/Takes`**, shared through `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`. Nothing else is stored in Documents.
- **32-bit float WAV**, 48 kHz mono.
- **The split of work:** C++ writes the audio and counts what it saw; JavaScript writes `meta.json`, a provisional one when a take starts and the finished one when it stops, so its fields are tested in Jest and a take cut short still says what it was.
- **iOS interruptions** (a call, a route change, the app leaving the screen) stop the take at once, observed by the provider.

## Consequences

- The audio thread does one bounded copy more per callback, and nothing at all when no take is armed.
- A JS reload mid-take doesn't lose it: the recorder and the open take's id live outside the module, and the screen finishes the take from its provisional `meta.json`.
- Android has no recorder until it resumes: its module isn't registered, so the button is hidden; `OboeInput` gets the same one-line tap then.
- When Reevo 2's bindings move to Nitro (master 12.1), this module moves with them.
