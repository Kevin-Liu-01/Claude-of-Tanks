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

/** The builds: the British Mk 3 (20-pdr), the British Mk 5/2 (105 mm L7), the Swedish Strv 81B (20-pdr) and the
 * Israeli Sho't Kal of 1973 (L7, the Continental AVDS-1790-2A conversion, IDF stowage; no Blazer armour) and the British
 * Mk 13 (the Mk 10's L7A2 and glacis appliqué with the L2 infra-red searchlight and the .50 ranging gun). */
export type CenturionMark = 'mk3' | 'mk5_2' | 'strv81' | 'shot_kal' | 'mk13';

interface MarkDesign {
  /** Gun length ahead of the trunnion (muzzle face). */
  readonly gunLen: number;
  /** The 20-pdr Type A (plain tube, muzzle counterweight), the Type B (concentric fume extractor) or the L7. */
  readonly gun: '20pdrA' | '20pdrB' | 'l7';
  /** The Mk 5 pattern: the cupola machine-gun mount, no 2-inch bomb thrower, the glacis bin. */
  readonly mk5: boolean;
  readonly swedish: boolean;
  /** The Sho't Kal: the AVDS-1790 engine deck, IDF racks, pintle Brownings and tall whips. */
  readonly idf: boolean;
  /** The Mk 13: the L2 searchlight, the ranging gun, the thermal sleeve, the glacis appliqué and IR driving lights. */
  readonly late: boolean;
}

const MARKS: Readonly<Record<CenturionMark, MarkDesign>> = Object.freeze({
  mk3: { gunLen: 4.95, gun: '20pdrA', mk5: false, swedish: false, idf: false, late: false },
  mk5_2: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false, idf: false, late: false },
  strv81: { gunLen: 4.97, gun: '20pdrB', mk5: true, swedish: true, idf: false, late: false },
  shot_kal: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false, idf: true, late: false },
  mk13: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false, idf: false, late: true },
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
const SPONSON_FLOOR = 1.47;
const GUARD_Y = 1.52, GUARD_HALF = 1.64;
const SKIRT = { outer: 1.675, t: 0.02, top: 1.535, bot: 0.66, z0: -3.56, z1: 2.95, panels: [-3.56, -1.38, 0.79, 2.95] } as const;
/** The rear plate's hem rises over the sprocket (the registered Strv 81 model: 0.85 m at z -1.8, 1.15 m at -2.8). */
const SKIRT_REAR_HEM: readonly (readonly [number, number])[] = [[-3.556, 1.24], [-2.10, 0.88], [-1.386, SKIRT.bot]];
const ENGINE_DECK_Y = 1.765;
const TRACK = { xc: 1.30, w: 0.61 } as const;
/** Three bogies a side: 0.84 m within a bogie (the wheels 4 cm apart), 0.92 m between them (the photographs). */
const WHEEL_ZS = [2.26, 1.42, 0.50, -0.34, -1.26, -2.10] as const;
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
    // Outboard valance down the front guard's outer edge (the guard is a closed box over the idler).
    const vx0 = s < 0 ? -GUARD_HALF : GUARD_HALF - 0.02, vx1 = s < 0 ? -(GUARD_HALF - 0.02) : GUARD_HALF;
    P.add('hull', slab(
      [vx0, GUARD_Y - 0.28, 3.30], [vx1, GUARD_Y - 0.28, 3.30], [vx1, GUARD_Y - 0.28, 2.90], [vx0, GUARD_Y - 0.28, 2.90],
      [vx0, GUARD_Y, 3.30], [vx1, GUARD_Y, 3.30], [vx1, GUARD_Y, 2.90], [vx0, GUARD_Y, 2.90]));
    P.add('hull', slab(
      [vx0, 1.085, 3.77], [vx1, 1.085, 3.77], [vx1, GUARD_Y - 0.28, 3.30], [vx0, GUARD_Y - 0.28, 3.30],
      [vx0, 1.16, 3.77], [vx1, 1.16, 3.77], [vx1, GUARD_Y, 3.30], [vx0, GUARD_Y, 3.30]));
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
    for (const dz of [-0.60, 0.14, 0.88, 1.62]) P.add('hullDark', box(bw - 0.02, 0.006, 0.014), bxm, ROOF_Y + 0.004, dz);
    for (const dz of [-0.23, 0.51, 1.25, 1.95]) P.add('hullDark', box(0.012, 0.04, 0.10), s * 1.641, 1.66, dz);
  }
}

/** Three 6 mm side plates a side, clipped to the guard edge, hanging over the upper half of the road wheels; the rear
 * plate's hem rises over the sprocket and the front plate's leading edge rakes up to the front guard. */
function buildSkirts(P: TankBuilderPort): void {
  const xIn = SKIRT.outer - SKIRT.t;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -SKIRT.outer : xIn, x1 = s < 0 ? -xIn : SKIRT.outer;
    const plate = (za: number, zb: number, hemA: number, hemB: number, zbLow = zb): void => {
      P.hangMudguard('centurion-skirt-plate', 'hull', slab(
        [x0, hemB, zbLow], [x1, hemB, zbLow], [x1, hemA, za], [x0, hemA, za],
        [x0, SKIRT.top, zb], [x1, SKIRT.top, zb], [x1, SKIRT.top, za], [x0, SKIRT.top, za]));
      // the hem's stiffening lip, following the hem
      const len = Math.hypot(zbLow - za, hemB - hemA);
      P.add('hullDetail', xform(box(0.012, 0.03, len - 0.04), 0, 0, 0, -Math.atan2(hemB - hemA, zbLow - za), 0, 0),
        s * (SKIRT.outer + 0.004), (hemA + hemB) / 2 + 0.03, (za + zbLow) / 2);
    };
    for (let k = 0; k < 3; k++) {
      const za = SKIRT.panels[k] + 0.006, zb = SKIRT.panels[k + 1] - 0.006;
      if (k === 0) {
        const [[, h0], [r1, h1], [, h2]] = SKIRT_REAR_HEM;
        plate(za, r1, h0, h1);
        plate(r1, zb, h1, h2);
      } else {
        plate(za, zb, SKIRT.bot, SKIRT.bot, k === 2 ? zb - 0.42 : zb);
      }
      // clip lugs on the top edge and a lifting handle
      for (const f of [0.22, 0.78]) P.add('hullDark', box(0.016, 0.06, 0.06), s * (SKIRT.outer + 0.006), SKIRT.top - 0.06, za + (zb - za) * f);
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
    contactZF: 2.32, contactZR: -2.16,
  });
}

function buildGlacisAndNose(P: TankBuilderPort, m: MarkDesign): void {
  const glacisPitch = Math.atan2(GLACIS_TOP_Y - NOSE_Y, NOSE_Z - GLACIS_TOP_Z);
  const onGlacis = (t: number): [number, number] => [NOSE_Z - t * (NOSE_Z - GLACIS_TOP_Z), NOSE_Y + t * (GLACIS_TOP_Y - NOSE_Y)];
  // Driver's two-piece hatch at the front right of the roof, two periscopes ahead of it in the glacis top.
  P.addHatch('hull', cylY(0.30, 0.31, 0.05, 20), -0.46, ROOF_Y + 0.02, 2.30);
  P.add('hullDark', box(0.58, 0.012, 0.025), -0.46, ROOF_Y + 0.047, 2.30);
  P.add('hullDetail', box(0.10, 0.05, 0.12), -0.18, ROOF_Y + 0.025, 2.30);
  for (const px of [-0.66, -0.46, -0.26]) {
    const [pz, py] = onGlacis(0.93);
    KIT.periscope(P, 'hullDetail', px, py + 0.03, pz, px * 0.25);
  }
  // Headlights on the glacis beside the front bins, each behind its guard hoop.
  for (const s of [-1, 1]) {
    const [hz, hy] = onGlacis(0.30);
    if (m.swedish) {
      mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.13, r: 0.048,
        shield: true, seed: 8135 + (s > 0 ? 1 : 0) }), s * 0.80, hy + 0.06, hz - 0.06);
    } else if (m.idf) {
      // US-pattern headlight pair (service lamp and blackout marker) in its bent guard
      mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.15, r: 0.058,
        shield: true, seed: 9750 + (s > 0 ? 1 : 0) }), s * 0.80, hy + 0.06, hz - 0.06);
    } else if (m.mk5) {
      // the Mk 5's armoured headlight box: a steel box with its lamp window and hinged visor
      P.add('hullDetail', xform(box(0.26, 0.20, 0.22), 0, 0.10, 0, glacisPitch * 0.5, 0, 0), s * 0.82, hy, hz);
      const lens = cylZ(0.07, 0.02, 14);
      P.add('hullGlass', lens, s * 0.82, hy + 0.11, hz + 0.115);
      P.add('hullDark', box(0.27, 0.025, 0.08), s * 0.82, hy + 0.215, hz + 0.09);
      P.add('hullDark', box(0.016, 0.20, 0.016), s * 0.82 + 0.10, hy + 0.11, hz + 0.13);
      P.add('hullDark', box(0.016, 0.20, 0.016), s * 0.82 - 0.10, hy + 0.11, hz + 0.13);
      if (m.late) {
        // the Mk 13's IR driving lamp behind a mesh guard
        for (let k = 0; k < 4; k++) P.add('hullDark', box(0.22, 0.008, 0.008), s * 0.82, hy + 0.04 + k * 0.045, hz + 0.135);
        for (let k = 0; k < 4; k++) P.add('hullDark', box(0.008, 0.17, 0.008), s * 0.82 - 0.075 + k * 0.05, hy + 0.11, hz + 0.137);
      }
    } else {
      // a 0.2 m lamp standing proud of the glacis on its bracket, behind a guard hoop
      P.add('hullDetail', xform(box(0.08, 0.14, 0.10), 0, 0, 0, glacisPitch, 0, 0), s * 0.82, hy + 0.05, hz);
      KIT.headlight(P, s * 0.82, hy + 0.14, hz + 0.05, -0.10, 0.095);
      P.add('hullDark', xform(torus(0.13, 0.012, 12, 4), 0, 0, 0, Math.PI / 2, 0, 0), s * 0.82, hy + 0.14, hz + 0.20);
      for (const gx of [-0.12, 0.12]) P.add('hullDark', box(0.016, 0.016, 0.16), s * 0.82 + gx, hy + 0.10, hz + 0.12);
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
  if (m.late) {
    // the Mk 10/13's appliqué over the upper glacis between the lamps (its links ride on it)
    const [az, ay] = onGlacis(0.55);
    P.addExternalArmor('hull', xform(box(1.30, 0.05, 0.86), 0, 0, 0, glacisPitch, 0, 0), 0, ay + 0.03, az);
  }
  const lift = m.late ? 0.05 : 0;
  const links = (x: number, n: number, seed: number): void => {
    const run = FITTINGS.spareTrackLinks({ mats: P.mats, links: n, width: 0.58, pitch: 0.165, seed, rotation: [glacisPitch, 0, 0] });
    run.position.set(x, ly + 0.012 + lift, lz);
    P.hullG.add(run);
  };
  if (m.swedish) {
    // the Strv 81B's link brackets in place of the Mk 5's bin (SV, F81)
    links(0.36, 3, 8150);
    links(-0.30, 3, 8151);
  } else if (m.mk5 && !m.late) {
    P.add('hullDetail', xform(box(0.44, 0.20, 0.42), 0, 0.09, 0, glacisPitch, 0, 0), 0.38, ly, lz + 0.04);
    P.add('hullDark', xform(box(0.44, 0.012, 0.03), 0, 0.195, 0.17, glacisPitch, 0, 0), 0.38, ly, lz + 0.04);
    links(-0.28, 3, 5250);
  } else {
    // the Mk 3's two link positions (W); the Mk 13's links side by side on its appliqué (the head-on reference)
    links(0.36, 3, m.late ? 1350 : 3250);
    links(-0.30, 3, m.late ? 1351 : 3251);
  }
}

function buildEngineDeck(P: TankBuilderPort, m: MarkDesign): void {
  if (m.idf) { buildAvdsDeck(P); return; }
  const top = ENGINE_DECK_Y;
  // Two armoured radiator louvre fields behind the ring: dark wells under raked slats.
  for (const s of [-1, 1]) {
    const cx = s * 0.74;
    P.add('hullDark', box(0.92, 0.012, 0.80), cx, top + 0.004, -1.52);
    for (let i = 0; i < 7; i++) P.add('hullDetail', xform(box(0.90, 0.014, 0.065), 0, 0, 0, 0.32, 0, 0), cx, top + 0.010, -1.18 - i * 0.11);
    P.add('hullDetail', box(0.95, 0.024, 0.04), cx, top + 0.012, -1.11);
    P.add('hullDetail', box(0.95, 0.024, 0.04), cx, top + 0.012, -1.94);
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

/** The Sho't Kal's AVDS-1790-2A conversion: the raised M48-style louvred "humpback" over the new engine compartment,
 * the rear louvre grille, and an M48-style box air cleaner on each rear guard where the British exhausts were. The
 * engine deck carries the tow cables. */
function buildAvdsDeck(P: TankBuilderPort): void {
  const top = 1.90;
  // the hump: its raked front rises behind the turret's sweep (the ring's rear reach is z -0.93)
  P.add('hull', slab(
    [-1.20, ENGINE_DECK_Y - 0.01, -1.12], [1.20, ENGINE_DECK_Y - 0.01, -1.12], [1.20, ENGINE_DECK_Y - 0.01, -3.36], [-1.20, ENGINE_DECK_Y - 0.01, -3.36],
    [-1.16, top, -1.42], [1.16, top, -1.42], [1.16, top, -3.30], [-1.16, top, -3.30]));
  // the rear louvre grille raked down from the hump to the rear plate
  P.add('hull', slab(
    [-1.20, 1.70, -3.36], [1.20, 1.70, -3.36], [1.20, 1.70, -3.66], [-1.20, 1.70, -3.66],
    [-1.16, top, -3.30], [1.16, top, -3.30], [1.16, 1.76, -3.66], [-1.16, 1.76, -3.66]));
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6, gz = -3.31 - t * 0.34, gy = top - t * 0.14;
    P.add('hullDark', box(2.20, 0.014, 0.035), 0, gy + 0.008, gz);
  }
  // two longitudinal grille doors over the radiators, and the engine access plate between them
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.80, 0.012, 1.40), s * 0.62, top + 0.004, -2.30);
    for (let i = 0; i < 10; i++) P.add('hullDetail', box(0.80, 0.016, 0.04), s * 0.62, top + 0.018, -1.68 - i * 0.137);
    P.add('hullDetail', box(0.86, 0.03, 0.04), s * 0.62, top + 0.02, -1.58);
    P.add('hullDetail', box(0.86, 0.03, 0.04), s * 0.62, top + 0.02, -3.02);
  }
  P.add('hull', box(0.34, 0.02, 1.50), 0, top + 0.01, -2.30);
  // the deck's sides step down to the guards where the British louvres were
  for (const s of [-1, 1]) {
    // M48-style box air cleaner on the rear guard, its clamped lid and its duct into the deck side
    P.add('hullDetail', box(0.30, 0.34, 0.78), s * 1.50, GUARD_Y + 0.185, -2.62);
    P.add('hullDark', box(0.31, 0.012, 0.79), s * 1.50, GUARD_Y + 0.34, -2.62);
    for (const cz of [-2.40, -2.84]) P.add('hullDark', box(0.04, 0.06, 0.05), s * 1.656, GUARD_Y + 0.28, cz);
    P.add('hullDark', cylX(0.07, 0.10, 12), s * 1.30, GUARD_Y + 0.26, -2.62);
    // the tow cable along the deck's edge
    KIT.towCable(P, [[s * 1.04, top + 0.03, -1.60], [s * 1.06, top + 0.03, -2.40], [s * 1.04, top + 0.03, -3.20]]);
  }
}

/** Hull equipment by mark: the auxiliary charging engine's silencer box on the left rear guard (British and Swedish
 * Meteor tanks), pioneer tools in clamps on the left bins' face, the gun's travel lock folded on the rear deck's edge,
 * the convoy light box on the rear plate, and the Strv 81's blackout light boxes on its front guard bins. */
function buildHullKit(P: TankBuilderPort, m: MarkDesign): void {
  if (!m.idf) {
    P.add('hullDark', box(0.16, 0.14, 0.44), 1.56, GUARD_Y + 0.10, -1.55);
    P.add('hullDark', cylZ(0.035, 0.40, 10), 1.56, GUARD_Y + 0.08, -1.98);
    P.add('hullDetail', box(0.18, 0.02, 0.46), 1.56, GUARD_Y + 0.175, -1.55);
  }
  // shovel, pick helve and crowbar on the left bins' lids (outside the turret's sweep, under the bustle), in clamps
  KIT.shovelTool(P, 1.57, ROOF_Y + 0.022, 1.05, 1.0);
  P.add('hullWood', cylZ(0.020, 0.95, 8), 1.53, ROOF_Y + 0.021, 0.10);
  P.add('hullDark', box(0.18, 0.03, 0.05), 1.53, ROOF_Y + 0.02, 0.60);
  P.add('hullDark', cylZ(0.014, 1.10, 6), 1.60, ROOF_Y + 0.015, -0.40);
  for (const cz of [-0.70, -0.10, 0.45, 0.80, 1.35]) P.add('hullDark', box(0.14, 0.012, 0.04), 1.56, ROOF_Y + 0.006, cz);
  // the travel lock folded down on the rear deck's edge (the gun rides in it on the march: the Strv 81B photograph)
  if (!m.swedish) {
    for (const s of [-1, 1]) P.add('hullDark', xform(box(0.05, 0.05, 0.42), 0, 0, 0, -0.15, s * 0.28, 0), s * 0.10, 1.77, -3.30);
    P.add('hullDark', xform(torus(0.09, 0.02, 12, 6), 0, 0, 0, 0, 0, 0), 0, 1.78, -3.12);
    P.add('hullDetail', box(0.30, 0.05, 0.08), 0, 1.75, -3.50);
  }
  // convoy light box at the rear plate's centre
  P.add('hullDetail', box(0.18, 0.12, 0.08), 0, 1.60, REAR_Z - 0.03);
  P.add('hullGlass', box(0.10, 0.04, 0.012), 0, 1.60, REAR_Z - 0.072);
  P.add('hullDark', box(0.20, 0.02, 0.10), 0, 1.67, REAR_Z - 0.04);
  if (m.swedish) {
    // blackout light boxes on the front guard bins' faces
    for (const s of [-1, 1]) {
      P.add('hullDetail', xform(box(0.16, 0.10, 0.08), 0, 0, 0, -0.62, 0, 0), s * 1.42, 1.60, 3.12);
      P.add('hullGlass', xform(box(0.10, 0.03, 0.012), 0, 0, 0, -0.62, 0, 0), s * 1.42, 1.615, 3.155);
    }
  }
}

function buildRearPlate(P: TankBuilderPort, m: MarkDesign): void {
  for (const s of [-1, 1]) {
    // towing hooks; the British tail lights, or the Sho't's US-pattern lights in their round guards
    P.add('hullDetail', box(0.14, 0.18, 0.12), s * 0.62, 0.95, REAR_Z - 0.04);
    P.add('hullDark', xform(torus(0.055, 0.017, 10, 6), 0, 0, 0, 0, 0, Math.PI / 2), s * 0.62, 0.86, REAR_Z - 0.045);
    if (m.idf) {
      P.add('hullDetail', box(0.16, 0.12, 0.05), s * 1.18, 1.56, REAR_Z - 0.02);
      P.add('hullGlass', box(0.10, 0.04, 0.012), s * 1.18, 1.58, REAR_Z - 0.036);
      P.add('hullDark', xform(cylZ(0.09, 0.07, 14), 0, 0, 0, 0, 0, 0), s * 1.18, 1.56, REAR_Z - 0.035);
      KIT.spareTrackStrip(P, 'hull', s * 0.70, 1.30, REAR_Z - 0.035, 3, Math.PI / 2);
    } else {
      P.add('hullDetail', box(0.12, 0.08, 0.05), s * 1.18, 1.56, REAR_Z - 0.02);
      P.add('hullGlass', box(0.08, 0.04, 0.012), s * 1.18, 1.56, REAR_Z - 0.036);
      KIT.spareTrackStrip(P, 'hull', s * 0.86, 1.26, REAR_Z - 0.035, 2, Math.PI / 2);
    }
  }
  if (m.swedish) {
    // the Strv 81B's long stowage box across the end of the rear deck, over the transverse grille (the overhead
    // photograph), on two feet
    P.add('hullDetail', box(2.06, 0.34, 0.32), 0, 1.92, -3.52);
    P.add('hullDark', box(2.02, 0.012, 0.30), 0, 2.092, -3.52);
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.10, 0.06, 0.30), s * 0.80, 1.745, -3.52);
      P.add('hullDark', box(0.06, 0.06, 0.03), s * 0.55, 1.98, -3.686);
    }
  }
  if (m.idf) {
    // the AVDS conversion's two louvred grille boxes on the upper rear plate (the 1978 rear photograph)
    for (const s of [-1, 1]) {
      P.add('hull', box(0.62, 0.52, 0.10), s * 0.58, 1.46, REAR_Z - 0.04);
      P.add('hullDark', box(0.54, 0.44, 0.012), s * 0.58, 1.46, REAR_Z - 0.092);
      for (let i = 0; i < 6; i++) P.add('hullDetail', xform(box(0.54, 0.012, 0.04), 0, 0, 0, -0.6, 0, 0), s * 0.58, 1.27 + i * 0.075, REAR_Z - 0.09);
    }
  }
  // infantry telephone box on the right rear
  if (!m.idf && !m.swedish) {
    P.add('hullDetail', box(0.22, 0.26, 0.10), -0.30, 1.38, REAR_Z - 0.05);
    P.add('hullDark', box(0.16, 0.02, 0.012), -0.30, 1.46, REAR_Z - 0.10);
  }
  if (!m.swedish && !m.idf) {
    KIT.towCable(P, [[-1.20, 1.60, REAR_Z - 0.03], [-0.62, 1.30, REAR_Z - 0.06], [0, 1.52, REAR_Z - 0.04],
      [0.62, 1.30, REAR_Z - 0.06], [1.20, 1.60, REAR_Z - 0.03]]);
  }
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
  { z: -2.00, bottom: 0.30, roof: 0.82, low: 0.58, mid: 0.60, up: 0.57, edge: 0.48 },
  { z: -1.86, bottom: 0.27, roof: 0.92, low: 0.72, mid: 0.74, up: 0.70, edge: 0.58 },
  { z: -1.52, bottom: 0.25, roof: 0.96, low: 0.84, mid: 0.86, up: 0.82, edge: 0.66 },
  { z: -1.10, bottom: 0.24, roof: 0.97, low: 0.92, mid: 0.95, up: 0.92, edge: 0.80 },
  { z: -1.07, bottom: -0.012, roof: 0.97, low: 0.92, mid: 0.95, up: 0.92, edge: 0.80 },
  { z: -0.55, bottom: -0.012, roof: 0.97, low: 1.10, mid: 1.15, up: 1.08, edge: 0.93 },
  { z: 0.02, bottom: -0.012, roof: 0.97, low: 1.18, mid: 1.20, up: 1.14, edge: 0.97 },
  { z: 0.40, bottom: -0.012, roof: 0.965, low: 1.16, mid: 1.19, up: 1.13, edge: 0.96 },
  { z: 0.62, bottom: -0.012, roof: 0.95, low: 1.12, mid: 1.16, up: 1.09, edge: 0.92 },
  { z: 0.80, bottom: -0.012, roof: 0.88, low: 1.07, mid: 1.10, up: 1.01, edge: 0.82 },
  { z: 0.94, bottom: -0.012, roof: 0.76, low: 1.00, mid: 1.02, up: 0.94, edge: 0.78 },
  { z: 1.03, bottom: -0.012, roof: 0.64, low: 0.92, mid: 0.93, up: 0.86, edge: 0.74 },
  { z: 1.10, bottom: 0.03, roof: 0.54, low: 0.82, mid: 0.82, up: 0.76, edge: 0.68 },
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
  // the walls and shoulders read as one continuous casting; the roof plate's edge stays a crisp line
  P.add('turret', sectionSolid(CASTING.map(castSection), { smoothSideEdges: [1, 2, 3, 4, 5, 9, 10, 11, 12, 13], centeredSideQuads: true }));
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

/** The casting's half-width at station z and height y (between its lower wall, bin course and upper slope points). */
function castingHalfWidth(z: number, y: number): number {
  let k = 0;
  while (k < CASTING.length - 2 && CASTING[k + 1].z < z) k++;
  const a = CASTING[k], b = CASTING[k + 1], t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
  const at = (st: CastStation): number => {
    const ym = Math.min(0.45, st.roof - 0.16), yu = Math.min(0.75, st.roof - 0.07);
    if (y <= ym) return st.mid;
    return st.mid + (st.up - st.mid) * Math.min(1, (y - ym) / (yu - ym));
  };
  return at(a) + (at(b) - at(a)) * t;
}

/** Stowage bins round the casting from the bin course up to the shoulder: a long one on the right, two on the left round
 * the loading hatch; chamfered lids, hinges and hasps. Each inner face sits 2 cm into the casting at its height. */
function buildTurretBins(P: TankBuilderPort): void {
  const BOT = 0.30, TOP = 0.74;
  const bin = (side: number, z0: number, z1: number, outF: number, outR: number): void => {
    const rows: SolidSection[] = [z0, (z0 + z1) / 2, z1].map((z, i) => {
      const o = i === 0 ? outR : i === 2 ? outF : (outF + outR) / 2 + 0.015;
      const nb = castingHalfWidth(z, BOT) - 0.02, nt = castingHalfWidth(z, TOP) - 0.02;
      const ring: SectionPoint[] = [[nb, BOT], [o - 0.03, BOT], [o, BOT + 0.04], [o, TOP - 0.06], [o - 0.06, TOP], [nt, TOP]];
      return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as SectionPoint).reverse() : ring };
    });
    P.add('turretDetail', sectionSolid(rows));
    const zm = (z0 + z1) / 2, oz = (outF + outR) / 2;
    P.add('turretDark', box(0.012, 0.012, z1 - z0 - 0.08), side * (oz - 0.03), TOP + 0.002, zm);
    for (const f of [0.25, 0.75]) P.add('turretDark', box(0.02, 0.06, 0.05), side * (oz + 0.006), TOP - 0.10, z0 + (z1 - z0) * f);
  };
  bin(-1, -1.30, 0.72, 1.54, 1.44);
  bin(1, -0.21, 0.72, 1.54, 1.50);
  bin(1, -1.30, -0.69, 1.48, 1.44);
  // the left wall's round ammunition loading hatch between the bins, seated on the casting
  // a cast boss standing out of the bulging wall (its back buried in the casting at every height it spans) carries the lid
  const hx = castingHalfWidth(-0.45, 0.45);
  P.add('turret', cylX(0.18, 0.12, 24), hx - 0.03, 0.45, -0.45);
  P.addHatch('turret', cylX(0.155, 0.03, 24), hx + 0.04, 0.45, -0.45);
  P.add('turretDark', xform(torus(0.165, 0.010, 24, 4), 0, 0, 0, 0, 0, Math.PI / 2), hx + 0.032, 0.45, -0.45);
  P.add('turretDark', box(0.05, 0.10, 0.06), hx + 0.035, 0.45, -0.64);
}

/** The rear bustle bin across the turret rear (the Bovington Mk 3's tall flat-faced box) up to the roof line. */
function buildBustleBin(P: TankBuilderPort): void {
  P.add('turretDetail', slab(
    [-0.86, 0.28, -1.92], [0.86, 0.28, -1.92], [0.86, 0.28, -2.30], [-0.86, 0.28, -2.30],
    [-0.86, 0.90, -1.92], [0.86, 0.90, -1.92], [0.86, 0.88, -2.30], [-0.86, 0.88, -2.30]));
  P.add('turretDark', box(1.66, 0.012, 0.012), 0, 0.885, -2.305);
  P.add('turretDark', box(1.66, 0.012, 0.012), 0, 0.30, -2.305);
  for (const hx of [-0.42, 0.42]) P.add('turretDark', box(0.06, 0.08, 0.02), hx, 0.78, -2.31);
  P.add('turretDark', xform(torus(0.07, 0.012, 14, 4), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0.58, -2.31);
}

function buildRoof(P: TankBuilderPort, m: MarkDesign): void {
  // Commander's all-round vision cupola on the right; the Mk 5 pattern carries the machine-gun mount ring.
  const cx = -0.52, cz = -0.52, roofY = 0.965;
  P.addCupola('turret', cylY(0.40, 0.42, 0.10, 32), cx, roofY + 0.04, cz);
  KIT.cupola(P, 'turret', cx, roofY + 0.09, cz, 0.33, 0.13, 8);
  if (m.mk5 && !m.swedish && !m.idf) {
    // the cupola machine-gun mount of the Mk 5 and later marks (a working station: VH.14, every drawn gun works)
    P.addEquipment('turretDark', torus(0.30, 0.016, 28, 6), cx, roofY + 0.235, cz);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag58', tone: 'two-tone', elev: 0.08, scale: 1.02, seed: 5,
      ammo: true, shield: 'low', barrelBridge: true, working: true, ridingCradle: true });
    mg.name = m.late ? 'centurion13_cupola_machine_gun' : 'centurion5_cupola_machine_gun';
    mg.position.set(cx + 0.06, roofY + 0.24, cz + 0.12);
    mg.rotation.y = 0.08;
    mg.userData.stationVariant = m.late ? 'centurion-mk13-cupola-mag58-r262' : 'centurion-mk5-cupola-mag58-r262';
    mg.userData.forwardFacing = true;
    P.turretG.add(mg);
    P.turretG.userData.centurionRoofMachineGunReceipt = Object.freeze({
      revision: 'centurion-mk5-cupola-mag-r262', weaponClass: 'mag58', supportBucket: 'turretEquipment',
      supportOverlapM: 0.0035, forwardFacing: true, armorEnvelopeExcluded: true,
    });
  } else if (m.idf) {
    // the Sho't Kal's roof guns as the Yad La-Shiryon Alef carries them: the commander's .50 M2 on the cupola and a
    // loader's .30 on a pintle at his hatch (1973 tanks carried a .30 or a .50 at the cupola, KM)
    mount(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.95, elev: 0.10,
      shield: false, ammo: true, seed: 9710, feed: 'right', working: true, ridingCradle: true }), cx + 0.06, roofY + 0.24, cz + 0.12,
    [0, 0.06, 0]);
    P.add('turretDark', cylY(0.035, 0.045, 0.16, 10), 0.80, roofY + 0.07, -0.28);
    mount(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.86, elev: 0.06,
      shield: false, ammo: true, seed: 9711, feed: 'left', working: true, ridingCradle: true }), 0.80, roofY + 0.15, -0.28,
    [0, -0.12, 0]);
  } else if (m.swedish) {
    // the Strv 81B's cupola Ksp, right-hand feed (its left can would stand in the cupola's vision blocks)
    mount(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.80, elev: 0.08,
      shield: true, ammo: true, seed: 8120, feed: 'right', working: true, ridingCradle: true }), cx + 0.05, roofY + 0.24, cz + 0.10,
    [0, -0.05, 0]);
  }
  if (m.mk5 && !m.swedish && !m.idf && !m.late) {
    // the Delft Mk 5/2's searchlight: a box with its louvred front and mesh guard, on a bracket at the right front corner
    const lx = -0.86, ly = roofY + 0.14, lz = 0.58;
    P.add('turretDark', box(0.10, 0.14, 0.12), lx + 0.06, roofY - 0.01, lz - 0.02);
    P.addEquipment('turretDetail', box(0.40, 0.30, 0.30), lx, ly + 0.06, lz);
    P.add('turretGlass', box(0.32, 0.22, 0.012), lx, ly + 0.06, lz + 0.152);
    for (let k = 0; k < 5; k++) P.add('turretDark', box(0.34, 0.010, 0.012), lx, ly - 0.05 + k * 0.055, lz + 0.162);
    P.add('turretDark', box(0.42, 0.03, 0.03), lx, ly + 0.225, lz);
  }
  if (m.late) {
    // the Mk 13's L2 infra-red/white-light searchlight: a 0.56 m drum beside the gun at its height, outboard of the
    // mantlet on the tank's left (to the right of the gun seen from ahead: the owner's Mk 13 head-on reference; owner
    // 2026-10-27: "the light should be next to the gun ... on left side"), on an armoured arm out of the left cheek,
    // ahead of the left discharger block
    const sx = 1.11, sy = TRUNNION.y + 0.10, sz = 1.40, r = 0.28;
    P.addEquipment('turretDetail', cylZ(r, 0.34, 32, r * 0.92), sx, sy, sz);
    P.add('turretGlass', cylZ(r * 0.86, 0.02, 32), sx, sy, sz + 0.175);
    P.add('turretDark', xform(torus(r * 0.93, 0.022, 32, 6), 0, 0, 0, 0, 0, 0), sx, sy, sz + 0.18);
    for (let k = 0; k < 6; k++) P.add('turretDark', box(0.012, r * 1.7, 0.012), sx + (k - 2.5) * 0.08, sy, sz + 0.192);
    // cooling fins on the drum's back and the arm from the cheek under it
    for (let k = 0; k < 4; k++) P.add('turretDetail', cylZ(r * (0.78 - k * 0.08), 0.025, 24), sx, sy, sz - 0.19 - k * 0.035);
    P.add('turretDetail', box(0.10, 0.10, 0.40), sx - 0.10, sy - r - 0.03, sz - 0.18);
    P.add('turretDetail', box(0.20, 0.16, 0.14), castingHalfWidth(1.06, 0.30) - 0.02, sy - r - 0.03, 1.04);
    P.add('turretDetail', box(0.30, 0.08, 0.10), (castingHalfWidth(1.06, 0.30) + sx - 0.10) / 2, sy - r - 0.03, 1.10);
    P.add('turretDark', cylZ(0.020, 0.40, 8), sx - 0.18, sy - 0.12, sz - 0.30);
  }
  // Loader's hatch on the left: a low round lid on its hinge block.
  P.addHatch('turret', cylY(0.30, 0.31, 0.045, 24), 0.48, roofY + 0.015, -0.48);
  P.add('turretDark', box(0.12, 0.05, 0.09), 0.48, roofY + 0.04, -0.80);
  P.add('turretDark', torus(0.28, 0.010, 24, 4), 0.48, roofY + 0.04, -0.48);
  // Gunner's sight head ahead of the cupola and the loader's periscope.
  P.add('turret', box(0.24, 0.12, 0.30), -0.40, roofY + 0.05, 0.22);
  P.add('turretGlass', box(0.17, 0.05, 0.02), -0.40, roofY + 0.07, 0.375);
  KIT.periscope(P, 'turretDetail', 0.44, roofY + 0.04, -0.02, 0);
  // the loader's and the gunner's forward vision periscopes at the roof's front edge, in armoured hoods
  for (const [vx, vz, ry] of [[0.42, 0.52, 0.12], [-0.12, 0.56, -0.05]] as const) {
    P.add('turret', box(0.20, 0.07, 0.16), vx, roofY + 0.02, vz - 0.02);
    KIT.periscope(P, 'turretDetail', vx, roofY + 0.065, vz, ry);
  }
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
    const h = m.idf ? (i === 0 ? 2.9 : 2.6) : i === 0 ? 2.1 : 1.6;
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.011, rake: 0.05,
      seed: (m.swedish ? 8130 : m.idf ? 9720 : 2620) + i }), ax, roofY + 0.02, az);
  });
}

/** The Sho't's IDF racks: an open basket round the bustle bin and a jerrycan cage at the turret's right rear. */
function buildIdfTurretRacks(P: TankBuilderPort): void {
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.86, d: 0.46, h: 0.32, fill: 0.55, rails: 3, seed: 9730 }),
    0, 0.32, -2.55);
  // the basket hangs on arms from the bin's lower edge
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.05, 0.34), s * 0.80, 0.33, -2.40);
    P.add('turretDark', xform(box(0.04, 0.04, 0.42), 0, 0, 0, 0.75, 0, 0), s * 0.80, 0.52, -2.42);
  }
  // jerrycan cage: a welded bar frame on two brackets off the casting
  const cx = -1.08, cz = -1.50, w = 0.30, d = 0.52, h = 0.52, y0 = 0.33;
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    P.add('turretDark', box(0.025, h, 0.025), cx + dx * w / 2, y0 + h / 2, cz + dz * d / 2);
  }
  for (const yy of [y0 + 0.012, y0 + h * 0.55, y0 + h]) {
    for (const dz of [-1, 1]) P.add('turretDark', box(w, 0.02, 0.02), cx, yy, cz + dz * d / 2);
    for (const dx of [-1, 1]) P.add('turretDark', box(0.02, 0.02, d), cx + dx * w / 2, yy, cz);
  }
  P.add('turretDark', box(w, 0.012, d), cx, y0 + 0.004, cz);
  for (const bz of [-0.16, 0.16]) {
    P.add('turretDark', box(0.32, 0.06, 0.06), cx + 0.21, y0 + 0.06, cz + bz);
    P.add('turretDark', box(0.06, 0.24, 0.06), cx + 0.15, y0 + 0.17, cz + bz);
  }
  mount(P, 'turret', FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 9740 }), cx, y0 + 0.02, cz, [0, Math.PI / 2, 0]);
}

/** Discharger No. 1 Mk 1: one six-tube block (two rows of three) at each front corner of the casting, facing forward and
 * a little outward (the head-on references), its guard bar round the muzzles. Owner 2026-10-27 ("add smoke canisters at
 * front"): the Sho't Kal carries them too. */
function buildSmokeDischargers(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    const yaw = s * 0.30, y = 0.56, z = 1.00;
    const x = s * (castingHalfWidth(z - 0.04, y) + 0.06);
    const at = (lx: number, lz: number): [number, number] => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
    // the mounting plate welded to the cheek and its bracket arm back into the casting
    const [ax, az] = at(-s * 0.06, -0.12);
    P.add('turretDetail', xform(box(0.24, 0.12, 0.20), 0, 0, 0, 0, yaw, 0), ax, y - 0.10, az);
    P.add('turretDetail', xform(box(0.34, 0.28, 0.08), 0, 0, 0, 0, yaw, 0), x, y, z - 0.02);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const [px, pz] = at((col - 1) * 0.10, 0.08);
      P.add('turretDetail', markSmokeTube(cylZ(0.042, 0.22, 12)), px, y + (row - 0.5) * 0.115, pz, -0.38, yaw, 0);
      P.add('turretDark', cylZ(0.030, 0.012, 10), px + Math.sin(yaw) * 0.10, y + (row - 0.5) * 0.115 + 0.04, pz + Math.cos(yaw) * 0.10 * 0.93, -0.38, yaw, 0);
    }
    for (const lx of [-0.19, 0.19]) {
      const [gx, gz] = at(lx, 0.10);
      P.add('turretDark', xform(box(0.018, 0.018, 0.24), 0, 0, 0, 0, yaw, 0), gx, y + 0.16, gz);
    }
    const [bx, bz] = at(0, 0.22);
    P.add('turretDark', xform(box(0.40, 0.018, 0.018), 0, 0, 0, 0, yaw, 0), bx, y + 0.16, bz);
  }
}

/** The mantlet, all moving with the gun (owner 2026-10-27: "mantlets need to be wider, better"; the Hum3D Mk 3 and the
 * Mk 13 head-on references): a wide cast block across most of the turret face (1.60 m), standing 15 cm proud of it, its
 * face convex in plan, the gun's boss in the middle, the coaxial gun's port on the left, the sight's hooded aperture on
 * the right and two lifting eyes on top; a canvas dust seal laced round its rim where it enters the casting. The Sho't
 * Kal wears the green canvas cover of its photographs over the same block, its searchlight on top. */
function buildMantlet(P: TankBuilderPort, m: MarkDesign): void {
  const block = (z: number, hw: number, top: number, bot: number): SolidSection => {
    const ring: SectionPoint[] = [];
    for (let k = 0; k < 16; k++) {
      const a = -Math.PI / 2 + (k / 16) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      ring.push([Math.pow(Math.abs(c), 0.3) * Math.sign(c) * hw, Math.pow(Math.abs(sn), 0.3) * Math.sign(sn) * (sn > 0 ? top : -bot)]);
    }
    return { z, ring };
  };
  // the casting: square-shouldered in section, its face rounding forward to the boss
  P.add('gunMount', sectionSolid([
    block(0.05, 0.80, 0.30, -0.21), block(0.40, 0.80, 0.30, -0.21), block(0.52, 0.78, 0.29, -0.205),
    block(0.58, 0.74, 0.27, -0.195), block(0.62, 0.64, 0.23, -0.17), block(0.645, 0.46, 0.17, -0.13),
  ], { centeredSideQuads: true, smoothSideEdges: [...Array(16).keys()] }));
  // the gun's boss: a raised collar the tube leaves through
  P.add('gunMount', cylZ(0.175, 0.12, 24, 0.215), 0, 0, 0.69);
  P.add('gunMountDark', xform(torus(0.18, 0.012, 24, 4), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, 0.745);
  // the coaxial gun's port (the Mk 3's Besa, the Mk 5's Browning) and the sight's hooded aperture
  P.add('gunMount', cylZ(0.055, 0.08, 12, 0.07), 0.40, 0.04, 0.64);
  P.add('gunMountDark', cylZ(0.018, m.mk5 ? 0.28 : 0.22, 8), 0.40, 0.04, 0.76);
  P.add('gunMount', box(0.20, 0.06, 0.12), -0.40, 0.19, 0.62);
  P.add('gunMountDark', box(0.14, 0.05, 0.012), -0.40, 0.15, 0.636);
  if (m.late) {
    // the Mk 13's .50 ranging gun in its armoured sleeve on the mantlet's upper left
    P.add('gunMount', box(0.16, 0.13, 0.22), 0.26, 0.20, 0.62);
    P.add('gunMountDark', cylZ(0.030, 0.42, 10, 0.034), 0.26, 0.20, 0.92);
    P.add('gunMountDark', cylZ(0.040, 0.20, 12), 0.26, 0.20, 0.80);
  }
  for (const lx of [-0.52, 0.52]) {
    P.add('gunMountDark', xform(torus(0.045, 0.014, 10, 6), 0, 0.04, 0, Math.PI / 2, 0, 0), lx, 0.30, 0.30);
    P.add('gunMount', box(0.09, 0.03, 0.06), lx, 0.30, 0.30);
  }
  // the canvas dust seal laced round the block's rim where it enters the casting
  P.add('gunMountCloth', sectionSolid([block(0.12, 0.835, 0.335, -0.245), block(0.22, 0.83, 0.33, -0.24)],
    { centeredSideQuads: true, smoothSideEdges: [...Array(16).keys()] }));
  for (let k = 0; k < 9; k++) {
    const t = -1 + (2 * k) / 8;
    P.add('gunMountDark', cylZ(0.010, 0.11, 6), t * 0.72, 0.335, 0.17);
  }
  if (m.idf) {
    // the green canvas cover over the block, sagging between its lacing points, its sleeve strapped to the barrel
    const drape = (z: number, hw: number, top: number, bot: number, sag: number): SolidSection => {
      const ring: SectionPoint[] = [];
      for (let k = 0; k < 16; k++) {
        const a = -Math.PI / 2 + (k / 16) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        const r = Math.pow(Math.abs(c), 0.45) * Math.sign(c), q = Math.pow(Math.abs(sn), 0.45) * Math.sign(sn);
        ring.push([r * hw, (sn > 0 ? q * top : q * bot) - (Math.abs(c) < 0.6 && sn < 0 ? sag : 0)]);
      }
      return { z, ring };
    };
    P.add('gunMountCloth', sectionSolid([
      drape(0.24, 0.85, 0.35, 0.235, 0.0), drape(0.42, 0.85, 0.34, 0.235, 0.02), drape(0.56, 0.82, 0.32, 0.225, 0.03),
      drape(0.63, 0.70, 0.28, 0.20, 0.02), drape(0.68, 0.40, 0.21, 0.18, 0.0), drape(0.72, 0.18, 0.16, 0.16, 0.0),
    ], { centeredSideQuads: true, smoothSideEdges: [...Array(16).keys()] }));
    for (const [fz, fy, fw] of [[0.60, 0.20, 1.30], [0.64, 0.04, 1.36], [0.61, -0.12, 1.22]] as const) {
      P.add('gunMountCloth', xform(cylX(0.020, fw, 8), 0, 0, 0), 0, fy, fz);
    }
    P.add('gunMountCloth', cylZ(0.100, 0.30, 14, 0.13), 0, 0, 0.86);
    for (const sz of [0.76, 0.98]) P.add('gunMountDark', cylZ(0.112 + (0.98 - sz) * 0.08, 0.025, 14), 0, 0, sz);
    // the canvas-covered searchlight on its bracket over the cover (Kahalani's Alef, EN)
    P.add('gunMountDark', box(0.08, 0.10, 0.16), 0, 0.39, 0.52);
    P.add('gunMountCloth', cylZ(0.165, 0.30, 16, 0.18), 0, 0.57, 0.57);
    P.add('gunMountCloth', cylZ(0.16, 0.035, 16, 0.168), 0, 0.57, 0.735);
    P.add('gunMountDark', xform(torus(0.165, 0.010, 16, 4), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0.57, 0.72);
  }
}

function buildMainGun(P: TankBuilderPort, m: MarkDesign): number {
  const len = m.gunLen;
  if (m.gun === 'l7') {
    // 105 mm L7: the concentric bore evacuator a little behind mid-barrel, a plain muzzle
    KIT.buildGun(P, { len, r: 0.074, evac: 0.45, evacR: 1.55, baseR: 0.15, collar: false, sleeve: m.late });
    muzzleBore(P, { len, r: 0.074 });
  } else if (m.gun === '20pdrB') {
    // 20-pdr Type B: a short, nearly cylindrical fume-extractor can 47 % along (the Strv 81B photographs)
    KIT.buildGun(P, { len, r: 0.068, evac: null, baseR: 0.14, collar: false });
    const seg = P.q ? 28 : 12, ez = len * 0.47;
    P.add('gun', cylZ(0.128, 0.40, seg), 0, 0, ez);
    P.add('gun', cylZ(0.128, 0.06, seg, 0.080), 0, 0, ez - 0.23);
    P.add('gun', cylZ(0.080, 0.06, seg, 0.128), 0, 0, ez + 0.23);
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
  buildEngineDeck(P, m);
  buildRearPlate(P, m);
  buildHullKit(P, m);
  yield 'centurionHullFittings';
  P.turretG.position.set(0, RING.y, RING.z);
  P.gunG.position.set(0, TRUNNION.y, TRUNNION.z);
  buildCasting(P, m);
  buildTurretBins(P);
  buildBustleBin(P);
  if (m.idf) buildIdfTurretRacks(P);
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
  if (m.idf) {
    // the company chevron, point down, on each middle side plate; the tank's number on the basket's sides
    // (a 'number' decal draws the tank's tactical number; any other kind draws its own text)
    P.decal('hull', 'chevron', 'V', 0.55, [SKIRT.outer + 0.004, 1.10, -0.30], Math.PI / 2);
    P.decal('hull', 'chevron', 'V', 0.55, [-SKIRT.outer - 0.004, 1.10, -0.30], -Math.PI / 2);
  } else {
    P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-1.52, 0.48, -0.30], -Math.PI / 2);
  }
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [1.68, 1.08, 1.40], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [-1.68, 1.08, 1.40], -Math.PI / 2);
  P.topY = 1.0;
}
