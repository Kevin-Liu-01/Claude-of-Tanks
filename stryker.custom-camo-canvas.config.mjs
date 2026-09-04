/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: ['src/vehicles/customCamoCanvas.ts'],
  testRunner: 'command',
  commandRunner: {
    command: 'node src/vehicles/customCamoCanvas.selftest.mjs',
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
    fileName: '.quality-reports/custom-camo-canvas-mutation.json',
  },
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tempDirName: '.stryker-tmp',
};

export default config;
