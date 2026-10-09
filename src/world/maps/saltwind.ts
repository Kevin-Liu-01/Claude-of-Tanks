// src/world/maps/saltwind.ts — Saltwind Narrows, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The bay, the harbour village and its roads, the palette, sky, sea, vegetation, name and id are the map's identity
// and stay; the battlefield around them is new. The old layout put its three strongpoints on Verdant's three beat
// sites, spread bravo's pads over 500 m, and left the inland slopes open, so the 2v2 pacing receipt's fastest match
// (seed 49002) ended in 104 s.
//
// Reference: a Dalmatian limestone coast on the Adriatic channels (the Peljesac and Kornati narrows): a sheltered
// bay hooked behind a headland, a fishing village on its shore, and dry-stone terraces (gromace) stepping up the bare
// limestone slopes above it, with scrub and olive walls between them and a low karst spine running inland.
//
// The story on the ground: the bay opens on the west edge. The harbour village stands on its east shore, with the
// coast road along the quays and the market street climbing inland. Above the village a low karst spine runs east
// along the bay's axis. South and north of it, the limestone slopes rise in two flights of dry-stone terraces with
// scrub knolls on their eastern flank, and a hairpin road crosses each flight.
//
// The layout is mirror-symmetric across the bay's axis (z = 10): every terrace, knoll, wall, strongpoint and objective
// in the southern half has a counterpart reflected into the northern half. Alpha deploys on the southern upland,
// behind the southern terrace flight, and bravo on the northern upland behind the northern flight, so the pads cannot
// see each other. The three zone-control objectives stand on the axis: the village square, the market crossroads and
// the karst spine's saddle.
import coastal from './coastal.ts';
import { roundRoadBends } from './roadBends.ts';
export default {
  id: 'saltwind', name: 'Saltwind Narrows',
  blurb: 'A limestone fishing coast bends around a sheltered bay below dry scrub terraces',
  terrain: {
    hillScale: 0.86, microScale: 0.70, rimH: 28, clearMarshVeg: true, softLakes: true,
    coastRimFadeM: 110, // round 47 follow-up: the bay-mouth headlands climb to the rim over 110 m instead of standing as slabs one row past the line
    // Include the dry inland street as working frontage; the former east
    // bound excluded it and stranded the last three planned village buildings.
    village: { x0: -252, x1: 40, z0: -116, z1: 138, cx: -136, cz: 10, feather: 44, flatten: 0.86, relief: 0.14 },
    villageWear: 'activity-patches',
    workedGround: [
      // Existing stall ring at the harbor-road junction (-190, -36).
      { feather: 7, strength: 0.94, boundary: [[-212, -58], [-186, -66], [-169, -52], [-163, -29], [-183, -17], [-211, -29]] },
      // Doorstep courts follow the new inland market street. The old loop's
      // large worn pad would leave an unexplained bare rectangle behind it.
      { feather: 6, strength: 0.84, boundary: [[-181, -65], [-140, -68], [-105, -62], [-101, -26], [-134, -19], [-171, -21]] },
      { feather: 6, strength: 0.8, boundary: [[-99, -59], [-65, -57], [-26, -47], [-26, -12], [-60, -13], [-94, -20]] },
      // Dry approach from actual landing 1 (-283.54, -21.89) past its beached
      // boat (-264.88, -21.71) toward the harbor frontage.
      // The existing stamp preserves all wet pixels, including the quay edge.
      { feather: 6, strength: 0.88, boundary: [[-286, -38], [-261, -44], [-221, -49], [-206, -31], [-232, -22], [-260, -17], [-280, -20]] },
    ],
    roads: { paths: roundRoadBends([
      // Quayside frontages bend with the bay; the inland market stair-road
      // meets them on the dry limestone shoulder, clear of the harbor mouth.
      [[-300, -460], [-252, -282], [-210, -100], [-190, -36], [-180, 44], [-190, 108], [-224, 206], [-294, 462]],
      [[-84, -464], [-20, -292], [44, -126], [-2, 32], [74, 200], [66, 332], [138, 464]],
      [[340, -460], [272, -304], [308, -144], [228, 14], [292, 180], [266, 330], [320, 462]],
      // A single market street leaves the harbor junction; no folded-back loop.
      [[-190, -36], [-138, -44], [-82, -40], [-20, -30], [80, -8], [156, 6], [228, 14]],
      [[-224, 206], [-6, 242], [126, 218], [266, 330]],
      // The southern hairpin road, the reflection of the northern one across the bay's axis.
      [[-230, -186], [-6, -222], [126, -198], [266, -310]],
    ]) },
    // Round 40 (2026-09-22, AAA map program): the hooked bay is one authored shoreline. The former three overlapping
    // circles rasterised into three straight-edged basins with sand strips between them and dried in the last
    // metres before the red line; this contour keeps the bay's east shore and the harbour landings where they were,
    // hooks a headland cove at its north-east, and runs open to the west edge, where the horizon ring now carries
    // the same sea (edgeWater.ts). One level, as before: a connected bay cannot step at basin overlaps.
    // Round 52 (owner decision 2026-09-23, "Saltwind strand wider: 20 m"): the graded strand between the waterline and
    // the dry bank widens from 12 to 20 m — Saltmere's is 22 m — so the beached boats and the harbour landings rest on
    // a real beach instead of a two-boat-length shelf.
    lakes: [{ x: -452, z: 8, r: 250, depth: 1.1, level: -7.8, shelfM: 20,
      radii: [0.70, 0.66, 0.44, 0.48, 0.86, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 0.97, 0.86, 0.66, 0.58, 0.62] }],
    marshes: [{ x: -286, z: 4, r: 27, dip: 0.6 }],
    // The spine saddle: a level apron the zone-control placement seats its 30 m disc on. The village square's and the
    // market crossroads' discs seat on the village's own graded floor (an apron there would repaint the protected
    // road channel under the activity-patch wear).
    hardstands: [
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): 16 m north, at its ground's median height, a 24 m bank
      { x: 230, z: 26, width: 60, length: 60, yawDeg: 0, level: 2.4, grade: 0, bankM: 24 },
    ],
    landforms: [
      // the village's hill under the market street, on the axis
      { kind: 'ridge', x: -166, z: 22, length: 348, width: 60, height: 5.8, yawDeg: 2 },
      // the bay's shore basin: the strand grading under the harbour (round 40)
      { kind: 'basin', x: -344, z: 12, rx: 114, rz: 280, height: -3.6, wetScale: 0.2 },
      // the karst spine east of the village along the axis: two low knolls with the saddle between them
      { kind: 'knoll', x: 130, z: 10, rx: 70, rz: 42, height: 6.5 },
      { kind: 'knoll', x: 330, z: 10, rx: 64, rz: 42, height: 6 },
      // the dry-stone terrace flights, south and north: each screens its pad from the axis
      ...[[40, -230, 300, 70, 8, 6], [-90, -300, 180, 56, 5, 10]].flatMap(([x, z, length, width, height, yaw]) => [
        { kind: 'ridge', x, z, length, width, height, yawDeg: yaw },
        { kind: 'ridge', x, z: 20 - z, length, width, height, yawDeg: -yaw },
      ]),
      // the scrub knolls on the flights' eastern flank
      { kind: 'knoll', x: 300, z: -220, rx: 70, rz: 60, height: 6 },
      { kind: 'knoll', x: 300, z: 240, rx: 70, rz: 60, height: 6 },
      // limestone outcrops on the lower slopes, south and north of the village: they part the harbour lane from the
      // market lane, and the market lane from the spine lane
      ...[[-190, -118], [90, -126]].flatMap(([x, z]) => [
        { kind: 'knoll', x, z, rx: 34, rz: 26, height: 6.5 },
        { kind: 'knoll', x, z: 20 - z, rx: 34, rz: 26, height: 6.5 },
      ]),
    ],
  },

  spawns: {
    // Alpha deploys on the southern upland behind the southern terrace flight; bravo's seven pads (two rows, 60 m
    // apart) stand on the northern upland behind the northern flight, their centroid the reflection of alpha's pad
    // across the bay's axis. 809 m between the anchors.
    player: { x: 140, z: -394 },
    enemies: [
      { x: 140, z: 380 }, { x: 80, z: 380 }, { x: 200, z: 380 },
      { x: 50, z: 440 }, { x: 110, z: 440 }, { x: 170, z: 440 }, { x: 230, z: 440 },
    ],
  },
  // ground lane (2026-10-03, maps lane A's census: "lush green where Dalmatian karst should be dry scrub", and "blue-grey
  // slope-rock smears on the terrace risers read as puddles"): on the coast's photo layers, the sward pulled toward a
  // garrigue's dusty grey-olive and the rock lifted to the weathered limestone's pale warm grey (the boulders' tone)
  splat: { sourcedPalette: 'coastal', ...coastal.splat, sourcedTint: { G: [1.15, 0.95, 1.35], R: [1.40, 1.30, 1.30] }, seaLake: true, seaFoam: 0.2, seaRamp: [0.16, 0.54], iceDrift: 0.02, marshGloss: 0.90, iceSky: [0.23, 0.44, 0.58], tintA: [1.08, 1.04, 0.82], tintB: [0.73, 0.78, 0.62], tintC: [1.14, 1.08, 0.88], roadTint: [0.82, 0.76, 0.63], midRelief: 0.68,
    // ground lane (wave 79: "… red terra rossa among limestone (Dalmatia)"): the coast's dirt layer is its beach sand
    // (0.55 / 0.42 / 0.22), so where it is drawn as the land's soil — the worn ground, verges, tracks — it takes the
    // karst's terra rossa; the strand and the white gravel roads keep the sand. (wave 83: "pastel pink, mauve and beige
    // rather than rust-red terra rossa" — the dull brick ~0.16 / 0.10 / 0.075 read mauve) a red-brown, ~0.20 / 0.088 / 0.048
    // (2026-10-08, waves 286b-287: "one flat, saturated orange-red") a dusty brick red-brown, the terra rossa field's own
    // base (terrain.ts): ~0.25 / 0.126 / 0.075 — red 2.0x its green, green 1.7x its blue, a third less saturated
    soilTint: [0.46, 0.30, 0.34] },
  vegetation: {
    species: ['cedar', 'acacia', 'pine'], clusterMix: [['cedar', 0.46], ['acacia', 0.38], ['pine', 0.16]],
    loneMix: [['acacia', 0.50], ['cedar', 0.32], ['pine', 0.18]], rimMix: [['cedar', 0.5], ['pine', 0.3], ['acacia', 0.2]],
    // map pass 2026-09-12: limestone-terrace identity — scrub, pale rock and
    // outcrops instead of a green pasture (establishing shot read as generic);
    // tree and rock counts stay at the environmentExpansion first-pass ceilings.
    clusterCount: 34, loneCount: 52, rimCount: 62, grassDensity: 0.52, bushCount: 1.3, bushSpecies: 'acacia', clusterScrub: 1.9,
    // ground lane: the tufts a garrigue's dry grey-olive, not a meadow's green
    // (wave 177 and 2026-10-08's wave 287: "thick, evenly spaced and plastic-looking" blades, a "lush lawn-green
    // carpet") the cards' own paint cured yellow-grey as well as their tint, and fewer of them
    grassTexTone: (_h: number, s: number, l: number) => [0.135, Math.min(1, s * 0.45), Math.min(1, l * 0.98 + 0.06)],
    tuftTone: (_h: number, s: number, l: number) => [0.14, s * 0.45, Math.min(1, l * 0.96 + 0.04)],
  },
  props: {
    // regional-buildings lane: the Dalmatian limestone kit (maps/regional/dalmatian.ts)
    architecture: 'dalmatian',
    // The landmarks lane (2026-10-05; src/world/landmarks/towers.ts campanile): the village's free-standing Venetian
    // campanile, as Rab's, Hvar's and Korcula's stand apart from their churches — on the bay's axis between the village
    // square and the market crossroads (the map's mirror line, so it stands for both halves), its door toward the square:
    // the limestone shaft in string-coursed stages, its openings multiplying as it rises (slits, a monofora, a bifora),
    // the open bell stage with a bifora on each face, the stone pyramid inside its balustrade and its cross, 34 m over
    // the village.
    landmarks: [
      // round 2 (2026-10-06; gauntlet wave 158: "stands alone in an open red-earth field with no church, piazza, paving or
      // houses at its foot"): the piazza's flagstones round its foot (authored first: a dressing piece, it refuses
      // nothing; it lies in the zone's disc, which a dressing piece may), the campanile on its broad step, its stone
      // streaked from each string course. The piazza is laid into the finished map (ground 'veto', an open surface): it
      // reserves no ground, so every record the map placed round the campanile stands where it stood.
      { kind: 'path', x: -81, z: 10, yawDeg: -90, ground: 'veto', name: "the campanile's piazza", params: { length: 18, width: 18, surface: 'stone' } },
      { kind: 'campanile', x: -81, z: 10, yawDeg: -90, name: 'the campanile', params: { height: 34, side: 5.6 } },
    ],
    sourcedPalette: 'coastal',
    extraKits: ['river'],
    // Two low timber landings face the village and its northern coastal exit.
    // Dry limestone beaches use the existing wood batch, not wet-bank reeds.
    riverLandings: [
      // round 40: two stations of the one bay's east shore whose beached boats rest on a shallow bank at every
      // battle seed (the stations between them sit on the basin landform's wet flat)
      // round 67 (2026-09-24): the piers take the strand law's shelf-sized length (riverLandings.ts) instead of the
      // authored 19 m — from the shore end over the planar core with room for the moored hull, within 4–10 spans
      { lakeIndex: 0, shoreAngleDeg: -25, shoreReeds: false },
      { lakeIndex: 0, shoreAngleDeg: 45, shoreReeds: false },
    ],
    plan: ['fishery', 'boatshed', 'marketRow', 'farmhouse', 'bathhouse', 'cottage', 'depot', 'tavern', 'boatshed', 'ruin', 'cornershop', 'market', 'farmhouse', 'woodshed', 'fishery', 'cottage', 'granary', 'ruin'],
    destructibleBuildings: ['fishershack', 'fieldhut', 'guardpost', 'checkpointhut'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3], sideSkip: 0.16, spacingPad: 7.5,
    // One strongpoint per role, balanced across the bay's axis: the quay cooperative at the harbour's north end, the
    // toll farm below the spine's western knoll on the south side, the limestone watch on the spine's eastern knoll.
    tacticalBeats: [
      { id: 'quay-cooperative', role: 'brawl', x: -210, z: 120, yawDeg: 90, structure: 'fishershack', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'spine-toll-farm', role: 'support', x: 130, z: -30, yawDeg: 0, structure: 'checkpointhut', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'spine-limestone-watch', role: 'scout', x: 330, z: 10, yawDeg: -90, structure: 'guardpost', outcrop: { count: 5, radius: 10 } },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.82,
    // weathered Dalmatian limestone: the boulders and outcrops near-white grey (the default boulders are dark and mossy)
    rockTone: (_h: number, _s: number, l: number) => [0.11, 0.045, Math.min(1, l * 0.9 + 0.29)],
    // the village crofts and a dry-stone terrace wall (gromace) on each flight, its reflection on the other
    wallRuns: [[-244, -80, -232, -16, 2], [-244, 36, -244, 100, 3], [-150, -72, -80, -72, 2], [-150, 92, -80, 92, 3],
      [60, -150, 140, -160, 2], [60, 170, 140, 180, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 188, outcrops: 30, craters: 48, rubblePiles: 12, cropFields: 4, sandbagLines: 14, hedgehogs: 8,
    // the map-vehicles lane (2026-10-06, the period ruling): Dalmatia in the 1990s: the M-84's parent T-72M1, the
    // T-55 (its Type 59 copy) and the BMP
    tankWrecks: { era: 'cold-war', count: 5, debris: true, ids: ['t72m1_jaguar', 'type59', 'bmp2'] },
    inhabit: { stalls: 4, benches: 4, coreClutter: 22, pots: 8, laundry: 4, handcarts: 4, carts: 3, trucks: 4, jeeps: 3, drumClusters: 4, camps: 2, modernClutter: 18, looseClutter: 18, roadFence: 'fencewattle', yardFence: 'fencepicket' },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the karst. Bare limestone
  // pavement (clints split by grikes) lies on the open uplands above the bay; the lower slopes' outcrop knolls show
  // their bedded limestone scars; the terrace flights and the spine break into small pavements and ledges; a gomila,
  // the clearance cairn of a Dalmatian field, stands on each upland. Mirrored across the bay's axis like the rest of
  // the map (the rock fields draw their own ground on each side).
  scenery: {
    // the karst's small fields are walled in dry stone: the ground lane's land use draws their footing (landUse.ts, boundary
    // 3) and the walls stand on the same lines (fieldWorks.ts; decor, no collision). (b13, wave 87: the walls are laid
    // as rubble on their own face print, whose stones are near white; the tone multiplies it, so the stones come out at
    // the outcrops' limestone, sRGB lightness about 0.6, the joints dark between them)
    fieldWorks: { walls: true, wallTone: [0.11, 0.06, 0.8] },
    // the masonry is the same limestone as the outcrops (the maps lane's boulders, lightness 0.52-0.73), weathered
    // grey: the stone print (mean sRGB lightness 0.36) lifted to lightness 0.52 at the limestone's hue (0.6 read as
    // whitewash in the targeted pairs)
    masonryTint: [2.08, 2.23, 2.25],
    rocks: [
      { form: 'pavement', geology: 'limestone', x: -350, z: -262, radius: 15, height: 1.6, yawDeg: 30, name: 'the south karst pavement' },
      { form: 'pavement', geology: 'limestone', x: -350, z: 282, radius: 15, height: 1.6, yawDeg: -30, name: 'the north karst pavement' },
      { form: 'outcrop', geology: 'limestone', x: 90, z: -132, radius: 8, height: 3.6, yawDeg: 10, name: 'the south spine scar' },
      { form: 'outcrop', geology: 'limestone', x: 90, z: 152, radius: 8, height: 3.6, yawDeg: -10, name: 'the north spine scar' },
      { form: 'outcrop', geology: 'limestone', x: -190, z: -124, radius: 7, height: 3.2, yawDeg: 40, name: 'the south harbour scar' },
      { form: 'outcrop', geology: 'limestone', x: -190, z: 144, radius: 7, height: 3.2, yawDeg: -40, name: 'the north harbour scar' },
    ],
    // the bare limestone of the terrace flights and the spine: small pavements and low bedded ledges on the slopes
    rockFields: [
      { geology: 'limestone', x: 40, z: -235, radius: 115, count: 14, slopeBias: 0.6, name: 'the south terrace karst' },
      { geology: 'limestone', x: 40, z: 255, radius: 115, count: 14, slopeBias: 0.6, name: 'the north terrace karst' },
      { geology: 'limestone', x: -100, z: -300, radius: 70, count: 7, slopeBias: 0.5, name: 'the south upland karst' },
      { geology: 'limestone', x: -100, z: 320, radius: 70, count: 7, slopeBias: 0.5, name: 'the north upland karst' },
      { geology: 'limestone', x: 230, z: 10, radius: 140, count: 12, slopeBias: 0.4, name: 'the karst spine' },
    ],
    landmarks: [
      { kind: 'cairn', x: -330, z: -170, scale: 4.2, height: 2.6, name: 'the south gomila' },
      { kind: 'cairn', x: -330, z: 190, scale: 4.2, height: 2.6, name: 'the north gomila' },
    ],
  },
  // the mountains lane (2026-10-03, gauntlet waves 4, 15, 24 and 32): the mainland's karst ridge across the western
  // channel (the view from the Dalmatian islands, Biokovo / Mosor behind the coast) in clean Adriatic air — dark maquis on
  // the lower slopes climbing the gullies, pale bare limestone on the upper faces, the channel 4.6 km wide and darker
  // toward the far shore; the band an elevated view sees under the ridge is the lowland's own scrub, never paler than it
  horizon: {
    baseHex: 0x7f8977, amp: 0.90, style: 'rolling', treeline: 0.42, forestHex: 0x506044, rockHex: 0xa4a391, haze: 0.90, grain: 0.46,
    panorama: { regional: 'karstRidge', shore: 1.2, shoreM: 4600, shoreRange: 0.9, treeline: 0.75, rockSlope: 0.3, forestSlope: 0.6,
      rockFloor: 0.4, gullyM: 110, strata: 0.2, scrub: 0.85, air: 0.25, fillLaw: 1, ownRock: 1 },
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'sea-streets', coverage: 0.30, windDirDeg: 200, farBand: 0.55, fogBank: 0.35, fogBankTopM: 100 },
  sky: { ...coastal.sky, sunElevationDeg: 30, sunAzimuthDeg: 112, turbidity: 3.9, fogDensity: 0.00052, fogTintHex: 0x9cb8c5, fogMix: 0.48, cloudOpacity: 0.86, cloudOpacity2: 0.5, sunIntensity: 3.95, hemiIntensity: 0.42 },
  minimap: { ...coastal.minimap, base: [117, 123, 91], hard: [142, 137, 114], soft: [63, 88, 84] },
  // over the southern terraces to the harbour village, the bay and the northern flight
  shot: { pos: [-60, 52, -300], look: [-150, 2, 80] },
  // round 66 (2026-09-24, the FFT ocean): the narrows' westerly runs up the bay from the open sea, a longer swell
  // under the chop; the surf breaks on the 20 m strand (round 52) and runs up it
  ocean: { windSpeed: 5.0, windDirDeg: 8, fetchKm: 24, swell: 0.4, swellDirDeg: 5, amplitude: 0.75, choppiness: 0.9, foam: 0.5, breakers: 0.9, caustics: 0.7 },
} satisfies import('./contracts.ts').MapCompositionConfig;
