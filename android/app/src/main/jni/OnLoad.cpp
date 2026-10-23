#include <jni.h>
#include <memory>
#include <string>
#include "NativePianoEngine.h"
#include "OboeInput.h"

#if __has_include(<ReactCommon/TurboModule.h>)
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/TurboModule.h>

std::shared_ptr<facebook::react::TurboModule> cxxModuleProvider(
    const std::string& name,
    const std::shared_ptr<facebook::react::CallInvoker>& jsInvoker) {
  if (name == facebook::react::NativePianoEngine::kModuleName) {
    auto engineModule = std::make_shared<facebook::react::NativePianoEngine>(jsInvoker);
    auto input = std::make_unique<piano::OboeAudioInput>(engineModule->getInternalEngine().getRing());
    engineModule->getInternalEngine().setAudioInput(std::move(input));
    return engineModule;
  }
  return nullptr;
}
#endif

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return JNI_VERSION_1_6;
}
