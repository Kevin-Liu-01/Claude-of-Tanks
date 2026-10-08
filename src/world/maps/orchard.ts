// Orchard Valley: a cultivated valley of contour-planted orchard rows, cedar edges, a village with its bathhouse and
// market and three stepped farm tracks.
//
// Reference: the Chouf on Mount Lebanon — the terraced valley below the Barouk and Ain Zhalta cedar forest, between
// Beiteddine and Deir el Qamar: olive and apple terraces held by dry stone walls down the valley sides, stone pines and
// the cedars on the upper slopes, and the mountain village of the 19th century in dressed cream sandstone — the
// central-hall house (dar) under its red Marseille tiles with the triple arch (qanatir) over the door, the older houses
// under flat earth roofs with their stone rollers, the hammam's domes, the souk's vaulted shops, the sabil fountain, the
// church's open bell arch.
//
// 2026-10-05 (the map-revival lane; the owner: "make sure all maps look completely new and revitalized like verdant"):
// the village is built in that construction (maps/regional/chouf.ts), every building where it stood, the gardens walled
// behind the houses with their vine arbors (the kit's yards); the orchards grow as olives, the pines as the
// Mediterranean pines and the cedars as the cedar of Lebanon (treeBiomes.ts).
import verdant from './verdant.ts';
import { roundRoadBends } from './roadBends.ts';

// Round 5 (2026-10-07; gauntlet wave 252: "a dozen detached near-white boxes with orange hip roofs, strewn across a flat
// lawn round the road junction" — the coordinator's order: "a dense village stacked on a terraced slope: houses that
// share walls and step down the hill, narrow lanes, retaining walls under the house plots, courtyards, the church
// silhouette and its campanile, and the dar fronts with their triple arches"): the village on its own hill west of the
// junction — the knob's east spur raised into a knoll inside the village's levelled ground and stepped into terraces that
// the settlement keeps (terrain.terraces settlement) — its houses laid in index order (a terrace site's size comes from
// the stream of its index) shoulder to shoulder 0.3 m apart, a lane every four, fronts to the open side and backs to the
// retaining wall above (props.maxSpread: a house's back stands in the riser behind it). Laid out by the lane's village
// packer from each site's own kit footprint (the house's record at yaw 0).
const VILLAGE_SITES = [
  // the church on the hilltop, its campanile on the nave's front corner, its door east on the square
  { structure: 'church', x: -144.0, z: -10.0, yawDeg: 90.0, terrace: true },
  // the two dar fronts flanking the stepped lane's head, their triple arches down the lane to the cross road
  { structure: 'farmhouse', x: -111.04, z: -2.5, yawDeg: 89.0, terrace: true },
  { structure: 'farmhouse', x: -106.82, z: -27.11, yawDeg: 119.0, terrace: true },
  // the hilltop's north row, facing the church across its lane
  { structure: 'adobe', x: -161.82, z: 1.0, yawDeg: 180.0, terrace: true },
  { structure: 'cottage', x: -154.85, z: 1.0, yawDeg: 180.0, terrace: true },
  { structure: 'adobe', x: -147.66, z: 1.0, yawDeg: 180.0, terrace: true },
  { structure: 'adobe', x: -141.16, z: 1.0, yawDeg: 180.0, terrace: true },
  // the hilltop's south row, facing the church across its lane
  { structure: 'cottage', x: -161.44, z: -21.0, yawDeg: 0.0, terrace: true },
  { structure: 'adobe', x: -154.22, z: -21.0, yawDeg: 0.0, terrace: true },
  { structure: 'adobe', x: -146.77, z: -21.0, yawDeg: 0.0, terrace: true },
  // the upper bench (13 m), fronts out, backs to the hilltop's retaining wall
  { structure: 'adobe', x: -125.92, z: -25.19, yawDeg: 141.5, terrace: true },
  { structure: 'cottage', x: -122.29, z: 2.49, yawDeg: 51.5, terrace: true },
  { structure: 'adobe', x: -127.59, z: 9.18, yawDeg: 28.5, terrace: true },
  { structure: 'cottage', x: -136.56, z: 10.56, yawDeg: 4.0, terrace: true },
  // the middle bench (10.4 m)
  { structure: 'adobe', x: -161.49, z: -34.32, yawDeg: -136.0, terrace: true },
  { structure: 'adobe', x: -152.99, z: -36.49, yawDeg: -150.5, terrace: true },
  { structure: 'cottage', x: -113.0, z: 8.84, yawDeg: 53.0, terrace: true },
  // the lower bench (7.8 m)
  { structure: 'adobe', x: -96.88, z: -11.8, yawDeg: 92.5, terrace: true },
  { structure: 'granary', x: -96.3, z: -3.4, yawDeg: 81.0, terrace: true },
  { structure: 'adobe', x: -100.56, z: 1.81, yawDeg: 72.5, terrace: true },
] as const;

export default {
  id: 'orchard', name: 'Orchard Valley',
  blurb: 'Terraced orchard rows, cedar groves and a quiet bathhouse village along a winding valley road',
  // (round 5, the coordinator's ruling: the band holds on the condition that the lanes exist on the ground — the stepped
  // lane and the mule stair, props.landmarks)
  layoutBrief: { bands: {
    orphanBuildingShare: { band: [null, 0.45], reason: "a Chouf hill village: its houses stand on the hill's terraces 40 to 85 m from the valley's roads, reached by stepped lanes; the brief's 60 m measures a village on the flat" },
  } },
  terrain: {
    hillScale: 1.0, microScale: 0.72, rimH: 32,
    // (round 5) the levelled ground drawn west over the knob's east face, where the village hill stands on it
    village: { x0: -175, x1: 108, z0: -92, z1: 112, cx: -6, cz: 12, feather: 30, flatten: 0.86, relief: 0.12 },
    // 2026-10-05 (the map-revival lane, round 2; gauntlet wave 123: "the terraces never appear … flat, straight-edged
    // quilted farmland"): the valley sides stepped into the Chouf's contour terraces (terrain.ts applyTerraces) — level
    // benches a riser of 2.6 m apart, no riser steeper than 0.6, the steps fading on level ground, in the drive corridors,
    // the village and the marshes — west and east of the village from the valley's southern swell to its northern one
    terraces: [
      { polygon: [[-430, -260], [-135, -260], [-135, 260], [-430, 260]], feather: 30, stepM: 2.6 },
      { polygon: [[135, -260], [430, -260], [430, 260], [135, 260]], feather: 30, stepM: 2.6 },
      // (round 5) the village hill's terraces, kept inside the settlement (zone 1's disc, north of z 24, left level)
      // (the village's lanes, round 5) its mule track graded through the benches from the cross road to the church
      // square: along the hill's foot, two hairpins, up under the upper bench and in at the square's south side, no leg
      // over 0.15 (the mule stair's landmarks lie on it)
      { polygon: [[-185, -82], [-80, -82], [-80, 24], [-185, 24]], feather: 8, stepM: 2.6, settlement: 1,
        ramps: [{ halfWidth: 1.6, feather: 2, nodes: [[-100.5, -57, 1.18], [-143, -57, 4.64], [-145, -53.5, 4.64], [-114, -41, 9.19], [-116, -37.5, 9.19], [-140, -31.5, 12.8], [-137.72, -28.84, 12.8], [-128, -17.5, 14.2]] }] },
    ],
    // (round 2, gauntlet wave 123: the buildings "set on lawns"): the village ground in its plots — the walled yards,
    // kitchen gardens and threshing floors running back from the lanes (terrain.ts createVillagePlotWear)
    villageWear: 'plots',
    // (round 5, wave 252: the roads lie on the terraces "like a thick rope") the valley's roads at the Chouf's mountain
    // gauge, 5.5 m
    roads: { pathStyles: [{ widthM: 5.5 }, { widthM: 5.5 }, { widthM: 5.5 }, { widthM: 5.5 }, { widthM: 5.5 }], paths: roundRoadBends([
      // The bathhouse street bends into the packing court; the second
      // frontage below turns back around it instead of stringing homes out.
      [[-88, -466], [-48, -290], [-32, -128], [-44, -66], [-20, -12], [34, 30], [50, 114], [6, 308], [68, 466]],
      [[-360, -460], [-328, -286], [-218, -172], [-302, 6], [-222, 172], [-258, 314], [-180, 464]],
      [[324, -458], [262, -300], [308, -132], [224, 18], [286, 164], [252, 320], [288, 466]],
      [[-218, -172], [-112, -88], [-76, -18], [-20, -12], [24, -48], [98, -56], [202, -100], [308, -132]],
      [[-324, 196], [-222, 172], [-100, 204], [50, 146], [178, 196], [330, 224]],
    ]) },
    marshes: [{ x: 136, z: -128, r: 28, dip: 0.7 }, { x: -120, z: 230, r: 29, dip: 0.8 }],
    landforms: [
      // the valley's two flanks (2026-10-02, maps lane B: set back to the valley's real sides, off Verdant's skeleton)
      { kind: 'ridge', x: -326, z: -30, length: 330, width: 70, height: 8.6, yawDeg: 6 },
      { kind: 'ridge', x: 322, z: 30, length: 340, width: 74, height: 9, yawDeg: -8 },
      { kind: 'ridge', x: -194, z: -218, length: 210, width: 48, height: 5.6, yawDeg: 80 },
      { kind: 'ridge', x: 172, z: 218, length: 224, width: 52, height: 6.0, yawDeg: 82 },
      { kind: 'knoll', x: -84, z: 290, rx: 82, rz: 64, height: 6.2 },
      { kind: 'basin', x: 0, z: -12, rx: 136, rz: 182, height: -3.0, settlementScale: 0.5 },
      // (round 5) the village hill: the knob's east spur raised whole inside the settlement
      { kind: 'knoll', x: -138, z: -10, rx: 90, rz: 70, height: 12, settlementScale: 1 },
      // 2026-10-02 (maps lane B): the swells that close the valley's two ends, each screening one team's assembly
      // ground from the other's down the valley floor; the farm tracks cross them in cuttings.
      { kind: 'ridge', x: -40, z: -338, length: 340, width: 70, height: 7, yawDeg: 3 },
      { kind: 'ridge', x: -20, z: 330, length: 340, width: 70, height: 6, yawDeg: -3 },
    ],
  },
  spawns: { player: { x: -68, z: -392 }, enemies: [
    { x: -256, z: 386 }, { x: -174, z: 408 }, { x: -90, z: 382 }, { x: -6, z: 424 },
    { x: 80, z: 384 }, { x: 164, z: 426 }, { x: 248, z: 388 },
  ] },
  // (round 4, gauntlet wave 212: the terrace risers "near-black, blue-slate gashes ... cold dark bluish-grey rubble instead
  // of the warm dressed cream sandstone") the rock layer (Verdant's Rock058, a dark blue-grey slate) tinted to the
  // Chouf's cream limestone, the ground lane's measure (about sRGB 140 / 132 / 110: their renders at [2.1, 1.8, 1.4] drew the
  // risers near-white from the bird; Saltwind's mechanism)
  // (ground lane, 2026-10-07, wave 251: Orchard's own palette row — its dry stony soil under the worn ground, Verdant's grass)
  // (round 5, wave 252: the cream limestone "golf-course sand bunkers" in a lawn) the sward the Chouf's in August — the
  // grass layer's tints drier, toward straw, the limestone kept
  splat: { sourcedPalette: 'orchard', sourcedTint: { R: [1.85, 1.6, 1.25] }, fieldPatch: 1, midRelief: 0.74, tintA: [1.0, 1.0, 0.72], tintB: [0.74, 0.80, 0.52], tintC: [1.12, 1.06, 0.78], roadTint: [0.76, 0.7, 0.58] },
  vegetation: {
    species: ['oak', 'cedar', 'pine'], clusterMix: [['cedar', 0.46], ['pine', 0.34], ['oak', 0.2]],
    loneMix: [['oak', 0.64], ['cedar', 0.26], ['pine', 0.1]], rimMix: [['cedar', 0.54], ['pine', 0.36], ['oak', 0.1]],
    clusterCount: 42, loneCount: 38, rimCount: 88, grassDensity: 0.95, bushCount: 1.0, bushSpecies: 'oak',
    // (round 5, wave 252: "lawn green") the tufts cured toward straw, a little paler, their own variation kept
    tuftTone: (h: number, s: number, l: number) => [h - 0.055, s * 0.8, Math.min(1, l * 0.95 + 0.04)],
    // (round 4, wave 212: "the cedars and umbrella pines on the upper slopes are missing") the woods on the valley's upper
    // slopes and its ridges, closed (the trees lane's landscape-woods hook: the stands' centres on the top 35 % of the
    // square by height and slope), their cedar and pine mix the clusters'; the field trees keep the field law
    // (round 5, wave 252: "bare upper slopes … the Barouk forest") the woods' zone drawn down to the top 40 %
    landscapeWoods: { zone: 0.40, slopeDeg: 12, merge: 30 },
    // (round 5) the olive rows on the village hill's terraces stand inside the village's ground, clear of its houses
    authoredInSettlement: {},
    // (round 5) the village's lanes (props.landmarks: the stepped lane, the mule stair, the church square) clear of the
    // sward, the scrub and the trees: a chain of discs along each, 2.5 m apart
    avoid: [
      { x: -123.45, z: -13.63, r: 2.2 }, { x: -121.08, z: -14.22, r: 2.2 }, { x: -118.71, z: -14.81, r: 2.2 },
      { x: -116.34, z: -15.4, r: 2.2 }, { x: -113.97, z: -15.99, r: 2.2 }, { x: -111.61, z: -16.58, r: 2.2 },
      { x: -109.24, z: -17.17, r: 2.2 }, { x: -106.87, z: -17.76, r: 2.2 }, { x: -104.5, z: -18.35, r: 2.2 },
      { x: -102.13, z: -18.95, r: 2.2 }, { x: -99.76, z: -19.54, r: 2.2 }, { x: -97.39, z: -20.13, r: 2.2 },
      { x: -95.02, z: -20.72, r: 2.2 }, { x: -92.66, z: -21.31, r: 2.2 }, { x: -90.29, z: -21.9, r: 2.2 },
      { x: -87.92, z: -22.49, r: 2.2 }, { x: -85.55, z: -23.08, r: 2.2 }, { x: -83.18, z: -23.67, r: 2.2 },
      { x: -100.5, z: -57.0, r: 2.2 }, { x: -103.0, z: -57.0, r: 2.2 }, { x: -105.5, z: -57.0, r: 2.2 },
      { x: -108.0, z: -57.0, r: 2.2 }, { x: -110.5, z: -57.0, r: 2.2 }, { x: -113.0, z: -57.0, r: 2.2 },
      { x: -115.5, z: -57.0, r: 2.2 }, { x: -118.0, z: -57.0, r: 2.2 }, { x: -120.5, z: -57.0, r: 2.2 },
      { x: -123.0, z: -57.0, r: 2.2 }, { x: -125.5, z: -57.0, r: 2.2 }, { x: -128.0, z: -57.0, r: 2.2 },
      { x: -130.5, z: -57.0, r: 2.2 }, { x: -133.0, z: -57.0, r: 2.2 }, { x: -135.5, z: -57.0, r: 2.2 },
      { x: -138.0, z: -57.0, r: 2.2 }, { x: -140.5, z: -57.0, r: 2.2 }, { x: -143.0, z: -57.0, r: 2.2 },
      { x: -144.0, z: -55.25, r: 2.2 }, { x: -145.0, z: -53.5, r: 2.2 }, { x: -142.79, z: -52.61, r: 2.2 },
      { x: -140.57, z: -51.71, r: 2.2 }, { x: -138.36, z: -50.82, r: 2.2 }, { x: -136.14, z: -49.93, r: 2.2 },
      { x: -133.93, z: -49.04, r: 2.2 }, { x: -131.71, z: -48.14, r: 2.2 }, { x: -129.5, z: -47.25, r: 2.2 },
      { x: -127.29, z: -46.36, r: 2.2 }, { x: -125.07, z: -45.46, r: 2.2 }, { x: -122.86, z: -44.57, r: 2.2 },
      { x: -120.64, z: -43.68, r: 2.2 }, { x: -118.43, z: -42.79, r: 2.2 }, { x: -116.21, z: -41.89, r: 2.2 },
      { x: -114.0, z: -41.0, r: 2.2 }, { x: -115.0, z: -39.25, r: 2.2 }, { x: -116.0, z: -37.5, r: 2.2 },
      { x: -118.4, z: -36.9, r: 2.2 }, { x: -120.8, z: -36.3, r: 2.2 }, { x: -123.2, z: -35.7, r: 2.2 },
      { x: -125.6, z: -35.1, r: 2.2 }, { x: -128.0, z: -34.5, r: 2.2 }, { x: -130.4, z: -33.9, r: 2.2 },
      { x: -132.8, z: -33.3, r: 2.2 }, { x: -135.2, z: -32.7, r: 2.2 }, { x: -137.6, z: -32.1, r: 2.2 },
      { x: -140.0, z: -31.5, r: 2.2 }, { x: -138.86, z: -30.17, r: 2.2 }, { x: -137.72, z: -28.84, r: 2.2 },
      { x: -136.1, z: -26.95, r: 2.2 }, { x: -134.48, z: -25.06, r: 2.2 }, { x: -132.86, z: -23.17, r: 2.2 },
      { x: -131.24, z: -21.28, r: 2.2 }, { x: -129.62, z: -19.39, r: 2.2 }, { x: -128.0, z: -17.5, r: 2.2 },
      { x: -128.9, z: -13.1, r: 4.2 }, { x: -128.9, z: -6.9, r: 4.2 }, { x: -123.7, z: -13.1, r: 4.2 },
      { x: -123.7, z: -6.9, r: 4.2 },
    ],
    belts: [
      { x0: -206, z0: -96, x1: -92, z1: -68, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: -204, z0: -44, x1: -104, z1: -22, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: -210, z0: 40, x1: -114, z1: 66, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: 98, z0: 72, x1: 248, z1: 96, gap: 18, jitter: 0.8, species: 'oak' },
      { x0: 110, z0: 126, x1: 272, z1: 146, gap: 18, jitter: 0.8, species: 'oak' },
      { x0: 126, z0: -98, x1: 268, z1: -80, gap: 18, jitter: 0.8, species: 'oak' },
    ],
    authoredTrees: [
      // 2026-10-05 (the map-revival lane, round 2: the terraces' T3): olive groves on the benches beside the village, every
      // row along a bench's centre line (a contour of the ground before it was stepped, nudged to the bench's level
      // stretch) on the planar hillsides; the existing oaks rehoused as the olives (no new trees). (round 5, the village hill:
      // the upper west grove stands where it stood, now inside the village's ground on the hill's north flank —
      // authoredInSettlement admits it, clear of the houses; the lower west rows leave the hill: the second 75 m west onto
      // the knob's own treads, the first onto the east terraces between the upper and lower groves, the third beside the
      // lower groves; the bench snap seats them at either terrain seed)
      { id: 'west-lower-orchard-1', species: 'oak', path: [[214, -2], [210, 4], [205, 9], [200, 13], [195, 18], [190, 23], [186, 28], [182, 33], [179, 38], [176, 44], [173, 50]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'west-lower-orchard-2', species: 'oak', path: [[-213.2, -6.6], [-220.5, -10.0], [-224.1, -16.0], [-224.9, -24.0], [-230.6, -28.6], [-236.7, -32.8], [-240.4, -38.8], [-244.0, -44.8], [-246.4, -51.7], [-250.5, -57.4], [-257.0, -61.4]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'west-lower-orchard-3', species: 'oak', path: [[206, -160], [211, -166], [218, -169], [223, -174], [228, -179], [234, -182], [240, -185], [245, -190], [250, -194], [257, -197], [262, -202]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'west-upper-orchard-1', species: 'oak', path: [[-198.6, 45.3], [-189.7, 42.7], [-184.4, 47.8], [-178.4, 51.6], [-172.4, 55.4], [-166.6, 59.6], [-160.0, 62.0], [-153.7, 64.9], [-145.0, 62.7], [-141.1, 71.1], [-134.7, 73.9]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'east-upper-orchard-1', species: 'oak', path: [[146.9, 78.7], [153.4, 84.8], [160.4, 85.4], [167.9, 80.0], [174.7, 83.1], [181.5, 85.7], [188.6, 83.9], [195.3, 88.4], [202.5, 86.6], [209.7, 83.7], [216.2, 90.3]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'east-lower-orchard-1', species: 'oak', path: [[202.2, -168.5], [205.2, -176.3], [213.2, -177.3], [217.0, -183.8], [221.2, -190.0], [228.0, -192.6], [235.4, -194.3], [239.2, -200.9], [244.6, -205.5], [252.6, -206.4], [257.9, -211.0]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'east-lower-orchard-2', species: 'oak', path: [[190.0, -176.7], [192.0, -185.7], [201.2, -185.0], [206.8, -189.2], [212.5, -193.4], [215.4, -201.1], [221.1, -205.3], [226.7, -209.5], [233.2, -212.4], [238.2, -217.4], [242.7, -223.1]], count: 11, width: 0.15, bench: { searchM: 10 } },
    ],
  },
  props: {
    // (2026-10-06, the coordinator: the old identity's timber bathhouse dropped — the Chouf kit builds the hammam)
    sourcedPalette: 'orchard',
    // The landmarks lane (round 2, 2026-10-06, the seat agreed with the map-revival lane): the square's Ottoman fountain
    // on its setts, turned to the village grid, set into the finished village (it vetoes its ground, landmarks/types.ts
    // `ground`: what the passes after it would stand there is left out, every other record stands where it stood). The
    // silk khan planned beside it is withdrawn: the valley's long sight lines run through the village, and the layout
    // brief's long-sight share (at least 0.03) stood at 0.0302 without it — a khan anywhere near the square cut 58 to 84
    // of the 1 247 long rays where 30 could go (it measured 0.028).
    landmarks: [
      { kind: 'path', x: 17.5, z: 5, yawDeg: 142, ground: 'veto', name: "the fountain's square", params: { length: 11, width: 11, surface: 'stone' } },
      { kind: 'fountain', x: 17.5, z: 5, yawDeg: 142, ground: 'veto', name: 'the Ottoman fountain', params: { style: 'ottoman', radius: 3 } },
      // (round 5; the coordinator's condition for the village's orphan band: "the stepped lanes must exist on the ground,
      // so the houses read as connected rather than stranded … paths, stairs and a ramped mule track from the cross road
      // up to the church square") the village's lanes: the stepped lane straight up the east face from the cross road's
      // bend to the square, between the two dar fronts (stone steps on the road's bank and on every riser, the terraces'
      // treads its landings); the mule stair up the south face on the graded track (terrain.terraces ramps) — a curb
      // across it at every riser and a long earth tread behind, its hairpins and its last bend landings; the paved square
      // before the church door
      { kind: 'stairway', x: -103.31, z: -18.65, yawDeg: -76.0, name: "the stepped lane from the cross road to the church square", params: { length: 41.5, width: 2.4 } },
      { kind: 'stairway', x: -121.05, z: -57.0, yawDeg: -90.0, name: "the mule stair along the hill's foot", params: { length: 41.1, width: 2.6, steps: 'cordonata', surface: 'earth', rise: 0.14, steep: 0.04 } },
      { kind: 'path', x: -144.0, z: -55.25, yawDeg: -29.74, name: "the mule stair's lower hairpin", params: { length: 7.23, width: 3.4, surface: 'earth' } },
      { kind: 'stairway', x: -129.5, z: -47.25, yawDeg: 68.04, name: "the mule stair's second flight, up the south-east face", params: { length: 30.63, width: 2.6, steps: 'cordonata', surface: 'earth', rise: 0.14, steep: 0.04 } },
      { kind: 'path', x: -115.0, z: -39.25, yawDeg: -29.74, name: "the mule stair's upper hairpin", params: { length: 7.23, width: 3.4, surface: 'earth' } },
      { kind: 'stairway', x: -128.0, z: -34.5, yawDeg: -75.96, name: "the mule stair's third flight, under the upper bench", params: { length: 21.94, width: 2.6, steps: 'cordonata', surface: 'earth', rise: 0.14, steep: 0.04 } },
      { kind: 'path', x: -138.86, z: -30.17, yawDeg: 40.6, name: "the mule stair's landing under the square", params: { length: 6.7, width: 3.4, surface: 'earth' } },
      { kind: 'stairway', x: -132.01, z: -22.18, yawDeg: 40.6, name: "the mule stair's last flight, up to the church square", params: { length: 14.74, width: 2.6, steps: 'cordonata', surface: 'earth', rise: 0.14, steep: 0.04 } },
      { kind: 'path', x: -126.3, z: -10, yawDeg: 90, name: 'the church square', params: { length: 10.6, width: 12.5, surface: 'stone' } },
    ],
    // the map-revival lane (2026-10-05): the Chouf kit (maps/regional/chouf.ts) builds the plan in the mountain
    // village's sandstone, every building where it stood
    architecture: 'chouf',
    // (round 5) no roadside houses: the houses strewn along the roads round the junction are the village on its hill;
    // the hammam keeps the plan's first seat on the bathhouse street south of the junction (the valley's public bath)
    plan: ['bathhouse'],
    maxSpread: 3.0,
    // (round 4; the landmarks lane lays the square's setts out to the house fronts round its sabil — the rectangle
    // (5.7, 3.2) (18.7, 13.3) (29.6, -0.8) (16.7, -10.9), yaw 142 — and this lane closes it) the houses that close the
    // square stand after the plan has placed its own, so every plan house keeps its seat; each front 0.5 m back from the
    // setts, toward the square: the souk's arcade on the south-east side (the south corner left open, a lane out toward
    // road 3), a store at the north-east side's end beside the plan's house there, a dar at the south-west side's south
    // end beside the plan's store. The south-west side's west end stays open (inside the 7.5 m road clearance of road 0).
    plannedSitesAfterPlan: true,
    plannedSites: [
      { structure: 'marketRow', x: 27.07, z: -6.89, yawDeg: -38.04, terrace: true },
      { structure: 'granary', x: 31.34, z: 3.09, yawDeg: -127.7, terrace: true },
      { structure: 'cottage', x: 10.57, z: -11.5, yawDeg: 52.08, terrace: true },
      ...VILLAGE_SITES,
    ],
    // (round 2, wave 123: "leftover Western forms … wood barns"): the war's own light structures in place of the timber
    // huts and the longhouse — a checkpoint hut, sentry posts, command and aid tents
    // (round 3, gauntlet wave 208: "modern tarps among the fields") no command or aid tents: the checkpoint hut and the
    // sentry posts only
    destructibleBuildings: ['checkpointhut', 'guardpost'],
    buildingLat: [11, 2], destructibleBuildingLat: [15, 3], sideSkip: 0.16, spacingPad: 7.5,
    tacticalBeats: [
      { id: 'village-packing-court', role: 'brawl', x: 70, z: 56, yawDeg: -90, structure: 'checkpointhut', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'western-orchard-watch', role: 'scout', x: -330, z: 140, yawDeg: 110, structure: 'guardpost', outcrop: { count: 4, radius: 8 } },
      { id: 'upper-harvest-store', role: 'support', x: 246, z: 238, yawDeg: -105, structure: 'guardpost', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.68,
    // Retaining/garden walls parallel the planted terraces, ending at the
    // working tracks. Shorter runs reclaim geometry from remote field edges.
    // (round 5, wave 252's "dark untextured block": the run from (-212, 22) crossed the terrace risers and stood its footing
    // as a tall dark face; it is gone with the village hill)
    wallRuns: [[-210, -112, -94, -84, 3], [92, 54, 242, 78, 3], [108, 110, 266, 130, 2], [-108, 90, -108, 142, 2], [122, -116, 262, -98, 3]],
    // (round 2, wave 123: hay bales and stacks are the Western farm's; the Chouf threshes on the roof and the floor)
    // (round 3, wave 208: "a storybook European well") no village well: the landmarks lane's Ottoman sabil is the square's water
    well: false, hayCrates: false, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 0, rocks: 138, outcrops: 20, craters: 48, rubblePiles: 10, cropFields: 7, sandbagLines: 12, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true,
      ids: ['marder1a3', 'ua_t84_oplot_m', 'm551_sheridan', 'pt91m', 'm1a1'] },
    // (round 2, wave 123: "picket and rail fencing"): dry stone walls along the lanes and round the yards; (round 3, wave
    // 208) no camps — no modern tarps in Deir el Qamar
    inhabit: { stalls: 4, benches: 4, coreClutter: 22, bales: 0, stooks: 0, pots: 8, laundry: 4, troughs: 2, handcarts: 4, carts: 4, trucks: 4, jeeps: 3, drumClusters: 3, camps: 0, modernClutter: 18, looseClutter: 20, roadFence: 'wallstone', yardFence: 'wallstone' },
  },
  // the map-revival lane (2026-10-05; the scenery lane's generators, world/scenery.ts): a Maronite cross at the village's
  // south entry and another on the western spur over the terraces, a cairn on the eastern flank's crest
  scenery: {
    landmarks: [
      { kind: 'waysidecross', x: -54, z: -112, yawDeg: 10, name: 'the cross at the village entry' },
      { kind: 'waysidecross', x: -318, z: -36, yawDeg: 90, name: 'the cross on the western spur' },
      { kind: 'cairn', x: 318, z: 40, name: 'the cairn on the eastern crest' },
    ],
  },

  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the valley's
  // forested mountains: steep and rounded, wooded to the crests, no snow or alpine rock (the Barouk's cedar ridge)
  // 2026-10-05 (the map-revival lane, round 2; gauntlet wave 123: "a flat, cardboard-lit jagged backdrop peak" and a
  // banded mountainside): Mount Lebanon is long rounded limestone ridges — pale rock on the steeper flanks, pine and
  // oak scrub below — not alpine peaks: the rolling ring and the upland panorama raised to the Barouk's bulk
  // (the border's land past the edge keeps its alpine landform; the ring's own relief rolls — horizonRelief ringStyle)
  // (round 4, wave 212: "jagged alpine-looking peaks on the skyline (Mount Lebanon's ridges are rounder)") the near ring's
  // ridges rolling, the far panorama's upland at its height
  horizon: { baseHex: 0x5c7154, amp: 0.9, style: 'rolling', ringStyle: 'rolling', treeline: 0.8, snowline: 2, panorama: { regional: 'upland', ampM: 450, treeline: 0.75, rockSlope: 0.35 }, forestHex: 0x2e513c, rockHex: 0x9c9a8a, haze: 0.9, grain: 0.55 },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.28, streets: 0.4, contrails: 0.3 },
  sky: { ...verdant.sky, sunElevationDeg: 28, sunAzimuthDeg: 132, turbidity: 4.5, fogDensity: 0.00058, fogTintHex: 0x99aaac, fogMix: 0.5, cloudOpacity: 0.95, cloudOpacity2: 0.62, sunIntensity: 3.9, hemiIntensity: 0.42 },
  minimap: { ...verdant.minimap, base: [89, 110, 67], hard: [116, 107, 85], soft: [55, 79, 56] },
  shot: { pos: [-244, 56, -256], look: [60, 1, 98] },
} satisfies import('./contracts.ts').MapCompositionConfig;
