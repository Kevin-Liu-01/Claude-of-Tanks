/** True when a focused DOM node owns typed keyboard input. */
export function isEditingControl(target) {
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' || target.isContentEditable);
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
} = {}) {
  return !pointerLocked && !settingsOpen && battleActive && !replayActive &&
    !isEditingControl(activeElement);
}
