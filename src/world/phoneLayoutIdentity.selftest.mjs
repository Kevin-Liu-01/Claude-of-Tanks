// A phone places what the desktop places (destruction core lane, 2026-10-08; the coordinator's layout identity ruling):
// every record that blocks movement, shells or sight — a tree's trunk and crown, a bush, the clutter, a hulk, a stone, a
// rock formation's mass — stands at the desktop's seat under the desktop's index, so a phone in a match shares the
// authority's indices (the authority plays the desktop's manifests). The tiers place at one richness (vegetation.ts
// treeRichness and the bushes, props.ts environmentRichness, the wreck count); a phone's saving is in how a record draws,
// never in which records stand.
//
// This builds five maps at the phone tier in Node through the manifest tool's phone check
// (tools/capture-world-collision-manifests.mjs --tier=mobile) and holds them to the committed shards, which are the
// desktop's, index for index:
//   - Fjord's forests and bushes, Airfield's clutter and hulks, Steppe's farm;
//   - (the hitbox lane, 2026-10-11) Badlands, whose formations built their masses from a phone's leaner pieces and whose
//     stones a phone shaped without the map's angularity (14 small rocks fewer), and Frontier, whose ridge field counted
//     a pavement the phone draws none of as unplaced and laid one formation more.
// The whole roster (33 of 33 since 2026-10-11):
//   node tools/capture-world-collision-manifests.mjs --tier=mobile
//
// 2026-10-13 (speed): the tool can split a multi-map build over child processes (`--jobs=N`); this receipt builds its
// five maps one after another in one process, as a phone plays them in one page, so it pins `--jobs=1` (the default)
// and holds the run to the serial path (a split run says so on stderr).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const MAPS = ['fjord', 'airfield', 'steppe', 'badlands', 'frontier'];
const run = spawnSync(process.execPath,
  ['tools/capture-world-collision-manifests.mjs', '--tier=mobile', '--jobs=1', `--maps=${MAPS.join(',')}`],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const out = String(run.stdout ?? '');
if (run.status !== 0) {
  const all = out + String(run.stderr ?? '') + String(run.error ?? '');
  assert.fail(`a phone lays the desktop's records out otherwise (exit ${run.status ?? run.signal}):\n${all.split('\n').filter((line) => /DRIFTED|match the tree|Error|collision job/.test(line)).join('\n')}`);
}
assert.doesNotMatch(String(run.stderr ?? ''), /split over \d+ jobs/, 'the five maps build serially in one process (--jobs=1)');
assert.match(out, /building at the mobile tier/, 'the phone tier resolved before the builds');
assert.match(out, new RegExp(`${MAPS.length}/${MAPS.length} collision shards match the tree built at the mobile tier`));
for (const map of MAPS) assert.match(out, new RegExp(`${map}: current`), `${map} at the phone tier`);
console.log(`phoneLayoutIdentity: ${MAPS.join(', ')} built at the phone tier equal the desktop's shards index for index PASS`);
