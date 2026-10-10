// Wind-scoured polar logistics station, not an alpine-village reskin:
// staggered snow berms screen a wide service grid and a frozen melt pan.
import winter from './winter.ts';
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
import { roundRoadBends } from './roadBends.ts';
export default {
  id: 'whiteout', name: 'Whiteout Station',
  blurb: 'A remote polar station, frozen melt pans and snow-berm service corridors beneath a pale sky',
  terrain: {
    hillScale: 0.78, microScale: 0.54, rimH: 24, frozenMarshes: true,
    village: { x0: -160, x1: 76, z0: -150, z1: 146, cx: -52, cz: 0, feather: 46, flatten: 0.84, relief: 0.10 },
    roads: { paths: roundRoadBends([
      // Windbreak service court west of the melt pan, not a town spread
      // across the ice. Parallel station rows open into two snow corridors.
      [[-270, -118], [-180, -112], [-100, -104], [-20, -104], [70, -104], [252, -104]],
      [[-310, -460], [-280, -300], [-270, -118], [-274, 74], [-286, 274], [-300, 460]],
      [[-130, -462], [-98, -288], [-100, -104], [-100, 96], [-114, 262], [-90, 464]],
      [[298, -460], [270, -284], [252, -104], [258, 82], [288, 282], [326, 462]],
      [[-274, 74], [-202, 150], [-100, 96], [-20, 96], [64, 154], [202, 174], [288, 282]],
    ]) },
    lakes: [{ x: 114, z: -22, r: 77, depth: 0.55 }, { x: -302, z: 300, r: 38, depth: 0.45 }],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -186, z: -52, length: 180, width: 44, height: 5.6, yawDeg: 8 },
      { kind: 'ridge', x: 196, z: 84, length: 190, width: 48, height: 6.0, yawDeg: -6 },
      // 2026-10-03 (maps lane B): the north berm turns across the approach and moves north (it ran north-south at x -20
      // from z 158 to 378), off Verdant's northern ridge (the layout brief's skeleton rule: at most one of Verdant's
      // landforms with one of this map's within 75 m), 2 m higher so that, faded by the arc's pad clearings, it still
      // screens the two deployments from each other
      { kind: 'ridge', x: -14, z: 300, length: 170, width: 50, height: 8.4, yawDeg: 4 },
      { kind: 'ridge', x: -10, z: -270, length: 200, width: 56, height: 5.8, yawDeg: 88 },
      // 2026-10-03 (maps lane B): two snow berms the station banked against the drift. One crosses the service street's
      // northern approach, where the street runs out through a cut. The other lies across the open ground south-east of
      // the station, its rotation about the midpoint of the two deployments. Both stand more than 75 m from Verdant's
      // ridges (the layout brief's skeleton rule). With the PR head's bot fixes, both teams drove the street straight into
      // the court. battlePacing's seed 45003 ended there in 77 s, under the 90 s floor. Now the four receipt seeds take
      // 134 / 128 / 163 / 260 s, and none of twelve takes under 128 s. Over 40 all-bot seeds the split is 17-23 (14-26
      // without them). The berms stand 3.6 m: at 4.2 m a hull crossing a berm's end at speed took a 163 HP fall.
      { kind: 'ridge', x: -124, z: 186, length: 130, width: 40, height: 3.6, yawDeg: 0 },
      { kind: 'ridge', x: 22, z: -173, length: 130, width: 40, height: 3.6, yawDeg: 0 },
      { kind: 'basin', x: 98, z: 12, rx: 108, rz: 128, height: -2.2, wetScale: 0.2 },
      { kind: 'knoll', x: -346, z: 24, rx: 84, rz: 102, height: 7.0 },
      // 2026-10-03 (maps lane B): periglacial geology — an esker, the sinuous gravel ridge a meltwater tunnel left under
      // the ice, winds across the south-west tundra in three linked reaches; three pingos, the ice-cored frost mounds
      // of a polar plain, stand in the open south-east, north-east and south-west.
      { kind: 'ridge', x: -392, z: -268, length: 90, width: 16, height: 3.2, yawDeg: 62 },
      { kind: 'ridge', x: -352, z: -198, length: 80, width: 15, height: 3.6, yawDeg: 48 },
      { kind: 'ridge', x: -300, z: -146, length: 76, width: 14, height: 3.0, yawDeg: 30 },
      { kind: 'knoll', x: 318, z: -262, r: 20, height: 4.2 },
      { kind: 'knoll', x: 360, z: 330, r: 18, height: 3.8 },
      { kind: 'knoll', x: -250, z: -320, r: 17, height: 3.4 },
    ],
  },
  spawns: { player: { x: -102, z: -390 }, enemies: [
    { x: -256, z: 382 }, { x: -174, z: 422 }, { x: -90, z: 380 }, { x: -6, z: 424 },
    { x: 78, z: 382 }, { x: 162, z: 422 }, { x: 248, z: 388 },
  ] },
  // round 70 (owner 2026-09-25: yes to the Whiteout snow re-grade). Round 44's law — the lit snow must leave the tonemap
  // shoulder below the capped sky — reaches the snow that RENDERS here: winter's round-48 grassTone step grades the
  // procedural fallback only, the sourced Snow010A rendered untinted on both winter maps (applySourcedTerrain reads the
  // splat for its palette id and mudRough alone). The photo snow's albedo takes a neutral-cold multiplier, the fallback
  // law steps by the same factor (L 0.52 + 0.32·l → 0.46 + 0.28·l), postExposure 0.86 → 0.83 in the sky block below.
  // Skyline metric and the snow boxes in the round-70 section of docs/MAP-BEAUTIFICATION.md.
  splat: { sourcedPalette: 'winter', ...winter.splat,
    sourcedTint: { G: [0.88, 0.885, 0.895] },
    grassTone: (h: number, s: number, l: number) => [0.575, 0.03, clamp01(0.46 + l * 0.28)], // snowpack fallback
    // 2026-10-03 (maps lane B, the gauntlet's "dull blue-grey plaster"): snow is near neutral, and under overcast its
    // blue comes only from open sky (the skies lane's lighting side). The macro tints go from B/R 1.06 (A) and
    // 1.17 (B) to 1.04, at the same luminance (Rec. 709: A 1.039, B 0.873). C was already 1.03.
    iceDrift: 0.3, tintA: [1.021, 1.041, 1.062], tintB: [0.858, 0.875, 0.893], tintC: [1.05, 1.06, 1.08], roadTint: [0.67, 0.70, 0.72], midRelief: 0.45 },
  vegetation: {
    grassTexTone: winter.vegetation.grassTexTone, tuftTone: winter.vegetation.tuftTone,
    // A few sheltered firs break up the spruce/birch silhouette without
    // increasing the deliberately sparse station's tree placement budget.
    species: ['spruce', 'birch', 'fir'], clusterMix: [['spruce', 0.55], ['birch', 0.35], ['fir', 0.10]],
    loneMix: [['birch', 0.65], ['spruce', 0.30], ['fir', 0.05]], rimMix: [['spruce', 0.65], ['birch', 0.25], ['fir', 0.10]],
    // Trees round 2b (2026-10-03, gauntlet wave 28): Whiteout Station stands on an ice sheet — no tree, no shrub and no
    // grass grows on the ice (its rock is the bare nunataks'). Was 8 / 12 / 20 trees, grass 0.20, scrub 0.22.
    clusterCount: 0, loneCount: 0, rimCount: 0, grassDensity: 0, bushCount: 0, bushSpecies: 'birch',
    palettes: winter.vegetation.palettes,
  },
  props: {
    sourcedPalette: 'winter',
    plan: ['depot', 'warehouse', 'watertower', 'foundryoffice', 'containerRow', 'depot', 'warehouse', 'ruin', 'firestation', 'depot', 'containerRow', 'woodshed', 'warehouse', 'ruin', 'depot', 'foundryoffice'],
    destructibleBuildings: ['quonsethut', 'relaystation', 'motorpool', 'servicegarage'],
    buildingLat: [14, 2], destructibleBuildingLat: [18, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'station-motor-pool', role: 'brawl', x: -196, z: 26, yawDeg: 90, structure: 'motorpool', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      // 2026-10-03 (maps lane B): the weather relay moves from (288, 38), 52 m from Verdant's eastern observer, and the
      // fuel shelter from (12, 266), 13 m from Verdant's northern command fold, behind the moved north berm (the layout
      // brief's skeleton rule: no strongpoint within 60 m of one of Verdant's)
      { id: 'eastern-weather-relay', role: 'scout', x: 320, z: -10, yawDeg: -90, structure: 'relaystation', outcrop: { count: 4, radius: 8 } },
      { id: 'north-fuel-shelter', role: 'support', x: -70, z: 270, yawDeg: 180, structure: 'quonsethut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true },
    ],
    tones: makeRealisticCityBuildingTones({ value: 1.04, saturation: 1.02, soot: 0.01, roofValue: 0.94 }),
    industrialCladding: 'steel', // round 75: a polar station's halls are corrugated sheet, not brick
    yardDressing: 60, // round 75: a snowed-in station keeps its yards sparse
    snowCap: true, extraKits: ['winterLake'], wallStyle: 'fieldstone', wallStoneChance: 0.78,
    wallRuns: [[-148, -76, -148, -16, 2], [-148, 20, -148, 84, 3], [-66, -58, -4, -58, 2], [-66, 52, -4, 52, 3], [-26, 296, 56, 296, 2], [316, 0, 316, 74, 2]],
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: true,
    rocks: 136, outcrops: 22, craters: 50, rubblePiles: 12, sandbagLines: 16, hedgehogs: 12,
    // the map-vehicles lane (2026-10-06, the period ruling): the Arctic north in the 1980s: Norway's Leopard 1 and
    // M48, Sweden's Strv 103, the Soviet T-80B and BMP-2
    tankWrecks: { era: 'cold-war', count: 5, debris: true, ids: ['leo1a5', 'm48', 'strv103', 't80b', 'bmp2'] },
    inhabit: { stalls: 0, benches: 2, coreClutter: 20, sleds: 10, drums: 8, trucks: 5, jeeps: 4, drumClusters: 5, camps: 2, modernClutter: 20, looseClutter: 20, roadFence: 'fencerail', yardFence: 'fencerail' },
  },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the flattest ring's tone grain 0.35 -> 0.60
  // round 49 (2026-09-23): the layers probe (ring mesh hidden: skyline ratio 1.005 -> 1.009, edge row unchanged) shows
  // the sky-w / sky-s skyline is the terrain-material rim band, not this ring — round 44's re-grade call stands. Ring
  // side: wind-scoured crests only (bareRock, rockHex 0x9da9b4 -> 0x5b6772: the pale rock read as more snow). Winter
  // is untouched.
  // round 72 (2026-09-25, owner: "the mountains look so flat and untextured and boring"): the polar character on the alpine
  // ladder — the foothill kept low (amp 1.0: at 1.45 the first ridge, a terrain-material face, walled off the ranges)
  // and the polar character's boost standing the ranges behind it to the stratus, snow on the broad faces with rock on
  // the steep ones, the scoured ribs at a third (at 1 they greyed every upper slope to heath), spruce and birch stands
  // on the lower slopes
  // the mountains lane (2026-10-03): held at the PR head's far country while its ice sheet is finished — the overcast
  // ticket (a7345bd2c) still showed the beige band over the low ring from the elevated views, pixel for pixel (the aerial
  // pass's target under a closed deck, the skies lane's); no ring forest (gauntlet wave 39: "distant conifer silhouettes
  // near the mountains" on a map that must be bare ice — buildHorizonForest and the stands painted on the ring's faces
  // both follow its treeline, and the forest builder stands down under 0.14); and no outland boulders in their place (a
  // treeless ring takes the boulder field at 0.55 by default: 256 k triangles of dark rocks strewn over the snow)
  horizon: { baseHex: 0xa3b1be, amp: 1.0, style: 'alpine', relief: 'polar', treeline: 0, snowline: 0.30, outlandRocks: 0, panorama: false, forestHex: 0x536371, rockHex: 0x5b6772, bareRock: 0.35, haze: 0.92, grain: 0.60 },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the polar deck authored explicitly instead of
  // inheriting Frosthollow's (320 m / 0.00013 / 2200 m) — a lower 300 m stratus of smaller 2000 m masses that keeps
  // its texture at the 13° sun's grazing elevations; diffuse light patchiness (cloudShadowAmp 0.08)
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  // 2026-10-04 (the skies lane; the gauntlet's waves 66–70: "a single flat grey-white gradient with zero cloud structure";
  // and "the ice plain clearly darker than the white sky"): the stratus lit as a deck — what its columns transmit
  // (deckLight 1: one lighting path; a share under 1 pays both) — with soft cells, base lumps and the detail's erosion, and
  // the snow under it lifting its base (ambientScale, the deck path's ground bounce: a quarter-albedo ground at 1). The
  // deck's structure lands in the overcast photos' band, and its level comes down toward the snow's it lights
  clouds: { regime: 'low-stratus', baseM: 300, coverage: 1, scud: 0, nightGlow: 0.2, nightGlowHex: 0xfff0d0,
    deckLight: 1, cells: 0.5, lumps: 0.6, deckDetail: 0.5, ambientScale: 3 },
  sky: { ...winter.sky, sunElevationDeg: 13, sunAzimuthDeg: 164, fogDensity: 0.00072, fogTintHex: 0xb3bfc9, fogMix: 0.56, cloudOpacity: 1.15, cloudOpacity2: 0.86, cloudAltM: 300, cloudHazeK: 0.00012, cloudUvM: 2000, cloudShadowAmp: 0.08, sunIntensity: 2.75, hemiIntensity: 0.58,
    postExposure: 0.83 /* round 70: 0.86 (winter's) → 0.83, the snow re-grade's exposure half */ },
  minimap: { ...winter.minimap, base: [161, 174, 186], hard: [137, 149, 159], soft: [107, 130, 149] },
  shot: { pos: [-256, 49, -262], look: [68, 0, 82] },
} satisfies import('./contracts.ts').MapCompositionConfig;
