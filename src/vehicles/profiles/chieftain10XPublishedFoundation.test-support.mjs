// Test-only successor contract for the already published, owner-requested
// Mk5-derived Mk10 foundation. This does not reconstruct the earlier casting.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const root = new URL('../../../', import.meta.url);
const receipt = JSON.parse(readFileSync(new URL(
  '../../../docs/references/tanks/chieftain_mk10_x.published-foundation-preservation.json',
  import.meta.url), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');

export const PRE_FOUNDATION_HISTORY = [
  ['high', 317904, 'f8ca53fd1bdb78ead30c90b2d50ffde9464888ebaeb0f8da690dacfe3adb1c31'],
  ['low', 291504, '2f8909bdea9e969f2dc65834150533937167523b47073aee5c858de0e07120d3'],
];

export function assertPublishedChieftainFoundationSources(
  read = file => readFileSync(new URL(file, root), 'utf8'),
) {
  assert.equal(receipt.protocol, 'published-post-foundation-successor-v1');
  assert.equal(receipt.commit, '099edfa49603bc473548f6986c8598267a24a4db');
  assert.equal(receipt.historicalStatus, 'pre-foundation receipt retained; not a current whole-model preservation claim');
  assert.deepEqual(receipt.preFoundationHistory, PRE_FOUNDATION_HISTORY);
  assert.equal(Object.keys(receipt.authoredSources).length, 24,
    'Complete Mk10 profile/helper family, shared foundation and its three direct geometry leaves');
  for (const [file, expected] of Object.entries(receipt.authoredSources)) {
    let source = read(file);
    if (file === receipt.laterMetadataAnnotation.file) {
      assert.equal(sha(source), receipt.laterMetadataAnnotation.currentSourceSha256,
        'Authenticate the complete subsequently published night-lamp annotation source');
      const addedImport = "import { markVehicleNightLens } from '../vehicleNightLighting.ts';\n";
      const wrapper = "markVehicleNightLens(front, 'headlight')";
      assert.equal(source.split(addedImport).length, 2);
      assert.equal(source.split(wrapper).length, 2);
      source = source.replace(addedImport, '').replace(wrapper, 'front');
    }
    if (file === receipt.laterPaintAnnotation.file) {
      // 2026-09-11 fleet paint standard: welded stowage cases carry the turret
      // camouflage through the material-only painted-detail bucket. Only the
      // exact helper import and the single part() emission line are recovered.
      assert.equal(sha(source), receipt.laterPaintAnnotation.currentSourceSha256,
        'Authenticate the complete subsequently published painted-stowage source');
      const addedImport = "import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';\n";
      const painted = "  // Welded stowage cases carry the turret camouflage; only straps/latches\n"
        + "  // stay in the flat detail tone.\n"
        + "  P.addEquipment('turretPaintedDetail', markFixedPaintedPanel(geometry, 'chieftain10-x-stowage', 'turretDetail'),\n"
        + "    x - pivot[0], y - pivot[1], z - pivot[2], 0, yaw);\n";
      const original = "  P.addEquipment('turretDetail', geometry, x - pivot[0], y - pivot[1], z - pivot[2], 0, yaw);\n";
      assert.equal(source.split(addedImport).length, 2);
      assert.equal(source.split(painted).length, 2);
      assert.equal(source.split(original).length, 1);
      source = source.replace(addedImport, '').replace(painted, original);
    }
    assert.equal(sha(source), expected, `Published Mk10 foundation source contract: ${file}`);
  }
  const three = JSON.parse(read('node_modules/three/package.json'));
  assert.equal(three.version, receipt.dependencies.three,
    'The independently published baseline uses the same Three.js geometry version');
  for (const [file, expected] of Object.entries(receipt.dependencyFileHashes)) {
    assert.equal(sha(read(`node_modules/three/${file}`)), expected,
      `Published construction dependency bytes: ${file}`);
  }
  const history = JSON.parse(read('docs/references/tanks/chieftain_mk10_x.service-frame-source.json'));
  for (const [quality, count, hash] of PRE_FOUNDATION_HISTORY) {
    assert.deepEqual(history.verification.exactOldDrawVertexPreservation[quality],
      {count, sha256:hash}, 'The independently archived pre-foundation receipt remains unchanged');
  }
  // The published099 multiset is retained as explicit history; the active
  // successor differs only by the owner-directed muzzle mouth seat.
  assert.equal(receipt.successorHistory.length, 1);
  assert.deepEqual(receipt.successorHistory[0].high,
    {count: 318516, sha256: 'e927370c12f00c11a34427869aead2258efaf86dd0ddbcac31ce47b665cbf4bf'});
  assert.deepEqual(receipt.successorHistory[0].low,
    {count: 292116, sha256: '29edd3bbcd982846879d481ca9f66a28c9ed884f5f807a8c63847750a0bacac2'});
  for (const quality of ['high', 'low']) {
    assert.equal(receipt.successor[quality].count, receipt.successorHistory[0].count ?? receipt.successorHistory[0][quality].count,
      'the muzzle mouth seat moves draw vertices without adding or removing any');
  }
  assert.match(receipt.laterMuzzleSeat.scope, /muzzleBoreShadowFallback/);
  return receipt.successor;
}
