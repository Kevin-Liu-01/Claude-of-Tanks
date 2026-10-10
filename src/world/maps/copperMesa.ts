// A horseshoe quarry with a low ore-cut and two unequal rim routes. No new
// geometry family or runtime update loop.
//
// Reference (the map-revival lane, 2026-10-05): Queenstown under Mount Lyell on the west coast of Tasmania, the Mount
// Lyell Mining and Railway Company's town (1893-1994): the Iron Blow and West Lyell open cuts in the hills above it,
// their benches and haul roads, and round them the bare hills the smelters' fumes, the cutting for their furnaces and
// the rain stripped to pink, ochre and grey conglomerate. The works and the town stand where the plan seats them in the
// queenstown kit (maps/regional/queenstown.ts): the headframes over the North Lyell shafts with their winding houses
// and ore bins, the concentrator stepping down its slope, the smelters' brick power house and its stack, the railway's
// engine shed, the water tank on its trestle, the Empire Hotel behind its two-storey verandah of cast-iron lace, and
// rows of weatherboard cottages under corrugated iron with their bullnose verandahs and picket fences.
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
import { roundRoadBends } from './roadBends.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// (Copper Mesa round 3, the map-revival lane; gauntlet wave 132: "the 'town' is a dozen isolated sheds, a power house and a
// headframe strung along dirt roads across a vast pale plain, with no street grid, no rows of cottages and no density";
// the roadside plan stood its cottage rows along the roads with their verandahs to the traffic) Queenstown's grid: rows
// of weatherboard cottages (the kit's cottageRow on a container-row plot) along the main street and two back streets,
// Sticht Street crossing them, the Empire Hotel on the main street, the north town along road 4, the works at the ends.
// Every lot is authored (props.plannedSites), its verandah to its street; the zone-control discs, the apron under zone 1
// and the tactical beats stay open (.qa-dev/town-plan.mjs: every footprint 34 m or more off a zone's centre, 5 m or more
// off a road's centre line, on ground level to 1.7 m).
const QUEENSTOWN_TOWN = [
  // the main street (road 0): the west side facing east, the east side facing west, the Empire Hotel on the east
  { structure: 'containerRow', x: 138.3, z: -86, yawDeg: 90 }, { structure: 'containerRow', x: 138.3, z: -106, yawDeg: 90 },
  { structure: 'containerRow', x: 137.5, z: -140, yawDeg: 90 }, { structure: 'containerRow', x: 142, z: -160, yawDeg: 90 },
  { structure: 'containerRow', x: 160.7, z: -88, yawDeg: -90 }, { structure: 'foundryoffice', x: 163.9, z: -106, yawDeg: -90 },
  { structure: 'containerRow', x: 162.5, z: -140, yawDeg: -90 },
  // the west back street (x 108): a row facing it on each side
  { structure: 'containerRow', x: 118.7, z: -92, yawDeg: -90 }, { structure: 'containerRow', x: 118.7, z: -112, yawDeg: -90 },
  { structure: 'containerRow', x: 118.7, z: -140, yawDeg: -90 }, { structure: 'containerRow', x: 118.7, z: -160, yawDeg: -90 },
  { structure: 'containerRow', x: 97.3, z: -92, yawDeg: 90 }, { structure: 'containerRow', x: 97.3, z: -112, yawDeg: 90 },
  { structure: 'containerRow', x: 97.3, z: -140, yawDeg: 90 }, { structure: 'containerRow', x: 97.3, z: -160, yawDeg: 90 },
  // the east back street (x 191)
  { structure: 'containerRow', x: 180.3, z: -88, yawDeg: 90 }, { structure: 'containerRow', x: 180.3, z: -108, yawDeg: 90 },
  { structure: 'containerRow', x: 180.3, z: -140, yawDeg: 90 }, { structure: 'containerRow', x: 201.6, z: -88, yawDeg: -90 },
  { structure: 'containerRow', x: 201.6, z: -108, yawDeg: -90 },
  // the north town along road 4 (z 90): the south side facing north; the north side set back where its ground is level
  { structure: 'containerRow', x: 60, z: 79.3, yawDeg: 0 }, { structure: 'containerRow', x: 140, z: 79.3, yawDeg: 0 },
  { structure: 'containerRow', x: 160, z: 79.3, yawDeg: 0 }, { structure: 'containerRow', x: 180, z: 79.3, yawDeg: 0 },
  { structure: 'containerRow', x: 80, z: 112, yawDeg: 180 }, { structure: 'containerRow', x: 100, z: 112, yawDeg: 180 },
  { structure: 'containerRow', x: 120, z: 112, yawDeg: 180 }, { structure: 'containerRow', x: 140, z: 112, yawDeg: 180 },
  { structure: 'containerRow', x: 160, z: 112, yawDeg: 180 }, { structure: 'foundryoffice', x: 100, z: 76, yawDeg: 0 },
  { structure: 'ruin', x: 120, z: 79.3, yawDeg: 0 }, { structure: 'ruin', x: 80, z: 79.3, yawDeg: 0 },
  // the works: a headframe closing the main street's south end and one over the north town, the power house and its
  // stack, the engine shed, the water tank, the concentrator
  { structure: 'gantry', x: 150, z: -190, yawDeg: 0 }, { structure: 'warehouse', x: 212, z: -150, yawDeg: 90 },
  { structure: 'depot', x: 118, z: -186, yawDeg: 90 }, { structure: 'watertower', x: 172, z: -158, yawDeg: 0 },
  { structure: 'gantry', x: 196, z: 124, yawDeg: 0 }, { structure: 'factory', x: 242, z: 138, yawDeg: 0 },
] as const;
// the streets the lots face, gravel in the ground's wear channel (workedGroundMask.ts): the two back streets and Sticht
// Street across the main street
const QUEENSTOWN_STREETS = [
  { boundary: [[103.5, -86], [112.5, -86], [112.5, -176], [103.5, -176]] as [number, number][], feather: 4, strength: 0.9 },
  { boundary: [[186.5, -78], [195.5, -78], [195.5, -152], [186.5, -152]] as [number, number][], feather: 4, strength: 0.9 },
  { boundary: [[88, -130.5], [210, -130.5], [210, -121.5], [88, -121.5]] as [number, number][], feather: 4, strength: 0.9 },
];
export default {
  id: 'copper_mesa', name: 'Copper Mesa Mine',
  blurb: 'Ore terraces and haul-road switchbacks encircle an abandoned open-pit mine',
  terrain: {
    hillScale: 0.72, microScale: 0.8, rimH: 38, quarryBenches: true,
    village: { x0: 64, x1: 256, z0: -190, z1: 128, cx: 160, cz: -24, feather: 40, flatten: 0.78, relief: 0.18 },
    // (2026-10-06, the batch-4 integration: round 2's gullied hills set nine cells of zone 1's 30 m disc past the seat's
    // 0.94 slope, so the match placement moved it 24 m off its hint, and zone 3 8 m off its own to keep clear of it; an
    // apron under zone 1 levels its disc, sited by tools/hardstand-site.mjs under the apron bank law)
    hardstands: [{ x: 95.76, z: 25.16, width: 56, length: 56, yawDeg: 0, level: 1.2, grade: 0, bankM: 20 }],
    workedGround: QUEENSTOWN_STREETS,
    roads: { paths: roundRoadBends([
      // A stepped loading apron on the eastern shelf puts the gantries and
      // stores beside the haul road; the pit floor remains a separate lane.
      [[84, -464], [236, -298], [148, -146], [148, -68], [194, -68], [218, -44], [218, 90], [206, 272], [106, 462]],
      [[-326, -462], [-354, -288], [-338, -86], [-258, 90], [-170, 284], [-72, 462]],
      // 2026-10-02 (maps lane B): the pit lane skirts the mud pan's west side and climbs the north benches in a long
      // curve, under the brief's road grade at every terrain seed (it went straight up them at up to 19 %).
      [[-88, -454], [-206, -286], [-192, -136], [-78, -86], [-110, -10], [-114, 44], [-84, 94], [-62, 140], [-44, 190],
        [4, 458]],
      [[354, -444], [376, -230], [364, -26], [338, 170], [328, 354], [290, 470]],
      [[-258, 90], [-104, 168], [28, 90], [136, 90], [218, 90], [338, 170]],
    ]) },
    marshes: [{ x: -66, z: 32, r: 38, dip: 0.8 }],
    // (Copper Mesa round 2, the map-revival lane; gauntlet wave 117: "flat-topped, Monument-Valley-style mesas and soft
    // desert dunes" where Queenstown sits among steep, gullied, bare conglomerate hills): the ridges and knolls keep their
    // footprints and crests and take the rain's erosion — dense rill networks down every flank, each hill its own rill
    // spacing, depth and width (the critics punish a regular comb), talus fans at the knolls' feet, knobbly roughness;
    // the waste-rock dumps flat-topped. The rills fade out before the crests (landformGeology.ts gullyFlank).
    landforms: [
      { kind: 'basin', x: -78, z: 20, rx: 178, rz: 214, height: -11.0, corridorScale: 0.7 },
      // (round 3, wave 132: "no gullies"; "add gully relief") the west ridge's rills deeper — their steep sides the ochre
      // scree between pale spurs (was 3.6 m; narrower or more of them cut the western-rim-survey beat's level seat and
      // creased the quarry's rim past the live 1 m height cache's 0.08 m); the knolls' a step deeper and narrower. The
      // ridge through the town (x 130) keeps its own: the zones and the lots stand on it
      { kind: 'ridge', x: -322, z: 58, length: 430, width: 78, height: 11.2, yawDeg: 18,
        geology: { outline: 0.22, gullies: { count: 5.6, depthM: 4.4, width: 0.42 }, rough: 1.0 } },
      { kind: 'ridge', x: 130, z: 56, length: 400, width: 74, height: 8.4, yawDeg: -8,
        geology: { outline: 0.18, gullies: { count: 4.3, depthM: 2.7, width: 0.5 }, rough: 0.8 } },
      // 2026-10-03 (maps lane B): the service shelf north of the pit is gone. It was an 8.6 m ridge running north-south
      // on x -58 from z 120 to z 400, a spine down the middle of the north approach (a ridge's length runs along x at
      // yaw 0 and along z at yaw 90). It lifted the north team's central assembly ground 4-6 m onto a forward slope in
      // full view of the south rim, with nothing like it on the south side. Over 40 all-bot seeds the south won 29-11
      // whichever team stood there (the bots lane's swap test), with 15 of 16 first kills. Without it: 19-21 in each
      // of two 40-seed blocks; first spot, first damage and first kill 8-8, 8-8 and 9-7 over 16.
      { kind: 'knoll', x: -186, z: -250, rx: 104, rz: 58, height: 5.8,
        geology: { outline: 0.2, gullies: { count: 17, depthM: 3.0, width: 0.36 }, fans: { reach: 0.22 }, rough: 0.7 } },
      { kind: 'knoll', x: 310, z: -250, rx: 72, rz: 78, height: 6.8,
        geology: { outline: 0.26, gullies: { count: 21, depthM: 3.6, width: 0.32 }, fans: { reach: 0.26 }, rough: 0.9 } },
      // 2026-10-02 (maps lane B): the waste-rock dumps the haulage tipped beside the pit's south and north approaches,
      // flat-topped spoil heaps that screen each assembly ground from the other.
      { kind: 'knoll', x: -72, z: -296, rx: 76, rz: 34, height: 8.5, yawDeg: 8, corridorScale: 1,
        geology: { profile: 'butte' as const, wall: [0.5, 0.82] as const, apron: 0.18, outline: 0.12, rough: 0.5 } },
      { kind: 'knoll', x: -12, z: 300, rx: 72, rz: 34, height: 8.5, yawDeg: -6, corridorScale: 1,
        geology: { profile: 'butte' as const, wall: [0.5, 0.82] as const, apron: 0.18, outline: 0.12, rough: 0.5 } },
    ],
  },
  spawns: { player: { x: -104, z: -394 }, enemies: [
    { x: -236, z: 386 }, { x: -154, z: 422 }, { x: -74, z: 380 }, { x: 8, z: 424 },
    { x: 90, z: 380 }, { x: 170, z: 418 }, { x: 250, z: 384 },
  ] },
  // (the map-revival lane, 2026-10-05) Queenstown's bare hills: pink and mauve-grey conglomerate gravel with ochre
  // seams, its own sourced row (sourcedTextures.ts copper_mesa); was Wadi Rum's sand ('badlands') in the desert's tones
  splat: { sourcedPalette: 'copper_mesa',
    grassTone: (h: number, s: number, l: number) => [0.02, s * 0.35, 0.22 + l * 0.6],
    dirtTone: (h: number, s: number, l: number) => [0.09, s * 0.45, 0.18 + l * 0.58],
    // (Copper Mesa round 2: the conglomerate is not a bedded sandstone and no wind shapes it — no sandstone tile, no dune
    // macro; was sandstone, sandMacro 0.7)
    sandstone: false, strata: 0.12, sandMacro: 0, midRelief: 0.8,
    // (round 3, wave 132: the mud pan "a flat matte stain rather than reflective water or wet tailings") the pit's pan is
    // the mine's tailings: wet, glossy silt stained rust by the acid water (the Queen River's orange) — was matte
    mudTone: (h: number, s: number, l: number) => [0.055, clamp01(s * 0.5 + 0.25), clamp01(l * 0.5 + 0.08)], marshGloss: 0.8,
    // (round 3, wave 132: "no pink, ochre or grey conglomerate") the gravel's patches: salmon-pink fields at ~80 m, the
    // grey-mauve weathered stretches at ~230 m, ochre washes at ~600 m (was a pale pink, a dark mauve and a buff)
    tintA: [1.08, 0.86, 0.80], tintB: [0.80, 0.76, 0.80], tintC: [1.10, 0.90, 0.62], roadTint: [0.62, 0.56, 0.54],
  },
  vegetation: {
    // the button grass of the west coast's cleared ground, gold-olive tussocks (was the desert's tones)
    grassTexTone: (h: number, s: number, l: number) => [0.12, clamp01(s * 0.55), clamp01(l * 0.92 + 0.04)],
    // (round 3, wave 132: "sticker-like yellow tufts", "saturated yellow grass decals") the button grass dull olive-tan
    // and darker (was hue 0.11 at saturation 0.4)
    tuftTone: (h: number, s: number, l: number) => [0.13, 0.22, clamp01(l * 0.6 + 0.06)],
    species: ['acacia', 'cedar', 'pine'], clusterMix: [['acacia', 0.58], ['cedar', 0.32], ['pine', 0.1]],
    loneMix: [['acacia', 0.65], ['cedar', 0.25], ['pine', 0.1]], rimMix: [['cedar', 0.5], ['acacia', 0.4], ['pine', 0.1]],
    // (Copper Mesa round 2: the button grass keeps to the hollows — a thinner sward on the bare hills; was 0.36)
    // (round 3, wave 132: "a solid green tree line fills the mid-ground exactly where bare stripped hills should open up")
    // the stripped hills bare: half the stands and fewer rim trees, the regrowth a low scrub, the tufts thinner (was 22
    // stands, 40 rim trees, tufts at 0.18)
    clusterCount: 11, loneCount: 26, rimCount: 22, grassDensity: 0.1, bushCount: 0.9, bushSpecies: 'acacia', clusterScrub: 1.6,
  },
  props: {
    // the map-revival lane (2026-10-05): the Queenstown kit (maps/regional/queenstown.ts)
    architecture: 'queenstown',
    sourcedPalette: 'foundry',
    // (round 2, the gauntlet's wave 117: more of the town — the second warehouse and depot seats are cottage rows)
    // (round 3: the town authored lot by lot, QUEENSTOWN_TOWN above; no roadside plan)
    plan: [],
    plannedSites: QUEENSTOWN_TOWN,
    // the light buildings stand where the town leaves room — the works' iron sheds, the guard hut by the west road — not
    // where the roadside pass would now drop them, by the zone-control discs (one stood 25 m off zone 2's centre)
    townLightPlan: [
      { kind: 'quonsethut', x: 226, z: -176, rot: 0 }, { kind: 'motorpool', x: 238.6, z: 27.2, rot: 0 },
      { kind: 'guardpost', x: 58, z: 58, rot: 0 }, { kind: 'servicegarage', x: 228, z: -118, rot: 0 },
    ],
    destructibleBuildings: ['quonsethut', 'motorpool', 'guardpost', 'servicegarage'],
    // (round 3: a cottage lot 4 m from its neighbour's reach, was 8 — rows stand back to back across their yards)
    buildingLat: [14, 3], destructibleBuildingLat: [18, 4], sideSkip: 0.18, spacingPad: 4,
    tacticalBeats: [
      { id: 'ore-loading-shelf', role: 'brawl', x: 188, z: 34, yawDeg: 90, structure: 'motorpool', redoubt: true, outcrop: { count: 6, radius: 11 }, wreck: true },
      { id: 'western-rim-survey', role: 'scout', x: -300, z: 120, yawDeg: 70, structure: 'guardpost', outcrop: { count: 5, radius: 9 } },
      { id: 'southern-haul-workshop', role: 'support', x: -76, z: -228, yawDeg: -90, structure: 'servicegarage', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
    ],
    // the kit owns the renders' tones; the field walls keep the city preset's stone
    tones: { stone: makeRealisticCityBuildingTones({ value: 0.95, saturation: 0.92, soot: 0.03, roofValue: 0.88 }).stone },
    wallStyle: 'fieldstone', wallStoneChance: 0.8,
    wallRuns: [[110, -162, 110, -106, 2], [172, -116, 232, -116, 2], [246, -40, 246, 22, 3], [166, 118, 230, 118, 2], [-126, -244, -58, -244, 3], [-326, 96, -326, 168, 2]],
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: false,
    rocks: 180, outcrops: 24, craters: 52, rubblePiles: 26, sandbagLines: 16, hedgehogs: 12,
    // the map-vehicles lane (2026-10-06, the period ruling): Australia in the 1970s: the Centurion and the Leopard
    // AS1
    tankWrecks: { era: 'cold-war', count: 5, debris: true, ids: ['centurion5', 'leo1a5'] },
    inhabit: { stalls: 0, benches: 2, coreClutter: 22, drums: 12, trucks: 7, jeeps: 3, drumClusters: 6, camps: 2, modernClutter: 6, looseClutter: 20, roadFence: 'fencerail', yardFence: 'fencerail' },
  },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): banding 0.26 — the ore benches inside the square
  // are the most strongly bedded cliffs in the game; the ring behind them ran on the style default 0.16
  // (the map-revival lane, 2026-10-05) the West Coast Range beyond Queenstown's bare hills: pink-grey conglomerate and
  // quartzite faces (base and rock), less strongly bedded than Arizona's benches (banding 0.26 -> 0.14), the
  // rainforest dark and wet on the far slopes (treeline 0.1 -> 0.4, forest 0x5c6141 -> 0x33442e)
  // (Copper Mesa round 2, wave 117: the 'mesa' ring read as Monument Valley): the West Coast Range — craggy quartzite
  // peaks (Owen, Lyell, Sedgwick), dark rainforest low on them, bare grey crags above, no snow; the far country its long
  // steep ridges
  horizon: { baseHex: 0x6a625c, amp: 1.35, style: 'alpine', treeline: 0.38, snowline: 2, bareRock: 0.7, outcrops: 0.5,
    panorama: { regional: 'ridges' }, forestHex: 0x22392b, rockHex: 0x8c8884, haze: 0.88, grain: 0.6 },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the haze a step cooler than the 0xffe0b6 sun
  // (0xaa9b89 -> 0xa8a49c), broken altocumulus (0.68 / 0.35 -> 0.80 / 0.50) on an explicit 880 m deck that keeps its
  // texture at 2-12°, and patchy light across the benches (cloudShadowAmp 0.30)
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  // (the map-revival lane, 2026-10-05) Queenstown's west coast overcast: the regime's broken stratocumulus deck (was
  // cumulus humilis at 0.20 over Arizona)
  clouds: { regime: 'broken-stratocumulus' },
  // (the map-revival lane, 2026-10-05) the west coast's wet air under its overcast: a hazier, cooler, softer light
  // (turbidity 5.6 -> 7.0, fog 0.00025 -> 0.00045 in a cool grey, the sun 4.1 -> 3.2 and paler, the sky's fill 0.36 ->
  // 0.48, the pink-grey ground's bounce); the arid preset's clear-air note below is Arizona's
  sky: { sunElevationDeg: 31, sunAzimuthDeg: 98, turbidity: 7.0, rayleigh: 1.1, mieCoefficient: 0.007, mieDirectionalG: 0.84, /* 2026-10-03 (the skies lane, agreed with the mountains lane: one haze law from the camera to the far country, the map's fogDensity its one lever): arid air is clear — 0.00025 on the four arid maps (a meteorological range near 37 km; a ridge 300 m up at 7.5 km keeps about 60 % of its contrast) (was 0.00050) */ fogDensity: 0.00045, fogTintHex: 0x9ca2a6, fogMix: 0.48, envIntensity: 0.2, cloudOpacity: 0.80, cloudOpacity2: 0.50, cloudTintHex: 0xf2e6d6, cloudAltM: 880, cloudHazeK: 0.00012, cloudUvM: 2700, cloudShadowAmp: 0.30, sunIntensity: 3.2, sunColorHex: 0xf2ece0, hemiIntensity: 0.48, lighting: { groundAlbedoHex: 0x9e877a } },
  minimap: { base: [124, 98, 73], hard: [133, 110, 86], soft: [83, 71, 59], forest: 'rgba(75,83,49,.8)', forestStroke: 'rgba(46,52,31,.92)', water: 'rgba(75,92,90,.8)', waterStroke: 'rgba(45,58,59,.92)', roadCasing: 'rgba(51,40,32,.94)', roadFill: 'rgba(179,156,126,.96)', buildingFill: '#c4b6a3' },
  shot: { pos: [-284, 68, -282], look: [-30, -4, 90] },
} satisfies import('./contracts.ts').MapCompositionConfig;
