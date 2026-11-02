// The Olifant TTD, Tank Technology Demonstrator (release 269; Main's ruling 2026-11-02 on the owner's "flesh out south
// african and australian tank trees"; docs/references/tanks/ttd.md): Project Loggim's one prototype, finished in 1992
// (Reumech OMC the hull, Lyttelton Engineering Works the turret and gun) and at the SA Armour Museum since 1996-97. A
// photo-class build: tanks-encyclopedia's figures (hull 7.78 x 3.62 x 2.99 m, 58.3 t, seven dual road wheels on
// Leopard 2-type torsion bars, four return rollers, the rear sprocket, the 51-calibre 105 mm GT3 in its thermal sleeve
// with the muzzle reference system, a sunken commander's cupola on the right, two banks of four 81 mm dischargers behind
// an armour sheet, blow-off panels in the bustle), measured on D. Bocquelet's side elevation (scaled on the hull, the
// seven road wheels' 0.81 m pitch) and checked on the parade, mobility and top-down photographs: the long 12-degree
// upper glacis to a 1.72 m deck, the engine deck raised 0.26 m behind the turret, the skirts from 1.66 m to 0.78 m,
// the slab-sided turret 2.90 m wide with flat cheeks either side of the gun's slot, its bustle's underside rising over
// the engine deck, the bins on its sides. A +Z hull's right is -X: the commander and gunner sit at -X, the loader at +X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// ------------------------------------------------------------------------------------------------- datums --
const H = Object.freeze({
  noseZ: 3.89, sternZ: -3.89, bellyY: 0.50, lowerX: 1.00, sponsonX: 1.68, sponsonFloorY: 1.00,
  deckY: 1.72, noseY: 1.30, lipY: 1.22, kneeZ: 1.90, lowerGlacisZ: 3.30, rearBellyZ: -3.55, rearPlateY: 0.95,
  // the raised engine deck: its ramp from the fighting compartment's deck, its top, the rear plate's top edge
  rampZ0: -1.85, rampZ1: -2.15, engineY: 1.98, sternTopZ: -3.72, sternTopY: 1.90,
  skirtX: 1.81, skirtTop: 1.66, skirtLow: 0.78, trackXc: 1.36, trackW: 0.62,
});
const ROAD_WHEEL_ZS = [2.60, 1.79, 0.98, 0.17, -0.64, -1.45, -2.26];
const RING = Object.freeze({ y: H.deckY, z: 0.40 });
/** The turret, ring frame: the slab sides and roof, the cheeks' faces and the gun's slot, the bustle. */
const T = Object.freeze({ hw: 1.45, roofY: 0.84, chamfer: 0.06, floorY: 0.06, faceZ: 1.60, slotZ: 1.32, slotHw: 0.42,
  cornerCut: 0.14, rearZ: -2.78, bustleZ: -1.50, bustleFloorY: 0.32 });
const TRUNNION = Object.freeze({ y: 0.52, z: 1.20 });
/** The 105 mm GT3's 51 calibres: the muzzle 3.92 m ahead of the trunnion (Bocquelet: 1.63 m past the nose). */
const GUN_LEN = 3.92;

/** Deck height at z: the upper glacis from the nose to the knee, the flat deck, the ramp, the raised engine deck and the
 * rear plate's top edge falling to the stern. */
function deckY(z: number): number {
  if (z >= H.kneeZ) return H.noseY + (H.noseZ - z) * (H.deckY - H.noseY) / (H.noseZ - H.kneeZ);
  if (z >= H.rampZ0) return H.deckY;
  if (z >= H.rampZ1) return H.deckY + (H.rampZ0 - z) / (H.rampZ0 - H.rampZ1) * (H.engineY - H.deckY);
  if (z >= H.sternTopZ) return H.engineY;
  return H.engineY + (H.sternTopZ - z) / (H.sternTopZ - H.sternZ) * (H.sternTopY - H.engineY);
}

/** Belly height at z: the lower glacis from the nose's lip, the flat belly, the lower rear plate. */
function bellyY(z: number): number {
  if (z >= H.lowerGlacisZ) return H.bellyY + (z - H.lowerGlacisZ) / (H.noseZ - H.lowerGlacisZ) * (H.lipY - H.bellyY);
  if (z >= H.rearBellyZ) return H.bellyY;
  return H.bellyY + (H.rearBellyZ - z) / (H.rearBellyZ - H.sternZ) * (H.rearPlateY - H.bellyY);
}

/** The turret's floor at z (ring frame): level under the body, rising over the bustle to clear the engine deck. */
function turretFloor(z: number): number {
  if (z >= T.bustleZ) return T.floorY;
  return T.floorY + Math.min(1, (T.bustleZ - z) / 0.55) * (T.bustleFloorY - T.floorY);
}

function* buildTtdSteps(P: TankBuilderPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ, torus, xform, buildRunningGear, buildGun, headlight, liftEye, periscope } = KIT;
  const slab = orientedSlab;

  // ---------------------------------------------------------------- hull --
  // the hull's stations: every break in the deck and the belly
  const ZS = [H.sternZ, H.sternTopZ, H.rearBellyZ, -3.20, H.rampZ1, H.rampZ0, 0, H.kneeZ, 2.60, H.lowerGlacisZ, 3.60, H.noseZ]
    .sort((a, b) => a - b);
  // the lower hull between the tracks, belly to deck
  P.add('hull', sectionSolid(ZS.map((z) => ({ z, ring: [[-H.lowerX, bellyY(z)], [H.lowerX, bellyY(z)], [H.lowerX, deckY(z)],
    [-H.lowerX, deckY(z)]] as SectionPoint[] }))));
  // the sponsons over the tracks, their floor to the deck, a chamfer along the top outer edge; they run forward over the
  // idlers to the front fender corners
  const sponsonZs = ZS.filter((z) => z <= 3.60);
  for (const s of [-1, 1] as const) {
    const ring = (z: number): SectionPoint[] => {
      const top = deckY(z), ch = 0.03;
      const pts: SectionPoint[] = [[H.lowerX - 0.01, H.sponsonFloorY], [H.sponsonX, H.sponsonFloorY], [H.sponsonX, top - ch],
        [H.sponsonX - ch, top], [H.lowerX - 0.01, top]];
      return s > 0 ? pts : pts.map(([x, y]) => [-x, y] as SectionPoint).reverse();
    };
    P.add('hull', sectionSolid(sponsonZs.map((z) => ({ z, ring: ring(z) }))));
    // the fender shelf over the skirts' tops, the sponsons' full length
    P.add('hullDetail', box(H.skirtX - H.sponsonX + 0.01, 0.03, 3.60 - H.sternZ - 0.10), s * (H.sponsonX + H.skirtX) / 2,
      H.skirtTop + 0.015, (3.60 + H.sternZ + 0.10) / 2);
  }
  // the nose's lip band where the glacis plates meet
  P.add('hullDetail', box(H.lowerX * 2, 0.05, 0.04), 0, (H.lipY + H.noseY) / 2, H.noseZ - 0.01);
  yield 'buildTtdHull';

  // ---------------------------------------------------------------- running gear (seven a side on torsion bars) --
  const roadWheelR = 0.33, roadWheelY = 0.40;
  buildRunningGear(P, {
    style: 'dished', wheelR: roadWheelR, wheelW: 0.40, wheelY: roadWheelY, xc: H.trackXc, wheelZs: [...ROAD_WHEEL_ZS],
    sprocket: { z: -3.40, y: 0.62, r: 0.31 }, idler: { z: 3.36, y: 0.60, r: 0.29 },
    rollers: [2.20, 0.58, -1.04, -2.66].map((z) => ({ z, y: 0.84, r: 0.085 })),
    trackW: H.trackW, topY: 0.89, botY: 0.03, contactZF: ROAD_WHEEL_ZS[0], contactZR: ROAD_WHEEL_ZS.at(-1),
    paintedEnds: true, coveredTop: true, arms: true, sprocketTeeth: true,
  });
  P.mats.rubber.color.setHex(0x2f312b);
  yield 'buildTtdRunningGear';

  // ---------------------------------------------------------------- skirts --
  // seven armoured panels a side from the sprocket to the idler, their joints bolted, and the front panel raked up to the
  // nose (Bocquelet's elevation: the joints at 0.96 m, a lamp-shaped bolt boss on each joint's foot)
  const skirtRear = -3.62, skirtFront = 3.10, pitch = (skirtFront - skirtRear) / 7, t = 0.06;
  for (const s of [-1, 1] as const) {
    const bucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', x = s * (H.skirtX - t / 2);
    for (let k = 0; k < 7; k++) {
      const z1 = skirtRear + (k + 1) * pitch - 0.004, z0 = skirtRear + k * pitch + 0.004;
      // (the rearmost panel's hem rises over the sprocket)
      const low0 = k === 0 ? H.skirtLow + 0.20 : H.skirtLow;
      P.addEquipment(bucket, slab(
        [x - t / 2, low0, z0], [x + t / 2, low0, z0], [x + t / 2, H.skirtLow, z1], [x - t / 2, H.skirtLow, z1],
        [x - t / 2, H.skirtTop, z0], [x + t / 2, H.skirtTop, z0], [x + t / 2, H.skirtTop, z1], [x - t / 2, H.skirtTop, z1]));
      if (k > 0) {
        P.add('hullDetail', box(0.016, H.skirtTop - H.skirtLow - 0.06, 0.05), s * (H.skirtX + 0.006), (H.skirtTop + H.skirtLow) / 2, z0);
        P.add('hullDark', cylX(0.03, 0.02, 8), s * (H.skirtX + 0.012), H.skirtLow + 0.07, z0);
      }
      for (const f of [0.25, 0.75]) P.add('hullDark', cylX(0.022, 0.016, 8), s * (H.skirtX + 0.008), H.skirtTop - 0.08, z0 + (z1 - z0) * f);
    }
    // the front panel: its hem rising from the skirt line to the front fender's corner
    P.addEquipment(bucket, slab(
      [x - t / 2, H.skirtLow, skirtFront], [x + t / 2, H.skirtLow, skirtFront], [x + t / 2, 1.30, 3.62], [x - t / 2, 1.30, 3.62],
      [x - t / 2, H.skirtTop, skirtFront], [x + t / 2, H.skirtTop, skirtFront], [x + t / 2, H.skirtTop, 3.62], [x - t / 2, H.skirtTop, 3.62]));
    P.add('hullDetail', box(0.016, H.skirtTop - H.skirtLow - 0.06, 0.05), s * (H.skirtX + 0.006), (H.skirtTop + H.skirtLow) / 2, skirtFront);
    P.hangMudguard('ttd-rear-flap', 'hullRubber', box(0.60, 0.40, 0.012), s * H.trackXc, 1.02, -3.80);
  }
  yield 'buildTtdSkirts';

  // ---------------------------------------------------------------- hull fittings --
  const glacis = Math.atan2(H.deckY - H.noseY, H.noseZ - H.kneeZ);
  for (const s of [-1, 1] as const) {
    // the front fender corners' armoured lamp boxes, a louvred grille on each one's face and the lamp under it (the parade
    // and top-down photographs)
    const lx = s * 1.40, lz = 3.40, ly = deckY(lz) + 0.12;
    P.addEquipment('hull', box(0.46, 0.26, 0.40), lx, ly, lz);
    P.add('hullDark', box(0.36, 0.14, 0.012), lx, ly + 0.03, lz + 0.205);
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.36, 0.012, 0.03), lx, ly - 0.03 + k * 0.03, lz + 0.215);
    headlight(P, lx, ly - 0.08, lz + 0.20, 0, 0.05);
    // the towing eyes on the lower nose plate
    P.add('hullDark', box(0.14, 0.14, 0.10), s * 0.66, 0.92, 3.62);
    P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.66, 0.84, 3.66, Math.PI / 2, 0, 0);
    liftEye(P, 'hullDetail', s * 1.20, deckY(2.80) + 0.012, 2.80, s * 0.3);
    // the exhaust louvres on the raised engine deck's sides, over the fenders (Bocquelet's elevation)
    P.add('hullDark', box(0.012, 0.18, 0.70), s * (H.sponsonX + 0.006), 1.84, -2.70);
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.03, 0.012, 0.66), s * (H.sponsonX + 0.012), 1.77 + k * 0.035, -2.70);
    // the rear plate's lights and towing hooks
    P.add('hullDark', box(0.20, 0.14, 0.06), s * 1.32, 1.70, H.sternZ - 0.02);
    P.add('hullGlass', box(0.12, 0.05, 0.012), s * 1.32, 1.70, H.sternZ - 0.055);
    P.add('hullDark', box(0.12, 0.14, 0.10), s * 0.80, 1.10, H.sternZ - 0.03);
    // (KIT's torus lies flat: turned on X its ring faces rearward against the plate)
    P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.80, 1.04, H.sternZ - 0.07, Math.PI / 2, 0, 0);
  }
  // the driver's hatch and his three periscopes on the glacis' right, ahead of the turret
  const dz = 2.55, dx = -0.58;
  P.addCupola('hull', xform(cylY(0.28, 0.29, 0.03, P.q ? 22 : 14), 0, 0, 0, glacis, 0, 0), dx, deckY(dz) + 0.012, dz);
  for (const ox of [-0.16, 0, 0.16]) periscope(P, 'hullDetail', dx + ox, deckY(2.88) + 0.03, 2.88, 0);
  // the raised engine deck: two grille fields over the radiators and the access plate between them, the cooling grille
  // across its rear edge
  for (const s of [-1, 1] as const) {
    P.add('hullDark', box(0.86, 0.012, 1.20), s * 0.66, H.engineY + 0.006, -2.85);
    for (let k = 0; k < 9; k++) P.add('hullDetail', box(0.86, 0.016, 0.035), s * 0.66, H.engineY + 0.014, -2.35 - k * 0.125);
  }
  P.add('hullDetail', box(0.36, 0.02, 1.40), 0, H.engineY + 0.01, -2.85);
  P.add('hullDark', box(2.60, 0.012, 0.16), 0, H.engineY + 0.006, -3.60);
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(2.56, 0.014, 0.03), 0, H.engineY + 0.013, -3.55 - k * 0.05);
  // the convoy light on the rear plate
  P.add('hullDetail', box(0.18, 0.12, 0.06), 0, 1.62, H.sternZ - 0.02);
  P.add('hullGlass', box(0.10, 0.04, 0.012), 0, 1.62, H.sternZ - 0.055);
  yield 'buildTtdHullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, RING.y, RING.z);
  // the ring collar on the race
  P.add('turret', cylY(1.00, 1.03, 0.10, P.q ? 28 : 18), 0, 0.01, 0);
  const sec = (z: number, hw: number, floor: number, roof: number): SolidSection => {
    const c = T.chamfer;
    return { z, ring: [[-hw, floor], [hw, floor], [hw, roof - c], [hw - c, roof], [-(hw - c), roof], [-hw, roof - c]] };
  };
  // the body: the bustle's rear plate leaning in at its foot, the floor rising over the engine deck, the full width to the
  // slot's back
  P.add('turret', sectionSolid([
    sec(T.rearZ, T.hw - 0.06, T.bustleFloorY + 0.10, T.roofY - 0.04),
    sec(T.rearZ + 0.14, T.hw, T.bustleFloorY, T.roofY),
    ...[-2.05, -1.80, T.bustleZ, 0, T.slotZ].map((z) => sec(z, T.hw, turretFloor(z), T.roofY)),
  ]));
  // the cheeks either side of the gun's slot: flat vertical faces, the outer corner cut back in plan
  for (const s of [-1, 1] as const) {
    const cheek = (z: number, xo: number): SolidSection => {
      const c = T.chamfer;
      const ring: SectionPoint[] = [[T.slotHw, T.floorY], [xo, T.floorY], [xo, T.roofY - c], [xo - c, T.roofY], [T.slotHw, T.roofY]];
      return { z, ring: s > 0 ? ring : ring.map(([x, y]) => [-x, y] as SectionPoint).reverse() };
    };
    P.add('turret', sectionSolid([cheek(T.slotZ, T.hw), cheek(T.faceZ - T.cornerCut, T.hw), cheek(T.faceZ, T.hw - T.cornerCut)]));
    // the face's armour panel seams and their bolts
    P.add('turretDark', box(0.012, T.roofY - T.floorY - 0.16, 0.012), s * 0.94, (T.roofY + T.floorY) / 2, T.faceZ + 0.004);
    for (const [bx, by] of [[0.62, 0.20], [0.62, 0.70], [1.12, 0.20], [1.12, 0.70]] as const) {
      P.add('turretDark', cylZ(0.022, 0.016, 8), s * bx, by, T.faceZ + 0.006);
    }
  }
  // the slot's roof over the gun's mask
  P.add('turret', box(2 * T.slotHw, 0.06, 0.10), 0, T.roofY - 0.03, T.slotZ + 0.05);
  // the blow-off panels on the bustle's roof (TE: the bustle magazine vents upward) and the bustle's rear plate seams
  for (const s of [-1, 1] as const) {
    P.add('turretDark', box(0.012, 0.012, 0.86), s * 0.20, T.roofY + 0.002, -2.20);
    P.add('turretDark', box(0.012, 0.012, 0.86), s * 0.80, T.roofY + 0.002, -2.20);
  }
  P.add('turretDark', box(1.60, 0.012, 0.012), 0, T.roofY + 0.002, -1.77);
  P.add('turretDark', box(1.60, 0.012, 0.012), 0, T.roofY + 0.002, -2.63);
  yield 'buildTtdTurret';

  // ---------------------------------------------------------------- turret fittings --
  const roof = T.roofY;
  // the commander's cupola on the right, sunken into the roof, six periscopes round it (TE)
  const cx = -0.72, cz = -0.80, cr = 0.33;
  P.addCupola('turret', cylY(cr, cr * 1.05, 0.06, P.q ? 26 : 16), cx, roof + 0.03, cz);
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2 + 0.3;
    P.add('turretDetail', box(0.10, 0.06, 0.05), cx + Math.sin(ang) * cr, roof + 0.06, cz + Math.cos(ang) * cr, 0, ang, 0);
    P.add('turretGlass', box(0.075, 0.03, 0.01), cx + Math.sin(ang) * (cr + 0.026), roof + 0.06, cz + Math.cos(ang) * (cr + 0.026), 0, ang, 0);
  }
  P.addCupola('turret', cylY(cr * 0.86, cr * 0.88, 0.05, P.q ? 26 : 16), cx, roof + 0.085, cz);
  // the CS60N commander's stabilised sight ahead of his cupola: its head on a short pedestal, its window forward (the
  // published height's 2.99 m)
  P.addEquipment('turret', cylY(0.12, 0.13, 0.12, P.q ? 18 : 12), cx, roof + 0.06, -0.24);
  P.addEquipment('turret', box(0.34, 0.30, 0.44), cx, roof + 0.27, -0.24);
  P.add('turretGlass', box(0.24, 0.12, 0.008), cx, roof + 0.30, -0.24 + 0.224);
  P.add('turretDark', box(0.36, 0.03, 0.10), cx, roof + 0.43, -0.24 + 0.20);
  // the GS60 gunner's sight in its armoured box at the roof's front right, its window forward
  P.addEquipment('turret', box(0.38, 0.24, 0.42), -0.90, roof + 0.12, 1.05);
  P.add('turretGlass', box(0.26, 0.10, 0.008), -0.90, roof + 0.14, 1.265);
  P.add('turretDark', box(0.40, 0.025, 0.08), -0.90, roof + 0.25, 1.24);
  // the loader's hatch on the left and his pintle 7.62 mm ahead of it
  const lx = 0.66, lz = -0.80;
  P.addCupola('turret', cylY(0.31, 0.32, 0.05, P.q ? 22 : 14), lx, roof + 0.025, lz);
  P.add('turretDark', torus(0.29, 0.010, 24, 4), lx, roof + 0.05, lz);
  P.add('turretDark', cylY(0.035, 0.045, 0.16, 10), lx + 0.10, roof + 0.07, lz + 0.42);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.86, elev: 0.06, shield: false, ammo: true,
    seed: 2920, feed: 'left', working: true, ridingCradle: true });
  mg.name = 'ttd_loader_machine_gun';
  mg.position.set(lx + 0.10, roof + 0.15, lz + 0.42);
  mg.rotation.y = -0.10;
  P.turretG.add(mg);
  periscope(P, 'turretDetail', 0.40, roof + 0.03, 0.70, 0);
  // the ventilator and the lifting eyes
  P.add('turret', cylY(0.10, 0.13, 0.05, 16), 0.20, roof + 0.02, -1.30);
  for (const s of [-1, 1] as const) {
    liftEye(P, 'turretDetail', s * 1.20, roof + 0.005, 0.95, s * 0.4);
    liftEye(P, 'turretDetail', s * 1.20, roof + 0.005, -2.40, s * 2.7);
  }
  // the two banks of four 81 mm dischargers on the roof's side edges, raised forward and splayed out, behind the armour
  // sheet that rises over the wall's top edge (TE: "behind an armour sheet"; the top-down photograph)
  for (const s of [-1, 1] as const) {
    const sx = s * (T.hw - 0.24);
    P.addEquipment('turret', box(0.20, 0.05, 0.62), sx, roof + 0.025, -0.20);
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', markSmokeTube(cylZ(0.042, 0.24, 12)), sx, roof + 0.14, -0.44 + k * 0.16, -0.62, s * 0.30, 0);
    }
    P.addEquipment('turret', box(0.03, 0.22, 0.76), s * (T.hw - 0.05), roof + 0.10, -0.20);
  }
  // the bins on the bustle's sides (the tank's number on them)
  for (const s of [-1, 1] as const) {
    P.addEquipment('turret', box(0.12, 0.42, 1.10), s * (T.hw + 0.06), 0.52, -1.75);
    P.add('turretDark', box(0.014, 0.012, 1.06), s * (T.hw + 0.122), 0.70, -1.75);
    for (const hz of [-1.40, -2.10]) P.add('turretDark', box(0.02, 0.06, 0.05), s * (T.hw + 0.125), 0.62, hz);
    P.decal('turret', 'number', P.spec.visual.number || '', 0.28, [s * (T.hw + 0.125), 0.50, -1.75], s * Math.PI / 2);
  }
  // the two aerials at the bustle's rear corners
  for (const s of [-1, 1] as const) {
    P.add('turretDetail', cylY(0.04, 0.05, 0.07, 10), s * 1.05, roof + 0.03, -2.50);
    P.addEquipment('turret', antennaPart(cylY(0.012, 0.015, 2.0, 8)), s * 1.05, roof + 1.06, -2.50, 0, 0, s * 0.03);
  }
  yield 'buildTtdTurretFittings';

  // ---------------------------------------------------------------- mantlet and gun --
  P.gunG.position.set(0, TRUNNION.y, TRUNNION.z);
  // the gun's mask in the slot: a square armoured block standing 10 cm out of the faces, the coaxial MG's port on its left
  // and the canvas boot round the tube
  P.addGunExtra(box(0.80, 0.46, 0.44), 0, 0, 0.28);
  P.addGunExtraDark(box(0.82, 0.012, 0.012), 0, 0.23, 0.40);
  P.addGunExtra(cylZ(0.05, 0.06, 12), 0.27, 0.10, 0.53);
  P.addGunExtraDark(cylZ(0.018, 0.14, 8), 0.27, 0.10, 0.60);
  P.add('gunMountCloth', cylZ(0.13, 0.24, P.q ? 20 : 12, 0.16), 0, 0, 0.62);
  // the 105 mm GT3: its thermal sleeve in bands, the fume extractor a third out, the muzzle reference system on top
  buildGun(P, { len: GUN_LEN, r: 0.072, evac: 0.36, evacR: 1.5, baseR: 0.15, collar: false, sleeve: true });
  P.add('gun', box(0.06, 0.08, 0.10), 0, 0.10, GUN_LEN - 0.12);
  P.add('gunDark', cylZ(0.02, 0.012, 8), 0, 0.10, GUN_LEN - 0.065);
  muzzleBore(P, { len: GUN_LEN, r: 0.072 });
  P.muzzleZ = GUN_LEN;
  P.gunG.userData.ttdGunReceipt = { caliberMm: 105, calibres: 51, muzzleZ: GUN_LEN, fumeExtractor: true, sleeve: true };
  P.turretG.userData.ttdTurretReceipt = {
    revision: 'ttd-269-r1', roofY: T.roofY, turretHalfWidth: T.hw, bustleRearZ: T.rearZ, faceZ: T.faceZ,
    dischargers: 8, sunkenCupola: true, raisedEngineDeck: H.engineY,
  };
  P.topY = RING.y;
  yield 'buildTtdGun';
}


export const buildTtd = steppedBuilder((P: TankBuilderPort) => buildTtdSteps(P));

/** The TTD's datums for its fixture (profiles/southAfrica.selftest.mjs): the hull, the ring, the road wheels and the
 * muzzle's station ahead of the hull's middle with the gun level. */
export const TTD_DATUMS = Object.freeze({
  hull: H, ring: RING, roadWheelZs: ROAD_WHEEL_ZS, muzzleHullZ: RING.z + TRUNNION.z + GUN_LEN,
});
