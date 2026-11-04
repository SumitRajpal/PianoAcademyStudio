#pragma once

#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

#include "AudioInput.h"
#include "SampleRing.h"

namespace piano {

/**
 * Microphone capture on iOS: RemoteIO in Measurement mode (no AGC, no
 * voice processing), 48 kHz mono float, 256-frame buffers, pushed straight
 * into the engine's ring from the audio thread.
 *
 * Asks for microphone permission when needed and reports it; survives
 * interruptions (calls, Siri), media-services resets and route changes.
 */
class IosAudioInput final : public AudioInput {
public:
  explicit IosAudioInput(EngineRing& ring);
  ~IosAudioInput() override;

  bool start(int sampleRate = 48000, int framesPerHop = 256) override;
  void stop() override;
  bool isRunning() const noexcept override;

  // Below: called with the shared lock held (from start/stop and the
  // permission / notification callbacks).
  bool startCaptureLocked();
  void stopCaptureLocked(bool deactivateSession);
  void onInterruptionLocked(NSNotification* note);
  void onMediaServicesResetLocked();
  void onRouteChangeLocked();

  /** What async callbacks hold: a lock and a pointer cleared on destruction. */
  struct Shared {
    std::recursive_mutex mutex;
    IosAudioInput* owner{nullptr};
  };

private:
  void addObservers();
  void removeObservers();
  bool unitIsRunning() const;

  static OSStatus inputCallback(void* refCon, AudioUnitRenderActionFlags* flags, const AudioTimeStamp* timeStamp,
                                UInt32 bus, UInt32 frames, AudioBufferList* data);

  EngineRing& ring_;
  std::shared_ptr<Shared> shared_;
  AudioComponentInstance unit_{nullptr};
  bool wanted_{false};               // the engine asked for capture (guarded by shared_->mutex)
  std::atomic<bool> running_{false}; // the audio unit is capturing
  int sampleRate_{48000};
  int framesPerHop_{256};
  std::vector<float> capture_;       // sized for the unit's largest slice; the audio thread renders here
  id interruptionObserver_{nil};
  id resetObserver_{nil};
  id routeObserver_{nil};
};

} // namespace piano
