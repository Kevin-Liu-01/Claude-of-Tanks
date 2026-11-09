// Receipt (round 8 Y9 s1-11, 2026-11-08): a sound-effect bank rebuild is one transaction. build-sfx.mjs deleted an
// asset's shipped files before it mastered a single candidate and mastered each candidate straight to its final name,
// so a rebuild where no candidate passed the ear proxy (or the loudness floor), a pin that named no take, or a master or
// critic that threw left the bank deleted, its manifest entry and verdict of record gone, and the records of the assets
// committed before it written over files they no longer described. Now tools/audio/sfxBank.mjs commitBank stages and
// judges every candidate outside public/, swaps the bank in only when one ships, and otherwise refuses: the files,
// manifest[id] and the verdict of record stay as they were. Driven here on the real commitBank in a temp directory with
// an injected master and judge (no ffmpeg, no ear proxy).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/** A shipped 3-variant cannon bank, a neighbour whose id shares the prefix, and both records. */
function seed() {
  rmSync(join(root, 'public'), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const i of [0, 1, 2]) writeFileSync(join(dir, `gun_x_${i}.webm`), `old-${i}`);
  writeFileSync(join(dir, 'gun_x_far_0.webm'), 'neighbour');
  const records = {
    manifest: { gun_x: { g: 'weapons', n: 3, d: [1, 1, 1], c: 1, r: 48000, kb: 3 }, gun_x_far: { g: 'weapons', n: 1, d: [2], c: 1, r: 48000, kb: 1 } },
    verdicts: { gun_x: { class: 'cannon', variants: [0, 1, 2].map((i) => ({ source: `raw${i}.pcm`, cutS: 1, sha256: sha(`old-${i}`), class: 'cannon', pass: true })) } },
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
  const result = run(seeded, { candidates: RAW, master: t.master, judge: t.judge, persist: () => { persisted = listing().map((name) => [name, read(name)]); } });
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
  assert.deepEqual(persisted.map(([name]) => name), listing(), 'persist runs once the bank is swapped in');
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

// 10. a killed run's stage is swept by the next run; a live run's is not
{
  mkdirSync(join(stageRoot, 'gun_q-999999'), { recursive: true });
  mkdirSync(join(stageRoot, `gun_q-${process.pid}`), { recursive: true });
  assert.deepEqual(bank.sweepStages(stageRoot), ['gun_q-999999'], 'the dead pid\'s stage goes');
  assert.deepEqual(staged(), [`gun_q-${process.pid}`], 'a live pid\'s stage stays');
  rmSync(join(stageRoot, `gun_q-${process.pid}`), { recursive: true });
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
}

console.log('sfxBank.selftest: a refused, thrown or empty rebuild keeps the shipped bank and its records; a commit stages, swaps, drops stale indices and persists; moves declared');
