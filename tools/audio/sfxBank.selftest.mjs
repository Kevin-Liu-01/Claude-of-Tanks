// Receipt (round 8 Y9 s1-11, 2026-11-08): a sound-effect bank rebuild is one transaction. build-sfx.mjs deleted an
// asset's shipped files before it mastered a single candidate and mastered each candidate straight to its final name,
// so a rebuild where no candidate passed the ear proxy (or the loudness floor), a pin that named no take, or a master or
// critic that threw left the bank deleted, its manifest entry and verdict of record gone, and the records of the assets
// committed before it written over files they no longer described. Now tools/audio/sfxBank.mjs commitBank stages and
// judges every candidate outside public/, swaps the bank in only when one ships, and otherwise refuses: the files,
// manifest[id] and the verdict of record stay as they were, a failed swap included, in either of its loops (moving the old
// files aside, review r3, or placing the new ones, review r2). A swap that does not finish (its undo or the records' write fails)
// leaves the old files in the stage's prev/, which the next run's sweep keeps and names (review r1), whatever the stage's
// pid, and a rebuild never removes a stage it did not create (review r2). Driven here on the real commitBank and
// sweepStages in a temp directory with an injected master, judge and rename (no ffmpeg, no ear proxy).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const bank = await import('./sfxBank.mjs');
const root = mkdtempSync(join(tmpdir(), 'cot-sfxbank-'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));
const dir = join(root, 'public', 'audio', 'sfx', 'weapons');
const stageRoot = join(root, '.qa-dev', 'sfx-stage');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const listing = () => readdirSync(dir).sort();
const read = (name) => readFileSync(join(dir, name), 'utf8');
const staged = () => (existsSync(stageRoot) ? readdirSync(stageRoot) : []);
const quiet = { warn: (line) => warnings.push(line), log() {}, error() {} };
let warnings = [];

const CANNON = { id: 'gun_x', group: 'weapons', critic: 'cannon' };
const RAW = [0, 1, 2, 3].map((take) => ({ take, file: join(root, 'cache', `raw${take}.pcm`) }));

/** A shipped cannon bank (3 variants unless `old` says), a neighbour whose id shares the prefix, and both records. */
function seed({ old = [0, 1, 2] } = {}) {
  rmSync(join(root, 'public'), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const i of old) writeFileSync(join(dir, `gun_x_${i}.webm`), `old-${i}`);
  writeFileSync(join(dir, 'gun_x_far_0.webm'), 'neighbour');
  const records = {
    manifest: { gun_x: { g: 'weapons', n: old.length, d: old.map(() => 1), c: 1, r: 48000, kb: old.length }, gun_x_far: { g: 'weapons', n: 1, d: [2], c: 1, r: 48000, kb: 1 } },
    verdicts: { gun_x: { class: 'cannon', variants: old.map((i) => ({ source: `raw${i}.pcm`, cutS: 1, sha256: sha(`old-${i}`), class: 'cannon', pass: true })) } },
  };
  return { records, before: structuredClone(records), files: listing().map((name) => [name, read(name)]) };
}

/** The injected master writes `new-<take>` where it is told and reports facts; the judge passes the takes named. */
function tools({ pass = [], throwAt = null, mMax = {} } = {}) {
  const judged = [];
  const mastered = [];
  return {
    judged,
    mastered,
    master(pick, outBase) {
      if (pick.take === throwAt) throw new Error(`ffmpeg failed on take ${pick.take}`);
      writeFileSync(`${outBase}.webm`, `new-${pick.take}`);
      mastered.push(outBase);
      return { dur: 1.5, ch: 1, loop: null, gainDb: 0, lufs: -14, mMax: mMax[pick.take] ?? -11, truePeak: -1, bytes: 2048, hf: 0.02, cutS: 1.2 };
    },
    judge(file) {
      judged.push(file);
      const take = Number(readFileSync(file, 'utf8').slice(4));
      const brief = { best: pass.includes(take) ? 'Artillery fire' : 'Gunshot, gunfire', bestScore: 0.4, against: 'Cap gun', againstScore: 0.1, top: 'Explosion' };
      return { class: 'cannon', pass: pass.includes(take), single: brief };
    },
  };
}

/** The bank as the run left it: every file of the seed byte for byte, both records deep-equal, the stage gone. */
function untouched(seeded, records, label) {
  assert.deepEqual(listing().map((name) => [name, read(name)]), seeded.files, `${label}: the shipped bank's files are kept byte for byte`);
  assert.deepEqual(records, seeded.before, `${label}: manifest[id] and the verdict of record are kept`);
  assert.deepEqual(staged(), [], `${label}: the stage directory is removed`);
}

const run = (seeded, opts) => {
  try {
    return bank.commitBank({ entry: CANNON, dir, want: 3, records: seeded.records, stageRoot, log: quiet, ...opts });
  } catch (error) {
    return { outcome: 'threw', error };
  }
};

// 1. the ear proxy refuses every file: refused, nothing touched
{
  const seeded = seed();
  const t = tools({ pass: [] });
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge });
  untouched(seeded, seeded.records, 'every candidate refused');
  assert.equal(result.outcome, 'refused', 'every candidate refused: the outcome is refused');
  assert.equal(t.judged.length, 4, 'every candidate is judged');
  for (const file of t.judged) assert.ok(file.startsWith(stageRoot), `judged in the stage, never at a final name (${file})`);
}

// 2. the master throws on the second candidate: refused, nothing touched, the stage removed
{
  const seeded = seed();
  const t = tools({ pass: [0, 1, 2, 3], throwAt: 1 });
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge });
  untouched(seeded, seeded.records, 'master throws on take 1');
  assert.equal(result.outcome, 'refused', 'a throw is refused, not a crash');
  assert.match(result.reason, /ffmpeg failed on take 1/, 'the refusal names the error');
}

// 3. a pin that names no take that exists: an empty chosen list is refused, nothing touched
{
  const seeded = seed();
  const t = tools({ pass: [0] });
  const result = run(seeded, { candidates: [], want: 0, master: t.master, judge: t.judge });
  untouched(seeded, seeded.records, 'empty chosen list');
  assert.equal(result.outcome, 'refused', 'an empty chosen list is refused');
}

// 4. replaced with fewer variants than the old bank: the stale index goes, n matches, every verdict binds its bytes
{
  const seeded = seed();
  const t = tools({ pass: [0, 2] });
  let persisted = null;
  warnings = [];
  const persist = () => { persisted = { files: listing().map((name) => [name, read(name)]), records: structuredClone(seeded.records) }; };
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, persist });
  assert.equal(result.outcome, 'replaced', 'two of four candidates pass: replaced');
  assert.deepEqual(listing(), ['gun_x_0.webm', 'gun_x_1.webm', 'gun_x_far_0.webm'], 'the stale index 2 is removed; the neighbour stays');
  assert.deepEqual([read('gun_x_0.webm'), read('gun_x_1.webm'), read('gun_x_far_0.webm')], ['new-0', 'new-2', 'neighbour'], 'index = shipped order');
  const { manifest, verdicts } = seeded.records;
  assert.equal(manifest.gun_x.n, 2, 'manifest n matches the files');
  assert.deepEqual(manifest.gun_x.d, [1.5, 1.5]);
  assert.deepEqual(manifest.gun_x_far, seeded.before.manifest.gun_x_far, 'the neighbour record stays');
  assert.deepEqual(verdicts.gun_x.variants.map((v) => v.sha256), [sha('new-0'), sha('new-2')], 'each verdict binds the shipped bytes');
  assert.deepEqual(verdicts.gun_x.variants.map((v) => v.source), ['raw0.pcm', 'raw2.pcm']);
  assert.ok(persisted, 'the records are persisted after the commit');
  assert.deepEqual(persisted.files.map(([name]) => name), listing(), 'persist runs once the bank is swapped in');
  // what persist writes (build-sfx writeRecords) is the new bank's records, never the old n, d or sha256 (review r1)
  assert.equal(persisted.records.manifest.gun_x.n, 2, 'at persist time manifest[id] already describes the new bank');
  assert.deepEqual(persisted.records.verdicts.gun_x.variants.map((v) => v.sha256), [sha('new-0'), sha('new-2')],
    'at persist time the verdict of record already binds the new bytes');
  assert.ok(warnings.some((line) => /gun_x: ships 2 of 3 variants/.test(line)), 'fewer variants than wanted is a warning');
  assert.deepEqual(staged(), [], 'the stage directory is removed');
}

// 5. the loudness floor drops a take; the next ranked take ships at its index
{
  const seeded = seed();
  const t = tools({ pass: [0, 1, 2, 3], mMax: { 0: -20 } });
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, floor: { target: -11, under: 7 } });
  assert.equal(result.outcome, 'replaced');
  assert.deepEqual(['gun_x_0.webm', 'gun_x_1.webm', 'gun_x_2.webm'].map(read), ['new-1', 'new-2', 'new-3'], 'take 0 under the floor: takes 1-3 ship at 0-2');
}

// 6. a bank without a critic class: every take file not committed goes (an older --aac run's .m4a too), no verdict
{
  const seeded = seed();
  writeFileSync(join(dir, 'gun_x_0.m4a'), 'old-aac');
  const t = tools();
  const result = run(seeded, { entry: { id: 'gun_x', group: 'weapons' }, want: 2, candidates: RAW, master: t.master, judge: () => assert.fail('no critic') });
  assert.equal(result.outcome, 'replaced');
  assert.deepEqual(listing(), ['gun_x_0.webm', 'gun_x_1.webm', 'gun_x_far_0.webm'], 'the old .m4a and index 2 are gone');
  assert.equal(seeded.records.verdicts.gun_x, undefined, 'a bank without a critic class keeps no verdict of record');
}

// 7. the swap itself fails half way: rolled back, refused, nothing touched
{
  const seeded = seed();
  const t = tools({ pass: [0, 1, 2, 3] });
  let calls = 0;
  const flaky = (from, to) => {
    if (from.startsWith(stageRoot) && to.startsWith(dir) && ++calls === 2) throw new Error('EIO on the second file');
    renameSync(from, to);
  };
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, rename: flaky });
  untouched(seeded, seeded.records, 'the swap fails on its second file');
  assert.equal(result.outcome, 'refused', 'a failed swap is rolled back and refused');
  assert.match(result.reason, /rolled back.*EIO/, 'the refusal says it rolled back');
}

// 7d. the swap fails after placing more files than the old bank had (review r2): the rollback removes every file it
// placed, so no new take is left in public/ beside records that still describe the one-file bank
{
  const seeded = seed({ old: [0] });
  const t = tools({ pass: [0, 1, 2, 3] });
  let calls = 0;
  const flaky = (from, to) => {
    if (from.startsWith(stageRoot) && to.startsWith(dir) && !from.includes('/prev/') && ++calls === 3) throw new Error('EIO on the third file');
    renameSync(from, to);
  };
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, rename: flaky });
  assert.equal(calls, 3, 'two new files were placed before the third failed');
  untouched(seeded, seeded.records, 'the swap fails on its third file over a one-file bank');
  assert.equal(result.outcome, 'refused', 'a failed swap over a smaller bank is rolled back and refused');
  assert.match(result.reason, /rolled back.*EIO on the third file/, 'the refusal says it rolled back');
}

// 7e. the swap's first loop fails (review r3): moving the old take files aside into prev/ fails on its second file (an
// injected EXDEV; a real stage on another volume fails on the first move, case 7f). That loop is inside the rollback, and
// the file already moved aside goes back, so the bank is whole and the stage (prev/ included) is removed with nothing of
// the bank in it
const exdev = (failAt) => {
  const state = { aside: 0 };
  state.rename = (from, to) => {
    if (from.startsWith(dir) && to.includes('/prev/') && ++state.aside === failAt) {
      throw Object.assign(new Error(`EXDEV: cross-device link not permitted, rename '${from}' -> '${to}'`), { code: 'EXDEV' });
    }
    renameSync(from, to);
  };
  return state;
};
{
  const seeded = seed();
  const t = tools({ pass: [0, 1, 2, 3] });
  const flaky = exdev(2);
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, rename: flaky.rename });
  assert.equal(flaky.aside, 2, 'one old file was moved aside before the second failed');
  untouched(seeded, seeded.records, 'the swap fails moving its second old file aside');
  assert.equal(result.outcome, 'refused', 'a swap that fails moving the old files aside is rolled back and refused');
  assert.match(result.reason, /rolled back.*EXDEV/, 'the refusal says it rolled back and names the EXDEV');
}

// 7f. the same EXDEV on the very first old file (decisions[1], risks[3]): nothing moved yet, still refused, not a throw
{
  const seeded = seed();
  const t = tools({ pass: [0, 1, 2, 3] });
  const flaky = exdev(1);
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, rename: flaky.rename });
  assert.equal(flaky.aside, 1, 'the first move aside failed');
  untouched(seeded, seeded.records, 'the swap fails moving its first old file aside');
  assert.equal(result.outcome, 'refused', 'an EXDEV on the first move aside is refused, not a crash');
  assert.match(result.reason, /rolled back.*EXDEV/, 'the refusal says it rolled back and names the EXDEV');
}

/** The stage a run of this process left, renamed as a killed run's (a pid that is gone), and what its prev/ holds. */
const asKilled = (id) => {
  const own = readdirSync(stageRoot).filter((name) => new RegExp(`^${id}-${process.pid}(-[A-Za-z0-9]{6})?$`).test(name));
  assert.equal(own.length, 1, 'the run keeps its one stage');
  assert.ok(existsSync(join(stageRoot, own[0], 'prev')), 'the run keeps its stage, prev/ included');
  const dead = join(stageRoot, `${id}-999998-k1LLed`);
  renameSync(join(stageRoot, own[0]), dead);
  return { dead, prev: () => readdirSync(join(dead, 'prev')).sort() };
};

// 7b. the swap fails and so does its undo (review r1): the old files' only copy is the stage's prev/, so the throw names
// it, the stage stays, and the next run's sweep keeps and names it instead of deleting it
{
  const seeded = seed();
  const t = tools({ pass: [0, 1, 2, 3] });
  let calls = 0;
  const broken = (from, to) => {
    if (from.startsWith(stageRoot) && to.startsWith(dir) && !from.includes('/prev/') && ++calls === 2) throw new Error('EIO on the second file');
    if (from.includes('/prev/')) throw new Error('EIO on the undo');
    renameSync(from, to);
  };
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, rename: broken });
  assert.equal(result.outcome, 'threw', 'a swap whose undo fails cannot be refused cleanly: it throws');
  assert.match(result.error.message, /the old files are in .*gun_x-\d+-\w{6}\/prev.*the next build-sfx run keeps/, 'the throw names prev/ and says it is kept');
  assert.deepEqual(seeded.records, seeded.before, 'the records are not replaced');
  const stage = asKilled('gun_x');
  assert.deepEqual(stage.prev(), ['gun_x_0.webm', 'gun_x_1.webm', 'gun_x_2.webm'], 'the old bank sits in prev/');
  assert.deepEqual(bank.sweepStages(stageRoot), { removed: [], kept: ['gun_x-999998-k1LLed'] }, 'the next run keeps the stage and names it');
  assert.deepEqual(stage.prev(), ['gun_x_0.webm', 'gun_x_1.webm', 'gun_x_2.webm'], 'and its old files');
  assert.equal(readFileSync(join(stage.dead, 'prev', 'gun_x_1.webm'), 'utf8'), 'old-1');
  rmSync(stage.dead, { recursive: true });
}

// 7c. persist throws after the swap (a full disk writing the records): the new bank is in, the throw names the stage
// whose prev/ holds the old files, and the stage stays for the sweep to keep and name
{
  const seeded = seed();
  const t = tools({ pass: [0, 1, 2, 3] });
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, persist: () => { throw new Error('ENOSPC writing the records'); } });
  assert.equal(result.outcome, 'threw', 'a failed persist throws');
  assert.match(result.error.message, /ENOSPC.*the old files are in .*gun_x-\d+-\w{6}\/prev.*the next build-sfx run keeps/, 'it names the stage it keeps');
  assert.deepEqual(['gun_x_0.webm', 'gun_x_1.webm', 'gun_x_2.webm'].map(read), ['new-0', 'new-1', 'new-2'], 'the new bank is in place');
  const stage = asKilled('gun_x');
  assert.deepEqual(bank.sweepStages(stageRoot), { removed: [], kept: ['gun_x-999998-k1LLed'] }, 'kept, never deleted');
  assert.deepEqual(stage.prev().map((name) => readFileSync(join(stage.dead, 'prev', name), 'utf8')), ['old-0', 'old-1', 'old-2'], 'the old bank is in prev/');
  rmSync(stage.dead, { recursive: true });
}

// 8. removeBank: an asset dropped from the catalog leaves the disk and both records; the neighbour stays
{
  const seeded = seed();
  bank.removeBank({ id: 'gun_x', dir, records: seeded.records });
  assert.deepEqual(listing(), ['gun_x_far_0.webm'], 'only the asset\'s own take files go');
  assert.equal(seeded.records.manifest.gun_x, undefined);
  assert.equal(seeded.records.verdicts.gun_x, undefined);
  assert.ok(seeded.records.manifest.gun_x_far, 'the neighbour record stays');
}

// 9. the declared machine: staging -> committing -> replaced, or -> refused from staging or committing; nothing else
assert.equal(typeof bank.bankMove, 'function', 'sfxBank.mjs declares its moves (bankMove)');
assert.deepEqual(Object.keys(bank.BANK_MOVES), ['staging', 'committing', 'replaced', 'refused']);
for (const [from, to] of [['staging', 'committing'], ['staging', 'refused'], ['committing', 'replaced'], ['committing', 'refused']]) {
  assert.equal(bank.bankMove(from, to), to, `${from} -> ${to}`);
}
for (const [from, to] of [['staging', 'replaced'], ['replaced', 'staging'], ['refused', 'committing'], ['replaced', 'refused'], ['refused', 'replaced'], ['nowhere', 'staging']]) {
  assert.throws(() => bank.bankMove(from, to), /no move/, `${from} -> ${to} is refused`);
}

// 10. a killed run's stage is swept by the next run (an empty prev/ too: no swap left files there); a live run's is not,
// nor a folder the sweep cannot name a run for
{
  mkdirSync(join(stageRoot, 'gun_q-999999-AAAAAA'), { recursive: true });
  mkdirSync(join(stageRoot, 'gun_r-999997-BBBBBB', 'prev'), { recursive: true });
  mkdirSync(join(stageRoot, `gun_q-${process.pid}-CCCCCC`), { recursive: true });
  mkdirSync(join(stageRoot, 'notes'), { recursive: true });
  assert.deepEqual(bank.sweepStages(stageRoot), { removed: ['gun_q-999999-AAAAAA', 'gun_r-999997-BBBBBB'], kept: [] }, 'the dead pids\' stages go');
  assert.deepEqual(staged().sort(), [`gun_q-${process.pid}-CCCCCC`, 'notes'], 'a live pid\'s stage stays, and a folder of no run');
  for (const name of staged()) rmSync(join(stageRoot, name), { recursive: true });
}

// 10b. pid reuse (review r2): a stage whose prev/ holds files is kept and named whatever its pid (a live process's, EPERM
// included, or this very process's), and a rebuild of that asset by a process with the same pid never removes it
{
  const held = ['gun_x-1', 'gun_x-1-AbC123', `gun_x-${process.pid}`, `gun_x-${process.pid}-dEf456`].sort();
  for (const name of held) {
    mkdirSync(join(stageRoot, name, 'prev'), { recursive: true });
    writeFileSync(join(stageRoot, name, 'prev', 'gun_x_0.webm'), `kept-${name}`);
  }
  const intact = (label) => {
    for (const name of held) {
      const file = join(stageRoot, name, 'prev', 'gun_x_0.webm');
      assert.ok(existsSync(file), `${label}: ${name}'s prev/ is kept`);
      assert.equal(readFileSync(file, 'utf8'), `kept-${name}`, `${label}: ${name}'s prev/ is kept byte for byte`);
    }
    assert.deepEqual(staged().sort(), held, `${label}: only its own stage goes`);
  };
  assert.deepEqual(bank.sweepStages(stageRoot), { removed: [], kept: held }, 'every stage holding an old bank is kept and named, whatever its pid');
  const t = tools({ pass: [0, 1, 2, 3] });
  assert.equal(run(seed(), { candidates: RAW, master: t.master, judge: t.judge }).outcome, 'replaced', 'a rebuild by the same pid commits');
  intact('a commit by the same pid');
  const used = [...new Set(t.mastered.map((outBase) => basename(dirname(outBase))))];
  assert.equal(used.length, 1, 'one stage per rebuild');
  assert.match(used[0], new RegExp(`^gun_x-${process.pid}-[A-Za-z0-9]{6}$`), 'the rebuild stages in a folder of its own');
  assert.ok(!held.includes(used[0]), 'never in a folder an earlier run left');
  assert.equal(run(seed(), { candidates: [], want: 0, master: t.master, judge: t.judge }).outcome, 'refused');
  intact('a refusal by the same pid');
  for (const name of held) rmSync(join(stageRoot, name), { recursive: true });
}

// 11. census: build-sfx.mjs moves no bank file itself, stages outside public/, and persists the records per commit
{
  const source = readFileSync(new URL('./build-sfx.mjs', import.meta.url), 'utf8');
  for (const call of ['rmSync(', 'renameSync(', 'readdirSync(', 'takeFileOf(']) {
    assert.ok(!source.includes(call), `build-sfx.mjs calls no ${call} (sfxBank.mjs owns the bank's files)`);
  }
  assert.match(source, /commitBank\(\{[\s\S]*?persist: writeRecords[\s\S]*?\}\)/, 'build-sfx.mjs persists the three records after each committed asset');
  assert.match(source, /stageRoot: STAGE/, 'build-sfx.mjs stages candidates');
  assert.match(source, /const STAGE = join\(ROOT, '\.qa-dev', 'sfx-stage'\)/, 'the stage is the ignored .qa-dev/sfx-stage, on the repo\'s volume, outside public/');
  assert.match(source, /= sweepStages\(STAGE\);/, 'build-sfx.mjs sweeps killed runs\' stages at start');
  assert.match(source, /for \(const name of stages\.kept\) console\.warn\(/, 'and names every stage it keeps');
  // commitBank makes its stage new (mkdtempSync, never a fixed name it first clears) and removes only that one (review r2)
  const own = readFileSync(new URL('./sfxBank.mjs', import.meta.url), 'utf8');
  assert.match(own, /const stage = mkdtempSync\(join\(stageRoot, `\$\{id\}-\$\{process\.pid\}-`\)\);/, 'commitBank stages in a new folder');
  assert.deepEqual(own.match(/rmSync\(stage\b/g), ['rmSync(stage'], 'and removes its stage in one place (its finally), never before it is made');
}

console.log('sfxBank.selftest: a refused, thrown or empty rebuild keeps the shipped bank and its records, a failed swap rolls back every file it placed and every old file it moved aside; a commit stages in a new folder, swaps, drops stale indices and persists the new records; the stage of an unfinished swap is kept and named whatever its pid, and no rebuild removes it; moves declared');
