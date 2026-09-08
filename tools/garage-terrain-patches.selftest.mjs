import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('./generate-garage-terrain-patches.mjs', import.meta.url)),
  '--check',
], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /10 battlefield excerpts/);
console.log('garage-terrain-patches.selftest: generated battlefield excerpts are current');
