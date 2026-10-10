// src/world/maps/ruinspires.ts — Ruinspires: Sarajevo under siege, the Miljacka's valley (the map-revival lane, mr1,
// 2026-10-06; docs/MAP-LAYOUT-BRIEF.md). Rebuilt from maps-and-layouts lane B's redesign of 2026-10-02 (the boulevard
// on a flat floor between two low ridges, the teams on the ridges): gauntlet wave 162 read it as "a sparse, clean
// blockout on a flat plain", with no river and no narrow valley between steep built-up slopes.
//
// Reference: Sarajevo under siege (1992-1996). The city fills a narrow valley running west to east. The Miljacka runs
// down its floor between stone quays, crossed every few hundred metres by its bridges, the Ottoman stone arches among
// them. The Austro-Hungarian blocks and the Yugoslav towers stand along the floor's avenues: the tram boulevard ("Sniper
// Alley") with the twin office towers, the Holiday Inn and the parliament on one bank, the quay avenue on the other. The
// old mahalas climb both flanks in steep terrace streets, sunlit to the north under Vratnik and Kovači, shaded to the
// south under Trebević. The cemeteries the siege filled lie up the slopes below the woods.
//
// The story on the ground: the valley's floor is about 160 m wide. Each flank rises about 24 m over 190 m (a fifth at
// its steepest) to a bench, then 14 m more to the wooded crest; past the playable edge the hills rise on into the woods.
// The river meanders across the floor from the south side in the west to the north side in the east. An avenue follows
// each bank, five bridges cross between them, and each flank has a bench street along its bench, three terrace streets
// climbing to it from its avenue and a trunk road over its crest to the outside world. The teams deploy at the valley's
// two ends: alpha in the west on the north bank, bravo in the east on the south bank, each with a bridge at its exit, so
// neither team owns a bank. The battle runs along the valley in four lanes, the two bench streets and the two banks,
// with the terrace streets and the mahalas' garden walls between them.
//
// The layout is rotationally symmetric about the valley's centre (0, 0), except the third zone (below).
//
// Objectives (the coordinator's ruling, 2026-10-06): a river through the centre leaves no dry disc at the rotation centre,
// so the three zones stand across the valley's waist on the line of equal drives:
// - the north bench's square and the south bench's square, a rotation pair;
// - the third on the north bank by the central bridge. Its value is symmetric (equal planned drives from both pads,
//   within 5 %) but its geometry is not. The 40-seed all-bot win split per side must stay within 45-55 %; if it leans,
//   the zone moves along the bank before any cover is added.
// The turbo-ball kickoff stands at the third zone's rotation twin on the south bank.
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
import { createMarshChannel } from './marshChannel.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
type P = [number, number];
/** The valley's rotation about its centre: every authored north-side piece has its south-side twin. */
const turn = (p: P): P => [-p[0], -p[1]];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The Miljacka's line: z at x, rotationally symmetric (from the floor's south side in the west to its north side in the east). */
const RIVER_AMP = 60, RIVER_L = 800;
const riverZ = (x: number) => RIVER_AMP * Math.sin(Math.PI * x / RIVER_L);
/** The five bridges: the central stone arch and two rotation pairs, the outer pair at the deployments' exits. */
const BRIDGE_X = [-330, -165, 0, 165, 330] as const;
/** Each bridge's deck over the water (m), the hump of a stone arch: a few decimetres over the highest of its approaches
 * near either end, so each road rises onto the deck (a deck level with a bank road met a hull's nose pitched down off a
 * falling approach 1 cm under the slab's top, and the crossing sweep's hull stopped dead); the rotation pairs alike. */
const BRIDGE_CLEAR: Readonly<Record<number, number>> = { 330: 0.8, 165: 1.75, 0: 0.8 };
/** Each avenue runs this far off the river's line, on its own bank. */
const AVENUE_OFF = 36;

// The river's stations every 32 m from edge to edge, the bridges' stations among them (terrain.ts resolves each
// `crossing: 'bridge'` station's deck from the road that meets it; the street kit dresses the arches). Elsewhere the
// river is shallow soft water a hull fords slowly.
const RIVER_STATIONS = (() => {
  const xs = new Set<number>();
  for (let x = -512; x <= 512; x += 32) if (BRIDGE_X.every((b) => Math.abs(x - b) > 14)) xs.add(x);
  for (const b of BRIDGE_X) xs.add(b);
  return [...xs].sort((a, b) => a - b).map((x) => BRIDGE_X.includes(x as typeof BRIDGE_X[number])
    ? { x, z: r1(riverZ(x)), r: 10, dip: 0.7, crossing: 'bridge' as const, deckClearM: BRIDGE_CLEAR[Math.abs(x)] }
    : { x, z: r1(riverZ(x)), r: 14, dip: 1.2 });
})();
const BRIDGES = RIVER_STATIONS.filter((station) => 'crossing' in station);
// the bank line read smooth (Amberford's: circles at 0.96 of their radius, laid half a radius apart)
const RIVER_BANK = [0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96,
  0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96] as const;
// the interpolated cells near a bridge keep inside the bridge station's own bank envelope, so the span stays short
const RIVER = createMarshChannel(RIVER_STATIONS, 0.5).map((station) => ({ ...station, radii: RIVER_BANK })).map((station) => {
  let r = station.r;
  for (const bridge of BRIDGES) {
    const index = RIVER_STATIONS.indexOf(bridge);
    const previous = RIVER_STATIONS[index - 1], next = RIVER_STATIONS[index + 1];
    const length = Math.hypot(next.x - previous.x, next.z - previous.z);
    const tx = (next.x - previous.x) / length, tz = (next.z - previous.z) / length;
    const dx = station.x - bridge.x, dz = station.z - bridge.z;
    const along = Math.abs(dx * tx + dz * tz);
    if (along >= r) continue;
    const across = Math.max(0, bridge.r - Math.abs(-dx * tz + dz * tx));
    r = Math.min(r, Math.hypot(along, across));
  }
  return r === station.r ? station : { ...station, r };
});

/** The north bank's avenue (the tram boulevard), west to east, a node every 32 m from edge to edge; the south bank's quay
 * avenue is its rotation. Every road here is authored complete (each exit on the map's edge, each junction end on its
 * street's own line): the endpoint completion then leaves the net byte-identical, and the river's fitted surface, which
 * reads the ground at the valley's two ends, does not move with it (roadContinuity's negative control). */
const NORTH_AVENUE: P[] = Array.from({ length: 33 }, (_, i) => -512 + i * 32).map((x) => [x, r1(riverZ(x) + AVENUE_OFF)] as P);
const avenueZ = (x: number) => riverZ(x) + AVENUE_OFF;
/** A point exactly on the north avenue's line at x (between its nodes, on the chord the road draws). */
const onAvenue = (x: number): P => {
  const i = Math.min(NORTH_AVENUE.length - 2, Math.floor((x + 512) / 32)), [x0, z0] = NORTH_AVENUE[i], [x1, z1] = NORTH_AVENUE[i + 1];
  return [x, z0 + (z1 - z0) * (x - x0) / (x1 - x0)];
};
/** The north flank's streets: the bench street along the bench from edge to edge, three terrace streets climbing from the
 * avenue to it (each crossing the slope's steep band at about 50 degrees to its contours), and the trunk road over the
 * crest. No street runs along the slope itself: a junction on a slope steps between the two roads' elevation grids (the
 * brief's 18 % read 51 % where the bench street's first ends met a contour street on the slope). */
const NORTH_BENCH: P[] = [[-448, 292], [-380, 292], [-300, 292], [-220, 291], [-150, 291], [-70, 291], [10, 291],
  [90, 291], [150, 291], [220, 291], [300, 292], [380, 292], [448, 292]];
// (sparse nodes and no crossing on the slope: terrain.ts blends two roads' nodes within three of their nearest pair to one
// height, which on a slope lifted a climbing street's nodes by metres and read 23 % over a lane's crossing)
const NORTH_CLIMB: P[] = [onAvenue(-70), [-40, 90], [40, 160], [110, 230], [150, 291]];
const NORTH_CLIMB_W: P[] = [onAvenue(-300), [-280, 60], [-220, 130], [-150, 200], [-80, 291]];
const NORTH_CLIMB_E: P[] = [onAvenue(230), [266, 118], [314, 158], [366, 222], [400, 292]];
const NORTH_TRUNK: P[] = [[50, 291], [140, 335], [260, 392], [282, 448]];

const both = (path: P[]): [P[], P[]] => [path, path.map(turn)];

/** The zones' squares and the kickoff's (see the header): north bench, north bank by the central bridge, south bench;
 * the kickoff at the bank square's rotation twin. */
const Z_BENCH: P = [25, 296], Z_BANK: P = [14, r1(riverZ(14) + 64)];

/**
 * The city's landmarks: authored sites, each with its rotation twin about the valley's centre, so each bank and each flank
 * holds the same weight of cover. North bank and north flank authored; the south side is their rotation, a twin of the same
 * class (a tower for a tower, a hall for a hall), its own Sarajevo landmark where the kit has one.
 */
const NORTH_SITES: ReadonlyArray<{ structure: string; twin: string; x: number; z: number; yawDeg: number }> = [
  // the north bank's avenue, west to east: the slab blocks of Novo Sarajevo, the Holiday Inn, the twin office towers
  // and the museum at Marijin Dvor, then the Orthodox cathedral, the Markale market hall and the čaršija toward the old town
  { structure: 'parkingdeck', twin: 'civichall', x: -330, z: 8, yawDeg: 0 },
  { structure: 'needletower', twin: 'megatower', x: -222, z: r1(avenueZ(-222) + 26), yawDeg: 0 },
  { structure: 'arcology', twin: 'broadcasttower', x: -150, z: r1(avenueZ(-150) + 27), yawDeg: 0 },
  { structure: 'civichall', twin: 'parkingdeck', x: -104, z: r1(avenueZ(-104) + 26), yawDeg: 0 },
  { structure: 'factory', twin: 'foundryoffice', x: 112, z: r1(avenueZ(112) + 26), yawDeg: 90 },
  { structure: 'warehouse', twin: 'depot', x: 196, z: r1(avenueZ(196) + 25), yawDeg: 0 },
  // the north flank: the mahalas' mosques, the Catholic cathedral on the slope's foot, an estate tower at the west end
  { structure: 'firestation', twin: 'firestation', x: -170, z: 236, yawDeg: 0 },
  { structure: 'firestation', twin: 'firestation', x: 150, z: 236, yawDeg: 0 },
  { structure: 'foundryoffice', twin: 'factory', x: 20, z: 118, yawDeg: 0 },
  { structure: 'terracetower', twin: 'terracetower', x: -330, z: 240, yawDeg: 0 },
  // a Yugoslav slab on the floor's back lots behind the boulevard's blocks (Grbavica's on the south bank, its twin)
  { structure: 'parkingdeck', twin: 'parkingdeck', x: -200, z: 92, yawDeg: 0 },
];
const PLANNED_SITES = NORTH_SITES.flatMap((site) => [
  { structure: site.structure, x: site.x, z: site.z, yawDeg: site.yawDeg },
  { structure: site.twin, x: -site.x, z: -site.z, yawDeg: site.yawDeg + 180 },
]);

/** The mahalas' field walls down the fall line between the terrace streets, a gap in each; the south flank's are their
 * rotations. (The whitewashed garden walls on the floor's back lots, the benches' lips and orchards are the street kit's:
 * maps/sarajevoStreets.ts.) */
const NORTH_WALLS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // the slope's lower terraces
  [-250, 160, -250, 186, 0], [-200, 160, -200, 186, 0], [-100, 160, -100, 186, 0], [20, 160, 20, 186, 0],
  [100, 160, 100, 186, 0], [175, 160, 175, 186, 0], [250, 160, 250, 186, 0],
  // the slope's upper terraces, below the bench street's rows
  [-235, 218, -235, 264, 1], [-40, 218, -40, 264, 1], [85, 218, 85, 264, 1], [185, 218, 185, 264, 1],
];
const WALL_RUNS = NORTH_WALLS.flatMap((w) => [w, [-w[0], -w[1], -w[2], -w[3], w[4]] as const]);

/** Bravo's seven pads at the east end on the south bank (two ranks across the floor); alpha's pad is their centroid's
 * rotation at the west end on the north bank. */
const BRAVO_PADS: P[] = [[380, -96], [380, -56], [380, -16], [380, 22], [416, -76], [416, -36], [416, 4]];
const BRAVO_CENTRE: P = [BRAVO_PADS.reduce((s, p) => s + p[0], 0) / 7, BRAVO_PADS.reduce((s, p) => s + p[1], 0) / 7];

const [NA, SA] = both(NORTH_AVENUE), [NBe, SBe] = both(NORTH_BENCH);
const [NCl, SCl] = both(NORTH_CLIMB), [NTr, STr] = both(NORTH_TRUNK);
const [NCw, SCw] = both(NORTH_CLIMB_W), [NCe, SCe] = both(NORTH_CLIMB_E);
/** The bridges' streets, south avenue to north avenue across each bridge's station (a node every third of each approach:
 * the map-quality receipt reads a route of fewer than six nodes as no route across the map). */
const lerpP = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const BRIDGE_STREETS: P[][] = BRIDGE_X.map((x) => {
  const south = turn(onAvenue(-x)), station: P = [x, r1(riverZ(x))], north = onAvenue(x);
  return [south, lerpP(south, station, 1 / 3), lerpP(south, station, 2 / 3), station, lerpP(station, north, 1 / 3),
    lerpP(station, north, 2 / 3), north];
});
/** The quays' street trees (waves 186/187: "almost no trees in the city"): a row of limes and planes along each avenue's
 * river side, 17 m off its line on the promenade, every 9 m with a gap here and there (the `aspen` slot, grown by the
 * trees lane's Ruinspires row as a linden-leaved broad crown on a clean bole). */
const QUAY_TREES = [NA, SA].flatMap((line) => line.slice(0, -1).map((a, i) => {
  const b = line[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  // the avenue's left normal (-tz, tx); the river lies on its other side on both avenues (a rotation pair)
  const ox = ((b[1] - a[1]) / len) * 17, oz = (-(b[0] - a[0]) / len) * 17;
  return { x0: r1(a[0] + ox), z0: r1(a[1] + oz), x1: r1(b[0] + ox), z1: r1(b[1] + oz), gap: 9, jitter: 0.8, skip: 0.12, species: 'aspen' as const };
}));

export default {
  id: 'ruinspires',
  name: 'Ruinspires',
  blurb: 'Sarajevo under siege: the Miljacka\'s valley, its bridges and the mahalas climbing both flanks',
  terrain: {
    hillScale: 0.40, microScale: 0.52, rimH: 44, marshes: RIVER,
    // The city fills the valley: the floor flattened, the flanks the landforms' own (settlementScale 1).
    village: { x0: -420, x1: 420, z0: -330, z1: 330, cx: 0, cz: 0, feather: 52, flatten: 0.86, relief: 0.10 },
    // The zones' squares: the benches' squares and the north bank's square by the central bridge; the kickoff's square
    // on the south bank (its rotation twin).
    hardstands: [
      { x: Z_BENCH[0], z: Z_BENCH[1], width: 70, length: 52, yawDeg: 0 },
      { x: -Z_BENCH[0], z: -Z_BENCH[1], width: 70, length: 52, yawDeg: 0 },
      { x: Z_BANK[0], z: Z_BANK[1], width: 64, length: 48, yawDeg: 0 },
      { x: -Z_BANK[0], z: -Z_BANK[1], width: 40, length: 32, yawDeg: 0 },
    ],
    // 0 / 1 the avenues (north bank, south bank), edge to edge; 2-6 the bridges' streets, west to east; 7 / 8 the bench
    // streets (north, south); 9 / 10 the central climbing streets; 11 / 12 the trunk roads over the crests; 13 / 14 and
    // 15 / 16 the mahalas' other climbing streets (the north flank's western and eastern, the south flank's rotations).
    roads: { paths: [NA, SA, ...BRIDGE_STREETS, NBe, SBe, NCl, SCl, NTr, STr, NCw, SCw, NCe, SCe],
      // each street's own surface, kerb to kerb: the avenues' asphalt (the tram bed down the north avenue's middle is
      // the street kit's), the bridges' setts, the mahala streets' setts in courses, the trunks patched over the shell holes
      pathStyles: [
        { surface: 'asphalt', widthM: 10 }, { surface: 'asphalt', widthM: 10 },
        ...BRIDGE_X.map(() => ({ surface: 'cobble' as const, widthM: 9.8 })),
        { surface: 'cobble', widthM: 9.8 }, { surface: 'cobble', widthM: 9.8 }, { surface: 'cobble', widthM: 9.8 },
        { surface: 'cobble', widthM: 9.8 },
        { surface: 'patched', widthM: 9.8 }, { surface: 'patched', widthM: 9.8 },
        { surface: 'cobble', widthM: 9.8 }, { surface: 'cobble', widthM: 9.8 },
        { surface: 'cobble', widthM: 9.8 }, { surface: 'cobble', widthM: 9.8 },
      ] },
    landforms: [
      // The two flanks: each rises about 24 m over 190 m from the floor's edge to its bench, then 14 m more to the crest
      // (rotation pairs; the roads keep their full height: corridorScale 1).
      { kind: 'ridge', x: 0, z: 380, length: 1200, width: 346, height: 24, yawDeg: 0, settlementScale: 1, corridorScale: 1 },
      { kind: 'ridge', x: 0, z: -380, length: 1200, width: 346, height: 24, yawDeg: 0, settlementScale: 1, corridorScale: 1 },
      { kind: 'ridge', x: 0, z: 440, length: 1200, width: 130, height: 14, yawDeg: 0, settlementScale: 1, corridorScale: 1 },
      { kind: 'ridge', x: 0, z: -440, length: 1200, width: 130, height: 14, yawDeg: 0, settlementScale: 1, corridorScale: 1 },
      // Hum's hill over the north-west corner of the crest and its rotation twin on Trebević's flank: a knoll on each
      // flank's far end, past the siege line (the crests are not one level shelf)
      { kind: 'knoll', x: -380, z: 428, rx: 60, rz: 40, height: 8, yawDeg: 0 },
      { kind: 'knoll', x: 380, z: -428, rx: 60, rz: 40, height: 8, yawDeg: 0 },
    ],
    // the ring past the edge: green Balkan highland (gauntlet wave 162 read "arid savanna" in the ring's 0.1 forest on
    // bare ground): the woods of Trebević and Igman, meadows and hedgerows between them, no farm buildings past a city
    border: { enclosure: 0.7, hillHeight: 2.4, forest: 0.6, hedgerows: 0.35, fields: 0.3, farms: 3, farmBuildings: false },
  },
  spawns: {
    // Bravo's seven pads at the east end on the south bank; alpha's pad, their centroid's rotation, at the west end on the
    // north bank. Each stands 45 m and more inside the playable edge, each with a bridge at its exit.
    player: { x: r1(-BRAVO_CENTRE[0]), z: r1(-BRAVO_CENTRE[1]) },
    enemies: BRAVO_PADS.map(([x, z]) => ({ x, z })),
  },
  splat: {
    // the Balkan valley's green (waves 186/187: the city's dead-beige turf, hue 0.11 at a third of its saturation, read as
    // "beige dunes" from the floor to the ring): a temperate sward, a brown earth, the limestone grey of the rock
    grassTone: (h: number, s: number, l: number) => [0.23, clamp01(s * 0.55), clamp01(l * 0.80)],
    dirtTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.36), clamp01(l * 0.72 + 0.03)],
    rockTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.20), clamp01(l * 0.82)],
    // the temperate sets (the green grass, the dark earth): the grey city's own ('ruinspires') muted the grass to ash
    sourcedPalette: 'verdant',
    tintA: [1.02, 1.03, 0.92], tintB: [0.84, 0.90, 0.80], tintC: [1.04, 1.03, 0.95],
    roadTint: [0.39, 0.40, 0.41], roadTexMix: 0.92, townWear: 2.2, midRelief: 0.72,
    // the Miljacka's water: liquid, its banks tight (Amberford's river ramp), a shallow green-grey mountain river over
    // its gravel, a little white water where it runs over the weirs
    seaLake: true, seaRamp: [0.10, 0.45], seaFoam: 0.10, iceDrift: 0.04, marshGloss: 0.6,
    mudTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.30), clamp01(l * 0.66)],
    iceSky: [0.34, 0.38, 0.38],
  },
  vegetation: {
    // Sarajevo's trees: broadleaves (the stand-in for the planes, limes and chestnuts of its parks and avenues), poplars
    // along the quays, birch in the parks; the rim the spruce and fir of Trebević and Igman with a little black pine (the
    // trees lane, 2026-10-06: a pine-led rim on open ground reads as savanna at range; the oak slot grows as beech there)
    species: ['oak', 'poplar', 'pine', 'birch', 'spruce', 'fir', 'aspen'],
    clusterMix: [['oak', 0.36], ['pine', 0.2], ['poplar', 0.16], ['birch', 0.12], ['spruce', 0.16]],
    loneMix: [['oak', 0.44], ['poplar', 0.28], ['birch', 0.16], ['pine', 0.12]],
    rimMix: [['spruce', 0.38], ['fir', 0.3], ['oak', 0.2], ['pine', 0.12]],
    clusterCount: 10, loneCount: 24, rimCount: 60, grassDensity: 0.25,
    bushCount: 0.30, bushSpecies: 'oak',
    // the parks up the flanks above the bench streets (rotation pairs)
    parks: [{ x: -330, z: 322, r: 46 }, { x: 330, z: -322, r: 46 }, { x: 236, z: 330, r: 40 }, { x: -236, z: -330, r: 40 }],
    belts: QUAY_TREES,
    // the town's own trees: the quays' rows and the parks up the flanks stand inside the village (vegetation.ts, the trees
    // lane's opt-in; without it every tree kept out of the town and its parks grew nothing)
    townTrees: true,
  },
  props: {
    // the city's own architecture (maps/regional/sarajevo.ts): the floor's Austro-Hungarian blocks and Yugoslav towers,
    // the flanks' mahala houses, the mosques and churches, the siege on every one; the render takes Steinburg's lime-render
    // photo tint, warm enough for the kit's ochre, cream, green and pink washes
    architecture: 'sarajevo', sourcedPalette: 'urban',
    // the north avenue's tram line, catenary and burnt trams, the container screens at the bridgeheads, the quays, the
    // white stones of the cemeteries up the flanks (maps/sarajevoStreets.ts)
    extraKits: ['sarajevo'],
    plan: [],
    plannedSites: PLANNED_SITES,
    destructibleBuildings: [
      'guardpost', 'transformershed', 'fieldhospital', 'quonsethut', 'motorpool',
      'securityoffice', 'servicegarage', 'relaystation', 'corneroffice',
    ],
    // Three strongpoint pairs, each the other's rotation: the tram depots on the floor's edge, the battery posts on the
    // benches' far ends, the hotel ruins up the slopes.
    tacticalBeats: [
      { id: 'west-tram-depot', role: 'brawl', x: -190, z: 100, yawDeg: 90,
        structure: 'servicegarage', redoubt: true, wreck: true, wreckOffsetX: 18 },
      { id: 'east-tram-depot', role: 'brawl', x: 190, z: -100, yawDeg: -90,
        structure: 'servicegarage', redoubt: true, wreck: true, wreckOffsetX: -18 },
      { id: 'north-bench-battery', role: 'support', x: -330, z: 300, yawDeg: 180,
        structure: 'transformershed', redoubt: true, wreck: true, wreckOffsetZ: 16 },
      { id: 'south-bench-battery', role: 'support', x: 330, z: -300, yawDeg: 0,
        structure: 'transformershed', redoubt: true, wreck: true, wreckOffsetZ: -16 },
      { id: 'north-hotel-ruin', role: 'scout', x: 262, z: 250, yawDeg: 180,
        structure: 'securityoffice', outcrop: { count: 6, radius: 10, scaleMax: 2.8 } },
      { id: 'south-hotel-ruin', role: 'scout', x: -262, z: -250, yawDeg: 0,
        structure: 'securityoffice', outcrop: { count: 6, radius: 10, scaleMax: 2.8 } },
    ],
    blockFill: false, streetRows: true, streetRowsAfterLandmarks: true,
    streetRowRoadStride: 1, ruinChance: 0.48, curbs: true, lampposts: true,
    // every row's whole footprint off every road's core and out of the river (props.ts)
    streetRowClearance: true,
    // The zones' squares and the kickoff's stay open (rotation pairs, the bank square's twin the kickoff's smaller square).
    streetRowKeepouts: [
      { x: Z_BENCH[0], z: Z_BENCH[1], r: 31 }, { x: -Z_BENCH[0], z: -Z_BENCH[1], r: 31 },
      { x: Z_BANK[0], z: Z_BANK[1], r: 31 }, { x: -Z_BANK[0], z: -Z_BANK[1], r: 20 },
      // the bridgeheads' small squares, both banks of every bridge: the crossings stay open
      ...BRIDGE_X.flatMap((x) => [-1, 1].map((side) => ({ x, z: r1(riverZ(x) + side * AVENUE_OFF), r: 20 }))),
      // the quays: the avenues' river sides are promenades (their trees, the barricades), the houses on the land side
      ...Array.from({ length: 37 }, (_, i) => -432 + i * 24).map((x) => ({ x, z: r1(riverZ(x)), r: 34 })),
    ],
    // the city's palette (the realistic city tones) with the Sarajevo kit's two renders carried over it: a map's tones
    // override its kit's (props.ts), so the Austro-Hungarian ochre and the Yugoslav concrete of maps/regional/sarajevo.ts
    // surfaces.tones stand here as they stand there
    tones: {
      ...makeRealisticCityBuildingTones({ value: 0.80, saturation: 0.86, soot: 0.045, roofValue: 0.78, coolAccent: 0.01 }),
      plaster2: (h: number, s: number, l: number) => [0.105, clamp01(s * 0.4 + 0.34), clamp01(l * 0.82 + 0.06)],
      plaster3: (h: number, s: number, l: number) => [0.11, clamp01(s * 0.12 + 0.03), clamp01(l * 0.78 + 0.04)],
    },
    wallStyle: 'brick', wallStoneChance: 0.74, buildingLat: [21, 4],
    // the garden and yard walls (a map without its own runs gets the generic field walls)
    wallRuns: WALL_RUNS,
    sideSkip: 0.04, spacingPad: 4.5, maxSpread: 4.2,
    // no overhead utility line: the avenues are city streets, lit by their lampposts
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: false,
    rocks: 96, outcrops: 10, craters: 128, rubblePiles: 480,
    hedgehogs: 38, sandbagLines: 26, townCraters: true,
    // the map-vehicles lane (2026-10-06, the period ruling): Sarajevo, 1992-96: the T-72M1 (the M-84's parent), the
    // T-55 (its Type 59 copy) and the BMP
    tankWrecks: { era: 'cold-war', count: 9, debris: true, ids: ['t72m1_jaguar', 'type59', 'bmp2'] },
    inhabit: {
      stalls: 1, benches: 8, coreClutter: 34, drums: 20,
      trucks: 10, jeeps: 8, drumClusters: 10, camps: 3, modernClutter: 44,
      roadFence: 'fenceplank', yardFence: 'fencerail',
    },
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): a ruined city's low rolling country
    baseHex: 0x3f4a3d, amp: 0.85, style: 'escarpment', treeline: 0.78, panorama: { regional: 'forested', ampM: 220, trees: 16 },
    // (the map-revival lane, 2026-10-06, the valley rebuild; waves 186/187: "beige dunes dotted with acacia- and palm-like
    // trees" and "low bald dunes" past the city): the wooded hills that hold Sarajevo on every side — the outland's
    // forest to its crests, its grey beds and boulders few; the far ranges (Trebević, Igman) stay the mountains lane's
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): thin grey beds on the escarpment faces
    // (the escarpment style authored none), boulder outcrops on the outland (treeline 0.18 fell in the rockfield's
    // dead zone) and more tone grain on the flattest escarpment ring (0.42 -> 0.60)
    banding: 0.05, outlandRocks: 0.15,
    forestHex: 0x2c3a2d, rockHex: 0x5c5e5c, haze: 0.95, grain: 0.60,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.42, streets: 0.3, baseM: 1100, virga: 0.6, rain: 0.25 },
  sky: {
    sunElevationDeg: 24, sunAzimuthDeg: 118, turbidity: 7.0, rayleigh: 1.15,
    mieCoefficient: 0.010, mieDirectionalG: 0.86, fogDensity: 0.00068,
    fogTintHex: 0x8e979c, fogMix: 0.60, envIntensity: 0.19,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the near-overcast deck (1.08 / 0.82) missed the
    // low-stratus auto branch (0.95 / 0.90), so its texture sat 6-7 km out in the 2-12° band — an explicit 360 m
    // broken deck of 2400 m masses; diffuse light patchiness (cloudShadowAmp 0.12)
    cloudOpacity: 1.08, cloudOpacity2: 0.82, cloudTintHex: 0xd0d1ce,
    cloudAltM: 360, cloudHazeK: 0.00014, cloudUvM: 2400, cloudShadowAmp: 0.12,
    sunIntensity: 3.8, sunColorHex: 0xffd0aa, hemiIntensity: 0.34, postExposure: 0.94,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xad9b7c },
  },
  minimap: {
    base: [76, 79, 78], hard: [88, 88, 87], soft: [59, 65, 64],
    forest: 'rgba(42,55,48,.62)', forestStroke: 'rgba(25,34,30,.82)',
    // the Miljacka legible on the plate: a deeper river tone and a firm bank line
    water: 'rgba(58,84,92,.82)', waterStroke: 'rgba(32,50,56,.94)',
    roadCasing: 'rgba(24,26,28,.96)', roadFill: 'rgba(105,107,108,.96)', buildingFill: '#c1bab0',
  },
  // from the south bench across the river to the sunlit north mahalas
  shot: { pos: [-200, 18, -250], look: [60, 10, 140] },
  // the Miljacka's surface (round 66's FFT ocean runs on every water sheet): a shallow mountain river between quays, a
  // light breeze down the valley, the shortest fetch, low chop, a little foam
  ocean: { windSpeed: 1.8, windDirDeg: 270, fetchKm: 0.8, amplitude: 0.35, foam: 0.05, breakers: 0.02, caustics: 0.3 },
} satisfies import('./contracts.ts').MapCompositionConfig;
