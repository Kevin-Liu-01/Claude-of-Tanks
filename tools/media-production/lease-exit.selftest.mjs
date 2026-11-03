// The cinema's "lease over" status is its own (2026-11-02 audit S5): cinema.mjs exited 75 for a lease that ran out and
// site50-finals.mjs resumed on 75, the number every selftest verdict reads as STARVED (tools/selftest-verdict.mjs). Now the
// lease has CINEMA_LEASE_OVER_EXIT, apart from every status the tools give a meaning, and both sides name the constant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BROWSER_GUARD_EXIT_CODE } from '../browser-launch.mjs';
import { isStarved, SELFTEST_STARVED_EXIT } from '../selftest-verdict.mjs';
import { CINEMA_LEASE_OVER_EXIT } from './lease-exit.mjs';

const source = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

assert.ok(Number.isInteger(CINEMA_LEASE_OVER_EXIT) && CINEMA_LEASE_OVER_EXIT > 4 && CINEMA_LEASE_OVER_EXIT < 124, 'an exit status of its own');
assert.ok(!isStarved(CINEMA_LEASE_OVER_EXIT), 'a lease over is not the selftests\' STARVED verdict');
assert.notEqual(CINEMA_LEASE_OVER_EXIT, SELFTEST_STARVED_EXIT);
assert.notEqual(CINEMA_LEASE_OVER_EXIT, BROWSER_GUARD_EXIT_CODE, 'nor the browser guard\'s trip');

// the writer and the reader name the constant; neither keeps the old literal
const cinema = code(source('./cinema.mjs')), finals = code(source('../media-r5/site50-finals.mjs'));
assert.match(cinema, /process\.exitCode = CINEMA_LEASE_OVER_EXIT\b/, 'cinema exits a lease over with the constant');
assert.match(finals, /code === CINEMA_LEASE_OVER_EXIT && keepPlace/, 'the finals resume a lease over by the constant');
for (const [name, text] of [['cinema.mjs', cinema], ['site50-finals.mjs', finals]]) {
  assert.doesNotMatch(text, /(?:exitCode\s*=|exit\(|code\s*===?)\s*75\b/, `${name} keeps no literal 75`);
}
console.log(`lease-exit.selftest: cinema's lease over is exit ${CINEMA_LEASE_OVER_EXIT}, apart from STARVED ${SELFTEST_STARVED_EXIT}, on both sides`);
