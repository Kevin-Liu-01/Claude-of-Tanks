/** Presentation only: authority owns the countdown and permission to drive/fire. */
import { t } from './i18n.ts';

export function createPreBattleOverlay(root: HTMLElement, kicker: HTMLElement, numeral: HTMLElement) {
  let waiting = false;
  let shownSecond = -1;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelHide = () => {
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
  };
  const reset = () => {
    cancelHide();
    waiting = false;
    shownSecond = -1;
    root.classList.remove('on', 'rollout', 'waiting');
    numeral.classList.remove('tick', 'go');
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
      numeral.classList.remove('go', 'tick');
      kicker.textContent = value ? t('hud.waitingForCommanders') : t('hud.battleBeginsIn');
      numeral.textContent = value ? t('playMenu.ready.iAmReady') : '';
      root.classList.toggle('on', value);
    },
    countdown(secondsLeft: number) {
      // Loading snapshots retain five seconds, but that clock is not running.
      if (waiting || !Number.isFinite(secondsLeft)) return;
      if (secondsLeft > 0) {
        const second = Math.ceil(secondsLeft);
        cancelHide();
        root.classList.remove('rollout');
        root.classList.add('on');
        if (second === shownSecond) return;
        shownSecond = second;
        numeral.classList.remove('go', 'tick');
        numeral.textContent = String(second);
        void numeral.offsetWidth;
        numeral.classList.add('tick');
      } else if (shownSecond !== 0) {
        shownSecond = 0;
        root.classList.add('rollout');
        numeral.classList.remove('tick');
        numeral.textContent = t('hud.rollout');
        void numeral.offsetWidth;
        numeral.classList.add('tick', 'go');
        cancelHide();
        hideTimer = setTimeout(() => {
          root.classList.remove('on');
          hideTimer = null;
        }, 1100);
      }
    },
  };
}
