/** A presentation veil: never changes HUD mode, simulation, or shot history. */
export function installBattleUiVisibility(options: {
  hidden(): boolean;
  setHidden(hidden: boolean): void;
  shortcutsBlocked(): boolean;
}) {
  let battle = false;
  const refresh = (): void => {
    document.body.classList.toggle('cot-battle-ui-hidden', battle && options.hidden());
  };
  const restore = (): void => { options.setHidden(false); refresh(); };
  const key = (event: KeyboardEvent): void => {
    if (!battle || options.shortcutsBlocked() || event.code !== 'F10' || event.repeat
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"]')) return;
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
