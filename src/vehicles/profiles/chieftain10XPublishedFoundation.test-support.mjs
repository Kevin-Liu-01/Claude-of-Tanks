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
    if (file === receipt.laterExportAnnotation.file) {
      // 2026-09-15 unused-export cleanup (batch 25 slice C): three declarations lost their
      // `export` keyword and nothing else. Authenticate the complete current source, then put
      // the keywords back to recover the published text.
      assert.equal(sha(source), receipt.laterExportAnnotation.currentSourceSha256,
        'Authenticate the complete subsequently published export-visibility source');
      for (const declaration of ['type ChieftainSectionPoint = ', 'type ChieftainDeckRow = ', 'interface ChieftainCastSection {']) {
        assert.equal(source.split(declaration).length, 2, `${declaration} appears exactly once`);
        assert.equal(source.split(`export ${declaration}`).length, 1, `${declaration} is no longer exported`);
        source = source.replace(declaration, `export ${declaration}`);
      }
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
  // The published099 multiset is retained as explicit history, then the owner-directed muzzle
  // mouth seat (draw vertices moved, none added or removed), then the 2026-09-14 tangent track
  // wrap (the two band meshes lost 240 draw vertices each and the linked shoes moved; every other
  // physical vertex is authenticated unchanged by the non-track multiset the receipt re-derives).
  assert.equal(receipt.successorHistory.length, 2);
  assert.deepEqual(receipt.successorHistory[0].high,
    {count: 318516, sha256: 'e927370c12f00c11a34427869aead2258efaf86dd0ddbcac31ce47b665cbf4bf'});
  assert.deepEqual(receipt.successorHistory[0].low,
    {count: 292116, sha256: '29edd3bbcd982846879d481ca9f66a28c9ed884f5f807a8c63847750a0bacac2'});
  assert.deepEqual(receipt.successorHistory[1].high,
    {count: 318516, sha256: 'c83fa1d589a234388d3ffb88e9fb4b4a6662f864f81432bd4f137fb79da72437'});
  assert.deepEqual(receipt.successorHistory[1].low,
    {count: 292116, sha256: '7bc8bc1603ea8a60909c028dc9ea44a7e67eaf9e0de805c40234cd7f9a8a30fb'});
  for (const quality of ['high', 'low']) {
    assert.equal(receipt.successorHistory[1][quality].count, receipt.successorHistory[0][quality].count,
      'the muzzle mouth seat moves draw vertices without adding or removing any');
    assert.equal(receipt.successor[quality].count,
      receipt.successorHistory[1][quality].count + receipt.laterTrackWrap.trackDrawVertexDelta,
      'the tangent track wrap changes exactly the declared number of band draw vertices');
  }
  assert.match(receipt.laterMuzzleSeat.scope, /muzzleBoreShadowFallback/);
  assert.match(receipt.laterTrackWrap.scope, /roadWheelWrap/);
  assert.equal(receipt.laterTrackWrap.trackDrawVertexDelta, -480);
  return receipt.successor;
}

/** Non-track draw-vertex multiset the wrap successor claims unchanged (receipt re-derives and compares). */
export function publishedChieftainNonTrackMultiset(quality) {
  return receipt.laterTrackWrap.nonTrack[quality];
}
