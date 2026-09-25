// Team arrangement (owner 2026-09-15: "for frontline and endless horde there needs to be custom
// team arrangement settings"). The player arranges both sides of a co-op sortie — allied bots, the
// enemy pool, the first Horde wave and the enemy nation — once per mode; the setting persists in
// localStorage and setupBattle / the loading plan / the room handoff read it through here. The
// clamping law lives in sim/matchRuleset.ts so the sim, the cards and the wire agree.
import type { GameModeId } from '../sim/matchModes.ts';
import {
  acceptsTeamArrangement, isWaveMode, normalizeTeamArrangement, rulesetSides, type TeamArrangement,
  MARS_DEFAULT_RULES, isMarsCachesId, isMarsGravityId, type MarsCachesId, type MarsGravityId,
} from '../sim/matchRuleset.ts';
import { GAME_MODE_IDS } from '../sim/matchModes.ts';

export const TEAM_ARRANGEMENT_STORAGE_KEY = 'cot.game.teams.v1';

interface EnemyNationOption {
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

/** The symmetric modes share one sides setting (owner 2026-09-18: the Garage battle menu's 7v7 / 14v14 /
 * custom switch); the wave modes arrange allied bots and a pool in the play menu instead. */
export const SIDES_MODES: readonly GameModeId[] = Object.freeze(GAME_MODE_IDS.filter((mode) => !isWaveMode(mode)));

/** The stored sides of the symmetric modes (Standard's entry speaks for all of them): allied bots and hostiles. */
export function readSides(storage?: ArrangementStorage | null): { readonly allies: number; readonly enemies: number } {
  const stored = readTeamArrangement('standard', storage);
  return rulesetSides({ allies: stored?.allies ?? null, enemies: stored?.enemies ?? null });
}

/** Store one sides setting on every symmetric mode (each keeps its own enemy nation); null restores 7 v 7. */
export function writeSides(
  sides: { readonly allies: number; readonly enemies: number } | null,
  storage?: ArrangementStorage | null,
): { readonly allies: number; readonly enemies: number } {
  for (const mode of SIDES_MODES) {
    const current = readTeamArrangement(mode, storage);
    writeTeamArrangement(mode, {
      allies: sides?.allies ?? null, enemies: sides?.enemies ?? null, enemyNation: current?.enemyNation ?? null,
      // the Mars settings ride on the mars arrangement; a sides change must not drop them
      marsGravity: current?.marsGravity ?? null, marsCaches: current?.marsCaches ?? null,
    }, storage);
  }
  return readSides(storage);
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

/** Mars mode settings (owner 2026-09-18 "boosts and settings"): the gravity world and the boost-cache cadence. */
interface MarsSettings {
  readonly gravity: MarsGravityId;
  readonly caches: MarsCachesId;
}

/** The player's Mars settings (stored on the mars arrangement), the mode defaults when none are stored. */
export function readMarsSettings(storage?: ArrangementStorage | null): MarsSettings {
  const stored = readTeamArrangement('mars', storage);
  return Object.freeze({
    gravity: stored?.marsGravity ?? MARS_DEFAULT_RULES.gravity,
    caches: stored?.marsCaches ?? MARS_DEFAULT_RULES.caches,
  });
}

/** Store Mars settings (unknown ids keep the current choice; null clears both); returns what applies now. */
export function writeMarsSettings(
  settings: { readonly gravity?: unknown; readonly caches?: unknown } | null,
  storage?: ArrangementStorage | null,
): MarsSettings {
  const current = readTeamArrangement('mars', storage);
  const gravityInput = settings?.gravity, cachesInput = settings?.caches;
  const marsGravity = isMarsGravityId(gravityInput) ? gravityInput : settings === null ? null : current?.marsGravity ?? null;
  const marsCaches = isMarsCachesId(cachesInput) ? cachesInput : settings === null ? null : current?.marsCaches ?? null;
  writeTeamArrangement('mars', {
    allies: current?.allies ?? null, enemies: current?.enemies ?? null, enemyNation: current?.enemyNation ?? null,
    marsGravity, marsCaches,
  }, storage);
  return readMarsSettings(storage);
}

// ---------------------------------------------------------------------------
// Opponent brain (owner 2026-09-25: "enable playing with tanks controlled by jev … an option to play jev
// controlled models"). One solo setting for every mode with bots, campaign included: who commands the enemy
// bots, and whether the allied bots take the same commander. game/state.ts reads it at setupBattle and
// builds the Jev commander (game/jevCommander.ts) from it; rooms keep the classic brain for now.
// ---------------------------------------------------------------------------

export const BRAIN_STORAGE_KEY = 'cot.game.brain.v1';
export type BotBrainId = 'classic' | 'jev';

export interface BrainSettings {
  /** Who commands the enemy bots: the classic controller, or Jev (TypeSafe's System One model). */
  readonly opponent: BotBrainId;
  /** Jev commands the allied bots as well. */
  readonly allies: boolean;
}

export const DEFAULT_BRAIN_SETTINGS: BrainSettings = Object.freeze({ opponent: 'classic', allies: false });

export function isBotBrainId(value: unknown): value is BotBrainId {
  return value === 'classic' || value === 'jev';
}

function readBrainRaw(storage: ArrangementStorage | null): Record<string, unknown> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(BRAIN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

/** The player's brain setting (defaults when nothing is stored, the store is blocked or corrupt). */
export function readBrainSettings(storage?: ArrangementStorage | null): BrainSettings {
  const stored = readBrainRaw(storageOf(storage));
  const opponent = isBotBrainId(stored.opponent) ? stored.opponent : DEFAULT_BRAIN_SETTINGS.opponent;
  return Object.freeze({ opponent, allies: opponent === 'jev' && stored.allies === true });
}

/** Store the brain setting (unknown values keep the current choice; null restores the defaults); returns what applies. */
export function writeBrainSettings(
  next: { readonly opponent?: unknown; readonly allies?: unknown } | null,
  storage?: ArrangementStorage | null,
): BrainSettings {
  const target = storageOf(storage);
  if (!target) return DEFAULT_BRAIN_SETTINGS;
  const current = readBrainSettings(target);
  // the stored flag outlives a switch back to Classic (reads mask it), so the next Jev choice keeps the allies
  const storedAllies = readBrainRaw(target).allies === true;
  const opponent = next === null ? DEFAULT_BRAIN_SETTINGS.opponent : isBotBrainId(next.opponent) ? next.opponent : current.opponent;
  const allies = next === null ? DEFAULT_BRAIN_SETTINGS.allies : typeof next.allies === 'boolean' ? next.allies : storedAllies;
  try { target.setItem(BRAIN_STORAGE_KEY, JSON.stringify({ opponent, allies })); } catch { /* storage full or blocked: the in-memory game keeps playing */ }
  return readBrainSettings(target);
}
