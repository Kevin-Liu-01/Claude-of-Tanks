// A crescent oasis west of the town creates a short wet cut, an exposed
// caravan road and a long dune-back flank. Reuses only the desert materials.
//
// Reference (the map-revival lane, 2026-10-05): Siwa, in Egypt's Western Desert below the Qattara Depression: the
// springs and their salt lakes, the palm gardens walled in mud, and the old town of Shali, its kershef houses (salt-
// crusted mud and rock) heaped up a hill in rounded, battered blocks. The settlement stands where the plan seats it in
// the siwa variant of the ksar kit (maps/regional/ksar.ts): the kershef houses with their palm-beam ends, shuttered
// windows and plank doors; old Shali's blocks of one to three storeys heaped together on the compound plots; the
// mosque's tapering mud minaret and a watch tower; the spring in its stone rim with the café's palm-rib shelter; the
// souk's stalls under their palm-rib mats; the melted ruins of the old town.
import desert from './desert.ts';
import { roundRoadBends } from './roadBends.ts';
import { talusFan } from './geology.ts';

// Oasis round 3 (the map-revival lane, 2026-10-07; gauntlet wave 135: "a sparse scatter of small white boxes isolated on
// open dune sand along wide empty roads, with no dense heaped Shali core, no mud-walled garden plots and no palm
// groves"): Siwa authored lot by lot — old Shali heaped north of the caravan street (its blocks packed a metre apart,
// its houses round the heap, the minaret), the new town and the souk on the cross road, the two springs, and the walled
// palm gardens between the springs and the town; the roadside plan is gone (.qa-dev/town-plan.mjs: every footprint 34 m
// or more off a zone's centre and clear of the beats, 5 m or more off a road's line, on ground level to 1.7 m)
const SIWA_TOWN = [
  // old Shali heaped north of the caravan street's dog-leg: the minaret first, the heaped blocks of the old town (a
  // compound or caravanserai plot is a cluster of kershef houses), its houses round the heap's edge
  { structure: 'minaret', x: 126, z: 112, yawDeg: 0 }, { structure: 'compound', x: 100, z: 80, yawDeg: 0 },
  { structure: 'caravanserai', x: 124, z: 78, yawDeg: 0 }, { structure: 'compound', x: 112, z: 102, yawDeg: 0 },
  { structure: 'compound', x: 86, z: 104, yawDeg: 0 }, { structure: 'adobe', x: 70, z: 86, yawDeg: 90 },
  { structure: 'adobe', x: 72, z: 121, yawDeg: 0 }, { structure: 'adobe', x: 98, z: 124, yawDeg: 0 },
  { structure: 'adobe', x: 126, z: 128, yawDeg: 0 }, { structure: 'adobe', x: 84, z: 62, yawDeg: 180 },
  { structure: 'adobe', x: 110, z: 60, yawDeg: 180 },
  // the new town along the cross road: the souk's rows and stall, the market compound, houses facing the lanes, a
  // caravanserai, the watch tower; the two springs (one in the north garden); two melted houses
  { structure: 'marketRow', x: 100, z: -57, yawDeg: 180 }, { structure: 'marketRow', x: 116, z: -57, yawDeg: 180 },
  { structure: 'market', x: 130, z: -57, yawDeg: 180 }, { structure: 'compoundSouk', x: 50, z: -45, yawDeg: 90 },
  { structure: 'adobe', x: 128, z: -89, yawDeg: 0 }, { structure: 'adobe', x: 138, z: -89, yawDeg: 0 },
  { structure: 'adobe', x: 148, z: -89, yawDeg: 0 }, { structure: 'adobe', x: 158, z: -87, yawDeg: 0 },
  { structure: 'adobe', x: 145, z: -56, yawDeg: 180 }, { structure: 'adobe', x: 156, z: -55, yawDeg: 180 },
  { structure: 'adobe', x: 87, z: -22, yawDeg: -90 }, { structure: 'adobe', x: 87, z: -36, yawDeg: -90 },
  { structure: 'caravanserai', x: 150, z: -112, yawDeg: 0 }, { structure: 'tower', x: 198, z: -20, yawDeg: 0 },
  { structure: 'bathhouse', x: 180, z: -98, yawDeg: 0 }, { structure: 'bathhouse', x: 8, z: 64, yawDeg: 0 },
  { structure: 'ruin', x: 32, z: -122, yawDeg: 20 }, { structure: 'ruin', x: 184, z: -76, yawDeg: -30 },
] as const;
// the walled palm gardens between the springs and the town: G1 north of the west zone round its spring, G2 south of the
// cross road, G3 west of old Shali — each its mud wall (wallRuns) and its rows of date palms (belts, palmSites)
const SIWA_GARDENS = [
  { x0: -30, z0: 50, x1: 30, z1: 110, rows: [[-24, 78, 24, 78], [-24, 88, 24, 88], [-24, 98, 24, 98]] },
  { x0: -10, z0: -150, x1: 50, z1: -112, rows: [[-4, -120, 44, -120], [-4, -130, 44, -130], [-4, -140, 44, -140]] },
  { x0: 40, z0: 128, x1: 80, z1: 172, rows: [[48, 134, 48, 166], [58, 134, 58, 166], [68, 134, 68, 166]] },
] as const;
export default {
  id: 'oasis', name: 'Sunscar Oasis',
  blurb: 'A palm-ringed spring and caravan compounds lie between broad wind-carved dune arms',
  terrain: {
    hillScale: 0.70, microScale: 0.60, rimH: 28, dunes: { amp: 5.4 }, clearMarshVeg: true, softLakes: true,
    village: { x0: -12, x1: 230, z0: -124, z1: 134, cx: 110, cz: 0, feather: 44, flatten: 0.88, relief: 0.12 },
    roads: { paths: roundRoadBends([
      // A dog-legged caravan street slows the short town route; the souk
      // approach enters across it while the open dune bypass stays fast.
      [[30, -464], [90, -284], [122, -122], [72, -70], [72, 18], [142, 46], [156, 242], [208, 464]],
      [[-346, -460], [-300, -270], [-282, -76], [-254, 102], [-190, 286], [-100, 464]],
      [[370, -454], [326, -280], [302, -88], [302, 108], [324, 296], [356, 460]],
      [[-282, -76], [30, -100], [72, -70], [156, -74], [218, -30], [302, -88]],
      [[-314, 182], [-198, 222], [-72, 206], [66, 226], [194, 200], [334, 228]],
    ]) },
    // One asymmetric spring basin wraps a dry town-facing tongue. The broad
    // western coves and unequal tapering arms replace three circular joins;
    // the existing analytic contour also owns terrain, minimap and wetness.
    lakes: [
      { x: -161, z: 30, r: 112, depth: 0.75, level: -1.2,
        radii: [0.43, 0.58, 0.84, 0.76, 0.93, 0.86, 0.60, 0.70,
          0.61, 0.72, 0.68, 0.79, 0.75, 0.77, 0.74, 0.51] },
    ],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -334, z: 36, length: 370, width: 82, height: 8.2, yawDeg: 14 },
      { kind: 'ridge', x: 312, z: -8, length: 390, width: 90, height: 8.8, yawDeg: -12 },
      // 2026-10-03 (maps lane B): gour (geology.ts) — the two smooth dune knolls south of the cross road become the
      // flat-topped residual hills of the Saharan hamada, their caprock cut back to steep faces with scree at their
      // feet: a long mesa and a detached butte where the western knoll was, one butte where the eastern one was
      { kind: 'gorge', x: -140, z: -246, length: 150, width: 40, height: 7.0, yawDeg: -22 },
      { kind: 'gorge', x: -38, z: -286, length: 54, width: 22, height: 5.5, yawDeg: -22 },
      ...talusFan(-112, -214, -100, -186, 30, 1.4), ...talusFan(-176, -232, -186, -204, 28, 1.3),
      { kind: 'ridge', x: -24, z: 280, length: 240, width: 68, height: 6.6, yawDeg: 76 },
      { kind: 'basin', x: -114, z: 46, rx: 132, rz: 172, height: -4.0, wetScale: 0.2 },
      { kind: 'gorge', x: 246, z: -244, length: 110, width: 34, height: 6.5, yawDeg: 30 },
      ...talusFan(262, -272, 276, -298, 28, 1.3),
    ],
  },
  // (round 3b, the bots lane's swap test, fairness band 45-55 %: bravo's seven pads stood 500 m apart along the
  // northern edge, x -252 to 250, and the north won 50 of 80; bravo deploys as alpha does, a block of two rows of
  // tanks 8 m apart and 10 m between the rows, here in the middle of the northern edge: the north wins 42 of 80)
  spawns: { player: { x: 60, z: -390 }, enemies: [
    { x: 10.3, z: 393.9 }, { x: 2.3, z: 393.9 }, { x: -5.7, z: 393.9 }, { x: -13.7, z: 393.9 },
    { x: 10.3, z: 403.9 }, { x: 2.3, z: 403.9 }, { x: -5.7, z: 403.9 },
  ] },
  splat: { sourcedPalette: 'desert', ...desert.splat,
    // The spring owns this liquid layer: desert's brown dry-clay tone is
    // inappropriate here. Keep its subdued lightness with a small lift.
    // (round 2, wave 125: "water pale mineral") Siwa's spring water is a pale, milky mineral turquoise over white sand
    mudTone: (_h: number, _s: number, l: number) => [0.47, 0.28, Math.min(0.56, l * 1.5 + 0.17)],
    seaLake: true, seaFoam: 0.04, seaRamp: [0.08, 0.40], iceDrift: 0.02, marshGloss: 0.88, iceSky: [0.32, 0.54, 0.52], midRelief: 0.52, rippleDir: [0.4, 0.92] },
  vegetation: {
    grassTexTone: desert.vegetation.grassTexTone, tuftTone: desert.vegetation.tuftTone,
    species: ['palm', 'acacia', 'eucalyptus'], clusterMix: [['palm', 0.65], ['acacia', 0.3], ['eucalyptus', 0.05]],
    loneMix: [['acacia', 0.65], ['palm', 0.3], ['eucalyptus', 0.05]], rimMix: [['acacia', 0.55], ['palm', 0.35], ['eucalyptus', 0.1]],
    clusterCount: 32, loneCount: 28, rimCount: 30, grassDensity: 0.5, clusterScrub: 2.0, bushCount: 0.8, bushSpecies: 'acacia', palettes: desert.vegetation.palettes,
        // (round 2, wave 125: "dense palms") the palm rows planted close, as Siwa's gardens are
    belts: [{ x0: -208, z0: -104, x1: -218, z1: 148, gap: 13, jitter: 4, species: 'palm' }, { x0: 10, z0: -102, x1: 24, z1: 142, gap: 14, jitter: 4, species: 'palm' },
      // (round 3) the walled gardens' date palms, row on row
      ...SIWA_GARDENS.flatMap((g) => g.rows.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1, gap: 8, jitter: 1.5, species: 'palm' as const })))],
    // Trees round 2b (2026-10-03, the gauntlet's wave 15): the palms grow in the oasis only: the spring basin and its
    // banks, and the two palm rows along its east and west shores (discs every 40 m down each row); a palm drawn out
    // on the sand grows as an acacia.
    palmSites: [
      { x: -114, z: 46, r: 160 },
      // (round 3) the walled gardens
      ...SIWA_GARDENS.map((g) => ({ x: (g.x0 + g.x1) / 2, z: (g.z0 + g.z1) / 2, r: Math.hypot(g.x1 - g.x0, g.z1 - g.z0) / 2 })),
      ...[[-208, -104, -218, 148], [10, -102, 24, 142]].flatMap(([x0, z0, x1, z1]) => Array.from({ length: 8 },
        (_, i) => ({ x: x0 + (x1 - x0) * i / 7, z: z0 + (z1 - z0) * i / 7, r: 26 }))),
    ],
    palmFallback: 'acacia',
  },
  props: {
    // the map-revival lane (2026-10-05): the town is Siwa's, in the siwa variant of the ksar kit (maps/regional/ksar.ts)
    architecture: 'siwa',
    sourcedPalette: 'desert',
    // (round 3: the town authored, SIWA_TOWN above; no roadside plan)
    plan: [],
    plannedSites: SIWA_TOWN,
    // the light buildings where the town leaves room: the tent by the north garden, the command tent east, the checkpoint
    // on the caravan street's south gate, the guard post by the cross road's west end
    townLightPlan: [
      { kind: 'deserttent', x: -50, z: 150, rot: 0 }, { kind: 'commandtent', x: 205, z: 62, rot: 0 },
      { kind: 'checkpointhut', x: 100, z: -128, rot: 0 }, { kind: 'guardpost', x: -20, z: -78, rot: 0 },
    ],
    // the springs' pools grow no grass or reeds inside their rims (props.ts groundCoverHoles)
    groundCoverHoles: SIWA_TOWN.filter((t) => t.structure === 'bathhouse').map((t) => ({ x: t.x, z: t.z, r: 9 })),
    destructibleBuildings: ['deserttent', 'commandtent', 'checkpointhut', 'guardpost'],
    // 2026-10-03 (maps lane B): the roadside buildings stand 16-18 m off the road (was 12-14): five walled compounds,
    // 16-28 m across, reached into the carriageway (the layout brief's solidPropsInRoad)
    buildingLat: [16, 2], destructibleBuildingLat: [16, 3],
    tacticalBeats: [
      // 2026-10-03 (maps lane B): the toll compound moves from (216, 48), 37 m from Verdant's eastern observer, to the
      // caravan road's north gate, and the dune lookout from (-292, 50), 40 m from Verdant's western post, west along
      // the dune arm's crest (the layout brief's skeleton rule: no strongpoint within 60 m of one of Verdant's)
      { id: 'caravan-toll-compound', role: 'brawl', x: 170, z: 150, yawDeg: -90, structure: 'checkpointhut', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      { id: 'western-dune-lookout', role: 'scout', x: -345, z: 32, yawDeg: 90, structure: 'guardpost', outcrop: { count: 5, radius: 9 } },
      { id: 'spring-supply-camp', role: 'support', x: -72, z: 256, yawDeg: 180, structure: 'deserttent', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
    ],
    // the kit's kershef tones own the renders (a salt-mud grey-beige, not the Dahar's warm sand adobe); the roofs, field
    // stone, timber and straw keep the desert's
    tones: { roof: desert.props.tones.roof, stone: desert.props.tones.stone, wood: desert.props.tones.wood, straw: desert.props.tones.straw },
    // (round 3: a lot a metre off its neighbour's reach, so old Shali's blocks heap together; was 7)
    wallStyle: 'adobe', wallStoneChance: 0.16, sideSkip: 0.16, spacingPad: 1,
    // (round 3: the gardens' mud walls — G1 all round but its gate, G2 and G3 on their street sides; the wall south of the
    // new town, through its caravanserai's lot, gone)
    wallRuns: [[38, -40, 38, 18, 2], [248, 12, 248, 84, 3], [176, 90, 248, 90, 2], [-108, 280, -32, 280, 3], [-108, 216, -108, 280, 2],
      [-30, 50, 30, 50, 2], [30, 50, 30, 110, 2], [30, 110, -30, 110, 2], [-30, 110, -30, 62, 2],
      [-10, -112, 50, -112, 2], [50, -112, 50, -150, 2], [40, 128, 80, 128, 2], [40, 128, 40, 172, 2]],
    // (round 2, wave 125: no round bales in a date-palm oasis)
    // (round 2, wave 125: "a red-tiled wishing well", "a red fence") the springs are the water; palm-rib fences only
    well: false, hayCrates: false, fences: false, telegraph: false, carts: true, logs: false,
    rocks: 144, outcrops: 24, craters: 48, rubblePiles: 12, sandbagLines: 14, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true,
      ids: ['merkava4b', 'm60a3', 'merkava3d', 'm1a2', 't90a'] },
    // (round 3, wave 135: "a corrugated blue shed") the modern clutter's containers and sheds mostly gone (was 18)
    inhabit: { stalls: 0, benches: 3, coreClutter: 22, pots: 10, laundry: 4, handcarts: 3, carts: 4, trucks: 4, jeeps: 3, drumClusters: 4, camps: 4, modernClutter: 4, looseClutter: 18, roadFence: 'fencewattle', yardFence: 'fencewattle' },
  },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): dune-ring tone grain 0.46 -> 0.62
  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): a flat erg of low soft dunes
  // round the spring (the gour stair kept on the ring's own hills)
  horizon: { baseHex: 0xaa936b, amp: 0.35, style: 'rolling', ground: 'sand', treeline: 0.12, panorama: { regional: 'erg' }, forestHex: 0x70704b, rockHex: 0xae9471, haze: 0.88, grain: 0.62,
    // the mountains lane (2026-10-02): the desert hills round the spring are gour — flat-topped residual hills cut by
    // their beds — not smooth rolling downs: a gentler bed stair than the tableland rings' (horizonEscarpment.ts)
    escarpment: { bedM: [22, 42], cliffShare: [0.24, 0.40], talusRise: 0.30, meanderM: 16 } },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): a textured high sky (0.5 / 0.22 -> 0.78 / 0.48 on
  // an 820 m deck of 2900 m cells that the low 22° sun rakes), the dust haze a step cooler than the sun (0xb0a18a ->
  // 0xb3ada3, saturation 0.21 -> 0.09 at the same lightness) and patchier light on the dunes (cloudShadowAmp 0.24)
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cumulus-humilis', coverage: 0.17, cirrus: 0.4, windDirDeg: 120 },
  sky: { ...desert.sky, sunElevationDeg: 22, sunAzimuthDeg: 104, turbidity: 5.2, /* 2026-10-03 (the skies lane, agreed with the mountains lane: one haze law from the camera to the far country, the map's fogDensity its one lever): arid air is clear — 0.00025 on the four arid maps (a meteorological range near 37 km; a ridge 300 m up at 7.5 km keeps about 60 % of its contrast) (was 0.00052) */ fogDensity: 0.00025, fogTintHex: 0xb3ada3, fogMix: 0.46, cloudOpacity: 0.78, cloudOpacity2: 0.48, cloudAltM: 820, cloudHazeK: 0.00012, cloudUvM: 2900, cloudShadowAmp: 0.24, sunIntensity: 4.0, hemiIntensity: 0.40 },
  minimap: { ...desert.minimap, water: 'rgba(45,111,108,.86)', waterStroke: 'rgba(23,70,70,.94)' },
  shot: { pos: [-252, 52, -246], look: [86, 1, 80] },
  // round 66 (2026-09-24, the FFT ocean): a still spring pool with a breath of desert wind — clear water over pale
  // sand, so its caustics are the strongest of the fleet
  ocean: { windSpeed: 2.8, windDirDeg: 120, fetchKm: 2, amplitude: 0.7, foam: 0, breakers: 0.1, caustics: 0.9 },
} satisfies import('./contracts.ts').MapCompositionConfig;
