export interface EditingControlTarget {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

export interface PointerUnlockContext {
  readonly pointerLocked?: boolean;
  readonly settingsOpen?: boolean;
  readonly battleActive?: boolean;
  readonly replayActive?: boolean;
  readonly activeElement?: EditingControlTarget | null;
}

/** True when a focused DOM node owns typed keyboard input. */
export function isEditingControl(target: EditingControlTarget | null | undefined): boolean {
  return Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' || target.isContentEditable));
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
