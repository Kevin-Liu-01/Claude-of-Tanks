import type { RuntimeValue } from '../runtimeTypes.ts';
import { hullPointsRemoved } from './hullPointsRemoved.ts';
import { battleKeepsRecords } from '../sim/matchRuleset.ts';
// Durable local battle history. This deliberately records outcomes instead of
// inventing a wallet: Claude of Tanks has no research tree or purchasable
// vehicles, so credits and XP would communicate progression that does not
// exist. Ranked rating is owned by the dedicated service, never local saves.

const PROFILE_KEY = 'cot.profile.v2';
const PROFILE_VERSION = 2;

export type BattleResult = 'victory' | 'draw' | 'defeat';

export interface BattleRecord {
  result: BattleResult;
  kills: number;
  damage: number;
  vehicleId: string;
  /** (ac130-fx-228 r3) the player flew the AC-130 that battle: the last-battle card names the aircraft */
  aircraft?: boolean;
  mapId: string;
  /** The battle's mode (sim/matchModes.ts id), for "Again: <mode · map>"; absent on records saved before it. */
  gameMode?: string;
  durationS: number;
  completedAt: number;
}

interface PlayerRecord {
  version: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  damage: number;
  bestDamage: number;
  lastBattle: BattleRecord | null;
  /** The latest completed battles, newest first (the Deploy screen's recent battles), at most RECENT_BATTLES. */
  recentBattles: BattleRecord[];
}

/** How many completed battles the profile keeps for the Deploy screen. */
const RECENT_BATTLES = 3;

interface BattleResultInput {
  result?: RuntimeValue;
  kills?: RuntimeValue;
  damage?: RuntimeValue;
  vehicleId?: RuntimeValue;
  aircraft?: RuntimeValue;
  mapId?: RuntimeValue;
  gameMode?: RuntimeValue;
  durationS?: RuntimeValue;
  completedAt?: RuntimeValue;
}

interface ProfileEventBus {
  on(event: string, listener: (payload?: RuntimeValue) => void): RuntimeValue;
}

interface BattleTally {
  playerId: string;
  vehicleId: string;
  mapId: string;
  kills: number;
  damage: number;
  startedAt: number;
}

const installedBuses = new WeakSet<ProfileEventBus>();

let cachedProfile: PlayerRecord | null = null;
let lastBattle: BattleRecord | null = null;

function finiteInt(value: RuntimeValue, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback;
}

function firstString(...values: RuntimeValue[]): string {
  return values.find((value): value is string => typeof value === 'string') ?? '';
}

function resultOf(value: RuntimeValue): BattleResult {
  return value === 'victory' || value === 'draw' ? value : 'defeat';
}

function recordOf(value: RuntimeValue): Record<string, RuntimeValue> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, RuntimeValue>
    : null;
}

function blankProfile(): PlayerRecord {
  return {
    version: PROFILE_VERSION,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    kills: 0,
    damage: 0,
    bestDamage: 0,
    lastBattle: null,
    recentBattles: [],
  };
}

function sanitizeBattle(value: RuntimeValue): BattleRecord | null {
  const source = recordOf(value);
  if (!source) return null;
  return {
    result: resultOf(source.result),
    kills: finiteInt(source.kills),
    damage: finiteInt(source.damage),
    vehicleId: typeof source.vehicleId === 'string' ? source.vehicleId : '',
    ...(source.aircraft === true ? { aircraft: true } : {}),
    mapId: typeof source.mapId === 'string' ? source.mapId : '',
    ...(typeof source.gameMode === 'string' && source.gameMode ? { gameMode: source.gameMode } : {}),
    durationS: finiteInt(source.durationS),
    completedAt: Number.isFinite(source.completedAt) ? Number(source.completedAt) : 0,
  };
}

function sanitizeProfile(value: RuntimeValue): PlayerRecord {
  const source = recordOf(value);
  if (!source) return blankProfile();
  return {
    version: PROFILE_VERSION,
    matches: finiteInt(source.matches),
    wins: finiteInt(source.wins),
    losses: finiteInt(source.losses),
    draws: finiteInt(source.draws),
    kills: finiteInt(source.kills),
    damage: finiteInt(source.damage),
    bestDamage: finiteInt(source.bestDamage),
    lastBattle: sanitizeBattle(source.lastBattle),
    recentBattles: recentOf(source.recentBattles, source.lastBattle),
  };
}

/** The stored recent battles, or the last battle alone for a profile saved before the list existed. */
function recentOf(value: RuntimeValue, last: RuntimeValue): BattleRecord[] {
  const list = Array.isArray(value) ? value : [last];
  return list.map(sanitizeBattle).filter((battle): battle is BattleRecord => battle !== null).slice(0, RECENT_BATTLES);
}

function loadProfile(): PlayerRecord {
  if (cachedProfile) return cachedProfile;
  cachedProfile = blankProfile();
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    cachedProfile = sanitizeProfile(saved);
  } catch (_) { /* storage unavailable or corrupt: use a session profile */ }
  lastBattle = cachedProfile.lastBattle;
  return cachedProfile;
}

function saveProfile(): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(cachedProfile)); } catch (_) { /* session-only */ }
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

/** Lifetime completed matches provide the battle ordinal base, not randomness.
 * App entry injects an independent roster seed so reloads also get fresh draws. */
export function battleOrdinalBase(): number {
  return loadProfile().matches;
}

/** A copy of the player's real local battle record. */
export function getPlayerRecord(): PlayerRecord {
  return clone(loadProfile());
}

/** A copy of the latest completed battle, including across page reloads. */
export function getLastBattleRecord(): BattleRecord | null {
  loadProfile();
  return clone(lastBattle);
}

/** Copies of the latest completed battles, newest first, including across page reloads. */
export function getRecentBattles(): BattleRecord[] {
  return clone(loadProfile().recentBattles);
}

/** Persist one completed battle without awarding fictional currencies. */
export function recordBattleResult({
  result,
  kills = 0,
  damage = 0,
  vehicleId = '',
  aircraft = false,
  mapId = '',
  gameMode = '',
  durationS = 0,
  completedAt = Date.now(),
}: BattleResultInput = {}): BattleRecord {
  const profile = loadProfile();
  const battle = sanitizeBattle({
    result,
    kills,
    damage,
    vehicleId,
    aircraft,
    mapId,
    gameMode,
    durationS,
    completedAt,
  });
  if (!battle) throw new TypeError('battle result must be an object');
  profile.matches += 1;
  if (battle.result === 'victory') profile.wins += 1;
  else if (battle.result === 'draw') profile.draws += 1;
  else profile.losses += 1;
  profile.kills += battle.kills;
  profile.damage += battle.damage;
  profile.bestDamage = Math.max(profile.bestDamage, battle.damage);
  profile.lastBattle = battle;
  profile.recentBattles = [battle, ...profile.recentBattles].slice(0, RECENT_BATTLES);
  lastBattle = battle;
  saveProfile();
  return clone(battle);
}

/** Attach local result tallying to a game event bus exactly once. */
export function installBattleRecords(bus: ProfileEventBus | null | undefined): void {
  if (!bus || typeof bus.on !== 'function' || installedBuses.has(bus)) return;
  installedBuses.add(bus);

  let tally: BattleTally | null = null;
  bus.on('ui:battleStart', (payload) => {
    const event = recordOf(payload) ?? {};
    tally = {
      playerId: firstString(event.playerId, event.entityId, event.specId),
      vehicleId: firstString(event.specId, event.vehicleId),
      mapId: firstString(event.mapId),
      kills: 0,
      damage: 0,
      startedAt: Date.now(),
    };
  });
  bus.on('shell:hit', (payload) => {
    const event = recordOf(payload) ?? {};
    if (tally && event.attackerId === tally.playerId
        && event.targetId && event.targetId !== tally.playerId) {
      tally.damage += hullPointsRemoved({ hpRemoved: typeof event.hpRemoved === 'number' ? event.hpRemoved : undefined,
        damage: typeof event.damage === 'number' ? event.damage : undefined });
    }
  });
  bus.on('tank:destroyed', (payload) => {
    const event = recordOf(payload) ?? {};
    if (tally && event.killerId === tally.playerId && event.id !== tally.playerId) tally.kills += 1;
  });
  bus.on('battle:ended', (payload) => {
    const event = recordOf(payload) ?? {};
    if (!tally) return;
    // a practice mode keeps no record (sim/matchRuleset.ts records): the proving ground never reaches the tally, nor a
    // watched battle (battleKeepsRecords)
    if (event.reason === 'network_disconnect' || !battleKeepsRecords(event)) {
      tally = null;
      return;
    }
    // (ac130-fx-228 r3) the end roster's own row says the player flew the AC-130 (its card names the aircraft)
    const roster = Array.isArray(event.roster) ? event.roster.map(recordOf) : [];
    const own = roster.find((row) => row != null && (row.isPlayer === true || (tally?.playerId != null && row.id === tally.playerId)));
    recordBattleResult({
      result: event.result,
      kills: tally.kills,
      damage: tally.damage,
      vehicleId: tally.vehicleId,
      aircraft: own?.aircraft === true,
      mapId: event.mapId || tally.mapId,
      gameMode: typeof event.gameMode === 'string' ? event.gameMode : '',
      durationS: Number.isFinite(event.durationS)
        ? Number(event.durationS) : Math.max(0, (Date.now() - tally.startedAt) / 1000),
    });
    tally = null;
  });
}
