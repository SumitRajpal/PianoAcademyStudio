#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <utility>

namespace piano {

/** What the microphone is doing, reported to the UI. */
enum class AudioInputStatus : uint8_t {
  Running,            // capturing
  PermissionPending,  // waiting for the user to answer the microphone prompt
  PermissionDenied,   // the user said no (Settings > Privacy > Microphone)
  Interrupted,        // a call, Siri or another app took the audio session
  Error,              // the audio unit could not start
};

/**
 * Platform microphone capture (IosAudioInput, OboeAudioInput). Pushes PCM
 * into the engine's SampleRing from the OS audio thread, without locks.
 */
class AudioInput {
public:
  using StatusCallback = std::function<void(AudioInputStatus, const std::string&)>;

  virtual ~AudioInput() = default;

  /**
   * Starts capture. Returns false on a hard failure. When microphone
   * permission is still undecided it asks the user, returns true and reports
   * PermissionPending, then Running or PermissionDenied.
   */
  virtual bool start(int sampleRate = 48000, int framesPerHop = 256) = 0;

  /** Stops capture and releases the audio hardware. */
  virtual void stop() = 0;

  virtual bool isRunning() const noexcept = 0;

  /** Set once, before start(). May be called back from any thread. */
  void setStatusCallback(StatusCallback cb) { statusCallback_ = std::move(cb); }

protected:
  void reportStatus(AudioInputStatus status, const std::string& message = {}) const {
    if (statusCallback_) statusCallback_(status, message);
  }

private:
  StatusCallback statusCallback_;
};

} // namespace piano
