// src/world/maps/cliffbridge.ts — Aegis Crossing, redesigned 2026-10-02 (maps-and-layouts lane B;
// docs/MAP-LAYOUT-BRIEF.md). The palette, sky, vegetation, the stone viaduct and the name are the map's identity and
// stay; the battlefield around them is new. The old layout ran the gorge off the west edge, so the viaduct and one
// flank road were the only ways across: two lanes. The kickoff sat on alpha's bridgehead, and the zone placement left
// bravo 2.2 times alpha's drive.
//
// Reference: Ronda and the Tajo of the Guadalevín (Málaga). A river cut a narrow gorge through a limestone tableland;
// the old town grew on the gorge's two lips, and the Puente Nuevo, an eighteenth-century stone viaduct, joins them high
// above the river bed. Below the bridge the gorge floor is a dry gravel bed in summer, and the old mill paths come down
// to it where the walls open out.
//
// The story on the ground: the gorge runs east to west across the middle of the tableland. It is deepest (38 m) and
// narrowest under the viaduct and opens out toward both ends, where its floor climbs in river terraces to the tableland
// and the fords cross it. A dry gravel bed runs down its floor between low levees; the ruins of the old mills stand on
// it beside the viaduct's piers. Each lip carries a bridgehead town round a market square on the main road, and the
// viaduct's deck runs onto solid rock past both lips. Olive terraces step down the tableland on the west side, and the
// river's wooded bottomlands fill the east. Swells south and north of the towns screen each team's assembly ground.
//
// The layout is mirror-symmetric across the gorge's axis (z = 0): alpha deploys on the south tableland, bravo on the
// north. Three lanes cross the middle: the west ford past the olive terraces, the viaduct between the two towns, and
// the east ford through the bottomland woods. The gorge walls cannot be driven. The routes between the deck and the
// gorge floor run from each abutment along the rim to the river terraces at the gorge's ends and down them: about
// 610 m from the deck's end to the floor beside the viaduct, against 200 m over the deck. The zone-control discs stand
// on the two market squares and on the gorge floor west of the viaduct, where the mills stood; the turbo-ball kickoff
// on the gorge floor east of it.
//
// The towns and the country (map revival lane 2, 2026-10-05; the owner: every map as new as Verdant): the Andalusian
// kit (maps/regional/andalusian.ts) builds every planned site as the Serranía's own — the casa consistorial arcaded on
// each square under its clock and bell gable where the old kit's domed hall stood, the stone parish church and its
// belfry, the Nasrid wall tower at the bridgehead, the whitewashed town houses with their rejas and iron balconies, the
// posada with its cart gate, the escuelas, the white hermitage with its bell gable, the cortijos round their patios with
// their barns and dovecotes, the ruined flour mills on the gorge floor. Every building stands where it stood, and below
// each square the roads leave the crossroads between terraces of whitewashed houses, as Ronda's streets do. The country
// is the tableland's: olive groves stepping down the west terraces, holm oak in the stands and on the uplands, poplars in
// the river's bottomland, cypresses by the hermitages and on the cortijos' drives, the scrub wild olive; the grain
// standing and stacked on the tableland.
import verdant from './verdant.ts';
import type { MapCompositionConfig } from './contracts.ts';

/** A point's mirror across the gorge's axis (z = 0), with the yaw that faces the same way across it. */
const mirrorSite = <T extends { z: number; yawDeg: number }>(site: T): T => ({ ...site, z: -site.z, yawDeg: 180 - site.yawDeg });

// The bridgehead towns: market squares on the main road, the parador and the church facing each other across it,
// rows of houses down the road to the swell. South town authored; the north town is its mirror.
const SOUTH_TOWN = [
  { structure: 'civichall', x: -62, z: -158, yawDeg: 90 },
  { structure: 'church', x: 60, z: -170, yawDeg: -90 },
  { structure: 'tower', x: 52, z: -122, yawDeg: 0 },
  { structure: 'rowhouse', x: -48, z: -198, yawDeg: 90 },
  { structure: 'rowhouse', x: -46, z: -220, yawDeg: 90 },
  { structure: 'rowhouse', x: 46, z: -208, yawDeg: -90 },
  { structure: 'tavern', x: 26, z: -232, yawDeg: -90 },
  { structure: 'cottage', x: -30, z: -284, yawDeg: 90 },
  { structure: 'schoolhouse', x: -84, z: -236, yawDeg: 5 },
  { structure: 'chapel', x: -160, z: -246, yawDeg: 5 },
  { structure: 'cottage', x: 84, z: -262, yawDeg: -20 },
];
// The Ronda street walls (map revival lane 2, 2026-10-05): below each square the three roads leave the crossroads
// between terraces of town houses, their fronts on one building line 5.5 m from the carriageway's centre (every part
// clear of the road's edge), the eaves of each house 0.3 m from the next one's. Each slot was laid from the house its
// own draw builds and its mirror's, so the north terraces are this list mirrored. They stand after every earlier site:
// the 36 buildings above keep their places and their streams, and the posada keeps its yard before its door.
const SOUTH_STREETS = [
  // the main street below the square, west side, and south of the crossroads
  { structure: 'rowhouse', x: -13.06, z: -267.97, yawDeg: 90, terrace: true },
  { structure: 'rowhouse', x: -12.22, z: -239.34, yawDeg: 90, terrace: true },
  { structure: 'cottage', x: -10.47, z: -230.2, yawDeg: 90, terrace: true },
  // the main street south of the crossroads, east side
  { structure: 'cottage', x: 11.03, z: -267.52, yawDeg: -90, terrace: true },
  // the west ford road, south side
  { structure: 'cottage', x: -24.45, z: -263.93, yawDeg: -6.8, terrace: true },
  { structure: 'cottage', x: -32.42, z: -264.41, yawDeg: -6.8, terrace: true },
  { structure: 'cottage', x: -40.18, z: -265.8, yawDeg: -6.8, terrace: true },
  { structure: 'cottage', x: -47.31, z: -266.33, yawDeg: -6.8, terrace: true },
  { structure: 'cottage', x: -54.2, z: -267.55, yawDeg: -6.8, terrace: true },
  // the west ford road, north side
  { structure: 'cottage', x: -22.59, z: -241.73, yawDeg: 173.2, terrace: true },
  { structure: 'cottage', x: -29.53, z: -243.16, yawDeg: 173.2, terrace: true },
  { structure: 'rowhouse', x: -39.7, z: -242.15, yawDeg: 173.2, terrace: true },
  { structure: 'cottage', x: -49.86, z: -244.95, yawDeg: 173.2, terrace: true },
  { structure: 'cottage', x: -57.83, z: -246.04, yawDeg: 173.2, terrace: true },
  { structure: 'cottage', x: -65.28, z: -246.79, yawDeg: 173.2, terrace: true },
  // the east road, north side
  { structure: 'cottage', x: 16.32, z: -244.77, yawDeg: -160, terrace: true },
  { structure: 'cottage', x: 23.9, z: -247.09, yawDeg: -160, terrace: true },
  { structure: 'rowhouse', x: 33.19, z: -249.29, yawDeg: -160, terrace: true },
  { structure: 'cottage', x: 41.6, z: -253.39, yawDeg: -160, terrace: true },
  { structure: 'cottage', x: 48.26, z: -255.99, yawDeg: -160, terrace: true },
  { structure: 'rowhouse', x: 57.42, z: -258.65, yawDeg: -160, terrace: true },
];
// The square walls (map revival lane 2, round 2, 2026-10-05; gauntlet wave 108b: "squares and streets are open rutted
// dirt fields ... Ronda wants squares enclosed by facades"): town houses close each market square's sides either side of
// the casa consistorial and the church, fronting the square on its building lines, and the south side of the east road
// below the crossroads. Laid like the street walls (each slot from its own house and its mirror's, 0.3 m eaves, the
// carriageways, the squares, the strongpoints and every door yard 6 m deep kept clear); they stand after every earlier
// site, so the 78 buildings above keep their places and their streams.
const SQUARE_WALLS = [
  // the square's west wall, south of the casa consistorial
  { structure: 'rowhouse', x: -48.27, z: -185.63, yawDeg: 90, terrace: true },
  // the west wall, north of it
  { structure: 'rowhouse', x: -49.18, z: -133.48, yawDeg: 90, terrace: true },
  // the east wall, south of the church
  { structure: 'rowhouse', x: 47.69, z: -195.32, yawDeg: -90, terrace: true },
  { structure: 'cottage', x: 46.33, z: -185.68, yawDeg: -90, terrace: true },
  // the east wall, north of the church (short of the bridgehead tower)
  { structure: 'rowhouse', x: 47.7, z: -157.7, yawDeg: -90, terrace: true },
  { structure: 'rowhouse', x: 47.68, z: -146.38, yawDeg: -90, terrace: true },
  { structure: 'cottage', x: 46.04, z: -136.22, yawDeg: -90, terrace: true },
  // the south wall, west of the main street
  { structure: 'rowhouse', x: -25.89, z: -222.43, yawDeg: 0, terrace: true },
  // the east road, south side (the swell's flank climbs past these two)
  { structure: 'cottage', x: 22.34, z: -269.19, yawDeg: 20, terrace: true },
  { structure: 'cottage', x: 29.83, z: -271.95, yawDeg: 20, terrace: true },
];
// The ruined mills on the gorge floor beside the viaduct's piers (their mirrors stand on the north half of the floor).
const MILLS = [
  { structure: 'ruin', x: -46, z: -32, yawDeg: 0 },
  { structure: 'ruin', x: 46, z: -30, yawDeg: 180 },
];
// Farmsteads on the tableland: an olive farm on the west terraces and a mill farm by the east ford, each with its
// mirror.
const SOUTH_FARMS = [
  { structure: 'farmhouse', x: -262, z: -228, yawDeg: 15 },
  { structure: 'barn', x: -300, z: -205, yawDeg: 15 },
  { structure: 'granary', x: -240, z: -300, yawDeg: 15 },
  { structure: 'farmhouse', x: 365, z: -165, yawDeg: -60 },
  { structure: 'barn', x: 392, z: -205, yawDeg: -60 },
];

export default {
  id: 'cliffbridge', name: 'Aegis Crossing',
  blurb: 'A monumental stone viaduct spans a deep gorge between two bridgehead towns, with fords at both ends',
  terrain: {
    hillScale: .32, microScale: .42, rimH: 32, marshes: [], lakes: [], fieldTrenches: false,
    // The two bridgehead towns and the gorge between them (the gorge keeps its full depth: settlementScale 1). The
    // centre is the viaduct, so the spawn corridors converge on the crossing.
    village: { x0: -130, x1: 130, z0: -270, z1: 270, cx: 0, cz: 0, feather: 40, flatten: .9 },
    // map revival lane 2 (2026-10-05, gauntlet wave 108b: "the Puente Nuevo stands on level meadow ... the gorge shows
    // as two separate grey pits beside it"): the village rect spans the gorge as well as both towns, and the ground reads
    // every steep face under a village's worn soil as an earthwork (turf, rock only past ~60°), so the gorge walls were
    // turf inside the rect and rock only past its ends. The towns' wear stays on their streets and squares; the gorge's
    // walls are its rock the whole way under the bridge.
    villageWear: 'activity-patches',
    // ... and the worn ground the blanket wear gave goes back where it belongs: each town's ground from its swell to the
    // rim's lip (it ends ~9 m short of the edge), and the gorge's dry gravel bed short of its walls (the fields stay off
    // all three, as the village wear kept them)
    workedGround: [
      { feather: 16, strength: 0.75, boundary: [[-140, -282], [140, -282], [140, -106], [-140, -106]] },
      { feather: 16, strength: 0.75, boundary: [[-140, 106], [140, 106], [140, 282], [-140, 282]] },
      { feather: 10, strength: 0.6, boundary: [[-158, -46], [158, -46], [158, 46], [-158, 46]] },
    ],
    // The viaduct's abutments stand on solid rock 4 m back from each lip, so a hull leaving the road at an abutment
    // stands on the rim, not on the wall.
    bridges: [{ x: 0, z: 0, yawDeg: 90, spanM: 200, widthM: 18, approachM: 45, route: 0 }],
    // The two market squares: level paved aprons on the main road from each abutment into its town, where the
    // zone-control discs seat. (Round 2: 72 m across, so the paving meets the house fronts of the square walls.)
    hardstands: [
      { x: 0, z: -172, width: 72, length: 80, yawDeg: 0, grade: 0 },
      { x: 0, z: 172, width: 72, length: 80, yawDeg: 0, grade: 0 },
    ],
    // Authored paths stop inside the square; the endpoint completion adds each exit and grades it through the rim.
    roads: { paths: [
      // 0 — the main road: up from the south edge, through the south town's square, over the viaduct, through the north
      // square and out to the north edge. Straight along the bridge and its approaches.
      [[-34, -448], [-22, -400], [-8, -340], [0, -290], [0, -250], [0, -210], [0, -172], [0, -110], [0, 0], [0, 110],
        [0, 172], [0, 210], [0, 250], [0, 290], [-8, 340], [-22, 400], [-34, 448]],
      // 1 / 2 — the east ford road, south and north halves: from each town's crossroads round the bottomland to the
      // east ford.
      [[0, -250], [110, -290], [240, -290], [360, -230], [420, -120], [432, 0]],
      [[432, 0], [420, 120], [360, 230], [240, 290], [110, 290], [0, 250]],
      // 3 / 4 — the west ford road, south and north halves: from the same crossroads down the olive terraces to the
      // west ford.
      [[0, -250], [-100, -262], [-220, -276], [-340, -230], [-412, -120], [-428, 0]],
      [[-428, 0], [-412, 120], [-340, 230], [-220, 276], [-100, 262], [0, 250]],
    ] },
    landforms: [
      // The gorge: three troughs between the same sheer walls (38 m at the bridge, a cliff the bot planner's 25 m grid
      // reads as one), each a little longer than the last, so the floor climbs in river terraces to the tableland at
      // both ends (x = ±390).
      { kind: 'gorge', x: 0, z: 0, length: 540, width: 96, height: -16, corridorScale: 1, settlementScale: 1, wall: [0.88, 0.96], meander: 12 },
      { kind: 'gorge', x: 0, z: 0, length: 660, width: 96, height: -12, corridorScale: 1, settlementScale: 1, wall: [0.88, 0.96], meander: 12 },
      { kind: 'gorge', x: 0, z: 0, length: 780, width: 96, height: -10, corridorScale: 1, settlementScale: 1, wall: [0.76, 0.86], meander: 12 },
      // The limestone rib the viaduct's piers stand on: it crosses the gorge floor under the deck, too steep to drive,
      // so the floor's west and east reaches meet only over the bridge (no hull parks on the bed under the deck).
      { kind: 'ridge', x: 0, z: 0, length: 140, width: 14, height: 6.5, yawDeg: 90, corridorScale: 1, settlementScale: 1 },
      // The dry river bed's gravel levees, one each side of the stream channel, the length of the gorge and out through
      // both fords: the hull-down lines of the gorge floor. They are cut where the mill race left the stream (the
      // zone-control disc west of the viaduct) and at the mill pool east of it (the turbo-ball kickoff).
      ...[[-335, 210], [0, 160], [335, 210]].flatMap(([x, length]) => [
        { kind: 'ridge', x, z: -25, length, width: 22, height: 2.6, yawDeg: 0, corridorScale: 1, settlementScale: 1 },
        { kind: 'ridge', x, z: 25, length, width: 22, height: 2.6, yawDeg: 0, corridorScale: 1, settlementScale: 1 },
      ]),
      // The raised lips along both rims where the gorge is deep, open where the main road reaches the abutments
      // (mirror pairs). They stand 20 m back from the edge: when their flat tops ran to it, a bot heading for the
      // gorge-floor zone along one drove off (a 1068 HP fall in botModes' zone-control match).
      ...[-152, 152].flatMap((x) => [
        { kind: 'ridge', x, z: -114, length: 264, width: 18, height: 2.6, yawDeg: 0, settlementScale: 1 },
        { kind: 'ridge', x, z: 114, length: 264, width: 18, height: 2.6, yawDeg: 0, settlementScale: 1 },
      ]),
      // Terrace banks across the gorge's end ramps, where the floor climbs to the fords (mirror pairs, both ends).
      ...[-330, 330].flatMap((x) => [64, 96].flatMap((z) => [
        { kind: 'ridge', x, z: -z, length: 150, width: 20, height: 2.4, yawDeg: 0, settlementScale: 1 },
        { kind: 'ridge', x, z, length: 150, width: 20, height: 2.4, yawDeg: 0, settlementScale: 1 },
      ])),
      // Hedge banks round the bottomland meadows in the two fords, each side of the stream (mirror pairs).
      ...[-405, 405].flatMap((x) => [62, 106].flatMap((z) => [
        { kind: 'ridge', x, z: -z, length: 130, width: 22, height: 2.4, yawDeg: 0 },
        { kind: 'ridge', x, z, length: 130, width: 22, height: 2.4, yawDeg: 0 },
      ])),
      // The swells behind the towns, screening each assembly ground (mirror pair).
      { kind: 'ridge', x: -40, z: -322, length: 380, width: 74, height: 7, yawDeg: 4 },
      { kind: 'ridge', x: -40, z: 322, length: 380, width: 74, height: 7, yawDeg: -4 },
      // Olive terraces on the west tableland: low banks, hull-down lines (mirror pairs).
      { kind: 'ridge', x: -230, z: -170, length: 150, width: 24, height: 2.4, yawDeg: 12 },
      { kind: 'ridge', x: -230, z: 170, length: 150, width: 24, height: 2.4, yawDeg: -12 },
      { kind: 'ridge', x: -320, z: -300, length: 130, width: 24, height: 2.4, yawDeg: 24 },
      { kind: 'ridge', x: -320, z: 300, length: 130, width: 24, height: 2.4, yawDeg: -24 },
      // Knolls in the east bottomland (mirror pair).
      { kind: 'knoll', x: 262, z: -188, rx: 64, rz: 46, height: 6, yawDeg: 20 },
      { kind: 'knoll', x: 262, z: 188, rx: 64, rz: 46, height: 6, yawDeg: -20 },
    ],
  },
  spawns: {
    // Alpha assembles behind the south swell, west of the main road; bravo's seven pads are its mirror behind the north
    // swell. 800 m between the anchors; the swells and the towns screen each from the other.
    player: { x: -70, z: -400 },
    enemies: [
      { x: -160, z: 380 }, { x: -115, z: 405 }, { x: -70, z: 380 }, { x: -25, z: 405 },
      { x: 20, z: 380 }, { x: -115, z: 425 }, { x: -25, z: 425 },
    ],
  },
  // map revival lane 2, round 3 (gauntlet wave 108c: "velvet-green turf", "no olive grids on pale soil", "the walls
  // smooth planar grey"): the ground is the summer campiña's. The photo sets are the steppe's (withered grass, the
  // dirt, the rock), each graded from its linear mean: Rock058 renders at 0.08 / 0.09 / 0.11, so the gorge's walls drew
  // a dark blue-grey that read as water from above (and the setts, which take the rock's mean, dark grey); here it is
  // the Tajo's golden-grey calcarenite (~0.19 / 0.18 / 0.13: at ~0.29 the study pair drew chalk-white cliffs), bedded
  // (strata: beds, partings, joint blocks, varnish). The steppe's withered grass a shade down (it read as sand at its
  // own 0.34 / 0.25 / 0.12), its dirt (Ground071 under its tint, an orange 0.20 / 0.11 / 0.05) greyed toward the marl.
  splat: {...verdant.splat, sourcedPalette:'steppe', fieldPatch:.35,
    sourcedTint: { G: [0.85, 0.85, 0.8], D: [1.0, 1.15, 1.6], R: [1.9, 1.7, 1.35] }, strata: 0.16,
    // round 2 (gauntlet wave 108b: "grass reads as wet Atlantic pasture"): the sward's tints a summer's dry campiña
    tintA:[.98,1.0,.82],tintB:[.86,.88,.72],tintC:[1.03,1.03,.84],
    // round 3: the caminos a dusty tan (~0.15 / 0.10 / 0.05 over the greyed dirt) and the setts a worn limestone grey
    // (~0.14 over the rock's mean)
    roadTint:[0.78,0.74,0.68],
    // the campiña's tierra calma over the tableland's limestone and marl, a pale warm loam (~0.22 / 0.175 / 0.12 over
    // the greyed dirt, ~0.196 / 0.129 / 0.072), not Verdant's chernozem; its plough a shade lighter
    soilTint:[1.12,1.36,1.69], ploughLift:1.25,
    // the towns' streets and squares paved in setts (the empedrado of Ronda's old town), the country roads past the
    // village rect earth (terrain.ts townPaving). Round 3 (108c: "dark-grey square-grid tile"): setts a hand across
    // with hairline joints, so their mottle reads before their grid (the slab path's stone is the rock layer's mean,
    // now the calcarenite's)
    townPaving:true, pavement:{ slabM:0.16, jointM:0.006, stains:0.25, tyres:0 }},
  // map revival lane 2 (2026-10-05): the Serranía de Ronda's trees. The acacia slot grows as the olive (silver-grey), the
  // oak slot as the holm oak (the encina, dull dark grey-green), the poplars stay poplars, the cypress is the cypress;
  // the scrub grows as the olive's sprays (wild olive and lentisk)
  vegetation: {
    species: ['acacia', 'oak', 'poplar', 'cypress'],
    clusterMix: [['acacia', 0.42], ['oak', 0.38], ['poplar', 0.2]],
    loneMix: [['acacia', 0.44], ['oak', 0.3], ['poplar', 0.12], ['cypress', 0.14]],
    rimMix: [['oak', 0.58], ['acacia', 0.3], ['cypress', 0.12]],
    clusterCount: 60, loneCount: 110, rimCount: 95, grassDensity: 0.45, bushCount: 0.8, bushSpecies: 'acacia',
    // round 3 (108c: "lush green turf against the pale dry bank"): the sward's cards cured straw, the summer's
    grassTexTone: (_h: number, s: number, l: number): [number, number, number] => [0.12, Math.min(1, s * 0.7 + 0.05), Math.min(1, l * 1.04 + 0.06)],
    palettes: {
      acacia: { form: 'olive', cardHue: 0.3, cardSat: 0.06,
        texTone: (_h: number, s: number, l: number): [number, number, number] => [0.28, Math.min(1, s * 0.5), Math.min(1, l * 1.12)] },
      oak: { form: 'holmOak', cardHue: 0.25, cardSat: 0.09,
        texTone: (h: number, s: number, l: number): [number, number, number] => [h, Math.min(1, s * 0.68), l] },
      // round 2 (gauntlet wave 108b: "poplars still capped with flat brown leaf cards"): the river's white poplar (álamo
      // blanco), its leaves a silvery green on every card, no autumn brown in August
      poplar: { cardHue: 0.23, cardSat: 0.10,
        // (round 3: duller, a summer's dusty leaf; at s 0.6 / l 1.06 they stood lime against the dry ground)
        texTone: (_h: number, s: number, l: number): [number, number, number] => [0.23, Math.min(1, s * 0.45), Math.min(1, l * 0.92)] },
      // round 3 (the study pair: the hermitage's cypresses lime green): the Mediterranean cypress near-black green
      cypress: { cardHue: 0.36, cardSat: 0.30, cardL0: 0.22, canopy: { hue: 0.36, sat: 0.28, l0: 0.17, l1: 0.30 },
        texTone: (_h: number, s: number, l: number): [number, number, number] => [0.34, Math.min(1, s * 0.75), Math.min(1, l * 0.55)] },
    },
    // planted lines (real cover: belts go through the tree admission), each with its mirror across the gorge: the olive
    // groves' rows on the west terraces (between the rim bank and the upper terrace, and below the lower one), the
    // cypresses round the hermitage and on the cortijos' drives
    belts: [-1, 1].flatMap((side) => [
      ...[-9, 0, 9].map((o) => ({ x0: -258 - o * 0.21, z0: side * (-152 + o * 0.98), x1: -182 - o * 0.21, z1: side * (-136 + o * 0.98),
        gap: 9.5, jitter: 1.2, skip: 0.08, species: 'acacia' as const })),
      ...[-9, 0, 9].map((o) => ({ x0: -205 - o * 0.41, z0: side * (-322 + o * 0.91), x1: -150 - o * 0.41, z1: side * (-300 + o * 0.91),
        gap: 9.5, jitter: 1.2, skip: 0.08, species: 'acacia' as const })),
      { x0: -177, z0: side * -262, x1: -177, z1: side * -230, gap: 5.5, jitter: 0.5, skip: 0.05, species: 'cypress' as const },
      { x0: -250, z0: side * -246, x1: -236, z1: side * -266, gap: 6, jitter: 0.5, skip: 0.05, species: 'cypress' as const },
      { x0: 342, z0: side * -140, x1: 352, z1: side * -128, gap: 6, jitter: 0.5, skip: 0.05, species: 'cypress' as const },
    ]),
  },
  props: {
    // map revival lane 2 (2026-10-05): the Andalusian kit (maps/regional/andalusian.ts)
    architecture: 'andalusian',
    // Every building is an authored site (the towns are mirror images), so the roadside builder places none.
    plan: [],
    plannedSites: [...SOUTH_TOWN, ...SOUTH_TOWN.map(mirrorSite), ...MILLS, ...SOUTH_FARMS,
      ...[...MILLS, ...SOUTH_FARMS].map(mirrorSite), ...SOUTH_STREETS, ...SOUTH_STREETS.map(mirrorSite),
      ...SQUARE_WALLS, ...SQUARE_WALLS.map(mirrorSite)],
    destructibleBuildings: ['guardpost', 'fieldhut', 'leanto', 'huntingblind', 'commandtent'],
    blockFill: false, extraKits: [], buildingLat: [20, 5], spacingPad: 12, sideSkip: .12, maxSpread: 3.2,
    // Three strongpoint pairs, each the other's mirror across the gorge: the tollhouses at the bridgeheads, the rim
    // observation posts above the west ford, the command folds in the east bottomland.
    tacticalBeats: [
      { id: 'south-tollhouse', role: 'brawl', x: -36, z: -120, yawDeg: 90, structure: 'guardpost', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
      { id: 'north-tollhouse', role: 'brawl', x: -36, z: 120, yawDeg: 90, structure: 'guardpost', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
      { id: 'south-ford-post', role: 'scout', x: -350, z: -150, yawDeg: 0, structure: 'huntingblind',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'north-ford-post', role: 'scout', x: -350, z: 150, yawDeg: 180, structure: 'huntingblind',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'south-command-fold', role: 'support', x: 286, z: -246, yawDeg: 0, structure: 'commandtent',
        redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
      { id: 'north-command-fold', role: 'support', x: 286, z: 246, yawDeg: 180, structure: 'commandtent',
        redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
    ],
    // Dry-stone field walls on the olive terraces and round the bottomland meadows, each with its mirror.
    wallRuns: [
      [-280, -150, -190, -170, 2], [-280, 150, -190, 170, 2], [-360, -280, -290, -310, 1], [-360, 280, -290, 310, 1],
      [180, -150, 250, -140, 3], [180, 150, 250, 140, 3], [330, -320, 400, -300, 2], [330, 320, 400, 300, 2],
    ],
    // no overhead line along the main road: it runs over the viaduct and through the two old squares
    well: false, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 14, rocks: 180, outcrops: 38, craters: 8, rubblePiles: 0, hedgehogs: 4, sandbagLines: 6, cropFields: 8,
    // the map-vehicles lane (2026-10-06, the period ruling): Andalusia in the 1970s: the Spanish Army's AMX-30E, M48
    // and M47
    tankWrecks: { era: 'cold-war', count: 5, debris: true, ids: ['amx30_x', 'm48', 'm47_patton'] },
    wallStyle: 'fieldstone',
    // round 3 (108c: "a white picket fence reads as American", "three blank coloured boards on posts like placeholder
    // swatches"): the yards fenced in cane (cañizo), the roads in post and rail where they are fenced at all, and no
    // washing lines (their flat sheets read as swatches)
    inhabit: { ...verdant.props.inhabit, stalls: 2, benches: 2, coreClutter: 6, laundry: 0,
      yardFence: 'fencewattle', roadFence: 'fencerail' },
  },
  // map revival lane 2 (2026-10-05): the tableland's harvest — straw stacks on the grain fields, each with its mirror
  scenery: {
    landmarks: [-1, 1].flatMap((side) => [
      { kind: 'strawstack' as const, x: 168, z: side * -332, yawDeg: 20, name: 'the straw stack on the east tableland' },
      { kind: 'strawstack' as const, x: 214, z: side * -350, yawDeg: 64, name: 'the second stack on the east tableland' },
      { kind: 'strawstack' as const, x: -200, z: side * -350, yawDeg: -15, name: 'the straw stack below the swell' },
    ]),
  },
  // the mountains lane (2026-10-03, gauntlet wave 15): wooded uplands round the gorge (not Verdant's plain)
  horizon:{...verdant.horizon,amp:1.1,baseHex:0x456a38,rockHex:0x777c70,treeline:.95,haze:.7,panorama:{regional:'upland'}},
  sky:{...verdant.sky,sunElevationDeg:34,sunAzimuthDeg:235,cloudOpacity:.56,cloudOpacity2:.2,cloudAltM:1250,
    fogDensity:.00028,fogTintHex:0xb3c4b6,sunColorHex:0xfff0d9,sunIntensity:3.5,postExposure:.98},
  clouds:{regime:'fair-weather-cumulus',baseM:1200,coverage:.28,contrails: 0.3, cirrus: 0.25},
  minimap:{...verdant.minimap},
  shot:{pos:[-170,45,-170],look:[20,-4,30]},
} satisfies MapCompositionConfig;
