// src/world/maps/builtEnvironmentTable.ts — the built-environment table (item built-env-270, the owner 2026-11-05: "update
// roads, beach areas annd areas around water, paths, sidewalks, alleys, courtyards, plazas, squares, alleys, anyu built
// enviornmennt have to be fully updated"; DECISIONS 2026-11-05 "Built environment per map").
//
// One row per battlefield, typed over MapId, so a battlefield without a row fails typecheck. A row says what the place's
// built ground is made of and how its edges and shores are dressed, by its real place and year:
//   - `roads`: the carriageways — the paved streets and squares (the terrain's paving uniforms), each path's own surface
//     where it differs from the map's (the road layer), and the worked unpaved carriageway's gains over its climate's;
//   - `civic`: the regional style of the kerbs, pavements, gutters, squares' bands and greens' edging (civic/styles.ts),
//     which the map's civic plan (civic/plans) lays, or null where the map lays none;
//   - `shore`: the craft and works at its waterside — the boats, the jetties, the reeds, the driftwood and the ford posts.
// The textures under all of these are the ground-surface table's (groundSurfaces.ts, ground-269); this table only says
// which surface goes where and how the edges are built. What the place's photographs show, and the photographs, are in
// builtEnvironmentRecords.ts (only the receipts and the tools load it).
//
// Presentation only: no row reaches the height field, the ground type, the collision or the sim.
// THREE-free (the terrain's layout and the receipts read it in Node).
import type { MapId } from './mapIds.ts';
import type { PavedSurfaceConfig, RoadSurface, RoadSurfaceWork } from '../roadSurfaces.ts';
import type { CivicStyleId } from '../civic/styles.ts';
import type { BoatType } from './boatHulls.ts';
import type { JettyForm } from './jettyKit.ts';
import type { ReedForm } from './reedBeds.ts';
import type { DriftCoast, FordStyle } from './waterside.ts';

export interface BuiltEnvironmentRow {
  readonly roads: {
    /** the paved streets' and squares' surfaces, or null where the map's own splat draws its roads */
    readonly paved: PavedSurfaceConfig | null;
    /** each path's surface by its index where it differs from the map's (a map's own pathStyles win), or null */
    readonly paths: readonly (RoadSurface | null)[] | null;
    /** the worked unpaved carriageway: 'climate' its climate's gains, 'off' the old road law, or the climate's under these */
    readonly work: 'climate' | 'off' | Partial<RoadSurfaceWork>;
  };
  readonly civic: CivicStyleId | null;
  /** the waterside's craft and works: the boats (boatHulls.ts), the jetties (jettyKit.ts), the reeds (reedBeds.ts), the
   *  driftwood and the ford posts (waterside.ts) */
  readonly shore: {
    readonly boats: BoatType;
    readonly jetty: JettyForm;
    readonly reeds: ReedForm;
    readonly drift: DriftCoast;
    readonly ford: FordStyle;
    /** the bank's facing from the waterline up `widthM` metres on a map whose water is open (splat.seaLake), in its own
     *  colour (`hex`, sRGB) over its layer's grain, `strength` its share (absent 1), `stoneM` its stones' size (shingle,
     *  pitching); null keeps the old apron (the worn ground's layer) */
    readonly bank: BankFacing | null;
  };
}

/** A bank's facing: sand (the worn ground's layer), shingle (rounded stones), rock (the rock layer), pitched (dressed
 *  stone in courses along the waterline: an embankment, a dyke's revetment), mud, or turf (the meadow to the water). */
export type BankKind = 'sand' | 'shingle' | 'rock' | 'pitched' | 'mud' | 'turf';
export interface BankFacing {
  readonly kind: BankKind;
  readonly widthM: number;
  readonly hex: number;
  readonly strength?: number;
  readonly stoneM?: number;
}
/** The material's codes (terrain.ts uBank.x; 0 the old apron). */
export const BANK_KIND_CODE: Readonly<Record<BankKind, number>> = Object.freeze({
  sand: 1, shingle: 2, rock: 3, pitched: 4, mud: 5, turf: 6,
});

/** The waterside of a coast or river with no craft of its own named: the Breton canot's (the kits' old default). */
const EUROPEAN_SHORE = Object.freeze({ boats: 'canot', jetty: 'estacade', reeds: 'phragmites', drift: 'breton', ford: 'gauge', bank: null } as const);

/** The European waterside with its bank's facing. */
const banked = (bank: BankFacing): BuiltEnvironmentRow['shore'] => Object.freeze({ ...EUROPEAN_SHORE, bank: Object.freeze(bank) });

const row = (roads: BuiltEnvironmentRow['roads'], civic: CivicStyleId | null, shore: BuiltEnvironmentRow['shore'] = EUROPEAN_SHORE):
  BuiltEnvironmentRow => Object.freeze({ roads: Object.freeze(roads), civic, shore: Object.freeze(shore) });
const UNPAVED = Object.freeze({ paved: null, paths: null, work: 'climate' } as const);
const PROTECTED = Object.freeze({ paved: null, paths: null, work: 'off' } as const);

export const BUILT_ENVIRONMENT = Object.freeze({
  // Prokhorovka, 1943: the kolkhoz's dirt roads (the owner's light-touch rule: the old road law)
  verdant: row(PROTECTED, null),
  // Dahar, southern Tunisia, 1985: sand tracks between the ksour
  desert: row(PROTECTED, null),
  // the Podhale, January 1945: slush tracks
  winter: row(PROTECTED, null),
  // Steinburg (Franconia), 1984: the town's streets an old asphalt patched over its trenches, sett gutters at the kerbs; the
  // old town's streets in setts, the roads past it a patched asphalt with its worn centre line; the market square in setts
  // laid in arcs (R2, the first frames: the old town's smooth asphalt lost to main's sett print)
  urban: row({
    paved: { street: 'patched', townStreet: 'cobble', square: 'cobble', setts: 'fan', kerbs: true, gutterM: 0.36,
      patches: 1, cracks: 1, covers: 1, puddles: 0.6, markings: 1, tone: 0.92,
      // (the maps lane, 228; the owner: the square "a huge EMPTY grey asphalt expanse") the Friedensplatz's setts the pale
      // grey granite of a Franconian square, not the streets' dark stone
      squareTone: 1.4,
      // (228 r2, the blind critics: the square's fan "a stamped, moire-like repeat at eye level", its joints a black grid)
      squareJoint: 0.55, squareArc: [3.6, 2.4] },
    paths: null, work: 'climate',
  }, 'franconian'),
  // the Léon, north Brittany, today (built-env-270, the photos: the lanes a dark bitumen chip-seal, no centre line, the
  // departmental roads with their white lines; the bourg's streets the same, granite kerbs only at the church)
  coastal: row({ paved: { street: 'asphalt', patches: 0.5, cracks: 0.5, covers: 0.3, puddles: 0.3, tone: 0.78 }, paths: null, work: 'off' }, null),
  // Lorraine (the Moselle), 1944 (built-env-270, the photos: the departmental roads a tarred macadam over limestone,
  // mud-plastered by the autumn's traffic and potholed; the farm tracks limestone gravel; the Moselle's banks low grey-brown
  // silt with reeds and willows)
  autumn: row({ paved: { tone: 0.82, patches: 1.2, cracks: 1, covers: 0, puddles: 0.8 }, paths: ['asphalt', 'asphalt', null, null, null], work: 'climate' },
    'lorrain', banked({ kind: 'mud', widthM: 4, hex: 0x6e624f })),
  // the Virgin Lands, 1958
  steppe: row(UNPAVED, null),
  // the Ruhr, 1962
  railyard: row(PROTECTED, null),
  // the Fulda Gap, 1984 (built-env-270, the photos: the Kreisstraßen and the village's through road a patched dark asphalt
  // with white edge lines, the farm roads (Wirtschaftswege) concrete slabs; the ponds' edges mud under rushes)
  frontier: row({ paved: { tone: 0.82, patches: 0.8, cracks: 0.6, covers: 0.4, markings: 1 }, paths: ['patched', 'patched', 'concrete', 'concrete', null, null], work: 'off' },
    null, banked({ kind: 'mud', widthM: 2.5, hex: 0x5e5444 })),
  // Bjerkvik on the Herjangsfjord, May 1940 (built-env-270, the photos: the gravel roads stay; the shore shingle and cobbles
  // of grey granite and gneiss between smooth slabs, no sand beach)
  fjord: row(PROTECTED, null, { boats: 'faering', jetty: 'brygge', reeds: 'phragmites', drift: 'nordland', ford: 'gauge',
    bank: { kind: 'shingle', widthM: 7, hex: 0x8a8680, stoneM: 0.16 } }),
  // the Jamuna's chars, 2010: the village roads brick soling (the embankment roads past the villages stay earth)
  // (built-env-270, the photos: the chars' banks pale grey silt and sand, not the fields' dark soil)
  delta: row({ paved: null, paths: ['brick', 'brick', null, null, 'brick'], work: 'climate' }, 'bengal',
    { boats: 'nouka', jetty: 'stilts', reeds: 'kash', drift: 'breton', ford: 'bamboo', bank: { kind: 'sand', widthM: 9, hex: 0xb8b0a0 } }),
  // Wadi Rum, 2008
  badlands: row(UNPAVED, 'wadirum'),
  // Kohima, 1944: the metalled Dimapur–Imphal road (path 1, south to north over the ridge), a dark tar macadam with few
  // cracks and no covers (R2, the first frames: a pale modern grey band); the jeep tracks earth
  // (built-env-270, the photos: the nullah a boulder-strewn bed of grey stones and coarse gravel)
  monsoon: row({ paved: { tone: 0.70, patches: 0.6, cracks: 0.3, covers: 0 }, paths: [null, 'asphalt', null, null, null], work: 'climate' }, null,
    banked({ kind: 'shingle', widthM: 5, hex: 0x807a70, stoneM: 0.22 })),
  // the Col du Mont-Cenis, April 1945
  alpine: row(UNPAVED, null, { boats: 'lakeboat', jetty: 'stage', reeds: 'phragmites', drift: 'breton', ford: 'gauge', bank: null }),
  // the Aso caldera, 2015 (built-env-270, the photos: the prefectural and municipal roads a smooth dark asphalt with white
  // edge and centre lines, the farm roads (nōdō) concrete)
  caldera: row({ paved: { tone: 0.80, patches: 0.3, cracks: 0.3, covers: 0.5, markings: 1 }, paths: ['asphalt', 'asphalt', 'asphalt', 'concrete', 'concrete'], work: 'climate' }, null),
  // Völklingen, 1945: the works town's streets in setts, the roads beyond it cinder and earth, the sooty basalt's 0.62
  // (ground lane, 2026-10-15: the setts read with darker grit joints, wider, held further out)
  foundry: row({ paved: { street: 'cobble', square: 'cobble', townOnly: true, tone: 0.62 }, paths: null, work: 'climate' }, null),
  // Sarajevo, 1992–96: the shelled city's asphalt, patched and cracked; its styled paths keep their own classes (R2: the
  // squares in setts — the patched asphalt squares read as empty car parks; the round fills ragged and fewer)
  ruinspires: row({
    paved: { street: 'patched', square: 'cobble', kerbs: true, gutterM: 0.24, patches: 1.3, cracks: 1.3, covers: 1,
      puddles: 0.15, markings: 1, holeFills: 1 },
    paths: null, work: 'climate',
  }, 'sarajevo'),
  // Suzhou Creek, 1937 (map revival's ruling: the International Settlement's main streets tar macadam, Zhabei's side
  // streets and lanes granite setts): tar macadam streets, the squares in setts, path 3 (the Zhabei road north of the
  // creek) setts (R2: no tram line — distance-field rails bent round every junction)
  // (built-env-270, the photos: the creek between granite-block embankment walls, darkened at the waterline)
  blackglass: row({
    paved: { street: 'asphalt', square: 'cobble', kerbs: true, gutterM: 0.24, patches: 0.6, cracks: 0.8, covers: 0.6, puddles: 0.5, tone: 0.85 },
    paths: [null, null, null, 'cobble', null, null], work: 'climate',
  }, 'shanghai', banked({ kind: 'pitched', widthM: 4, hex: 0x8c877d, stoneM: 0.55 })),
  // Monument Valley, 1965
  titan_gorge: row(UNPAVED, null),
  // Page and the Glen Canyon Dam, 1965 (built-env-270, the photos: the Bureau town's streets and US 89 a fresh dark asphalt
  // with white lines under red dust; the filling lake meets bare Navajo sandstone, no bathtub ring yet)
  skybridge: row({ paved: { street: 'asphalt', patches: 0.2, cracks: 0.3, covers: 0.4, markings: 1, tone: 0.86 }, paths: null, work: 'climate' }, null,
    banked({ kind: 'rock', widthM: 6, hex: 0xc98a5e })),
  // the Scheldt polders, 1944: the dyke roads in clinker (the mill lane, the west and east dyke roads, the causeway and the
  // north dyke road); the farm lanes earth
  // (built-env-270, the photos: the dykes faced with basalt blocks under their grass slopes)
  polders: row({ paved: null, paths: ['clinker', 'clinker', 'clinker', 'clinker', 'clinker'], work: 'climate' }, 'polder',
    banked({ kind: 'pitched', widthM: 3.5, hex: 0x3d3d3c, stoneM: 0.4 })),
  // Queenstown, Tasmania, 1976
  copper_mesa: row(UNPAVED, null),
  // Hostomel, 2022: its airfield slabs are the hardstands' own
  airfield: row(UNPAVED, null),
  // Siwa, 2010 (built-env-270, the photos: the main road a thin grey asphalt drifted over with sand; the lake's margins
  // salt-crusted mud plates, white where the salt is thick)
  oasis: row({ paved: { tone: 0.95, patches: 0.6, cracks: 0.8, covers: 0 }, paths: ['asphalt', null, null, null, null], work: 'climate' }, null,
    banked({ kind: 'sand', widthM: 8, hex: 0xe2d9c8 })),
  // DYE-M at Cape Dyer, 1985 (its frozen lakes' craft the Alpine lake's, should one ever be launched)
  whiteout: row(UNPAVED, null, { boats: 'lakeboat', jetty: 'stage', reeds: 'frost', drift: 'nordland', ford: 'gauge', bank: null }),
  // the Chouf, 1982
  orchard: row(UNPAVED, null),
  // the Louisiana Maneuvers, 1941
  longleaf: row(UNPAVED, null),
  // Cà Mau, 2012
  // (built-env-270, the photos: the levee lanes concrete, 2-3 m; the creeks' banks grey tidal mud)
  mangrove: row({ paved: { tone: 0.95, patches: 0.6, cracks: 0.8, covers: 0 }, paths: ['concrete', 'concrete', 'concrete', 'concrete', 'concrete'], work: 'climate' }, null,
    { boats: 'xuong', jetty: 'stilts', reeds: 'nipa', drift: 'breton', ford: 'gauge', bank: { kind: 'mud', widthM: 6, hex: 0x6a6252 } }),
  // the Dalmatian bay, 1992
  // (built-env-270, the photos: the coast road and the village streets a patched asphalt; the beach pale limestone shingle
  // and pebbles, not sand)
  saltwind: row({ paved: { tone: 0.92, patches: 1, cracks: 0.8, covers: 0.3, markings: 0.6 }, paths: ['patched', 'patched', 'patched', null, null, null], work: 'off' },
    null, { boats: 'gajeta', jetty: 'riva', reeds: 'phragmites', drift: 'breton', ford: 'gauge', bank: { kind: 'shingle', widthM: 14, hex: 0xd2cdc3, stoneM: 0.07 } }),
  // the Rur dams, 1944–45 (built-env-270, the photos: the lakes drawn down that winter, a wide bare band of grey-brown slate
  // and greywacke scree and silt below the dark root line)
  reservoir: row(PROTECTED, null, banked({ kind: 'shingle', widthM: 8, hex: 0x7d776c, stoneM: 0.09 })),
  // Olympus Basin, the future: no potholes in its regolith
  mars: row({ paved: null, paths: null, work: { potholes: 0 } }, null),
  // Taurus–Littrow, 1972: the regolith has no potholes or washboard
  moon: row({ paved: null, paths: null, work: { potholes: 0, washboard: 0 } }, null),
  // Ronda, 1972: the old towns' streets and squares in setts
  cliffbridge: row({ paved: { street: 'cobble', square: 'cobble', townOnly: true, tone: 1.1 }, paths: null, work: 'climate' }, 'andalusian'),
} satisfies Record<MapId, BuiltEnvironmentRow>);

/** A map's waterside (an id that is not a battlefield: the European default). */
export function watersideFor(mapId: string | null | undefined): BuiltEnvironmentRow['shore'] {
  return builtEnvironmentFor(mapId)?.shore ?? EUROPEAN_SHORE;
}

/** A map's row, or null for an id that is not a battlefield (a studio or a probe scene). */
export function builtEnvironmentFor(mapId: string | null | undefined): BuiltEnvironmentRow | null {
  return mapId && Object.prototype.hasOwnProperty.call(BUILT_ENVIRONMENT, mapId) ? BUILT_ENVIRONMENT[mapId as MapId] : null;
}
