// Centurion family (release 262; the owner, 2026-10-27: "update/redesign the centurions and strv 81 ... turrets and
// hulls as well based on proper historical references so they will no longer look so chungus"). The Centurion Mk 3,
// the Mk 5/2 and the Swedish Strv 81 (the Mk 5 in Swedish service, Strv 81B) are built here as new geometry from the
// published dimensions (the 1965 User Handbook figures: hull 7.557 m, 3.38 m over the side plates, 3.28 m without,
// 2.94 m high, 0.508 m clearance; 76 mm glacis at 57 deg over a 46 deg nose plate; three Horstmann bogies a side on
// 803 mm wheels, four double and two single return rollers, a 610 mm track), the Commons and museum photographs and the
// sections measured on the registered Strv 81 model (docs/references/tanks/centurion3.md, centurion5_2.md, strv81.md).
// The 3D-print fit of 2026-08 (a pointed wedge nose, a flat crown and broad shelves round a low turret) is gone.
//
// Hull frame: +Z forward, ground y 0, the hull centred on z 0 (front guards 3.78, rear plate -3.72); left is +X. The
// turret ring is 1.88 m across, centred 0.47 m ahead of the hull's middle on the 1.70 m roof. Turret parts are authored
// in the ring frame; the gun's in the trunnion frame (2.075 m high, 1.10 m ahead of the hull's middle).
import { KIT, FITTINGS, orientedSlab, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { mount } from './fittingMount.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { TankProfileBuild } from '../tankBuildCooperation.ts';

const { box, cylX, cylY, cylZ, torus, xform } = KIT;
const slab = orientedSlab;

/** The three builds: the British Mk 3 (20-pdr), the British Mk 5/2 (105 mm L7) and the Swedish Strv 81B (20-pdr). */
export type CenturionMark = 'mk3' | 'mk5_2' | 'strv81';

interface MarkDesign {
  /** Gun length ahead of the trunnion (muzzle face). */
  readonly gunLen: number;
  /** The 20-pdr Type A (plain tube, muzzle counterweight), the Type B (concentric fume extractor) or the L7. */
  readonly gun: '20pdrA' | '20pdrB' | 'l7';
  /** The Mk 5 pattern: the cupola machine-gun mount, no 2-inch bomb thrower, the glacis bin. */
  readonly mk5: boolean;
  readonly swedish: boolean;
}

const MARKS: Readonly<Record<CenturionMark, MarkDesign>> = Object.freeze({
  mk3: { gunLen: 4.95, gun: '20pdrA', mk5: false, swedish: false },
  mk5_2: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false },
  strv81: { gunLen: 4.97, gun: '20pdrB', mk5: true, swedish: true },
});

// ---- hull datums (metres, hull frame) ----
const ROOF_Y = 1.70;
const BELLY_Y = 0.51;
const NOSE_Z = 3.62, NOSE_Y = 1.08;
/** Upper glacis 57 deg from vertical: it meets the roof line 0.92 m behind the nose edge. */
const GLACIS_TOP_Z = 2.66, GLACIS_TOP_Y = 1.66;
const REAR_Z = -3.72;
const TUB_HALF = 0.86;
const BODY_HALF = 1.50;
const SPONSON_FLOOR = 1.44;
const GUARD_Y = 1.52, GUARD_HALF = 1.64;
const SKIRT = { outer: 1.675, t: 0.02, top: 1.535, bot: 0.62, z0: -3.56, z1: 2.95, panels: [-3.56, -1.38, 0.79, 2.95] } as const;
const ENGINE_DECK_Y = 1.765;
const TRACK = { xc: 1.30, w: 0.61 } as const;
const WHEEL_ZS = [2.36, 1.52, 0.44, -0.44, -1.40, -2.24] as const;
const RING = { z: 0.47, y: ROOF_Y, r: 0.94 } as const;
/** Trunnion in the ring frame. */
const TRUNNION = { y: 0.375, z: 0.63 } as const;

const lerpTable = (table: readonly (readonly [number, number])[], z: number): number => {
  if (z <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [z0, y0] = table[i - 1], [z1, y1] = table[i];
    if (z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return table[table.length - 1][1];
};

/** Roof/deck line along the centre: rear plate top, engine deck, fighting compartment roof, upper glacis, nose. */
const DECK: readonly (readonly [number, number])[] = [
  [REAR_Z, 1.70], [-3.40, 1.72], [-0.98, 1.72], [-0.97, ROOF_Y], [2.40, ROOF_Y], [GLACIS_TOP_Z, GLACIS_TOP_Y],
  [NOSE_Z, NOSE_Y],
];
/** Belly line: the rear plate's lower slope, the flat pan, the 46 deg nose plate. */
const BELLY: readonly (readonly [number, number])[] = [
  [REAR_Z, 0.95], [-3.36, BELLY_Y], [3.06, BELLY_Y], [NOSE_Z, NOSE_Y - 0.035],
];

function hullSection(z: number): SolidSection {
  const deck = lerpTable(DECK, z), belly = lerpTable(BELLY, z);
  // The sponsons run out over the tracks only where the deck stands over the track top; ahead of 2.96 the glacis runs
  // down between the front guards at the tub's width (the tracks wrap the idlers there).
  const front = z > 2.965;
  const sx = front ? 0.90 + 0.02 * Math.max(0, (NOSE_Z - z) / (NOSE_Z - 2.98)) : BODY_HALF;
  const sy = front ? Math.min(deck - 0.03, Math.max(belly + 0.03, deck - 0.05)) : SPONSON_FLOOR;
  const c = Math.min(0.06, (sy - belly) / 3), ch = Math.min(0.03, (deck - sy) / 3);
  const tw = Math.min(TUB_HALF, sx - 0.02);
  const ring: SectionPoint[] = [
    [-tw + c, belly], [tw - c, belly], [tw, belly + c], [tw, sy], [sx, sy], [sx, deck - ch], [sx - ch, deck],
    [-(sx - ch), deck], [-sx, deck - ch], [-sx, sy], [-tw, sy], [-tw, belly + c],
  ];
  return { z, ring };
}

function buildHullBody(P: TankBuilderPort): void {
  const zs = [REAR_Z, -3.60, -3.48, -3.36, -1.00, -0.98, -0.97, 0, 2.40, 2.66, 2.80, 2.96, 2.98, 3.06, 3.20, 3.36, 3.50, NOSE_Z];
  P.add('hull', sectionSolid(zs.map(hullSection), { sideQuadDiagonal: 'convex' }));
  // The engine deck stands 6.5 cm proud of the roof from behind the ring to the rear grille; its front lip is raked.
  P.add('hull', slab(
    [-1.47, ROOF_Y - 0.01, -1.04], [1.47, ROOF_Y - 0.01, -1.04], [1.47, ROOF_Y - 0.01, -3.36], [-1.47, ROOF_Y - 0.01, -3.36],
    [-1.47, ENGINE_DECK_Y, -1.10], [1.47, ENGINE_DECK_Y, -1.10], [1.47, ENGINE_DECK_Y, -3.36], [-1.47, ENGINE_DECK_Y, -3.36]));
  // The rear plate's top course falls from the deck to the rear plate (the grille sits in it).
  P.add('hull', slab(
    [-1.47, 1.69, -3.36], [1.47, 1.69, -3.36], [1.47, 1.69, -3.70], [-1.47, 1.69, -3.70],
    [-1.47, ENGINE_DECK_Y, -3.36], [1.47, ENGINE_DECK_Y, -3.36], [1.47, 1.73, -3.70], [-1.47, 1.73, -3.70]));
}

function buildGuards(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    const inner = BODY_HALF - 0.01, mid = (inner + GUARD_HALF) / 2, w = GUARD_HALF - inner;
    // Running track guard, rear corner to the front guard (camouflaged bodywork).
    P.addMudguard('centurion-track-guard', 'hull', box(w, 0.03, 6.62), s * mid, GUARD_Y, -0.39);
    // Front guards over the idlers: a level run, then the mudguard raked down to the nose (x 0.92 .. 1.64).
    const fx0 = s < 0 ? -GUARD_HALF : 0.92, fx1 = s < 0 ? -0.92 : GUARD_HALF;
    P.addMudguard('centurion-front-guard', 'hull', slab(
      [fx0, GUARD_Y - 0.015, 3.30], [fx1, GUARD_Y - 0.015, 3.30], [fx1, GUARD_Y - 0.015, 2.90], [fx0, GUARD_Y - 0.015, 2.90],
      [fx0, GUARD_Y + 0.015, 3.30], [fx1, GUARD_Y + 0.015, 3.30], [fx1, GUARD_Y + 0.015, 2.90], [fx0, GUARD_Y + 0.015, 2.90]));
    P.addMudguard('centurion-front-mudguard', 'hull', slab(
      [fx0, 1.085, 3.78], [fx1, 1.085, 3.78], [fx1, GUARD_Y - 0.065, 3.30], [fx0, GUARD_Y - 0.065, 3.30],
      [fx0, 1.165, 3.78], [fx1, 1.165, 3.78], [fx1, GUARD_Y + 0.015, 3.30], [fx0, GUARD_Y + 0.015, 3.30]));
    // Rubber mud flaps at the guard tips.
    P.hangMudguard('centurion-front-flap', 'hullRubber', box(0.56, 0.22, 0.02), s * 1.30, 1.04, 3.77);
    P.hangMudguard('centurion-rear-flap', 'hullRubber', box(0.56, 0.30, 0.02), s * 1.30, 1.35, -3.69);
    // Rear guard returns down the hull corner (the guard's lip) so the rear run closes onto the rear plate.
    P.add('hull', box(w, 0.20, 0.03), s * mid, GUARD_Y - 0.09, -3.70);
  }
}

/** Bins on the track guards: angular front bins over the idlers and the long low bins beside the fighting compartment. */
function buildGuardBins(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    const ix = s < 0 ? -1.62 : 1.00, ox = s < 0 ? -1.00 : 1.62;
    // Front bin: level lid at 1.665, its face raked down to the guard (the "43 C" plate face on the Dutch Mk 5/2).
    P.add('hullDetail', slab(
      [ix, GUARD_Y + 0.01, 3.24], [ox, GUARD_Y + 0.01, 3.24], [ox, GUARD_Y + 0.01, 2.62], [ix, GUARD_Y + 0.01, 2.62],
      [ix, 1.665, 3.02], [ox, 1.665, 3.02], [ox, 1.665, 2.62], [ix, 1.665, 2.62]));
    P.add('hullDark', box(0.60, 0.012, 0.016), s * 1.31, 1.667, 2.84);
    for (const hz of [2.72, 2.95]) P.add('hullDark', box(0.05, 0.018, 0.05), s * (s < 0 ? 1.58 : 1.04), 1.668, hz);
    // Long bins beside the turret: lids flush with the roof, four doors, hinges along the outer edge.
    const bx0 = s < 0 ? -1.635 : BODY_HALF - 0.02, bx1 = s < 0 ? -(BODY_HALF - 0.02) : 1.635;
    const bw = bx1 - bx0, bxm = (bx0 + bx1) / 2;
    P.add('hullDetail', box(bw, ROOF_Y - GUARD_Y - 0.01, 2.96), bxm, (ROOF_Y + GUARD_Y) / 2 + 0.005, 0.70);
    for (const dz of [-0.60, 0.14, 0.88, 1.62]) P.add('hullDark', box(bw + 0.004, 0.13, 0.012), bxm, 1.615, dz);
    for (const dz of [-0.23, 0.51, 1.25, 1.95]) P.add('hullDark', box(0.012, 0.04, 0.10), s * 1.641, 1.66, dz);
  }
}

/** Three 6 mm side plates a side, clipped to the guard edge, hanging over the upper half of the road wheels. */
function buildSkirts(P: TankBuilderPort): void {
  const xIn = SKIRT.outer - SKIRT.t;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -SKIRT.outer : xIn, x1 = s < 0 ? -xIn : SKIRT.outer;
    for (let k = 0; k < 3; k++) {
      const za = SKIRT.panels[k] + 0.006, zb = SKIRT.panels[k + 1] - 0.006;
      // The front panel's leading edge rakes up to the front guard (its lower corner cut away over the idler).
      const zbLow = k === 2 ? zb - 0.42 : zb;
      P.hangMudguard('centurion-skirt-plate', 'hull', slab(
        [x0, SKIRT.bot, zbLow], [x1, SKIRT.bot, zbLow], [x1, SKIRT.bot, za], [x0, SKIRT.bot, za],
        [x0, SKIRT.top, zb], [x1, SKIRT.top, zb], [x1, SKIRT.top, za], [x0, SKIRT.top, za]));
      // stiffening lip along the hem and the clip lugs on the top edge
      P.add('hullDetail', box(0.012, 0.03, (zbLow - za) - 0.04), s * (SKIRT.outer + 0.004), SKIRT.bot + 0.03, (za + zbLow) / 2);
      for (const f of [0.22, 0.78]) P.add('hullDark', box(0.016, 0.06, 0.06), s * (SKIRT.outer + 0.006), SKIRT.top - 0.06, za + (zb - za) * f);
      // lifting handle
      P.add('hullDetail', xform(torus(0.035, 0.008, 8, 4), 0, 0, 0, 0, 0, Math.PI / 2), s * (SKIRT.outer + 0.009), 1.30, (za + zb) / 2);
    }
    // the top flange laps the guard edge (no air between plate and guard)
    const fx0 = s < 0 ? -SKIRT.outer : GUARD_HALF - 0.03, fx1 = s < 0 ? -(GUARD_HALF - 0.03) : SKIRT.outer;
    P.add('hull', box(fx1 - fx0, 0.02, SKIRT.z1 - SKIRT.z0), (fx0 + fx1) / 2, SKIRT.top - 0.012, (SKIRT.z0 + SKIRT.z1) / 2);
  }
}

function buildRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.25, wheelY: 0.475, xc: TRACK.xc, wheelZs: [...WHEEL_ZS],
    sprocket: { z: -3.12, y: 0.88, r: 0.37 }, idler: { z: 3.27, y: 0.96, r: 0.33 },
    // four double and two single return rollers under the guards (the FAS table); the end rollers single
    rollers: [2.87, 1.90, 0.70, -0.65, -1.80, -2.58].map((z) => ({ z, y: 1.21, r: 0.10 })),
    trackW: TRACK.w, topY: 1.40, paintedEnds: true, coveredTop: true, arms: false,
    contactZF: 2.42, contactZR: -2.30,
  });
}

function buildGlacisAndNose(P: TankBuilderPort, m: MarkDesign): void {
  const glacisPitch = Math.atan2(GLACIS_TOP_Y - NOSE_Y, NOSE_Z - GLACIS_TOP_Z);
  const onGlacis = (t: number): [number, number] => [NOSE_Z - t * (NOSE_Z - GLACIS_TOP_Z), NOSE_Y + t * (GLACIS_TOP_Y - NOSE_Y)];
  // Driver's two-piece hatch at the front right of the roof, two periscopes ahead of it in the glacis top.
  P.addHatch('hull', cylY(0.30, 0.31, 0.05, 20), -0.46, ROOF_Y + 0.02, 2.30);
  P.add('hullDark', box(0.58, 0.012, 0.025), -0.46, ROOF_Y + 0.047, 2.30);
  P.add('hullDetail', box(0.10, 0.05, 0.12), -0.18, ROOF_Y + 0.025, 2.30);
  for (const px of [-0.62, -0.30]) {
    const [pz, py] = onGlacis(0.93);
    KIT.periscope(P, 'hullDetail', px, py + 0.03, pz, 0);
  }
  // Headlights on the glacis beside the front bins, each behind its guard hoop.
  for (const s of [-1, 1]) {
    const [hz, hy] = onGlacis(0.30);
    if (m.swedish) {
      mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.13, r: 0.048,
        shield: true, seed: 8135 + (s > 0 ? 1 : 0) }), s * 0.74, hy + 0.06, hz - 0.06);
    } else {
      KIT.headlight(P, s * 0.74, hy + 0.07, hz - 0.03, -0.18, 0.062);
      P.add('hullDark', xform(torus(0.085, 0.010, 10, 4), 0, 0, 0, Math.PI / 2, 0, 0), s * 0.74, hy + 0.08, hz + 0.03);
    }
  }
  // Tow shackles on the nose edge and the lugs that carry them.
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.12, 0.16, 0.14), s * 0.56, NOSE_Y - 0.10, NOSE_Z - 0.02);
    P.add('hullDark', xform(torus(0.06, 0.018, 10, 6), 0, 0, 0, 0, 0, Math.PI / 2), s * 0.56, NOSE_Y - 0.19, NOSE_Z + 0.03);
  }
  // Glacis stowage: the Mk 3's two link positions; the Mk 5's bin to the left of centre with links; the Strv 81B's
  // link brackets in place of the bin (Svenska Wikipedia, Strv 81B; the KATF 1960 catalogue via the War Thunder forum).
  const [lz, ly] = onGlacis(0.50);
  if (m.swedish) {
    for (const lx of [0.46, 0.12]) KIT.spareTrackStrip(P, 'hull', lx, ly + 0.035, lz, 3, glacisPitch);
  } else if (m.mk5) {
    P.add('hullDetail', xform(box(0.62, 0.20, 0.42), 0, 0.09, 0, glacisPitch, 0, 0), 0.52, ly, lz + 0.04);
    P.add('hullDark', xform(box(0.62, 0.012, 0.03), 0, 0.195, 0.17, glacisPitch, 0, 0), 0.52, ly, lz + 0.04);
    KIT.spareTrackStrip(P, 'hull', 0.0, ly + 0.035, lz - 0.05, 3, glacisPitch);
  } else {
    for (const lx of [0.42, -0.08]) KIT.spareTrackStrip(P, 'hull', lx, ly + 0.035, lz, 3, glacisPitch);
  }
}

function buildEngineDeck(P: TankBuilderPort): void {
  const top = ENGINE_DECK_Y;
  // Two armoured radiator louvre fields behind the ring: dark wells under raked slats.
  for (const s of [-1, 1]) {
    const cx = s * 0.74;
    P.add('hullDark', box(0.92, 0.012, 0.80), cx, top + 0.004, -1.52);
    for (let i = 0; i < 7; i++) P.add('hullDetail', xform(box(0.90, 0.016, 0.075), 0, 0, 0, 0.55, 0, 0), cx, top + 0.022, -1.18 - i * 0.11);
    P.add('hullDetail', box(0.95, 0.03, 0.04), cx, top + 0.02, -1.11);
    P.add('hullDetail', box(0.95, 0.03, 0.04), cx, top + 0.02, -1.94);
  }
  // Engine and gearbox covers: bolted plates with lifting handles.
  for (const [cz, d] of [[-2.42, 0.86], [-3.08, 0.44]] as const) {
    P.add('hull', box(2.10, 0.025, d), 0, top + 0.012, cz);
    for (const hx of [-0.62, 0.62]) P.add('hullDark', torus(0.05, 0.009, 8, 4), hx, top + 0.03, cz);
  }
  for (const fx of [-0.98, 0.98]) P.add('hullDetail', cylY(0.075, 0.075, 0.035, 12), fx, top + 0.017, -2.95);
  // The transverse rear grille over the rear plate.
  P.add('hullDark', box(2.30, 0.01, 0.26), 0, 1.722, -3.53);
  for (let i = 0; i < 5; i++) P.add('hullDetail', xform(box(2.28, 0.012, 0.05), 0, 0, 0, -0.5, 0, 0), 0, 1.735, -3.43 - i * 0.055);
  // Exhaust pipes along the rear guards into fishtail silencers at the rear corners.
  for (const s of [-1, 1]) {
    P.add('hullDark', cylZ(0.065, 1.70, 12), s * 1.56, GUARD_Y + 0.08, -2.35);
    P.add('hullDark', cylZ(0.115, 0.62, 14), s * 1.56, GUARD_Y + 0.12, -3.30);
    P.add('hullDetail', box(0.06, 0.03, 0.20), s * 1.56, GUARD_Y + 0.02, -2.95);
    P.add('hullDark', xform(box(0.20, 0.05, 0.10), 0, 0, 0, 0, 0, 0), s * 1.56, GUARD_Y + 0.12, -3.64);
  }
}

function buildRearPlate(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    // towing hooks and the tail lights
    P.add('hullDetail', box(0.14, 0.18, 0.12), s * 0.62, 0.95, REAR_Z - 0.04);
    P.add('hullDark', xform(torus(0.055, 0.017, 10, 6), 0, 0, 0, 0, 0, Math.PI / 2), s * 0.62, 0.86, REAR_Z - 0.045);
    P.add('hullDetail', box(0.12, 0.08, 0.05), s * 1.18, 1.56, REAR_Z - 0.02);
    P.add('hullGlass', box(0.08, 0.04, 0.012), s * 1.18, 1.56, REAR_Z - 0.036);
    KIT.spareTrackStrip(P, 'hull', s * 0.86, 1.26, REAR_Z - 0.035, 2, Math.PI / 2);
  }
  // infantry telephone box on the right rear
  P.add('hullDetail', box(0.22, 0.26, 0.10), -0.30, 1.38, REAR_Z - 0.05);
  P.add('hullDark', box(0.16, 0.02, 0.012), -0.30, 1.46, REAR_Z - 0.10);
  KIT.towCable(P, [[-1.20, 1.60, REAR_Z - 0.03], [-0.62, 1.30, REAR_Z - 0.06], [0, 1.52, REAR_Z - 0.04],
    [0.62, 1.30, REAR_Z - 0.06], [1.20, 1.60, REAR_Z - 0.03]]);
}

// ---- turret (ring frame: origin at the ring centre on the roof) ----

interface CastStation {
  readonly z: number;
  readonly bottom: number;
  readonly roof: number;
  /** half-widths at the lower wall (y 0.05..0.30), the bin course (0.45), the upper slope (0.75) and the roof edge */
  readonly low: number;
  readonly mid: number;
  readonly up: number;
  readonly edge: number;
}

/** The casting, rear to front: bustle overhang, the body over the ring, the rounded front falling to the mantlet. */
const CASTING: readonly CastStation[] = [
  { z: -2.00, bottom: 0.30, roof: 0.80, low: 0.56, mid: 0.58, up: 0.54, edge: 0.44 },
  { z: -1.86, bottom: 0.27, roof: 0.92, low: 0.70, mid: 0.72, up: 0.66, edge: 0.50 },
  { z: -1.52, bottom: 0.25, roof: 0.96, low: 0.82, mid: 0.84, up: 0.78, edge: 0.56 },
  { z: -1.10, bottom: 0.24, roof: 0.97, low: 0.90, mid: 0.93, up: 0.88, edge: 0.64 },
  { z: -1.07, bottom: -0.04, roof: 0.97, low: 0.90, mid: 0.93, up: 0.88, edge: 0.64 },
  { z: -0.55, bottom: -0.04, roof: 0.97, low: 1.10, mid: 1.15, up: 1.00, edge: 0.76 },
  { z: 0.02, bottom: -0.04, roof: 0.97, low: 1.18, mid: 1.20, up: 1.08, edge: 0.82 },
  { z: 0.40, bottom: -0.04, roof: 0.965, low: 1.14, mid: 1.17, up: 1.05, edge: 0.80 },
  { z: 0.62, bottom: -0.04, roof: 0.93, low: 1.06, mid: 1.10, up: 0.99, edge: 0.74 },
  { z: 0.80, bottom: -0.04, roof: 0.83, low: 0.97, mid: 1.01, up: 0.90, edge: 0.68 },
  { z: 0.94, bottom: -0.03, roof: 0.68, low: 0.86, mid: 0.88, up: 0.78, edge: 0.62 },
  { z: 1.03, bottom: 0.00, roof: 0.52, low: 0.74, mid: 0.74, up: 0.66, edge: 0.58 },
  { z: 1.08, bottom: 0.05, roof: 0.42, low: 0.62, mid: 0.62, up: 0.58, edge: 0.52 },
];

function castSection(st: CastStation): SolidSection {
  const yb = st.bottom, yr = st.roof;
  const yl = Math.min(yb + 0.30, yr - 0.24), ym = Math.min(0.45, yr - 0.16), yu = Math.min(0.75, yr - 0.07);
  const ch = Math.min(0.06, (yl - yb) * 0.4);
  const ring: SectionPoint[] = [
    [-(st.low - ch), yb], [st.low - ch, yb], [st.low, yb + ch], [st.low, yl], [st.mid, ym], [st.up, yu],
    [st.edge, yr - 0.025], [st.edge - 0.07, yr], [-(st.edge - 0.07), yr], [-st.edge, yr - 0.025], [-st.up, yu],
    [-st.mid, ym], [-st.low, yl], [-st.low, yb + ch],
  ];
  return { z: st.z, ring };
}

function buildCasting(P: TankBuilderPort, m: MarkDesign): void {
  // every side edge but the floor reads as one continuous casting
  P.add('turret', sectionSolid(CASTING.map(castSection), { smoothSideEdges: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], centeredSideQuads: true }));
  // Ring collar: the casting's foot on the race.
  P.add('turret', cylY(1.00, 1.03, 0.07, 48), 0, -0.005, 0.02);
  P.add('turretDark', torus(1.015, 0.012, 48, 6), 0, 0.03, 0.02);
  if (!m.mk5) {
    // the Mk 3's welded roof plate: a weld bead round its edge on the casting's crown
    const bead = (a: [number, number], b: [number, number]): void => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      P.add('turretDetail', xform(cylZ(0.012, len, 6), 0, 0, 0, 0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0), (a[0] + b[0]) / 2, 0.972, (a[1] + b[1]) / 2);
    };
    const plate: [number, number][] = [[0.66, 0.50], [0.72, 0.02], [0.66, -0.80], [0.52, -1.50], [-0.52, -1.50], [-0.66, -0.80], [-0.72, 0.02], [-0.66, 0.50]];
    for (let i = 0; i < plate.length; i++) bead(plate[i], plate[(i + 1) % plate.length]);
  }
}

/** Stowage bins round the casting: a long one on the right, two on the left round the loading hatch; lids, hinges. */
function buildTurretBins(P: TankBuilderPort): void {
  const bin = (side: number, z0: number, z1: number, outF: number, outR: number): void => {
    const inner = (z: number): number => {
      // the bin's inner face sits 25 mm into the casting's bin course at each end
      let k = 0;
      while (k < CASTING.length - 2 && CASTING[k + 1].z < z) k++;
      const a = CASTING[k], b = CASTING[k + 1], t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
      return a.mid + (b.mid - a.mid) * t - 0.025;
    };
    const rows: SolidSection[] = [z0, (z0 + z1) / 2, z1].map((z, i) => {
      const o = i === 0 ? outR : i === 2 ? outF : (outF + outR) / 2 + 0.02;
      const n = inner(z);
      const ring: SectionPoint[] = [[n, 0.30], [o - 0.03, 0.30], [o, 0.34], [o, 0.62], [o - 0.05, 0.67], [n, 0.68]];
      return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as SectionPoint).reverse() : ring };
    });
    P.add('turretDetail', sectionSolid(rows));
    // lid seam, hinge strap and hasps
    const zm = (z0 + z1) / 2, oz = (outF + outR) / 2;
    P.add('turretDark', box(0.012, 0.012, z1 - z0 - 0.08), side * (oz - 0.02), 0.672, zm);
    for (const f of [0.25, 0.75]) P.add('turretDark', box(0.02, 0.06, 0.05), side * (oz + 0.011), 0.60, z0 + (z1 - z0) * f);
  };
  bin(-1, -1.22, 0.60, 1.50, 1.42);
  bin(1, -0.12, 0.60, 1.50, 1.46);
  bin(1, -1.22, -0.78, 1.42, 1.40);
  // the left wall's round ammunition loading hatch between the bins
  P.addHatch('turret', xform(cylX(0.20, 0.05, 20), 0, 0, 0), 1.165, 0.44, -0.45);
  P.add('turretDark', xform(torus(0.20, 0.012, 20, 4), 0, 0, 0, 0, 0, Math.PI / 2), 1.19, 0.44, -0.45);
}

/** The rear bustle bin across the turret rear (the Bovington Mk 3's flat-faced box) and its rack rails. */
function buildBustleBin(P: TankBuilderPort): void {
  P.add('turretDetail', slab(
    [-0.86, 0.30, -1.94], [0.86, 0.30, -1.94], [0.86, 0.30, -2.18], [-0.86, 0.30, -2.18],
    [-0.86, 0.74, -1.98], [0.86, 0.74, -1.98], [0.86, 0.72, -2.18], [-0.86, 0.72, -2.18]));
  P.add('turretDark', box(1.66, 0.012, 0.012), 0, 0.725, -2.185);
  for (const hx of [-0.42, 0.42]) P.add('turretDark', box(0.06, 0.08, 0.02), hx, 0.62, -2.19);
  P.add('turretDark', xform(torus(0.07, 0.012, 14, 4), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0.50, -2.19);
}

function buildRoof(P: TankBuilderPort, m: MarkDesign): void {
  // Commander's all-round vision cupola on the right; the Mk 5 pattern carries the machine-gun mount ring.
  const cx = -0.52, cz = -0.52, roofY = 0.965;
  P.addCupola('turret', cylY(0.40, 0.42, 0.10, 32), cx, roofY + 0.04, cz);
  KIT.cupola(P, 'turret', cx, roofY + 0.09, cz, 0.33, 0.13, 8);
  if (m.mk5 && !m.swedish) {
    // the Mk 5's cupola machine-gun mount (a working station: VH.14, every drawn gun works)
    P.addEquipment('turretDark', torus(0.30, 0.016, 28, 6), cx, roofY + 0.235, cz);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag58', tone: 'two-tone', elev: 0.08, scale: 1.02, seed: 5,
      ammo: true, shield: 'low', barrelBridge: true, working: true, ridingCradle: true });
    mg.name = 'centurion5_cupola_machine_gun';
    mg.position.set(cx + 0.06, roofY + 0.24, cz + 0.12);
    mg.rotation.y = 0.08;
    mg.userData.stationVariant = 'centurion-mk5-cupola-mag58-r262';
    mg.userData.forwardFacing = true;
    P.turretG.add(mg);
    P.turretG.userData.centurionRoofMachineGunReceipt = Object.freeze({
      revision: 'centurion-mk5-cupola-mag-r262', weaponClass: 'mag58', supportBucket: 'turretEquipment',
      supportOverlapM: 0.0035, forwardFacing: true, armorEnvelopeExcluded: true,
    });
  } else if (m.swedish) {
    // the Strv 81B's cupola Ksp, right-hand feed (its left can would stand in the cupola's vision blocks)
    mount(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.80, elev: 0.08,
      shield: true, ammo: true, seed: 8120, feed: 'right', working: true, ridingCradle: true }), cx + 0.05, roofY + 0.24, cz + 0.10,
    [0, -0.05, 0]);
  }
  // Loader's hatch on the left: a low round lid on its hinge block.
  P.addHatch('turret', cylY(0.30, 0.31, 0.045, 24), 0.48, roofY + 0.015, -0.48);
  P.add('turretDark', box(0.12, 0.05, 0.09), 0.48, roofY + 0.04, -0.80);
  P.add('turretDark', torus(0.28, 0.010, 24, 4), 0.48, roofY + 0.04, -0.48);
  // Gunner's sight head ahead of the cupola and the loader's periscope.
  P.add('turret', box(0.24, 0.12, 0.30), -0.40, roofY + 0.05, 0.22);
  P.add('turretGlass', box(0.17, 0.05, 0.02), -0.40, roofY + 0.07, 0.375);
  KIT.periscope(P, 'turretDetail', 0.44, roofY + 0.04, -0.02, 0);
  if (!m.mk5) {
    // the Mk 3's 2-inch bomb thrower in the roof's front left
    P.add('turretDark', xform(cylZ(0.035, 0.34, 10), 0, 0, 0, -0.7, 0.2, 0), 0.68, roofY - 0.02, 0.18);
    P.add('turret', cylY(0.08, 0.09, 0.06, 12), 0.68, roofY + 0.0, 0.10);
  }
  // Ventilator dome on the roof's centre line.
  P.add('turret', cylY(0.10, 0.13, 0.06, 16), 0.0, roofY + 0.02, -1.15);
  for (const [lx, lz] of [[0.70, 0.40], [-0.70, 0.40], [0.52, -1.55], [-0.52, -1.55]] as const) {
    KIT.liftEye(P, 'turretDetail', lx, roofY - (lz > 0 ? 0.03 : 0.02), lz, 0);
  }
  // Wireless aerial bases at the bustle's rear corners.
  const aerials: readonly (readonly [number, number])[] = m.swedish ? [[0.66, -1.70], [-0.66, -1.70]] : [[0.60, -1.66], [-0.60, -1.66]];
  aerials.forEach(([ax, az], i) => {
    P.add('turretDetail', cylY(0.04, 0.05, 0.07, 10), ax, roofY - 0.02, az);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: i === 0 ? 2.1 : 1.6, r: 0.011, rake: 0.05,
      seed: (m.swedish ? 8130 : 2620) + i }), ax, roofY + 0.02, az);
  });
}

/** Discharger No. 1 Mk 1: one six-tube block (two rows of three) on each cheek ahead of the bins, its bent guard bar
 * round the muzzles. */
function buildSmokeDischargers(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    const x = s * 1.17, y = 0.50, z = 0.92, yaw = s * 0.35;
    const at = (lx: number, lz: number): [number, number] => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
    // the block's backing plate and the arm welded to the cheek behind it
    P.add('turretDetail', xform(box(0.30, 0.25, 0.08), 0, 0, 0, 0, yaw, 0), x, y, z - 0.05);
    const [ax, az] = at(-s * 0.13, -0.16);
    P.add('turretDetail', xform(box(0.07, 0.12, 0.26), 0, 0, 0, 0, yaw, 0), ax, y - 0.04, az);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const [px, pz] = at((col - 1) * 0.085, 0.04);
      P.add('turretDetail', markSmokeTube(cylZ(0.036, 0.20, 10)), px, y + (row - 0.5) * 0.10, pz, -0.42, yaw, 0);
    }
    // guard: two posts from the plate and a bar across the muzzle faces
    for (const lx of [-0.17, 0.17]) {
      const [gx, gz] = at(lx, 0.06);
      P.add('turretDark', xform(box(0.018, 0.018, 0.22), 0, 0, 0, 0, yaw, 0), gx, y + 0.14, gz);
    }
    const [bx, bz] = at(0, 0.17);
    P.add('turretDark', xform(box(0.36, 0.018, 0.018), 0, 0, 0, 0, yaw, 0), bx, y + 0.14, bz);
  }
}

/** Cast mantlet (moves with the gun), its canvas cover and the coaxial machine gun's port. */
function buildMantlet(P: TankBuilderPort, m: MarkDesign): void {
  // the cast mantlet stands wholly inside its canvas (the cover is the face seen; the casting carries the hit volume)
  const rows: SolidSection[] = [0.06, 0.30, 0.40].map((z, i) => {
    const hw = [0.52, 0.50, 0.40][i], top = [0.25, 0.24, 0.17][i], bot = [-0.19, -0.18, -0.12][i];
    const ring: SectionPoint[] = [[-hw + 0.05, bot], [hw - 0.05, bot], [hw, bot + 0.06], [hw, top - 0.06], [hw - 0.06, top],
      [-(hw - 0.06), top], [-hw, top - 0.06], [-hw, bot + 0.06]];
    return { z, ring };
  });
  P.add('gunMount', sectionSolid(rows, { centeredSideQuads: true, smoothSideEdges: [1, 2, 3, 4, 5, 6, 7] }));
  // canvas mantlet cover: one gathered drape from the casting's gun opening over the mantlet to the gun's root
  const drape = (z: number, hw: number, top: number, bot: number, sag: number): SolidSection => {
    const ring: SectionPoint[] = [];
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const r = Math.pow(Math.abs(c), 0.55) * Math.sign(c), q = Math.pow(Math.abs(sn), 0.55) * Math.sign(sn);
      ring.push([r * hw, (sn > 0 ? q * top : q * bot) - (Math.abs(c) < 0.6 && sn < 0 ? sag : 0)]);
    }
    return { z, ring };
  };
  P.add('gunMountCloth', sectionSolid([
    drape(-0.04, 0.66, 0.34, 0.27, 0.0), drape(0.10, 0.67, 0.33, 0.27, 0.02), drape(0.26, 0.64, 0.31, 0.25, 0.03),
    drape(0.42, 0.55, 0.26, 0.21, 0.02), drape(0.53, 0.30, 0.19, 0.17, 0.0), drape(0.58, 0.17, 0.165, 0.165, 0.0),
  ], { centeredSideQuads: true, smoothSideEdges: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }));
  // the cover's lacing strap round the casting's opening
  P.add('gunMountDark', box(1.30, 0.018, 0.02), 0, 0.31, 0.02);
  P.add('gunMountDark', box(1.30, 0.018, 0.02), 0, -0.255, 0.02);
  // coaxial machine gun (the Mk 3's Besa, the Mk 5's Browning) left of the gun, the sight aperture right
  P.add('gunMountDark', cylZ(0.035, 0.12, 10), 0.32, 0.03, 0.50);
  P.add('gunMountDark', cylZ(0.014, m.mk5 ? 0.24 : 0.18, 8), 0.32, 0.03, 0.64);
  P.add('gunMountDark', box(0.10, 0.06, 0.02), -0.34, 0.10, 0.47);
}

function buildMainGun(P: TankBuilderPort, m: MarkDesign): number {
  const len = m.gunLen;
  if (m.gun === 'l7') {
    // 105 mm L7: the concentric bore evacuator a little behind mid-barrel, a plain muzzle
    KIT.buildGun(P, { len, r: 0.074, evac: 0.50, evacR: 1.55, baseR: 0.15, collar: false });
    muzzleBore(P, { len, r: 0.074 });
  } else if (m.gun === '20pdrB') {
    // 20-pdr Type B: the concentric fume extractor nearer the muzzle than the L7's
    KIT.buildGun(P, { len, r: 0.068, evac: 0.60, evacR: 1.75, baseR: 0.14, collar: false });
    muzzleBore(P, { len, r: 0.068 });
  } else {
    // 20-pdr Type A: no fume extractor, the muzzle counterweight
    KIT.buildGun(P, { len, r: 0.068, evac: null, baseR: 0.14, collar: false, tubeInset: 0.40 });
    P.add('gun', cylZ(0.098, 0.34, P.q ? 28 : 12, 0.090), 0, 0, len - 0.21);
    P.add('gun', cylZ(0.090, 0.06, P.q ? 28 : 12, 0.072), 0, 0, len - 0.41);
    P.add('gun', cylZ(0.094, 0.04, P.q ? 28 : 12, 0.098), 0, 0, len - 0.02);
    muzzleBore(P, { z: len, r: 0.094 });
  }
  return len;
}

/** The three marks' complete build; the caller applies its family's tone kit. */
export function* centurionFamilySteps(P: TankBuilderPort, mark: CenturionMark): TankProfileBuild {
  const m = MARKS[mark];
  buildHullBody(P);
  buildGuards(P);
  yield 'centurionHullBody';
  buildGuardBins(P);
  buildSkirts(P);
  yield 'centurionHullSides';
  buildRunningGear(P);
  yield 'centurionRunningGear';
  buildGlacisAndNose(P, m);
  buildEngineDeck(P);
  buildRearPlate(P);
  yield 'centurionHullFittings';
  P.turretG.position.set(0, RING.y, RING.z);
  P.gunG.position.set(0, TRUNNION.y, TRUNNION.z);
  buildCasting(P, m);
  buildTurretBins(P);
  buildBustleBin(P);
  yield 'centurionTurretCasting';
  buildRoof(P, m);
  buildSmokeDischargers(P);
  yield 'centurionTurretFittings';
  buildMantlet(P, m);
  buildMainGun(P, m);
  P.turretG.userData.centurionGunHousingRig = {
    gunPivotLocal: [0, TRUNNION.y, TRUNNION.z],
    movingHousingBuckets: ['gunMount', 'gunMountDark', 'gunMountCloth'],
  };
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-1.52, 0.48, -0.30], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [1.68, 1.08, 1.40], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [-1.68, 1.08, 1.40], -Math.PI / 2);
  P.topY = 1.0;
}
