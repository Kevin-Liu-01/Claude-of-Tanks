import { isTypingTarget } from './keyboardOwnership.ts';
/** A presentation veil: never changes HUD mode, simulation, or shot history. */
export function installBattleUiVisibility(options: {
  hidden(): boolean;
  setHidden(hidden: boolean): void;
  shortcutsBlocked(): boolean;
  /** The key that switches it: the input layer's `hideBattleUi` binding, either slot (F10 by default, rebindable in
   *  Settings › Controls since settings-unify-278). */
  isShortcut(code: string): boolean;
}) {
  let battle = false;
  const refresh = (): void => {
    document.body.classList.toggle('cot-battle-ui-hidden', battle && options.hidden());
  };
  const restore = (): void => { options.setHidden(false); refresh(); };
  const key = (event: KeyboardEvent): void => {
    if (!battle || options.shortcutsBlocked() || !options.isShortcut(event.code) || event.repeat
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (isTypingTarget(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.setHidden(!options.hidden());
    refresh();
  };
  const touch = (event: TouchEvent): void => {
    if (!battle || options.shortcutsBlocked() || !options.hidden() || event.touches.length !== 3) return;
    event.preventDefault();
    restore();
  };
  window.addEventListener('keydown', key, true);
  window.addEventListener('touchstart', touch, { passive: false });
  return {
    refresh,
    setBattle(active: boolean): void { battle = active; refresh(); },
    dispose(): void {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('touchstart', touch);
      document.body.classList.remove('cot-battle-ui-hidden');
    },
  };
}
