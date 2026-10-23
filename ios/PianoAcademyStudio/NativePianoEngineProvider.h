#pragma once

#import <Foundation/Foundation.h>
#import <memory>

#if __has_include(<ReactCommon/RCTTurboModule.h>)
#import <ReactCommon/RCTTurboModule.h>

@interface NativePianoEngineProvider : NSObject <RCTModuleProvider>

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params;

@end

#endif
