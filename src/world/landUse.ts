// src/world/landUse.ts — the ground lane (2026-10-03, Opus 5.5 redesign; the gauntlet's wave-0 verdict: "WoT's
// Prokhorovka and the Breton bocage photo show patchworks of fields in distinct crops and colours, with boundaries,
// tracks and hedgerows. Ours is one uniform plain.").
//
// THREE-free. The land use of a battlefield: a field system laid over the open ground — blocks along the map's own
// heading (each row of blocks shifted against the next, so no boundary crosses the map on a grid), each block cut into
// one to `maxSplit` fields, every field one crop of its region's rotation (pasture, ripe wheat, barley, young green
// crop, plough, stubble, sunflower), a grass margin round every field, dirt tracks along some of the long boundaries
// and hedges along some of the short ones. The CPU twin (landUseAt) is the one source: the tiers that grow on the
// ground ask it directly (the tall grass stands as the crop), and the terrain material reads it baked once per map
// (bakeLandUseSteps, stacked under the ground mask; LAND_USE_GLSL decodes a texel) — 2026-10-03, the GPU fix: the
// per-pixel derivation of the parcels cost the 1080p frame about 2.7 ms at the field-side chase views.
//
// Every map without a row has no fields (strength 0); a row is the map's whole land-use authoring (no map-file edit).
//
// 2026-10-03 (the coordinator: one field system on both sides of the edge): the map-borders lane lays its parcels,
// hedgerows, woods and tracks past the playable edge on this grid (landUseAt), so the module stays pure, THREE-free
// and import-free. Regions now name their own crops: a rotation is up to seven slots of any crop kind (the material
// reads the slot's shares and the slot→kind table as uniforms), and a region's fields are bounded its own way — a
// grass margin with tracks and hedges, a polder's water ditches, a paddy's earth bunds or a karst field's dry stone
// walls.

export type LandRegion = 'steppe' | 'bocage' | 'temperate' | 'polder' | 'upland' | 'strip' | 'paddy' | 'terrace' | 'karst'
  | 'brownfield' | 'coalfield' | 'cityfloor' | 'citycourt' | 'cityslope' | 'cemetery' | 'park' | 'cityvacant' | 'citygarden'
  | 'worksfloor' | 'furnace' | 'sidings' | 'court' | 'cinder' | 'secano';

/** How a region's fields are bounded (the material's uLandE.z). */
export type LandBoundary = 'margin' | 'ditch' | 'bund' | 'wall';
const BOUNDARY_ID: Readonly<Record<LandBoundary, number>> = Object.freeze({ margin: 0, ditch: 1, bund: 2, wall: 3 });

export interface LandUseProfile {
  /** 0 = no fields; 1 = full crop colour. */
  strength: number;
  /** The field grid's heading in world XZ (radians; 0 = blocks run along +X). */
  heading: number;
  /** Block size along the heading (m) and across it (m). */
  blockU: number;
  blockV: number;
  /** A block is cut into 1..maxSplit fields. */
  maxSplit: number;
  /** Mean grass margin round a field (m). */
  marginM: number;
  /** Share of the long (row) boundaries that carry a dirt track. */
  trackShare: number;
  /** Share of the short boundaries that carry a hedge (the vegetation tier plants it). */
  hedgeShare: number;
  /** Amplitude (m) of the slow warp that bends the boundaries. */
  warpM: number;
  /** The crop rotation's region. */
  region: LandRegion;
  /** Salt of the field hash (two maps with one layout still crop differently). */
  salt: number;
  /**
   * 2026-10-05 (Ruinspires, the cities lane): the land use lies inside the village too — a city's yards, courts,
   * allotments and parks — with the town's wear laid over it (the material's uLandE.w; elsewhere the village keeps the
   * fields off).
   */
  urban?: boolean;
  /**
   * 2026-10-05 (Ironworks): an urban land use that is a works' ground — no grass between its lots: their margins the
   * works' trodden dirt, the stone kinds (ballast, gravel) dulled with the works' soot (the material's uLandE.w 2).
   */
  works?: boolean;
  /**
   * 2026-10-05 (Ruinspires): zones by map metres, the first a field's middle falls in naming its rotation, its track
   * and hedge shares; a field in none carries no land use (LAND_CROP_NONE in the bake). Without zones the whole map is
   * the profile's region.
   */
  zones?: readonly LandZone[];
}

/** A zone of a zoned land use (Ruinspires): a band of |z| (an x range), a rectangle or a disc, `mirror` adding its
 * rotation about (0, 0); its region's rotation and its own track and hedge shares (else the profile's). A zone decides
 * by a field's middle (the field is one zone's whole) — or, `cut` (Ironworks' sidings, yards and verges), by the point
 * itself: its line cuts the fields it crosses, straight and hard-edged as a works' ground is, and the fields' own
 * layout (their edges, tracks and hedges) is untouched by it. A band's `meander` measures its |z| from a river's line
 * z = ampM · sin(π x / halfPeriodM) instead of from z = 0 (an odd line, so the band keeps the map's rotation symmetry). */
export interface LandZone {
  region: LandRegion;
  band?: { zMin: number; zMax: number; xMin: number; xMax: number; meander?: { ampM: number; halfPeriodM: number } };
  rect?: { x0: number; x1: number; z0: number; z1: number };
  disc?: { x: number; z: number; r: number };
  /** A road's verge: within `w` metres of the polyline (Ironworks' diagonal works roads). */
  line?: { points: readonly (readonly [number, number])[]; w: number };
  /** A turned rectangle: centre, width (local x) and length (local z), its yaw (Ironworks' yards, as hardstands are). */
  box?: { x: number; z: number; w: number; l: number; yawDeg: number };
  mirror?: boolean;
  cut?: boolean;
  trackShare?: number;
  hedgeShare?: number;
}

/** Crop kinds (the shader's ids, 0..15). */
export const LAND_CROP = Object.freeze({
  pasture: 0, wheat: 1, barley: 2, green: 3, plough: 4, stubble: 5, sunflower: 6,
  // 2026-10-03: the regions of the rebuilt maps
  rowCrop: 7,     // potato, beet, vegetables: dark green rows over the soil
  paddyWater: 8,  // a flooded paddy: muddy water, a mirror of the sky, the young rice a faint green haze
  paddyGreen: 9,  // a growing paddy: one even bright green
  paddyRipe: 10,  // a ripe paddy: gold-green
  terraRossa: 11, // the karst's red soil, turned
  vineyard: 12,   // vine rows over the soil
  hay: 13,        // a mown meadow: pale stripes and windrows
  jute: 14,       // jute (the chars): tall, dark green
  slag: 15,       // an ironworks' tipped slag: black-grey, granular
  ballast: 16,    // crushed-stone ballast and hardcore: grey
  ruderal: 17,    // brownfield grass: patchy, dry, with bare ground between
  hardstanding: 18, // 2026-10-05 (Ruinspires): a city's hardstanding — patched asphalt and concrete pours, cracked, weeds in the cracks
  gravel: 19,     // 2026-10-05 (Ironworks): a works court's gravel — rounded stones and their fines, wheel-rutted, warm grey
} as const);
export type LandCropId = (typeof LAND_CROP)[keyof typeof LAND_CROP];

/**
 * Every crop's measured albedo (linear, the sward's tip where a sward grows) — the terrain draws it, the tall grass
 * and the tufts that stand as the crop take it (a sown field's own colour, not a multiplier on a biome's green), and
 * the map-borders lane colours its parcels past the edge with it. Ripe grain and straw 0.20–0.25, black earth under
 * the plough 0.03–0.06, terra rossa ~0.12, a young crop 0.10–0.13, rice green brighter than a cereal.
 */
export const LAND_CROP_ALBEDO: Readonly<Record<LandCropId, readonly [number, number, number]>> = Object.freeze({
  0: [0.092, 0.160, 0.045], // pasture: the calibrated meadow tip (groundRedux.ts MEADOW_TIP)
  1: [0.30, 0.22, 0.075],   // ripe wheat
  2: [0.33, 0.28, 0.12],    // barley
  3: [0.085, 0.148, 0.040], // young green crop (wave 14, verdant chase: "oversaturated lime … artificial turf"): the meadow's own
  //   hue a shade deeper — a crop tint divides by the biome's tip, so a bluer albedo turned the blades teal (hold 6)
  4: [0.050, 0.042, 0.034], // plough (black earth; the terrain uses its own soil layer)
  5: [0.30, 0.25, 0.13],    // stubble
  6: [0.045, 0.10, 0.025],  // sunflower foliage
  7: [0.050, 0.105, 0.030], // row crop foliage
  8: [0.040, 0.046, 0.040], // flooded paddy (muddy water)
  9: [0.085, 0.165, 0.036], // growing rice
  10: [0.26, 0.22, 0.085],  // ripe rice
  11: [0.16, 0.10, 0.075],  // terra rossa (a dull brick, not an orange floor)
  12: [0.060, 0.115, 0.035], // vine foliage
  13: [0.17, 0.20, 0.085],  // mown hay
  14: [0.045, 0.12, 0.032], // jute
  15: [0.075, 0.072, 0.070], // slag
  16: [0.16, 0.155, 0.15],  // ballast
  17: [0.20, 0.19, 0.10],   // ruderal brownfield grass (cured)
  18: [0.095, 0.094, 0.092], // hardstanding (asphalt with its repairs and some concrete; the material draws its own)
  19: [0.150, 0.140, 0.122], // a court's gravel (river gravel and its fines, a warm grey; the material draws its own)
});

/**
 * How the tiers that stand on the ground grow on each crop (tallGrass.ts, the tufts in vegetation.ts): `sward` — the
 * crop is a sward that grows tufts and blades (0 = bare: plough, water, turned soil, dense row foliage), its height
 * against the biome's sward and the share of candidates kept.
 */
// `weed`: the sward on a bare field is its weeds — the grass's own cured tones, not the field's albedo (wave 8, Saltwind's
// chase: the red earth "carpeted with evenly spaced lilac-purple grass cards" — blades tinted the soil's red)
export const LAND_CROP_GROWTH: Readonly<Record<LandCropId, Readonly<{ sward: boolean; height: number; keep: number; weed?: boolean }>>> = Object.freeze({
  0: { sward: true, height: 1, keep: -1 },     // pasture: the wild sward's own law (keep -1 = unchanged)
  // (the hold-2 ABBA: +1.1–1.3 ms GPU at the chase views of Amberford and Saltmere, whose cameras stand in or beside
  // sown fields — a sown field drew every candidate blade, taller, half again the wild sward's; now about its density)
  1: { sward: true, height: 1.1, keep: 0.75 },
  2: { sward: true, height: 1.0, keep: 0.75 },
  3: { sward: true, height: 0.75, keep: 0.65 },
  4: { sward: false, height: 0, keep: 0 },
  5: { sward: true, height: 0.24, keep: 0.55 },
  6: { sward: true, height: 1.6, keep: 0.7 },
  7: { sward: true, height: 0.55, keep: 0.45 },
  8: { sward: false, height: 0, keep: 0 },
  9: { sward: true, height: 0.6, keep: 0.8 },
  10: { sward: true, height: 0.75, keep: 0.75 },
  11: { sward: true, height: 0.5, keep: 0.12, weed: true }, // turned red earth: a few weeds
  12: { sward: true, height: 0.35, keep: 0.35, weed: true },
  13: { sward: true, height: 0.30, keep: 0.8 },
  14: { sward: true, height: 1.9, keep: 0.85 },
  15: { sward: false, height: 0, keep: 0 },
  16: { sward: true, height: 0.4, keep: 0.12, weed: true },
  17: { sward: true, height: 0.85, keep: 0.6 },
  18: { sward: true, height: 0.35, keep: 0.05, weed: true }, // a few weeds in the cracks
  19: { sward: true, height: 0.40, keep: 0.10, weed: true }, // a court's gravel: weeds along its edges and the ruts' crowns
});

/** Ruinspires' Miljacka: the river's line z = 60 sin(πx / 800) (maps/ruinspires.ts, the cities lane's valley). */
const MILJACKA = Object.freeze({ ampM: 60, halfPeriodM: 800 });

/** Each region's rotation: up to seven slots of [crop kind, share] (the material reads the shares and kinds, uLandC/D/E). */
const ROTATIONS: Readonly<Record<LandRegion, readonly (readonly [LandCropId, number])[]>> = Object.freeze({
  // the Kursk / Belgorod black earth: big wheat and barley strips, sunflower, plough of chernozem, little pasture
  steppe: [[0, 0.16], [1, 0.27], [2, 0.11], [3, 0.14], [4, 0.15], [5, 0.11], [6, 0.06]],
  // bocage: small fields, mostly grazing, some plough, hay and grain
  bocage: [[0, 0.50], [1, 0.12], [2, 0.06], [3, 0.12], [4, 0.12], [5, 0.08], [6, 0.0]],
  // central European mixed farming (Hesse, the Fulda gap): grain, pasture, plough and maize-dark rows
  temperate: [[0, 0.30], [1, 0.19], [2, 0.12], [3, 0.14], [4, 0.13], [5, 0.08], [6, 0.04]],
  // the Scheldt polders: long parcels between ditches — grazing, grain, potato and beet rows, a few ploughs
  polder: [[0, 0.40], [1, 0.18], [7, 0.16], [3, 0.10], [4, 0.08], [5, 0.08], [13, 0.0]],
  // an upland of hay meadows and pasture (the Eifel round the Roer dams): grass first, a little grain
  upland: [[0, 0.50], [13, 0.20], [3, 0.08], [1, 0.07], [4, 0.07], [5, 0.08], [2, 0.0]],
  // the strip fields of a Franconian / Saxon village (Gewannflur): many narrow strips, every crop of the rotation
  strip: [[0, 0.16], [1, 0.20], [2, 0.12], [3, 0.14], [4, 0.14], [7, 0.12], [5, 0.12]],
  // the chars of the Jamuna: small paddies, flooded, green and ripe, jute and a little grazing
  paddy: [[9, 0.38], [8, 0.22], [14, 0.15], [10, 0.10], [4, 0.07], [0, 0.08], [7, 0.0]],
  // a Japanese caldera floor (Aso): rectangular paddies, green and flooded, vegetable plots, meadow
  terrace: [[9, 0.44], [8, 0.20], [10, 0.10], [7, 0.10], [0, 0.16], [4, 0.0], [5, 0.0]],
  // the Dalmatian karst: small walled fields of red earth, vines, dry grazing and a little grain — the grain ripe in the
  // dry season (wave 39, Saltwind corner-ne: "a hard-edged, oversaturated bright-green rectangle in the mid-ground" was
  // a young green crop's plot between the walls, a tone no summer karst field carries)
  // (wave 177, Saltwind: "no exposed limestone anywhere"; 2026-10-08's wave 287: "real terra rossa is pocketed between
  // limestone") the karst's red fields are its few deep-soiled plots: half its walled ground is dry grazing, the
  // garrigue over thin soil (terrain.ts draws it cured, its red soil showing between the tussocks)
  karst: [[11, 0.20], [12, 0.18], [0, 0.46], [5, 0.08], [1, 0.08], [13, 0.0], [4, 0.0]],
  // an ironworks' ground (Völklingen on the Saar): plots of brownfield grass, tipped slag, ballast and hardcore,
  // rank grass and bare earth, between the works' tracks and the birch scrub that seeds itself along them
  brownfield: [[17, 0.40], [15, 0.22], [16, 0.18], [0, 0.12], [4, 0.08], [5, 0.0], [3, 0.0]],
  // a coalfield valley's farmland (the Ruhr's, Silesia's, the Valleys'): pasture and rough grazing gone ruderal round the
  // pits, small arable fields, and here and there a plot of tipped slag
  coalfield: [[0, 0.26], [17, 0.22], [4, 0.14], [5, 0.14], [1, 0.12], [3, 0.06], [15, 0.06]],
  // 2026-10-05, Ruinspires (Sarajevo under siege, the cities lane): the valley floor's hardstanding between the street
  // rows — patched asphalt and concrete pours, hardcore and compacted ground, rank grass in the gaps
  cityfloor: [[18, 0.62], [16, 0.16], [17, 0.22]],
  // the block interiors: courtyards and gardens — grass, rank grass over beaten earth, allotment beds, a dug plot, a yard
  citycourt: [[0, 0.34], [17, 0.28], [7, 0.20], [4, 0.08], [16, 0.10]],
  // the slopes above the terrace streets: allotments and orchards in strips along the contour, hay and grazing between
  cityslope: [[7, 0.28], [12, 0.22], [13, 0.20], [0, 0.20], [4, 0.10]],
  // a cemetery's mown grass
  cemetery: [[13, 1]],
  // a park's lawns, mown in part
  park: [[0, 0.75], [13, 0.25]],
  // 2026-10-05, Ironworks (the Völklingen works, March 1945; the cities lane): the works floor between the streets —
  // courts of gravel, ruderal grass gone over the idle plots, patched hardstanding, slag and hardcore tipped where they
  // were handy
  // (the lab's high view: five even shares drew a quilt of lots — the floor is mostly gravel and cinder, so neighbours
  // match more often than not)
  worksfloor: [[19, 0.34], [15, 0.26], [17, 0.18], [18, 0.12], [16, 0.10]],
  // round the blast furnaces: slag and cinder trodden flat, the cast floor's hardstanding, hardcore
  furnace: [[15, 0.70], [18, 0.16], [16, 0.14]],
  // the rail fan's sidings: ballast between and beside the tracks, cinder where the engines stood
  sidings: [[16, 0.80], [15, 0.20]],
  // a court's gravel (a small zone cuts few fields, each one crop: gravel the most of them), a paved or hardcore stand
  court: [[19, 0.80], [18, 0.12], [16, 0.08]],
  // the works roads' verges: black cinder, the court gravel spread out, a little rank grass
  cinder: [[15, 0.66], [19, 0.20], [17, 0.14]],
  // the secano of the Ronda tableland (map revival lane 2, 2026-10-05): dry-farmed campiña — wheat and barley ripe
  // and cut, the stubble, the fallow turned, the barbecho grazed (cured and patchy in summer, not a green pasture: wave
  // 108b's "hard straight seam between golden field and green pasture"), the plateau's vines, a field of sunflower
  secano: [[1, 0.28], [2, 0.16], [5, 0.22], [4, 0.14], [17, 0.10], [12, 0.06], [6, 0.04]],
  // (2026-10-07, the ground lane on the cities lane's Miljacka valley; waves 186/187: the cemeteries and the mosque's
  // mahala "on flat, bare brown dirt with stretched sand-ripple banding" — the old zones' allotment slope, its dug plots'
  // furrows read as dune ripples) the floor's back lots behind the avenue rows and the benches' orchards gone wild through
  // the siege: rank grass and weeds over the cleared plots, rubble here and there, nothing dug
  cityvacant: [[17, 0.52], [0, 0.38], [16, 0.10]],
  // the flanks up to the benches, the mahala round its houses: grass, mown and long, a few kitchen-garden beds and vine
  // arbours (few: their rows are the stripes the critics read as ripples), rank grass on the empty plots
  citygarden: [[0, 0.52], [13, 0.24], [7, 0.08], [12, 0.06], [17, 0.10]],
});

/** Each region's field boundary. */
const BOUNDARIES: Readonly<Record<LandRegion, LandBoundary>> = Object.freeze({
  steppe: 'margin', bocage: 'margin', temperate: 'margin', upland: 'margin', strip: 'margin',
  polder: 'ditch', paddy: 'bund', terrace: 'bund', karst: 'wall', brownfield: 'margin', coalfield: 'margin',
  cityfloor: 'margin', citycourt: 'margin', cityslope: 'margin', cemetery: 'margin', park: 'margin', cityvacant: 'margin',
  citygarden: 'margin',
  worksfloor: 'margin', furnace: 'margin', sidings: 'margin', court: 'margin', cinder: 'margin',
  secano: 'margin',
});

/** The rotation's cumulative shares at slots 0..5 (slot 6 takes the rest), normalised. */
function rotationCumulative(region: LandRegion): [number, number, number, number, number, number] {
  const table = ROTATIONS[region];
  let total = 0;
  for (const [, w] of table) total += w;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < 6; i++) { acc += (table[i]?.[1] ?? 0) / total; out.push(acc); }
  return out as [number, number, number, number, number, number];
}
/** The rotation's slot→kind table, packed five bits a slot: slots 0..3 and 4..6 (exact in a float32: < 2^24). */
function rotationKinds(region: LandRegion): [number, number] {
  const table = ROTATIONS[region];
  const kind = (i: number): number => (table[i]?.[0] ?? table[table.length - 1][0]) & 31;
  return [kind(0) + 32 * kind(1) + 1024 * kind(2) + 32768 * kind(3), kind(4) + 32 * kind(5) + 1024 * kind(6)];
}

const PROFILES: Readonly<Record<string, LandUseProfile>> = Object.freeze({
  // Amberford (Verdant): its establishing shot is set against WoT's Prokhorovka — long strip fields of the
  // black-earth steppe along the railway's heading, tracks between the rows, a few shelterbelt hedges
  verdant: {
    strength: 1, heading: 0.32, blockU: 230, blockV: 150, maxSplit: 3, marginM: 2.2, trackShare: 0.55, hedgeShare: 0.3,
    warpM: 26, region: 'steppe', salt: 17,
  },
  // Saltmere Coast (coastal), set against the Breton bocage (Monts d'Arrée): small irregular fields, mostly grazing,
  // hedged on most boundaries, few tracks
  coastal: {
    strength: 1, heading: -0.48, blockU: 120, blockV: 92, maxSplit: 2, marginM: 2.6, trackShare: 0.22, hedgeShare: 0.75,
    warpM: 30, region: 'bocage', salt: 29,
  },
  // Frontier (the Fulda gap): mixed central-European farming between the woods — medium fields, grain and pasture
  frontier: {
    strength: 1, heading: 0.95, blockU: 180, blockV: 120, maxSplit: 3, marginM: 2.0, trackShare: 0.45, hedgeShare: 0.4,
    warpM: 22, region: 'temperate', salt: 41,
  },
  // 2026-10-03, the rebuilt maps' regions (the maps lane through the coordinator). Each heading follows the map's own
  // roads (the length-weighted dominant road direction inside the square), so the fields line up with the lanes.
  // Polders (the Scheldt polders): long parcels at right angles to the dike roads (~76°), ditches on the long lines,
  // windbreak rows on some short ones; the land barely bends
  polders: {
    strength: 1, heading: -0.25, blockU: 260, blockV: 64, maxSplit: 2, marginM: 1.5, trackShare: 0.85, hedgeShare: 0.3,
    warpM: 8, region: 'polder', salt: 53,
  },
  // Reservoir (the Roer dams, the Eifel upland): hay meadows and pasture in small hedged fields (the Monschau hedges)
  reservoir: {
    strength: 1, heading: 0.14, blockU: 140, blockV: 95, maxSplit: 2, marginM: 2.4, trackShare: 0.3, hedgeShare: 0.65,
    warpM: 28, region: 'upland', salt: 61,
  },
  // Steinburg (a Franconian / Saxon hill town): the village's strip fields along its streets (~93°)
  urban: {
    strength: 1, heading: 1.62, blockU: 200, blockV: 84, maxSplit: 4, marginM: 1.2, trackShare: 0.5, hedgeShare: 0.15,
    warpM: 18, region: 'strip', salt: 67,
  },
  // Delta (the Jamuna chars): small paddies between earth bunds, a few raised paths, palm lines on some bunds (~60°)
  delta: {
    strength: 1, heading: 1.05, blockU: 80, blockV: 52, maxSplit: 3, marginM: 0.7, trackShare: 0.12, hedgeShare: 0.12,
    warpM: 12, region: 'paddy', salt: 71,
  },
  // Saltwind (the Dalmatian karst coast): small fields of red earth and vines inside dry stone walls (~68°)
  saltwind: {
    strength: 1, heading: 1.19, blockU: 64, blockV: 46, maxSplit: 2, marginM: 1.2, trackShare: 0.15, hedgeShare: 0.05,
    warpM: 16, region: 'karst', salt: 79,
  },
  // Obsidian Caldera (caldera: the Aso caldera's floor, the map-revival lane's Caldera round 2; gauntlet wave 114: "a
  // flat grey-beige plain ... Aso's floor is a patchwork of rice paddies, flooded or stubble, bunds, field roads"):
  // rectangular paddies between earth bunds, green and flooded, vegetable plots and meadow, a field road along some of
  // the long boundaries, a few windbreak hedges; the fields keep to the level floor (the material keeps them off the
  // cones, the lava shelves, the roads and the village)
  caldera: {
    strength: 1, heading: 0.18, blockU: 96, blockV: 58, maxSplit: 3, marginM: 0.8, trackShare: 0.32, hedgeShare: 0.14,
    warpM: 10, region: 'terrace', salt: 103,
  },
  // Ironworks (foundry: the Völklingen ironworks on the Saar, the maps lane's rebuild): brownfield plots between the
  // works' streets (an axis grid), birch scrub seeded along some of the plot lines, works tracks along others
  // (2026-10-05, the cities lane: "slag, black-grey cinder, round the blast furnaces and along the works roads; gravel in
  // the courts; ballast on every rail siding") the works' own ground inside its floor (urban: the land use lies inside
  // the village there), zoned on the works plan: the rail fan's sidings (mapKits.ts RAIL_YARD_LINES: the five lines at
  // x 40–76 and the two at x −66, −57), the blast furnace block (the casting house at (−74, −29), its stacks at
  // (−44, −36) and (−104, −64)), the loading court (foundry.ts workedGround), the works streets' verges (x and z of
  // 0 and ±258–262), the rest of the floor; past it the brownfield as it was. Every zone keeps the profile's track and
  // hedge shares and the layout is the one it was, so the hedge seats — the scrub's trees and their collision — and the
  // border's parcels past the edge stand where they stood
  foundry: {
    strength: 1, heading: 0, blockU: 96, blockV: 64, maxSplit: 3, marginM: 0.8, trackShare: 0.45, hedgeShare: 0.35,
    warpM: 18, region: 'brownfield', salt: 89, urban: true, works: true,
    zones: [
      // (cut: the works' own lines, on the mask's 2 m texels; mr1's built world at 9bb7490b3)
      // the blast furnaces' slag (the saar factory kit's ~12 × 19.6 m and its stoves and bunkers): the landmark, the four
      // works furnaces and the service court's donor
      ...[[-74.0, -29.0], [-20.6, 58.2], [-20.9, 232.9], [-278.2, 116.4], [20.2, -202.2], [117, -105]].map(([x, z]) => ({
        region: 'furnace' as const, disc: { x, z, r: 28 }, cut: true })),
      // the sidings' ballast (mapKits.ts RAIL_YARD_LINES, 3.5 m either side of each line) and the coal unloading strip
      ...[[40, -235, 235], [49, -235, 235], [58, -205, 210], [67, -175, 185], [76, -150, 160], [-66, -235, 235], [-57, -190, 200]]
        .map(([x, z0, z1]) => ({ region: 'sidings' as const, rect: { x0: x - 4.5, x1: x + 4.5, z0: z0 - 3, z1: z1 + 3 }, cut: true })),
      { region: 'sidings', rect: { x0: 81.5, x1: 93.5, z0: -55.5, z1: -6.5 }, cut: true },
      // the courts' and yards' gravel: round the casting yard and the west street's and the slag road's yards — 12 m of
      // gravel about each hardstand (the yards themselves stay paved: foundry.ts seats the zone-control discs "on paved
      // yards", and a paved apron keeps the land use off), the loading court and the service court
      { region: 'court', box: { x: 0, z: -72, w: 74, l: 74, yawDeg: 56 }, cut: true },
      { region: 'court', box: { x: -258, z: 50, w: 80, l: 80, yawDeg: 0 }, cut: true },
      { region: 'court', box: { x: 200, z: -176, w: 80, l: 80, yawDeg: 104 }, cut: true },
      { region: 'court', rect: { x0: 82, x1: 176, z0: -162, z1: -87 }, cut: true },
      { region: 'court', rect: { x0: 71, x1: 163, z0: -123, z1: -70 }, cut: true },
      // the works roads' verges: 14 m either side of the street grid's lines and of the three diagonal roads
      // (foundry.ts terrain.roads.paths)
      ...[0, -258, 258].map((x) => ({ region: 'cinder' as const, rect: { x0: x - 14, x1: x + 14, z0: -290, z1: 290 }, cut: true })),
      ...[0, -260, 262].map((z) => ({ region: 'cinder' as const, rect: { x0: -290, x1: 290, z0: z - 14, z1: z + 14 }, cut: true })),
      ...[
        [[-258, -225], [-120, -126], [48, -12], [220, 112], [258, 136]],
        [[-258, 211], [-248, 206], [-94, 118], [72, 26], [232, -86], [258, -108]],
        [[-258, -189], [-190, -210], [-42, -196], [104, -158], [248, -194], [258, -203]],
      ].map((points) => ({ region: 'cinder' as const, line: { points: points as [number, number][], w: 14 }, cut: true })),
      // the rest of the works floor (a field's middle decides), and past it the brownfield as it was
      { region: 'worksfloor', rect: { x0: -290, x1: 290, z0: -290, z1: 290 } },
      { region: 'brownfield', rect: { x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 } },
    ],
  },
  // Cinder Junction (railyard: a coalfield rail junction): the valley floor's fields and grazing round the yard, laid along
  // the main line (its chord rises 6.6 m per 100 m of easting); the graded yard itself is worn ground (the material's
  // village wear keeps the fields off it). (The hold-3 pairs: "a uniform, saturated green blanket".)
  railyard: {
    strength: 0.65, heading: 0.066, blockU: 84, blockV: 52, maxSplit: 3, marginM: 1.5, trackShare: 0.3, hedgeShare: 0.3,
    warpM: 14, region: 'coalfield', salt: 97,
  },
  // 2026-10-05, Ruinspires (the cities lane; Sarajevo under siege): the city's own ground inside the village, every zone
  // mirrored through the Square of the Republic as the map is. (2026-10-07, the ground lane on the cities lane's
  // Miljacka valley, 5c04ab6cc — waves 186/187: the cemeteries and the mosque "on flat, bare brown dirt with stretched
  // sand-ripple banding", the old zones' allotment slope under the new layout) the valley floor's hardstanding along the
  // river's own line (z = 60 sin(πx/800)), the back lots behind the avenue rows overgrown, the flanks up to the benches the
  // mahala's gardens, the benches' orchards gone wild, the two cemeteries' mown grass and the parks' lawns where the
  // cities lane put them; no hedge lines (the trees and bushes keep their seats), nothing past the city but the parks
  // that straddle its edge.
  ruinspires: {
    strength: 1, heading: 0, blockU: 48, blockV: 24, maxSplit: 3, marginM: 1.0, trackShare: 0.25, hedgeShare: 0,
    warpM: 6, region: 'citygarden', salt: 107, urban: true,
    zones: [
      { region: 'cemetery', rect: { x0: -80, x1: -20, z0: 226, z1: 262 }, mirror: true, trackShare: 0.5, hedgeShare: 0 },
      { region: 'park', disc: { x: -330, z: 322, r: 46 }, mirror: true, trackShare: 0.45, hedgeShare: 0 },
      { region: 'park', disc: { x: 236, z: 330, r: 40 }, mirror: true, trackShare: 0.45, hedgeShare: 0 },
      { region: 'cityfloor', band: { zMin: 0, zMax: 60, xMin: -360, xMax: 360, meander: MILJACKA }, trackShare: 0, hedgeShare: 0 },
      { region: 'cityvacant', band: { zMin: 60, zMax: 130, xMin: -360, xMax: 360, meander: MILJACKA }, trackShare: 0.2, hedgeShare: 0 },
      { region: 'citygarden', band: { zMin: 0, zMax: 280, xMin: -360, xMax: 360 }, trackShare: 0.3, hedgeShare: 0 },
      { region: 'cityvacant', band: { zMin: 280, zMax: 310, xMin: -360, xMax: 360 }, trackShare: 0.25, hedgeShare: 0 },
    ],
  },
  // Aegis Crossing (cliffbridge: Ronda and the Tajo, map revival lane 2, 2026-10-05): the open campiña of the tableland
  // in big dry-farmed blocks along the main road's north-south line (its length-weighted heading), tracks along many of
  // the long lines, almost no hedges (open country); the plough on the map's own soil layer (no per-region soil tone)
  cliffbridge: {
    strength: 1, heading: 1.571, blockU: 170, blockV: 110, maxSplit: 3, marginM: 2.0, trackShare: 0.4, hedgeShare: 0.05,
    warpM: 20, region: 'secano', salt: 103,
  },
  // (Orchard Valley has no row: its karst fields (2026-10-05) laid a cadastral quilt over the Chouf's terraces and most
  // of the establishing view's cost; the coordinator dropped it on 2026-10-06, and the terraces carry the valley's ground)
});

/** The map's land use, or null (no fields). */
export function resolveLandUseProfile(mapId: string | null | undefined): LandUseProfile | null {
  return PROFILES[mapId ?? ''] ?? null;
}

export function landUseProfileIds(): string[] {
  return Object.keys(PROFILES);
}

/** A region's field boundary (the map-borders lane draws the same past the edge). */
export function landUseBoundary(profile: LandUseProfile | null): LandBoundary {
  return profile ? BOUNDARIES[profile.region] : 'margin';
}

/**
 * The land use's quality tier (2026-10-04, the GPU bar: the coordinator's rule that Low must not pay more than High —
 * the block cost 2.7 ms at Low against 1.1–1.7 at High, the weakest GPUs paying the most). The material reads it as
 * uLandTier, kept current across preset changes:
 * 0 — the bake's crop on its exact edges only, one round of reads (Low and the phones' two lower tiers);
 * 1 — + its rows and tramlines, the crop's own grain, and the boundary features — headlands,
 *     margins, hedge banks, bunds, walls, tracks — at their means: no soil read, no edge noise (Medium, the phones' high);
 * 2 — the full block (High, Ultra).
 */
export function landUseTierOf(preset: string): 0 | 1 | 2 {
  return preset === 'high' || preset === 'ultra' ? 2 : preset === 'medium' || preset === 'mobile-high' ? 1 : 0;
}

/** The material's packing: five vec4 uniforms, no sampler (the program sits at the 16-unit budget). */
export function landUseUniformValues(profile: LandUseProfile | null): {
  landA: [number, number, number, number];
  landB: [number, number, number, number];
  landC: [number, number, number, number];
  landD: [number, number, number, number];
  landE: [number, number, number, number];
} {
  if (!profile || !(profile.strength > 0)) {
    return { landA: [0, 0, 200, 150], landB: [1, 2, 0, 0], landC: [0, 0, 1, 1], landD: [1, 1, 1, 1], landE: [0, 0, 0, 0] };
  }
  const c = rotationCumulative(profile.region);
  const kinds = rotationKinds(profile.region);
  return {
    landA: [Math.min(1, profile.strength), profile.heading, Math.max(40, profile.blockU), Math.max(24, profile.blockV)],
    landB: [Math.max(1, Math.min(4, Math.round(profile.maxSplit))), Math.max(0.5, profile.marginM),
      Math.min(1, Math.max(0, profile.trackShare)), Math.min(1, Math.max(0, profile.hedgeShare))],
    // (warp m, salt, the rotation's cumulative shares at slots 4 and 5); uLandD = its shares at slots 0..3
    landC: [Math.max(0, profile.warpM), profile.salt >>> 0, c[4], c[5]],
    landD: [c[0], c[1], c[2], c[3]],
    // the slots' crop kinds (five bits a slot: 0..3, 4..6), the boundary (margin 0, ditch 1, bund 2, wall 3)
    landE: [kinds[0], kinds[1], BOUNDARY_ID[BOUNDARIES[profile.region]], profile.urban ? (profile.works ? 2 : 1) : 0],
  };
}

// --------------------------------------------------------------------------------------------- the hash (shared)

const U32 = (x: number): number => x >>> 0;
/** lowbias32 (Wellons): identical to the GLSL lu_hash on uint. */
function luHash(x: number): number {
  x = U32(x ^ (x >>> 16));
  x = U32(Math.imul(x, 0x7feb352d));
  x = U32(x ^ (x >>> 15));
  x = U32(Math.imul(x, 0x846ca68b));
  x = U32(x ^ (x >>> 16));
  return x;
}
/** A cell (a, b) and a salt to 0..1 (24 bits) — the GLSL lu_rand. Cell indices are offset to stay positive. */
function luRand(a: number, b: number, salt: number): number {
  const h = luHash(U32(Math.imul(U32(a + 4096), 0x9e3779b1) ^ luHash(U32(U32(b + 4096) ^ U32(Math.imul(salt >>> 0, 0x85ebca6b))))));
  return (h >>> 8) / 16777216;
}

// --------------------------------------------------------------------------------------------- the CPU twin

export interface LandFieldSample {
  /** 0 outside the field system (strength 0); else 1. */
  active: number;
  crop: LandCropId;
  /** Metres to the field's nearest boundary. */
  edgeM: number;
  /** Metres to the nearer of the field's two row ends (where the rows stop and the tractor turns: the headland). */
  endM: number;
  /**
   * The signed offsets (m, in the warped grid's u / v axes) to the field's nearer edge across each axis: the edge lies
   * at qu − sU (qv − sV), so |sU| and |sV| are the distances to it and edgeM = min(|sU|, |sV|). The bake stores them so
   * the material rebuilds the exact distance at any point of a texel (they run linearly in the warped grid).
   */
  sU: number;
  sV: number;
  /** The field's block: cut into `split` fields along its u axis (alongU 1) or its v axis (0). */
  split: number;
  alongU: number;
  /** The field's grass margin (m): inside it the ground is the margin's rank grass, not the crop. */
  marginM: number;
  /** 1 on a dirt track (the track's own width), 0 off it. */
  track: number;
  /** 1 within a hedge's line (the vegetation tier's seat), 0 off it. */
  hedge: number;
  /** The field's row direction in world XZ (unit). */
  rowX: number;
  rowZ: number;
  /** A per-field 0..1 jitter (tone, density). */
  jitter: number;
  /** The field's id (stable integer). */
  id: number;
  /** The region's boundary: 0 margin (tracks are dirt), 1 ditch (tracks are water), 2 bund, 3 dry stone wall. */
  boundary: number;
  /** The crop's albedo (LAND_CROP_ALBEDO) and how a sward grows on it (LAND_CROP_GROWTH: 1/0, height, keep or -1). */
  tintR: number;
  tintG: number;
  tintB: number;
  sward: number;
  cropHeight: number;
  cropKeep: number;
  /** 1 when the field's sward is its weeds (cured grass tones, not the crop's albedo). */
  weed: number;
  /** 1 on an urban land use (LandUseProfile.urban): its fields lie inside the village too. */
  urban: number;
  /**
   * On a track's two wheel lanes: the signed offset from the nearer lane's wandering centre line in its own half-widths
   * (trackLaneMeander / trackLaneCentre / trackLaneHalfWidth; |laneQ| < 1 is the sunk lane, − toward the crown between
   * the lanes, + toward the verge); 1e9 off a track.
   * Optional: a sandboxed harness's own field sample may leave it out (the readers fall back to the straight lanes).
   */
  laneQ?: number;
}

export function createLandFieldSample(): LandFieldSample {
  return { active: 0, crop: 0, edgeM: 1e9, endM: 1e9, sU: 1e9, sV: 1e9, split: 1, alongU: 1, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0,
    jitter: 0, id: 0, boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0, urban: 0 };
}

/** The analytic warp of the boundaries (m): two slow sines per axis, identical in GLSL. */
function warpX(x: number, z: number): number {
  return Math.sin(x * 0.00523 + z * 0.00311 + 1.3) + 0.5 * Math.sin(x * -0.00197 + z * 0.00877 + 4.1);
}
function warpZ(x: number, z: number): number {
  return Math.sin(x * 0.00409 - z * 0.00587 + 2.7) + 0.5 * Math.sin(x * 0.00913 + z * 0.00241 + 0.6);
}

/** The slot a field's roll picks — the GLSL lu_crop on the same cumulative shares (the uniforms' float32 values). */
function cropFromRoll(c: Float64Array, roll: number): number {
  for (let i = 0; i < 6; i++) if (roll < c[i]) return i;
  return 6;
}

/** A profile's layout constants, resolved once (the uniforms' own packing and float32 shares). */
interface CompiledLandUse {
  ch: number; sh: number; blockU: number; blockV: number; maxSplit: number; marginM: number;
  trackShare: number; hedgeShare: number; warpM: number; salt: number; cum: Float64Array; kinds: Uint8Array;
  boundary: number; urban: number; zones: readonly CompiledLandZone[] | null;
}
/** A zone's test and its rotation (the same float32 packing as a profile's). */
interface CompiledLandZone { zone: LandZone; cum: Float64Array; kinds: Uint8Array; trackShare: number; hedgeShare: number }
/** A region's cumulative shares and slot kinds as the material packs them (float32 shares). */
function compileRotation(region: LandRegion): { cum: Float64Array; kinds: Uint8Array } {
  const c = rotationCumulative(region), k = rotationKinds(region);
  const cum = new Float64Array(6);
  for (let i = 0; i < 6; i++) cum[i] = Math.fround(c[i]);
  const kinds = new Uint8Array(7);
  for (let i = 0; i < 7; i++) kinds[i] = ((i < 4 ? Math.fround(k[0]) : Math.fround(k[1])) >> ((i < 4 ? i : i - 4) * 5)) & 31;
  return { cum, kinds };
}
/** Whether (x, z) lies in a zone (or, mirrored, in its rotation about (0, 0)). */
export function inLandZone(zone: LandZone, x: number, z: number): boolean {
  const test = (px: number, pz: number): boolean => {
    if (zone.band) {
      const m = zone.band.meander, dz = m ? pz - m.ampM * Math.sin((Math.PI * px) / m.halfPeriodM) : pz;
      return Math.abs(dz) >= zone.band.zMin && Math.abs(dz) < zone.band.zMax && px >= zone.band.xMin && px < zone.band.xMax;
    }
    if (zone.rect) return px >= zone.rect.x0 && px < zone.rect.x1 && pz >= zone.rect.z0 && pz < zone.rect.z1;
    if (zone.disc) return (px - zone.disc.x) ** 2 + (pz - zone.disc.z) ** 2 < zone.disc.r * zone.disc.r;
    if (zone.box) {
      const a = zone.box.yawDeg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), dx = px - zone.box.x, dz = pz - zone.box.z;
      // (the hardstand's own frame: local x = (cos, −sin), local z = (sin, cos) — terrain.ts stampHardstand)
      return Math.abs(dx * c - dz * sn) < zone.box.w * 0.5 && Math.abs(dx * sn + dz * c) < zone.box.l * 0.5;
    }
    if (zone.line) {
      const pts = zone.line.points, w2 = zone.line.w * zone.line.w;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
        if ((px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2 < w2) return true;
      }
    }
    return false;
  };
  return test(x, z) || (!!zone.mirror && test(-x, -z));
}
const compiled = new WeakMap<LandUseProfile, CompiledLandUse>();
function compile(profile: LandUseProfile): CompiledLandUse {
  let c = compiled.get(profile);
  if (c) return c;
  const v = landUseUniformValues(profile);
  const cum = new Float64Array(6);
  [...v.landD, v.landC[2], v.landC[3]].forEach((share, i) => { cum[i] = Math.fround(share); });
  const kinds = new Uint8Array(7);
  for (let i = 0; i < 7; i++) kinds[i] = ((i < 4 ? v.landE[0] : v.landE[1]) >> ((i < 4 ? i : i - 4) * 5)) & 31;
  c = {
    ch: Math.cos(v.landA[1]), sh: Math.sin(v.landA[1]), blockU: v.landA[2], blockV: v.landA[3],
    maxSplit: v.landB[0], marginM: v.landB[1], trackShare: v.landB[2], hedgeShare: v.landB[3],
    warpM: v.landC[0], salt: v.landC[1], cum, kinds, boundary: v.landE[2], urban: v.landE[3] > 0.5 ? 1 : 0,
    zones: profile.zones?.length ? profile.zones.map((zone) => ({ zone, ...compileRotation(zone.region),
      trackShare: Math.min(1, Math.max(0, zone.trackShare ?? profile.trackShare)),
      hedgeShare: Math.min(1, Math.max(0, zone.hedgeShare ?? profile.hedgeShare)) })) : null,
  };
  compiled.set(profile, c);
  return c;
}

/**
 * The field under (x, z): its crop, the distance to its boundary, whether a track or a hedge runs there and the row
 * direction — the CPU twin of LAND_USE_GLSL's lu_field (same hash, same warp, same layout). Pure and allocation-free
 * (a profile's constants are resolved once): ~0.16 µs a call (Node 24), cheap enough for a map-load sweep of the land past the
 * edge (the map-borders lane lays its parcels, hedgerows and tracks on this grid). The layout runs on unbounded past
 * the square; the cell hash keeps its period beyond ±160 km.
 */
export function landUseAt(profile: LandUseProfile | null, x: number, z: number, out: LandFieldSample): LandFieldSample {
  out.active = 0; out.crop = 0; out.edgeM = 1e9; out.endM = 1e9; out.sU = 1e9; out.sV = 1e9; out.split = 1; out.alongU = 1; out.marginM = 0; out.track = 0; out.hedge = 0; out.rowX = 1; out.rowZ = 0;
  out.jitter = 0; out.id = 0; out.boundary = 0; out.tintR = 0; out.tintG = 0; out.tintB = 0; out.sward = 1;
  out.cropHeight = 1; out.cropKeep = -1; out.weed = 0; out.urban = 0; out.laneQ = 1e9;
  if (!profile || !(profile.strength > 0)) return out;
  const { ch, sh, blockU, blockV, maxSplit, marginM, warpM, salt, boundary, urban, zones } = compile(profile);
  let { trackShare, hedgeShare, cum, kinds } = compile(profile);
  const px = x + warpX(x, z) * warpM, pz = z + warpZ(x, z) * warpM;
  const qu = ch * px + sh * pz, qv = -sh * px + ch * pz;
  const row = Math.floor(qv / blockV);
  const shift = luRand(row, 7, salt) * blockU;
  const uq = qu + shift;
  const col = Math.floor(uq / blockU);
  const lu = uq - col * blockU, lv = qv - row * blockV;
  const split = 1 + Math.min(maxSplit - 1, Math.floor(luRand(row, col, salt + 13) * maxSplit));
  const alongU = luRand(row, col, salt + 17) < 0.5;
  let k: number, s0: number, s1: number, rowAlongU: boolean;
  let edgeU: number, edgeV: number, sU: number, sV: number;
  if (alongU) {
    const w = blockU / split;
    k = Math.min(split - 1, Math.floor(lu / w));
    s0 = lu - k * w; s1 = w - s0;
    edgeU = Math.min(s0, s1);
    edgeV = Math.min(lv, blockV - lv);
    sU = s0 <= s1 ? s0 : -s1;
    sV = lv <= blockV - lv ? lv : lv - blockV;
    rowAlongU = w > blockV; // rows run along the field's long side
  } else {
    const w = blockV / split;
    k = Math.min(split - 1, Math.floor(lv / w));
    s0 = lv - k * w; s1 = w - s0;
    edgeV = Math.min(s0, s1);
    edgeU = Math.min(lu, blockU - lu);
    sV = s0 <= s1 ? s0 : -s1;
    sU = lu <= blockU - lu ? lu : lu - blockU;
    rowAlongU = blockU > w;
  }
  const fieldA = row, fieldB = col * 8 + k;
  if (zones) {
    // the zone of the field's middle (in the warped grid, turned back to the map — the warp's few metres aside), so a
    // field is one zone's whole: no zone's line cuts a field in two
    const w = (alongU ? blockU : blockV) / split;
    const mu = alongU ? col * blockU + (k + 0.5) * w - shift : col * blockU + blockU * 0.5 - shift;
    const mv = alongU ? row * blockV + blockV * 0.5 : row * blockV + (k + 0.5) * w;
    const mx = ch * mu - sh * mv, mz = sh * mu + ch * mv;
    let found: CompiledLandZone | null = null;
    for (const zn of zones) if (zn.zone.cut ? inLandZone(zn.zone, x, z) : inLandZone(zn.zone, mx, mz)) { found = zn; break; }
    if (!found) return out; // past the zones: no land use (the bake's LAND_CROP_NONE)
    cum = found.cum; kinds = found.kinds; trackShare = found.trackShare; hedgeShare = found.hedgeShare;
  }
  const crop = kinds[cropFromRoll(cum, luRand(fieldA, fieldB, salt + 23))] as LandCropId;
  // a long boundary (the row line) carries a track by its own line index and 120 m segment along it, so both blocks
  // either side agree; the short boundaries (block ends and the cuts) carry hedges by the block and cut index
  const lineIdx = lv < blockV * 0.5 ? row : row + 1;
  const segment = Math.floor(qu / 120);
  const trackOn = luRand(lineIdx, segment, salt + 31) < trackShare;
  const dLine = Math.min(lv, blockV - lv);
  out.track = trackOn ? 1 - smooth(1.6, 2.6, dLine) : 0;
  if (trackOn && dLine < 2.6) {
    // the wheel lanes wander along the track (the GLSL lu_laneC / lu_laneW): u the unwarped grid's along coordinate
    const u = ch * x + sh * z, sM = sV - trackLaneMeander(u), side = sM < 0 ? -1 : 1;
    out.laneQ = (Math.abs(sM) - trackLaneCentre(u, side)) / trackLaneHalfWidth(u, side);
  }
  const hedgeOn = luRand(row, col * 8 + (alongU ? k : 7), salt + 37) < hedgeShare;
  const dShort = alongU ? Math.min(edgeU, Math.min(lu, blockU - lu)) : Math.min(lu, blockU - lu);
  out.hedge = hedgeOn ? 1 - smooth(1.2, 2.4, dShort) : 0;
  out.active = 1;
  out.urban = urban;
  out.crop = crop;
  out.edgeM = Math.min(edgeU, edgeV);
  out.endM = rowAlongU ? edgeU : edgeV;
  out.sU = sU; out.sV = sV; out.split = split; out.alongU = alongU ? 1 : 0;
  // each field's own row direction: the long side's axis turned up to ±20° by the field's hash (wave 14: one direction
  // per parcel, varied between parcels — never the block grid's two axes alternating as a woven crosshatch)
  const r0x = rowAlongU ? ch : -sh, r0z = rowAlongU ? sh : ch;
  const ra = (luRand(fieldA, fieldB, salt + 41) - 0.5) * 0.7, rc = Math.cos(ra), rs = Math.sin(ra);
  out.rowX = r0x * rc - r0z * rs; out.rowZ = r0x * rs + r0z * rc;
  out.jitter = luRand(fieldA, fieldB, salt + 29);
  // the margin the material draws: a grass margin's own width; a bund's and a wall's fixed footing (LAND_USE_GLSL's
  // users in terrain.ts: the field starts at 0.85 m past a bund, 1.45 m past a wall)
  out.marginM = boundary > 2.5 ? 1.2 : boundary > 1.5 ? 0.7 : marginM * (0.7 + 0.6 * out.jitter);
  out.boundary = boundary;
  const albedo = LAND_CROP_ALBEDO[crop], growth = LAND_CROP_GROWTH[crop];
  out.tintR = albedo[0]; out.tintG = albedo[1]; out.tintB = albedo[2];
  out.sward = growth.sward ? 1 : 0; out.cropHeight = growth.height; out.cropKeep = growth.keep; out.weed = growth.weed ? 1 : 0;
  out.id = (U32(Math.imul(fieldA + 4096, 65537) ^ (fieldB + 4096)) % 1000003);
  return out;
}

/**
 * A farm track's wheel lanes (wave 83, Verdant: "crisp, uniform dark-grey stripes straight into the distance like painted
 * rails"; wave 86: "constant-width strips"): each lane's centre wanders ±0.11 m about its line 0.85 m from the track's
 * (and a few centimetres by the metre), and its half-width swells and narrows 0.12–0.36 m along the track over 5–17 m
 * (wave 88: the swell of centimetres was not visible at the camera's range), the two lanes on their own phases. u is the track's along coordinate — the
 * unwarped grid's u (the slow boundary warp turns a track by well under a degree across a lane) — and side ±1 the side
 * of the track's line (the sign of sV). LAND_USE_GLSL's lu_laneC and lu_laneW are the same sums; the material sinks
 * the lanes there and the grass tiers keep them bare (tallGrass.ts, vegetation.ts: laneQ).
 */
/** The wheel lanes' common drift across the track (m): both lanes and the crown between them meander ±0.48 m about the
 * track's line over 60–150 m — no farm track is ruled (LAND_USE_GLSL lu_laneM). */
export function trackLaneMeander(u: number): number {
  return 0.30 * Math.sin(u * 0.105 + 0.7) + 0.18 * Math.sin(u * 0.043 + 2.3);
}
export function trackLaneCentre(u: number, side: number): number {
  return 0.85 + 0.11 * (0.50 * Math.sin(u * 0.53 + side * 1.9) + 0.32 * Math.sin(u * 1.37 + side * 0.7 + 1.1)
    + 0.18 * Math.sin(u * 3.11 + side * 2.3 + 0.4)) + 0.025 * Math.sin(u * 7.9 + side * 3.1);
}
export function trackLaneHalfWidth(u: number, side: number): number {
  return 0.24 * (1 + 0.32 * Math.sin(u * 0.37 + side * 2.6 + 0.4) + 0.16 * Math.sin(u * 1.13 + side * 1.3 + 2.0));
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// --------------------------------------------------------------------------------------------- the bake

/** The bake's first layer's R channel: the crop kind in its low five bits, then the track and the hedge flags. */
export const LAND_BAKE_TRACK_BIT = 32;
/** 2026-10-05: the crop code of a texel no zone of a zoned land use holds (Ruinspires): the material draws no field. */
export const LAND_CROP_NONE = 31;
export const LAND_BAKE_HEDGE_BIT = 64;
/** Set when the field's block is cut along its u axis (its fields are blockU / split by blockV). */
export const LAND_BAKE_ALONG_U_BIT = 128;
/** The signed edge offsets' 16-bit code: 256 steps a metre around 32768 (±128 m, 4 mm steps). */
const OFFSET_SCALE = 256, OFFSET_ZERO = 32768;
/** The bake's layers (RGBA8, n × n each): A the field, B its signed edge offsets, C the warp's local Jacobian. */
export const LAND_BAKE_LAYERS = 3;
/**
 * The range of the warp's Jacobian times its metres (|warpM · ∂w/∂x| ≤ 0.27 at the 30 m warp): layer C codes each of
 * its four entries in 8 bits over ±0.32 (2.5e-3 a step — under 4 mm over the half-diagonal of a 2 m texel).
 */
export const LAND_WARP_K_RANGE = 0.32;
const warpCode = (k: number): number => Math.min(255, Math.max(0, Math.round((k / LAND_WARP_K_RANGE * 0.5 + 0.5) * 255)));
/**
 * The warp's metres times its Jacobian at (x, z) — ∂(warpX, warpZ)/∂(x, z), the analytic derivative of the two slow
 * sines per axis — into out[0..3] = (∂wx/∂x, ∂wx/∂z, ∂wz/∂x, ∂wz/∂z) · warpM. The material carries a texel's offsets to a
 * pixel through it (the warp is near-linear over a texel: its curvature costs under 3 mm there) instead of evaluating
 * the warp twice a pixel.
 */
function warpJacobian(x: number, z: number, warpM: number, out: Float64Array): void {
  const c1 = Math.cos(x * 0.00523 + z * 0.00311 + 1.3), c2 = Math.cos(x * -0.00197 + z * 0.00877 + 4.1);
  const c3 = Math.cos(x * 0.00409 - z * 0.00587 + 2.7), c4 = Math.cos(x * 0.00913 + z * 0.00241 + 0.6);
  out[0] = warpM * (0.00523 * c1 - 0.5 * 0.00197 * c2);
  out[1] = warpM * (0.00311 * c1 + 0.5 * 0.00877 * c2);
  out[2] = warpM * (0.00409 * c3 + 0.5 * 0.00913 * c4);
  out[3] = warpM * (-0.00587 * c3 + 0.5 * 0.00241 * c4);
}
const offsetCode = (m: number): number => Math.min(65535, Math.max(0, Math.round(m * OFFSET_SCALE + OFFSET_ZERO)));

/**
 * (2026-10-07, the ground lane on Ruinspires' Miljacka valley — waves 186/187: the city's gardens and cemeteries "flat,
 * bare brown dirt") an urban land use sets the town's wear from its own parcels. The mask's A (the village's wear: the
 * material's uTownWear dirt, and the urban parcels' wear laid over their crops) is kept on the hardstanding, the rubble,
 * a track and past the land use; rank grass keeps two thirds of it, the beds and arbours a quarter, the grass and the
 * mown grass a sixth (their own trodden paths). In place on the mask's RGBA8 data; the bake runs at the interior mask's
 * texel scale (n = the mask's width), so a bake texel is the mask texel of the same index.
 */
export const URBAN_PARCEL_WEAR: Readonly<Partial<Record<LandCropId, number>>> = Object.freeze({
  [LAND_CROP.pasture]: 0.16, [LAND_CROP.hay]: 0.16, [LAND_CROP.rowCrop]: 0.25, [LAND_CROP.vineyard]: 0.25,
  [LAND_CROP.ruderal]: 0.65,
});
export function applyUrbanParcelWear(mask: Uint8Array, bake: Uint8Array, n: number): void {
  if (mask.length < n * n * 4 || bake.length < n * n * 4) throw new Error('applyUrbanParcelWear: the mask and the bake hold n × n RGBA8 texels');
  for (let k = 0; k < n * n; k++) {
    const b = bake[k * 4];
    if (b & LAND_BAKE_TRACK_BIT) continue;
    const f = URBAN_PARCEL_WEAR[(b & 31) as LandCropId];
    if (f !== undefined) mask[k * 4 + 3] = Math.round(mask[k * 4 + 3] * f);
  }
}

/**
 * The land use baked for the terrain material (2026-10-03, the GPU fix): this twin at every texel centre of an n × n
 * grid over the square (row 0 at z = -mapSize / 2, as the ground mask), two RGBA8 layers one after the other in `out`
 * (each n × n × 4), every channel read exactly (texelFetch, level 0):
 *  - layer A: R the crop kind | LAND_BAKE_TRACK_BIT where a track runs along the field's long boundary here |
 *    LAND_BAKE_HEDGE_BIT where a hedge runs along its short one | LAND_BAKE_ALONG_U_BIT when its block is cut along u;
 *    G the field's jitter (six bits) and its block's cut count − 1 (two); B, A the row direction's turn (16 bits);
 *  - layer B: R, G the signed offset sU and B, A sV (16 bits each, landUseAt's) — the material adds the warped grid's
 *    own offset from the texel centre to them, so the distance to the boundary is exact anywhere in the texel (a
 *    filtered unsigned distance clipped the zero at every boundary line: walls, bunds and ditches vanished).
 * A generator: it yields every `rowsPerSlice` rows so a build step never runs long. A map without a field system bakes
 * nothing (the material skips the block).
 */
export function* bakeLandUseSteps(
  profile: LandUseProfile | null, n: number, mapSize: number, out: Uint8Array, rowsPerSlice = 64,
): Generator<void, Uint8Array, void> {
  if (out.length !== n * n * 4 * LAND_BAKE_LAYERS) throw new Error('bakeLandUseSteps: the output holds three n × n RGBA8 layers');
  const sample = createLandFieldSample();
  const layerB = n * n * 4, layerC = n * n * 8;
  const warpM = profile && profile.strength > 0 ? compile(profile).warpM : 0, jac = new Float64Array(4);
  for (let j = 0; j < n; j++) {
    const z = ((j + 0.5) / n - 0.5) * mapSize;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * mapSize;
      landUseAt(profile, x, z, sample);
      const k = (j * n + i) * 4;
      out[k] = (sample.active ? sample.crop & 31 : LAND_CROP_NONE) | (sample.track > 0 ? LAND_BAKE_TRACK_BIT : 0)
        | (sample.hedge > 0 ? LAND_BAKE_HEDGE_BIT : 0) | (sample.alongU ? LAND_BAKE_ALONG_U_BIT : 0);
      out[k + 1] = (Math.min(63, Math.round(sample.jitter * 63)) << 2) | ((sample.split - 1) & 3);
      const turn = Math.atan2(sample.rowZ, sample.rowX) / (2 * Math.PI);
      const code = Math.round((turn - Math.floor(turn)) * 65536) & 65535;
      out[k + 2] = code >> 8; out[k + 3] = code & 255;
      const u = offsetCode(sample.sU), v = offsetCode(sample.sV);
      out[layerB + k] = u >> 8; out[layerB + k + 1] = u & 255;
      out[layerB + k + 2] = v >> 8; out[layerB + k + 3] = v & 255;
      warpJacobian(x, z, warpM, jac);
      out[layerC + k] = warpCode(jac[0]); out[layerC + k + 1] = warpCode(jac[1]);
      out[layerC + k + 2] = warpCode(jac[2]); out[layerC + k + 3] = warpCode(jac[3]);
    }
    if ((j + 1) % rowsPerSlice === 0 && j + 1 < n) yield;
  }
  return out;
}

// --------------------------------------------------------------------------------------------- the GLSL

/**
 * The terrain material's land use (declared in the splat fragment's globals, after the ground mask's sampler and its
 * stack uniforms): uLandA = (strength, heading, blockU, blockV), uLandB = (maxSplit, margin m, track share, hedge
 * share), uLandC..E the rotation (read by the twin's packing receipt and the border lane); uLandBake = (the bake's
 * texels a side, the square's size m, its first row in the stacked mask, 1 / the stack's width). lu_field decodes the
 * bake (bakeLandUseSteps) at a world point: the crop, the boundary distance (one filtered read), the track and hedge
 * weights over that distance, the row direction and the field's jitter — the numbers landUseAt computes, at the
 * bake's texel scale.
 */
export const LAND_USE_GLSL = /* glsl */`
uniform vec4 uLandA;
uniform vec4 uLandB;
uniform vec4 uLandC;
uniform vec4 uLandD;
uniform vec4 uLandE;
uniform vec4 uLandBake;
uniform float uLandTier; // landUseTierOf: 0 the bake's crop on its edges, 1 + the cheap reads, 2 the full block
uniform vec2 uLandRot; // (cos, sin) of the field grid's heading (uLandA.y), once on the CPU
// the bake's three texels at a world point (the material reads them at the top of the splat, with the ground mask's own
// read, and decodes them where it draws the fields: on a light frame nothing else would hide their latency)
void lu_fetch(vec2 p, out vec4 a, out vec4 b, out vec4 k, out ivec2 t) {
  float n = uLandBake.x;
  t = clamp(ivec2(floor((p / uLandBake.y + 0.5) * n)), ivec2(0), ivec2(int(n) - 1));
  int row0 = int(uLandBake.z + 0.5);
  a = texelFetch(uMask, t + ivec2(0, row0), 0);
  b = texelFetch(uMask, t + ivec2(0, row0 + int(n)), 0);
  k = texelFetch(uMask, t + ivec2(0, row0 + 2 * int(n)), 0);
}
void lu_decode(vec2 p, vec4 a, vec4 b, vec4 k, ivec2 t, out float crop, out float edgeM, out float track, out vec2 rowDir, out float jitter, out float hedge) {
  float n = uLandBake.x;
  // the texel's signed offsets to the field's nearer edge across each axis, carried to p along the warped grid — through
  // the warp's Jacobian at the texel's centre (layer C, landUse.ts warpJacobian) and the grid's heading: no trigonometry
  vec2 dp = p - ((vec2(t) + 0.5) / n - 0.5) * uLandBake.y;
  vec4 K = (k * 2.0 - 1.0) * ${LAND_WARP_K_RANGE};
  vec2 dw = dp + vec2(K.x * dp.x + K.y * dp.y, K.z * dp.x + K.w * dp.y);
  vec2 d = vec2(uLandRot.x * dw.x + uLandRot.y * dw.y, -uLandRot.y * dw.x + uLandRot.x * dw.y);
  float tU = (b.r * 65280.0 + b.g * 255.0 - ${OFFSET_ZERO}.0) / ${OFFSET_SCALE}.0, tV = (b.b * 65280.0 + b.a * 255.0 - ${OFFSET_ZERO}.0) / ${OFFSET_SCALE}.0;
  float sU = tU + d.x, sV = tV + d.y;
  int r = int(a.r * 255.0 + 0.5), g = int(a.g * 255.0 + 0.5);
  // the field's own extent along each axis (its block's, cut split ways along one): within the field the distance to
  // an axis's edges is min(|s|, width − |s|), past its medial line too; a point across the texel field's edge lies in
  // the neighbour, whose other edges the texel does not know, so its distance is the crossed line's
  float split = float((g & 3) + 1);
  bool alongU = (r & ${LAND_BAKE_ALONG_U_BIT}) != 0;
  float wU = alongU ? uLandA.z / split : uLandA.z, wV = alongU ? uLandA.w : uLandA.w / split;
  bool crossU = sU * tU < 0.0, crossV = sV * tV < 0.0;
  float eU = crossU ? abs(sU) : min(abs(sU), wU - abs(sU)), eV = crossV ? abs(sV) : min(abs(sV), wV - abs(sV));
  edgeM = crossV == crossU ? min(eU, eV) : crossV ? abs(sV) : abs(sU);
  crop = float(r & 31);
  track = (r & ${LAND_BAKE_TRACK_BIT}) != 0 ? 1.0 - smoothstep(1.6, 2.6, abs(sV)) : 0.0;
  hedge = (r & ${LAND_BAKE_HEDGE_BIT}) != 0 ? 1.0 - smoothstep(1.2, 2.4, abs(sU)) : 0.0;
  float turn = (a.b * 65280.0 + a.a * 255.0) * (6.2831853 / 65536.0);
  rowDir = vec2(cos(turn), sin(turn));
  jitter = float(g >> 2) / 63.0;
}
// the signed offset to the field's long edge at p (lu_decode's own reconstruction of sV): which side of a track's line p
// lies on, for the wheel lanes' relief (2026-10-04, the ground lane)
float lu_sV(vec2 p, vec4 b, vec4 k, ivec2 t) {
  vec2 dp = p - ((vec2(t) + 0.5) / uLandBake.x - 0.5) * uLandBake.y;
  vec4 K = (k * 2.0 - 1.0) * ${LAND_WARP_K_RANGE};
  vec2 dw = dp + vec2(K.x * dp.x + K.y * dp.y, K.z * dp.x + K.w * dp.y);
  return (b.b * 65280.0 + b.a * 255.0 - ${OFFSET_ZERO}.0) / ${OFFSET_SCALE}.0 - uLandRot.y * dw.x + uLandRot.x * dw.y;
}
// a track's wheel lanes along its line: the centre's distance from the lanes' meandering mid-line and the half-width (m)
// at the along coordinate u = dot(p, uLandRot), side ±1 the mid-line's side (landUse.ts trackLaneCentre /
// trackLaneHalfWidth / trackLaneMeander)
float lu_laneC(float u, float side) {
  return 0.85 + 0.11 * (0.50 * sin(u * 0.53 + side * 1.9) + 0.32 * sin(u * 1.37 + side * 0.7 + 1.1) + 0.18 * sin(u * 3.11 + side * 2.3 + 0.4))
    + 0.025 * sin(u * 7.9 + side * 3.1);
}
float lu_laneW(float u, float side) { return 0.24 * (1.0 + 0.32 * sin(u * 0.37 + side * 2.6 + 0.4) + 0.16 * sin(u * 1.13 + side * 1.3 + 2.0)); }
float lu_laneM(float u) { return 0.30 * sin(u * 0.105 + 0.7) + 0.18 * sin(u * 0.043 + 2.3); } // the lanes' common meander
void lu_field(vec2 p, out float crop, out float edgeM, out float track, out vec2 rowDir, out float jitter, out float hedge) {
  vec4 a, b, k; ivec2 t;
  lu_fetch(p, a, b, k, t);
  lu_decode(p, a, b, k, t, crop, edgeM, track, rowDir, jitter, hedge);
}
`;
