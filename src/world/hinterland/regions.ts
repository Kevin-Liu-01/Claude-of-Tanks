// src/world/hinterland/regions.ts — the Hinterland's region library (HL-0, the horizons stream, 2026-10-13).
//
// The owner (2026-10-12): "for the horizon / skyboxes / border areas, the point is we have to get rid of the old stuff and
// usher in new designs that are great like we did for verdant" — "im not interested in making everythign just look like
// verdant - i want things to be built so that they end up like how verdant turned out, with all the new buildings and
// other stuff in distances". B-architecture §4.0: the landscape counterpart of the regional building kits. Each region
// is one complete, place-true vocabulary for the land past the edge — its field system, its settlement pattern and
// density, its building kit and the verticals it raises on the skyline, its woods and hedges, its rock (strata, scree,
// snow, gullies) and its far country. A map picks one region in its `hinterland` block and overrides only what its own
// place needs, so most maps author 20–50 lines.
//
// Pure data, THREE-free and import-free apart from types: the field, the planner, the tools and the receipts read it in
// Node. Densities are B-architecture's (inferred from the reference places; each map item confirms its own against the
// place). Colours are linear-ish display hexes the land material decodes; heights are metres above the map's own ground
// (never above sea level: CRITIQUE #12's Japfü correction).
import type { LandRegion } from '../landUse.ts';
import type { TreeSpecies } from '../treeSpecies.ts';

/** The 26 regions of B-architecture §4.0, for the 33 maps. */
export type HinterlandRegionId =
  | 'forestSteppe' | 'bocage' | 'centralUplands' | 'coalfield' | 'karstCoast' | 'fjord' | 'tatraValley' | 'alpineCol'
  | 'saharaOasis' | 'wadiRum' | 'coloradoPlateau' | 'volcanicCaldera' | 'nagaHills' | 'bengalDelta' | 'mekongMangrove'
  | 'zeelandPolder' | 'yangtzeCity' | 'bosnianValley' | 'kyivPinelands' | 'tasmanianMine' | 'andalusianRonda'
  | 'longleafFlatwoods' | 'levantOrchard' | 'polarStation' | 'mars' | 'moon';

/** How the place lives on its land (B-architecture §4.0's settlement column). */
export type HinterlandSettlementPattern =
  | 'streetVillage' | 'nucleated' | 'dispersedHamlets' | 'colony' | 'shoreFarms' | 'dykeVillage' | 'ksar' | 'stiltVillage'
  | 'hillVillage' | 'cityEdge' | 'mineCamp' | 'ranch' | 'whiteTown' | 'station' | 'none';

/** The vertical landmarks a region raises on its skyline (landmarks/*, regional/skyline.ts). */
export type HinterlandVerticalKind =
  | 'churchTower' | 'spire' | 'onionDome' | 'campanile' | 'minaret' | 'pagoda' | 'elevator' | 'waterTower' | 'windmill'
  | 'postMill' | 'chimney' | 'headframe' | 'coolingTower' | 'slagTip' | 'radome' | 'mast' | 'pylonLine' | 'lighthouse'
  | 'castle' | 'kurgan' | 'tvTower' | 'kilnChimney' | 'lookoutTower' | 'burnerCone' | 'damWall'
  // (HOR-05, Whiteout: the DEW Line station's tropospheric-scatter billboards and its fuel farm)
  | 'tropoScatter' | 'fuelTanks';

/** The far country's form (bands D–E): the panorama's regional classes, carried over as geometry (B-arch §4.6). */
export type HinterlandFarForm =
  | 'plain' | 'upland' | 'forested' | 'ridges' | 'karstRidge' | 'alpine' | 'polar' | 'iceSheet' | 'tables' | 'jebels'
  | 'volcanicField' | 'erg' | 'martian' | 'lunar';

/** How the woods grow in the outland: their habit decides where the vegetation planner puts them (§4.4). */
export type HinterlandWoodsHabit =
  | 'hedgerow' | 'shelterbelt' | 'dikeRows' | 'balkaWoods' | 'forest' | 'pineForest' | 'jungle' | 'mangrove' | 'palmGroves'
  | 'orchards' | 'maquis' | 'scrub' | 'none';

/** A region's rock: what the near ranges are made of and how they weather (the land material's geology layer, §4.3). */
export interface HinterlandGeology {
  /** The rock kind (named for the material's tone tables and the critics' reference). */
  rock: 'chalk' | 'limestone' | 'sandstone' | 'granite' | 'gneiss' | 'basalt' | 'shale' | 'clay' | 'loess' | 'schist'
    | 'quartzite' | 'tuff' | 'regolith' | 'ice';
  /** The rock's base colour (sRGB hex). */
  rockHex: number;
  /** Strata: bed thickness (m), dip (deg), the colour step between beds (0..1). */
  strata: { bedM: number; dipDeg: number; contrast: number };
  /** 0..1: talus aprons below walls. */
  scree: number;
  /** The snow law: the line (m above the map's ground; Infinity none), the steepest slope that holds it (deg), wind scour 0..1. */
  snow: { lineM: number; maxSlopeDeg: number; scour: number };
  /** 0..1: gullies cut down the faces (couloirs on a mountain, ravines on a scarp). */
  gullies: number;
  /** 0..1: how eroded the forms are (rounded downs 0 … sharp crests and spurs 1). */
  erosion: number;
  /** The slope (deg) past which bare rock shows through the cover. */
  rockSlopeDeg: number;
  /** The forest's altitude band (m above the map's ground): it grows from lo to hi, thins past hi (the treeline). */
  forestBandM: readonly [number, number];
  /** Desert sand on the low ground and varnish down the walls (0..1 each). */
  sand: number;
  varnish: number;
}

/** A region's default far country (bands D–E): one or more sectors round the compass (§4.6). */
export interface HinterlandFarDefault {
  form: HinterlandFarForm;
  /** Relief above the map's own ground (m). */
  reliefM: number;
  /** Where the far country stands (km from the centre). */
  distKm: readonly [number, number];
  /** Successive ridgelines (0–3) placed at authored distances behind the near frame. */
  layers: number;
  /** The air's clarity for the far haze (1 the default; under 1 a clear mountain air, its ranges crisp at 10 km). */
  air?: number;
  /** The canopy (m) standing on the far ground (the flat countries' skyline is their trees). */
  treesM: number;
}

export interface HinterlandRegion {
  readonly id: HinterlandRegionId;
  /** The real place this vocabulary is written from. */
  readonly place: string;
  /** The land-use region and its field system (landUse.ts), or null where the land carries no fields. */
  readonly land: LandRegion | null;
  /** How strongly the outland reads as fields (0 wild … 1 every parcel cropped). */
  readonly fields: number;
  readonly settlement: HinterlandSettlementPattern;
  /** Within 1.5 km of the edge (about 15 km²): villages, hamlets, lone farms, works, and buildings per village. */
  readonly density: {
    villages: readonly [number, number]; hamlets: readonly [number, number]; farms: readonly [number, number];
    works: readonly [number, number]; perVillage: readonly [number, number];
  };
  /** The building kit (maps/regional) the settlements are built from; null builds landmarks only (no generic boxes). */
  readonly kit: string | null;
  /** The verticals the region raises, most characteristic first; the settlement core takes the first. */
  readonly verticals: readonly HinterlandVerticalKind[];
  readonly vegetation: {
    habit: HinterlandWoodsHabit;
    /** 0..1: the woods' share of the outland. */
    woods: number;
    /** 0..1: hedges (or dike rows, bunds' trees) along the field boundaries. */
    hedges: number;
    species: readonly (readonly [TreeSpecies, number])[];
    /** The canopy height (m) of the region's woods. */
    canopyM: number;
  };
  /** The outland's own relief past the near band (§4.1 term 2's far continuation): the rise and its wavelength. */
  readonly outland: { riseM: readonly [number, number]; wavelengthM: number; flat: boolean };
  readonly geology: HinterlandGeology;
  readonly far: HinterlandFarDefault;
}

const NO_SNOW = Object.freeze({ lineM: Infinity, maxSlopeDeg: 0, scour: 0 });
const r = (v: readonly [number, number]): readonly [number, number] => Object.freeze([v[0], v[1]] as const);

function region(def: HinterlandRegion): HinterlandRegion {
  return Object.freeze({
    ...def,
    density: Object.freeze({ ...def.density }),
    verticals: Object.freeze([...def.verticals]),
    vegetation: Object.freeze({ ...def.vegetation, species: Object.freeze(def.vegetation.species.map((s) => Object.freeze([s[0], s[1]] as const))) }),
    outland: Object.freeze({ ...def.outland }),
    geology: Object.freeze({ ...def.geology, strata: Object.freeze({ ...def.geology.strata }), snow: Object.freeze({ ...def.geology.snow }) }),
    far: Object.freeze({ ...def.far }),
  });
}

/** A snow-covered place (its snow line at or under 100 m below the map's ground: the Glacier's col, the Tatra's and
 * Hostomel's winters, the polar station): its roads packed snow, its yards trodden snow, its ledges holding snow. */
export function hinterlandSnowCovered(geology: Pick<HinterlandGeology, 'snow'>): boolean {
  return geology.snow.lineM <= -100;
}

export const HINTERLAND_REGIONS: Readonly<Record<HinterlandRegionId, HinterlandRegion>> = Object.freeze({
  forestSteppe: region({
    id: 'forestSteppe', place: 'Kursk forest-steppe: black-earth plateau, balkas, shelterbelts, kolkhoz villages along the valleys',
    land: 'steppe', fields: 0.8, settlement: 'streetVillage',
    density: { villages: r([2, 3]), hamlets: r([3, 6]), farms: r([4, 8]), works: r([0, 1]), perVillage: r([20, 60]) },
    kit: 'kolkhoz', verticals: ['onionDome', 'elevator', 'waterTower', 'postMill', 'pylonLine', 'kurgan'],
    vegetation: { habit: 'shelterbelt', woods: 0.3, hedges: 0.75, species: [['oak', 0.36], ['poplar', 0.3], ['birch', 0.2], ['pine', 0.14]], canopyM: 18 },
    outland: { riseM: r([18, 45]), wavelengthM: 900, flat: false },
    geology: { rock: 'chalk', rockHex: 0xd8d2c0, strata: { bedM: 6, dipDeg: 1, contrast: 0.08 }, scree: 0.1, snow: NO_SNOW, gullies: 0.5, erosion: 0.2, rockSlopeDeg: 34, forestBandM: r([-40, 400]), sand: 0, varnish: 0 },
    far: { form: 'plain', reliefM: 70, distKm: r([4, 15]), layers: 0, treesM: 18 },
  }),
  bocage: region({
    id: 'bocage', place: 'Pays de Léon, Finistère: hedged bocage on granite moors, spired villages, a wind-scoured coast',
    land: 'bocage', fields: 0.7, settlement: 'dispersedHamlets',
    density: { villages: r([1, 3]), hamlets: r([15, 25]), farms: r([6, 12]), works: r([0, 0]), perVillage: r([20, 50]) },
    kit: 'breton', verticals: ['spire', 'churchTower', 'lighthouse', 'windmill', 'pylonLine'],
    vegetation: { habit: 'hedgerow', woods: 0.24, hedges: 0.9, species: [['oak', 0.44], ['birch', 0.18], ['pine', 0.2], ['willow', 0.18]], canopyM: 16 },
    outland: { riseM: r([17, 40]), wavelengthM: 700, flat: false },
    geology: { rock: 'granite', rockHex: 0x8f8a82, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0.2, snow: NO_SNOW, gullies: 0.3, erosion: 0.3, rockSlopeDeg: 30, forestBandM: r([-40, 300]), sand: 0.2, varnish: 0 },
    far: { form: 'upland', reliefM: 260, distKm: r([4, 15]), layers: 1, treesM: 14 },
  }),
  centralUplands: region({
    id: 'centralUplands', place: 'German central uplands (Rhön, Eifel, Frankenwald): forested plateaus, wooded valleys, nucleated villages with towers',
    land: 'temperate', fields: 0.6, settlement: 'nucleated',
    density: { villages: r([3, 5]), hamlets: r([2, 4]), farms: r([4, 8]), works: r([0, 1]), perVillage: r([30, 80]) },
    kit: 'hessian', verticals: ['churchTower', 'castle', 'mast', 'waterTower', 'pylonLine'],
    vegetation: { habit: 'forest', woods: 0.45, hedges: 0.55, species: [['spruce', 0.34], ['oak', 0.26], ['birch', 0.14], ['pine', 0.14], ['fir', 0.12]], canopyM: 24 },
    outland: { riseM: r([22, 60]), wavelengthM: 800, flat: false },
    geology: { rock: 'sandstone', rockHex: 0x9a8670, strata: { bedM: 4, dipDeg: 3, contrast: 0.12 }, scree: 0.2, snow: NO_SNOW, gullies: 0.4, erosion: 0.35, rockSlopeDeg: 36, forestBandM: r([-40, 700]), sand: 0, varnish: 0 },
    far: { form: 'upland', reliefM: 260, distKm: r([4, 15]), layers: 2, treesM: 14 },
  }),
  coalfield: region({
    id: 'coalfield', place: 'Ruhr, Saar and Silesian coal country: colonies of terraces, headframes, stacks, slag tips and a cooling tower',
    land: 'temperate', fields: 0.45, settlement: 'colony',
    density: { villages: r([1, 2]), hamlets: r([1, 3]), farms: r([2, 5]), works: r([1, 2]), perVillage: r([24, 60]) },
    kit: 'ruhr', verticals: ['headframe', 'chimney', 'coolingTower', 'slagTip', 'churchTower', 'waterTower', 'pylonLine'],
    vegetation: { habit: 'hedgerow', woods: 0.24, hedges: 0.5, species: [['birch', 0.34], ['oak', 0.26], ['poplar', 0.22], ['pine', 0.18]], canopyM: 18 },
    outland: { riseM: r([15, 40]), wavelengthM: 800, flat: false },
    geology: { rock: 'shale', rockHex: 0x5c5a55, strata: { bedM: 2.5, dipDeg: 6, contrast: 0.14 }, scree: 0.2, snow: NO_SNOW, gullies: 0.3, erosion: 0.3, rockSlopeDeg: 34, forestBandM: r([-40, 500]), sand: 0, varnish: 0 },
    far: { form: 'upland', reliefM: 200, distKm: r([4, 15]), layers: 1, treesM: 14 },
  }),
  karstCoast: region({
    id: 'karstCoast', place: 'Pelješac and the Korčula channel: grey limestone ridges in maquis, terraced vines, campanile villages over the sea',
    land: 'karst', fields: 0.3, settlement: 'hillVillage',
    density: { villages: r([2, 4]), hamlets: r([3, 6]), farms: r([3, 6]), works: r([0, 0]), perVillage: r([15, 40]) },
    kit: 'dalmatian', verticals: ['campanile', 'lighthouse', 'chimney', 'pylonLine'],
    vegetation: { habit: 'maquis', woods: 0.2, hedges: 0.3, species: [['pine', 0.42], ['cypress', 0.3], ['oak', 0.28]], canopyM: 10 },
    outland: { riseM: r([20, 70]), wavelengthM: 700, flat: false },
    geology: { rock: 'limestone', rockHex: 0xc9c4b6, strata: { bedM: 3, dipDeg: 18, contrast: 0.1 }, scree: 0.4, snow: NO_SNOW, gullies: 0.35, erosion: 0.6, rockSlopeDeg: 24, forestBandM: r([-40, 600]), sand: 0, varnish: 0 },
    far: { form: 'karstRidge', reliefM: 520, distKm: r([4, 12]), layers: 1, treesM: 0 },
  }),
  fjord: region({
    id: 'fjord', place: 'Ofoten, Herjangsfjord: gneiss domes and aiguilles over the fjord, shore farms on the terraces, birch below the snow',
    land: null, fields: 0.15, settlement: 'shoreFarms',
    density: { villages: r([0, 1]), hamlets: r([2, 4]), farms: r([8, 12]), works: r([0, 1]), perVillage: r([10, 30]) },
    kit: null, verticals: ['churchTower', 'mast', 'pylonLine'],
    vegetation: { habit: 'forest', woods: 0.42, hedges: 0.05, species: [['birch', 0.52], ['pine', 0.28], ['spruce', 0.2]], canopyM: 14 },
    outland: { riseM: r([30, 90]), wavelengthM: 650, flat: false },
    geology: { rock: 'gneiss', rockHex: 0x7d7d7a, strata: { bedM: 0, dipDeg: 0, contrast: 0.05 }, scree: 0.6, snow: { lineM: 450, maxSlopeDeg: 42, scour: 0.5 }, gullies: 0.7, erosion: 0.7, rockSlopeDeg: 28, forestBandM: r([-40, 380]), sand: 0, varnish: 0 },
    far: { form: 'alpine', reliefM: 1300, distKm: r([5, 20]), layers: 2, treesM: 0 },
  }),
  tatraValley: region({
    id: 'tatraValley', place: 'Podhale under the Tatras, January: larch villages, spruce on the foreland, the granite wall to the south',
    land: 'strip', fields: 0.2, settlement: 'streetVillage',
    density: { villages: r([1, 3]), hamlets: r([3, 6]), farms: r([4, 8]), works: r([0, 0]), perVillage: r([15, 40]) },
    kit: null, verticals: ['churchTower', 'spire', 'mast', 'pylonLine'],
    vegetation: { habit: 'forest', woods: 0.44, hedges: 0.15, species: [['spruce', 0.56], ['fir', 0.2], ['pine', 0.14], ['birch', 0.1]], canopyM: 24 },
    outland: { riseM: r([30, 80]), wavelengthM: 700, flat: false },
    geology: { rock: 'granite', rockHex: 0x8a8884, strata: { bedM: 0, dipDeg: 0, contrast: 0.04 }, scree: 0.6, snow: { lineM: -100, maxSlopeDeg: 40, scour: 0.45 }, gullies: 0.8, erosion: 0.8, rockSlopeDeg: 32, forestBandM: r([-40, 600]), sand: 0, varnish: 0 },
    far: { form: 'alpine', reliefM: 1600, distKm: r([12, 22]), layers: 2, treesM: 0 },
  }),
  alpineCol: region({
    id: 'alpineCol', place: 'Col du Mont-Cenis, April: the Ronce–Rochemelon wall, larch and pine belts, the lake, savoyard stone hamlets',
    land: 'upland', fields: 0.05, settlement: 'hillVillage',
    density: { villages: r([0, 1]), hamlets: r([2, 4]), farms: r([2, 4]), works: r([0, 1]), perVillage: r([8, 20]) },
    kit: 'savoyard', verticals: ['churchTower', 'pylonLine', 'mast'],
    // (spruce first, as the battlefield's rim: the outland's woods continue its stands)
    vegetation: { habit: 'forest', woods: 0.32, hedges: 0, species: [['spruce', 0.58], ['fir', 0.28], ['pine', 0.14]], canopyM: 20 },
    outland: { riseM: r([40, 140]), wavelengthM: 600, flat: false },
    // (the col stands above the treeline: the larch and pine belts only far down the valleys; April snow to the floor —
    // its line 400 m under the outland's datum, so no near field shows green beside the battlefield's snow: the Glacier
    // frames, 2026-10-14)
    // (the treeline 170 m over the col's datum: the woods on the valley sides round it, thinning to krummholz; dark
    // schist, its bands and cliffs against the snow — the coordinator on the first Glacier frames)
    geology: { rock: 'schist', rockHex: 0x4f4c49, strata: { bedM: 5, dipDeg: 28, contrast: 0.08 }, scree: 0.8, snow: { lineM: -400, maxSlopeDeg: 45, scour: 0.25 }, gullies: 0.8, erosion: 0.8, rockSlopeDeg: 40, forestBandM: r([-1500, 170]), sand: 0, varnish: 0 },
    // (round 5, the critics: "make the far right peak and the back range lighter, bluer and lower in contrast than the
    // near massif" — the col's air stays clear for its near walls (0.5 washed the cirque at 1.4 km); the ranges past
    // ~4 km take their own aerial term, mesh.ts uHlFarAir, and the haze is cooled, air.ts)
    far: { form: 'alpine', reliefM: 1700, distKm: r([4, 18]), layers: 2, treesM: 0, air: 0.35 },
  }),
  saharaOasis: region({
    id: 'saharaOasis', place: 'Southern Tunisia and Siwa: the cuesta and its scarp, ksour on the spurs, palm gardens at the springs, salt and erg',
    land: null, fields: 0, settlement: 'ksar',
    density: { villages: r([1, 2]), hamlets: r([1, 3]), farms: r([2, 4]), works: r([0, 0]), perVillage: r([20, 60]) },
    kit: 'ksar', verticals: ['minaret', 'mast', 'pylonLine'],
    vegetation: { habit: 'palmGroves', woods: 0.03, hedges: 0, species: [['palm', 0.8], ['acacia', 0.2]], canopyM: 14 },
    outland: { riseM: r([20, 60]), wavelengthM: 700, flat: false },
    geology: { rock: 'limestone', rockHex: 0xc8a982, strata: { bedM: 8, dipDeg: 2, contrast: 0.2 }, scree: 0.6, snow: NO_SNOW, gullies: 0.5, erosion: 0.4, rockSlopeDeg: 18, forestBandM: r([0, 0]), sand: 0.8, varnish: 0.4 },
    far: { form: 'tables', reliefM: 600, distKm: r([4, 15]), layers: 1, treesM: 0 },
  }),
  wadiRum: region({
    id: 'wadiRum', place: 'Wadi Rum: sheer fluted sandstone jebels standing free on red sand, siqs, Bedouin camps',
    land: null, fields: 0, settlement: 'none',
    density: { villages: r([0, 1]), hamlets: r([1, 3]), farms: r([0, 0]), works: r([0, 0]), perVillage: r([6, 20]) },
    kit: 'wadirum', verticals: ['mast', 'minaret'],
    vegetation: { habit: 'scrub', woods: 0.01, hedges: 0, species: [['acacia', 1]], canopyM: 5 },
    outland: { riseM: r([10, 40]), wavelengthM: 900, flat: false },
    geology: { rock: 'sandstone', rockHex: 0xb86a45, strata: { bedM: 7, dipDeg: 2, contrast: 0.22 }, scree: 0.5, snow: NO_SNOW, gullies: 0.6, erosion: 0.5, rockSlopeDeg: 20, forestBandM: r([0, 0]), sand: 1, varnish: 0.6 },
    far: { form: 'jebels', reliefM: 720, distKm: r([3, 14]), layers: 0, treesM: 0 },
  }),
  coloradoPlateau: region({
    id: 'coloradoPlateau', place: 'Monument Valley and Glen Canyon: buttes and mesas standing free, caprock over talus, ranches, the dam',
    land: null, fields: 0, settlement: 'ranch',
    density: { villages: r([0, 1]), hamlets: r([1, 3]), farms: r([2, 4]), works: r([0, 1]), perVillage: r([8, 30]) },
    kit: 'navajo', verticals: ['waterTower', 'mast', 'pylonLine', 'damWall'],
    vegetation: { habit: 'scrub', woods: 0.02, hedges: 0, species: [['cedar', 0.6], ['pine', 0.4]], canopyM: 6 },
    outland: { riseM: r([20, 60]), wavelengthM: 900, flat: false },
    geology: { rock: 'sandstone', rockHex: 0xb35f3a, strata: { bedM: 9, dipDeg: 1, contrast: 0.25 }, scree: 0.7, snow: NO_SNOW, gullies: 0.5, erosion: 0.5, rockSlopeDeg: 22, forestBandM: r([0, 0]), sand: 0.7, varnish: 0.5 },
    far: { form: 'tables', reliefM: 400, distKm: r([4, 18]), layers: 1, treesM: 0 },
  }),
  volcanicCaldera: region({
    id: 'volcanicCaldera', place: 'Aso caldera, Kyushu: a farmed caldera floor, the low continuous rim, the central cones and their grass',
    land: 'paddy', fields: 0.55, settlement: 'nucleated',
    density: { villages: r([2, 4]), hamlets: r([3, 6]), farms: r([4, 8]), works: r([0, 1]), perVillage: r([20, 50]) },
    kit: 'kyushu', verticals: ['pagoda', 'mast', 'pylonLine', 'chimney'],
    vegetation: { habit: 'forest', woods: 0.3, hedges: 0.2, species: [['cedar', 0.5], ['cypress', 0.3], ['oak', 0.2]], canopyM: 22 },
    outland: { riseM: r([15, 50]), wavelengthM: 800, flat: false },
    geology: { rock: 'basalt', rockHex: 0x4a4744, strata: { bedM: 12, dipDeg: 4, contrast: 0.1 }, scree: 0.4, snow: NO_SNOW, gullies: 0.7, erosion: 0.5, rockSlopeDeg: 32, forestBandM: r([-40, 500]), sand: 0, varnish: 0 },
    far: { form: 'volcanicField', reliefM: 600, distKm: r([4, 15]), layers: 1, treesM: 0 },
  }),
  nagaHills: region({
    id: 'nagaHills', place: 'Kohima and the Naga hills, monsoon: forested ridges, ridge-top villages, Pulie Badze and Japfü in cloud',
    land: 'terrace', fields: 0.25, settlement: 'hillVillage',
    density: { villages: r([2, 4]), hamlets: r([2, 4]), farms: r([2, 4]), works: r([0, 0]), perVillage: r([20, 60]) },
    kit: 'kohima', verticals: ['churchTower', 'mast', 'pylonLine'],
    vegetation: { habit: 'jungle', woods: 0.65, hedges: 0.1, species: [['pine', 0.3], ['oak', 0.4], ['eucalyptus', 0.3]], canopyM: 26 },
    outland: { riseM: r([40, 120]), wavelengthM: 700, flat: false },
    geology: { rock: 'shale', rockHex: 0x6e6658, strata: { bedM: 3, dipDeg: 20, contrast: 0.06 }, scree: 0.3, snow: NO_SNOW, gullies: 0.8, erosion: 0.7, rockSlopeDeg: 40, forestBandM: r([-60, 2000]), sand: 0, varnish: 0 },
    far: { form: 'ridges', reliefM: 750, distKm: r([4, 18]), layers: 2, treesM: 0 },
  }),
  bengalDelta: region({
    id: 'bengalDelta', place: 'The Jamuna chars: homestead tree islands on raised plinths, jute and paddy, brick-kiln chimneys, the braided river',
    land: 'paddy', fields: 0.7, settlement: 'dispersedHamlets',
    density: { villages: r([2, 4]), hamlets: r([12, 20]), farms: r([6, 12]), works: r([1, 3]), perVillage: r([20, 50]) },
    kit: 'bengal', verticals: ['kilnChimney', 'minaret', 'mast', 'pylonLine'],
    vegetation: { habit: 'palmGroves', woods: 0.26, hedges: 0.2, species: [['palm', 0.4], ['acacia', 0.3], ['eucalyptus', 0.3]], canopyM: 16 },
    outland: { riseM: r([0.6, 2.2]), wavelengthM: 1200, flat: true },
    geology: { rock: 'clay', rockHex: 0x8a7a62, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0, snow: NO_SNOW, gullies: 0, erosion: 0, rockSlopeDeg: 60, forestBandM: r([-10, 60]), sand: 0.3, varnish: 0 },
    far: { form: 'plain', reliefM: 8, distKm: r([4, 15]), layers: 0, treesM: 16 },
  }),
  mekongMangrove: region({
    id: 'mekongMangrove', place: 'Cà Mau shrimp coast: mangrove walls, shrimp ponds on bunds, stilt hamlets on the creeks, masts',
    land: 'paddy', fields: 0.3, settlement: 'stiltVillage',
    density: { villages: r([1, 2]), hamlets: r([4, 8]), farms: r([4, 8]), works: r([0, 1]), perVillage: r([15, 40]) },
    kit: 'mekong', verticals: ['mast', 'pagoda', 'pylonLine'],
    vegetation: { habit: 'mangrove', woods: 0.45, hedges: 0, species: [['palm', 0.5], ['eucalyptus', 0.3], ['acacia', 0.2]], canopyM: 14 },
    outland: { riseM: r([0.4, 1.2]), wavelengthM: 1200, flat: true },
    geology: { rock: 'clay', rockHex: 0x6c6250, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0, snow: NO_SNOW, gullies: 0, erosion: 0, rockSlopeDeg: 60, forestBandM: r([-10, 40]), sand: 0, varnish: 0 },
    far: { form: 'plain', reliefM: 4, distKm: r([4, 15]), layers: 0, treesM: 14 },
  }),
  zeelandPolder: region({
    id: 'zeelandPolder', place: 'The Scheldt polders, autumn 1944: clay fields boxed by dykes, poplar rows on the dyke crowns, tower mills, church towers every few km, dyke villages',
    land: 'polder', fields: 0.8, settlement: 'dykeVillage',
    density: { villages: r([2, 2]), hamlets: r([3, 6]), farms: r([10, 15]), works: r([0, 1]), perVillage: r([20, 40]) },
    kit: 'polder', verticals: ['churchTower', 'windmill', 'lighthouse', 'pylonLine'],
    // (HL-2c: November Zeeland — the rows mostly broad-crowned Canadian poplars, ash and oak, pollard willows along the
    // water, a Lombardy poplar only as an accent)
    vegetation: { habit: 'dikeRows', woods: 0.08, hedges: 0.6, species: [['poplar', 0.5], ['oak', 0.28], ['willow', 0.22]], canopyM: 17 },
    outland: { riseM: r([0.5, 1.6]), wavelengthM: 1400, flat: true },
    geology: { rock: 'clay', rockHex: 0x7d7564, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0, snow: NO_SNOW, gullies: 0, erosion: 0, rockSlopeDeg: 70, forestBandM: r([-10, 40]), sand: 0.15, varnish: 0 },
    far: { form: 'plain', reliefM: 4, distKm: r([4, 15]), layers: 0, treesM: 20 },
  }),
  yangtzeCity: region({
    id: 'yangtzeCity', place: 'Shanghai, autumn 1937: the Bund\'s towers east, mills and godowns on the creek, lane-house districts, fields west',
    land: 'paddy', fields: 0.3, settlement: 'cityEdge',
    density: { villages: r([1, 2]), hamlets: r([2, 4]), farms: r([2, 4]), works: r([2, 4]), perVillage: r([40, 120]) },
    kit: 'shanghai', verticals: ['chimney', 'pagoda', 'waterTower', 'mast'],
    vegetation: { habit: 'hedgerow', woods: 0.1, hedges: 0.2, species: [['poplar', 0.4], ['willow', 0.4], ['oak', 0.2]], canopyM: 16 },
    outland: { riseM: r([0.4, 1.4]), wavelengthM: 1200, flat: true },
    geology: { rock: 'clay', rockHex: 0x726a5c, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0, snow: NO_SNOW, gullies: 0, erosion: 0, rockSlopeDeg: 70, forestBandM: r([-10, 40]), sand: 0, varnish: 0 },
    far: { form: 'plain', reliefM: 6, distKm: r([4, 15]), layers: 0, treesM: 12 },
  }),
  bosnianValley: region({
    id: 'bosnianValley', place: 'Sarajevo under siege: the city climbing the valley sides, Trebević and Igman, Hum\'s TV tower, minarets and blocks',
    land: null, fields: 0.1, settlement: 'cityEdge',
    density: { villages: r([1, 2]), hamlets: r([2, 4]), farms: r([0, 2]), works: r([0, 1]), perVillage: r([40, 120]) },
    kit: 'sarajevo', verticals: ['minaret', 'tvTower', 'churchTower', 'chimney', 'mast'],
    vegetation: { habit: 'forest', woods: 0.4, hedges: 0.15, species: [['pine', 0.34], ['oak', 0.3], ['spruce', 0.2], ['birch', 0.16]], canopyM: 22 },
    outland: { riseM: r([40, 140]), wavelengthM: 700, flat: false },
    geology: { rock: 'limestone', rockHex: 0xa49e90, strata: { bedM: 4, dipDeg: 15, contrast: 0.08 }, scree: 0.4, snow: { lineM: 900, maxSlopeDeg: 38, scour: 0.3 }, gullies: 0.5, erosion: 0.5, rockSlopeDeg: 34, forestBandM: r([60, 1200]), sand: 0, varnish: 0 },
    far: { form: 'upland', reliefM: 900, distKm: r([4, 15]), layers: 2, treesM: 14 },
  }),
  kyivPinelands: region({
    id: 'kyivPinelands', place: 'Hostomel, February 2022: pine belts on sandy ground north, panel blocks, domes and dachas south, the airfield',
    land: 'steppe', fields: 0.5, settlement: 'streetVillage',
    density: { villages: r([2, 3]), hamlets: r([3, 6]), farms: r([2, 4]), works: r([1, 2]), perVillage: r([30, 80]) },
    kit: 'hostomel', verticals: ['onionDome', 'waterTower', 'chimney', 'mast', 'pylonLine'],
    vegetation: { habit: 'pineForest', woods: 0.34, hedges: 0.3, species: [['pine', 0.64], ['birch', 0.22], ['aspen', 0.14]], canopyM: 22 },
    outland: { riseM: r([6, 18]), wavelengthM: 1100, flat: false },
    geology: { rock: 'loess', rockHex: 0xb8ab90, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0, snow: { lineM: -100, maxSlopeDeg: 45, scour: 0.2 }, gullies: 0.2, erosion: 0.1, rockSlopeDeg: 50, forestBandM: r([-20, 200]), sand: 0.4, varnish: 0 },
    far: { form: 'plain', reliefM: 25, distKm: r([4, 15]), layers: 0, treesM: 22 },
  }),
  tasmanianMine: region({
    id: 'tasmanianMine', place: 'Queenstown, Tasmania: bare stripped Mount Owen over the mining town, dark rainforest ranges west, headframes and the smelter stack',
    land: null, fields: 0, settlement: 'mineCamp',
    density: { villages: r([1, 1]), hamlets: r([1, 2]), farms: r([0, 1]), works: r([1, 2]), perVillage: r([30, 80]) },
    kit: 'queenstown', verticals: ['headframe', 'chimney', 'churchTower', 'pylonLine'],
    vegetation: { habit: 'forest', woods: 0.3, hedges: 0, species: [['eucalyptus', 0.5], ['pine', 0.3], ['fir', 0.2]], canopyM: 24 },
    outland: { riseM: r([40, 140]), wavelengthM: 700, flat: false },
    geology: { rock: 'quartzite', rockHex: 0xb39b8a, strata: { bedM: 6, dipDeg: 25, contrast: 0.14 }, scree: 0.7, snow: { lineM: 900, maxSlopeDeg: 38, scour: 0.4 }, gullies: 0.8, erosion: 0.7, rockSlopeDeg: 22, forestBandM: r([120, 900]), sand: 0, varnish: 0 },
    far: { form: 'ridges', reliefM: 800, distKm: r([4, 18]), layers: 2, treesM: 0 },
  }),
  andalusianRonda: region({
    id: 'andalusianRonda', place: 'Ronda, 1972: the limestone sierras, white towns on the scarps, olive and cereal on the plateau',
    land: 'secano', fields: 0.6, settlement: 'whiteTown',
    density: { villages: r([2, 3]), hamlets: r([2, 4]), farms: r([6, 10]), works: r([0, 0]), perVillage: r([30, 80]) },
    kit: 'andalusian', verticals: ['churchTower', 'castle', 'windmill', 'mast', 'pylonLine'],
    vegetation: { habit: 'orchards', woods: 0.24, hedges: 0.3, species: [['oak', 0.5], ['pine', 0.3], ['cypress', 0.2]], canopyM: 10 },
    outland: { riseM: r([25, 80]), wavelengthM: 800, flat: false },
    geology: { rock: 'limestone', rockHex: 0xc4bba8, strata: { bedM: 5, dipDeg: 12, contrast: 0.12 }, scree: 0.4, snow: { lineM: 1500, maxSlopeDeg: 38, scour: 0.3 }, gullies: 0.5, erosion: 0.55, rockSlopeDeg: 28, forestBandM: r([0, 900]), sand: 0, varnish: 0 },
    far: { form: 'karstRidge', reliefM: 900, distKm: r([5, 20]), layers: 2, treesM: 0 },
  }),
  longleafFlatwoods: region({
    id: 'longleafFlatwoods', place: 'Longleaf, Louisiana, 1941: open longleaf pine on sandy flatwoods, cutover, a mill town with its burner cone and a lookout tower',
    land: null, fields: 0.15, settlement: 'streetVillage',
    density: { villages: r([1, 2]), hamlets: r([2, 4]), farms: r([3, 6]), works: r([1, 1]), perVillage: r([20, 50]) },
    kit: 'longleaf', verticals: ['burnerCone', 'lookoutTower', 'waterTower', 'churchTower', 'pylonLine'],
    vegetation: { habit: 'pineForest', woods: 0.62, hedges: 0.1, species: [['pine', 0.84], ['oak', 0.16]], canopyM: 26 },
    outland: { riseM: r([8, 25]), wavelengthM: 1000, flat: false },
    geology: { rock: 'clay', rockHex: 0xb08f6a, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0, snow: NO_SNOW, gullies: 0.2, erosion: 0.1, rockSlopeDeg: 50, forestBandM: r([-20, 300]), sand: 0.5, varnish: 0 },
    far: { form: 'plain', reliefM: 30, distKm: r([4, 15]), layers: 0, treesM: 26 },
  }),
  levantOrchard: region({
    id: 'levantOrchard', place: 'The Chouf, 1982: terraced orchards and olive groves, stone villages with red roofs on the spurs, the Barouk\'s cedars east, the sea west',
    land: 'terrace', fields: 0.6, settlement: 'hillVillage',
    density: { villages: r([2, 4]), hamlets: r([3, 6]), farms: r([4, 8]), works: r([0, 0]), perVillage: r([20, 60]) },
    kit: 'chouf', verticals: ['minaret', 'churchTower', 'mast', 'pylonLine'],
    vegetation: { habit: 'orchards', woods: 0.4, hedges: 0.6, species: [['oak', 0.36], ['cedar', 0.3], ['pine', 0.2], ['cypress', 0.14]], canopyM: 12 },
    outland: { riseM: r([30, 100]), wavelengthM: 700, flat: false },
    geology: { rock: 'limestone', rockHex: 0xc8bea8, strata: { bedM: 3, dipDeg: 10, contrast: 0.1 }, scree: 0.3, snow: { lineM: 1400, maxSlopeDeg: 38, scour: 0.3 }, gullies: 0.5, erosion: 0.5, rockSlopeDeg: 30, forestBandM: r([0, 1400]), sand: 0, varnish: 0 },
    far: { form: 'upland', reliefM: 1100, distKm: r([4, 18]), layers: 2, treesM: 10 },
  }),
  polarStation: region({
    id: 'polarStation', place: 'DYE-M, Cape Dyer, Baffin Island, 1985: sea ice on one side, a glaciated peninsula on the other, radomes and masts, no tree for hundreds of km',
    land: null, fields: 0, settlement: 'station',
    density: { villages: r([0, 0]), hamlets: r([0, 1]), farms: r([0, 0]), works: r([1, 1]), perVillage: r([0, 0]) },
    kit: 'arctic', verticals: ['radome', 'mast', 'pylonLine'],
    vegetation: { habit: 'none', woods: 0, hedges: 0, species: [], canopyM: 0 },
    outland: { riseM: r([30, 90]), wavelengthM: 700, flat: false },
    geology: { rock: 'gneiss', rockHex: 0x5f5d5a, strata: { bedM: 0, dipDeg: 0, contrast: 0.04 }, scree: 0.7, snow: { lineM: -100, maxSlopeDeg: 38, scour: 0.6 }, gullies: 0.6, erosion: 0.6, rockSlopeDeg: 30, forestBandM: r([0, 0]), sand: 0, varnish: 0 },
    far: { form: 'iceSheet', reliefM: 320, distKm: r([4, 20]), layers: 1, treesM: 0 },
  }),
  mars: region({
    id: 'mars', place: 'An invented Martian basin, 2100: a terraced crater rim, layered mesas, the research station (the galaxy sky stays)',
    land: null, fields: 0, settlement: 'station',
    density: { villages: r([0, 0]), hamlets: r([0, 1]), farms: r([0, 0]), works: r([1, 1]), perVillage: r([0, 0]) },
    kit: null, verticals: ['mast', 'radome'],
    vegetation: { habit: 'none', woods: 0, hedges: 0, species: [], canopyM: 0 },
    outland: { riseM: r([20, 70]), wavelengthM: 900, flat: false },
    geology: { rock: 'regolith', rockHex: 0xa45a36, strata: { bedM: 10, dipDeg: 2, contrast: 0.22 }, scree: 0.6, snow: NO_SNOW, gullies: 0.4, erosion: 0.4, rockSlopeDeg: 24, forestBandM: r([0, 0]), sand: 0.8, varnish: 0.2 },
    far: { form: 'martian', reliefM: 1300, distKm: r([4, 20]), layers: 1, treesM: 0 },
  }),
  moon: region({
    id: 'moon', place: 'Taurus-Littrow, December 1972: crisp rounded massifs north and south, the mare\'s near horizon west',
    land: null, fields: 0, settlement: 'none',
    density: { villages: r([0, 0]), hamlets: r([0, 0]), farms: r([0, 0]), works: r([0, 0]), perVillage: r([0, 0]) },
    kit: null, verticals: [],
    vegetation: { habit: 'none', woods: 0, hedges: 0, species: [], canopyM: 0 },
    outland: { riseM: r([20, 60]), wavelengthM: 900, flat: false },
    geology: { rock: 'regolith', rockHex: 0x8a8884, strata: { bedM: 0, dipDeg: 0, contrast: 0 }, scree: 0.3, snow: NO_SNOW, gullies: 0, erosion: 0.2, rockSlopeDeg: 30, forestBandM: r([0, 0]), sand: 0, varnish: 0 },
    far: { form: 'lunar', reliefM: 1800, distKm: r([3, 12]), layers: 1, treesM: 0 },
  }),
});

export const HINTERLAND_REGION_IDS: readonly HinterlandRegionId[] = Object.freeze(Object.keys(HINTERLAND_REGIONS) as HinterlandRegionId[]);

/**
 * Each map's region (B-architecture §4.0's first pass): the draft tool writes it into a new block, and a map without a
 * block keeps it only as the default a lab draft starts from. 33 maps, 26 regions.
 */
export const HINTERLAND_MAP_REGIONS: Readonly<Record<string, HinterlandRegionId>> = Object.freeze({
  verdant: 'forestSteppe', steppe: 'forestSteppe',
  coastal: 'bocage',
  frontier: 'centralUplands', reservoir: 'centralUplands', urban: 'centralUplands', autumn: 'centralUplands',
  railyard: 'coalfield', foundry: 'coalfield',
  saltwind: 'karstCoast',
  fjord: 'fjord',
  winter: 'tatraValley',
  alpine: 'alpineCol',
  desert: 'saharaOasis', oasis: 'saharaOasis',
  badlands: 'wadiRum',
  titan_gorge: 'coloradoPlateau', skybridge: 'coloradoPlateau',
  caldera: 'volcanicCaldera',
  monsoon: 'nagaHills',
  delta: 'bengalDelta',
  mangrove: 'mekongMangrove',
  polders: 'zeelandPolder',
  blackglass: 'yangtzeCity',
  ruinspires: 'bosnianValley',
  airfield: 'kyivPinelands',
  copper_mesa: 'tasmanianMine',
  cliffbridge: 'andalusianRonda',
  longleaf: 'longleafFlatwoods',
  orchard: 'levantOrchard',
  whiteout: 'polarStation',
  mars: 'mars',
  moon: 'moon',
});
