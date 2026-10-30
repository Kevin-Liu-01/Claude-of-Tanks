// tank-assets-layout.selftest.mjs — the tank asset manifest stays split, small and byte-exact (266). First-party
// tooling: Kevin B. Liu.
//
// The manifest was one 51.5 MB file every tank lane edited; it is now public/icons/tank-assets/index.json plus one
// tanks/<id>.json per tank (tools/tank-assets-store.mjs). This receipt holds, on this checkout:
// - the layout: every file under TANK_ASSET_FILE_CAP_BYTES (5 MB; GitHub warns at 50 MB and refuses 100 MB), in its
//   canonical text, a row named for its id, no stray file, and no pre-266 single file;
// - the id order: one pinned comparator for writing and reassembly, not the ICU locale;
// - the byte-exact reassembly: the rows joined into the old single file and split again give every file back byte for
//   byte, and the join of that is the same text.
// Negative controls on fixtures prove each check fails and names the file: a row over the cap, a non-canonical row,
// a misnamed row, a stray file and the legacy single file.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  TANK_ASSET_FILE_CAP_BYTES, compareTankIds, readTankAssets, tankAssetIds, tankAssetIndexPath, tankAssetRowPath,
  tankAssetsDir, tankAssetsLayoutProblems, tankAssetsMonolithText, writeTankAssets,
} from './tank-assets-store.mjs';

const ICONS = resolve(import.meta.dirname, '../public/icons');
const scratch = mkdtempSync(join(tmpdir(), 'cot-tank-assets-layout-'));
try {
  // 1. The pinned order: '_' before digits before letters, a prefix first (code-point order would put challenger1_mk1
  //    before challenger_x), whatever the locale.
  assert.deepEqual(['challenger1_mk1', 'ab', 'a0', 'challenger_x', 'b', 'a', 'a_b'].sort(compareTankIds),
    ['a', 'a_b', 'a0', 'ab', 'b', 'challenger_x', 'challenger1_mk1'], 'compareTankIds is the pinned id order');

  // 2. This checkout's manifest.
  const problems = tankAssetsLayoutProblems(ICONS);
  assert.deepEqual(problems, [], `the tank asset manifest's layout\n  ${problems.join('\n  ')}`);
  const ids = tankAssetIds(ICONS);
  assert.ok(ids.length >= 200, `the manifest holds the fleet (${ids.length} rows)`);
  let largest = { id: '', bytes: 0 };
  for (const id of ids) {
    const bytes = readFileSync(tankAssetRowPath(ICONS, id)).length;
    if (bytes > largest.bytes) largest = { id, bytes };
  }

  // 3. Byte-exact reassembly: join, split the joined text into a scratch icons directory, compare every file, join again.
  const manifest = readTankAssets(ICONS);
  assert.ok(Object.keys(manifest.tanks).every((id, i) => id === ids[i]), 'the reassembly takes the rows in the pinned order');
  const joined = tankAssetsMonolithText(manifest);
  const resplit = join(scratch, 'resplit');
  writeTankAssets(resplit, JSON.parse(joined), { prune: true });
  assert.ok(readFileSync(tankAssetIndexPath(resplit)).equals(readFileSync(tankAssetIndexPath(ICONS))), 'the index splits back byte for byte');
  const drifted = ids.filter((id) => !readFileSync(tankAssetRowPath(resplit, id)).equals(readFileSync(tankAssetRowPath(ICONS, id))));
  assert.deepEqual(drifted, [], 'every row splits back byte for byte');
  assert.ok(tankAssetsMonolithText(readTankAssets(resplit)) === joined, 'the re-split joins to the same single-file text');

  // A fixture written out of order joins in the pinned order, to the exact text the pre-266 generator wrote.
  const fixtureIds = ['challenger1_mk1', 'a0', 'challenger_x', 'a_b'];
  const row = (id) => ({ id, name: id.toUpperCase(), armor: { plates: [{ verts: [[0.5, -1, 2], [3, 4.25, 5]] }] }, assets: {} });
  const header = { schemaVersion: 6, partial: false, generator: 'tools/genIcons.mjs', requiredViews: ['angle', 'side'] };
  const fixture = join(scratch, 'fixture');
  writeTankAssets(fixture, { ...header, tanks: Object.fromEntries(fixtureIds.map((id) => [id, row(id)])) });
  const pinned = [...fixtureIds].sort(compareTankIds);
  assert.ok(tankAssetsMonolithText(readTankAssets(fixture))
    === `${JSON.stringify({ ...header, tanks: Object.fromEntries(pinned.map((id) => [id, row(id)])) }, null, 2)}\n`,
  'a fixture joins in the pinned order to the old single file byte for byte');
  assert.deepEqual(tankAssetsLayoutProblems(fixture), [], 'the fixture is sound before the controls');

  // 4. Negative controls: each breaks the fixture one way, and the check names the file.
  const expectProblem = (pattern, why) => {
    const found = tankAssetsLayoutProblems(fixture);
    assert.ok(found.length === 1 && pattern.test(found[0]), `${why}: ${found.join(' | ') || 'no problem reported'}`);
  };
  writeTankAssets(fixture, { ...header, tanks: { heavy: { id: 'heavy', blob: 'x'.repeat(TANK_ASSET_FILE_CAP_BYTES) } } });
  expectProblem(/^tank-assets\/tanks\/heavy\.json: 5\.00 MB, over the 5\.00 MB cap$/, 'a row over the cap fails');
  rmSync(tankAssetRowPath(fixture, 'heavy'));
  const rowPath = tankAssetRowPath(fixture, 'a0');
  const canonicalText = readFileSync(rowPath, 'utf8');
  writeFileSync(rowPath, `${JSON.stringify(row('a0'), null, 2)}\n`);
  expectProblem(/^tank-assets\/tanks\/a0\.json: not in its canonical text/, 'a row written around the store fails');
  writeFileSync(rowPath, canonicalText.replace('"id": "a0"', '"id": "a1"'));
  expectProblem(/^tank-assets\/tanks\/a0\.json: holds the row of 'a1'$/, 'a row in another id\'s file fails');
  writeFileSync(rowPath, canonicalText);
  writeFileSync(join(tankAssetsDir(fixture), 'notes.txt'), 'x');
  expectProblem(/^tank-assets\/notes\.txt: not part of the manifest/, 'a stray file fails');
  rmSync(join(tankAssetsDir(fixture), 'notes.txt'));
  writeFileSync(join(fixture, 'tank-assets.json'), '{}\n');
  expectProblem(/^tank-assets\.json: the pre-266 single file is back/, 'the legacy single file fails');
  rmSync(join(fixture, 'tank-assets.json'));
  assert.deepEqual(tankAssetsLayoutProblems(fixture), [], 'the fixture is sound again after the controls');

  console.log(`tank-assets-layout.selftest: PASS (${ids.length} rows; largest ${largest.id} ${(largest.bytes / 1048576).toFixed(2)} MB `
    + `of the ${(TANK_ASSET_FILE_CAP_BYTES / 1048576).toFixed(0)} MB cap; ${(joined.length / 1048576).toFixed(1)} MB rejoined and `
    + 're-split byte for byte; controls: over-cap, non-canonical, misnamed, stray and legacy files each named)');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
