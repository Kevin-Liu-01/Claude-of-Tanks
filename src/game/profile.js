// Durable local battle history. This deliberately records outcomes instead of
// inventing a wallet: Claude of Tanks has no research tree or purchasable
// vehicles, so credits and XP would communicate progression that does not
// exist. Ranked rating will be server-owned when the ranked service ships.

const PROFILE_KEY = 'cot.profile.v2';
const PROFILE_VERSION = 2;
const installedBuses = new WeakSet();

let cachedProfile = null;
let lastBattle = null;

function finiteInt(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function resultOf(value) {
  return value === 'victory' || value === 'draw' ? value : 'defeat';
}

function blankProfile() {
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

function sanitizeBattle(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    result: resultOf(value.result),
    kills: finiteInt(value.kills),
    damage: finiteInt(value.damage),
    vehicleId: typeof value.vehicleId === 'string' ? value.vehicleId : '',
    mapId: typeof value.mapId === 'string' ? value.mapId : '',
    durationS: finiteInt(value.durationS),
    completedAt: Number.isFinite(value.completedAt) ? value.completedAt : 0,
  };
}

function sanitizeProfile(value) {
  if (!value || typeof value !== 'object') return blankProfile();
  return {
    version: PROFILE_VERSION,
    matches: finiteInt(value.matches),
    wins: finiteInt(value.wins),
    losses: finiteInt(value.losses),
    draws: finiteInt(value.draws),
    kills: finiteInt(value.kills),
    damage: finiteInt(value.damage),
    bestDamage: finiteInt(value.bestDamage),
    lastBattle: sanitizeBattle(value.lastBattle),
  };
}

function loadProfile() {
  if (cachedProfile) return cachedProfile;
  cachedProfile = blankProfile();
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    cachedProfile = sanitizeProfile(saved);
  } catch (_) { /* storage unavailable or corrupt: use a session profile */ }
  lastBattle = cachedProfile.lastBattle;
  return cachedProfile;
}

function saveProfile() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(cachedProfile)); } catch (_) { /* session-only */ }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** A copy of the player's real local battle record. */
export function getPlayerRecord() {
  return clone(loadProfile());
}

/** A copy of the latest completed battle, including across page reloads. */
export function getLastBattleRecord() {
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
} = {}) {
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
export function installBattleRecords(bus) {
  if (!bus || typeof bus.on !== 'function' || installedBuses.has(bus)) return;
  installedBuses.add(bus);

  let tally = null;
  bus.on('ui:battleStart', (event = {}) => {
    tally = {
      playerId: event.playerId || event.entityId || event.specId || '',
      vehicleId: event.specId || event.vehicleId || '',
      mapId: event.mapId || '',
      kills: 0,
      damage: 0,
      startedAt: Date.now(),
    };
  });
  bus.on('shell:hit', (event = {}) => {
    if (tally && event.attackerId === tally.playerId
        && event.targetId && event.targetId !== tally.playerId) {
      tally.damage += Number.isFinite(event.damage) ? Math.max(0, event.damage) : 0;
    }
  });
  bus.on('tank:destroyed', (event = {}) => {
    if (tally && event.killerId === tally.playerId && event.id !== tally.playerId) tally.kills += 1;
  });
  bus.on('battle:ended', (event = {}) => {
    if (!tally) return;
    recordBattleResult({
      result: event.result,
      kills: tally.kills,
      damage: tally.damage,
      vehicleId: tally.vehicleId,
      mapId: event.mapId || tally.mapId,
      durationS: Number.isFinite(event.durationS)
        ? event.durationS : Math.max(0, (Date.now() - tally.startedAt) / 1000),
    });
    tally = null;
  });
}
