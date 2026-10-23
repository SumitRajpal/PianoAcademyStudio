#include "NativePianoEngine.h"

#if HAS_APP_SPECS_JSI

#include <atomic>
#include <cmath>
#include <string>

namespace facebook {
namespace react {

namespace {

jsi::Object noteObject(jsi::Runtime& rt, const piano::NoteEvent& ev) {
  jsi::Object obj(rt);
  obj.setProperty(rt, "type", jsi::String::createFromUtf8(rt, ev.type == piano::NoteEvent::NoteOn ? "noteOn" : "noteOff"));
  obj.setProperty(rt, "midi", static_cast<double>(ev.midi));
  obj.setProperty(rt, "cents", static_cast<double>(ev.cents));
  obj.setProperty(rt, "velocity", static_cast<double>(ev.velocity));
  obj.setProperty(rt, "tMs", ev.tMs);
  return obj;
}

/**
 * The engine's key table, for JS and for worklets on the UI runtime. Both
 * runtimes use the same instance, each on its own thread: it only makes
 * atomic reads of the table and keeps no JS value between calls.
 *
 *  version          changes so far; unchanged means nothing to do
 *  changes(since)   [version, midi, down, velocity, struck, ...] for the keys
 *                   changed after version `since` (struck: a strike among
 *                   those changes). since < 0: every key that is down now.
 *                   null when a key was mid-update: ask again next frame.
 *  key(midi)        { midi, down, velocity, cents, tMs, strikes } or null
 *  isDown(midi)     boolean, one atomic load
 */
class LiveKeysHostObject final : public jsi::HostObject {
public:
  explicit LiveKeysHostObject(std::shared_ptr<const piano::LiveNotes> live) : live_(std::move(live)) {}

  jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    const std::string prop = name.utf8(rt);
    if (prop == "version") return static_cast<double>(live_->keys().version());
    if (prop == "changes") return method(rt, name, &changes);
    if (prop == "key") return method(rt, name, &key);
    if (prop == "isDown") return method(rt, name, &isDown);
    return jsi::Value::undefined();
  }

  std::vector<jsi::PropNameID> getPropertyNames(jsi::Runtime& rt) override {
    return jsi::PropNameID::names(rt, "version", "changes", "key", "isDown");
  }

private:
  using Method = jsi::Value (*)(jsi::Runtime&, const piano::LiveNotes&, const jsi::Value*, size_t);

  jsi::Value method(jsi::Runtime& rt, const jsi::PropNameID& name, Method fn) const {
    return jsi::Function::createFromHostFunction(
        rt, name, 1, [live = live_, fn](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
          return fn(rt, *live, args, count);
        });
  }

  static int midiArg(const jsi::Value* args, size_t count) {
    if (count < 1 || !args[0].isNumber()) return -1;
    const double m = args[0].getNumber();
    return m >= 0.0 && m < piano::LiveKeys::kKeys && m == std::floor(m) ? static_cast<int>(m) : -1;
  }

  static jsi::Value changes(jsi::Runtime& rt, const piano::LiveNotes& live, const jsi::Value* args, size_t count) {
    const double since = count > 0 && args[0].isNumber() ? args[0].getNumber() : -1.0;
    uint64_t version = 0;
    piano::LiveKeys::Changes changed;
    const int n = live.keys().changesSince(since >= 0.0 ? static_cast<int64_t>(since) : -1, version, changed);
    if (n < 0) return jsi::Value::null();
    jsi::Array result(rt, 1 + 4 * static_cast<std::size_t>(n));
    result.setValueAtIndex(rt, 0, static_cast<double>(version));
    for (int i = 0; i < n; ++i) {
      const piano::LiveKeys::Change& c = changed[static_cast<std::size_t>(i)];
      const std::size_t at = 1 + 4 * static_cast<std::size_t>(i);
      result.setValueAtIndex(rt, at, c.midi);
      result.setValueAtIndex(rt, at + 1, c.down ? 1 : 0);
      result.setValueAtIndex(rt, at + 2, static_cast<double>(c.velocity));
      result.setValueAtIndex(rt, at + 3, c.struck ? 1 : 0);
    }
    return jsi::Value(std::move(result));
  }

  static jsi::Value key(jsi::Runtime& rt, const piano::LiveNotes& live, const jsi::Value* args, size_t count) {
    const int m = midiArg(args, count);
    piano::LiveKey k;
    if (m < 0 || !live.keys().read(m, k)) return jsi::Value::null();
    jsi::Object obj(rt);
    obj.setProperty(rt, "midi", m);
    obj.setProperty(rt, "down", k.down);
    obj.setProperty(rt, "velocity", static_cast<double>(k.velocity));
    obj.setProperty(rt, "cents", static_cast<double>(k.cents));
    obj.setProperty(rt, "tMs", k.tMs);
    obj.setProperty(rt, "strikes", static_cast<double>(k.strikes));
    return jsi::Value(std::move(obj));
  }

  static jsi::Value isDown(jsi::Runtime&, const piano::LiveNotes& live, const jsi::Value* args, size_t count) {
    return live.keys().isDown(midiArg(args, count));
  }

  std::shared_ptr<const piano::LiveNotes> live_;
};

/**
 * One JS listener's way to the notes: its callback, a flag that keeps at
 * most one wake pending, and its own place in the event ring.
 */
struct NoteDrain {
  NoteDrain(std::shared_ptr<const piano::LiveNotes> notes, std::shared_ptr<AsyncCallback<>> cb)
      : live(std::move(notes)), callback(std::move(cb)), reader(*live) {}

  std::shared_ptr<const piano::LiveNotes> live;
  std::shared_ptr<AsyncCallback<>> callback;
  std::atomic<bool> pending{false};
  piano::NoteEventReader reader;  // JS thread only

  // Any thread. Queues one drain unless one is already queued: that one will
  // read these notes too.
  static void wake(const std::shared_ptr<NoteDrain>& self) {
    if (self->pending.exchange(true, std::memory_order_acq_rel)) return;
    self->callback->call([self](jsi::Runtime& rt, jsi::Function& func) {
      // An exchange, not a store: either the analysis thread then sees false
      // and queues another drain, or this drain sees every note published
      // before it looked.
      self->pending.exchange(false, std::memory_order_acq_rel);
      self->reader.drain(*self->live, [&](const piano::NoteEvent& ev) { func.call(rt, noteObject(rt, ev)); });
    });
  }
};

const char* stateName(piano::EngineState s) {
  switch (s) {
    case piano::EngineState::Running:
      return "running";
    case piano::EngineState::Stopped:
      return "stopped";
    case piano::EngineState::PermissionPending:
      return "permissionPending";
    case piano::EngineState::PermissionDenied:
      return "permissionDenied";
    case piano::EngineState::Interrupted:
      return "interrupted";
    case piano::EngineState::Error:
      return "error";
  }
  return "error";
}

} // namespace

NativePianoEngine::NativePianoEngine(std::shared_ptr<CallInvoker> jsInvoker)
    : NativePianoEngineCxxSpec<NativePianoEngine>(std::move(jsInvoker)) {}

NativePianoEngine::~NativePianoEngine() {
  engine_.stop();
}

std::shared_ptr<AsyncCallback<>> NativePianoEngine::keep(std::shared_ptr<AsyncCallback<>>& slot,
                                                         AsyncCallback<>&& callback) {
  if (slot) replaced_.push_back(slot);
  slot = std::make_shared<AsyncCallback<>>(std::move(callback));
  return slot;
}

bool NativePianoEngine::startDetector(jsi::Runtime& /*rt*/) {
  return engine_.start();
}

void NativePianoEngine::stopDetector(jsi::Runtime& /*rt*/) {
  engine_.stop();
  replaced_.clear();  // the analysis thread is joined: nothing else can be using them
}

void NativePianoEngine::setExpectedNotes(jsi::Runtime& /*rt*/, const std::vector<double>& midiNotes) {
  std::vector<int> notes;
  notes.reserve(midiNotes.size());
  for (double m : midiNotes) {
    if (std::isfinite(m)) notes.push_back(static_cast<int>(std::lround(m)));
  }
  engine_.setExpectedNotes(std::move(notes));
}

void NativePianoEngine::setPolyphony(jsi::Runtime& /*rt*/, bool enabled) {
  engine_.setPolyphony(enabled);
}

NativePianoEngineEngineStatsCxx NativePianoEngine::getEngineStats(jsi::Runtime& /*rt*/) {
  const piano::EngineStats s = engine_.getStats();
  return NativePianoEngineEngineStatsCxx{s.avgUs, s.maxUs, static_cast<double>(s.lateHops),
                                         static_cast<double>(s.droppedHops)};
}

// No task per note: the analysis thread wakes JS at most once at a time, and
// the woken drain delivers every note published since, in order.
void NativePianoEngine::onPianoEvent(jsi::Runtime& /*rt*/, AsyncCallback<> callback) {
  auto drain = std::make_shared<NoteDrain>(engine_.live(), keep(noteCallback_, std::move(callback)));
  engine_.setNoteWake(std::make_shared<const piano::Engine::NoteWake>([drain] { NoteDrain::wake(drain); }));
  NoteDrain::wake(drain);  // keys already held reach the new listener now
}

jsi::Object NativePianoEngine::getLiveKeys(jsi::Runtime& rt) {
  if (!liveKeys_) liveKeys_ = std::make_shared<LiveKeysHostObject>(engine_.live());
  return jsi::Object::createFromHostObject(rt, liveKeys_);
}

void NativePianoEngine::onEngineStatus(jsi::Runtime& /*rt*/, AsyncCallback<> callback) {
  auto cb = keep(statusCallback_, std::move(callback));
  engine_.setStatusSink(std::make_shared<const piano::Engine::StatusSink>([cb](const piano::EngineStatusEvent& ev) {
    cb->call([state = std::string(stateName(ev.state)), message = ev.message](jsi::Runtime& rt, jsi::Function& func) {
      jsi::Object obj(rt);
      obj.setProperty(rt, "state", jsi::String::createFromUtf8(rt, state));
      obj.setProperty(rt, "message", jsi::String::createFromUtf8(rt, message));
      func.call(rt, obj);
    });
  }));
}

bool NativePianoEngine::startCalibration(jsi::Runtime& /*rt*/, NativePianoEngineCalibrationOptionsCxx options) {
  piano::CalibrationOptions o;
  o.fullMode = options.fullMode;
  o.lowestMidi = static_cast<int>(std::lround(options.lowestMidi));
  o.highestMidi = static_cast<int>(std::lround(options.highestMidi));
  return engine_.startCalibration(o);
}

void NativePianoEngine::stopCalibration(jsi::Runtime& /*rt*/) {
  engine_.stopCalibration();
}

NativePianoEnginePianoProfileCxx NativePianoEngine::getCalibrationProfile(jsi::Runtime& /*rt*/) {
  const piano::PianoProfile p = engine_.profileSnapshot();
  std::vector<double> measured;
  for (int m = 0; m < 128; ++m) {
    if (p.keySource[static_cast<std::size_t>(m)] == piano::kKeyMeasured) measured.push_back(m);
  }
  return NativePianoEnginePianoProfileCxx{
      p.isCalibrated,
      static_cast<double>(p.lowestMidi),
      static_cast<double>(p.highestMidi),
      static_cast<double>(p.a4ReferenceHz),
      static_cast<double>(p.ambientNoiseDb),
      static_cast<double>(p.calibratedGateDb),
      static_cast<double>(p.minVelocityDb),
      static_cast<double>(p.maxVelocityDb),
      static_cast<double>(p.meanInharmonicityB),
      std::move(measured),
  };
}

bool NativePianoEngine::saveCalibrationProfile(jsi::Runtime& /*rt*/) {
  return engine_.saveCalibrationProfile();
}

void NativePianoEngine::clearCalibrationProfile(jsi::Runtime& /*rt*/) {
  engine_.clearCalibrationProfile();
}

void NativePianoEngine::onCalibrationEvent(jsi::Runtime& /*rt*/, AsyncCallback<> callback) {
  auto cb = keep(calibrationCallback_, std::move(callback));
  engine_.setCalibrationSink(
      std::make_shared<const piano::Engine::CalibrationSink>([cb](const piano::CalibrationProgressEvent& ev) {
        cb->call([ev](jsi::Runtime& rt, jsi::Function& func) {
          jsi::Object obj(rt);
          obj.setProperty(rt, "state", static_cast<double>(ev.state));
          obj.setProperty(rt, "currentMidi", static_cast<double>(ev.currentMidi));
          obj.setProperty(rt, "keyIndex", static_cast<double>(ev.keyIndex));
          obj.setProperty(rt, "totalKeys", static_cast<double>(ev.totalKeys));
          obj.setProperty(rt, "strikeNumber", static_cast<double>(ev.strikeNumber));
          obj.setProperty(rt, "measuredMidi", static_cast<double>(ev.measuredMidi));
          obj.setProperty(rt, "detectedMidi", static_cast<double>(ev.detectedMidi));
          obj.setProperty(rt, "measuredFreqHz", static_cast<double>(ev.measuredFreqHz));
          obj.setProperty(rt, "centsOffset", static_cast<double>(ev.centsOffset));
          obj.setProperty(rt, "strikeRmsDb", static_cast<double>(ev.strikeRmsDb));
          obj.setProperty(rt, "measuredB", static_cast<double>(ev.measuredB));
          func.call(rt, obj);
        });
      }));
}

} // namespace react
} // namespace facebook

#endif // HAS_APP_SPECS_JSI
