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
  mapId: string;
  durationS: number;
  completedAt: number;
}

export interface PlayerRecord {
  version: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  damage: number;
  bestDamage: number;
  lastBattle: BattleRecord | null;
}

export interface BattleResultInput {
  result?: unknown;
  kills?: unknown;
  damage?: unknown;
  vehicleId?: unknown;
  mapId?: unknown;
  durationS?: unknown;
  completedAt?: unknown;
}

interface ProfileEventBus {
  on(event: string, listener: (payload?: unknown) => void): unknown;
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

function finiteInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback;
}

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === 'string') ?? '';
}

function resultOf(value: unknown): BattleResult {
  return value === 'victory' || value === 'draw' ? value : 'defeat';
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
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
  };
}

function sanitizeBattle(value: unknown): BattleRecord | null {
  const source = recordOf(value);
  if (!source) return null;
  return {
    result: resultOf(source.result),
    kills: finiteInt(source.kills),
    damage: finiteInt(source.damage),
    vehicleId: typeof source.vehicleId === 'string' ? source.vehicleId : '',
    mapId: typeof source.mapId === 'string' ? source.mapId : '',
    durationS: finiteInt(source.durationS),
    completedAt: Number.isFinite(source.completedAt) ? Number(source.completedAt) : 0,
  };
}

function sanitizeProfile(value: unknown): PlayerRecord {
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
  };
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

/** A copy of the player's real local battle record. */
export function getPlayerRecord(): PlayerRecord {
  return clone(loadProfile());
}

/** A copy of the latest completed battle, including across page reloads. */
export function getLastBattleRecord(): BattleRecord | null {
  loadProfile();
  return clone(lastBattle);
}

/** Persist one completed battle without awarding fictional currencies. */
export function recordBattleResult({
  result,
  kills = 0,
  damage = 0,
  vehicleId = '',
  mapId = '',
  durationS = 0,
  completedAt = Date.now(),
}: BattleResultInput = {}): BattleRecord {
  const profile = loadProfile();
  const battle = sanitizeBattle({
    result,
    kills,
    damage,
    vehicleId,
    mapId,
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
      tally.damage += Number.isFinite(event.damage) ? Math.max(0, Number(event.damage)) : 0;
    }
  });
  bus.on('tank:destroyed', (payload) => {
    const event = recordOf(payload) ?? {};
    if (tally && event.killerId === tally.playerId && event.id !== tally.playerId) tally.kills += 1;
  });
  bus.on('battle:ended', (payload) => {
    const event = recordOf(payload) ?? {};
    if (!tally) return;
    if (event.reason === 'network_disconnect') {
      tally = null;
      return;
    }
    recordBattleResult({
      result: event.result,
      kills: tally.kills,
      damage: tally.damage,
      vehicleId: tally.vehicleId,
      mapId: event.mapId || tally.mapId,
      durationS: Number.isFinite(event.durationS)
        ? Number(event.durationS) : Math.max(0, (Date.now() - tally.startedAt) / 1000),
    });
    tally = null;
  });
}
