---
paths:
  - "android/**"
---

# Android project (paused)

- Android is paused: the app is built and tested on iOS only for now. Keep the Android project buildable and avoid choices that rule Android out, but never run an Android build without asking. The first build downloads Gradle and NDK 27.1 (3 GB or more), and the Mac's disk is tight.
- `minSdkVersion` is 26 because React Native Skia v3 needs API 26 or later.
- `MainActivity` uses `android:screenOrientation="sensorLandscape"`. Immersive full screen isn't done yet. Apps targeting API 36 have orientation locks ignored on tablets (600dp or more).
- The Oboe mic glue (`app/src/main/jni/OboeInput.*`, `OnLoad.cpp`) isn't wired up yet. It includes the shared C++ engine headers.
- If a build complains about `~/Library/Android/sdk/ndk/27.1.12297006`, that folder holds a failed download: ask the owner to delete it.
