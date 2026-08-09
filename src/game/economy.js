// Battle rewards live independently of the removed research-tree UI. Keeping
// this service on the game bus preserves the results-screen payout and the
// player's existing persisted wallet without loading any research-screen code.

const ECON_KEY = 'cot_progress_v1';
const SEED_XP = 900;
const SEED_CREDITS = 20000;

let progress = null;
let lastEarnings = null;
const installedBuses = new WeakSet();

function loadProgress() {
  if (progress) return progress;
  progress = { xp: SEED_XP, credits: SEED_CREDITS, researched: {}, modules: {} };
  try {
    const raw = localStorage.getItem(ECON_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved.xp === 'number') {
        progress = {
          xp: saved.xp,
          credits: typeof saved.credits === 'number' ? saved.credits : 0,
          // Preserve old saves even though research is no longer exposed.
          researched: saved.researched && typeof saved.researched === 'object'
            ? saved.researched : {},
          modules: saved.modules && typeof saved.modules === 'object' ? saved.modules : {},
        };
      }
    }
  } catch (_) { /* storage unavailable: keep a session-only wallet */ }
  return progress;
}

function saveProgress() {
  try { localStorage.setItem(ECON_KEY, JSON.stringify(progress)); } catch (_) { /* session-only */ }
}

/** Payout of the most recent battle this session (null before the first). */
export function getLastBattleEarnings() { return lastEarnings; }

/** Award and persist one battle result. */
export function recordBattleResult({ result, kills = 0, damage = 0 } = {}) {
  const wallet = loadProgress();
  const mult = result === 'victory' ? 1 : result === 'draw' ? 0.6 : 0.4;
  const xp = Math.round((260 + kills * 170 + damage * 0.24) * mult);
  const credits = Math.round((5400 + kills * 3600 + damage * 5.2) * mult);
  wallet.xp += xp;
  wallet.credits += credits;
  saveProgress();
  lastEarnings = { xp, credits, kills, damage: Math.round(damage), result };
  return lastEarnings;
}

/** Attach battle tallying to a game event bus once. */
export function installBattleEconomy(bus) {
  if (!bus || typeof bus.on !== 'function' || installedBuses.has(bus)) return;
  installedBuses.add(bus);

  let tally = null;
  bus.on('ui:battleStart', (ev) => {
    tally = { playerId: ev && ev.specId, kills: 0, damage: 0 };
  });
  bus.on('shell:hit', (ev) => {
    if (tally && ev && ev.attackerId === tally.playerId
        && ev.targetId && ev.targetId !== tally.playerId) {
      tally.damage += ev.damage || 0;
    }
  });
  bus.on('tank:destroyed', (ev) => {
    if (tally && ev && ev.killerId === tally.playerId && ev.id !== tally.playerId) {
      tally.kills += 1;
    }
  });
  bus.on('battle:ended', (ev) => {
    if (!tally) return;
    recordBattleResult({
      result: (ev && ev.result) || 'defeat',
      kills: tally.kills,
      damage: tally.damage,
    });
    tally = null;
  });
}
