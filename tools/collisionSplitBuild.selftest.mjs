// The capture tool's split build (tools/collisionSplitBuild.mjs; speed, 2026-10-13) gives the serial run's verdict, and
// a child that fails is never read as a drift. Stub children stand in for the tool's (no world is built): each prints
// the child protocol for its share as a scenario says, then exits.
//   - a sound split prints every map's lines in map order (one preamble) and exits 0, or 1 with the drifted maps;
//   - a child that exits 1 after printing every one of its maps' lines (an uncaught error in its summary, say) fails the
//     run with 2 — the serial run exits 1 there, and the old aggregator, which read any exit 1 as drift, exited 0;
//   - so does a child that exits 0 without its job-done line, one whose job-done disagrees with its lines, one that
//     drops a map or writes an unreadable protocol line, a regeneration child that reports no index entry, and one killed
//     by a signal;
//   - every split says so on stderr; the receipts that must build serially (phoneLayoutIdentity, the drift receipt)
//     pass --jobs=1 and assert that line's absence.
// 2026-10-14 (the second coverage check's counterexamples, each of which this receipt now fails on the code it found):
//   - nothing splits unless --jobs=N asks: a bare --check (the landing chains' command), --node, --tier=mobile and
//     --variant build serially, every map after every earlier map in one process, the one build that sees state a map's
//     build leaves for a later one (the f20e0796b default split hid an injected western1944 cache leak, polders into
//     reservoir); the tool decides only through collisionBuildMode;
//   - the child marker binds a child to its parent's pid: a hand-set or inherited COT_COLLISION_JOB (it used to turn a
//     drifted check into exit 0 with no summary, and skip a regeneration's index) is refused with exit 2 by the real
//     tool, and a child deletes the marker so nothing it starts inherits it;
//   - a split's children never outlive their parent: whatever signal ends the parent (SIGHUP, SIGTERM, SIGINT, the
//     house-rule perl alarm's SIGALRM, an uncatchable SIGKILL), the parent dies of that signal as the serial run does
//     (SIGHUP used to exit 143) and every child is gone within seconds, even one busy in a long synchronous build (they
//     used to run on with PPID 1 and rewrite shards after the time limit), while a live parent's children keep writing.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collisionBuildMode, collisionJobArgs, collisionJobDoneLine, collisionJobShares, runCollisionSplitBuild,
} from './collisionSplitBuild.mjs';
import { collisionCaptureOptions } from './worldCollisionManifestFiles.mjs';

assert.deepEqual(collisionJobShares(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'c', 'e'], ['b', 'd']], 'round-robin shares');
assert.deepEqual(collisionJobShares(['a', 'b'], 4), [['a'], ['b']], 'no empty share');
assert.deepEqual(collisionJobShares(['a', 'b', 'c'], 1), [['a', 'b', 'c']]);
assert.deepEqual(collisionJobArgs(['--check', '--maps', 'a,b', '--jobs=3', '--tier=mobile']), ['--check', '--tier=mobile']);
assert.deepEqual(collisionJobArgs(['--node', '--maps=a,b', '--variant=assault-trenches']), ['--node', '--variant=assault-trenches']);
assert.equal(collisionJobDoneLine(['a', 'c'], ['c']), 'job-done {"maps":["a","c"],"drifted":["c"]}');

// nothing splits unless asked: every bare command builds serially; --jobs=N splits only a Node build of two maps or more
const mode = (args, env = {}, ppid = 4242) => collisionBuildMode(collisionCaptureOptions(args), { env, ppid });
for (const args of [['--check'], ['--node'], ['--tier=mobile'], ['--variant=assault-trenches'], ['--check', '--variant=assault-trenches'],
  ['--check', '--jobs=1'], ['--node', '--maps', 'desert,whiteout'], ['--check', '--jobs=4', '--maps', 'desert'], ['--headless'], ['owned-session']]) {
  assert.deepEqual(mode(args), { mode: 'serial', jobs: 1 }, `${args.join(' ')} builds every map after the one before it in one process`);
}
assert.deepEqual(mode(['--check', '--jobs=4']), { mode: 'split', jobs: 4 });
assert.deepEqual(mode(['--node', '--jobs=2', '--maps', 'desert,whiteout']), { mode: 'split', jobs: 2 });
assert.deepEqual(mode(['--tier=mobile', '--jobs=3']), { mode: 'split', jobs: 3 });
// the child marker holds the parent's pid; any other value (inherited, hand-set, a parent that died first) is refused
assert.deepEqual(mode(['--check', '--maps', 'desert'], { COT_COLLISION_JOB: '4242' }), { mode: 'child', parent: 4242 });
assert.deepEqual(mode(['--node', '--jobs=4'], { COT_COLLISION_JOB: '4242' }), { mode: 'child', parent: 4242 }, 'a child never splits again');
for (const [args, marker] of [[['--check', '--maps', 'moon'], '1'], [['--check'], '4243'], [['--node'], ''], [['--headless'], '4242']]) {
  assert.throws(() => mode(args, { COT_COLLISION_JOB: marker }), /marks a split build's child, but this process's parent is 4242/,
    `COT_COLLISION_JOB=${marker} with ${args.join(' ')} is refused`);
}
// the real tool decides only through collisionBuildMode (no default split of its own, no other reading of the marker, no
// signal handler) and refuses a marker its parent did not set before it builds anything: exit 2, never a quiet exit 0
const tool = fileURLToPath(new URL('./capture-world-collision-manifests.mjs', import.meta.url));
const toolSource = readFileSync(new URL('./capture-world-collision-manifests.mjs', import.meta.url), 'utf8');
assert.match(toolSource, /collisionBuildMode\(options\)/);
assert.doesNotMatch(toolSource, /availableParallelism|COT_COLLISION_JOB|process\.(?:once|on)\(\s*['"]SIG/,
  'the tool splits, reads the child marker and meets signals only as tools/collisionSplitBuild.mjs does');
const handSet = spawnSync(process.execPath, [tool, '--check', '--maps', 'moon'],
  { encoding: 'utf8', timeout: 120_000, env: { ...process.env, COT_COLLISION_JOB: '1' } });
assert.equal(handSet.status, 2, `a hand-set child marker exits 2 (it exited ${handSet.status ?? handSet.signal}): ${handSet.stderr}`);
assert.match(handSet.stderr, /COT_COLLISION_JOB=1 marks a split build's child, but this process's parent is \d+/);
assert.equal(handSet.stdout, '', 'nothing was built or reported');

// The stub child: its share comes in --maps as the tool's does; STUB_SCENARIO says what each map does.
// It arms itself as the tool's children do (the marker check, the watchdog and the check before each write are the real
// ones); `hang` and `busy` children write their pid to s.pids and then append to a file while their parent lives, or spin
// in a minute-long synchronous loop (a world build's busy main thread) before a guarded write.
const directory = mkdtempSync(join(tmpdir(), 'cot-collision-split-'));
/** The orphan cases' processes not yet seen to end: on any exit of this receipt (a failed assertion too) they are killed. */
const started = new Set();
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
process.on('exit', () => {
  for (const pid of started) if (alive(pid)) process.kill(pid, 'SIGKILL');
  rmSync(directory, { recursive: true, force: true });
});
const stub = join(directory, 'stub-child.mjs');
const splitModule = new URL('./collisionSplitBuild.mjs', import.meta.url).href;
writeFileSync(stub, `
import { appendFileSync, writeFileSync } from 'node:fs';
import { armCollisionJobChild, collisionBuildMode } from ${JSON.stringify(splitModule)};
const argv = process.argv.slice(2);
const share = argv[argv.indexOf('--maps') + 1].split(',');
const regen = !argv.includes('--check');
const s = JSON.parse(process.env.STUB_SCENARIO);
const on = (key) => share.some((map) => (s[key] ?? []).includes(map));
const build = collisionBuildMode({ node: true, mapIds: share });
if (build.mode !== 'child') { console.error('not a job child'); process.exit(3); }
const whileParentLives = armCollisionJobChild(build.parent);
console.error('marker after arming: ' + (process.env.COT_COLLISION_JOB ?? 'unset'));
if (on('killSelf')) process.kill(process.pid, 'SIGKILL');
if (on('hang') || on('busy')) {
  console.log('job-map ' + share[0]);
  writeFileSync(s.pids + '/' + process.pid, '');
  if (on('hang')) setInterval(() => { whileParentLives(); appendFileSync(s.pids + '/' + process.pid + '.writes', 'x'); }, 50);
  else {
    for (const end = Date.now() + 60_000; Date.now() < end;);
    whileParentLives();
    writeFileSync(s.pids + '/' + process.pid + '.after-busy', 'written after a minute of synchronous work');
  }
} else {
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
if (on('garbledDone')) console.log('job-done {"maps": [');
else if (!on('noDone')) {
  const told = on('hideDrift') ? [] : on('claimDrift') ? [share[0]] : drifted;
  console.log('job-done ' + JSON.stringify({ maps: share, drifted: told }));
}
process.exit(on('exitAfterDone') ? 1 : 0);
}
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
assert.equal(clean.err.match(/marker after arming: unset/g)?.length, 3, 'each child deleted its marker (nothing it starts inherits it)');
assert.match(clean.err, /no map is built after the maps of the other shares, so state one build leaves for a later one goes unchecked/);

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
  ['an unreadable job-done line', { garbledDone: ['desert'] }, /collision job desert,coastal wrote an unreadable protocol line/],
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
// a split's children never outlive their parent: a harness process runs a split of two hanging (or busy) stub children,
// the receipt sends the parent a signal once both children are up, and the parent must die of that very signal (the
// serial run's status) and both children must be gone soon after; the cases run side by side
const harness = join(directory, 'harness.mjs');
writeFileSync(harness, `
import { armCollisionJobChild, runCollisionSplitBuild } from ${JSON.stringify(splitModule)};
armCollisionJobChild(process.ppid); // it dies with this receipt, as the tool's children die with it
const maps = process.argv[3].split(',');
await runCollisionSplitBuild({ tool: process.argv[2], argv: ['--check', '--maps', process.argv[3]], mapIds: maps, jobs: maps.length,
  check: true, execArgv: [], env: { STUB_SCENARIO: process.env.STUB_SCENARIO }, log() {}, error() {}, stderr() {} });
console.log('the split ended on its own (its children were meant to hang)');
`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function orphanCase(signal, kind) {
  const pids = join(directory, `${kind}-${signal}`);
  mkdirSync(pids);
  const maps = ['alpha', 'beta'];
  const parent = spawn(process.execPath, [harness, stub, maps.join(',')], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, STUB_SCENARIO: JSON.stringify({ [kind]: maps, pids }) },
  });
  started.add(parent.pid);
  let out = '';
  parent.stdout.on('data', (chunk) => { out += chunk; });
  parent.stderr.on('data', (chunk) => { out += chunk; });
  const ended = new Promise((resolve) => parent.on('close', (code, by) => { started.delete(parent.pid); resolve({ code, by }); }));
  const children = () => readdirSync(pids).filter((name) => /^\d+$/.test(name)).map(Number);
  for (const start = Date.now(); children().length < maps.length; await pause(50)) {
    assert.ok(Date.now() - start < 60_000, `${kind}/${signal}: both children started (${out})`);
  }
  const stubs = children();
  for (const pid of stubs) started.add(pid);
  if (kind === 'hang') {
    // a live parent's children pass their check and keep writing
    for (const start = Date.now(); !stubs.every((pid) => existsSync(join(pids, `${pid}.writes`))); await pause(50)) {
      assert.ok(Date.now() - start < 60_000, `${kind}/${signal}: a child of a live parent writes`);
    }
  }
  parent.kill(signal);
  const { code, by } = await ended;
  assert.equal(by, signal, `${kind}/${signal}: the split's parent died of ${signal} as the serial run does (it ended with ${code ?? by}: ${out})`);
  const died = Date.now();
  while (stubs.some(alive) && Date.now() - died < 20_000) await pause(50);
  const gone = Date.now() - died;
  assert.deepEqual(stubs.filter(alive), [], `${kind}/${signal}: every child is gone after its parent died (they ran on as orphans)`);
  for (const pid of stubs) started.delete(pid);
  if (kind === 'hang') {
    const sizes = stubs.map((pid) => statSync(join(pids, `${pid}.writes`)).size);
    await pause(300);
    assert.deepEqual(stubs.map((pid) => statSync(join(pids, `${pid}.writes`)).size), sizes, `${kind}/${signal}: no write after the children are gone`);
  } else {
    assert.ok(stubs.every((pid) => !existsSync(join(pids, `${pid}.after-busy`))), `${kind}/${signal}: a busy child never reached its write`);
  }
  return `${kind} ${signal}: children gone ${gone} ms after it`;
}
const orphans = await Promise.all([
  orphanCase('SIGHUP', 'hang'), orphanCase('SIGTERM', 'hang'), orphanCase('SIGINT', 'hang'),
  orphanCase('SIGALRM', 'busy'), orphanCase('SIGKILL', 'busy'), orphanCase('SIGALRM', 'hang'),
]);
console.log(`collisionSplitBuild.selftest: nothing splits without --jobs; a child marker its parent did not set exits 2; the split build prints the serial order, exits 1 only on a reported drift and 2 on any unsound child (exit 1 after its lines, no job-done, a disagreeing job-done, a dropped map or entry, a signal); a parent killed by SIGHUP, SIGTERM, SIGINT, SIGALRM or SIGKILL dies of it and takes its children (${orphans.join(', ')}) PASS`);
