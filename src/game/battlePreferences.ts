export const ALLOW_NIGHT_STORAGE_KEY = 'cot.battle.allowNight.v1';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Solo presentation choices. Network matches always use the shared match seed.
 * Keep a session fallback when browser storage is unavailable or full.
 */
export function createBattlePreferences(
  getStorage: () => PreferenceStorage | undefined = () => globalThis.localStorage,
) {
  let sessionAllowNight: boolean | undefined;
  return {
    get allowNight(): boolean {
      if (sessionAllowNight !== undefined) return sessionAllowNight;
      try { return getStorage()?.getItem(ALLOW_NIGHT_STORAGE_KEY) !== 'false'; }
      catch { return true; }
    },
    setAllowNight(allow: boolean): void {
      sessionAllowNight = allow;
      try { getStorage()?.setItem(ALLOW_NIGHT_STORAGE_KEY, String(allow)); }
      catch { /* The session choice still applies to the next battle. */ }
    },
  };
}

export const battlePreferences = createBattlePreferences();
