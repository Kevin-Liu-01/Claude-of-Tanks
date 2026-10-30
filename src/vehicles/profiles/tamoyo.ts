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
const HULL = Object.freeze({
  noseZ: 3.25, sternZ: -3.25, bellyY: 0.45, lowerX: 1.05, sponsonX: 1.46, sponsonFloorY: 1.12, deckY: 1.565,
  noseY: 1.15, lipY: 1.10, glacisZ: 2.13, lowerNoseZ: 2.80, rearDeckZ: -0.90, rearDeckY: 1.75, rearLowY: 0.78,
  rearBellyZ: -2.93, fenderX: 1.61, fenderY: 1.25, trackXc: 1.345, trackW: 0.53,
});
// The Tamoyo 1's deck and engine deck 0.09 m lower (the critics' round 2 against TE's published 2.2 m to its turret
// roof and Vesp's profile, whose band from the fender line to the deck edge is 0.23 m); the Tamoyo 3 keeps the 2.35 m.
const T1_DECK_DROP = 0.09;
const T1_HULL = Object.freeze({ ...HULL, deckY: HULL.deckY - T1_DECK_DROP, rearDeckY: HULL.rearDeckY - T1_DECK_DROP });
const ROAD_WHEEL_ZS = [2.10, 1.245, 0.42, -0.47, -1.31, -2.14];
const RING_Z = 0.16;

/** Hull top at z: the upper glacis, the flat deck round the turret, the engine deck rising aft. */
function hullTop(h: Readonly<Record<keyof typeof HULL, number>>, z: number): number {
  if (z >= h.glacisZ) return h.noseY + (h.noseZ - z) * (h.deckY - h.noseY) / (h.noseZ - h.glacisZ);
  if (z >= h.rearDeckZ) return h.deckY;
  return h.deckY + (h.rearDeckZ - z) / (h.rearDeckZ - (h.sternZ + 0.20)) * (h.rearDeckY - h.deckY);
}

function* buildTamoyoSteps(P: TankBuilderPort, mark: TamoyoMark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildRunningGear, headlight, liftEye, stowage, torus, jerryCan } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const t3 = mark === 't3';
  const H = t3 ? HULL : T1_HULL;
  const deckY = (z: number): number => hullTop(H, z);
  const RING = Object.freeze({ y: H.deckY, z: RING_Z });
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
      // the fender's boxed front end over the idler (Vesp's profiles): a closed wedge from the sponson out to the side
      // plates' outer face, its underside clear of the track round the idler
      const xi = s * H.sponsonX, xo = s * (H.fenderX + 0.023);
      P.add('hullDetail', slab(
        [xi, 1.14, 3.02], [xo, 1.14, 3.02], [xo, 1.00, 3.30], [xi, 1.00, 3.30],
        [xi, H.fenderY, 3.02], [xo, H.fenderY, 3.02], [xo, 1.10, 3.38], [xi, 1.10, 3.38]));
    }
    P.add('hullDetail', box(H.lowerX * 2, 0.05, 0.04), 0, (H.lipY + H.noseY) / 2, H.noseZ - 0.005);
  };
  buildTamoyoHull();
  yield 'buildTamoyoHull';

  // ---------------------------------------------------------------- running gear (torsion bars, six a side) --
  const roadWheelR = 0.315, roadWheelY = 0.40, wheelW = 0.36;
  // three return rollers about half the road wheel's diameter (Vesp's Tamoyo 3), the track's upper run kept at its height
  const rollers = [1.86, -0.11, -1.70].map((z) => ({ z, y: 0.94, r: 0.15 }));
  const buildTamoyoRunningGear = (): void => {
    buildRunningGear(P, {
      style: 'dished', wheelR: roadWheelR, wheelW, wheelY: roadWheelY, xc: H.trackXc, wheelZs: [...ROAD_WHEEL_ZS],
      sprocket: { z: -2.93, y: 0.82, r: 0.31 }, idler: { z: 2.86, y: 0.80, r: 0.29 }, rollers,
      trackW: H.trackW, topY: 1.03, botY: 0.03, contactZF: ROAD_WHEEL_ZS[0], contactZR: ROAD_WHEEL_ZS.at(-1),
      paintedEnds: true, coveredTop: !t3, arms: true, sprocketTeeth: true,
      // double-pin shoes with chevron rubber pads (Vesp's profiles)
      trackPattern: 'merkava-heavy',
    });
    // the rear sprocket's bold tooth crown on its outer ring (Vesp's Tamoyo 3: a toothed sprocket in the open)
    const SPROCKET = Object.freeze({ z: -2.93, y: 0.82, r: 0.31 }), teeth = 12;
    for (const s of [-1, 1] as const) for (let k = 0; k < teeth; k++) {
      const a = (k + 0.5) * (2 * Math.PI / teeth);
      P.add('hullRunningGearDetail', xform(box(0.05, 0.075, 0.07), 0, 0, 0, a, 0, 0), s * (H.trackXc + 0.16),
        SPROCKET.y + Math.cos(a) * (SPROCKET.r - 0.03), SPROCKET.z + Math.sin(a) * (SPROCKET.r - 0.03));
    }
    for (const z of ROAD_WHEEL_ZS) for (const s of [-1, 1] as const) {
      P.add('hullRunningGearDark', torus(roadWheelR * 0.3, 0.014, P.q ? 16 : 10), s * (H.trackXc + wheelW / 2 + 0.010), roadWheelY, z,
        0, 0, Math.PI / 2);
      P.add('hullRubber', torus(roadWheelR - 0.026, 0.022, P.q ? 28 : 16, 6), s * (H.trackXc + wheelW / 2 - 0.004), roadWheelY, z,
        0, 0, Math.PI / 2);
    }
    if (t3) {
      // the Tamoyo 3's open gear (Vesp's profile): the hull side in shadow under the fender and behind the wheels, each
      // station's arm rising aft from the hub to its pivot, a bump stop over every wheel
      for (const s of [-1, 1] as const) {
        P.add('hullDark', box(0.006, H.fenderY - 0.015 - H.sponsonFloorY, 6.10), s * (H.sponsonX + 0.003),
          (H.fenderY - 0.015 + H.sponsonFloorY) / 2, 0.02);
        P.add('hullDark', box(0.006, H.sponsonFloorY - 0.52, 5.70), s * (H.lowerX + 0.003), (H.sponsonFloorY + 0.52) / 2, -0.10);
        for (const z of ROAD_WHEEL_ZS) {
          const hub = [s * (H.trackXc - wheelW / 2 - 0.035), roadWheelY, z] as const;
          const pivot = [s * (H.lowerX + 0.05), 0.80, z - 0.34] as const;
          bar('hullRunningGearDetail', hub, pivot, 0.045);
          P.add('hullRunningGearDetail', cylX(0.075, 0.09, P.q ? 14 : 8), s * (H.lowerX + 0.045), pivot[1], pivot[2]);
          P.add('hullRunningGearDetail', box(0.10, 0.12, 0.10), s * (H.lowerX + 0.05), 0.95, z + 0.10);
        }
      }
    } else {
      // the Tamoyo 1's long side plates over the upper running gear (four a side), hung from the fender's edge
      // (Vesp's profile: the lower edge clears each wheel's top and hangs down in a tab between the wheels; a bolted
      // joint strap between the plates)
      const t = 0.022, low = 0.76, tabLow = 0.64, z0 = 3.02, z1 = -3.05, seg = (z0 - z1) / 4;
      const tabs = [(2.86 + ROAD_WHEEL_ZS[0]) / 2, ...ROAD_WHEEL_ZS.slice(1).map((z, i) => (z + ROAD_WHEEL_ZS[i]) / 2),
        (ROAD_WHEEL_ZS.at(-1)! - 2.93) / 2];
      for (const s of [-1, 1] as const) {
        const bucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', x = s * (H.fenderX + 0.012);
        for (let k = 0; k < 4; k++) {
          const za = z0 - k * seg, zb = za - seg;
          P.addEquipment(bucket, box(t, H.fenderY - low, seg - 0.012), x, (H.fenderY + low) / 2, (za + zb) / 2);
          P.add('hullDetail', box(t + 0.012, H.fenderY - low - 0.02, 0.05), x + s * 0.004, (H.fenderY + low) / 2, za);
          for (const dz of [-0.03, 0.03]) {
            P.add('hullDetail', cylX(0.016, 0.014, 8), x + s * 0.020, low + 0.06, za + dz);
          }
        }
        for (const zc of tabs) {
          const xa = x - t / 2, xb = x + t / 2;
          P.addEquipment(bucket, slab(
            [xa, tabLow, zc + 0.11], [xb, tabLow, zc + 0.11], [xb, tabLow, zc - 0.11], [xa, tabLow, zc - 0.11],
            [xa, low + 0.02, zc + 0.21], [xb, low + 0.02, zc + 0.21], [xb, low + 0.02, zc - 0.21], [xa, low + 0.02, zc - 0.21]));
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
      // the twin lamps in their guards on the glacis corners, the mirrors behind them folded flat on short stalks (under
      // the gun's sweep)
      const z = 2.92, y = deckY(z) + 0.05;
      if (t3) {
        // the Tamoyo 3: one large lamp a side, set inboard on a square base with a guard ring (the collector's photograph)
        // (low on the glacis, under the gun's sweep at -8 degrees)
        const lx = s * 0.80, lz = 2.95, ly = deckY(lz);
        P.add('hullDark', xform(box(0.24, 0.05, 0.20), 0, 0, 0, glacis, 0, 0), lx, ly + 0.025, lz);
        headlight(P, lx, ly + 0.085, lz + 0.03, -glacis * 0.5, 0.085);
        P.add('hullDark', torus(0.10, 0.011, P.q ? 18 : 10, 6), lx, ly + 0.085, lz + 0.10, Math.PI / 2, 0, 0);
      } else {
        for (const dx of [-0.07, 0.07]) headlight(P, s * 1.18 + dx, y + 0.03, z + 0.03, -glacis * 0.5, 0.05);
        const g = [[s * 1.34, y - 0.04, z - 0.08], [s * 1.34, y + 0.10, z + 0.08], [s * 1.02, y + 0.10, z + 0.08], [s * 1.02, y - 0.04, z - 0.08]];
        for (let i = 0; i + 1 < g.length; i++) bar('hullDark', g[i], g[i + 1], 0.011);
      }
      P.addEquipment('hullDark', cylY(0.012, 0.012, 0.10, 8), s * 1.50, H.fenderY + 0.05, 2.95);
      P.addEquipment('hullDark', box(0.14, 0.02, 0.11), s * 1.45, H.fenderY + 0.11, 2.95);
      // the tow eyes on the nose plate, the lifting eyes
      P.add('hullDark', box(0.12, 0.12, 0.08), s * 0.70, 0.86, 3.02);
      P.add('hullDark', torus(0.065, 0.02, 12, 6), s * 0.70, 0.86, 3.08, Math.PI / 2, 0, 0);
      liftEye(P, 'hullDetail', s * 1.28, deckY(2.60) + 0.012, 2.60, s * 0.3);
      // the rear plate: the short exhaust pipes at its upper corners just under the deck line (Vesp's profiles), the tail
      // lights, the tow hooks
      P.addEquipment('hullDark', cylZ(0.085, 0.20, P.q ? 16 : 10), s * 1.12, 1.53, H.sternZ - 0.10);
      P.add('hullDark', torus(0.085, 0.014, P.q ? 16 : 10, 6), s * 1.12, 1.53, H.sternZ - 0.20, Math.PI / 2, 0, 0);
      P.add('hullDark', box(0.05, 0.12, 0.05), s * 1.12, 1.53, H.sternZ - 0.02);
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
    // the spare links in one centred row across the lower glacis between the lamps, each link fore-and-aft (the TI-2's
    // front photograph: four; the collector's Tamoyo 3: five)
    KIT.spareTrackStrip(P, 'hull', 0, deckY(2.97) + 0.035, 2.97, t3 ? 5 : 4, glacis, Math.PI / 2);
    // the engine deck: grille fields either side, the louvred band at the rear
    for (const s of [-1, 1] as const) {
      const zc = -2.05, y = deckY(zc);
      // (laid on the deck as it rises aft: a positive turn about x lowers the field's front end)
      P.add('hullDark', xform(box(0.86, 0.016, 1.30), 0, 0, 0, Math.atan((H.rearDeckY - H.deckY) / (H.rearDeckZ - rearTopZ)), 0, 0), s * 0.56, y + 0.008, zc);
      for (let k = 0; k < 7; k++) {
        const zk = -1.55 - k * 0.18;
        P.addEquipment('hull', box(0.80, 0.012, 0.035), s * 0.56, deckY(zk) + 0.014, zk);
      }
    }
    // the stencils: "VBC XMB 3 TAMOYO" ahead, the BERNARDINI plate and the CTEx mark aft (Vesp's profiles, the photographs)
    // (a stencil is a square quad whose text the painter sizes by its length: the short words are padded with a space a
    // side so their last letter is never clipped. Every quad stays inside the plate behind it and under the deck's edge,
    // out of the gun's sweep and never over the sky: the Tamoyo 1's words on its side plates and its registration on the
    // sponson band above them, its text just over the fender's edge strip; the Tamoyo 3's on the sponson band)
    for (const s of [-1, 1] as const) {
      const band = s * (H.sponsonX + 0.012), plate = s * (H.fenderX + 0.026), r = s * Math.PI / 2;
      const ctex = (x: number, y: number, z: number, size: number): void => {
        // the CTEx mark: a ring with the letters inside it
        P.decal('hull', 'stencil', 'O', size, [x, y, z], r);
        P.decal('hull', 'stencil', 'CTEx', size * 0.19, [x + s * 0.003, y, z], r);
      };
      if (t3) {
        P.decal('hull', 'stencil', 'VBC XMB 2 TAMOYO', 0.40, [band, 1.335, 0.80], r);
        P.decal('hull', 'stencil', ' BERNARDINI ', 0.40, [band, 1.335, -2.15], r);
        ctex(band, 1.335, -2.70, 0.40);
      } else {
        P.decal('hull', 'stencil', ' TAMOYO ', 0.48, [plate, 1.005, 2.70], r);
        P.decal('hull', 'stencil', 'EB 246650124', 0.30, [band, 1.295, 1.04], r);
        P.decal('hull', 'stencil', ' BERNARDINI ', 0.48, [plate, 1.005, -2.10], r);
        ctex(plate, 1.005, -2.70, 0.48);
      }
    }
    // on the lower nose plate, which faces forward and down (its foot 0.45 m back from the tip)
    const noseTilt = Math.atan2(H.noseZ - H.lowerNoseZ, H.lipY - H.bellyY);
    const onNose = (y: number): [number, number, number] =>
      [0.12, y, H.lowerNoseZ + (y - H.bellyY) / (H.lipY - H.bellyY) * (H.noseZ - H.lowerNoseZ) + 0.01];
    P.decal('hull', 'stencil', ' TAMOYO ', 0.36, onNose(0.93), 0, noseTilt);
    P.decal('hull', 'stencil', ' BERNARDINI ', 0.42, onNose(0.70), 0, noseTilt);
  };
  buildTamoyoHullFittings();
  yield 'buildTamoyoHullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, RING.y, RING.z);
  const roof = t3 ? 0.75 : 0.72;
  // (the Tamoyo 1's front 0.40 m further forward than round 2: Vesp's profile puts its mantlet face 1.72 m and its roof's
  // front edge 0.86 m ahead of the ring)
  const front = t3 ? 1.42 : 1.60, rear = t3 ? -2.11 : -2.05, bustleZ = -0.90, bustleFloor = 0.13;
  // (the Tamoyo 3's side walls lean in harder than round 2's: the collector's photograph)
  const hwBase = t3 ? 1.10 : 1.12, hwRoof = t3 ? 0.94 : 0.94;
  // the Tamoyo 1's wedge: the roof's front edge, the wedge's foot over the gun shield, the chin's top at the front
  const T1_WEDGE = Object.freeze({ z0: 0.75, z1: 1.45, y1: 0.40, yTip: 0.32 });
  const wedgeY = (z: number): number => roof - (z - T1_WEDGE.z0) * (roof - T1_WEDGE.y1) / (T1_WEDGE.z1 - T1_WEDGE.z0);
  /** The turret's side at height y (the slab sides lean in to the roof; the bustle from its raised floor). */
  const sideX = (y: number, bustle: boolean): number => {
    const f = bustle ? bustleFloor : 0.02;
    return hwBase + (hwRoof - hwBase) * (y - f) / (roof - f);
  };
  const buildTamoyoTurret = (): void => {
    P.add('turret', cylY(0.92, 0.96, 0.10, P.q ? 28 : 18), 0, -0.04, 0);
    // the body: slab sides leaning in to the roof, the bustle's underside raised over the engine deck
    const ring = (floor: number, hw0: number, hw1: number, top = roof): SectionPoint[] => [[-hw0, floor], [hw0, floor], [hw1, top], [-hw1, top]];
    const bodyStations = t3
      // the Tamoyo 3: the vertical front plate with chamfered corners, its top edge chamfered to the roof (Vesp's profile)
      ? [{ z: rear, ring: ring(bustleFloor, hwBase - 0.04, hwRoof - 0.04) }, { z: bustleZ, ring: ring(bustleFloor, hwBase, hwRoof) },
        { z: bustleZ + 0.01, ring: ring(0.02, hwBase, hwRoof) }, { z: front - 0.24, ring: ring(0.02, hwBase, hwRoof) },
        { z: front - 0.13, ring: ring(0.04, hwBase - 0.12, hwRoof - 0.12) },
        { z: front, ring: ring(0.06, hwBase - 0.26, hwRoof - 0.26, roof - 0.12) }]
      // the Tamoyo 1: the long wedge over the front quarter, from the roof's edge down to a short chin under the gun
      // (Vesp's profile: the wedge falls about 0.4 m over 0.7 m; the TI-2's front photograph)
      : [{ z: rear, ring: ring(bustleFloor, hwBase - 0.05, hwRoof - 0.05) }, { z: bustleZ, ring: ring(bustleFloor, hwBase, hwRoof) },
        { z: bustleZ + 0.01, ring: ring(0.02, hwBase, hwRoof) }, { z: T1_WEDGE.z0, ring: ring(0.02, hwBase, hwRoof) },
        { z: T1_WEDGE.z1, ring: ring(0.06, hwBase - 0.06, hwRoof - 0.04, T1_WEDGE.y1) },
        { z: front, ring: ring(0.16, hwBase - 0.14, hwRoof - 0.10, T1_WEDGE.yTip) }];
    const body = sectionSolid(bodyStations);
    body.userData.primaryStockRole = 'tamoyo-turret';
    P.add('turret', body);
    if (t3) {
      // (the turret floor rises toward the front, as the bustle's does, so the reversed turret clears the engine deck)
      // the front (the collector's photograph): a central block between the angled cheek facets, the lower half of the
      // black louvred mantlet cover fixed on it below the gun (the upper half rides the gun)
      P.add('turret', box(1.00, 0.48, 0.06), 0, 0.31, front + 0.03);
      for (let k = 0; k < 4; k++) P.add('turretDark', box(0.88, 0.026, 0.06), 0, 0.09 + k * 0.04, front + 0.09);
      P.add('turretDark', box(0.84, 0.17, 0.02), 0, 0.145, front + 0.065);
      // the roof's handrails along both edges, on three stanchions each
      for (const s of [-1, 1] as const) {
        const x = s * (hwRoof - 0.07), y = roof + 0.07;
        bar('turretDetail', [x, y, 0.95], [x, y, -1.70], 0.013);
        for (const z of [0.90, -0.40, -1.65]) bar('turretDetail', [x, roof, z], [x, y, z], 0.012);
      }
      // the roof-rear mast on its base
      P.addEquipment('turretDetail', box(0.12, 0.05, 0.12), 0.25, roof + 0.025, -1.45);
      P.addEquipment('turret', cylY(0.035, 0.045, 0.42, 12), 0.25, roof + 0.26, -1.45);
      P.addEquipment('turretDark', cylY(0.05, 0.05, 0.05, 12), 0.25, roof + 0.495, -1.45);
    }
    for (const s of [-1, 1] as const) {
      // the two horizontal ports low on each side's forward third (both of Vesp's profiles)
      const pz = t3 ? 0.30 : 0.45;
      for (const py of [0.22, 0.40]) {
        const lean = Math.atan2(hwBase - hwRoof, roof - 0.02);
        P.add('turretDark', xform(box(0.02, 0.035, 0.30), 0, 0, 0, 0, 0, s * lean), s * (sideX(py, false) + 0.006), py, pz);
      }
      liftEye(P, 'turretDetail', s * (hwRoof - 0.10), roof + 0.005, t3 ? front - 0.40 : T1_WEDGE.z0 - 0.12, s * 0.4);
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
    // the .50 low on the cupola: its mounting foot on the cupola's top ring, ahead of the hatch (both of Vesp's profiles)
    const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.62, elev: 0.03, ring: false,
      shield: false, seed: 6631, working: true });
    mg.name = 'tamoyoCommanderM2';
    mg.position.set(cx, roof + 0.21, cz + 0.12);
    P.turretG.add(mg);
    // the gunner's sight head ahead of the cupola (the Tamoyo 3's Ferranti FCS with its rangefinder and thermal box; the
    // Tamoyo 1's on the flat roof behind the wedge)
    const gz = t3 ? 0.62 : 0.52;
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
    // the dischargers. The Tamoyo 1: a fan of four large tubes on each front cheek, laid down the wedge and aimed forward,
    // each splayed a little further out (Vesp's profile, the TI-2's front photograph). The Tamoyo 3: a cluster of six on
    // a bracket at about 70% of the turret's length, aimed forward, up and out (Vesp's profile).
    const wedgeTilt = Math.atan2(roof - T1_WEDGE.y1, T1_WEDGE.z1 - T1_WEDGE.z0);
    for (const s of [-1, 1] as const) {
      if (!t3) {
        const r = 0.052;
        for (let k = 0; k < 4; k++) {
          const x = s * (0.60 + k * 0.085), z = T1_WEDGE.z1 - 0.15 - k * 0.12, ny = Math.cos(wedgeTilt), nz = Math.sin(wedgeTilt);
          P.addEquipment('turret', xform(markSmokeTube(cylZ(r, 0.30, P.q ? 14 : 8)), 0, 0, 0, wedgeTilt * 0.85, s * (0.06 + k * 0.07), 0),
            x, wedgeY(z) + (r + 0.012) * ny, z + (r + 0.012) * nz);
        }
        // the tubes' cradle on the wedge
        const cz = T1_WEDGE.z1 - 0.27;
        P.addEquipment('turretDetail', xform(box(0.38, 0.03, 0.30), 0, 0, 0, wedgeTilt, 0, 0), s * 0.73, wedgeY(cz) + 0.012, cz);
      } else {
        const bx = sideX(0.48, true) + 0.06;
        P.addEquipment('turret', box(0.16, 0.30, 0.52), s * bx, 0.48, -1.08);
        for (let row = 0; row < 2; row++) for (let k = 0; k < 3; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.036, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.55, s * 0.40, 0),
            s * (bx + 0.10), 0.41 + row * 0.14, -0.90 - k * 0.16);
        }
      }
    }
    // the bustle: a clean roof; the Tamoyo 1's netted stowage bin on each side of the bustle (Vesp's profile, the CIBld
    // tank); on both marks a pair of cans upright on a bracket on the rear plate (both profiles)
    if (!t3) {
      const z0 = -1.02, z1 = -1.86, yLo = 0.28, yHi = 0.58, out = 1.31;
      for (const s of [-1, 1] as const) {
        const xi0 = sideX(yLo, true) - 0.01, xi1 = sideX(yHi, true) - 0.01;
        P.addEquipment('turretDetail', slab(
          [s * xi0, yLo, z0], [s * out, yLo, z0], [s * out, yLo, z1], [s * xi0, yLo, z1],
          [s * xi1, yHi, z0], [s * out, yHi, z0], [s * out, yHi, z1], [s * xi1, yHi, z1]));
        stowage(P, 'turretCloth', rng, [[s * (xi1 + out) / 2, yHi + 0.05, (z0 + z1) / 2, out - xi1 - 0.04, 0.12, z0 - z1 - 0.06]]);
        // the net's cords over the load and down the bin's face
        for (const z of [z0 - 0.10, (z0 + z1) / 2, z1 + 0.10]) {
          P.add('turretDark', box(out - xi1 + 0.02, 0.012, 0.012), s * (xi1 + out) / 2, yHi + 0.115, z);
          P.add('turretDark', box(0.012, yHi - yLo + 0.10, 0.012), s * (out + 0.007), (yHi + yLo) / 2 + 0.05, z);
        }
        P.add('turretDark', box(0.012, 0.012, z0 - z1), s * (out + 0.007), yHi - 0.06, (z0 + z1) / 2);
      }
    }
    const canY = roof - 0.28;
    P.addEquipment('turretDetail', box(0.46, 0.03, 0.30), 0.42, canY - 0.255, rear - 0.15);
    for (const dx of [-0.17, 0.17]) P.addEquipment('turretDetail', box(0.03, 0.30, 0.03), 0.42 + dx, canY - 0.12, rear - 0.015);
    jerryCan(P, 'turretCloth', 0.42, canY, rear - 0.16, 0);
    P.turretG.userData.tamoyoTurretReceipt = {
      revision: 'tamoyo-266-r2', mark, roofY: roof, front, rear, sideSkirts: !t3, dischargers: t3 ? 12 : 8,
    };
  };
  buildTamoyoTurretFittings();
  yield 'buildTamoyoTurretFittings';

  // ---------------------------------------------------------------- gun --
  const buildTamoyoGun = (): void => {
    const trunnion = t3 ? { y: 0.335, z: 1.05 } : { y: 0.315, z: 1.35 };
    P.gunG.position.set(0, trunnion.y, trunnion.z);
    const seg = P.q ? 24 : 12;
    if (t3) {
      // the narrow mantlet behind the spaced front plate, the black ribbed rubber boot over the gun's opening in front of
      // it (the collector's photograph; its lowest rib clear of the deck at -8 degrees)
      // (every gun-mount part's lowest edge at least 0.115 m under the bore: clear of the raised engine deck at level over
      // the rear arc)
      P.addGunExtra(box(0.46, 0.30, 0.30), 0, 0.035, 0.28);
      for (let k = 0; k < 7; k++) P.addGunExtraDark(box(0.88, 0.026, 0.07), 0, -0.10 + k * 0.04, 0.475);
      P.addGunExtraDark(box(0.84, 0.27, 0.02), 0, 0.02, 0.445);
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
      // the gun shield at the wedge's foot, between the discharger fans (its foot clear of the deck at -8 degrees, its top
      // under the wedge)
      P.addGunExtra(slab(
        [-0.46, -0.22, 0.10], [0.46, -0.22, 0.10], [0.42, -0.20, 0.30], [-0.42, -0.20, 0.30],
        [-0.44, 0.12, 0.10], [0.44, 0.12, 0.10], [0.36, 0.07, 0.30], [-0.36, 0.07, 0.30]));
      P.addGunExtra(cylZ(0.13, 0.12, seg, 0.15), 0, 0, 0.36);
      P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.24, -0.06, 0.32);
      P.addGunExtraDark(cylZ(0.045, 0.04, 12), -0.26, 0.04, 0.32);
      // the 90 mm BR3 (the CS Super 90 copy, L/52) as Vesp draws it: a plain sleeved tube with two collar joints, a
      // single-baffle brake tapering back into the tube with one large opening each side; the muzzle on the published 8.77 m
      const len = (H.noseZ + 2.27) - (RING.z + trunnion.z), r0 = 0.080, r1 = 0.068, bR = 0.105, bL = 0.34;
      P.add('gun', cylZ(r1, len - 0.42 - bL, seg, r0), 0, 0, (0.42 + len - bL) / 2);
      for (const f of [0.36, 0.68]) {
        const z = 0.42 + (len - bL - 0.42) * f, r = r0 + (r1 - r0) * f;
        P.add('gun', cylZ(r + 0.008, 0.035, seg), 0, 0, z);
      }
      // the brake: the taper, the rear collar, the bridges over and under the side openings, the inner channel, the baffle
      P.add('gun', cylZ(bR, 0.10, seg, r1), 0, 0, len - bL + 0.05);
      P.add('gun', cylZ(bR, 0.05, seg), 0, 0, len - 0.215);
      for (const sy of [-1, 1]) P.add('gun', box(0.15, 0.035, 0.15), 0, sy * (bR - 0.0175), len - 0.115);
      P.add('gunDark', cylZ(0.062, 0.15, seg), 0, 0, len - 0.115);
      P.add('gun', cylZ(bR, 0.05, seg), 0, 0, len - 0.025);
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
  hull: HULL, roadWheelZs: Object.freeze([...ROAD_WHEEL_ZS]), ring: Object.freeze({ y: HULL.deckY, z: RING_Z }),
  ringY: Object.freeze({ t1: T1_HULL.deckY, t3: HULL.deckY }),
  muzzleHullZ: Object.freeze({ t1: HULL.noseZ + 2.27, t3: HULL.noseZ + 2.42 }),
});
