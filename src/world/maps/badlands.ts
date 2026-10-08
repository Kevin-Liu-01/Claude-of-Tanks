// src/world/maps/badlands.ts — Redrock Divide, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The canyon (src/world/redrockCanyon.ts: its oblique axis, unequal walls, side ravines and closed heads), the outpost,
// the five tracks, the palette, sky, vegetation, name and id are the map's identity and stay; the battlefield on the
// canyon floor is new. The old floor was one open lane 420 m wide. Its sightlines ran long (19 % of the blocked rays
// at 300 m or more), the middle third had 24 % cover, and three solid props stood in the tracks. Alpha deployed in the
// south-west corner of the mouth, and the 2v2 pacing receipt's seed 32002 ended in 105 s.
//
// Reference: Wadi Rum in southern Jordan: a broad sand valley between sheer sandstone jebels, with domed inselbergs
// standing free on the valley floor, sand ramps banked against the walls, and siqs cutting through to the next valley.
//
// The story on the ground: the outpost stands at the centre of the floor where the valley track crosses it, a walled
// depot round a square. Two tracks run along the wall toes, and two cross tracks leave through the side ravines.
// Inselbergs stand on the floor. A gate dome in front of each deployment hides it from the other, and a pair of domes
// on each side of the outpost stands between the tracks, so the floor splits into a west lane, the outpost lane and an
// east lane. Dune ridges and sand ramps give hull-down ground in the open. The floor's layout turns through 180 degrees
// about the outpost (8, 0): alpha deploys in the south mouth, bravo in the north mouth, and every inselberg, ridge,
// strongpoint, floor track and objective has its counterpart. The canyon walls and their ravines keep their own shapes.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// The floor's layout turns through 180 degrees about the outpost (8, 0): every feature has its counterpart.
const pair = <T extends { x: number; z: number }>(form: T): T[] => [form, { ...form, x: 16 - form.x, z: -form.z }];
// a bar's counterpart turns with it, so a tapered ramp's high end still meets its own wall
const pairBar = <T extends { x: number; z: number; yawDeg: number }>(form: T): T[] =>
  [form, { ...form, x: 16 - form.x, z: -form.z, yawDeg: form.yawDeg + 180 }];
// The scenery lane (2026-10-03): Redrock's scenery stone in the terrain's own sandstone (sRGB HSL; the terrain's rock
// reads hue 0.03-0.05, saturation 0.22, lightness 0.5-0.57 lit): the domes' beds, the ledges and the cairns read as one
// rock with the walls they stand on, not as darker, redder cladding.
const WADI_RUM_STONE = [0.045, 0.32, 0.52] as const;

export default {
  id: 'badlands',
  name: 'Redrock Divide',
  blurb: 'An eroded red-rock canyon shelters a fortified desert logistics outpost',
  terrain: {
    // One regional drainage system defines the playable silhouette. Original
    // seeded detail is subordinate; random mesas and a closed square rim are off.
    redrockCanyon: true, hillScale: 0.24, microScale: 0.40, rimH: 0,
    dunes: { amp: 0.7 }, mesas: null, marshes: [],
    roads: { paths: [
      // The west and east tracks along the wall toes, the valley track through the outpost and the floor courses of
      // the two cross tracks are each other's rotation about the outpost; the cross tracks leave through the ravines.
      [[-432, -452], [-254, -292], [-206, -92], [-182, 112], [-190, 306], [-210, 470]],
      [[-188, -466], [-104, -306], [-28, -150], [8, 0], [44, 150], [120, 306], [204, 466]],
      [[226, -470], [206, -306], [198, -112], [222, 92], [270, 292], [448, 452]],
      [[-362, 182], [-240, 170], [-150, 236], [-2, 202], [148, 232], [272, 194]],
      [[-286, -214], [-132, -232], [18, -202], [166, -244], [304, -198]],
    ] },
    // The outpost's square and a vehicle park in each flank lane, on the line of equal distance between the
    // deployments: level aprons the zone-control placement seats its 30 m discs on.
    hardstands: [
      { x: 8, z: 0, width: 60, length: 60, yawDeg: 0, grade: 0 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): tilted 7 % down to the east with its ground
      { x: -122, z: 21, width: 60, length: 60, yawDeg: -87, level: 6.2, grade: 0.07 },
      { x: 138, z: -21, width: 60, length: 60, yawDeg: 0, grade: 0 },
    ],
    village: { x0: -96, x1: 112, z0: -86, z1: 106, cx: 8, cz: 0, feather: 40, flatten: 0.76, relief: 0.16 },
    landforms: [
      // The inselbergs: sandstone jebels on the floor, each a main massif and a lower lobe (landformGeology.ts
      // 'inselberg' with a rim, after gauntlet wave 16's "rounded loaf-shaped mounds": a nearly level cap broken into
      // rounded bosses, a sheer fluted wall over most of the height whose foot wanders round the massif, deep clefts
      // biting back into the cap's edge, talus fans spreading from the clefts' mouths over a concave apron, knobbly
      // rock, and a boulder apron of fallen blocks only at the foot), and a sand ramp banked against one flank. The gate pair screens each deployment from
      // the other, 26 m further out than the batch-1 domes so that Frontline Assault's third sector (85 % of the way)
      // lies on the floor in front of the north gate, not on its face; the lane pairs stand between the tracks on the
      // slices at 35 and 65 % of the way, where they split the floor into three lanes.
      ...([
        [-40, -318, 36, 30, 26, -8, -326, 22, 18, null], // gate (no ramp: the frontline's sector lines run past it)
        [-118, -128, 34, 40, 24, -140, -98, 20, 24, -70], // west lane, its ramp to the south
        [96, -112, 34, 40, 24, 118, -140, 20, 24, 110], // east lane, its ramp to the north
      ] as [number, number, number, number, number, number, number, number, number, number | null][])
        .flatMap(([x, z, rx, rz, height, lx, lz, lrx, lrz, rampDeg]) => {
        const ramp = (rampDeg ?? 0) * Math.PI / 180, reach = Math.max(rx, rz) * 0.55 + 34;
        // (the Redrock lane, 2026-10-07, owner: "redrock is really rough"; the domes read as cakes with spikes) the massif
        // and its lobe stand as one rock (`union`: their heights' maximum — their sum stood a horn where the lobe's cap met
        // the massif's wall), the cap breaks into beehive domes (more, taller bosses) where the knobbly relief (rough 1.3)
        // read as lumps, and the fans spread a short apron where 2.6 m spokes radiated from every rill
        return [
          ...pair({ kind: 'knoll', x, z, rx, rz, height, corridorScale: 1, union: true, geology: { profile: 'inselberg' as const,
            outline: 0.18, foot: 0.66, footVary: 0.14, apron: 0.18, rim: 0.86, bosses: { count: 7, heightM: 7 },
            flutes: { count: 18, depth: 0.5 }, rough: 0.45, boulders: 24,
            gullies: { count: 10, depthM: 4.5, width: 0.35 }, fans: { reach: 0.22, heightM: 1.1 } } }),
          ...pair({ kind: 'knoll', x: lx, z: lz, rx: lrx, rz: lrz, height: Math.round(height * 0.65), corridorScale: 1, union: true,
            geology: { profile: 'inselberg' as const, outline: 0.2, foot: 0.62, footVary: 0.16, apron: 0.2, rim: 0.84,
              bosses: { count: 4, heightM: 4.5 }, flutes: { count: 12, depth: 0.5 }, rough: 0.4, boulders: 12,
              gullies: { count: 6, depthM: 3, width: 0.35 }, fans: { reach: 0.22, heightM: 0.8 } } }),
          // the sand ramp: wind-blown sand banked against the wall, falling away from it
          ...(rampDeg === null ? [] : pairBar({ kind: 'ridge', x: x + Math.cos(ramp) * reach, z: z + Math.sin(ramp) * reach,
            length: 72, width: 26, height: 7, yawDeg: rampDeg, geology: { outline: 0.22, taper: 0.92, rough: 0.25 } })),
        ];
      }),
      // Sand ramps banked against the wall toes and dune ridges across the floor: hull-down ground in the open
      ...[[-150, -300, 120, 30], [-170, 20, 110, 80], [-20, -40, 90, 40], [110, -310, 100, 20],
        [-196, -130, 80, 10], [150, -330, 90, 60],
      ].flatMap(([x, z, length, yawDeg]) => pair({ kind: 'ridge', x, z, length, width: 34, height: 4.2, yawDeg })),
    ],
  },
  spawns: {
    // Alpha deploys in the south mouth behind its gate dome; bravo's seven pads are an arc in the north mouth behind
    // the other, its centroid the rotation of alpha's pad about the outpost. 795 m between the anchors.
    player: { x: -56, z: -392 },
    enemies: [
      { x: 71, z: 394 }, { x: 21, z: 384 }, { x: 123, z: 384 }, { x: -25, z: 366 },
      { x: 169, z: 366 }, { x: 47, z: 426 }, { x: 99, z: 426 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.075, 0.39, clamp01(0.19 + l * 0.78)],
    dirtTone: (h: number, s: number, l: number) => [0.055, 0.43, clamp01(0.24 + l * 0.48)],
    // Broad weathered beds, not high-contrast repeated marker stripes.
    // (the Redrock lane, 2026-10-07, owner: "redrock is really rough"; the walls, domes and far jebels read mauve, the
    // sandstone tile desaturated to a fifth) Wadi Rum's sandstone is red-orange: the tile keeps its saturation and more
    sandstone: true, rockTone: (h: number, s: number, l: number) => [0.036, clamp01(s * 1.35), clamp01(0.31 + (l - 0.45) * 0.42)],
    tintA: [1.10, 0.88, 0.69], tintB: [0.71, 0.54, 0.45], tintC: [1.06, 0.84, 0.67],
    // (ground lane, wave 62: "smooth, plaster-like … identical wavy dark squiggles … a stamped pattern rather than
    // sandstone" — the squiggles were the tile's marker beds and partings, repeating every 6.45 m up each wall) the
    // bedding is the material's, at the wall's scale: a few thick beds of unequal tone, rust beds 2–5 m thick, joint
    // blocks stepping their weathering along the face and varnish under the ledges (strata 0.12: six tenths of the
    // joints, as Copper Mesa's), and the tile keeps its grain and broad beds without the stamped lines
    // (the Redrock lane: the walls are sheer now, so the beds, joints and varnish the material draws on cliffs show; Titan
    // and Skybridge run 0.22 and 0.18)
    roadTint: [0.78, 0.61, 0.51], strata: 0.16, sandstoneMarkers: 0, sandMacro: 0.9,
    // Wadi Rum's two formations: the Umm Ishrin's red-brown cliffs, and over them the Ordovician Disi sandstone, pale cream,
    // weathered into the domes and beehives on the jebels' tops (the far jebels draw the same, horizonPanorama.ts v3b).
    // (The Redrock lane, 2026-10-07: the contact at y 98 — the east wall's highest beehives and the canyon heads' upper
    // storeys a warm cream, the walls and the floor's inselbergs red-brown below it; the ground lane's first pass had the
    // order inverted, a pale band at every foot that read as concrete)
    formation: { atFrac: 0.9, atY: 98, wobbleM: 4, lowerTint: [1.42, 0.97, 0.74, 0.12], upperTint: [1.95, 1.60, 1.08, 0.8],
      edgeM: 3 },
    // (the Redrock lane: the domes' caps, the walls' benches and the jebels' tops are bare rock — the floor, the dunes and
    // the ramps lie below 13 m, the Disi bench at 10-16 m, the domes' caps at 20-38 m)
    caprockY: [13, 16],
    // (the Redrock lane: the faces keep their joints and varnish under the map's own sun, a head-on light included)
    wallWeather: [0.45, 0.95],
    // An alluvial wash has faint wind-scoured patches, not floor-wide dunes. (The Redrock lane, 2026-10-07, owner: "redrock
    // is really rough"; the floor's mid-ground read as leopard spots: the mid-relief dapple's 59 m octave lays 1-5 m bump
    // spots that a 30-degree sun turns into a dark blotch field — uMidRelief 0 cleared it in the PR's own renderer,
    // uSandMacro 0 changed nothing. A trace of its broad roll stays; the wind's ripples carry the sand's grain.)
    rippleAmp: 0.22, midRelief: 0.12, midReliefFar: 780,
  },
  vegetation: {
    species: ['acacia', 'cedar', 'oak', 'palm'], clusterMix: [['acacia', 0.48], ['oak', 0.30], ['cedar', 0.17], ['palm', 0.05]],
    loneMix: [['acacia', 0.54], ['oak', 0.28], ['cedar', 0.14], ['palm', 0.04]], rimMix: [['cedar', 0.45], ['acacia', 0.35], ['oak', 0.20]],
    // Trees round 2b (2026-10-03, the gauntlet's wave 15: "lush green groves on Wadi Rum"): Wadi Rum's floor carries a
    // few wide-spaced acacias in the wadi beds and hollows, not groves; six open groves (vegetation.ts treeBiomeArid
    // seats them in the low ground), twenty lone trees in the beds, a thin sward on the sand. Was 24 / 46 / 0.38.
    clusterCount: 6, loneCount: 20, rimCount: 30, grassDensity: 0.08,
    clusterScrub: 1.5, bushCount: 0.74, bushSpecies: 'oak',
    // the palms grow at the springs under the lane inselbergs' west and east feet only (the pair turns about the
    // outpost); a palm drawn anywhere else grows as an acacia
    palmSites: pair({ x: -166, z: -148, r: 24 }), palmFallback: 'acacia',
    // (the Redrock lane, 2026-10-07: no tree on a dome's cap or a jebel's top — the floor, the ramps and the dunes lie
    // under 15 m, the domes' caps over 22 m)
    treeCeilingY: 16,
    // ground lane (2026-10-03, the gauntlet's wave 4: "saturated green grass cards" on the red floor): the wadi's tufts
    // are cured straw, as Sirocco's are. Trees round 4 (2026-10-04, the gauntlet's wave 50: "olive reed tufts", "flat,
    // uniformly saturated billboards"): Wadi Rum's tussocks are sun-bleached — a pale buff, a third of the straw's
    // saturation left in the card and half in the tint, lighter
    // (the Redrock lane, 2026-10-07: those read as white plastic spikes on the orange sand — the tussocks are a dry buff
    // straw, darker than the sand they stand in)
    grassTexTone: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.42), clamp01(l * 0.62 + 0.14)],
    tuftTone: (h: number, s: number, l: number) => [0.095, 0.30, clamp01(l * 0.45 + 0.22)],
    // (the Redrock lane: the floor's stones were an even strew of round dark lentils under every view — the wadi's sand is
    // clean between its gravel patches, so a third of the strew; the stones keep the sandstone's own red)
    litter: { density: 0.4, clods: 0.25, splinters: 0, stoneTint: [0.20, 0.115, 0.075] },
  },
  props: {
    // regional-buildings lane: the Wadi Rum outpost kit (maps/regional/wadirum.ts)
    architecture: 'wadirum',
    plan: ['caravanserai', 'depot', 'warehouse', 'compoundSouk', 'factory', 'minaret',
      'adobe', 'ruin', 'containerRow', 'marketRow', 'watertower', 'depot', 'gantry', 'compound',
      'warehouse', 'adobe', 'compoundSouk', 'depot', 'containerRow', 'ruin', 'factory', 'marketRow',
      'compound', 'watertower', 'warehouse', 'gantry'],
    destructibleBuildings: ['deserttent', 'motorpool', 'quonsethut', 'checkpointhut'],
    // (the scenery lane, b16; gauntlet wave 121 on the steel checkpoint hut, "a jarring modern blue shed") the fuel points'
    // and the scattered checkpoints are desert posts of plastered mud brick (maps/regional/ksarGate.ts), same footprint
    structureVariants: { checkpointhut: 'ksargate' },
    // Three strongpoint pairs, each the other's rotation about the outpost: a cistern yard in each flank lane, a
    // lookout in front of the outpost on each side, and a fuel point by each deployment's flank track.
    tacticalBeats: [
      { id: 'west-lane-cistern', role: 'brawl', x: -165, z: -60, yawDeg: 90,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.5 }, wreck: true, wreckOffsetX: -16 },
      { id: 'east-lane-cistern', role: 'brawl', x: 181, z: 60, yawDeg: 270,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.5 }, wreck: true, wreckOffsetX: 16 },
      { id: 'south-butte-lookout', role: 'scout', x: 0, z: -160, yawDeg: 10,
        structure: 'deserttent', outcrop: { count: 5, radius: 9, scaleMax: 2.8 } },
      { id: 'north-butte-lookout', role: 'scout', x: 16, z: 160, yawDeg: 190,
        structure: 'deserttent', outcrop: { count: 5, radius: 9, scaleMax: 2.8 } },
      { id: 'southwest-fuel-point', role: 'support', x: -180, z: -250, yawDeg: 30,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: 15 },
      { id: 'northeast-fuel-point', role: 'support', x: 196, z: 250, yawDeg: 210,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: -15 },
    ],
    blockFill: true,
    wallStyle: 'adobe', wallStoneChance: 0.12, buildingLat: [11, 6], sideSkip: 0.1,
    // The outpost's perimeter walls at its four corners, open where the tracks come in.
    wallRuns: [
      [-96, -86, -40, -86, 3], [-96, -86, -96, -30, 3], [56, 86, 112, 86, 3], [112, 30, 112, 86, 3],
      [60, -86, 112, -86, 2], [112, -86, 112, -40, 2], [-44, 86, -96, 86, 2], [-96, 40, -96, 86, 2],
    ],
    well: true, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 264, outcrops: 58, craters: 74, rubblePiles: 22,
    // (the talus law, landformGeology.ts restsOnTalus, began here: gauntlet wave 48 saw "two low-poly orange boulders
    // hanging on its face" in all four of its Redrock frames; 278 of the map's 931 boulders hung on a wall, a ledge's lip
    // or a narrow bench. The law is every map's default since 2026-10-04: rockTalusDeg names another angle)
    hedgehogs: 22, sandbagLines: 24,
    // (the Redrock lane, 2026-10-07: the fallen blocks are the walls' red-brown sandstone, where the lithology's base drew a
    // grey-pink — "pillows" against the red cliffs)
    rockTone: (h: number, s: number, l: number) => [0.036, 0.40, clamp01(0.33 + (l - 0.3) * 0.8)],
    // (the Redrock lane, 2026-10-07: a pillbox stood in the west spring's palms, three trunks through its roof)
    pillboxClearOfTrees: true,
    tankWrecks: { era: 'modern', count: 7, debris: true,
      ids: ['merkava3d', 'k2', 'merkava4b', 'm60a3', 'ariete', 't72b3m', 'm1a2_sepv3'] },
    inhabit: {
      stalls: 4, benches: 2, coreClutter: 26, drums: 12, pots: 7,
      trucks: 7, jeeps: 5, drumClusters: 8, camps: 5, modernClutter: 28,
      roadFence: 'fencerail', yardFence: 'fencewattle',
    },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): Wadi Rum's sandstone. Bedded
  // ledges, scree and the odd pedestal rock break out round the foot of every inselberg; a mushroom rock (a hoodoo,
  // its cap on a wind-cut pedestal) stands in the open floor of each mouth; a rujm, the Bedouin cairn, marks each cross
  // track where it leaves for its ravine. Turned through 180 degrees about the outpost like the rest of the floor.
  scenery: {
    // (the ledges keep to the talus round each dome, the talus law's default 35 degrees: eight of their 30 formations stood
    // on a wall or its lip and each field draws its next candidate instead; the mountains lane, 2026-10-04, wave 48)
    // (the bedrock skin on the inselbergs is parked: wave 16's critics read a skin on the jebels' smooth domes as
    // masonry, "a ziggurat"; the domes' shape is the landform's — world/sceneryRocks.ts buildBedrock stays, unplaced)
    rocks: [
      { form: 'hoodoo', geology: 'sandstone', tone: WADI_RUM_STONE, x: 70, z: -330, radius: 3.4, height: 7, yawDeg: 30, name: 'the south mushroom rock' },
      { form: 'hoodoo', geology: 'sandstone', tone: WADI_RUM_STONE, x: -54, z: 330, radius: 3.4, height: 7, yawDeg: 210, name: 'the north mushroom rock' },
    ],
    rockFields: [
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: -40, z: -318, radius: 58, count: 5, slopeBias: 0.85, size: [2.5, 5.5], forms: [['outcrop', 0.6], ['scree', 0.3], ['hoodoo', 0.1]], name: 'the ledges round the south gate dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: 56, z: 318, radius: 58, count: 5, slopeBias: 0.85, size: [2.5, 5.5], forms: [['outcrop', 0.6], ['scree', 0.3], ['hoodoo', 0.1]], name: 'the ledges round the north gate dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: -118, z: -128, radius: 58, count: 5, slopeBias: 0.85, size: [2.5, 5.5], forms: [['outcrop', 0.6], ['scree', 0.3], ['hoodoo', 0.1]], name: 'the ledges round the south-west lane dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: 134, z: 128, radius: 58, count: 5, slopeBias: 0.85, size: [2.5, 5.5], forms: [['outcrop', 0.6], ['scree', 0.3], ['hoodoo', 0.1]], name: 'the ledges round the north-east lane dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: 96, z: -112, radius: 58, count: 5, slopeBias: 0.85, size: [2.5, 5.5], forms: [['outcrop', 0.6], ['scree', 0.3], ['hoodoo', 0.1]], name: 'the ledges round the south-east lane dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: -80, z: 112, radius: 58, count: 5, slopeBias: 0.85, size: [2.5, 5.5], forms: [['outcrop', 0.6], ['scree', 0.3], ['hoodoo', 0.1]], name: 'the ledges round the north-west lane dome' },
    ],
    landmarks: [
      { kind: 'cairn', x: -270, z: -228, scale: 1.6, height: 1.6, geology: 'sandstone', tone: WADI_RUM_STONE, name: 'the rujm at the south ravine' },
      { kind: 'cairn', x: 286, z: 228, scale: 1.6, height: 1.6, geology: 'sandstone', tone: WADI_RUM_STONE, name: 'the rujm at the north ravine' },
    ],
  },
  horizon: {
    // Round 29 (owner 2026-09-20, "see where the texture just stops"): treeline 0.06 let the vista paint every
    // outland surface under 8 m — the canyon-mouth floors past both deployment ends — as dark woodland (green
    // before the absolute tints, dark brown after). Redrock's outland is sand and rock; no ring forest.
    // the mountains lane (2026-10-03, gauntlet waves 15 and 24): Wadi Rum's far country — sheer jebels standing alone on
    // the sand plain, each maps lane A's inselberg section with a rim (a bossed cap, a fluted wall over most of the height,
    // a short talus apron), where the regional 'jebel' of mesa tables read as "low rounded swells"
    // (the Redrock lane, 2026-10-07, the coordinator: the far jebels read as "cardboard cutouts in a row" — the bake's air
    // at 0.8 of the law's σ, so the massifs at 3-8 km recede by their distances instead of standing equally crisp)
    baseHex: 0x7a4936, amp: 1.36, style: 'mesa', treeline: 0, ground: 'sand', banding: 0.045, panorama: { regional: 'jebel', air: 0.8, fillLaw: 1 },
    // (the outland boulders a shade sparser: they follow the ring's drained faces, and the map's horizon draws no more
    // triangles than before the mountains lane's relief work)
    outlandRocks: 0.95,
    forestHex: 0x58402f, rockHex: 0x96533b, haze: 0.92, grain: 0.58,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cumulus-humilis', coverage: 0.18, cirrus: 0.35, virga: 0.9 },
  sky: {
    sunElevationDeg: 30, sunAzimuthDeg: 116, turbidity: 7.2, rayleigh: 1.05,
    // 2026-10-03 (the skies lane, agreed with the mountains lane: one haze law from the camera to the far country, the map's fogDensity its one lever): arid air is clear — 0.00025 on the four arid maps (a meteorological range near 37 km; a ridge 300 m up at 7.5 km keeps about 60 % of its contrast) (was 0.00058)
    mieCoefficient: 0.0095, mieDirectionalG: 0.86, fogDensity: 0.00025,
    fogTintHex: 0xb18b77, fogMix: 0.56, envIntensity: 0.17,
    cloudOpacity: 0.62, cloudOpacity2: 0.26, cloudTintHex: 0xffe4cb,
    sunIntensity: 4.25, sunColorHex: 0xffd4ad, hemiIntensity: 0.25, postExposure: 0.92,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xaa8161 },
  },
  minimap: {
    base: [137, 81, 59], hard: [124, 91, 72], soft: [105, 69, 54],
    forest: 'rgba(83,64,39,.62)', forestStroke: 'rgba(58,40,28,.8)',
    water: 'rgba(70,74,72,.5)', waterStroke: 'rgba(45,48,47,.7)',
    roadCasing: 'rgba(67,42,32,.94)', roadFill: 'rgba(190,137,104,.96)', buildingFill: '#d6b294',
  },
  shot: { pos: [-236, 48, -226], look: [38, 5, 54] },
} satisfies import('./contracts.ts').MapCompositionConfig;
