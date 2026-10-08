// src/world/maps/skybridge.ts — Skybridge Chasm, redesigned 2026-10-03 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The drowned gorge and its lakes, the five roads, the control district (standing exactly as PR #9's head seated it:
// props.ts townPlan), the bridge, the palette, sky, name and id are the map's identity and stay; the canyon's ground
// is new. The old floor was a seed-random mesa field (shelves wherever the noise crossed its threshold) over two 770 m
// ridges laid end to end across the middle. Its sightlines closed to a 76 m median (1.7 % at 300 m or more), six
// structures stood in the carriageways, the deployments stood 863 m apart (alpha's block in the south-west corner,
// bravo's seven pads spread 494 m along the north edge), and the zone-control discs stood up to 3.1 times farther from
// one team; bots drove off the shelves (twelve standard matches: 26 damaging falls, 2177 hp in all, the worst 489 hp).
//
// Reference: Glen Canyon above Lake Powell: a canyon drowned by its reservoir, bedded sandstone walls standing in
// segments between the side canyons that break them, talus under every wall, and a high crossing at the narrows.
//
// The story on the ground: the gorge runs north to south between rock shoulders, bedded sandstone walls 18 m high in
// three segments a side, broken where the cross roads pass so the floor splits into a west lane, the gorge and an east
// lane. Every segment ends in a nose (its wall and talus turning round the end, so no taper ramps onto a cap and no
// apron stops in a cut) and stands whole through the deployment corridors and the district's feather. The drowned
// gorge's basin holds the lakes below the control district. The layout turns about (5, 60), the middle of the shoulder
// system: the teams come in from the gorge's two ends, each in a 4 x 2 block between the end segments and behind a gate
// butte that screens it down the gorge's axis, and each block, its segments, its butte and its strongpoints are the
// other's rotation there. The zone-control discs stand on the line of equal driven distance: the west lane's yard, the
// gorge's west shore (also the turbo-ball kickoff) and the east lane's yard.
//
// The control district (the map-revival lane, 2026-10-05): the Bureau of Reclamation's works at Glen Canyon Dam and
// its town, Page, built where the town plan seats them in the glencanyon kit (maps/regional/glencanyon.ts). The
// powerhouse of board-formed concrete with its penstocks coming down from the anchor block and the catwalk truss broken
// between them (the broken high crossing); the control building, the surge tower, the switchyard's lattice dead-end
// towers and the transformer yards; the microwave relay tower; the gate-hoist houses and the penstock runs on their
// saddles; the visitor centre with its overlook, or the town's school; the field offices and steel warehouses; and
// Page's ranch houses under shingled gables with their carports, its fire station and its water tower.
//
// Lake Powell's arm and Glen Canyon Dam (the map-revival lane, 2026-10-06, Skybridge round 4; gauntlet waves 170-171:
// "the landform must be inverted into a deep, sheer-walled canyon arm holding the water against a curved dam, with the
// township and works on the slickrock rim above"; "the reservoir reads as a pit lake or shallow milky trench in a flat
// sand plain"). The district stands on the slickrock at the plain's level. Below it a canyon arm 68 m wide is cut 22 m
// into the rock, with sheer walls straight into the water from a rounded head under the district's south to a square
// end at the road across the north (road 5). The water lies wall to wall: the lake's discs are round and pulled 3 m into
// the walls, so no dry ground lies under the waterline anywhere. The dam stands on that road (reservoirDam.ts): an arch
// convex to the reservoir, its intakes and gantry over the water, its battered downstream face dropping 28 m into a
// tailwater pocket that holds the powerhouse at its toe. Bots route round all water ('avoid-liquid'). Nothing can reach
// a floor: the walls give no way down, and parapets and a kerb guard the road over the dam and the pocket's rim. The
// ring's own dam and its canyon (round 2) are retired, so the map has one dam, in reach.

import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
import type { ReservoirDamSite } from './reservoirDam.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS } from './townPlans.generated.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The canyon's section: a sheer wall from 0.86 to 0.92 of the half-width over a level floor, no talus. */
const ARM_WALL = [0.86, 0.92] as const;
const canyon = (extra: { cliffEnd?: 'nose' | 'both'; outline?: number }) =>
  ({ profile: 'canyon' as const, wall: ARM_WALL, apron: 0, outline: 0.04, rough: 0, ...extra });
/** The arm: half-width, depth, bearing (a ridge's yaw: 80 runs north-north-east) and length (m). */
const ARM_HALF = 37, ARM_DEPTH = -22, ARM_YAW = 80, ARM_LENGTH = 250;
/** The tailwater pocket below the dam: half-width, depth, length, and its middle along the road from the dam's (m). */
const POCKET_HALF = 13, POCKET_DEPTH = -28, POCKET_LENGTH = 38, POCKET_ALONG = -13;
/** Road 5's junctions either side of the arm: the dam's crest is the road between them. */
const CREST_A = [-73.9, 235.78] as const, CREST_B = [42, 204] as const;
const CREST_L = Math.hypot(CREST_B[0] - CREST_A[0], CREST_B[1] - CREST_A[1]);
const CREST_U = [(CREST_B[0] - CREST_A[0]) / CREST_L, (CREST_B[1] - CREST_A[1]) / CREST_L] as const;
/** The dam's middle on the road, and the gap from the road's centre line to the arm's end and the pocket's wall (m). */
const DAM_X = -10, DAM_Z = CREST_A[1] + (DAM_X - CREST_A[0]) / CREST_U[0] * CREST_U[1], CREST_GAP = 6;
/** Half the dam's chord between its abutments (m): the arm's rim. */
const DAM_HALF_CHORD = 35;
/** The disc cores reach this far past the walls' feet, so the water meets every wall: the arm's walls wander (their
 * outline), the pocket's are cut straight. */
const WATER_PAD = 2, POCKET_PAD = 0.5;

function armTerrain() {
  const a = [Math.cos(ARM_YAW * Math.PI / 180), Math.sin(ARM_YAW * Math.PI / 180)];
  const n = [a[1], -a[0]], north = [-CREST_U[1], CREST_U[0]];
  const end = [DAM_X - a[0] * CREST_GAP, DAM_Z - a[1] * CREST_GAP];
  const head = [end[0] - a[0] * ARM_LENGTH, end[1] - a[1] * ARM_LENGTH];
  const mid = [end[0] - a[0] * ARM_LENGTH / 2, end[1] - a[1] * ARM_LENGTH / 2];
  const pocket = [DAM_X + CREST_U[0] * POCKET_ALONG + north[0] * (CREST_GAP + POCKET_HALF),
    DAM_Z + CREST_U[1] * POCKET_ALONG + north[1] * (CREST_GAP + POCKET_HALF)];
  const crestYaw = Math.atan2(CREST_U[1], CREST_U[0]) * 180 / Math.PI;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const scale = { corridorScale: 1, settlementScale: 1, wetScale: 1 };
  const landforms = [
    { kind: 'ridge' as const, x: r1(mid[0]), z: r1(mid[1]), length: ARM_LENGTH, width: ARM_HALF, height: ARM_DEPTH, yawDeg: ARM_YAW,
      ...scale, geology: canyon({ cliffEnd: 'both' }) },
    { kind: 'knoll' as const, x: r1(head[0]), z: r1(head[1]), rx: ARM_HALF, rz: ARM_HALF, height: ARM_DEPTH, ...scale, geology: canyon({}) },
    { kind: 'ridge' as const, x: r1(pocket[0]), z: r1(pocket[1]), length: POCKET_LENGTH, width: POCKET_HALF, height: POCKET_DEPTH,
      yawDeg: r1(crestYaw), ...scale, geology: canyon({ cliffEnd: 'both', outline: 0 }) },
  ];
  // the water: round discs (authored radii, all one) whose cores (0.96 of the radius) reach WATER_PAD past the walls'
  // feet — one over the head, one every 12 m down the arm's axis, one by each wall where the axis discs fall short of the
  // dam's face over the arm's square end; the pocket's along its axis and one in each corner
  const round = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] as const;
  const lakes: { x: number; z: number; r: number; depth: number; level: number; bankBand: number; radii: typeof round }[] = [];
  const disc = (x: number, z: number, core: number, level: number) =>
    lakes.push({ x: r1(x), z: r1(z), r: r1(core / 0.96), depth: 1.2, level, bankBand: 0.98, radii: round });
  const floor = ARM_HALF * ARM_WALL[0], core = floor + WATER_PAD;
  disc(head[0], head[1], core, ARM_DEPTH);
  for (let t = 12; t <= ARM_LENGTH - floor; t += 12) disc(head[0] + a[0] * t, head[1] + a[1] * t, core, ARM_DEPTH);
  // (by each wall at the square end two: a large one where the axis discs' reach along the wall ends, and a small one up
  // to the dam's face, which stands over the end's fade)
  const fade = ARM_LENGTH * 0.03;
  for (const side of [-1, 1]) for (const [back, size] of [[fade + 11, 10], [fade + 3.5, 5]] as const) {
    const across = core - size;
    disc(end[0] - a[0] * back + n[0] * side * across, end[1] - a[1] * back + n[1] * side * across, size, ARM_DEPTH);
  }
  const pfloor = POCKET_HALF * ARM_WALL[0], pcore = pfloor + POCKET_PAD, pfade = POCKET_LENGTH * 0.03;
  const pend = POCKET_LENGTH / 2 - pfade - pcore + POCKET_PAD, steps = Math.max(1, Math.round(2 * pend / 8));
  for (let i = 0; i <= steps; i++) {
    const t = -pend + 2 * pend * i / steps;
    disc(pocket[0] + CREST_U[0] * t, pocket[1] + CREST_U[1] * t, pcore, POCKET_DEPTH);
  }
  for (const se of [-1, 1]) for (const sa of [-1, 1]) for (const size of [6, 2.5]) {
    const t = se * (POCKET_LENGTH / 2 - pfade - size + POCKET_PAD), w = sa * (pfloor - size + POCKET_PAD);
    disc(pocket[0] + CREST_U[0] * t + north[0] * w, pocket[1] + CREST_U[1] * t + north[1] * w, size, POCKET_DEPTH);
  }
  return { landforms, lakes };
}
const ARM = armTerrain();

/** The kerbs along the arm's rims from the dam's abutments: each side, a run from the end of the road's upstream parapet
 * (reservoirDam.ts: the dam's half-chord and 8 m) to the rim 37 m off the axis (the rim, its wander and a hull's width),
 * then 45 m up the arm along it (the swap test, 2026-10-06: one hull slid down the west corner the road's banks grade
 * and sat in the water by the dam for the rest of a match). */
function armRimGuards(): (readonly [number, number, number, number])[] {
  const a = [Math.cos(ARM_YAW * Math.PI / 180), Math.sin(ARM_YAW * Math.PI / 180)], n = [a[1], -a[0]];
  const v = [CREST_U[1], -CREST_U[0]];
  const end = [DAM_X - a[0] * CREST_GAP, DAM_Z - a[1] * CREST_GAP], off = 37, from = 5, to = 50;
  const r1 = (q: number[]) => q.map((x) => Math.round(x * 10) / 10) as unknown as readonly [number, number, number, number];
  const runs: (readonly [number, number, number, number])[] = [];
  for (const side of [-1, 1]) {
    const parapetEnd = [DAM_X + CREST_U[0] * side * (DAM_HALF_CHORD + 8) + v[0] * 6, DAM_Z + CREST_U[1] * side * (DAM_HALF_CHORD + 8) + v[1] * 6];
    const rim = [end[0] + n[0] * side * off, end[1] + n[1] * side * off];
    const start = [rim[0] - a[0] * from, rim[1] - a[1] * from], stop = [rim[0] - a[0] * to, rim[1] - a[1] * to];
    runs.push(r1([...parapetEnd, ...start]), r1([...start, ...stop]));
  }
  return runs;
}

/** The kerbs round the arm's head: an arc 37 m from the head's centre round its closed end (the brink stands 34.5-35 m
 * out) and on along both rims 60 m toward the dam, in runs of about 10 m so each kerb sits on its own ground (the swap
 * test, 2026-10-07: in 2 of 55 games a hull went over the head's east rim, sat in the water at (-27, -43) beyond the
 * reach of every bot, and held the match to its 15-minute cap). */
function armHeadGuards(): (readonly [number, number, number, number])[] {
  const a = [Math.cos(ARM_YAW * Math.PI / 180), Math.sin(ARM_YAW * Math.PI / 180)], n = [a[1], -a[0]];
  const end = [DAM_X - a[0] * CREST_GAP, DAM_Z - a[1] * CREST_GAP];
  const head = [end[0] - a[0] * ARM_LENGTH, end[1] - a[1] * ARM_LENGTH], off = 37, along = 60;
  // in the head's frame: `s` along the arm toward the dam, `c` across it (n)
  const at = (s: number, c: number) => [head[0] + a[0] * s + n[0] * c, head[1] + a[1] * s + n[1] * c];
  const pts: number[][] = [];
  for (let s = along; s > 0; s -= 10) pts.push(at(s, off));
  for (let deg = 90; deg <= 270; deg += 15) {
    const t = deg * Math.PI / 180;
    pts.push(at(Math.cos(t) * off, Math.sin(t) * off));
  }
  for (let s = 10; s <= along; s += 10) pts.push(at(s, -off));
  const r1 = (q: number[]) => q.map((x) => Math.round(x * 10) / 10) as unknown as readonly [number, number, number, number];
  const runs: (readonly [number, number, number, number])[] = [];
  for (let i = 0; i + 1 < pts.length; i++) runs.push(r1([...pts[i], ...pts[i + 1]]));
  return runs;
}

/** The dam on road 5 over the arm's end (reservoirDam.ts, laid by the 'dam' dressing kit). */
export const SKYBRIDGE_DAM: ReservoirDamSite = {
  x: DAM_X, z: Math.round(DAM_Z * 100) / 100, roadDeg: Math.atan2(CREST_U[1], CREST_U[0]) * 180 / Math.PI,
  halfChordM: DAM_HALF_CHORD, archRadiusM: 80, abutmentM: CREST_GAP + ARM_LENGTH * 0.03, roadHalfM: 5.2,
  reservoirBedY: ARM_DEPTH, tailwaterBedY: POCKET_DEPTH,
  pocketFromM: POCKET_ALONG - POCKET_LENGTH / 2, pocketToM: POCKET_ALONG + POCKET_LENGTH / 2,
  pocketHalfM: POCKET_HALF * ARM_WALL[1], pocketWallM: CREST_GAP + POCKET_HALF * (1 - ARM_WALL[1]),
  rimGuards: [...armRimGuards(), ...armHeadGuards()],
};

export default {
  id: 'skybridge',
  name: 'Skybridge Chasm',
  blurb: 'A broken high crossing and fortress-scale control works span a deep flooded canyon',
  // (round 4) the canyon's water is a barrier: bots route round it (the walls give no way down to it)
  navigationWaterPolicy: 'avoid-liquid',
  terrain: {
    hillScale: 0.62, microScale: 0.66, rimH: 58, softLakes: true,
    // the authored shoulders replace the noise mesas, and the rock gate reads them (terrain.ts landformRock)
    mesas: null, landformRock: true,
    marshes: [],
    // (round 4: the reservoir's arm and the tailwater pocket, wall to wall; armTerrain above)
    lakes: ARM.lakes,
    // three aprons for the zone-control discs on the line of equal driven distance: the west lane's yard, the gorge's
    // west shore between the lake and the west middle segment (tilted to its ground) and the east lane's yard (tilted
    // to its ground)
    hardstands: [
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): each sited by tools/hardstand-site.mjs on its ground
      { x: -300, z: 62, width: 56, length: 56, yawDeg: 0, level: -2.9, grade: 0, bankM: 16 },
      { x: -139, z: 49, width: 56, length: 56, yawDeg: -100, level: 0, grade: 0.08, bankM: 20 },
      { x: 310, z: 42, width: 56, length: 56, yawDeg: -170, level: -1.2, grade: 0.074, bankM: 16 },
    ],
    village: { x0: -176, x1: 186, z0: -170, z1: 196, cx: 8, cz: 16, feather: 54, flatten: 0.72, relief: 0.28 },
    // each cross road's junctions and the northern fork are nodes both roads share, so the junction blend grades one
    // point there (no step between two bakes)
    roads: { paths: [
      [[-430, -450], [-350, -314], [-278, -172], [-239.23, -93.35], [-208, -30], [-132, 118], [-73.9, 235.78], [-58, 268], [-35.25, 319.61], [24, 454]],
      [[-116, -458], [-72, -318], [-18, -178], [24.53, -81.61], [42, -42], [116, 92], [198, 230], [198.48, 230.63], [292, 354], [380, 456]],
      [[356, -454], [294, -310], [236, -166], [205.36, -99.16], [170, -22], [92, 116], [42.72, 204.19], [16, 252], [-35.25, 319.61], [-78, 376], [-164, 466]],
      [[-382, -126], [-246, -92], [-239.23, -93.35], [-116, -118], [18, -80], [24.53, -81.61], [148, -112], [205.36, -99.16], [282, -82], [394, -104]],
      [[-326, 252], [-204, 210], [-82, 238], [-73.9, 235.78], [42, 204], [42.72, 204.19], [168, 238], [198.48, 230.63], [292, 208]],
    ] },
    landforms: [
      // The canyon's rock shoulders: bedded sandstone walls (cliff bands, benches, talus; landformGeology.ts) along the
      // west and east, broken where the two cross roads pass, so the floor splits into a west lane, the gorge and an east
      // lane. Every segment ends in a nose: its wall and talus apron turn round the end, so no taper ramps up onto a cap
      // and no apron stops in a cut. The segments are each other's rotation about (5, 60), the middle of the system, so
      // each deployment stands between two 176 m end segments with a 100 m gap 150-250 m ahead of it (the swap test,
      // 2026-10-03: with 300 m south segments the north deployment won 81 of 120 games over three layouts).
      ...[[-215, -238, 176], [-215, 60, 220], [-215, 358, 176], [225, -238, 176], [225, 60, 220], [225, 358, 176]]
        .map(([x, z, length]) => ({ kind: 'ridge', x, z, length, width: 34, height: 18, yawDeg: 90, corridorScale: 1, settlementScale: 1,
          geology: { profile: 'butte' as const, wall: [0.35, 0.6] as const, apron: 0.28, cliffEnd: 'nose' as const,
            strata: { stepM: 4.5, riser: 0.35 },
            outline: 0.25, rough: 0.8, gullies: { count: 3, depthM: 2, width: 0.5 } } })),
      // the gate buttes: one in front of each deployment, each the other's rotation about (5, 60), screening the
      // deployments from each other down the gorge's axis (whole through the deployment corridors: bots drive round them)
      // (round 3, gauntlet wave 133: "a smooth, evenly textured sandcastle-like mound with no cap-rock, ledges or talus":
      // Titan Gorge's accepted butte section over the same footprints and toes — a level cap to a sharp rim at 0.94 of
      // the wall's foot, a near-vertical wall in thick beds down to a concave talus apron with its boulders, shallow
      // flutes — standing 16 -> 24 m, as tall as the wall is wide)
      ...[[10, -220], [0, 340]].map(([x, z]) => ({ kind: 'knoll', x, z, rx: 22, rz: 20, height: 24, corridorScale: 1, settlementScale: 1,
        geology: { profile: 'inselberg' as const, outline: 0.2, foot: 0.55, footVary: 0.08, apron: 0.34, rim: 0.94,
          flutes: { count: 5, depth: 0.12 }, rough: 0.45, boulders: 14, strata: { stepM: 6, riser: 0.2 },
          gullies: { count: 3, depthM: 1.2, width: 0.4 } } })),
      // (round 4, gauntlet waves 170-171: the basin under the lakes and the round-2 trough round them go — the reservoir
      // is the canyon arm, its dam and the tailwater pocket; armTerrain above)
      ...ARM.landforms,
    ],
  },
  spawns: {
    // The teams come in from opposite ends of the gorge: bravo's seven pads on the northern floor and alpha's 4 x 2 block
    // as their rotation about (5, 60) on the southern floor, 721 m apart (the swap test, 2026-10-03: alpha's south-west
    // corner block lost 27 of 40 games to bravo's northern block, the deployments exchanged or not; the pacing receipt:
    // at 677 m a 2v2 ended in 102 s).
    player: { x: 10.6, z: -296.3 },
    enemies: [{ x: 11.4, z: 416.3 }, { x: 3.4, z: 416.3 }, { x: -4.6, z: 416.3 }, { x: -12.6, z: 416.3 }, { x: 11.4, z: 426.3 }, { x: 3.4, z: 426.3 }, { x: -4.6, z: 426.3 }],
  },
  splat: {
    // round 47 (2026-09-23, owner: "ground patterns are too black"): lightness FLOORS like every sibling canyon map
    // (Titan 0.19/0.24, Redrock 0.19/0.24, Mars 0.20/0.24) — `l * 0.52` with no floor let the procedural fallback
    // bottom out at black; hue and saturation unchanged. These tone hooks shape the procedural layers only; the
    // rendered albedo is the sourced 'skybridge' row in sourcedTextures.ts.
    grassTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.40), clamp01(0.21 + l * 0.62)],
    dirtTone: (h: number, s: number, l: number) => [0.06, clamp01(s * 0.42), clamp01(0.24 + l * 0.48)],
    sandstone: true,
    // (round 3, gauntlet wave 133: "a smooth, evenly coloured pinkish wall": Navajo sandstone is red-orange, its beds
    // light and dark — the rock a shade more orange, half again as saturated, its beds in twice the tonal range)
    rockTone: (h: number, s: number, l: number) => [0.05, clamp01(s * 0.85 + 0.08), clamp01(0.36 + (l - 0.5) * 0.9)],
    // round 47 (2026-09-23, owner: "ground patterns are too black"): without this the sourced-texture resolver fell
    // through to Verdant — photo grass/dirt and raw near-black Rock058 in place of the sandstone strata above
    sourcedPalette: 'skybridge',
    mudTone: (h: number, s: number, l: number) => [0.54, clamp01(s * 0.72), clamp01(l * 0.58)],
    // The drowned gorge is navigable liquid, not a blue-grey terrain stain.
    // It shares the terrain material and interaction mask, so this adds no
    // water mesh or draw pass while tracks receive the common wake/spray path.
    seaLake: true, seaFoam: 0.10, seaRamp: [0.18, 0.54], iceDrift: 0.02,
    marshGloss: 0.90, iceSky: [0.18, 0.30, 0.38],
    // round 47: tintB was the darkest macro darkener in the game (0.61/0.40/0.34, luma ×0.46 inside the dark-clover
    // patches) — same red-orange hue (12°), every channel ≥ 0.75 (luma ×0.81), the desert register (0.84/0.78/0.67)
    tintA: [1.02, 0.67, 0.49], tintB: [0.88, 0.78, 0.75], tintC: [1.00, 0.69, 0.49],
    // (round 3: the strata bands stay 0.18 — the gate buttes now stand in Titan's round section, whose 0.22 beds read
    // as "wood grain" and "sawtooth stripes" wrapped round a stump in wave 134; the walls' bedding comes from the rock's
    // wider tonal range above)
    roadTint: [0.61, 0.53, 0.47], strata: 0.18, sandMacro: 0.62,
    rippleAmp: 0.14, midRelief: 1.0, midReliefFar: 840,
  },
  vegetation: {
    // (round 3, gauntlet wave 133: "uniform orange dune sand dotted with lush green trees": Glen Canyon's trees are the
    // juniper and the pinyon (treeBiomes.ts: cedar and pine take their forms); the cottonwoods were four in ten and the
    // scrub was theirs — now a few, and the scrub the junipers')
    species: ['pine', 'poplar', 'cedar'], clusterMix: [['cedar', 0.50], ['pine', 0.42], ['poplar', 0.08]],
    loneMix: [['cedar', 0.52], ['pine', 0.40], ['poplar', 0.08]], rimMix: [['pine', 0.48], ['cedar', 0.46], ['poplar', 0.06]],
    clusterCount: 24, loneCount: 42, rimCount: 34, grassDensity: 0.30,
    clusterScrub: 1.4, bushCount: 0.52, bushSpecies: 'cedar',
    // (Skybridge round 2, the map-revival lane: Glen Canyon's bunchgrass is cured straw on the slickrock's sand, as Titan
    // Gorge's; the default tufts were the meadow's green)
    grassTexTone: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.5), clamp01(l * 0.95 + 0.10)],
    tuftTone: (h: number, s: number, l: number) => [0.10, 0.24, clamp01(l * 0.70 + 0.12)],
  },
  props: {
    // the map-revival lane (2026-10-05): Glen Canyon Dam and Page, Arizona (maps/regional/glencanyon.ts)
    architecture: 'glencanyon',
    plan: [
      'arcology', 'factory', 'gantry', 'parkingdeck', 'ruin', 'foundryoffice',
      'warehouse', 'needletower', 'containerRow', 'depot', 'ruin', 'civichall',
      'broadcasttower', 'watertower', 'firestation', 'parkingdeck', 'gantry', 'ruin',
      'foundryoffice', 'warehouse', 'terracetower', 'depot', 'containerRow', 'ruin',
      'civichall', 'factory', 'parkingdeck', 'megatower', 'gantry', 'ruin',
    ],
    destructibleBuildings: [
      'motorpool', 'quonsethut', 'transformershed', 'guardpost',
      'securityoffice', 'servicegarage', 'relaystation',
    ],
    // the strongpoints stand in pairs that are each other's rotation about (5, 60), 60 m or more from Verdant's old
    // strongpoint sites (which the brief keeps clear): the western abutment in the south-west lane and the eastern
    // control yard in the north-east, the spillway scout post below the district and the northern relay post above it
    tacticalBeats: [
      { id: 'western-abutment', role: 'brawl', x: -266, z: -20, yawDeg: -4,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 13, scaleMax: 4.0 }, wreck: true, wreckOffsetZ: -18 },
      { id: 'spillway-scout-post', role: 'scout', x: -100, z: -200, yawDeg: 18,
        structure: 'guardpost', outcrop: { count: 5, radius: 9, scaleMax: 2.9 } },
      { id: 'northern-relay-post', role: 'scout', x: 110, z: 320, yawDeg: 198,
        structure: 'guardpost', outcrop: { count: 5, radius: 9, scaleMax: 2.9 } },
      { id: 'eastern-control-yard', role: 'support', x: 276, z: 140, yawDeg: 176,
        structure: 'transformershed', redoubt: true, outcrop: { count: 7, radius: 11, scaleMax: 3.5 }, wreck: true, wreckOffsetX: 18 },
    ],
    // (round 3, gauntlet wave 133: "a fan of parallel rail lines running straight down into" the reservoir, "orphan rail
    // segments describing nothing in 1960s Page": Page never had a railway — the yard's lines, coal heaps and stores go)
    // (round 4: the dam on road 5 over the arm's end, reservoirDam.ts by mapKits.ts dressMapExtras)
    blockFill: true, extraKits: ['dam'], wallStyle: 'fieldstone', wallStoneChance: 0.82,
    // the control district's blocks keep their footprints off every carriageway
    // the control district stands as PR #9's head seated it (the owner's town-plan ruling, 2026-10-03); a building of it
    // that stands in a carriageway moves by the least distance that clears it
    townPlan: TOWN_PLANS.skybridge,
    townLightPlan: TOWN_LIGHT_PLANS.skybridge,
    roadBuildingClearance: true,
    // the kit owns the renders' tones; the field walls keep the city preset's stone
    tones: { stone: makeRealisticCityBuildingTones({ value: 0.92, saturation: 1.06, soot: 0.015, roofValue: 0.90 }).stone },
    buildingLat: [13, 7], sideSkip: 0.07, spacingPad: 3.5, maxSpread: 4.2,
    wallRuns: [
      [-312, -148, -214, -112, 2], [-306, 138, -208, 174, 3],
      [208, -146, 308, -110, 3], [206, 140, 306, 176, 2],
      [-150, 258, -46, 290, 3], [64, -286, 168, -252, 2],
      [-338, 44, -294, 98, 1], [300, -82, 344, -26, 4],
    ],
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: true,
    rocks: 286, outcrops: 78, craters: 88, rubblePiles: 58,
    hedgehogs: 30, sandbagLines: 28,
    tankWrecks: { era: 'modern', count: 8, debris: true,
      ids: ['k2', 'type10', 'type90', 'k1a1', 'm2a2_bradley', 'pl01', 'leclerc_xlr', 'm1a2_sepv3'] },
    inhabit: {
      stalls: 0, benches: 2, coreClutter: 32, drums: 18,
      trucks: 10, jeeps: 7, drumClusters: 10, camps: 4, modernClutter: 36,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  // (round 5, gauntlet wave 207 and the coordinator: round 4's arm walls "flat vertical planes" under a soft brow) the
  // arm's walls in relief — buttresses between the seeps' alcoves, the rain's flutes, the cross-beds, the varnish's
  // curtains from the brow and the bathtub ring at the water (canyonWall.ts) — and the hard bed of the slickrock along
  // both brows, its lip over the void (caprockRim.ts, trench). The arm's ridge (ARM.landforms[0]) is the rock
  scenery: {
    canyonWalls: [{ x: ARM.landforms[0].x, z: ARM.landforms[0].z, length: ARM_LENGTH, width: ARM_HALF * 1.6, yawDeg: ARM_YAW,
      waterLevel: ARM_DEPTH, span: 0.88, name: "Lake Powell's arm, its walls" }],
    caprock: [{ x: ARM.landforms[0].x, z: ARM.landforms[0].z, length: ARM_LENGTH, width: ARM_HALF * 1.6, yawDeg: ARM_YAW,
      trench: true, span: 0.86, tone: [0.06, 0.3, 0.64], thickness: [1.0, 1.8], blockM: [10, 22], name: "the arm's slickrock brows" }],
  },
  horizon: {
    baseHex: 0x59433a, amp: 2.0, style: 'mesa', treeline: 0.10,
    // (the map-revival lane, Skybridge round 2, gauntlet wave 120: "a repeating sawtooth ridge silhouette" — the mesa
    // character's far country stood as a row of rounded hazy peaks behind the ring. Glen Canyon's far skyline is the
    // slickrock plateau's long flat-topped escarpments and lone buttes (Kaiparowits, Tower Butte): the far country
    // becomes sheer flat-capped massifs on the plain with the sky between them, broad mesas rather than Wadi Rum's
    // fluted, bossed jebels)
    panorama: { regional: 'jebel', jebelBossM: 0, jebelRim: 0.95, jebelFlutes: 4, jebelFluteDepth: 0.12, jebelApron: 0.3,
      jebelFoot: 0.64, jebelM: 380, jebelRadiusM: 900, jebelShare: 0.6, jebelFootVary: 0.08, jebelVarnish: 0.4 },
    // the mountains lane (2026-10-03): the outland boulders a shade sparser — they follow the ring's drained faces, and
    // the map's horizon draws no more triangles than before that relief work
    outlandRocks: 0.94,
    // (the map-revival lane, 2026-10-06, Skybridge round 3; gauntlet wave 133: "smooth grey-mauve peaks", "a sharp
    // central pyramid ... rather than flat-topped bedded sandstone mesas") Glen Canyon's skyline is the slickrock
    // plateau's flat-topped escarpments: the outer ranges capped into mesas at a few strata past 1.1 km
    // (horizonTablelands.ts), the bed stair in thicker beds with more of each in cliff, so the tables stand as tiers of
    // cliff over talus
    summitCap: { levelM: 260, fromRadiusM: 1100, vary: 0.25, stepM: 25 },
    escarpment: { bedM: [60, 95], cliffShare: [0.4, 0.6], talusRise: 0.26, talusCurve: 2.6 },
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): authored strata for the beige-brown
    // chasm walls (the style default 0.16 left the abutment cliffs nearly unbedded)
    banding: 0.20,
    // (round 3: the desert air is clear; the ranges keep their red sandstone rather than greying to the fog's mauve)
    forestHex: 0x3c4237, rockHex: 0x80604d, haze: 0.62, grain: 0.62,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', baseM: 700, coverage: 0.42, farBand: 0.5, streets: 0.3, virga: 0.5, rain: 0.2 },
  sky: {
    sunElevationDeg: 25, sunAzimuthDeg: 120, turbidity: 7.4, rayleigh: 1.22,
    // (round 3, gauntlet wave 133: "smooth grey-mauve peaks": the plateau's dry air is clear — its ranges keep their red
    // sandstone at a kilometre and a half; 0.00056 greyed them to the fog's mauve)
    mieCoefficient: 0.010, mieDirectionalG: 0.86, fogDensity: 0.00040,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the haze a step cooler than the 0xffc19a sun
    // (0xa08475 -> 0x9d9188); the near-overcast deck (1.04 / 0.78) missed the low-stratus auto branch (it needs
    // 0.95 / 0.90), so the 620 m fair-weather deck stood 6-7 km out and fully hazed in the 2-12° band — an explicit
    // 380 m broken deck of 2500 m masses keeps texture there; diffuse light patchiness (cloudShadowAmp 0.14)
    fogTintHex: 0x9d9188, fogMix: 0.55, envIntensity: 0.18,
    cloudOpacity: 1.04, cloudOpacity2: 0.78, cloudTintHex: 0xdac8bb,
    cloudAltM: 380, cloudHazeK: 0.00015, cloudUvM: 2500, cloudShadowAmp: 0.14,
    sunIntensity: 3.85, sunColorHex: 0xffc19a, hemiIntensity: 0.31, postExposure: 0.93,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xaa8161 },
  },
  minimap: {
    base: [102, 77, 63], hard: [113, 91, 76], soft: [80, 65, 56],
    forest: 'rgba(55,66,48,.66)', forestStroke: 'rgba(35,43,31,.82)',
    water: 'rgba(47,76,91,.84)', waterStroke: 'rgba(28,49,61,.92)',
    roadCasing: 'rgba(47,37,33,.96)', roadFill: 'rgba(153,127,108,.95)', buildingFill: '#beb2a4',
  },
  shot: { pos: [-280, 60, -236], look: [22, 4, 92] },
  // round 66 (2026-09-24, the FFT ocean): the mountain lake under the wind funnelled down the gorge — a clear,
  // lively chop over the spillway reach where the sheet lay flat
  ocean: { windSpeed: 3.8, windDirDeg: 40, fetchKm: 4, amplitude: 1, foam: 0.1, breakers: 0.25, caustics: 0.55 },
} satisfies import('./contracts.ts').MapCompositionConfig;
