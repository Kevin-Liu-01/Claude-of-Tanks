// How long a battle takes to load on this device: the Deploy button's "Loads in about 6 s". Copyright © 2026 Kevin B. Liu.
// The battle loading screen records each load from its first frame to the countdown; the estimate is the median of the
// last few, rounded up to whole seconds, and there is none before the first load.
const KEY = 'cot.battle.loadS.v1';
const KEEP = 5;
const MAX_S = 600;

function read(): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value)
      ? value.filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0 && s < MAX_S).slice(0, KEEP) : [];
  } catch (_) { return []; }
}

/** Keep one measured load (seconds). */
export function recordBattleLoad(seconds: number): void {
  if (!(seconds > 0 && seconds < MAX_S)) return;
  try { localStorage.setItem(KEY, JSON.stringify([Math.round(seconds * 10) / 10, ...read()].slice(0, KEEP))); } catch (_) { /* session-only */ }
}

/** The median of the last loads in whole seconds (at least 1), or null before the first. */
export function battleLoadEstimateS(): number | null {
  const loads = read().sort((a, b) => a - b);
  return loads.length ? Math.max(1, Math.ceil(loads[loads.length >> 1])) : null;
}
