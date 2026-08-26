import { spawnSync } from 'node:child_process';
import { SELFTEST_SUITES } from './selftest-suites.mjs';

const suiteName = process.argv[2];
const suite = SELFTEST_SUITES[suiteName];
if (!suite) {
  console.error('Unknown self-test suite "' + (suiteName || '') + '". Expected: ' + Object.keys(SELFTEST_SUITES).join(', '));
  process.exit(2);
}

console.log('[selftests] ' + suiteName + ': ' + suite.length + ' files');
for (const file of suite) {
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error('[selftests] FAIL ' + file);
    process.exit(result.status ?? 1);
  }
}
console.log('[selftests] PASS ' + suiteName);
