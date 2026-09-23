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

// 2026-09-22 owner ask ("the point of adding holes instead of carving them into the barrel is
// that we save on triangles"): chieftain10XGun.ts closes the loft with one flat cap where it used
// to carve a 32 cm recess that the fallback disc hid. The published text is recovered by putting
// the carved recess back; both texts are pinned here so the swap cannot drift.
const BORE_CAP_SOURCE = "  P.add('gun', outerTube(rows, pivot));\n"
  + '  // Owner 2026-09-22: "the point of adding holes instead of carving them into the barrel is\n'
  + "  // that we save on triangles\". The factory's fallback assembly is this mouth's dark bore; the\n"
  + '  // former 32 cm carved recess (48-segment inner wall, ring and capped floor cylinder, 384\n'
  + '  // triangles at both qualities) sat entirely behind that dark disc and had no physical-bore\n'
  + '  // contract, so nothing rendered it. One flat cap closes the open loft at the source mouth.\n'
  + "  gunPart(P, pivot, 'gun', new THREE.CircleGeometry(.08232, 48), pivot[0], pivot[1], muzzleZ);\n";
const CARVED_RECESS_SOURCE = "  P.add('gun', outerTube(rows, pivot));\n"
  + '  const bore = new THREE.CylinderGeometry(.060, .060, .32, 48, 1, true);\n'
  + '  bore.rotateX(Math.PI / 2);\n'
  + "  gunPart(P, pivot, 'gunDark', bore, pivot[0], pivot[1], muzzleZ - .16);\n"
  + "  gunPart(P, pivot, 'gun', new THREE.RingGeometry(.060, .08232, 48),\n"
  + '    pivot[0], pivot[1], muzzleZ);\n'
  + "  gunPart(P, pivot, 'gunDark', cylZ(.060, .006, 48), pivot[0], pivot[1], muzzleZ - .323);\n";

export function assertPublishedChieftainFoundationSources(
  read = file => readFileSync(new URL(file, root), 'utf8'),
) {
  assert.equal(receipt.protocol, 'published-post-foundation-successor-v1');
  assert.equal(receipt.commit, '099edfa49603bc473548f6986c8598267a24a4db');
  assert.equal(receipt.historicalStatus, 'pre-foundation receipt retained; not a current whole-model preservation claim');
  assert.deepEqual(receipt.preFoundationHistory, PRE_FOUNDATION_HISTORY);
  // 2026-09-22 nation wheel standard: chieftain10XWheels.ts left the family (the Mk 10 X draws the UK Challenger 2E
  // hollow paired wheel through nationWheelSets.ts), so the authored family is 23 sources.
  assert.equal(Object.keys(receipt.authoredSources).length, 23,
    'Complete Mk10 profile/helper family, shared foundation and its two direct geometry leaves');
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
    if (file === receipt.laterBoreCapAnnotation.file) {
      // 2026-09-22 owner ask (holes are added, not carved): the flat muzzle cap replaced the carved
      // 32 cm recess and nothing else. Authenticate the complete current source, then put the
      // carved recess text back to recover the published text.
      assert.equal(sha(source), receipt.laterBoreCapAnnotation.currentSourceSha256,
        'Authenticate the complete subsequently published muzzle-cap source');
      assert.equal(source.split(BORE_CAP_SOURCE).length, 2, 'the flat muzzle cap appears exactly once');
      assert.equal(source.split(CARVED_RECESS_SOURCE).length, 1, 'the carved recess is no longer in the source');
      source = source.replace(BORE_CAP_SOURCE, CARVED_RECESS_SOURCE);
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
  // 2026-09-22: the ground-datum successor joins the history; the nation wheel standard is the active successor.
  assert.equal(receipt.successorHistory.length, 3);
  assert.deepEqual(receipt.successorHistory[0].high,
    {count: 318516, sha256: 'e927370c12f00c11a34427869aead2258efaf86dd0ddbcac31ce47b665cbf4bf'});
  assert.deepEqual(receipt.successorHistory[0].low,
    {count: 292116, sha256: '29edd3bbcd982846879d481ca9f66a28c9ed884f5f807a8c63847750a0bacac2'});
  assert.deepEqual(receipt.successorHistory[1].high,
    {count: 318516, sha256: 'c83fa1d589a234388d3ffb88e9fb4b4a6662f864f81432bd4f137fb79da72437'});
  assert.deepEqual(receipt.successorHistory[1].low,
    {count: 292116, sha256: '7bc8bc1603ea8a60909c028dc9ea44a7e67eaf9e0de805c40234cd7f9a8a30fb'});
  assert.deepEqual(receipt.successorHistory[2].high,
    {count: 320724, sha256: '595d361a80c1ca11ace02e54097d3e9802a2a69dac91d71216be963a2197ba1e'});
  assert.deepEqual(receipt.successorHistory[2].low,
    {count: 294324, sha256: '29a9f05af8fbac81a9c1716adcbdfad5a3d4c44c411f2fe70f3b9b02737e2073'});
  for (const quality of ['high', 'low']) {
    assert.equal(receipt.successorHistory[1][quality].count, receipt.successorHistory[0][quality].count,
      'the muzzle mouth seat moves draw vertices without adding or removing any');
    assert.equal(receipt.successorHistory[2][quality].count,
      receipt.successorHistory[1][quality].count + receipt.laterTrackWrap.trackDrawVertexDelta
        + receipt.laterGroundDatumSeat.trackDrawVertexDelta,
      'the tangent track wrap and the ground-datum reseat change exactly the declared number of band draw vertices');
    // 2026-09-22 nation wheel standard (r38-wheels): only the twelve road wheels changed, by the declared per-tier
    // draw-vertex delta; the muzzle-cap record (r38-bores) was then captured on the combined tree and supersedes
    // the nation-wheel successor, so the active successor is history[2] + both dated deltas.
    assert.equal(receipt.laterMuzzleBoreCap.supersededSuccessor[quality].count,
      receipt.successorHistory[2][quality].count + receipt.laterNationWheels.trackDrawVertexDelta
        + receipt.laterNationWheels.nonTrackDrawVertexDelta[quality],
      'the nation wheel standard changes exactly the declared number of road-wheel draw vertices');
    assert.equal(receipt.laterLowTierNationWheels.supersededSuccessor[quality].count,
      receipt.laterMuzzleBoreCap.supersededSuccessor[quality].count + receipt.laterMuzzleBoreCap.drawVertexDelta,
      'the muzzle cap changes exactly the declared number of draw vertices on top of the nation wheels');
    // round 40 (2026-09-22): the LOW wheel tier (roadWheelGeometry.ts WheelDetail) supersedes the muzzle-cap successor;
    // HIGH is byte-identical (delta 0), LOW lost the twelve wheels' bolt rings and ribs by the declared delta.
    assert.equal(receipt.successor[quality].count,
      receipt.laterLowTierNationWheels.supersededSuccessor[quality].count + receipt.laterLowTierNationWheels.drawVertexDelta[quality],
      'the LOW wheel tier changes exactly the declared number of draw vertices on top of the muzzle cap');
    assert.equal(receipt.laterLowTierNationWheels.nonTrack[quality].count,
      receipt.laterMuzzleBoreCap.nonTrack[quality].count + receipt.laterLowTierNationWheels.drawVertexDelta[quality],
      'the LOW wheel tier touches non-track draw vertices only');
    assert.equal(receipt.laterMuzzleBoreCap.nonTrack[quality].count,
      receipt.laterNationWheels.nonTrack[quality].count + receipt.laterMuzzleBoreCap.drawVertexDelta,
      'the muzzle cap touches non-track draw vertices only (the nation-wheel non-track multiset plus its delta)');
  }
  // 2026-09-22 owner ask (holes are added, not carved): the flat muzzle cap replaced the carved recess.
  // The successor it superseded (the 2026-09-22 nation-wheel multiset, itself history[2] + the wheel deltas)
  // stays authenticated as history.
  assert.match(receipt.laterMuzzleBoreCap.scope, /CircleGeometry/);
  assert.deepEqual(receipt.laterMuzzleBoreCap.supersededSuccessor, {
    high: {count: 294084, sha256: 'fd381069a1751047320c151ae63ecf3e637c97773a17b9385469268999f945fe'},
    low: {count: 250404, sha256: 'f0f3cf88dd64293a362a4972a9e6a5135d454c167e11db7c2386957eb86a0a60'},
  }, 'the nation-wheel successor (r38-wheels, captured alone) the muzzle cap superseded is retained as history');
  assert.match(receipt.laterMuzzleSeat.scope, /muzzleBoreShadowFallback/);
  assert.match(receipt.laterTrackWrap.scope, /roadWheelWrap/);
  assert.equal(receipt.laterTrackWrap.trackDrawVertexDelta, -480);
  // 2026-09-17 fleet reseat: 28 mm band, wheels on the band face, flank/ramp stations (see the record's scope)
  assert.match(receipt.laterGroundDatumSeat.scope, /groundSeatBotY/);
  // ground datum + end-wrap law (2026-09-17): the rim-capped end arcs trimmed 1 344 draw vertices at both qualities
  assert.equal(receipt.laterGroundDatumSeat.trackDrawVertexDelta, 2688);
  // nation wheel standard (owner 2026-09-22): UK Challenger 2E hollow paired construction, fleet suspension arm; tracks untouched
  assert.match(receipt.laterNationWheels.scope, /standardize our wheels across NATIONS/);
  assert.match(receipt.laterLowTierNationWheels.scope, /WheelDetail/);
  assert.equal(receipt.laterLowTierNationWheels.drawVertexDelta.high, 0, 'HIGH is byte-identical through the LOW wheel tier');
  assert.equal(receipt.laterNationWheels.trackDrawVertexDelta, 0);
  return receipt.successor;
}

/** Non-track draw-vertex multiset the latest successor claims unchanged (receipt re-derives and compares).
 * Since 2026-09-22 the latest successor is the muzzle-cap record (owner ask: holes are added, not carved). */
export function publishedChieftainNonTrackMultiset(quality) {
  // 2026-09-22: the muzzle-cap record was captured on the combined round-38 tree (UK Challenger 2E hollow paired
  // wheel + fleet arm from r38-wheels, flat muzzle cap from r38-bores); laterNationWheels.nonTrack is the
  // wheels-only intermediate and stays as history.
  // round 40: the LOW wheel tier record is the latest capture (HIGH multiset unchanged from the muzzle-cap record)
  return receipt.laterLowTierNationWheels.nonTrack[quality];
}
