// Spare-track ledger keys (2026-10-18, release 228): a run's ledger key never holds a source line number. The receipt
// used to key a run by `fn@file:line`; --update keeps a row whose geometry is unchanged while --gate measures afresh, so
// after an unrelated edit above fv510's spareTrackLinks call (uk.ts) --update could never write a row --gate accepted.
// Part 1 (pure): unrelated line shifts keep every key; distinct calls in one stage stay apart (content hash); keys are a
// fixed point. Part 2 (the receipt itself, on a cloned source tree whose uk.ts lines are shifted): --gate passes fv510
// against the committed row and names a drifted key; --update re-measures the drifted row; --gate then round-trips green.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerSiteKeys } from './spare-track-digest.mjs';

// ---------------------------------------------------------------- part 1: keys on a synthetic source
const SRC = [
  'function stageA() {',                                                    // 1
  '  const a = FITTINGS.spareTrackLinks({ mats: P.mats, seed: 6 });',      // 2
  '}',                                                                      // 3
  'function stageC() {',                                                    // 4
  '  const l = FITTINGS.spareTrackLinks({ seed: 1 });',                    // 5
  '  const r = FITTINGS.spareTrackLinks({ seed: 2 });',                    // 6
  '  P.add(FITTINGS.spareTrackLinks({',                                    // 7
  '  P.add(FITTINGS.spareTrackLinks({',                                    // 8
  '}',                                                                      // 9
];
const SHIFT = 5;
const shifted = [...Array.from({ length: SHIFT }, (_, i) => `// an unrelated edit ${i}`), ...SRC];
const linesOf = (L) => (f) => (f === 'profiles/x.ts' ? L : []);
const row = (d) => [
  `fitting:spareTrackLinks@stageA@profiles/x.ts:${2 + d}`,
  `fitting:spareTrackLinks@stageC@profiles/x.ts:${5 + d}`,
  `fitting:spareTrackLinks@stageC@profiles/x.ts:${6 + d}`,
  `fitting:spareTrackLinks@stageC@profiles/x.ts:${7 + d}`,
  `fitting:spareTrackLinks@stageC@profiles/x.ts:${8 + d}`,
  `strip:strip@helper [as addEquipment]@profiles/x.ts:${3 + d}`,
  `strip:strip@helper [as addEquipment]@profiles/x.ts:${3 + d}`,
  `adhoc:hullTrack@<anon>@profiles/x.ts:${2 + d}+<anon>@profiles/x.ts:${3 + d}`,
  'decor:tracks#27',
];
const keys = ledgerSiteKeys(row(0), linesOf(SRC));
assert.deepEqual(ledgerSiteKeys(row(SHIFT), linesOf(shifted)), keys, 'an unrelated line shift keeps every key');
assert.ok(keys.every((k) => !/\.ts:\d/.test(k)), `no key holds a line number: ${keys.join(' | ')}`);
assert.equal(keys[0], 'fitting:spareTrackLinks@stageA@profiles/x.ts', 'a lone call is keyed by its stage and file');
assert.equal(new Set(keys.slice(1, 5)).size, 4, 'four distinct calls in one stage keep four keys (two of identical text)');
assert.ok(keys.slice(1, 5).every((k) => /@profiles\/x\.ts~[0-9a-f]{8}$/.test(k)), 'each carries its call hash');
assert.equal(keys[5], keys[6], 'runs from one call (a helper called twice) share their key');
assert.equal(keys[5], 'strip:strip@helper [as addEquipment]@profiles/x.ts', 'and need no hash');
assert.equal(keys[7], 'adhoc:hullTrack@<anon>@profiles/x.ts+<anon>@profiles/x.ts', 'every site of a joined name loses its line');
assert.equal(keys[8], 'decor:tracks#27', 'a name without a site is its own key');
assert.deepEqual(ledgerSiteKeys(keys, linesOf([])), keys, 'keys are a fixed point (the --rekey migration is idempotent)');
// the fv510 case: a row recorded at the old line and a fresh measurement at the new line agree
assert.deepEqual(ledgerSiteKeys(['fitting:spareTrackLinks@fv510PhotoBuild@profiles/uk.ts:3334'], linesOf([])),
  ledgerSiteKeys(['fitting:spareTrackLinks@fv510PhotoBuild@profiles/uk.ts:3330'], linesOf([])), 'a stale line keys alike');
console.log('spare-track-key.selftest: keys hold no line number and survive a line shift');

// ---------------------------------------------------------------- part 2: the receipt on a line-shifted tree
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = path.join(ROOT, 'docs/geometry-gate/spare-track.json');
const committed = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const IDS = ['fv510', 'fv510_milan'];
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'spare-track-key-'));
try {
  fs.cpSync(path.join(ROOT, 'src'), path.join(T, 'src'), { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(T, 'package.json'));
  fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'node_modules')), path.join(T, 'node_modules'));
  const uk = path.join(T, 'src/vehicles/profiles/uk.ts');
  const CALL = 'FITTINGS.spareTrackLinks({ mats: P.mats, seed: 6, rotation: [0.539, 0, 0] })';
  const before = fs.readFileSync(uk, 'utf8');
  assert.ok(before.includes(CALL), 'fv510 authors its carrier links with this call');
  fs.writeFileSync(uk, `${Array.from({ length: 7 }, (_, i) => `// an unrelated edit ${i}\n`).join('')}${before}`);

  // a ledger of the committed rows; fv510_milan's key drifts (its stage renamed, its geometry unchanged)
  const L = path.join(T, 'ledger.json');
  const rows = Object.fromEntries(IDS.map((id) => [id, structuredClone(committed.rows[id])]));
  const DRIFT = 'fitting:spareTrackLinks@renamedStage@profiles/uk.ts';
  rows.fv510_milan.runs[0].site = DRIFT;
  fs.writeFileSync(L, JSON.stringify({ ...committed, rows }, null, 1) + '\n');
  const receipt = (mode, ...extra) => {
    const out = path.join(T, `${mode}.json`);
    const r = spawnSync(process.execPath, ['--max-old-space-size=4096', path.join(ROOT, 'tools/spare-track-placement-check.mjs'),
      `--wt=${T}`, `--ids=${IDS.join(',')}`, `--ledger=${L}`, `--${mode}`, `--json=${out}`, ...extra],
    { encoding: 'utf8', timeout: 900000 });
    assert.ok(fs.existsSync(out), `the ${mode} run reports\n${r.stdout}${r.stderr}`);
    return { ...r, problems: JSON.parse(fs.readFileSync(out, 'utf8')).problems };
  };

  const g1 = receipt('gate', '--quiet');
  assert.deepEqual(g1.problems, ['fv510_milan: a fresh measurement differs from its ledger row'],
    `the shifted tree passes fv510's committed row; only the drifted key differs\n${g1.stdout}`);
  assert.notEqual(g1.status, 0, 'and the gate fails on it');

  const u = receipt('update');
  assert.equal(u.status, 0, `--update runs clean\n${u.stdout}${u.stderr}`);
  assert.match(u.stdout, /^fv510\tunchanged/m, 'a row whose geometry and keys are current is kept');
  assert.doesNotMatch(u.stdout, /^fv510_milan\tunchanged/m, 'a row whose key drifted is measured again');
  const next = JSON.parse(fs.readFileSync(L, 'utf8')).rows;
  for (const id of IDS) {
    assert.equal(next[id].inputHash, committed.rows[id].inputHash, `${id}: the same geometry`);
    assert.deepEqual(next[id].runs.map((r) => `${r.site}|${r.classes}`), committed.rows[id].runs.map((r) => `${r.site}|${r.classes}`),
      `${id}: --update writes the committed key on a line-shifted tree`);
  }

  const g2 = receipt('gate', '--quiet');
  assert.deepEqual(g2.problems, [], `--update then --gate round-trips green\n${g2.stdout}`);
  assert.equal(g2.status, 0, 'and the gate exits 0');
  console.log(`spare-track-key.selftest: ${IDS.join(', ')} gate green on a line-shifted tree; --update then --gate round-trips`);
} finally {
  fs.rmSync(T, { recursive: true, force: true });
}
