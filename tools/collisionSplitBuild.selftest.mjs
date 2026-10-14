// The capture tool's split build (tools/collisionSplitBuild.mjs; speed, 2026-10-13) gives the serial run's verdict, and
// a child that fails is never read as a drift. Stub children stand in for the tool's (no world is built): each prints
// the child protocol for its share as a scenario says, then exits.
//   - a sound split prints every map's lines in map order (one preamble) and exits 0, or 1 with the drifted maps;
//   - a child that exits 1 after printing every one of its maps' lines (an uncaught error in its summary, say) fails the
//     run with 2 — the serial run exits 1 there, and the old aggregator, which read any exit 1 as drift, exited 0;
//   - so does a child that exits 0 without its job-done line, one whose job-done disagrees with its lines, one that
//     drops a map, a regeneration child that reports no index entry, and one killed by a signal;
//   - every split says so on stderr; the receipts that must build serially (phoneLayoutIdentity, the drift receipt)
//     pass --jobs=1 and assert that line's absence.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collisionJobArgs, collisionJobDoneLine, collisionJobShares, runCollisionSplitBuild } from './collisionSplitBuild.mjs';

assert.deepEqual(collisionJobShares(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'c', 'e'], ['b', 'd']], 'round-robin shares');
assert.deepEqual(collisionJobShares(['a', 'b'], 4), [['a'], ['b']], 'no empty share');
assert.deepEqual(collisionJobShares(['a', 'b', 'c'], 1), [['a', 'b', 'c']]);
assert.deepEqual(collisionJobArgs(['--check', '--maps', 'a,b', '--jobs=3', '--tier=mobile']), ['--check', '--tier=mobile']);
assert.deepEqual(collisionJobArgs(['--node', '--maps=a,b', '--variant=assault-trenches']), ['--node', '--variant=assault-trenches']);
assert.equal(collisionJobDoneLine(['a', 'c'], ['c']), 'job-done {"maps":["a","c"],"drifted":["c"]}');

// The stub child: its share comes in --maps as the tool's does; STUB_SCENARIO says what each map does.
const directory = mkdtempSync(join(tmpdir(), 'cot-collision-split-'));
const stub = join(directory, 'stub-child.mjs');
writeFileSync(stub, `
const argv = process.argv.slice(2);
const share = argv[argv.indexOf('--maps') + 1].split(',');
const regen = !argv.includes('--check');
const s = JSON.parse(process.env.STUB_SCENARIO);
const on = (key) => share.some((map) => (s[key] ?? []).includes(map));
if (process.env.COT_COLLISION_JOB !== '1') { console.error('not a job child'); process.exit(3); }
if (on('killSelf')) process.kill(process.pid, 'SIGKILL');
console.log('building at the stub tier');
const drifted = [];
for (const map of share) {
  console.log('job-map ' + map);
  console.log('drawn-shape ' + map + ': 1 walked');
  if ((s.skip ?? []).includes(map)) continue;
  if (regen) {
    console.log(map + ': 1 obstacles, 0 colliders, 0 concealers');
    if (!(s.noEntry ?? []).includes(map)) console.log('job-entry ' + map + ' ' + JSON.stringify({ sha256: map, bytes: 1 }));
  } else if ((s.drift ?? []).includes(map)) { drifted.push(map); console.log(map + ': DRIFTED (obstacles 1 committed, 2 in the tree)'); }
  else console.log(map + ': current');
}
console.error('stderr of ' + share.join(','));
if (on('exitBeforeDone')) { console.error('Error: thrown after the last map'); process.exit(1); }
if (!on('noDone')) {
  const told = on('hideDrift') ? [] : on('claimDrift') ? [share[0]] : drifted;
  console.log('job-done ' + JSON.stringify({ maps: share, drifted: told }));
}
process.exit(on('exitAfterDone') ? 1 : 0);
`);

const MAPS = ['verdant', 'desert', 'winter', 'urban', 'coastal'];
async function split(scenario, { check = true, jobs = 3, maps = MAPS } = {}) {
  const out = [], err = [];
  const verdict = await runCollisionSplitBuild({
    tool: stub, argv: [check ? '--check' : '--node', '--maps', maps.join(','), `--jobs=${jobs}`], mapIds: maps, jobs, check,
    execArgv: [], env: { STUB_SCENARIO: JSON.stringify(scenario) },
    log: (line) => out.push(line), error: (line) => err.push(line), stderr: (text) => err.push(text),
  });
  return { ...verdict, out, err: err.join('\n') };
}

// a sound check: the serial run's stdout, in map order, with one preamble; the split note on stderr
const clean = await split({});
assert.equal(clean.code, 0);
assert.deepEqual(clean.drifted, []);
assert.deepEqual(clean.out, ['building at the stub tier', ...MAPS.flatMap((map) => [`drawn-shape ${map}: 1 walked`, `${map}: current`])],
  'the parent prints every map\'s lines in map order, as the serial run does');
assert.match(clean.err, /^5 maps split over 3 jobs/m, 'every split says so on stderr');
assert.match(clean.err, /stderr of verdant,urban/, 'a sound run passes its children\'s stderr through');

// drift is what a child reports, and only that
const drift = await split({ drift: ['winter'] });
assert.equal(drift.code, 1, 'a reported drift exits 1');
assert.deepEqual(drift.drifted, ['winter']);
assert.ok(drift.out.includes('winter: DRIFTED (obstacles 1 committed, 2 in the tree)'));

// (the coverage check's finding) a child exiting 1 after printing all its maps' lines is a failure, never a drift
for (const [name, scenario, reason] of [
  ['exit 1 after the last map, all current', { exitBeforeDone: ['desert'] }, /collision job desert,coastal exited 1; closed without its job-done line[\s\S]*thrown after the last map/],
  ['exit 1 after the last map, with drift', { exitBeforeDone: ['desert'], drift: ['desert'] }, /collision job desert,coastal exited 1/],
  ['exit 1 after its job-done line', { exitAfterDone: ['desert'] }, /collision job desert,coastal exited 1/],
  ['exit 0 without its job-done line', { noDone: ['desert'] }, /collision job desert,coastal closed without its job-done line/],
  ['a drift its job-done hides', { drift: ['desert'], hideDrift: ['desert'] }, /reported drift \[\] where its lines show \["desert"\]/],
  ['a drift its lines do not show', { claimDrift: ['desert'] }, /reported drift \["desert"\] where its lines show \[\]/],
  ['a map without its result line', { skip: ['coastal'] }, /no result for coastal/],
  ['killed by a signal', { killSelf: ['desert'] }, /collision job desert,coastal exited SIGKILL/],
]) {
  const run = await split(scenario);
  assert.equal(run.code, 2, `${name}: exit 2`);
  assert.match(run.err, reason, `${name}: the failed child and why`);
}

// a regeneration needs every map's index entry; the entries come back for the tool to publish
const regen = await split({}, { check: false });
assert.equal(regen.code, 0);
assert.deepEqual([...regen.entries.keys()].sort(), [...MAPS].sort());
assert.deepEqual(regen.entries.get('urban'), { sha256: 'urban', bytes: 1 });
const lost = await split({ noEntry: ['urban'] }, { check: false });
assert.equal(lost.code, 2, 'a regeneration child without an index entry fails the run (no index is published)');
assert.match(lost.err, /no result for urban/);
rmSync(directory, { recursive: true, force: true });
console.log('collisionSplitBuild.selftest: the split build prints the serial order, exits 1 only on a reported drift and 2 on any unsound child (exit 1 after its lines, no job-done, a disagreeing job-done, a dropped map or entry, a signal) PASS');
