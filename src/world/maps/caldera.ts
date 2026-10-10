// src/world/maps/caldera.ts — Obsidian Caldera, redesigned 2026-10-03 (maps-and-layouts lane;
// docs/MAP-LAYOUT-BRIEF.md).
// The caldera wall (the map's high rim), the mining loop and its roads, the extraction works and the ruined settlement,
// the palette, sky, name and id are the map's identity and stay; the basin floor is new. The old floor was Verdant's
// five landforms under seed-random mesa shelves: its sightlines closed to a 76 m median (62 % of the blocked rays under
// 100 m), its roads climbed past 30 % where shelves and unblended junctions met them, and the zone-control discs stood
// up to 1.3 times farther from one team.
//
// Reference: the Aso caldera on Kyushu: a volcanic basin many kilometres across, its floor farmed and settled, cinder
// cones such as Komezuka standing on it, black lava flows, and sulphur workings by the active vents.
//
// The story on the ground: the mining loop rings the settlement on the basin floor. Three cinder cones stand on the
// floor at their scree's angle of repose, each with a summit crater: the Cinder Cone in the north-west, the Little Cone
// south of the loop and the Ember Cone in the south-east. The Black Shelves, flat-topped lava flows, lie off the roads
// on four sides, and the Ash Hollow, a shallow dry crater, opens north of the loop. The south cross road leaves the
// west road and ends on the loop. Alpha deploys in the south-west corner, bravo along the northern floor. The
// zone-control discs stand on the line of equal driven distance: the yard of the Sulphur Works below its stack by the
// west road, the settlement's west end and the Loading Yard on the east.
//
// Landmarks: the Cinder Cone, the Little Cone, the Ember Cone, the Black Shelves, the Ash Hollow, the Sulphur Works'
// stack and the Loading Yard. At the square's edge the west and east Black Shelves run into the rim: the borders lane
// carries them outward.
//
// The settlement (the map-revival lane, 2026-10-05): a farming village of the caldera floor round its sulphur works,
// built in the kyushu kit (maps/regional/kyushu.ts) where the plan seats its buildings. Minka farmhouses under thatch,
// smoked tile or painted tin, with their irimoya gables and the engawa along the south front; white kura storehouses
// on namako bases; timber naya barns; the vinyl greenhouses of the floor's market gardens; the agricultural co-op's
// rice warehouse; the sulphur works' refinery sheds (stained yellow at the foot, a monitor along the ridge) or the
// co-op's big rice kura; the works office of clapboard under tile; the fire brigade's post and its hose tower; the
// works' brick stacks, or the village's fire lookout with its bell; the village shrine with its torii and lanterns;
// burnt farmsteads. The trees are Aso's (treeBiomes.ts): sugi and Japanese red pine.
//
// Caldera round 2 (the map-revival lane, 2026-10-05; gauntlet wave 114: "a flat grey-beige plain of sand or ash with
// pebble decals and low-poly shrubs spread evenly ... a desert mining town", the rim "smooth, untextured domes and pale
// alpine spires rather than Aso's long, flat-topped green rim"): the floor is farmed — rectangular paddies between
// earth bunds, green and flooded, vegetable plots and meadow (landUse.ts, the 'terrace' region); the slopes and the
// cones are Kusasenri's grazed grassland, green under the summer's growth, on black volcanic soil (groundRedux.ts no
// longer zones the floor as pumice and ash); the sugi stand in closed blocks; the scrub is the grassland's low bushes,
// not broadleaf sprays; the rim is a long, level, wooded and grassy wall with no far peaks over it.

import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// Caldera round 3 (the map-revival lane, 2026-10-07; gauntlet wave 131: "a sparse scatter of white box barns with grey
// gable roofs placed far apart on open lawn, with no clustered minka compounds, kura, hedges or cedar windbreaks", "six
// long parallel dark rail lines run diagonally across a mostly empty lawn"): the village authored as Aso's farmsteads —
// each a yard with its minka along the road, a naya and a row of kura across its ends, a greenhouse and a sugi windbreak
// behind — along the two cross roads, the shrine, the fire post and the co-op among them, the Sulphur Works round its
// yard; the roadside plan, its five village stacks and the rail yard's seven sidings are gone (.qa-dev/town-plan.mjs:
// every footprint 34 m or more off a zone's centre and clear of the tactical beats, 5 m or more off a road's line)
const CALDERA_VILLAGE = [
  // seven farmsteads along the two cross roads, each a naya barn and a row of kura across the ends of its yard, a
  // vinyl greenhouse behind most, the minka (placed last: its reach is the widest) along the road, its engawa to it
  // (the eighth, on the south cross road's west end beside alpha's deployment, is gone: with it the bots lane's swap
  // test leaned 27 of 40 to the north; without it 44 of 80, inside the 45-55 % band)
  { structure: 'shed', x: -112.5, z: 172, yawDeg: 101.3 }, { structure: 'containerRow', x: -77.8, z: 165, yawDeg: -78.7 },
  { structure: 'gantry', x: -92.6, z: 181.8, yawDeg: 11.3 }, { structure: 'depot', x: -96.5, z: 162.7, yawDeg: 101.3 },
  { structure: 'shed', x: -43.5, z: 107.5, yawDeg: 100.3 }, { structure: 'containerRow', x: -8.8, z: 101.2, yawDeg: -79.7 },
  { structure: 'gantry', x: -28.7, z: 91.1, yawDeg: 10.3 }, { structure: 'depot', x: -25.2, z: 110.3, yawDeg: -79.7 },
  { structure: 'shed', x: 37.4, z: 165.7, yawDeg: 70.3 }, { structure: 'containerRow', x: 70.7, z: 177.6, yawDeg: -109.7 },
  { structure: 'gantry', x: 49.4, z: 184.3, yawDeg: -19.7 }, { structure: 'depot', x: 55.9, z: 166, yawDeg: 70.3 },
  { structure: 'shed', x: 115.7, z: 141.8, yawDeg: 72.2 }, { structure: 'containerRow', x: 149.3, z: 152.6, yawDeg: -107.8 },
  { structure: 'depot', x: 130.5, z: 152.9, yawDeg: -107.8 },
  { structure: 'shed', x: -68.6, z: -109, yawDeg: 66.8 }, { structure: 'containerRow', x: -36.2, z: -95, yawDeg: -113.2 },
  { structure: 'gantry', x: -47.2, z: -114.5, yawDeg: -23.2 }, { structure: 'depot', x: -54.9, z: -96.5, yawDeg: -113.2 },
  { structure: 'shed', x: 23.1, z: -53.8, yawDeg: 98.1 }, { structure: 'containerRow', x: 58, z: -58.8, yawDeg: -81.9 },
  { structure: 'depot', x: 39.5, z: -62.2, yawDeg: 98.1 },
  { structure: 'shed', x: 126.9, z: -133.7, yawDeg: 124.8 }, { structure: 'containerRow', x: 155.9, z: -153.9, yawDeg: -55.2 },
  { structure: 'gantry', x: 133.6, z: -154.8, yawDeg: 34.8 }, { structure: 'depot', x: 144.7, z: -138.8, yawDeg: -55.2 },
  // the shrine in its grove, the fire brigade's post, the co-op's rice warehouse, two burnt farmsteads; the Sulphur
  // Works round its yard: the works office, two refinery sheds and the stack west of the yard
  { structure: 'watertower', x: -120, z: 195, yawDeg: 180 }, { structure: 'firestation', x: 30, z: 105, yawDeg: 0 },
  { structure: 'warehouse', x: 98, z: -125, yawDeg: -30 }, { structure: 'foundryoffice', x: -365, z: 150, yawDeg: 90 },
  { structure: 'factory', x: -385, z: 45, yawDeg: 90 }, { structure: 'factory', x: -395, z: 150, yawDeg: 0 },
  { structure: 'ruin', x: -40, z: 175, yawDeg: 20 }, { structure: 'ruin', x: 100, z: -40, yawDeg: -20 },
  { structure: 'stack', x: -378, z: 100, yawDeg: 0 },
] as const;
// the sugi windbreak behind each farmstead (the cypress slot is sugi in Aso's biome, treeBiomes.ts)
const CALDERA_WINDBREAKS = [
  [-114.3, 195.8, -69.2, 186.8], [-54, 86.1, -8.8, 77.8], [23.6, 185.2, 66.9, 200.7], [116.5, 117.9, 160.3, 132],
  [-65.5, -132.7, -23.3, -114.5], [19.9, -30.1, 65.4, -36.6], [108.5, -148.9, 146.2, -175.1],
] as const;
// the light buildings at the works: the Sulphur Works' sheds round its yard, the Loading Yard's office, garage and motor
// pool, a guard hut at the loop's south-east gate (authored: the roadside pass dropped them among the farmsteads)
const CALDERA_LIGHT = [
  { kind: 'quonsethut', x: -400, z: 100, rot: Math.PI / 2 }, { kind: 'transformershed', x: -345, z: 30, rot: 0 },
  { kind: 'relaystation', x: -330, z: 45, rot: 0 }, { kind: 'servicegarage', x: 330, z: -130, rot: 0 },
  { kind: 'securityoffice', x: 260, z: -250, rot: 0 }, { kind: 'motorpool', x: 390, z: -255, rot: 0 },
  { kind: 'guardpost', x: 240, z: -215, rot: 0 },
];

export default {
  id: 'caldera',
  name: 'Obsidian Caldera',
  blurb: 'Black volcanic shelves and abandoned extraction works ring an ash-choked basin',
  terrain: {
    // Dark splat/ash dressing supplies the volcanic character; the lava shelves are authored landforms off the roads.
    hillScale: 0.55, microScale: 0.6, rimH: 56,
    mesas: null,
    marshes: [
      { x: -246, z: 242, r: 36, dip: 1.4 }, { x: 360, z: -230, r: 34, dip: 1.2 },
    ],
    // (Caldera round 3, wave 131: "inside a perfectly octagonal ring road") the mining loop bends between its corners —
    // each long side bowed 8-10 m off its chord (inward where the west and east roads run beside it; the north-east side
    // keeps its line over the loading road's levelled bump); its corners stay where they were graded (rounding them ran
    // the road over the Ash Hollow's rim and the Little Cone's fan at more than the brief's 18 %)
    roads: { paths: [
      [[104, -264], [171, -225.5], [226, -171], [242, -160], [256.3, -78], [286, 8], [253, 88], [238, 174], [190, 204.5],
        [82, 270], [-11, 271], [-104, 252], [-172, 194], [-252, 150], [-259, 55], [-286, -36], [-250.8, -109.6],
        [-230, -190], [-147.7, -229.3], [-74, -282], [14.6, -265], [104, -264]],
      [[-434, -448], [-360, -278], [-350, -238], [-314, -92], [-286, 92], [-236, 286], [-170, 466]],
      [[350, -446], [302, -270], [278, -92], [296, 86], [258, 268], [198, 452]],
      [[-350, -238], [-304, -210], [-174, -130], [-34, -68], [108, -92], [226, -171]],
      [[-280, 216], [-146, 152], [-8, 126], [132, 172], [190, 204.5], [262, 248]],
    ] },
    // The zone-control seats on the line of equal driven distance: the western sulphur works' yard and the eastern
    // loading yard are aprons; the ruined settlement's west end needs none. Both keep the apron bank law
    // (docs/MAP-LAYOUT-BRIEF.md, "Apron banks"): the sulphur yard follows the west road's grade beside it, and the
    // loading yard tilts 8 % with the lava slope it is cut into, with a 30 m bank.
    hardstands: [
      { x: -332, z: 96, width: 50, length: 50, yawDeg: 0, grade: 'road' },
      { x: 340, z: -200, width: 56, length: 56, yawDeg: -77, level: -1, grade: 0.08, bankM: 30 },
    ],
    // the yards' worn ground: spoil, wheel wear and spilled ore round each yard in an irregular apron, so a yard reads as
    // a working place on its bank, not a ruled square (workedGroundMask.ts)
    workedGround: [
      { boundary: [[-299, 106], [-313, 121], [-324, 140], [-345, 134], [-359, 121], [-378, 111], [-385, 88], [-367, 72], [-348, 67], [-329, 53], [-304, 59], [-299, 85]], feather: 9, strength: 0.85 },
      { boundary: [[379, -179], [360, -168], [341, -151], [320, -164], [309, -181], [293, -199], [292, -226], [318, -237], [339, -237], [362, -239], [384, -227], [380, -201]], feather: 10, strength: 0.85 },
    ],
    village: { x0: -178, x1: 188, z0: -174, z1: 190, cx: 4, cz: 14, feather: 44, flatten: 0.72, relief: 0.24 },
    landforms: [
      // a small negative knoll on the bump the hill noise raises 2.5 m by the north-east loading road at (100, 247): bravo's
      // block routes cross it at speed, and a hull launched off it took the map's worst fall (2026-10-03, 108 hp)
      { kind: 'knoll', x: 101, z: 246.5, rx: 9, rz: 9, height: -2.2 },
      // Three cinder cones, each with its summit crater, rills cut deep into its scree, talus fans spreading below the
      // rills' mouths onto the floor and a knobbly surface (landformGeology.ts). The Cinder Cone is the youngest, its
      // flanks near the scree's angle of repose (its steepest flank 1.14 x height / (radius x (1 - rim))) and its crater
      // breached to the south-west; the Ember Cone is older, lower and more gullied; the Little Cone is a parasitic vent.
      // (Caldera round 3, wave 131: "Komezuka is a smooth green dome") the cones' ribs and gullies deeper and narrower, the
      // craters deeper: the grassed flanks fluted as Komezuka's are, the light and shade of each rib reading through the
      // sward (was 11 / 12 / 8 gullies at 5 / 5.5 / 3.2 m, 0.55-0.6 wide; craters 4 / 2.5 / 2 m)
      { kind: 'knoll', x: -185, z: 266, rx: 48, rz: 60, height: 24,
        geology: { profile: 'cone', crater: { rim: 0.16, depthM: 5.5, breachDeg: 200 }, outline: 0.1,
          gullies: { count: 14, depthM: 6.5, width: 0.42 }, fans: { reach: 0.3, heightM: 2.4 }, rough: 1.1 } },
      { kind: 'knoll', x: 205, z: -300, rx: 60, rz: 60, height: 18,
        geology: { profile: 'cone', crater: { rim: 0.15, depthM: 3.5 }, outline: 0.14,
          gullies: { count: 14, depthM: 6.5, width: 0.45 }, fans: { reach: 0.32, heightM: 2.6 }, rough: 1.1 } },
      { kind: 'knoll', x: -40, z: -345, rx: 36, rz: 36, height: 13,
        geology: { profile: 'cone', crater: { rim: 0.18, depthM: 2.6 }, outline: 0.08,
          gullies: { count: 10, depthM: 4, width: 0.45 }, fans: { reach: 0.28, heightM: 1.6 }, rough: 0.8 } },
      // The Black Shelves: lava flows run down from the caldera wall: a blocky channel between raised levees, lobed
      // margins with a steep wall and talus, and a steep front where each flow stopped on the basin floor.
      { kind: 'ridge', x: -390, z: -100, length: 260, width: 50, height: 8, yawDeg: 70,
        geology: { profile: 'flow', front: 1, outline: 0.25, rough: 0.9, gullies: { count: 3, depthM: 1.2, width: 0.4 } } },
      { kind: 'ridge', x: 390, z: 100, length: 260, width: 50, height: 8, yawDeg: 70,
        geology: { profile: 'flow', front: -1, outline: 0.25, rough: 0.9, gullies: { count: 3, depthM: 1.2, width: 0.4 } } },
      // the Ash Hollow
      { kind: 'basin', x: 100, z: 300, rx: 70, rz: 50, height: -4, geology: { outline: 0.2, rough: 0.35 } },
      // the older flow fields under the caldera wall, their fronts toward the basin (the western and eastern fields stand
      // off their yards' banks: the apron bank law)
      ...([[-150, -330, 160, 10, 1], [160, 330, 160, 10, -1], [440, -80, 150, 80, -1], [-450, 60, 150, 80, 1]] as const)
        .map(([x, z, length, yawDeg, front]) => ({ kind: 'ridge', x, z, length, width: 80, height: 7, yawDeg,
          geology: { profile: 'flow' as const, front, outline: 0.28, rough: 0.9,
            gullies: { count: 3, depthM: 1.2, width: 0.4 } } })),
    ],
  },
  spawns: {
    player: { x: -302, z: -380 },
    // Bravo deploys in a 4 x 2 block like alpha's, centred where its old line of pads had its centroid, so every
    // objective keeps its reach (the bots lane, 2026-10-03: a corner block against a 500 m line of pads leans the battle).
    enemies: [{ x: 32.3, z: 383.7 }, { x: 24.3, z: 383.7 }, { x: 16.3, z: 383.7 }, { x: 8.3, z: 383.7 }, { x: 32.3, z: 393.7 }, { x: 24.3, z: 393.7 }, { x: 16.3, z: 393.7 }],
  },
  splat: {
    // (Caldera round 2: Kusasenri's grass and the black Andosol under it; the procedural fallback's tones — the rendered
    // albedo is the sourced 'caldera' row, sourcedTextures.ts)
    grassTone: (h: number, s: number, l: number) => [0.22, clamp01(s * 0.62), clamp01(l * 0.56 + 0.07)],
    dirtTone: (h: number, s: number, l: number) => [0.07, clamp01(s * 0.32), clamp01(l * 0.36 + 0.05)],
    rockTone: (h: number, s: number, l: number) => [0.02, clamp01(s * 0.25), clamp01(l * 0.36 + 0.045)],
    // (the macro tints: the grassland's green patches and its cured gold, not the ash's warm greys)
    tintA: [0.94, 0.98, 0.86], tintB: [0.78, 0.82, 0.72], tintC: [1.02, 0.97, 0.80],
    roadTint: [0.49, 0.46, 0.43], strata: 0.05, midRelief: 1.15,
  },
  vegetation: {
    // Las Canadas on Tenerife: sparse Canary pine on bare cinder, a few Canary junipers, broom scrub (retama, codeso)
    // between, no grass carpet (gauntlet wave 3: the eucalyptus hillside and the meadow did not belong in a volcanic
    // caldera). The pine, cypress and acacia archetypes stand in for the Canary pine, juniper and broom.
    // (Caldera round 2: Aso's — the sugi in the pine and cypress slots stand in closed plantation blocks and windbreaks,
    // the red pine in the acacia slot on the dry knolls and alone; wave 114: "evenly scattered shrubs")
    species: ['pine', 'cypress', 'acacia'], clusterMix: [['pine', 0.62], ['cypress', 0.3], ['acacia', 0.08]],
    loneMix: [['acacia', 0.5], ['pine', 0.3], ['cypress', 0.2]], rimMix: [['pine', 0.6], ['cypress', 0.3], ['acacia', 0.1]],
    // Trees round 2b (2026-10-03, wave 26: "evenly spaced, grid-like" pine stands; the caldera floor is nearly treeless
    // but for the broom): a few open groves (treeBiomes.ts open), scattered pines and a thin rim (its blocks stand
    // inside the square's corners), the broom carrying the floor. Was 16 / 38 / 40 trees and 0.55 broom.
    // (Caldera round 2: more and closed blocks, fewer lone trees, a fuller rim wood, the grassland's sward, a third of the
    // even bush carpet; was 5 / 22 / 14 trees, 0.03 grass, 1.0 bushes)
    clusterCount: 12, loneCount: 12, rimCount: 24, grassDensity: 0.5,
    // (round 3) the farmsteads' sugi windbreaks, real cover: a row behind each yard
    belts: CALDERA_WINDBREAKS.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1, gap: 6, jitter: 1.5, species: 'cypress' })),
    bushCount: 0.35, bushSpecies: 'acacia',
    // ground lane (wave 62, Caldera street-a: "a bright neon yellow-green scribble … an unmistakable rendering glitch" on
    // the cone's face was one of these few tufts, in the meadow's default green): the caldera's grass is dry, ash-dulled
    // straw, as the badlands' and the desert's
    // (Caldera round 2: Kusasenri's grazed sward, a muted summer green going to straw at the tips — the ground lane's
    // wave-62 straw was Las Cañadas's)
    grassTexTone: (h: number, s: number, l: number) => [0.2, clamp01(s * 0.55), clamp01(l * 0.82 + 0.04)],
    tuftTone: (h: number, s: number, l: number) => [0.19, 0.3, clamp01(l * 0.64 + 0.08)],
  },
  props: {
    // (round 3: the village authored, CALDERA_VILLAGE above; no roadside plan, no block fill; a building 2 m off a
    // neighbour's reach so a farmstead's barns stand round its yard; was the 30-building plan, block fill and 9 m)
    plan: [],
    plannedSites: CALDERA_VILLAGE,
    townLightPlan: CALDERA_LIGHT,
    spacingPad: 2,
    destructibleBuildings: [
      'quonsethut', 'transformershed', 'motorpool', 'guardpost',
      'securityoffice', 'servicegarage', 'relaystation',
    ],
    tacticalBeats: [
      { id: 'western-lava-cut', role: 'brawl', x: -290, z: 170, yawDeg: 4,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.6 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'caldera-survey-post', role: 'scout', x: -46, z: -246, yawDeg: 20,
        structure: 'guardpost', outcrop: { count: 5, radius: 9, scaleMax: 2.9 } },
      { id: 'eastern-transformer-yard', role: 'support', x: 180, z: 160, yawDeg: -8,
        structure: 'transformershed', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 16 },
    ],
    // the village in Aso's architecture (the kyushu kit); the kit owns the renders' tones, the field walls keep the
    // city preset's stone
    architecture: 'kyushu',
    tones: { stone: makeRealisticCityBuildingTones({ value: 0.70, saturation: 0.88, soot: 0.055, roofValue: 0.68 }).stone },
    // (round 3: no rail yard — its seven sidings were Cinder Junction's, laid across the paddies)
    wallStyle: 'fieldstone', wallStoneChance: 0.72,
    wallRuns: [
      [-306, -140, -214, -104, 2], [-298, 130, -206, 166, 3],
      [204, -142, 300, -106, 3], [202, 134, 296, 168, 2],
      [-144, 248, -42, 278, 3], [68, -270, 164, -238, 2],
    ],
    buildingLat: [12, 7], sideSkip: 0.08, maxSpread: 3.4,
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: true,
    rocks: 310, outcrops: 76, craters: 92, rubblePiles: 36,
    sandbagLines: 22, hedgehogs: 26,
    // the map-vehicles lane (2026-10-06, the period ruling): Kyushu: the Ground Self-Defense Force's Types 10, 90
    // and 74 and the Type 89 IFV
    tankWrecks: { era: 'modern', count: 7, debris: true, ids: ['type10', 'type90', 'type74', 'type89'] },
    inhabit: {
      stalls: 0, benches: 1, coreClutter: 30, drums: 16,
      trucks: 8, jeeps: 5, drumClusters: 9, camps: 3, modernClutter: 34,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  horizon: {
    // (Caldera round 2, wave 114: "smooth, untextured domes and pale alpine spires rather than Aso's long, flat-topped
    // green rim"): the rim wooded on its lower walls and grassy over its level tops (the rolling relief's forest and
    // fields cover, not the volcanic field's bare cones), and no far peaks over it (the uplands behind the rim)
    relief: 'rolling', panorama: { regional: 'upland' },
    baseHex: 0x55603d, amp: 1.52, style: 'mesa', treeline: 0.55,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): stacked lava-flow beds on the crater
    // walls (banding 0.18 over the 0.16 default), a second skyline rank of the dark conifers and more tone grain on
    // the flattest-reading ring of the mesa family (0.48 -> 0.60)
    banding: 0.18, treelineLayers: 2,
    // the mountains lane (2026-10-03): the outland boulders a shade sparser — they follow the ring's drained faces, and
    // the map's horizon draws no more triangles than the PR head's
    outlandRocks: 0.9,
    forestHex: 0x27351f, rockHex: 0x4d4b44, haze: 0.94, grain: 0.60,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cumulus-humilis', coverage: 0.22, cirrus: 0.45, baseM: 1500 },
  sky: {
    sunElevationDeg: 22, sunAzimuthDeg: 116, turbidity: 8.5, rayleigh: 1.15,
    // 2026-10-03 (the skies lane; the gauntlet's Caldera wave 3: "a large soft white bloom halo that erases the upper-left
    // quarter of the sky ... an exposure/tonemapping bug"): the halo was the sky's own aureole — the heaviest aerosol of
    // every map (Mie 6x the Earth's at g 0.89: display luma >= 0.89 out to 15 deg from the sun; the bloom, the shafts and
    // the flare added 0.01-0.02). Half the aerosol at the tightest lobe the calibration allows keeps the ash haze over
    // the land (fogDensity) and the bright glare core while the sky a few degrees off the sun keeps its colour
    mieCoefficient: 0.007, mieDirectionalG: 0.92, fogDensity: 0.00082,
    fogTintHex: 0x81766d, fogMix: 0.67, envIntensity: 0.18,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the overcast deck authored explicitly (it took
    // the auto branch's 340 m / 0.00015 / 2400 m) — a 360 m ash-laden deck of 2300 m masses with a slightly thinner
    // slant haze so the broken bases keep texture over the crater rim; diffuse light patchiness (cloudShadowAmp 0.12)
    cloudOpacity: 1.28, cloudOpacity2: 1.04, cloudTintHex: 0xc4b7aa,
    cloudAltM: 360, cloudHazeK: 0.00014, cloudUvM: 2300, cloudShadowAmp: 0.12,
    // Preserve the smoky low-key grade while keeping direct/ambient
    // separation strong enough for reliable terrain and structure shadows.
    sunIntensity: 4.0, sunColorHex: 0xffc9a0, hemiIntensity: 0.42, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.5 / 0xffb985 / 0.64); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x4b4845 },
  },
  minimap: {
    base: [60, 57, 50], hard: [77, 73, 67], soft: [57, 54, 49],
    forest: 'rgba(35,43,31,.75)', forestStroke: 'rgba(22,27,20,.9)',
    water: 'rgba(75,74,68,.55)', waterStroke: 'rgba(45,44,41,.78)',
    roadCasing: 'rgba(30,29,27,.96)', roadFill: 'rgba(112,104,94,.94)', buildingFill: '#aaa7a1',
  },
  shot: { pos: [-238, 50, -230], look: [42, 6, 66] },
} satisfies import('./contracts.ts').MapCompositionConfig;
