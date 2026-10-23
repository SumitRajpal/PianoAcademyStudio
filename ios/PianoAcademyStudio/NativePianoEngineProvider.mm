#import "NativePianoEngineProvider.h"
#import "IosAudioInput.h"
#include "../../src/motion/scenes/PianoMaster/CorePianoNotesDetection/shared/NativePianoEngine.cpp"

#if __has_include(<ReactCommon/RCTTurboModule.h>)

// The calibration profile lives in Application Support (kept across launches,
// not visible in Files, backed up with the app).
static std::string PianoProfilePath() {
  NSFileManager* files = [NSFileManager defaultManager];
  NSURL* dir = [[files URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject];
  if (dir == nil) return {};
  dir = [dir URLByAppendingPathComponent:@"NoteEngine" isDirectory:YES];
  [files createDirectoryAtURL:dir withIntermediateDirectories:YES attributes:nil error:nil];
  return std::string([[dir URLByAppendingPathComponent:@"piano-profile.json"].path UTF8String]);
}

@implementation NativePianoEngineProvider

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  auto module = std::make_shared<facebook::react::NativePianoEngine>(params.jsInvoker);
  piano::Engine &engine = module->getInternalEngine();
  engine.setAudioInput(std::make_unique<piano::IosAudioInput>(engine.getRing()));
  engine.setProfileStoragePath(PianoProfilePath());  // loads the saved calibration, if any
  return module;
}

@end

#endif
