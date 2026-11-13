// src/world/roadSurfaces.ts — the roads lane's catalogue (2026-10-09; owner: "make sure roads and stuff are really good",
// then: the roads "need to look a lot better, especially paved ones"): what each road surface is, what each map's roads
// are made of, and the gains of the worked unpaved carriageway. A leaf module (no imports): the terrain material
// (terrain.ts) reads it for its uniforms. Each map's paved surfaces, its paths' surfaces and its carriageway's work are its
// row in the built-environment table (maps/builtEnvironmentTable.ts, built-env-270), which the layout and the material read.
//
// Period rulings (map revival lane, 2026-10-09): Verdant unchanged (the owner's light-touch rule); Steinburg 1984 patched
// asphalt streets with a sett square; Suzhou Creek 1937 tar macadam and setts (its own pathStyles); Ruinspires 1992
// patched asphalt (its own pathStyles); Ironworks 1945 setts in the works town, cinder beyond; Aegis Crossing 1972 setts in
// Ronda's streets; Tidegate Polders 1944 clinker on the dyke roads; Jade River Delta 2010 brick soling on the village roads;
// Monsoon Ridge 1944 the metalled (tar macadam) Dimapur–Imphal road. The owner's protected maps (Frontier, Frosthollow,
// Saltwind, Reservoir, Cinder Junction, Saltmere, Sirocco, Nordhavn, Verdant) keep their roads as they are.

/** A road's surface: asphalt; cobble (setts); patched (asphalt with repairs and cracks); dirt (the country road);
 * clinker (a dyke road's klinkers in herringbone); concrete (a lane road in sawn slabs); brick (brick soling in
 * herringbone, broken and mud-dressed). */
export type RoadSurface = 'asphalt' | 'cobble' | 'patched' | 'dirt' | 'clinker' | 'concrete' | 'brick';
/** The road layer's class codes (R) and the paved surfaces' shader codes: 0 the map's own road. */
export const ROAD_SURFACE_CODE: Readonly<Record<RoadSurface, number>> = Object.freeze({
  asphalt: 1, cobble: 2, patched: 3, dirt: 4, clinker: 5, concrete: 6, brick: 7,
});

/**
 * A paved map's own surfaces in place of the R layer's sett print — its streets' class and, off any centreline, its
 * squares' (each a RoadSurface but dirt; 'print' keeps the squares' own print or slabs), setts laid in segmental arcs ('fan', the German street's Segmentbogenpflaster)
 * or straight courses, a kerbed town's sett gutter (gutterM wide; kerbs: the props' kerbed streets, paved out to the
 * kerbs' face), paving only inside the town rect (townOnly: the works town's setts, the country roads past it earth), and
 * the wear: patches, cracks and iron covers (gains, 1 = a town street's).
 */
export interface PavedSurfaceConfig {
  street?: Exclude<RoadSurface, 'dirt'>;
  square?: Exclude<RoadSurface, 'dirt'> | 'print';
  setts?: 'courses' | 'fan';
  kerbs?: boolean;
  gutterM?: number;
  townOnly?: boolean;
  patches?: number;
  cracks?: number;
  covers?: number;
  /** standing water in the gutters and wheel paths (0 dry, the default; times the splat's roadPuddles) */
  puddles?: number;
  /** the procedural surfaces' stone and binder tone (1 = a mid granite grey; Ironworks' sooty basalt 0.62) */
  tone?: number;
  /** a kerbed town's streets in their own class (a German old town's setts inside, asphalt on the roads past it) */
  townStreet?: Exclude<RoadSurface, 'dirt'>;
  /** the country roads' worn white centre line (a map from the 1950s on), 0..1 */
  markings?: number;
  /** a shelled city's asphalt: the ragged fills of shell holes, 0..1 */
  holeFills?: number;
  /** (the maps lane, 228) a square's setts' tone over the streets' (off any centreline: a civic square's lighter granite
   *  setts, world/civic); absent 1 */
  squareTone?: number;
  /** (228 r2) a square's joints sanded toward its stone's tone (0..1), and its own arcs (chord, radius, m); absent 0 */
  squareJoint?: number;
  squareArc?: readonly [number, number];
  /** (built-env-270) the Low tier paves the streets in their class (asphalt, setts, patched) instead of the R layer's print */
  low?: boolean;
  /** (built-env-270b) the Low tier paves the catalogue's paths in their class too (asphalt, setts, patched, concrete) */
  lowPaths?: boolean;
}

/**
 * The worked carriageway of an unpaved road — each a gain, 0 off. relief: the wheel ruts as grooves with lips, the crown
 * and camber; stones: strewn on the crown and the edges, swept out of the wheel paths; potholes: oval bowls, puddled on a
 * wet map; treads: the vehicles' prints in the ruts' floors; washboard: corrugations across an arid track; toneFloor: the
 * dry road's least luminance as a share of the field it crosses (0: the old law); laneTone: the share of the lanes' old
 * albedo darkening kept where the grooves' relief draws them; windrow: the grader's ridge of loose stone along the edge.
 */
export interface RoadSurfaceWork {
  relief: number; stones: number; potholes: number; treads: number;
  washboard: number; toneFloor: number; laneTone: number; windrow: number;
}
const ROAD_SURFACE_OFF: RoadSurfaceWork = Object.freeze({
  relief: 0, stones: 0, potholes: 0, treads: 0, washboard: 0, toneFloor: 0, laneTone: 1, windrow: 0,
});
/** Each climate's worked carriageway (groundRedux.ts climate). */
export const ROAD_SURFACE_BY_CLIMATE: Readonly<Record<'vegetated' | 'arid' | 'snow', RoadSurfaceWork>> = Object.freeze({
  vegetated: Object.freeze({ relief: 1, stones: 0.55, potholes: 0.8, treads: 1, washboard: 0, toneFloor: 0.92, laneTone: 0.55, windrow: 0.5 }),
  arid: Object.freeze({ relief: 1, stones: 0.9, potholes: 0.35, treads: 1, washboard: 0.8, toneFloor: 0.92, laneTone: 0.50, windrow: 1 }),
  snow: Object.freeze({ relief: 0.8, stones: 0, potholes: 0, treads: 1, washboard: 0, toneFloor: 0, laneTone: 0.7, windrow: 0 }),
});
/** The worked carriageway's two shader vectors for a map: its climate's row under its splat's own fields, under its
 * built-environment row's work ('off': the old road law, every gain 0; maps/builtEnvironmentTable.ts). */
export function roadSurfaceUniforms(work: 'climate' | 'off' | Partial<RoadSurfaceWork>, climate: 'vegetated' | 'arid' | 'snow',
  own: Partial<RoadSurfaceWork> | undefined): { a: [number, number, number, number]; b: [number, number, number, number] } {
  const w = { ...ROAD_SURFACE_BY_CLIMATE[climate], ...(own ?? {}), ...(work === 'off' ? ROAD_SURFACE_OFF : work === 'climate' ? {} : work) };
  return { a: [w.relief, w.stones, w.potholes, w.treads], b: [w.washboard, w.toneFloor, w.laneTone, w.windrow] };
}

/** The paved surfaces' shader vectors: (street, square, arcs, gutter), (patches, cracks, covers, puddles) and the kerbed town
 * rect (centre xz, half-size xz; z 0 without kerbs) and (tone, the kerbed town's street class, centre lines, shell-hole fills). */
export function pavedSurfaceUniforms(paved: PavedSurfaceConfig | undefined,
  town: { x0: number; x1: number; z0: number; z1: number }): { cls: [number, number, number, number];
  wear: [number, number, number, number]; town: [number, number, number, number]; extra: [number, number, number, number];
  square: [number, number, number, number] } {
  if (!paved) return { cls: [0, 0, 0, 0], wear: [1, 1, 1, 0], town: [0, 0, 0, 0], extra: [1, 0, 0, 0], square: [1, 0, 0, 0] };
  const street = paved.street ? ROAD_SURFACE_CODE[paved.street] : 0;
  const square = paved.square === 'print' ? 0 : paved.square ? ROAD_SURFACE_CODE[paved.square] : street;
  return {
    cls: [street, square, paved.setts === 'fan' ? 1 : 0, paved.kerbs ? Math.max(0, paved.gutterM ?? 0) : 0],
    wear: [paved.patches ?? 1, paved.cracks ?? 1, paved.covers ?? 1, paved.puddles ?? 0],
    town: paved.kerbs ? [(town.x0 + town.x1) / 2, (town.z0 + town.z1) / 2, (town.x1 - town.x0) / 2, (town.z1 - town.z0) / 2] : [0, 0, 0, 0],
    extra: [paved.tone ?? 1, paved.kerbs && paved.townStreet ? ROAD_SURFACE_CODE[paved.townStreet] : 0, paved.markings ?? 0, paved.holeFills ?? 0],
    square: [paved.squareTone ?? 1, paved.squareJoint ?? 0, paved.squareArc?.[0] ?? 0, paved.squareArc?.[1] ?? 0],
  };
}
