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

/** The parts of a key event the typing test reads (a DOM KeyboardEvent, or any event a shared listener takes). */
interface TypingKeyEvent {
  readonly key?: string;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly target?: EventTarget | EditingControlTarget | null;
  composedPath?(): ReadonlyArray<EventTarget | EditingControlTarget>;
}

/**
 * The one test every global key listener (window, document, the game's input layer) runs before it acts: true when
 * the key is someone's typing, so a shortcut leaves it to the field. That is a key inside an IME composition, or any
 * key but Escape whose target (the innermost node of its composed path, so a field in a shadow root counts) is a text
 * input, a text area, a select or editable content. Escape is never typed text: it still blurs a field, clears it or
 * closes the surface over it. Kevin, 276 (typing-keys-277): a space typed into the Garage's search was the handbrake.
 * tools/typing-keys-census.selftest.mjs holds every global key listener to this test.
 */
export function isTypingTarget(event: TypingKeyEvent | Event | null | undefined): boolean {
  const key = event as TypingKeyEvent | null | undefined;
  if (!key || typeof key.key !== 'string') return false; // a pointer or touch a shared listener also takes
  if (key.isComposing || key.keyCode === 229) return true;
  if (key.key === 'Escape') return false;
  const target = (key.composedPath?.()[0] ?? key.target) as EditingControlTarget | null | undefined;
  return isEditingControl(target) || target?.tagName === 'SELECT';
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
