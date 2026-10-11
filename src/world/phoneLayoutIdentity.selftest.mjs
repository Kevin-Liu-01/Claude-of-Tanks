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
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const MAPS = ['fjord', 'airfield', 'steppe', 'badlands', 'frontier'];
let out = '';
try {
  out = execFileSync(process.execPath, ['tools/capture-world-collision-manifests.mjs', '--tier=mobile', `--maps=${MAPS.join(',')}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  out = String(error.stdout ?? '') + String(error.stderr ?? '');
  assert.fail(`a phone lays the desktop's records out otherwise:\n${out.split('\n').filter((line) => /DRIFTED|match the tree|Error/.test(line)).join('\n')}`);
}
assert.match(out, /building at the mobile tier/, 'the phone tier resolved before the builds');
assert.match(out, new RegExp(`${MAPS.length}/${MAPS.length} collision shards match the tree built at the mobile tier`));
for (const map of MAPS) assert.match(out, new RegExp(`${map}: current`), `${map} at the phone tier`);
console.log(`phoneLayoutIdentity: ${MAPS.join(', ')} built at the phone tier equal the desktop's shards index for index PASS`);
