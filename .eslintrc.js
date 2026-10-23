module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Node tooling (architecture scripts, Claude hooks, design scripts) is modern ESM.
      files: ['**/*.mjs'],
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      env: { node: true, es2022: true },
    },
  ],
};
