/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: ['src/sim/damage.ts'],
  testRunner: 'command',
  commandRunner: {
    command: "node -e \"import('./src/sim/combat.selftest.mjs').then(() => import('./src/sim/ammunitionFlow.selftest.mjs')).then(() => import('./src/sim/autoloader.selftest.mjs')).then(() => import('./src/sim/specialActions.selftest.mjs')).then(() => import('./src/game/equipment.selftest.mjs'))\"",
  },
  coverageAnalysis: 'off',
  concurrency: 4,
  timeoutMS: 10_000,
  disableTypeChecks: true,
  ignorePatterns: [
    'tsconfig.json',
    'dist/**',
    'coverage/**',
    '.quality-reports/**',
  ],
  reporters: ['clear-text', 'json'],
  jsonReporter: {
    fileName: '.quality-reports/damage-mutation.json',
  },
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: '.stryker-tmp',
};

export default config;
