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
// - t3, t4: the fictional EE-T3 and EE-T4 Osório (owner 2026-10-30: "now make a super modernized hypotehtical version a
//   tier 9 and a tier 10"; Main's ruling the same day), continuing Engesa's numbering as the Challenger 1's fictional
//   FV4030/5 and /6 continue Vickers': the P.2's hull and turret under a bolted armour kit. The EE-T3 (tier IX): a nose
//   module on the glacis, composite modules on the front three skirt panels, wedge modules on the cheeks and side armour
//   boxes, a stabilised panoramic sight, the ARES-type remote 12.7 mm station, a 120 mm L/55, two 200 L fuel drums
//   across the stern. The EE-T4 (tier X): the EE-T3's kit heavier and full length, a hard-kill active protection system
//   (four radar panels and two launchers), laser-warning heads, slat armour over the rear plate with the drums behind
//   it, a 130 mm L/51.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { DRUM_ISSUE_PAINTS, fuelDrumParts, place } from '../accessoryPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type OsorioMark = 'p1' | 'p2' | 't3' | 't4';

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
  recessX: 0.45, cheekNoseZ: 1.44, cheekNoseY: 0.46, cheekNoseX: 0.56, cheekFootZ: 1.00, roofEdgeZ: 0.87 });
const TRUNNION = Object.freeze({ y: 0.28, z: 0.85 });
/** Each mark's muzzle, hull metres ahead of the hull's centre with the gun ahead and level. */
const OSORIO_MUZZLE_HULL_Z = Object.freeze({ p1: 5.795, p2: 6.535, t3: 6.895, t4: 7.85 });

/** Hull deck height at z: the 15-degree upper glacis from the nose to its knee, then the flat deck. */
function deckY(z: number): number {
  if (z >= H.glacisZ) return H.noseY + (H.noseZ - z) * (H.glacisTopY - H.noseY) / (H.noseZ - H.glacisZ);
  if (z >= H.glacisZ - 0.05) return H.glacisTopY + (H.glacisZ - z) / 0.05 * (H.deckY - H.glacisTopY);
  return H.deckY;
}

function* buildOsorioSteps(P: TankBuilderPort, mark: OsorioMark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildRunningGear, headlight, liftEye, stowage, torus } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  // (p2: the 120 mm turret, the P.2's and its fictional successors'; modern: the EE-T3 and EE-T4 kit; t4: the tier X's)
  const p2 = mark !== 'p1', modern = mark === 't3' || mark === 't4', t4 = mark === 't4';
  // the EE-T3/T4's bolted nose module over the glacis: its rear and front edges and its thickness at each, thin at the rear
  // where the gun's depression is decided, deep at the nose (blind critic, round c1: the slab must read)
  // (the glacis falls 0.10 m a metre faster than a -10 degree gun line: a steeper deepening costs the front depression)
  const NOSE_MOD = Object.freeze({ z0: 2.86, z1: 3.48, th0: t4 ? 0.10 : 0.08, th1: t4 ? 0.20 : 0.17 });
  // the EE-T3/T4's skirt modules' thickness (blind critic, round c2: deeper, the stencils on their faces)
  const SKIRT_MOD_T = t4 ? 0.10 : 0.09;
  // (the EE-T4's module carried on to the nose: its face's station)
  const T4_NOSE_FACE_Z = 3.56;
  const noseModTop = (z: number): number =>
    deckY(z) + NOSE_MOD.th0 + (z - NOSE_MOD.z0) / (NOSE_MOD.z1 - NOSE_MOD.z0) * (NOSE_MOD.th1 - NOSE_MOD.th0);
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
    if (!t4) P.add('hullDetail', box(H.lowerX * 2, 0.06, 0.04), 0, (H.lipY + H.noseY) / 2, H.noseZ - 0.005);
    if (!modern) P.add('hullDetail', xform(box(1.70, 0.03, 0.06), 0, 0, 0, glacis, 0, 0), 0, deckY(3.32) + 0.02, 3.32);
    else {
      // the EE-T3/T4's bolted nose module over the glacis ahead of the driver's periscopes, its rows of bolts
      // (its top chamfered down to the sides; three panels across, their joints dark grooves)
      const ch = 0.05;
      P.add('hull', sectionSolid([NOSE_MOD.z0, NOSE_MOD.z1].map((z) => ({ z, ring: [[-H.lowerX, deckY(z) - 0.02], [H.lowerX, deckY(z) - 0.02],
        [H.lowerX, noseModTop(z) - ch], [H.lowerX - ch, noseModTop(z)], [-(H.lowerX - ch), noseModTop(z)],
        [-H.lowerX, noseModTop(z) - ch]] as SectionPoint[] }))));
      const slope = Math.atan2(noseModTop(NOSE_MOD.z0) - noseModTop(NOSE_MOD.z1), NOSE_MOD.z1 - NOSE_MOD.z0);
      // (a dark band on its rear step's face so the plan reads it)
      P.add('hullDark', box(2 * (H.lowerX - ch), 0.015, 0.008), 0, noseModTop(NOSE_MOD.z0) - 0.012, NOSE_MOD.z0 - 0.004);
      for (const x of [-0.34, 0.34]) {
        bar('hullDark', [x, noseModTop(NOSE_MOD.z0 + 0.02) - 0.002, NOSE_MOD.z0 + 0.02], [x, noseModTop(NOSE_MOD.z1 - 0.01) - 0.002, NOSE_MOD.z1 - 0.01], 0.009);
      }
      for (const z of [2.94, 3.40]) for (let k = 0; k < 7; k++) {
        P.add('hullDetail', xform(cylY(0.022, 0.022, 0.016, 8), 0, 0, 0, slope, 0, 0), -0.84 + k * 0.28, noseModTop(z) + 0.006, z);
      }
      if (t4) {
        // the EE-T4's module carried on to the nose, its face down over the lip, and a second plate on the lower glacis
        // under it: a front face about twice the EE-T3's (blind critic, round c4)
        const ring = (z: number, yb: number): SectionPoint[] => [[-H.lowerX, yb], [H.lowerX, yb], [H.lowerX, noseModTop(z) - ch],
          [H.lowerX - ch, noseModTop(z)], [-(H.lowerX - ch), noseModTop(z)], [-H.lowerX, noseModTop(z) - ch]];
        P.add('hull', sectionSolid([{ z: NOSE_MOD.z1 - 0.01, ring: ring(NOSE_MOD.z1 - 0.01, deckY(NOSE_MOD.z1) - 0.02) },
          { z: T4_NOSE_FACE_Z, ring: ring(T4_NOSE_FACE_Z, H.lipY - 0.02) }]));
        // (the lower plate laid on the lower glacis from the lip down to 0.80 m, 6 cm thick, inside the tracks)
        const lx = 0.96, iz0 = 3.32, iy0 = 0.80, iz1 = H.noseZ, iy1 = H.lipY, oz = 0.044, oy = -0.041;
        P.add('hull', slab([-lx, iy0, iz0], [lx, iy0, iz0], [lx, iy1, iz1], [-lx, iy1, iz1],
          [-lx, iy0 + oy, iz0 + oz], [lx, iy0 + oy, iz0 + oz], [lx, iy1 + oy, iz1 + oz], [-lx, iy1 + oy, iz1 + oz]));
        P.add('hullDark', box(2 * lx + 0.01, 0.02, 0.05), 0, iy0 + oy / 2 - 0.005, iz0 + oz / 2);
        // (its top a ledge standing proud of the upper face, so the light finds the second plate: round c5)
        P.add('hullDetail', box(2 * lx, 0.03, 0.07), 0, iy1 - 0.035, iz1 + 0.035);
        for (let k = 0; k < 6; k++) P.add('hullDetail', xform(cylZ(0.02, 0.014, 8), 0, 0, 0, -0.81, 0, 0), -0.80 + k * 0.32, 0.93 + oy, 3.45 + oz);
      }
    }
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
      // the hub cap's bolt ring on the cast dual wheels, in each side's own bucket: a bucket drawn on both sides spans the
      // centreline, and its lowest part is read as the belly pan (restPoseContact; a tyre band here set the pan at 7 cm)
      P.add(s < 0 ? 'hullTrackDetailL' : 'hullTrackDetailR', torus(roadWheelR * 0.28, 0.014, P.q ? 16 : 10),
        s * (H.trackXc + wheelW / 2 + 0.010), roadWheelY, z, 0, 0, Math.PI / 2);
    }
    P.mats.rubber.color.setHex(0x2f312b);
  };
  buildOsorioRunningGear();
  yield 'buildOsorioRunningGear';

  // ---------------------------------------------------------------- skirts and mudguards --
  const buildOsorioSkirts = (): void => {
    // the multi-segment steel skirts (seven a side): a tapered front panel, then six; a bolt strip at every joint; each
    // panel's lower edge falls 10 cm toward its rear and steps back up at the next joint (the 1987, 2022 and 2024
    // photographs' saw-tooth line; blind critic, round 4)
    const front = 3.28, taperEnd = 2.48, rear = -3.45, seg = (taperEnd - rear) / 6, t = 0.024, tooth = 0.10;
    for (const s of [-1, 1] as const) {
      const bucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', x = s * H.skirtX;
      // the front panel narrows and slopes up toward the front, clear of the idler
      P.addEquipment(bucket, slab(
        [x - t / 2, H.skirtLow, taperEnd], [x + t / 2, H.skirtLow, taperEnd], [x + t / 2, 0.92, front], [x - t / 2, 0.92, front],
        [x - t / 2, H.skirtTop, taperEnd], [x + t / 2, H.skirtTop, taperEnd], [x + t / 2, H.skirtTop, front], [x - t / 2, H.skirtTop, front]));
      for (let k = 0; k < 6; k++) {
        const z0 = taperEnd - k * seg, z1 = z0 - seg;
        const zf = z0 - 0.006, zr = z1 + 0.006, yf = H.skirtLow + tooth, yr = H.skirtLow;
        P.addEquipment(bucket, slab(
          [x - t / 2, yr, zr], [x + t / 2, yr, zr], [x + t / 2, yf, zf], [x - t / 2, yf, zf],
          [x - t / 2, H.skirtTop, zr], [x + t / 2, H.skirtTop, zr], [x + t / 2, H.skirtTop, zf], [x - t / 2, H.skirtTop, zf]));
        P.add('hullDetail', box(t + 0.008, H.skirtTop - H.skirtLow - tooth - 0.02, 0.05), x + s * 0.003, (H.skirtTop + H.skirtLow + tooth) / 2, z0);
      }
      P.add('hullDetail', box(t + 0.008, H.skirtTop - 0.94, 0.05), x + s * 0.003, (H.skirtTop + 0.94) / 2, front - 0.02);
      if (modern) {
        // the composite modules hung on the skirts' outer face: the EE-T3's on the front three panels, the EE-T4's the full
        // length, each a thick plate with a bolt row along its top and a thinner step along its foot
        const mods: Array<readonly [number, number]> = [[front - 0.10, taperEnd + 0.01]];
        for (let k = 0; k < (t4 ? 6 : 2); k++) mods.push([taperEnd - k * seg - 0.01, taperEnd - (k + 1) * seg + 0.01]);
        const mt = SKIRT_MOD_T, mx = s * (H.skirtX + t / 2 + mt / 2 + 0.004), my0 = H.skirtLow + 0.13, my1 = H.skirtTop - 0.03;
        for (const [z0, z1] of mods) {
          P.addEquipment(bucket, box(mt, my1 - my0, z0 - z1), mx, (my0 + my1) / 2, (z0 + z1) / 2);
          P.addEquipment(bucket, box(mt * 0.5, 0.08, z0 - z1 - 0.02), mx - s * mt / 4, my0 - 0.04, (z0 + z1) / 2);
          for (let b = 0; b < 4; b++) {
            P.add('hullDetail', cylX(0.02, 0.014, 8), mx + s * (mt / 2 + 0.007), my1 - 0.05, z1 + (z0 - z1) * (b + 0.5) / 4);
          }
        }
      }
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
    // the paired round lamps on the glacis against the front mudguards' inner edges, in their housing under a U-shaped
    // guard (one white, one amber; the CIBld 2020 and 2022 photographs; blind critic, round 4: large, not strips)
    for (const s of [-1, 1] as const) {
      const lx = 0.84;
      if (!modern) {
        const z = 3.12, y = deckY(z) + 0.05;
        P.add('hullDark', xform(box(0.40, 0.17, 0.10), 0, 0, 0, -glacis * 0.5, 0, 0), s * lx, y + 0.01, z - 0.02);
        for (const dx of [-0.10, 0.10]) headlight(P, s * lx + dx, y + 0.02, z + 0.04, -glacis * 0.5, 0.075);
        const g = [[s * (lx + 0.23), y - 0.04, z - 0.10], [s * (lx + 0.23), y + 0.10, z + 0.09], [s * (lx - 0.23), y + 0.10, z + 0.09],
          [s * (lx - 0.23), y - 0.04, z - 0.10]];
        for (let i = 0; i + 1 < g.length; i++) bar('hullDark', g[i], g[i + 1], 0.011);
      } else {
        // the EE-T3/T4 carry their lamps set into the nose module's front face, no higher than its top: housings on the
        // glacis stood in the gun's sweep 10 to 23 degrees off the bow (gun-depression sweep, 2026-10-30: -6 and -4.6)
        const z = t4 ? T4_NOSE_FACE_Z : NOSE_MOD.z1, y = t4 ? (H.lipY - 0.02 + noseModTop(z)) / 2 : deckY(z) + NOSE_MOD.th1 / 2 - 0.01;
        P.add('hullDark', box(0.40, NOSE_MOD.th1 - 0.04, 0.04), s * lx, y, z + 0.012);
        for (const dx of [-0.10, 0.10]) headlight(P, s * lx + dx, y, z + 0.02, 0, t4 ? 0.06 : 0.05);
      }
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
    if (t4) {
      // the EE-T4's slat armour over the rear plate in a framed cage 0.32 m off it: corner posts, three rails, four arms and
      // diagonal braces to the hull's rear corners, vertical bars at 10 cm in the coat, the plate seen between them (blind
      // critics: round c1, not a black board; c3, down to the tow hooks and not a rail over the deck; c4, framed and braced,
      // not hanging on rods)
      const sz = H.sternZ - 0.32, sx = 1.40, sy0 = 1.00, sy1 = 1.48;
      for (const x of [-1.20, -0.40, 0.40, 1.20]) bar('hullOpenLattice', [x, 1.30, H.sternZ - 0.04], [x, 1.30, sz], 0.02);
      for (const y of [sy0, (sy0 + sy1) / 2, sy1]) P.add('hullOpenLattice', box(2 * sx + 0.05, 0.04, 0.035), 0, y, sz);
      for (const sgn of [-1, 1] as const) {
        P.add('hullOpenLattice', box(0.05, sy1 - sy0 + 0.04, 0.05), sgn * sx, (sy0 + sy1) / 2, sz);
        bar('hullOpenLattice', [sgn * sx, sy1, sz], [sgn * 1.45, 1.56, H.sternZ - 0.02], 0.018);
        bar('hullOpenLattice', [sgn * sx, sy0, sz], [sgn * 1.20, 1.27, H.sternZ - 0.02], 0.018);
      }
      for (let k = 0; k <= 28; k++) {
        const x = -sx + (2 * sx) * k / 28;
        P.add('hullOpenLattice', box(0.022, sy1 - sy0, 0.022), x, (sy0 + sy1) / 2, sz);
      }
    }
    if (modern) {
      // two 200 L fuel drums across the stern (owner 2026-10-31: "add two big fuel barrels on the backs"), laid
      // transverse in a cradle off the rear plate (the T-72/T-80 stowage, the Challenger 1's Op Granby fit), standing
      // 31 cm over the deck line so they read in the hero view (the owner the same day: "raise the drums ... so theyre
      // visible in the hero images", the rule of cool): the gun's depression over the stern is measured against them
      // (brazilSpecs.ts curves). The EE-T3's sit behind the plate's fittings, the EE-T4's behind its slat cage, their arms
      // through the cage between its lower and middle rails and between two slats
      const r = 0.29, len = 0.88, yc = 1.62, cageZ = H.sternZ - 0.32;
      const zc = t4 ? cageZ - 0.06 - r : H.sternZ - 0.135 - r;
      const armY = t4 ? 1.17 : yc - r - 0.06, armEnd = zc - 0.22;
      // (the plate vertical over its lower edge, raked forward under it; the arms seated 1 cm into it)
      const plateZ = H.sternZ + Math.max(0, H.rearPlateY - armY) / (H.rearPlateY - H.bellyY) * (H.rearBellyZ - H.sternZ) + 0.01;
      // each saddle from the arm's top to 8 mm into the drum's underside 0.15 m off its axis
      const saddleH = yc - Math.sqrt(r * r - 0.15 * 0.15) + 0.008 - (armY + 0.025);
      for (const s of [-1, 1] as const) {
        const x = s * 0.52;
        const drum = fuelDrumParts({ r, len, straps: [0.15, 0.85], buckleAt: 2.62, bungHead: s > 0 ? 1 : -1,
          // the darker issue paints (blind critic c7: the faded green-grey read pale mint under the studio key)
          detail: P.q === false ? 0 : 1, bold: true, paint: DRUM_ISSUE_PAINTS[s > 0 ? 1 : 0], seed: (t4 ? 26640 : 26630) + (s > 0 ? 1 : 0) });
        P.add('hullBark', place(drum.body, -len / 2, 0, 0, 0, 0, -Math.PI / 2), x, yc, zc);
        for (const part of [...drum.straps, ...drum.hardware]) P.add('hullDark', place(part, -len / 2, 0, 0, 0, 0, -Math.PI / 2), x, yc, zc);
        // the cradle: two arms from the rear plate under each drum, two saddles across them
        for (const ax of t4 ? [0.15, 0.95] : [0.14, 0.92]) P.add('hullDark', box(0.05, 0.05, plateZ - armEnd), s * ax, armY, (plateZ + armEnd) / 2);
        for (const dz of [-0.15, 0.15]) P.add('hullDark', box(len - 0.02, saddleH, 0.05), x, armY + 0.025 + saddleH / 2, zc + dz);
        // two hold-down bars on the drum's straps, from the deck's rear edge (the EE-T4's: the cage's top rail) onto its
        // front crown
        const [fy, fz] = t4 ? [1.48, cageZ - 0.02] : [H.deckY - 0.01, H.sternZ - 0.01];
        for (const dx of [-0.308, 0.308]) bar('hullDark', [x + dx, fy, fz], [x + dx, yc + r * 0.87 + 0.005, zc + r * 0.5], 0.012);
        // and a cradle strap over the top on each of the drum's bands, saddle to saddle (blind critic c7: "one visible
        // strap over the top of each drum to the cradle")
        const sr = r + 0.01, a0 = -Math.acos(0.15 / r), a1 = Math.PI - a0;
        for (const dx of [-0.308, 0.308]) for (let k = 0; k < 9; k++) {
          const t0 = a0 + (a1 - a0) * k / 9, t1 = a0 + (a1 - a0) * (k + 1) / 9;
          bar('hullDark', [x + dx, yc + sr * Math.sin(t0), zc + sr * Math.cos(t0)], [x + dx, yc + sr * Math.sin(t1), zc + sr * Math.cos(t1)], 0.01);
        }
      }
      P.add('hullDark', cylX(0.025, 1.90, 12), 0, armY, armEnd + 0.03);
      // the cradle's floor across the arms from the rear plate (the EE-T4's in two, to the faces of its cage's rails):
      // with the drums across the stern the plan gaps between the plate and the drums and between the two drums were
      // enclosed, and the contiguity scan read them as holes (tank-standard-check B2, 2026-10-31)
      const trays: readonly (readonly [number, number])[] = t4 ? [[plateZ, cageZ + 0.0175], [cageZ - 0.0175, armEnd]] : [[plateZ, armEnd]];
      for (const [z0, z1] of trays) P.add('hullDark', box(1.94, 0.02, z0 - z1), 0, armY + 0.035, (z0 + z1) / 2);
    }
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
    const body = sectionSolid([{ z: T.rearZ, ring }, { z: T.roofEdgeZ, ring }]);
    body.userData.primaryStockRole = 'osorio-turret';
    P.add('turret', body);
    // the add-on cheeks either side of the mantlet's recess, arrowheads in profile (the 1987, 2020 and 2022 photographs,
    // the 2024 P.1 profile; blind critics, round 2): a long upper facet falling from the roof over about 15 % of the
    // turret's length to a point at 60 % of its height, the lower facet undercut back to the ring; swept back in plan to
    // the slab sides, the roof bevel carried down the upper facet
    const outerX = (z: number): number => z <= T.frontZ ? T.hw
      : T.hw - (z - T.frontZ) / (T.cheekNoseZ - T.frontZ) * (T.hw - T.cheekNoseX);
    const topY = (z: number): number => z <= T.roofEdgeZ ? T.roofY
      : T.roofY - (z - T.roofEdgeZ) / (T.cheekNoseZ - T.roofEdgeZ) * (T.roofY - T.cheekNoseY);
    const botY = (z: number): number => z <= T.cheekFootZ ? T.floorY
      : T.floorY + (z - T.cheekFootZ) / (T.cheekNoseZ - T.cheekFootZ) * (T.cheekNoseY - 0.02 - T.floorY);
    const zs = [T.roofEdgeZ, T.frontZ, 1.15, 1.30, T.cheekNoseZ];
    for (const s of [-1, 1] as const) {
      const cheek = sectionSolid(zs.map((z) => {
        const xo = outerX(z), xi = T.recessX, yb = botY(z), yt = topY(z);
        const bv = Math.min(T.roofY - T.bevelY, (yt - yb) * 0.3), bw = (T.hw - T.bevelX) * bv / (T.roofY - T.bevelY);
        const ring: SectionPoint[] = s > 0 ? [[xi, yb], [xo, yb], [xo, yt - bv], [xo - bw, yt], [xi, yt]]
          : [[-xo, yb], [-xi, yb], [-xi, yt], [-xo + bw, yt], [-xo, yt - bv]];
        return { z, ring };
      }));
      cheek.userData.primaryStockRole = 'osorio-cheek';
      P.add('turret', cheek);
    }
    // the recess between the cheeks: the front block behind the mantlet, and the brow over it riding 5 cm above the
    // cheeks' facet line (the mantlet's top clears its underside at +20 degrees)
    const browY = (z: number): number => Math.min(T.roofY, topY(z) + 0.05);
    P.add('turret', sectionSolid([
      { z: T.roofEdgeZ, ring: [[-T.recessX, T.floorY], [T.recessX, T.floorY], [T.recessX, T.roofY], [-T.recessX, T.roofY]] },
      { z: T.frontZ, ring: [[-T.recessX, T.floorY], [T.recessX, T.floorY], [T.recessX, browY(T.frontZ)], [-T.recessX, browY(T.frontZ)]] },
    ]));
    P.add('turret', slab(
      [-T.recessX, browY(1.28) - 0.04, 1.28], [T.recessX, browY(1.28) - 0.04, 1.28], [T.recessX, browY(T.frontZ) - 0.04, T.frontZ],
      [-T.recessX, browY(T.frontZ) - 0.04, T.frontZ],
      [-T.recessX, browY(1.29), 1.29], [T.recessX, browY(1.29), 1.29], [T.recessX, browY(T.frontZ), T.frontZ],
      [-T.recessX, browY(T.frontZ), T.frontZ]));
    // the roof's lifting eyes
    for (const s of [-1, 1] as const) {
      liftEye(P, 'turretDetail', s * 0.92, T.roofY + 0.005, 0.78, s * 0.4);
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
    if (modern) {
      // the EE-T3/T4's sights: the gunner's day/thermal head at the front, the laser rangefinder's window beside it, and the
      // commander's stabilised panoramic head (the Leopard 2's PERI pattern): a tall drum on a mast over its base ring, its
      // day and thermal windows, a painted cap (blind critic, round c2: not the P.2's box)
      sightBox(-0.62, 0.60, 0.40, 0.24, 0.44);
      P.add('turretGlass', box(0.12, 0.08, 0.008), -0.36, roof + 0.13, 0.824);
      P.addEquipment('turret', cylY(0.17, 0.18, 0.04, P.q ? 20 : 12), -0.60, roof + 0.02, -0.12);
      P.addEquipment('turret', cylY(0.07, 0.08, 0.30, P.q ? 14 : 10), -0.60, roof + 0.19, -0.12);
      P.addEquipment('turret', cylY(0.17, 0.17, 0.24, P.q ? 20 : 14), -0.60, roof + 0.46, -0.12);
      for (const dx of [-0.065, 0.065]) P.add('turretGlass', box(0.10, 0.10, 0.008), -0.60 + dx, roof + 0.47, -0.12 + 0.166);
      P.addEquipment('turret', cylY(0.185, 0.18, 0.035, P.q ? 20 : 14), -0.60, roof + 0.597, -0.12);
    } else if (p2) {
      sightBox(-0.62, 0.60, 0.34, 0.26, 0.42); // the gunner's VS580-10
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
      // the P.1's two low OIP LRS-5 heads in a row (2.68 m over the ground), and behind the cupola the commander's tall
      // sight head under its rounded hood (the 2015 museum photograph; blind critic, round 3)
      sightBox(-0.62, 0.60, 0.30, 0.24, 0.40);
      sightBox(-0.62, 0.05, 0.30, 0.24, 0.40);
      // (the head round, a drum under a domed cap: blind critic, round 5)
      P.addEquipment('turret', cylY(0.09, 0.10, 0.22, P.q ? 16 : 10), -0.62, roof + 0.11, -1.30);
      P.addEquipment('turret', cylY(0.155, 0.15, 0.17, P.q ? 20 : 14), -0.62, roof + 0.22 + 0.085, -1.30);
      P.addEquipment('turret', xform(sph(0.155, P.q ? 18 : 12, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.62, 1]), -0.62, roof + 0.39, -1.30);
      P.add('turretGlass', box(0.15, 0.07, 0.008), -0.62, roof + 0.31, -1.30 + 0.152);
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
    if (modern) {
      // the EE-T3/T4's remote 12.7 mm station (the ARES REMAX type) ahead of the loader's hatch, worked from inside
      const rws = FITTINGS.americanRws({ mats: P.mats, scale: 0.80, seed: t4 ? 6614 : 6613 });
      rws.name = 'osorioRemoteStation';
      rws.position.set(lx, roof, -0.10);
      P.turretG.add(rws);
    } else {
      const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.66, elev: 0.03, ring: false,
        shield: false, seed: 6611, working: true });
      mg.name = 'osorioLoaderM2';
      mg.position.set(lx, roof, -0.18); // the fitting's own pintle stands on the roof
      P.turretG.add(mg);
    }
    // the rear roof: the ventilator dome, the box at the left rear, the P.2's laser-warning head and its tall cylinders at
    // the right rear corner, the mast
    P.addEquipment('turret', cylY(0.15, 0.17, 0.05, P.q ? 18 : 12), 0, roof + 0.025, -1.40);
    P.addEquipment('turret', xform(sph(0.15, P.q ? 16 : 10, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), 0, roof + 0.05, -1.40);
    P.addEquipment('turret', box(0.38, 0.18, 0.40), 0.58, roof + 0.09, -1.80);
    // (its lid painted on both marks: blind critics, rounds 5 and 9)
    P.addEquipment('turret', box(0.40, 0.02, 0.42), 0.58, roof + 0.19, -1.80);
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
    // the right wall's grid, the left wall bare (the 1987 and 2024 left-side photographs; blind critic, round 3): the P.2's
    // deep basket from the cheeks' root to two-thirds back, its rails, uprights and fine wire mesh on a mesh floor and the
    // crew's kit inside (the 2022 parade and CIBld photographs); the P.1's flat bar grid close on the wall (the 2015 museum
    // photograph: nearly the wall's full height, from a third of the way back to just ahead of the emblem; blind critic,
    // round 6)
    const rail = (a: readonly [number, number, number], b: readonly [number, number, number]): void => bar('turretOpenLattice', a, b, 0.013);
    const bLow = 0.08, bTop = 0.46;
    if (p2) {
      // (on the EE-T3/T4 the basket keeps the wall's rear third, behind the side armour)
      const xo = -(T.hw + 0.20), xi = -(T.hw + 0.004), zf = modern ? -0.64 : 0.15, zr = -1.42, top = 0.56;
      for (const y of [bLow, (bLow + top) / 2, top]) rail([xo, y, zf], [xo, y, zr]);
      for (const z of [zf, zr]) for (const y of [bLow, top]) rail([xi, y, z], [xo, y, z]);
      for (let k = 0; k <= 5; k++) rail([xo, bLow, zf - (zf - zr) * k / 5], [xo, top, zf - (zf - zr) * k / 5]);
      P.addEquipment('turretOpenLattice', box(0.20, 0.012, zf - zr), (xo + xi) / 2, bLow - 0.008, (zf + zr) / 2);
      for (let k = 1; k < 7; k++) P.addEquipment('turretOpenLattice', box(0.008, 0.008, zf - zr), xo, bLow + (top - bLow) * k / 7, (zf + zr) / 2);
      for (let k = 1, m = Math.round((zf - zr) / 0.10); k < m; k++) {
        P.addEquipment('turretOpenLattice', box(0.008, top - bLow, 0.008), xo, (bLow + top) / 2, zf - (zf - zr) * k / m);
      }
      stowage(P, 'turretCloth', rng, modern
        ? [[-(T.hw + 0.10), bLow + 0.15, -0.86, 0.17, 0.28, 0.36], [-(T.hw + 0.10), bLow + 0.16, -1.20, 0.17, 0.30, 0.34]]
        : [[-(T.hw + 0.10), bLow + 0.15, -0.10, 0.17, 0.28, 0.44], [-(T.hw + 0.10), bLow + 0.13, -0.66, 0.16, 0.24, 0.52],
          [-(T.hw + 0.10), bLow + 0.16, -1.16, 0.17, 0.30, 0.40]]);
    } else {
      const xo = -(T.hw + 0.05), xi = -(T.hw + 0.004), zf = 0.14, zr = -1.58, low = 0.06, top = 0.64;
      for (const z of [zf, zr]) rail([xo, low, z], [xo, top, z]);
      for (const y of [low, top]) rail([xo, y, zf], [xo, y, zr]);
      for (const z of [zf, (zf + zr) / 2, zr]) for (const y of [low + 0.04, top - 0.04]) rail([xi, y, z], [xo, y, z]);
      for (let k = 1; k < 5; k++) rail([xo, low + (top - low) * k / 5, zf], [xo, low + (top - low) * k / 5, zr]);
      for (let k = 1, m = Math.round((zf - zr) / 0.15); k < m; k++) {
        P.addEquipment('turretOpenLattice', box(0.016, top - low, 0.016), xo, (low + top) / 2, zf - (zf - zr) * k / m);
      }
    }
    // the bustle rack across the rear face (the 1987 and 2024 photographs): rails and uprights on a mesh floor, the tall
    // upright cylinders at its corners and the angled-lid bins between them
    const bRear = T.rearZ - 0.22;
    for (const y of [bLow, (bLow + bTop) / 2, bTop]) rail([-T.hw, y, bRear], [T.hw, y, bRear]);
    for (const s of [-1, 1] as const) for (const y of [bLow, bTop]) rail([s * T.hw, y, T.rearZ - 0.004], [s * T.hw, y, bRear]);
    for (let k = 0; k <= 7; k++) rail([-T.hw + 2 * T.hw * k / 7, bLow, bRear], [-T.hw + 2 * T.hw * k / 7, bTop, bRear]);
    for (let k = 1; k < 6; k++) P.addEquipment('turretOpenLattice', box(2 * T.hw, 0.008, 0.008), 0, bLow + (bTop - bLow) * k / 6, bRear);
    for (let k = 1; k < 28; k++) if (k % 4) P.addEquipment('turretOpenLattice', box(0.008, bTop - bLow, 0.008), -T.hw + 2 * T.hw * k / 28, (bLow + bTop) / 2, bRear);
    P.addEquipment('turretOpenLattice', box(2 * T.hw, 0.012, T.rearZ - bRear), 0, bLow - 0.008, (T.rearZ + bRear) / 2);
    for (const x of [-0.95, -0.78, 0.95]) P.addEquipment('turret', cylY(0.075, 0.075, 0.46, P.q ? 14 : 10), x, bLow + 0.23, T.rearZ - 0.11);
    for (const [x, w] of [[-0.30, 0.62], [0.42, 0.66]] as const) {
      const zf = T.rearZ - 0.02, zb = T.rearZ - 0.20;
      P.addEquipment('turret', slab(
        [x - w / 2, bLow, zb], [x + w / 2, bLow, zb], [x + w / 2, bLow, zf], [x - w / 2, bLow, zf],
        [x - w / 2, bLow + 0.26, zb], [x + w / 2, bLow + 0.26, zb], [x + w / 2, bLow + 0.34, zf], [x - w / 2, bLow + 0.34, zf]));
      P.addEquipment('turretDark', box(w + 0.01, 0.014, 0.02), x, bLow + 0.30, zb + 0.09);
    }
    // the raised boxes on the left wall directly behind the cheek, nearly the wall's full height, their tops about level
    // with the roof's bevel (blind critic, round 4): the P.2's two (the 1987 photograph), the P.1's one (2024; its emblem
    // there is not painted: a vehicle carries one insignia, seated on armour, the anchor's at the right wall's rear, where
    // the 2015 photograph has it)
    const boxes: ReadonlyArray<readonly [number, number]> = modern ? [] : p2 ? [[0.34, 0.82], [-0.20, 0.30]] : [[-0.16, 0.82]];
    for (const [z0, z1] of boxes) {
      P.addEquipment('turret', box(0.20, 0.64, z1 - z0), T.hw + 0.10, 0.38, (z0 + z1) / 2);
      P.addEquipment('turretDark', box(0.012, 0.02, z1 - z0 - 0.04), T.hw + 0.205, 0.66, (z0 + z1) / 2);
    }
    if (modern) {
      // the EE-T3/T4's side armour over the front half of each wall: bolted packs stood off on brackets, the stand-off a
      // dark gap along their tops and fronts and between them, the front pack's face swept back, bracket stubs under each,
      // a bolt row along each top; on the right as far back as the basket, which a modern mark keeps on the rear third
      // (blind critics, rounds c1 and c2: packs with a visible stand-off, not bare wall and not a bin)
      const mt = t4 ? 0.17 : 0.13, gap = 0.08, my0 = 0.06, my1 = 0.62;
      const packs: ReadonlyArray<readonly [number, number]> = [[0.95, 0.42], [0.39, -0.08], [-0.11, -0.58]];
      for (const s of [-1, 1] as const) {
        const xa = s * (T.hw + gap), xb = s * (T.hw + gap + mt);
        P.add('turretDark', box(gap, my1 - my0 - 0.04, packs[0][0] - packs.at(-1)![1]), s * (T.hw + gap / 2), (my0 + my1) / 2,
          (packs[0][0] + packs.at(-1)![1]) / 2);
        packs.forEach(([z1, z0], k) => {
          const zs = k === 0 ? z1 - 0.12 : z1;
          P.add('turret', slab([xa, my0, z0], [xb, my0, z0], [xb, my0, zs], [xa, my0, z1],
            [xa, my1, z0], [xb, my1, z0], [xb, my1, zs], [xa, my1, z1]));
          for (const z of [z0 + 0.08, z1 - (k === 0 ? 0.20 : 0.08)]) {
            P.add('turret', box(gap + mt * 0.6, 0.04, 0.06), s * (T.hw + (gap + mt * 0.6) / 2), my0 - 0.02, z);
          }
          for (let b = 0; b < 3; b++) {
            P.add('turretDetail', cylY(0.022, 0.022, 0.014, 8), (xa + xb) / 2, my1 + 0.007, z0 + (zs - z0) * (b + 0.5) / 3);
          }
        });
      }
      // the wedge modules on the cheeks (the Leopard 2A5 pattern): closed solids from just ahead of the gunner's sight,
      // their tops a hair proud of the roof and falling to an apex well past the cheeks' noses beside the mantlet, their
      // outer faces carried down over the roof bevel (no fin stands over it); the EE-T4's longer, broader and carried down
      // to the mantlet's foot, ending in a tall blunt face (blind critics, rounds c2 and c3: the tier X's frontal outline
      // heavier, the void under the horns filled); dark trims along their top edges so the plan reads
      const facetY = (z: number): number => z <= T.roofEdgeZ ? T.roofY
        : T.roofY - (z - T.roofEdgeZ) / (T.cheekNoseZ - T.roofEdgeZ) * (T.roofY - T.cheekNoseY);
      const cheekBot = (z: number): number => z <= T.cheekFootZ ? T.floorY
        : T.floorY + (z - T.cheekFootZ) / (T.cheekNoseZ - T.cheekFootZ) * (T.cheekNoseY - 0.02 - T.floorY);
      const bevel = (z: number): number => Math.min(T.roofY - T.bevelY, (facetY(z) - cheekBot(z)) * 0.3);
      const xi = T.recessX + 0.025, wz0 = 0.88, tipZ = T.cheekNoseZ + (t4 ? 0.80 : 0.50), tipY = t4 ? 0.12 : 0.40;
      const yt0 = T.roofY + (t4 ? 0.05 : 0.012), edge = t4 ? 0.44 : 0.03, tipW = t4 ? 0.22 : 0.03;
      // (the EE-T4's inner faces stop at the cheeks' line and fall only to 0.30 at the face, the outer flanks carried down:
      // a shallow, lit slot over the mantlet block, not a dark well; round c5)
      const noseFoot = t4 ? 0.20 : T.cheekNoseY - 0.03, tipInner = t4 ? 0.30 : tipY;
      const wedgeTop = (z: number): number => yt0 + (z - wz0) / (tipZ - wz0) * (tipY + edge - yt0);
      // (in plan a straight edge from the wall's front corner to the apex, overhanging the cheeks' swept noses; the EE-T4's
      // flaring 12 cm past the walls ahead of the side armour, so its outline grows head-on: round c3)
      const flare = t4 ? 0.12 : 0, flareZ = 0.95;
      const wedgeX = (z: number): number => z <= flareZ ? T.hw + 0.006
        : z <= T.frontZ ? T.hw + 0.006 + (z - flareZ) / (T.frontZ - flareZ) * flare
          : T.hw + 0.006 + flare + (z - T.frontZ) / (tipZ - T.frontZ) * (xi + tipW - T.hw - 0.006 - flare);
      for (const s of [-1, 1] as const) {
        const ringAt = (z: number, yb: number, yo: number): SectionPoint[] => s > 0
          ? [[xi, yb], [wedgeX(z), yo], [wedgeX(z), wedgeTop(z)], [xi, wedgeTop(z)]]
          : [[-wedgeX(z), yo], [-xi, yb], [-xi, wedgeTop(z)], [-wedgeX(z), wedgeTop(z)]];
        const behind = (z: number) => ({ z, ring: ringAt(z, facetY(z) - 0.03, facetY(z) - bevel(z) - 0.01) });
        const wedge = sectionSolid([
          behind(wz0), ...(t4 ? [behind(flareZ)] : []), behind(T.frontZ),
          { z: T.cheekNoseZ, ring: ringAt(T.cheekNoseZ, T.cheekNoseY - 0.03, noseFoot) },
          { z: tipZ, ring: ringAt(tipZ, tipInner, tipY) },
        ]);
        wedge.userData.primaryStockRole = 'osorio-cheek-module';
        P.add('turret', wedge);
        const top = (x: number, z: number): [number, number, number] => [s * x, wedgeTop(z), z];
        if (t4) {
          bar('turretDark', top(wedgeX(wz0), wz0), top(wedgeX(flareZ), flareZ), 0.011);
          bar('turretDark', top(wedgeX(flareZ), flareZ), top(wedgeX(T.frontZ), T.frontZ), 0.011);
        } else bar('turretDark', top(wedgeX(wz0), wz0), top(wedgeX(T.frontZ), T.frontZ), 0.011);
        bar('turretDark', top(wedgeX(T.frontZ), T.frontZ), top(wedgeX(tipZ), tipZ), 0.011);
        bar('turretDark', top(xi, wz0), top(xi, tipZ), 0.011);
      }
    }
    if (t4) {
      // the EE-T4's hard-kill active protection: four radar housings at the turret's corners, all at one height, each in
      // the coat under a hood with its dark face turned 45 degrees out, the front pair ahead of the side armour and the rear
      // pair aft of the dischargers, on brackets; two launchers on pedestals at the roof's sides standing over the roofline
      // (blind critics, rounds c2 and c3)
      for (const s of [-1, 1] as const) {
        // (the front pair on the side armour's outer faces, aft of the wedges and turned 20 degrees forward of abeam: in
        // profile and head-on clear of the wedges; round c5)
        for (const [cx, cz, ry, bx0, bx1, bz0, bz1] of [
          [1.53, 0.62, s * (Math.PI / 2 - 0.35), 1.39, 1.47, 0.58, 0.66],
          [1.36, -2.30, s * Math.PI * 3 / 4, T.hw - 0.01, 1.30, -2.33, -2.27],
        ] as const) {
          const nx = Math.sin(ry), nz = Math.cos(ry), cy = 0.45;
          P.addEquipment('turret', box(0.42, 0.32, 0.12), s * cx, cy, cz, 0, ry, 0);
          P.addEquipment('turret', box(0.46, 0.03, 0.18), s * cx + nx * 0.02, cy + 0.175, cz + nz * 0.02, 0, ry, 0);
          // (the radar's face painted in the coat inside a dark outline, as the hard-kill radars are: a dark pane read as a
          // window in profile; rounds c4 and c5)
          P.add('turretDark', box(0.34, 0.24, 0.02), s * cx + nx * 0.065, cy, cz + nz * 0.065, 0, ry, 0);
          P.addEquipment('turret', box(0.31, 0.21, 0.012), s * cx + nx * 0.080, cy, cz + nz * 0.080, 0, ry, 0);
          P.addEquipment('turret', box(bx1 - bx0, 0.08, bz1 - bz0), s * (bx0 + bx1) / 2, cy, (bz0 + bz1) / 2);
        }
        // (each launcher a drum on a turning ring over its pedestal, four tube mouths on its face: round c4, not a lamp)
        const lx = s * 0.96, lz = -1.35, ly = T.roofY + 0.35, ay = s * 0.6, dx = Math.sin(ay), dz = Math.cos(ay);
        P.addEquipment('turret', box(0.32, 0.05, 0.32), lx, T.roofY + 0.025, lz);
        P.addEquipment('turret', cylY(0.11, 0.13, 0.15, P.q ? 14 : 10), lx, T.roofY + 0.11, lz);
        P.addEquipment('turret', cylY(0.13, 0.13, 0.04, P.q ? 16 : 12), lx, T.roofY + 0.19, lz);
        P.addEquipment('turret', cylZ(0.15, 0.30, P.q ? 18 : 12), lx, ly, lz, 0, ay, 0);
        P.addEquipment('turret', cylZ(0.155, 0.02, P.q ? 18 : 12), lx + dx * 0.10, ly, lz + dz * 0.10, 0, ay, 0);
        for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          P.add('turretDark', cylZ(0.045, 0.012, 10), lx + dx * 0.152 + dz * u * 0.065, ly + v * 0.065, lz + dz * 0.152 - dx * u * 0.065, 0, ay, 0);
        }
        // (each a squat drum on a post with its sensor band and dome, at the roof's four corners: blind critic, round c1)
        for (const z of [0.70, -2.25]) {
          P.addEquipment('turret', cylY(0.022, 0.026, 0.14, 8), s * 0.98, T.roofY + 0.07, z);
          P.addEquipment('turret', cylY(0.085, 0.085, 0.08, P.q ? 16 : 10), s * 0.98, T.roofY + 0.18, z);
          P.add('turretGlass', cylY(0.088, 0.088, 0.03, P.q ? 16 : 10), s * 0.98, T.roofY + 0.18, z);
          P.add('turretGlass', xform(sph(0.06, 10, Math.PI / 2), 0, 0, 0), s * 0.98, T.roofY + 0.22, z);
        }
      }
    }
    // the dischargers high on the walls, aimed forward, out and up: the P.2 two rows of three on each rear corner, behind
    // the basket (the 1987 and 2022 photographs); the P.1 two of two, on the left wall at 60-76% of its length (2024) and
    // on the right aft of its grid, clear of the grid's frame (blind critic, round 6)
    const cols = p2 ? 3 : 2;
    for (const s of [-1, 1] as const) {
      const wallX = T.hw + 0.06, z0 = p2 ? -1.84 : s > 0 ? -1.28 : -2.02;
      P.addEquipment('turret', box(0.10, 0.20, 0.16 * cols + 0.08), s * wallX, 0.575, z0 - 0.08 * (cols - 1));
      for (let row = 0; row < 2; row++) for (let k = 0; k < cols; k++) {
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.035, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.55, s * 0.40, 0),
          s * (wallX + 0.08), 0.53 + row * 0.10, z0 + 0.16 - k * 0.16);
      }
    }
    P.turretG.userData.osorioTurretReceipt = {
      revision: 'osorio-266-r11', mark, roofY: T.roofY, turretHalfWidth: T.hw, bustleRearZ: T.rearZ, cheekNoseZ: T.cheekNoseZ,
      dischargers: cols * 4, rightGrid: p2 ? 'basket' : 'flat', leftBasket: false, bustleRack: true, panoramicPedestal: p2,
      sightHeads: modern ? 2 : 3, gunBoot: p2 ? 'canvas' : 'black', armourKit: modern ? (t4 ? 'full' : 'front') : 'none',
      activeProtection: t4, remoteStation: modern,
    };
  };
  buildOsorioTurretFittings();
  yield 'buildOsorioTurretFittings';

  // ---------------------------------------------------------------- markings on the hull --
  const buildOsorioMarkings = (): void => {
    // (on the EE-T3/T4 the stencils sit on the composite module's face where one hangs on their panel)
    const seg = (2.48 + 3.45) / 6, moduleT = SKIRT_MOD_T;
    const faceX = (z: number): number => H.skirtX + 0.0135 + (modern && (t4 || z > 2.48 - 2 * seg) ? 0.012 + moduleT + 0.004 : 0);
    for (const s of [-1, 1] as const) {
      const x = s * faceX(2.02), xr = s * faceX(p2 ? -2.95 : -1.97);
      // the "OSÓRIO / EE-T1" stencil on the front skirt panel and the Engesa oval on the rearmost (every photograph since 2003;
      // the P.1's lower-case badge on the fifth panel, about three-quarters back: the 2024 photograph, blind critic, round 6)
      // (a stencil is a square quad: each sits inside the 0.69 m skirt panel)
      // (about half the round-3 size: blind critic, round 4)
      P.decal('hull', 'stencil', 'OSÓRIO', 0.26, [x, 1.10, 2.02], s * Math.PI / 2);
      P.decal('hull', 'stencil', modern ? (t4 ? 'EE-T4' : 'EE-T3') : 'EE-T1', 0.17, [x, 1.01, 2.02], s * Math.PI / 2);
      // (the EE-T3/T4 in Army service: the Army's registration where the prototypes' maker's name stood)
      if (modern) P.decal('hull', 'stencil', t4 ? 'EB 41-0266' : 'EB 31-0266', 0.26, [xr, 1.06, -2.95], s * Math.PI / 2);
      else P.decal('hull', 'stencil', p2 ? 'ENGESA' : 'engesa', 0.20, [xr, 1.08, p2 ? -2.95 : -1.97], s * Math.PI / 2);
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
    P.addGunExtra(box(0.86, 0.27, 0.22), 0, -0.015, 0.35);
    P.addGunExtra(cylZ(0.155, 0.08, P.q ? 24 : 14), 0, 0, 0.50);
    // (the EE-T4's bolted mantlet module over the plate's face, the ports carried out to its face; its top no higher than
    // the plate's, under the brow at +20 degrees, and its foot over the deck at -10)
    // (a block 0.20 m deep standing out from the plate, its foot raised 4 cm, its front half rising over the gun's root:
    // its top under the brow at +20 degrees; blind critics, rounds c2 and c4)
    const mz = t4 ? 0.20 : 0;
    if (t4) {
      P.addGunExtra(box(0.88, 0.21, 0.10), 0, 0.005, 0.51);
      P.addGunExtra(slab([-0.44, -0.10, 0.56], [0.44, -0.10, 0.56], [0.44, -0.10, 0.66], [-0.44, -0.10, 0.66],
        [-0.44, 0.11, 0.56], [0.44, 0.11, 0.56], [0.44, 0.20, 0.66], [-0.44, 0.20, 0.66]));
      P.addGunExtraDark(box(0.90, 0.02, 0.012), 0, 0.195, 0.665);
      for (const x of [-0.39, -0.13, 0.13, 0.39]) for (const y of [-0.07, 0.13]) P.addGunExtraDark(cylZ(0.018, 0.012, 8), x, y, 0.666);
      // (a hood over the coaxial's port)
      P.addGunExtra(box(0.16, 0.03, 0.08), -0.27, 0.12, 0.70);
    }
    P.addGunExtraDark(box(0.07, 0.07, 0.04), 0.25, -0.01, 0.475 + mz);
    P.addGunExtraDark(cylZ(0.05, 0.04, 14), -0.27, 0.06, 0.475 + mz);
    P.add('gunMountGlass', cylZ(0.035, 0.008, 12), -0.27, 0.06, 0.498 + mz);
    if (p2) {
      // (the EE-T3/T4's canvas a size up over the heavier guns' roots)
      // (the EE-T4's from its mantlet block's face)
      const k = modern ? (t4 ? 1.22 : 1.12) : 1;
      if (t4) P.add('gunMountCloth', cylZ(0.12 * k, 0.22, P.q ? 20 : 12, 0.135 * k), 0, 0, 0.77);
      else P.add('gunMountCloth', cylZ(0.12 * k, 0.34, P.q ? 20 : 12, 0.145 * k), 0, 0, 0.71);
      for (const z of t4 ? [0.74, 0.82] : [0.58, 0.74, 0.82]) {
        P.add('gunMountCloth', torus((0.145 - ((z - 0.54) / 0.34) * 0.025) * k, 0.012, P.q ? 20 : 12, 5), 0, 0, z, Math.PI / 2, 0, 0);
      }
    } else {
      // the P.1's large black boot over the gun's root (the 2015 museum photograph; blind critic, round 3), its folds; an
      // oval 0.40 m wide, flattened below and lifted 2 cm so its underside stays inside the old cover's (the -10 degree
      // depression over the deck)
      const oval = [1, 0.78, 1] as const;
      P.addGunExtraDark(xform(cylZ(0.15, 0.46, P.q ? 20 : 12, 0.20), 0, 0, 0, 0, 0, 0, oval), 0, 0.02, 0.66);
      for (const z of [0.52, 0.66, 0.80]) {
        const ring = xform(torus(0.20 - ((z - 0.43) / 0.46) * 0.05 + 0.006, 0.014, P.q ? 20 : 12, 5), 0, 0, 0, Math.PI / 2, 0, 0);
        P.addGunExtraDark(xform(ring, 0, 0, 0, 0, 0, 0, oval), 0, 0.02, z);
      }
    }
    const seg = P.q ? 24 : 12;
    if (modern) {
      // the EE-T3's 120 mm L/55 and the EE-T4's 130 mm L/51: a smooth thermal sleeve in four lengths from a heavy root
      // collar, a muzzle reference sensor on top near the muzzle, a plain muzzle with its collar; the muzzle at hull z 6.895
      // and 7.85 (0.36 m and 1.315 m past the P.2's; the 130 mm the thicker its whole length and clearly the longer: blind
      // critics, rounds c1 and c3)
      const len = OSORIO_MUZZLE_HULL_Z[mark] - (RING.z + TRUNNION.z), r0 = t4 ? 0.150 : 0.118, r1 = t4 ? 0.140 : 0.104;
      const sleeveEnd = len - 0.30;
      P.add('gun', cylZ(r0 + 0.02, 0.12, seg, r0 + 0.014), 0, 0, 0.93);
      P.add('gun', cylZ(r1, sleeveEnd - 0.87, seg, r0), 0, 0, (0.87 + sleeveEnd) / 2);
      for (let j = 1; j < 4; j++) P.add('gunDark', cylZ(r0 + 0.004 - (r0 - r1) * j / 4, 0.02, seg), 0, 0, 0.87 + (sleeveEnd - 0.87) * j / 4);
      P.add('gun', cylZ(r1 - 0.008, len - sleeveEnd, seg, r1 - 0.004), 0, 0, (sleeveEnd + len) / 2);
      P.add('gun', cylZ(r1 + 0.018, 0.14, seg, r1 + 0.012), 0, 0, len - 0.10);
      P.add('gunDark', box(0.07, 0.05, 0.10), 0, r1 + 0.03, len - 0.42);
      muzzleBore(P, { z: len + 0.004, r: t4 ? 0.066 : 0.060 });
      P.muzzleZ = len;
      P.gunG.userData.osorioGunReceipt = { mark, caliberMm: t4 ? 130 : 120, muzzleZ: len, fumeExtractor: false, sleeveJoints: 3 };
    } else if (p2) {
      // GIAT 120 mm G1 smoothbore: the fat segmented thermal sleeve (four joints) from a heavy root collar, no fume
      // extractor, the thick muzzle collar (the CIBld 2020 photograph); the muzzle 6.135 m from the ring (10.10 m over
      // the gun)
      const len = 6.535 - (RING.z + TRUNNION.z), r0 = 0.116, r1 = 0.104, sleeveEnd = len - 0.34;
      P.add('gun', cylZ(0.13, 0.10, seg, 0.12), 0, 0, 0.92);
      P.add('gun', cylZ(r1, sleeveEnd - 0.86, seg, r0), 0, 0, (0.86 + sleeveEnd) / 2);
      for (const z of [1.90, 2.90, 3.90]) P.add('gunDark', cylZ(0.121, 0.035, seg), 0, 0, z);
      P.add('gun', cylZ(0.094, len - sleeveEnd, seg, 0.098), 0, 0, (sleeveEnd + len) / 2);
      // (the collar's face 3 cm behind the bore's: at the muzzle face its rim rendered as torn flaps, blind critic, round 10)
      P.add('gun', cylZ(0.128, 0.16, seg, 0.122), 0, 0, len - 0.11);
      P.add('gunDark', cylZ(0.129, 0.012, seg), 0, 0, len - 0.195);
      muzzleBore(P, { z: len + 0.004, r: 0.060 });
      P.muzzleZ = len;
      P.gunG.userData.osorioGunReceipt = { mark, caliberMm: 120, muzzleZ: len, fumeExtractor: false, sleeveJoints: 3 };
    } else {
      // Royal Ordnance 105 mm L7A3: the thermal sleeve with its clamp bands, the fume extractor's thick section from the
      // boot out to about a third of the barrel (the 2015 and 2024 photographs; blind critic, round 4), a plain muzzle;
      // the muzzle 5.395 m from the ring (9.36 m over the gun)
      const len = 5.795 - (RING.z + TRUNNION.z), r0 = 0.090, r1 = 0.080, ez = 1.40, el = 0.90, sleeveEnd = len - 0.16;
      P.add('gun', cylZ(r1, sleeveEnd - 0.86, seg, r0), 0, 0, (0.86 + sleeveEnd) / 2);
      for (const z of [2.30, 3.05, 3.85]) P.add('gunDark', cylZ(0.094, 0.03, seg), 0, 0, z);
      P.add('gun', cylZ(0.122, el - 0.12, seg), 0, 0, ez);
      P.add('gun', cylZ(0.122, 0.06, seg, 0.088), 0, 0, ez - el / 2 + 0.03);
      P.add('gun', cylZ(0.084, 0.06, seg, 0.122), 0, 0, ez + el / 2 - 0.03);
      P.add('gun', cylZ(0.072, len - sleeveEnd, seg, 0.074), 0, 0, (sleeveEnd + len) / 2);
      muzzleBore(P, { z: len + 0.004, r: 0.053 });
      P.muzzleZ = len;
      P.gunG.userData.osorioGunReceipt = { mark, caliberMm: 105, muzzleZ: len, fumeExtractor: true, sleeveJoints: 3 };
    }
    // the dark olive canvas of the P.2's mantlet cover and the crew's kit
    P.mats.canvasCloth.color.setHex(0x33372b);
    P.mats.glass.color.setHex(0x3a463f);
    P.mats.glass.roughness = 0.42;
    P.mats.glass.metalness = 0.32;
    P.topY = RING.y;
  };
  buildOsorioGun();
}

export const buildOsorioP1 = steppedBuilder((P: TankBuilderPort) => buildOsorioSteps(P, 'p1'));
export const buildOsorioP2 = steppedBuilder((P: TankBuilderPort) => buildOsorioSteps(P, 'p2'));
export const buildOsorioT3 = steppedBuilder((P: TankBuilderPort) => buildOsorioSteps(P, 't3'));
export const buildOsorioT4 = steppedBuilder((P: TankBuilderPort) => buildOsorioSteps(P, 't4'));

/** The datums a fixture holds the build to (docs/references/tanks/osorio_p2.md). */
export const OSORIO_DATUMS = Object.freeze({
  hull: H, roadWheelZs: Object.freeze([...ROAD_WHEEL_ZS]), ring: RING, turret: T, trunnion: TRUNNION,
  muzzleHullZ: OSORIO_MUZZLE_HULL_Z,
});
