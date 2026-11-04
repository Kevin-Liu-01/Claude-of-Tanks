// src/world/groundSurfaces.ts — the ground-surface table (item ground-269, 2026-11-04; the owner: "a lot of ground esp on
// city maps looks flat. big nonoo at the minimum theres gotta be grass or some kind of texturing on ground, but our old
// texturing with black spaces is kind of goofy" / "update the ground detail and then specifically ground textures in all
// mapps"; DECISIONS 2026-11-04 "Ground detail and textures on every map").
//
// One row per visual class of ground: where its albedo, normal and roughness come from, its macro variation (the 1–12 m
// mosaic the terrain material lays over it), its close-range detail (the stones, grit and debris within ~25 m), the
// ground cover that stands on it, and the simulation surface it sits on (the world's surfaceAt: earth, hard, sand, snow,
// mud or water — what a shell or a track hears there). One row per battlefield naming the class of each of its grounds:
// the open ground (the splat's G layer), the worn ground (D), the steep ground (R), the wet ground (M) and the town floor
// (the village mask's ground). Its roads take their classes from the paved catalogue (roadSurfaces.ts) through
// ROAD_CLASS. A map or a class without a row fails typecheck; the material reads the classes as codes
// (groundSurfaceUniformValues), never a map id.
//
// Presentation only: nothing here reaches the height field, the contact surface, the collision or the sim. The sim
// surface column is a statement about the world as it stands (groundSurfaces.selftest.mjs holds every row against the
// world's surface law), so the ground that is drawn is the ground that is heard.
// THREE-free (the receipt and the rooms' tooling read it in Node).
import type { MapId } from './maps/mapIds.ts';
import type { RoadSurface } from './roadSurfaces.ts';

/** The world's surface under a point (audio/audioEngine.ts surfaceAt: the height field's ground type, its track surface
 * and the carriageway's paved share). */
export type SimSurface = 'earth' | 'hard' | 'sand' | 'snow' | 'mud' | 'water';

/** The photo sets the splat layers wear (sourcedTextures.ts SETS: each set's Color, NormalGL and Roughness maps). */
export type GroundPhotoSet = 'grass' | 'dryGrass' | 'dirt' | 'sand' | 'snow' | 'rock' | 'cobble';

/** Where a class's albedo, normal and roughness come from: a sourced CC0 photo set (docs/ATTRIBUTION.md) under the map's
 * tint, or a first-party procedural painter named by its owner. */
export type GroundTextures =
  | { readonly photo: GroundPhotoSet; readonly painter?: undefined }
  | { readonly photo?: undefined; readonly painter: string };

/** The class's 1–12 m mosaic in the material (GROUND_MACRO_CODE). sward: lush clumps, cured patches and thin sward over
 * its soil; tussock: cured tussocks with bare ground between; soil: damp and dry clods, stony patches; yard: trodden
 * earth and gravel with weed patches and damp hollows; rubble: dust, brick and masonry chips; paved, sand, snow, rock:
 * the class's own law elsewhere in the material (no mosaic of this table's); none: nothing. */
export type GroundMacro = 'sward' | 'tussock' | 'soil' | 'yard' | 'rubble' | 'paved' | 'sand' | 'snow' | 'rock' | 'none';
/** The class's close-range detail within ~25 m (GROUND_CLOSE_CODE): stones (pebbles and clods, each its own shade and
 * contact shadow), grit (fine gravel), debris (brick and masonry chips, angular), or the class's own law elsewhere
 * (blades: the turf's 0.37 m octave; joints: a paving's; grain: sand or snow grain; none). */
export type GroundClose = 'stones' | 'grit' | 'debris' | 'blades' | 'joints' | 'grain' | 'none';
/** What stands on the class (the tall-grass biomes of groundRedux.ts, the tufts, the weeds of a yard). Fresh tilled soil
 * carries none (DECISIONS 2026-10-28). */
export type GroundCover = 'meadow' | 'steppe' | 'verge' | 'reed' | 'dune' | 'sedge' | 'weeds' | 'understorey' | 'none';

interface GroundClassRow {
  readonly textures: GroundTextures;
  readonly macro: { readonly kind: GroundMacro; readonly strength: number };
  /** The close detail, and the relief's cap: the share of the sun's own slope a detail facet may turn away from the sun
   * (0.3: the darkest facet keeps about 70 % of the flat ground's direct light, so the relief never draws a near-black
   * blotch; the facets toward and across the sun keep theirs; 0 = no cap, rock). */
  readonly close: { readonly kind: GroundClose; readonly strength: number; readonly tilt: number };
  readonly cover: GroundCover;
  readonly sim: SimSurface;
}

/** Every visual class of ground. */
export const GROUND_CLASS_IDS = Object.freeze([
  // vegetated
  'meadow', 'verge', 'steppe', 'mossBank',
  // soils
  'soil', 'tilled', 'forestFloor', 'gravel', 'cinder', 'slag',
  // arid
  'sand', 'beachSand', 'hardpan', 'regolith', 'sandstone',
  // cold and wet
  'snow', 'trampledSnow', 'ice', 'mud',
  // rock
  'rock',
  // carriageways and paving
  'dirtRoad', 'asphalt', 'patchedAsphalt', 'setts', 'concrete', 'clinker', 'brick',
  // town floors
  'yard', 'rubble', 'packedSand',
] as const);
export type GroundClass = (typeof GROUND_CLASS_IDS)[number];

const photo = (set: GroundPhotoSet): GroundTextures => ({ photo: set });
/** The setts' joints' least tone as a share of their stone's (roadSurfaceShader.ts): sand and grit, never a black grid. */
const SETTS_JOINT_FLOOR = 0.55;
/** The relief's cap by the class's macro law (a share of the sun's slope): turf soft, soils and yards rougher, rock
 * uncapped. */
const RELIEF_TILT: Readonly<Record<GroundMacro, number>> = Object.freeze({
  sward: 0.3, tussock: 0.35, soil: 0.45, yard: 0.4, rubble: 0.5, paved: 0.3, sand: 0.4, snow: 0.4, rock: 0, none: 0.4,
});
const painter = (name: string): GroundTextures => ({ painter: name });
const row = (textures: GroundTextures, macro: GroundMacro, macroStrength: number, close: GroundClose, closeStrength: number,
  cover: GroundCover, sim: SimSurface): GroundClassRow => Object.freeze({
  textures, macro: Object.freeze({ kind: macro, strength: macroStrength }),
  close: Object.freeze({ kind: close, strength: closeStrength, tilt: RELIEF_TILT[macro] }), cover, sim,
});

/** The classes. */
export const GROUND_CLASSES: Readonly<Record<GroundClass, GroundClassRow>> = Object.freeze({
  // a hay or pasture meadow over loam: lush and cured clumps, thin sward over its soil in patches
  meadow: row(photo('grass'), 'sward', 1, 'stones', 0.45, 'meadow', 'earth'),
  // a trodden short turf (verges, yards' edges, airfields, the cities' green): more bare and gritty
  verge: row(photo('grass'), 'sward', 1.15, 'grit', 0.7, 'verge', 'earth'),
  // cured feather grass and its tussocks, the steppe's bare earth between
  steppe: row(photo('dryGrass'), 'tussock', 1, 'grit', 0.6, 'steppe', 'earth'),
  // a wet cut bank under moss and root mats (Monsoon's steep ground)
  mossBank: row(photo('grass'), 'sward', 0.5, 'none', 0, 'none', 'earth'),
  // bare earth: worn patches, field margins, tracks' shoulders — clods and stones
  soil: row(photo('dirt'), 'soil', 1, 'stones', 1, 'none', 'earth'),
  // turned and row-crop fields (landUse.ts's furrows over the soil): no tufts on fresh tilled soil
  tilled: row(painter('landUse.ts plough and crops over the dirt set'), 'none', 0, 'stones', 0.35, 'none', 'earth'),
  // the woods' floor: leaf litter over the soil, moss in the light gaps (terrain.ts woods)
  forestFloor: row(photo('dirt'), 'soil', 0.5, 'none', 0, 'understorey', 'earth'),
  // Queenstown's stripped hills: conglomerate gravel (the dirt set toned pink and ochre); its tracks print as sand
  gravel: row(photo('dirt'), 'soil', 0.8, 'stones', 1, 'none', 'sand'),
  // a rail yard's cinder and ash (terrain.ts uYardCinder)
  cinder: row(painter('terrain.ts yard cinder over the dirt set'), 'none', 0, 'grit', 0.8, 'weeds', 'earth'),
  // a works' slag, ballast and hardstanding (terrain.ts works floor)
  slag: row(painter('terrain.ts worksSlag'), 'none', 0, 'grit', 0.6, 'none', 'earth'),
  // loose sand, its ripples and lag
  sand: row(photo('sand'), 'sand', 0, 'grain', 0, 'none', 'sand'),
  // a strand's dry sand above the swash (the shore policy prints it as sand)
  beachSand: row(photo('sand'), 'sand', 0, 'grain', 0, 'dune', 'sand'),
  // the canyons' packed ochre and red earth shelves (the sand set toned): earth underfoot
  hardpan: row(photo('sand'), 'sand', 0, 'grit', 0.5, 'none', 'earth'),
  // airless or Martian regolith: fine dust over basalt grit
  regolith: row(photo('sand'), 'sand', 0, 'grain', 0, 'none', 'sand'),
  // the bedded sandstone and mudstone walls (terrain.ts makeSandstoneLayer)
  sandstone: row(painter('terrain.ts makeSandstoneLayer'), 'rock', 0, 'none', 0, 'none', 'earth'),
  // wind-packed snow: crust and powder, sastrugi
  snow: row(photo('snow'), 'snow', 0, 'grain', 0, 'sedge', 'snow'),
  // a snow map's worn ground: the snow trampled and compacted, slushy in its hollows, the dirt set showing only where the
  // wear is strong (terrain.ts's snow wear law over the D layer)
  trampledSnow: row(photo('dirt'), 'snow', 0, 'none', 0, 'none', 'snow'),
  // frozen marsh and lake ice (terrain.ts makeIceLayer)
  ice: row(painter('terrain.ts makeIceLayer and its cracks'), 'none', 0, 'none', 0, 'none', 'hard'),
  // marsh mud, its puddles' gloss (terrain.ts createWetSplatLayer)
  mud: row(painter('terrain.ts createWetSplatLayer'), 'none', 0, 'none', 0, 'reed', 'mud'),
  // exposed rock: crags, outcrops and steep faces
  rock: row(photo('rock'), 'rock', 0, 'none', 0, 'none', 'earth'),
  // an unpaved road: ruts, crown, stones and potholes over packed earth (roadSurfaceShader.ts carriageway)
  dirtRoad: row(painter('roadSurfaceShader.ts ROAD_CARRIAGEWAY_GLSL'), 'none', 0, 'none', 0, 'none', 'earth'),
  asphalt: row(painter('roadSurfaceShader.ts asphalt'), 'paved', 0, 'joints', 0, 'none', 'hard'),
  patchedAsphalt: row(painter('roadSurfaceShader.ts patched asphalt: repairs, cracks, covers'), 'paved', 0, 'joints', 0, 'weeds', 'hard'),
  setts: row(photo('cobble'), 'paved', 0, 'joints', 0, 'weeds', 'hard'),
  concrete: row(painter('roadSurfaceShader.ts concrete slabs'), 'paved', 0, 'joints', 0, 'weeds', 'hard'),
  clinker: row(painter('roadSurfaceShader.ts clinker herringbone'), 'paved', 0, 'joints', 0, 'none', 'hard'),
  brick: row(painter('roadSurfaceShader.ts brick soling'), 'paved', 0, 'joints', 0, 'none', 'hard'),
  // a town's open ground off the streets: trodden earth and gravel, weeds along its edges, damp hollows
  yard: row(painter('groundSurfaceShader.ts yard over the dirt set'), 'yard', 1, 'stones', 1, 'weeds', 'earth'),
  // a shelled city's open ground: dust over broken brick and masonry, weeds through it
  rubble: row(painter('groundSurfaceShader.ts rubble over the dirt set'), 'rubble', 1, 'debris', 1, 'weeds', 'earth'),
  // a desert town's trodden sand (the worn-sand set)
  packedSand: row(photo('sand'), 'sand', 0, 'grit', 0.4, 'none', 'sand'),
});

/** The paved catalogue's surfaces as classes. */
export const ROAD_CLASS: Readonly<Record<RoadSurface, GroundClass>> = Object.freeze({
  asphalt: 'asphalt', cobble: 'setts', patched: 'patchedAsphalt', dirt: 'dirtRoad', clinker: 'clinker', concrete: 'concrete', brick: 'brick',
});

interface MapGroundRow {
  /** The open ground (the splat's G layer). */
  readonly open: GroundClass;
  /** The worn ground (D): worn patches, shoulders, tracks, and the town's dirt where the map has no town floor. */
  readonly worn: GroundClass;
  /** The steep ground (R) — on a map whose R layer is its paving print, the setts. */
  readonly steep: GroundClass;
  /** The wet ground (M): marsh and lake mud, or their ice. */
  readonly wet: GroundClass;
  /** The built-up area's floor (the village mask's ground), or null where the worn ground stands for it. */
  readonly town: GroundClass | null;
}

const ground = (open: GroundClass, worn: GroundClass, steep: GroundClass, wet: GroundClass, town: GroundClass | null): MapGroundRow =>
  Object.freeze({ open, worn, steep, wet, town });

/** Every battlefield's grounds. */
export const MAP_GROUND: Readonly<Record<MapId, MapGroundRow>> = Object.freeze({
  verdant: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  desert: ground('sand', 'sand', 'sandstone', 'mud', 'packedSand'),
  winter: ground('snow', 'trampledSnow', 'rock', 'ice', null),
  urban: ground('verge', 'soil', 'setts', 'mud', 'yard'),
  coastal: ground('meadow', 'beachSand', 'rock', 'mud', 'yard'),
  autumn: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  steppe: ground('steppe', 'soil', 'rock', 'mud', 'yard'),
  railyard: ground('verge', 'cinder', 'setts', 'mud', 'cinder'),
  frontier: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  fjord: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  delta: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  badlands: ground('sand', 'sand', 'sandstone', 'mud', 'packedSand'),
  monsoon: ground('meadow', 'soil', 'mossBank', 'mud', 'yard'),
  alpine: ground('snow', 'trampledSnow', 'rock', 'ice', null),
  caldera: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  foundry: ground('verge', 'soil', 'setts', 'mud', 'slag'),
  ruinspires: ground('verge', 'soil', 'rock', 'mud', 'rubble'),
  blackglass: ground('verge', 'soil', 'rock', 'mud', 'rubble'),
  titan_gorge: ground('hardpan', 'hardpan', 'sandstone', 'mud', 'hardpan'),
  skybridge: ground('hardpan', 'hardpan', 'sandstone', 'mud', 'hardpan'),
  polders: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  copper_mesa: ground('gravel', 'gravel', 'rock', 'mud', null),
  airfield: ground('verge', 'cinder', 'setts', 'mud', 'yard'),
  oasis: ground('sand', 'sand', 'sandstone', 'mud', 'packedSand'),
  whiteout: ground('snow', 'trampledSnow', 'rock', 'ice', null),
  orchard: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  longleaf: ground('meadow', 'soil', 'soil', 'mud', 'yard'),
  mangrove: ground('meadow', 'soil', 'mossBank', 'mud', 'yard'),
  saltwind: ground('meadow', 'beachSand', 'rock', 'mud', 'yard'),
  reservoir: ground('meadow', 'soil', 'rock', 'mud', 'yard'),
  mars: ground('regolith', 'regolith', 'sandstone', 'mud', null),
  moon: ground('regolith', 'regolith', 'rock', 'mud', null),
  cliffbridge: ground('steppe', 'soil', 'rock', 'mud', 'setts'),
});

/** The material's codes for the table's laws (0 = none: the class's own law elsewhere in the material). */
export const GROUND_MACRO_CODE: Readonly<Record<GroundMacro, number>> = Object.freeze({
  none: 0, sward: 1, tussock: 2, soil: 3, yard: 4, rubble: 5, paved: 0, sand: 0, snow: 0, rock: 0,
});
export const GROUND_CLOSE_CODE: Readonly<Record<GroundClose, number>> = Object.freeze({
  none: 0, stones: 1, grit: 2, debris: 3, blades: 0, joints: 0, grain: 0,
});

/** The map's row (an unknown id: Verdant's, as the terrain plan falls back). */
export function mapGround(mapId: string | null | undefined): MapGroundRow {
  return Object.hasOwn(MAP_GROUND, mapId ?? '') ? MAP_GROUND[mapId as MapId] : MAP_GROUND.verdant;
}

/**
 * The terrain material's four vectors for a map (one vec4 each, no sampler — the program sits at the 16-unit budget):
 * (the open ground's macro code and strength, its close code and strength), the worn ground's likewise, the town floor's
 * (macro code, close code, close strength, 1 where the map draws a town floor of this table's) and the relief caps (the
 * open ground's cap, the worn ground's, the setts' joints' floor). A town floor whose class has no macro of the table's (cinder,
 * slag, setts, packed sand) keeps the material's own law there.
 */
export function groundSurfaceUniformValues(mapId: string | null | undefined): {
  open: [number, number, number, number];
  worn: [number, number, number, number];
  town: [number, number, number, number];
  near: [number, number, number, number];
} {
  const g = mapGround(mapId);
  const pack = (cls: GroundClass): [number, number, number, number] => {
    const c = GROUND_CLASSES[cls];
    return [GROUND_MACRO_CODE[c.macro.kind], c.macro.strength, GROUND_CLOSE_CODE[c.close.kind], c.close.strength];
  };
  const town = g.town ? GROUND_CLASSES[g.town] : null;
  const townMacro = town ? GROUND_MACRO_CODE[town.macro.kind] : 0;
  return {
    open: pack(g.open),
    worn: pack(g.worn),
    town: town && townMacro > 0 ? [townMacro, GROUND_CLOSE_CODE[town.close.kind], town.close.strength, 1] : [0, 0, 0, 0],
    // the relief caps: the open ground's class, and the worn ground's for the rest (the sward's share mixes them); and the
    // setts' joints' floor (a share of their stone's tone: sand and grit, not a black grid, on every map's paving)
    near: [GROUND_CLASSES[g.open].close.tilt || 0.45, GROUND_CLASSES[g.worn].close.tilt || 0.45, SETTS_JOINT_FLOOR, 0],
  };
}
