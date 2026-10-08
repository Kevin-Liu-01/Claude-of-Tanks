// The published track contact against each build (physics lane round 8; the coordinator's ruling of 2026-10-04 on the
// track contact). The builder reads the contact off the drawn band (tankFactoryCore bandGroundContact), from the band's
// own loop, which no render tier changes, so every tier derives the contact the anatomy published. The HIGH pass and the
// LOW pass each hold every tank's build within TIER_TOLERANCE_M of its published receipt, field by field (the belly pan
// in the one-sided band below), so the two tiers derive the same contact within 1 cm of each other and a stale receipt
// shows at once. The movement solve reads that receipt wherever it runs: the host, its Worker, solo play and every
// client (movement.ts and prediction.ts take publishedTrackContact before the build's own contactGeom). The run's ends
// are also read off the band as the meshes draw it, in the tank's frame: a replaced gear unit left in the build's union
// (the T-90M's published its contact 0.75 m past its drawn ground contact), or a profile that scaled the contact apart
// from its band, shows there.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { TANK_SPECS } from './specs.ts';

const TIER_TOLERANCE_M = 0.005;
/** The belly pan is the lowest centre-spanning surface measureRestContact finds. On some hulls that surface is the
 * merged running-gear detail, whose LOW tessellation sits a few millimetres above HIGH's: on the K2 and the K2B the
 * LOW build's lowest gear point is 5.1 mm above the published pan. The solve clamps the ground 15 mm under the
 * PUBLISHED pan on every peer, so a tier drawn above that pan leaves a gap of the difference and never lets the
 * ground into the drawn hull. A tier's drawn pan may therefore sit up to PAN_GAP_M above the published pan, and no
 * more than TIER_TOLERANCE_M below it. */
const PAN_GAP_M = 0.01;
const FIELDS = ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM', 'panYM'];
const RISES = ['dzM', 'frontM', 'rearM'];
/** The drawn band's ground contact: the extent of its meshes' lowest points within this of the band's lowest point (the
 * derivation's tolerance, on the meshes rather than the loop's centreline). */
const BAND_TOLERANCE_M = 0.04;
/** How far the run's published end may sit from that drawn end (the meshes' faces against the loop's centreline, in
 * 2 cm buckets: the fleet reads -0.01 to +0.09, median +0.01; the T-90M's stale span read +0.75). */
const BAND_END_MAX_M = 0.10;
const BUCKET_M = 0.02;

/** The lowest band point in each BUCKET_M of z (tank frame), over the band meshes of the tracks' outer lines. */
function drawnBandProfile(root, halfWidth) {
  const lowest = new Map();
  const point = new Vector3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || !/^gearTrackBand/.test(object.name)) return;
    const position = object.geometry?.attributes?.position;
    if (!position) return;
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index);
      object.localToWorld(point);
      root.worldToLocal(point);
      if (Math.abs(Math.abs(point.x) - halfWidth) > 0.6) continue;
      const bucket = Math.round(point.z / BUCKET_M);
      if (!(lowest.get(bucket) <= point.y)) lowest.set(bucket, point.y);
    }
  });
  return lowest;
}

export function createTrackContactDerivationAudit(tier) {
  let tanks = 0, banded = 0, worstTier = 0, worstPanGap = 0, worstEnd = 0;
  return {
    check(id, tank) {
      const published = TANK_SPECS[id]?.armor?.trackContact;
      const built = tank.contactGeom;
      assert.ok(published, `${id}: a published track contact (npm run tank:anatomy:update)`);
      assert.ok(built, `${id}: the ${tier} build lays a track contact`);
      const compare = (label, expected, actual) => {
        if (expected == null && actual == null) return;
        if (label === 'panYM') {
          const above = actual - expected;
          assert.ok(above >= -TIER_TOLERANCE_M && above <= PAN_GAP_M,
            `${id}: the ${tier} build's panYM ${actual} is not the published ${expected} (a drawn pan may sit up to `
            + `${PAN_GAP_M} m above it, ${TIER_TOLERANCE_M} m below; npm run tank:anatomy:update)`);
          if (above > worstPanGap) worstPanGap = above;
          return;
        }
        const difference = Math.abs(expected - actual);
        assert.ok(difference <= TIER_TOLERANCE_M,
          `${id}: the ${tier} build's ${label} ${actual} is not the published ${expected} (npm run tank:anatomy:update)`);
        if (difference > worstTier) worstTier = difference;
      };
      for (const key of FIELDS) compare(key, published[key], built[key]);
      assert.equal(!published.endRise, !built.endRise, `${id}: the ${tier} build and the receipt both carry the end rise or neither`);
      if (published.endRise) for (const key of RISES) compare(`endRise.${key}`, published.endRise[key], built.endRise[key]);
      tanks++;
      const profile = drawnBandProfile(tank.root, published.halfWidM);
      if (!profile.size) return;
      let bottom = Infinity;
      for (const y of profile.values()) if (y < bottom) bottom = y;
      let front = -Infinity, rear = Infinity;
      for (const [bucket, y] of profile) {
        if (y - bottom > BAND_TOLERANCE_M) continue;
        front = Math.max(front, bucket * BUCKET_M);
        rear = Math.min(rear, bucket * BUCKET_M);
      }
      const runFront = published.zCenterM + published.halfLenM, runRear = published.zCenterM - published.halfLenM;
      for (const [end, run, drawn] of [['front', runFront, front], ['rear', runRear, rear]]) {
        const gap = Math.abs(run - drawn);
        assert.ok(gap <= BAND_END_MAX_M, `${id} (${tier}): the published run's ${end} end ${run.toFixed(3)} is `
          + `${gap.toFixed(3)} m from where the drawn band leaves the ground (${drawn.toFixed(3)})`);
        if (gap > worstEnd) worstEnd = gap;
      }
      banded++;
    },
    finish() {
      console.log(`track contact (${tier}): ${tanks} tanks within ${worstTier.toFixed(4)} m of their published receipts `
        + `(tolerance ${TIER_TOLERANCE_M}), drawn pans at most ${worstPanGap.toFixed(4)} m above theirs `
        + `(band ${PAN_GAP_M}); the run's ends within ${worstEnd.toFixed(3)} m of the drawn band on ${banded}`);
    },
  };
}
