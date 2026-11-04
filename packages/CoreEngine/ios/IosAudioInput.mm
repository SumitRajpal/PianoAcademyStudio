#import "IosAudioInput.h"

#include <cstring>

namespace piano {

namespace {

// RemoteIO renders at most this many frames per callback (4096 is what iOS
// uses when the screen locks); the capture buffer is sized for it up front.
constexpr UInt32 kMaxFramesPerSlice = 4096;

enum class Permission { Granted, Denied, Undetermined };

Permission microphonePermission() {
  if (@available(iOS 17.0, *)) {
    switch ([AVAudioApplication sharedInstance].recordPermission) {
      case AVAudioApplicationRecordPermissionGranted:
        return Permission::Granted;
      case AVAudioApplicationRecordPermissionDenied:
        return Permission::Denied;
      default:
        return Permission::Undetermined;
    }
  }
  switch ([AVAudioSession sharedInstance].recordPermission) {
    case AVAudioSessionRecordPermissionGranted:
      return Permission::Granted;
    case AVAudioSessionRecordPermissionDenied:
      return Permission::Denied;
    default:
      return Permission::Undetermined;
  }
}

void requestMicrophonePermission(void (^done)(BOOL granted)) {
  if (@available(iOS 17.0, *)) {
    [AVAudioApplication requestRecordPermissionWithCompletionHandler:done];
  } else {
    [[AVAudioSession sharedInstance] requestRecordPermission:done];
  }
}

const char* kDeniedMessage = "Microphone access is off. Turn it on in Settings > Privacy & Security > Microphone.";

} // namespace

IosAudioInput::IosAudioInput(EngineRing& ring) : ring_(ring), shared_(std::make_shared<Shared>()) {
  shared_->owner = this;
  capture_.assign(kMaxFramesPerSlice, 0.0f);
}

IosAudioInput::~IosAudioInput() {
  stop();
  std::lock_guard<std::recursive_mutex> lock(shared_->mutex);
  shared_->owner = nullptr;  // late permission answers and notifications now do nothing
}

bool IosAudioInput::start(int sampleRate, int framesPerHop) {
  std::lock_guard<std::recursive_mutex> lock(shared_->mutex);
  sampleRate_ = sampleRate;
  framesPerHop_ = framesPerHop;
  if (wanted_) return true;
  wanted_ = true;
  addObservers();

  switch (microphonePermission()) {
    case Permission::Granted:
      return startCaptureLocked();
    case Permission::Denied:
      // The engine keeps running without audio; the UI shows how to fix it.
      reportStatus(AudioInputStatus::PermissionDenied, kDeniedMessage);
      return true;
    case Permission::Undetermined: {
      reportStatus(AudioInputStatus::PermissionPending, "");
      std::shared_ptr<Shared> shared = shared_;
      requestMicrophonePermission(^(BOOL granted) {
        std::lock_guard<std::recursive_mutex> innerLock(shared->mutex);
        IosAudioInput* self = shared->owner;
        if (self == nullptr || !self->wanted_) return;
        if (granted) {
          self->startCaptureLocked();
        } else {
          self->reportStatus(AudioInputStatus::PermissionDenied, kDeniedMessage);
        }
      });
      return true;
    }
  }
  return true;
}

void IosAudioInput::stop() {
  std::lock_guard<std::recursive_mutex> lock(shared_->mutex);
  if (!wanted_) return;
  wanted_ = false;
  removeObservers();
  stopCaptureLocked(/*deactivateSession=*/true);
}

bool IosAudioInput::isRunning() const noexcept {
  return running_.load(std::memory_order_acquire);
}

bool IosAudioInput::startCaptureLocked() {
  if (unit_ != nullptr) stopCaptureLocked(/*deactivateSession=*/false);

  @autoreleasepool {
    AVAudioSession* session = [AVAudioSession sharedInstance];
    NSError* error = nil;
    // Measurement mode: no automatic gain control, no voice processing, no
    // high-pass. Bluetooth call mics (HFP, 16 kHz) are not allowed; Bluetooth
    // headphones may still play the app's sound (A2DP).
    if (![session setCategory:AVAudioSessionCategoryPlayAndRecord
                         mode:AVAudioSessionModeMeasurement
                      options:AVAudioSessionCategoryOptionDefaultToSpeaker |
                              AVAudioSessionCategoryOptionAllowBluetoothA2DP
                        error:&error]) {
      reportStatus(AudioInputStatus::Error, "Could not set up the audio session.");
      return false;
    }
    // Preferences only: iOS may pick another rate (RemoteIO converts to ours).
    [session setPreferredSampleRate:sampleRate_ error:nil];
    [session setPreferredIOBufferDuration:static_cast<double>(framesPerHop_) / sampleRate_ error:nil];
    if (![session setActive:YES error:&error]) {
      reportStatus(AudioInputStatus::Error, "Could not start the audio session.");
      return false;
    }

    AudioComponentDescription desc{};
    desc.componentType = kAudioUnitType_Output;
    desc.componentSubType = kAudioUnitSubType_RemoteIO;
    desc.componentManufacturer = kAudioUnitManufacturer_Apple;
    AudioComponent component = AudioComponentFindNext(nullptr, &desc);
    if (component == nullptr || AudioComponentInstanceNew(component, &unit_) != noErr) {
      unit_ = nullptr;
      reportStatus(AudioInputStatus::Error, "No audio input unit.");
      return false;
    }

    auto fail = [this](const char* message) {
      AudioComponentInstanceDispose(unit_);
      unit_ = nullptr;
      reportStatus(AudioInputStatus::Error, message);
      return false;
    };

    const UInt32 enable = 1;
    const UInt32 disable = 0;
    if (AudioUnitSetProperty(unit_, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &enable,
                             sizeof(enable)) != noErr) {
      return fail("Could not enable the microphone.");
    }
    AudioUnitSetProperty(unit_, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Output, 0, &disable, sizeof(disable));

    AudioStreamBasicDescription format{};
    format.mSampleRate = sampleRate_;
    format.mFormatID = kAudioFormatLinearPCM;
    format.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagsNativeEndian;
    format.mBytesPerPacket = sizeof(Float32);
    format.mFramesPerPacket = 1;
    format.mBytesPerFrame = sizeof(Float32);
    format.mChannelsPerFrame = 1;
    format.mBitsPerChannel = 32;
    if (AudioUnitSetProperty(unit_, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 1, &format,
                             sizeof(format)) != noErr) {
      return fail("Unsupported microphone format.");
    }

    const UInt32 maxFrames = kMaxFramesPerSlice;
    AudioUnitSetProperty(unit_, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxFrames,
                         sizeof(maxFrames));

    AURenderCallbackStruct callback{};
    callback.inputProc = &IosAudioInput::inputCallback;
    callback.inputProcRefCon = this;
    if (AudioUnitSetProperty(unit_, kAudioOutputUnitProperty_SetInputCallback, kAudioUnitScope_Global, 0, &callback,
                             sizeof(callback)) != noErr) {
      return fail("Could not attach the microphone callback.");
    }
    if (AudioUnitInitialize(unit_) != noErr) {
      return fail("Could not initialise the microphone.");
    }
    if (AudioOutputUnitStart(unit_) != noErr) {
      AudioUnitUninitialize(unit_);
      return fail("Could not start the microphone.");
    }
  }
  running_.store(true, std::memory_order_release);
  reportStatus(AudioInputStatus::Running, "");
  return true;
}

void IosAudioInput::stopCaptureLocked(bool deactivateSession) {
  running_.store(false, std::memory_order_release);
  if (unit_ != nullptr) {
    AudioOutputUnitStop(unit_);  // waits for a running callback to return
    AudioUnitUninitialize(unit_);
    AudioComponentInstanceDispose(unit_);
    unit_ = nullptr;
  }
  if (deactivateSession) {
    @autoreleasepool {
      [[AVAudioSession sharedInstance] setActive:NO
                                     withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                           error:nil];
    }
  }
}

bool IosAudioInput::unitIsRunning() const {
  if (unit_ == nullptr) return false;
  UInt32 isRunning = 0;
  UInt32 size = sizeof(isRunning);
  AudioUnitGetProperty(unit_, kAudioOutputUnitProperty_IsRunning, kAudioUnitScope_Global, 0, &isRunning, &size);
  return isRunning != 0;
}

void IosAudioInput::onInterruptionLocked(NSNotification* note) {
  const auto type = static_cast<AVAudioSessionInterruptionType>(
      [note.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue]);
  if (type == AVAudioSessionInterruptionTypeBegan) {
    running_.store(false, std::memory_order_release);
    reportStatus(AudioInputStatus::Interrupted, "Listening paused: another app or a call is using the audio.");
    return;
  }
  // Ended: take the microphone back.
  if (!wanted_ || microphonePermission() != Permission::Granted) return;
  @autoreleasepool {
    NSError* error = nil;
    if (unit_ != nullptr && [[AVAudioSession sharedInstance] setActive:YES error:&error] &&
        AudioOutputUnitStart(unit_) == noErr) {
      running_.store(true, std::memory_order_release);
      reportStatus(AudioInputStatus::Running, "");
      return;
    }
  }
  startCaptureLocked();  // rebuild from scratch if resuming failed
}

void IosAudioInput::onMediaServicesResetLocked() {
  // Every audio object is invalid after a reset: rebuild.
  if (unit_ != nullptr) {
    AudioComponentInstanceDispose(unit_);
    unit_ = nullptr;
  }
  running_.store(false, std::memory_order_release);
  if (wanted_ && microphonePermission() == Permission::Granted) startCaptureLocked();
}

void IosAudioInput::onRouteChangeLocked() {
  // RemoteIO follows route changes and converts to our format; restart only
  // if the change stopped it.
  if (wanted_ && unit_ != nullptr && !unitIsRunning() && microphonePermission() == Permission::Granted) {
    startCaptureLocked();
  }
}

void IosAudioInput::addObservers() {
  NSNotificationCenter* center = [NSNotificationCenter defaultCenter];
  AVAudioSession* session = [AVAudioSession sharedInstance];
  std::shared_ptr<Shared> shared = shared_;
  interruptionObserver_ = [center addObserverForName:AVAudioSessionInterruptionNotification
                                              object:session
                                               queue:nil
                                          usingBlock:^(NSNotification* note) {
                                            std::lock_guard<std::recursive_mutex> lock(shared->mutex);
                                            if (shared->owner != nullptr) shared->owner->onInterruptionLocked(note);
                                          }];
  resetObserver_ = [center addObserverForName:AVAudioSessionMediaServicesWereResetNotification
                                       object:session
                                        queue:nil
                                   usingBlock:^(NSNotification*) {
                                     std::lock_guard<std::recursive_mutex> lock(shared->mutex);
                                     if (shared->owner != nullptr) shared->owner->onMediaServicesResetLocked();
                                   }];
  routeObserver_ = [center addObserverForName:AVAudioSessionRouteChangeNotification
                                       object:session
                                        queue:nil
                                   usingBlock:^(NSNotification*) {
                                     std::lock_guard<std::recursive_mutex> lock(shared->mutex);
                                     if (shared->owner != nullptr) shared->owner->onRouteChangeLocked();
                                   }];
}

void IosAudioInput::removeObservers() {
  NSNotificationCenter* center = [NSNotificationCenter defaultCenter];
  if (interruptionObserver_ != nil) [center removeObserver:interruptionObserver_];
  if (resetObserver_ != nil) [center removeObserver:resetObserver_];
  if (routeObserver_ != nil) [center removeObserver:routeObserver_];
  interruptionObserver_ = nil;
  resetObserver_ = nil;
  routeObserver_ = nil;
}

OSStatus IosAudioInput::inputCallback(void* refCon, AudioUnitRenderActionFlags* flags, const AudioTimeStamp* timeStamp,
                                      UInt32 bus, UInt32 frames, AudioBufferList* /*data*/) {
  auto* self = static_cast<IosAudioInput*>(refCon);
  if (self->unit_ == nullptr || frames > kMaxFramesPerSlice) return noErr;
  AudioBufferList list;
  list.mNumberBuffers = 1;
  list.mBuffers[0].mNumberChannels = 1;
  list.mBuffers[0].mDataByteSize = frames * sizeof(float);
  list.mBuffers[0].mData = self->capture_.data();
  if (AudioUnitRender(self->unit_, flags, timeStamp, bus, frames, &list) == noErr) {
    self->ring_.push(self->capture_.data(), frames);
  }
  return noErr;
}

} // namespace piano
