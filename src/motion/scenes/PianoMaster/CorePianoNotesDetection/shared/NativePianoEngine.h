#pragma once

#include <memory>
#include <string>
#include <vector>

#include "Engine.h"

#if __has_include(<AppSpecsJSI.h>)
#include <AppSpecsJSI.h>
#define HAS_APP_SPECS_JSI 1
#elif __has_include(<ReactCodegen/AppSpecsJSI.h>)
#include <ReactCodegen/AppSpecsJSI.h>
#define HAS_APP_SPECS_JSI 1
#endif

namespace facebook {
namespace react {

#if HAS_APP_SPECS_JSI

using NativePianoEngineEngineStatsCxx = NativePianoEngineEngineStats<double, double, double, double>;
template <>
struct Bridging<NativePianoEngineEngineStatsCxx>
    : NativePianoEngineEngineStatsBridging<NativePianoEngineEngineStatsCxx> {};

using NativePianoEngineCalibrationOptionsCxx = NativePianoEngineCalibrationOptions<bool, double, double>;
template <>
struct Bridging<NativePianoEngineCalibrationOptionsCxx>
    : NativePianoEngineCalibrationOptionsBridging<NativePianoEngineCalibrationOptionsCxx> {};

using NativePianoEnginePianoProfileCxx = NativePianoEnginePianoProfile<
    bool, double, double, double, double, double, double, double, double, std::vector<double>>;
template <>
struct Bridging<NativePianoEnginePianoProfileCxx>
    : NativePianoEnginePianoProfileBridging<NativePianoEnginePianoProfileCxx> {};

/**
 * The JS face of piano::Engine. Methods run on the JS thread.
 *
 * Notes reach JS without a queue per note: the analysis thread publishes
 * them to the engine's LiveNotes and wakes JS at most once at a time (one
 * pending AsyncCallback, however many notes arrive meanwhile); the woken JS
 * thread then reads every new note in order. getLiveKeys() hands out the key
 * table itself, which the UI runtime (worklets) and JS read directly.
 * Calibration and status events are rare and go through AsyncCallback.
 */
class NativePianoEngine : public NativePianoEngineCxxSpec<NativePianoEngine> {
public:
  static constexpr auto kModuleName = "NativePianoEngine";

  explicit NativePianoEngine(std::shared_ptr<CallInvoker> jsInvoker);
  ~NativePianoEngine() override;

  bool startDetector(jsi::Runtime& rt);
  void stopDetector(jsi::Runtime& rt);
  void setExpectedNotes(jsi::Runtime& rt, const std::vector<double>& midiNotes);
  void setPolyphony(jsi::Runtime& rt, bool enabled);
  NativePianoEngineEngineStatsCxx getEngineStats(jsi::Runtime& rt);
  void onPianoEvent(jsi::Runtime& rt, AsyncCallback<> callback);
  jsi::Object getLiveKeys(jsi::Runtime& rt);
  void onEngineStatus(jsi::Runtime& rt, AsyncCallback<> callback);
  bool startCalibration(jsi::Runtime& rt, NativePianoEngineCalibrationOptionsCxx options);
  void stopCalibration(jsi::Runtime& rt);
  NativePianoEnginePianoProfileCxx getCalibrationProfile(jsi::Runtime& rt);
  bool saveCalibrationProfile(jsi::Runtime& rt);
  void clearCalibrationProfile(jsi::Runtime& rt);
  void onCalibrationEvent(jsi::Runtime& rt, AsyncCallback<> callback);

  piano::Engine& getInternalEngine() noexcept { return engine_; }

private:
  // Holds a JS callback on the JS thread. A sink being dispatched on the
  // analysis thread may still use the callback it replaced, so replaced ones
  // are kept until stopDetector() has joined that thread; the last reference
  // is then never dropped off the JS thread.
  std::shared_ptr<AsyncCallback<>> keep(std::shared_ptr<AsyncCallback<>>& slot, AsyncCallback<>&& callback);

  piano::Engine engine_;
  std::shared_ptr<AsyncCallback<>> noteCallback_;
  std::shared_ptr<AsyncCallback<>> statusCallback_;
  std::shared_ptr<AsyncCallback<>> calibrationCallback_;
  std::vector<std::shared_ptr<AsyncCallback<>>> replaced_;
  std::shared_ptr<jsi::HostObject> liveKeys_;
};

#else

// Built without codegen (desktop tools, or a platform without the app's specs).
class NativePianoEngine {
public:
  static constexpr auto kModuleName = "NativePianoEngine";
  piano::Engine& getInternalEngine() noexcept { return engine_; }

private:
  piano::Engine engine_;
};

#endif

} // namespace react
} // namespace facebook
