#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <functional>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#if defined(__APPLE__)
#include <pthread.h>
#include <pthread/qos.h>
#endif

#include "AudioInput.h"
#include "Calibration.h"
#include "Cascade.h"
#include "LiveKeys.h"
#include "PianoProfile.h"
#include "SampleRing.h"

namespace piano {

struct EngineStats {
  double avgUs{0.0};   // mean analysis time per hop
  double maxUs{0.0};   // worst analysis time per hop
  int lateHops{0};     // hops whose analysis took longer than the hop lasts
  int droppedHops{0};  // hops skipped after a stall, to keep latency from building up
};

enum class EngineState : uint8_t {
  Stopped,
  Running,
  PermissionPending,
  PermissionDenied,
  Interrupted,
  Error,
};

struct EngineStatusEvent {
  EngineState state{EngineState::Stopped};
  std::string message;
};

/**
 * The analysis engine: owns the ring, the cascade, the calibrator and the
 * analysis thread.
 *
 * Threads:
 *  - OS audio thread: AudioInput pushes into the ring (lock-free).
 *  - Analysis thread: the only one that touches the cascade and calibrator.
 *    It runs every 256-sample hop and never waits on a lock.
 *  - JS thread: the control methods. Settings travel to the analysis thread
 *    through a command queue it drains between hops (try_lock, so it never
 *    blocks); the event sinks are swapped atomically.
 *  - Any thread: the detected notes, through live() (LiveKeys.h). Every note
 *    is published there before any sink runs: the key table for "what is
 *    down now" in O(1), and the event ring for every event in order. Readers
 *    never block the analysis thread, whatever they do.
 *
 * tMs on events is stream time: samples analysed since start(), so rhythm
 * scoring is not shaken by thread scheduling. It does not include the OS
 * input latency (a constant offset per device).
 */
class Engine {
public:
  static constexpr int kSampleRate = 48000;
  static constexpr int kHop = 256;
  static constexpr std::size_t kMaxBacklogHops = 4;  // ~21 ms; beyond that, skip ahead
  static constexpr double kHopBudgetUs = 1e6 * kHop / kSampleRate;

  using NoteSink = std::function<void(const NoteEvent&)>;
  using CalibrationSink = std::function<void(const CalibrationProgressEvent&)>;
  using StatusSink = std::function<void(const EngineStatusEvent&)>;
  /** Called once after each batch of notes is published to live(). */
  using NoteWake = std::function<void()>;

  Engine() : profileSnapshot_(PianoProfile::defaults()) {}

  ~Engine() { stop(); }

  Engine(const Engine&) = delete;
  Engine& operator=(const Engine&) = delete;

  // ---- setup ----------------------------------------------------------------

  void setAudioInput(std::unique_ptr<AudioInput> input) {
    audioInput_ = std::move(input);
    if (audioInput_) {
      audioInput_->setStatusCallback([this](AudioInputStatus s, const std::string& message) {
        onInputStatus(s, message);
      });
    }
  }

  EngineRing& getRing() noexcept { return ring_; }

  /** The detected notes, readable from any thread (see LiveKeys.h). */
  std::shared_ptr<const LiveNotes> live() const noexcept { return live_; }

  /** Where the calibration profile is saved. Loads it if one is there. */
  void setProfileStoragePath(std::string path) {
    storagePath_ = std::move(path);
    std::ifstream in(storagePath_, std::ios::binary);
    if (!in) return;
    std::stringstream buf;
    buf << in.rdbuf();
    PianoProfile loaded;
    if (PianoProfile::fromJson(buf.str(), loaded)) {
      publishProfile(loaded);
      enqueue(Command::profile(loaded));
    }
  }

  // ---- event sinks (any thread; swapped atomically) ---------------------------

  void setNoteSink(std::shared_ptr<const NoteSink> sink) { std::atomic_store(&noteSink_, std::move(sink)); }
  void setCalibrationSink(std::shared_ptr<const CalibrationSink> sink) {
    std::atomic_store(&calibrationSink_, std::move(sink));
  }
  void setStatusSink(std::shared_ptr<const StatusSink> sink) { std::atomic_store(&statusSink_, std::move(sink)); }
  void setNoteWake(std::shared_ptr<const NoteWake> wake) { std::atomic_store(&noteWake_, std::move(wake)); }

  // ---- control (JS thread) ---------------------------------------------------------

  bool start() {
    if (running_.load(std::memory_order_acquire)) return true;
    ring_.reset();
    cascade_.reset();
    applyCommands(/*blocking=*/true);  // no analysis thread yet: apply directly
    totalHops_.store(0, std::memory_order_relaxed);
    totalUs_.store(0, std::memory_order_relaxed);
    maxUs_.store(0, std::memory_order_relaxed);
    lateHops_.store(0, std::memory_order_relaxed);
    droppedHops_.store(0, std::memory_order_relaxed);
    running_.store(true, std::memory_order_release);
    if (audioInput_ && !audioInput_->start(kSampleRate, kHop)) {
      running_.store(false, std::memory_order_release);
      emitStatus(EngineState::Error, "The microphone could not be started.");
      return false;
    }
    workerThread_ = std::thread(&Engine::workerLoop, this);
    // With a microphone, the input itself reports running (or why it is not).
    if (!audioInput_) emitStatus(EngineState::Running, {});
    return true;
  }

  void stop() {
    if (!running_.exchange(false, std::memory_order_acq_rel)) return;
    if (audioInput_) audioInput_->stop();
    if (workerThread_.joinable()) workerThread_.join();
    // The analysis thread is gone: everything below is single-threaded.
    calibrator_.stop();
    calibratorActive_ = false;
    calibrating_.store(false, std::memory_order_release);
    // Whatever is still sounding is released, so every reader sees the keys go up.
    cascade_.releaseEverything(events_, streamTimeMs());
    dispatchNotes(events_);
    // Refinements are kept, unless they would save a calibration the user has not saved.
    if (!unsavedCalibration_.load(std::memory_order_acquire) && (cascade_.takeProfileDirty() || refinedSinceSave_)) {
      publishProfile(cascade_.getProfile());
      saveProfile(cascade_.getProfile());
    }
    emitStatus(EngineState::Stopped, {});
  }

  bool isRunning() const noexcept { return running_.load(std::memory_order_acquire); }
  bool isCalibrating() const noexcept { return calibrating_.load(std::memory_order_acquire); }

  void setExpectedNotes(std::vector<int> notes) { enqueue(Command::expected(std::move(notes))); }
  void setPolyphony(bool enabled) { enqueue(Command::polyphony(enabled)); }

  bool startCalibration(const CalibrationOptions& options) {
    calibrating_.store(true, std::memory_order_release);
    enqueue(Command::calibrate(options));
    if (!running_.load(std::memory_order_acquire) && !start()) {
      calibrating_.store(false, std::memory_order_release);
      return false;
    }
    return true;
  }

  void stopCalibration() {
    calibrating_.store(false, std::memory_order_release);
    enqueue(Command::stopCalibration());
  }

  /**
   * Saves the profile the last calibration produced (with what playing has
   * refined since). A finished calibration is used at once but only saved
   * here, when the user says so. False when there is nothing to save or the
   * file could not be written. JS thread.
   */
  bool saveCalibrationProfile() {
    const PianoProfile p = profileSnapshot();
    if (!p.isCalibrated || !writeProfileFile(p)) return false;
    unsavedCalibration_.store(false, std::memory_order_release);
    return true;
  }

  /** Forgets the calibration (the file too) and goes back to defaults. */
  void clearCalibrationProfile() {
    const PianoProfile defaults = PianoProfile::defaults();
    publishProfile(defaults);
    enqueue(Command::profile(defaults));
    unsavedCalibration_.store(false, std::memory_order_release);
    if (!storagePath_.empty()) std::remove(storagePath_.c_str());
  }

  // ---- queries (any thread) ----------------------------------------------------------

  PianoProfile profileSnapshot() const {
    std::lock_guard<std::mutex> lock(profileMutex_);
    return profileSnapshot_;
  }

  EngineStats getStats() const noexcept {
    EngineStats s;
    const uint64_t hops = totalHops_.load(std::memory_order_relaxed);
    s.avgUs = hops > 0 ? static_cast<double>(totalUs_.load(std::memory_order_relaxed)) / static_cast<double>(hops) : 0.0;
    s.maxUs = static_cast<double>(maxUs_.load(std::memory_order_relaxed));
    s.lateHops = lateHops_.load(std::memory_order_relaxed);
    s.droppedHops = droppedHops_.load(std::memory_order_relaxed);
    return s;
  }

private:
  struct Command {
    enum class Kind : uint8_t { Expected, Polyphony, Calibrate, StopCalibration, Profile } kind;
    std::vector<int> notes;
    bool flag{false};
    CalibrationOptions calibration{};
    std::shared_ptr<const PianoProfile> profileData;

    static Command expected(std::vector<int> n) { return {Kind::Expected, std::move(n), false, {}, nullptr}; }
    static Command polyphony(bool on) { return {Kind::Polyphony, {}, on, {}, nullptr}; }
    static Command calibrate(const CalibrationOptions& o) { return {Kind::Calibrate, {}, false, o, nullptr}; }
    static Command stopCalibration() { return {Kind::StopCalibration, {}, false, {}, nullptr}; }
    static Command profile(const PianoProfile& p) {
      return {Kind::Profile, {}, false, {}, std::make_shared<const PianoProfile>(p)};
    }
  };

  void enqueue(Command c) {
    std::lock_guard<std::mutex> lock(commandMutex_);
    pending_.push_back(std::move(c));
    hasPending_.store(true, std::memory_order_release);
  }

  // Analysis thread (or the JS thread before the analysis thread exists).
  void applyCommands(bool blocking) {
    if (!hasPending_.load(std::memory_order_acquire)) return;
    {
      std::unique_lock<std::mutex> lock(commandMutex_, std::defer_lock);
      if (blocking) {
        lock.lock();
      } else if (!lock.try_lock()) {
        return;  // the JS thread is enqueueing: pick it up next hop
      }
      working_.swap(pending_);
      hasPending_.store(false, std::memory_order_release);
    }
    const double tMs = streamTimeMs();
    for (Command& c : working_) {
      switch (c.kind) {
        case Command::Kind::Expected:
          cascade_.setExpectedNotes(c.notes);
          break;
        case Command::Kind::Polyphony:
          cascade_.setPolyphony(c.flag);
          break;
        case Command::Kind::Calibrate:
          // Each calibration starts from silence: release what is sounding.
          cascade_.releaseEverything(events_, tMs);
          dispatchNotes(events_);
          calibrator_.start(kSampleRate, c.calibration);
          calibratorActive_ = true;
          break;
        case Command::Kind::StopCalibration:
          calibrator_.stop();
          calibratorActive_ = false;
          break;
        case Command::Kind::Profile:
          if (c.profileData) cascade_.setProfile(*c.profileData);
          break;
      }
    }
    working_.clear();
  }

  double streamTimeMs() const noexcept {
    return static_cast<double>(ring_.readCursor() + kHop) * 1000.0 / kSampleRate;
  }

  static void raiseThreadPriority() noexcept {
#if defined(__APPLE__)
    // Keep the analysis on a performance core, ahead of UI work.
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#endif
  }

  void workerLoop() {
    raiseThreadPriority();
    events_.reserve(32);
    while (running_.load(std::memory_order_acquire)) {
      applyCommands(/*blocking=*/false);

      // Calibration may run longer than a hop while it analyses a strike; it
      // catches up instead of skipping (a skip would lose the strike).
      const std::size_t skipped = calibratorActive_ ? 0 : ring_.dropStaleBacklog(kHop, kMaxBacklogHops);
      if (skipped > 0) {
        droppedHops_.fetch_add(static_cast<int>(skipped / kHop), std::memory_order_relaxed);
        cascade_.onDiscontinuity();
        calibrator_.onDiscontinuity();
      }
      if (ring_.available() < static_cast<std::size_t>(kHop)) {
        std::this_thread::sleep_for(std::chrono::microseconds(500));
        continue;
      }

      const double tMs = streamTimeMs();
      const auto t0 = std::chrono::steady_clock::now();
      events_.clear();
      bool calibrationEvent = false;
      CalibrationProgressEvent calEvent{};
      if (calibratorActive_) {
        calibrationEvent = calibrator_.processHop(ring_, calEvent);
        if (calibrationEvent && calEvent.state == kCalAllDone) {
          finishCalibration();
        }
      }
      // Detection keeps running while calibrating, so the keys the user
      // plays light up on screen as they play them.
      cascade_.processHop(ring_, events_, tMs);
      ring_.consume(kHop);
      const auto t1 = std::chrono::steady_clock::now();

      const auto us = static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count());
      totalHops_.fetch_add(1, std::memory_order_relaxed);
      totalUs_.fetch_add(us, std::memory_order_relaxed);
      uint32_t prevMax = maxUs_.load(std::memory_order_relaxed);
      while (us > prevMax && !maxUs_.compare_exchange_weak(prevMax, us, std::memory_order_relaxed)) {
      }
      if (us > kHopBudgetUs) lateHops_.fetch_add(1, std::memory_order_relaxed);

      dispatchNotes(events_);
      if (calibrationEvent) dispatchCalibration(calEvent);
      maybePublishRefinedProfile();
    }
  }

  // Used from now on; saved only by saveCalibrationProfile().
  void finishCalibration() {
    calibratorActive_ = false;
    const PianoProfile& p = calibrator_.profile();
    cascade_.setProfile(p);
    publishProfile(p);
    unsavedCalibration_.store(true, std::memory_order_release);
    calibrating_.store(false, std::memory_order_release);
  }

  // Online refinement changes the cascade's profile; share it now and then.
  void maybePublishRefinedProfile() {
    if (++hopsSincePublish_ < 375) return;  // ~2 s
    hopsSincePublish_ = 0;
    if (cascade_.takeProfileDirty()) {
      publishProfile(cascade_.getProfile());
      refinedSinceSave_ = true;
    }
  }

  void publishProfile(const PianoProfile& p) {
    std::lock_guard<std::mutex> lock(profileMutex_);
    profileSnapshot_ = p;
  }

  // Analysis thread (or the JS thread while it is stopped).
  void saveProfile(const PianoProfile& p) {
    refinedSinceSave_ = false;
    if (p.isCalibrated) writeProfileFile(p);
  }

  // Written to a temporary file, then renamed, so a crash never leaves half a profile.
  bool writeProfileFile(const PianoProfile& p) const {
    if (storagePath_.empty()) return false;
    const std::string tmp = storagePath_ + ".tmp";
    {
      std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
      if (!out) return false;
      out << p.toJson();
      if (!out) return false;
    }
    return std::rename(tmp.c_str(), storagePath_.c_str()) == 0;
  }

  // Every note goes into live() first (O(1) each, no lock), then to the sink,
  // then one wake for the whole batch.
  void dispatchNotes(const std::vector<NoteEvent>& events) {
    if (events.empty()) return;
    for (const auto& e : events) live_->publish(e);
    const auto sink = std::atomic_load(&noteSink_);
    if (sink && *sink) {
      for (const auto& e : events) (*sink)(e);
    }
    const auto wake = std::atomic_load(&noteWake_);
    if (wake && *wake) (*wake)();
  }

  void dispatchCalibration(const CalibrationProgressEvent& e) {
    const auto sink = std::atomic_load(&calibrationSink_);
    if (sink && *sink) (*sink)(e);
  }

  void emitStatus(EngineState state, const std::string& message) {
    const auto sink = std::atomic_load(&statusSink_);
    if (sink && *sink) (*sink)({state, message});
  }

  void onInputStatus(AudioInputStatus s, const std::string& message) {
    switch (s) {
      case AudioInputStatus::Running:
        if (running_.load(std::memory_order_acquire)) emitStatus(EngineState::Running, message);
        break;
      case AudioInputStatus::PermissionPending:
        emitStatus(EngineState::PermissionPending, message);
        break;
      case AudioInputStatus::PermissionDenied:
        emitStatus(EngineState::PermissionDenied, message);
        break;
      case AudioInputStatus::Interrupted:
        emitStatus(EngineState::Interrupted, message);
        break;
      case AudioInputStatus::Error:
        emitStatus(EngineState::Error, message);
        break;
    }
  }

  // Shared with the OS audio thread (lock-free) and the analysis thread.
  EngineRing ring_;

  // Analysis thread only (or the JS thread while it is stopped).
  Cascade cascade_;
  PianoCalibrator calibrator_;
  bool calibratorActive_{false};
  std::vector<NoteEvent> events_;
  std::vector<Command> working_;
  int hopsSincePublish_{0};
  bool refinedSinceSave_{false};

  // JS thread -> analysis thread.
  std::mutex commandMutex_;
  std::vector<Command> pending_;
  std::atomic<bool> hasPending_{false};

  std::shared_ptr<const NoteSink> noteSink_;
  std::shared_ptr<const NoteWake> noteWake_;
  std::shared_ptr<const CalibrationSink> calibrationSink_;
  std::shared_ptr<const StatusSink> statusSink_;

  // Written by the analysis thread only (the JS thread while it is stopped).
  const std::shared_ptr<LiveNotes> live_ = std::make_shared<LiveNotes>();

  mutable std::mutex profileMutex_;
  PianoProfile profileSnapshot_;
  std::string storagePath_;

  std::unique_ptr<AudioInput> audioInput_;
  std::atomic<bool> running_{false};
  std::atomic<bool> calibrating_{false};
  std::atomic<bool> unsavedCalibration_{false};
  std::thread workerThread_;

  std::atomic<uint64_t> totalHops_{0};
  std::atomic<uint64_t> totalUs_{0};
  std::atomic<uint32_t> maxUs_{0};
  std::atomic<int> lateHops_{0};
  std::atomic<int> droppedHops_{0};
};

} // namespace piano
