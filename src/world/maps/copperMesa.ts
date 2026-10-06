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
export default {
  id: 'copper_mesa', name: 'Copper Mesa Mine',
  blurb: 'Ore terraces and haul-road switchbacks encircle an abandoned open-pit mine',
  terrain: {
    hillScale: 0.72, microScale: 0.8, rimH: 38, quarryBenches: true,
    village: { x0: 64, x1: 256, z0: -190, z1: 128, cx: 160, cz: -24, feather: 40, flatten: 0.78, relief: 0.18 },
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
      { kind: 'ridge', x: -322, z: 58, length: 430, width: 78, height: 11.2, yawDeg: 18,
        geology: { outline: 0.22, gullies: { count: 5.6, depthM: 3.6, width: 0.42 }, rough: 1.0 } },
      { kind: 'ridge', x: 130, z: 56, length: 400, width: 74, height: 8.4, yawDeg: -8,
        geology: { outline: 0.18, gullies: { count: 4.3, depthM: 2.7, width: 0.5 }, rough: 0.8 } },
      // 2026-10-03 (maps lane B): the service shelf north of the pit is gone. It was an 8.6 m ridge running north-south
      // on x -58 from z 120 to z 400, a spine down the middle of the north approach (a ridge's length runs along x at
      // yaw 0 and along z at yaw 90). It lifted the north team's central assembly ground 4-6 m onto a forward slope in
      // full view of the south rim, with nothing like it on the south side. Over 40 all-bot seeds the south won 29-11
      // whichever team stood there (the bots lane's swap test), with 15 of 16 first kills. Without it: 19-21 in each
      // of two 40-seed blocks; first spot, first damage and first kill 8-8, 8-8 and 9-7 over 16.
      { kind: 'knoll', x: -186, z: -250, rx: 104, rz: 58, height: 5.8,
        geology: { outline: 0.2, gullies: { count: 17, depthM: 2.2, width: 0.4 }, fans: { reach: 0.22 }, rough: 0.7 } },
      { kind: 'knoll', x: 310, z: -250, rx: 72, rz: 78, height: 6.8,
        geology: { outline: 0.26, gullies: { count: 21, depthM: 2.9, width: 0.34 }, fans: { reach: 0.26 }, rough: 0.9 } },
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
    tintA: [1.0, 0.86, 0.82], tintB: [0.66, 0.58, 0.60], tintC: [1.04, 0.9, 0.7], roadTint: [0.62, 0.56, 0.54],
  },
  vegetation: {
    // the button grass of the west coast's cleared ground, gold-olive tussocks (was the desert's tones)
    grassTexTone: (h: number, s: number, l: number) => [0.12, clamp01(s * 0.55), clamp01(l * 0.92 + 0.04)],
    tuftTone: (h: number, s: number, l: number) => [0.11, 0.4, clamp01(l * 0.72 + 0.1)],
    species: ['acacia', 'cedar', 'pine'], clusterMix: [['acacia', 0.58], ['cedar', 0.32], ['pine', 0.1]],
    loneMix: [['acacia', 0.65], ['cedar', 0.25], ['pine', 0.1]], rimMix: [['cedar', 0.5], ['acacia', 0.4], ['pine', 0.1]],
    // (Copper Mesa round 2: the button grass keeps to the hollows — a thinner sward on the bare hills; was 0.36)
    clusterCount: 22, loneCount: 32, rimCount: 40, grassDensity: 0.18, bushCount: 0.6, bushSpecies: 'acacia', clusterScrub: 1.6,
  },
  props: {
    // the map-revival lane (2026-10-05): the Queenstown kit (maps/regional/queenstown.ts)
    architecture: 'queenstown',
    sourcedPalette: 'foundry',
    plan: ['gantry', 'warehouse', 'foundryoffice', 'depot', 'watertower', 'containerRow', 'factory', 'ruin', 'warehouse', 'depot', 'gantry', 'containerRow', 'foundryoffice', 'ruin', 'depot', 'warehouse'],
    destructibleBuildings: ['quonsethut', 'motorpool', 'guardpost', 'servicegarage'],
    buildingLat: [14, 3], destructibleBuildingLat: [18, 4], sideSkip: 0.18, spacingPad: 8,
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
    tankWrecks: { era: 'modern', count: 5, debris: true,
      ids: ['m551_sheridan', 'm60a2', 'm1a1', 'bmp3', 'm60a3'] },
    inhabit: { stalls: 0, benches: 2, coreClutter: 22, drums: 12, trucks: 7, jeeps: 3, drumClusters: 6, camps: 2, modernClutter: 22, looseClutter: 20, roadFence: 'fencerail', yardFence: 'fencerail' },
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
  sky: { sunElevationDeg: 31, sunAzimuthDeg: 98, turbidity: 7.0, rayleigh: 1.1, mieCoefficient: 0.007, mieDirectionalG: 0.84, /* 2026-10-03 (the skies lane, agreed with the mountains lane: one haze law from the camera to the far country, the map's fogDensity its one lever): arid air is clear — 0.00025 on the four arid maps (a meteorological range near 37 km; a ridge 300 m up at 7.5 km keeps about 60 % of its contrast) (was 0.00050) */ fogDensity: 0.00045, fogTintHex: 0x9ca2a6, fogMix: 0.48, envIntensity: 0.2, cloudOpacity: 0.80, cloudOpacity2: 0.50, cloudTintHex: 0xf2e6d6, cloudAltM: 880, cloudHazeK: 0.00012, cloudUvM: 2700, cloudShadowAmp: 0.30, sunIntensity: 3.2, sunColorHex: 0xf2ece0, hemiIntensity: 0.48, lighting: { groundAlbedoHex: 0x9a8682 } },
  minimap: { base: [124, 98, 73], hard: [133, 110, 86], soft: [83, 71, 59], forest: 'rgba(75,83,49,.8)', forestStroke: 'rgba(46,52,31,.92)', water: 'rgba(75,92,90,.8)', waterStroke: 'rgba(45,58,59,.92)', roadCasing: 'rgba(51,40,32,.94)', roadFill: 'rgba(179,156,126,.96)', buildingFill: '#c4b6a3' },
  shot: { pos: [-284, 68, -282], look: [-30, -4, 90] },
} satisfies import('./contracts.ts').MapCompositionConfig;
