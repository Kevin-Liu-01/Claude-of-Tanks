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
  readonly replayActive?: boolean;
  readonly activeElement?: EditingControlTarget | null;
}

/** True when a focused DOM node owns typed keyboard input. */
export function isEditingControl(target: EditingControlTarget | null | undefined): boolean {
  return Boolean(target && ((target.tagName === 'INPUT' && TYPED_INPUTS.has((target.type ?? '').toLowerCase()))
    || target.tagName === 'TEXTAREA' || target.isContentEditable));
}

/**
 * Pointer lock normally disappears because the browser consumed Escape. Text
 * editors are the exception: chat deliberately unlocks while retaining focus.
 */
export function shouldOpenSettingsFromPointerUnlock({
  pointerLocked = false,
  settingsOpen = false,
  battleActive = false,
  replayActive = false,
  activeElement = null,
}: PointerUnlockContext = {}): boolean {
  return !pointerLocked && !settingsOpen && battleActive && !replayActive &&
    !isEditingControl(activeElement);
}
