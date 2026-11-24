// The Leopard 1 turret family's shared builds (release 275; owner 2026-11-21: "make all leopard 1a... tanks' turrets be
// same height and properly shaped based on those turrets", then "they should also be based o the 1a2 and 1a5 turret
// deisngs and mantlets too"). Two turrets and their mantlets, each drawn once and called by every Leopard 1 that carries
// it, on the family's ring and roof (profiles/leopard1Turret.ts):
//   - the 1A5's cast 1A1A1 turret with the Blohm & Voss wedges and side plates, and its chevron mask (leo1a5, and the
//     Danish 1A5 DK and 1A5 DK-1 under their national kit);
//   - the 1A2A1's one-piece casting of the 1A5's lines with rounded corners, and its mask (leo1a2a1 on its old hull, and
//     the Danish 1A3 DK and the Australian AS1 under their national kit).
// Each build adds only the casting, its plates and its mask; sights, hatches, dischargers, stowage and markings are the
// caller's national kit, seated on the surfaces these return. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Side = -1 | 1;
type Vec3Tuple = readonly [number, number, number];
type Ring = readonly (readonly [number, number])[];

/** A chevron mask's datums, trunnion-local: its half-width and height, the rear pad's top, the full body's station and
 * the line where the brow and chin meet. */
export interface Leo1MaskDatums {
  readonly halfWidth: number; readonly low: number; readonly high: number; readonly rearZ: number; readonly rearHigh: number;
  readonly bodyZ: number; readonly ridgeHalfWidth: number; readonly ridgeLow: number; readonly ridgeHigh: number;
  readonly ridgeZ: number;
}
const maskRing = (w: number, yb: number, yt: number, c: number): Ring => [
  [-w + c, yb], [w - c, yb], [w, yb + c], [w, yt - c], [w - c, yt], [-w + c, yt], [-w, yt - c], [-w, yb + c],
];
/** The mask's top at a station along it: its brow over the faces, its top over the body. */
export const leo1MaskTopAt = (k: Leo1MaskDatums, z: number): number => z <= k.bodyZ
  ? k.high
  : k.high - (k.high - k.ridgeHigh) * THREE.MathUtils.clamp((z - k.bodyZ) / (k.ridgeZ - k.bodyZ), 0, 1);

// ---------------------------------------------------------------------- the 1A5's cast turret with B&V plates --
// The German 1A5 keeps the cast 1A1A1 turret (Wikipedia de: "wie für die 1A5 üblich aus Gussstahl") with the Blohm & Voss
// bolted appliqué. The source ring station and turret length (front 1.08 m ahead of the ring, bustle to 2.20 m behind)
// hold; the cast core is a flat-roofed casting 2.3 m across at the base and 1.8 m at the roof, 0.79 m tall.
const castRing = (wb: number, wm: number, ym: number, wr: number, yr: number, yb = 0): Ring => [
  [-wb, yb], [wb, yb], [wm, ym], [wr, yr], [-wr, yr], [-wm, ym],
];
// (owner 2026-10-27: "make the leeopard turret more angular instead of boxy": every station is the plates' chevron, its
// base set in under a 0.30 m ridge and its upper face leaning in to the roof, faceted, not smoothed; the bustle tapers and
// rakes to its rear plate and the front roof falls to the mantlet)
const BV_CAST_STATIONS: readonly { z: number; ring: Ring }[] = [
  { z: -2.20, ring: castRing(0.50, 0.62, 0.30, 0.44, 0.58, 0.08) },
  { z: -1.80, ring: castRing(0.76, 0.88, 0.30, 0.58, 0.70, 0.04) },
  { z: -1.10, ring: castRing(0.96, 1.08, 0.30, 0.72, 0.78, 0.02) },
  { z: -0.40, ring: castRing(1.00, 1.12, 0.30, 0.76, 0.79) },
  { z: 0.20, ring: castRing(1.00, 1.12, 0.30, 0.76, 0.79) },
  { z: 0.65, ring: castRing(0.92, 1.02, 0.30, 0.70, 0.77) },
  { z: 0.95, ring: castRing(0.74, 0.84, 0.30, 0.58, 0.70) },
  { z: 1.08, ring: castRing(0.62, 0.70, 0.30, 0.50, 0.64) },
];
const stationAt = <T extends { z: number }>(rows: readonly T[], z: number): [T, T, number] => {
  const i = Math.max(0, Math.min(rows.length - 2, rows.findIndex((st) => st.z > z) - 1));
  const a = rows[i], b = rows[i + 1];
  return [a, b, (z - a.z) / (b.z - a.z)];
};
/** The B&V casting's upper face (ridge to roof edge) half-width at height y, between its stations. */
export const leo1BvUpperFaceX = (z: number, y: number): number => {
  const at = ({ ring }: typeof BV_CAST_STATIONS[number]): number =>
    ring[2][0] + (ring[3][0] - ring[2][0]) * (y - ring[2][1]) / (ring[3][1] - ring[2][1]);
  const [a, b, t] = stationAt(BV_CAST_STATIONS, z);
  return at(a) + (at(b) - at(a)) * t;
};
/** The B&V casting's roof height at a station (flat at the family's 0.79 m from z -0.40 to 0.20). */
export const leo1BvRoofAt = (z: number): number => {
  const [a, b, t] = stationAt(BV_CAST_STATIONS, z);
  return a.ring[3][1] + (b.ring[3][1] - a.ring[3][1]) * THREE.MathUtils.clamp(t, 0, 1);
};
/** The 1A5's ring collar and cast core. */
export function addLeo1BvCastCore(P: TankBuilderPort): void {
  const { cylY } = KIT;
  P.add('turret', cylY(0.98, 1.04, 0.11, P.q ? 28 : 18), 0, -0.055, 0);
  P.add('turret', sectionSolid(BV_CAST_STATIONS));
}

// Blohm & Voss appliqué (owner 2026-10-27: "much better sloping ... you make the chevron the wrong way"): the 1A5's spaced
// plates bend outward at mid-height, so every plate is a horizontal chevron in section, a lower face leaning out from the
// base to the 0.30 m ridge and an upper face leaning in from it to the roof edge. The wedge plates either side of the wide
// mask carry the ridge forward into the pointed front; the side plates run it back along the casting. Each is a solid
// rooted in the casting, so the plates read from every bearing without opening the hull envelope.
const BV_RIDGE_Y = 0.30;
const sideChevron = (outerBottom: number, ridge: number, outerTop: number, innerTop: number, innerRidge: number,
  innerBottom: number): Ring => [
  [innerBottom, 0.06], [outerBottom, 0.06], [ridge, BV_RIDGE_Y], [outerTop, 0.74], [innerTop, 0.76],
  [innerRidge, BV_RIDGE_Y],
];
const BV_SIDE_PLATE_STATIONS = [
  { z: -1.20, ring: sideChevron(1.18, 1.28, 0.98, 0.72, 1.00, 0.94) },
  { z: -0.40, ring: sideChevron(1.22, 1.34, 1.02, 0.74, 1.06, 0.98) },
  { z: 0.40, ring: sideChevron(1.22, 1.34, 1.02, 0.74, 1.02, 0.98) },
];
/** The outer face of the B&V side plates (z -1.20 to 0.40) and wedges (to the tip at z 1.36 beside the mask) at height
 * y, ridge 0.30 m, for seating side kit; behind the plates, the casting's own faces. */
export const leo1BvOuterX = (z: number, y: number): number => {
  const plate = (ring: Ring): number => y <= BV_RIDGE_Y
    ? ring[1][0] + (ring[2][0] - ring[1][0]) * (y - ring[1][1]) / (BV_RIDGE_Y - ring[1][1])
    : ring[2][0] + (ring[3][0] - ring[2][0]) * (y - BV_RIDGE_Y) / (ring[3][1] - BV_RIDGE_Y);
  if (z < BV_SIDE_PLATE_STATIONS[0].z) return leo1BvUpperFaceX(z, Math.max(y, BV_RIDGE_Y));
  if (z <= 0.40) {
    const [a, b, t] = stationAt(BV_SIDE_PLATE_STATIONS, z);
    return plate(a.ring) + (plate(b.ring) - plate(a.ring)) * t;
  }
  // the wedge: from the side plates' face at z 0.40 to the tip (ridge 0.76 at z 1.36, upper edge 0.70 at z 1.12)
  const t = THREE.MathUtils.clamp((z - 0.40) / (1.36 - 0.40), 0, 1);
  return plate(BV_SIDE_PLATE_STATIONS[2].ring) * (1 - t) + 0.74 * t;
};
const mirror = (s: Side, p: Vec3Tuple): Vec3Tuple => [s * p[0], p[1], p[2]];
const sideSlab = (s: Side, ...points: readonly Vec3Tuple[]): THREE.BufferGeometry => {
  const [a, b, c, d, e, f, g, h] = points;
  return s > 0
    ? orientedSlab(a, b, c, d, e, f, g, h)
    : orientedSlab(mirror(s, b), mirror(s, a), mirror(s, d), mirror(s, c),
      mirror(s, f), mirror(s, e), mirror(s, h), mirror(s, g));
};
const mirrorChevron = (s: Side, ring: Ring): Ring => s > 0 ? ring : ring.map(([x, y]) => [-x, y] as const).reverse();
/** The B&V wedges and side plates either side, their bolt rows, and the casting's lifting eyes. */
export function addLeo1BvPlates(P: TankBuilderPort, castRoofY: number): void {
  const { cylX, liftEye } = KIT;
  for (const s of [-1, 1] as const) {
    const wedgeLower = sideSlab(s,
      [0.66, 0.06, 1.20], [0.72, 0.06, 1.28], [1.22, 0.06, 0.40], [0.98, 0.06, 0.40],
      [0.66, BV_RIDGE_Y, 1.24], [0.76, BV_RIDGE_Y, 1.36], [1.34, BV_RIDGE_Y, 0.40], [1.02, BV_RIDGE_Y, 0.40]);
    const wedgeUpper = sideSlab(s,
      [0.66, BV_RIDGE_Y, 1.24], [0.76, BV_RIDGE_Y, 1.36], [1.34, BV_RIDGE_Y, 0.40], [1.02, BV_RIDGE_Y, 0.40],
      [0.66, 0.74, 1.04], [0.70, 0.74, 1.12], [1.02, 0.74, 0.40], [0.74, 0.76, 0.40]);
    for (const wedge of [wedgeLower, wedgeUpper]) {
      wedge.userData.primaryStockRole = 'leo1a5-bv-wedge';
      P.add('turret', wedge);
    }
    const sidePlate = sectionSolid(BV_SIDE_PLATE_STATIONS.map(({ z, ring }) => ({ z, ring: mirrorChevron(s, ring) })));
    sidePlate.userData.primaryStockRole = 'leo1a5-bv-side';
    P.add('turret', sidePlate);
    // Bolt heads in a row just over the ridge, square to the side plate's leaning upper face.
    const upperFace = new THREE.Vector2(0.44, 0.32).normalize(); // outward normal of the upper face, (x, y)
    for (let k = 0; k < 5; k++) {
      const z = 0.30 - k * 0.32, boltY = 0.38;
      const faceX = 1.34 - (boltY - BV_RIDGE_Y) / (0.74 - BV_RIDGE_Y) * (1.34 - 1.02) - (z < -0.40 ? (-0.40 - z) * 0.075 : 0);
      P.addEquipment('turretDark', cylX(0.022, 0.018, 8), s * (faceX + upperFace.x * 0.006), boltY + upperFace.y * 0.006, z,
        0, 0, s * Math.atan2(upperFace.y, upperFace.x));
    }
    liftEye(P, 'turretDetail', s * 0.64, castRoofY + 0.01, 0.20, s * 0.45);
    liftEye(P, 'turretDetail', s * 0.62, castRoofY - 0.01, -1.10, s * 2.65);
  }
}

// Blohm & Voss armoured mantlet and the L7A3. The turret owns a flat receiver plate; the moving mask owns a matching rear
// pad and the armour block itself (owner 2026-10-27: "make a better chunkier mantlet that has the proper chevron shaping",
// then "you make the chevron the wrong way and the matnnlet needds to be wider"): a block as wide as the gap between the
// wedge plates, flat across the front, its chevron in profile like the plates around it: the brow slopes down and the chin
// up until they meet in a horizontal line where the gun leaves (owner 2026-10-28: "the correct mantlet ... this kind of
// mantlet that ends in a line"; the band was 0.26 m deep).
export const LEO1_BV_TRUNNION = Object.freeze({ y: 0.40, z: 1.15 });
// (its rear top stays under the turret's front roof at every legal pitch; its line 0.50 m ahead of the trunnion: at 0.58 m
// the 265 critics read "a pointed chevron at the bore", round 6; its full-size body 0.22 m ahead of the trunnion, so the
// block stands forward of the cheeks with short faces closing on the line: round 8, "a massive block that stands
// forward", where at 0.10 m the gun root sat "in a recess between the cheek wedges")
export const LEO1_BV_MASK: Leo1MaskDatums = Object.freeze({ halfWidth: 0.62, low: -0.32, high: 0.34, rearZ: -0.16,
  rearHigh: 0.24, bodyZ: 0.22, ridgeHalfWidth: 0.42, ridgeLow: -0.012, ridgeHigh: 0.012, ridgeZ: 0.50 });
/** The B&V mask and the L7A3 with its two-section thermal sleeve; the German XSW-30-U searchlight on its yoke when asked.
 * Returns the mantlet receipt. */
export function addLeo1BvMantlet(P: TankBuilderPort, options: { readonly xsw30Searchlight: boolean }): Record<string, unknown> {
  const { box, cylX, cylZ, xform, buildGun } = KIT;
  const trunnionY = LEO1_BV_TRUNNION.y;
  const mantletReceiver = { width: 1.32, height: 0.62, depth: 0.16, y: trunnionY + 0.01, z: 0.99 };
  // (the rear pad stays inside the receiver and clears the deck at +20 degrees of elevation over the side bearings)
  const mantletRearPad = { width: 1.20, height: 0.48, depth: 0.14, z: -0.22 };
  const mantletMask = LEO1_BV_MASK;
  P.add('turret', new THREE.BoxGeometry(mantletReceiver.width, mantletReceiver.height, mantletReceiver.depth),
    0, mantletReceiver.y, mantletReceiver.z);
  P.gunG.position.set(0, trunnionY, LEO1_BV_TRUNNION.z);
  P.addGunExtra(new THREE.BoxGeometry(mantletRearPad.width, mantletRearPad.height, mantletRearPad.depth),
    0, 0, mantletRearPad.z);
  const k = mantletMask;
  P.addGunExtra(sectionSolid([
    { z: k.rearZ, ring: maskRing(k.halfWidth - 0.02, k.low + 0.02, k.rearHigh, 0.05) },
    { z: k.bodyZ, ring: maskRing(k.halfWidth, k.low, k.high, 0.06) },
    { z: k.ridgeZ, ring: maskRing(k.ridgeHalfWidth, k.ridgeLow, k.ridgeHigh, 0.008) },
  ]));
  // The brow and chin faces' outward normals (y, z), for seating the bolts and the sight / coax ports square to them.
  const brow = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.high - k.ridgeHigh).normalize();
  const chin = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.ridgeLow - k.low).normalize();
  const onBrow = (t: number, out: number): [number, number] => [
    k.high - (k.high - k.ridgeHigh) * t + brow.x * out, k.bodyZ + (k.ridgeZ - k.bodyZ) * t + brow.y * out];
  const onChin = (t: number, out: number): [number, number] => [
    k.low + (k.ridgeLow - k.low) * t - chin.x * out, k.bodyZ + (k.ridgeZ - k.bodyZ) * t + chin.y * out];
  // (critics 265: the mask a faceted wedge between the cheeks, its line narrower than its body, and few studs)
  for (const x of [-0.22, 0.22]) {
    P.addGunExtraDark(xform(cylZ(0.020, 0.018, 8), 0, 0, 0, -Math.atan2(brow.x, brow.y), 0, 0), x, ...onBrow(0.30, 0.007));
    P.addGunExtraDark(xform(cylZ(0.020, 0.018, 8), 0, 0, 0, Math.atan2(chin.x, chin.y), 0, 0), x, ...onChin(0.5, 0.007));
  }
  // the gunner's telescope port on the right of the brow (-x); the coaxial MG's port on the left (+x) at the line, where
  // the 1A5 photographs show it
  P.addGunExtraDark(xform(cylZ(0.035, 0.05, 12), 0, 0, 0, -Math.atan2(brow.x, brow.y), 0, 0), -0.30, ...onBrow(0.5, 0.010));
  P.addGunExtraDark(cylZ(0.075, 0.08, 16), 0.30, 0, k.ridgeZ - 0.035);
  // The gun's root where it leaves the line: the sleeve's root section from inside the mask out to the thermal sleeve,
  // 0.24 m across, seated in a heavy dark boot 0.28 m across (critics 265, round 5: "a thin pipe with a small elbow collar"
  // where the Munster 1A5's gun leaves its mask fat; round 6: still "a thin black collar"; round 5's dark cone stood out of
  // the brow as a crescent, round 3's clamp band is gone).
  const sleeveStartZ = 0.70, rootZ = k.ridgeZ - 0.10;
  P.addGunExtra(cylZ(0.112, sleeveStartZ - rootZ, P.q ? 20 : 14, 0.118), 0, 0, (rootZ + sleeveStartZ) / 2);
  P.addGunExtraDark(cylZ(0.14, 0.08, P.q ? 20 : 14), 0, 0, k.ridgeZ + 0.005);
  if (options.xsw30Searchlight) {
    // The XSW-30-U infrared / white-light searchlight (owner 2026-10-27: "the big IR/white-light searchlight on the
    // mantlet; add it"): a chamfered box over the gun on a U-yoke whose arms root in the mask's brow, so it pitches with
    // the gun and stays put when the barrel recoils. Its lens throws the runtime's searchlight beam at night. At full
    // elevation its rear clears the turret's front roof by about 8 cm.
    const lamp = { halfWidth: 0.28, low: 0.37, high: 0.79, rearZ: 0.00, frontZ: 0.34, lensR: 0.17 };
    const lampY = (lamp.low + lamp.high) / 2, lampZ = (lamp.rearZ + lamp.frontZ) / 2;
    const browAt = (z: number): number => k.high - (k.high - k.ridgeHigh) * (z - k.bodyZ) / (k.ridgeZ - k.bodyZ);
    // (the yoke stands on the block's top where the lamp sits over the body, on the brow where it sits over the faces)
    const yokeFoot = (lampZ <= k.bodyZ ? k.high : browAt(lampZ)) - 0.015;
    P.add('gunMount', sectionSolid([
      { z: lamp.rearZ, ring: maskRing(lamp.halfWidth, lamp.low, lamp.high, 0.04) },
      { z: lamp.frontZ, ring: maskRing(lamp.halfWidth, lamp.low, lamp.high, 0.04) },
    ]), 0, 0, 0);
    P.add('gunMountDark', cylZ(lamp.lensR + 0.025, 0.03, P.q ? 28 : 18), 0, lampY, lamp.frontZ + 0.012);
    P.add('gunMountGlass', markVehicleNightLens(cylZ(lamp.lensR, 0.008, P.q ? 28 : 18), 'headlight', { searchlight: true }),
      0, lampY, lamp.frontZ + 0.029);
    P.add('gunMountDark', box(0.20, 0.12, 0.04), 0, lampY + 0.02, lamp.rearZ - 0.018);
    for (const s of [-1, 1] as const) {
      // yoke arm from the brow to the trunnion boss in the lamp's side, and the carry handle on its top
      P.add('gunMount', box(0.04, lampY - yokeFoot, 0.10), s * (lamp.halfWidth + 0.05), (lampY + yokeFoot) / 2, lampZ);
      P.add('gunMountDark', cylX(0.05, 0.07, 12), s * (lamp.halfWidth + 0.025), lampY, lampZ);
      P.add('gunMountDark', box(0.02, 0.05, 0.02), s * 0.12, lamp.high + 0.02, lampZ);
    }
    P.add('gunMount', box(lamp.halfWidth * 2 + 0.14, 0.04, 0.10), 0, yokeFoot + 0.01, lampZ);
    P.add('gunMountDark', box(0.26, 0.02, 0.02), 0, lamp.high + 0.045, lampZ);
  }
  // (the mantlet root at the sleeve's size, inside the mask: at 0.14 m it stood out through the wedge as a collar)
  buildGun(P, { len: 4.35, r: 0.064, sleeve: false, evac: 0.60, evacR: 1.78, collar: true, baseR: 0.08 });
  muzzleBore(P, { len: 4.35, r: 0.064 });
  // The L7A3's thermal sleeve, drawn here rather than by buildGun: two sections tapering from 0.22 m across at the mask to
  // 0.17 m, banded at their ends and strapped along them clear of the bore evacuator (critics 265, rounds 5-7: "a thin
  // pipe", "no thermal sleeve or straps", "about a third too thin ... lacks the thick sleeved barrel"). The combat barrel
  // follows the drawn one (the calibration's measured rig, 276).
  const sleeveSeg = P.q ? 28 : 12;
  // (the outer section's straps are left off: at 3.18 m one came 24.7 mm from the stern in recoil at yaw 165)
  const sleeves = [[sleeveStartZ, 2.00, 0.110, 0.098, [0.96, 1.22, 1.48, 1.74]], [2.26, 3.57, 0.094, 0.086, []]] as const;
  for (const [z0, z1, r0, r1, straps] of sleeves) {
    const radiusAt = (z: number): number => r0 + (r1 - r0) * (z - z0) / (z1 - z0);
    P.add('gun', cylZ(r1, z1 - z0, sleeveSeg, r0), 0, 0, (z0 + z1) / 2);
    for (const z of [z0 + 0.02, z1 - 0.02]) P.add('gunDark', cylZ(radiusAt(z) + 0.006, 0.045, sleeveSeg), 0, 0, z);
    for (const z of straps) P.add('gunDark', cylZ(radiusAt(z) + 0.004, 0.035, sleeveSeg), 0, 0, z);
  }
  return {
    seated: true,
    blohmVossMask: true,
    profileChevron: true,
    searchlight: options.xsw30Searchlight ? 'XSW-30-U' : null,
    maskWidth: mantletMask.halfWidth * 2,
    maskHeight: Number((mantletMask.high - mantletMask.low).toFixed(2)),
    maskRidgeZ: mantletMask.ridgeZ,
    maskRidgeHalfHeight: mantletMask.ridgeHigh,
    maskDepth: Number((mantletMask.ridgeZ - mantletMask.rearZ).toFixed(2)),
    rearContactWidth: mantletRearPad.width,
    rearContactZ: mantletRearPad.z,
    receiverWidth: mantletReceiver.width,
    receiverY: mantletReceiver.y,
    receiverZ: mantletReceiver.z,
    barrelRadius: 0.064,
  };
}

// ---------------------------------------------------------------------- the 1A2A1's one-piece casting --
/** A corner rounded by two short segments: the points `bevel` along each neighbouring edge and their midpoint pulled
 * halfway back toward the corner, so the smoothed normals read as a small radius between two flat faces. */
const roundCorner = (prev: SectionPoint, corner: SectionPoint, next: SectionPoint, bevel: number): SectionPoint[] => {
  const along = (to: SectionPoint): SectionPoint => {
    const dx = to[0] - corner[0], dy = to[1] - corner[1], len = Math.hypot(dx, dy);
    const d = Math.min(bevel, len * 0.3);
    return [corner[0] + dx / len * d, corner[1] + dy / len * d];
  };
  const a = along(prev), b = along(next);
  return [a, [(a[0] + b[0]) / 4 + corner[0] / 2, (a[1] + b[1]) / 4 + corner[1] / 2], b];
};
/** The 1A5 casting's chevron section (base, ridge, roof edge), its ridge and roof edges rounded. 14 points. */
const castChevronRing = (wb: number, yb: number, wm: number, ym: number, wr: number, yr: number): readonly SectionPoint[] => {
  const base: SectionPoint = [wb, yb], ridge: SectionPoint = [wm, ym], roofEdge: SectionPoint = [wr, yr];
  const right = [base, ...roundCorner(base, ridge, roofEdge, 0.05), ...roundCorner(ridge, roofEdge, [-wr, yr], 0.04)];
  const left = right.map(([x, y]) => [-x, y] as const).reverse();
  return [left.at(-1)!, ...right, ...left.slice(0, -1)];
};
// the two rounded corners on each side (edges 2-3 and 5-6, mirrored 8-9 and 11-12) read as one smooth radius
const CAST_ROUND_EDGES = [2, 3, 5, 6, 8, 9, 11, 12];
/** One side's plate or wedge section (x > 0), the 1A5 chevron: an inner face buried in the core, the lower face out to a
 * rounded ridge 0.30 m up, the upper face in to a rounded top edge. 9 points; mirror for the left. */
const plateChevronRing = (xi: number, xb: number, yb: number, xr: number, xt: number, yt: number): readonly SectionPoint[] => {
  const ib: SectionPoint = [xi, yb], ob: SectionPoint = [xb, yb], ridge: SectionPoint = [xr, 0.30];
  const top: SectionPoint = [xt, yt], it: SectionPoint = [xi, yt];
  return [ib, ob, ...roundCorner(ob, ridge, top, 0.045), ...roundCorner(ridge, top, it, 0.035), it];
};
const PLATE_ROUND_EDGES = [2, 3, 5, 6];
const mirrorRing = (ring: readonly SectionPoint[]): readonly SectionPoint[] =>
  ring.map(([x, y]) => [-x, y] as const).reverse();
const mirrorEdges = (edges: readonly number[], count: number): number[] => edges.map((e) => count - 2 - e);
const ONE_PIECE_RIDGE_Y = 0.30;
type CoreRow = readonly [number, number, number, number, number, number];
type PlateRow = readonly [number, number, number, number, number, number, number];
// The side plates' run ([z, inner, outer base, foot, ridge, top edge, top]): the 1A5's, from a short tail tapering into the
// core back to the wedges.
const ONE_PIECE_SIDE_ROWS: readonly PlateRow[] = [
  [-1.34, 0.78, 1.04, 0.10, 1.10, 0.96, 0.70],
  [-1.20, 0.92, 1.20, 0.08, 1.28, 1.11, 0.74],
  [-0.40, 0.96, 1.25, 0.07, 1.34, 1.16, 0.75],
  [0.40, 0.98, 1.25, 0.07, 1.34, 1.16, 0.75],
];
// The wedges either side of the mask: the ridge runs from the side plates (±1.34 at z 0.40) to the tip beside the mask
// (±0.76 at z 1.36); ahead of z 1.12 the upper and lower faces close on the ridge, so each wedge ends in its line.
const ONE_PIECE_WEDGE_ROWS: readonly PlateRow[] = [
  [0.40, 0.98, 1.25, 0.07, 1.34, 1.16, 0.75],
  [0.70, 0.86, 1.08, 0.08, 1.16, 1.01, 0.74],
  [1.00, 0.74, 0.90, 0.08, 0.98, 0.85, 0.74],
  [1.12, 0.69, 0.84, 0.08, 0.91, 0.80, 0.72],
  [1.22, 0.66, 0.78, 0.11, 0.85, 0.76, 0.56],
  [1.30, 0.65, 0.75, 0.19, 0.80, 0.73, 0.41],
  [1.36, 0.66, 0.72, 0.27, 0.76, 0.71, 0.33],
];
/** The surfaces a one-piece casting returns for its kit: its roof along it, its upper face and the plates' outer face. */
export interface Leo1OnePieceTurret {
  readonly castRoofY: number;
  readonly ridgeY: number;
  readonly sideRows: readonly PlateRow[];
  readonly wedgeRows: readonly PlateRow[];
  readonly roofAt: (z: number) => number;
  readonly upperFaceX: (z: number, y: number) => number;
  readonly outerX: (z: number, y: number) => number;
}
/** The 1A2A1's one-piece casting: the ring collar, the 1A5's chevron core with its ridges and roof edges rounded, the side
 * plates and the wedges cast with it. `footing` 'oldHull' lifts the core's feet and deepens the collar for the 1A2A1's
 * rising old deck; 'deck' stands them on the family's flat 1.58 m deck at the 1A5's feet. */
export function addLeo1OnePieceCasting(P: TankBuilderPort, options: { readonly castRoofY: number;
  readonly footing: 'oldHull' | 'deck' }): Leo1OnePieceTurret {
  const { cylY } = KIT;
  const castRoofY = options.castRoofY;
  const ridgeY = ONE_PIECE_RIDGE_Y;
  const oldHull = options.footing === 'oldHull';
  // [z, base half-width, ridge half-width, roof half-width, roof, foot]: the 1A5's stations, their feet lifted for the
  // old deck (or at the 1A5's own feet on the flat deck)
  const feet = oldHull ? [0.16, 0.11, 0.07, 0.05, 0.05, 0.05, 0.08, 0.12] : [0.08, 0.04, 0.02, 0, 0, 0, 0, 0];
  const coreRows: readonly CoreRow[] = [
    [-2.20, 0.50, 0.62, 0.44, 0.58, feet[0]],
    [-1.80, 0.76, 0.88, 0.58, 0.70, feet[1]],
    [-1.10, 0.96, 1.08, 0.72, 0.78, feet[2]],
    [-0.40, 1.00, 1.12, 0.76, castRoofY, feet[3]],
    [0.20, 1.00, 1.12, 0.76, castRoofY, feet[4]],
    [0.65, 0.92, 1.02, 0.70, 0.77, feet[5]],
    [0.95, 0.74, 0.84, 0.58, 0.70, feet[6]],
    [1.08, 0.62, 0.70, 0.50, 0.64, feet[7]],
  ];
  const coreSections: readonly SolidSection[] = coreRows.map(([z, wb, wm, wr, yr, yb]) => ({
    z, ring: castChevronRing(wb, yb, wm, ridgeY, wr, yr) }));
  const rowAt = <R extends readonly number[]>(rows: readonly R[], z: number): [R, R, number] => {
    const i = Math.max(0, Math.min(rows.length - 2, rows.findIndex((r) => r[0] > z) - 1));
    const a = rows[i], b = rows[i + 1];
    return [a, b, (z - a[0]) / (b[0] - a[0])];
  };
  const roofAt = (z: number): number => {
    const [a, b, t] = rowAt(coreRows, z);
    return a[4] + (b[4] - a[4]) * THREE.MathUtils.clamp(t, 0, 1);
  };
  const upperFaceX = (z: number, y: number): number => {
    const at = ([, , wm, wr, yr]: CoreRow): number => wm + (wr - wm) * (y - ridgeY) / (yr - ridgeY);
    const [a, b, t] = rowAt(coreRows, z);
    return at(a) + (at(b) - at(a)) * t;
  };
  const plateX = ([, , xb, yb, xr, xt, yt]: PlateRow, y: number): number => y <= ridgeY
    ? xb + (xr - xb) * (y - yb) / (ridgeY - yb)
    : xr + (xt - xr) * (y - ridgeY) / (yt - ridgeY);
  const outerX = (z: number, y: number): number => {
    if (z < ONE_PIECE_SIDE_ROWS[0][0]) return upperFaceX(z, Math.max(y, ridgeY));
    const rows = z <= 0.40 ? ONE_PIECE_SIDE_ROWS : ONE_PIECE_WEDGE_ROWS;
    const [a, b, t] = rowAt(rows, Math.min(z, rows.at(-1)![0]));
    return plateX(a, y) + (plateX(b, y) - plateX(a, y)) * THREE.MathUtils.clamp(t, 0, 1);
  };
  const plateSections = (rows: readonly PlateRow[], s: Side): SolidSection[] => rows.map(([z, xi, xb, yb, xr, xt, yt]) => {
    const ring = plateChevronRing(xi, xb, yb, xr, xt, yt);
    return { z, ring: s > 0 ? ring : mirrorRing(ring) };
  });
  const plateEdges = (s: Side): readonly number[] => (s > 0 ? PLATE_ROUND_EDGES : mirrorEdges(PLATE_ROUND_EDGES, 9));
  if (oldHull) P.add('turret', cylY(0.98, 1.04, 0.165, P.q ? 28 : 18), 0, -0.0275, 0);
  else P.add('turret', cylY(0.98, 1.04, 0.11, P.q ? 28 : 18), 0, -0.055, 0);
  const core = sectionSolid(coreSections, { smoothSideEdges: CAST_ROUND_EDGES });
  core.userData.primaryStockRole = 'leo1a2a1-cast-core';
  P.add('turret', core);
  for (const s of [-1, 1] as const) {
    const side = sectionSolid(plateSections(ONE_PIECE_SIDE_ROWS, s), { smoothSideEdges: plateEdges(s) });
    side.userData.primaryStockRole = 'leo1a2a1-cast-side';
    P.add('turret', side);
    const wedge = sectionSolid(plateSections(ONE_PIECE_WEDGE_ROWS, s), { smoothSideEdges: plateEdges(s) });
    wedge.userData.primaryStockRole = 'leo1a2a1-cast-wedge';
    P.add('turret', wedge);
  }
  return { castRoofY, ridgeY, sideRows: ONE_PIECE_SIDE_ROWS, wedgeRows: ONE_PIECE_WEDGE_ROWS, roofAt, upperFaceX, outerX };
}

// The mantlet and the L7A3: the 1A5's chevron mask, as wide as the gap between the wedges, its brow sloping down and its
// chin up until they meet in a horizontal line where the gun leaves (owner 2026-10-28: "the correct mantlet ... that ends
// in a line"). The turret owns a flat receiver plate; the moving mask owns a matching rear pad and the block. The trunnion
// stands 0.40 m over the ring; on the 1A2A1 the mask's underside clears the old hull's rising engine deck (1.74-1.77 m at
// its radius) when the gun is laid over the rear.
export const LEO1_ONE_PIECE_TRUNNION = Object.freeze({ y: 0.40, z: 1.15 });
// (its line 0.58 m ahead of the trunnion, so the wedge stands clear of the cheeks: critics 265, round 5, "barely stands
// forward of the cheeks")
export const LEO1_ONE_PIECE_MASK: Leo1MaskDatums = Object.freeze({ halfWidth: 0.62, low: -0.30, high: 0.34, rearZ: -0.16,
  rearHigh: 0.24, bodyZ: 0.10, ridgeHalfWidth: 0.58, ridgeLow: -0.012, ridgeHigh: 0.012, ridgeZ: 0.58 });
/** The one-piece casting's mask and the L7A3 under buildGun's sleeve. Returns the mantlet receipt. */
export function addLeo1OnePieceMantlet(P: TankBuilderPort): Record<string, unknown> {
  const { cylZ, xform, buildGun } = KIT;
  const trunnionY = LEO1_ONE_PIECE_TRUNNION.y;
  const trunnionZ = LEO1_ONE_PIECE_TRUNNION.z;
  const mantletReceiver = { width: 1.32, height: 0.62, depth: 0.16, y: trunnionY + 0.01, z: 0.99 };
  const mantletRearPad = { width: 1.20, height: 0.48, depth: 0.14, z: -0.22 };
  const mantletMask = LEO1_ONE_PIECE_MASK;
  P.add('turret', new THREE.BoxGeometry(mantletReceiver.width, mantletReceiver.height, mantletReceiver.depth),
    0, mantletReceiver.y, mantletReceiver.z);
  P.gunG.position.set(0, trunnionY, trunnionZ);
  P.addGunExtra(new THREE.BoxGeometry(mantletRearPad.width, mantletRearPad.height, mantletRearPad.depth),
    0, 0, mantletRearPad.z);
  const k = mantletMask;
  // (the corners chamfered and their normals smoothed, so the block's vertical and horizontal edges read slightly round)
  P.addGunExtra(sectionSolid([
    { z: k.rearZ, ring: maskRing(k.halfWidth - 0.02, k.low + 0.02, k.rearHigh, 0.05) },
    { z: k.bodyZ, ring: maskRing(k.halfWidth, k.low, k.high, 0.06) },
    { z: k.ridgeZ, ring: maskRing(k.ridgeHalfWidth, k.ridgeLow, k.ridgeHigh, 0.008) },
  ], { smoothSideEdges: [1, 3, 5, 7] }));
  // The brow face's outward normal (y, z), for seating the sight port square to it.
  const brow = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.high - k.ridgeHigh).normalize();
  const onBrow = (t: number, out: number): [number, number] => [
    k.high - (k.high - k.ridgeHigh) * t + brow.x * out, k.bodyZ + (k.ridgeZ - k.bodyZ) * t + brow.y * out];
  // the gunner's small telescope port on the right of the brow (-x); the coaxial MG's on the left (+x) at the line, where
  // the 1A5 photographs show it (critics 265, round 5 read the larger brow port as the coax on the wrong side)
  P.addGunExtraDark(xform(cylZ(0.035, 0.05, 12), 0, 0, 0, -Math.atan2(brow.x, brow.y), 0, 0), -0.30, ...onBrow(0.5, 0.010));
  P.addGunExtraDark(cylZ(0.06, 0.08, 14), 0.30, 0, k.ridgeZ - 0.035);
  // The gun's root where it leaves the line: the sleeve's root section from inside the mask out to the thermal sleeve,
  // 0.21 m across at the line and narrowing to it, seated in a short dark boot (critics 265, round 5: "a thin pipe with a
  // small elbow collar" where the Munster 1A5's gun leaves its mask fat; round 5's dark cone stood out of the brow as a
  // crescent, round 4's collar and round 3's clamp band are gone).
  const sleeveStartZ = 0.16 * 4.35, rootZ = k.ridgeZ - 0.10;
  P.addGunExtra(cylZ(0.080, sleeveStartZ - rootZ, P.q ? 20 : 14, 0.105), 0, 0, (rootZ + sleeveStartZ) / 2);
  P.addGunExtraDark(cylZ(0.116, 0.05, P.q ? 20 : 14), 0, 0, k.ridgeZ - 0.01);
  // (the mantlet root at the sleeve's size, inside the mask: at 0.14 m it stood out through the wedge as a collar)
  buildGun(P, { len: 4.35, r: 0.064, sleeve: true, evac: 0.60, evacR: 1.78, collar: true, baseR: 0.08 });
  muzzleBore(P, { len: 4.35, r: 0.064 });
  return {
    seated: true,
    chevronProfile: true,
    endsInLine: true,
    maskWidth: k.halfWidth * 2,
    maskHeight: Number((k.high - k.low).toFixed(2)),
    maskRidgeZ: k.ridgeZ,
    maskRidgeHalfHeight: k.ridgeHigh,
    maskDepth: Number((k.ridgeZ - k.rearZ).toFixed(2)),
    rearContactWidth: mantletRearPad.width,
    rearContactZ: mantletRearPad.z,
    receiverWidth: mantletReceiver.width,
    receiverY: mantletReceiver.y,
    receiverZ: mantletReceiver.z,
    trunnion: [0, trunnionY, trunnionZ],
    barrelRadius: 0.064,
  };
}

// ---------------------------------------------------------------------- the 1A5's stowage bin --
/** The bin boxing the casting's tail (critics 265, round 4: the Munster 1A5's "compact basket with solid sides, flush with
 * the turret sides"): its footprint, which the national rear kit (the DK-1's housing, the AS1's basket) takes over. */
export const LEO1_BUSTLE_BIN = Object.freeze({ width: 1.88, frontZ: -1.82, rearZ: -2.46, floorY: 0.16, rimY: 0.68 });
/** The bin's sheet sides from behind the smoke banks, a rear wall 0.26 m past the casting, a rim and two ribs round it.
 * Its floor clears the stern deck at every bearing. */
export function addLeo1BustleBin(P: TankBuilderPort, options: { readonly bucket?: string;
  readonly eachSide?: (s: Side) => void } = {}): void {
  const bucket = options.bucket ?? 'turret';
  const { box } = KIT;
  const b = LEO1_BUSTLE_BIN;
  const centerZ = (b.frontZ + b.rearZ) / 2, depth = b.frontZ - b.rearZ;
  const wallY = (b.floorY + b.rimY) / 2, wallH = b.rimY - b.floorY;
  P.addEquipment(bucket, box(b.width, 0.02, depth), 0, b.floorY, centerZ);
  P.addEquipment(bucket, box(b.width, wallH, 0.02), 0, wallY, b.frontZ);
  P.addEquipment(bucket, box(b.width, wallH, 0.02), 0, wallY, b.rearZ);
  P.addEquipment(bucket, box(b.width + 0.04, 0.04, 0.04), 0, b.rimY, b.rearZ);
  for (const y of [0.30, 0.50]) P.addEquipment(bucket, box(b.width + 0.02, 0.03, 0.012), 0, y, b.rearZ - 0.016);
  for (const s of [-1, 1] as const) {
    const wallX = s * (b.width / 2 - 0.01);
    P.addEquipment(bucket, box(0.02, wallH, depth), wallX, wallY, centerZ);
    P.addEquipment(bucket, box(0.04, 0.04, depth + 0.02), s * (b.width / 2), b.rimY, centerZ);
    P.addEquipment(bucket, box(0.04, wallH + 0.02, 0.04), s * (b.width / 2), wallY, b.rearZ);
    for (const y of [0.30, 0.50]) P.addEquipment(bucket, box(0.012, 0.03, depth), wallX + s * 0.016, y, centerZ);
    // (the caller's fittings on this side, added here so a build keeps its order)
    options.eachSide?.(s);
  }
}
