// src/world/maps/frontier.ts — Frontier Basin, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, vegetation, name and id are the map's identity and stay; the battlefield under them is new. The
// old layout was Verdant's five landforms with relief spurs added, its western beat site, three straight north-south
// roads and an east-west cross road through a village rect; its bumpy floor broke every sightline inside 74 m and
// bots met in the open middle within two minutes.
//
// Reference: the Fulda Gap's Huenfeld basin in eastern Hesse, NATO's Cold War frontier: a broad farming basin
// drained west to east by a small river between two wooded Buntsandstein ridges, with a village at the crossing, mills
// on the river, farm estates on the slopes, field lanes and stone field walls, and a checkpoint where the main road
// crosses each ridge.
//
// The story on the ground: the river valley runs west to east across the middle of the map, a broad shallow floor of
// open fields. A wooded sandstone ridge closes each side, broken by one saddle where the main road crosses it, with a
// checkpoint beside the road. Lynchet banks (old field terraces) step down each slope toward the river. The village
// stands at the crossing of the main road and the valley road. A mill stands on the river west and east of it, and a
// farm estate stands on each slope between the saddle and the river.
//
// The layout is rotationally symmetric about the village crossroads (0, 0): every feature in one half has a
// counterpart of the same kind and value turned through 180 degrees. Alpha deploys south of the southern ridge, bravo
// north of the northern ridge; each ridge screens its pad, and the two saddles sit on opposite sides of the line
// between the pads, so neither pad sees the other and every approach crosses a ridge. The three zone-control
// objectives stand on the valley floor: the west river meadow below its mill, the village square and the east river
// meadow. Three lanes cross the slopes: the west farm lane, the main road, and the ridge lane past the estate.

// 2026-10-05 (the map-revival lane; the owner: "make sure all maps look completely new and revitalized like verdant";
// gauntlet wave 116: half-timbered houses "standing alone in meadows, with no courtyards and no river", the crossroads a
// hard square of bare dirt): the village is rebuilt as the Hünfeld basin's villages stand, a Haufendorf of Hofreiten —
// closed farm courts packed along the four lanes out of the crossing, each the kit's farmhouse gable-on to the lane, its
// barn across the back of the court and in some a granary on the far side, the court walled on the lane in sandstone
// with the gate in the wall (maps/regional/yards.ts planCourt, the Hessian kit's court flag), the kitchen garden and
// woodshed behind the barn; smallholders' cottages, the school, the inn and the shop between them. The roadside builder
// places nothing (its houses stood alone in the meadows); the village ground lies in plots — yards, gardens and paddocks
// running back from the lanes (terrain villageWear). The Rathaus and the church stand on the square (the landmarks lane:
// (-34, 40) yaw 180 and (34, -40) yaw 0, each up to 24 x 16 m; the courts keep 8 m off both and off the square's 33 m).

const rot = ([x, z]: readonly [number, number]): [number, number] => [-x, -z];
const both = (path: readonly (readonly [number, number])[]): [number, number][][] => [
  path.map(([x, z]) => [x, z] as [number, number]), path.map(rot),
];

// The valley's trough: broad, shallow gorge segments along the river, symmetric through the crossroads.
const RIVER = [[-512, 34], [-400, 30], [-300, 22], [-200, 14], [-110, 8], [0, 0],
  [110, -8], [200, -14], [300, -22], [400, -30], [512, -34]] as const;
function valleyTrough(): { kind: string; x: number; z: number; length: number; width: number; height: number;
  yawDeg: number }[] {
  const out = [];
  for (let i = 1; i < RIVER.length; i++) {
    const [ax, az] = RIVER[i - 1], [bx, bz] = RIVER[i];
    const leg = Math.hypot(bx - ax, bz - az);
    out.push({ kind: 'gorge', x: (ax + bx) / 2, z: (az + bz) / 2, length: Math.round(leg / 0.86), width: 150,
      height: -3.2, yawDeg: Math.round(Math.atan2(bz - az, bx - ax) * 1800 / Math.PI) / 10 });
  }
  return out;
}

// The village (2026-10-05): the lanes out of the crossing as arms from the square (the main road south, the valley road
// west; the north and east arms are their rotation).
const SOUTH_ARM = [[0, 0], [8, -60], [24, -140]] as const;
const WEST_ARM = [[0, 0], [-60, 4], [-120, 10], [-200, 22]] as const;
type Site = { structure: string; x: number; z: number; yawDeg: number };
/** A point `s` metres out along an arm, with the arm's unit direction there. */
function along(arm: readonly (readonly [number, number])[], s: number): [number, number, number, number] {
  let acc = 0;
  for (let i = 1; i < arm.length; i++) {
    const [ax, az] = arm[i - 1], [bx, bz] = arm[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s || i === arm.length - 1) {
      const t = (s - acc) / len;
      return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / len, (bz - az) / len];
    }
    acc += len;
  }
  return [0, 0, 1, 0];
}
const round1 = (v: number) => Math.round(v * 10) / 10;
/**
 * A Hofreite on one side of an arm (`side` +1 / -1: the arm's left or right hand), its farmhouse's front gable 8.3 m off
 * the lane's line. The kit's farmhouse carries its stable wing on its local +x flank, which faces back along the arm on
 * the +1 side and out along it on the -1 side; the court lies past the wing (10 m across), the barn behind the court
 * (its gate gable toward the lane, like the house), and in a 'U' court the granary on the court's far side. planCourt
 * walls the court on the lane, the gate in the wall.
 */
function hofreite(arm: readonly (readonly [number, number])[], s: number, side: 1 | -1, kind: 'L' | 'U'): Site[] {
  const [x, z, tx, tz] = along(arm, s);
  const nx = -tz * side, nz = tx * side, w = -side, depth = 10, n0 = 8.3 + 5.35;
  const yawDeg = round1(Math.atan2(-nx, -nz) * 180 / Math.PI);
  const at = (a: number, n: number) => ({ x: round1(x + tx * a + nx * n), z: round1(z + tz * a + nz * n) });
  const sites: Site[] = [
    { structure: 'farmhouse', ...at(0, n0), yawDeg },
    { structure: 'barn', ...at(w * (8.8 + depth / 2), n0 + 5.2 + 0.6 + 6.4), yawDeg },
  ];
  if (kind === 'U') sites.push({ structure: 'granary', ...at(w * (8.8 + depth + 0.6 + 2.1), n0 + 5.2 - 3.2), yawDeg });
  return sites;
}
/** One building on an arm's side, its front `setback` m off the lane's line (its depth `d` behind that). */
function lane(arm: readonly (readonly [number, number])[], s: number, side: 1 | -1, structure: string, d: number, setback = 8): Site {
  const [x, z, tx, tz] = along(arm, s);
  const nx = -tz * side, nz = tx * side, n = setback + d / 2;
  return { structure, x: round1(x + nx * n), z: round1(z + nz * n), yawDeg: round1(Math.atan2(-nx, -nz) * 180 / Math.PI) };
}
// One half of the village (the other is its rotation): on the main road south, two courts in a row on its west side
// opening south and one past the church on its east side opening toward the square; on the valley road west, two courts
// in a row on its south side opening toward the square and one past the Rathaus on its north side opening west; the
// smallholders' cottages and the shop at the arms' ends; the school on the square's south-west corner (the inn is its
// rotation, on the north-east).
const VILLAGE_HALF: Site[] = [
  ...hofreite(SOUTH_ARM, 44, -1, 'L'), ...hofreite(SOUTH_ARM, 71.5, -1, 'U'), ...hofreite(SOUTH_ARM, 90, 1, 'L'),
  ...hofreite(WEST_ARM, 62, 1, 'U'), ...hofreite(WEST_ARM, 89.5, 1, 'L'), ...hofreite(WEST_ARM, 66, -1, 'U'),
  lane(SOUTH_ARM, 104, -1, 'cottage', 8.4), lane(SOUTH_ARM, 114, 1, 'cornershop', 10),
  lane(WEST_ARM, 116, 1, 'cottage', 8.4), lane(WEST_ARM, 95, -1, 'cottage', 8.4),
  { structure: 'schoolhouse', x: -36, z: -50, yawDeg: 90 },
];
// 2026-10-05 (the map-revival lane, through the coordinator): the Verdant recipe's belts. The lynchet banks carry their
// field trees — a row of oaks along each bank's crest (the Stufenraine of the Hessian hillsides), each with its rotation
// (vegetation.ts belts; a bank inside the village's margin plants none) — and the river's line through the meadows its
// riparian trees, alder and willow drawn by the map's aspen (the biome's leafy birch form) along the south bank west of
// the village and the north bank east of it (the valley road keeps the other bank).
const LYNCHETS = [[-250, -168, 160, -3], [110, -176, 150, 4], [-110, -122, 130, 2], [-70, -100, 80, -2]] as const;
const LYNCHET_HEDGES = LYNCHETS.flatMap(([x, z, length, yaw]) => {
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180), h = length * 0.4;
  return [[x, z], [-x, -z]].map(([cx, cz]) => ({ x0: cx - c * h, z0: cz - s * h, x1: cx + c * h, z1: cz + s * h,
    gap: 6.5, jitter: 1.4, skip: 0.15, species: 'oak' as const }));
});
const RIVER_TREES = RIVER.slice(0, 4).flatMap(([ax, az], i) => {
  // the last leg stops at the village's edge (x -128)
  const [bx, bz] = i < 3 ? RIVER[i + 1] : [-128, 9.6];
  return [[ax, az - 10, bx, bz - 10], [-ax, -az + 10, -bx, -bz + 10]].map(([x0, z0, x1, z1]) => (
    { x0, z0, x1, z1, gap: 11, jitter: 3, skip: 0.3, species: 'aspen' as const }));
});

const rotateSite = (site: Site): Site => ({
  structure: site.structure === 'schoolhouse' ? 'tavern' : site.structure, x: -site.x, z: -site.z, yawDeg: site.yawDeg + 180,
});

export default {
  id: 'frontier',
  name: 'Frontier Basin',
  blurb: 'A broad farming basin between two wooded ridges, a river village, mills and ridge checkpoints',

  terrain: {
    hillScale: 0.55,  // the basin's broad swell (was 1.08: the bumpy floor broke every sightline inside 74 m)
    microScale: 0.75, // field-scale folds (was 1.16)
    rimH: 31,
    marshes: [],
    // 2026-10-05 (the map-revival lane; the coordinator's river (a): the signs of the river): each mill's pond, the water held
    // back above the wheel, beside the mill on the valley floor (rotation pair), liquid water (round 3: the splat's
    // open-water mode makes it water: until then the ponds drew as the legacy mud layer)
    softLakes: true,
    lakes: [{ x: -392, z: 84, r: 13, depth: 1.0, boats: 0 }, { x: 392, z: -84, r: 13, depth: 1.0, boats: 0 }],
    // The village: one graded rect around the crossroads.
    village: { x0: -128, x1: 128, z0: -86, z1: 86, cx: 0, cz: 0, feather: 44, flatten: 0.86, relief: 0.14 },
    // 2026-10-05 (the map-revival lane): the village ground in its plots — yards, kitchen gardens and paddocks running
    // back from the lanes (terrain.ts createVillagePlotWear), not wear patches round lone houses
    villageWear: 'plots',
    // Authored paths stop inside the square; the endpoint completion grades each exit through the rim
    // (maps/roadEndpoints.ts).
    roads: { paths: [
      // 0 — the main road: south edge, over the southern saddle past its checkpoint, through the crossroads, over the
      // northern saddle, north edge. Road 0 carries the utility-pole line (mapQuality).
      [[62, -448], [60, -380], [54, -300], [40, -220], [24, -140], [8, -60], [0, 0],
        [-8, 60], [-24, 140], [-40, 220], [-54, 300], [-60, 380], [-62, 448]],
      // 1 — the valley road: west edge, along the river's north bank past the west mill, through the crossroads, past
      // the east mill, east edge.
      [[-448, 44], [-380, 40], [-300, 34], [-200, 22], [-120, 10], [-60, 4], [0, 0],
        [60, -4], [120, -10], [200, -22], [300, -34], [380, -40], [448, -44]],
      // 2 / 3 — the farm lanes: from the edge past the west end of a ridge, down the slope past the farm estate to
      // the valley road.
      ...both([[-366, -448], [-356, -380], [-346, -300], [-306, -214], [-250, -138], [-214, -70], [-200, 22]]),
      // 4 / 5 — the ridge lanes: from the main road at the saddle along the ridge's foot to the support camp, then
      // down to the valley road at the east mill.
      ...both([[54, -300], [130, -236], [206, -176], [268, -110], [300, -34]]),
    ] },
    // The village square and the two river meadows below the mills, the mowing grounds by the river: level aprons the
    // zone-control placement seats its 30 m discs on. Each meadow lies on the river flats clear of the valley road
    // (an apron on the road would ramp it past a road grade), at the flats' own level.
    hardstands: [
      { x: 0, z: 0, width: 60, length: 60, yawDeg: 0, grade: 0 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): a 24 m bank
      { x: -290, z: -30, width: 60, length: 60, yawDeg: 0, level: -3.4, grade: 0, bankM: 24 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): a 16 m bank
      { x: 290, z: 30, width: 60, length: 60, yawDeg: 0, level: -2.5, grade: 0, bankM: 16 },
    ],
    landforms: [
      ...valleyTrough(),
      // The southern ridge, broken at the saddle (x 20..126) where the main road crosses; the northern ridge is its
      // rotation, its saddle on the other side of the line between the pads.
      { kind: 'ridge', x: -150, z: -262, length: 340, width: 84, height: 12, yawDeg: -4 },
      { kind: 'ridge', x: 236, z: -290, length: 220, width: 80, height: 9, yawDeg: 6 },
      { kind: 'ridge', x: 150, z: 262, length: 340, width: 84, height: 12, yawDeg: -4 },
      { kind: 'ridge', x: -236, z: 290, length: 220, width: 80, height: 9, yawDeg: 6 },
      // The wooded knob at each ridge's saddle end, over the hollow the line between the pads crosses.
      { kind: 'knoll', x: -48, z: -266, rx: 56, rz: 44, height: 6, yawDeg: -4 },
      { kind: 'knoll', x: 48, z: 266, rx: 56, rz: 44, height: 6, yawDeg: -4 },
      // Lynchet banks: old field terraces stepping down each slope toward the river, hull-down lines for both teams.
      ...[[-250, -168, 160, -3], [110, -176, 150, 4], [-110, -122, 130, 2], [-70, -100, 80, -2]].flatMap(([x, z, length, yaw]) => [
        { kind: 'ridge', x, z, length, width: 26, height: 2.6, yawDeg: yaw },
        { kind: 'ridge', x: -x, z: -z, length, width: 26, height: 2.6, yawDeg: yaw },
      ]),
    ],
  },

  spawns: {
    // Alpha deploys behind the southern ridge's western arm; bravo's seven pads are the rotation of that ground,
    // behind the northern ridge's eastern arm. 830 m between the anchors.
    player: { x: -70, z: -410 },
    enemies: [
      { x: 70, z: 410 }, { x: 22, z: 400 }, { x: 118, z: 400 }, { x: -22, z: 382 },
      { x: 162, z: 382 }, { x: 46, z: 442 }, { x: 94, z: 442 },
    ],
  },

  splat: {
    fieldPatch: 1, tintA: [1.10, 1.03, 0.78], tintB: [0.72, 0.78, 0.58],
    tintC: [1.04, 0.98, 0.73], roadTint: [0.82, 0.77, 0.66], midRelief: 0.82,
    // ground lane (wave 83: Hesse "a neutral charcoal grey, a black-earth colour wrong for Hesse's brown loess and
    // red-sandstone soils"): the loam warmer at its own luminance (~0.157 / 0.096 / 0.052) and its plough a warm mid
    // brown (~0.12 / 0.070 / 0.036), not the chernozem's near-black
    soilTint: [1.22, 0.98, 0.78], ploughLift: 1.3,
    // round 3 (2026-10-06, gauntlet wave 138: "no readable river, water meadows or mills"): the mill ponds are liquid
    // water — the open-water mode, tuned as Amberford's river: bank riffles only, a tight ramp, narrow muddy banks
    seaLake: true, seaFoam: 0.12, seaRamp: [0.10, 0.45], iceDrift: 0.06, marshGloss: 0.85, iceSky: [0.26, 0.34, 0.42],
  },
  vegetation: {
    species: ['pine', 'spruce', 'oak', 'aspen'], clusterMix: [['pine', 0.36], ['spruce', 0.28], ['oak', 0.24], ['aspen', 0.12]],
    loneMix: [['oak', 0.34], ['aspen', 0.26], ['pine', 0.22], ['spruce', 0.18]], rimMix: [['pine', 0.38], ['spruce', 0.34], ['oak', 0.18], ['aspen', 0.10]],
    // (round 3, gauntlet wave 138: "a savanna-like scatter of lone trees on tan ground") the loose field trees halved —
    // the basin's field trees stand in its lines, the lynchet oaks and the river's alders (was 188)
    clusterCount: 78, loneCount: 100, rimCount: 116, grassDensity: 1.08,
    // (round 3, wave 138's chase view: a woodlot stood on the main road's southern approach once the mill ponds reseated
    // the tree stream) the main road's approach to the village, south and its rotation north, open ground
    avoid: [{ x: -20, z: -115, r: 40 }, { x: 20, z: 115, r: 40 }],
    bushCount: 1.18, bushSpecies: 'oak',
    // the lynchet banks' field trees and the river's line (2026-10-05; LYNCHET_HEDGES, RIVER_TREES above)
    belts: [...LYNCHET_HEDGES, ...RIVER_TREES],
  },
  props: {
    // regional-buildings lane: the Hessian Fachwerk kit (maps/regional/hessian.ts)
    architecture: 'hessian',
    // The landmarks lane (2026-10-05; src/world/landmarks/): on the square's north-west plot the Rathaus of a Hessian
    // market village — Alsfeld's kind: the stone arcade, two storeys of render in an oak frame, the framed gables and
    // the two corner turrets under slate spires, its front to the square; on the south-east plot the village church,
    // its west tower with the clock and the spire toward the square, the nave and the chancel to the east. Each within
    // the agreed 24 × 16 m plot.
    landmarks: [
      // (each at the edge of the square's paved apron, a stamped road out to 32 m, as the plot's old building stood:
      // a 0.5 m road-core margin; the church turned so its length lies along the plot's 24 m, its tower to the square.
      // Every piece here is set into the map-revival lane's finished village, so each vetoes its ground (types.ts
      // `ground`): the courts' yard clutter draws as on the map without the pieces and only what would stand on a
      // piece's ground is left out — keep-off discs made the yards draw again round them, and every court re-rolled)
      { kind: 'townHall', x: -34, z: 40, yawDeg: 180, name: 'the Rathaus on the square', roadMargin: 0.5, ground: 'veto',
        params: { frame: true, width: 20, depth: 11, storeys: 3, tower: 28 } },
      { kind: 'church', x: 34, z: -40, yawDeg: -90, name: 'the village church', roadMargin: 0.5, ground: 'veto',
        params: { tradition: 'western', length: 15.8, width: 9.5, tower: 30, walls: 'render' } },
      // round 2 (2026-10-06; gauntlet wave 156: "the Rathaus and church stand on bare mud with no market square or
      // churchyard"; the seats agreed with the map-revival lane's round 3): the market square's setts before the Rathaus
      // (x -49..-19, z 9..29, half on the square's hardstand, off the carriageways, south of the assault line's keep-out)
      // with the Franconian Marktbrunnen at its west end (clear of the carriageways' cores), the Rathaus's arcade open on the market with two stalls under it; the
      // churchyard along the church's south flank east of the hunting blind (the free ground south of the chapel site), its low stone wall, the gate
      // in its west side toward the road, the headstones and Latin crosses, the path to the church
      { kind: 'path', x: -34, z: 19, yawDeg: 0, name: 'the market square', ground: 'veto', params: { length: 20, width: 30, surface: 'stone' } },
      { kind: 'fountain', x: -46, z: 18, yawDeg: 0, name: 'the Marktbrunnen', ground: 'veto', params: { style: 'markt', radius: 2.6 } },
      { kind: 'churchyard', x: 38.25, z: -53.45, yawDeg: 180, name: 'the churchyard', ground: 'veto', params: { width: 17.5, depth: 14, tradition: 'latin', fence: 'wallstone',
        gate: 'right', graves: 10, path: 1.4 } },
    ],
    // 2026-10-05 (the map-revival lane): the roadside builder places nothing — the village is authored (VILLAGE_HALF)
    plan: [],
    // the courts' buildings stand a few metres apart (the planned-site spacing was the roadside builder's 9 m)
    spacingPad: 2,
    // (round 3; wave 138 "houses stand alone on lawns and mud", the facades lane's wave 150 "the church stands on a flat
    // bare-dirt pad") the trodden disc under a building half its old reach — the courts and the plots lay the village's
    // ground — and none under the church and the chapel, which stand in their churchyards' turf
    foundationDiscs: { scale: 0.6, none: ['church', 'chapel'] },
    // The landmarks: the church on the square, the two mills on the river, the farm estates on the slopes.
    // The landmarks lane (2026-10-05, the plots agreed with the map-revival lane): the church's and the chapel's plots
    // carry the set pieces below — vacated here, so every other site keeps its draws and stands where it stood.
    plannedSites: [
      { structure: 'church', x: -34, z: 40, yawDeg: 180, vacated: true }, { structure: 'chapel', x: 34, z: -40, yawDeg: 0, vacated: true },
      { structure: 'mill', x: -370, z: 58, yawDeg: 180 }, { structure: 'mill', x: 352, z: -64, yawDeg: 0 },
      // the farm estates by the farm lanes: house, barn and granary round a yard (sited on the slope's level shelves,
      // so the halves differ by a few metres)
      { structure: 'farmhouse', x: -214, z: -112, yawDeg: 90 }, { structure: 'barn', x: -208, z: -138, yawDeg: 0 },
      { structure: 'granary', x: -186, z: -96, yawDeg: 90 },
      { structure: 'farmhouse', x: 172, z: 100, yawDeg: 270 }, { structure: 'barn', x: 214, z: 112, yawDeg: 180 },
      { structure: 'granary', x: 210, z: 92, yawDeg: 270 },
      // the farmsteads by the ridge lanes
      { structure: 'farmhouse', x: 202, z: -136, yawDeg: 0 }, { structure: 'barn', x: 250, z: -70, yawDeg: 90 },
      { structure: 'farmhouse', x: -214, z: 112, yawDeg: 180 }, { structure: 'barn', x: -238, z: 88, yawDeg: 270 },
      // the village's courts, cottages, school, inn and shop (2026-10-05; above)
      ...VILLAGE_HALF, ...VILLAGE_HALF.map(rotateSite),
    ],
    destructibleBuildings: ['fieldhut', 'huntingblind', 'commandtent', 'checkpointhut'],
    tacticalBeats: [
      { id: 'south-saddle-checkpoint', role: 'scout', x: 90, z: -330, yawDeg: 8,
        structure: 'checkpointhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'north-saddle-checkpoint', role: 'scout', x: -90, z: 330, yawDeg: 188,
        structure: 'checkpointhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'west-hof', role: 'brawl', x: -320, z: -60, yawDeg: 90,
        structure: 'fieldhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -14 },
      { id: 'east-hof', role: 'brawl', x: 320, z: 60, yawDeg: 270,
        structure: 'fieldhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 14 },
      { id: 'south-ridge-camp', role: 'support', x: 255, z: -160, yawDeg: 20,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
      { id: 'north-ridge-camp', role: 'support', x: -255, z: 160, yawDeg: 200,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: 15 },
    ],
    buildingLat: [11, 4], maxSpread: 2.4,
    wallStyle: 'fieldstone', wallStoneChance: 0.55,
    // Field walls: the estate yards and the field boundaries on the slopes, each with its rotated twin.
    wallRuns: [
      [-286, -150, -200, -150, 3], [286, 150, 200, 150, 3],
      [-170, -190, -100, -190, 2], [170, 190, 100, 190, 2],
      [120, -200, 200, -200, 3], [-120, 200, -200, 200, 3],
      [-60, -110, 0, -116, 2], [60, 110, 0, 116, 2],
      [300, -150, 360, -170, 2], [-300, 150, -360, 170, 2],
      // the village's orchard and churchyard walls on the valley floor
      [-160, -40, -160, -100, 3], [160, 40, 160, 100, 3],
      [-110, 96, -40, 104, 2], [110, -96, 40, -104, 2],
      [70, 30, 70, 80, 1], [-70, -30, -70, -80, 1],
      [-210, 40, -150, 56, 2], [210, -40, 150, -56, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 24, rocks: 150, outcrops: 20, craters: 48, rubblePiles: 10,
    cropFields: 9, hedgehogs: 10, sandbagLines: 14,
    tankWrecks: { era: 'modern', count: 6, debris: true,
      ids: ['m1a2', 't90m', 'm551_sheridan', 'm60a2', 'marder1a3', 'pl01'] },
    inhabit: {
      stalls: 2, benches: 3, coreClutter: 18, bales: 14, stooks: 12,
      troughs: 2, churns: 2, laundry: 2, handcarts: 3, carts: 4,
      trucks: 5, jeeps: 4, drumClusters: 5, camps: 4, modernClutter: 18,
      // (round 4) no yardFence: the white picket is gone (waves 183–184); the free-standing garden runs take the props
      // layer's default (the scenery lane: the kit's own non-picket fence, else plank)
      roadFence: 'fenceplank',
    },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Buntsandstein breaks out
  // of each wooded ridge's valley flank in red ledges; a carved shrine (Bildstock) stands where each farm lane meets
  // the valley road, as they do all over the Fulda country; a timber field cross stands by the main road below each
  // saddle; a 380 kV line on lattice towers strides through the basin past the village. Rotated through 180 degrees
  // about the crossroads like the rest of the map.
  scenery: {
    rocks: [
      { form: 'outcrop', geology: 'sandstone', x: -200, z: -236, radius: 8, height: 4.5, yawDeg: -4, name: 'the south ridge ledges' },
      { form: 'outcrop', geology: 'sandstone', x: 200, z: 236, radius: 8, height: 4.5, yawDeg: 176, name: 'the north ridge ledges' },
    ],
    // the red sandstone breaking out under the ridge woods
    rockFields: [
      { geology: 'sandstone', x: -150, z: -262, radius: 140, count: 6, slopeBias: 0.7, size: [2.5, 5], name: 'the south ridge sandstone' },
      { geology: 'sandstone', x: 150, z: 262, radius: 140, count: 6, slopeBias: 0.7, size: [2.5, 5], name: 'the north ridge sandstone' },
    ],
    landmarks: [
      { kind: 'bildstock', x: -208, z: 36, yawDeg: 150, name: 'the shrine at the west farm lane' },
      { kind: 'bildstock', x: 208, z: -36, yawDeg: -30, name: 'the shrine at the east farm lane' },
      { kind: 'waysidecross', x: 32, z: -270, yawDeg: 90, name: 'the field cross below the south saddle' },
      { kind: 'waysidecross', x: -32, z: 270, yawDeg: -90, name: 'the field cross below the north saddle' },
    ],
    // the 380 kV line across the basin, one tower in each half of the valley floor on either side of the village
    powerLines: [{ towers: [[-440, -150], [-147, -50], [147, 50], [440, 150]], heightM: 36, name: 'the 380 kV line' }],
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the Fulda Gap's basin under the
    // Rhön: low rounded forested hills, no peaks
    baseHex: 0x526344, amp: 0.8, style: 'rolling', treeline: 0.91, treelineLayers: 3, panorama: { regional: 'upland' },
    forestHex: 0x2f472d, rockHex: 0x6c6b5c, haze: 0.94, grain: 0.66,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cloud-streets', contrails: 0.35 },
  sky: {
    sunElevationDeg: 27, sunAzimuthDeg: 121, turbidity: 4.4, rayleigh: 1.25,
    mieCoefficient: 0.0058, mieDirectionalG: 0.82, fogDensity: 0.00066,
    fogTintHex: 0x8293a5, fogMix: 0.50, envIntensity: 0.22,
    cloudOpacity: 1.0, cloudOpacity2: 0.7, cloudTintHex: 0xf4f4ef,
    sunIntensity: 4.25, sunColorHex: 0xffebcf, hemiIntensity: 0.38,
  },
  minimap: {
    base: [82, 94, 55], hard: [112, 105, 86], soft: [48, 69, 55],
    forest: 'rgba(36,61,31,.84)', forestStroke: 'rgba(21,38,18,.92)',
    water: 'rgba(54,78,80,.72)', waterStroke: 'rgba(28,44,46,.9)',
    roadCasing: 'rgba(46,40,31,.92)', roadFill: 'rgba(188,171,137,.96)', buildingFill: '#cbd0d2',
  },
  // from the southern saddle over the estate and the lynchets to the village, the river and the northern ridge
  shot: { pos: [150, 40, -330], look: [-20, 2, 40] },
  // round 3 (2026-10-06): the mill ponds' water sheet (splat.seaLake) — still ponds: a breath of the westerly over a few
  // hundred metres of fetch, no foam or breakers, the stream's gravel faintly lit under it
  ocean: { windSpeed: 2.2, windDirDeg: 250, fetchKm: 0.4, amplitude: 0.45, foam: 0, breakers: 0, caustics: 0.3 },
} satisfies import('./contracts.ts').MapCompositionConfig;
