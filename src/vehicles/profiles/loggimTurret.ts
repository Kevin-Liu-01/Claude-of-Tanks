// The Project Loggim turret: the TTD's long welded slab-sided turret (Lyttelton Engineering Works, 1992) and the
// Olifant Mk 2's turret that LIW derived from it (Kevin, 2026-11-24: "the ttd turret is more accurate for what the
// olifant turrets are suposed to look like. update the olifant mk 2"). One construction for both: the body with its
// five-block front under the roof's broad chamfer, the bustle's floor rising over the engine deck, the side stowage boxes,
// the roof's sights, cupolas, hatch and FN MAG, the two sheeted banks of four 81 mm dischargers, the tall mantlet in its
// slot and the 105 mm GT3 in its thermal sleeve. Ring frame; each tank brings its own datums (the TTD's are ttdArmor.ts
// TTD_TURRET; the Olifant Mk 2's the same body seated 0.18 m higher on the Centurion's ring with the L7-length GT3).
// A +Z hull's right is -X: the commander and the gunner sit at -X, the loader at +X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** A Loggim turret's datums, ring frame (metres from the ring's centre). */
export interface LoggimTurretDatums {
  /** Half-width of the slab sides, the roof, the floor under the front. */
  readonly halfWidthM: number; readonly roofY: number; readonly floorY: number;
  /** The face and the broad chamfer along the roof's front edge. */
  readonly faceZ: number; readonly chamferBackM: number; readonly chamferDownM: number;
  /** The front's blocks: the outer cheeks from the inner blocks' edge out, the mantlet's slot between them. */
  readonly innerBlockX: number; readonly slotHalfWidthM: number; readonly slotBackZ: number;
  /** The plan's corner cuts at the face and the bustle. */
  readonly frontCornerM: number; readonly rearCornerM: number;
  /** The bustle: the floor rising behind the ring and again to the rear; the rear plate leans back to the roof. */
  readonly bustleStepZ: readonly [number, number]; readonly bustleFloorY: number; readonly bustleRearRiseZ: number;
  readonly rearFloorY: number; readonly rearRoofZ: number; readonly rearFootZ: number;
  /** The GT3's trunnion, the muzzle `barrelM` ahead of it. */
  readonly trunnion: readonly [number, number, number];
  readonly barrelM: number; readonly barrelRadiusM: number;
}

/** The GT3's fittings along the tube (metres ahead of the trunnion): the band on the sleeve's root, the fume extractor's
 * ends and the fore sleeve's bands. */
export interface LoggimGunFit {
  readonly rootBandZ: number;
  readonly extractorZ: readonly [number, number];
  readonly bandZs: readonly number[];
}

/** The TTD's own: the root band at 0.98 m, the extractor 1.38-2.07 m out, the bands at 2.75 and 3.35 m. */
export const TTD_GUN_FIT: LoggimGunFit = Object.freeze({ rootBandZ: 0.98, extractorZ: Object.freeze([1.38, 2.07] as const), bandZs: Object.freeze([2.75, 3.35]) });

/** The TTD drew its absolute heights with its floor 2 cm over the ring; a turret seated higher lifts them with its floor. */
const liftOf = (T: LoggimTurretDatums): number => T.floorY - 0.02;

/** Roof height at z: the broad chamfer along the front edge down to the face's top. */
function topY(T: LoggimTurretDatums, z: number): number {
  const c0 = T.faceZ - T.chamferBackM;
  return z <= c0 ? T.roofY : T.roofY - (z - c0) / T.chamferBackM * T.chamferDownM;
}

/** The floor at z: level under the front, rising behind the ring, level, rising again to the rear plate. */
function floorY(T: LoggimTurretDatums, z: number): number {
  const [s0, s1] = T.bustleStepZ;
  if (z >= s0) return T.floorY;
  if (z >= s1) return T.floorY + (s0 - z) / (s0 - s1) * (T.bustleFloorY - T.floorY);
  if (z >= T.bustleRearRiseZ) return T.bustleFloorY;
  return T.bustleFloorY + (T.bustleRearRiseZ - z) / (T.bustleRearRiseZ - T.rearFootZ) * (T.rearFloorY - T.bustleFloorY);
}

/** A contour (counter-clockwise seen from ahead) for the +X side; the -X side mirrors and reverses it. */
const sided = (s: 1 | -1, pts: SectionPoint[]): SectionPoint[] => (s > 0 ? pts : pts.map(([x, y]) => [-x, y] as SectionPoint).reverse());

/** The turret's body: the ring's collar, the slab-sided body from the leaning rear plate to the slot, the five-block
 * front, the side seams and stowage boxes (the tank's number on them), the slot's back wall, the lifting eyes and the
 * bustle's blow-off seams. */
export function buildLoggimTurretBody(P: TankBuilderPort, T: LoggimTurretDatums): void {
  const { box, cylY, cylZ, xform, liftEye } = KIT;
  const lift = liftOf(T);
  // the ring's collar, down to the deck under a turret seated higher
  P.add('turret', cylY(1.02, 1.05, 0.10 + lift, P.q ? 28 : 18), 0, 0.01 + lift / 2, 0);
  const hw = T.halfWidthM, fz = T.faceZ, slotHw = T.slotHalfWidthM;
  // the plan's corner cuts: the face's outer corners and the bustle's rear corners
  const halfW = (z: number): number => {
    if (z > fz - T.frontCornerM) return hw - (z - (fz - T.frontCornerM));
    if (z < T.rearFootZ + T.rearCornerM) return hw - (T.rearFootZ + T.rearCornerM - z);
    return hw;
  };
  const bodySection = (z: number, floor = floorY(T, z), top = topY(T, z), w = halfW(z)): SolidSection => {
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
      const w = halfW(z), top = topY(T, z);
      return { z, ring: sided(s, [[slotHw, T.floorY], [w, T.floorY], [w, top - 0.02], [w - 0.02, top], [slotHw, top]]) };
    })));
    // the seams between the outer cheeks and the inner blocks, down the face and over the chamfer
    const ch = Math.atan2(T.chamferDownM, T.chamferBackM), cz = fz - T.chamferBackM / 2, cy = T.roofY - T.chamferDownM / 2;
    P.add('turretDark', box(0.014, topY(T, fz) - T.floorY - 0.04, 0.010), s * T.innerBlockX, (topY(T, fz) + T.floorY) / 2, fz + 0.004);
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
      P.add('turretDark', cylZ(0.020, 0.014, 8), s * bx, by + lift, fz + 0.006);
    }
    // the front block's joint down the side (the elevation), the side's panel seam over the ring's rear and the bustle's
    // stowage box (the elevation's "T0" box): flush on the side, its lid seam and latches, the tank's number on it
    P.add('turretDark', box(0.010, T.roofY - floorY(T, -0.97) - 0.06, 0.012), s * (hw + 0.004), (T.roofY + floorY(T, -0.97)) / 2, -0.97);
    P.add('turretDark', box(0.010, T.roofY - T.floorY - 0.06, 0.012), s * (hw + 0.004), (T.roofY + T.floorY) / 2, T.slotBackZ);
    const binZ = -2.00, binL = 0.99, binY0 = 0.21 + lift, binY1 = 0.72 + lift;
    P.addEquipment('turret', box(0.10, binY1 - binY0, binL), s * (hw + 0.05), (binY0 + binY1) / 2, binZ);
    P.add('turretDark', box(0.012, 0.012, binL - 0.04), s * (hw + 0.104), binY1 - 0.07, binZ);
    for (const hz of [binZ + 0.30, binZ - 0.30]) P.add('turretDark', box(0.02, 0.06, 0.05), s * (hw + 0.106), binY1 - 0.13, hz);
    P.decal('turret', 'number', null, 0.26, [s * (hw + 0.104), 0.42 + lift, binZ], s * Math.PI / 2);
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
}

/** The roof's kit: the GS60 gunner's sight, the commander's sunken cupola with the stabilised head, the loader's hatch
 * and FN MAG (`mgName` names the pintle group), the sensor mast, the ventilator, the two sheeted discharger banks, the
 * roof tube and the two whips. */
export function buildLoggimTurretFittings(P: TankBuilderPort, T: LoggimTurretDatums, mgName: string, mgSeed: number): void {
  const { box, cylY, cylZ, torus, periscope } = KIT;
  const roof = T.roofY, hw = T.halfWidthM;
  // the GS60 gunner's sight in its box at the roof's right front, its broad window forward under a hood, a smaller box
  // outboard of it (the head-on and three-quarter photographs)
  P.addEquipment('turret', box(0.44, 0.24, 0.40), -0.62, roof + 0.12, 0.56);
  P.add('turretDark', box(0.34, 0.15, 0.02), -0.62, roof + 0.13, 0.765);
  P.add('turretGlass', box(0.30, 0.11, 0.012), -0.62, roof + 0.13, 0.776);
  P.add('turretDetail', box(0.46, 0.025, 0.12), -0.62, roof + 0.25, 0.73);
  P.addEquipment('turret', box(0.22, 0.17, 0.30), -0.98, roof + 0.085, 0.52);
  P.add('turretGlass', box(0.12, 0.06, 0.010), -0.98, roof + 0.10, 0.675);
  // the commander's sunken cupola behind it, six periscopes round it, the hatch on top; the stabilised head on the
  // cupola's front, the roof's tallest point (the TTD's elevation: 2.80 m)
  const cx = -0.58, cz = -0.62, cr = 0.40;
  P.addCupola('turret', cylY(cr, cr + 0.04, 0.09, P.q ? 28 : 18), cx, roof + 0.045, cz);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    P.add('turretDetail', box(0.11, 0.07, 0.06), cx + Math.sin(a) * (cr - 0.02), roof + 0.125, cz + Math.cos(a) * (cr - 0.02), 0, a, 0);
    P.add('turretGlass', box(0.08, 0.035, 0.010), cx + Math.sin(a) * (cr + 0.012), roof + 0.125, cz + Math.cos(a) * (cr + 0.012), 0, a, 0);
  }
  P.addCupola('turret', cylY(cr - 0.08, cr - 0.06, 0.05, P.q ? 26 : 16), cx, roof + 0.10, cz);
  P.addEquipment('turret', cylY(0.11, 0.13, 0.08, P.q ? 18 : 12), cx, roof + 0.10, cz + 0.30);
  P.addEquipment('turret', box(0.30, 0.16, 0.32), cx, roof + 0.21, cz + 0.30);
  P.add('turretGlass', box(0.22, 0.09, 0.008), cx, roof + 0.22, cz + 0.30 + 0.162);
  P.add('turretDark', box(0.32, 0.025, 0.08), cx, roof + 0.295, cz + 0.30 + 0.14);
  // the loader's hatch on the left, his two periscopes ahead of it, his FN MAG on its pintle at the hatch's front
  const lx = 0.56, lz = -0.52;
  P.addCupola('turret', cylY(0.33, 0.35, 0.08, P.q ? 22 : 14), lx, roof + 0.04, lz);
  P.add('turret', cylY(0.27, 0.30, 0.05, P.q ? 22 : 14), lx, roof + 0.105, lz);
  P.add('turretDark', torus(0.30, 0.010, 24, 4), lx, roof + 0.082, lz);
  P.add('turretDetail', box(0.30, 0.06, 0.08), lx, roof + 0.10, lz - 0.30);
  P.add('turretDetail', box(0.16, 0.025, 0.03), lx + 0.06, roof + 0.142, lz + 0.10);
  for (const px of [0.36, 0.90]) periscope(P, 'turretDetail', px, roof + 0.03, 0.0, 0);
  P.add('turretDark', cylY(0.035, 0.045, 0.14, 10), lx + 0.12, roof + 0.07, lz + 0.36);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.86, elev: 0.06, shield: false, ammo: true,
    seed: mgSeed, feed: 'left', working: true, ridingCradle: true });
  mg.name = mgName;
  mg.position.set(lx + 0.12, roof + 0.15, lz + 0.36);
  mg.rotation.y = -0.10;
  P.turretG.add(mg);
  // the sensor mast behind the left inner block, its head about 0.6 m over the roof (the parade and mobility
  // photographs); the ventilator astern
  P.add('turretDetail', cylY(0.040, 0.050, 0.48, 10), 0.34, roof + 0.24, 0.62);
  P.add('turretDetail', cylY(0.070, 0.070, 0.09, 14), 0.34, roof + 0.525, 0.62);
  P.add('turretDark', cylY(0.040, 0.070, 0.03, 14), 0.34, roof + 0.585, 0.62);
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
}

/** The tall mantlet in the slot and the 105 mm GT3 on the trunnion; returns the muzzle's distance ahead of it. */
export function buildLoggimMantletAndGun(P: TankBuilderPort, T: LoggimTurretDatums, fit: LoggimGunFit): number {
  const { box, cylZ } = KIT;
  const seg = P.q ? 24 : 14, fz = T.faceZ, slotHw = T.slotHalfWidthM;
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
  // reference unit on top at the muzzle
  const len = T.barrelM, r0 = T.barrelRadiusM, [ez0, ez1] = fit.extractorZ, r1 = 0.104;
  P.add('gun', cylZ(r0, ez0 - mBack, seg), 0, 0, (ez0 + mBack) / 2);
  P.add('gunDark', cylZ(r0 + 0.004, 0.022, seg), 0, 0, fit.rootBandZ);
  P.add('gun', cylZ(0.135, 0.06, seg, r0), 0, 0, ez0 + 0.03);
  P.add('gun', cylZ(0.135, ez1 - ez0 - 0.12, seg), 0, 0, (ez0 + ez1) / 2);
  P.add('gun', cylZ(r1 + 0.004, 0.06, seg, 0.135), 0, 0, ez1 - 0.03);
  P.add('gun', cylZ(r1 - 0.006, len - 0.14 - ez1, seg, r1), 0, 0, (ez1 + len - 0.14) / 2);
  for (const z of fit.bandZs) P.add('gunDark', cylZ(r1 + 0.002, 0.02, seg), 0, 0, z);
  P.add('gun', cylZ(0.096, 0.14, seg), 0, 0, len - 0.07);
  P.add('gun', box(0.06, 0.06, 0.10), 0, 0.12, len - 0.10);
  P.add('gunDark', cylZ(0.02, 0.012, 8), 0, 0.12, len - 0.045);
  muzzleBore(P, { z: len + 0.004, r: 0.0525 });
  P.muzzleZ = len;
  return len;
}
