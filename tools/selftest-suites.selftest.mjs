import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SELFTEST_SUITES } from './selftest-suites.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expectedScripts = {
  pre: 'node tools/run-selftests.mjs pre',
  core: 'node tools/run-selftests.mjs core',
  post: 'node tools/run-selftests.mjs post',
};
assert.equal(packageJson.scripts.pretest, expectedScripts.pre);
assert.equal(packageJson.scripts.test, expectedScripts.core);
assert.equal(packageJson.scripts.posttest, expectedScripts.post);

let total = 0;
const listed = [];
for (const [name, files] of Object.entries(SELFTEST_SUITES)) {
  assert.ok(files.length > 0, name + ' suite is empty');
  assert.equal(new Set(files).size, files.length, name + ' suite has duplicate entries');
  for (const file of files) {
    assert.match(file, /\.mjs$/, file + ' is not an executable check');
    assert.ok(existsSync(file), file + ' does not exist');
  }
  listed.push(...files);
  total += files.length;
}
assert.equal(new Set(listed).size, listed.length,
  'a regression check must have exactly one lifecycle owner');

const trackedSelftests = execFileSync('git', ['ls-files', '-z', '*.selftest.mjs'], {
  encoding: 'utf8',
}).split('\0').filter((file) => file && existsSync(file)).sort();
const listedSelftests = listed.filter((file) => file.endsWith('.selftest.mjs')).sort();
assert.deepEqual(listedSelftests, trackedSelftests,
  'every tracked self-test must execute in exactly one npm test lifecycle suite');

console.log('selftest-suites.selftest: ' + total + ' ordered checks are discoverable');
