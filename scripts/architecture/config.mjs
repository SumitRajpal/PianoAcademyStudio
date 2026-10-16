/**
 * Architecture config: planes, module kinds and connection rules.
 * Read by the graph scripts, the Claude hooks, the git hooks and CI.
 * Claude must ask the owner before changing this file (a PreToolUse hook enforces that).
 * Design: docs/claude-setup/DESIGN.md (sections 3 and 4).
 */

export default {
  // Files and folders scanned for code. Everything else is ignored.
  roots: ['App.tsx', 'index.js', 'src', 'native', 'ios', 'android'],

  exclude: [
    '**/node_modules/**',
    'ios/Pods/**',
    '**/build/**',
    'android/.gradle/**',
    '**/.cxx/**',
    '**/*.xcodeproj/**',
    '**/*.xcworkspace/**',
    '**/__tests__/**',
    '**/*.test.*',
    '**/*.spec.*',
  ],

  // Root files that are their own module.
  entries: ['App.tsx', 'index.js'],

  // A folder under these roots with an index.(ts|tsx|js|jsx) is one module.
  moduleRoots: ['src', 'native'],

  // Folders that are one module even without an index file (native code has none).
  folderModules: ['native/*'],

  // Platform projects shown as single modules, with fixed purposes.
  platformModules: {
    ios: 'iOS app project: Xcode project, AppDelegate, Info.plist and native iOS code',
    android: 'Android app project: Gradle build, MainActivity, manifest and native Android code',
  },

  // First match wins. `thread` is the default for files in the plane; a file can
  // override it with an `@thread ui|js|audio|native|any` header tag.
  planes: [
    {
      id: 'audio',
      label: 'AUDIO',
      match: ['src/audio/**'],
      thread: 'audio',
      description: 'mic capture, playback, DSP, onset and pitch detection (native audio thread)',
    },
    {
      id: 'sync',
      label: 'SYNC',
      match: ['src/sync/**'],
      thread: 'any',
      description: 'shared clock, latency compensation, event stream (lock-free)',
    },
    {
      id: 'motion',
      label: 'MOTION',
      match: ['src/motion/**'],
      thread: 'ui',
      description: 'animation drivers, scenes and rendering (UI thread + GPU)',
    },
    {
      id: 'shared',
      label: 'SHARED',
      match: ['src/shared/**'],
      thread: 'any',
      description: 'types, utilities and music-theory tables usable from any thread',
    },
    {
      id: 'platform',
      label: 'PLATFORM',
      match: ['ios/**', 'android/**', 'native/**'],
      thread: 'native',
      description: 'iOS and Android projects and native modules',
    },
    {
      id: 'app',
      label: 'APP',
      match: ['src/**', 'App.tsx', 'index.js'],
      thread: 'js',
      description: 'screens, navigation, lessons, scoring, progress, storage (JS thread)',
    },
  ],

  // Module kinds by module id (first match wins). Default kind: "module".
  kinds: [
    { match: 'src/screens/*', kind: 'screen' },
    { match: 'src/motion/scenes/*', kind: 'scene' },
    { match: 'src/motion/drivers/*', kind: 'driver' },
    { match: 'src/state/*', kind: 'store' },
    { match: 'src/services/*', kind: 'service' },
    { match: 'native/*', kind: 'native-module' },
  ],

  // Import aliases, e.g. { '@audio': 'src/audio' }. Keep in sync with babel and tsconfig.
  aliases: {},

  // Flow steps that are outside the code (docs/architecture/flows.md).
  flowExternals: ['mic', 'speaker', 'headphones', 'screen', 'user', 'midi', 'storage', 'network'],

  // Connection rules (design section 3.4). Rules with no matching files do nothing.
  rules: [
    {
      id: 'screens-no-audio-internals',
      type: 'forbid-imports',
      description: 'Screens never touch audio internals or native modules.',
      from: ['src/screens/**'],
      to: ['src/audio/**', 'native/**'],
      except: ['src/audio/index.{ts,tsx}'],
      fix: 'Use the public API in src/audio/index.ts, or move the logic into a feature.',
    },
    {
      id: 'public-api-only',
      type: 'public-api',
      description: 'Features and audio are imported only through their public index.ts.',
      scope: ['src/features/*', 'src/audio'],
      fix: 'Import from the module folder (its index.ts) and export what you need there.',
    },
    {
      id: 'motion-isolation',
      type: 'allow-only',
      description:
        'Motion code may not import features, screens, state stores or audio; it uses other motion code, sync/ and shared/.',
      from: ['src/motion/**'],
      allow: ['src/motion/**', 'src/sync/**', 'src/shared/**'],
      fix: 'Read musical events and time through src/sync; put shared types in src/shared.',
    },
    {
      id: 'audio-no-ui',
      type: 'forbid-imports',
      description: 'Audio code has no UI imports.',
      from: ['src/audio/**'],
      to: ['src/screens/**', 'src/ui/**', 'src/motion/**', 'src/features/**', 'App.tsx'],
      fix: 'Publish events through src/sync; let the UI subscribe.',
    },
    {
      id: 'motion-no-js-hop',
      type: 'forbid-pattern',
      description: 'Code that runs every frame in motion never hands work back to the JS thread.',
      files: ['src/motion/**'],
      pattern: '\\b(?:runOnJS|scheduleOnRN|runOnJSThread)\\s*\\(',
      fix: 'Keep per-frame work in worklets; send summaries to the app from sync/ at a low rate.',
    },
    {
      id: 'motion-tokens',
      type: 'forbid-pattern',
      description: 'Motion code takes durations and easing from tokens, not hard-coded numbers.',
      files: ['src/motion/**'],
      except: ['src/motion/tokens/**'],
      pattern: '\\b(?:duration|delay|damping|stiffness|mass)\\s*:\\s*-?\\d',
      fix: 'Add or reuse a token in src/motion/tokens and reference it.',
    },
    {
      id: 'thread-boundary',
      type: 'thread-boundary',
      description: 'Code on the UI or audio thread never imports JS-thread code.',
      fromThreads: ['ui', 'audio'],
      toThreads: ['js'],
      fix: 'Move the shared piece to src/shared or src/sync (thread: any).',
    },
    {
      id: 'no-cycles',
      type: 'no-cycles',
      description: 'No circular imports anywhere.',
      fix: 'Extract the shared part into a third module.',
    },
  ],
};
