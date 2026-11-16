/**
 * armourOverlayDefault.ts — armour colours on for everyone, once, with a one-time tip (273). Copyright © 2026 Kevin B. Liu.
 *
 * Kevin, 2026-11-12: "turn it on once for everyone with a one time tip". The armour colours (game/armorAimOverlay.ts: the
 * target's plates in the sight painted by what the loaded round does to them) were opt-in. From 273 they are on by
 * default (input.ts DEFAULT_SETTINGS), and every profile saved before is turned on once: a stored settings record holds
 * the whole settings object (input.ts setSetting saves it all), so a stored `false` cannot tell "never changed" from
 * "turned off", and the owner's ruling is one flip for everyone. The flip is recorded under its own key, apart from the
 * settings record, so it runs once whatever is saved after it: a player who turns the colours off from then on keeps them
 * off. The settings revision is not bumped for it (a bump would also drop every stored perf-meter choice, input.ts).
 *
 * The marker's values: absent (the flip has not run), 'tip' (it ran; the tip is still to show), 'done' (the tip showed,
 * or there was nothing to tell: the colours were off again before the next battle).
 */

export const ARMOUR_DEFAULT_KEY = 'cot.armourOverlayDefault.v1';

export type ArmourDefaultMarker = 'tip' | 'done';

type MarkerStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageOf(storage?: MarkerStorage | null): MarkerStorage | null {
  if (storage !== undefined) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The stored marker, or null when the flip has not run (or the browser refuses storage). */
export function readArmourDefaultMarker(storage?: MarkerStorage | null): ArmourDefaultMarker | null {
  try {
    const value = storageOf(storage)?.getItem(ARMOUR_DEFAULT_KEY);
    return value === 'tip' || value === 'done' ? value : null;
  } catch { return null; }
}

export function writeArmourDefaultMarker(marker: ArmourDefaultMarker, storage?: MarkerStorage | null): void {
  try { storageOf(storage)?.setItem(ARMOUR_DEFAULT_KEY, marker); } catch { /* the flip runs again next load: harmless */ }
}

/**
 * The flip at a settings load (input.ts, after the stored record is applied): whether the colours are to be turned on and
 * the settings record saved, and the marker to write. A profile that already ran it changes nothing; a new one (no stored
 * record) is on by the default and only gets its tip; an old one is turned on if it was off.
 */
export function armourDefaultFlip(
  marker: ArmourDefaultMarker | null,
  hasStoredSettings: boolean,
  overlayOn: boolean,
): { readonly turnOn: boolean; readonly saveSettings: boolean; readonly marker: ArmourDefaultMarker | null } {
  if (marker !== null) return { turnOn: false, saveSettings: false, marker: null };
  const turnOn = !overlayOn;
  return { turnOn, saveSettings: turnOn && hasStoredSettings, marker: 'tip' };
}

/** The tip's one showing: due at a battle's rollout while the marker says 'tip' and the colours are on. */
export function armourTipDue(marker: ArmourDefaultMarker | null, overlayOn: boolean): 'show' | 'skip' | 'none' {
  if (marker !== 'tip') return 'none';
  return overlayOn ? 'show' : 'skip';
}
