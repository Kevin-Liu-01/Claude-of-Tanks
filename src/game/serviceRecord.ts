import { weaponHitKind } from './weaponHitKind.ts';
import { FiredRoundLedger } from './battleEventStats.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { getPlayerRecord } from './profile.ts';
// Medals and achievements: what a commander did, kept on this device beside
// the battle record (profile.ts). A medal is earned inside one battle — some
// the moment they happen, the rest when it ends; an achievement is a lifetime
// tally with three tiers. Nothing here is a currency: medals unlock nothing,
// and like the battle record they never leave the device.

const SERVICE_KEY = 'cot.service.v1';
const SERVICE_VERSION = 1;
const HISTORY_LIMIT = 25;
const TRACE_LIMIT = 16;
const UNSEEN_LIMIT = 64;

/** Chain of Thought: this many kills, each within CHAIN_WINDOW_S of the one before. */
const CHAIN_LENGTH = 3;
const CHAIN_WINDOW_S = 10;
/** Let Me Think Step by Step: this many aimed rounds in a row on target. */
const STEP_STREAK = 5;
/** Aimed rounds are main-gun calibres; an autocannon burst would make a streak trivial. */
const AIMED_CALIBER_MM = 60;
/** An aimed round that has not struck an enemy this long after firing missed. */
const SHOT_RESOLVE_S = 6;
const LONG_SHOT_M = 350;
const ACE_KILLS = 5;
const FEW_SHOT_KILLS = 3;
const FEW_SHOT_ROUNDS = 5;
const SHARPSHOOTER_SHOTS = 6;
const SHARPSHOOTER_RATIO = 0.85;
const EAGLE_EYE_SPOTS = 5;
const STEEL_WALL_BLOCKS = 5;
const CLOSE_CALL_HP = 0.1;
const WAVE_BREAKER_WAVES = 5;
const GUNSHIP_ACE_KILLS = 5;
const DRONE_ACE_KILLS = 3;
const ZERO_SHOT_MIN_S = 60;
const BLOCKED_KINDS = new Set(['ricochet', 'nonpen', 'spaced_absorb', 'era']);

export type MedalGroup = 'reasoning' | 'gunnery' | 'survival' | 'fieldcraft' | 'operations';
export type MedalTier = 'signature' | 'gold' | 'silver' | 'bronze';

const MEDAL_TABLE = [
  // The reasoning set: a commander's Chain of Thought, told in the language of the other CoT.
  ['chain_of_thought', 'reasoning', 'signature', 'lightbulb'],
  ['step_by_step', 'reasoning', 'signature', 'crewGunner'],
  ['zero_shot', 'reasoning', 'signature', 'fireGun'],
  ['few_shot', 'reasoning', 'signature', 'shell'],
  ['first_blood', 'gunnery', 'bronze', 'skull'],
  ['ace_gunner', 'gunnery', 'gold', 'star'],
  ['high_caliber', 'gunnery', 'silver', 'damage'],
  ['sharpshooter', 'gunnery', 'silver', 'scope'],
  ['long_shot', 'gunnery', 'silver', 'optics'],
  ['one_shot', 'gunnery', 'gold', 'penetration'],
  ['detonator', 'gunnery', 'gold', 'ammoRack'],
  ['steel_wall', 'survival', 'silver', 'shield'],
  ['untouchable', 'survival', 'gold', 'armorFlashlight'],
  ['close_call', 'survival', 'silver', 'heartbeat'],
  ['last_stand', 'survival', 'gold', 'crewCommander'],
  ['eagle_eye', 'fieldcraft', 'bronze', 'visionInfrared'],
  ['battering_ram', 'fieldcraft', 'silver', 'speed'],
  ['flag_runner', 'operations', 'gold', 'modeFlag'],
  ['striker', 'operations', 'gold', 'modeTurbo'],
  ['wave_breaker', 'operations', 'silver', 'modeHorde'],
  ['gunship_ace', 'operations', 'gold', 'modeAc130'],
  ['drone_ace', 'operations', 'gold', 'modeDrone'],
] as const;

type MedalId = typeof MEDAL_TABLE[number][0];

export interface MedalDef {
  readonly id: MedalId;
  readonly group: MedalGroup;
  readonly tier: MedalTier;
  /** A shared UI icon id (uiIcons.ts) for the medal's emblem. */
  readonly icon: string;
}

export const MEDALS: readonly MedalDef[] = Object.freeze(MEDAL_TABLE.map(([id, group, tier, icon]) =>
  Object.freeze({ id, group, tier, icon })));
const MEDAL_IDS: ReadonlySet<string> = new Set(MEDALS.map((medal) => medal.id));
const REASONING_IDS = MEDALS.filter((medal) => medal.group === 'reasoning').map((medal) => medal.id);

const ACHIEVEMENT_TABLE = [
  ['veteran', 'battleRecord', [10, 50, 250]],
  ['victor', 'star', [5, 25, 100]],
  ['tank_hunter', 'skull', [25, 150, 1000]],
  ['damage_dealer', 'damage', [25_000, 150_000, 1_000_000]],
  ['survivor', 'medkit', [10, 50, 200]],
  ['marksman', 'scope', [100, 500, 2500]],
  ['scout', 'optics', [50, 250, 1000]],
  ['medal_case', 'gold', [10, 50, 200]],
  ['chain_thinker', 'lightbulb', [1, 5, 25]],
  ['reasoning_model', 'eraNextGeneration', [2, 3, REASONING_IDS.length]],
  ['full_context', 'stamp', [5, 12, MEDALS.length]],
  ['world_tour', 'map', [5, 15, 30]],
  ['motor_pool', 'garage', [5, 20, 50]],
  ['nations', 'globe', [3, 8, 15]],
  ['mode_master', 'modeStandard', [3, 7, 13]],
] as const;

type AchievementId = typeof ACHIEVEMENT_TABLE[number][0];

export interface AchievementDef {
  readonly id: AchievementId;
  readonly icon: string;
  /** The tally each of the three tiers needs. */
  readonly tiers: readonly [number, number, number];
}

export const ACHIEVEMENTS: readonly AchievementDef[] = Object.freeze(ACHIEVEMENT_TABLE.map(([id, icon, tiers]) =>
  Object.freeze({ id, icon, tiers: Object.freeze([tiers[0], tiers[1], tiers[2]] as [number, number, number]) })));
const ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

type BattleResult = 'victory' | 'draw' | 'defeat';

interface ServiceStats {
  battles: number;
  victories: number;
  survived: number;
  kills: number;
  damage: number;
  shots: number;
  hits: number;
  spots: number;
  blocked: number;
  longestKillM: number;
  bestChain: number;
  bestStreak: number;
  bestKills: number;
}

interface MedalTally { count: number; first: number; last: number }
interface AchievementTally { tier: number; at: number }

interface TraceStep {
  /** Battle clock, in seconds. */
  t: number;
  specId: string;
  distM: number;
  cause: string;
}

interface AwardedTier { id: AchievementId; tier: number }

export interface ServiceBattle {
  at: number;
  result: BattleResult;
  mode: string;
  mapId: string;
  vehicleId: string;
  kills: number;
  damage: number;
  durationS: number;
  survived: boolean;
  shots: number;
  hits: number;
  bestChain: number;
  medals: MedalId[];
  achievements: AwardedTier[];
  trace: TraceStep[];
}

interface ServiceStore {
  version: number;
  stats: ServiceStats;
  medals: Partial<Record<MedalId, MedalTally>>;
  achievements: Partial<Record<AchievementId, AchievementTally>>;
  maps: string[];
  vehicles: string[];
  nations: string[];
  modes: string[];
  history: ServiceBattle[];
  /** Awards not yet looked at in the Service Record: `medal:<id>` and `achievement:<id>:<tier>`. */
  unseen: string[];
}

export interface AchievementProgress {
  def: AchievementDef;
  /** Tiers reached, 0 to 3. */
  tier: number;
  value: number;
  /** The next tier's target, or null once all three are reached. */
  next: number | null;
  at: number;
}

export interface ServiceRecordView {
  stats: ServiceStats;
  medals: Partial<Record<MedalId, MedalTally>>;
  achievements: AchievementProgress[];
  history: ServiceBattle[];
  unseen: string[];
  medalsEarned: number;
  tiersReached: number;
}

export interface BattleAwards {
  medals: MedalId[];
  achievements: AwardedTier[];
  bestChain: number;
}

/** What the tracker reads from the running battle (main.ts supplies it from the game state). */
interface ServiceContext {
  playerId(): string | null;
  playerTeam(): string | null;
  teamOf(id: string): string | null;
  gameMode(): string;
  /** The battle clock in seconds (it restarts at zero every battle). */
  clockS(): number;
  playerHpFraction(): number | null;
  playerMaxHp(): number | null;
  playerNation(): string | null;
  /** 'gunship' or 'drone' when the player flies an aerial platform. */
  playerAerialKind(): string | null;
  /** Our side in objective terms ('alpha' | 'bravo'); a network seat's own team reads 'player' whichever side it is. */
  playerObjectiveTeam(): string | null;
  /** True when the battle's ruleset brings destroyed vehicles back. */
  respawns(): boolean;
}

interface ServiceEventBus {
  on(event: string, listener: (payload?: RuntimeValue) => void): RuntimeValue;
  emit(event: string, payload?: RuntimeValue): RuntimeValue;
}

interface PendingShot { id: number | null; t: number; hit: boolean }

interface BattleTracker {
  vehicleId: string;
  mapId: string;
  startedAt: number;
  kills: number;
  damage: number;
  damageTaken: number;
  blocked: number;
  shots: number;
  aimedShots: number;
  aimedHits: number;
  pending: PendingShot[];
  streak: number;
  bestStreak: number;
  chain: number;
  bestChain: number;
  lastKillT: number;
  longestKillM: number;
  killShots: Map<string, { distM: number; fresh: boolean; drone: boolean }>;
  damaged: Set<string>;
  damageBy: Map<string, number>;
  spotted: Set<string>;
  waves: number;
  alive: boolean;
  hits: number;
  rounds: FiredRoundLedger;
  firstKillSeen: boolean;
  lastHpFraction: number;
  medals: Set<MedalId>;
  trace: TraceStep[];
}

const installedBuses = new WeakSet<ServiceEventBus>();
let cachedStore: ServiceStore | null = null;
let lastAwards: BattleAwards | null = null;

function count(value: RuntimeValue): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function finite(value: RuntimeValue): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function text(value: RuntimeValue): string {
  return typeof value === 'string' ? value.slice(0, 80) : '';
}

function recordOf(value: RuntimeValue): Record<string, RuntimeValue> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, RuntimeValue>
    : null;
}

function resultOf(value: RuntimeValue): BattleResult {
  return value === 'victory' || value === 'draw' ? value : 'defeat';
}

function stringSet(value: RuntimeValue, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry && !out.includes(entry)) out.push(entry.slice(0, 80));
    if (out.length >= limit) break;
  }
  return out;
}

function blankStats(): ServiceStats {
  return {
    battles: 0, victories: 0, survived: 0, kills: 0, damage: 0, shots: 0, hits: 0, spots: 0,
    blocked: 0, longestKillM: 0, bestChain: 0, bestStreak: 0, bestKills: 0,
  };
}

function blankStore(): ServiceStore {
  return {
    version: SERVICE_VERSION, stats: blankStats(), medals: {}, achievements: {},
    maps: [], vehicles: [], nations: [], modes: [], history: [], unseen: [],
  };
}

function sanitizeStats(value: RuntimeValue): ServiceStats {
  const source = recordOf(value) ?? {};
  const stats = blankStats();
  for (const key of Object.keys(stats) as (keyof ServiceStats)[]) stats[key] = count(source[key]);
  return stats;
}

function sanitizeBattle(value: RuntimeValue): ServiceBattle | null {
  const source = recordOf(value);
  if (!source) return null;
  const medals = stringSet(source.medals, MEDALS.length).filter((id): id is MedalId => MEDAL_IDS.has(id));
  const achievements: AwardedTier[] = [];
  for (const entry of Array.isArray(source.achievements) ? source.achievements : []) {
    const award = recordOf(entry);
    const id = award ? text(award.id) : '';
    const tier = award ? count(award.tier) : 0;
    if (ACHIEVEMENT_IDS.has(id) && tier >= 1 && tier <= 3) achievements.push({ id: id as AchievementId, tier });
  }
  const trace: TraceStep[] = [];
  for (const entry of Array.isArray(source.trace) ? source.trace.slice(0, TRACE_LIMIT) : []) {
    const step = recordOf(entry);
    if (step) trace.push({ t: Math.max(0, finite(step.t)), specId: text(step.specId), distM: count(step.distM), cause: text(step.cause) });
  }
  return {
    at: finite(source.at),
    result: resultOf(source.result),
    mode: text(source.mode) || 'standard',
    mapId: text(source.mapId),
    vehicleId: text(source.vehicleId),
    kills: count(source.kills),
    damage: count(source.damage),
    durationS: count(source.durationS),
    survived: source.survived === true,
    shots: count(source.shots),
    hits: count(source.hits),
    bestChain: count(source.bestChain),
    medals,
    achievements,
    trace,
  };
}

function sanitizeStore(value: RuntimeValue): ServiceStore {
  const source = recordOf(value);
  if (!source) return blankStore();
  const store = blankStore();
  store.stats = sanitizeStats(source.stats);
  const medals = recordOf(source.medals) ?? {};
  for (const id of MEDAL_IDS) {
    const tally = recordOf(medals[id]);
    if (tally && count(tally.count) > 0) {
      store.medals[id as MedalId] = { count: count(tally.count), first: finite(tally.first), last: finite(tally.last) };
    }
  }
  const achievements = recordOf(source.achievements) ?? {};
  for (const id of ACHIEVEMENT_IDS) {
    const tally = recordOf(achievements[id]);
    const tier = tally ? Math.min(3, count(tally.tier)) : 0;
    if (tally && tier > 0) store.achievements[id as AchievementId] = { tier, at: finite(tally.at) };
  }
  store.maps = stringSet(source.maps, 256);
  store.vehicles = stringSet(source.vehicles, 512);
  store.nations = stringSet(source.nations, 64);
  store.modes = stringSet(source.modes, 32);
  for (const entry of Array.isArray(source.history) ? source.history.slice(0, HISTORY_LIMIT) : []) {
    const battle = sanitizeBattle(entry);
    if (battle) store.history.push(battle);
  }
  store.unseen = stringSet(source.unseen, UNSEEN_LIMIT).filter(validUnseen);
  return store;
}

function validUnseen(key: string): boolean {
  const [kind, id, tier] = key.split(':');
  return kind === 'medal' ? MEDAL_IDS.has(id) && tier === undefined
    : kind === 'achievement' && ACHIEVEMENT_IDS.has(id) && (tier === '1' || tier === '2' || tier === '3');
}

function saveStore(): void {
  try { localStorage.setItem(SERVICE_KEY, JSON.stringify(cachedStore)); } catch (_) { /* session-only */ }
}

function loadStore(): ServiceStore {
  if (cachedStore) return cachedStore;
  let saved: RuntimeValue = null;
  try { saved = JSON.parse(localStorage.getItem(SERVICE_KEY) || 'null'); } catch (_) { /* storage unavailable or corrupt */ }
  cachedStore = sanitizeStore(saved);
  // Battles fought before medals existed still count towards the lifetime tallies: the first look
  // reaches whatever tiers the battle record already earns, and they wait in the record as new.
  if (!saved) {
    if (evaluateAchievements(cachedStore, Date.now()).length) saveStore();
  }
  return cachedStore;
}

function achievementValue(store: ServiceStore, id: AchievementId): number {
  const stats = store.stats;
  // The battle record (profile.ts) has counted every battle since long before medals; read its larger totals.
  const record = getPlayerRecord();
  switch (id) {
    case 'veteran': return Math.max(stats.battles, record.matches);
    case 'victor': return Math.max(stats.victories, record.wins);
    case 'tank_hunter': return Math.max(stats.kills, record.kills);
    case 'damage_dealer': return Math.max(stats.damage, record.damage);
    case 'survivor': return stats.survived;
    case 'marksman': return stats.hits;
    case 'scout': return stats.spots;
    case 'medal_case': return Object.values(store.medals).reduce((sum, tally) => sum + (tally?.count ?? 0), 0);
    case 'chain_thinker': return store.medals.chain_of_thought?.count ?? 0;
    case 'reasoning_model': return REASONING_IDS.filter((medal) => store.medals[medal]).length;
    case 'full_context': return Object.keys(store.medals).length;
    case 'world_tour': return store.maps.length;
    case 'motor_pool': return store.vehicles.length;
    case 'nations': return store.nations.length;
    case 'mode_master': return store.modes.length;
  }
}

function tierFor(def: AchievementDef, value: number): number {
  let tier = 0;
  for (const target of def.tiers) if (value >= target) tier++;
  return tier;
}

/** Raise every achievement to the tier its tally now reaches; returns each tier newly reached. */
function evaluateAchievements(store: ServiceStore, now: number): AwardedTier[] {
  const reached: AwardedTier[] = [];
  for (const def of ACHIEVEMENTS) {
    const tier = tierFor(def, achievementValue(store, def.id));
    const had = store.achievements[def.id]?.tier ?? 0;
    if (tier <= had) continue;
    for (let next = had + 1; next <= tier; next++) {
      reached.push({ id: def.id, tier: next });
      pushUnseen(store, `achievement:${def.id}:${next}`);
    }
    store.achievements[def.id] = { tier, at: now };
  }
  return reached;
}

function pushUnseen(store: ServiceStore, key: string): void {
  if (store.unseen.includes(key)) return;
  store.unseen.push(key);
  if (store.unseen.length > UNSEEN_LIMIT) store.unseen.splice(0, store.unseen.length - UNSEEN_LIMIT);
}

function addUnique(list: string[], value: string | null | undefined, limit: number): void {
  if (value && !list.includes(value) && list.length < limit) list.push(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A copy of the commander's medals, achievements (with progress) and recent battles. */
export function getServiceRecord(): ServiceRecordView {
  const store = loadStore();
  const achievements = ACHIEVEMENTS.map((def): AchievementProgress => {
    const tier = store.achievements[def.id]?.tier ?? 0;
    return {
      def,
      tier,
      value: achievementValue(store, def.id),
      next: tier < 3 ? def.tiers[tier] : null,
      at: store.achievements[def.id]?.at ?? 0,
    };
  });
  return {
    stats: { ...store.stats },
    medals: clone(store.medals),
    achievements,
    history: clone(store.history),
    unseen: [...store.unseen],
    medalsEarned: achievementValue(store, 'medal_case'),
    tiersReached: achievements.reduce((sum, entry) => sum + entry.tier, 0),
  };
}

/** The medals and achievement tiers the latest completed battle earned (this session). */
export function getLastBattleAwards(): BattleAwards | null {
  return lastAwards ? clone(lastAwards) : null;
}

/** How many awards wait unseen in the Service Record. */
export function unseenAwardCount(): number {
  return loadStore().unseen.length;
}

/** The Service Record has been looked at: its new awards are no longer new. */
export function markServiceRecordSeen(): void {
  const store = loadStore();
  if (!store.unseen.length) return;
  store.unseen = [];
  saveStore();
}

function newTracker(vehicleId: string, mapId: string): BattleTracker {
  return {
    vehicleId, mapId, startedAt: Date.now(),
    kills: 0, damage: 0, damageTaken: 0, blocked: 0, shots: 0, aimedShots: 0, aimedHits: 0,
    pending: [], streak: 0, bestStreak: 0, chain: 0, bestChain: 0, lastKillT: -Infinity,
    longestKillM: 0, killShots: new Map(), damaged: new Set(), damageBy: new Map(), spotted: new Set(),
    waves: 0, alive: true, hits: 0, rounds: new FiredRoundLedger(), firstKillSeen: false, lastHpFraction: 1,
    medals: new Set(), trace: [],
  };
}

/** Track medals through each battle and keep the record, exactly once per bus. */
export function installServiceRecord(bus: ServiceEventBus | null | undefined, ctx: ServiceContext): void {
  if (!bus || typeof bus.on !== 'function' || installedBuses.has(bus)) return;
  installedBuses.add(bus);

  let battle: BattleTracker | null = null;
  const me = () => ctx.playerId();
  const isEnemy = (id: RuntimeValue) => {
    if (typeof id !== 'string' || !id || id === me()) return false;
    const team = ctx.teamOf(id);
    const mine = ctx.playerTeam();
    return team == null || mine == null ? true : team !== mine;
  };
  // A medal earned mid-battle is announced the moment it happens; the ones judged at the end wait for the debrief.
  const award = (id: MedalId, live = true) => {
    if (!battle || battle.medals.has(id)) return;
    battle.medals.add(id);
    if (live) bus.emit('service:medal', { id });
  };
  // Settle aimed rounds in the order they were fired: a hit extends the streak, a round that never
  // struck an enemy breaks it. `final` settles the rounds still in flight when the battle ends as misses.
  const settleShots = (now: number, final = false) => {
    if (!battle) return;
    while (battle.pending.length) {
      const shot = battle.pending[0];
      if (!shot.hit && !final && now - shot.t < SHOT_RESOLVE_S) break;
      battle.pending.shift();
      if (shot.hit) {
        battle.streak++;
        battle.bestStreak = Math.max(battle.bestStreak, battle.streak);
        if (battle.streak >= STEP_STREAK) award('step_by_step');
      } else battle.streak = 0;
    }
  };
  const start = (payload: RuntimeValue) => {
    const event = recordOf(payload) ?? {};
    battle = newTracker(text(event.specId) || text(event.vehicleId), text(event.mapId));
    lastAwards = null;
  };

  bus.on('ui:battleStart', start);
  let phase = '';
  bus.on('phase:change', (payload) => {
    const next = text(recordOf(payload)?.phase);
    // Leaving a battle without its result (a quit) drops what it tracked; debug and API entry can skip the garage's
    // battle start, so arriving in one starts tracking if nothing is.
    if (phase === 'battle' && next !== 'battle') battle = null;
    if (next === 'battle' && !battle) start({});
    phase = next;
  });

  bus.on('shell:fired', (payload) => {
    const event = recordOf(payload);
    if (!battle || !event || !me() || event.shooterId !== me()) return;
    const now = ctx.clockS();
    battle.shots++;
    battle.rounds.fire(typeof event.shellId === 'number' ? event.shellId : null);
    if (finite(event.caliberMm) >= AIMED_CALIBER_MM) {
      battle.aimedShots++;
      battle.pending.push({ id: typeof event.shellId === 'number' ? event.shellId : null, t: now, hit: false });
    }
    settleShots(now);
  });

  bus.on('shell:hit', (payload) => {
    const event = recordOf(payload);
    if (!battle || !event) return;
    const player = me();
    const damage = Math.max(0, finite(event.damage));
    const attacker = text(event.attackerId);
    const target = text(event.targetId);
    if (attacker && damage > 0) battle.damageBy.set(attacker, (battle.damageBy.get(attacker) ?? 0) + damage);
    if (player && attacker === player && target && isEnemy(target)) {
      battle.damage += damage;
      const shellId = typeof event.shellId === 'number' ? event.shellId : null;
      const freshRound = battle.rounds.hit(shellId);
      if (freshRound.hit) battle.hits++;
      const shot = battle.pending.find((entry) => !entry.hit && (shellId == null || entry.id == null || entry.id === shellId));
      if (shot && freshRound.hit) { shot.hit = true; battle.aimedHits++; }
      if (event.destroyed === true) {
        battle.killShots.set(target, { distM: Math.max(0, finite(event.flightDistM)), fresh: !battle.damaged.has(target), drone: event.shellName === 'FPV shaped charge' });
      }
      settleShots(ctx.clockS());
    }
    if (player && target === player && attacker && isEnemy(attacker)) {
      if (damage > 0) {
        battle.damageTaken += damage;
        const max = finite(event.targetMaxHp) || ctx.playerMaxHp() || 0;
        if (max > 0 && typeof event.targetHpAfter === 'number') battle.lastHpFraction = Math.max(0, event.targetHpAfter / max);
      } else if (BLOCKED_KINDS.has(text(event.kind)) && weaponHitKind({
        caliberMm: finite(event.caliberMm), guided: event.guided === true, shellType: text(event.shellType),
      }) !== 'machineGun') {
        battle.blocked++;
        if (battle.blocked >= STEEL_WALL_BLOCKS) award('steel_wall');
      }
    }
    if (target && damage > 0) battle.damaged.add(target);
  });

  bus.on('tank:destroyed', (payload) => {
    const event = recordOf(payload);
    if (!battle || !event) return;
    const player = me();
    const victim = text(event.id);
    const killer = text(event.killerId);
    if (player && victim === player) battle.alive = false;
    const killerTeam = killer ? ctx.teamOf(killer) : null;
    const victimTeam = ctx.teamOf(victim);
    const enemyKill = !!killer && killer !== victim && (killerTeam == null || victimTeam == null || killerTeam !== victimTeam);
    if (enemyKill && !battle.firstKillSeen) {
      battle.firstKillSeen = true;
      if (player && killer === player) award('first_blood');
    }
    if (!player || killer !== player || !isEnemy(victim)) return;
    const now = ctx.clockS();
    battle.kills++;
    battle.chain = now - battle.lastKillT <= CHAIN_WINDOW_S ? battle.chain + 1 : 1;
    battle.lastKillT = now;
    battle.bestChain = Math.max(battle.bestChain, battle.chain);
    if (battle.chain >= CHAIN_LENGTH) award('chain_of_thought');
    const shot = battle.killShots.get(victim);
    battle.killShots.delete(victim);
    const distM = shot?.distM ?? 0;
    battle.longestKillM = Math.max(battle.longestKillM, distM);
    if (distM >= LONG_SHOT_M) award('long_shot');
    if (shot?.fresh) award('one_shot');
    if (event.cause === 'ammorack') award('detonator');
    if (event.cause === 'ram') award('battering_ram');
    if (battle.kills >= ACE_KILLS) award('ace_gunner');
    const aerial = ctx.playerAerialKind();
    // A drone's strike is not a fired round (no shell:fired), so the round-counting medals stay out of its reach.
    if (aerial !== 'drone' && battle.kills >= FEW_SHOT_KILLS && battle.shots <= FEW_SHOT_ROUNDS) award('few_shot');
    if (aerial === 'gunship' && battle.kills >= GUNSHIP_ACE_KILLS) award('gunship_ace');
    if (aerial === 'drone' && battle.kills >= DRONE_ACE_KILLS) award('drone_ace');
    if (battle.trace.length < TRACE_LIMIT) {
      battle.trace.push({ t: Math.max(0, now), specId: text(event.specId), distM: Math.round(distM), cause: event.cause === 'ammorack' ? 'ammorack' : shot?.drone ? 'drone' : text(event.cause) || 'shot' });
    }
  });

  bus.on('tank:spotted', (payload) => {
    const event = recordOf(payload);
    const player = me();
    if (!battle || !event || !player || event.spotterId !== player) return;
    const id = text(event.id);
    if (!id || !isEnemy(id)) return;
    battle.spotted.add(id);
    if (battle.spotted.size >= EAGLE_EYE_SPOTS) award('eagle_eye');
  });

  const ours = () => {
    const perspective = ctx.playerObjectiveTeam();
    if (perspective === 'alpha' || perspective === 'bravo') return perspective;
    const team = ctx.playerTeam();
    return team === 'bravo' || team === 'enemy' ? 'bravo' : 'alpha';
  };
  // The capturer's own side scores a capture, so capturing it ourselves is the whole test.
  bus.on('mode:flag_captured', (payload) => {
    const event = recordOf(payload);
    if (event && me() && event.by === me()) award('flag_runner');
  });
  bus.on('mode:goal_scored', (payload) => {
    const event = recordOf(payload);
    if (event && me() && event.by === me() && event.team === ours()) award('striker');
  });
  bus.on('mode:wave_cleared', () => {
    if (!battle || !battle.alive) return;
    battle.waves++;
    if (battle.waves >= WAVE_BREAKER_WAVES) award('wave_breaker');
  });
  // A vehicle back from the dead starts a new life: it is undamaged again and no earlier round is its killing shot.
  bus.on('mode:respawn', (payload) => {
    const id = text(recordOf(payload)?.id);
    if (!battle || !id) return;
    if (id === me()) battle.alive = true;
    battle.damaged.delete(id);
    battle.killShots.delete(id);
  });

  bus.on('battle:ended', (payload) => {
    const event = recordOf(payload) ?? {};
    const tracker = battle;
    if (!tracker) return;
    if (event.reason === 'network_disconnect') { battle = null; return; }
    settleShots(ctx.clockS(), true);
    const result = resultOf(event.result);
    const player = me();
    const roster = (Array.isArray(event.roster) ? event.roster : []).map(recordOf)
      .filter((row): row is Record<string, RuntimeValue> => row != null);
    const ownRow = roster.find((row) => row.isPlayer === true || (player != null && row.id === player));
    // A spectator saw the battle but fought nothing: no record, no medals.
    if (!player || (roster.length > 0 && !ownRow)) { battle = null; return; }
    const alive = ownRow ? ownRow.alive !== false : tracker.alive;
    const durationS = finite(event.durationS) || Math.max(0, (Date.now() - tracker.startedAt) / 1000);
    const won = result === 'victory';

    let topDamage = 0;
    for (const [id, damage] of tracker.damageBy) if (id !== player) topDamage = Math.max(topDamage, damage);
    const maxHp = ctx.playerMaxHp() || 1000;
    if (tracker.damage > topDamage && tracker.damage >= maxHp) award('high_caliber', false);
    if (tracker.aimedShots >= SHARPSHOOTER_SHOTS && tracker.aimedHits / tracker.aimedShots >= SHARPSHOOTER_RATIO) award('sharpshooter', false);
    const hp = ctx.playerHpFraction() ?? tracker.lastHpFraction;
    // Untouched means no enemy round's damage and full health at the end (a ram or a fall leaves its mark there).
    if (won && alive && tracker.damageTaken === 0 && hp >= 0.999 && tracker.kills >= 1) award('untouchable', false);
    if (won && alive && hp > 0 && hp <= CLOSE_CALL_HP) award('close_call', false);
    if (won && alive && tracker.shots === 0 && durationS >= ZERO_SHOT_MIN_S && ctx.playerAerialKind() !== 'drone') award('zero_shot', false);
    const myTeam = ownRow && typeof ownRow.team === 'string' ? ownRow.team : ctx.playerTeam();
    const allies = roster.filter((row) => row !== ownRow && myTeam != null && row.team === myTeam);
    if (won && alive && !ctx.respawns() && allies.length >= 1 && allies.every((row) => row.alive === false)) award('last_stand', false);
    battle = null;

    const store = loadStore();
    const now = Date.now();
    const stats = store.stats;
    stats.battles++;
    if (won) stats.victories++;
    if (alive) stats.survived++;
    stats.kills += tracker.kills;
    stats.damage += Math.round(tracker.damage);
    stats.shots += tracker.shots;
    stats.hits += tracker.hits;
    stats.spots += tracker.spotted.size;
    stats.blocked += tracker.blocked;
    stats.longestKillM = Math.max(stats.longestKillM, Math.round(tracker.longestKillM));
    stats.bestChain = Math.max(stats.bestChain, tracker.bestChain);
    stats.bestStreak = Math.max(stats.bestStreak, tracker.bestStreak);
    stats.bestKills = Math.max(stats.bestKills, tracker.kills);
    const medals = MEDALS.filter((def) => tracker.medals.has(def.id)).map((def) => def.id);
    for (const id of medals) {
      const tally = store.medals[id];
      if (tally) { tally.count++; tally.last = now; } else { store.medals[id] = { count: 1, first: now, last: now }; pushUnseen(store, `medal:${id}`); }
    }
    const mode = text(event.gameMode) || ctx.gameMode() || 'standard';
    const mapId = text(event.mapId) || tracker.mapId;
    addUnique(store.maps, mapId, 256);
    addUnique(store.vehicles, tracker.vehicleId, 512);
    addUnique(store.nations, ctx.playerNation(), 64);
    addUnique(store.modes, mode, 32);
    const achievements = evaluateAchievements(store, now);
    store.history.unshift({
      at: now, result, mode, mapId, vehicleId: tracker.vehicleId,
      kills: tracker.kills, damage: Math.round(tracker.damage), durationS: Math.round(durationS), survived: alive,
      shots: tracker.aimedShots, hits: tracker.aimedHits, bestChain: tracker.bestChain,
      medals, achievements, trace: tracker.trace,
    });
    store.history.length = Math.min(store.history.length, HISTORY_LIMIT);
    saveStore();
    lastAwards = { medals, achievements, bestChain: tracker.bestChain };
    bus.emit('service:battleAwards', clone(lastAwards));
  });
}
