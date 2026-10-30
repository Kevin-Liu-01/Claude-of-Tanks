// The Bernardini MB-3 Tamoyo (release 266; Main's ruling 2026-10-29 on the Brazil line): one first-party build of the
// Bernardini hull (Tanks Encyclopedia: "not conversions from the M41, but completely new designs" sharing its concepts)
// with the two turrets it carried (docs/references/tanks/tamoyo1.md).
// - t1: the Tamoyo 1 of the Army's 1987-88 trials (TI-1, restored at the CIBld Alegrete): long side plates over the upper
//   running gear, the welded turret with its sloped front and broad gun shield, the 90 mm BR3 (the CS Super 90 copy) with
//   its double-baffle brake, four dischargers on each cheek, the raised bustle with its netted stowage box, the .50 on the
//   commander's cupola.
// - t3: the Tamoyo 3 as Bernardini showed it in May 1987 (the Festa da Cavalaria; Bastos' photograph): open running gear
//   under fenders, the boxy spaced-armour turret with its vertical front plate and the concertina gun boot, the 105 mm L7A3
//   with its fume extractor, the dischargers at the turret's rear corners, the bustle rack, the BERNARDINI plate.
// Datums: the published 6.5 m hull, 8.77 m (T1) and 8.9 m (T3) over the gun, 3.22 m and 3.29 m wide, 2.2 m and 2.35 m to
// the turret roof (Tanks Encyclopedia, Bastos 2022); stations from Vesp's two profiles for Tanks Encyclopedia, drawn on one
// hull at one scale (scaled on the 6.5 m hull: the nose tip 1.15 m up, a 20-degree glacis to the 1.565 m deck, the engine
// deck rising to 1.75 m at the rear, six 0.63 m road wheels on a 0.85 m pitch, three return rollers, the idler forward and
// the sprocket aft, the turret ring 0.16 m ahead of the hull's middle). A +Z hull's right is -X: the commander at -X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type TamoyoMark = 't1' | 't3';

// ------------------------------------------------------------------------------------------------- datums --
const H = Object.freeze({
  noseZ: 3.25, sternZ: -3.25, bellyY: 0.45, lowerX: 1.05, sponsonX: 1.46, sponsonFloorY: 1.12, deckY: 1.565,
  noseY: 1.15, lipY: 1.10, glacisZ: 2.13, lowerNoseZ: 2.80, rearDeckZ: -0.90, rearDeckY: 1.75, rearLowY: 0.78,
  rearBellyZ: -2.93, fenderX: 1.61, fenderY: 1.25, trackXc: 1.345, trackW: 0.53,
});
const ROAD_WHEEL_ZS = [2.10, 1.245, 0.42, -0.47, -1.31, -2.14];
const RING = Object.freeze({ y: H.deckY, z: 0.16 });

/** Hull top at z: the 20-degree upper glacis, the flat deck round the turret, the engine deck rising aft. */
function deckY(z: number): number {
  if (z >= H.glacisZ) return H.noseY + (H.noseZ - z) * (H.deckY - H.noseY) / (H.noseZ - H.glacisZ);
  if (z >= H.rearDeckZ) return H.deckY;
  return H.deckY + (H.rearDeckZ - z) / (H.rearDeckZ - (H.sternZ + 0.20)) * (H.rearDeckY - H.deckY);
}

function* buildTamoyoSteps(P: TankBuilderPort, mark: TamoyoMark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildRunningGear, headlight, liftEye, stowage, torus, jerryCan } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const t3 = mark === 't3';
  const glacis = Math.atan2(H.deckY - H.noseY, H.noseZ - H.glacisZ);
  const bar = (slot: string, a: readonly number[], b: readonly number[], r: number): void => {
    P.add(slot, beamBetween([a[0], a[1], a[2]], [b[0], b[1], b[2]], r, 8));
  };
  const rearTopZ = H.sternZ + 0.20;

  // ---------------------------------------------------------------- hull --
  const buildTamoyoHull = (): void => {
    const top = (z: number): number => z <= rearTopZ ? H.rearDeckY - (rearTopZ - z) * 0.4 : deckY(z);
    // the lower hull between the tracks: the rear plate's slope, the belly, the lower nose plate to the tip
    const LOWER: readonly (readonly [number, number])[] = [[H.sternZ, H.rearLowY], [H.rearBellyZ, H.bellyY], [H.rearDeckZ, H.bellyY],
      [H.glacisZ, H.bellyY], [H.lowerNoseZ, H.bellyY], [H.noseZ, H.lipY]];
    P.add('hull', sectionSolid(LOWER.map(([z, b]) => ({ z, ring: [[-H.lowerX, b], [H.lowerX, b], [H.lowerX, top(z)],
      [-H.lowerX, top(z)]] as SectionPoint[] }))));
    for (const s of [-1, 1] as const) {
      const ring = (z: number): SectionPoint[] => s > 0
        ? [[H.lowerX - 0.01, H.sponsonFloorY], [H.sponsonX, H.sponsonFloorY], [H.sponsonX, top(z) - 0.03],
          [H.sponsonX - 0.03, top(z)], [H.lowerX - 0.01, top(z)]]
        : [[-H.sponsonX, H.sponsonFloorY], [-(H.lowerX - 0.01), H.sponsonFloorY], [-(H.lowerX - 0.01), top(z)],
          [-(H.sponsonX - 0.03), top(z)], [-H.sponsonX, top(z) - 0.03]];
      P.add('hull', sectionSolid([H.sternZ, rearTopZ, H.rearDeckZ, H.glacisZ, 3.12].map((z) => ({ z, ring: ring(z) }))));
      // the fender over the track, its edge strip
      P.add('hullDetail', box(H.fenderX - H.sponsonX + 0.01, 0.025, 6.30), s * (H.sponsonX + H.fenderX) / 2, H.fenderY - 0.0125, -0.05);
      P.add('hullDetail', box(0.012, 0.05, 6.30), s * (H.fenderX - 0.006), H.fenderY - 0.035, -0.05);
      // the fender's angled front over the idler
      P.add('hullDetail', slab(
        [s * H.sponsonX, H.fenderY - 0.025, 3.10], [s * H.fenderX, H.fenderY - 0.025, 3.10], [s * H.fenderX, 1.05, 3.40], [s * H.sponsonX, 1.05, 3.40],
        [s * H.sponsonX, H.fenderY, 3.10], [s * H.fenderX, H.fenderY, 3.10], [s * H.fenderX, 1.075, 3.40], [s * H.sponsonX, 1.075, 3.40]));
    }
    P.add('hullDetail', box(H.lowerX * 2, 0.05, 0.04), 0, (H.lipY + H.noseY) / 2, H.noseZ - 0.005);
  };
  buildTamoyoHull();
  yield 'buildTamoyoHull';

  // ---------------------------------------------------------------- running gear (torsion bars, six a side) --
  const roadWheelR = 0.315, roadWheelY = 0.40, wheelW = 0.36;
  const rollers = [1.86, -0.11, -1.70].map((z) => ({ z, y: 0.99, r: 0.10 }));
  const buildTamoyoRunningGear = (): void => {
    buildRunningGear(P, {
      style: 'dished', wheelR: roadWheelR, wheelW, wheelY: roadWheelY, xc: H.trackXc, wheelZs: [...ROAD_WHEEL_ZS],
      sprocket: { z: -2.93, y: 0.82, r: 0.31 }, idler: { z: 2.86, y: 0.80, r: 0.29 }, rollers,
      trackW: H.trackW, topY: 1.03, botY: 0.03, contactZF: ROAD_WHEEL_ZS[0], contactZR: ROAD_WHEEL_ZS.at(-1),
      paintedEnds: true, coveredTop: !t3, arms: true, sprocketTeeth: true,
    });
    for (const z of ROAD_WHEEL_ZS) for (const s of [-1, 1] as const) {
      P.add('hullRunningGearDark', torus(roadWheelR * 0.3, 0.014, P.q ? 16 : 10), s * (H.trackXc + wheelW / 2 + 0.010), roadWheelY, z,
        0, 0, Math.PI / 2);
      P.add('hullRubber', torus(roadWheelR - 0.026, 0.022, P.q ? 28 : 16, 6), s * (H.trackXc + wheelW / 2 - 0.004), roadWheelY, z,
        0, 0, Math.PI / 2);
    }
    if (!t3) {
      // the Tamoyo 1's long side plates over the upper running gear (four a side), hung from the fender's edge
      const t = 0.022, low = 0.76, z0 = 3.02, z1 = -3.05, seg = (z0 - z1) / 4;
      for (const s of [-1, 1] as const) {
        const bucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', x = s * (H.fenderX + 0.012);
        for (let k = 0; k < 4; k++) {
          const za = z0 - k * seg, zb = za - seg;
          P.addEquipment(bucket, box(t, H.fenderY - low, seg - 0.012), x, (H.fenderY + low) / 2, (za + zb) / 2);
          P.add('hullDetail', box(t + 0.012, H.fenderY - low - 0.02, 0.045), x + s * 0.004, (H.fenderY + low) / 2, za);
        }
      }
    }
    P.mats.rubber.color.setHex(0x30322c);
  };
  buildTamoyoRunningGear();
  yield 'buildTamoyoRunningGear';

  // ---------------------------------------------------------------- hull fittings --
  const buildTamoyoHullFittings = (): void => {
    for (const s of [-1, 1] as const) {
      // the twin lamps in their guards on the glacis corners, the mirrors on stalks behind them
      const z = 2.92, y = deckY(z) + 0.05;
      for (const dx of [-0.07, 0.07]) headlight(P, s * 1.18 + dx, y + 0.03, z + 0.03, -glacis * 0.5, 0.05);
      const g = [[s * 1.34, y - 0.04, z - 0.08], [s * 1.34, y + 0.10, z + 0.08], [s * 1.02, y + 0.10, z + 0.08], [s * 1.02, y - 0.04, z - 0.08]];
      for (let i = 0; i + 1 < g.length; i++) bar('hullDark', g[i], g[i + 1], 0.011);
      P.addEquipment('hullDark', cylY(0.012, 0.012, 0.40, 8), s * 1.50, H.fenderY + 0.20, 2.95);
      P.addEquipment('hullDark', box(0.02, 0.16, 0.13), s * 1.51, H.fenderY + 0.44, 2.95);
      // the tow eyes on the nose plate, the lifting eyes
      P.add('hullDark', box(0.12, 0.12, 0.08), s * 0.70, 0.86, 3.02);
      P.add('hullDark', torus(0.065, 0.02, 12, 6), s * 0.70, 0.86, 3.08, Math.PI / 2, 0, 0);
      liftEye(P, 'hullDetail', s * 1.28, deckY(2.40) + 0.012, 2.40, s * 0.3);
      // the rear plate: the exhaust silencers at its upper corners, the tail lights, the tow hooks
      P.addEquipment('hullDark', cylY(0.12, 0.12, 0.48, P.q ? 16 : 10), s * 1.12, 1.42, H.sternZ - 0.12);
      P.addEquipment('hullDark', cylZ(0.06, 0.08, 12), s * 1.12, 1.62, H.sternZ - 0.16);
      P.add('hullDark', box(0.18, 0.12, 0.06), s * 0.72, 1.60, H.sternZ - 0.03);
      P.add('hullGlass', box(0.12, 0.07, 0.012), s * 0.72, 1.60, H.sternZ - 0.065);
      P.add('hullDark', box(0.12, 0.14, 0.10), s * 0.62, 0.98, H.sternZ - 0.05);
      P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.62, 0.93, H.sternZ - 0.12, 0, 0, Math.PI / 2);
    }
    // the driver's hatch at the front left, his periscopes
    P.addCupola('hull', xform(cylY(0.26, 0.27, 0.04, P.q ? 22 : 14), 0, 0, 0, glacis, 0, 0), 0.50, deckY(2.30) + 0.02, 2.30);
    for (const ox of [-0.14, 0, 0.14]) {
      P.add('hullDetail', xform(box(0.11, 0.06, 0.08), 0, 0, 0, glacis, 0, 0), 0.50 + ox, deckY(2.62) + 0.03, 2.62);
      P.add('hullGlass', xform(box(0.09, 0.035, 0.008), 0, 0, 0, glacis, 0, 0), 0.50 + ox, deckY(2.62) + 0.04, 2.665);
    }
    if (t3) {
      // the Tamoyo 3's spare links across the glacis between the lamps (the collector's photographs)
      KIT.spareTrackStrip(P, 'hull', -0.20, deckY(2.80) + 0.035, 2.80, 3, glacis, 0);
      KIT.spareTrackStrip(P, 'hull', 0.20, deckY(2.80) + 0.035, 2.80, 3, glacis, 0);
    }
    // the engine deck: grille fields either side, the louvred band at the rear
    for (const s of [-1, 1] as const) {
      const zc = -2.05, y = deckY(zc);
      P.add('hullDark', xform(box(0.86, 0.016, 1.30), 0, 0, 0, -Math.atan((H.rearDeckY - H.deckY) / (H.rearDeckZ - rearTopZ)), 0, 0), s * 0.56, y + 0.008, zc);
      for (let k = 0; k < 7; k++) {
        const zk = -1.55 - k * 0.18;
        P.addEquipment('hull', box(0.80, 0.012, 0.035), s * 0.56, deckY(zk) + 0.014, zk);
      }
    }
    // the stencils: "VBC XMB 3 TAMOYO" ahead, the BERNARDINI plate and the CTEx mark aft (Vesp's profiles, the photographs)
    for (const s of [-1, 1] as const) {
      const x = s * (t3 ? H.sponsonX + 0.012 : H.fenderX + 0.026), y = t3 ? 1.42 : 1.02;
      P.decal('hull', 'stencil', 'TAMOYO', 0.40, [x, y, 2.05], s * Math.PI / 2);
      P.decal('hull', 'stencil', 'BERNARDINI', 0.48, [x, y, -2.30], s * Math.PI / 2);
    }
    P.decal('hull', 'stencil', 'TAMOYO', 0.42, [0, 0.82, H.noseZ - 0.18], 0, -0.6);
  };
  buildTamoyoHullFittings();
  yield 'buildTamoyoHullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, RING.y, RING.z);
  const roof = t3 ? 0.75 : 0.72;
  const front = t3 ? 1.42 : 1.20, rear = t3 ? -2.11 : -2.05, bustleZ = -0.90, bustleFloor = 0.13;
  const hwBase = t3 ? 1.10 : 1.12, hwRoof = t3 ? 1.00 : 0.94;
  const buildTamoyoTurret = (): void => {
    P.add('turret', cylY(0.92, 0.96, 0.10, P.q ? 28 : 18), 0, -0.04, 0);
    // the body: slab sides leaning in to the roof, the bustle's underside raised over the engine deck
    const ring = (floor: number, hw0: number, hw1: number): SectionPoint[] => [[-hw0, floor], [hw0, floor], [hw1, roof], [-hw1, roof]];
    const bodyStations = t3
      // the Tamoyo 3: the vertical front plate with chamfered corners, a bevel to the roof
      ? [{ z: rear, ring: ring(bustleFloor, hwBase - 0.04, hwRoof - 0.04) }, { z: bustleZ, ring: ring(bustleFloor, hwBase, hwRoof) },
        { z: bustleZ + 0.01, ring: ring(0.02, hwBase, hwRoof) }, { z: front - 0.24, ring: ring(0.02, hwBase, hwRoof) },
        { z: front, ring: ring(0.02, hwBase - 0.26, hwRoof - 0.26) }]
      // the Tamoyo 1: the sloped front plate falls from the roof's edge to the gun shield's top
      : [{ z: rear, ring: ring(bustleFloor, hwBase - 0.05, hwRoof - 0.05) }, { z: bustleZ, ring: ring(bustleFloor, hwBase, hwRoof) },
        { z: bustleZ + 0.01, ring: ring(0.02, hwBase, hwRoof) }, { z: 0.72, ring: ring(0.02, hwBase, hwRoof) },
        { z: front, ring: [[-(hwBase - 0.10), 0.02], [hwBase - 0.10, 0.02], [hwBase - 0.22, 0.46], [-(hwBase - 0.22), 0.46]] as SectionPoint[] }];
    const body = sectionSolid(bodyStations);
    body.userData.primaryStockRole = 'tamoyo-turret';
    P.add('turret', body);
    if (t3) {
      // the spaced-armour front: an outer plate stood off the vertical face, the concertina boot's frame
      P.add('turret', box(2 * (hwBase - 0.30), 0.62, 0.06), 0, 0.37, front + 0.08);
      P.add('turretDetail', box(0.06, 0.62, 0.10), -(hwBase - 0.30), 0.37, front + 0.04);
      P.add('turretDetail', box(0.06, 0.62, 0.10), hwBase - 0.30, 0.37, front + 0.04);
    }
    for (const s of [-1, 1] as const) {
      liftEye(P, 'turretDetail', s * (hwRoof - 0.10), roof + 0.005, front - 0.40, s * 0.4);
      liftEye(P, 'turretDetail', s * (hwRoof - 0.10), roof + 0.005, rear + 0.25, s * 2.7);
    }
  };
  buildTamoyoTurret();
  yield 'buildTamoyoTurret';

  const buildTamoyoTurretFittings = (): void => {
    // the commander's cupola (right) with the .50 on it, its vision blocks; the gunner's sight ahead; the loader's hatch
    const cx = -0.48, cz = -0.45, cr = 0.32;
    P.addCupola('turret', cylY(cr, cr * 1.06, 0.16, P.q ? 24 : 14), cx, roof + 0.08, cz);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      P.add('turretDetail', box(0.10, 0.07, 0.05), cx + Math.sin(a) * cr, roof + 0.10, cz + Math.cos(a) * cr, 0, a, 0);
      P.add('turretGlass', box(0.075, 0.035, 0.012), cx + Math.sin(a) * (cr + 0.026), roof + 0.10, cz + Math.cos(a) * (cr + 0.026), 0, a, 0);
    }
    P.addCupola('turret', cylY(cr * 0.92, cr * 0.96, 0.05, P.q ? 24 : 14), cx, roof + 0.185, cz);
    P.addEquipment('turretDark', cylY(0.03, 0.04, 0.16, 10), cx, roof + 0.29, cz + cr + 0.02);
    const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.62, elev: 0.03, ring: false,
      shield: false, seed: 6631, working: true });
    mg.name = 'tamoyoCommanderM2';
    mg.position.set(cx, roof + 0.37, cz + cr + 0.02);
    P.turretG.add(mg);
    // the gunner's sight head ahead of the cupola (the Tamoyo 3's Ferranti FCS with its rangefinder and thermal box)
    const gz = t3 ? 0.62 : 0.40;
    P.addEquipment('turret', box(t3 ? 0.34 : 0.24, t3 ? 0.26 : 0.18, 0.36), -0.50, roof + (t3 ? 0.13 : 0.09), gz);
    P.add('turretGlass', box(t3 ? 0.24 : 0.16, 0.08, 0.008), -0.50, roof + (t3 ? 0.15 : 0.11), gz + 0.184);
    P.addCupola('turret', cylY(0.28, 0.29, 0.05, P.q ? 22 : 12), 0.50, roof + 0.025, -0.40);
    P.add('turretDetail', cylY(0.25, 0.26, 0.03, P.q ? 22 : 12), 0.50, roof + 0.065, -0.40);
    // the roof ventilator and the antennas aft
    P.addEquipment('turret', cylY(0.15, 0.17, 0.05, P.q ? 18 : 10), 0.10, roof + 0.025, -1.20);
    P.addEquipment('turret', xform(sph(0.15, P.q ? 16 : 10, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), 0.10, roof + 0.05, -1.20);
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.08, 0.08, 0.08), s * 0.62, roof + 0.04, rear + 0.40);
      P.addEquipment('turret', cylY(0.012, 0.015, 2.0, 8), s * 0.62, roof + 1.04, rear + 0.40, 0, 0, s * 0.03);
    }
    // the dischargers: the Tamoyo 1's four on each cheek, aimed forward and out; the Tamoyo 3's two by two at the rear corners
    for (const s of [-1, 1] as const) {
      if (!t3) {
        for (let k = 0; k < 4; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.035, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.45, s * 0.55, 0),
            s * (hwRoof + 0.02 + k * 0.02), 0.55, 0.62 - k * 0.12);
        }
        P.addEquipment('turret', box(0.08, 0.08, 0.50), s * (hwRoof + 0.06), 0.48, 0.44);
      } else {
        P.addEquipment('turret', box(0.10, 0.28, 0.36), s * (hwBase + 0.02), 0.48, -1.10);
        for (let row = 0; row < 2; row++) for (let k = 0; k < 2; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.035, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.55, s * 0.40, 0),
            s * (hwBase + 0.10), 0.42 + row * 0.13, -0.98 - k * 0.16);
        }
      }
    }
    // the bustle's rear stowage: the Tamoyo 1's netted box, the Tamoyo 3's rack with a jerrycan
    if (!t3) {
      P.addEquipment('turret', box(1.70, 0.36, 0.30), 0, 0.42, rear - 0.12);
      stowage(P, 'turretCloth', rng, [[-0.40, 0.66, rear - 0.12, 0.70, 0.18, 0.28], [0.42, 0.65, rear - 0.12, 0.62, 0.16, 0.26]]);
    } else {
      const z0 = rear, z1 = rear - 0.30, half = 0.80, floorY = 0.20, railY = 0.56;
      for (const s of [-1, 1] as const) {
        P.addEquipment('turretDetail', box(0.03, 0.03, z0 - z1), s * half, railY, (z0 + z1) / 2);
        P.addEquipment('turretDetail', box(0.03, 0.03, z0 - z1), s * half, floorY, (z0 + z1) / 2);
        for (const z of [z0 - 0.02, z1 + 0.02]) P.addEquipment('turretDetail', box(0.028, railY - floorY + 0.03, 0.028), s * half, (railY + floorY) / 2, z);
      }
      P.addEquipment('turretDetail', box(half * 2, 0.03, 0.03), 0, railY, z1 + 0.015);
      P.addEquipment('turretDetail', box(half * 2, 0.03, 0.03), 0, floorY, z1 + 0.015);
      stowage(P, 'turretCloth', rng, [[-0.30, floorY + 0.14, rear - 0.15, 0.80, 0.24, 0.24]]);
      jerryCan(P, 'turretCloth', 0.55, floorY + 0.20, rear - 0.15, 0.16);
    }
    P.turretG.userData.tamoyoTurretReceipt = {
      revision: 'tamoyo-266-r1', mark, roofY: roof, front, rear, sideSkirts: !t3, dischargers: t3 ? 8 : 8,
    };
  };
  buildTamoyoTurretFittings();
  yield 'buildTamoyoTurretFittings';

  // ---------------------------------------------------------------- gun --
  const buildTamoyoGun = (): void => {
    const trunnion = t3 ? { y: 0.335, z: 1.05 } : { y: 0.315, z: 0.95 };
    P.gunG.position.set(0, trunnion.y, trunnion.z);
    const seg = P.q ? 24 : 12;
    if (t3) {
      // the narrow mantlet in its concertina boot behind the spaced front plate
      P.addGunExtra(box(0.46, 0.36, 0.30), 0, 0.02, 0.30);
      for (let k = 0; k < 4; k++) P.add('gunMountCloth', box(0.42 - k * 0.03, 0.32 - k * 0.03, 0.04), 0, 0.02, 0.48 + k * 0.05);
      P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.20, -0.02, 0.47);
      // Royal Ordnance 105 mm L7A3 (barrel no. 001): the fume extractor 0.4 of the way out, a plain muzzle; the muzzle
      // on the published 8.9 m
      const len = (H.noseZ + 2.42) - (RING.z + trunnion.z), r0 = 0.085, r1 = 0.072, ez = 1.95, el = 0.62;
      P.add('gun', cylZ(r1, len - 0.62, seg, r0), 0, 0, (0.62 + len) / 2);
      P.add('gun', cylZ(0.12, el - 0.12, seg), 0, 0, ez);
      P.add('gun', cylZ(0.12, 0.06, seg, 0.082), 0, 0, ez - el / 2 + 0.03);
      P.add('gun', cylZ(0.078, 0.06, seg, 0.12), 0, 0, ez + el / 2 - 0.03);
      muzzleBore(P, { z: len + 0.004, r: 0.053 });
      P.muzzleZ = len;
      P.gunG.userData.tamoyoGunReceipt = { mark, caliberMm: 105, muzzleZ: len };
    } else {
      // the broad gun shield, a wedge from its top to the sloped front plate
      P.addGunExtra(slab(
        [-0.62, -0.30, 0.10], [0.62, -0.30, 0.10], [0.58, -0.28, 0.40], [-0.58, -0.28, 0.40],
        [-0.62, 0.20, 0.10], [0.62, 0.20, 0.10], [0.50, 0.12, 0.40], [-0.50, 0.12, 0.40]));
      P.addGunExtra(cylZ(0.13, 0.12, seg, 0.15), 0, 0, 0.46);
      P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.24, -0.06, 0.42);
      P.addGunExtraDark(cylZ(0.045, 0.04, 12), -0.26, 0.04, 0.42);
      // the 90 mm BR3 (the CS Super 90 copy, L/52): the bore evacuator, the double-baffle brake; the muzzle on the published
      // 8.77 m
      const len = (H.noseZ + 2.27) - (RING.z + trunnion.z), r0 = 0.072, r1 = 0.062;
      P.add('gun', cylZ(r1, len - 0.52 - 0.30, seg, r0), 0, 0, (0.52 + len - 0.30) / 2);
      P.add('gun', cylZ(0.095, 0.40, seg), 0, 0, len * 0.62);
      P.add('gun', cylZ(0.095, 0.05, seg, r1 * 1.02), 0, 0, len * 0.62 - 0.225);
      P.add('gun', cylZ(r1 * 1.02, 0.05, seg, 0.095), 0, 0, len * 0.62 + 0.225);
      // the brake: two baffles with their ports, a cap
      P.add('gun', cylZ(0.11, 0.30, seg), 0, 0, len - 0.15);
      for (const z of [len - 0.22, len - 0.08]) P.add('gunDark', cylX(0.05, 0.225, 12), 0, 0, z);
      muzzleBore(P, { z: len + 0.004, r: 0.046 });
      P.muzzleZ = len;
      P.gunG.userData.tamoyoGunReceipt = { mark, caliberMm: 90, muzzleZ: len };
    }
    P.mats.glass.color.setHex(0x3a463f);
    P.topY = RING.y;
  };
  buildTamoyoGun();
}

export const buildTamoyo1 = steppedBuilder((P: TankBuilderPort) => buildTamoyoSteps(P, 't1'));
export const buildTamoyo3 = steppedBuilder((P: TankBuilderPort) => buildTamoyoSteps(P, 't3'));

/** The datums a fixture holds the build to (docs/references/tanks/tamoyo1.md). */
export const TAMOYO_DATUMS = Object.freeze({
  hull: H, roadWheelZs: Object.freeze([...ROAD_WHEEL_ZS]), ring: RING,
  muzzleHullZ: Object.freeze({ t1: H.noseZ + 2.27, t3: H.noseZ + 2.42 }),
});
