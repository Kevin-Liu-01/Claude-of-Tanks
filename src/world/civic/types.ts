// src/world/civic/types.ts — the civic-area and pathway kit's plan contract (the maps lane, 228; the owner, 2026-10-19:
// "expand its breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). A map
// adopts the kit through data only: a plan file under plans/ names its pathway classes, its civic areas and their
// furniture, and a regional style (styles.ts) gives the materials, the kerb profile, the monument, the trees and the
// vehicles' era. No kit file names a map; the plans name everything.
//
// Leaf module: no three.js, no DOM (the terrain's masks and the receipts read the plans in Node).

/** A point in the world plane (x, z), metres. */
export type CivicPoint = readonly [number, number];

/** An axis-aligned rectangle in the world plane. */
export interface CivicRect { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }

/** A street's class: a main street (raised kerbs and pavements down both sides inside the wall, where houses front it
 *  past it), a lane (a low kerb and a narrow pavement down both sides inside the wall), a footpath, or none (the kit lays
 *  nothing beside it). */
export type PathClass = 'main' | 'gasse' | 'footpath' | 'none';

/** A gate in a town wall a street passes: its passage centre, heading (the street's) and half its clear width. */
export interface PathwayGate { readonly x: number; readonly z: number; readonly halfWidth: number; readonly yawDeg: number }

/** A map's pathway architecture (pathwayKit.ts). */
export interface PathwayPlan {
  /** Each authored road's class by its index in terrain.roads.paths; absent paths are 'none'. */
  readonly classes: Readonly<Record<number, PathClass>>;
  /** The kerb face's distance from a main street's centreline (m). */
  readonly kerbM: number;
  /** A run stands only where a placed structure lies this far behind the kerb at the run's middle (m): [near, far]. */
  readonly frontage: readonly [number, number];
  /** The kerb return's radius at a junction where both corners are paved (m). */
  readonly returnR: number;
  /** The widest pavement (m, kerb back to its outer edge). */
  readonly maxWalkM: number;
  /** A main street's pavement where no house fronts it (m, kerb back to its outer edge: a garden wall, a verge). */
  readonly openWalkM: number;
  /** A lane's (gasse) kerb and pavement: the kerb's face over the setts, its widest pavement and its open one (m). */
  readonly lane: { readonly face: number; readonly maxWalkM: number; readonly openWalkM: number };
  /** Where no pavement runs: a civic room's frontage walks own its edge, an open square has none. */
  readonly exclude: readonly CivicRect[];
  /** The gates the main streets pass: their kerbs stop a metre short of the piers, the setts run through. */
  readonly gates: readonly PathwayGate[];
  /** The town's inside (one polygon a town; a map of two towns names two): past its line a main street keeps its
   *  pavement only where houses front it (a suburb outside a gate), and no kerb runs along the line itself. */
  readonly inside: ReadonlyArray<readonly CivicPoint[]>;
  /** Where a main street's pavement meets a square's flush walk: its kerb ramps down over 2 m to flush. */
  readonly mouths: readonly CivicPoint[];
}

/** A bed's opening in its edging: the side it is on, its centre along that side (world x for n/s, z for e/w), its
 *  clear width; `railing: false` leaves the side open beyond the gate (an Ehrenhof). */
export interface CivicMouth { readonly side: 'n' | 's' | 'e' | 'w'; readonly at: number; readonly width: number; readonly open?: number }

/** A path across a bed: its centreline, its width; the surface comes from the style. */
export interface CivicBedPath { readonly from: CivicPoint; readonly to: CivicPoint; readonly width: number }

/** A kerbed bed of lawn in a civic area (a green's quarter), with its edging, its mouths, its paths and its feature. */
export interface CivicBed {
  readonly id: string;
  readonly rect: CivicRect;
  readonly mouths: readonly CivicMouth[];
  readonly paths: readonly CivicBedPath[];
  /** a round flower bed with its gravel ring at the paths' crossing, or a memorial grove's forecourt and hedge */
  readonly feature: { readonly kind: 'flowerRondell'; readonly x: number; readonly z: number; readonly r: number; readonly ring: number }
    | { readonly kind: 'hedgeArc'; readonly x: number; readonly z: number; readonly r: number; readonly height: number; readonly fromDeg: number; readonly toDeg: number }
    /** (229) a parterre's fountain (an Andalusian glorieta): its stone basin `r` across its rim, its gravel ring to `ring` */
    | { readonly kind: 'fountain'; readonly x: number; readonly z: number; readonly r: number; readonly ring: number }
    | null;
}

/** A furniture piece of the area: one of the props' destructible kinds at a world seat, its front (local +z) toward
 *  `yawDeg` (0 = +z, 90 = +x). */
export interface CivicFurniture { readonly kind: string; readonly x: number; readonly z: number; readonly yawDeg: number; readonly scale?: number }

/** A tree station: its seat, and a cast-iron grate in a granite frame round its foot (a pit in the paving). */
export interface CivicTreeStation { readonly x: number; readonly z: number; readonly grate?: boolean;
  /** (229 b3 r1) its own scale (a twin's tree the same height as its pair); absent: drawn in the area's band */
  readonly scale?: number }

/** A strip of flush paving (a frontage walk, a granite band, a church's path): its rectangle and its course. */
export interface CivicPaving {
  readonly rect: CivicRect;
  readonly kind: 'flags' | 'granite' | 'basalt' | 'setts';
  /** a gutter (Rinne) of three sett rows along one long side */
  readonly gutter?: 'n' | 's' | 'e' | 'w';
}

/** (229 b3) A strip of flush paving along a centreline, `width` across: `brick` a herringbone of bricks at 45 degrees to the
 *  line inside a row of bricks on edge along each side (Bengal's HBB soling), `pavers` a herringbone square to it. */
export interface CivicStrip { readonly from: CivicPoint; readonly to: CivicPoint; readonly width: number; readonly kind: 'brick' | 'pavers' }

/** A town square's civic area (civicAreaKit.ts). */
export interface CivicAreaPlan {
  readonly id: string;
  /** The square's frontage-to-frontage room: the later scatter passes keep out of it, and the fill measures read it. */
  readonly room: CivicRect;
  /** (229 b3, the census's K6) the room turned about its centre to this heading (a char's haat on its diamond pad); absent 0.
   *  Only the room turns: the paved ground, the beds, the paving and the lawns stay world rectangles. */
  readonly roomYawDeg?: number;
  /** (229 b3) false: no frontage walks along the fronts round the room (a sand or beaten-earth square); absent true. */
  readonly frontage?: boolean;
  /** The ground the terrain paves for the square (the room and out to the set-back facades round it; under the houses it
   *  is never seen). */
  readonly paved: CivicRect;
  /** The square's gutters (Rinnen): three rows of setts along the carriageways' edges, segment by segment. */
  readonly rinnen: ReadonlyArray<{ readonly from: CivicPoint; readonly to: CivicPoint }>;
  /** The kinds the room's veto leaves alone (the street lamps keep their posts: the lamps snap off the facades instead). */
  readonly vetoExempt: readonly string[];
  /** Ground beside the room the battle scars, the rubble and the hedgehogs keep off (a corner lot's garden), after their
   *  draws; the destructibles there keep their seats. */
  readonly keepOuts: readonly CivicRect[];
  /** The pieces the plan clears from round its room (out of its period or its place), by kind in each rectangle: their
   *  passes keep their draws and the piece is left out (a light building's plot with it). */
  readonly clears: ReadonlyArray<{ readonly rect: CivicRect; readonly kinds: readonly string[] }>;
  /** The hardstand this area dresses (its airfield lip, gullies and patches dropped), by index in terrain.hardstands;
   *  -1 for a square laid on the town's own ground (no pad). */
  readonly pad: number;
  /** The carriageway arms that stay prop-free (the street lanes through the square). */
  readonly arms: readonly CivicRect[];
  /** The bots' measured traffic corridors across the area (routeheat): segments and their half widths, kept clear of
   *  every crushable (G2). */
  readonly corridors: ReadonlyArray<{ readonly from: CivicPoint; readonly to: CivicPoint; readonly half: number }>;
  /** The ring lanes round the green (C12: two hulls abreast): rectangles kept free of every piece and tree, a lamp or a
   *  bollard on a long edge's kerb line aside, `minWidth` m across at their narrowest. */
  readonly lanes: ReadonlyArray<{ readonly id: string; readonly rect: CivicRect; readonly minWidth: number }>;
  /** The objective seats the area keeps clear past its roundel (matchPlacement's: an extraction's convoy disc), each a
   *  disc no piece or trunk enters (C13). */
  readonly holds: ReadonlyArray<{ readonly id: string; readonly x: number; readonly z: number; readonly r: number }>;
  /** The roundel at the crossing: its ring band and its rose, flush; (229 b3) `inlay: false` lays none (a village place's
   *  crossing, a char's haat: the open disc is kept, nothing is set in its ground). */
  readonly centre: { readonly x: number; readonly z: number; readonly ringR: readonly [number, number]; readonly roseR: number; readonly rays: number;
    readonly inlay?: boolean };
  readonly beds: readonly CivicBed[];
  /** The flush granite bands between a bed's kerb and the arms. */
  readonly paving: readonly CivicPaving[];
  /** (229 b3) Flush strips laid along a centreline at any heading (a char's brick soling, the pavers before a fort). */
  readonly strips?: readonly CivicStrip[];
  /** (229 b3) Raised platforms round a tree's foot (a bot-tola), square, at their heading. */
  readonly platforms?: ReadonlyArray<{ readonly x: number; readonly z: number; readonly half: number; readonly height: number; readonly yawDeg: number }>;
  /** The monument: its kind (a props destructible), its seat and the point its front faces. */
  readonly monument: { readonly kind: string; readonly x: number; readonly z: number; readonly faceX: number; readonly faceZ: number } | null;
  /** The area's trees: the species, the scale band, the stations. */
  readonly trees: { readonly species: string; readonly scale: readonly [number, number]; readonly stations: readonly CivicTreeStation[] };
  readonly furniture: readonly CivicFurniture[];
  /** Parked vehicles (props destructible roles of the map's fleet) and the pale sett rows that mark their bays. */
  readonly parking: readonly CivicFurniture[];
  readonly bayMarks: ReadonlyArray<{ readonly x: number; readonly z: number; readonly yawDeg: number; readonly length: number }>;
  /** Street lamps the area adds (props 'lamp' destructibles, the map's own form). */
  readonly lamps: readonly CivicFurniture[];
  /** A fountain's paved ring: its centre, the granite band's radius and the gutter ring. */
  readonly fountainRing: { readonly x: number; readonly z: number; readonly r: number } | null;
  /** Landing steps before a church door: centre, width, heading (their front), the step count and rise. */
  readonly steps: ReadonlyArray<{ readonly x: number; readonly z: number; readonly width: number; readonly yawDeg: number; readonly count: number; readonly rise: number }>;
  /** The beds' and lots' ground the terrain paints lawn, not paving (the terrain's mask reads these). */
  readonly lawns: readonly CivicRect[];
  /** (229) the area's own fill and dressing targets the receipt holds it to (each square its size and place: Steinburg's
   *  green asks 900 m² of lawn, a Sarajevo plaza less): records and trunks in the room, benches, lawn (m²), lamps within
   *  45 m of the centre, the open share's ceiling and the largest free disc's (m) */
  readonly targets: { readonly records: number; readonly benches: number; readonly lawnM2: number; readonly lampsAround: number;
    readonly openShare: number; readonly largestDisc: number };
}

/** A map's civic plan: its pathway architecture and its civic areas. */
export interface CivicPlan {
  readonly mapId: string;
  /** The regional style row (styles.ts) by its key: the map's props.architecture. */
  readonly style: string;
  readonly pathways: PathwayPlan | null;
  readonly areas: readonly CivicAreaPlan[];
  /** The props settings the plan sets over the map's own (the overlay): no map config is edited. */
  readonly overlay: {
    readonly plazaNest?: false;
    readonly hedgehogsAtApproaches?: boolean;
    /** The monument the square takes instead of the map's walked one (placeCentralMonument keeps its draws). */
    readonly monumentKind?: string;
    /** The lamp form the map's posts take (streetKit.ts LAMP_FORMS key). */
    readonly lampForm?: string;
  };
}
