---
paths:
  - "ios/**"
  - "packages/CoreEngine/ios/**"
---

# iOS project

- **Info.plist keys that must stay:**
  - `CADisableMinimumFrameDurationOnPhone` true (unlocks 120 Hz)
  - landscape left and right only, for iPhone and iPad
  - `UIStatusBarHidden` true
  - `UIRequiresFullScreen` true (iPadOS 26 deprecates it; Apple TN3192)
- **Native audio:**
  - Both live in the note engine package, `packages/CoreEngine/ios/`; the app's Xcode project compiles them by path (ADR 0003).
  - `IosAudioInput.mm` is the RemoteIO mic input: 4096-frame buffer, microphone permission, interruptions, and no HFP route.
  - `NativePianoEngineProvider.mm` compiles the engine's binding (`packages/CoreEngine/bindings/`), which pulls in the C++ core (`packages/CoreEngine/cpp/legacy/`).
  - The Xcode project builds the two engine `.mm` files with per-file `-O3` so Debug runs at real-time speed. Keep that.
- After changing native audio code, run the engine gate (`packages/CoreEngine/test/run.sh scenarios`; add `engine` for threading). Then rebuild and reinstall on the owner's iPhone (commands in `CLAUDE.local.md`).
- Never edit `ios/Pods` or build output. After a native dependency change, run `cd ios && pod install`, then rebuild.
- New native code matches the surrounding file's language: Swift for app-level code, Objective-C++ for the engine glue.
