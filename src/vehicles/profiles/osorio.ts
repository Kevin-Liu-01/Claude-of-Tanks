// The Engesa EE-T1 Osório (release 266; owner 2026-10-29: "EE-T1 Osório. use our tank generation specs"; Main's ruling
// the same day): one first-party build of the two surviving prototypes, which share the Engesa hull and the Vickers turret
// (Bastos 2003: the turrets were interchangeable and the rebuilt P.1 "identical to the P.2"; docs/references/tanks/osorio_p2.md).
// - p2: the 120 mm P.2 (the Saudi "Al Fahd" of the 1987 trials, the CIBld tank since 2013): the GIAT G1 smoothbore with
//   its segmented sleeve and no fume extractor, the SFIM VS580-19 panoramic sight on its pedestal, the VS580-10 gunner's
//   head and the Philips thermal head, two by three dischargers a side, two bins on the turret's left.
// - p1: the 105 mm P.1 (the Army's 1986-87 homologation tank): the L7A3 with its fume extractor and sleeve, the two low
//   OIP LRS-5 heads, two by two dischargers a side, one bin on the left, the fender mirrors and the glacis travel lock.
// Datums: the published 7.13 m hull, 10.10 m (P.2) and 9.36 m (P.1) over the gun, 3.26 m over the skirts (3.20 over the
// tracks), 2.37 m to the turret roof, 0.46 m clearance, 570 mm tracks on 2.63 m centres, 4.49 m on the ground; the ring
// 3.165 m behind the nose (both guns' forward and rearward lengths give it). Stations from Engesa's side, plan and front
// three-view (Forças Terrestres 2015, scaled on the hull and checked on the overall length within 0.2 %) and the CIBld,
// 2022 parade and 2024 Curitiba photographs: the two-plate wedge nose at 1.12 m, a 15-degree upper glacis meeting the
// 1.60 m deck at z 1.95, six 0.66 m dual road wheels on a 0.895 m pitch, the skirts from 1.33 m down to 0.64 m, the
// turret 2.29 m wide, its chevron cheeks 1.44 m ahead of the ring and its bustle 1.95 m behind. A +Z hull's right is -X:
// the commander and gunner sit at -X, the loader and the driver at +X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type OsorioMark = 'p1' | 'p2';

// ------------------------------------------------------------------------------------------------- datums --
const H = Object.freeze({
  noseZ: 3.565, sternZ: -3.565, bellyY: 0.46, lowerX: 1.00, sponsonX: 1.50, sponsonFloorY: 1.02, deckY: 1.60,
  noseY: 1.12, lipY: 1.06, glacisZ: 1.95, glacisTopY: 1.57, lowerGlacisZ: 3.00, rearPlateY: 1.25, rearBellyZ: -3.21,
  fenderX: 1.635, fenderY: 1.345, skirtX: 1.625, skirtTop: 1.33, skirtLow: 0.64, trackXc: 1.315, trackW: 0.57,
});
const ROAD_WHEEL_ZS = [2.20, 1.305, 0.41, -0.485, -1.38, -2.275];
const RING = Object.freeze({ y: 1.60, z: 0.40 });
/** The turret (turret metres, from the ring at the deck): slab sides, a bevelled roof edge, the bustle's rear plate. */
const T = Object.freeze({ hw: 1.145, roofY: 0.77, bevelY: 0.66, bevelX: 1.05, floorY: 0.02, frontZ: 1.00, rearZ: -2.38,
  recessX: 0.45, cheekNoseZ: 1.44, cheekNoseY: 0.40, cheekNoseX: 0.56, cheekFootZ: 1.38, roofEdgeZ: 1.14 });
const TRUNNION = Object.freeze({ y: 0.28, z: 0.85 });

/** Hull deck height at z: the 15-degree upper glacis from the nose to its knee, then the flat deck. */
function deckY(z: number): number {
  if (z >= H.glacisZ) return H.noseY + (H.noseZ - z) * (H.glacisTopY - H.noseY) / (H.noseZ - H.glacisZ);
  if (z >= H.glacisZ - 0.05) return H.glacisTopY + (H.glacisZ - z) / 0.05 * (H.deckY - H.glacisTopY);
  return H.deckY;
}

function* buildOsorioSteps(P: TankBuilderPort, mark: OsorioMark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildRunningGear, headlight, liftEye, stowage, torus, jerryCan } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const p2 = mark === 'p2';
  const glacis = Math.atan2(H.glacisTopY - H.noseY, H.noseZ - H.glacisZ);
  const bar = (slot: string, a: readonly number[], b: readonly number[], r: number): void => {
    P.add(slot, beamBetween([a[0], a[1], a[2]], [b[0], b[1], b[2]], r, 8));
  };

  // ---------------------------------------------------------------- hull --
  const buildOsorioHull = (): void => {
    // the lower hull between the tracks: the lower rear plate, the belly, the lower glacis to the nose lip; its top the
    // deck and the upper glacis
    const LOWER: readonly (readonly [number, number])[] = [[H.sternZ, H.rearPlateY], [H.rearBellyZ, H.bellyY],
      [H.glacisZ, H.bellyY], [H.lowerGlacisZ, H.bellyY], [H.noseZ, H.lipY]];
    P.add('hull', sectionSolid(LOWER.map(([z, b]) => ({ z, ring: [[-H.lowerX, b], [H.lowerX, b], [H.lowerX, deckY(z)],
      [-H.lowerX, deckY(z)]] as SectionPoint[] }))));
    // the sponsons over the tracks, from their floor to the deck and the glacis, the rear plate's full width
    for (const s of [-1, 1] as const) {
      const ring = (z: number): SectionPoint[] => s > 0
        ? [[H.lowerX - 0.01, H.sponsonFloorY], [H.sponsonX, H.sponsonFloorY], [H.sponsonX, deckY(z) - 0.025],
          [H.sponsonX - 0.03, deckY(z)], [H.lowerX - 0.01, deckY(z)]]
        : [[-H.sponsonX, H.sponsonFloorY], [-(H.lowerX - 0.01), H.sponsonFloorY], [-(H.lowerX - 0.01), deckY(z)],
          [-(H.sponsonX - 0.03), deckY(z)], [-H.sponsonX, deckY(z) - 0.025]];
      P.add('hull', sectionSolid([H.sternZ, H.glacisZ, 3.40].map((z) => ({ z, ring: ring(z) }))));
      // the fender shelf over the skirts, the full length of the sponsons
      P.add('hullDetail', box(H.fenderX - H.sponsonX + 0.01, 0.025, 6.80), s * (H.sponsonX + H.fenderX) / 2, H.fenderY - 0.0125, -0.12);
      P.add('hullDetail', box(0.012, 0.05, 6.80), s * (H.fenderX - 0.006), H.fenderY - 0.035, -0.12);
    }
    // the nose: a lip band at the plates' joint and the bar across the glacis between the lamps
    P.add('hullDetail', box(H.lowerX * 2, 0.06, 0.04), 0, (H.lipY + H.noseY) / 2, H.noseZ - 0.005);
    P.add('hullDetail', xform(box(1.70, 0.03, 0.06), 0, 0, 0, glacis, 0, 0), 0, deckY(3.32) + 0.02, 3.32);
  };
  buildOsorioHull();
  yield 'buildOsorioHull';

  // ---------------------------------------------------------------- running gear (Dunlop hydropneumatic, six a side) --
  // (the wheels about 0.8 of their pitch, nearly touching, as the Saudi 1987 and 2022 photographs show)
  const roadWheelR = 0.365, roadWheelY = 0.435, wheelW = 0.42;
  const rollers = [1.76, -0.04, -1.84].map((z) => ({ z, y: 0.85, r: 0.085 }));
  const buildOsorioRunningGear = (): void => {
    buildRunningGear(P, {
      style: 'dished', wheelR: roadWheelR, wheelW, wheelY: roadWheelY, xc: H.trackXc, wheelZs: [...ROAD_WHEEL_ZS],
      sprocket: { z: -3.10, y: 0.62, r: 0.31 }, idler: { z: 3.16, y: 0.62, r: 0.30 }, rollers,
      trackW: H.trackW, topY: 0.89, botY: 0.03, contactZF: ROAD_WHEEL_ZS[0], contactZR: ROAD_WHEEL_ZS.at(-1),
      paintedEnds: true, coveredTop: true, arms: true, sprocketTeeth: true,
    });
    for (const z of ROAD_WHEEL_ZS) for (const s of [-1, 1] as const) {
      // the hub cap's bolt ring and the rubber tyre's outer band on the cast dual wheels
      P.add('hullRunningGearDark', torus(roadWheelR * 0.28, 0.014, P.q ? 16 : 10), s * (H.trackXc + wheelW / 2 + 0.010), roadWheelY, z,
        0, 0, Math.PI / 2);
      P.add('hullRubber', torus(roadWheelR - 0.026, 0.022, P.q ? 28 : 16, 6), s * (H.trackXc + wheelW / 2 - 0.004), roadWheelY, z,
        0, 0, Math.PI / 2);
    }
    P.mats.rubber.color.setHex(0x2f312b);
  };
  buildOsorioRunningGear();
  yield 'buildOsorioRunningGear';

  // ---------------------------------------------------------------- skirts and mudguards --
  const buildOsorioSkirts = (): void => {
    // the multi-segment steel skirts (seven a side): a tapered front panel, then six; a bolt strip at every joint
    const front = 3.28, taperEnd = 2.48, rear = -3.45, seg = (taperEnd - rear) / 6, t = 0.024;
    for (const s of [-1, 1] as const) {
      const bucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', x = s * H.skirtX;
      // the front panel narrows and slopes up toward the front, clear of the idler
      P.addEquipment(bucket, slab(
        [x - t / 2, H.skirtLow, taperEnd], [x + t / 2, H.skirtLow, taperEnd], [x + t / 2, 0.92, front], [x - t / 2, 0.92, front],
        [x - t / 2, H.skirtTop, taperEnd], [x + t / 2, H.skirtTop, taperEnd], [x + t / 2, H.skirtTop, front], [x - t / 2, H.skirtTop, front]));
      for (let k = 0; k < 6; k++) {
        const z0 = taperEnd - k * seg, z1 = z0 - seg;
        P.addEquipment(bucket, box(t, H.skirtTop - H.skirtLow, seg - 0.012), x, (H.skirtTop + H.skirtLow) / 2, (z0 + z1) / 2);
        P.add('hullDetail', box(t + 0.008, H.skirtTop - H.skirtLow - 0.02, 0.05), x + s * 0.003, (H.skirtTop + H.skirtLow) / 2, z0);
      }
      P.add('hullDetail', box(t + 0.008, H.skirtTop - 0.94, 0.05), x + s * 0.003, (H.skirtTop + 0.94) / 2, front - 0.02);
      // the hinged front mudguard over the idler, leaning forward and down to the hub (the CIBld and 2022 photographs)
      // (its inner edge laps the nose plate's corner: no slot between guard and glacis from above)
      const hz = 3.30, hy = H.fenderY, fz = 3.55, fy = 0.74, xc = s * 1.3125, hw = 0.3325;
      P.addMudguard('osorio-front-guard', 'hullPaintedDetail', slab(
        [xc - hw, hy - 0.03, hz], [xc + hw, hy - 0.03, hz], [xc + hw, fy, fz - 0.03], [xc - hw, fy, fz - 0.03],
        [xc - hw, hy, hz + 0.03], [xc + hw, hy, hz + 0.03], [xc + hw, fy + 0.02, fz], [xc - hw, fy + 0.02, fz]));
      P.add('hullDetail', cylX(0.03, 0.60, 10), xc, hy - 0.015, hz);
      // the rear mud flap behind the sprocket
      P.hangMudguard('osorio-rear-flap', 'hullRubber', box(0.58, 0.42, 0.012), s * H.trackXc, 0.98, -3.52);
    }
  };
  buildOsorioSkirts();
  yield 'buildOsorioSkirts';

  // ---------------------------------------------------------------- hull fittings --
  const buildOsorioHullFittings = (): void => {
    // the twin-lamp clusters on the glacis against the front mudguards' inner edges, in their U-shaped guards (one
    // white, one amber; the CIBld 2020 and 2022 photographs)
    for (const s of [-1, 1] as const) {
      const z = 3.12, y = deckY(z) + 0.05, lx = 0.84;
      for (const dx of [-0.075, 0.075]) headlight(P, s * lx + dx, y + 0.02, z + 0.03, -glacis * 0.5, 0.05);
      const g = [[s * (lx + 0.17), y - 0.04, z - 0.10], [s * (lx + 0.17), y + 0.07, z + 0.08], [s * (lx - 0.17), y + 0.07, z + 0.08],
        [s * (lx - 0.17), y - 0.04, z - 0.10]];
      for (let i = 0; i + 1 < g.length; i++) bar('hullDark', g[i], g[i + 1], 0.011);
      // the tow eyes on the lower glacis
      P.add('hullDark', box(0.12, 0.12, 0.08), s * 0.72, 0.86, 3.27);
      P.add('hullDark', torus(0.065, 0.02, 12, 6), s * 0.72, 0.86, 3.34, Math.PI / 2, 0, 0);
      liftEye(P, 'hullDetail', s * 1.42, deckY(3.02) + 0.012, 3.02, s * 0.3); // outboard of the lamps, under the gun's sweep
      // the tail-light clusters at the rear plate's upper corners
      P.add('hullDark', box(0.20, 0.14, 0.06), s * 1.28, 1.48, H.sternZ - 0.03);
      for (const dx of [-0.05, 0.05]) P.add('hullGlass', cylZ(0.035, 0.012, 12), s * 1.28 + dx, 1.48, H.sternZ - 0.065);
      // the tow hooks low on the rear plate, the rear lifting eyes
      P.add('hullDark', box(0.12, 0.14, 0.10), s * 0.82, 1.05, H.sternZ - 0.06);
      P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.82, 1.00, H.sternZ - 0.13, 0, 0, Math.PI / 2);
      liftEye(P, 'hullDetail', s * 1.30, H.deckY + 0.012, -3.40, s * 2.8);
    }
    // the driver's round hatch ahead of the turret's left cheek, his three periscopes ahead of it
    const dz = 2.38, dx = 0.48, a = glacis;
    P.addCupola('hull', xform(cylY(0.27, 0.28, 0.03, P.q ? 22 : 14), 0, 0, 0, a, 0, 0), dx, deckY(dz) + 0.012, dz);
    P.add('hullDetail', xform(box(0.10, 0.04, 0.08), 0, 0, 0, a, 0, 0), dx - 0.24, deckY(dz) + 0.05, dz);
    for (const ox of [-0.16, 0, 0.16]) {
      P.add('hullDetail', xform(box(0.12, 0.06, 0.08), 0, 0, 0, a, 0, 0), dx + ox, deckY(2.70) + 0.03, 2.70);
      P.add('hullGlass', xform(box(0.10, 0.035, 0.008), 0, 0, 0, a, 0, 0), dx + ox, deckY(2.70) + 0.04, 2.745);
    }
    if (!p2) {
      // the P.1's hinged gun travel lock on the glacis (no photograph shows fender mirrors on either prototype)
      P.addEquipment('hullDark', box(0.30, 0.06, 0.12), 0, deckY(2.95) + 0.03, 2.95);
      bar('hullDark', [-0.11, deckY(2.95) + 0.05, 2.95], [-0.11, deckY(2.62) + 0.06, 2.62], 0.018);
      bar('hullDark', [0.11, deckY(2.95) + 0.05, 2.95], [0.11, deckY(2.62) + 0.06, 2.62], 0.018);
    }
    // the engine deck: the louvred band behind the turret, three armoured access covers, the two circular fan grilles at
    // the rear (Engesa's plan), the deck's lifting rails
    P.add('hullDark', box(2.40, 0.016, 0.34), 0, H.deckY + 0.008, -1.92);
    for (let k = 0; k < 7; k++) P.addEquipment('hull', box(2.32, 0.012, 0.03), 0, H.deckY + 0.014, -1.78 - k * 0.045);
    for (const [x, w] of [[-0.82, 0.62], [0, 0.82], [0.82, 0.62]] as const) {
      P.add('hullDetail', box(w, 0.018, 0.90), x, H.deckY + 0.009, -2.55);
    }
    for (const s of [-1, 1] as const) {
      const fx = s * 0.56, fz = -3.08;
      P.add('hullDark', cylY(0.36, 0.36, 0.014, P.q ? 28 : 16), fx, H.deckY + 0.007, fz);
      P.addEquipment('hull', torus(0.36, 0.018, P.q ? 28 : 16, 6), fx, H.deckY + 0.014, fz);
      for (let k = 0; k < 6; k++) {
        P.addEquipment('hull', box(0.70, 0.012, 0.025), fx, H.deckY + 0.016, fz, 0, (k / 6) * Math.PI, 0);
      }
      P.addEquipment('hull', cylY(0.07, 0.07, 0.03, 12), fx, H.deckY + 0.02, fz);
    }
    // the rear plate: the louvred outlet at its upper right, the box at its upper left, the central bracket and pintle
    P.add('hullDark', box(0.62, 0.22, 0.05), -0.62, 1.44, H.sternZ - 0.025);
    for (let k = 0; k < 5; k++) P.addEquipment('hull', box(0.58, 0.012, 0.03), -0.62, 1.36 + k * 0.04, H.sternZ - 0.055);
    P.addEquipment('hull', box(0.26, 0.20, 0.10), 0.80, 1.44, H.sternZ - 0.05);
    P.addEquipment('hull', box(0.70, 0.12, 0.08), 0, 1.30, H.sternZ - 0.04);
    P.add('hullDark', box(0.14, 0.14, 0.12), 0, 0.98, H.sternZ - 0.06);
    P.add('hullDark', torus(0.055, 0.018, 12, 6), 0, 0.92, H.sternZ - 0.14, Math.PI / 2, 0, 0);
  };
  buildOsorioHullFittings();
  yield 'buildOsorioHullFittings';

  // ---------------------------------------------------------------- turret (the Vickers turret) --
  P.turretG.position.set(0, RING.y, RING.z);
  const buildOsorioTurret = (): void => {
    P.add('turret', cylY(0.98, 1.02, 0.10, P.q ? 28 : 18), 0, -0.04, 0);
    // the body: vertical slab sides with a bevel to the flat roof, from the bustle's rear plate to the cheeks' root
    const ring: SectionPoint[] = [[-T.hw, T.floorY], [T.hw, T.floorY], [T.hw, T.bevelY], [T.bevelX, T.roofY],
      [-T.bevelX, T.roofY], [-T.hw, T.bevelY]];
    const body = sectionSolid([{ z: T.rearZ, ring }, { z: T.frontZ, ring }]);
    body.userData.primaryStockRole = 'osorio-turret';
    P.add('turret', body);
    // the add-on cheek blocks either side of the mantlet's recess: a chevron in profile (an upper facet sloping back to the
    // roof over a near-vertical lower facet) and swept back in plan to the slab sides
    const outerX = (z: number): number => T.hw - (z - T.frontZ) / (T.cheekNoseZ - T.frontZ) * (T.hw - T.cheekNoseX);
    const topY = (z: number): number => z <= T.roofEdgeZ ? T.roofY
      : T.roofY - (z - T.roofEdgeZ) / (T.cheekNoseZ - T.roofEdgeZ) * (T.roofY - T.cheekNoseY - 0.02);
    const botY = (z: number): number => z <= T.cheekFootZ ? T.floorY
      : T.floorY + (z - T.cheekFootZ) / (T.cheekNoseZ - T.cheekFootZ) * (T.cheekNoseY - 0.02 - T.floorY);
    const zs = [T.frontZ, T.roofEdgeZ, 1.26, T.cheekFootZ, T.cheekNoseZ];
    for (const s of [-1, 1] as const) {
      const cheek = sectionSolid(zs.map((z) => {
        const xo = outerX(z), xi = T.recessX, yb = botY(z), yt = topY(z);
        const ring: SectionPoint[] = s > 0 ? [[xi, yb], [xo, yb], [xo, yt], [xi, yt]] : [[-xo, yb], [-xi, yb], [-xi, yt], [-xo, yt]];
        return { z, ring };
      }));
      cheek.userData.primaryStockRole = 'osorio-cheek';
      P.add('turret', cheek);
    }
    // the roof wedge over the mantlet, rising back to the roof between the cheeks
    P.add('turret', slab(
      [-T.recessX, 0.62, 1.28], [T.recessX, 0.62, 1.28], [T.recessX, 0.735, 1.10], [-T.recessX, 0.735, 1.10],
      [-T.recessX, 0.66, 1.29], [T.recessX, 0.66, 1.29], [T.recessX, 0.775, 1.10], [-T.recessX, 0.775, 1.10]));
    // the roof's lifting eyes
    for (const s of [-1, 1] as const) {
      liftEye(P, 'turretDetail', s * 0.92, T.roofY + 0.005, 0.90, s * 0.4);
      liftEye(P, 'turretDetail', s * 0.92, T.roofY + 0.005, -2.18, s * 2.7);
    }
  };
  buildOsorioTurret();
  yield 'buildOsorioTurret';

  const buildOsorioTurretFittings = (): void => {
    const roof = T.roofY;
    // the right half: the gunner's sight head at the front, the commander's sight, the commander's cupola behind
    const sightBox = (x: number, z: number, w: number, h: number, d: number, base = 0.03): void => {
      P.addEquipment('turret', box(w + 0.06, base, d + 0.06), x, roof + base / 2, z);
      P.addEquipment('turret', box(w, h, d), x, roof + base + h / 2, z);
      P.add('turretGlass', box(w * 0.72, h * 0.42, 0.008), x, roof + base + h * 0.56, z + d / 2 + 0.004);
      P.add('turretDark', box(w + 0.03, 0.025, 0.10), x, roof + base + h + 0.012, z + d / 2 - 0.02);
    };
    if (p2) {
      sightBox(-0.62, 0.68, 0.34, 0.26, 0.42); // the gunner's VS580-10
      // the commander's VS580-19 panoramic head on its pedestal (2.89 m over the ground)
      P.addEquipment('turret', cylY(0.11, 0.12, 0.24, P.q ? 18 : 12), -0.60, roof + 0.12, -0.12);
      P.addEquipment('turret', box(0.30, 0.25, 0.32), -0.60, roof + 0.24 + 0.125, -0.12);
      P.add('turretGlass', box(0.20, 0.10, 0.008), -0.60, roof + 0.39, 0.044);
      P.add('turretDark', box(0.32, 0.025, 0.12), -0.60, roof + 0.50, -0.02);
      // the Philips thermal head, round-topped, inboard of the gunner
      P.addEquipment('turret', cylY(0.12, 0.13, 0.18, P.q ? 18 : 12), -0.26, roof + 0.09, 0.42);
      P.addEquipment('turret', xform(sph(0.12, P.q ? 16 : 10, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.6, 1]), -0.26, roof + 0.18, 0.42);
      P.add('turretGlass', cylZ(0.05, 0.01, 12), -0.26, roof + 0.11, 0.545);
    } else {
      // the P.1's two low OIP LRS-5 heads in a row (2.68 m over the ground)
      sightBox(-0.62, 0.68, 0.30, 0.24, 0.40);
      sightBox(-0.62, 0.05, 0.30, 0.24, 0.40);
    }
    const cx = -0.66, cz = -0.76, cr = 0.34;
    P.addCupola('turret', cylY(cr, cr * 1.06, 0.14, P.q ? 26 : 16), cx, roof + 0.07, cz);
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + 0.2;
      P.add('turretDetail', box(0.10, 0.06, 0.05), cx + Math.sin(ang) * cr, roof + 0.10, cz + Math.cos(ang) * cr, 0, ang, 0);
      P.add('turretGlass', box(0.075, 0.03, 0.01), cx + Math.sin(ang) * (cr + 0.026), roof + 0.10, cz + Math.cos(ang) * (cr + 0.026), 0, ang, 0);
    }
    P.addCupola('turret', cylY(cr * 0.88, cr * 0.9, 0.05, P.q ? 26 : 16), cx, roof + 0.165, cz);
    P.add('turretDark', box(0.12, 0.05, 0.06), cx, roof + 0.18, cz - cr * 0.86);
    // the left half: the loader's hatch and, ahead of it, his pintle with the 12.7 mm M2HB (Forças Terrestres 2015)
    const lx = 0.62, lz = -0.62;
    P.addCupola('turret', cylY(0.31, 0.32, 0.05, P.q ? 22 : 14), lx, roof + 0.025, lz);
    P.add('turretDetail', cylY(0.27, 0.28, 0.03, P.q ? 22 : 14), lx, roof + 0.065, lz);
    P.addEquipment('turretDark', cylY(0.03, 0.04, 0.26, 10), lx, roof + 0.13, -0.18);
    const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.66, elev: 0.03, ring: false,
      shield: false, seed: 6611, working: true });
    mg.name = 'osorioLoaderM2';
    mg.position.set(lx, roof + 0.30, -0.18);
    P.turretG.add(mg);
    // the rear roof: the ventilator dome, the box at the left rear, the P.2's laser-warning head and its tall cylinders at
    // the right rear corner, the mast
    P.addEquipment('turret', cylY(0.15, 0.17, 0.05, P.q ? 18 : 12), 0, roof + 0.025, -1.40);
    P.addEquipment('turret', xform(sph(0.15, P.q ? 16 : 10, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), 0, roof + 0.05, -1.40);
    P.addEquipment('turret', box(0.38, 0.18, 0.40), 0.58, roof + 0.09, -1.80);
    P.addEquipment('turretDark', box(0.40, 0.02, 0.42), 0.58, roof + 0.19, -1.80);
    if (p2) {
      P.addEquipment('turret', cylY(0.06, 0.06, 0.12, 12), -0.40, roof + 0.06, -2.05);
      P.add('turretGlass', xform(sph(0.05, 12, Math.PI / 2), 0, 0, 0), -0.40, roof + 0.12, -2.05);
      for (const dx of [0, 0.15]) P.addEquipment('turret', cylY(0.065, 0.065, 0.34, 12), -0.96 + dx, roof + 0.17, -2.12);
    }
    P.addEquipment('turretDark', cylY(0.018, 0.022, 0.52, 8), -0.20, roof + 0.26, -2.20);
    P.addEquipment('turretDark', cylY(0.05, 0.05, 0.05, 10), -0.20, roof + 0.545, -2.20);
    // the whip antennas on their bases, rear right and left
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.09, 0.09, 0.09), s * 0.86, roof + 0.045, -1.95);
      P.addEquipment('turret', cylY(0.012, 0.015, 2.0, 8), s * 0.86, roof + 1.09, -1.95, 0, 0, s * 0.03);
    }
    // the grid baskets (the 2015 museum, 2022 parade and CIBld photographs): one on each side over the middle and rear of
    // the wall, wrapping round the bustle's rear face; tubular rails and uprights on a mesh floor, the crew's kit inside
    const bOut = T.hw + 0.22, bLow = 0.08, bTop = 0.46, bz0 = -0.30, bRear = T.rearZ - 0.22;
    const rail = (a: readonly [number, number, number], b: readonly [number, number, number]): void => bar('turretOpenLattice', a, b, 0.013);
    for (const s of [-1, 1] as const) {
      const xo = s * bOut, xi = s * (T.hw + 0.004);
      for (const y of [bLow, (bLow + bTop) / 2, bTop]) rail([xo, y, bz0], [xo, y, bRear]);
      for (const y of [bLow, bTop]) rail([xi, y, bz0], [xo, y, bz0]);
      const n = Math.round((bz0 - bRear) / 0.30);
      for (let k = 0; k <= n; k++) rail([xo, bLow, bz0 - (bz0 - bRear) * k / n], [xo, bTop, bz0 - (bz0 - bRear) * k / n]);
      P.addEquipment('turretOpenLattice', box(bOut - T.hw, 0.012, bz0 - bRear), s * (T.hw + bOut) / 2, bLow - 0.008, (bz0 + bRear) / 2);
      stowage(P, 'turretCloth', rng, [
        [s * (T.hw + 0.11), bLow + 0.14, -0.62, 0.18, 0.26, 0.48], [s * (T.hw + 0.11), bLow + 0.12, -1.22, 0.17, 0.22, 0.52],
        [s * (T.hw + 0.11), bLow + 0.15, -1.86, 0.18, 0.28, 0.44]]);
    }
    for (const y of [bLow, (bLow + bTop) / 2, bTop]) rail([-bOut, y, bRear], [bOut, y, bRear]);
    for (let k = 0; k <= 7; k++) rail([-bOut + 2 * bOut * k / 7, bLow, bRear], [-bOut + 2 * bOut * k / 7, bTop, bRear]);
    P.addEquipment('turretOpenLattice', box(2 * T.hw, 0.012, T.rearZ - bRear), 0, bLow - 0.008, (T.rearZ + bRear) / 2);
    stowage(P, 'turretCloth', rng, [[-0.50, bLow + 0.13, T.rearZ - 0.11, 0.70, 0.24, 0.18], [0.45, bLow + 0.12, T.rearZ - 0.11, 0.60, 0.22, 0.17]]);
    jerryCan(P, 'turretCloth', 1.0 - 0.02, bLow + 0.20, T.rearZ - 0.11, 0.16);
    // the dischargers at the rear of each side, aimed forward, out and up: the P.2 two rows of three, the P.1 two of two
    const cols = p2 ? 3 : 2;
    for (const s of [-1, 1] as const) {
      const wallX = T.hw + 0.06;
      // (over the basket's rear end, the rear-top corner of the wall in the 2022 photograph)
      P.addEquipment('turret', box(0.10, 0.20, 0.16 * cols + 0.08), s * wallX, 0.575, -1.62 - (cols - 2) * 0.08);
      for (let row = 0; row < 2; row++) for (let k = 0; k < cols; k++) {
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.035, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.55, s * 0.40, 0),
          s * (wallX + 0.08), 0.53 + row * 0.10, -1.46 - k * 0.16);
      }
    }
    P.turretG.userData.osorioTurretReceipt = {
      revision: 'osorio-266-r2', mark, roofY: T.roofY, turretHalfWidth: T.hw, bustleRearZ: T.rearZ, cheekNoseZ: T.cheekNoseZ,
      dischargers: cols * 4, gridBaskets: 'sides-and-rear', panoramicPedestal: p2, sightHeads: p2 ? 3 : 2,
    };
  };
  buildOsorioTurretFittings();
  yield 'buildOsorioTurretFittings';

  // ---------------------------------------------------------------- markings on the hull --
  const buildOsorioMarkings = (): void => {
    for (const s of [-1, 1] as const) {
      const x = s * (H.skirtX + 0.0135);
      // the "OSÓRIO / EE-T1" stencil on the front skirt panel and the Engesa oval on the rearmost (every photograph since 2003)
      // (a stencil is a square quad: each sits inside the 0.69 m skirt panel)
      P.decal('hull', 'stencil', 'OSÓRIO', 0.46, [x, 1.09, 2.02], s * Math.PI / 2);
      P.decal('hull', 'stencil', 'EE-T1', 0.30, [x, 0.95, 2.02], s * Math.PI / 2);
      P.decal('hull', 'stencil', 'ENGESA', 0.36, [x, 1.02, -2.95], s * Math.PI / 2);
    }
  };
  buildOsorioMarkings();
  yield 'buildOsorioMarkings';

  // ---------------------------------------------------------------- mantlet and gun --
  const buildOsorioGun = (): void => {
    P.gunG.position.set(0, TRUNNION.y, TRUNNION.z);
    // the flat mantlet plate recessed between the cheeks, its bolted collar where the gun enters, the canvas dust cover;
    // the coaxial MG's port on the left of the gun, the auxiliary sight's on the right
    // (every part below the bore is held inside the -10 degree depression over the flat deck ahead of the turret: the
    // collar, the cover and its rings narrow forward to the deck's edge at z 0.70)
    P.addGunExtra(box(0.86, 0.36, 0.22), 0, 0.03, 0.35);
    P.addGunExtra(cylZ(0.155, 0.08, P.q ? 24 : 14), 0, 0, 0.50);
    P.addGunExtraDark(box(0.07, 0.07, 0.04), 0.25, -0.01, 0.475);
    P.addGunExtraDark(cylZ(0.05, 0.04, 14), -0.27, 0.06, 0.475);
    P.add('gunMountGlass', cylZ(0.035, 0.008, 12), -0.27, 0.06, 0.498);
    P.add('gunMountCloth', cylZ(0.12, 0.34, P.q ? 20 : 12, 0.145), 0, 0, 0.71);
    for (const z of [0.58, 0.74, 0.82]) {
      P.add('gunMountCloth', torus(0.145 - ((z - 0.54) / 0.34) * 0.025, 0.012, P.q ? 20 : 12, 5), 0, 0, z, Math.PI / 2, 0, 0);
    }
    const seg = P.q ? 24 : 12;
    if (p2) {
      // GIAT 120 mm G1 smoothbore: the fat segmented thermal sleeve (four joints) from a heavy root collar, no fume
      // extractor, the thick muzzle collar (the CIBld 2020 photograph); the muzzle 6.135 m from the ring (10.10 m over
      // the gun)
      const len = 6.535 - (RING.z + TRUNNION.z), r0 = 0.116, r1 = 0.104, sleeveEnd = len - 0.34;
      P.add('gun', cylZ(0.13, 0.10, seg, 0.12), 0, 0, 0.92);
      P.add('gun', cylZ(r1, sleeveEnd - 0.86, seg, r0), 0, 0, (0.86 + sleeveEnd) / 2);
      for (const z of [1.90, 2.90, 3.90]) P.add('gunDark', cylZ(0.121, 0.035, seg), 0, 0, z);
      P.add('gun', cylZ(0.094, len - sleeveEnd, seg, 0.098), 0, 0, (sleeveEnd + len) / 2);
      P.add('gun', cylZ(0.128, 0.16, seg, 0.122), 0, 0, len - 0.08);
      P.add('gunDark', cylZ(0.129, 0.012, seg), 0, 0, len - 0.165);
      muzzleBore(P, { z: len + 0.004, r: 0.060 });
      P.muzzleZ = len;
      P.gunG.userData.osorioGunReceipt = { mark, caliberMm: 120, muzzleZ: len, fumeExtractor: false, sleeveJoints: 3 };
    } else {
      // Royal Ordnance 105 mm L7A3: the thermal sleeve with its clamp bands, the fume extractor two-fifths of the way out,
      // a plain muzzle; the muzzle 5.395 m from the ring (9.36 m over the gun)
      const len = 5.795 - (RING.z + TRUNNION.z), r0 = 0.090, r1 = 0.080, ez = 2.15, el = 0.62, sleeveEnd = len - 0.16;
      P.add('gun', cylZ(r1, sleeveEnd - 0.86, seg, r0), 0, 0, (0.86 + sleeveEnd) / 2);
      for (const z of [1.45, 3.05, 3.85]) P.add('gunDark', cylZ(0.094, 0.03, seg), 0, 0, z);
      P.add('gun', cylZ(0.122, el - 0.12, seg), 0, 0, ez);
      P.add('gun', cylZ(0.122, 0.06, seg, 0.088), 0, 0, ez - el / 2 + 0.03);
      P.add('gun', cylZ(0.084, 0.06, seg, 0.122), 0, 0, ez + el / 2 - 0.03);
      P.add('gun', cylZ(0.072, len - sleeveEnd, seg, 0.074), 0, 0, (sleeveEnd + len) / 2);
      muzzleBore(P, { z: len + 0.004, r: 0.053 });
      P.muzzleZ = len;
      P.gunG.userData.osorioGunReceipt = { mark, caliberMm: 105, muzzleZ: len, fumeExtractor: true, sleeveJoints: 3 };
    }
    P.mats.glass.color.setHex(0x3a463f);
    P.mats.glass.roughness = 0.42;
    P.mats.glass.metalness = 0.32;
    P.topY = RING.y;
  };
  buildOsorioGun();
}

export const buildOsorioP1 = steppedBuilder((P: TankBuilderPort) => buildOsorioSteps(P, 'p1'));
export const buildOsorioP2 = steppedBuilder((P: TankBuilderPort) => buildOsorioSteps(P, 'p2'));

/** The datums a fixture holds the build to (docs/references/tanks/osorio_p2.md). */
export const OSORIO_DATUMS = Object.freeze({
  hull: H, roadWheelZs: Object.freeze([...ROAD_WHEEL_ZS]), ring: RING, turret: T, trunnion: TRUNNION,
  muzzleHullZ: Object.freeze({ p1: 5.795, p2: 6.535 }),
});
