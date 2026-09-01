/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    'src/engine/adaptiveQualityPolicy.ts',
    'src/engine/renderScalePolicy.ts',
    'src/engine/resolutionPolicy.ts',
  ],
  testRunner: 'command',
  commandRunner: {
    command: "node -e \"import('./src/engine/adaptiveQualityPolicy.selftest.mjs').then(() => import('./src/engine/renderScalePolicy.selftest.mjs'))\"",
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
    fileName: '.quality-reports/graphics-mutation.json',
  },
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: '.stryker-tmp',
};

export default config;
