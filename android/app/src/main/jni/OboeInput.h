#pragma once

#include <memory>
#include <oboe/Oboe.h>
#include "../../../../../src/motion/scenes/PianoMaster/CorePianoNotesDetection/shared/AudioInput.h"
#include "../../../../../src/motion/scenes/PianoMaster/CorePianoNotesDetection/shared/SampleRing.h"

namespace piano {

/**
 * Android low-latency audio capture using Google's Oboe C++ library.
 * Configured in Exclusive LowLatency mode at 48 kHz float mono with unprocessed preset.
 */
class OboeAudioInput final : public AudioInput, public oboe::AudioStreamDataCallback {
public:
  explicit OboeAudioInput(EngineRing& ring);
  ~OboeAudioInput() override;

  bool start(int sampleRate = 48000, int framesPerHop = 256) override;
  void stop() override;
  bool isRunning() const noexcept override;

  oboe::DataCallbackResult onAudioReady(
      oboe::AudioStream* stream, void* audioData, int32_t numFrames) override;

private:
  EngineRing& ring_;
  std::shared_ptr<oboe::AudioStream> stream_;
  bool running_{false};
};

} // namespace piano
