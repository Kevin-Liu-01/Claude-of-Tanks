// src/world/maps/reservoir.ts — Highland Reservoir, revised 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The three-lobed reservoir, the waterworks, the service settlement, the ridges, the road fork and both deployments are
// the map's identity and stay. The old layout let alpha's pad see the middle of bravo's assembly ground over the east
// ridge, left that ground between bravo's two pockets with 15 % cover, and put every zone-control disc 30-130 m closer
// to alpha: the lake makes bravo drive round it.
//
// Reference: the Roer dams in the Eifel highlands (the Urft and Schwammenauel reservoirs, winter 1944-45): an upland
// lake held by a dam, spruce and pine on the ridges, waterworks on the shore, and a service village below the woods.
//
// The story on the ground: alpha forms up on the western apron behind the west ridge, and the road forks round the
// lake. Bravo assembles in two pockets on the east plateau, south and north of the lake, with a spruce knoll between
// them that hides both from the west. The zone-control discs stand on the waterworks' three gravel yards, which lie on
// the line of equal driven distance between the deployments: it runs east of the straight midline, round the lake,
// from the north bank's timber landing over the dry promontory between the lobes to the substation road.
import frontier from './frontier.ts';
export default {
  id: 'reservoir', name: 'Highland Reservoir',
  // Route preference only: other maps retain their authored shallow fords.
  navigationWaterPolicy: 'avoid-liquid',
  blurb: 'An irregular upland basin, pine-covered waterworks and a service settlement beneath high ridges',
  terrain: {
    hillScale: 1.08, microScale: 0.78, rimH: 38, clearMarshVeg: true, softLakes: true,
    village: { x0: -212, x1: 26, z0: -108, z1: 130, cx: -92, cz: 12, feather: 44, flatten: 0.82, relief: 0.18 },
    // Full platoon assembly/access, including the real outward solo search.
    // Existing hardstand stamps grade the current road grids/mask; no mesh,
    // additional terrain buffer, path or material is constructed here.
    hardstands: [
      // Alpha's assembly apron round its pad and the road's west gate, tilted 5 % down to the east with the hillside
      // and given a 24 m bank: the old 76 x 260 m level slab at 2.0 m stood up to 12 m off its ground and cut walls on
      // every side (docs/MAP-LAYOUT-BRIEF.md, "Apron banks"). The road's west gate (-424, -72) stays on it.
      { x: -394, z: -72, width: 40, length: 72, yawDeg: 90, level: 4.5, grade: -0.05, bankM: 24 },
      // The waterworks' three gravel yards on the line of equal driven distance between the deployments (the lake
      // makes bravo drive round it, so the line runs east of the straight one), each where its ground spreads least.
      // The north bank's timber landing and the south yard by the substation road both stand on the shore road. They
      // take its own height and grade (grade 'road'), so the road keeps its grade at every terrain seed. The yard on
      // the dry promontory between the lobes stands at its ground's median height. The zone-control discs seat on
      // them.
      { x: -8, z: 154, width: 50, length: 50, yawDeg: 15, grade: 'road', bankM: 16 },
      { x: 88, z: 8, width: 50, length: 50, yawDeg: 0, level: -8, grade: 0 },
      { x: 12, z: -170, width: 44, length: 44, yawDeg: -24, grade: 'road', bankM: 30 },
    ],
    roads: { paths: [
      // Western deployment enters one fork, not one of several full-height
      // parallel lanes. The southern road uses the existing substation saddle.
      [[-480, -72], [-424, -72], [-364, -72], [-340, -88], [-238, -174], [-78, -212],
        [42, -244], [172, -224], [294, -190], [392, -100]],
      // A longer, screened bank route passes above all three lake lobes and
      // ends at the northern assembly junction. Only the eastern spine owns
      // the continuation to the east gate; no second path re-crosses it.
      [[-340, -88], [-292, 88], [-224, 190], [-124, 222], [40, 242],
        [180, 266], [314, 238], [388, 160]],
      // Retain the settlement's two-dimensional hooked works street. This
      // is a brawl shortcut between the fork's arms, not a map-edge lane.
      [[-238, -174], [-138, -116], [-138, -42], [-82, -42], [-82, 100], [-124, 222]],
      // Retain the original local shore spine beside the kiosk/penstock.
      // Its dry north/south ends feed the two routes around the lake.
      [[42, -244], [-22, -102], [-82, -42], [-22, 42], [-4, 78], [40, 242]],
      // Two genuinely separate east-side assembly pockets: three vehicles
      // south of the basin, four on the north plateau. The rear service road
      // alone owns the connection between the southern and northern joins,
      // so each route pair has one real junction rather than overlapping grades.
      // The first northern tank stages on the open apron east of this bend;
      // it must not straddle the road's final-priority graded shoulder.
      // Stay east of the basin: extrapolating the first interior tangent
      // previously sent this service road 355m southwest to the wrong gate.
      // The intermediate bend spreads the turn before the southern spawn.
      [[420, -480], [420, -448], [370, -400], [370, -328], [436, -288], [420, -208], [392, -100], [424, 0],
        [388, 160], [448, 226], [372, 282], [440, 354], [448, 400], [480, 400]],
    ] },
    // Three unequal lobes form an irregular upland retention basin. Their
    // shared shoulder stays open water around a dry northern promontory;
    // three total wet cells replace the old dumbbell and satellite pond.
    lakes: [
      { x: 164, z: -26, r: 110, depth: 1.0, level: -8.0 },
      { x: 104, z: 72, r: 80, depth: 1.0, level: -8.0 },
      { x: 212, z: 68, r: 68, depth: 1.0, level: -8.0 },
    ],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -276, z: 14, length: 426, width: 80, height: 9.2, yawDeg: 4 },
      { kind: 'ridge', x: 340, z: 12, length: 446, width: 76, height: 8.6, yawDeg: -2 },
      { kind: 'ridge', x: 102, z: -256, length: 290, width: 64, height: 7.2, yawDeg: 88 },
      { kind: 'ridge', x: 102, z: 282, length: 290, width: 68, height: 7.0, yawDeg: 86 },
      { kind: 'basin', x: 162, z: 12, rx: 152, rz: 232, height: -5.0, wetScale: 0.2 },
      { kind: 'knoll', x: -126, z: 250, rx: 94, rz: 68, height: 5.8 },
      // a spruce knoll on the east plateau between bravo's two assembly pockets: it hides them from the western
      // deployment and gives the plateau's open middle its cover
      { kind: 'knoll', x: 372, z: 30, rx: 34, rz: 46, height: 5.5 },
    ],
  },
  layoutBrief: { exceptions: {
    solidPropsInWater: 'the waterworks\' bank manifold and submerged-footed intake (src/world/reservoirWaterworks.ts) '
      + 'stand in the lake by design, where they draw water from the middle lobe; so does the landmarks lane\'s valve tower '
      + 'and its footbridge\'s piers (props.landmarks, src/world/landmarks/towers.ts valveTower)',
  } },

  spawns: {
    player: { x: -384, z: -72,
      formation: { columnSpacingM: 8, rowSpacingM: 13 } },
    enemies: [
      { x: 370, z: -328 }, { x: 436, z: -288 }, { x: 420, z: -208 },
      { x: 436, z: 156 }, { x: 448, z: 226 }, { x: 372, z: 282 }, { x: 440, z: 354 },
    ],
  },
  splat: { sourcedPalette: 'frontier', ...frontier.splat, seaLake: true, seaFoam: 0.06, seaRamp: [0.16, 0.5], iceDrift: 0.02, marshGloss: 0.90, iceSky: [0.22, 0.37, 0.46], tintA: [0.82, 0.99, 0.74], tintB: [0.56, 0.74, 0.57], tintC: [1.0, 1.06, 0.84], roadTint: [0.72, 0.70, 0.60] },
  vegetation: {
    species: ['pine', 'fir', 'birch'], clusterMix: [['pine', 0.5], ['fir', 0.32], ['birch', 0.18]],
    loneMix: [['birch', 0.42], ['pine', 0.4], ['fir', 0.18]], rimMix: [['pine', 0.5], ['fir', 0.4], ['birch', 0.1]],
    clusterCount: 66, loneCount: 98, rimCount: 108, grassDensity: 0.96, bushCount: 1.0, bushSpecies: 'birch', clusterScrub: 1.6,
  },
  props: {
    // regional-buildings lane: the Eifel Fachwerk-and-greywacke kit (maps/regional/eifel.ts)
    architecture: 'eifel',
    sourcedPalette: 'frontier',
    // The landmarks lane (2026-10-05; src/world/landmarks/towers.ts valveTower): the reservoir's valve tower, as the
    // Roer dams' stand off their walls (the Urft's of 1905) — the basin is closed by its ridges and holds no dam, so the
    // tower stands in the middle lobe off the west bank, south of the waterworks, its valve chamber and slated bell roof
    // over the water and an arched masonry footbridge from the bank to its door (its axis at (55, 72)).
    landmarks: [
      { kind: 'valveTower', x: 33.6, z: 72, yawDeg: 90, name: 'the valve tower', params: { bridge: 47 } },
    ],
    // A supported control kiosk, bank manifold and submerged-footed intake
    // replace three accepted rubble piles; the closed works leave roads open.
    reservoirWaterworks: { lakeIndex: 1, kiosk: [14, 84], bank: [39.5, 100], intake: [46.5, 99] },
    plan: ['foundryoffice', 'depot', 'rangerlodge', 'warehouse', 'watertower', 'farmhouse', 'woodshed', 'tavern', 'depot', 'granary', 'ruin', 'cottage', 'warehouse', 'rangerlodge', 'depot', 'farmhouse', 'woodshed', 'ruin'],
    destructibleBuildings: ['transformershed', 'servicegarage', 'huntingblind', 'fieldhut'],
    buildingLat: [13, 2], destructibleBuildingLat: [17, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'waterworks-service-yard', role: 'brawl', x: -166, z: 64, yawDeg: 90, structure: 'servicegarage', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      { id: 'eastern-shore-observation', role: 'scout', x: 328, z: 70, yawDeg: -90, structure: 'huntingblind', outcrop: { count: 4, radius: 8 } },
      { id: 'southern-saddle-substation', role: 'support', x: 68, z: -270, yawDeg: 0, structure: 'transformershed', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.76,
    wallRuns: [[-196, 28, -196, 94, 2], [-190, 112, -122, 112, 3], [-48, -10, 10, -10, 2], [-48, 104, 14, 104, 3], [292, 40, 292, 112, 2], [32, -300, 104, -300, 3]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 194, outcrops: 32, craters: 48, rubblePiles: 14, cropFields: 3, sandbagLines: 16, hedgehogs: 10,
    // The hitbox lane (2026-10-08): the stones' own colliders took from the brief's cover the empty corners their legacy
    // records had counted, and bravo's centre fell under its band (coverSectorMin 0.156 -> 0.144 of 0.15). Three outcrops
    // of the map's own boulders on the slope up to the east plateau, south-east of the lake, each a crescent bulging west
    // toward alpha, put real hull-down cover back where the layout metric found the open ground.
    coverOutcrops: [
      { x: 298, z: -86, towardDeg: 179, count: 5, radius: 7, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders under the east plateau' },
      { x: 303, z: -72, towardDeg: 179, count: 4, radius: 6, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders under the east plateau, north' },
      { x: 313, z: -76, towardDeg: 179, count: 5, radius: 6, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders on the plateau\'s lip' },
    ],
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: { stalls: 1, benches: 3, coreClutter: 20, bales: 6, troughs: 2, laundry: 2, handcarts: 3, carts: 3, trucks: 5, jeeps: 4, drumClusters: 5, camps: 3, modernClutter: 20, looseClutter: 20, roadFence: 'fenceplank', yardFence: 'fencerail' },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Eifel's slate. The
  // cleaved greywacke and slate stand out of every ridge's flanks in crags with their scree; a crag rises above the
  // lake's south and north shores; a timber field cross stands in the angle of the road fork below the west ridge.
  scenery: {
    rocks: [
      { form: 'crag', geology: 'slate', x: 200, z: -150, radius: 6, height: 5, yawDeg: 20, name: 'the crag above the south shore' },
      { form: 'crag', geology: 'slate', x: 40, z: 160, radius: 6, height: 4.5, yawDeg: 60, name: 'the crag above the north shore' },
    ],
    rockFields: [
      { geology: 'slate', x: -276, z: 14, radius: 95, count: 7, slopeBias: 0.8, size: [2.5, 5], name: 'the west ridge slate' },
      { geology: 'slate', x: 340, z: 12, radius: 95, count: 7, slopeBias: 0.8, size: [2.5, 5], name: 'the east ridge slate' },
      { geology: 'slate', x: 102, z: -256, radius: 80, count: 5, slopeBias: 0.8, size: [2.5, 5], name: 'the south ridge slate' },
      { geology: 'slate', x: 102, z: 282, radius: 80, count: 5, slopeBias: 0.8, size: [2.5, 5], name: 'the north ridge slate' },
    ],
    landmarks: [
      { kind: 'waysidecross', x: -318, z: -80, yawDeg: 45, name: 'the cross at the road fork' },
    ],
  },
  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the northern Eifel is rounded
  // forested hill country cut by the Rur's valleys — not an alpine skyline: the ring rolling (its own style: the border's
  // landform stays alpine), the far country upland
  horizon: { baseHex: 0x62766a, amp: 0.9, style: 'alpine', ringStyle: 'rolling', treeline: 0.80, snowline: 2, panorama: { regional: 'upland' }, forestHex: 0x304e40, rockHex: 0x828d87, haze: 0.90, grain: 0.52 },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.26, streets: 0.3, contrails: 0.3 },
  sky: { ...frontier.sky, sunElevationDeg: 26, sunAzimuthDeg: 142, turbidity: 4.2, fogDensity: 0.00058, fogTintHex: 0x91a8b5, fogMix: 0.5, cloudOpacity: 1.0, cloudOpacity2: 0.66, sunIntensity: 3.8, hemiIntensity: 0.43 },
  minimap: { ...frontier.minimap, base: [78, 105, 77], hard: [111, 114, 98], soft: [47, 75, 71], water: 'rgba(43,89,111,.86)', waterStroke: 'rgba(23,55,73,.94)' },
  shot: { pos: [-248, 57, -248], look: [108, -1, 74] },
  // round 66 (2026-09-24, the FFT ocean): a highland lake under a light breeze — a fine chop, no whitecaps; the
  // owner's approved look is kept (amplitude 0.6)
  ocean: { windSpeed: 3.0, windDirDeg: 150, fetchKm: 3, amplitude: 0.6, foam: 0, breakers: 0.15, caustics: 0.4 },
} satisfies import('./contracts.ts').MapCompositionConfig;
