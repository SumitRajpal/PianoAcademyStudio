/**
 * Jest environment for react-native-skia: React Native's environment, plus
 * CanvasKit (the engine behind Skia's test mock) loaded inside the test's own
 * JavaScript realm.
 *
 * Skia's stock environment loads CanvasKit outside that realm, so CanvasKit's
 * `instanceof Array` checks reject arrays made by test code, such as the
 * colours of a gradient.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ReactNativeEnvironment = require('@react-native/jest-preset/jest/react-native-env.js');

const canvasKitFile = require.resolve('canvaskit-wasm/bin/full/canvaskit.js');
const canvasKitDir = path.dirname(canvasKitFile);

module.exports = class SkiaEnvironment extends ReactNativeEnvironment {
  async setup() {
    await super.setup();
    const wrapper = vm.runInContext(
      `(function (module, exports, require, __filename, __dirname) {\n${fs.readFileSync(
        canvasKitFile,
        'utf8',
      )}\n})`,
      this.getVmContext(),
      { filename: canvasKitFile },
    );
    const canvasKitModule = { exports: {} };
    wrapper(
      canvasKitModule,
      canvasKitModule.exports,
      require,
      canvasKitFile,
      canvasKitDir,
    );
    this.global.CanvasKit = await canvasKitModule.exports({
      locateFile: name => path.join(canvasKitDir, name),
    });
  }
};
