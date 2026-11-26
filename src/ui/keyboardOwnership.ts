interface EditingControlTarget {
  readonly tagName?: string;
  /** An INPUT's type: only the ones that take typed text own the keyboard. */
  readonly type?: string;
  readonly isContentEditable?: boolean;
}

/** The input types that take typed text (a range, a checkbox or a colour does not: a slider still focused after Settings
 *  closed took the next Esc for an edit and held the menu shut, INTERACTION-REDESIGN C). */
const TYPED_INPUTS = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

interface PointerUnlockContext {
  readonly pointerLocked?: boolean;
  readonly settingsOpen?: boolean;
  readonly battleActive?: boolean;
  /** Who owns the free pointer (input.pointerUnlockOwner): a mode's claim or the owner whose release freed it. */
  readonly unlockOwner?: string | null;
}

/** True when a focused DOM node owns typed keyboard input. */
export function isEditingControl(target: EditingControlTarget | null | undefined): boolean {
  return Boolean(target && ((target.tagName === 'INPUT' && TYPED_INPUTS.has((target.type ?? '').toLowerCase()))
    || target.tagName === 'TEXTAREA' || target.isContentEditable));
}

/**
 * Pointer lock normally disappears because the browser consumed Escape: that unclaimed unlock, in a battle, opens
 * Settings. Every unlock something meant is claimed by its owner (input.releaseLock(owner), input.claimPointerUnlock:
 * photo mode, a kill-cam replay or ending beat, a focused text editor such as chat), so no mode is listed here
 * (settings-unify-278 fix-back: photo mode, missing from the old list of exceptions, opened Settings under its bar).
 */
export function shouldOpenSettingsFromPointerUnlock({
  pointerLocked = false,
  settingsOpen = false,
  battleActive = false,
  unlockOwner = null,
}: PointerUnlockContext = {}): boolean {
  return !pointerLocked && !settingsOpen && battleActive && unlockOwner === null;
}
