// The cinema's "lease over" status is its own (2026-11-02 audit S5): cinema.mjs exited 75 for a lease that ran out and
// site50-finals.mjs resumed on 75, the number every selftest verdict reads as STARVED (tools/selftest-verdict.mjs). Now the
// lease has CINEMA_LEASE_OVER_EXIT, apart from every status the tools give a meaning, and both sides name the constant.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BROWSER_GUARD_EXIT_CODE } from '../browser-launch.mjs';
import * as captureLock from '../capture-lock.mjs';
import { isStarved, SELFTEST_STARVED_EXIT } from '../selftest-verdict.mjs';
import { CINEMA_LEASE_OVER_EXIT } from './lease-exit.mjs';

const source = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

assert.ok(Number.isInteger(CINEMA_LEASE_OVER_EXIT) && CINEMA_LEASE_OVER_EXIT > 4 && CINEMA_LEASE_OVER_EXIT < 124, 'an exit status of its own');
assert.ok(!isStarved(CINEMA_LEASE_OVER_EXIT), 'a lease over is not the selftests\' STARVED verdict');
assert.notEqual(CINEMA_LEASE_OVER_EXIT, SELFTEST_STARVED_EXIT);
assert.notEqual(CINEMA_LEASE_OVER_EXIT, BROWSER_GUARD_EXIT_CODE, 'nor the browser guard\'s trip');

// (round 2 U39) the hold CLIs' wait timeout (tools/with-session-mutex.mjs exited 75 when its wait ran out) has its own status
const { LOCK_WAIT_TIMEOUT_EXIT } = captureLock;
assert.ok(Number.isInteger(LOCK_WAIT_TIMEOUT_EXIT) && LOCK_WAIT_TIMEOUT_EXIT > 4 && LOCK_WAIT_TIMEOUT_EXIT < 124, 'a hold CLI\'s wait timeout has a status of its own');
const named = { SELFTEST_STARVED_EXIT, CINEMA_LEASE_OVER_EXIT, LOCK_WAIT_TIMEOUT_EXIT, BROWSER_GUARD_EXIT_CODE };
assert.equal(new Set(Object.values(named)).size, Object.keys(named).length, `one meaning per status: ${JSON.stringify(named)}`);

// no source exits with one of those numbers as a bare literal: each is named by its owner's constant, so a reader that
// branches on the status finds the one meaning it has (the census reads code only, comments removed)
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const literal = new RegExp(`(?:process\\.exit\\(|exitCode\\s*=)\\s*(?:${Object.values(named).join('|')})\\b`);
const bare = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'api', 'scripts', 'server', 'src', 'tools'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter((file) => /\.(?:[cm]?js|[cm]?ts)$/.test(file))
  .flatMap((file) => {
    let text;
    try { text = readFileSync(`${ROOT}/${file}`, 'utf8'); } catch { return []; }
    return code(text).split('\n').flatMap((line, index) => (literal.test(line) ? [`${file}:${index + 1}: ${line.trim().slice(0, 120)}`] : []));
  });
assert.deepEqual(bare, [], `exit through the named status, not its number:\n  ${bare.join('\n  ')}`);

// (round 2 U39) the docs say so too: docs/MEDIA-PRODUCTION.md still had cinema exit 75 for a lease over; a doc line that names
// exit 75 is the STARVED verdict's, and says so
const docs = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((file) => file && !file.startsWith('node_modules/'));
const misnamed = docs.flatMap((file) => {
  let text;
  try { text = readFileSync(`${ROOT}/${file}`, 'utf8'); } catch { return []; }
  return text.split('\n').flatMap((line, index) => (new RegExp(`\\bexit(?:s|ed)?(?: with)? ${SELFTEST_STARVED_EXIT}\\b`).test(line) && !/STARVED/.test(line)
    ? [`${file}:${index + 1}: ${line.trim().slice(0, 120)}`] : []));
});
assert.deepEqual(misnamed, [], `a doc names exit ${SELFTEST_STARVED_EXIT} for something other than STARVED (cinema's lease over is ${CINEMA_LEASE_OVER_EXIT}):\n  ${misnamed.join('\n  ')}`);
assert.match(readFileSync(`${ROOT}/docs/MEDIA-PRODUCTION.md`, 'utf8'), new RegExp(`exits ${CINEMA_LEASE_OVER_EXIT} \\(\`CINEMA_LEASE_OVER_EXIT\``), 'the media doc names the lease-over status');

// the writer and the reader name the constant; neither keeps the old literal
const cinema = code(source('./cinema.mjs')), finals = code(source('../media-r5/site50-finals.mjs'));
assert.match(cinema, /process\.exitCode = CINEMA_LEASE_OVER_EXIT\b/, 'cinema exits a lease over with the constant');
assert.match(finals, /code === CINEMA_LEASE_OVER_EXIT && keepPlace/, 'the finals resume a lease over by the constant');
for (const [name, text] of [['cinema.mjs', cinema], ['site50-finals.mjs', finals]]) {
  assert.doesNotMatch(text, /(?:exitCode\s*=|exit\(|code\s*===?)\s*75\b/, `${name} keeps no literal 75`);
}
console.log(`lease-exit.selftest: cinema's lease over is exit ${CINEMA_LEASE_OVER_EXIT}, apart from STARVED ${SELFTEST_STARVED_EXIT} and a hold CLI's wait timeout ${LOCK_WAIT_TIMEOUT_EXIT}, on both sides; no bare status literal`);
