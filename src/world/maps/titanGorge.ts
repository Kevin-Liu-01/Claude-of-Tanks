// src/world/maps/titanGorge.ts — Titan Gorge, redesigned 2026-10-03 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The five roads, the old town on the valley floor, the strongpoints, the palette, sky, horizon ring, vegetation, name
// and id are the map's identity and stay; the ground is new. The old floor was a seed-random mesa field (22 m shelves
// wherever the noise crossed its threshold) over two 760 m ridges laid end to end across the middle. Its sightlines
// closed to a 78 m median (62 % of the blocked rays under 100 m, 2.2 % at 300 m or more), five structures stood in the
// carriageways, the deployments stood 863 m apart, and the zone-control discs stood up to 3.3 times farther from one
// team. Bots drove off the shelves: four standard matches took 15 damaging falls, 4259 hp in all, the worst 1274 hp.
//
// Reference: Monument Valley on the Colorado Plateau: a broad sandy valley floor between stepped sandstone
// escarpments, cliff bands over talus benches, with buttes standing free on the floor as the escarpments' eroded
// outliers and dry washes braiding across it.
//
// The story on the ground: the valley runs north to south between the West Shelf and the East Shelf, walls of bedded
// sandstone 22 m high that end in cliffs short of both deployments. The old town stands in the middle of the floor, in
// the shallow hollow of the wash. Three roads run the valley's length, the west road from the south-west corner and
// two diagonals that cross in the old town, and two cross roads join them south and north of the town. Four buttes
// stand free on the floor, one in each quarter, in pairs that are each other's rotation about the centre, and break the
// long lines between the shelves. The teams come in from opposite ends of the gorge, each in a 4 x 2 block behind a gate
// butte that screens it from the other down the gorge's axis; each block and its butte are the other's rotation about
// the centre. The zone-control discs stand on the line of equal driven distance: the western switchback's yard, the
// crossroads below the old town on the deployments' bisector and the eastern shelf road's yard, the western yard's
// rotation about the centre.
//
// Landmarks: the West Shelf, the East Shelf, the four buttes, the gate buttes, the wash, the old town's crossroads, the western
// switchback, the dry-river camp and the eastern shelf battery. The horizon ring still carries the gigantic stacked
// escarpments beyond the edge without collision or draw calls.
//
// The settlement (the map-revival lane, 2026-10-05): the town is a Navajo community of the Oljato chapter round its
// trading posts, built in the navajo kit (maps/regional/navajo.ts) where the town plan seats its buildings. Two trading
// posts in the manner of Goulding's, two storeys of red sandstone with the trader's rooms above the store; a general
// store with its false front and gas pump; family camps of a hogan, a stone house, a shade house and a sheep corral;
// hogans of juniper logs and earth with their doors to the sunrise; the chapter's water tower and the windmills over
// their stock tanks; a BIA day school, one long storey of field stone under tin; the wool barns, equipment sheds, hay
// sheds and trailers of a working valley; the jewellery stands by the road; abandoned camps. The valley floor is sand
// under juniper and sagebrush, the grass on it cured to straw.

import desert from './desert.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS } from './townPlans.generated.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default {
  id: 'titan_gorge',
  name: 'Titan Gorge',
  blurb: 'Armored columns descend through immense red-rock shelves into a winding canyon crossroads',
  terrain: {
    hillScale: 0.72, microScale: 0.78, rimH: 54, marshes: [],
    dunes: { amp: 1.8 },
    // the authored shelves and buttes replace the noise mesas, and the rock gate reads them (terrain.ts landformRock)
    mesas: null, landformRock: true,
    hardstands: [
      { x: -250, z: 50, width: 52, length: 52, yawDeg: 133, level: -1.9, grade: 0.08, bankM: 16 },
      { x: 250, z: -50, width: 48, length: 48, yawDeg: -47, level: 8.1, grade: 0, bankM: 20 },
    ],
    village: { x0: -138, x1: 148, z0: -132, z1: 152, cx: 8, cz: 12, feather: 58, flatten: 0.66, relief: 0.30 },
    // each cross road's junctions and the northern fork are nodes both roads share, so the junction blend grades one
    // point there (no step between two bakes)
    roads: { paths: [
      [[-420, -458], [-338, -338], [-286, -206], [-220, -86], [-215.93, -80.05], [-142, 28], [-82, 168], [-61.9, 211.34], [-25.84, 289.09], [-18, 306], [62, 466]],
      [[-128, -466], [-88, -324], [-28, -184], [29.28, -71.04], [44, -42], [126, 92], [203.83, 213.27], [212, 226], [306, 356], [390, 458]],
      [[366, -454], [304, -304], [246, -168], [191.28, -64.47], [172, -28], [92, 108], [40.03, 190.91], [8, 242], [-25.84, 289.09], [-84, 370], [-176, 466]],
      [[-382, -72], [-260, -92], [-215.93, -80.05], [-142, -60], [-12, -82], [29.28, -71.04], [116, -48], [191.28, -64.47], [244, -76], [372, -54]],
      [[-334, 228], [-214, 192], [-96, 220], [-61.9, 211.34], [30, 188], [40.03, 190.91], [154, 224], [203.83, 213.27], [284, 196]],
    ] },
    landforms: [
      // The valley's red-rock shelves: stepped walls of bedded sandstone (cliff bands, benches, talus) along the west
      // and east sides (landformGeology.ts).
      // Both ends of each shelf are cliffs, so no taper ramps up onto its cap (bots drove up the tapers and fell off the
      // walls), and the shelves stop short of the deployments.
      // (Titan round 2: the cap broader and the wall steeper over the same footprint, [0.35, 0.55] -> [0.46, 0.56].
      // Round 3, gauntlet wave 119, "the shelves as smooth 30 degree ramps": one sheer wall of massive sandstone over
      // the shale's concave talus, as Monument Valley's walls stand — the wall band narrowed to [0.5, 0.545] of the
      // half-width, the talus a third of the height, 28 m high over the same footprint; thicker beds with smaller
      // risers and less knobbly relief, so the wall reads as one cliff instead of a banded slope)
      // (2026-10-06, the batch-4 integration: round 3's sheer west wall stood on the road border corridor's admission
      // line, x = -430, where roadContinuity's 2 mm seam probe read its 21:1 face as a 4.3 cm step; both shelves stand
      // 3 m further out, so no wall meets the line)
      ...[[-393, 0], [393, 0]].map(([x, z]) => ({ kind: 'ridge', x, z, length: 660, width: 90, height: 28, yawDeg: 90,
        corridorScale: 0.38, geology: { profile: 'butte' as const, wall: [0.5, 0.545] as const, apron: 0.34, cliffEnd: 'both' as const,
          strata: { stepM: 8, riser: 0.25 }, outline: 0.25, rough: 0.45, gullies: { count: 2, depthM: 1.5, width: 0.45 } } })),
      // buttes standing free on the valley floor, the shelves' outliers, in pairs that are each other's rotation about the
      // centre (the west lane's and the east lane's between the roads and the town)
      // (Titan round 2, gauntlet wave 104: "flat-capped, sheer-walled buttes over a talus skirt": the sheer jebel's
      // section, a level cap to 0.88 of the wall's foot, the wall near-vertical down to a talus skirt, shallow flutes;
      // the footprint, the height and the toe are the old butte's.
      // Round 3, gauntlet wave 119: "squat truncated cones or stumps with smeared wavy banding, none has a sheer cliff
      // standing on a talus slope", "obviously tiled vertical ribbing": over the same footprints and toes the buttes
      // stand two thirds taller (18 -> 30 m, 14 -> 24 m), as tall as they are wide at the wall; the cap runs to 0.94 of
      // the wall's foot, a sharp rim; the wall's foot comes in to 0.55 of the radius so the concave talus apron takes a
      // third of the height; six shallow grooves for ten deep flutes, thicker beds, half the knobbly relief)
      ...[[-188, -120, 30, 40, 30], [188, 120, 30, 40, 30], [-140, 280, 34, 34, 24], [140, -280, 34, 34, 24]].map(([x, z, rx, rz, height]) => ({
        kind: 'knoll', x, z, rx, rz, height, corridorScale: 0.44,
        geology: { profile: 'inselberg' as const, outline: 0.22, foot: 0.55, footVary: 0.08, apron: 0.34, rim: 0.94,
          flutes: { count: 6, depth: 0.12 }, rough: 0.45, boulders: 18, strata: { stepM: 8, riser: 0.2 },
          gullies: { count: 3, depthM: 1.2, width: 0.4 } } })),
      // the gate buttes: one in front of each deployment, each the other's rotation about the centre, screening the
      // deployments from each other down the gorge's axis (whole through the deployment corridors: bots drive round them)
      // (Titan round 2: the same sheer section as the free buttes, over the same footprint; round 3: 20 -> 28 m and the
      // free buttes' round-3 section)
      ...[[-12, -300], [12, 300]].map(([x, z]) => ({ kind: 'knoll', x, z, rx: 24, rz: 22, height: 28, corridorScale: 1,
        geology: { profile: 'inselberg' as const, outline: 0.2, foot: 0.55, footVary: 0.08, apron: 0.34, rim: 0.94,
          flutes: { count: 5, depth: 0.12 }, rough: 0.45, boulders: 14, strata: { stepM: 8, riser: 0.2 },
          gullies: { count: 3, depthM: 1.2, width: 0.4 } } })),
      // the wadi's floor, where the valley's streams braid
      { kind: 'basin', x: 22, z: 18, rx: 188, rz: 124, height: -7.0, yawDeg: -12, corridorScale: 0.68,
        geology: { outline: 0.2, rough: 0.4 } },
    ],
  },
  spawns: {
    // The teams come in from opposite ends of the gorge: alpha's 4 x 2 block on the southern floor and bravo's seven
    // pads as its rotation about the centre on the northern floor, each screened by the gate butte in front of it (the
    // bots lane, 2026-10-03: alpha's south-west corner block lost 25 of 36 paired games to bravo's northern deployment,
    // the deployments exchanged or not).
    player: { x: 0, z: -395 },
    enemies: [{ x: 12, z: 395 }, { x: 4, z: 395 }, { x: -4, z: 395 }, { x: -12, z: 395 }, { x: 12, z: 405 }, { x: 4, z: 405 }, { x: -4, z: 405 }],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.075, 0.39, clamp01(0.19 + l * 0.78)],
    dirtTone: (h: number, s: number, l: number) => [0.055, 0.43, clamp01(0.24 + l * 0.48)],
    sandstone: true,
    rockTone: (h: number, s: number, l: number) => [0.035, clamp01(s * 0.68), clamp01(0.45 + (l - 0.5) * 0.76)],
    // round 47 (2026-09-23, owner: "ground patterns are too black"): without this the sourced-texture resolver fell
    // through to Verdant — photo grass/dirt and raw near-black Rock058 in place of the sandstone strata above
    sourcedPalette: 'titan_gorge',
    // round 47 (2026-09-23): tintB 0.71/0.54/0.45 (luma ×0.58 in the dark patches) → same ochre hue (18°), every
    // channel ≥ 0.78 (luma ×0.83) — the patches stay darker than the shelves without going black
    tintA: [1.10, 0.88, 0.69], tintB: [0.90, 0.82, 0.78], tintC: [1.06, 0.84, 0.67],
    roadTint: [0.78, 0.61, 0.51], strata: 0.22, sandMacro: 0.82,
    // round 49 (owner audit 2026-09-23, "smooth beige ridge faces without strata"): the ring's 35–47° faces past the edge
    // become the bedded landform rock (default band 0.22–0.48 left them the wall-projected sand set)
    ringRockSlope: [0.15, 0.36],
    // ground lane (wave 65, e-wall-300: "an identical yellow outline traced along every ledge and crest"): the ring's
    // ledges and tops from 16 m above the square's highest ground are the walls' caprock, not sand (the low hills in
    // front stay the sand they are)
    ringCaprockM: 16,
    rippleAmp: 0.20, midRelief: 0.92, midReliefFar: 840,
  },
  vegetation: {
    // the map-revival lane (2026-10-05): the slots and their placement stay (their trunks, concealment and the pacing
    // that rests on them); Monument Valley's look comes from the trees' biome row (treeBiomes.ts: Utah juniper for the
    // cedar and acacia slots, pinyon for the oak, sagebrush for the scrub). The bunchgrass is cured straw: the gauntlet's
    // wave 93 read the default tufts as "lime-green tufts evenly over orange sand", a cartoon desert (Redrock's tones),
    // and the scrub takes the desert's dusty sage
    species: ['cedar', 'acacia', 'oak'], clusterMix: [['cedar', 0.42], ['acacia', 0.36], ['oak', 0.22]],
    loneMix: [['acacia', 0.46], ['cedar', 0.34], ['oak', 0.20]], rimMix: [['cedar', 0.48], ['acacia', 0.34], ['oak', 0.18]],
    // (Titan round 2, the ground lane's wave-115 finding: Monument Valley's bunchgrass is sparse — 0.22 -> 0.12)
    // (Titan round 3c: the round-3 buttes' taller rock deepened the 30 m hollows the arid groves seat in and re-seated
    // them 1266 -> 1424 trees, their alpha-tested shadows most of round 3's chase cost (h15 with the head's overcast:
    // +1.2 ms p25); 16 -> 14 groves brings the valley back to 1189, Monument Valley's sparse juniper)
    clusterCount: 14, loneCount: 34, rimCount: 18, grassDensity: 0.12,
    // (Titan round 3: no juniper stand on a butte's cap — a clump of trees on top read as a stump with a wig, and
    // Monument Valley's caps are bare caprock; the discs cover each cap and wall, the talus below keeps its trees)
    avoid: [{ x: -188, z: -120, r: 23 }, { x: 188, z: 120, r: 23 }, { x: -140, z: 280, r: 20 }, { x: 140, z: -280, r: 20 },
      { x: -12, z: -300, r: 14 }, { x: 12, z: 300, r: 14 }],
    clusterScrub: 1.7, bushCount: 0.46, bushSpecies: 'oak',
    grassTexTone: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.5), clamp01(l * 0.95 + 0.10)],
    tuftTone: (h: number, s: number, l: number) => [0.10, 0.24, clamp01(l * 0.70 + 0.12)],
    palettes: { oak: desert.vegetation.palettes.oak },
  },
  props: {
    // the map-revival lane (2026-10-05): the Navajo Nation's Monument Valley kit (maps/regional/navajo.ts)
    architecture: 'navajo',
    plan: [
      'caravanserai', 'compound', 'depot', 'ruin', 'marketRow', 'watertower',
      'adobe', 'compoundSouk', 'factory', 'ruin', 'containerRow', 'minaret',
      'depot', 'warehouse', 'compound', 'ruin', 'gantry', 'marketRow',
      'caravanserai', 'adobe', 'watertower', 'ruin', 'factory', 'depot',
      'containerRow', 'compoundSouk', 'warehouse', 'ruin',
    ],
    destructibleBuildings: ['deserttent', 'motorpool', 'commandtent', 'checkpointhut'],
    tacticalBeats: [
      { id: 'western-switchback', role: 'brawl', x: -300, z: 150, yawDeg: -6,
        structure: 'motorpool', redoubt: true, outcrop: { count: 9, radius: 13, scaleMax: 4.2 }, wreck: true, wreckOffsetZ: -18 },
      { id: 'dry-river-camp', role: 'scout', x: 18, z: -210, yawDeg: 18,
        structure: 'deserttent', outcrop: { count: 6, radius: 10, scaleMax: 3.1 } },
      { id: 'eastern-shelf-battery', role: 'support', x: 300, z: 150, yawDeg: 7,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.8 }, wreck: true, wreckOffsetX: 18 },
    ],
    // the town stands as PR #9's head seated it (the owner's town-plan ruling, 2026-10-03), whatever the redesigned ground
    townPlan: TOWN_PLANS.titan_gorge,
    // and its light buildings (the huts, tents and motor pools) stand where that build placed them too
    townLightPlan: TOWN_LIGHT_PLANS.titan_gorge,
    // its five buildings that stand in a carriageway move by the least distance that clears it; the rest stay put
    roadBuildingClearance: true,
    blockFill: true, wallStyle: 'adobe', wallStoneChance: 0.18,
    buildingLat: [16, 6], sideSkip: 0.08, spacingPad: 3.0, maxSpread: 4.0,
    wallRuns: [
      [-310, -146, -214, -112, 2], [-304, 138, -206, 172, 3],
      [206, -146, 306, -112, 3], [204, 138, 302, 174, 2],
      [-148, 260, -44, 290, 3], [64, -284, 168, -250, 2],
      [-338, 42, -292, 96, 1], [298, -84, 342, -28, 4],
    ],
    well: true, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 342, outcrops: 92, craters: 82, rubblePiles: 34,
    hedgehogs: 24, sandbagLines: 26,
    // the map-vehicles lane (2026-10-06, the period ruling): the American West in the 1960s: the M60A1, M48, M551
    // and M47
    tankWrecks: { era: 'cold-war', count: 8, debris: true, ids: ['m60a1', 'm48', 'm551_sheridan', 'm47_patton'] },
    inhabit: {
      stalls: 3, benches: 1, coreClutter: 24, drums: 14, pots: 7,
      trucks: 8, jeeps: 6, drumClusters: 8, camps: 6, modernClutter: 30,
      roadFence: 'fencerail', yardFence: 'fencewattle',
    },
  },
  horizon: {
    // (the map-revival lane, 2026-10-05, Titan round 2; gauntlet wave 104: "continuous pointed, smoothly sloped mauve
    // mountains wall the valley ... Monument Valley's isolated, flat-capped, sheer-walled buttes standing apart on an
    // open plain"): the far country beyond the ring's tables becomes sheer, flat-topped massifs standing out of the
    // plain with the sky between them ('jebel'). (A lower ring loses the escarpment's cliffs: at amp 1.0-1.2 the far
    // rise keeps no tiered column, so the ring's own tables stay at 2.15.)
    baseHex: 0x7d3f2c, amp: 2.15, style: 'mesa', treeline: 0.03,
    // (Titan round 3, gauntlet wave 119: the backdrop still read as "alpine peaks and domes rather than isolated
    // flat-capped mesas": the far country's jebels lose their Wadi Rum bosses and deep flutes — level caps to a
    // sharp rim (0.95 of the wall's foot), a sheer wall, five shallow grooves, and the Organ Rock talus a third of
    // the height)
    panorama: { regional: 'jebel', jebelBossM: 0, jebelRim: 0.95, jebelFlutes: 5, jebelFluteDepth: 0.15, jebelApron: 0.33,
      jebelFoot: 0.62, jebelM: 420, jebelRadiusM: 620, jebelShare: 0.55, jebelFootVary: 0.08 },
    // (Titan round 3: the ring's tables stood as tiered cones, a stair of thin beds (26-50 m) each a short cliff over
    // a talus bench. Monument Valley's walls are one bed: the De Chelly sandstone a sheer cliff 100-200 m high over
    // the Organ Rock shale's concave talus slope, the Shinarump caprock a sharp rim. Thick beds (110-150 m) whose
    // cliff takes a sixth to a quarter of each bed's input range stand the tables up as single sheer walls on concave
    // aprons, and their caps at a few bed tops; the beds barely dip, and the rims meander less)
    escarpment: { bedM: [110, 150], cliffShare: [0.16, 0.26], talusRise: 0.34, talusCurve: 3.0, dipPerKm: 10, meanderM: 36, meanderWavelengthM: 360 },
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): authored strata for the orange sandstone
    // walls (the style default 0.16 gave the canyon's own bedded rock the faintest beds of any mesa ring)
    banding: 0.24,
    forestHex: 0x4d3829, rockHex: 0xa74f32, haze: 0.82, grain: 0.68,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  // 2026-10-04 (its establishing view: a blue hole in a deck its lighting runs at overcast 1.00): a dense overcast is
  // closed — coverage 1 at the map, as Whiteout's stratus (the regime row's 0.96 left the broad field's gaps open)
  // (the map-revival lane, 2026-10-05, Titan round 2: Monument Valley's sky is mostly clear, the critics' wave 104 read
  // the closed deck as "a flat grey overcast"; the fair-weather cumulus regime, whole)
  clouds: { regime: 'fair-weather-cumulus' },
  sky: {
    sunElevationDeg: 34, sunAzimuthDeg: 126, turbidity: 6.2, rayleigh: 1.15,
    mieCoefficient: 0.008, mieDirectionalG: 0.84, fogDensity: 0.00046,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the haze a step cooler than the 0xffc89b sun
    // (0xb88970 -> 0xb3a698: sun and haze sat in one ochre family and read as a single wash), broken altocumulus
    // (0.68 / 0.30 -> 0.82 / 0.52) on an explicit 860 m deck that keeps its texture at 2-12°, and patchy light over
    // the canyon (cloudShadowAmp 0.30)
    fogTintHex: 0xb3a698, fogMix: 0.49, envIntensity: 0.18,
    cloudOpacity: 0.82, cloudOpacity2: 0.52, cloudTintHex: 0xffe0c7,
    cloudAltM: 860, cloudHazeK: 0.00013, cloudUvM: 2800, cloudShadowAmp: 0.30,
    sunIntensity: 4.15, sunColorHex: 0xffc89b, hemiIntensity: 0.28, postExposure: 0.93,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xaa8161 },
  },
  minimap: {
    base: [132, 70, 47], hard: [137, 91, 65], soft: [102, 57, 43],
    forest: 'rgba(74,61,35,.58)', forestStroke: 'rgba(50,38,24,.78)',
    water: 'rgba(58,73,75,.48)', waterStroke: 'rgba(38,47,49,.68)',
    roadCasing: 'rgba(64,35,26,.96)', roadFill: 'rgba(187,119,83,.96)', buildingFill: '#d1aa82',
  },
  shot: { pos: [-286, 58, -246], look: [38, 6, 68] },
} satisfies import('./contracts.ts').MapCompositionConfig;
