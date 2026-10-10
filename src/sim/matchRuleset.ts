// Match rulesets (owner 2026-09-14 evening: "make the mechanics actually apply and change what the
// player has available, or change physics or gravity or more"). A ruleset is the complete, pure
// description of how one game mode bends the simulation: gravity, speed, hit points, damage,
// reload, the ammunition and equipment a crew may carry, consumables, respawns, the clock and the
// solo roster split. It is derived deterministically from the mode (and a campaign operation's
// difficulty), so the browser sim, the network authority and the receipts all compute the same
// rules without a wire change. Everything that reads a rule reads it from here — the mode
// controller, setupBattle, movement (gravity, speed), ballistics (shell gravity), damage (hit
// points lost), ammunition and equipment at spawn, and the play-menu rule cards.
import type { GameModeId } from './matchModes.ts';
import { shell } from './shellSpec.ts';
import type { DestructionRules } from './destructionEvents.ts';

/** Mode weapons are fictional gameplay loadouts; they never mutate the fleet catalog. */
export const GUN_GAME_WEAPONS = Object.freeze([
  shell('30 mm Autocannon', 'AP', 30, 210, 165, 120, 1150, { reloadS: .18 }),
  shell('105 mm Cannon', 'APFSDS', 105, 570, 520, 440, 1450, { reloadS: 3.5 }),
  shell('120 mm Cannon', 'APFSDS', 120, 800, 750, 650, 1700, { reloadS: 4 }),
  shell('152 mm Howitzer', 'HE', 152, 100, 100, 1250, 650, { reloadS: 5 }),
  shell('Guided Missile', 'HEAT', 152, 1100, 1100, 1000, 350, { guided: true, reloadS: 5 }),
]);
export const AERIAL_RULES = Object.freeze({
  drone: Object.freeze({ launchS: 2.4, responseHz: 4.5, spotRangeM: 350, speedMps: 42, turnRadS: 2.8, climbMps: 20, batteryS: 40, cooldownS: 25, rangeM: 850, launchHeightM: 12 }),
  gunship: Object.freeze({ altitudeM: 240, radiusM: 90, orbitRadS: .09 }),
});
export const GUNSHIP_WEAPONS = Object.freeze([
  shell('30 mm Autocannon', 'AP', 30, 220, 180, 160, 1300, { reloadS: .14, reloadGroup: 'gunship-cannon', soundProfile: 'gunship-autocannon' }),
  shell('152 mm Howitzer', 'HE', 152, 110, 110, 1500, 800, { reloadS: 3.5, reloadGroup: 'gunship-howitzer', blastRadiusM: 22, soundProfile: 'gunship-howitzer' }),
  shell('Guided Missile', 'HE', 180, 320, 320, 1600, 400, { guided: true, reloadS: 7, reloadGroup: 'gunship-missile', blastRadiusM: 18, soundProfile: 'gunship-missile' }),
]);
// Fictional single-charge anti-armor payload: uses the same ERA, spaced armor
// and penetration rules as other shaped charges, rather than an artillery blast.
export const DRONE_WARHEAD = shell('FPV shaped charge', 'HEAT', 90, 350, 350, 1400, 42, { tracer: 'DRONE', gravityScale: 0, maxLifetimeS: AERIAL_RULES.drone.batteryS });

type RulesetAmmo = 'spec' | 'he_only' | 'unlimited';
type RulesetTimeout = 'draw' | 'defeat';

interface AssaultRules {
  /** Defenders fielded on the first sector; each further sector adds one. */
  readonly initialActive: number;
  /** Extra defenders per sector from the operation's difficulty. */
  readonly extraDefenders: number;
  /** Hit-point scale added per sector taken, up to the last sector. */
  readonly hpPerLine: number;
  /**
   * Hit-point scale of the last sector's counter-attack, in place of 1 + sectors taken × hpPerLine (1.32 on the third
   * sector). Modes lane, 2026-10-08 (owner decision: the attackers should win 40–55 % of bot tests): the attack took
   * the first two sectors every time and lost most matches at the third, where five fresh defenders at 1.32× met the
   * four survivors; 1.15× is the decision's first knob.
   */
  readonly finalLineHp: number;
  /** Hit-point scale added by the operation's difficulty (applies to every defender). */
  readonly difficultyHp: number;
  /** Seconds the last sector must be held. */
  readonly holdS: number;
}

/** Endless Horde wave law (owner 2026-09-15: "the horde is not endless, there's only 3 tanks every time"). */
interface HordeRules {
  /** Hostiles fielded on the first wave. */
  readonly waveSize: number;
  /** Hostiles added every wave. */
  readonly waveStep: number;
  /** One more hostile every this many waves (0 = never). */
  readonly surgeEvery: number;
}

/**
 * Team arrangement (owner 2026-09-15): the co-op modes let the player arrange both sides — allied
 * bots, the enemy pool (distinct hostile identities in the match), the first Horde wave and the
 * enemy nation. Sides (owner 2026-09-18: "a switch that's default set to 7v7 but then switching it
 * does 14v14 and you can also enter custom numbers of allies and enemies … 1 v 20"): every other mode
 * arranges its two sides the same way — allied bots and hostiles all on the field at once — under
 * one field limit. Absent fields keep the mode's defaults; every value is clamped by
 * TEAM_ARRANGEMENT_LIMITS.
 */
/**
 * Mars mode settings (owner 2026-09-18: "give it a bunch of boosts and settings"): the gravity world the basin
 * plays under and how often a boost cache drops. Stored per player on the mars arrangement
 * (game/teamArrangement.ts readMarsSettings) and carried by rooms through the lobby arrangement.
 */
const MARS_GRAVITY_OPTIONS = Object.freeze({
  // round 30 (owner 2026-09-20): the jump is a rocket boost — about 1.45x the 2026-09-18 launches
  mars: Object.freeze({ gravityScale: 0.38, jumpMps: 9.5, recoilLaunchScale: 3 }),
  moon: Object.freeze({ gravityScale: 0.17, jumpMps: 12.5, recoilLaunchScale: 4.5 }),
  earth: Object.freeze({ gravityScale: 1, jumpMps: 6, recoilLaunchScale: 1.5 }),
});
export type MarsGravityId = keyof typeof MARS_GRAVITY_OPTIONS;
export const MARS_GRAVITY_IDS: readonly MarsGravityId[] = Object.freeze(Object.keys(MARS_GRAVITY_OPTIONS) as MarsGravityId[]);
const MARS_CACHE_OPTIONS = Object.freeze({
  off: Object.freeze({ cacheFirstS: 0, cacheIntervalS: 0 }),
  standard: Object.freeze({ cacheFirstS: 12, cacheIntervalS: 22 }),
  frequent: Object.freeze({ cacheFirstS: 8, cacheIntervalS: 11 }),
});
export type MarsCachesId = keyof typeof MARS_CACHE_OPTIONS;
export const MARS_CACHE_IDS: readonly MarsCachesId[] = Object.freeze(Object.keys(MARS_CACHE_OPTIONS) as MarsCachesId[]);
export function isMarsGravityId(value: unknown): value is MarsGravityId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MARS_GRAVITY_OPTIONS, value);
}
export function isMarsCachesId(value: unknown): value is MarsCachesId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MARS_CACHE_OPTIONS, value);
}
interface MarsRules {
  readonly gravity: MarsGravityId;
  readonly caches: MarsCachesId;
  /** Seconds into the match the first boost cache drops, then the cadence; 0 means no caches. */
  readonly cacheFirstS: number;
  readonly cacheIntervalS: number;
}
function marsRulesFor(gravity: MarsGravityId, caches: MarsCachesId): MarsRules {
  return Object.freeze({ gravity, caches, ...MARS_CACHE_OPTIONS[caches] });
}
export const MARS_DEFAULT_RULES: MarsRules = marsRulesFor('mars', 'standard');

export interface TeamArrangement {
  /** Juggernaut side, from the local player/host perspective. */
  readonly juggernautRole?: 'boss' | 'hunter' | null;
  /** Free-sortie objective controls; irrelevant fields are discarded at the boundary. */
  readonly scoreTarget?: number | null;
  readonly respawnS?: number | null;
  readonly waveStep?: number | null;
  readonly holdS?: number | null;
  readonly allies?: number | null;
  readonly enemies?: number | null;
  readonly waveSize?: number | null;
  /** Enemy nation id (game/teamArrangement.ts ENEMY_NATION_OPTIONS) or null for a mixed force. */
  readonly enemyNation?: string | null;
  /** Solo allied bots follow the selected player's nation. */
  readonly alliedNation?: 'player' | null;
  /** Mars mode only: the gravity world and boost-cache cadence (MARS_GRAVITY_OPTIONS / MARS_CACHE_OPTIONS). */
  readonly marsGravity?: MarsGravityId | null;
  readonly marsCaches?: MarsCachesId | null;
}

/**
 * Vehicles one solo field may hold, the player included (owner 2026-09-18: "go up to a number that you
 * test is the total limit to how many tanks can be in a game before performance is unacceptable" —
 * measured on the desktop tier 2026-09-18, docs/GAME-MODES.md "Sides").
 */
export const BATTLE_FIELD_LIMIT = 42;
/** The whole-game default split: the player with six allied bots against seven hostiles. */
export const STANDARD_SIDES = Object.freeze({ allies: 6, enemies: 7 });
/** The sides switch presets (the player counts on the allied side, so "14 v 14" is thirteen allied bots). */
export const SIDES_PRESETS = Object.freeze({
  '7v7': STANDARD_SIDES,
  '14v14': Object.freeze({ allies: 13, enemies: 14 }),
});
type SidesPreset = keyof typeof SIDES_PRESETS | 'custom';
type IntRange = readonly [number, number];
const range = (low: number, high: number): IntRange => Object.freeze([low, high] as const);
const SYMMETRIC_ALLIES = range(0, BATTLE_FIELD_LIMIT - 2), SYMMETRIC_ENEMIES = range(1, BATTLE_FIELD_LIMIT - 1);
const COOP_ALLIES = range(0, 6);
export const TEAM_ARRANGEMENT_LIMITS: {
  readonly field: number;
  readonly allies: Readonly<Record<GameModeId, IntRange>>;
  readonly enemies: Readonly<Record<GameModeId, IntRange>>;
  readonly waveSize: IntRange;
} = Object.freeze({
  field: BATTLE_FIELD_LIMIT,
  allies: Object.freeze({
    standard: SYMMETRIC_ALLIES, capture_the_flag: SYMMETRIC_ALLIES, zone_control: SYMMETRIC_ALLIES, turbo_ball: SYMMETRIC_ALLIES,
    endless_horde: COOP_ALLIES, frontline_assault: COOP_ALLIES, mars: SYMMETRIC_ALLIES,
    juggernaut: SYMMETRIC_ALLIES, infected: SYMMETRIC_ALLIES, realistic: SYMMETRIC_ALLIES, gun_game: SYMMETRIC_ALLIES, drone: SYMMETRIC_ALLIES, ac130: range(2, 8),
  }),
  enemies: Object.freeze({
    standard: SYMMETRIC_ENEMIES, capture_the_flag: SYMMETRIC_ENEMIES, zone_control: SYMMETRIC_ENEMIES, turbo_ball: SYMMETRIC_ENEMIES,
    endless_horde: range(6, 20), frontline_assault: range(4, 14), mars: SYMMETRIC_ENEMIES,
    juggernaut: SYMMETRIC_ENEMIES, infected: SYMMETRIC_ENEMIES, realistic: SYMMETRIC_ENEMIES, gun_game: SYMMETRIC_ENEMIES, drone: SYMMETRIC_ENEMIES, ac130: range(4, 24),
  }),
  waveSize: range(2, 12),
});

/**
 * Impact physics (owner 2026-09-25: "add more speed based damage — running into something hard super fast like
 * a rock or building or other tank, fall damage — and make bouncing properly work in the lower gravity modes").
 * The laws live in sim/impact.ts (damage) and sim/movement.ts (landing rebound); this block holds every number a
 * mode bends, so the solo step, the authority and the client prediction read one table. Energies are the hull's
 * kinetic energy in kilojoules above the threshold speed (½ · m · (v − v_min)²), so a heavier hull takes more from
 * the same speed and the onset is smooth.
 */
export interface RulesetPhysics {
  /** Rebound share of the closing speed when a hull lands on terrain or a structure (v_out = restitution · v_in). */
  readonly restitution: number;
  /** A rebound slower than this settles onto the ground instead of bouncing (m/s). */
  readonly bounceMinMps: number;
  /** Optional arcade landing height cap, independent of the selected planet's gravity. */
  readonly bounceMaxHeightM?: number;
  /** Optional arcade spin damping (per second) and per-axis angular speed limit (rad/s). */
  readonly airAngularDrag?: number;
  readonly airAngularSpeedMax?: number;
  /** Landing speed against the ground where fall damage begins (m/s; 6 m/s is a 1.8 m drop at 1 g). */
  readonly fallMinMps: number;
  /** Hull hit points per kilojoule of landing energy above the threshold. */
  readonly fallHpPerKj: number;
  /** Closing speed against a hard obstacle (rock, wall, structure, map edge) where impact damage begins (m/s). */
  readonly impactMinMps: number;
  /** Hull hit points per kilojoule of impact energy above the threshold. */
  readonly impactHpPerKj: number;
  /** Multiplies the tank-on-tank ram pool (damage.ts ramDamage). */
  readonly ramScale: number;
  /** Rebound share of a tank-on-tank contact's closing speed in the momentum exchange (0 = they stick). */
  readonly ramRestitution: number;
}

/**
 * The arcade modes' landing hop: the tracks leave the ground by at most this much on a landing's rebound, whatever the
 * gravity (physics lane, 2026-10-03; gauntlet wave 2). The springs take the landing and return its rebound
 * (sim/movement.ts); at 1.5 m a Mars rocket jump came back up a metre and the Moon's took 2.7 s to come down again, a
 * rubber ball, not a tracked hull — the critics' target was a damped settle with low restitution. At the Moon's 0.17 g
 * the capped rebound is under the 1.2 m/s floor, so its springs settle it.
 */
const LANDING_HOP_MAX_M = 0.25;
/** The whole-game impact physics: a tracked hull barely rebounds, a 1.8 m drop is free, walls hurt from 4 m/s. */
export const STANDARD_PHYSICS: RulesetPhysics = Object.freeze({
  restitution: 0.15, bounceMinMps: 1.2, fallMinMps: 6, fallHpPerKj: 0.25,
  impactMinMps: 4, impactHpPerKj: 0.16, ramScale: 1, ramRestitution: 0.2,
});
/** Turbo Ball: arcade rebounds at 0.6 g, a single 13 m/s jump lands free, walls at 1.85× speed cost less per kJ. */
const TURBO_PHYSICS: RulesetPhysics = Object.freeze({
  restitution: 0.28, bounceMinMps: 1.5, bounceMaxHeightM: LANDING_HOP_MAX_M, airAngularDrag: 0.9, airAngularSpeedMax: 1.4,
  fallMinMps: 15, fallHpPerKj: 0.12,
  impactMinMps: 9, impactHpPerKj: 0.05, ramScale: 1, ramRestitution: 0.5,
});
/** Mars: a small, bounded landing rebound; the full 9.5 m/s rocket jump still lands free. */
const MARS_PHYSICS: RulesetPhysics = Object.freeze({
  restitution: 0.30, bounceMinMps: 1.2, bounceMaxHeightM: LANDING_HOP_MAX_M, airAngularDrag: 0.8, airAngularSpeedMax: 1.2,
  fallMinMps: 10.5, fallHpPerKj: 0.16,
  impactMinMps: 5, impactHpPerKj: 0.12, ramScale: 1, ramRestitution: 0.35,
});

export interface MatchRuleset {
  readonly alwaysVisible?: boolean;
  readonly moduleOnlyDamage?: boolean;
  readonly juggernaut?: { readonly team: 'alpha' | 'bravo'; readonly hpScale: number; readonly reloadScale: number; readonly speedScale: number };
  readonly infection?: { readonly infectedSpeed: number; readonly infectedRespawnS: number; readonly survivorHpScale: number; readonly infectedHpScale: number; readonly infectedReloadScale: number };
  readonly gunGame?: { readonly killsPerWeapon: number };
  readonly aerial?: 'drone' | 'gunship';
  readonly scoreTarget?: number | null;
  readonly mode: GameModeId;
  /** Multiplies 9.81 m/s² for hulls in the air, shells in flight and the ball. */
  readonly gravityScale: number;
  /** Impact, fall, rebound and ram-exchange laws (sim/impact.ts, sim/movement.ts). */
  readonly physics: RulesetPhysics;
  /** Multiplies top and reverse speed (the controller may raise it per wave / lower it for a flag carrier). */
  readonly speedMultiplier: number;
  /** Multiplies hull hit points at spawn and revive. */
  readonly hpScale: number;
  /** Multiplies every hit point lost to shells, blast and ramming. */
  readonly damageScale: number;
  /** Multiplies reload time. */
  readonly reloadScale: number;
  /** Which rounds a crew carries: the vehicle's own loadout, HE only, or the loadout with unlimited rounds. */
  readonly ammo: RulesetAmmo;
  /** Equipment slots honoured (0 disables equipment). */
  readonly equipmentSlots: 0 | 1 | 2 | 3;
  readonly consumables: boolean;
  /** Modules, crew and fires take damage. False (owner 2026-09-15, Turbo Ball: "make modules not break since
   * there's no consumables") keeps every critical system intact — hull hit points are the only thing a hit costs. */
  readonly criticalDamage: boolean;
  /** Upward launch (m/s) the F key gives a grounded, upright hull, or null when the mode has no jump (owner
   * 2026-09-16, Turbo Ball: "make an f button that just adds an upward vector so you go flying"). */
  readonly jumpMps: number | null;
  /** Multiplies the hull's firing recoil into a real launch opposite the muzzle (owner: "aim behind you and launch
   * yourself and use it as a speed boost"); 1 keeps the ordinary hull kick. */
  readonly recoilLaunchScale: number;
  /** Mars mode settings (gravity world, boost-cache cadence); only the mars ruleset carries them. */
  readonly mars?: MarsRules;
  /** Multiplies the shove a shell impact gives the hull it hits (owner: "shells should have more physics effects
   * that knock you"); 1 is the whole-game baseline. */
  readonly shellKnockScale: number;
  /** Seconds to respawn, or null when a destroyed vehicle stays destroyed. */
  readonly respawnS: number | null;
  /** Clock in seconds, or null for no clock. */
  readonly timeLimitS: number | null;
  /** How an expired clock resolves when the score is level (or has no score). */
  readonly timeout: RulesetTimeout;
  /**
   * Battle endings (owner 2026-09-25: "handle battle ends better"): seconds the world keeps simulating after
   * the verdict — wrecks settle, fires burn, shells in flight land — with every gun silent, so the ending beat
   * (final-kill replay, time's-up pull-back, objective orbit) plays over a living field. Past the hold the
   * simulation stands still under the report. Bounded: see ENDING_HOLD_LIMIT_S.
   */
  readonly endingHoldS: number;
  /** Solo roster split: allied bots and enemy bots (null keeps the default 6 / 7). */
  readonly allies: number | null;
  readonly enemies: number | null;
  /** Frontline Assault wave rules (campaign difficulty folds in here). */
  readonly assault: AssaultRules | null;
  /** Endless Horde wave law. */
  readonly horde: HordeRules | null;
  /** Enemy nation id the roster fills from first (co-op modes; null = mixed / the operation decides). */
  readonly enemyNation: string | null;
  readonly alliedNation?: 'player' | null;
  /** Buildings that break and collapse, ground that craters (docs/DESTRUCTION.md §9). */
  readonly destruction: DestructionRules;
  /**
   * The battlefield variant the mode plays on (null: the base map). Frontline Assault's 'assault-trenches' carves the
   * trench system into the terrain and dresses its works; every client builds it and the authority plays exactly it
   * (its own collision manifest, server/world-collision-manifests/<map>@assault-trenches.json).
   */
  readonly terrainVariant: TerrainVariant | null;
}

/** A battlefield variant a mode can play (the map built with that variant's config, its own collision manifest). */
export type TerrainVariant = 'assault-trenches';
export const TERRAIN_VARIANTS: readonly TerrainVariant[] = Object.freeze(['assault-trenches']);
/** The variant `mode` plays on (null: the base map). */
export function terrainVariantFor(mode: GameModeId | string | null | undefined): TerrainVariant | null {
  return (BASE_RULESETS as Readonly<Record<string, MatchRuleset>>)[String(mode)]?.terrainVariant ?? null;
}

export interface CampaignRulesetInput {
  /** 1-based ladder difficulty. */
  readonly difficulty: number;
  readonly timeLimitS?: number | null;
  /** The operation's enemy nation id (campaignOperations.ts). */
  readonly enemy?: string | null;
}

/** The longest post-verdict hold any ruleset may declare (the report gate's watchdog sits at 16 s). */
export const ENDING_HOLD_LIMIT_S = 12;
/** Whole-game post-verdict hold: long enough for the 2.5 s beats and the killcam's live wreck hold. */
const ENDING_HOLD_S = 8;

/**
 * Destruction (owner 2026-10-07: "buildings should break and collapse ... after withstanding damage and ramming"; craters
 * "esp from like the ac 130"): on in every mode but Turbo Ball, whose pitch an unlimited HE ladder would crater under
 * the ball; the AC-130 digs its craters a quarter wider (docs/DESTRUCTION.md §9).
 */
/**
 * The crater switch (destruction core lane, 2026-10-08; docs/DESTRUCTION.md §7, crater-render-spec §F): on, the
 * simulation digs craters in every mode that plays destruction, and the drawn terrain (world/terrainCraterMesh.ts), the
 * ground cover (world/groundCoverCraters.ts) and the crater's own surface (fx/craterMarks.ts) follow the dug ground.
 * Off until the switch-on gates pass (pacing and fairness paired against craters off, both audits, cost with a
 * barrage, the network's stamp-once and late join).
 */
const CRATERS_SWITCH = false;
// sections (P2: holes, fallen walls, roofs and storeys that shells and sight lines pass) stay off until their gates pass
// (docs/DESTRUCTION.md §3.4, §13): the receipts, the paired pacing and fairness, the cost runs and the motion strips
const SECTIONS_SWITCH = false;
const DESTRUCTION_ON: DestructionRules = Object.freeze({
  structures: true, craters: CRATERS_SWITCH, sections: SECTIONS_SWITCH, structureDamageScale: 1, craterScale: 1, maxCraters: 160,
});
const DESTRUCTION_OFF: DestructionRules = Object.freeze({
  structures: false, craters: false, sections: false, structureDamageScale: 0, craterScale: 0, maxCraters: 0,
});

const STANDARD: MatchRuleset = Object.freeze({
  mode: 'standard', gravityScale: 1, physics: STANDARD_PHYSICS, speedMultiplier: 1, hpScale: 1, damageScale: 1, reloadScale: 1,
  ammo: 'spec', equipmentSlots: 3, consumables: true, criticalDamage: true, jumpMps: null, recoilLaunchScale: 1, shellKnockScale: 0.3,
  respawnS: null, timeLimitS: 900, timeout: 'draw', endingHoldS: ENDING_HOLD_S,
  allies: null, enemies: null, assault: null, horde: null, enemyNation: null,
  destruction: DESTRUCTION_ON, terrainVariant: null,
});

const BASE_RULESETS: Readonly<Record<GameModeId, MatchRuleset>> = Object.freeze({
  standard: STANDARD,
  // Flags: respawning objective play on the standard physics; the controller slows a carrier.
  capture_the_flag: Object.freeze({ ...STANDARD, mode: 'capture_the_flag', respawnS: 6 }),
  // Zones: respawning hold-the-ground play; the 750-point target resolves inside the clock.
  zone_control: Object.freeze({ ...STANDARD, mode: 'zone_control', respawnS: 6 }),
  // Turbo Ball: arcade physics — 0.6 g so hulls and shells fly, 1.85× speed, tough hulls, half
  // damage, quick reloads, HE only with unlimited rounds, no equipment or consumables, 3 s
  // respawns, a ten-minute clock.
  turbo_ball: Object.freeze({
    ...STANDARD, mode: 'turbo_ball', gravityScale: 0.6, physics: TURBO_PHYSICS, speedMultiplier: 1.85, hpScale: 1.5,
    damageScale: 0.5, reloadScale: 0.7, ammo: 'unlimited', equipmentSlots: 0, consumables: false,
    criticalDamage: false, jumpMps: 13, recoilLaunchScale: 12, shellKnockScale: 2.5, respawnS: 3, timeLimitS: 600,
    destruction: DESTRUCTION_OFF,
  }),
  // Horde: survival — the player with two allied bots on alpha (co-op humans join it), a pool of
  // fourteen hostile identities on the far side drawn afresh every wave (five on the first wave,
  // one more each wave and a surge every third), tougher hull, no respawn, no clock; clearing a
  // wave repairs the survivors by HORDE_WAVE_REPAIR and drops a cache.
  endless_horde: Object.freeze({
    ...STANDARD, mode: 'endless_horde', hpScale: 1.25, respawnS: null, timeLimitS: null,
    allies: 2, enemies: 14,
    horde: Object.freeze({ waveSize: 5, waveStep: 1, surgeEvery: 3 }),
  }),
  // Frontline Assault: the campaign sortie — three allies, no respawn, a twelve-minute clock that
  // costs the operation when it runs out; defenders escalate per sector and per difficulty.
  frontline_assault: Object.freeze({
    ...STANDARD, mode: 'frontline_assault', respawnS: null, timeLimitS: 720, timeout: 'defeat',
    allies: 3, enemies: 10, terrainVariant: 'assault-trenches',
    assault: Object.freeze({ initialActive: 3, extraDefenders: 0, hpPerLine: 0.16, finalLineHp: 1.15, difficultyHp: 0, holdS: 20 }),
  }),
  // Mars mode (owner 2026-09-18): Olympus Basin's own physics — 0.38 g, a 6.5 m/s jump, +25 % speed, tougher
  // hulls, a lighter recoil launch than Turbo Ball — on the zone objective with 6 s respawns and a
  // twelve-minute clock; the boost caches are the mode controller's.
  mars: Object.freeze({
    ...STANDARD, mode: 'mars', mars: MARS_DEFAULT_RULES, gravityScale: 0.38, physics: MARS_PHYSICS, speedMultiplier: 1.25, hpScale: 1.2, damageScale: 0.9,
    reloadScale: 0.9, jumpMps: 9.5, recoilLaunchScale: 3, shellKnockScale: 0.9, respawnS: 6, timeLimitS: 720,
  }),
  juggernaut: Object.freeze({ ...STANDARD, mode: 'juggernaut', allies: 0, enemies: 12, respawnS: 6, timeLimitS: 600,
    juggernaut: Object.freeze({ team: 'alpha', hpScale: 8, reloadScale: .5, speedScale: .9 }) }),
  infected: Object.freeze({ ...STANDARD, mode: 'infected', allies: 9, enemies: 4, respawnS: 3, timeLimitS: 420,
    infection: Object.freeze({ infectedSpeed: 1.4, infectedRespawnS: 3, survivorHpScale: .3, infectedHpScale: 1.25, infectedReloadScale: .7 }) }),
  realistic: Object.freeze({ ...STANDARD, mode: 'realistic', alwaysVisible: false, moduleOnlyDamage: true, consumables: false }),
  gun_game: Object.freeze({ ...STANDARD, mode: 'gun_game', respawnS: 4, ammo: 'unlimited', timeLimitS: 900,
    gunGame: Object.freeze({ killsPerWeapon: 2 }) }),
  drone: Object.freeze({ ...STANDARD, mode: 'drone', aerial: 'drone', respawnS: 6, timeLimitS: 600, scoreTarget: 20 }),
  ac130: Object.freeze({ ...STANDARD, mode: 'ac130', aerial: 'gunship', allies: 4, enemies: 12, alwaysVisible: true,
    ammo: 'unlimited', consumables: false, timeLimitS: 480, timeout: 'defeat',
    destruction: Object.freeze({ ...DESTRUCTION_ON, craterScale: 1.25 }) }),
});

/** Score targets the modes play to (kept here so rule cards and controller agree). */
export const RULESET_SCORE_TARGETS: Readonly<Record<string, number>> = Object.freeze({
  capture_the_flag: 3, zone_control: 750, turbo_ball: 5, mars: 750, drone: 20,
});
/** A flag carrier drives at this share of the mode speed (Capture the Flag). */
export const FLAG_CARRIER_SPEED_SCALE = 0.85;
/** Share of maximum hull repaired on every surviving attacker when a Horde wave is cleared. */
export const HORDE_WAVE_REPAIR = 0.3;

/**
 * The post-verdict hold, read by the solo step and the authority alike: while it runs the world keeps
 * simulating with every gun silent; once it expires the step returns early and the field stands still.
 * A null verdict time means no verdict yet (never expired); the hold is clamped to ENDING_HOLD_LIMIT_S.
 */
export function endingHoldExpired(
  ruleset: Pick<MatchRuleset, 'endingHoldS'>,
  resultTimeS: number | null | undefined,
  timeS: number,
): boolean {
  if (resultTimeS == null || !Number.isFinite(resultTimeS)) return false;
  const holdS = Number.isFinite(ruleset.endingHoldS) ? Math.min(ENDING_HOLD_LIMIT_S, Math.max(0, ruleset.endingHoldS)) : 0;
  return timeS - resultTimeS >= holdS - 1e-9;
}

/** The wave modes: their enemy side is a pool drawn per wave (Horde) or per sector (Frontline). */
export function isWaveMode(mode: GameModeId): mode is 'endless_horde' | 'frontline_assault' {
  return mode === 'endless_horde' || mode === 'frontline_assault';
}

/** Every registered mode arranges its sides (owner 2026-09-18); an unknown id takes none. */
export function acceptsTeamArrangement(mode: GameModeId): boolean {
  return Object.prototype.hasOwnProperty.call(BASE_RULESETS, mode);
}

/** The two sides a symmetric mode fields at once (bots only — the player joins the allied side). */
export function rulesetSides(ruleset: Pick<MatchRuleset, 'allies' | 'enemies'>): { readonly allies: number; readonly enemies: number } {
  return { allies: ruleset.allies ?? STANDARD_SIDES.allies, enemies: ruleset.enemies ?? STANDARD_SIDES.enemies };
}

/** Which switch position an arrangement is: a preset when its sides match one, otherwise custom. */
export function sidesPresetOf(arrangement: Pick<TeamArrangement, 'allies' | 'enemies'> | null | undefined): SidesPreset {
  const sides = rulesetSides({ allies: arrangement?.allies ?? null, enemies: arrangement?.enemies ?? null });
  for (const [id, preset] of Object.entries(SIDES_PRESETS)) {
    if (preset.allies === sides.allies && preset.enemies === sides.enemies) return id as SidesPreset;
  }
  return 'custom';
}

const clampInt = (value: unknown, range: readonly [number, number]): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(range[0], Math.min(range[1], Math.round(n)));
};

/** Clamp an arrangement to the mode's limits; null for modes that take none or an empty input. */
export function normalizeTeamArrangement(mode: GameModeId, input: TeamArrangement | null | undefined): TeamArrangement | null {
  if (!input || !acceptsTeamArrangement(mode)) return null;
  let allies = input.allies == null ? null : clampInt(input.allies, TEAM_ARRANGEMENT_LIMITS.allies[mode]);
  const enemies = input.enemies == null ? null : clampInt(input.enemies, TEAM_ARRANGEMENT_LIMITS.enemies[mode]);
  const waveSize = mode === 'endless_horde' && input.waveSize != null
    ? clampInt(input.waveSize, TEAM_ARRANGEMENT_LIMITS.waveSize) : null;
  const alliedNation = input.alliedNation === 'player' ? 'player' : null;
  const enemyNation = typeof input.enemyNation === 'string' && /^[a-z_]{2,24}$/.test(input.enemyNation) ? input.enemyNation : null;
  const marsGravity = mode === 'mars' && isMarsGravityId(input.marsGravity) ? input.marsGravity : null;
  const marsCaches = mode === 'mars' && isMarsCachesId(input.marsCaches) ? input.marsCaches : null;
  const juggernautRole = mode === 'juggernaut' && (input.juggernautRole === 'hunter' || input.juggernautRole === 'boss') ? input.juggernautRole : null;
  const hasScore = Object.prototype.hasOwnProperty.call(RULESET_SCORE_TARGETS, mode);
  const scoreTarget = hasScore && Number.isFinite(input.scoreTarget) ? clampInt(input.scoreTarget!,
    mode === 'capture_the_flag' ? [1, 9] : mode === 'turbo_ball' ? [1, 15] : mode === 'drone' ? [5, 100] : [100, 2000]) : null;
  const respawnS = hasScore && Number.isFinite(input.respawnS) ? clampInt(input.respawnS!, [2, 15]) : null;
  const waveStep = mode === 'endless_horde' && Number.isFinite(input.waveStep) ? clampInt(input.waveStep!, [0, 3]) : null;
  const holdS = mode === 'frontline_assault' && Number.isFinite(input.holdS) ? clampInt(input.holdS!, [10, 60]) : null;
  // the field limit (player included) holds whatever the two sides ask for: the enemy count is kept — it is
  // the number the player typed for a "1 v 20" — and the allied bots yield
  if (!isWaveMode(mode) && (allies != null || enemies != null)) {
    const sides = rulesetSides({ allies, enemies });
    if (sides.allies + sides.enemies + 1 > BATTLE_FIELD_LIMIT) allies = Math.max(0, BATTLE_FIELD_LIMIT - 1 - sides.enemies);
  }
  if (allies == null && enemies == null && waveSize == null && enemyNation == null && alliedNation == null && marsGravity == null && marsCaches == null && scoreTarget == null && respawnS == null && waveStep == null && holdS == null && juggernautRole == null) return null;
  return Object.freeze({
    allies, enemies, waveSize, enemyNation,
    ...(alliedNation ? { alliedNation } : {}),
    ...(juggernautRole ? { juggernautRole } : {}),
    ...(scoreTarget != null ? { scoreTarget } : {}), ...(respawnS != null ? { respawnS } : {}),
    ...(waveStep != null ? { waveStep } : {}), ...(holdS != null ? { holdS } : {}),
    ...(marsGravity ? { marsGravity } : {}), ...(marsCaches ? { marsCaches } : {}),
  });
}

/**
 * Earth's gravity lands with the whole game's bounce (physics lane round 3; gauntlet wave 23: "an Earth-gravity drop
 * hops clear of the ground"): the basin's 30 % threw a 5.6 m/s landing at 1 g back off the ground.
 */
function gravityPhysics(physics: RulesetPhysics, gravity: MarsGravityId): RulesetPhysics {
  return gravity === 'earth' ? Object.freeze({ ...physics, restitution: STANDARD_PHYSICS.restitution }) : physics;
}

/**
 * The impact physics a hull of this mode lands by at this gravity. The client's prediction knows the room's mode and the
 * gravity the authority sends it (viewer.modeGravityScale), not the Mars settings, and Gravity mode's Earth rewrites the
 * mode's rebound (physics lane round 4: the prediction landed a 1 g hull at the basin's 30 % where the authority took
 * 15 %, so a landing the authority settled bounced on the client and was corrected).
 */
export function rulesetPhysicsAt(mode: GameModeId, gravityScale: number): RulesetPhysics {
  const physics = matchRulesetFor(mode).physics;
  if (mode !== 'mars') return physics;
  const gravity = MARS_GRAVITY_IDS.find((id) => Math.abs(MARS_GRAVITY_OPTIONS[id].gravityScale - gravityScale) < 1e-3);
  return gravity ? gravityPhysics(physics, gravity) : physics;
}

export function matchRulesetFor(
  mode: GameModeId,
  campaign: CampaignRulesetInput | null = null,
  arrangement: TeamArrangement | null = null,
): MatchRuleset {
  const base = BASE_RULESETS[mode] ?? STANDARD;
  let ruleset: MatchRuleset = base;
  if (campaign && mode === 'frontline_assault' && base.assault) {
    const difficulty = Math.max(1, Math.min(9, Math.floor(campaign.difficulty) || 1));
    ruleset = {
      ...base,
      timeLimitS: campaign.timeLimitS === undefined ? base.timeLimitS : campaign.timeLimitS,
      enemyNation: typeof campaign.enemy === 'string' ? campaign.enemy : base.enemyNation,
      assault: Object.freeze({
        ...base.assault,
        // one extra defender every two operations, and 6 % hull per operation past the first
        extraDefenders: Math.floor((difficulty - 1) / 2),
        difficultyHp: (difficulty - 1) * 0.06,
      }),
    };
  }
  const arranged = normalizeTeamArrangement(mode, arrangement);
  if (arranged) {
    ruleset = {
      ...ruleset,
      scoreTarget: arranged.scoreTarget ?? ruleset.scoreTarget,
      respawnS: arranged.respawnS ?? ruleset.respawnS,
      assault: ruleset.assault && arranged.holdS != null && !campaign
        ? Object.freeze({ ...ruleset.assault, holdS: arranged.holdS }) : ruleset.assault,
      allies: arranged.allies ?? ruleset.allies,
      enemies: arranged.enemies ?? ruleset.enemies,
      ...(arranged.alliedNation ? { alliedNation: arranged.alliedNation } : {}),
      // a campaign operation's formation is not overridden by the free-sortie nation setting
      enemyNation: campaign?.enemy ? ruleset.enemyNation : (arranged.enemyNation ?? ruleset.enemyNation),
      horde: ruleset.horde && (arranged.waveSize != null || arranged.waveStep != null)
        ? Object.freeze({ ...ruleset.horde, waveSize: Math.min(arranged.waveSize ?? ruleset.horde.waveSize, arranged.enemies ?? ruleset.enemies ?? ruleset.horde.waveSize), waveStep: arranged.waveStep ?? ruleset.horde.waveStep })
        : ruleset.horde,
    };
  }
  if (mode === 'mars' && arranged && (arranged.marsGravity || arranged.marsCaches)) {
    // Mars settings: the gravity world rewrites the physics trio, the cache choice its cadence
    const gravity = arranged.marsGravity ?? ruleset.mars?.gravity ?? MARS_DEFAULT_RULES.gravity;
    const caches = arranged.marsCaches ?? ruleset.mars?.caches ?? MARS_DEFAULT_RULES.caches;
    const world = MARS_GRAVITY_OPTIONS[gravity];
    ruleset = {
      ...ruleset, gravityScale: world.gravityScale, jumpMps: world.jumpMps, recoilLaunchScale: world.recoilLaunchScale,
      physics: gravityPhysics(ruleset.physics, gravity),
      mars: marsRulesFor(gravity, caches),
    };
  }
  if (ruleset.juggernaut) {
    const hunter = arrangement?.juggernautRole === 'hunter';
    ruleset = { ...ruleset, allies: hunter ? (arranged?.allies ?? 5) : 0,
      enemies: hunter ? 1 : (arranged?.enemies ?? 12),
      juggernaut: { ...ruleset.juggernaut, team: hunter ? 'bravo' : 'alpha' } };
  }
  if (ruleset.infection) ruleset = { ...ruleset, enemies: Math.max(3, arranged?.enemies ?? 4) };
  return ruleset === base ? base : Object.freeze(ruleset);
}

/**
 * Hull scale a Frontline counter-attack arrives with on sector `line` (0-based) of `lines`: 1 + line × hpPerLine on
 * the way in, finalLineHp on the last sector, plus the operation's difficulty on every one.
 */
export function assaultWaveHealthScale(rules: AssaultRules, line: number, lines: number): number {
  const index = Math.max(0, Math.floor(line));
  // the opening wave is never the counter-attack, even on a one-sector front
  const base = index > 0 && index >= lines - 1 ? rules.finalLineHp : 1 + index * rules.hpPerLine;
  return base + rules.difficultyHp;
}

/** Hostiles the Horde fields on a wave (1-based), before the pool caps it. */
export function hordeWaveSize(rules: HordeRules, wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  return rules.waveSize + (w - 1) * rules.waveStep + (rules.surgeEvery > 0 ? Math.floor((w - 1) / rules.surgeEvery) : 0);
}

/** Whole-number percent for copy ("+50 %", "-40 %"). */
function percent(scale: number): string {
  const delta = Math.round((scale - 1) * 100);
  return `${delta > 0 ? '+' : ''}${delta} %`;
}

interface RulesetLine {
  /** i18n key under `rules.line.*`. */
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
}

/**
 * The rule lines a mode card shows — only the rules that differ from Standard, in a fixed order,
 * so every card lists exactly what the code does.
 */
export function rulesetLines(ruleset: MatchRuleset): RulesetLine[] {
  const lines: RulesetLine[] = [];
  const line = (key: string, values: Record<string, string> = {}): void => { lines.push({ key, values }); };
  if (ruleset.moduleOnlyDamage) line('modulesOnly');
  if (ruleset.alwaysVisible) line('alwaysVisible');
  if (ruleset.juggernaut) line('boss', { hp: String(ruleset.juggernaut.hpScale), reload: String(ruleset.juggernaut.reloadScale) });
  if (ruleset.infection) line('infection');
  if (ruleset.gunGame) line('gunGame', { kills: String(ruleset.gunGame.killsPerWeapon) });
  if (ruleset.gravityScale !== 1) line('gravity', { value: `${Math.round(ruleset.gravityScale * 100) / 100} g` });
  if (ruleset.speedMultiplier !== 1) line('speed', { value: percent(ruleset.speedMultiplier) });
  if (ruleset.hpScale !== 1) line('hp', { value: percent(ruleset.hpScale) });
  if (ruleset.damageScale !== 1) line('damage', { value: percent(ruleset.damageScale) });
  if (ruleset.reloadScale !== 1) line('reload', { value: percent(1 / ruleset.reloadScale) });
  if (ruleset.ammo === 'he_only') line('ammoHeOnly');
  if (ruleset.ammo === 'unlimited') line('ammoUnlimited');
  if (ruleset.equipmentSlots === 0) line('noEquipment');
  else if (ruleset.equipmentSlots < 3) line('equipmentSlots', { value: String(ruleset.equipmentSlots) });
  if (!ruleset.consumables) line('noConsumables');
  if (!ruleset.criticalDamage) line('noCriticalDamage');
  if (ruleset.jumpMps != null) line('jump', { value: String(ruleset.jumpMps) });
  if (ruleset.recoilLaunchScale !== 1) line('recoilLaunch', { value: `×${Math.round(ruleset.recoilLaunchScale * 10) / 10}` });
  if (ruleset.mars) {
    if (ruleset.mars.cacheIntervalS > 0) line('marsCaches', { value: String(ruleset.mars.cacheIntervalS) });
    else line('marsCachesOff');
  }
  if (ruleset.shellKnockScale !== 0.3) line('shellKnock', { value: `×${Math.round(ruleset.shellKnockScale * 10) / 10}` });
  // impact physics (2026-09-25): a mode that rebounds harder than the whole game or forgives harder landings says so
  if (ruleset.physics.restitution !== STANDARD_PHYSICS.restitution) {
    line('bounce', { value: `${Math.round(ruleset.physics.restitution * 100)} %` });
  }
  if (ruleset.physics.fallMinMps !== STANDARD_PHYSICS.fallMinMps) line('fallDamage', { value: String(ruleset.physics.fallMinMps) });
  if (ruleset.respawnS != null) line('respawn', { value: String(ruleset.respawnS) });
  else if (ruleset.mode !== 'standard') line('noRespawn');
  if (ruleset.timeLimitS == null) line('noClock');
  else if (ruleset.timeLimitS !== STANDARD.timeLimitS || ruleset.timeout !== 'draw') {
    line(ruleset.timeout === 'defeat' ? 'clockDefeat' : 'clock', { value: `${Math.round(ruleset.timeLimitS / 60)}` });
  }
  if (isWaveMode(ruleset.mode)) {
    if (ruleset.allies === 0) line('noAllies');
    else if (ruleset.allies != null) line('allies', { value: String(ruleset.allies) });
    if (ruleset.enemies != null) line('enemyPool', { value: String(ruleset.enemies) });
  } else if (ruleset.allies != null || ruleset.enemies != null) {
    // sides (owner 2026-09-18): "14 v 14", "1 v 20" — the player counts on the allied side
    const sides = rulesetSides(ruleset);
    if (sides.allies !== STANDARD_SIDES.allies || sides.enemies !== STANDARD_SIDES.enemies) {
      line('sides', { allies: String(sides.allies + 1), enemies: String(sides.enemies) });
    }
  }
  if (ruleset.enemyNation) line('enemyNation', { value: ruleset.enemyNation });
  if (ruleset.scoreTarget != null) line('scoreTarget', { value: String(ruleset.scoreTarget) });
  if (ruleset.assault) line('sectorHold', { value: String(ruleset.assault.holdS) });
  if (ruleset.mode === 'capture_the_flag') line('carrierSpeed', { value: percent(FLAG_CARRIER_SPEED_SCALE) });
  if (ruleset.horde) line('hordeWaves', { value: String(ruleset.horde.waveSize), step: String(ruleset.horde.waveStep) });
  if (ruleset.mode === 'endless_horde') line('waveRepair', { value: `${Math.round(HORDE_WAVE_REPAIR * 100)} %` });
  if (ruleset.assault) {
    line('assaultWaves', {
      value: String(ruleset.assault.initialActive + ruleset.assault.extraDefenders),
      hp: percent(1 + ruleset.assault.difficultyHp),
    });
  }
  return lines;
}

/** Ammunition capacity for one round under a ruleset. Unlimited rounds keep the authored capacity and are refilled
 * after every shot (refillUnlimitedAmmunition); the HUD prints ∞ from the ruleset, not from the count. */
export function rulesetAmmoCapacity(ruleset: MatchRuleset, shellType: string, authored: number): number {
  if (ruleset.ammo === 'he_only') return shellType === 'HE' ? Math.max(authored, 1) : 0;
  return authored;
}

/** Reload multiplier a spawn folds into the equipment multipliers. */
export function rulesetReloadMultiplier(ruleset: MatchRuleset): number {
  return Math.max(0.1, ruleset.reloadScale);
}

/** Structural view of the combat state a ruleset stamps (damage.ts CombatState and the authority's share it). */
interface RulesetCombatState {
  hp: number;
  maxHp: number;
  ammo: number[];
  ammoCapacity: number[];
  equipMults?: Partial<Record<string, number>>;
  /** Multiplies every hit point lost (damage.ts hull sites and ramming). */
  modeDamageTakenScale?: number;
  /** False keeps modules, crew and fires intact (damage.ts rollModuleDamage / rollCrewHit). */
  modeCriticalDamage?: boolean;
  modeModuleOnlyDamage?: boolean;
}

interface RulesetShellSpec { readonly type?: string }

/**
 * Stamp a freshly created combat state with the ruleset: hull hit points (times the wave / health scale
 * the mode controller hands to a revive), the damage-taken scale, the reload multiplier folded into the
 * equipment multipliers, and the ammunition channels. Call it after applyEquipmentToCombat so the
 * reload fold survives; spawn and revive both go through it, in the browser sim and the authority.
 */
export function applyRulesetToCombat(
  combat: RulesetCombatState,
  shells: readonly RulesetShellSpec[] | null | undefined,
  ruleset: MatchRuleset,
  healthScale = 1,
): void {
  const wave = Number.isFinite(healthScale) && healthScale > 0 ? healthScale : 1;
  const scale = ruleset.hpScale * wave;
  if (scale !== 1) {
    combat.maxHp = Math.max(1, Math.round(combat.maxHp * scale));
    combat.hp = combat.maxHp;
  }
  combat.modeDamageTakenScale = ruleset.damageScale;
  combat.modeCriticalDamage = ruleset.criticalDamage;
  combat.modeModuleOnlyDamage = !!ruleset.moduleOnlyDamage;
  if (ruleset.reloadScale !== 1) {
    const mults = combat.equipMults || (combat.equipMults = {});
    const current = mults.reload;
    mults.reload = (Number.isFinite(current) ? current! : 1) * rulesetReloadMultiplier(ruleset);
  }
  if (ruleset.ammo === 'he_only' && Array.isArray(shells) && combat.ammoCapacity.length) {
    const capacities = combat.ammoCapacity.map((authored, slot) =>
      rulesetAmmoCapacity(ruleset, String(shells[slot]?.type || ''), authored));
    // a vehicle without any HE round keeps its own loadout rather than sortieing empty
    if (capacities.some((capacity) => capacity > 0)) {
      for (let slot = 0; slot < capacities.length; slot++) {
        combat.ammoCapacity[slot] = capacities[slot];
        combat.ammo[slot] = capacities[slot];
      }
    }
  }
}

/** The equipment ids a ruleset honours out of a loadout (0 slots disables equipment). */
export function rulesetLoadout(ruleset: MatchRuleset, ids: readonly string[] | null | undefined): string[] {
  const list = Array.isArray(ids) ? ids.slice() : [];
  return ruleset.equipmentSlots >= 3 ? list : list.slice(0, ruleset.equipmentSlots);
}

/** After a shot under unlimited ammunition, refill the fired channel (the HUD keeps the loadout shape). */
export function refillUnlimitedAmmunition(
  ruleset: MatchRuleset,
  combat: Pick<RulesetCombatState, 'ammo' | 'ammoCapacity'>,
  slot: number,
): void {
  if (ruleset.ammo !== 'unlimited') return;
  if (Number.isInteger(slot) && slot >= 0 && slot < combat.ammoCapacity.length) {
    combat.ammo[slot] = combat.ammoCapacity[slot];
  }
}

/** Solo roster caps: allied bots the player gets under a ruleset (null keeps the default split). */
export function rulesetAllyCap(ruleset: MatchRuleset, defaultCap: number): number {
  return ruleset.allies == null ? defaultCap : Math.max(0, Math.floor(ruleset.allies));
}
