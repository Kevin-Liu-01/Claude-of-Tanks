import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
  new URL('./generate-garage-terrain-patches.mjs', import.meta.url).pathname,
  '--check',
], {
  cwd: new URL('..', import.meta.url).pathname,
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /10 battlefield excerpts/);
console.log('garage-terrain-patches.selftest: generated battlefield excerpts are current');
