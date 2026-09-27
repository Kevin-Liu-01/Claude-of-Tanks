import { BATTLE_TIMES, type BattleTimeOfDay } from '../engine/battleWeatherPolicy.ts';

const ALLOW_NIGHT_STORAGE_KEY = 'cot.battle.allowNight.v1';
export const BATTLE_TIMES_STORAGE_KEY = 'cot.battle.times.v2';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Solo presentation choices. Network matches use the shared match seed. */
export function createBattlePreferences(
  getStorage: () => PreferenceStorage | undefined = () => globalThis.localStorage,
) {
  let session: readonly BattleTimeOfDay[] | undefined;
  function read(): readonly BattleTimeOfDay[] {
    if (session) return session;
    try {
      const storage = getStorage();
      const raw = storage?.getItem(BATTLE_TIMES_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length && parsed.every(time => BATTLE_TIMES.includes(time))) {
          return Object.freeze(BATTLE_TIMES.filter(time => parsed.includes(time)));
        }
      }
      // Preserve an explicit day-only choice made using the old Night switch.
      if (storage?.getItem(ALLOW_NIGHT_STORAGE_KEY) === 'false') return Object.freeze(['day']);
    } catch { /* Blocked or corrupt storage uses the session/default choices. */ }
    return BATTLE_TIMES;
  }
  return {
    get times(): readonly BattleTimeOfDay[] { return read(); },
    setEnabled(time: BattleTimeOfDay, enabled: boolean): boolean {
      if (!BATTLE_TIMES.includes(time)) throw new RangeError('Unknown time of day');
      const next = BATTLE_TIMES.filter(value => value === time ? enabled : read().includes(value));
      if (!next.length) return false;
      session = Object.freeze(next);
      try { getStorage()?.setItem(BATTLE_TIMES_STORAGE_KEY, JSON.stringify(session)); }
      catch { /* The session choice still applies to the next battle. */ }
      return true;
    },
  };
}

export const battlePreferences = createBattlePreferences();
