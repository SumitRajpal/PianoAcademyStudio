#pragma once

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "../cpp/capture/TakeRecorder.h"

#if __has_include(<AppSpecsJSI.h>)
#include <AppSpecsJSI.h>
#define HAS_APP_SPECS_JSI 1
#elif __has_include(<ReactCodegen/AppSpecsJSI.h>)
#include <ReactCodegen/AppSpecsJSI.h>
#define HAS_APP_SPECS_JSI 1
#endif

namespace piano::capture {

/** The phone and its audio route, as the platform reports them. */
struct TakeDeviceInfo {
  std::string model;
  std::string systemVersion;
  std::string inputPort;
  std::string inputPortType;
  std::string inputDataSource;
  double hardwareSampleRate = 0.0;
  double ioBufferMs = 0.0;
  double inputLatencyMs = 0.0;
};

/** What the platform gives the recorder module: where takes go, the device, and the screen's idle timer. */
struct TakePlatform {
  std::string takesFolder;
  std::function<TakeDeviceInfo()> device;
  std::function<void(bool)> keepScreenAwake;
};

}  // namespace piano::capture

namespace facebook {
namespace react {

#if HAS_APP_SPECS_JSI

using NativeTakeRecorderTakeDeviceCxx =
    NativeTakeRecorderTakeDevice<std::string, std::string, std::string, std::string, std::string, double, double, double>;
template <>
struct Bridging<NativeTakeRecorderTakeDeviceCxx>
    : NativeTakeRecorderTakeDeviceBridging<NativeTakeRecorderTakeDeviceCxx> {};

using NativeTakeRecorderTakeStatusCxx =
    NativeTakeRecorderTakeStatus<bool, bool, std::string, double, double, double, double, std::string>;
template <>
struct Bridging<NativeTakeRecorderTakeStatusCxx>
    : NativeTakeRecorderTakeStatusBridging<NativeTakeRecorderTakeStatusCxx> {};

using NativeTakeRecorderTakeStatsCxx = NativeTakeRecorderTakeStats<std::string, double, double, double, double, double,
                                                                   std::vector<double>, std::vector<double>, std::string>;
template <>
struct Bridging<NativeTakeRecorderTakeStatsCxx>
    : NativeTakeRecorderTakeStatsBridging<NativeTakeRecorderTakeStatsCxx> {};

using NativeTakeRecorderStoredTakeCxx = NativeTakeRecorderStoredTake<std::string, double, std::string>;
template <>
struct Bridging<NativeTakeRecorderStoredTakeCxx>
    : NativeTakeRecorderStoredTakeBridging<NativeTakeRecorderStoredTakeCxx> {};

/**
 * The JS face of the take recorder (cpp/capture/TakeRecorder.h). Methods run
 * on the JS thread. Takes live in the platform's Takes folder, one folder per
 * take: audio.wav (written by the recorder) and meta.json (written by JS).
 */
class NativeTakeRecorder : public NativeTakeRecorderCxxSpec<NativeTakeRecorder> {
public:
  static constexpr auto kModuleName = "NativeTakeRecorder";

  NativeTakeRecorder(std::shared_ptr<CallInvoker> jsInvoker, piano::capture::TakePlatform platform);

  std::string takesFolder(jsi::Runtime& rt);
  double freeSpaceBytes(jsi::Runtime& rt);
  NativeTakeRecorderTakeDeviceCxx device(jsi::Runtime& rt);
  bool startTake(jsi::Runtime& rt, std::string id);
  NativeTakeRecorderTakeStatsCxx stopTake(jsi::Runtime& rt);
  NativeTakeRecorderTakeStatusCxx getTakeStatus(jsi::Runtime& rt);
  bool saveTakeMeta(jsi::Runtime& rt, std::string id, std::string json);
  std::vector<NativeTakeRecorderStoredTakeCxx> listTakes(jsi::Runtime& rt);
  bool deleteTake(jsi::Runtime& rt, std::string id);

private:
  piano::capture::TakePlatform platform_;
};

#endif  // HAS_APP_SPECS_JSI

}  // namespace react
}  // namespace facebook
