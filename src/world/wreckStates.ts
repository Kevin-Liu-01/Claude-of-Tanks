// src/world/wreckStates.ts — how a battlefield hulk died and what has happened to it since (wrecks-270, 2026-11-05; the
// owner: "add a lot more tank wreckages and varieties").
//
// Every hulk the props build places is a fleet donor in one of these states. The bake (wrecks.ts poseWreckState) poses
// the donor's own hierarchy — the factory's settled wreck, then the state's moves: parts taken off, the turret set
// down, the whole hull pitched, rolled or sunk — before it collects the geometry and the collision solids, so the drawn
// hulk and its records always agree. The placement (props.ts) draws a state from the ones its site shows, and never
// seats two hulks of one bake (one donor in one state) within a view of each other.
//
// Real references, one a state:
//   - burnt_out: a T-72 burnt out on a road in Ukraine, 2022, turret on its ring, the paint gone to rust and soot;
//   - turret_blown_off: the ammunition cook-off (the "jack-in-the-box" T-72s and T-80s, Ukraine 2022; Iraqi T-72s, 1991),
//     the turret thrown beside the hull and the ring open;
//   - track_thrown: a track shot off or slipped, the run lying out behind the sprocket, the hull on its bare wheels;
//   - nose_down: a hull driven or blown into a ditch or crater, its nose in the earth (Golan Heights, 1973);
//   - half_buried: a hulk the drifting sand, the snow or the mud took over years (Kuwait's and Sinai's desert hulks);
//   - stripped: a hulk salvaged where it stood — tracks, wheels and fittings taken, the hull down on its belly (the
//     Afghan and Eritrean tank graveyards);
//   - overturned: rolled off an embankment or flipped by a mine, lying on its side (Iraq, 2003; Chechnya, 1995);
//   - scrap_cut: cut up for scrap where it lay, the turret lifted off and set down, the gun cut away (Ethiopia, Angola).
//
// This table is data: no three, no DOM, Node-runnable; the maps' wreck casts (maps/wreckCasts.ts) name these ids.

export const WRECK_STATES = Object.freeze([
  'burnt_out', 'turret_blown_off', 'track_thrown', 'nose_down', 'half_buried', 'stripped', 'overturned', 'scrap_cut',
] as const);
export type WreckState = typeof WRECK_STATES[number];

/** Where a hulk stands: a road's verge, a field's edge under its tree line or hedge, a trench line, a town's square. */
export const WRECK_SITES = Object.freeze(['roadside', 'field_edge', 'trench_line', 'town_square'] as const);
export type WreckSite = typeof WRECK_SITES[number];

/** What a hulk's state reads as from across a field (the repeat critic, 11-06: a burnt-out, a track-thrown and a
 *  nose-down hulk at 40-100 m, the map's paint shared, read as one hulk twice): turret on and hull up; turret gone;
 *  sunk to the deck; down on its belly with the running gear gone; on its side. */
export type WreckLook = 'upright' | 'turretless' | 'sunk' | 'bare' | 'tipped';
/** What the fire, or its absence, left of a hulk's paint (the repeat critics, 11-06: two hulks of different models and
 *  states in one rust read as one hulk twice): soot over everything, decades of oxide, or the camouflage a crew bailed
 *  out of. */
export type WreckFinish = 'charred' | 'rusted' | 'abandoned';

export interface WreckStateRow {
  /** The factory's settled wreck under the state: the ammo-rack pop (turret thrown, ring open) or the unseated turret. */
  readonly pop: boolean;
  /** Parts taken off before the bake: the tracks (one side or both), the road wheels, the fittings (roof guns, lights,
   *  stowage, glass, canvas), the gun from its mantlet. */
  readonly removes: { readonly track: 'none' | 'one' | 'both'; readonly wheels: boolean; readonly fittings: boolean; readonly gun: boolean };
  /** The whole hulk turned: pitch (nose down, radians) and roll (about its long axis), each a [min, max] the seed picks
   *  in; and how deep it sinks, as a share of its height. */
  readonly pitch: readonly [number, number];
  readonly roll: readonly [number, number];
  readonly sink: readonly [number, number];
  /** The turret lifted off and set down upright beside the hull (scrap_cut). */
  readonly turretSetDown: boolean;
  /** The years it has stood: 0 a fresh burn (soot over the paint; the bake's char exactly as before the states), 1
   *  decades of rust. */
  readonly age: number;
  /** Where it reads true. */
  readonly sites: readonly WreckSite[];
  /** What it reads as from across a field; the placement shows a new look in a view before a new state. */
  readonly look: WreckLook;
  /** Its paint (wrecks.ts wreckVertexColor). */
  readonly finish: WreckFinish;
}

const NONE = Object.freeze({ track: 'none', wheels: false, fittings: false, gun: false } as const);
const LEVEL: readonly [number, number] = Object.freeze([0, 0]);

/** The damage-state table: every state's pose, its removals, its age and its sites. */
export const WRECK_STATE_TABLE: Readonly<Record<WreckState, WreckStateRow>> = Object.freeze({
  burnt_out: Object.freeze({
    pop: false, removes: NONE, pitch: LEVEL, roll: LEVEL, sink: LEVEL, turretSetDown: false, age: 0,
    sites: Object.freeze(['roadside', 'field_edge', 'town_square'] as const), look: 'upright', finish: 'charred',
  }),
  turret_blown_off: Object.freeze({
    pop: true, removes: NONE, pitch: LEVEL, roll: LEVEL, sink: LEVEL, turretSetDown: false, age: 0,
    sites: Object.freeze(['roadside', 'town_square', 'trench_line'] as const), look: 'turretless', finish: 'charred',
  }),
  track_thrown: Object.freeze({
    pop: false, removes: Object.freeze({ track: 'one', wheels: false, fittings: false, gun: false } as const),
    pitch: LEVEL, roll: Object.freeze([0.02, 0.05] as const), sink: LEVEL, turretSetDown: false, age: 0.25,
    sites: Object.freeze(['roadside', 'trench_line', 'field_edge'] as const), look: 'upright', finish: 'abandoned',
  }),
  nose_down: Object.freeze({
    pop: false, removes: NONE, pitch: Object.freeze([0.16, 0.26] as const), roll: Object.freeze([-0.06, 0.06] as const),
    sink: LEVEL, turretSetDown: false, age: 0.3,
    sites: Object.freeze(['roadside', 'trench_line'] as const), look: 'upright', finish: 'abandoned',
  }),
  half_buried: Object.freeze({
    pop: false, removes: NONE, pitch: Object.freeze([-0.05, 0.07] as const), roll: Object.freeze([-0.07, 0.07] as const),
    sink: Object.freeze([0.45, 0.58] as const), turretSetDown: false, age: 0.9,
    sites: Object.freeze(['field_edge', 'trench_line'] as const), look: 'sunk', finish: 'rusted',
  }),
  stripped: Object.freeze({
    pop: false, removes: Object.freeze({ track: 'both', wheels: true, fittings: true, gun: false } as const),
    pitch: LEVEL, roll: LEVEL, sink: LEVEL, turretSetDown: false, age: 0.75,
    // (11-06) and the road verge: a roadside line then has four looks, not three
    sites: Object.freeze(['roadside', 'field_edge', 'town_square'] as const), look: 'bare', finish: 'rusted',
  }),
  overturned: Object.freeze({
    pop: false, removes: NONE, pitch: Object.freeze([-0.06, 0.06] as const), roll: Object.freeze([1.5, 1.72] as const),
    sink: LEVEL, turretSetDown: false, age: 0.4,
    sites: Object.freeze(['field_edge', 'roadside'] as const), look: 'tipped', finish: 'charred',
  }),
  scrap_cut: Object.freeze({
    pop: true, removes: Object.freeze({ track: 'both', wheels: false, fittings: true, gun: true } as const),
    pitch: LEVEL, roll: LEVEL, sink: LEVEL, turretSetDown: true, age: 0.85,
    sites: Object.freeze(['town_square', 'field_edge'] as const), look: 'turretless', finish: 'rusted',
  }),
});

/** Two hulks a player sees in one view: within this many metres of each other (the battle camera's working range). No
 *  two hulks of one bake stand closer (props.ts chooseWreckBake). */
export const WRECK_VIEW_M = 250;
/** No hulk's centre nearer a spawn than this (the nearest before wrecks-270 stood 36 m off; Main's ruling 2026-11-05). */
export const WRECK_SPAWN_CLEAR_M = 35;
/** A hulk this close to a trench line's centre stands on the trench line. */
export const WRECK_TRENCH_REACH_M = 18;

export function isWreckState(value: unknown): value is WreckState {
  return typeof value === 'string' && (WRECK_STATES as readonly string[]).includes(value);
}

/** What a state reads as from across a field. */
export function wreckLook(state: WreckState): WreckLook {
  return WRECK_STATE_TABLE[state].look;
}

/** The states a site shows, of those a cast allows, in the table's order. */
export function statesForSite(site: WreckSite, allowed: readonly WreckState[] = WRECK_STATES): WreckState[] {
  return allowed.filter((state) => WRECK_STATE_TABLE[state].sites.includes(site));
}
