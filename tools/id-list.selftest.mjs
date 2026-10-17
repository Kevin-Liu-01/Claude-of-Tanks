// Id lists fail loudly on a duplicate (2026-10-16, test-speed PLAN R4c; tools/id-list.mjs). Pins: (1) uniqueIds names
// every repeated id with its count and passes a clean list through unchanged; (2) the delegated checks (fills
// selection, release plan, concept policy, base-shell scope) refuse a repeat too, and the fills selection no longer
// de-duplicates silently; (3) every top-level fleet tool that reads an --ids list runs it through uniqueIds or a
// delegated check, so a new reader cannot skip it; (4) real tools refuse a repeated id at once, before a server, a
// browser or a capture hold.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { uniqueIds } from './id-list.mjs';
import { interiorFillSelection } from './interior-fill-selection.mjs';
import { validateSelectedIds } from './first-party-concept-policy.mjs';
import { tankReleaseSteps } from './tank-release-plan.mjs';
import { baseShellAuditScope } from './base-shell-audit-inputs.mjs';

// (1) the guard
const clean = ['a', 'b', 'c'];
assert.equal(uniqueIds(clean), clean, 'a clean list passes through as the same array');
assert.equal(uniqueIds(null), null, 'no list passes through');
assert.equal(uniqueIds(undefined), undefined);
assert.deepEqual(uniqueIds(['a', '', 'b', '']), ['a', '', 'b', ''], 'empty entries stay the tool\'s own business');
assert.throws(() => uniqueIds(['a', 'b', 'a']), /^Error: --ids lists a 2 times: a duplicate id fails/);
assert.throws(() => uniqueIds(['a', ' a', 'b', 'b', 'b'], 'tool --ids'), /^Error: tool --ids lists a 2 times, b 3 times:/,
  'ids compare trimmed, every repeat is named with its count');
assert.equal(uniqueIds(new Set(['x', 'y'])).size, 2, 'any iterable list');

// (2) the delegated checks
const registry = { first: 'g1', single: 'g2' };
assert.throws(() => interiorFillSelection(registry, ['single', 'first', 'first']), /gen-interior-fills --ids lists first 2 times/,
  'the fills selection refuses a repeat instead of de-duplicating it');
assert.deepEqual(interiorFillSelection(registry, ['single', 'first']), ['first', 'single']);
assert.throws(() => validateSelectedIds(['first', 'first'], Object.keys(registry)), /unique known playable tank IDs/);
assert.throws(() => tankReleaseSteps('leo2a7v,leo2a7v', true, 'node-test'), /tank:release:check --ids lists leo2a7v 2 times/,
  'the release plan names the repeated id before any step');
assert.throws(() => baseShellAuditScope(['a', 'b'], 'a,a'), /unique playable/);

// (3) every top-level fleet tool that reads an --ids list is guarded
const READS_IDS = /startsWith\(\s*['"`]--ids=|\b(?:opt|option|arg|value)\(\s*['"](?:--)?ids['"]/;
const DELEGATES = Object.freeze({
  'tools/gen-interior-fills.mjs': /interiorFillSelection\(FLEET_GROUP_BY_ID, requestedIds\)/,
  // tankReleaseSteps runs uniqueIds; the lane-mode runner (item/tests-release-lane-mode-227) reaches it through tankReleaseInvocation
  'tools/tank-release-check.mjs': /tankReleaseStages\(ids,gate\)|tankReleaseInvocation\(process\.argv\.slice\(2\)\)/,
  'tools/base-shell-surface-audit.mjs': /baseShellAuditScope\(ALL_TANK_IDS,opt\('ids',''\)/,
  'tools/first-party-concept-check.mjs': /validateSelectedIds\(ids,ALL_TANK_IDS\)/,
  'tools/photo-reference-check.mjs': /validateSelectedIds\(ids,ALL_TANK_IDS\)/,
  'tools/procedural-fidelity.mjs': /if\(requested\)validateSelectedIds\(requested,/,
  'tools/tank-standard-check.mjs': /new Set\(ids\)\.size!==ids\.length\) throw new Error\('Expected unique tank IDs'\)/,
});
// A named carry, not a hole: circular-cap-audit is a module the two whole-fleet passes (fleetPassHigh, fleetPassLow,
// about 200 s each) import, so editing it re-runs both for a diagnostic CLI flag. Its --ids list takes uniqueIds with
// the file's next real change, and then this entry goes.
const CARRIED = Object.freeze({ 'tools/circular-cap-audit.mjs': /option\('ids', ''\)\.split\(','\)\.filter\(Boolean\)/ });
const readers = readdirSync('tools').filter((name) => name.endsWith('.mjs') && !/\.(selftest|test-support|fixture)\.mjs$/.test(name))
  .map((name) => `tools/${name}`).filter((path) => READS_IDS.test(readFileSync(path, 'utf8')));
assert.ok(readers.length >= 40, `the scan finds the fleet's --ids readers (${readers.length})`);
const unguarded = [];
for (const path of readers) {
  const source = readFileSync(path, 'utf8');
  if (CARRIED[path]) {
    if (/\buniqueIds\(/.test(source)) unguarded.push(`${path} (guarded now: drop its CARRIED entry)`);
    else if (!CARRIED[path].test(source)) unguarded.push(`${path} (its carried parse moved: wrap it in uniqueIds)`);
  } else if (DELEGATES[path]) {
    if (!DELEGATES[path].test(source)) unguarded.push(`${path} (its delegated check moved)`);
  } else if (!/^import \{\s*uniqueIds\s*\} from '\.\/id-list\.mjs';$/m.test(source) || !/\buniqueIds\(/.test(source)) {
    unguarded.push(path);
  }
}
assert.deepEqual(unguarded, [], 'every --ids reader refuses a duplicate: wrap the list in uniqueIds (tools/id-list.mjs)');
for (const path of [...Object.keys(DELEGATES), ...Object.keys(CARRIED)]) assert.ok(readers.includes(path), `${path} still reads an --ids list`);

// (4) real tools refuse at once, before the Vite server, the browser or a step. The list also holds an unknown id, so
// a regressed guard still stops at the tool's own unknown-id check instead of running a release or a capture.
const refusals = [
  ['tools/presentation-centering.mjs', '--check'],
  ['tools/fleet-geometry-ledger.mjs', '--check'],
  ['tools/tank-release-check.mjs'],
];
for (const [tool, ...flags] of refusals) {
  const run = spawnSync(process.execPath, [tool, ...flags, '--ids=leo2a7v,zz_not_a_tank,leo2a7v'], { encoding: 'utf8', timeout: 90_000 });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.notEqual(run.status, 0, `${tool}: a repeated id fails (status ${run.status}, signal ${run.signal})\n${output}`);
  assert.match(output, /leo2a7v 2 times|repeated: leo2a7v/, `${tool}: the refusal names the repeated id\n${output}`);
  assert.doesNotMatch(output, /\[tank-release\] stage|icons-page|scanning/, `${tool}: nothing starts before the refusal`);
}
// the tools that take the capture lock at startup refuse before it (hold 246 in 226 failed inside its hold)
for (const tool of ['tools/track-clip-audit.mjs', 'tools/turret-parent-audit.mjs']) {
  const source = readFileSync(tool, 'utf8');
  const guard = source.indexOf("uniqueIds(process.argv.find((a) => a.startsWith('--ids='))"), lock = source.indexOf('await acquireLock(');
  assert.ok(guard > 0 && lock > guard, `${tool}: the id guard runs before the capture lock`);
}
console.log(`id-list: duplicate ids fail loudly in ${readers.length - 1} of ${readers.length} fleet tools (${Object.keys(DELEGATES).length} through a delegated check; circular-cap-audit carried); ${refusals.length} real tools refuse before any server, browser or step`);
