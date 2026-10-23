# Build troubleshooting

When an iOS, Android or CocoaPods command fails, a Claude hook matches the error against the **Signature** of each entry below (a case-insensitive regular expression) and gives Claude the **Fix**. When Claude solves a build error that isn't listed, it adds an entry here in the same format, so the next failure gets a hint.

Format:

```text
### Short title
- **Signature:** `regex that matches the error text`
- **Fix:** what to do (can continue on following lines)
```

## iOS

### CocoaPods can't find compatible versions
- **Signature:** `could not find compatible versions for pod|out-of-date source repos|pod repo update`
- **Fix:** run `cd ios && pod install --repo-update`, then rebuild.

### Pods missing or out of sync
- **Signature:** `sandbox is not in sync with the Podfile\.lock|No such module 'React|Unable to open base configuration reference file`
- **Fix:** run `cd ios && pod install`, then rebuild. A new native package always needs this, plus a rebuild and reinstall on the phone.

### The iPhone "Ramster" isn't reachable
- **Signature:** `Unable to find a destination matching|(device|destination).{0,60}(not found|unavailable|locked|could not be found|is not available)|passcode protected`
- **Fix:** run `xcrun devicectl list devices`. If Ramster is missing or `unavailable`, ask the owner to connect it (USB or the same Wi-Fi), unlock it and trust this Mac, then wait. It drops to unavailable when its screen locks, so check again right before install and launch. Never fall back to a simulator.

### Signing needs a team
- **Signature:** `requires a development team|No profiles for|No signing certificate|Provisioning profile .* doesn't`
- **Fix:** pass the team on the command line: `DEVELOPMENT_TEAM=<team> CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates` (the team and device details are in `CLAUDE.local.md`).

### Metro unreachable, or no bundle
- **Signature:** `No bundle URL present|Could not connect to development server|Could not connect to the server`
- **Fix:** start Metro with `npm start`. The phone must be on the Mac's Wi-Fi with the iOS Local Network permission allowed. Without Metro the app runs the JS bundled at build time.

### A build script phase failed
- **Signature:** `Command PhaseScriptExecution failed`
- **Fix:** scroll up for the script's own error. Common causes: Xcode can't find Node (set `NODE_BINARY` in `ios/.xcode.env.local`), or codegen failed after the TurboModule spec changed (run `cd ios && pod install` again).

## Mac

### Disk full
- **Signature:** `No space left on device|ENOSPC|not enough (disk )?space`
- **Fix:** the Mac's disk is tight. Check `df -h /`, then ask the owner before clearing anything (for example `~/Library/Developer/Xcode/DerivedData`).

## Android (paused: iOS only for now)

### Android SDK not found
- **Signature:** `SDK location not found|ANDROID_HOME|ANDROID_SDK_ROOT`
- **Fix:** Android is paused, so ask the owner before any Android build. When it comes back: `export ANDROID_HOME=$HOME/Library/Android/sdk` and add `$ANDROID_HOME/platform-tools` to PATH. The first build downloads Gradle and NDK 27.1 (3 GB or more), so check free disk space first.

### Half-downloaded NDK
- **Signature:** `ndk/27\.1\.12297006|did not have a source\.properties file`
- **Fix:** an earlier NDK download failed and left `~/Library/Android/sdk/ndk/27.1.12297006` behind. Ask the owner to delete that folder, then rebuild.

### Wrong Java version
- **Signature:** `Unsupported class file major version|JAVA_HOME is not set|requires Java \d+`
- **Fix:** point `JAVA_HOME` at a supported JDK (`/usr/libexec/java_home -V` lists them).
