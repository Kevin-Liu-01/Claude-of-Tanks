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
import type { MapSetting } from './buildingTypes.ts';

/** A roof form the place builds (house.ts RoofKind plus the forms the kits lay in their own code). */
export type RoofForm = 'gable' | 'hip' | 'halfhip' | 'flat' | 'shed' | 'vault' | 'dome' | 'sawtooth' | 'pyramid' | 'curved' | 'mansard';
/** What the walls are, under any render. */
export type WallCore = 'adobe' | 'masonry' | 'concrete';
type Range = readonly [number, number];

export interface BuildingStyleRow {
  readonly kit: ArchitectureId;
  /** the years the map shows and the cultures of its place: which building types it may place (buildingTypes.ts) */
  readonly setting: MapSetting;
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
  /** what the map's buildings vary in: the named dress axes its kit reads and the roofs' age spread (null: a map reverted
   *  to its base look, its buildings' tints the kit's own pick, no neighbour rule) */
  readonly variation: BuildingVariation | null;
  /**
   * the walls' surface and depth as the photos show them: `grime` how dark the foot, the eaves' rain shadow and the runs
   * off the sills and eaves weather (1: the facade craft's own); `patches` the share of houses whose render shows its
   * losses and repairs (the stone under it); `tileRelief` the roof covering's relief (its normal map's scale); `reveal`
   * and `eave` the least reveal depth of the openings and eaves overhang of the place's houses (metres), which their
   * kit's houses keep. Decor and material only: no fetch is added and no collision moves. Null: a map reverted to its
   * base look (the facade craft's own grime, rain shadow and wear, no eave streaks, the covering's own relief).
   */
  readonly surface: { readonly grime: number; readonly patches: number; readonly tileRelief: number; readonly reveal: number; readonly eave: number } | null;
}

export const BUILDING_STYLES = {
  verdant: {
    kit: 'kolkhoz',
    setting: { years: [1943, 1943], cultures: ['orthodox'] },
    roof: { forms: ['hip', 'gable'], pitchDeg: [25, 48] },
    core: 'adobe', storeys: [1, 2], storeyM: [2.2, 3.2], bayM: [1.6, 3.6],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.55, tileRelief: 1, reveal: 0.15, eave: 0.5 },
  },
  desert: {
    kit: 'ksar',
    setting: { years: [1900, 1999], cultures: ['islamic', 'arab'] },
    roof: { forms: ['vault', 'flat', 'dome'], pitchDeg: null },
    core: 'adobe', storeys: [1, 4], storeyM: [2, 3.2], bayM: null,
    weathering: { damp: 0.25, moss: 0.05 }, wear: 0.15,
    // (Main 11-06: the paints traced from the record's photos) blue shutter (desert_3, shade-corrected, #1d688f); navy
    // blue door with white iron grille (desert_3, shade-corrected, #576d8c)
    variation: { axes: { paint: ['#1d688f', '#576d8c'] }, roofAge: [0, 1] },
    surface: { grime: 0.6, patches: 0.6, tileRelief: 1, reveal: 0.3, eave: 0 },
  },
  winter: {
    kit: 'goral',
    setting: { years: [1945, 1945], cultures: [] },
    roof: { forms: ['gable', 'halfhip'], pitchDeg: [45, 60] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3], bayM: [1.4, 3.2],
    weathering: { damp: 0.7, moss: 0.55 }, wear: 0.3,
    // (round-3 blind pairs, 0–6: every gable keeps the Zakopane sunburst, as on every house in the record's photos) the
    // houses vary by their window surrounds, as the photos show them: the pale pine of the sashes (winter_3) or the brown of
    // the carved surrounds (winter_2 and winter_0, #633c24 and #6a3a1a; no white, no blue in any photo)
    variation: { axes: { surround: ['pale', 'brown'] }, roofAge: [0.15, 1] },
    surface: { grime: 0.8, patches: 0.7, tileRelief: 1.15, reveal: 0.2, eave: 0.5 },
  },
  urban: {
    kit: 'franconian',
    setting: { years: [1945, 1945], cultures: ['central-europe'] },
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [45, 60] },
    core: 'masonry', storeys: [2, 5], storeyM: [2.8, 3.6], bayM: [1.6, 2.8],
    weathering: { damp: 0.5, moss: 0.4 }, wear: 0.25,
    // (Main 11-06: the paints traced from the record's photos) mint-green window frame transom (urban_3,
    // shade-corrected, #89ab92); ox-blood painted window surround/reveal (urban_3, shade-corrected, #7b403b);
    // bottle-green round-arched door (urban_2, corrected by the sandstone beside it, #054b30); dark maroon-brown glazed shop door frame
    // (urban_3, shade-corrected, #32201e)
    variation: { axes: { paint: ['#89ab92', '#7b403b', '#054b30', '#32201e'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.6, tileRelief: 1.35, reveal: 0.15, eave: 0.35 },
  },
  coastal: {
    kit: 'breton',
    setting: { years: [1944, 1944], cultures: [] },
    roof: { forms: ['gable'], pitchDeg: [40, 55] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3], bayM: [1.6, 4.8],
    weathering: { damp: 0.95, moss: 0.8 }, wear: 0.25,
    // (Main 11-06: the paints traced from the record's photos) crimson/maroon shutter (coastal_2, shade-corrected,
    // #5d1825); blue shutter (coastal_2, shade-corrected, #4082a0); sage-green shutter (coastal_3, shade-corrected,
    // #6c9077)
    variation: { axes: { paint: ['#5d1825', '#4082a0', '#6c9077'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.7, tileRelief: 1.2, reveal: 0.3, eave: 0.1 },
  },
  autumn: {
    kit: 'lorrain',
    setting: { years: [1944, 1944], cultures: [] },
    roof: { forms: ['gable'], pitchDeg: [18, 30] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 3.2], bayM: [1.4, 2.8],
    weathering: { damp: 0.75, moss: 0.45 }, wear: 0.3,
    // (Main 11-06: the paints traced from the record's photos) red shutter (autumn_2, #791e28); grey-blue louvred
    // shutter stile (autumn_1, #6c8599); blue painted shopfront door panel (autumn_4, shade-corrected, #265f94)
    variation: { axes: { paint: ['#791e28', '#6c8599', '#265f94'] }, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.7, tileRelief: 1.35, reveal: 0.25, eave: 0.3 },
  },
  steppe: {
    kit: 'tselina',
    setting: { years: [1954, 1970], cultures: ['orthodox', 'islamic'] },
    roof: { forms: ['gable', 'hip', 'flat', 'shed'], pitchDeg: [18, 32] },
    core: 'adobe', storeys: [1, 3], storeyM: [2.6, 3.2], bayM: [1.8, 3.4],
    weathering: { damp: 0.4, moss: 0.15 }, wear: 0.25,
    // (Main 11-06: the paints traced from the record's photos) royal-blue porch panel and casings (steppe_2,
    // shade-corrected, #293966); weathered pale-blue window casing nalichnik (steppe_5, shade-corrected, #9ac6da);
    // teal-green door stile (steppe_2, shade-corrected, #325d54)
    variation: { axes: { paint: ['#293966', '#9ac6da', '#325d54'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.6, tileRelief: 1.15, reveal: 0.15, eave: 0.4 },
  },
  railyard: {
    kit: 'ruhr',
    setting: { years: [1945, 1945], cultures: ['central-europe'] },
    roof: { forms: ['gable', 'shed', 'sawtooth', 'flat'], pitchDeg: [15, 45] },
    core: 'masonry', storeys: [1, 4], storeyM: [3, 5], bayM: [2, 4.5],
    weathering: { damp: 0.7, moss: 0.1 }, wear: 0.2,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.45, patches: 0.5, tileRelief: 1.2, reveal: 0.15, eave: 0.35 },
  },
  frontier: {
    kit: 'hessian',
    setting: { years: [1950, 1989], cultures: ['central-europe'] },
    roof: { forms: ['gable', 'halfhip'], pitchDeg: [42, 55] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.4, 3.2], bayM: [1.2, 2.8],
    weathering: { damp: 0.85, moss: 0.55 }, wear: 0.22,
    // (Main 11-06: round 5 and the confirmatory pairs together 3–15 against it, p < 0.10, so the whole map reverts
    // to its base look: the kit's own tints, roofs, surfaces and paints; its weathering and wear were the kit's already)
    variation: null,
    surface: null,
  },
  fjord: {
    kit: 'nordland',
    setting: { years: [1940, 1940], cultures: ['nordic'] },
    roof: { forms: ['gable'], pitchDeg: [30, 45] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3], bayM: [1.4, 3],
    weathering: { damp: 0.7, moss: 0.45 }, wear: 0.3,
    // (Main 11-06: the paints traced from the record's photos) falu-red plank door on the naust side wall (fjord_2,
    // #963a2a); dark red window frame transom (fjord_1, shade-corrected, #6f302c); white window frame stile (fjord_2,
    // #dfc9c2)
    variation: { axes: { paint: ['#963a2a', '#6f302c', '#dfc9c2'] }, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.5, tileRelief: 1.2, reveal: 0.1, eave: 0.5 },
  },
  delta: {
    kit: 'bengal',
    setting: { years: [1971, 1971], cultures: ['islamic'] },
    roof: { forms: ['gable', 'hip', 'curved', 'flat'], pitchDeg: [20, 35] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 3.2], bayM: [1.6, 3.6],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    // (Main 11-06: the paints traced from the record's photos; no painted joinery shows, so the doors' own wood)
    // bamboo/jute matting wall of the hut beside the doorway (delta_0, #a98969); weathered plank crate/box in front of
    // the doorway (delta_0, #887755)
    variation: { axes: { paint: ['#a98969', '#887755'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.15, reveal: 0.1, eave: 0.7 },
  },
  badlands: {
    kit: 'wadirum',
    setting: { years: [2020, 2026], cultures: ['islamic', 'arab'] },
    roof: { forms: ['flat'], pitchDeg: null },
    core: 'adobe', storeys: [1, 2], storeyM: [2.8, 3.2], bayM: [1.8, 4],
    // (Main 11-06: lost its one fresh judge 1–9 under the pair rule, so the whole map reverts to its base look: the kit's
    // own renders and weather, the craft's default damp and moss)
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    variation: null,
    surface: null,
  },
  monsoon: {
    kit: 'kohima',
    setting: { years: [1944, 1944], cultures: [] },
    roof: { forms: ['gable', 'hip'], pitchDeg: [25, 55] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 3.4], bayM: [1.6, 4.6],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    // (Main 11-06: round 5 and the confirmatory pairs together 3–11 against it, p < 0.10, so the whole map reverts
    // to its base look: the kit's own tints, roofs, surfaces and paints; its weathering and wear were the kit's already)
    variation: null,
    surface: null,
  },
  alpine: {
    kit: 'savoyard',
    setting: { years: [1945, 1945], cultures: [] },
    roof: { forms: ['gable'], pitchDeg: [25, 40] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.3, 3], bayM: [1.4, 3.4],
    weathering: { damp: 0.95, moss: 0.5 }, wear: 0.3,
    // (Main 11-06: the paints traced from the record's photos; no painted joinery shows, so the doors' own wood) honey
    // larch window frame/shutter at the right edge (alpine_1, #b7885e); red-brown stained plank door (alpine_2,
    // #865e45); weathered grey-brown plank door of snowbound stone byre (alpine_1, #5c4b4c)
    variation: { axes: { paint: ['#b7885e', '#865e45', '#5c4b4c'] }, roofAge: [0, 1] },
    surface: { grime: 0.9, patches: 0.7, tileRelief: 1.2, reveal: 0.4, eave: 0.55 },
  },
  caldera: {
    kit: 'kyushu',
    setting: { years: [1900, 1999], cultures: [] },
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [25, 50] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.4, 4.4], bayM: [0.9, 2.2],
    weathering: { damp: 0.7, moss: 0.45 }, wear: 0.22,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.35, reveal: 0.15, eave: 0.55 },
  },
  foundry: {
    kit: 'saar',
    setting: { years: [1945, 1945], cultures: ['central-europe'] },
    roof: { forms: ['gable', 'sawtooth', 'flat', 'shed'], pitchDeg: [15, 40] },
    core: 'masonry', storeys: [1, 4], storeyM: [3.2, 8], bayM: [2.4, 6],
    weathering: { damp: 0.6, moss: 0.15 }, wear: 0.4,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.45, patches: 0.7, tileRelief: 1.15, reveal: 0.2, eave: 0.45 },
  },
  ruinspires: {
    kit: 'sarajevo',
    setting: { years: [1992, 1996], cultures: ['islamic', 'orthodox', 'central-europe'] },
    roof: { forms: ['hip', 'flat', 'gable'], pitchDeg: [25, 55] },
    core: 'masonry', storeys: [2, 18], storeyM: [2.8, 3.8], bayM: [1.4, 3.2],
    weathering: { damp: 0.7, moss: 0.3 }, wear: 0.5,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.3, patches: 0.75, tileRelief: 1.35, reveal: 0.2, eave: 0.8 },
  },
  blackglass: {
    kit: 'shanghai',
    setting: { years: [1937, 1937], cultures: [] },
    roof: { forms: ['gable', 'flat', 'hip'], pitchDeg: [20, 35] },
    core: 'masonry', storeys: [2, 4], storeyM: [3, 4], bayM: [1.4, 2.8],
    weathering: { damp: 0.85, moss: 0.35 }, wear: 0.3,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.7, tileRelief: 1.35, reveal: 0.2, eave: 0.6 },
  },
  titan_gorge: {
    kit: 'navajo',
    setting: { years: [1900, 1999], cultures: [] },
    roof: { forms: ['flat', 'dome', 'gable'], pitchDeg: [15, 30] },
    core: 'adobe', storeys: [1, 2], storeyM: [2.4, 3.2], bayM: [1.8, 4],
    weathering: { damp: 0.4, moss: 0.03 }, wear: 0.15,
    // (Main 11-06: the paints traced from the record's photos; no painted joinery shows, so the doors' own wood) hogan
    // plank door (titan_gorge_1, #8a532f); white/aluminium sliding-window mullion (titan_gorge_3, #caa692); weathered
    // dark plank wall/door of Oljato outbuilding (titan_gorge_0, #3e2117)
    variation: { axes: { paint: ['#8a532f', '#caa692', '#3e2117'] }, roofAge: [0, 1] },
    surface: { grime: 0.6, patches: 0.4, tileRelief: 1, reveal: 0.3, eave: 0.35 },
  },
  skybridge: {
    kit: 'glencanyon',
    setting: { years: [1957, 1966], cultures: [] },
    roof: { forms: ['flat', 'gable', 'hip'], pitchDeg: [15, 25] },
    core: 'concrete', storeys: [1, 3], storeyM: [2.5, 4.5], bayM: [1.6, 7],
    weathering: { damp: 0.2, moss: 0.02 }, wear: 0.18,
    // (Main 11-06: the paints traced from the record's photos; no painted joinery shows, so the doors' own wood)
    // louvred steel panel in the powerhouse wall (skybridge_3, shade-corrected, #896758); dark access hatch/doorway on
    // the dam-toe walkway; corrected against sunlit dam concrete (skybridge_3, shade-corrected, #523129)
    variation: { axes: { paint: ['#896758', '#523129'] }, roofAge: [0, 1] },
    surface: { grime: 0.5, patches: 0.35, tileRelief: 1, reveal: 0.1, eave: 0.55 },
  },
  polders: {
    kit: 'polder',
    setting: { years: [1944, 1944], cultures: [] },
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [40, 55] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.5, 3.2], bayM: [1.4, 4.2],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    // (Main 11-06: lost its one fresh judge 0–7 under the pair rule, so the whole map reverts to its base look: the
    // kit's own tints, surfaces and paints; its weathering and wear were the kit's already)
    variation: null,
    surface: null,
  },
  copper_mesa: {
    kit: 'queenstown',
    setting: { years: [1893, 1994], cultures: [] },
    roof: { forms: ['gable', 'hip', 'shed'], pitchDeg: [20, 35] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 4], bayM: [1.6, 3.4],
    weathering: { damp: 0.6, moss: 0.3 }, wear: 0.25,
    // (Main 11-06: the paints traced from the record's photos) duck-egg/aqua painted plank door of weatherboard house
    // (copper_mesa_0, shade-corrected, #8fb8b4); pale sage-green painted bay-window panelling of the Hunters Hotel
    // (copper_mesa_3, #b4bfb6); oxblood painted timber verandah post at the hotel (copper_mesa_3, #5a272e)
    variation: { axes: { paint: ['#8fb8b4', '#b4bfb6', '#5a272e'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.5, tileRelief: 1.15, reveal: 0.1, eave: 0.4 },
  },
  airfield: {
    kit: 'hostomel',
    setting: { years: [2022, 2022], cultures: ['orthodox'] },
    roof: { forms: ['flat', 'vault', 'gable', 'hip'], pitchDeg: [5, 40] },
    core: 'masonry', storeys: [1, 5], storeyM: [2.3, 3.3], bayM: [0.8, 3],
    weathering: { damp: 0.55, moss: 0.25 }, wear: 0.45,
    // (Main 11-06: the paints traced from the record's photos) white PVC shopfront panel of the left kiosk
    // (airfield_3, shade-corrected, #e9e5df); green painted pharmacy shopfront around the door (airfield_3,
    // shade-corrected, #3da041)
    variation: { axes: { paint: ['#e9e5df', '#3da041'] }, roofAge: [0, 1] },
    surface: { grime: 1, patches: 0.75, tileRelief: 1.15, reveal: 0.1, eave: 0.35 },
  },
  oasis: {
    kit: 'siwa',
    setting: { years: [1900, 1999], cultures: ['islamic', 'arab'] },
    roof: { forms: ['flat'], pitchDeg: null },
    core: 'adobe', storeys: [1, 3], storeyM: [2.4, 3], bayM: null,
    weathering: { damp: 0.12, moss: 0 }, wear: 0.2,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.5, patches: 0.6, tileRelief: 1, reveal: 0.3, eave: 0 },
  },
  whiteout: {
    kit: 'arctic',
    setting: { years: [1980, 1989], cultures: [] },
    roof: { forms: ['flat', 'vault', 'dome'], pitchDeg: null },
    core: 'masonry', storeys: [1, 2], storeyM: [2.6, 4], bayM: [2, 5],
    weathering: { damp: 0.25, moss: 0 }, wear: 0.1,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.4, patches: 0.2, tileRelief: 1, reveal: 0.1, eave: 0.15 },
  },
  orchard: {
    kit: 'chouf',
    setting: { years: [1900, 1999], cultures: ['islamic', 'arab'] },
    roof: { forms: ['hip', 'flat'], pitchDeg: [20, 30] },
    core: 'masonry', storeys: [1, 3], storeyM: [3, 4], bayM: [1.2, 4],
    weathering: { damp: 0.45, moss: 0.25 }, wear: 0.3,
    // (Main 11-06: lost its one fresh judge 0–8 under the pair rule, the traced tan and cream shutters against the kit's
    // green and blue, so the whole map reverts to its base look; its weathering and wear were the kit's already)
    variation: null,
    surface: null,
  },
  longleaf: {
    kit: 'longleaf',
    setting: { years: [1941, 1941], cultures: [] },
    roof: { forms: ['gable', 'hip'], pitchDeg: [25, 45] },
    core: 'masonry', storeys: [1, 2], storeyM: [2.8, 3.6], bayM: [1.6, 5.4],
    weathering: { damp: 0.65, moss: 0.35 }, wear: 0.3,
    // (Main 11-06: the paints traced from the record's photos) off-white window casing (longleaf_3, shade-corrected,
    // #dfd5cf); dull red-brown window sash (longleaf_3, shade-corrected, #8d6d73); dark brown store door under the
    // porch (longleaf_2, shade-corrected, #281828)
    variation: { axes: { paint: ['#dfd5cf', '#8d6d73', '#281828'] }, roofAge: [0, 1] },
    surface: { grime: 1.1, patches: 0.5, tileRelief: 1.15, reveal: 0.05, eave: 0.45 },
  },
  mangrove: {
    kit: 'mekong',
    setting: { years: [1960, 1969], cultures: [] },
    roof: { forms: ['gable', 'hip'], pitchDeg: [25, 40] },
    core: 'masonry', storeys: [1, 1], storeyM: [2.4, 3], bayM: [1.6, 4],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    // (Main 11-06: the paints traced from the record's photos) pale blue painted plank panel/shutter (mangrove_3,
    // shade-corrected, #94bed7); mid-blue folding doors with red-brown studs (mangrove_3, shade-corrected, #2f4654);
    // cream-white painted post/door-frame paint (mangrove_3, shade-corrected, #e3e8da)
    variation: { axes: { paint: ['#94bed7', '#2f4654', '#e3e8da'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.4, tileRelief: 1, reveal: 0.15, eave: 0.5 },
  },
  saltwind: {
    kit: 'dalmatian',
    setting: { years: [1900, 1999], cultures: [] },
    roof: { forms: ['gable'], pitchDeg: [18, 30] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.6, 3.2], bayM: [1.4, 3],
    weathering: { damp: 0.45, moss: 0.25 }, wear: 0.3,
    // (Main 11-06: lost its one fresh judge 1–6 under the pair rule, so the whole map reverts to its base look: the
    // kit's own tints, surfaces and paints; its weathering and wear were the kit's already)
    variation: null,
    surface: null,
  },
  reservoir: {
    kit: 'eifel',
    setting: { years: [1944, 1945], cultures: ['central-europe'] },
    roof: { forms: ['gable', 'hip', 'halfhip'], pitchDeg: [40, 55] },
    core: 'masonry', storeys: [1, 3], storeyM: [2.4, 3.2], bayM: [1.2, 2.8],
    weathering: { damp: 0.8, moss: 0.5 }, wear: 0.2,
    // (Main 11-06: the paints traced from the record's photos) green plank barn door (reservoir_2, #347f5a); red
    // painted door frame (reservoir_2, #de4841); oxblood-red window frame (reservoir_3, shade-corrected, #904744)
    variation: { axes: { paint: ['#347f5a', '#de4841', '#904744'] }, roofAge: [0, 1] },
    surface: { grime: 1.2, patches: 0.55, tileRelief: 1.2, reveal: 0.15, eave: 0.35 },
  },
  mars: {
    kit: 'olympus',
    setting: { years: [2100, 2100], cultures: [] },
    roof: { forms: ['flat', 'vault'], pitchDeg: null },
    core: 'concrete', storeys: [1, 2], storeyM: [2.5, 4], bayM: null,
    weathering: { damp: 0.05, moss: 0 }, wear: 0.05,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.2, patches: 0.1, tileRelief: 1, reveal: 0, eave: 0 },
  },
  moon: {
    kit: 'littrow',
    setting: { years: [2046, 2046], cultures: [] },
    roof: { forms: ['vault', 'flat'], pitchDeg: null },
    core: 'concrete', storeys: [1, 2], storeyM: [2.5, 4], bayM: null,
    weathering: { damp: 0, moss: 0 }, wear: 0.15,
    variation: { axes: {}, roofAge: [0, 1] },
    surface: { grime: 0.2, patches: 0.1, tileRelief: 1, reveal: 0, eave: 0 },
  },
  cliffbridge: {
    kit: 'andalusian',
    setting: { years: [1900, 1999], cultures: [] },
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
export function variationOf(mapId: string, kit: string): BuildingVariation | null {
  return rowFor(mapId, kit).variation;
}

/** The share of a kit's houses on a map that show war damage. */
export function wearOf(mapId: string, kit: string): number {
  return rowFor(mapId, kit).wear;
}
