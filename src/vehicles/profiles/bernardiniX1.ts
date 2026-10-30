// The Bernardini X1 family (release 266; Main's ruling 2026-10-29 on the Brazil line): one first-party build of the two
// light tanks the Brazilian Army fielded from Bernardini (docs/references/tanks/x1a2_carcara.md), on the BT-90 turret
// family (the French H-90's ring) and VVSS bogies, sprocket forward.
// - x1: the CCL X1 Pioneiro (52 built, 1977-94): an M3/M3A1 Stuart hull lengthened by Biselli on the Stuart's two
//   wide-spread bogies a side and its large trailing idler, the rear deck falling over the idler; the tall BT-90A1 turret
//   (a raked front over a short nose, sloped flanks, the domed commander's cupola its peak) with the 90 mm D-921 and its
//   single-baffle brake in a long mantlet sleeve, two dischargers each side at the turret rear.
// - x1a2: the CCL X1A2 Carcará (24 built, the 6º RCB 1981-94), Brazil's only indigenous tank in service: a new, longer
//   hull on the 18-ton M4 tractor's three VVSS bogies a side, a large toothed sprocket forward and a raised idler; a
//   wedge turret (a pointed nose, cheeks angled in, a long shallow front sloping to the roof, flanks leaning in) with the
//   Engesa EC-90 (the Cockerill Mk 3 under licence) in a long sleeve and its multi-baffle cage brake, three dischargers
//   on each front cheek, the six-tube box on each rear flank, the .50 on the cupola, the pioneer tools on the hull sides.
// Round 2 (blind critics, 2026-10-29): the VVSS bogies built as brackets, volute springs and A-arms with the return
//   roller on each bracket; the sprockets enlarged to the profiles; each mark its own turret; the M2s seated; the roofs
//   clear; the X1's running gear raised (larger wheels and idler) under a shallower side; the X1A2's tools, cage brake,
//   flank boxes and bow registration.
// Datums: the X1's published 5.04 m hull and 6.04 m over the gun, 2.4 m wide, 2.45 m; the X1A2's 6.06 m hull, 2.6 m wide,
// 2.45 m, 19 t (Tanks Encyclopedia, after Bastos' "Brazilian Stuart"); stations from Brian Gaydos' profiles for Tanks
// Encyclopedia, scaled on the hull (the X1A2's turret roof reads 2.5 m against the published 2.45, recorded in its packet;
// the X1A2's bogies spread their wheels 0.77 m and stand 0.64 m apart wheel to wheel, as drawn).
// A +Z hull's right is -X: the commander at -X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type BernardiniX1Mark = 'x1' | 'x1a2';

/** One turret cross-section (turret-local metres): the flank stands vertical from the floor `yb` to the crease `yc` at
 * half-width `hwb`, then leans in to the roof edge at `hwt`, `top`. */
interface TurretSection {
  readonly z: number; readonly yb: number; readonly yc: number; readonly top: number; readonly hwb: number; readonly hwt: number;
}

interface X1Datums {
  readonly noseZ: number; readonly sternZ: number; readonly bellyY: number; readonly lowerX: number; readonly sponsonX: number;
  readonly sponsonFloorY: number; readonly deckY: number; readonly noseY: number; readonly glacisZ: number; readonly bowZ: number;
  readonly rearTopZ: number; readonly rearY: number; readonly rearBellyZ: number; readonly fenderX: number; readonly fenderY: number;
  readonly sponsonFrontZ: number;
  readonly trackXc: number; readonly trackW: number; readonly wheelR: number; readonly wheelY: number;
  readonly wheelZs: readonly number[]; readonly bogieZs: readonly number[];
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number };
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
  readonly rollerZs: readonly number[]; readonly rollerY: number; readonly rollerR: number;
  readonly ring: { readonly y: number; readonly z: number };
  readonly turret: { readonly front: number; readonly slopeTop: number; readonly rear: number; readonly roof: number;
    readonly sections: readonly TurretSection[] };
  readonly trunnion: { readonly y: number; readonly z: number };
  readonly muzzleHullZ: number;
}

const sec = (z: number, yb: number, yc: number, top: number, hwb: number, hwt: number): TurretSection =>
  Object.freeze({ z, yb, yc, top, hwb, hwt });

const DATUMS: Readonly<Record<BernardiniX1Mark, X1Datums>> = Object.freeze({
  x1: Object.freeze({
    noseZ: 2.52, sternZ: -2.52, bellyY: 0.40, lowerX: 0.74, sponsonX: 1.12, sponsonFloorY: 1.14, deckY: 1.62, noseY: 1.12,
    glacisZ: 1.55, bowZ: 2.30, rearTopZ: -1.85, rearY: 1.22, rearBellyZ: -2.30, fenderX: 1.20, fenderY: 1.14,
    sponsonFrontZ: 2.16,
    // the Stuart's bogies: each pair spread 0.84 m, the two bogies' inner wheels nearly touching (Gaydos' X1 profile)
    trackXc: 0.98, trackW: 0.40, wheelR: 0.28, wheelY: 0.34, wheelZs: [1.47, 0.63, 0.02, -0.82], bogieZs: [1.05, -0.40],
    sprocket: { z: 2.03, y: 0.74, r: 0.36 }, idler: { z: -1.76, y: 0.41, r: 0.36 }, rollerZs: [0.89, -0.56], rollerY: 0.96,
    rollerR: 0.10,
    ring: { y: 1.62, z: 0.08 },
    turret: {
      front: 1.10, slopeTop: 0.55, rear: -1.43, roof: 0.68,
      sections: Object.freeze([
        sec(-1.43, 0.22, 0.44, 0.62, 0.80, 0.62), sec(-1.25, 0.12, 0.46, 0.68, 0.88, 0.68),
        sec(-0.85, 0.12, 0.46, 0.68, 0.90, 0.68), sec(-0.84, 0.02, 0.46, 0.68, 0.90, 0.68),
        sec(0.55, 0.02, 0.46, 0.68, 0.90, 0.68), sec(0.85, 0.02, 0.29, 0.53, 0.78, 0.54),
        sec(1.10, 0.02, 0.14, 0.40, 0.62, 0.44),
      ]),
    },
    trunnion: { y: 0.33, z: 1.02 }, muzzleHullZ: 3.52,
  }),
  x1a2: Object.freeze({
    noseZ: 3.03, sternZ: -3.03, bellyY: 0.42, lowerX: 0.84, sponsonX: 1.25, sponsonFloorY: 1.18, deckY: 1.74, noseY: 1.24,
    glacisZ: 1.67, bowZ: 2.80, rearTopZ: -2.30, rearY: 1.32, rearBellyZ: -2.75, fenderX: 1.30, fenderY: 1.18,
    sponsonFrontZ: 2.80,
    trackXc: 1.09, trackW: 0.42, wheelR: 0.27, wheelY: 0.33, wheelZs: [1.79, 1.02, 0.38, -0.38, -1.00, -1.73],
    bogieZs: [1.405, 0, -1.365],
    sprocket: { z: 2.52, y: 0.74, r: 0.36 }, idler: { z: -2.46, y: 0.62, r: 0.29 }, rollerZs: [1.405, 0, -1.365], rollerY: 0.96,
    rollerR: 0.085,
    ring: { y: 1.74, z: 0.10 },
    turret: {
      front: 1.28, slopeTop: 0.70, rear: -1.71, roof: 0.77,
      sections: Object.freeze([
        sec(-1.71, 0.19, 0.44, 0.73, 0.86, 0.70), sec(-1.55, 0.17, 0.46, 0.77, 0.96, 0.80),
        sec(-0.72, 0.17, 0.46, 0.77, 0.98, 0.80), sec(-0.71, 0.02, 0.46, 0.77, 0.98, 0.80),
        sec(0.70, 0.02, 0.46, 0.77, 0.98, 0.80), sec(1.00, 0.02, 0.26, 0.62, 0.84, 0.56),
        sec(1.28, 0.02, 0.06, 0.48, 0.64, 0.40),
      ]),
    },
    trunnion: { y: 0.43, z: 1.30 }, muzzleHullZ: 3.89,
  }),
});

function* buildX1Steps(P: TankBuilderPort, mark: BernardiniX1Mark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, torus, xform, buildRunningGear, headlight, liftEye } = KIT;
  const slab = orientedSlab;
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
  /** A flat bar of width `w` (in the y-z plane) and thickness `t` (along x) from `a` to `b`, both at x. */
  const flatBar = (slot: string, x: number, a: readonly [number, number], b: readonly [number, number], w: number, t: number): void => {
    const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy) || 1;
    const nz = (-dy / len) * w / 2, ny = (dz / len) * w / 2;
    const c = (p: readonly [number, number], sz: number, sx: number): number[] => [x + sx * t / 2, p[1] + sz * ny, p[0] + sz * nz];
    P.add(slot, slab(c(a, -1, -1), c(b, -1, -1), c(b, -1, 1), c(a, -1, 1), c(a, 1, -1), c(b, 1, -1), c(b, 1, 1), c(a, 1, 1)));
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
      P.add('hull', sectionSolid([D.sternZ + 0.05, D.rearTopZ, D.glacisZ, D.sponsonFrontZ].map((z) => ({ z, ring: ring(z) }))));
      // the fender lip over the track, the length of the sponson
      P.add('hullDetail', box(D.fenderX - D.sponsonX + 0.02, 0.022, D.sponsonFrontZ - D.sternZ - 0.08),
        s * (D.sponsonX + D.fenderX) / 2, D.fenderY - 0.011, (D.sponsonFrontZ + D.sternZ) / 2 + 0.01);
    }
    P.add('hullDetail', box(D.lowerX * 2, 0.05, 0.06), 0, D.noseY - 0.40, D.noseZ - 0.02);
  };
  buildX1Hull();
  yield 'buildX1Hull';

  // ---------------------------------------------------------------- running gear (VVSS bogies, sprocket forward) --
  const buildX1RunningGear = (): void => {
    buildRunningGear(P, {
      style: 'holes', wheelR: D.wheelR, wheelW: 0.22, wheelY: D.wheelY, xc: D.trackXc, wheelZs: [...D.wheelZs],
      sprocket: { ...D.sprocket }, idler: { ...D.idler }, rollers: D.rollerZs.map((z) => ({ z, y: D.rollerY, r: D.rollerR })),
      rollerR: D.rollerR, trackW: D.trackW, topY: D.rollerY + 0.04, botY: 0.03, contactZF: D.wheelZs[0],
      contactZR: a2 ? D.wheelZs.at(-1) : D.idler.z, paintedEnds: true, coveredTop: false, arms: false, sprocketTeeth: true,
    });
    // each VVSS bogie: the bracket casting bolted to the hull, the volute spring standing in it between the wheels, the two
    // A-arms from the bracket down to the wheel hubs (outboard, as the profiles draw them), the return roller on its top
    const r = D.wheelR, top = D.rollerY - D.rollerR - 0.005;
    for (const s of [-1, 1] as const) {
      for (let b = 0; b < D.bogieZs.length; b++) {
        const bz = D.bogieZs[b], zf = D.wheelZs[2 * b], zr = D.wheelZs[2 * b + 1];
        const xi = s * (D.trackXc - 0.10), xo = s * (D.trackXc + 0.04), xm = (xi + xo) / 2;
        // the bracket: narrow between the wheels, widening above them to the roller seat
        const lo = D.wheelY - 0.02, bw = 0.085, tw = 0.20;
        P.add('hullRunningGearDetail', slab([xi, lo, bz - bw], [xo, lo, bz - bw], [xo, lo, bz + bw], [xi, lo, bz + bw],
          [xi, top, bz - tw], [xo, top, bz - tw], [xo, top, bz + tw], [xi, top, bz + tw]));
        // its foot on the lower hull side and the roller's saddle
        P.add('hullRunningGearDetail', box(Math.abs(xi) - D.lowerX + 0.02, 0.20, 0.30), s * (D.lowerX + Math.abs(xi)) / 2,
          top - 0.12, bz);
        P.add('hullRunningGearDark', box(0.10, 0.03, 0.12), xm, top - 0.012, D.rollerZs[b]);
        // the volute spring and its seat
        P.add('hullRunningGearDark', cylY(0.068, 0.072, r * 1.05, P.q ? 14 : 10), s * (D.trackXc + 0.06), D.wheelY + 0.04 + r * 0.52, bz);
        for (const k of [0.30, 0.62, 0.94]) {
          P.add('hullRunningGearDetail', cylY(0.078, 0.078, 0.02, P.q ? 14 : 10), s * (D.trackXc + 0.06), D.wheelY + 0.04 + r * 1.05 * k, bz);
        }
        // the A-arms and their bosses: each from its pivot on the bracket to its wheel's hub, outboard of the wheel face
        const xa = s * (D.trackXc + 0.15), pivotY = D.wheelY + r * 1.05;
        for (const [wz, pz] of [[zf, bz + 0.10], [zr, bz - 0.10]] as const) {
          flatBar('hullRunningGearDetail', xa, [pz, pivotY], [wz, D.wheelY], 0.075, 0.045);
          P.add('hullRunningGearDetail', cylX(0.052, 0.07, P.q ? 14 : 10), xa, D.wheelY, wz);
          P.add('hullRunningGearDetail', cylX(0.046, Math.abs(xa - xo) + 0.03, P.q ? 12 : 8), (xa + xo) / 2, pivotY, pz);
        }
        // the cross-tie between the arms' pivots, the bracket's outer face
        flatBar('hullRunningGearDetail', xa, [bz + 0.10, pivotY], [bz - 0.10, pivotY], 0.09, 0.05);
      }
    }
    P.mats.rubber.color.setHex(0x2f312b);
  };
  buildX1RunningGear();
  yield 'buildX1RunningGear';

  // ---------------------------------------------------------------- hull fittings --
  const buildX1HullFittings = (): void => {
    for (const s of [-1, 1] as const) {
      // the headlights in their guards on the bow, the lifting eyes, the tail lights on the rear plate
      headlight(P, s * (D.sponsonX - 0.18), deckY(D.bowZ - 0.10) + 0.08, D.bowZ - 0.05, -glacis * 0.5, 0.06);
      bar('hullDark', [s * (D.sponsonX - 0.30), deckY(D.bowZ - 0.10) + 0.02, D.bowZ - 0.18], [s * (D.sponsonX - 0.30), deckY(D.bowZ - 0.10) + 0.16, D.bowZ + 0.02], 0.012);
      bar('hullDark', [s * (D.sponsonX - 0.06), deckY(D.bowZ - 0.10) + 0.02, D.bowZ - 0.18], [s * (D.sponsonX - 0.06), deckY(D.bowZ - 0.10) + 0.16, D.bowZ + 0.02], 0.012);
      liftEye(P, 'hullDetail', s * (D.sponsonX - 0.15), deckY(D.glacisZ + 0.20) + 0.012, D.glacisZ + 0.20, s * 0.3);
      P.add('hullDark', box(0.14, 0.10, 0.06), s * (D.lowerX - 0.18), D.rearY - 0.10, D.sternZ - 0.01);
      P.add('hullGlass', box(0.09, 0.05, 0.012), s * (D.lowerX - 0.18), D.rearY - 0.10, D.sternZ - 0.045);
      P.add('hullDark', torus(0.06, 0.02, 12, 6), s * 0.45, D.rearY - 0.22, D.sternZ - 0.03, 0, 0, Math.PI / 2);
    }
    // the pioneer tools on the hull's flanks, each on its clips: the shovel and the crowbar (both marks); the X1A2 also
    // carries the pick and a second bar (Gaydos' X1A2 profile)
    const tools = (s: -1 | 1): void => {
      const x = s * (D.sponsonX + 0.022), clip = (y: number, z: number): void => {
        P.add('hullDark', box(0.045, 0.06, 0.035), s * (D.sponsonX + 0.012), y, z);
      };
      // the shovel: the ash shaft, the D-grip aft, the pointed blade forward
      const sy = D.sponsonFloorY + (D.deckY - D.sponsonFloorY) * 0.55, sz0 = a2 ? -0.26 : -0.60, sz1 = a2 ? 0.55 : 0.18;
      bar('hullWood', [x, sy, sz0], [x, sy, sz1], 0.017);
      bar('hullDark', [x, sy - 0.05, sz0 - 0.02], [x, sy + 0.05, sz0 - 0.02], 0.012);
      bar('hullDark', [x, sy - 0.05, sz0 - 0.02], [x, sy - 0.03, sz0 + 0.08], 0.010);
      bar('hullDark', [x, sy + 0.05, sz0 - 0.02], [x, sy + 0.03, sz0 + 0.08], 0.010);
      P.add('hullDark', slab([x - 0.008, sy - 0.10, sz1], [x + 0.008, sy - 0.10, sz1], [x + 0.008, sy - 0.10, sz1 + 0.18],
        [x - 0.008, sy - 0.10, sz1 + 0.18], [x - 0.008, sy + 0.10, sz1], [x + 0.008, sy + 0.10, sz1],
        [x + 0.008, sy + 0.02, sz1 + 0.27], [x - 0.008, sy + 0.02, sz1 + 0.27]));
      for (const z of [sz0 + 0.12, sz1 - 0.06]) clip(sy, z);
      // the crowbar, high on the flank
      const by = D.deckY - 0.12, bz0 = a2 ? -1.35 : -1.45, bz1 = a2 ? 0.24 : -0.05;
      bar('hullDark', [x, by, bz0], [x, by, bz1], 0.016);
      for (const z of [bz0 + 0.12, (bz0 + bz1) / 2, bz1 - 0.12]) clip(by, z);
      if (a2) {
        // the pick: its handle low on the flank and the head across it
        const py = D.sponsonFloorY + 0.13, pz0 = -1.34, pz1 = -0.50;
        bar('hullWood', [x, py, pz0], [x, py, pz1], 0.017);
        P.add('hullDark', slab([x - 0.012, py - 0.07, pz1 - 0.03], [x + 0.012, py - 0.07, pz1 - 0.03],
          [x + 0.012, py - 0.07, pz1 + 0.03], [x - 0.012, py - 0.07, pz1 + 0.03], [x - 0.012, py + 0.22, pz1 - 0.01],
          [x + 0.012, py + 0.22, pz1 - 0.01], [x + 0.012, py + 0.22, pz1 + 0.01], [x - 0.012, py + 0.22, pz1 + 0.01]));
        for (const z of [pz0 + 0.10, pz1 - 0.12]) clip(py, z);
      }
    };
    tools(1);
    tools(-1);
    // the driver's and the co-driver's hatches on the glacis (the X1 kept the Stuart's two front stations)
    const hz = D.glacisZ + 0.40;
    for (const hx of a2 ? [0.40] : [0.40, -0.40]) {
      P.addCupola('hull', xform(cylY(0.22, 0.23, 0.04, P.q ? 20 : 12), 0, 0, 0, glacis, 0, 0), hx, deckY(hz) + 0.02, hz);
      P.add('hullDetail', xform(box(0.12, 0.06, 0.08), 0, 0, 0, glacis, 0, 0), hx, deckY(hz + 0.32) + 0.03, hz + 0.32);
      P.add('hullGlass', xform(box(0.10, 0.035, 0.008), 0, 0, 0, glacis, 0, 0), hx, deckY(hz + 0.32) + 0.04, hz + 0.365);
    }
    if (a2) {
      // the X1A2's transmission access hatch on the bow (the CD-500), and its Army registration on the bow plate's right
      P.add('hullDetail', xform(box(0.90, 0.02, 0.40), 0, 0, 0, glacis, 0, 0), 0, deckY(D.bowZ - 0.30) + 0.012, D.bowZ - 0.30);
      P.decal('hull', 'stencil', 'EB11-327', 0.28, [-0.46, D.noseY - 0.22, D.noseZ + 0.004], 0);
    }
    // the engine deck's grilles aft
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.62, 0.016, 0.90), s * 0.42, D.deckY + 0.008, D.rearTopZ + 0.55);
      for (let k = 0; k < 5; k++) P.addEquipment('hull', box(0.56, 0.012, 0.035), s * 0.42, D.deckY + 0.014, D.rearTopZ + 0.20 + k * 0.18);
    }
  };
  buildX1HullFittings();
  yield 'buildX1HullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, D.ring.y, D.ring.z);
  const T = D.turret, S = T.sections;
  /** The turret's section at z (linear between the authored sections). */
  const sectionAt = (z: number): TurretSection => {
    if (z <= S[0].z) return S[0];
    for (let i = 1; i < S.length; i++) {
      if (z <= S[i].z) {
        const a = S[i - 1], b = S[i], t = (z - a.z) / (b.z - a.z), m = (k: keyof TurretSection): number => a[k] + (b[k] - a[k]) * t;
        return { z, yb: m('yb'), yc: m('yc'), top: m('top'), hwb: m('hwb'), hwt: m('hwt') };
      }
    }
    return S[S.length - 1];
  };
  /** The flank's half-width at (z, y). */
  const flankX = (z: number, y: number): number => {
    const c = sectionAt(z);
    return y <= c.yc ? c.hwb : c.hwb + (c.hwt - c.hwb) * Math.min(1, (y - c.yc) / Math.max(1e-6, c.top - c.yc));
  };
  const buildX1Turret = (): void => {
    P.add('turret', cylY(0.82, 0.86, 0.10, P.q ? 26 : 16), 0, -0.04, 0);
    // vertical lower flanks to the crease, upper flanks leaning in to the roof; the cheeks angle in to a short nose and
    // the roof falls forward to it; the bustle stands on its own floor behind the ring
    const body = sectionSolid(S.map((c) => ({
      z: c.z,
      ring: [[-c.hwb, c.yb], [c.hwb, c.yb], [c.hwb, c.yc], [c.hwt, c.top], [-c.hwt, c.top], [-c.hwb, c.yc]] as SectionPoint[],
    })));
    body.userData.primaryStockRole = a2 ? 'x1a2-wedge-turret' : 'bt90a1-turret';
    P.add('turret', body);
    for (const s of [-1, 1] as const) {
      const fz = T.slopeTop - 0.25, rz = T.rear + 0.30;
      liftEye(P, 'turretDetail', s * (sectionAt(fz).hwt - 0.10), T.roof + 0.005, fz, s * 0.4);
      liftEye(P, 'turretDetail', s * (sectionAt(rz).hwt - 0.10), sectionAt(rz).top + 0.005, rz, s * 2.7);
    }
  };
  buildX1Turret();
  yield 'buildX1Turret';

  const buildX1TurretFittings = (): void => {
    const roof = T.roof;
    // the commander's cupola (right): the X1's domed BT-90A1 cupola, its peak; the X1A2's raised vision-block cupola
    const cx = -0.34, cz = a2 ? -0.05 : -0.15, cr = 0.30;
    let cupolaTop: number;
    if (a2) {
      const rise = 0.13;
      P.addCupola('turret', cylY(cr, cr * 1.05, 0.12 + rise, P.q ? 22 : 14), cx, roof + (0.12 + rise) / 2, cz);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        P.add('turretDetail', box(0.09, 0.06, 0.05), cx + Math.sin(a) * cr, roof + 0.07 + rise, cz + Math.cos(a) * cr, 0, a, 0);
        P.add('turretGlass', box(0.07, 0.03, 0.012), cx + Math.sin(a) * (cr + 0.025), roof + 0.07 + rise, cz + Math.cos(a) * (cr + 0.025), 0, a, 0);
      }
      P.addCupola('turret', cylY(cr * 0.9, cr * 0.94, 0.04, P.q ? 22 : 14), cx, roof + 0.14 + rise, cz);
      cupolaTop = roof + 0.16 + rise;
    } else {
      const wall = 0.13;
      P.addCupola('turret', cylY(cr, cr * 1.04, wall, P.q ? 24 : 14), cx, roof + wall / 2, cz);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        P.add('turretGlass', box(0.08, 0.035, 0.012), cx + Math.sin(a) * (cr + 0.004), roof + wall * 0.62, cz + Math.cos(a) * (cr + 0.004), 0, a, 0);
      }
      const dome = sph(cr * 0.97, P.q ? 24 : 14, Math.PI / 2);
      dome.scale(1, 0.62, 1);
      P.addCupola('turret', dome, cx, roof + wall - 0.005, cz);
      P.add('turretDetail', cylY(0.15, 0.16, 0.025, P.q ? 18 : 12), cx, roof + wall + cr * 0.97 * 0.62 - 0.004, cz);
      cupolaTop = roof + wall + cr * 0.97 * 0.62 + 0.008;
    }
    // the .50: on the X1A2's cupola behind the hatch, on the X1's roof left of the cupola (its foot on the surface)
    const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.60, elev: 0.03, ring: false,
      shield: false, seed: a2 ? 6651 : 6641, working: true });
    mg.name = a2 ? 'x1a2CommanderM2' : 'x1CommanderM2';
    if (a2) mg.position.set(cx, cupolaTop, cz - 0.15);
    else mg.position.set(0.08, roof, -0.62);
    P.turretG.add(mg);
    // the gunner's periscope ahead of the cupola, the loader's hatch (left), the roof ventilator
    const pz = Math.min(T.slopeTop - 0.20, cz + 0.55);
    P.addEquipment('turret', box(0.18, 0.12, 0.22), -0.36, roof + 0.06, pz);
    P.add('turretGlass', box(0.12, 0.05, 0.008), -0.36, roof + 0.07, pz + 0.115);
    P.addCupola('turret', cylY(0.25, 0.26, 0.05, P.q ? 20 : 12), 0.36, roof + 0.025, -0.25);
    P.add('turretDetail', cylY(0.22, 0.23, 0.03, P.q ? 20 : 12), 0.36, roof + 0.065, -0.25);
    P.addEquipment('turret', cylY(0.12, 0.14, 0.05, 12), 0.10, roof + 0.025, T.rear + 0.55);
    for (const s of [-1, 1] as const) {
      if (a2) {
        // three dischargers on each front cheek, firing forward and out (Gaydos' profile, the parade photograph)
        for (let k = 0; k < 3; k++) {
          const z = 0.82 - k * 0.13, y = 0.50 + (k % 2) * 0.06, x = flankX(z, y);
          P.addEquipment('turretDark', box(0.05, 0.10, 0.10), s * (x + 0.02), y, z);
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.036, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.45, s * 0.42, 0),
            s * (x + 0.08), y + 0.05, z + 0.06);
        }
        // the six-tube box on each rear flank: a frame standing on the lower flank, braced to the upper, its six tubes
        // upright in front of it
        const z0 = -0.46, z1 = -1.15, y0 = 0.28, y1 = 0.67, xb = sectionAt(-0.8).hwb;
        P.addEquipment('turret', box(0.05, y1 - y0, z0 - z1), s * (xb + 0.025), (y0 + y1) / 2, (z0 + z1) / 2);
        P.addEquipment('turret', box(xb + 0.05 - flankX(-0.8, y1), 0.03, z0 - z1), s * (flankX(-0.8, y1) + xb + 0.05) / 2, y1 - 0.015, (z0 + z1) / 2);
        for (let k = 0; k < 6; k++) {
          const z = z0 - 0.06 - k * ((z0 - z1 - 0.12) / 5);
          P.addEquipment('turretDark', xform(markSmokeTube(cylZ(0.044, y1 - y0 - 0.06, P.q ? 12 : 8)), 0, 0, 0, -Math.PI / 2, 0, 0),
            s * (xb + 0.095), (y0 + y1) / 2, z);
          P.addEquipment('turretDark', cylY(0.05, 0.05, 0.025, P.q ? 12 : 8), s * (xb + 0.095), y1 - 0.025, z);
          P.addEquipment('turretDark', cylY(0.05, 0.05, 0.025, P.q ? 12 : 8), s * (xb + 0.095), y0 + 0.025, z);
        }
      } else {
        // the X1's two dischargers each side at the turret rear, on a bracket on the lower flank
        const y = 0.34;
        P.addEquipment('turret', box(0.06, 0.08, 0.34), s * (sectionAt(-0.95).hwb + 0.03), y, -0.95);
        for (let k = 0; k < 2; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.035, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.55, s * 0.45, 0),
            s * (sectionAt(-0.95).hwb + 0.08), y + 0.06, -0.87 - k * 0.16);
        }
      }
    }
    // the bustle: the X1's rear bin across its back plate; the raked antenna on the rear
    if (!a2) {
      const back = sectionAt(T.rear);
      P.addEquipment('turret', box(back.hwb * 1.6, 0.24, 0.20), 0, (back.yb + back.top) / 2 - 0.02, T.rear - 0.09);
    }
    const az = T.rear + 0.25, aTop = sectionAt(az).top;
    P.addEquipment('turret', box(0.08, 0.08, 0.08), 0.55, aTop + 0.04, az);
    P.addEquipment('turret', xform(cylY(0.012, 0.015, 2.2, 8), 0, 1.10, 0, 0.35, 0, 0), 0.55, aTop + 0.08, az);
    P.turretG.userData.x1TurretReceipt = { revision: 'x1-266-r2', mark, roofY: roof, front: T.front, rear: T.rear,
      spareLinks: false, flankSmokeBoxes: a2, cupola: a2 ? 'vision-block' : 'dome', cupolaTopY: +cupolaTop.toFixed(3) };
  };
  buildX1TurretFittings();
  yield 'buildX1TurretFittings';

  // ---------------------------------------------------------------- gun --
  const buildX1Gun = (): void => {
    P.gunG.position.set(0, D.trunnion.y, D.trunnion.z);
    const seg = P.q ? 22 : 12;
    const nose = T.front - D.trunnion.z;
    // the mantlet block on the nose, the long sleeve out of it, the coaxial MG's port beside the gun
    P.addGunExtra(box(a2 ? 0.58 : 0.46, a2 ? 0.30 : 0.28, 0.24), 0, 0, nose + 0.08);
    const sleeve0 = nose + 0.20, sleeve1 = 0.50;
    P.addGunExtra(cylZ(a2 ? 0.115 : 0.13, sleeve1 - sleeve0, seg, a2 ? 0.135 : 0.15), 0, 0, (sleeve0 + sleeve1) / 2);
    P.addGunExtraDark(box(0.06, 0.06, 0.04), a2 ? 0.20 : 0.17, -0.04, nose + 0.21);
    const len = D.muzzleHullZ - (D.ring.z + D.trunnion.z);
    if (a2) {
      // the Engesa EC-90 (the Cockerill Mk 3): a plain tube and the wide multi-baffle cage brake (five baffles on four
      // longitudinal bars round the bore)
      const r0 = 0.072, r1 = 0.062, brake = 0.32;
      P.add('gun', cylZ(r1, len - brake - sleeve1, seg, r0), 0, 0, (sleeve1 + len - brake) / 2);
      P.add('gunDark', cylZ(0.066, brake, seg), 0, 0, len - brake / 2);
      for (let k = 0; k < 5; k++) P.add('gun', cylZ(0.118, 0.024, seg), 0, 0, len - 0.012 - k * ((brake - 0.024) / 4));
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        P.add('gun', box(0.024, 0.024, brake), Math.cos(a) * 0.104, Math.sin(a) * 0.104, len - brake / 2);
      }
    } else {
      // the 90 mm D-921: a short tapering tube, the single-baffle brake
      const r0 = 0.075, r1 = 0.058;
      P.add('gun', cylZ(r1, len - 0.16 - sleeve1, seg, r0), 0, 0, (sleeve1 + len - 0.16) / 2);
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
