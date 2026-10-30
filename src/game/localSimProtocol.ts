/**
 * The local Worker driver's channel (docs/ARCHITECTURE.md "One core, two drivers"): the page and the Worker that steps a
 * local battle's core. Nothing here is the online driver's: no wire, no seats, no snapshots, no prediction. The page posts
 * the player's input the moment it samples it; the Worker steps at 60 Hz and posts every tick's whole state in a
 * transferable buffer the page hands back once drawn (state block layout below; localSimMirror.ts for a hull's leaves).
 */
import type { MirrorSchema } from './localSimMirror.ts';

/** The player's controls as one Float64Array (the page reuses one; LOCAL_INPUT indexes it). */
export const LOCAL_INPUT = Object.freeze({
  throttle: 0, steer: 1, brake: 2, fire: 3, shellSlot: 4, aimX: 5, aimY: 6, aimZ: 7, aimLocked: 8, actionBits: 9, length: 10,
});

/** A player action the page's battle actions route to the Worker (playerBattleActions' network port). */
export type LocalSimAction = 'reloadMagazine' | 'specialAction' | 'selfRight' | 'smoke' | 'lights' | 'roofGun' | 'lightsOff'
  | 'drone' | 'supplyAmmo' | 'supplyHeal';

/** What the Worker needs to seat the page's battle: the setup's own inputs, so its setupBattle seats the same one. */
export interface LocalSimBoot {
  mapId: string;
  gameMode: string;
  specId: string;
  random: boolean;
  /** The collision manifests' base (world/collisionWorldLoad.ts) and the battlefield variant (Frontline's trenches). */
  manifestBase: string;
  variant: string | null;
  /** The world kernels (?simKernels=ts runs the TypeScript, as the page would). */
  kernels: boolean;
  /** The page world's spawn points (setupBattle seats from them). */
  spawnPoints: unknown;
  /** The game's fields setupBattle reads, as they stood before the page's setup. */
  seed: { rosterSeed: number; battleCount: number; recentBotSpecIds: unknown; previousBotSpecIds: unknown };
  /** The page's stored settings the setup reads (loadout, opponent brain, arrangement): key, value. */
  storage: [string, string][];
  /** The page's battle after its setup: who is in it, in order (the Worker's must match). */
  roster: { id: string; specId: string; team: string }[];
}

/** Per roster hull: what its drawn model measured that the step reads (contact geometry, track width); sent once the
 * page's warm has built the models, before the battle first runs. */
export type LocalSimBodies = ({ contactGeom: unknown; trackWidthM: number | null } | null)[];

export type PageToLocalSim =
  | { type: 'boot'; boot: LocalSimBoot }
  | { type: 'bodies'; bodies: LocalSimBodies }
  | { type: 'input'; v: Float64Array }
  | { type: 'consumable'; slot: number }
  | { type: 'action'; action: LocalSimAction }
  /** The battle runs (the count is over, nothing covers it) or holds (paused, a killcam, the count). */
  | { type: 'run'; running: boolean }
  /** A drawn state's buffer, back to the Worker's pool. */
  | { type: 'return'; buffer: ArrayBuffer }
  | { type: 'stop' };

export interface LocalSimReady {
  type: 'ready';
  ms: { world: number; fleet: number; setup: number; total: number };
  kernels: 'wasm' | 'ts';
  /** Why the Worker's battle is not the page's (the page keeps its own step), else null. */
  mismatch: string | null;
}

/**
 * One tick. `buffer` holds the state block; the rest travel only when they have something: new interned strings, the
 * hulls whose shape changed (their schema), Sets whose members moved, shell specs first seen, the tick's events and
 * calls in the order the step made them, and JSON of the result and the mode's state when they changed.
 */
export interface LocalSimTick {
  type: 'tick';
  tick: number;
  buffer: ArrayBuffer;
  strings: string[] | null;
  schemas: (number | MirrorSchema)[] | null;
  sets: (number | (number | unknown[])[])[] | null;
  specs: (number | unknown)[] | null;
  /** ['e', event, payload] | ['v', hull, method, args] | ['r', method, args] | ['c', obstacle, dx, dz, speedMps, cause, x, z] */
  log: unknown[] | null;
  result: string | null;
  mode: string | null;
}

export type LocalSimToPage = LocalSimReady | LocalSimTick | { type: 'failed'; error: string };

/** The state block's header (Float64 slots). */
export const BLOCK = Object.freeze({
  tick: 0, timeS: 1, resultTimeS: 2, entities: 3, shells: 4,
  /** The player's reload progress this tick (the page's player:reload): present, then its fields. */
  reload: 5, reloadT: 6, reloadTotal: 7, reloadProgress: 8, reloadKind: 9, reloadCaliber: 10, reloadRounds: 11,
  reloadCapacity: 12, reloadDone: 13,
  /** The player's concealment (spotting getConcealment), its ten fields. */
  concealment: 14,
  header: 24,
});

/** Per hull, before its leaves: spotted by each side, its wreck turret's pose, its leaf count. */
export const HULL = Object.freeze({ spottedPlayer: 0, spottedEnemy: 1, wreck: 2, pose: 3, settled: 10, leaves: 11, extras: 12 });

/** Per shell (fixed fields). */
export const SHELL = Object.freeze({
  id: 0, shooter: 1, spec: 2, isPlayer: 3, pos: 4, prevPos: 7, vel: 10, ageS: 13, distM: 14, dead: 15, rocket: 16,
  bounces: 17, remainingPenMm: 18, gravity: 19, penRollDone: 20, carriedThrough: 21, dmgRoll: 22, stride: 24,
});

/** The concealment fields in order. */
export const CONCEALMENT_FIELDS = Object.freeze(['camo', 'base', 'paint', 'equip', 'bush', 'bloom', 'moving', 'fired', 'inBush',
  'spotted'] as const);

/** A tick rate's step and how far the Worker lets its debt run before it lets game time slow instead. */
export const LOCAL_SIM_TICK_MS = 1000 / 60;
export const LOCAL_SIM_MAX_STEPS_PER_WAKE = 2;
