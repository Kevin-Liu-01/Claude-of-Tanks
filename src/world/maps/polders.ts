// src/world/maps/polders.ts — Tidegate Polders, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The five drainage basins, the farm court on the mill lane's loop, the pumping station, the roads, the palette, sky,
// sea, vegetation, name and id are the map's identity and stay; the ground between them is new. The old ground rolled
// like upland pasture (hillScale 0.72), not reclaimed land. Alpha's pad stood in sight of bravo's arc, bravo's seven
// pads spread 500 m along the north edge, and the zone-control discs stood up to 1.3 times farther from one team.
//
// Reference: the polders of the Scheldt estuary (South Beveland and Walcheren, autumn 1944): reclaimed clay fields
// boxed by dykes, roads along the dykes, poplar windbreaks, farms round paved yards, a pumping station at the tidegate,
// and drainage basins held at different levels.
//
// The story on the ground: the old land in the west stands a few metres above the new polders in the east, which
// sank after they were drained, and the basins step down with it, from the field drain in the south-west at +1.4 m to
// the overflow reach in the north-east at -5.4 m. The farm court stands where the causeway crosses the mill lane. The
// main dyke runs east and west through the middle of the polder, broken by a sluice in the west, and the pumping
// station works the hooked basin below it. Narrow field dykes box the polder: cross dykes face the deployments and
// long dykes run between the lanes, and the roads cut through them. Alpha deploys behind the southern cross dyke and
// bravo behind the northern one. The zone-control discs are the farm court's paved yard and a field on each side of
// it, the second within 8 m of the first's rotation about the farm court.
import { roundRoadBends } from './roadBends.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS } from './townPlans.generated.ts';

/** The farm court's settlement rect (terrain.village below). */
const VILLAGE = { x0: -178, x1: 68, z0: -96, z1: 122, cx: -64, cz: 12, feather: 42, flatten: 0.88, relief: 0.12 };

/** The polder's dykes (step 1): embankments with level crests (landformGeology.ts profile 'dyke'). */
const DYKE = { profile: 'dyke' as const, crest: 0.25 };
const FIELD_DYKE = { profile: 'dyke' as const, crest: 0.2 };

type Dyke = { kind: 'ridge'; x: number; z: number; length: number; width: number; height: number; yawDeg: number; geology: { profile: 'dyke'; crest: number }; wetScale?: number };
/** A ramp's reach along its road either side of the crest and its lift over the dyke's own height: the road grading's
 * smoothing (four passes over ±32 m) takes back much of a narrow hump, so the knoll stands taller than the dyke and its
 * approaches run long, and the graded road meets the crest within a metre or two. */
const RAMP_RUN_M = 70, RAMP_LIFT = 1.2;
type Ramp = { kind: 'knoll'; x: number; z: number; rx: number; rz: number; height: number; yawDeg: number; corridorScale: number };
/**
 * Step 1's ramps: where a road crosses a dyke it climbs over the crest instead of cutting through it. A long narrow
 * knoll along the road at each crossing (RAMP_RUN_M either way, 8 m across) lifts the road's profile over the
 * embankment at a grade the road smoothing holds near one in ten; outside the carriageway's banks
 * it adds nothing, so the dyke keeps its own section beside the road. A road along a dyke's crest (the north lane) and
 * a crossing of a dyke's tapered end take none.
 */
function dykeRamps(dykes: readonly Dyke[], roads: readonly (readonly (readonly [number, number])[])[]): Ramp[] {
  const ramps: Ramp[] = [];
  // (the field dykes, 3.6 m, keep their cuttings: ramped, their raised approaches turned the routes and the objectives'
  // symmetry past its band; the main dykes' crossings are ramped)
  for (const d of dykes.filter((dyke) => dyke.height >= 4)) for (const road of roads) for (let i = 1; i < road.length; i++) {
    const [px, pz] = road[i - 1], [qx, qz] = road[i], ex = qx - px, ez = qz - pz, len = Math.hypot(ex, ez);
    const hit = dykeCrossing(d, px, pz, ex, ez, len);
    if (!hit) continue;
    ramps.push({ kind: 'knoll', x: Math.round((px + ex * hit.t) * 10) / 10, z: Math.round((pz + ez * hit.t) * 10) / 10, rx: RAMP_RUN_M, rz: 8,
      height: Math.round(d.height * RAMP_LIFT * 10) / 10, yawDeg: Math.round(Math.atan2(ez, ex) * 1800 / Math.PI) / 10, corridorScale: 1 });
  }
  return ramps;
}

/**
 * 2026-10-06 (the map-revival lane, step 1; gauntlet wave 157: "no dykes … fields, ditches, roads and the oxbow all sit
 * at one level"): the dykes stand up as embankments (landformGeology.ts profile 'dyke': a level crest, straight batters
 * of about 1 in 2.6, the shoulder and the toe rounded) on bases a third as wide as the old folds'.
 */
const DYKES: readonly Dyke[] = [
  // the main dyke's western half, broken by a sluice where the west drain's outfall crosses it, and by the farm court:
  // its paved yard seats the middle zone disc, which the embankment's batters (unlike the old fold's) would break
  { kind: 'ridge', x: -240.5, z: 0, length: 301, width: 16, height: 4.8, yawDeg: 0, geology: DYKE },
  { kind: 'ridge', x: -446, z: 0, length: 110, width: 16, height: 4.8, yawDeg: 0, geology: DYKE },
  // the eastern half, x 5–493, in two equal reaches on one axis that meet at the pumping station: their tapered ends
  // (1 - smoothstep over the last 28 % of each half) overlap exactly (x 230.7–267.3, centres 1.72 half-lengths apart),
  // where the two tapers sum to one, so the dyke stands whole; as one record its centre stood 44 m from Verdant's
  // eastern swell and read as the borrowed skeleton (the layout brief's check)
  { kind: 'ridge', x: 136.46, z: 18.17, length: 262.37, width: 16, height: 4.5, yawDeg: -4, geology: DYKE },
  { kind: 'ridge', x: 361.54, z: 2.43, length: 262.37, width: 16, height: 4.5, yawDeg: -4, geology: DYKE },
  { kind: 'ridge', x: 10, z: 70, length: 360, width: 18, height: 5.2, yawDeg: -40, wetScale: 0.2, geology: DYKE },
  // Field dykes: narrow earth banks on the field grid, cross dykes facing the deployments and long dykes between the
  // lanes (step 1: embankments 3.6 m high on bases 23–24 m wide, their crests 4.6–4.8 m; the north lane's west reach
  // runs along the crest of the one it followed, z 170, and the one rotated from it about the village moves with it;
  // the long dykes beside the field zones stand 8 m further out, so the stones that settle at their toes keep off the
  // zones' discs; step 5: a long dyke on each outer flank, the east one in alpha's ground from the east cross dyke's foot
  // north to the mill lane and its twin in bravo's ground from the west one's, the point rotation about the farm court as
  // the rest of the grid — the flank lanes were one open sweep each, split only where a single bush happened to stand)
  ...([[-60, -282, 300, 0, 12], [-68, 306, 300, 0, 12], [23, -146, 150, 0], [-151, 170, 150, 0],
    [250, -210, 180, 0], [-378, 234, 180, 0], [-188, -178, 144, 90], [60, 202, 144, 90], [100, -135, 230, 90],
    [-228, 159, 230, 90], [236, -140, 110, 90, 16], [-364, 164, 110, 90, 16],
  ] as const).map(([x, z, length, yawDeg, width = 11.5]) => ({ kind: 'ridge' as const, x, z, length, width, height: 3.6, yawDeg, geology: FIELD_DYKE })),
];

/** The polder's roads as authored (the mill lane, the west and east roads, the causeway, the north lane). */
const RAW_ROADS: readonly (readonly (readonly [number, number])[])[] = [
  // The mill lane folds around a compact farm court before joining the
  // raised diagonal causeway; field bypasses stay outside the settlement.
  [[-280, -100], [-144, -62], [-80, -62], [-80, 56], [-26, 56], [24, -62], [180, -120], [266, -102]],
  [[-380, -462], [-310, -286], [-280, -100], [-304, 104], [-248, 296], [-170, 466]],
  [[-126, -462], [-124, -288], [-100, -140], [-26, -12], [96, 112], [218, 280], [320, 458]],
  [[370, -452], [298, -274], [266, -102], [288, 72], [338, 260], [376, 456]],
  [[-304, 104], [-220, 170], [-82, 170], [72, 202], [216, 212], [338, 260]],
  // (step 2) the oxbow lane: off the north lane on its dyke crest, straight north along x -158 over the oxbow's waist on
  // the landmarks lane's lift bridge (the marsh station below), and on to the west road north of the oxbow
  [[-158, 170], [-158, 330], [-186.5, 430]],
];

/**
 * Step 1: a road's profile is graded through its stations, and a straight run of a few hundred metres has none between
 * its ends, so it ran level through any dyke in its way. Each crossing of a main dyke's full-height reach (the ramped
 * ones; the field dykes keep their cuttings) gets stations at the crest and 18 m and 36 m either side, so the grading
 * sees the embankment and the ramp (dykeRamps) and the road climbs over the crest. The inserted stations are collinear:
 * the bends round as before.
 */
function withDykeStations(paths: readonly (readonly (readonly [number, number])[])[], dykes: readonly Dyke[]): [number, number][][] {
  return paths.map((path) => {
    const out: [number, number][] = [[path[0][0], path[0][1]]];
    for (let i = 1; i < path.length; i++) {
      const [px, pz] = path[i - 1], [qx, qz] = path[i], ex = qx - px, ez = qz - pz, len = Math.hypot(ex, ez);
      const at: number[] = [];
      for (const d of dykes.filter((dyke) => dyke.height >= 4)) {
        const hit = dykeCrossing(d, px, pz, ex, ez, len);
        if (!hit) continue;
        for (const off of [-36, -18, 0, 18, 36]) {
          const t = hit.t + off / len;
          if (t > 6 / len && t < 1 - 6 / len) at.push(t);
        }
      }
      for (const t of [...new Set(at)].sort((a, b) => a - b)) out.push([Math.round((px + ex * t) * 10) / 10, Math.round((pz + ez * t) * 10) / 10]);
      out.push([qx, qz]);
    }
    return out;
  });
}

/** Where a road segment crosses a dyke's centre line within its full-height reach (t along the segment), or null. */
function dykeCrossing(d: Dyke, px: number, pz: number, ex: number, ez: number, len: number): { t: number; u: number } | null {
  const c = Math.cos(d.yawDeg * Math.PI / 180), s = Math.sin(d.yawDeg * Math.PI / 180), half = d.length / 2;
  const ax = d.x - c * half, az = d.z - s * half, fx = c * d.length, fz = s * d.length, cross = ex * fz - ez * fx;
  // nearly parallel: the road runs along the dyke, not across it
  if (Math.abs(cross) < 0.5 * len * d.length) return null;
  const rx = ax - px, rz = az - pz, t = (rx * fz - rz * fx) / cross, u = (rx * ez - rz * ex) / cross;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  // only where the dyke stands at its full height (its tapered ends are low enough to cross at grade, and the north
  // lane rides one field dyke's crest past another's tail)
  if (Math.abs(u - 0.5) * 2 > 0.72) return null;
  // and outside the farm court's settlement (its graded floor takes the dykes down; a station inserted on its lanes would
  // move the roadside builder's houses, which are seated by station)
  const x = px + ex * t, z = pz + ez * t;
  if (x > VILLAGE.x0 - 20 && x < VILLAGE.x1 + 20 && z > VILLAGE.z0 - 20 && z < VILLAGE.z1 + 20) return null;
  return { t, u };
}

/** The roads as graded: the authored routes with their dyke stations, the bends rounded. */
const ROADS = roundRoadBends(withDykeStations(RAW_ROADS, DYKES));

export default {
  id: 'polders', name: 'Tidegate Polders',
  blurb: 'Pump-controlled retention basins, windbreak farms and raised causeways across reclaimed coastal fields',
  terrain: {
    hillScale: 0.42, microScale: 0.4, rimH: 18, clearMarshVeg: true, softLakes: true,
    // The farm court's paved yard, inside the mill lane's loop: the zone-control placement seats its middle disc there.
    hardstands: [{ x: -40, z: 0, width: 60, length: 60, yawDeg: 0, grade: 0 }],
    village: VILLAGE,
    // Step 7 (2026-10-07; gauntlet wave 248: "lanes as wide as a modern road and level with the water"; the coordinator's
    // ruling): the polder's roads narrowed and raised a metre on crowned banks of their own (terrain.ts RoadPathStyle
    // widthM, crownLiftM) — the causeway 6 m, the west and east roads 5.5 m, the north lane and the oxbow lane 4 m on the
    // dyke crowns; the mill lane keeps its grade through the farm court (4.5 m), and the lifts ramp down to it where they
    // meet it. One lift for every raised road, so their junctions meet level.
    roads: { paths: ROADS, pathStyles: [
      { widthM: 4.5 },
      { widthM: 5.5, crownLiftM: 1 },
      { widthM: 6, crownLiftM: 1 },
      { widthM: 5.5, crownLiftM: 1 },
      { widthM: 4, crownLiftM: 1 },
      { widthM: 4, crownLiftM: 1 },
    ] },
    // Five distinct drainage landforms, not repeated ornamental ponds. Long
    // eroded drains, a broad retention bay and an offset hooked basin share
    // sixteen authored stations / the existing 64-sample canonical contour.
    lakes: [
      // Narrow north/south field drain; unequal ends avoid a capsule outline.
      // The narrow drain needs a wider dry apron around its angular bends;
      // its wet contour stays fixed and the roads retain their own support.
      { x: -204, z: -281, r: 102, level: 1.4, bankBand: 4,
        radii: [0.20, 0.23, 0.30, 0.49, 1.00, 0.44, 0.26, 0.21,
          0.24, 0.26, 0.34, 0.48, 0.78, 0.42, 0.31, 0.24] },
      // Broad retention bay with a sheltered southwest inlet.
      { x: 117, z: -257, r: 70, level: -2.6,
        radii: [0.91, 0.95, 0.91, 0.78, 0.71, 0.68, 0.86, 0.92,
          0.84, 0.70, 0.48, 0.60, 0.77, 0.78, 0.90, 0.96] },
      // One-sided hooked elbow below the pumping station's dry bank.
      { x: 166, z: -6, r: 73, level: -3.3,
        radii: [0.76, 0.78, 0.73, 0.63, 0.66, 0.95, 0.61, 0.42,
          0.38, 0.44, 0.51, 0.66, 0.91, 0.89, 0.81, 0.75] },
      // A separately oriented tapering overflow reach. (Step 6: the east/west oxbow basin that stood here is the old
      // creek's arm, terrain.canals below.)
      { x: 100, z: 286, r: 72, level: -5.4,
        radii: [0.90, 1.00, 0.60, 0.37, 0.34, 0.34, 0.40, 0.62,
          0.89, 0.72, 0.48, 0.39, 0.35, 0.40, 0.55, 0.73] },
    ],
    // (step 2) the lift bridge's crossing (terrain.ts round 61): the oxbow lane crosses the water on a level deck plane
    // instead of grading its dry band through it, the oxbow's bed and water kept under the span; the landmarks lane's
    // lift bridge (props.landmarks liftBridge) is the deck the ride stands on (no river kit builds one on Polders)
    // (the deck 2.47 m over the water surface, y 2.90: a fixed plane over the road's own 2.83 there, so the road's
    // endpoint completion never moves it; the landmarks lane's boards read the banks at 2.88–2.90)
    marshes: [{ x: -158, z: 265.5, r: 6, dip: 0, level: 0, crossing: 'bridge', deckWidthM: 6, approachM: 30, deckClearM: 2.47 },
      // (step 6) the oxbow arm's west horn silted up: a reedy pool at the arm's level past the arm's end, a strip of silt
      // between them (its water and the canals' never overlap: a canal's bed is no flat marsh core)
      { x: -209, z: 202, r: 8, dip: 0.5, level: 0 }],
    // Step 5 (2026-10-07; the coordinator: "build it yourself ... Polders' vaart and weteringen are the first users"): the
    // polder's drainage in straight water at one level (terrain.canals, canals.ts) — the vaart along the main dyke's
    // north foot from the west road's culvert to the farm court's edge, and two weteringen north from it between the long
    // field dykes, all at the vaart's level: -1.7 m, under the lowest field they cross (the floor north of the main dyke
    // falls to -1.3 m between the weteringen), so the water stands in its cut everywhere. They join no basin (the five
    // basins keep their own levels); the roads cross them on culverts
    canals: [
      // Step 6 (2026-10-07; gauntlet wave 248: "a closed, peanut-shaped basin with a hard outline that reads as a garden
      // pond"; the coordinator's ruling): the oxbow is the old creek's cut-off arm — a curved channel at its level from the
      // mill's outfall west under the lift bridge, swinging north, its west horn silted to a reedy pool (marshes) at the
      // foot of the south-west long dyke (no ditch cuts the dyke to the west wetering beyond it: a polder's ditches never
      // breach its dykes)
      { path: [[-121, 266], [-140, 266.5], [-158, 266], [-174, 263], [-189, 255], [-200, 243], [-206, 229], [-207, 224]],
        widthM: 18, level: 0, profile: 'bank', shelfM: 3, name: 'the oxbow arm' },
      { path: [[-282, 20.4], [-112, 19]], widthM: 9, level: -1.7, profile: 'bank', name: 'the vaart' },
      { path: [[-252, 25], [-252, 128]], widthM: 4, level: -1.7, profile: 'ditch', name: 'the west wetering' },
      { path: [[-182, 25], [-182, 140]], widthM: 4, level: -1.7, profile: 'ditch', name: 'the east wetering' },
    ],
    // (step 2) the molenbergen: the mounds the landmarks lane's two brick tower mills stand on (props.landmarks), 1.8 m
    // over the ground at their centres with level crests 18 m across and batters about 1 in 3 (terrain.ts mounds: raised
    // after the water's banks, which grade any landform this near the oxbow and the drain back to the waterline); each
    // foot comes down 1.4–2 m from its water, the oxbow mill's on the oxbow's east bank, the drain mill's on the drain's east bank
    mounds: [{ x: -99, z: 262, crestR: 9, baseR: 14.4, height: 1.8 }, { x: -171, z: -316, crestR: 9, baseR: 14.4, height: 1.8 }],
    landforms: [
      ...DYKES,
      { kind: 'knoll', x: -354, z: 74, rx: 66, rz: 84, height: 4.6 },
      { kind: 'basin', x: 114, z: -238, rx: 88, rz: 76, height: -2.2 },
      // (the north-south bank into bravo's ground keeps its broad fold: the south zone disc seats astride it)
      { kind: 'ridge', x: -18, z: 300, length: 180, width: 40, height: 4.0, yawDeg: 88 },
      // The old land in the west stands higher than the new polders in the east, whose basins lie lower.
      { kind: 'knoll', x: -470, z: 20, rx: 320, rz: 640, height: 7, wetScale: 0.2 },
      { kind: 'basin', x: 470, z: -10, rx: 300, rz: 640, height: -3, wetScale: 0.2 },
      // (step 1) the roads ramp over the dykes they cross
      ...dykeRamps(DYKES, RAW_ROADS),
    ],
  },
  // Bravo's seven pads stand in two staggered rows 62 m apart behind the northern cross dyke, their centroid near the
  // rotation of alpha's pad about the farm court. 812 m between the anchors.
  // the landmarks lane (2026-10-05): the oxbow's lift bridge stands its piers and its abutments' feet in the water by design
  layoutBrief: { exceptions: {
    solidPropsInWater: 'the oxbow lift bridge\'s piers and abutments (props.landmarks, src/world/landmarks/bridges.ts liftBridge) '
      + 'stand in the water by design, where it crosses the oxbow\'s waist',
  } },
  spawns: { player: { x: -94, z: -390 }, enemies: [
    { x: -34, z: 450 }, { x: -65, z: 398 }, { x: -3, z: 398 }, { x: -127, z: 398 },
    { x: 59, z: 398 }, { x: -96, z: 450 }, { x: 28, z: 450 },
  ] },
  splat: { sourcedPalette: 'polders', // (ground lane, wave 248: the polders' own clay, not Verdant's black earth)
    fieldPatch: 1.25, seaLake: true, seaFoam: 0.02, seaRamp: [0.12, 0.48], shoreDirt: true, iceDrift: 0.02,
    // (step 3, gauntlet wave 205: "turquoise kidney-shaped ponds", "thin neon-blue ditch lines") the polder's water dark
    // and still under a grey North Sea sky (was [0.30, 0.42, 0.43]), the water tone less saturated and darker, no foam
    // (the soil's clay is the ground lane's own palette row, wave 248: the stale step 3's soil tint and plough lift over
    // Verdant's black earth stand down)
    mudTone: (h: number, s: number, l: number) => [h, Math.min(1, s * 0.55), Math.min(1, l * 0.72)],
    marshGloss: 0.82, iceSky: [0.21, 0.25, 0.25], midRelief: 0.64,
    tintA: [0.84, 1.01, 0.66], tintB: [0.60, 0.76, 0.51], tintC: [1.08, 1.08, 0.78], roadTint: [0.76, 0.72, 0.61],
  },
  vegetation: {
    species: ['poplar', 'willow', 'oak'], clusterMix: [['willow', 0.48], ['poplar', 0.36], ['oak', 0.16]],
    loneMix: [['poplar', 0.62], ['willow', 0.28], ['oak', 0.10]], rimMix: [['poplar', 0.54], ['willow', 0.34], ['oak', 0.12]],
    // (step 3, gauntlet wave 205: "free-standing trees scattered at random through the ploughed field") Zeeland's trees
    // stand in willow rows along the ditches, poplar windbreaks and farmyard groups: the woodlots off the cropped ground
    // (the trees lane's woodsOffArable) and fewer of them (42), the loose field trees mostly gone (64); willow rows on the
    // parcels' long boundaries (the hedge-tree hook's boundary mode, every 12 m, the long sides only)
    clusterCount: 32, loneCount: 16, rimCount: 72, grassDensity: 1.02, bushCount: 0.9, bushSpecies: 'willow',
    woodsOffArable: true,
    hedgeTrees: { mix: [['willow', 0.8], ['poplar', 0.2]], spacingM: 12, gateM: 5, along: 'boundary', offsetM: [1.8, 3.4], minLineM: 80 },
    belts: [
      { x0: -192, z0: -182, x1: -188, z1: 208, gap: 17, jitter: 1.6, species: 'poplar' },
      { x0: 190, z0: -328, x1: 208, z1: -98, gap: 18, jitter: 1.2, species: 'willow' },
    ],
    authoredTrees: [
      // Existing poplars move onto the field headland, outside the protected
      // farm court; crossings retain their ordinary empty road shoulders.
      { id: 'west-field-headland', species: 'poplar', path: [[-226, -174], [-232, -50], [-238, 102]], count: 22, width: 0.4 },
      // (step 1) at the foot of the field dyke the north lane rides (z 170, its toe at z 158.5): at z 150 the trees the
      // new ground re-rolled stood on five of its twelve stations
      { id: 'north-field-headland', species: 'poplar', path: [[-204, 156], [-142, 156], [-78, 156]], count: 12, width: 0.4 },
      { id: 'east-drain-willow-edge', species: 'willow', path: [[120, -321], [139, -317], [165, -310], [187, -287], [191, -260]], count: 18, width: 0.5 },
      // (step 1) poplar rows on the crests of the long field dykes between the lanes, as Zeeland's dykes carry them: the
      // narrowed dykes opened the flats to long sight (a full-run battle of 80 s); the rows screen the lanes again. Each
      // keeps off the water at its dyke's end and the roads that cross it (the south-west dyke's in two reaches either
      // side of the north lane); the trees are the map's own, moved onto the rows (authoredTreePlacement.ts)
      { id: 'west-long-dyke-poplars', species: 'poplar', path: [[-188, -192], [-188, -126]], count: 9, width: 0.3 },
      { id: 'east-long-dyke-poplars', species: 'poplar', path: [[100, -200], [100, -108]], count: 11, width: 0.3 },
      { id: 'south-west-long-dyke-poplars', species: 'poplar', path: [[-228, 76], [-228, 146]], count: 8, width: 0.3 },
      { id: 'south-west-long-dyke-poplars-north', species: 'poplar', path: [[-228, 180], [-228, 242]], count: 8, width: 0.3 },
      { id: 'south-east-long-dyke-poplars', species: 'poplar', path: [[60, 150], [60, 254]], count: 9, width: 0.3 },
      // (step 5) the flank dykes' poplars along their crests, off the east one's road cutting (and its twin's end)
      { id: 'east-flank-dyke-poplars', species: 'poplar', path: [[236, -186], [236, -122]], count: 11, width: 0.3 },
      { id: 'west-flank-dyke-poplars', species: 'poplar', path: [[-364, 210], [-364, 146]], count: 11, width: 0.3 },
    ],
  },
  props: {
    // regional-buildings lane: the Zeeland polder kit (maps/regional/polder.ts)
    architecture: 'polder',
    sourcedPalette: 'coastal',
    // The landmarks lane (2026-10-05; src/world/landmarks/): the old land in the west keeps its brick tower mills, the new
    // polders in the east were drained by the steel windmotors — one stellingmolen on the field drain's east bank, one at
    // the oxbow's east tip, each with its stage and thatched cap and its sails turned into the sea wind as the
    // windmotors' are (yaw 300); and over the oxbow's waist a white double-leaf lift bridge in the Magere Brug's
    // composition: the leaves on two brick piers in the water, a fixed span on pile bents to each bank, the roadway on
    // paved brick abutments.
    // Round 2 (2026-10-07; the gauntlet: the lift bridge "needs a road over the water", the mills "a mound, a yard and a
    // link to the water"; the seats agreed with the map-revival lane, whose step 2 lays the lane over the oxbow on x -158
    // with the crossing's deck plane at 2.90 and raises a terp 1.8 m under each mill): the bridge's roadway on that plane,
    // the road's own embankment for its approaches (no brick ramps: rise 0); each mill on its terp's level crest behind a
    // plank-fenced yard, its gate toward the fields, and at the terp's foot toward its water the outfall of the drain
    // under it — a brick headwall with the culvert's mouth and its runnel pitched in stone down to the water. Every piece
    // is set into the finished map (ground 'veto').
    landmarks: [
      { kind: 'liftBridge', x: -158, z: 265.5, yawDeg: 0, ground: 'veto', name: 'the lift bridge over the oxbow',
        params: { span: 12, approach: 5.6, rise: 0 } },
      { kind: 'garden', x: -99, z: 262, yawDeg: 90, ground: 'veto', name: "the oxbow mill's yard",
        params: { width: 12, depth: 12, fence: 'fenceplank', back: 'fence', beds: false, path: 0 } },
      { kind: 'windmill', x: -99, z: 262, yawDeg: 300, ground: 'veto', name: 'the oxbow mill', params: { style: 'tower', height: 20 } },
      { kind: 'outfall', x: -111.56, z: 264.21, yawDeg: 280, ground: 'veto', name: "the oxbow mill's outfall", params: { length: 6.9, width: 0.8 } },
      { kind: 'garden', x: -171, z: -316, yawDeg: 84, ground: 'veto', name: "the drain mill's yard",
        params: { width: 12, depth: 12, fence: 'fenceplank', back: 'fence', beds: false, path: 0 } },
      { kind: 'windmill', x: -171, z: -316, yawDeg: 300, ground: 'veto', name: 'the drain mill', params: { style: 'tower', height: 18 } },
      { kind: 'outfall', x: -182.96, z: -311.17, yawDeg: 292, ground: 'veto', name: "the drain mill's outfall", params: { length: 7.2, width: 0.8 } },
    ],
    plan: ['mill', 'farmhouse', 'granary', 'fishery', 'depot', 'cottage', 'woodshed', 'tavern', 'farmhouse', 'barn', 'barn', 'cottage', 'granary', 'ruin', 'depot', 'woodshed', 'farmhouse', 'barn'],
    // (2026-10-06, the map-revival lane, step 1) the farm court stands exactly as the PR head seated it (the town-plan
    // replay, townPlans.generated.ts): the dykes, ramps and water rebuilt round it no longer move its houses
    townPlan: TOWN_PLANS.polders,
    townLightPlan: TOWN_LIGHT_PLANS.polders,
    // (step 1) the scattered stone keeps off the zone discs: re-rolled by the new ground, an outcrop landed on the west
    // field zone's edge and pushed the zone 8 m off its authored seat
    rocksKeepOffZones: true,
    destructibleBuildings: ['fieldhut', 'fishershack', 'transformershed', 'huntingblind'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'tidegate-pump-yard', role: 'brawl', x: 250, z: 0, yawDeg: 75, structure: 'transformershed', redoubt: true, outcrop: false, wreck: true },
      // (step 3a: no stone on the polder clay) the hide's second cover layer a wreck in the windbreak, not an outcrop
      { id: 'western-windbreak-hide', role: 'scout', x: -334, z: 22, yawDeg: 90, structure: 'huntingblind', outcrop: false, wreck: true },
      { id: 'causeway-farm-store', role: 'support', x: -48, z: 228, yawDeg: 175, structure: 'fieldhut', redoubt: true, outcrop: false, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.45,
    wallRuns: [[-174, -40, -174, 16, 2], [-168, 90, -108, 90, 2], [-54, -88, 10, -88, 3], [246, 58, 246, 126, 2], [-84, 250, -14, 250, 3], [-76, 198, -76, 264, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    // (step 3, gauntlet wave 205: "potato-shaped boulders with decal lichen" on marine clay) no stone on the polder: no
    // scattered rocks, no outcrops (and none round the tactical beats)
    haystacks: 18, rocks: 0, outcrops: 0, craters: 48, rubblePiles: 10, cropFields: 10, sandbagLines: 14, hedgehogs: 8,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    // (step 3) the free-standing garden runs in planks, the polder kit's own yard fence (waves 183–184)
    inhabit: { stalls: 2, benches: 3, coreClutter: 18, bales: 12, stooks: 12, troughs: 2, laundry: 3, handcarts: 3, carts: 3, trucks: 4, jeeps: 3, drumClusters: 4, camps: 2, modernClutter: 18, looseClutter: 18, roadFence: 'fenceplank', yardFence: 'fenceplank' },
  },
  // (step 4, 2026-10-07; the coordinator: "Dutch steel windmotors (the Bosman type) were common in Zeeland's polders by the
  // 1930s ... The critic read an American farm wind-pump") the three windmotors in the Dutch form (sceneryKit.ts windmotor):
  // the braced lattice tower, the rosette with its tail vane, the brick pump house at the foot over the ditch.
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the drainage machinery of a
  // Zeeland polder. A steel windmotor stands on the bank of each low basin it lifts water out of, every rotor turned
  // into the same sea wind; a 150 kV line on lattice towers strides across the flats from the old land to the new.
  scenery: {
    landmarks: [
      { kind: 'windmotor', x: 82, z: -206, yawDeg: 300, name: 'the windmotor on the retention bay' },
      { kind: 'windmotor', x: 36, z: 250, yawDeg: 300, name: 'the windmotor on the overflow reach' },
      { kind: 'windmotor', x: -122, z: 228, yawDeg: 300, name: 'the windmotor by the oxbow' },
    ],
    powerLines: [{ towers: [[-440, -330], [-150, -140], [120, 90], [430, 260]], heightM: 32, name: 'the 150 kV line' }],
  },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): a second skyline rank of windbreak crowns on
  // the very low ring, sparse stone heaps on the outland (treeline 0.30 fell in the rockfield's dead zone) and more
  // tone grain (0.5 -> 0.60); the authored 0.18 amplitude is unchanged
  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): below-sea-level Zeeland — dykes and
  // poplar rows, no range: the far country plain
  horizon: { baseHex: 0x697a59, amp: 0.18, style: 'rolling', treeline: 0.30, treelineLayers: 2, panorama: { regional: 'plain', trees: 14 }, outlandRocks: 0.40, forestHex: 0x3c5840, rockHex: 0x818577, haze: 0.94, grain: 0.60 },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the broken deck (1.1 / 0.72) missed the low-stratus
  // auto branch (0.95 / 0.90 and turbidity 7), so over the flattest ring in the game the 620 m deck was fully hazed
  // at 2-12° — an explicit 420 m North Sea stratocumulus of 2600 m masses; light patchiness (cloudShadowAmp 0.18)
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'broken-stratocumulus', baseM: 600, coverage: 0.68, streets: 0.4, cells: 0.8, cellM: 750, fogBank: 0.35, fogBankTopM: 80, contrails: 0.5, contrailAge: 0.75, nightGlow: 0.6, nightGlowHex: 0xffb070 },
  sky: { sunElevationDeg: 23, sunAzimuthDeg: 148, turbidity: 4.8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82, fogDensity: 0.00062, fogTintHex: 0x96a8ad, fogMix: 0.54, envIntensity: 0.24, cloudOpacity: 1.1, cloudOpacity2: 0.72, cloudTintHex: 0xe7eded, cloudAltM: 420, cloudHazeK: 0.00016, cloudUvM: 2600, cloudShadowAmp: 0.18, sunIntensity: 3.7, sunColorHex: 0xffe9ca, hemiIntensity: 0.43 },
  minimap: { base: [88, 112, 69], hard: [122, 117, 90], soft: [54, 80, 67], forest: 'rgba(44,78,43,.84)', forestStroke: 'rgba(26,51,27,.92)', water: 'rgba(66,103,114,.84)', waterStroke: 'rgba(35,67,78,.94)', roadCasing: 'rgba(54,47,36,.92)', roadFill: 'rgba(188,176,144,.96)', buildingFill: '#d3ccb9' },
  shot: { pos: [-268, 46, -256], look: [28, 1, 112] },
  // round 66 (2026-09-24, the FFT ocean): the polders' drained lakes take the sea wind across the flats — a short
  // steady chop that reads as moving water where the sheet lay flat
  ocean: { windSpeed: 3.6, windDirDeg: 300, fetchKm: 5, amplitude: 0.9, foam: 0.05, breakers: 0.2, caustics: 0.3 },
} satisfies import('./contracts.ts').MapCompositionConfig;
