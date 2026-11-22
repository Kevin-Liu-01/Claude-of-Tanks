// The Olifant TTD, Tank Technology Demonstrator: Project Loggim's one prototype, finished in 1992 (Reumech OMC the hull,
// Lyttelton Engineering Works the turret and gun), at the SA Armour Museum since 1996-97. Its own build (ttd-275; Kevin,
// 2026-11-21: "make the ttd its own tank instead of being based off of the leopard 2", replacing the 269 build on the
// fleet's Leopard 2; docs/references/tanks/ttd.md), drawn from the photographs and D. Bocquelet's side elevation on the
// datums in ttdArmor.ts: a long hull with a shallow upper glacis, a steep nose plate between two armoured corner boxes
// with their grilles, tall four-panel skirts, a raised engine deck and a raked stern; seven dual road wheels at 0.83 m, a
// raised front idler; a long slab-sided turret 2.74 m wide whose front is five upright blocks (two broad outer cheeks,
// two inner blocks with vents on their chamfer, the tall mantlet between them); the GS60 gunner's sight box at the roof's
// right front, the commander's sunken cupola with the CS60N head behind it, the loader's hatch and FN MAG on the left,
// two banks of four 81 mm dischargers on the roof's side edges behind their sheets, the big stowage boxes on the bustle's
// sides; the 105 mm GT3 of 51 calibres in its thermal sleeve with its fume extractor and muzzle reference unit.
// A +Z hull's right is -X: the commander, the gunner and the driver sit at -X, the loader at +X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { TTD_HULL as H, TTD_TURRET as T, TTD_MUZZLE_HULL_Z, ttdLineY } from '../ttdArmor.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const deckY = (z: number): number => ttdLineY(H.deck, z);
const bellyY = (z: number): number => ttdLineY(H.belly, z);
/** The raked rear plate: its line from the foot (z -3.56, y 0.80) up to the top edge's underside (z -3.89, y 1.84). */
const rakeY = (z: number): number => H.rakeFootY + (H.rakeFootZ - z) / (H.rakeFootZ - H.sternTopZ) * (H.sternTopFootY - H.rakeFootY);
const rakeZ = (y: number): number => H.rakeFootZ - (y - H.rakeFootY) / (H.sternTopFootY - H.rakeFootY) * (H.rakeFootZ - H.sternTopZ);
/** The hull's underside at z: the raked rear plate, the lower rear plate, the belly, the lower glacis. */
const hullFloorY = (z: number): number => (z < H.rakeFootZ ? rakeY(z) : bellyY(z));
/** The skirts' top line (the fender ledge), falling to the nose under the corner boxes, and their hem rising to it. */
const skirtTopY = (z: number): number => (z <= 3.25 ? H.ledgeY : H.ledgeY - (z - 3.25) / (H.noseZ - 3.25) * (H.ledgeY - 1.06));
const skirtHemY = (z: number): number => (z <= H.skirtHemRiseZ ? H.skirtLowY
  : H.skirtLowY + (z - H.skirtHemRiseZ) / (3.88 - H.skirtHemRiseZ) * (1.02 - H.skirtLowY));
/** The nose plate's slope (from the glacis' front edge to the lip), radians from the horizontal. */
const NOSE_SLOPE = Math.atan2(H.deck[6][1] - H.deck[7][1], H.deck[7][0] - H.deck[6][0]);
/** The upper side's lean at z from the fender ledge to the deck's edge. */
const sideLean = (z: number): number => Math.atan2(H.sponsonLedgeX - H.sponsonDeckX, deckY(z) - 0.03 - H.ledgeY);

/** Turret roof height at z (ring frame): the broad chamfer along the front edge down to the face's top. */
const turretTopY = (z: number): number => {
  const c0 = T.faceZ - T.chamferBackM;
  return z <= c0 ? T.roofY : T.roofY - (z - c0) / T.chamferBackM * T.chamferDownM;
};
/** The turret's floor at z: level under the front, rising behind the ring, level, rising again to the rear plate. */
const turretFloorY = (z: number): number => {
  const [s0, s1] = T.bustleStepZ;
  if (z >= s0) return T.floorY;
  if (z >= s1) return T.floorY + (s0 - z) / (s0 - s1) * (T.bustleFloorY - T.floorY);
  if (z >= T.bustleRearRiseZ) return T.bustleFloorY;
  return T.bustleFloorY + (T.bustleRearRiseZ - z) / (T.bustleRearRiseZ - T.rearFootZ) * (T.rearFloorY - T.bustleFloorY);
};

/** A contour (counter-clockwise seen from ahead) for the +X side; the -X side mirrors and reverses it. */
const sided = (s: 1 | -1, pts: SectionPoint[]): SectionPoint[] => (s > 0 ? pts : pts.map(([x, y]) => [-x, y] as SectionPoint).reverse());

function* buildTtdSteps(P: TankBuilderPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ, torus, xform, buildRunningGear, headlight, liftEye, periscope } = KIT;
  const slab = orientedSlab, seg = P.q ? 24 : 14;

  // ---------------------------------------------------------------- hull --
  const tw = H.tubHalfWidthM, rec = H.noseRecessM;
  // the tub between the tracks: the raked stern, the belly, the long shallow glacis; its nose plate (the "TTD 001 M"
  // plate) 4 cm behind the corner boxes' faces
  const tubZs = [H.sternTopZ, -3.72, H.rakeFootZ, -3.30, -1.94, -1.80, -0.60, 2.02, 3.30 - rec, H.noseTopZ - rec, H.noseZ - rec];
  const tubRing = (z: number): SectionPoint[] => {
    const zz = z > 3.0 ? z + rec : z, b = z <= H.sternTopZ + 1e-6 ? H.sternTopFootY : hullFloorY(zz), t = deckY(zz);
    return [[-tw, b], [tw, b], [tw, t], [-tw, t]];
  };
  P.add('hull', sectionSolid(tubZs.map((z) => ({ z, ring: tubRing(z) }))));
  // the sponsons over the tracks: their floor to the fender ledge, the upper side leaning in to the deck's edge; at the
  // front they run under the corner boxes
  const sponsonZs = [H.sternTopZ, -3.72, rakeZ(H.sponsonFloorY), -1.94, -1.80, -0.60, 2.02, 3.30];
  for (const s of [-1, 1] as const) {
    const ring = (z: number): SectionPoint[] => {
      const t = deckY(z), f = Math.max(H.sponsonFloorY, z < H.rakeFootZ ? rakeY(z) : 0), ledge = Math.min(H.ledgeY, t - 0.06);
      const top = Math.max(f + 0.02, t);
      return sided(s, [[tw - 0.01, f], [H.sponsonLedgeX, f], [H.sponsonLedgeX, Math.max(f + 0.01, ledge)],
        [H.sponsonDeckX, top - 0.03], [H.sponsonDeckX - 0.03, top], [tw - 0.01, top]]);
    };
    P.add('hull', sectionSolid(sponsonZs.map((z) => ({ z, ring: ring(z) }))));
    // the armoured corner box over the front fender: from the skirt's top line to 7 cm over the glacis, its face the nose
    // plate's slope down to the lip (the parade and head-on photographs; the elevation's nose)
    const boxZs = [H.boxRearZ, 3.25, H.noseTopZ, 3.75, H.noseZ];
    const boxRing = (z: number): SectionPoint[] => {
      const b = skirtTopY(z), t = Math.max(b + 0.04, deckY(z) + H.boxRiseM);
      return sided(s, [[H.boxInnerX + 0.01, b], [H.skirtOutX, b], [H.skirtOutX, t - 0.02], [H.skirtOutX - 0.02, t],
        [H.boxInnerX + 0.01, t]]);
    };
    P.add('hull', sectionSolid(boxZs.map((z) => ({ z, ring: boxRing(z) }))));
    // the fender ledge the skirts hang from, the sponson's length behind the corner box
    P.add('hullDetail', box(H.skirtOutX + 0.005 - (H.sponsonLedgeX - 0.02), 0.03, H.boxRearZ - rakeZ(H.ledgeY) - 0.02),
      s * (H.skirtOutX + 0.005 + H.sponsonLedgeX - 0.02) / 2, H.ledgeY + 0.015, (H.boxRearZ + rakeZ(H.ledgeY) + 0.02) / 2);
  }
  yield 'buildTtdHull';

  // ---------------------------------------------------------------- running gear --
  // seven dual rubber-tyred road wheels a side on torsion bars, the raised front idler, the rear sprocket, four return
  // rollers behind the skirts (TE; the elevation: 0.70 m wheels at 0.83 m)
  buildRunningGear(P, {
    style: 'dished', wheelR: H.wheelR, wheelW: H.wheelW, wheelY: H.wheelY, xc: H.trackXc, wheelZs: [...H.wheelZs],
    sprocket: { ...H.sprocket }, idler: { ...H.idler },
    rollers: H.rollers.map((z) => ({ z, y: H.rollerY, r: H.rollerR })),
    trackW: H.trackW, topY: H.rollerY + H.rollerR + 0.045, botY: 0.075, contactZF: H.wheelZs[0], contactZR: H.wheelZs.at(-1),
    paintedEnds: true, coveredTop: true, arms: true, sprocketTeeth: true,
  });
  for (const z of H.wheelZs) for (const s of [-1, 1] as const) {
    // the hub's bolt ring on each dual wheel (the elevation's eight-bolt hubs), in its side's own bucket
    P.add(s < 0 ? 'hullTrackDetailL' : 'hullTrackDetailR', torus(H.wheelR * 0.30, 0.014, P.q ? 16 : 10),
      s * (H.trackXc + H.wheelW / 2 + 0.010), H.wheelY, z, 0, 0, Math.PI / 2);
  }
  P.mats.rubber.color.setHex(0x2f312b);
  yield 'buildTtdRunningGear';

  // ---------------------------------------------------------------- skirts --
  // four armoured panels a side hung from the fender ledge (the elevation's joints at z 1.70, -0.15, -2.00), the front
  // panel's hem rising to the nose under the corner box, the rear panel's edge raked with the stern; a raised strip and a
  // hinge foot at every joint, bolts along the top
  const sx0 = H.skirtInX, sx1 = H.skirtOutX;
  const edges = [3.86, ...H.skirtJointZs];
  for (const s of [-1, 1] as const) {
    const bucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR';
    const xi = s * sx0, xo = s * sx1, lo = Math.min(xi, xo), hi = Math.max(xi, xo);
    const panel = (zf: number, zr: number, topR: number, topF: number, lowR: number, lowF: number, zrTop = zr): void => {
      P.addEquipment(bucket, slab(
        [lo, lowR, zr], [hi, lowR, zr], [hi, lowF, zf], [lo, lowF, zf],
        [lo, topR, zrTop], [hi, topR, zrTop], [hi, topF, zf], [lo, topF, zf]));
    };
    // the front panel in two pieces at the hem's knee, so its foot follows the rising hem
    panel(edges[0], H.skirtHemRiseZ, skirtTopY(H.skirtHemRiseZ), skirtTopY(edges[0]), skirtHemY(H.skirtHemRiseZ), skirtHemY(edges[0]));
    panel(H.skirtHemRiseZ, edges[1] + 0.004, H.ledgeY, H.ledgeY, H.skirtLowY, H.skirtLowY);
    panel(edges[1] - 0.004, edges[2] + 0.004, H.ledgeY, H.ledgeY, H.skirtLowY, H.skirtLowY);
    panel(edges[2] - 0.004, edges[3] + 0.004, H.ledgeY, H.ledgeY, H.skirtLowY, H.skirtLowY);
    // the rear panel's edge raked with the rear plate (its foot further forward than its top)
    panel(edges[3] - 0.004, rakeZ(H.skirtLowY) - 0.01, H.ledgeY, H.ledgeY, H.skirtLowY, H.skirtLowY, rakeZ(H.ledgeY) - 0.01);
    for (const z of H.skirtJointZs) {
      P.add('hullDetail', box(0.016, H.ledgeY - H.skirtLowY - 0.06, 0.05), s * (sx1 + 0.006), (H.ledgeY + H.skirtLowY) / 2, z);
      // the hinge foot: a small diamond boss at the joint's foot (the elevation)
      P.add('hullDark', xform(box(0.02, 0.07, 0.07), 0, 0, 0, Math.PI / 4, 0, 0), s * (sx1 + 0.012), H.skirtLowY + 0.07, z);
    }
    for (let z = 3.05; z > rakeZ(H.ledgeY) + 0.1; z -= 0.42) {
      P.add('hullDark', cylX(0.020, 0.016, 8), s * (sx1 + 0.008), H.ledgeY - 0.05, z);
    }
  }
  yield 'buildTtdSkirts';

  // ---------------------------------------------------------------- hull fittings --
  const noseMid = (H.deck[6][1] + H.deck[7][1]) / 2, noseMidZ = (H.deck[6][0] + H.deck[7][0]) / 2;
  const onNose = (y: number): number => H.deck[6][0] + (H.deck[6][1] - y) / Math.tan(NOSE_SLOPE);
  for (const s of [-1, 1] as const) {
    const bx = s * (H.boxInnerX + H.skirtOutX) / 2, bw = H.skirtOutX - H.boxInnerX - 0.14;
    // the corner box's louvre grille across the top of its face, its lamp under it (the parade photograph)
    const gy = H.deck[6][1] + H.boxRiseM - 0.10, gz = onNose(gy - H.boxRiseM) + 0.012;
    P.add('hullDark', xform(box(bw, 0.012, 0.15), 0, 0, 0, NOSE_SLOPE, 0, 0), bx, gy, gz);
    for (let k = 0; k < 6; k++) {
      const f = (k - 2.5) * 0.024;
      P.add('hullDetail', xform(box(bw - 0.02, 0.016, 0.012), 0, 0, 0, NOSE_SLOPE, 0, 0), bx, gy + f * Math.sin(NOSE_SLOPE) * -1 + 0.004,
        gz + f * Math.cos(NOSE_SLOPE) + 0.004);
    }
    headlight(P, bx + s * 0.18, H.deck[7][1] + 0.02, H.noseZ + 0.02, 0, 0.045);
    // the towing lugs at the nose plate's foot
    P.add('hullDark', box(0.12, 0.10, 0.08), s * 0.72, H.lipY + 0.02, H.noseZ - rec + 0.02);
    P.add('hullDark', torus(0.05, 0.018, 12, 6), s * 0.72, H.lipY - 0.03, H.noseZ - rec + 0.05, Math.PI / 2, 0, 0);
    // the upper side's louvred exhaust box over the engine bay (the elevation: z -2.1 to -2.7)
    const ly = 1.60, lean = sideLean(-2.42), lx = s * (H.sponsonLedgeX - (ly - H.ledgeY) * Math.tan(lean) + 0.008);
    P.add('hullDark', xform(box(0.02, 0.20, 0.62), 0, 0, 0, 0, 0, s * lean), lx, ly, -2.42);
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', xform(box(0.03, 0.014, 0.58), 0, 0, 0, 0, 0, s * lean), lx + s * 0.008, ly - 0.07 + k * 0.035, -2.42);
    }
    // the lifting eyes on the deck's edge ahead and astern
    liftEye(P, 'hullDetail', s * 1.36, deckY(2.65) + 0.012, 2.65, s * 0.3);
    liftEye(P, 'hullDetail', s * 1.36, deckY(-3.35) + 0.012, -3.35, s * 2.8);
    // the rear plate's lights and the towing hooks at its foot
    const ry = 1.62, rz = rakeZ(ry) - 0.035, rake = -Math.atan2(H.rakeFootZ - H.sternTopZ, H.sternTopFootY - H.rakeFootY);
    P.add('hullDark', xform(box(0.22, 0.14, 0.06), 0, 0, 0, rake, 0, 0), s * 1.30, ry, rz);
    P.add('hullGlass', xform(box(0.14, 0.05, 0.012), 0, 0, 0, rake, 0, 0), s * 1.30, ry, rz - 0.035);
    P.add('hullDark', box(0.12, 0.14, 0.14), s * 0.78, H.rakeFootY + 0.08, rakeZ(H.rakeFootY + 0.08) - 0.05);
    P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.78, H.rakeFootY + 0.02, rakeZ(H.rakeFootY + 0.02) - 0.13, Math.PI / 2, 0, 0);
    // the panel seams on the deck flanks beside the turret
    for (const z of [1.30, -0.20]) P.add('hullDark', box(0.40, 0.008, 0.012), s * 1.38, deckY(z) + 0.003, z);
    P.add('hullDark', box(0.012, 0.008, 1.50), s * 1.18, deckY(0.55) + 0.003, 0.55);
  }
  // the trials number on the nose plate (the parade photograph: "TTD 001 M")
  const plateTilt = -(Math.PI / 2 - NOSE_SLOPE);
  P.decal('hull', 'stencil', 'TTD 001 M', 0.17, [0, noseMid - 0.04, noseMidZ - rec + 0.012 + 0.03], 0, plateTilt);
  // the driver's hatch right of the gun just ahead of the turret, his three episcopes in their raised block ahead of it
  // (the head-on and three-quarter photographs); low enough for the turret's swept front to pass over (deck + 6 cm)
  const dx = -0.36, dz = 2.30, glacis = Math.atan2(deckY(2.02) - deckY(3.55), 3.55 - 2.02);
  P.addCupola('hull', xform(cylY(0.27, 0.28, 0.03, P.q ? 22 : 14), 0, 0, 0, glacis, 0, 0), dx, deckY(dz) + 0.016, dz);
  P.add('hull', xform(box(0.58, 0.09, 0.16), 0, 0, 0, glacis, 0, 0), dx, deckY(2.64) + 0.045, 2.64);
  for (const ox of [-0.18, 0, 0.18]) {
    P.add('hullGlass', xform(box(0.13, 0.045, 0.012), 0, 0, 0, glacis, 0, 0), dx + ox, deckY(2.64) + 0.055, 2.725);
  }
  // the raised engine deck: two grille fields over the radiators, the access plate between them, the cooling grille
  // across its rear edge (flat: the bustle passes 3-10 cm over it), the stowage rails astern of the bustle's sweep
  const ey = H.deck[1][1];
  for (const s of [-1, 1] as const) {
    P.add('hullDark', box(0.82, 0.008, 1.10), s * 0.64, ey + 0.004, -2.75);
    for (let k = 0; k < 8; k++) P.add('hullDetail', box(0.82, 0.012, 0.035), s * 0.64, ey + 0.010, -2.27 - k * 0.135);
    P.add('hullDetail', box(0.04, 0.07, 0.95), s * 1.50, ey + 0.035, -3.25);
    P.add('hullDetail', box(0.30, 0.10, 0.20), s * 1.30, ey + 0.05, -3.62);
  }
  P.add('hullDetail', box(0.34, 0.016, 1.30), 0, ey + 0.008, -2.80);
  P.add('hullDark', box(2.60, 0.008, 0.16), 0, ey + 0.004, -3.58);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(2.56, 0.012, 0.03), 0, ey + 0.010, -3.53 - k * 0.05);
  P.add('hullDetail', box(2.70, 0.06, 0.04), 0, ey + 0.03, -3.78);
  // the ramp up to the engine deck: its seam
  P.add('hullDark', box(3.10, 0.010, 0.012), 0, deckY(-1.80) + 0.004, -1.80);
  yield 'buildTtdHullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(H.ring[0], H.ring[1], H.ring[2]);
  P.add('turret', cylY(1.02, 1.05, 0.10, P.q ? 28 : 18), 0, 0.01, 0);
  const hw = T.halfWidthM, fz = T.faceZ, slotHw = T.slotHalfWidthM;
  // the plan's corner cuts: the face's outer corners and the bustle's rear corners
  const halfW = (z: number): number => {
    if (z > fz - T.frontCornerM) return hw - (z - (fz - T.frontCornerM));
    if (z < T.rearFootZ + T.rearCornerM) return hw - (T.rearFootZ + T.rearCornerM - z);
    return hw;
  };
  const bodySection = (z: number, floor = turretFloorY(z), top = turretTopY(z), w = halfW(z)): SolidSection => {
    const c = 0.03;
    return { z, ring: [[-w, floor], [w, floor], [w, top - c], [w - c, top], [-(w - c), top], [-w, top - c]] };
  };
  // the body from the leaning rear plate to the slot's back: the bustle's floor rising over the engine deck
  P.add('turret', sectionSolid([
    bodySection(T.rearRoofZ, T.roofY - 0.04, T.roofY, hw - T.rearCornerM - 0.07),
    bodySection(T.rearFootZ),
    ...[T.rearFootZ + T.rearCornerM, T.bustleRearRiseZ, T.bustleStepZ[1], T.bustleStepZ[0], 0, T.slotBackZ].map((z) => bodySection(z)),
  ]));
  // the front's blocks either side of the mantlet's slot: upright faces under the roof's broad chamfer
  const cheekZs = [T.slotBackZ, fz - T.chamferBackM, fz - T.frontCornerM, fz];
  for (const s of [-1, 1] as const) {
    P.add('turret', sectionSolid(cheekZs.map((z) => {
      const w = halfW(z), top = turretTopY(z);
      return { z, ring: sided(s, [[slotHw, T.floorY], [w, T.floorY], [w, top - 0.02], [w - 0.02, top], [slotHw, top]]) };
    })));
    // the seams between the outer cheeks and the inner blocks, down the face and over the chamfer
    const ch = Math.atan2(T.chamferDownM, T.chamferBackM), cz = fz - T.chamferBackM / 2, cy = T.roofY - T.chamferDownM / 2;
    P.add('turretDark', box(0.014, turretTopY(fz) - T.floorY - 0.04, 0.010), s * T.innerBlockX, (turretTopY(fz) + T.floorY) / 2, fz + 0.004);
    P.add('turretDark', xform(box(0.014, 0.010, Math.hypot(T.chamferBackM, T.chamferDownM)), 0, 0, 0, ch, 0, 0),
      s * T.innerBlockX, cy + 0.004, cz + 0.003);
    // the inner block's vent grid on its chamfer (the head-on photograph: two rows of slots)
    const vx = s * (slotHw + T.innerBlockX) / 2;
    P.add('turretDark', xform(box(T.innerBlockX - slotHw - 0.08, 0.008, 0.11), 0, 0, 0, ch, 0, 0), vx, cy + 0.003, cz + 0.002);
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', xform(box(0.012, 0.012, 0.10), 0, 0, 0, ch, 0, 0), vx - 0.10 + k * 0.067, cy + 0.008, cz + 0.006);
    }
    // the outer cheek's bolted panel corners
    for (const [bx, by] of [[0.66, 0.12], [0.66, 0.52], [1.18, 0.12], [1.18, 0.52]] as const) {
      P.add('turretDark', cylZ(0.020, 0.014, 8), s * bx, by, fz + 0.006);
    }
    // the side's panel seam over the ring's rear and the bustle's stowage box (the elevation's "T0" box): flush on the
    // side, its lid seam and latches, the tank's number on it
    P.add('turretDark', box(0.010, T.roofY - turretFloorY(-0.97) - 0.06, 0.012), s * (hw + 0.004), (T.roofY + turretFloorY(-0.97)) / 2, -0.97);
    const binZ = -2.00, binL = 0.99, binY0 = 0.21, binY1 = 0.72;
    P.addEquipment('turret', box(0.10, binY1 - binY0, binL), s * (hw + 0.05), (binY0 + binY1) / 2, binZ);
    P.add('turretDark', box(0.012, 0.012, binL - 0.04), s * (hw + 0.104), binY1 - 0.07, binZ);
    for (const hz of [binZ + 0.30, binZ - 0.30]) P.add('turretDark', box(0.02, 0.06, 0.05), s * (hw + 0.106), binY1 - 0.13, hz);
    P.decal('turret', 'number', null, 0.26, [s * (hw + 0.104), 0.42, binZ], s * Math.PI / 2);
  }
  // the slot's back wall behind the mantlet (dark), and the roof's lifting eyes
  P.add('turretDark', box(2 * slotHw, T.roofY - T.floorY - 0.10, 0.012), 0, (T.roofY + T.floorY) / 2, T.slotBackZ + 0.004);
  for (const s of [-1, 1] as const) {
    liftEye(P, 'turretDetail', s * 1.18, T.roofY + 0.005, 0.95, s * 0.4);
    liftEye(P, 'turretDetail', s * 1.10, T.roofY + 0.005, -2.55, s * 2.7);
  }
  // the bustle's blow-off panel seams on the roof (TE)
  for (const x of [-0.70, 0.05, 0.80]) P.add('turretDark', box(0.012, 0.008, 0.95), x, T.roofY + 0.002, -2.05);
  P.add('turretDark', box(1.52, 0.008, 0.012), 0, T.roofY + 0.002, -1.575);
  yield 'buildTtdTurret';

  // ---------------------------------------------------------------- turret fittings --
  const roof = T.roofY;
  // the GS60 gunner's sight in its box at the roof's right front, its round window forward under a hood, a smaller box
  // outboard of it (the head-on and three-quarter photographs)
  P.addEquipment('turret', box(0.44, 0.24, 0.40), -0.62, roof + 0.12, 0.56);
  P.add('turretDark', cylZ(0.085, 0.02, seg), -0.62, roof + 0.13, 0.765);
  P.add('turretGlass', cylZ(0.065, 0.012, seg), -0.62, roof + 0.13, 0.776);
  P.add('turretDetail', box(0.46, 0.025, 0.12), -0.62, roof + 0.25, 0.73);
  P.addEquipment('turret', box(0.22, 0.17, 0.30), -0.98, roof + 0.085, 0.52);
  P.add('turretGlass', box(0.12, 0.06, 0.010), -0.98, roof + 0.10, 0.675);
  // the commander's sunken cupola behind it, six periscopes round it, the hatch on top; the CS60N's stabilised head on
  // the cupola's front, the roof's tallest point (the elevation's 2.80 m)
  const cx = -0.58, cz = -0.62, cr = 0.40;
  P.addCupola('turret', cylY(cr, cr + 0.03, 0.06, P.q ? 28 : 18), cx, roof + 0.03, cz);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    P.add('turretDetail', box(0.11, 0.07, 0.06), cx + Math.sin(a) * (cr - 0.02), roof + 0.085, cz + Math.cos(a) * (cr - 0.02), 0, a, 0);
    P.add('turretGlass', box(0.08, 0.035, 0.010), cx + Math.sin(a) * (cr + 0.012), roof + 0.085, cz + Math.cos(a) * (cr + 0.012), 0, a, 0);
  }
  P.addCupola('turret', cylY(cr - 0.08, cr - 0.06, 0.05, P.q ? 26 : 16), cx, roof + 0.085, cz);
  P.addEquipment('turret', cylY(0.11, 0.13, 0.08, P.q ? 18 : 12), cx, roof + 0.10, cz + 0.30);
  P.addEquipment('turret', box(0.30, 0.16, 0.32), cx, roof + 0.21, cz + 0.30);
  P.add('turretGlass', box(0.22, 0.09, 0.008), cx, roof + 0.22, cz + 0.30 + 0.162);
  P.add('turretDark', box(0.32, 0.025, 0.08), cx, roof + 0.295, cz + 0.30 + 0.14);
  // the loader's hatch on the left, his two periscopes ahead of it, his FN MAG on its pintle at the hatch's front
  const lx = 0.56, lz = -0.52;
  P.addCupola('turret', cylY(0.31, 0.32, 0.05, P.q ? 22 : 14), lx, roof + 0.025, lz);
  P.add('turretDark', torus(0.29, 0.010, 24, 4), lx, roof + 0.052, lz);
  for (const px of [0.36, 0.90]) periscope(P, 'turretDetail', px, roof + 0.03, 0.0, 0);
  P.add('turretDark', cylY(0.035, 0.045, 0.14, 10), lx + 0.12, roof + 0.07, lz + 0.36);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.86, elev: 0.06, shield: false, ammo: true,
    seed: 27500, feed: 'left', working: true, ridingCradle: true });
  mg.name = 'ttdLoaderMag';
  mg.position.set(lx + 0.12, roof + 0.15, lz + 0.36);
  mg.rotation.y = -0.10;
  P.turretG.add(mg);
  // the sensor mast behind the left inner block (the parade and mobility photographs), the ventilator astern
  P.add('turretDetail', cylY(0.032, 0.042, 0.50, 10), 0.34, roof + 0.25, 0.62);
  P.add('turretDetail', cylY(0.055, 0.055, 0.05, 12), 0.34, roof + 0.52, 0.62);
  P.add('turret', cylY(0.10, 0.13, 0.05, 16), 0.12, roof + 0.02, -1.25);
  // the two banks of four 81 mm dischargers on the roof's side edges a third back from the face, mouths forward and
  // raised, splayed out, behind the armour sheet standing over each wall's top edge (TE: "two banks of four ... behind an
  // armour sheet"; the elevation and the three-quarter photograph)
  for (const s of [-1, 1] as const) {
    const x = s * (hw - 0.21), z0 = -0.22;
    P.addEquipment('turret', box(0.20, 0.12, 0.56), x, roof + 0.06, z0 + 0.22);
    for (let k = 0; k < 4; k++) {
      const z = z0 + 0.02 + k * 0.14;
      P.add('turretDetail', markSmokeTube(cylZ(0.042, 0.24, 12)), x, roof + 0.19, z, -0.62, s * 0.30, 0);
      P.add('turretDark', cylZ(0.030, 0.245, 10), x, roof + 0.19, z, -0.62, s * 0.30, 0);
    }
    P.addEquipment('turret', box(0.03, 0.28, 0.66), s * (hw - 0.035), roof + 0.12, z0 + 0.22);
  }
  // the long tube on the roof's left aft (the elevation), on two brackets
  P.add('turretDetail', cylZ(0.05, 0.94, 12), 0.98, roof + 0.16, -1.80);
  for (const z of [-1.45, -2.15]) P.add('turretDark', box(0.06, 0.12, 0.05), 0.98, roof + 0.07, z);
  // the two whips at the bustle's rear corners (the parade photograph)
  for (const s of [-1, 1] as const) {
    P.add('turretDetail', cylY(0.04, 0.05, 0.07, 10), s * 1.02, roof + 0.03, -2.60);
    P.addEquipment('turret', antennaPart(cylY(0.012, 0.015, 2.0, 8)), s * 1.02, roof + 1.06, -2.60, 0, 0, s * 0.03);
  }
  yield 'buildTtdTurretFittings';

  // ---------------------------------------------------------------- mantlet and gun --
  const [, gy, gz] = T.trunnion;
  P.gunG.position.set(0, gy, gz);
  // the tall mantlet in the slot, its face 7 cm behind the cheeks', its top in the chamfer band; the gun low in it in its
  // collar; the coaxial Browning's port beside the gun, the seam across its upper part (the head-on photographs)
  const mFace = fz - 0.07 - gz, mBack = T.slotBackZ - gz - 0.05, mLo = -0.33, mHi = 0.29;
  P.addGunExtra(box(2 * slotHw - 0.03, mHi - mLo, mFace - mBack), 0, (mHi + mLo) / 2, (mFace + mBack) / 2);
  P.addGunExtraDark(box(2 * slotHw - 0.02, 0.012, 0.012), 0, 0.14, mFace + 0.003);
  P.addGunExtraDark(cylZ(0.022, 0.03, 8), 0.115, 0.18, mFace + 0.008);
  P.addGunExtra(cylZ(0.165, 0.20, seg, 0.17), 0, 0, mFace + 0.08);
  // the 105 mm GT3: the thermal sleeve's thick root, the fume extractor, the slimmer fore sleeve with its bands, the muzzle
  // reference unit on top at the muzzle; the muzzle 4.02 m ahead of the trunnion
  const len = T.barrelM, r0 = T.barrelRadiusM, ez0 = 1.38, ez1 = 2.07, r1 = 0.095;
  P.add('gun', cylZ(r0, ez0 - mBack, seg), 0, 0, (ez0 + mBack) / 2);
  P.add('gunDark', cylZ(r0 + 0.004, 0.022, seg), 0, 0, 0.98);
  P.add('gun', cylZ(0.135, 0.06, seg, r0), 0, 0, ez0 + 0.03);
  P.add('gun', cylZ(0.135, ez1 - ez0 - 0.12, seg), 0, 0, (ez0 + ez1) / 2);
  P.add('gun', cylZ(r1 + 0.004, 0.06, seg, 0.135), 0, 0, ez1 - 0.03);
  P.add('gun', cylZ(r1 - 0.006, len - 0.14 - ez1, seg, r1), 0, 0, (ez1 + len - 0.14) / 2);
  for (const z of [2.75, 3.35]) P.add('gunDark', cylZ(r1 + 0.002, 0.02, seg), 0, 0, z);
  P.add('gun', cylZ(0.088, 0.14, seg), 0, 0, len - 0.07);
  P.add('gun', box(0.06, 0.06, 0.10), 0, 0.12, len - 0.10);
  P.add('gunDark', cylZ(0.02, 0.012, 8), 0, 0.12, len - 0.045);
  muzzleBore(P, { z: len + 0.004, r: 0.0525 });
  P.muzzleZ = len;
  P.gunG.userData.ttdGunReceipt = Object.freeze({ caliberMm: 105, calibres: 51, muzzleZ: len, fumeExtractor: true, sleeve: true,
    muzzleReference: true });
  P.turretG.userData.ttdTurretReceipt = Object.freeze({
    revision: 'ttd-275-own', base: 'ttd', roofY: T.roofY, halfWidthM: hw, faceZ: fz, bustleRearZ: T.rearRoofZ,
    frontBlocks: 5, dischargers: 8, sheetedDischargers: true, sunkenCupola: true, loaderMG: 'mag', trialsNumber: 'TTD 001 M',
  });
  P.mats.glass.color.setHex(0x3a463f);
  P.topY = H.ring[1];
  yield 'buildTtdGun';
}

/** The TTD on its own construction: hull, gear, skirts and fittings, the turret and its kit, the mantlet and the GT3. */
export const buildTtd = steppedBuilder((P: TankBuilderPort) => buildTtdSteps(P));

/** The TTD's datums for its fixture (profiles/southAfrica.selftest.mjs): its own hull, the road wheels, the muzzle's station
 * ahead of the hull's middle with the gun level. */
export const TTD_DATUMS = Object.freeze({ hull: H, turret: T, roadWheelZs: H.wheelZs, muzzleHullZ: TTD_MUZZLE_HULL_Z });
