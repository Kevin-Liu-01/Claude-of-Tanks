/** Presentation only: authority owns the countdown and permission to drive/fire. */
import { t } from './i18n.ts';

export function createPreBattleOverlay(root: HTMLElement, kicker: HTMLElement, numeral: HTMLElement) {
  let waiting = false;
  let shownSecond = -1;
  let alternateTick = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelHide = () => {
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
  };
  const animateTick = () => {
    // Different names restart equivalent CSS motion without a layout flush.
    // Keep alternating across resets too, including same-frame rematches.
    alternateTick = !alternateTick;
    numeral.classList.remove('tick', 'tick-alt');
    numeral.classList.add(alternateTick ? 'tick' : 'tick-alt');
  };
  const reset = () => {
    cancelHide();
    waiting = false;
    shownSecond = -1;
    root.classList.remove('on', 'rollout', 'waiting');
    numeral.classList.remove('tick', 'tick-alt', 'go');
    kicker.textContent = t('hud.battleBeginsIn');
    numeral.textContent = '';
  };
  return {
    reset,
    setWaiting(value: boolean) {
      if (waiting === value) return;
      waiting = value;
      cancelHide();
      shownSecond = -1;
      root.classList.remove('rollout');
      root.classList.toggle('waiting', value);
      numeral.classList.remove('go', 'tick', 'tick-alt');
      kicker.textContent = value ? t('hud.waitingForCommanders') : t('hud.battleBeginsIn');
      numeral.textContent = value ? t('playMenu.ready.iAmReady') : '';
      root.classList.toggle('on', value);
    },
    countdown(secondsLeft: number) {
      // Loading snapshots retain five seconds, but that clock is not running.
      if (waiting || !Number.isFinite(secondsLeft)) return;
      if (secondsLeft > 0) {
        const second = Math.ceil(secondsLeft);
        if (second === shownSecond) return;
        cancelHide();
        root.classList.remove('rollout');
        root.classList.add('on');
        shownSecond = second;
        numeral.classList.remove('go');
        numeral.textContent = String(second);
        animateTick();
      } else if (shownSecond !== 0) {
        shownSecond = 0;
        root.classList.add('rollout');
        numeral.textContent = t('hud.rollout');
        numeral.classList.add('go');
        animateTick();
        cancelHide();
        hideTimer = setTimeout(() => {
          root.classList.remove('on');
          hideTimer = null;
        }, 1100);
      }
    },
  };
}
