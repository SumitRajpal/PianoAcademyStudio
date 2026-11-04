#include "OboeInput.h"

namespace piano {

OboeAudioInput::OboeAudioInput(EngineRing& ring)
    : ring_(ring) {}

OboeAudioInput::~OboeAudioInput() {
  stop();
}

bool OboeAudioInput::start(int sampleRate, int framesPerHop) {
  if (running_) return true;

  oboe::AudioStreamBuilder builder;
  builder.setDirection(oboe::Direction::Input)
      ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
      ->setSharingMode(oboe::SharingMode::Exclusive)
      ->setFormat(oboe::AudioFormat::Float)
      ->setChannelCount(oboe::ChannelCount::Mono)
      ->setSampleRate(sampleRate)
      ->setFramesPerDataCallback(framesPerHop)
      ->setInputPreset(oboe::InputPreset::Unprocessed)
      ->setDataCallback(this);

  if (builder.openStream(stream_) != oboe::Result::OK) {
    return false;
  }

  if (stream_->requestStart() != oboe::Result::OK) {
    stream_->close();
    stream_.reset();
    return false;
  }

  running_ = true;
  return true;
}

void OboeAudioInput::stop() {
  if (!running_) return;

  if (stream_) {
    stream_->stop();
    stream_->close();
    stream_.reset();
  }
  running_ = false;
}

bool OboeAudioInput::isRunning() const noexcept {
  return running_;
}

oboe::DataCallbackResult OboeAudioInput::onAudioReady(
    oboe::AudioStream* /*stream*/, void* audioData, int32_t numFrames) {
  ring_.push(static_cast<const float*>(audioData), static_cast<std::size_t>(numFrames));
  return oboe::DataCallbackResult::Continue;
}

} // namespace piano
