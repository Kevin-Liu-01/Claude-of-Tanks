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
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { addMissionAttachmentReceiver } from '../missionAttachmentReceiver.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { TankProfileBuild } from '../tankBuildCooperation.ts';

const { box, cylX, cylY, cylZ, torus, xform } = KIT;
const slab = orientedSlab;

/** The builds: the British Mk 3 (20-pdr), the British Mk 5/2 (105 mm L7), the Swedish Strv 81B (20-pdr) and the
 * Israeli Sho't Kal of 1973 (L7, the Continental AVDS-1790-2A conversion, IDF stowage; no Blazer armour) and the British
 * Mk 13 (the Mk 10's L7A2 and glacis appliqué with the L2 infra-red searchlight and the .50 ranging gun); the owner's
 * second batch (2026-10-27): the Swedish Strv 105 prototype, the South African Olifant Mk 2 and the British Mk 5 AVRE; and
 * (2026-10-28) the Australian Mk 5/1 of the Vietnam war. */
export type CenturionMark = 'mk3' | 'mk5_2' | 'strv81' | 'shot_kal' | 'mk13' | 'strv105' | 'olifant_mk2' | 'avre' | 'mk5_1_aus';

interface MarkDesign {
  /** Gun length ahead of the trunnion (muzzle face). */
  readonly gunLen: number;
  /** The 20-pdr Type A (plain tube, muzzle counterweight), the Type B (concentric fume extractor), the L7, or the AVRE's
   * 165 mm L9A1 demolition gun. */
  readonly gun: '20pdrA' | '20pdrB' | 'l7' | '165';
  /** The Mk 5 pattern: the cupola machine-gun mount, no 2-inch bomb thrower, the glacis bin. */
  readonly mk5: boolean;
  readonly swedish: boolean;
  /** The Sho't Kal: the AVDS-1790 engine deck, IDF racks, pintle Brownings and tall whips. */
  readonly idf: boolean;
  /** The Mk 13: the L2 searchlight, the ranging gun, the thermal sleeve, the glacis appliqué and IR driving lights. */
  readonly late: boolean;
  /** A later conversion's own kit: the Strv 105 prototype (the Strv 104's reactive armour and its thermal sight), the
   * Olifant Mk 2 (a box turret of modular armour, torsion bars, armoured skirts) or the Mk 5 AVRE (the demolition gun,
   * the dozer blade, the Gulf War's reactive armour) or the Australian Mk 5/1 (the Vietnam fit: skirts off, the rear
   * fuel tank, spare road wheels on the glacis, the infra-red searchlight on the mantlet, the .50 ranging gun, baskets). */
  readonly kit: 'none' | 'strv105' | 'olifant' | 'avre' | 'aus';
  /** The laced canvas cover over a narrower mantlet block, the cast cheeks showing either side of it (the Dutch Mk 5/2,
   * the Sho't Kal, the Strv 104/105, the Australian Mk 5/1, the Bovington and Swiss Mk 3 and the Strv 81 photographs). */
  readonly cover: boolean;
  /** The casting's nose stops 12 cm short of the long nose (CASTING_BARE): the Mk 3 and Strv 81 (their registered
   * models' noses), the Mk 13 and the AVRE (their bare mantlets standing proud). */
  readonly shortNose: boolean;
}

/** The Dutch Mk 5/2: the British Mk 5 pattern with the L7 and no conversion kit. */
const isMk52 = (m: MarkDesign): boolean => m.kit === 'none' && m.mk5 && !m.swedish && !m.idf && !m.late;

const MARKS: Readonly<Record<CenturionMark, MarkDesign>> = Object.freeze({
  mk3: { gunLen: 4.95, gun: '20pdrA', mk5: false, swedish: false, idf: false, late: false, kit: 'none', cover: true, shortNose: true },
  mk5_2: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false, idf: false, late: false, kit: 'none', cover: true, shortNose: false },
  strv81: { gunLen: 4.97, gun: '20pdrB', mk5: true, swedish: true, idf: false, late: false, kit: 'none', cover: true, shortNose: true },
  shot_kal: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false, idf: true, late: false, kit: 'none', cover: true, shortNose: false },
  mk13: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false, idf: false, late: true, kit: 'none', cover: false, shortNose: true },
  strv105: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: true, idf: false, late: false, kit: 'strv105', cover: true, shortNose: false },
  olifant_mk2: { gunLen: 4.74, gun: 'l7', mk5: true, swedish: false, idf: false, late: false, kit: 'olifant', cover: false, shortNose: false },
  avre: { gunLen: 2.15, gun: '165', mk5: true, swedish: false, idf: false, late: false, kit: 'avre', cover: false, shortNose: true },
  mk5_1_aus: { gunLen: 4.97, gun: '20pdrB', mk5: true, swedish: false, idf: false, late: false, kit: 'aus', cover: true, shortNose: false },
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
// the side plates cover the top 40 % of the road wheels (the Bovington Mk 13 right-side photograph; the critics, 2026-10-28)
const SKIRT = { outer: 1.675, t: 0.02, top: 1.535, bot: 0.56, z0: -3.56, z1: 2.95, panels: [-3.56, -1.38, 0.79, 2.95] } as const;
/** The rear plate's hem rises over the sprocket (the registered Strv 81 model: 0.85 m at z -1.8, 1.15 m at -2.8). */
const skirtRearHem = (bot: number): readonly (readonly [number, number])[] =>
  [[-3.556, 1.24], [-2.10, Math.max(0.88, bot + 0.04)], [-1.386, bot]];
/** The Strv 104/105's side plates stop at the road wheels' tops (the Strv 104 side photograph). */
const STRV105_SKIRT_BOT = 0.80;
const ENGINE_DECK_Y = 1.765;
const TRACK = { xc: 1.30, w: 0.61 } as const;
/** Three bogies a side: 0.84 m within a bogie (the wheels 4 cm apart), 0.92 m between them (the photographs). */
const WHEEL_ZS = [2.26, 1.42, 0.50, -0.34, -1.26, -2.10] as const;
const RING = { z: 0.47, y: ROOF_Y, r: 0.94 } as const;
/** Trunnion in the ring frame. */
const TRUNNION = { y: 0.375, z: 0.63 } as const;
/** The Olifant Mk 2's gun leaves its box turret at mid-height, 0.38 m under the roof (its side photograph); the cast
 * turrets' 0.375. */
const trunnionY = (m: MarkDesign): number => (m.kit === 'olifant' ? 0.555 : TRUNNION.y);

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
  // The engine deck stands 6.5 cm proud of the roof from behind the ring to the rear plate's top course; its front lip
  // is raked.
  P.add('hull', slab(
    [-1.47, ROOF_Y - 0.01, -1.04], [1.47, ROOF_Y - 0.01, -1.04], [1.47, ROOF_Y - 0.01, -3.36], [-1.47, ROOF_Y - 0.01, -3.36],
    [-1.47, ENGINE_DECK_Y, -1.10], [1.47, ENGINE_DECK_Y, -1.10], [1.47, ENGINE_DECK_Y, -3.36], [-1.47, ENGINE_DECK_Y, -3.36]));
  // The rear plate's top course falls from the deck to the rear plate (the grille sits in it).
  P.add('hull', slab(
    [-1.47, 1.69, -3.36], [1.47, 1.69, -3.36], [1.47, 1.69, -3.70], [-1.47, 1.69, -3.70],
    [-1.47, ENGINE_DECK_Y, -3.36], [1.47, ENGINE_DECK_Y, -3.36], [1.47, 1.73, -3.70], [-1.47, 1.73, -3.70]));
}

function buildGuards(P: TankBuilderPort, bow = true): void {
  // The guards and the kits' bodywork (the dozer, the fuel tank, the grille boxes) are painted non-armour
  // (hullFixedPaintedBodywork, kept at every LOD), the skirts the track guards (hullTrackGuardL/R, where the hull numbers
  // sit): the combat anatomy's hull box is the hull's own, not the guards' edge. Without `bow` (the Olifant's hooded
  // bow guards stand there) the raked front mudguards, their valances and flaps are left off.
  for (const s of [-1, 1]) {
    const inner = BODY_HALF - 0.01, mid = (inner + GUARD_HALF) / 2, w = GUARD_HALF - inner;
    // Running track guard, rear corner to the front guard (camouflaged bodywork).
    P.addMudguard('centurion-track-guard', 'hullFixedPaintedBodywork', box(w, 0.03, 6.62), s * mid, GUARD_Y, -0.39);
    // Front guards over the idlers: a level run, then the mudguard raked down to the nose (x 0.92 .. 1.64).
    const fx0 = s < 0 ? -GUARD_HALF : 0.92, fx1 = s < 0 ? -0.92 : GUARD_HALF;
    P.addMudguard('centurion-front-guard', 'hullFixedPaintedBodywork', slab(
      [fx0, GUARD_Y - 0.015, 3.30], [fx1, GUARD_Y - 0.015, 3.30], [fx1, GUARD_Y - 0.015, 2.90], [fx0, GUARD_Y - 0.015, 2.90],
      [fx0, GUARD_Y + 0.015, 3.30], [fx1, GUARD_Y + 0.015, 3.30], [fx1, GUARD_Y + 0.015, 2.90], [fx0, GUARD_Y + 0.015, 2.90]));
    // Outboard valance down the front guard's outer edge (the guard is a closed box over the idler).
    const vx0 = s < 0 ? -GUARD_HALF : GUARD_HALF - 0.02, vx1 = s < 0 ? -(GUARD_HALF - 0.02) : GUARD_HALF;
    P.add('hullFixedPaintedBodywork', slab(
      [vx0, GUARD_Y - 0.28, 3.30], [vx1, GUARD_Y - 0.28, 3.30], [vx1, GUARD_Y - 0.28, 2.90], [vx0, GUARD_Y - 0.28, 2.90],
      [vx0, GUARD_Y, 3.30], [vx1, GUARD_Y, 3.30], [vx1, GUARD_Y, 2.90], [vx0, GUARD_Y, 2.90]));
    if (bow) {
      P.addMudguard('centurion-front-mudguard', 'hullFixedPaintedBodywork', slab(
        [fx0, 1.085, 3.78], [fx1, 1.085, 3.78], [fx1, GUARD_Y - 0.065, 3.30], [fx0, GUARD_Y - 0.065, 3.30],
        [fx0, 1.165, 3.78], [fx1, 1.165, 3.78], [fx1, GUARD_Y + 0.015, 3.30], [fx0, GUARD_Y + 0.015, 3.30]));
      P.add('hullFixedPaintedBodywork', slab(
        [vx0, 1.085, 3.77], [vx1, 1.085, 3.77], [vx1, GUARD_Y - 0.28, 3.30], [vx0, GUARD_Y - 0.28, 3.30],
        [vx0, 1.16, 3.77], [vx1, 1.16, 3.77], [vx1, GUARD_Y, 3.30], [vx0, GUARD_Y, 3.30]));
      // Rubber mud flaps at the guard tips.
      P.hangMudguard('centurion-front-flap', 'hullRubber', box(0.56, 0.22, 0.02), s * 1.30, 1.04, 3.77);
    }
    P.hangMudguard('centurion-rear-flap', 'hullRubber', box(0.56, 0.30, 0.02), s * 1.30, 1.35, -3.69);
    // Rear guard returns down the hull corner (the guard's lip) so the rear run closes onto the rear plate.
    P.add('hullFixedPaintedBodywork', box(w, 0.20, 0.03), s * mid, GUARD_Y - 0.09, -3.70);
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

/** Three 6 mm side plates a side, clipped to the guard edge, hanging over the upper half of the road wheels (`bot`, the
 * hem's height); the rear plate's hem rises over the sprocket and the front plate's leading edge rakes up to the front
 * guard. */
function buildSkirts(P: TankBuilderPort, bot: number = SKIRT.bot): void {
  const xIn = SKIRT.outer - SKIRT.t;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -SKIRT.outer : xIn, x1 = s < 0 ? -xIn : SKIRT.outer;
    const plate = (za: number, zb: number, hemA: number, hemB: number, zbLow = zb): void => {
      P.hangMudguard('centurion-skirt-plate', s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', slab(
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
        const [[, h0], [r1, h1], [, h2]] = skirtRearHem(bot);
        plate(za, r1, h0, h1);
        plate(r1, zb, h1, h2);
      } else {
        plate(za, zb, bot, bot, k === 2 ? zb - 0.42 : zb);
      }
      // clip lugs on the top edge and a lifting handle
      for (const f of [0.22, 0.78]) P.add('hullDark', box(0.016, 0.06, 0.06), s * (SKIRT.outer + 0.006), SKIRT.top - 0.06, za + (zb - za) * f);
      P.add('hullDetail', xform(torus(0.035, 0.008, 8, 4), 0, 0, 0, 0, 0, Math.PI / 2), s * (SKIRT.outer + 0.009), 1.30, (za + zb) / 2);
    }
    // the top flange laps the guard edge (no air between plate and guard)
    const fx0 = s < 0 ? -SKIRT.outer : GUARD_HALF - 0.03, fx1 = s < 0 ? -(GUARD_HALF - 0.03) : SKIRT.outer;
    P.add('hullFixedPaintedBodywork', box(fx1 - fx0, 0.02, SKIRT.z1 - SKIRT.z0), (fx0 + fx1) / 2, SKIRT.top - 0.012, (SKIRT.z0 + SKIRT.z1) / 2);
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
    if (m.kit === 'aus') {
      // the spare road wheels take the glacis: a low armoured lamp on each front bin's raked face, under the barrel's
      // sweep at full depression (a box on the lid held the gun level over the bow quarters)
      const facePitch = Math.atan2(1.665 - (GUARD_Y + 0.01), 3.24 - 3.02);
      P.add('hullDetail', xform(box(0.22, 0.12, 0.10), 0, 0, 0, -facePitch, 0, 0), s * 1.22, 1.62, 3.15);
      P.add('hullGlass', markVehicleNightLens(cylZ(0.055, 0.02, 14), 'headlight'), s * 1.22, 1.615, 3.205);
      P.add('hullDark', xform(box(0.23, 0.02, 0.06), 0, 0, 0, -facePitch, 0, 0), s * 1.22, 1.685, 3.17);
    } else if (m.kit === 'strv105') {
      // the Strv 104's lamp pairs on the front bins' lids, clear of the glacis tiles (the Bovington Strv 104)
      mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.13, r: 0.048,
        shield: true, seed: 1055 + (s > 0 ? 1 : 0) }), s * 1.22, 1.725, 2.84);
    } else if (m.swedish) {
      mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.13, r: 0.048,
        shield: true, seed: 8135 + (s > 0 ? 1 : 0) }), s * 0.80, hy + 0.06, hz - 0.06);
    } else if (m.idf) {
      // US-pattern headlight pair (service lamp and blackout marker) in its bent guard
      mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.15, r: 0.058,
        shield: true, seed: 9750 + (s > 0 ? 1 : 0) }), s * 0.80, hy + 0.06, hz - 0.06);
    } else if (m.mk5) {
      // the Mk 5's armoured headlight box: a steel box with its lamp window and hinged visor
      P.add('hullDetail', xform(box(0.26, 0.20, 0.22), 0, 0.10, 0, glacisPitch * 0.5, 0, 0), s * 0.82, hy, hz);
      P.add('hullGlass', markVehicleNightLens(cylZ(0.07, 0.02, 14), 'headlight'), s * 0.82, hy + 0.11, hz + 0.115);
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
  if (m.kit !== 'none') { buildGlacisKit(P, m, onGlacis, glacisPitch); return; }
  // Glacis stowage: the Mk 3's two link positions; the Mk 5's bin to the left of centre with links; the Strv 81B's
  // link brackets in place of the bin (Svenska Wikipedia, Strv 81B; the KATF 1960 catalogue via the War Thunder forum).
  const [lz, ly] = onGlacis(0.50);
  if (m.late) {
    // the Mk 10/13's appliqué plate over the upper glacis (its links ride on it)
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

type V3 = [number, number, number];
const vAdd = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const vCross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vUnit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A box laid on a face: centred on `c`, `w` along `a`, `h` along `b`, `t` along the outward normal `n` from the face
 * (its inner side on the face). 'era' parts are external armour (their cluster's plate), 'dark' and 'detail' trim. */
function faceBox(P: TankBuilderPort, owner: 'hull' | 'turret', kind: 'era' | 'dark' | 'detail', c: V3, a: V3, b: V3, n: V3,
  w: number, h: number, t: number): void {
  const quad = (lift: number): V3[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
    vAdd(vAdd(vAdd(c, a, i * w / 2), b, j * h / 2), n, lift));
  const geo = slab(...quad(0), ...quad(t));
  if (kind === 'era') P.addExternalArmor(owner, geo);
  else P.add(owner === 'hull' ? (kind === 'dark' ? 'hullDark' : 'hullDetail') : (kind === 'dark' ? 'turretDark' : 'turretDetail'), geo);
}

/** The later kits' glacis. The Strv 105 keeps the Strv 104's three courses of FFV tiles across the upper glacis (the
 * Bovington Strv 104; the prototype's photograph shows them kept); the Olifant Mk 2 the Mk 1B's bolted composite
 * appliqué; the AVRE the Gulf War's two cassette slabs either side of the centre line (the "Fosgene" photograph), its
 * dozer ram's bracket between them. Each glacis course's outward face is the glacis normal. */
function buildGlacisKit(P: TankBuilderPort, m: MarkDesign, onGlacis: (t: number) => [number, number], pitch: number): void {
  const nY = Math.cos(pitch), nZ = Math.sin(pitch);
  // the glacis plane's frame: across, up the slope, outward
  const across: V3 = [1, 0, 0], up: V3 = [0, Math.sin(pitch), -Math.cos(pitch)], out: V3 = [0, nY, nZ];
  const onPlane = (x: number, t: number, lift: number): V3 => {
    const [z, y] = onGlacis(t);
    return [x, y + nY * lift, z + nZ * lift];
  };
  if (m.kit === 'strv105') {
    // the Strv 104's FFV tiles: two courses of three thick boxes a side, the courses angled in a V that converges on the
    // centre line low on the plate, each tile seated on the plate with its bolt (the Bovington Strv 104; the critic,
    // 2026-10-28: the four thin slabs read as bare plate)
    P.destructibleCluster('strv105_glacis_era', () => {
      for (const s of [-1, 1]) {
        const th = s * 0.30, a: V3 = [Math.cos(th), Math.sin(th) * up[1], Math.sin(th) * up[2]];
        const b: V3 = [-Math.sin(th), Math.cos(th) * up[1], Math.cos(th) * up[2]];
        for (const t of [0.22, 0.58]) {
          for (let k = 0; k < 3; k++) {
            const c = vAdd(onPlane(s * 0.06, t, 0), a, s * (0.16 + k * 0.30));
            faceBox(P, 'hull', 'era', c, a, b, out, 0.28, 0.26, 0.12);
            faceBox(P, 'hull', 'dark', vAdd(c, out, 0.12), a, b, out, 0.035, 0.035, 0.014);
          }
        }
      }
    });
  } else if (m.kit === 'aus') {
    // the Mk 5/1's extra glacis plate, and two spare road wheels on studs side by side on it (the owner's reference;
    // carried in Vietnam)
    const [az, ay] = onGlacis(0.55);
    P.addExternalArmor('hull', xform(box(1.30, 0.05, 0.86), 0, 0, 0, pitch, 0, 0), 0, ay + nY * 0.027, az + nZ * 0.027);
    const seg = P.q ? 28 : 16;
    for (const s of [-1, 1]) {
      const c = onPlane(s * 0.41, 0.50, 0.11);
      P.add('hullRubber', cylY(0.38, 0.38, 0.10, seg), c[0], c[1], c[2], pitch, 0, 0);
      P.add('hullDetail', cylY(0.30, 0.30, 0.11, seg), c[0], c[1], c[2], pitch, 0, 0);
      const hub = onPlane(s * 0.41, 0.50, 0.17);
      P.add('hullDark', cylY(0.10, 0.12, 0.05, 12), hub[0], hub[1], hub[2], pitch, 0, 0);
      const stud = onPlane(s * 0.41, 0.50, 0.06);
      P.add('hullDark', cylY(0.04, 0.04, 0.10, 8), stud[0], stud[1], stud[2], pitch, 0, 0);
    }
  } else if (m.kit === 'olifant') {
    // the Mk 1B's bolted composite pack over the upper glacis, inboard of the armoured headlight boxes (the Armed Forces
    // Day photograph)
    const [az, ay] = onGlacis(0.45);
    P.addExternalArmor('hull', xform(box(1.30, 0.10, 0.78), 0, 0, 0, pitch, 0, 0), 0, ay + nY * 0.052, az + nZ * 0.052);
    for (const t of [0.15, 0.75]) {
      const [bz, by] = onGlacis(t);
      for (const bx of [-0.56, -0.20, 0.20, 0.56]) P.add('hullDark', cylY(0.026, 0.026, 0.02, 8), bx, by + nY * 0.11, bz + nZ * 0.11, pitch, 0, 0);
    }
  } else {
    // the AVRE: two continuous panels side by side over the upper glacis, beside the dozer ram's bracket on the centre
    // line and inboard of the headlight boxes, following the plate with a lip over its top edge (the "Fosgene"
    // photograph), their bolts in two rows
    P.destructibleCluster('centurion5_avre_glacis_era', () => {
      for (const s of [-1, 1]) {
        const t0 = 0.08, t1 = 0.88, xi = s * 0.10, xb = s * 0.66, xt = s * 0.74, th = 0.08;
        P.addExternalArmor('hull', slab(
          onPlane(xi, t0, 0), onPlane(xb, t0, 0), onPlane(xt, t1, 0), onPlane(xi, t1, 0),
          onPlane(xi, t0 + 0.01, th), onPlane(xb, t0 + 0.01, th), onPlane(xt, t1 + 0.03, th), onPlane(xi, t1 + 0.03, th)));
        for (const t of [0.25, 0.70]) {
          for (const f of [0.2, 0.5, 0.8]) faceBox(P, 'hull', 'dark', onPlane(xi + (xb - xi) * f, t, th), across, up, out, 0.03, 0.03, 0.014);
        }
        faceBox(P, 'hull', 'dark', onPlane((xi + xb) / 2, 0.48, th), across, up, out, Math.abs(xb - xi) - 0.06, 0.014, 0.008);
      }
    });
    const [rz, ry] = onGlacis(0.48);
    P.add('hullDetail', xform(box(0.18, 0.14, 0.22), 0, 0, 0, pitch, 0, 0), 0, ry + nY * 0.07, rz + nZ * 0.07);
  }
}

/** The AVRE's dozer (the FV4019 Centurion dozer blade, T.B. Pearson; the Duxford, "Fosgene", 02 BA 33 and 11 BA 46
 * photographs; the critics, 2026-10-28: the flat slab read wrong; 2026-10-29: a flat plate leaning back, no push arms;
 * then: from the side an open fishtail, ribs on the face): a plain mouldboard in one shallow arc the full blade height,
 * 0.17 m deep off its chord, its cutting edge 0.15 m ahead and its top rolled 0.10 m forward into a lip under a box top
 * rail; solid end plates, their backs straight from 0.55 m deep at the foot to 0.30 m at the top; a box beam, gussets
 * and a cross beam behind the face; carried ahead of the nose on two inner push arms pinned to the nose plate's sides,
 * tied by a cross tube over the nose, and two outer arms just outside the track belts from the end plates back to the
 * front idlers' hubs, lifted by a ram from the glacis bracket. (The Gulf War fit carries no fascine cradle: the Fosgene
 * photograph.) Hull frame. */
function buildDozer(P: TankBuilderPort): void {
  const W = 1.69, y0 = 0.60, y1 = 1.60, zb = 3.93, cut = 0.15, depth = 0.12, lip = 0.10, th = 0.03;
  const faceZ = (y: number): number => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    return zb + cut * (1 - t) - depth * Math.sin(Math.PI * t) + lip * Math.max(0, (t - 0.82) / 0.18) ** 2;
  };
  // the mouldboard, in eight courses following its curve
  const N = 8;
  for (let i = 0; i < N; i++) {
    const ya = y0 + (y1 - y0) * i / N, yc = y0 + (y1 - y0) * (i + 1) / N, za = faceZ(ya), zc = faceZ(yc);
    P.add('hullFixedPaintedBodywork', slab(
      [-W, ya, za], [W, ya, za], [W, ya, za - th], [-W, ya, za - th],
      [-W, yc, zc], [W, yc, zc], [W, yc, zc - th], [-W, yc, zc - th]));
  }
  // the cutting edge, standing proud of the face
  P.add('hullDark', box(2 * W, 0.07, 0.10), 0, y0 + 0.02, faceZ(y0) - 0.02);
  // the box beam behind the lip
  const yBeam = y1 - 0.16;
  P.add('hullFixedPaintedBodywork', box(2 * W - 0.06, 0.16, 0.16), 0, yBeam, faceZ(yBeam) - th - 0.08);
  // the box top rail along the lip
  P.add('hullFixedPaintedBodywork', box(2 * W, 0.08, 0.16), 0, y1 + 0.03, faceZ(y1) - 0.07);
  // solid end plates: their fronts follow the face, their backs run straight from 0.55 m deep at the foot to 0.30 m at
  // the top
  const backZ = (y: number): number => faceZ(y0) - 0.55 + (faceZ(y1) - 0.30 - faceZ(y0) + 0.55) * (y - y0) / (y1 - y0);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -W : W - 0.03, x1 = s < 0 ? -(W - 0.03) : W;
    for (let k = 0; k < N; k++) {
      const ya = y0 + (y1 - y0) * k / N, yc = y0 + (y1 - y0) * (k + 1) / N;
      P.add('hullFixedPaintedBodywork', slab(
        [x0, ya, faceZ(ya)], [x1, ya, faceZ(ya)], [x1, ya, backZ(ya)], [x0, ya, backZ(ya)],
        [x0, yc, faceZ(yc)], [x1, yc, faceZ(yc)], [x1, yc, backZ(yc)], [x0, yc, backZ(yc)]));
    }
  }
  // gussets on the mouldboard's back, seated 5 mm into it in eight courses (their chords stay 2 cm behind its face)
  for (const rx of [-1.40, -0.84, -0.28, 0.28, 0.84, 1.40]) {
    for (let k = 0; k < 8; k++) {
      const ya = y0 + 0.04 + (yBeam - 0.08 - y0 - 0.04) * k / 8, yc = y0 + 0.04 + (yBeam - 0.08 - y0 - 0.04) * (k + 1) / 8;
      const za = faceZ(ya) - th + 0.005, zc = faceZ(yc) - th + 0.005;
      P.add('hullDetail', slab(
        [rx - 0.02, ya, za], [rx + 0.02, ya, za], [rx + 0.02, ya, za - 0.16], [rx - 0.02, ya, za - 0.16],
        [rx - 0.02, yc, zc], [rx + 0.02, yc, zc], [rx + 0.02, yc, zc - 0.16], [rx - 0.02, yc, zc - 0.16]));
    }
  }
  // a cross beam along the back at mid height, carrying the arms' lugs
  P.add('hullDetail', box(2 * W - 0.10, 0.12, 0.10), 0, 0.90, faceZ(0.90) - th - 0.10);
  // inner push arms from their pins on the nose plate's sides, rising to the cross beam
  for (const s of [-1, 1]) {
    const a: [number, number] = [0.75, 3.20], b: [number, number] = [0.88, faceZ(0.88) - th - 0.15];
    const len = Math.hypot(b[1] - a[1], b[0] - a[0]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    P.add('hullDetail', xform(box(0.08, 0.12, len), 0, 0, 0, -ang, 0, 0), s * 0.95, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    P.add('hullDark', box(0.12, 0.20, 0.18), s * 0.94, 0.74, 3.20);
    P.add('hullDark', cylX(0.045, 0.16, 12), s * 0.95, 0.75, 3.20);
  }
  // the push frame's cross tube tying the inner arms together just behind the blade, over the nose
  P.add('hullDetail', box(1.90, 0.10, 0.14), 0, 0.80, 3.67);
  // outer push arms from the end plates' lower backs to pivots on the front idlers' hubs, in the 8 cm between the track
  // belt's outer edge (x 1.60) and the skirt line (the Tankfest Mk 5 AVRE '02 BA 33')
  for (const s of [-1, 1]) {
    const a: [number, number] = [0.96, 3.27], b: [number, number] = [0.82, faceZ(0.82) - 0.30];
    const len = Math.hypot(b[1] - a[1], b[0] - a[0]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    P.add('hullDetail', xform(box(0.05, 0.14, len), 0, 0, 0, -ang, 0, 0), s * 1.65, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    P.add('hullDark', cylX(0.07, 0.06, 14), s * 1.645, a[0], a[1]);
  }
  // the lifting ram: its cylinder from the glacis bracket to the beam's back
  const r0: [number, number] = [1.42, 3.20], r1: [number, number] = [yBeam, faceZ(yBeam) - th - 0.18];
  const rl = Math.hypot(r1[1] - r0[1], r1[0] - r0[0]), ra = Math.atan2(r1[0] - r0[0], r1[1] - r0[1]);
  P.add('hullDark', xform(cylZ(0.065, rl * 0.6, 14), 0, 0, -rl * 0.2, -ra, 0, 0), 0, (r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2);
  P.add('hullDetail', xform(cylZ(0.032, rl * 0.5, 10), 0, 0, rl * 0.25, -ra, 0, 0), 0, (r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2);
  P.add('hullDark', box(0.14, 0.12, 0.12), 0, yBeam, r1[1] + 0.02);
}

/** The AVRE's skirts carry the Gulf War's bolted plates: rows of bolt heads over the three side plates. */
function buildAvreSkirtBolts(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const za = SKIRT.panels[k] + 0.12, zb = SKIRT.panels[k + 1] - 0.12;
      for (let i = 0; i <= 4; i++) {
        const z = za + (zb - za) * i / 4;
        for (const y of [1.44, 0.86]) {
          if (k === 0 && y < 1.2 && z < -2.0) continue;
          P.add('hullDark', cylX(0.024, 0.016, 8), s * (SKIRT.outer + 0.008), y, z);
        }
      }
    }
  }
}

/** The Olifant Mk 2's armoured skirts (the Commons profile, the Armed Forces Day and SANDF photographs): eight bolted
 * modules a side, 0.81 m long, their tops 4 cm over the bins and their hems at 0.74 m, each hem's corners cut back so a
 * V-notch 0.21 m deep opens at every joint (the critic, 2026-10-29: the straight hem read wrong); a belt along their
 * middle, and a hooded bow guard over each idler whose top falls to its point ahead of the guards; 3.43 m over the bolt
 * heads (tanks-encyclopedia). */
const OLIFANT_SKIRT = { outer: 1.69, t: 0.06, top: 1.74, bot: 0.74, z0: -3.56, z1: 2.95, panels: 8, notch: 0.21, notchHalf: 0.15 } as const;

function buildOlifantSkirts(P: TankBuilderPort): void {
  const S = OLIFANT_SKIRT;
  const pitch = (S.z1 - S.z0) / S.panels;
  // the hem rises over the sprocket along the rearmost 0.8 m
  const hemAt = (z: number): number => (z < S.z0 + 0.81 ? S.bot + (1.20 - S.bot) * (S.z0 + 0.81 - z) / 0.81 : S.bot);
  for (const s of [-1, 1]) {
    const ring = (pts: SectionPoint[]): SectionPoint[] => (s > 0 ? pts : pts.map(([x, y]) => [-x, y] as SectionPoint).reverse());
    const so = S.outer - S.t;
    const plate = (lo: number): SectionPoint[] => ring([[so, lo], [S.outer, lo], [S.outer, S.top], [so, S.top]]);
    for (let k = 0; k < S.panels; k++) {
      const za = S.z0 + k * pitch + 0.005, zb = S.z0 + (k + 1) * pitch - 0.005;
      // every corner at a joint is cut back into its notch; the rear end (its hem risen over the sprocket) and the front
      // end (running on into the bow guard) stay square
      const rear = k > 0, front = k < S.panels - 1;
      const zs = [za, ...(rear ? [za + S.notchHalf] : []), ...(front ? [zb - S.notchHalf] : []), zb];
      const los = zs.map((z, i) => hemAt(z) + ((rear && i === 0) || (front && i === zs.length - 1) ? S.notch : 0));
      P.add(s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', sectionSolid(zs.map((z, i) => ({ z, ring: plate(los[i]) }))));
      // the joint bolts at three heights, clear of the notches
      for (const fz of [0.10, 0.90]) {
        const z = za + (zb - za) * fz;
        for (const y of [1.62, 1.30, 1.04]) {
          if (y < hemAt(z) + S.notch + 0.06) continue;
          P.add('hullDark', cylX(0.026, 0.02, 8), s * (S.outer + 0.010), y, z);
        }
      }
      P.add('hullDark', box(0.024, 0.06, 0.08), s * (S.outer + 0.012), S.top - 0.08, (za + zb) / 2);
    }
    // the belt along the modules and the flange over the bins' outer edge
    P.add('hullDetail', box(0.024, 0.05, S.z1 - S.z0 - 0.40), s * (S.outer + 0.012), 1.46, (S.z0 + S.z1) / 2 + 0.20);
    const fx0 = s < 0 ? -S.outer : 1.635, fx1 = s < 0 ? -1.635 : S.outer;
    P.add('hullFixedPaintedBodywork', box(fx1 - fx0, 0.025, S.z1 - S.z0), (fx0 + fx1) / 2, S.top - 0.0125, (S.z0 + S.z1) / 2);
    // the bow guard: a rigid armoured beak ahead of the track, its top level then falling at 45 deg and its underside
    // rising at 40 deg to a point at mid-skirt height (the side photograph); over the track a rounded hood drooping 0.3 m
    // to its inner edge (the Armed Forces Day head-on view; the critics, 2026-10-28/29: the blunt end, its rubber flaps
    // and the flat front read wrong)
    const tip = 3.85, topBreak = 3.30, botBreak = 3.34, tipY = 1.22;
    const topAt = (z: number): number => (z <= topBreak ? S.top : S.top + (tipY + 0.01 - S.top) * (z - topBreak) / (tip - topBreak));
    const botAt = (z: number): number => (z <= botBreak ? S.bot : S.bot + (tipY - 0.01 - S.bot) * (z - botBreak) / (tip - botBreak));
    const beak = [S.z1, topBreak, botBreak, tip];
    P.add('hullFixedPaintedBodywork', sectionSolid(beak.map((z) => ({ z, ring: ring([[so, botAt(z)], [S.outer, botAt(z)], [S.outer, topAt(z)], [so, topAt(z)]]) }))));
    // the hood: a 3 cm shell whose top falls away to its inner edge on a quadratic droop
    const hx = [0.96, 1.08, 1.22, 1.40, so];
    P.add('hullFixedPaintedBodywork', sectionSolid(beak.map((z) => {
      const t = topAt(z), drop = Math.min(0.30, (t - botAt(z)) * 0.6);
      const up = (x: number): number => t - drop * ((so - x) / (so - hx[0])) ** 2;
      const pts: SectionPoint[] = [...hx.map((x) => [x, up(x) - 0.03] as SectionPoint), ...[...hx].reverse().map((x) => [x, up(x)] as SectionPoint)];
      return { z, ring: ring(pts) };
    })));
    for (const fz of [3.15, 3.55]) P.add('hullDark', cylX(0.026, 0.02, 8), s * (S.outer + 0.010), (topAt(fz) + botAt(fz)) / 2, fz);
  }
}

/** The Horstmann bogies the skirts hid (the Australian tanks ran without them in Vietnam): on each pair of road wheels a
 * hanger bracket off the hull's side, the horizontal spring housing over the wheels under the return run, and the two
 * arms down to the hubs outboard of the wheels. */
function buildHorstmannBogies(P: TankBuilderPort): void {
  const pairs: readonly (readonly [number, number])[] = [[WHEEL_ZS[0], WHEEL_ZS[1]], [WHEEL_ZS[2], WHEEL_ZS[3]], [WHEEL_ZS[4], WHEEL_ZS[5]]];
  for (const s of [-1, 1]) {
    for (const [za, zb] of pairs) {
      const zm = (za + zb) / 2;
      P.add('hullDark', box(0.30, 0.30, 0.52), s * 1.02, 0.95, zm);
      P.add('hullDetail', cylZ(0.072, 0.66, 14), s * TRACK.xc, 0.99, zm);
      for (const k of [-1, 1]) P.add('hullDark', cylZ(0.085, 0.04, 14), s * TRACK.xc, 0.99, zm + k * 0.33);
      for (const zw of [za, zb]) {
        const dz = zw - zm, len = Math.hypot(dz * 0.55, 0.50), ang = Math.atan2(dz * 0.55, 0.50);
        P.add('hullDark', xform(box(0.06, len, 0.09), 0, 0, 0, ang, 0, 0), s * 1.445, 0.475 + 0.25, zw - dz * 0.275);
      }
    }
  }
}

/** The Olifant's torsion bars (from the Mk 1B): six road wheels evenly spaced on trailing arms, the return rollers behind
 * the armoured skirts. */
function buildOlifantRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.25, wheelY: 0.475, xc: TRACK.xc, wheelZs: [2.30, 1.40, 0.50, -0.40, -1.30, -2.20],
    sprocket: { z: -3.12, y: 0.88, r: 0.37 }, idler: { z: 3.27, y: 0.96, r: 0.33 },
    rollers: [2.10, 0.70, -0.70, -2.10].map((z) => ({ z, y: 1.21, r: 0.10 })),
    trackW: TRACK.w, topY: 1.40, paintedEnds: true, coveredTop: true, arms: true,
    contactZF: 2.36, contactZR: -2.26,
  });
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
  // Exhaust pipes along the rear guards into fishtail silencers at the rear corners (not the Olifant's: its armoured
  // skirts stand there and the diesel exhausts through the rear plate).
  for (const s of m.kit === 'olifant' ? [] : [-1, 1]) {
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
  P.add('hullFixedPaintedBodywork', box(0.34, 0.02, 1.50), 0, top + 0.01, -2.30);
  // the deck's sides step down to the guards where the British louvres were
  for (const s of [-1, 1]) {
    // M48-style box air cleaner on the rear guard, its clamped lid and its duct into the deck side
    P.add('hullDetail', box(0.30, 0.34, 0.78), s * 1.50, GUARD_Y + 0.185, -2.62);
    P.add('hullDark', box(0.31, 0.012, 0.79), s * 1.50, GUARD_Y + 0.34, -2.62);
    for (const cz of [-2.40, -2.84]) P.add('hullDark', box(0.04, 0.06, 0.05), s * 1.656, GUARD_Y + 0.28, cz);
    P.add('hullDark', cylX(0.07, 0.10, 12), s * 1.30, GUARD_Y + 0.26, -2.62);
    // the tow cable along the deck's edge
    KIT.towCable(P, [[s * 1.04, top + 0.03, -1.60], [s * 1.06, top + 0.03, -2.40], [s * 1.04, top + 0.03, -3.20]]);
    for (const cz of [-1.60, -3.20]) P.add('hullDark', box(0.07, 0.06, 0.07), s * 1.04, top + 0.03, cz);
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
    } else {
      P.add('hullDetail', box(0.12, 0.08, 0.05), s * 1.18, 1.56, REAR_Z - 0.02);
      P.add('hullGlass', box(0.08, 0.04, 0.012), s * 1.18, 1.56, REAR_Z - 0.036);
      // the Swedish links on the rear plate (on the British marks the tow cable is slung where they would ride)
      if (m.swedish) KIT.spareTrackStrip(P, 'hull', s * 0.86, 1.26, REAR_Z - 0.035, 2, -Math.PI / 2);
    }
  }
  if (m.swedish && m.kit === 'none') {
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
    // two links on the tub's rear plate between the AVDS boxes, under the convoy light (the Litani photograph)
    KIT.spareTrackStrip(P, 'hull', 0, 1.20, REAR_Z - 0.035, 2, -Math.PI / 2);
    // the AVDS conversion's two louvred grille boxes on the upper rear plate (the 1978 rear photograph)
    for (const s of [-1, 1]) {
      P.add('hullFixedPaintedBodywork', box(0.62, 0.52, 0.10), s * 0.58, 1.46, REAR_Z - 0.04);
      P.add('hullDark', box(0.54, 0.44, 0.012), s * 0.58, 1.46, REAR_Z - 0.092);
      for (let i = 0; i < 6; i++) P.add('hullDetail', xform(box(0.54, 0.012, 0.04), 0, 0, 0, -0.6, 0, 0), s * 0.58, 1.27 + i * 0.075, REAR_Z - 0.09);
    }
  }
  if (m.kit === 'aus') {
    // the RAAC's 100-gallon armoured fuel tank across the rear plate on two brackets, its filler and feed (Vietnam,
    // 1968; the infantry telephone on its right end)
    P.add('hullFixedPaintedBodywork', box(1.78, 0.46, 0.40), 0, 1.29, REAR_Z - 0.22);
    P.add('hullDark', box(1.80, 0.02, 0.42), 0, 1.525, REAR_Z - 0.22);
    for (const s of [-1, 1]) P.add('hullDark', box(0.10, 0.36, 0.06), s * 0.70, 1.29, REAR_Z - 0.01);
    P.add('hullDetail', cylY(0.07, 0.07, 0.05, 12), 0.55, 1.545, REAR_Z - 0.22);
    P.add('hullDark', cylZ(0.022, 0.30, 8), -0.20, 1.12, REAR_Z - 0.06);
    P.add('hullDetail', box(0.22, 0.26, 0.10), -0.60, 1.29, REAR_Z - 0.47);
  }
  // infantry telephone box on the right rear
  if (!m.idf && !m.swedish && m.kit !== 'aus') {
    P.add('hullDetail', box(0.22, 0.26, 0.10), -0.30, 1.38, REAR_Z - 0.05);
    P.add('hullDark', box(0.16, 0.02, 0.012), -0.30, 1.46, REAR_Z - 0.10);
  }
  if (!m.swedish && !m.idf && m.kit !== 'aus') {
    KIT.towCable(P, [[-1.20, 1.60, REAR_Z - 0.03], [-0.62, 1.30, REAR_Z - 0.06], [0, 1.52, REAR_Z - 0.04],
      [0.62, 1.30, REAR_Z - 0.06], [1.20, 1.60, REAR_Z - 0.03]]);
    // the cable's eyes clamped in their ferrules on the plate's top corners (the tube itself is open-ended)
    for (const s of [-1, 1]) P.add('hullDark', box(0.07, 0.07, 0.07), s * 1.20, 1.60, REAR_Z - 0.03);
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

/** The casting, rear to front: bustle overhang, the body over the ring, the rounded front falling to the mantlet. The
 * bustle stands 0.4 m out behind the ring housing with a broad, rounded-square back (the Bovington Mk 13's right side
 * and the Duxford AVRE's: the casting 2.25 m long, its back 0.85 m behind the cupola; the critic, 2026-10-29: the
 * 0.9 m teardrop bustle made the turret read a third too long). */
const CASTING: readonly CastStation[] = [
  { z: -1.48, bottom: 0.30, roof: 0.84, low: 0.74, mid: 0.77, up: 0.73, edge: 0.60 },
  { z: -1.40, bottom: 0.27, roof: 0.93, low: 0.84, mid: 0.87, up: 0.83, edge: 0.69 },
  { z: -1.27, bottom: 0.25, roof: 0.96, low: 0.89, mid: 0.92, up: 0.88, edge: 0.76 },
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

/** The uncovered marks' casting: the nose falls to its chin 12 cm shorter, so the bare cast mantlet stands 0.3 m proud
 * of it with its top and sides showing (the Bovington Mk 13 and the Strv 81 photographs; the critics, 2026-10-28/29:
 * the block buried in the nose read as a thin collar). Under a canvas cover the longer nose carries the drape. */
const CASTING_BARE: readonly CastStation[] = [
  ...CASTING.slice(0, -3),
  { z: 0.86, bottom: -0.012, roof: 0.78, low: 1.01, mid: 1.03, up: 0.95, edge: 0.78 },
  { z: 0.93, bottom: -0.012, roof: 0.65, low: 0.93, mid: 0.94, up: 0.87, edge: 0.74 },
  { z: 0.98, bottom: 0.03, roof: 0.55, low: 0.83, mid: 0.83, up: 0.77, edge: 0.68 },
];
const castingOf = (m: MarkDesign): readonly CastStation[] => (m.shortNose ? CASTING_BARE : CASTING);

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
  P.add('turret', sectionSolid(castingOf(m).map(castSection), { smoothSideEdges: [1, 2, 3, 4, 5, 9, 10, 11, 12, 13], centeredSideQuads: true }));
  // Ring collar: the casting's foot on the race.
  P.add('turret', cylY(1.00, 1.03, 0.07, 48), 0, -0.005, 0.02);
  P.add('turretDark', torus(1.015, 0.012, 48, 6), 0, 0.03, 0.02);
  if (!m.mk5) {
    // the Mk 3's welded roof plate: a weld bead round its edge on the casting's crown
    const bead = (a: [number, number], b: [number, number]): void => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      P.add('turretDetail', xform(cylZ(0.012, len, 6), 0, 0, 0, 0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0), (a[0] + b[0]) / 2, 0.972, (a[1] + b[1]) / 2);
    };
    const plate: [number, number][] = [[0.66, 0.50], [0.72, 0.02], [0.66, -0.80], [0.52, -1.24], [-0.52, -1.24], [-0.66, -0.80], [-0.72, 0.02], [-0.66, 0.50]];
    for (let i = 0; i < plate.length; i++) bead(plate[i], plate[(i + 1) % plate.length]);
  }
}

/** The casting's roof height at station z (linear between the stations). */
function castingRoof(z: number, st: readonly CastStation[] = CASTING): number {
  let k = 0;
  while (k < st.length - 2 && st[k + 1].z < z) k++;
  const a = st[k], b = st[k + 1], t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
  return a.roof + (b.roof - a.roof) * t;
}

/** The casting's half-width at station z and height y (between its lower wall, bin course and upper slope points). */
function castingHalfWidth(z: number, y: number, st: readonly CastStation[] = CASTING): number {
  let k = 0;
  while (k < st.length - 2 && st[k + 1].z < z) k++;
  const a = st[k], b = st[k + 1], t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
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
    [-0.86, 0.28, -1.40], [0.86, 0.28, -1.40], [0.86, 0.28, -1.78], [-0.86, 0.28, -1.78],
    [-0.86, 0.90, -1.40], [0.86, 0.90, -1.40], [0.86, 0.88, -1.78], [-0.86, 0.88, -1.78]));
  P.add('turretDark', box(1.66, 0.012, 0.012), 0, 0.885, -1.785);
  P.add('turretDark', box(1.66, 0.012, 0.012), 0, 0.30, -1.785);
  for (const hx of [-0.42, 0.42]) P.add('turretDark', box(0.06, 0.08, 0.02), hx, 0.78, -1.79);
  P.add('turretDark', xform(torus(0.07, 0.012, 14, 4), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0.58, -1.79);
}

/** The Mk 13's open mesh basket on the bustle's back, 0.5 m deep and 0.62 m tall, its top rail 0.15 m over the roof
 * edge and its floor well clear of the engine deck (the Bovington Mk 13; the critics, 2026-10-28: the solid box bin
 * down to the deck made the turret read 0.9 m long; 2026-10-29: the low open frame read as a rail). */
function buildLateBustleBasket(P: TankBuilderPort): void {
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.50, d: 0.50, h: 0.62, fill: 0.55, rails: 3, seed: 1360 }),
    0, 0.38, -1.74);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.05, 0.14), s * 0.56, 0.40, -1.48);
    P.add('turretDark', xform(box(0.04, 0.04, 0.30), 0, 0, 0, 0.75, 0, 0), s * 0.56, 0.62, -1.56);
  }
}

/** The Dutch Mk 5/2's tall mesh basket on the bustle's back in place of the box bin, 0.6 m deep, its top rail 0.18 m over
 * the roof edge (the Delft Mk 5/2 head-on photograph shows its mesh over the right rear corner; its registered model's
 * rear basket stands as tall). */
function buildMk52BustleBasket(P: TankBuilderPort): void {
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.60, d: 0.60, h: 0.68, fill: 0.5, rails: 3, seed: 5260 }),
    0, 0.34, -1.79);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.05, 0.14), s * 0.60, 0.36, -1.48);
    P.add('turretDark', xform(box(0.04, 0.04, 0.32), 0, 0, 0, 0.75, 0, 0), s * 0.60, 0.60, -1.57);
  }
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
    mg.name = m.late ? 'centurion13_cupola_machine_gun' : m.kit === 'avre' ? 'centurion5_avre_cupola_machine_gun'
      : m.kit === 'aus' ? 'centurion5_1_aus_cupola_machine_gun' : 'centurion5_cupola_machine_gun';
    mg.position.set(cx + 0.06, roofY + 0.24, cz + 0.12);
    mg.rotation.y = 0.08;
    mg.userData.stationVariant = m.late ? 'centurion-mk13-cupola-mag58-r262'
      : m.kit === 'avre' ? 'centurion-avre-cupola-mag58-r262' : m.kit === 'aus' ? 'centurion-aus-cupola-mag58-r262'
        : 'centurion-mk5-cupola-mag58-r262';
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
  if (isMk52(m)) {
    // the Delft Mk 5/2's searchlight: a tall box with its louvred front, standing on the left cheek just outboard of the
    // mantlet's cover, its top level with the roof, on a bracket into the casting (the Dutch Mk 5/2 head-on photograph;
    // the critics, 2026-10-29: the box on a stalk over the right front corner of the roof)
    const lx = 0.89, ly = 0.75, lz = 1.20;
    P.add('turretDark', box(0.12, 0.10, 0.24), lx, ly - 0.16, lz - 0.18);
    P.addEquipment('turretDetail', box(0.34, 0.44, 0.30), lx, ly, lz);
    P.add('turretGlass', box(0.26, 0.32, 0.012), lx, ly, lz + 0.152);
    for (let k = 0; k < 6; k++) P.add('turretDark', box(0.28, 0.010, 0.012), lx, ly - 0.14 + k * 0.056, lz + 0.162);
    P.add('turretDark', box(0.36, 0.03, 0.03), lx, ly + 0.225, lz);
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
  for (const [lx, lz] of [[0.70, 0.40], [-0.70, 0.40], [0.42, -1.16], [-0.42, -1.16]] as const) {
    KIT.liftEye(P, 'turretDetail', lx, roofY - (lz > 0 ? 0.03 : 0.02), lz, 0);
  }
  // Wireless aerial bases at the bustle's rear corners; the Mk 3 and the Mk 5/2 stand with their bases bare (the
  // Bovington Mk 3, the Delft Mk 5/2 and their registered models carry no whips, and 2 m whips the models lack dominate
  // their front and station silhouettes)
  const aerials: readonly (readonly [number, number])[] = m.swedish ? [[0.62, -1.34], [-0.62, -1.34]] : [[0.58, -1.32], [-0.58, -1.32]];
  aerials.forEach(([ax, az], i) => {
    P.add('turretDetail', cylY(0.04, 0.05, 0.07, 10), ax, roofY - 0.02, az);
    if ((!m.mk5 && !m.swedish) || isMk52(m)) return;
    const h = m.idf ? (i === 0 ? 2.9 : 2.6) : i === 0 ? 2.1 : 1.6;
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.011, rake: 0.05,
      seed: (m.swedish ? 8130 : m.idf ? 9720 : 2620) + i }), ax, roofY + 0.02, az);
  });
}

/** A reactive package on one front corner of the casting (ring frame, the left side; `s` -1 mirrors it): a housing
 * from the bins' front ends to the mantlet's edge, raked back in plan (its outer edge from `xBack` to `xTip`) and in
 * elevation (its top `setback` behind its foot), its inner side 3 cm into the casting and 4.5 cm clear of the mantlet's
 * 0.80 m half-width. Returns the outer face's point and frame at (u along it from the back, v up it). */
interface CornerPackage {
  readonly z0: number; readonly z1: number; readonly yb: number; readonly yt: number;
  readonly xBack: number; readonly xTip: number; readonly setback: number;
}
type FacePoint = (u: number, v: number) => { p: V3; a: V3; b: V3; n: V3 };

function cornerPackage(P: TankBuilderPort, s: number, k: CornerPackage, st: readonly CastStation[] = CASTING): FacePoint {
  const outer = (z: number): number => k.xBack + (k.xTip - k.xBack) * (Math.min(k.z1, z) - k.z0) / (k.z1 - k.z0);
  const inner = (z: number): number => Math.max(0.845, castingHalfWidth(z, 0.78, st) - 0.03);
  const top = (z: number): number => Math.max(inner(z) + 0.03, outer(z + k.setback));
  const N = 6, rings: SolidSection[] = [];
  for (let i = 0; i <= N; i++) {
    const z = k.z0 + (k.z1 - k.z0) * i / N, xi = inner(z);
    const ring: SectionPoint[] = [[xi, k.yb], [outer(z), k.yb], [top(z), k.yt], [xi, k.yt]];
    rings.push({ z, ring: s > 0 ? ring : ring.map(([x, y]) => [-x, y] as SectionPoint).reverse() });
  }
  P.addExternalArmor('turret', sectionSolid(rings));
  const at = (u: number, v: number): V3 => {
    const z = k.z0 + (k.z1 - k.z0) * u;
    return [s * (outer(z) + (top(z) - outer(z)) * v), k.yb + (k.yt - k.yb) * v, z];
  };
  return (u, v) => {
    const e = 0.01, p = at(u, v);
    const a = vUnit(vAdd(at(u + e, v), at(u - e, v), -1)), up = vAdd(at(u, v + e), at(u, v - e), -1);
    let n = vUnit(vCross(a, up));
    if (n[0] * s < 0) n = [-n[0], -n[1], -n[2]];
    return { p, a, b: vUnit(vCross(n, a)), n };
  };
}

/** Seams and bolts on a package face: `cols` x `rows` cassettes (the Strv 104's flush FFV panels). */
function cassetteSeams(P: TankBuilderPort, face: FacePoint, cols: number, rows: number, wFace: number, hFace: number): void {
  for (let c = 1; c < cols; c++) {
    const { p, a, b, n } = face(c / cols, 0.5);
    faceBox(P, 'turret', 'dark', p, a, b, n, 0.014, hFace - 0.06, 0.008);
  }
  for (let r = 1; r < rows; r++) {
    const { p, a, b, n } = face(0.5, r / rows);
    faceBox(P, 'turret', 'dark', p, a, b, n, wFace - 0.06, 0.014, 0.008);
  }
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    for (const [du, dv] of [[0.22, 0.25], [0.78, 0.75]]) {
      const { p, a, b, n } = face((c + du) / cols, (r + dv) / rows);
      faceBox(P, 'turret', 'dark', p, a, b, n, 0.032, 0.032, 0.016);
    }
  }
}

/** Raised bricks on a package face: `cols` x `rows`, each with its centre bolt (the AVRE's Gulf War bricks). */
function faceBricks(P: TankBuilderPort, face: FacePoint, cols: number, rows: number, wFace: number, hFace: number, t = 0.055): void {
  const w = wFace / cols - 0.03, h = hFace / rows - 0.03;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const { p, a, b, n } = face((c + 0.5) / cols, (r + 0.5) / rows);
    faceBox(P, 'turret', 'era', p, a, b, n, w, h, t);
    faceBox(P, 'turret', 'dark', vAdd(p, n, t), a, b, n, 0.03, 0.03, 0.012);
  }
}

/** The Strv 105 (one prototype, 1994, from a Strv 104; the Skaraborg photograph, the Bovington Strv 104; the owner,
 * 2026-10-27: "much better custom era and shaping and turret"): the Strv 104's FFV housings on both front corners, from
 * the bins' front ends to the mantlet's edge, raked 49 deg back in plan and 20 deg in elevation, their faces cut into
 * three by two cassettes with their bolts, the turret thus wedge-fronted; a sloped housing on the roof's front ahead of
 * the hatches; the prototype's thermal sight in its armoured box on the right shoulder over the housing, its round
 * window and shutter; the two 71 mm Lyran launchers on the right of the roof. The discharger blocks stand on the bins
 * behind. Ring frame. */
const STRV105_CORNER: CornerPackage = { z0: 0.72, z1: 1.30, yb: 0.30, yt: 0.80, xBack: 1.50, xTip: 0.88, setback: 0.20 };

function buildStrv105TurretKit(P: TankBuilderPort): void {
  const k = STRV105_CORNER;
  const wFace = Math.hypot(k.xBack - k.xTip, k.z1 - k.z0), hFace = Math.hypot(k.yt - k.yb, k.setback);
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    // the housing carries a row of three thick boxes, each standing proud with its own sloped top (the critic's read
    // of the Strv 104: separate boxes, not one slab)
    P.destructibleCluster(`strv105_turret_era_${side}`, () => faceBricks(P, cornerPackage(P, s, k), 3, 1, wFace, hFace, 0.12));
  }
  P.destructibleCluster('strv105_turret_roof_era', () => {
    // a low flat plate a side over the roof's front 0.8 m, following the casting's roof and its fall to the face, its
    // shallow ribs across it (the Skaraborg photograph; the critic, 2026-10-28: the tall ribs read as vent grilles)
    for (const s of [-1, 1]) {
      const x0 = s * 0.16, x1 = s * 0.74, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
      const zs = [0.0, 0.31, 0.62, 0.71, 0.80];
      P.addExternalArmor('turret', sectionSolid(zs.map((z) => {
        const y = castingRoof(z), t = 0.075 - 0.03 * Math.max(0, z - 0.62) / 0.18;
        return { z, ring: [[lo, y - 0.02], [hi, y - 0.02], [hi - 0.02, y + t], [lo + 0.02, y + t]] as SectionPoint[] };
      })));
      for (const rz of [0.08, 0.24, 0.40, 0.56]) {
        P.add('turretDark', box(hi - lo - 0.08, 0.014, 0.03), (lo + hi) / 2, castingRoof(rz) + 0.082, rz);
      }
    }
  });
  // the thermal sight's armoured box on the right shoulder, its round window forward
  const tx = -0.96, ty = 0.98, tz = 0.82;
  P.addEquipment('turretDetail', box(0.30, 0.26, 0.34), tx, ty, tz);
  P.add('turretGlass', cylZ(0.080, 0.02, 20), tx, ty - 0.01, tz + 0.17);
  P.add('turretDark', xform(torus(0.090, 0.014, 20, 6), 0, 0, 0, Math.PI / 2, 0, 0), tx, ty - 0.01, tz + 0.18);
  P.add('turretDark', xform(box(0.30, 0.02, 0.16), 0, 0, 0, -0.5, 0, 0), tx, ty + 0.15, tz + 0.16);
  P.add('turretDark', box(0.22, 0.12, 0.24), tx - 0.02, ty - 0.17, tz - 0.06);
  // the Lyran launchers: two tubes on a bracket at the right roof edge, raised forward
  for (const lz of [-0.10, 0.06]) {
    P.add('turretDark', cylZ(0.040, 0.32, 12), -0.86, 1.02, lz, -0.9, 0, 0);
    P.add('turretDetail', box(0.10, 0.06, 0.10), -0.86, 0.975, lz - 0.02);
  }
}

/** The AVRE's Gulf War armour (32 Armoured Engineer Regiment, 1991; the owner's reference; the owner, 2026-10-27: "much
 * better custom era and shaping and turret"): blocky brick packages on both front corners (a backing housing raked back
 * from the bins' fronts to the mantlet's edge, faced with two large flat panels sloped back about 45 deg), two courses of bricks along
 * the bins' outer faces; and its rear basket (no roof armour: none of the photographs shows it). The discharger blocks stand on the bins
 * behind. Ring frame. */
const AVRE_CORNER: CornerPackage = { z0: 0.72, z1: 1.28, yb: 0.18, yt: 0.78, xBack: 1.50, xTip: 0.90, setback: 0.55 };

function buildAvreTurretKit(P: TankBuilderPort): void {
  const k = AVRE_CORNER;
  const wFace = Math.hypot(k.xBack - k.xTip, k.z1 - k.z0), hFace = Math.hypot(k.yt - k.yb, k.setback);
  // the bins' outer faces (buildTurretBins): [z0, z1, outF, outR] a side
  const faces: Record<string, readonly (readonly [number, number, number, number])[]> = {
    L: [[-0.21, 0.72, 1.54, 1.50], [-1.30, -0.69, 1.48, 1.44]],
    R: [[-1.30, 0.72, 1.54, 1.44]],
  };
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    P.destructibleCluster(`centurion5_avre_turret_era_${side}`, () => {
      // two large flat panels on a housing sloped back about 45 deg, flat-topped, with their bolts (the Gulf photographs)
      cassetteSeams(P, cornerPackage(P, s, k, CASTING_BARE), 2, 1, wFace, hFace);
      for (const [z0, z1, outF, outR] of faces[side]) {
        const n = Math.max(1, Math.floor((z1 - z0 - 0.04) / 0.29));
        for (let i = 0; i < n; i++) {
          const z = z0 + 0.02 + 0.145 + i * 0.29 + ((z1 - z0 - 0.04) - n * 0.29) / 2;
          const o = outR + (outF - outR) * (z - z0) / (z1 - z0) + 0.006;
          for (const y of [0.425, 0.595]) {
            faceBox(P, 'turret', 'era', [s * o, y, z], [0, 0, -s], [0, 1, 0], [s, 0, 0], 0.26, 0.15, 0.06);
            faceBox(P, 'turret', 'dark', [s * (o + 0.06), y, z], [0, 0, -s], [0, 1, 0], [s, 0, 0], 0.03, 0.03, 0.012);
          }
        }
      }
    });
  }
  // the rear basket of the Duxford and Royal Engineers Museum AVREs, on arms from the bin's lower edge
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.80, d: 0.44, h: 0.42, fill: 0.5, rails: 3, seed: 5160 }),
    0, 0.30, -2.02);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.05, 0.34), s * 0.78, 0.31, -1.88);
    P.add('turretDark', xform(box(0.04, 0.04, 0.44), 0, 0, 0, 0.75, 0, 0), s * 0.78, 0.52, -1.90);
  }
}

/** The Australian Vietnam fit's mesh basket (the 1st Armoured Regiment photographs; the critics: 2026-10-28, one basket
 * hung off the turret, not a loaded rack; 2026-10-29, tank 1B's basket hugs the bustle 0.5 m deep with no bin behind
 * it): one U round the bustle - the rear run on the casting's back between the side runs, a side run along each side of
 * the bustle from the side bins' back ends - its top level with the roof, its floor well clear of the deck, two rails,
 * the tank's number on its rear face. Ring frame. */
function buildAusTurretBaskets(P: TankBuilderPort): void {
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.76, d: 0.50, h: 0.50, fill: 0.55, rails: 2, seed: 5112 }), 0, 0.40, -1.73);
  for (const s of [-1, 1]) {
    mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 0.67, d: 0.32, h: 0.50, fill: 0.5, rails: 2, seed: 5114 + (s > 0 ? 1 : 0) }),
      s * 1.05, 0.40, -1.645, [0, Math.PI / 2, 0]);
    P.add('turretDark', box(0.05, 0.05, 0.12), s * 0.62, 0.41, -1.50);
    P.add('turretDark', xform(box(0.04, 0.04, 0.30), 0, 0, 0, 0.75, 0, 0), s * 0.62, 0.62, -1.56);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [0, 0.66, -1.99], Math.PI);
}

/** The Olifant Mk 2's turret (LIW, from 2007; the Commons profile and the Armed Forces Day photographs): the Centurion
 * turret inside a slab-sided box of modular composite armour - flat vertical sides, a flat roof, the top edges
 * chamfered, the two front faces raked back from the gun's slot to the sides, the bustle long and overhanging the engine
 * deck with its underside rising to the rear (side height 0.81 m, 4.26 m over the bustle, the roof 2.63 m up). Ring
 * frame. */
const OLIFANT_TURRET = { hw: 1.45, bottom: 0.18, roof: 0.93, chamfer: 0.04, cheekZ: 0.95, faceZ: 1.10, noseZ: 1.42, chamferZ: 1.30, slotHw: 0.45, rearZ: -2.84 } as const;

/** The roof over the cheeks: flat to the front faces' top edge, chamfered 12 cm down over its last 12 cm (the owner's
 * head-on photograph, 2026-10-28: the front faces flat and vertical). */
function olifantTop(z: number): number {
  const T = OLIFANT_TURRET;
  return T.roof - Math.max(0, z - T.chamferZ);
}

/** The plan's half-width: the sides to the cheeks' start, then the wedge raked in to the gun's slot at the nose. */
function olifantHalfWidth(z: number): number {
  const T = OLIFANT_TURRET;
  return z <= T.cheekZ ? T.hw : T.hw - (z - T.cheekZ) * (T.hw - T.slotHw - 0.08) / (T.noseZ - T.cheekZ);
}

function olifantSection(z: number, bottom: number, roof: number, hw: number): SolidSection {
  const c = OLIFANT_TURRET.chamfer;
  return { z, ring: [[-hw, bottom], [hw, bottom], [hw, roof - c], [hw - c, roof], [-(hw - c), roof], [-hw, roof - c]] };
}

function buildOlifantTurret(P: TankBuilderPort): void {
  const T = OLIFANT_TURRET;
  P.add('turret', sectionSolid([
    olifantSection(T.rearZ, 0.32, 0.86, 1.30),
    olifantSection(-2.74, 0.27, T.roof, T.hw),
    olifantSection(-1.70, 0.19, T.roof, T.hw),
    olifantSection(-1.60, T.bottom, T.roof, T.hw),
    olifantSection(T.cheekZ, T.bottom, olifantTop(T.cheekZ), T.hw),
    olifantSection(T.faceZ, T.bottom, olifantTop(T.faceZ), olifantHalfWidth(T.faceZ)),
  ]));
  // the two cheeks either side of the gun's slot: their flat vertical faces raked back in plan from the sides to the slot,
  // the top front edge chamfered (owner 2026-10-28, with a head-on photograph: "front should be flat")
  for (const s of [-1, 1]) {
    const cheek = (z: number): SolidSection => {
      const top = olifantTop(z);
      const hw = olifantHalfWidth(z), c = Math.min(T.chamfer, hw - T.slotHw - 0.01, (top - T.bottom) / 3);
      const ring: SectionPoint[] = [[T.slotHw, T.bottom], [hw, T.bottom], [hw, top - c], [hw - c, top], [T.slotHw, top]];
      return { z, ring: s > 0 ? ring : ring.map(([x, y]) => [-x, y] as SectionPoint).reverse() };
    };
    P.add('turret', sectionSolid([T.faceZ, T.chamferZ, T.noseZ].map(cheek)));
  }
  // ring collar on the race, up to the box's floor (the undercut shows round it)
  P.add('turret', cylY(1.00, 1.03, 0.20, 48), 0, 0.08, 0.02);
  // the turret body under the armour modules, 0.2 m in from their faces: the modules overhang it, and it shows as the
  // dark band between the skirts' tops and the turret's lower edge (the side, SANDF and Armed Forces Day photographs;
  // the critic, 2026-10-29: the box read as standing straight on the deck)
  const under = (z: number, hw: number): SolidSection => ({ z, ring: [[-hw, 0.13], [hw, 0.13], [hw, T.bottom + 0.01], [-hw, T.bottom + 0.01]] });
  P.add('turret', sectionSolid([under(-1.55, T.hw - 0.20), under(T.cheekZ, T.hw - 0.20), under(T.faceZ + 0.10, 0.80)]));
  P.add('turretDark', torus(1.015, 0.012, 48, 6), 0, 0.03, 0.02);
  // module joints, bolt heads and the round port on each side; the bustle's rear plate seams
  for (const s of [-1, 1]) {
    const sx = s * (T.hw + 0.004);
    for (const jz of [-1.90, -0.80, 0.30]) P.add('turretDark', box(0.012, 0.66, 0.014), sx, 0.50, jz);
    for (const bz of [-2.50, -2.10, -1.70, -1.20, -0.40, 0.00, 0.70]) {
      for (const by of [0.28, 0.76]) P.add('turretDark', cylX(0.022, 0.02, 8), s * (T.hw + 0.008), by, bz);
    }
    P.addEquipment('turret', cylX(0.075, 0.05, 18), s * (T.hw + 0.02), 0.60, -0.45);
    P.add('turretDark', xform(torus(0.08, 0.012, 18, 4), 0, 0, 0, 0, 0, Math.PI / 2), s * (T.hw + 0.045), 0.60, -0.45);
    // the front faces' panel seam and bolts
    for (const [fz, by] of [[1.02, 0.30], [1.02, 0.74], [1.22, 0.30], [1.34, 0.30]] as const) {
      P.add('turretDark', cylX(0.022, 0.02, 8), s * (olifantHalfWidth(fz) + 0.004), by, fz, 0, s * 1.05, 0);
    }
  }
  // two banks of four dischargers at the bustle's rear corners, raised forward (the Commons profile)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.10, 0.12, 0.66), s * (T.hw + 0.05), 0.70, -2.40);
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', markSmokeTube(cylZ(0.042, 0.24, 12)), s * (T.hw + 0.07), 0.80, -2.64 + k * 0.155, -0.45, s * 0.25, 0);
    }
  }
}

/** The Olifant's roof: the commander's stabilised thermal sight head on its post ahead of his cupola on the right (the
 * box 0.47 m long and 0.50 m high, its corners chamfered, its window forward), the cupola, the loader's hatch and his
 * pintle 7.62 mm on the left (the Mk 1B's documented anti-aircraft gun; no source shows a remote mount), the gunner's
 * sight, periscopes, ventilator, lifting eyes and the aerials at the bustle's rear corners. Ring frame. */
function buildOlifantRoof(P: TankBuilderPort): void {
  const roofY = OLIFANT_TURRET.roof;
  const cx = -0.55, cz = -0.95;
  P.addCupola('turret', cylY(0.36, 0.38, 0.10, 32), cx, roofY + 0.05, cz);
  KIT.cupola(P, 'turret', cx, roofY + 0.10, cz, 0.30, 0.12, 8);
  // the commander's sight
  // (its head 0.68 m over the roof: the side and Armed Forces Day photographs; the critic, 2026-10-29: 0.9 m read tall)
  const sx = -0.55, sz = -0.37, headY = roofY + 0.18;
  P.add('turret', cylY(0.16, 0.20, 0.06, 20), sx, roofY + 0.03, sz);
  P.add('turretDark', cylY(0.085, 0.085, 0.14, 14), sx, roofY + 0.12, sz);
  const head = (z: number, hw: number): SolidSection => ({ z, ring: [[-hw, 0], [hw, 0], [hw, 0.50], [-hw, 0.50]] });
  P.addEquipment('turretDetail', sectionSolid([head(-0.235, 0.14), head(-0.175, 0.20), head(0.175, 0.20), head(0.235, 0.14)]), sx, headY, sz);
  P.add('turretGlass', box(0.24, 0.20, 0.012), sx, headY + 0.30, sz + 0.240);
  P.add('turretDark', box(0.30, 0.03, 0.08), sx, headY + 0.42, sz + 0.25);
  P.add('turretDark', box(0.30, 0.02, 0.012), sx, headY + 0.19, sz + 0.242);
  P.add('turretDark', box(0.012, 0.36, 0.30), sx + 0.205, headY + 0.25, sz - 0.02);
  P.add('turretDark', box(0.012, 0.36, 0.30), sx - 0.205, headY + 0.25, sz - 0.02);
  // the loader's hatch and his pintle gun
  P.addHatch('turret', cylY(0.30, 0.31, 0.045, 24), 0.55, roofY + 0.015, -0.80);
  P.add('turretDark', box(0.12, 0.05, 0.09), 0.55, roofY + 0.04, -1.12);
  P.add('turretDark', torus(0.28, 0.010, 24, 4), 0.55, roofY + 0.04, -0.80);
  P.add('turretDark', cylY(0.035, 0.045, 0.16, 10), 0.92, roofY + 0.07, -0.52);
  mount(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 0.86, elev: 0.06,
    shield: false, ammo: true, seed: 2710, feed: 'left', working: true, ridingCradle: true }), 0.92, roofY + 0.15, -0.52,
  [0, -0.12, 0]);
  // the gunner's sight head and the periscopes
  P.add('turret', box(0.26, 0.14, 0.32), -0.78, roofY + 0.06, 0.55);
  P.add('turretGlass', box(0.18, 0.06, 0.02), -0.78, roofY + 0.08, 0.715);
  KIT.periscope(P, 'turretDetail', 0.55, roofY + 0.04, -0.30, 0);
  KIT.periscope(P, 'turretDetail', 0.20, roofY + 0.04, 0.70, 0);
  P.add('turret', cylY(0.10, 0.13, 0.06, 16), 0.0, roofY + 0.02, -1.70);
  for (const [lx, lz] of [[1.15, 0.70], [-1.15, 0.70], [1.10, -2.40], [-1.10, -2.40]] as const) {
    KIT.liftEye(P, 'turretDetail', lx, roofY + 0.0, lz, 0);
  }
  [[1.05, -2.55], [-1.05, -2.55]].forEach(([ax, az], i) => {
    P.add('turretDetail', cylY(0.04, 0.05, 0.07, 10), ax, roofY + 0.02, az);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: i === 0 ? 2.4 : 1.9, r: 0.011, rake: 0.05, seed: 2740 + i }), ax, roofY + 0.05, az);
  });
}

/** The Olifant's mantlet in the slot between the cheeks: a narrow cast block, ahead of it a boxy armoured housing
 * standing proud of the turret's flat face with the coaxial gun's port on its front, and the ribbed canvas bellows round
 * the tube on the housing's face (the side, SANDF and Armed Forces Day photographs; the critics, 2026-10-29: the boot
 * sat flush on the face). Gun frame. */
function buildOlifantMantlet(P: TankBuilderPort): void {
  // the cast block in the slot
  P.add('gunMount', box(0.62, 0.46, 0.42), 0, 0, 0.58);
  // the housing: 0.45 m long, 0.55 m tall, 0.60 m wide, its front edges chamfered, a seam and bolt heads round its face
  P.add('gunMount', sectionSolid([0.79, 1.16, 1.22].map((z, i) => {
    const hw = i === 2 ? 0.26 : 0.30, hh = i === 2 ? 0.235 : 0.275;
    return { z, ring: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as SectionPoint[] };
  })));
  P.add('gunMountDark', box(0.62, 0.012, 0.012), 0, 0.281, 1.00);
  for (const bx of [-0.20, 0, 0.20]) for (const by of [-0.20, 0.20]) P.add('gunMountDark', cylZ(0.018, 0.016, 8), bx, by, 1.228);
  // the coaxial gun's port on the housing's face, left of the tube
  P.add('gunMount', cylZ(0.050, 0.06, 12, 0.062), 0.20, 0.12, 1.25);
  P.add('gunMountDark', cylZ(0.018, 0.16, 8), 0.20, 0.12, 1.34);
  // the boot: eight ribs of one diameter, 0.5 m long, on the housing's face (the 2026-10-28 critic: a tapered boot read
  // as a smooth cone)
  for (let i = 0; i < 8; i++) {
    P.add('gunMountCloth', cylZ(i % 2 ? 0.172 : 0.195, 0.062, 18), 0, 0, 1.253 + i * 0.062);
  }
  P.add('gunMountDark', cylZ(0.13, 0.03, 18), 0, 0, 1.76);
}

/** The Sho't's IDF racks: an open basket round the bustle bin, a stowage box on the bustle's left rear corner and a
 * jerrycan cage on its right, both flush with the side bins' faces, so the turret keeps its width to the back in plan
 * (the Latrun Alef's rear: the box and the basket span the turret; the critic, 2026-10-29: the turret read egg-shaped
 * with the basket wider than its tail). */
function buildIdfTurretRacks(P: TankBuilderPort): void {
  // the left rear corner box, behind the side bins' back ends: the side bins' course and height, its inner face in the
  // casting, chamfered lid, hasps
  const bz0 = -1.30, bz1 = -1.80, BOT = 0.30, TOP = 0.74;
  P.add('turretDetail', slab(
    [0.76, BOT, bz0], [1.44, BOT, bz0], [1.42, BOT, bz1], [0.76, BOT, bz1],
    [0.76, TOP, bz0], [1.38, TOP, bz0], [1.36, TOP, bz1], [0.76, TOP, bz1]));
  P.add('turretDark', box(0.012, 0.012, bz0 - bz1 - 0.08), 1.37, TOP + 0.002, (bz0 + bz1) / 2);
  for (const f of [0.25, 0.75]) P.add('turretDark', box(0.02, 0.06, 0.05), 1.442, TOP - 0.10, bz0 + (bz1 - bz0) * f);
  // the full-width basket hung on the bustle, its top under the roof edge, its floor well clear of the AVDS deck (the
  // Latrun Sho't Kal Alef's rear, the Litani photograph; the critic, 2026-10-28: the shallow rack read as a deck cage)
  mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.90, d: 0.60, h: 0.44, fill: 0.6, rails: 2, seed: 9730 }),
    0, 0.44, -2.10);
  // the basket hangs on arms from the bin's lower edge
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.05, 0.40), s * 0.80, 0.45, -1.90);
    P.add('turretDark', xform(box(0.04, 0.04, 0.42), 0, 0, 0, 0.75, 0, 0), s * 0.80, 0.62, -1.92);
  }
  // the drone dock's two bars over the basket's left half (missionAttachmentReceiver.ts): the roof guns sweep the roof
  addMissionAttachmentReceiver(P, 'shot_kal');
  // jerrycan cage: a welded bar frame on two brackets off the casting
  const cx = -1.26, cz = -1.56, w = 0.30, d = 0.50, h = 0.52, y0 = 0.33;
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    P.add('turretDark', box(0.025, h, 0.025), cx + dx * w / 2, y0 + h / 2, cz + dz * d / 2);
  }
  for (const yy of [y0 + 0.012, y0 + h * 0.55, y0 + h]) {
    for (const dz of [-1, 1]) P.add('turretDark', box(w, 0.02, 0.02), cx, yy, cz + dz * d / 2);
    for (const dx of [-1, 1]) P.add('turretDark', box(0.02, 0.02, d), cx + dx * w / 2, yy, cz);
  }
  P.add('turretDark', box(w, 0.012, d), cx, y0 + 0.004, cz);
  for (const bz of [-0.16, 0.16]) {
    P.add('turretDark', box(0.44, 0.06, 0.06), cx + 0.30, y0 + 0.06, cz + bz);
    P.add('turretDark', box(0.06, 0.24, 0.06), cx + 0.18, y0 + 0.17, cz + bz);
  }
  mount(P, 'turret', FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 9740 }), cx, y0 + 0.02, cz, [0, Math.PI / 2, 0]);
}

/** Discharger No. 1 Mk 1: one six-tube block (two rows of three) at each front corner of the casting, facing forward and
 * a little outward (the head-on references), its guard bar round the muzzles. Owner 2026-10-27 ("add smoke canisters at
 * front"): the Sho't Kal carries them too. */
function buildSmokeDischargers(P: TankBuilderPort, z = 1.00, y = 0.56, xOut?: number, st: readonly CastStation[] = CASTING): void {
  for (const s of [-1, 1]) {
    const yaw = s * 0.30;
    const x = s * (xOut ?? castingHalfWidth(z - 0.04, y, st) + 0.06);
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
 * the right and two lifting eyes on top; a canvas dust seal laced round its rim where it enters the casting. The covered
 * marks (MarkDesign.cover) wear the green canvas cover of their photographs over a narrower block; the Sho't Kal its .50
 * over the gun. */
function buildMantlet(P: TankBuilderPort, m: MarkDesign): void {
  const block = (z: number, hw: number, top: number, bot: number): SolidSection => {
    const ring: SectionPoint[] = [];
    for (let k = 0; k < 16; k++) {
      const a = -Math.PI / 2 + (k / 16) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      ring.push([Math.pow(Math.abs(c), 0.3) * Math.sign(c) * hw, Math.pow(Math.abs(sn), 0.3) * Math.sign(sn) * (sn > 0 ? top : -bot)]);
    }
    return { z, ring };
  };
  // the casting: square-shouldered in section, its face rounding forward to the boss; under a canvas cover a narrower
  // block (1.28 m), the cast cheeks showing either side of the cover (the critics, 2026-10-28: the 1.7 m cover read as
  // a bulbous drum filling the turret's face)
  const span = m.cover ? 0.80 : 1;
  P.add('gunMount', sectionSolid([
    block(0.05, 0.80 * span, 0.30, -0.21), block(0.40, 0.80 * span, 0.30, -0.21), block(0.52, 0.78 * span, 0.29, -0.205),
    block(0.58, 0.74 * span, 0.27, -0.195), block(0.62, 0.64 * span, 0.23, -0.17), block(0.645, 0.46 * span, 0.17, -0.13),
  ], { centeredSideQuads: true, smoothSideEdges: [...Array(16).keys()] }));
  if (!m.cover) {
    // the gun's boss: a raised collar the tube leaves through (under a cover, the cover's sleeve)
    P.add('gunMount', cylZ(0.175, 0.12, 24, 0.215), 0, 0, 0.69);
    P.add('gunMountDark', xform(torus(0.18, 0.012, 24, 4), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, 0.745);
  }
  // the coaxial gun's port (the Mk 3's Besa, the Mk 5's Browning) and the sight's hooded aperture
  P.add('gunMount', cylZ(0.055, 0.08, 12, 0.07), 0.40, 0.04, 0.64);
  if (m.kit === 'aus') {
    // the coaxial .50 ranging gun (three tracers to lay the 20-pdr), its heavier barrel and flash hider
    P.add('gunMountDark', cylZ(0.024, 0.46, 10), 0.40, 0.04, 0.87);
    P.add('gunMountDark', cylZ(0.032, 0.07, 10), 0.40, 0.04, 1.08);
  } else {
    P.add('gunMountDark', cylZ(0.018, m.mk5 ? 0.28 : 0.22, 8), 0.40, 0.04, 0.76);
  }
  P.add('gunMount', box(0.20, 0.06, 0.12), -0.40, 0.19, 0.62);
  P.add('gunMountDark', box(0.14, 0.05, 0.012), -0.40, 0.15, 0.636);
  if (m.late) {
    // the Mk 13's .50 ranging gun in its armoured sleeve on the mantlet's upper left
    P.add('gunMount', box(0.16, 0.13, 0.22), 0.26, 0.20, 0.62);
    P.add('gunMountDark', cylZ(0.030, 0.42, 10, 0.034), 0.26, 0.20, 0.92);
    P.add('gunMountDark', cylZ(0.040, 0.20, 12), 0.26, 0.20, 0.80);
    // the L2 infra-red/white-light searchlight: a 0.56 m drum on the mantlet's top left beside the gun, its top at the
    // roof line, laid with the gun on an arm out of the block (the Bovington Mk 13; owner 2026-10-27: "the light should
    // be next to the gun ... on left side"), its front glass, guard bars and finned back
    const sx = 0.60, sy = 0.42, sz = 0.83, r = 0.28;
    P.add('gunMount', cylZ(r, 0.34, 32, r * 0.92), sx, sy, sz);
    P.add('gunMountGlass', cylZ(r * 0.86, 0.02, 32), sx, sy, sz + 0.175);
    P.add('gunMountDark', torus(r * 0.93, 0.022, 32, 6), sx, sy, sz + 0.18);
    for (let k = 0; k < 6; k++) P.add('gunMountDark', box(0.012, r * 1.7, 0.012), sx + (k - 2.5) * 0.08, sy, sz + 0.192);
    for (let k = 0; k < 3; k++) P.add('gunMount', cylZ(r * (0.78 - k * 0.1), 0.025, 24), sx, sy, sz - 0.19 - k * 0.035);
    P.add('gunMountDark', box(0.10, 0.10, 0.40), sx, 0.20, 0.50);
  }
  for (const lx of [-0.52, 0.52]) {
    P.add('gunMountDark', xform(torus(0.045, 0.014, 10, 6), 0, 0.04, 0, Math.PI / 2, 0, 0), lx, 0.30, 0.30);
    P.add('gunMount', box(0.09, 0.03, 0.06), lx, 0.30, 0.30);
  }
  // the canvas dust seal laced round the block's rim where it enters the casting (10 cm further out of the bare marks'
  // shorter nose)
  const hw = 0.80 * span, sz = m.shortNose ? 0.10 : 0;
  P.add('gunMountCloth', sectionSolid([block(0.12 + sz, hw + 0.035, 0.335, -0.245), block(0.22 + sz, hw + 0.03, 0.33, -0.24)],
    { centeredSideQuads: true, smoothSideEdges: [...Array(16).keys()] }));
  for (let k = 0; k < 9; k++) {
    const t = -1 + (2 * k) / 8;
    P.add('gunMountDark', cylZ(0.010, 0.11, 6), t * (hw - 0.08), 0.335, 0.17 + sz);
  }
  if (m.cover) {
    // the green canvas cover over the block, sagging between its lacing points, its sleeve strapped to the barrel (the
    // Sho't Kal's; the Dutch Mk 5/2, the Strv 104 and 105 and the Australian photographs show the same laced cover). The
    // Dutch Mk 5/2's is stretched flat across a riveted rectangular frame (the head-on photograph; the critic,
    // 2026-10-29: the rounded cover read as a dome).
    const framed = isMk52(m);
    const drape = (z: number, hw: number, top: number, bot: number, sag: number): SolidSection => {
      const ring: SectionPoint[] = [], p = framed ? 0.18 : 0.45;
      for (let k = 0; k < 16; k++) {
        const a = -Math.PI / 2 + (k / 16) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        const r = Math.pow(Math.abs(c), p) * Math.sign(c), q = Math.pow(Math.abs(sn), p) * Math.sign(sn);
        ring.push([r * hw, (sn > 0 ? q * top : q * bot) - (Math.abs(c) < 0.6 && sn < 0 ? sag : 0)]);
      }
      return { z, ring };
    };
    const hc = hw + 0.05;
    P.add('gunMountCloth', sectionSolid(framed ? [
      drape(0.24, hc, 0.35, 0.235, 0.0), drape(0.42, hc, 0.34, 0.235, 0.015), drape(0.56, hc - 0.01, 0.335, 0.232, 0.01),
      drape(0.60, hc - 0.03, 0.32, 0.222, 0.0),
    ] : [
      drape(0.24, hc, 0.35, 0.235, 0.0), drape(0.42, hc, 0.34, 0.235, 0.02), drape(0.53, hc - 0.02, 0.33, 0.23, 0.03),
      drape(0.60, hc - 0.07, 0.30, 0.215, 0.02), drape(0.65, 0.48, 0.24, 0.19, 0.0), drape(0.70, 0.22, 0.17, 0.16, 0.0),
    ], { centeredSideQuads: true, smoothSideEdges: [...Array(16).keys()] }));
    if (framed) {
      // the riveted steel frame round the cover's face, and the cover's short collar round the tube
      const fw = hc + 0.02, ft = 0.355, fb = 0.21, fz = 0.585;
      P.add('gunMountDark', box(2 * fw, 0.045, 0.05), 0, ft, fz);
      P.add('gunMountDark', box(2 * fw, 0.045, 0.05), 0, -fb, fz);
      for (const s of [-1, 1]) P.add('gunMountDark', box(0.045, ft + fb, 0.05), s * fw, (ft - fb) / 2, fz);
      for (let k = 0; k < 9; k++) {
        const x = -fw + 0.06 + k * (2 * fw - 0.12) / 8;
        for (const y of [ft, -fb]) P.add('gunMountDark', cylZ(0.014, 0.012, 6), x, y, fz + 0.03);
      }
      P.add('gunMountCloth', cylZ(0.13, 0.12, 16, 0.15), 0, 0, 0.66);
    }
    for (const [fz, fy, fw] of [[0.57, 0.20, 1.10], [0.61, 0.04, 1.14], [0.58, -0.12, 1.04]] as const) {
      P.add('gunMountCloth', xform(cylX(0.020, fw, 8), 0, 0, 0), 0, fy, fz);
    }
    P.add('gunMountCloth', cylZ(0.100, 0.30, 14, 0.13), 0, 0, 0.86);
    for (const sz of [0.76, 0.98]) P.add('gunMountDark', cylZ(0.112 + (0.98 - sz) * 0.08, 0.025, 14), 0, 0, sz);
  }
  if (m.kit === 'aus') {
    // the infra-red/white searchlight on its pedestal on the mantlet's top right, linked to the gun (the owner's
    // reference; the 1967 Mk 5/1 refit's night equipment)
    const lx = -0.30, ly = 0.48, lz = 0.52, r = 0.15, seg = P.q ? 24 : 14;
    P.add('gunMount', cylZ(r, 0.26, seg), lx, ly, lz);
    P.add('gunMountDark', cylZ(r + 0.008, 0.024, seg), lx, ly, lz + 0.12);
    P.add('gunMountGlass', markVehicleNightLens(cylZ(r * 0.84, 0.006, seg), 'headlight', { searchlight: true }), lx, ly, lz + 0.131);
    P.add('gunMountDark', cylZ(r * 0.62, 0.035, seg), lx, ly, lz - 0.14);
    P.add('gunMount', box(0.10, 0.12, 0.16), lx, 0.36, lz - 0.02);
  }
  if (m.idf) {
    // the .50 Browning laid over the gun on its post through the cover (the October 1973 photograph; the critic: no
    // photograph shows a searchlight there): the receiver well forward, clear of the casting's roof at full elevation,
    // its jacket, barrel and flash hider, the spade grips and the ammunition box on its left
    P.add('gunMountDark', box(0.08, 0.22, 0.10), 0, 0.33, 0.60);
    P.add('gunMountDark', box(0.15, 0.17, 0.60), 0, 0.52, 0.80);
    P.add('gunMountDark', cylZ(0.040, 0.28, 10), 0, 0.53, 1.24);
    P.add('gunMountDark', cylZ(0.024, 0.80, 8), 0, 0.53, 1.78);
    P.add('gunMountDark', cylZ(0.032, 0.06, 10), 0, 0.53, 2.21);
    P.add('gunMountDark', box(0.10, 0.06, 0.06), 0, 0.52, 0.48);
    P.add('gunMountDark', box(0.10, 0.16, 0.26), 0.13, 0.50, 0.80);
  }
}

function buildMainGun(P: TankBuilderPort, m: MarkDesign): number {
  const len = m.gunLen;
  if (m.gun === 'l7') {
    // 105 mm L7: the concentric bore evacuator a little behind mid-barrel, a plain muzzle
    KIT.buildGun(P, { len, r: 0.074, evac: m.kit === 'olifant' ? 0.42 : 0.45, evacR: 1.55, baseR: 0.15, collar: false, sleeve: m.late || m.kit === 'strv105' || m.kit === 'olifant' || isMk52(m) });
    muzzleBore(P, { len, r: 0.074 });
  } else if (m.gun === '165') {
    // 165 mm L9A1 demolition gun: a short, fat piece - a thin root out of the mantlet's boss, the bore evacuator's fat
    // drum, a short chase and the lipped muzzle collar (the Duxford AVRE's profile scaled to its 3.0 m height:
    // about 1.4 m out of the mantlet)
    KIT.buildGun(P, { len, r: 0.105, evac: null, baseR: 0.15, collar: false, tubeInset: 0.22 });
    const seg = P.q ? 28 : 14;
    P.add('gun', cylZ(0.120, 0.32, seg), 0, 0, 0.86);
    // (the critic, 2026-10-28: the drum 0.42 m and the muzzle rings 0.40 m across, so the piece reads stubby and fat)
    P.add('gun', cylZ(0.210, 0.05, seg, 0.120), 0, 0, 1.005);
    P.add('gun', cylZ(0.210, 0.56, seg), 0, 0, 1.30);
    P.add('gun', cylZ(0.115, 0.05, seg, 0.210), 0, 0, 1.605);
    // the muzzle collar: one plain sleeve over the tube's last 0.22 m, 0.7 of the drum across, with a lip at its face (the
    // critics, 2026-10-29: the waisted spool 2 cm clear of the tube, then a collar nearly as wide as the drum)
    P.add('gun', cylZ(0.145, 0.26, seg), 0, 0, len - 0.13);
    P.add('gun', cylZ(0.160, 0.025, seg), 0, 0, len - 0.0125);
    muzzleBore(P, { z: len, r: 0.0825 });
  } else if (m.gun === '20pdrB') {
    // 20-pdr Type B: a short, nearly cylindrical fume-extractor can 47 % along (the Strv 81B photographs)
    KIT.buildGun(P, { len, r: 0.068, evac: null, baseR: 0.14, collar: false });
    const seg = P.q ? 28 : 12, ez = len * 0.47;
    P.add('gun', cylZ(0.128, 0.40, seg), 0, 0, ez);
    P.add('gun', cylZ(0.128, 0.06, seg, 0.080), 0, 0, ez - 0.23);
    P.add('gun', cylZ(0.080, 0.06, seg, 0.128), 0, 0, ez + 0.23);
    muzzleBore(P, { len, r: 0.068 });
  } else {
    // 20-pdr Type A: no fume extractor, the muzzle counterweight; its thicker breech-end jacket runs 1.2 m out of the
    // mantlet's cover and steps down to the chase (the Bovington and Swiss Mk 3; the critic, 2026-10-29: an even thin
    // tube)
    KIT.buildGun(P, { len, r: 0.068, evac: null, baseR: 0.14, collar: false, tubeInset: 0.40 });
    P.add('gun', cylZ(0.098, 1.12, P.q ? 28 : 12), 0, 0, 1.26);
    P.add('gun', cylZ(0.070, 0.12, P.q ? 28 : 12, 0.098), 0, 0, 1.88);
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
  buildGuards(P, m.kit !== 'olifant');
  yield 'centurionHullBody';
  buildGuardBins(P);
  if (m.kit === 'olifant') buildOlifantSkirts(P);
  else if (m.kit === 'aus') buildHorstmannBogies(P);
  else buildSkirts(P, m.kit === 'strv105' ? STRV105_SKIRT_BOT : SKIRT.bot);
  if (m.kit === 'avre') buildAvreSkirtBolts(P);
  yield 'centurionHullSides';
  if (m.kit === 'olifant') buildOlifantRunningGear(P);
  else buildRunningGear(P);
  yield 'centurionRunningGear';
  buildGlacisAndNose(P, m);
  if (m.kit === 'avre') buildDozer(P);
  buildEngineDeck(P, m);
  buildRearPlate(P, m);
  buildHullKit(P, m);
  yield 'centurionHullFittings';
  P.turretG.position.set(0, RING.y, RING.z);
  P.gunG.position.set(0, trunnionY(m), TRUNNION.z);
  if (m.kit === 'olifant') {
    buildOlifantTurret(P);
  } else {
    buildCasting(P, m);
    buildTurretBins(P);
    // the Mk 13 carries an open mesh basket on the bustle where the earlier marks' box bin stood (the Bovington Mk 13)
    if (m.late) buildLateBustleBasket(P);
    else if (isMk52(m)) buildMk52BustleBasket(P);
    // (the Australian basket hangs on the bustle itself)
    else if (m.kit !== 'aus') buildBustleBin(P);
  }
  if (m.idf) buildIdfTurretRacks(P);
  if (m.kit === 'strv105') buildStrv105TurretKit(P);
  if (m.kit === 'avre') buildAvreTurretKit(P);
  if (m.kit === 'aus') buildAusTurretBaskets(P);
  yield 'centurionTurretCasting';
  if (m.kit === 'olifant') {
    buildOlifantRoof(P);
  } else {
    buildRoof(P, m);
    // the Strv 105's and the AVRE's blocks stand on the bins behind their corner packages, below the roof line (the Strv
    // 104 photographs; the critic, 2026-10-29: 0.25 m over it in profile); the British Mk 5/2's and Mk 13's
    // six-tube banks on the side bins' front faces, outboard, level with the mantlet (the Dutch Mk 5/2 head-on photograph,
    // the Bovington Mk 13)
    if (m.kit === 'strv105' || m.kit === 'avre') buildSmokeDischargers(P, 0.36, 0.80);
    else if (m.mk5 && !m.swedish && !m.idf && m.kit === 'none') buildSmokeDischargers(P, 0.84, 0.50, 1.30);
    // (on the bare marks' shorter nose the blocks stand 12 cm further back, on the cheeks)
    else buildSmokeDischargers(P, m.shortNose ? 0.88 : 1.00, 0.56, undefined, castingOf(m));
  }
  yield 'centurionTurretFittings';
  if (m.kit === 'olifant') buildOlifantMantlet(P);
  else buildMantlet(P, m);
  buildMainGun(P, m);
  P.turretG.userData.centurionGunHousingRig = {
    gunPivotLocal: [0, trunnionY(m), TRUNNION.z],
    movingHousingBuckets: ['gunMount', 'gunMountDark', 'gunMountCloth'],
  };
  if (m.idf) {
    // the company chevron, point down, on each middle side plate; the tank's number on the basket's sides
    // (a 'number' decal draws the tank's tactical number; any other kind draws its own text)
    P.decal('hull', 'chevron', 'V', 0.55, [SKIRT.outer + 0.004, 1.10, -0.30], Math.PI / 2);
    P.decal('hull', 'chevron', 'V', 0.55, [-SKIRT.outer - 0.004, 1.10, -0.30], -Math.PI / 2);
  } else if (m.kit === 'olifant') {
    P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-(OLIFANT_TURRET.hw + 0.004), 0.55, -1.30], -Math.PI / 2);
  } else if (m.kit !== 'avre' && m.kit !== 'aus') {
    // (the AVRE's cassettes cover the bins' faces: its numbers are the hull's; the Australian number rides on the basket)
    P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-1.52, 0.48, -0.30], -Math.PI / 2);
  }
  // the hull numbers on the front side plates (the Olifant's between its armoured modules' bolts)
  // (the Australian tank's skirts are off: its number rides on the turret basket)
  if (m.kit !== 'aus') {
    const [nx, ny, nz] = m.kit === 'olifant' ? [OLIFANT_SKIRT.outer + 0.004, 1.14, 0.92] : [1.68, 1.08, 1.40];
    P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [nx, ny, nz], Math.PI / 2);
    P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [-nx, ny, nz], -Math.PI / 2);
  }
  P.topY = 1.0;
}
