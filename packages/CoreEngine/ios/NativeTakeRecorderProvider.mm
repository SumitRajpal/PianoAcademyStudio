#import "NativeTakeRecorderProvider.h"
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#include <sys/utsname.h>
#include "../bindings/NativeTakeRecorder.cpp"

#if __has_include(<ReactCommon/RCTTurboModule.h>)

namespace {

// Takes live in Documents/Takes, which the Files app and Finder show
// (UIFileSharingEnabled and LSSupportsOpeningDocumentsInPlace in Info.plist).
std::string TakesFolder() {
  NSURL* documents = [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory
                                                             inDomains:NSUserDomainMask] firstObject];
  if (documents == nil) return {};
  return std::string([[documents URLByAppendingPathComponent:@"Takes" isDirectory:YES].path UTF8String]);
}

std::string Utf8(NSString* text) { return text != nil ? std::string([text UTF8String]) : std::string(); }

piano::capture::TakeDeviceInfo CurrentTakeDevice() {
  piano::capture::TakeDeviceInfo device;
  @autoreleasepool {
    struct utsname system;
    if (uname(&system) == 0) device.model = system.machine;
    const NSOperatingSystemVersion v = [[NSProcessInfo processInfo] operatingSystemVersion];
    device.systemVersion = Utf8([NSString stringWithFormat:@"%ld.%ld.%ld", (long)v.majorVersion, (long)v.minorVersion,
                                                           (long)v.patchVersion]);
    AVAudioSession* session = [AVAudioSession sharedInstance];
    AVAudioSessionPortDescription* input = session.currentRoute.inputs.firstObject;
    device.inputPort = Utf8(input.portName);
    device.inputPortType = Utf8(input.portType);
    AVAudioSessionDataSourceDescription* source = session.inputDataSource ?: input.selectedDataSource;
    device.inputDataSource = Utf8(source.dataSourceName);
    device.hardwareSampleRate = session.sampleRate;
    device.ioBufferMs = session.IOBufferDuration * 1000.0;
    device.inputLatencyMs = session.inputLatency * 1000.0;
  }
  return device;
}

void KeepScreenAwake(bool awake) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIApplication sharedApplication].idleTimerDisabled = awake;
  });
}

// A take stops the moment its capture stops matching its conditions: a call
// or Siri, a microphone or headphones coming or going, or the app leaving the
// screen. The take keeps what it has, and meta.json says why it stopped.
void WatchForInterruptions() {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSNotificationCenter* center = [NSNotificationCenter defaultCenter];
    AVAudioSession* session = [AVAudioSession sharedInstance];
    [center addObserverForName:AVAudioSessionInterruptionNotification
                        object:session
                         queue:nil
                    usingBlock:^(NSNotification* note) {
                      const auto type = static_cast<AVAudioSessionInterruptionType>(
                          [note.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue]);
                      if (type == AVAudioSessionInterruptionTypeBegan) {
                        piano::capture::takeRecorder().interrupt(piano::capture::StopReason::Interrupted);
                      }
                    }];
    [center addObserverForName:AVAudioSessionMediaServicesWereResetNotification
                        object:session
                         queue:nil
                    usingBlock:^(NSNotification*) {
                      piano::capture::takeRecorder().interrupt(piano::capture::StopReason::Interrupted);
                    }];
    [center addObserverForName:AVAudioSessionRouteChangeNotification
                        object:session
                         queue:nil
                    usingBlock:^(NSNotification* note) {
                      const auto reason = static_cast<AVAudioSessionRouteChangeReason>(
                          [note.userInfo[AVAudioSessionRouteChangeReasonKey] unsignedIntegerValue]);
                      if (reason == AVAudioSessionRouteChangeReasonNewDeviceAvailable ||
                          reason == AVAudioSessionRouteChangeReasonOldDeviceUnavailable) {
                        piano::capture::takeRecorder().interrupt(piano::capture::StopReason::RouteChanged);
                      }
                    }];
    [center addObserverForName:UIApplicationDidEnterBackgroundNotification
                        object:nil
                         queue:nil
                    usingBlock:^(NSNotification*) {
                      piano::capture::takeRecorder().interrupt(piano::capture::StopReason::Background);
                    }];
  });
}

}  // namespace

@implementation NativeTakeRecorderProvider

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  WatchForInterruptions();
  piano::capture::TakePlatform platform;
  platform.takesFolder = TakesFolder();
  platform.device = &CurrentTakeDevice;
  platform.keepScreenAwake = &KeepScreenAwake;
  return std::make_shared<facebook::react::NativeTakeRecorder>(params.jsInvoker, std::move(platform));
}

@end

#endif
