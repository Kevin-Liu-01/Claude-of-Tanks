/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: ['src/net/localTankPrediction.ts'],
  testRunner: 'command',
  commandRunner: {
    command: 'node src/net/localTankPrediction.selftest.mjs',
  },
  coverageAnalysis: 'off',
  concurrency: 4,
  timeoutMS: 10_000,
  disableTypeChecks: true,
  // Tests execute TypeScript directly through Node's type stripping. Skipping
  // the project tsconfig also avoids coupling mutation runs to the separate
  // TypeScript 7 application typecheck.
  ignorePatterns: [
    'tsconfig.json',
    'dist/**',
    'coverage/**',
    '.quality-reports/**',
  ],
  reporters: ['clear-text', 'json'],
  jsonReporter: {
    fileName: '.quality-reports/prediction-mutation.json',
  },
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: '.stryker-tmp',
};

export default config;
