// src/world/maps/buildingStyleTable.ts — the building-style table (item buildings-270, the owner 2026-11-05: "update all of
// our buildings and structured to amke them look better and customize all buildings on maps to look more correct").
//
// One row per battlefield, typed over MapId, so a battlefield without a row fails typecheck. A row is in two parts:
//   - here, what the game reads (THREE-free: the sim's worlds, the workers and the headless builds load it):
//       `kit` — the regional architecture kit the map's buildings are rebuilt by (its `props.architecture` reads it);
//       `weathering` (damp, moss) and `wear` — the place's weathering and war-wear share (regional/index.ts, the damage
//       kit, gates, wells, landmarks and the waterworks read them through climateOf and wearOf; there is no default);
//       `variation` — what the map's buildings vary in (regional/appearance.ts pickLook: no two neighbours alike);
//       `surface` — the walls' grime, the renders' patches, the roofs' tile relief, and the least reveal and eave;
//       and the measure its kit's houses are held to (buildingStyleTable.selftest against the pinned reading,
//       tools/building-style-reading.mjs): roof forms and pitch, storeys and storey height, window bays, the walls' core;
//   - in buildingStyleRecords.ts, what the place's photographs show — setting, coverings and colours, materials, window
//     rhythm, doors and shopfronts, ornament, weathering and damage dress — and the photographs themselves; only the
//     receipts and tools load it (the prose and credits would otherwise ride in every world worker).
import type { MapId } from './mapIds.ts';
import type { ArchitectureId } from './regional/index.ts';
import type { BuildingVariation } from './regional/appearance.ts';

/** A roof form the place builds (house.ts RoofKind plus the forms the kits lay in their own code). */
export type RoofForm = 'gable' | 'hip' | 'halfhip' | 'flat' | 'shed' | 'vault' | 'dome' | 'sawtooth' | 'pyramid' | 'curved' | 'mansard';
/** What the walls are, under any render. */
export type WallCore = 'adobe' | 'masonry' | 'concrete';
type Range = readonly [number, number];

export interface BuildingStyleRow {
  readonly kit: ArchitectureId;
  /** the forms the place's buildings take (the kit's commonest among them) and the pitch of the pitched ones */
  readonly roof: { readonly forms: readonly RoofForm[]; readonly pitchDeg: Range | null };
  readonly core: WallCore;
  /** storeys over the ground and the storey height (floor to floor, metres) of the place's houses */
  readonly storeys: Range;
  readonly storeyM: Range;
  /** the centre spacing of a storey's windows (metres; null where windows are rare) */
  readonly bayM: Range | null;
  /** rising damp and splash at the wall foot (0 arid – 1 wet) and moss/lichen toward the eaves (0 – 1) */
  readonly weathering: { readonly damp: number; readonly moss: number };
  /** the share of houses showing war damage (burnt and boarded windows, stripped roof patches) */
  readonly wear: number;
  /** what the map's buildings vary in: the named dress axes its kit reads and the roofs' age spread */
  readonly variation: BuildingVariation;
  /**
   * the walls' surface and depth as the photos show them: `grime` how dark the foot, the eaves' rain shadow and the runs
   * off the sills and eaves weather (1: the facade craft's own); `patches` the share of houses whose render shows its
   * losses and repairs (the stone under it); `tileRelief` the roof covering's relief (its normal map's scale); `reveal`
   * and `eave` the least reveal depth of the openings and eaves overhang of the place's houses (metres), which their
   * kit's houses keep. Decor and material only: no fetch is added and no collision moves.
   */
  readonly surface: { readonly grime: number; readonly patches: number; readonly tileRelief: number; readonly reveal: number; readonly eave: number };
}

export const BUILDING_STYLES = {
  verdant: {
    kit: 'kolkhoz',
    roof: { forms: ['hip', 'gable'], pitchDeg: [25, 48] },
    core: 'adobe', storeys: [1, 2], storeyM: [2.2, 3.2], bayM: [1.6, 3.6],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.55, tileRelief: 1, reveal: 0.15, eave: 0.5 },
  },
  desert: {
    kit: 'ksar',
    roof: { forms: ['vault', 'flat', 'dome'], pitchDeg: null },
    core: 'adobe', storeys: [1, 4], storeyM: [2, 3.2], bayM: null,
    weathering: { damp: 0.25, moss: 0.05 }, wear: 0.15,
    variation: { axes: { paint: ['#2e5f9e', '#3a7ab0', '#24508a'] }, roofAge: [0, 1] },
    surface: { grime: 0.6, patches: 0.6, tileRelief: 1, reveal: 0.3, eave: 0 },
  },
  winter: {
    kit: 'goral',
    roof: { forms: ['gable', 'halfhip'], pitchDeg: [45, 60] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3], bayM: [1.4, 3.2],
    weathering: { damp: 0.7, moss: 0.55 }, wear: 0.3,
    // (round-3 blind pairs, 0–6: every gable keeps the Zakopane sunburst; the houses vary by their window surrounds)
    variation: { axes: { surround: ['pale', 'white', 'blue'] }, roofAge: [0.15, 1] },
    surface: { grime: 0.8, patches: 0.7, tileRelief: 1.15, reveal: 0.2, eave: 0.5 },
  },
  urban: {
    kit: 'franconian',
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [45, 60] },
    core: 'masonry', storeys: [2, 5], storeyM: [2.8, 3.6], bayM: [1.6, 2.8],
    weathering: { damp: 0.5, moss: 0.4 }, wear: 0.25,
    variation: { axes: { paint: ['#7c8a74', '#e8e4da', '#5a3a2a'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.6, tileRelief: 1.35, reveal: 0.15, eave: 0.35 },
  },
  coastal: {
    kit: 'breton',
    roof: { forms: ['gable'], pitchDeg: [40, 55] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3], bayM: [1.6, 4.8],
    weathering: { damp: 0.95, moss: 0.8 }, wear: 0.25,
    variation: { axes: { paint: ['#2e5a8a', '#3f6a4a', '#8c2a3a', '#e8e6e0'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.7, tileRelief: 1.2, reveal: 0.3, eave: 0.1 },
  },
  autumn: {
    kit: 'lorrain',
    roof: { forms: ['gable'], pitchDeg: [18, 30] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 3.2], bayM: [1.4, 2.8],
    weathering: { damp: 0.75, moss: 0.45 }, wear: 0.3,
    variation: { axes: { paint: ['#7a8a8a', '#4e6a52', '#6a4a32'] }, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.7, tileRelief: 1.35, reveal: 0.25, eave: 0.3 },
  },
  steppe: {
    kit: 'tselina',
    roof: { forms: ['gable', 'hip', 'flat', 'shed'], pitchDeg: [18, 32] },
    core: 'adobe', storeys: [1, 3], storeyM: [2.6, 3.2], bayM: [1.8, 3.4],
    weathering: { damp: 0.4, moss: 0.15 }, wear: 0.25,
    variation: { axes: { paint: ['#3f6fa8', '#4e7a5a', '#a8b8c8'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.6, tileRelief: 1.15, reveal: 0.15, eave: 0.4 },
  },
  railyard: {
    kit: 'ruhr',
    roof: { forms: ['gable', 'shed', 'sawtooth', 'flat'], pitchDeg: [15, 45] },
    core: 'masonry', storeys: [1, 4], storeyM: [3, 5], bayM: [2, 4.5],
    weathering: { damp: 0.7, moss: 0.1 }, wear: 0.2,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.45, patches: 0.5, tileRelief: 1.2, reveal: 0.15, eave: 0.35 },
  },
  frontier: {
    kit: 'hessian',
    roof: { forms: ['gable', 'halfhip'], pitchDeg: [42, 55] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.4, 3.2], bayM: [1.2, 2.8],
    weathering: { damp: 0.85, moss: 0.55 }, wear: 0.22,
    // (round-3 blind pairs: the green shutters won, the brown lost)
    variation: { axes: { paint: ['#4e6a52', '#2f4a36', '#4a5e6e'] }, roofAge: [0.1, 1] },
    surface: { grime: 1, patches: 0.55, tileRelief: 1.35, reveal: 0.15, eave: 0.35 },
  },
  fjord: {
    kit: 'nordland',
    roof: { forms: ['gable'], pitchDeg: [30, 45] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3], bayM: [1.4, 3],
    weathering: { damp: 0.7, moss: 0.45 }, wear: 0.3,
    variation: { axes: { paint: ['#2e4a3a', '#7a2a22', '#e8e4da'] }, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.5, tileRelief: 1.2, reveal: 0.1, eave: 0.5 },
  },
  delta: {
    kit: 'bengal',
    roof: { forms: ['gable', 'hip', 'curved', 'flat'], pitchDeg: [20, 35] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3.2], bayM: [1.6, 3.6],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    variation: { axes: { paint: ['#3c6a3e', '#3a6a9a', '#8a5a3a'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.15, reveal: 0.1, eave: 0.7 },
  },
  badlands: {
    kit: 'wadirum',
    roof: { forms: ['flat'], pitchDeg: null },
    core: 'adobe', storeys: [1, 2], storeyM: [2.8, 3.2], bayM: [1.8, 4],
    weathering: { damp: 0.25, moss: 0 }, wear: 0.2,
    variation: { axes: { door: ['blue', 'green', 'grey'], tank: ['black', 'white'] }, roofAge: [0, 0.6] },
    surface: { grime: 0.6, patches: 0.45, tileRelief: 1, reveal: 0.3, eave: 0 },
  },
  monsoon: {
    kit: 'kohima',
    roof: { forms: ['gable', 'hip'], pitchDeg: [25, 55] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 3.4], bayM: [1.6, 4.6],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    // (round-3 blind pairs: the pale louvres lost to green)
    variation: { axes: { paint: ['#4e6a48', '#3a5640', '#7b2e2a'] }, roofAge: [0, 1] },
    surface: { grime: 1.3, patches: 0.6, tileRelief: 1.15, reveal: 0.15, eave: 0.9 },
  },
  alpine: {
    kit: 'savoyard',
    roof: { forms: ['gable'], pitchDeg: [25, 40] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.3, 3], bayM: [1.4, 3.4],
    weathering: { damp: 0.95, moss: 0.5 }, wear: 0.3,
    variation: { axes: { paint: ['#5a3e2a', '#3f5a4a', '#6a5a4a'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.7, tileRelief: 1.2, reveal: 0.4, eave: 0.55 },
  },
  caldera: {
    kit: 'kyushu',
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [25, 50] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 4.4], bayM: [0.9, 2.2],
    weathering: { damp: 0.7, moss: 0.45 }, wear: 0.22,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.35, reveal: 0.15, eave: 0.55 },
  },
  foundry: {
    kit: 'saar',
    roof: { forms: ['gable', 'sawtooth', 'flat', 'shed'], pitchDeg: [15, 40] },
    core: 'masonry', storeys: [1, 4], storeyM: [3.2, 8], bayM: [2.4, 6],
    weathering: { damp: 0.6, moss: 0.15 }, wear: 0.4,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.45, patches: 0.7, tileRelief: 1.15, reveal: 0.2, eave: 0.45 },
  },
  ruinspires: {
    kit: 'sarajevo',
    roof: { forms: ['hip', 'flat', 'gable'], pitchDeg: [25, 55] },
    core: 'masonry', storeys: [2, 18], storeyM: [2.8, 3.8], bayM: [1.4, 3.2],
    weathering: { damp: 0.7, moss: 0.3 }, wear: 0.5,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.3, patches: 0.75, tileRelief: 1.35, reveal: 0.2, eave: 0.8 },
  },
  blackglass: {
    kit: 'shanghai',
    roof: { forms: ['gable', 'flat', 'hip'], pitchDeg: [20, 35] },
    core: 'masonry', storeys: [2, 4], storeyM: [3, 4], bayM: [1.4, 2.8],
    weathering: { damp: 0.85, moss: 0.35 }, wear: 0.3,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.7, tileRelief: 1.35, reveal: 0.2, eave: 0.6 },
  },
  titan_gorge: {
    kit: 'navajo',
    roof: { forms: ['flat', 'dome', 'gable'], pitchDeg: [15, 30] },
    core: 'adobe', storeys: [1, 2], storeyM: [2.4, 3.2], bayM: [1.8, 4],
    weathering: { damp: 0.4, moss: 0.03 }, wear: 0.15,
    variation: { axes: { paint: ['#3a6a9a', '#8a5a3a', '#5a7a5a'] }, roofAge: [0, 1] },
    surface: { grime: 0.6, patches: 0.4, tileRelief: 1, reveal: 0.3, eave: 0.35 },
  },
  skybridge: {
    kit: 'glencanyon',
    roof: { forms: ['flat', 'gable', 'hip'], pitchDeg: [15, 25] },
    core: 'concrete', storeys: [1, 3], storeyM: [2.5, 4.5], bayM: [1.6, 7],
    weathering: { damp: 0.2, moss: 0.02 }, wear: 0.18,
    variation: { axes: { paint: ['#e8e4da', '#8a3a2a', '#3a5a6a'] }, roofAge: [0, 1] },
    surface: { grime: 0.5, patches: 0.35, tileRelief: 1, reveal: 0.1, eave: 0.55 },
  },
  polders: {
    kit: 'polder',
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [40, 55] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.5, 3.2], bayM: [1.4, 4.2],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    // (round-3 blind pairs, 0–4: Zeeland's shutters and doors are green or oxblood, never white or black)
    variation: { axes: { paint: ['#2e5a3a', '#244a30', '#6e2a24'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.35, reveal: 0.15, eave: 0.3 },
  },
  copper_mesa: {
    kit: 'queenstown',
    roof: { forms: ['gable', 'hip', 'shed'], pitchDeg: [20, 35] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 4], bayM: [1.6, 3.4],
    weathering: { damp: 0.6, moss: 0.3 }, wear: 0.25,
    variation: { axes: { paint: ['#8a2a22', '#2e4a3a', '#e8e4da'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.5, tileRelief: 1.15, reveal: 0.1, eave: 0.4 },
  },
  airfield: {
    kit: 'hostomel',
    roof: { forms: ['flat', 'vault', 'gable', 'hip'], pitchDeg: [5, 40] },
    core: 'masonry', storeys: [1, 5], storeyM: [2.3, 3.3], bayM: [0.8, 3],
    weathering: { damp: 0.55, moss: 0.25 }, wear: 0.45,
    variation: { axes: { paint: ['#3f6fa8', '#4e7a5a', '#8a3a2a'] }, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.75, tileRelief: 1.15, reveal: 0.1, eave: 0.35 },
  },
  oasis: {
    kit: 'siwa',
    roof: { forms: ['flat'], pitchDeg: null },
    core: 'adobe', storeys: [1, 3], storeyM: [2.4, 3], bayM: null,
    weathering: { damp: 0.12, moss: 0 }, wear: 0.2,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.5, patches: 0.6, tileRelief: 1, reveal: 0.3, eave: 0 },
  },
  whiteout: {
    kit: 'arctic',
    roof: { forms: ['flat', 'vault', 'dome'], pitchDeg: null },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 4], bayM: [2, 5],
    weathering: { damp: 0.25, moss: 0 }, wear: 0.1,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.4, patches: 0.2, tileRelief: 1, reveal: 0.1, eave: 0.15 },
  },
  orchard: {
    kit: 'chouf',
    roof: { forms: ['hip', 'flat'], pitchDeg: [20, 30] },
    core: 'masonry', storeys: [1, 3], storeyM: [3, 4], bayM: [1.2, 4],
    weathering: { damp: 0.45, moss: 0.25 }, wear: 0.3,
    variation: { axes: { paint: ['#3f6a4a', '#4c5a6a', '#6a4a32'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.6, tileRelief: 1.35, reveal: 0.3, eave: 0.5 },
  },
  longleaf: {
    kit: 'longleaf',
    roof: { forms: ['gable', 'hip'], pitchDeg: [25, 45] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.8, 3.6], bayM: [1.6, 5.4],
    weathering: { damp: 0.65, moss: 0.35 }, wear: 0.3,
    variation: { axes: { paint: ['#e8e4da', '#3a4a3a', '#6a4a32'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.15, reveal: 0.05, eave: 0.45 },
  },
  mangrove: {
    kit: 'mekong',
    roof: { forms: ['gable', 'hip'], pitchDeg: [25, 40] },
    core: 'masonry', storeys: [1, 1], storeyM: [2.4, 3], bayM: [1.6, 4],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    variation: { axes: { paint: ['#3a6a9a', '#8a2a22', '#3c6a3e'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.4, tileRelief: 1, reveal: 0.15, eave: 0.5 },
  },
  saltwind: {
    kit: 'dalmatian',
    roof: { forms: ['gable'], pitchDeg: [18, 30] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.6, 3.2], bayM: [1.4, 3],
    weathering: { damp: 0.45, moss: 0.25 }, wear: 0.3,
    variation: { axes: { paint: ['#3f6a4a', '#5a7a6a', '#7a5a3a'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.75, tileRelief: 1.35, reveal: 0.3, eave: 0.2 },
  },
  reservoir: {
    kit: 'eifel',
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [40, 55] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.4, 3.2], bayM: [1.2, 2.8],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    variation: { axes: { paint: ['#3a5a40', '#6a2a22', '#8a8a86'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.55, tileRelief: 1.2, reveal: 0.15, eave: 0.35 },
  },
  mars: {
    kit: 'olympus',
    roof: { forms: ['flat', 'vault'], pitchDeg: null },
    core: 'concrete', storeys: [1, 2], storeyM: [2.5, 4], bayM: null,
    weathering: { damp: 0.05, moss: 0 }, wear: 0.05,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.2, patches: 0.1, tileRelief: 1, reveal: 0, eave: 0 },
  },
  moon: {
    kit: 'littrow',
    roof: { forms: ['vault', 'flat'], pitchDeg: null },
    core: 'concrete', storeys: [1, 2], storeyM: [2.5, 4], bayM: null,
    weathering: { damp: 0, moss: 0 }, wear: 0.15,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.2, patches: 0.1, tileRelief: 1, reveal: 0, eave: 0 },
  },
  cliffbridge: {
    kit: 'andalusian',
    roof: { forms: ['gable', 'hip'], pitchDeg: [18, 30] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.6, 3.4], bayM: [1.4, 3.4],
    weathering: { damp: 0.35, moss: 0.3 }, wear: 0.18,
    variation: { axes: { band: ['ochre', 'grey'], joinery: ['green', 'brown'] }, roofAge: [0.2, 1] },
    surface: { grime: 0.9, patches: 0.65, tileRelief: 1.35, reveal: 0.25, eave: 0.3 },
  },
} as const satisfies { readonly [K in MapId]: BuildingStyleRow };

const ROWS: Readonly<Record<string, BuildingStyleRow | undefined>> = BUILDING_STYLES;
const KIT_ROWS: ReadonlyMap<string, BuildingStyleRow> = new Map(Object.values(BUILDING_STYLES).map((row) => [row.kit, row]));

/** A battlefield's row (null for an id outside the table: a receipt's own map). */
export function buildingStyleOf(mapId: string): BuildingStyleRow | null {
  return ROWS[mapId] ?? null;
}

/**
 * The row a kit's building answers to on a map: the map's own (its climate and its war, whatever kit built the house — a
 * border farmstead of a neighbouring style weathers as the map does); off the table (a receipt's harness map), the row of
 * the battlefield the kit was drawn for. There is no default: a kit without a row fails here.
 */
function rowFor(mapId: string, kit?: string): BuildingStyleRow {
  const row = ROWS[mapId] ?? (kit === undefined ? undefined : KIT_ROWS.get(kit));
  if (!row) throw new Error(`No building-style row for map ${mapId} or kit ${kit ?? '(none)'}`);
  return row;
}

/** The weathering strengths a kit's building takes on a map (rising damp at the wall foot, moss toward the eaves). */
export function climateOf(mapId: string, kit?: string): BuildingStyleRow['weathering'] {
  return rowFor(mapId, kit).weathering;
}

/** A kit's buildings' surface and depth on a map. */
export function surfaceOf(mapId: string, kit: string): BuildingStyleRow['surface'] {
  return rowFor(mapId, kit).surface;
}

/** What a kit's buildings vary in on a map. */
export function variationOf(mapId: string, kit: string): BuildingVariation {
  return rowFor(mapId, kit).variation;
}

/** The share of a kit's houses on a map that show war damage. */
export function wearOf(mapId: string, kit: string): number {
  return rowFor(mapId, kit).wear;
}
