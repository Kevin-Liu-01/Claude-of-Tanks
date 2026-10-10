// src/world/maps/foundry.ts — Ironworks, redesigned 2026-10-03 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The works streets, the rail fan, the loading court, the palette, sky, name and id are the map's identity and stay;
// the ground and the works plan are new. The old floor was Verdant's five landforms round a generated street grid:
// works buildings stood in seven carriageways (roadside works buildings had no frontage contract), the grid's exits
// climbed the rim at up to 33 % and its centre crossing stepped at 17 %, the zone-control discs sat 1.13 times
// farther from one team, and the ground's relief (3.02 m) stood at the brief's floor.
//
// Reference: the Völklingen ironworks on the Saar (fought over in March 1945): blast furnaces and their stacks along
// the casting street, the ore yard's stockpiles, the rail fan, a rolling mill, and slag tipped into banks and cones at
// the works' edge.
//
// The story on the ground: the works stand on a levelled floor inside their street grid. The Great Slag Tip rises
// south-east of the works and an old tip inside them west of the casting yard, both flat-topped where the tipping track
// ran and rilled by rain; slag banks line the west and east edges and a long tipped bank closes the north; the ore
// yard's two stockpile berms cross the floor. Alpha deploys in the south-west corner, bravo along the north. The
// zone-control discs stand on the line of equal driven distance, on paved yards: the west street's yard, the casting
// yard below the blast furnace block (also the turbo-ball kickoff), and the slag road's yard in the south-east.
//
// Landmarks: the blast furnace block (the casting house and two stacks), the Great Slag Tip, the old tip, the ore
// yard's berms, the loading court, the rolling mill's warehouse. At the square's edge the west and east slag banks
// and the north bank run toward the rim and every works street leaves on its own line: the borders lane carries them
// outward.

import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS } from './townPlans.generated.ts';
import { FURNACE_LINE_ADDITIONS } from './saarWorks.ts';

export default {
  id: 'foundry',
  name: 'Ironworks',
  blurb: 'A sprawling foundry district of rail sidings, brick works and container yards',
  terrain: {
    hillScale: 0.62, microScale: 0.66, rimH: 26,
    // The works streets are authored paths, not a generated grid: each ends on a boundary anchor whose portal carries
    // its grade through the rim, and the crossings are shared stations graded as one network
    // (roadStations.ts usesPhysicalRoadStations), so no street steps at a junction or climbs the rim.
    roads: {
      paths: [
        ...[-258, 0, 258].map((x) => [[x, -480], [x, -260], [x, 0], [x, 262], [x, 480]] as [number, number][]),
        ...[-260, 0, 262].map((z) => [[-480, z], [-258, z], [0, z], [258, z], [480, z]] as [number, number][]),
        [[-258, -225], [-120, -126], [48, -12], [220, 112], [258, 136]],
        [[-258, 211], [-248, 206], [-94, 118], [72, 26], [232, -86], [258, -108]],
        [[-258, -189], [-190, -210], [-42, -196], [104, -158], [248, -194], [258, -203]],
      ],
    },
    marshes: [],
    // The zone-control seats on the line of equal driven distance: the west street's yard and the slag road's yard on
    // their roads' grades, the casting yard tilted with its floor; all three keep the apron bank law.
    hardstands: [
      { x: -258, z: 50, width: 56, length: 56, yawDeg: 0, grade: 'road' },
      { x: 0, z: -72, width: 50, length: 50, yawDeg: 56, level: 0.7, grade: 0.016 },
      { x: 200, z: -176, width: 56, length: 56, yawDeg: 104, grade: 'road' },
      // the map-revival lane (2026-10-06): the furnace line's floor at the works street's level, one level for the three
      // casting houses and their bunker front (maps/saarWorks.ts), cut into the ore berm's north-east end; its width runs
      // along the line (the block's yaw), its length across it; a 14 m bank keeps the cut under the bank law's 0.6
      { x: -74, z: -29, width: 48, length: 22, yawDeg: 25, level: 2.4, grade: 0, bankM: 14 },
    ],
    villageWear: 'activity-patches',
    // A compact loading court and its southern access, not a new flattened
    // terrain pad. Existing mask alpha supplies broken soil/wheel wear.
    workedGround: [
      { boundary: [[83, -116], [92, -129], [115, -128], [127, -115],
        [122, -98], [109, -90], [90, -93], [82, -104]], feather: 5, strength: 1 },
      { boundary: [[94, -126], [105, -126], [108, -143], [110, -160],
        [99, -162], [95, -146]], feather: 4, strength: 1 },
      { boundary: [[116, -96], [136, -98], [158, -111], [175, -110],
        [176, -100], [155, -100], [136, -88], [118, -87]], feather: 4, strength: 1 },
    ],
    village: { x0: -286, x1: 286, z0: -288, z1: 288, cx: 0, cz: 0, feather: 38, flatten: 0.9, relief: 0.1 },
    // the rock gate reads the slag landforms (terrain.ts landformRock), so the terrain material can draw the tips and
    // banks as slag while the ore berms, cuts and embankments stay ground
    landformRock: true,
    landforms: [
      // The Great Slag Tip south-east of the works and the old tip inside them, west of the casting yard: cones of
      // tipped slag, flat on top where the tipping track ran, rilled by rain (landformGeology.ts).
      { kind: 'knoll', x: 372, z: -372, rx: 72, rz: 72, height: 30,
        geology: { profile: 'cone', crater: { rim: 0.22, depthM: 0 }, outline: 0.12,
          gullies: { count: 16, depthM: 3, width: 0.5 }, rough: 0.9, material: 'slag' } },
      { kind: 'knoll', x: -160, z: 75, rx: 46, rz: 46, height: 16, settlementScale: 1,
        geology: { profile: 'cone', crater: { rim: 0.2, depthM: 0 }, outline: 0.12,
          gullies: { count: 11, depthM: 2, width: 0.5 }, rough: 0.8, material: 'slag' } },
      // the slag banks along the west and east edges: flat-topped tips with a steep tipping face and a talus apron
      ...[[-385, -60, 240, 56, 10], [385, 40, 220, 50, 9]].map(([x, z, length, width, height]) => ({
        kind: 'ridge', x, z, length, width, height, yawDeg: 90,
        geology: { profile: 'butte' as const, wall: [0.4, 0.62] as const, apron: 0.25, outline: 0.25, rough: 0.6,
          gullies: { count: 2, depthM: 1.2, width: 0.5 }, material: 'slag' as const } })),
      // the long tipped bank north of the works, its tipping face to the west
      { kind: 'ridge', x: -18, z: 304, length: 280, width: 70, height: 7.4, yawDeg: 86, settlementScale: 0.86,
        geology: { profile: 'butte', wall: [0.38, 0.6], apron: 0.25, outline: 0.22, rough: 0.6,
          gullies: { count: 3, depthM: 1.2, width: 0.5 }, material: 'slag' } },
      // the ore yard's stockpile berms: long heaps of ore and sinter with lumpy flanks
      { kind: 'ridge', x: -88, z: -54, length: 244, width: 58, height: 7.8, yawDeg: 38, corridorScale: 0.82, settlementScale: 0.88,
        geology: { outline: 0.15, rough: 0.6 } },
      { kind: 'ridge', x: 142, z: 112, length: 216, width: 56, height: 7.2, yawDeg: -42, corridorScale: 0.82, settlementScale: 0.88,
        geology: { outline: 0.15, rough: 0.6 } },
    ],
  },
  spawns: {
    player: { x: -356, z: -372 },
    // Bravo deploys in a 4 x 2 block like alpha's, centred where its old line of pads had its centroid, so every
    // objective keeps its reach (the bots lane, 2026-10-03: a corner block against a 500 m line of pads leans the battle).
    enemies: [{ x: 23.3, z: 386.7 }, { x: 15.3, z: 386.7 }, { x: 7.3, z: 386.7 }, { x: -0.7, z: 386.7 }, { x: 23.3, z: 396.7 }, { x: 15.3, z: 396.7 }, { x: 7.3, z: 396.7 }],
  },
  splat: {
    tintA: [0.72, 0.73, 0.70], tintB: [0.47, 0.49, 0.48], tintC: [0.84, 0.81, 0.74],
    roadTint: [0.51, 0.51, 0.49], midRelief: 0.72,
    townWear: 1.6, // Soil-dominant loading areas; existing alpha owns their irregular extent.
  },
  vegetation: {
    // the map-revival lane (2026-10-05): the works' waste ground goes to birch first (the ruderal stands that colonise
    // slag and cinder), poplar along the sidings, the Saar valley's oak on the rim
    species: ['birch', 'poplar', 'oak'], clusterMix: [['birch', 0.52], ['poplar', 0.30], ['oak', 0.18]],
    loneMix: [['birch', 0.56], ['poplar', 0.30], ['oak', 0.14]], rimMix: [['oak', 0.40], ['birch', 0.34], ['poplar', 0.26]],
    clusterCount: 28, loneCount: 72, rimCount: 74, grassDensity: 0.44,
    bushCount: 0.5, bushSpecies: 'oak',
  },
  props: {
    // the map-revival lane (2026-10-05): the works' own architecture (maps/regional/saar.ts) — the blast furnaces and
    // their stoves, the rolling mills under north lights, gas holders, conveyor galleries, the colliery headframe, the
    // works office and the workers' terraces in the coalfield's brick — in place of the generic halls and sheds
    architecture: 'saar',
    sourcedPalette: 'ironworks',
    foundryServiceCourt: { sites: [
      { planIndex: 2, kind: 'containerRow', x: 163, z: -106, yawDeg: 0 },
      { planIndex: 3, kind: 'gantry', x: 71.5, z: -96, yawDeg: 0 },
      { planIndex: 4, kind: 'stack', x: 133, z: -110, yawDeg: 0 },
      { planIndex: 5, kind: 'shed', x: 117, z: -123, yawDeg: -90 },
      { planIndex: 7, kind: 'factory', x: 117, z: -105, yawDeg: -90 },
      { planIndex: 9, kind: 'warehouse', x: 94, z: -70, yawDeg: 180 },
    ] },
    plan: ['firestation', 'foundryoffice', 'containerRow', 'gantry', 'stack', 'shed',
      'watertower', 'factory', 'depot', 'warehouse', 'containerRow', 'cornershop',
      'rowhouse', 'factory', 'ruin', 'stack', 'depot', 'gantry',
      'containerRow', 'warehouse', 'shed', 'factory', 'stack', 'containerRow',
      'depot', 'gantry', 'warehouse', 'ruin', 'containerRow', 'watertower',
      'factory', 'shed', 'containerRow', 'warehouse', 'stack', 'depot',
      'gantry', 'containerRow', 'ruin', 'warehouse', 'factory', 'shed'],
    // The blast furnace block between the casting street and the ore yard: the casting house and the furnaces' two
    // stacks; east of the rail fan, the rolling mill's warehouse. They stand across the approach lanes.
    // the works stand as PR #9's head seated them (the owner's town-plan ruling, 2026-10-03), whatever the deployment
    // corridors now do to the ground under them; the planned sites below are what that plan was built from
    townPlan: TOWN_PLANS.foundry,
    townLightPlan: TOWN_LIGHT_PLANS.foundry,
    // the map-revival lane (2026-10-06): the blast-furnace line. The recorded block at (-74, -29) gets a furnace either
    // side along its own width, each replayed from the block's stream (props.townPlanAdditions), so the three
    // casting houses stand side by side with their bunkers in one front; the high-line runs over that front and the
    // receiving yard's ore and coke heaps lie beyond its western end (maps/saarWorks.ts, the `saar` extra kit below)
    townPlanAdditions: FURNACE_LINE_ADDITIONS,
    plannedSites: [
      { structure: 'factory', x: -74, z: -29, yawDeg: 25 },
      { structure: 'stack', x: -44, z: -36, yawDeg: 0 }, { structure: 'stack', x: -104, z: -64, yawDeg: 0 },
      { structure: 'warehouse', x: 199, z: -28, yawDeg: 0 },
    ],
    // (the map-revival lane, 2026-10-06, wave 137: the critics read the Nissen hut as a poly-tunnel out of place in a German
    // works; the recorded one beside the west street becomes a brick office of about its footprint, and the pool
    // offers it no more)
    destructibleBuildings: [
      'transformershed', 'motorpool', 'checkpointhut',
      'securityoffice', 'servicegarage', 'relaystation', 'corneroffice',
    ],
    townLightPlanSwaps: { quonsethut: 'securityoffice' },
    tacticalBeats: [
      { id: 'western-rail-fan', role: 'brawl', x: -280, z: 146, yawDeg: 4,
        structure: 'motorpool', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: -15 },
      { id: 'slag-heap-observer', role: 'scout', x: 278, z: -282, yawDeg: 34,
        structure: 'checkpointhut', outcrop: { count: 5, radius: 9, scaleMax: 3.0 } },
      { id: 'eastern-power-yard', role: 'support', x: 305, z: 125, yawDeg: -8,
        structure: 'transformershed', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 15 },
    ],
    extraKits: ['rail', 'saar'], wallStyle: 'fieldstone', wallStoneChance: 0.76,
    wallRuns: [
      [-322, -156, -230, -124, 2], [-316, 146, -220, 176, 3],
      [218, -156, 318, -124, 3], [216, 146, 316, 178, 2],
      [-154, 278, -48, 306, 3], [74, -308, 176, -280, 2],
      [-286, 42, -222, 78, 2], [224, 52, 286, 86, 2],
    ],
    // The authored network mixes worker streets with unpaved freight/rail
    // approaches; a curb on every route outlined the map in orange ribbons.
    blockFill: true, curbs: false, lampposts: true, monument: true, townCraters: true,
    // the works' palette (the realistic city tones) with the Saar kit's yellow brick carried over it: a map's tones
    // override its kit's (props.ts), so the bands' brick of maps/regional/saar.ts surfaces.tones stands here as there
    tones: {
      // (2026-10-06, wave 137: "no soot": the works' brick takes the furnaces' smoke)
      ...makeRealisticCityBuildingTones({ value: 0.86, saturation: 0.88, soot: 0.065, roofValue: 0.8 }),
      plaster2: (_h: number, s: number, l: number) => [0.11, Math.min(1, s * 0.6 + 0.2), Math.min(1, l + 0.05)],
    },
    buildingLat: [18, 4], sideSkip: 0.06, maxSpread: 2.4, spacingPad: 6,
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 142, outcrops: 12, craters: 86, rubblePiles: 48,
    hedgehogs: 36, sandbagLines: 28,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: {
      stalls: 1, benches: 5, coreClutter: 42, drums: 24,
      trucks: 10, jeeps: 6, drumClusters: 11, camps: 2, modernClutter: 46,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): industrial lowland: low rolling hills
    baseHex: 0x555553, amp: 0.55, style: 'rolling', treeline: 0.5, panorama: { regional: 'upland', ampM: 160, trees: 8 },
    forestHex: 0x39413a, rockHex: 0x666360, haze: 0.97, grain: 0.48,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'industrial-stratocumulus', coverage: 0.88, tintHex: 0xd8cec0, nightGlow: 0.9, nightGlowHex: 0xff8a40 },
  sky: {
    sunElevationDeg: 25, sunAzimuthDeg: 128, turbidity: 7.8, rayleigh: 1.35,
    // round 76 (2026-09-26, the deck pass): the industrial haze comes off the whole frame and onto the deck's base and
    // the horizon band — the aerosol at half (mie 0.012 -> 0.006: the sun's transmittance rises, the ground's fill with
    // it), the fog a third thinner and neutral, the smog as the aerosol's warm absorption (mieTintHex: soot and dust
    // scatter blue least), the bird view no longer a grey wash
    mieCoefficient: 0.006, mieDirectionalG: 0.88, fogDensity: 0.00052,
    fogTintHex: 0x858384, fogMix: 0.45, envIntensity: 0.22,
    atmosphere: { mieTintHex: 0xd2b28c },
    cloudOpacity: 1.24, cloudOpacity2: 1.05, cloudTintHex: 0xc8ccca,
    // shadow-audit r2: the 24° key was too weak after haze/ACES on the
    // mobile-low path (3.95 changed-pixel luma against the 4.0 contract), so
    // factory and trunk shadows read as flat discoloration. Keep the authored
    // warm overcast fill, but give the directional sun enough separation to
    // hold across every shadow-map tier.
    sunIntensity: 4.2, sunColorHex: 0xfde3c4, hemiIntensity: 0.36, postExposure: 0.96, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.8 / 0xffd6ad / 0.48); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x736f69 },
  },
  minimap: {
    base: [73, 75, 73], hard: [91, 91, 88], soft: [64, 67, 65],
    forest: 'rgba(48,60,48,.7)', forestStroke: 'rgba(30,38,30,.88)',
    water: 'rgba(55,75,79,.55)', waterStroke: 'rgba(34,48,52,.78)',
    roadCasing: 'rgba(31,31,30,.97)', roadFill: 'rgba(129,129,124,.96)', buildingFill: '#bfc0bd',
  },
  shot: { pos: [-244, 48, -248], look: [54, 3, 72] },
} satisfies import('./contracts.ts').MapCompositionConfig;
