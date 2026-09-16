// Team arrangement (owner 2026-09-15: "for frontline and endless horde there needs to be custom
// team arrangement settings"). The player arranges both sides of a co-op sortie — allied bots, the
// enemy pool, the first Horde wave and the enemy nation — once per mode; the setting persists in
// localStorage and setupBattle / the loading plan / the room handoff read it through here. The
// clamping law lives in sim/matchRuleset.ts so the sim, the cards and the wire agree.
import type { GameModeId } from '../sim/matchModes.ts';
import {
  acceptsTeamArrangement, normalizeTeamArrangement, type TeamArrangement,
} from '../sim/matchRuleset.ts';

export const TEAM_ARRANGEMENT_STORAGE_KEY = 'cot.game.teams.v1';

export interface EnemyNationOption {
  /** Setting id (also the `campaign.enemy.<id>` copy key). */
  readonly id: string;
  /** Spec `nation` strings the fleet uses for this nation. */
  readonly specNations: readonly string[];
}

/** Every nation the fleet can field as a same-nation force. */
export const ENEMY_NATION_OPTIONS: readonly EnemyNationOption[] = Object.freeze([
  Object.freeze({ id: 'russia', specNations: Object.freeze(['Russia', 'USSR', 'USSR/Russia', 'RU']) }),
  Object.freeze({ id: 'germany', specNations: Object.freeze(['Germany']) }),
  Object.freeze({ id: 'usa', specNations: Object.freeze(['USA', 'US']) }),
  Object.freeze({ id: 'uk', specNations: Object.freeze(['UK']) }),
  Object.freeze({ id: 'france', specNations: Object.freeze(['France']) }),
  Object.freeze({ id: 'china', specNations: Object.freeze(['China']) }),
  Object.freeze({ id: 'japan', specNations: Object.freeze(['Japan']) }),
  Object.freeze({ id: 'sweden', specNations: Object.freeze(['Sweden']) }),
  Object.freeze({ id: 'israel', specNations: Object.freeze(['Israel']) }),
  Object.freeze({ id: 'poland', specNations: Object.freeze(['Poland']) }),
  Object.freeze({ id: 'italy', specNations: Object.freeze(['Italy']) }),
  Object.freeze({ id: 'south_korea', specNations: Object.freeze(['South Korea']) }),
  Object.freeze({ id: 'ukraine', specNations: Object.freeze(['Ukraine']) }),
]);

export function isEnemyNationId(id: string | null | undefined): boolean {
  return !!id && ENEMY_NATION_OPTIONS.some((option) => option.id === id);
}

/** Spec nations for a nation setting ([] for a mixed force or an unknown id). */
export function enemyNationSpecNations(id: string | null | undefined): readonly string[] {
  return ENEMY_NATION_OPTIONS.find((option) => option.id === id)?.specNations ?? [];
}

interface ArrangementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOf(storage?: ArrangementStorage | null): ArrangementStorage | null {
  if (storage) return storage;
  try { return (globalThis as { localStorage?: ArrangementStorage }).localStorage ?? null; } catch { return null; }
}

function readAll(storage: ArrangementStorage | null): Record<string, TeamArrangement> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(TEAM_ARRANGEMENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, TeamArrangement> : {};
  } catch { return {}; }
}

/** The player's arrangement for a mode (clamped), or null when none is stored or the mode takes none. */
export function readTeamArrangement(mode: GameModeId, storage?: ArrangementStorage | null): TeamArrangement | null {
  if (!acceptsTeamArrangement(mode)) return null;
  const stored = readAll(storageOf(storage))[mode];
  return normalizeTeamArrangement(mode, stored ?? null);
}

/** Persist (clamped) or clear a mode's arrangement; returns what was stored. */
export function writeTeamArrangement(
  mode: GameModeId, arrangement: TeamArrangement | null, storage?: ArrangementStorage | null,
): TeamArrangement | null {
  const target = storageOf(storage);
  if (!target || !acceptsTeamArrangement(mode)) return null;
  const all = readAll(target);
  const next = normalizeTeamArrangement(mode, arrangement);
  if (next) all[mode] = next; else delete all[mode];
  try { target.setItem(TEAM_ARRANGEMENT_STORAGE_KEY, JSON.stringify(all)); } catch { /* storage full or blocked: the in-memory game keeps playing */ }
  return next;
}
