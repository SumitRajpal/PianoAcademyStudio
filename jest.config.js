module.exports = {
  preset: '@react-native/jest-preset',
  // React Native's environment with CanvasKit loaded for react-native-skia.
  testEnvironment: '<rootDir>/jest/skiaEnvironment.js',
  // Reanimated 4 and react-native-worklets resolve to their web builds in Jest.
  resolver: 'react-native-reanimated/jest/resolver',
  // Fonts are native assets: a require() of one is just an asset id.
  moduleNameMapper: {
    '\\.(otf|ttf)$': '<rootDir>/jest/fontStub.js',
  },
  setupFilesAfterEnv: [
    'react-native-skia/jestSetup.js',
    '<rootDir>/jest.setup.js',
  ],
  // These packages ship untranspiled code, so Jest must transform them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|react-native-.*|@react-native(-community)?)/)',
  ],
};
