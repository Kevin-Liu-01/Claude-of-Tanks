// The Bernardini X1 family (release 266; Main's ruling 2026-10-29 on the Brazil line): one first-party build of the two
// light tanks the Brazilian Army fielded from Bernardini (docs/references/tanks/x1a2_carcara.md), on the BT-90 turret
// (the French H-90's layout and ring) and the 18-ton M4 tractor's VVSS bogies, sprocket forward.
// - x1: the CCL X1 Pioneiro (52 built, 1977-94): an M3/M3A1 Stuart hull lengthened by Biselli, two bogies a side and the
//   Stuart's trailing idler, the BT-90A1 turret with the 90 mm D-921 and its single-baffle brake, the .50 left of the
//   cupola, two dischargers each side at the turret rear.
// - x1a2: the CCL X1A2 Carcará (24 built, the 6º RCB 1981-94), Brazil's only indigenous tank in service: a new, longer
//   hull with three bogies a side and a raised idler, the turret's longer bustle with spare links on its sides, the Engesa
//   EC-90 (the Cockerill Mk 3 under licence) with its slotted brake, three dischargers each side at the turret's front, the
//   .50 on the commander's swing arm.
// Datums: the X1's published 5.04 m hull and 6.04 m over the gun, 2.4 m wide, 2.45 m; the X1A2's 6.06 m hull, 2.6 m wide,
// 2.45 m, 19 t (Tanks Encyclopedia, after Bastos' "Brazilian Stuart"); stations from Brian Gaydos' profiles for Tanks
// Encyclopedia, scaled on the hull (the X1A2's turret roof reads 2.5 m against the published 2.45, recorded in its packet).
// A +Z hull's right is -X: the commander at -X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type BernardiniX1Mark = 'x1' | 'x1a2';

interface X1Datums {
  readonly noseZ: number; readonly sternZ: number; readonly bellyY: number; readonly lowerX: number; readonly sponsonX: number;
  readonly sponsonFloorY: number; readonly deckY: number; readonly noseY: number; readonly glacisZ: number; readonly bowZ: number;
  readonly rearTopZ: number; readonly rearY: number; readonly rearBellyZ: number; readonly fenderX: number; readonly fenderY: number;
  readonly trackXc: number; readonly trackW: number; readonly wheelR: number; readonly wheelY: number;
  readonly wheelZs: readonly number[]; readonly bogieZs: readonly number[];
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number };
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
  readonly rollerZs: readonly number[]; readonly rollerY: number;
  readonly ring: { readonly y: number; readonly z: number };
  readonly turret: { readonly front: number; readonly slopeTop: number; readonly rear: number; readonly roof: number; readonly hwBase: number;
    readonly hwRoof: number };
  readonly trunnion: { readonly y: number; readonly z: number };
  readonly muzzleHullZ: number;
}

const DATUMS: Readonly<Record<BernardiniX1Mark, X1Datums>> = Object.freeze({
  x1: Object.freeze({
    noseZ: 2.52, sternZ: -2.52, bellyY: 0.40, lowerX: 0.74, sponsonX: 1.12, sponsonFloorY: 0.98, deckY: 1.62, noseY: 1.12,
    glacisZ: 1.55, bowZ: 2.30, rearTopZ: -1.90, rearY: 1.30, rearBellyZ: -2.30, fenderX: 1.20, fenderY: 0.98,
    trackXc: 0.98, trackW: 0.40, wheelR: 0.26, wheelY: 0.31, wheelZs: [1.40, 0.82, -0.12, -0.70], bogieZs: [1.11, -0.41],
    sprocket: { z: 2.08, y: 0.74, r: 0.28 }, idler: { z: -1.88, y: 0.34, r: 0.30 }, rollerZs: [1.11, 0.30, -0.41], rollerY: 0.86,
    ring: { y: 1.62, z: 0.08 },
    turret: { front: 1.30, slopeTop: 0.98, rear: -1.20, roof: 0.62, hwBase: 0.92, hwRoof: 0.78 },
    trunnion: { y: 0.33, z: 1.02 }, muzzleHullZ: 3.52,
  }),
  x1a2: Object.freeze({
    noseZ: 3.03, sternZ: -3.03, bellyY: 0.42, lowerX: 0.84, sponsonX: 1.25, sponsonFloorY: 1.08, deckY: 1.74, noseY: 1.24,
    glacisZ: 1.67, bowZ: 2.80, rearTopZ: -2.30, rearY: 1.32, rearBellyZ: -2.75, fenderX: 1.30, fenderY: 1.10,
    trackXc: 1.09, trackW: 0.42, wheelR: 0.265, wheelY: 0.33, wheelZs: [1.725, 1.045, 0.285, -0.395, -1.09, -1.77],
    bogieZs: [1.385, -0.055, -1.43],
    sprocket: { z: 2.56, y: 0.82, r: 0.30 }, idler: { z: -2.50, y: 0.66, r: 0.28 }, rollerZs: [1.385, -0.055, -1.43], rollerY: 0.98,
    ring: { y: 1.74, z: 0.10 },
    turret: { front: 1.64, slopeTop: 1.17, rear: -1.71, roof: 0.77, hwBase: 0.98, hwRoof: 0.82 },
    trunnion: { y: 0.43, z: 1.30 }, muzzleHullZ: 3.89,
  }),
});

function* buildX1Steps(P: TankBuilderPort, mark: BernardiniX1Mark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildRunningGear, headlight, liftEye, stowage, torus } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const D = DATUMS[mark], a2 = mark === 'x1a2';
  const glacis = Math.atan2(D.deckY - D.noseY, D.bowZ - D.glacisZ);
  const deckY = (z: number): number => {
    if (z >= D.bowZ) return D.noseY - (z - D.bowZ) * 0.35;
    if (z >= D.glacisZ) return D.noseY + (D.bowZ - z) * (D.deckY - D.noseY) / (D.bowZ - D.glacisZ);
    if (z >= D.rearTopZ) return D.deckY;
    return D.deckY - (D.rearTopZ - z) / (D.rearTopZ - D.sternZ) * (D.deckY - D.rearY);
  };
  const bar = (slot: string, a: readonly number[], b: readonly number[], r: number): void => {
    P.add(slot, beamBetween([a[0], a[1], a[2]], [b[0], b[1], b[2]], r, 8));
  };

  // ---------------------------------------------------------------- hull --
  const buildX1Hull = (): void => {
    // the lower hull: the rounded transmission cover at the bow (sprocket forward), the belly, the rear plate's slope
    const LOWER: readonly (readonly [number, number])[] = [[D.sternZ, D.rearY - 0.30], [D.rearBellyZ, D.bellyY],
      [D.glacisZ, D.bellyY], [D.bowZ - 0.25, D.bellyY], [D.noseZ - 0.10, D.bellyY + 0.25], [D.noseZ, D.noseY - 0.40]];
    P.add('hull', sectionSolid(LOWER.map(([z, b]) => ({ z, ring: [[-D.lowerX, b], [D.lowerX, b], [D.lowerX, deckY(z)],
      [-D.lowerX, deckY(z)]] as SectionPoint[] }))));
    for (const s of [-1, 1] as const) {
      const ring = (z: number): SectionPoint[] => s > 0
        ? [[D.lowerX - 0.01, D.sponsonFloorY], [D.sponsonX, D.sponsonFloorY], [D.sponsonX, deckY(z) - 0.03],
          [D.sponsonX - 0.04, deckY(z)], [D.lowerX - 0.01, deckY(z)]]
        : [[-D.sponsonX, D.sponsonFloorY], [-(D.lowerX - 0.01), D.sponsonFloorY], [-(D.lowerX - 0.01), deckY(z)],
          [-(D.sponsonX - 0.04), deckY(z)], [-D.sponsonX, deckY(z) - 0.03]];
      P.add('hull', sectionSolid([D.sternZ + 0.05, D.rearTopZ, D.glacisZ, D.bowZ].map((z) => ({ z, ring: ring(z) }))));
      // the fender over the track, the length of the hull, sloping down over the sprocket and the idler
      P.add('hullDetail', box(D.fenderX - D.sponsonX + 0.02, 0.022, D.bowZ - D.sternZ - 0.10), s * (D.sponsonX + D.fenderX) / 2,
        D.fenderY - 0.011, (D.bowZ + D.sternZ) / 2 - 0.05);
    }
    P.add('hullDetail', box(D.lowerX * 2, 0.05, 0.06), 0, D.noseY - 0.40, D.noseZ - 0.02);
  };
  buildX1Hull();
  yield 'buildX1Hull';

  // ---------------------------------------------------------------- running gear (VVSS bogies, sprocket forward) --
  const buildX1RunningGear = (): void => {
    buildRunningGear(P, {
      style: 'holes', wheelR: D.wheelR, wheelW: 0.22, wheelY: D.wheelY, xc: D.trackXc, wheelZs: [...D.wheelZs],
      sprocket: { ...D.sprocket }, idler: { ...D.idler }, rollers: D.rollerZs.map((z) => ({ z, y: D.rollerY, r: 0.09 })),
      trackW: D.trackW, topY: D.rollerY + 0.04, botY: 0.03, contactZF: D.wheelZs[0], contactZR: a2 ? D.wheelZs.at(-1) : D.idler.z,
      paintedEnds: true, coveredTop: false, arms: false, sprocketTeeth: true,
    });
    // the VVSS bogie frames between each pair of wheels, their volute spring housings and the roller brackets on top
    for (const s of [-1, 1] as const) for (const bz of D.bogieZs) {
      const x = s * (D.trackXc - D.trackW / 2 - 0.10);
      P.add('hullRunningGearDark', box(0.16, 0.30, 0.58), x, D.wheelY + 0.12, bz);
      P.add('hullRunningGearDark', cylY(0.08, 0.08, 0.22, 10), x, D.wheelY + 0.20, bz - 0.12);
      P.add('hullRunningGearDark', cylY(0.08, 0.08, 0.22, 10), x, D.wheelY + 0.20, bz + 0.12);
      P.add('hullRunningGearDetail', box(0.10, 0.14, 0.10), s * (D.trackXc - D.trackW * 0.5 + 0.02), D.rollerY - 0.06, bz);
    }
    P.mats.rubber.color.setHex(0x2f312b);
  };
  buildX1RunningGear();
  yield 'buildX1RunningGear';

  // ---------------------------------------------------------------- hull fittings --
  const buildX1HullFittings = (): void => {
    for (const s of [-1, 1] as const) {
      // the headlights in their guards on the bow, the lifting eyes, the tail lights
      headlight(P, s * (D.sponsonX - 0.18), deckY(D.bowZ - 0.10) + 0.08, D.bowZ - 0.05, -glacis * 0.5, 0.06);
      bar('hullDark', [s * (D.sponsonX - 0.30), deckY(D.bowZ - 0.10) + 0.02, D.bowZ - 0.18], [s * (D.sponsonX - 0.30), deckY(D.bowZ - 0.10) + 0.16, D.bowZ + 0.02], 0.012);
      bar('hullDark', [s * (D.sponsonX - 0.06), deckY(D.bowZ - 0.10) + 0.02, D.bowZ - 0.18], [s * (D.sponsonX - 0.06), deckY(D.bowZ - 0.10) + 0.16, D.bowZ + 0.02], 0.012);
      liftEye(P, 'hullDetail', s * (D.sponsonX - 0.15), deckY(D.glacisZ + 0.20) + 0.012, D.glacisZ + 0.20, s * 0.3);
      P.add('hullDark', box(0.14, 0.10, 0.06), s * (D.sponsonX - 0.25), D.rearY + 0.10, D.sternZ + 0.02);
      P.add('hullGlass', box(0.09, 0.05, 0.012), s * (D.sponsonX - 0.25), D.rearY + 0.10, D.sternZ - 0.012);
      P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.45, D.rearY - 0.32, D.sternZ - 0.04, 0, 0, Math.PI / 2);
      // the pioneer tools on the hull side above the fender (Gaydos' profile: the shovel and the bars)
      P.addEquipment('hullDark', box(0.03, 0.04, 1.40), s * (D.sponsonX + 0.02), D.fenderY + 0.26, -0.10);
      P.addEquipment('hullDark', box(0.03, 0.03, 1.10), s * (D.sponsonX + 0.02), D.fenderY + 0.16, 0.30);
      P.addEquipment('hullDark', xform(box(0.03, 0.18, 0.24), 0, 0, 0), s * (D.sponsonX + 0.02), D.fenderY + 0.21, 1.05);
    }
    // the driver's and the co-driver's hatches on the glacis (the X1 kept the Stuart's two front stations)
    const hz = D.glacisZ + 0.40;
    for (const hx of a2 ? [0.40] : [0.40, -0.40]) {
      P.addCupola('hull', xform(cylY(0.22, 0.23, 0.04, P.q ? 20 : 12), 0, 0, 0, glacis, 0, 0), hx, deckY(hz) + 0.02, hz);
      P.add('hullDetail', xform(box(0.12, 0.06, 0.08), 0, 0, 0, glacis, 0, 0), hx, deckY(hz + 0.32) + 0.03, hz + 0.32);
      P.add('hullGlass', xform(box(0.10, 0.035, 0.008), 0, 0, 0, glacis, 0, 0), hx, deckY(hz + 0.32) + 0.04, hz + 0.365);
    }
    if (a2) {
      // the X1A2's transmission access hatch on the bow (the CD-500)
      P.add('hullDetail', xform(box(0.90, 0.02, 0.40), 0, 0, 0, glacis, 0, 0), 0, deckY(D.bowZ - 0.30) + 0.012, D.bowZ - 0.30);
    }
    // the engine deck's grilles aft
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.62, 0.016, 0.90), s * 0.42, D.deckY + 0.008, D.rearTopZ + 0.55);
      for (let k = 0; k < 5; k++) P.addEquipment('hull', box(0.56, 0.012, 0.035), s * 0.42, D.deckY + 0.014, D.rearTopZ + 0.20 + k * 0.18);
    }
  };
  buildX1HullFittings();
  yield 'buildX1HullFittings';

  // ---------------------------------------------------------------- turret (the BT-90) --
  P.turretG.position.set(0, D.ring.y, D.ring.z);
  const T = D.turret;
  const buildX1Turret = (): void => {
    P.add('turret', cylY(0.82, 0.86, 0.10, P.q ? 26 : 16), 0, -0.04, 0);
    // the H-90 layout: flanks leaning in to a flat roof, a sloped front plate falling to the gun shield, the long bustle
    const ring = (hw0: number, hw1: number, top: number): SectionPoint[] => [[-hw0, 0.02], [hw0, 0.02], [hw1, top], [-hw1, top]];
    const body = sectionSolid([
      { z: T.rear, ring: ring(T.hwBase - 0.06, T.hwRoof - 0.06, T.roof) },
      { z: T.rear + 0.25, ring: ring(T.hwBase, T.hwRoof, T.roof) },
      { z: T.slopeTop, ring: ring(T.hwBase, T.hwRoof, T.roof) },
      { z: T.front, ring: ring(T.hwBase - 0.16, T.hwRoof - 0.26, D.trunnion.y + 0.16) },
    ]);
    body.userData.primaryStockRole = 'bt90-turret';
    P.add('turret', body);
    for (const s of [-1, 1] as const) {
      liftEye(P, 'turretDetail', s * (T.hwRoof - 0.10), T.roof + 0.005, T.slopeTop - 0.20, s * 0.4);
      liftEye(P, 'turretDetail', s * (T.hwRoof - 0.10), T.roof + 0.005, T.rear + 0.25, s * 2.7);
    }
  };
  buildX1Turret();
  yield 'buildX1Turret';

  const buildX1TurretFittings = (): void => {
    const roof = T.roof;
    // the commander's raised cupola (right) and his .50: on the X1 left of the cupola, on the X1A2's swing arm behind it
    const cx = -0.34, cz = a2 ? -0.05 : -0.20, cr = 0.30, rise = a2 ? 0.13 : 0.08;
    P.addCupola('turret', cylY(cr, cr * 1.05, 0.12 + rise, P.q ? 22 : 14), cx, roof + (0.12 + rise) / 2, cz);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      P.add('turretDetail', box(0.09, 0.06, 0.05), cx + Math.sin(a) * cr, roof + 0.07 + rise, cz + Math.cos(a) * cr, 0, a, 0);
      P.add('turretGlass', box(0.07, 0.03, 0.012), cx + Math.sin(a) * (cr + 0.025), roof + 0.07 + rise, cz + Math.cos(a) * (cr + 0.025), 0, a, 0);
    }
    P.addCupola('turret', cylY(cr * 0.9, cr * 0.94, 0.04, P.q ? 22 : 14), cx, roof + 0.14 + rise, cz);
    const mgX = a2 ? cx : cx + 0.36, mgZ = a2 ? cz - cr - 0.02 : cz;
    P.addEquipment('turretDark', cylY(0.03, 0.04, 0.18, 10), mgX, roof + 0.10 + (a2 ? rise : 0), mgZ);
    const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.60, elev: 0.03, ring: false,
      shield: false, seed: a2 ? 6651 : 6641, working: true });
    mg.name = a2 ? 'x1a2CommanderM2' : 'x1CommanderM2';
    mg.position.set(mgX, roof + 0.27 + (a2 ? rise : 0), mgZ);
    P.turretG.add(mg);
    // the gunner's periscope ahead of the cupola, the loader's hatch (left), the roof ventilator
    P.addEquipment('turret', box(0.18, 0.12, 0.22), -0.36, roof + 0.06, T.slopeTop - 0.25);
    P.add('turretGlass', box(0.12, 0.05, 0.008), -0.36, roof + 0.07, T.slopeTop - 0.135);
    P.addCupola('turret', cylY(0.25, 0.26, 0.05, P.q ? 20 : 12), 0.36, roof + 0.025, -0.25);
    P.add('turretDetail', cylY(0.22, 0.23, 0.03, P.q ? 20 : 12), 0.36, roof + 0.065, -0.25);
    P.addEquipment('turret', cylY(0.12, 0.14, 0.05, 12), 0.10, roof + 0.025, T.rear + 0.50);
    // the dischargers: the X1A2's three each side at the turret front, the X1's two each side at the rear
    for (const s of [-1, 1] as const) {
      const n = a2 ? 3 : 2, z0 = a2 ? T.slopeTop - 0.10 : T.rear + 0.55;
      P.addEquipment('turret', box(0.08, 0.08, 0.14 * n + 0.04), s * (T.hwRoof + 0.10), roof - 0.22, z0 - 0.07 * (n - 1));
      for (let k = 0; k < n; k++) {
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.033, 0.20, P.q ? 12 : 8)), 0, 0, 0, -0.55, s * 0.45, 0),
          s * (T.hwRoof + 0.14), roof - 0.16, z0 - k * 0.14);
      }
      if (a2) {
        // the spare track links stood on the bustle's sides
        for (let k = 0; k < 6; k++) {
          P.addEquipment('turretDark', box(0.04, 0.34, 0.075), s * (T.hwBase - 0.04 + 0.03), roof * 0.50, -0.60 - k * 0.085);
        }
      }
    }
    // the bustle: the X1A2's rear rack, the X1's stowage box; the raked antenna on the rear
    if (a2) {
      for (const s of [-1, 1] as const) P.addEquipment('turretDetail', box(0.03, 0.03, 0.26), s * 0.62, roof * 0.70, T.rear - 0.13);
      P.addEquipment('turretDetail', box(1.24, 0.03, 0.03), 0, roof * 0.70, T.rear - 0.26);
      stowage(P, 'turretCloth', rng, [[0, roof * 0.70 - 0.02, T.rear - 0.13, 1.0, 0.20, 0.22]]);
    } else {
      P.addEquipment('turret', box(1.20, 0.30, 0.24), 0, roof * 0.55, T.rear - 0.12);
    }
    P.addEquipment('turret', box(0.08, 0.08, 0.08), 0.55, roof + 0.04, T.rear + 0.25);
    P.addEquipment('turret', xform(cylY(0.012, 0.015, 2.2, 8), 0, 1.10, 0, 0.35, 0, 0), 0.55, roof + 0.08, T.rear + 0.25);
    P.turretG.userData.x1TurretReceipt = { revision: 'x1-266-r1', mark, roofY: roof, front: T.front, rear: T.rear, spareLinks: a2 };
  };
  buildX1TurretFittings();
  yield 'buildX1TurretFittings';

  // ---------------------------------------------------------------- gun --
  const buildX1Gun = (): void => {
    P.gunG.position.set(0, D.trunnion.y, D.trunnion.z);
    const seg = P.q ? 22 : 12;
    // the gun shield: a rounded block on the front plate, the coaxial MG's port beside the gun
    P.addGunExtra(box(0.66, 0.34, 0.26), 0, 0.0, 0.20);
    P.addGunExtra(cylZ(0.12, 0.14, seg, 0.15), 0, 0, 0.39);
    P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.22, -0.04, 0.34);
    const len = D.muzzleHullZ - (D.ring.z + D.trunnion.z);
    if (a2) {
      // the Engesa EC-90 (the Cockerill Mk 3): a plain tube, the long slotted brake
      const r0 = 0.072, r1 = 0.062, brake = 0.27;
      P.add('gun', cylZ(r1, len - brake - 0.46, seg, r0), 0, 0, (0.46 + len - brake) / 2);
      P.add('gun', cylZ(0.085, brake, seg), 0, 0, len - brake / 2);
      for (let k = 0; k < 4; k++) P.add('gunDark', box(0.18, 0.03, 0.035), 0, 0, len - 0.04 - k * 0.06);
    } else {
      // the 90 mm D-921: a short tapering tube, the single-baffle brake
      const r0 = 0.075, r1 = 0.058;
      P.add('gun', cylZ(r1, len - 0.16 - 0.46, seg, r0), 0, 0, (0.46 + len - 0.16) / 2);
      P.add('gun', cylZ(0.095, 0.16, seg, 0.085), 0, 0, len - 0.08);
      P.add('gunDark', box(0.20, 0.05, 0.05), 0, 0, len - 0.08);
    }
    muzzleBore(P, { z: len + 0.004, r: 0.046 });
    P.muzzleZ = len;
    P.gunG.userData.x1GunReceipt = { mark, caliberMm: 90, muzzleZ: len };
    P.mats.glass.color.setHex(0x3a463f);
    P.topY = D.ring.y;
  };
  buildX1Gun();
}

export const buildX1Pioneiro = steppedBuilder((P: TankBuilderPort) => buildX1Steps(P, 'x1'));
export const buildX1A2Carcara = steppedBuilder((P: TankBuilderPort) => buildX1Steps(P, 'x1a2'));

/** The datums a fixture holds the builds to (docs/references/tanks/x1a2_carcara.md). */
export const BERNARDINI_X1_DATUMS = DATUMS;
