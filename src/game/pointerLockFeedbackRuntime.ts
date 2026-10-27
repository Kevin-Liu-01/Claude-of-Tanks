import { t } from '../ui/i18n.ts';
import type { BattleNoticePort } from '../ui/battleNotices.ts';
import type { EventBus } from './stateCore.ts';

interface PointerLockInput {
  isTouchLayout(): boolean;
  isLocked(): boolean;
  requestLock(): void;
  onLockDenied(listener: () => void): () => void;
  onLockRestored(listener: () => void): () => void;
}

interface TouchControlsLike {
  refresh?(): void;
}

interface PointerLockFeedbackRuntimeOptions {
  input: PointerLockInput;
  bus: EventBus;
  canvas: HTMLElement;
  audioResume(): void;
  isBattleStageVisible(): boolean;
  canRecapturePointer(): boolean;
  ensureTouchControls(): Promise<TouchControlsLike | null>;
  /** The battle's notice region (ui/battleNotices.ts by default; a receipt passes its own). */
  notices?: BattleNoticePort;
}

interface PointerLockFeedbackRuntime {
  dispose(): void;
}

// (the battle's region loads with the first notice: imported here, battleNotices.ts was a chunk of its own on the game
// page's boot requests)
let regionPort: Promise<BattleNoticePort> | null = null;
const lazyBattleNotices: BattleNoticePort = {
  show(options) {
    regionPort ??= import('../ui/battleNotices.ts').then((module) => module.battleNotices);
    void regionPort.then((port) => { port.show(options); }, () => {});
  },
  dismiss(id) {
    if (regionPort) void regionPort.then((port) => { port.dismiss(id); }, () => {});
  },
};

/**
 * Own pointer-lock recovery gestures and the durable cursor-aim notice.
 * The renderer and game state remain behind small injected predicates, so the
 * lifecycle can neither import the battle graph nor outlive its listeners.
 */
export function createPointerLockFeedbackRuntime({
  input,
  bus,
  canvas,
  audioResume,
  isBattleStageVisible,
  canRecapturePointer,
  ensureTouchControls,
  notices = lazyBattleNotices,
}: PointerLockFeedbackRuntimeOptions): PointerLockFeedbackRuntime {
  let disposed = false;
  let toastShown = false;
  let stageWaitTimer: ReturnType<typeof setTimeout> | null = null;
  /** The notice's id in the battle region (ui/battleNotices.ts: the kit's notice, UI-LOCKDOWN B14). */
  const TOAST_ID = 'cot-pointer-lock';

  const clearStageWait = (): void => {
    if (stageWaitTimer !== null) clearTimeout(stageWaitTimer);
    stageWaitTimer = null;
  };

  const removeToast = (): void => {
    toastShown = false;
    clearStageWait();
    notices.dismiss(TOAST_ID);
  };

  // (the kit's warning in the battle's notice region, its time the kit's: a fixed amber box of its own sat at the centre
  // top over the network's banner, UI-LOCKDOWN B14)
  const showToast = (): void => {
    if (disposed || !toastShown) return;
    notices.show({
      id: TOAST_ID, className: 'cot-lock-notice', severity: 'warning', text: t('pointerLock.toast.unavailable'),
      durationMs: 5900, dismissible: false,
    });
  };

  const waitForBattleStage = (): void => {
    if (disposed || !toastShown) return;
    if (!isBattleStageVisible()) {
      clearStageWait();
      stageWaitTimer = setTimeout(waitForBattleStage, 400);
      return;
    }
    clearStageWait();
    showToast();
  };

  const stopDenied = input.onLockDenied(() => {
    if (toastShown || disposed) return;
    toastShown = true;
    waitForBattleStage();
  });
  const stopRestored = input.onLockRestored(removeToast);

  const onCanvasMouseDown = (): void => {
    // The same canvas owns Garage orbit and battle recapture. A showroom
    // drag is not sound intent: cold AudioContext construction and mixer
    // loading must stay out of that camera-input path (and covered loading).
    if (disposed || !isBattleStageVisible()) return;
    audioResume();
    if (!canRecapturePointer() || input.isTouchLayout()) return;
    if (!input.isLocked()) input.requestLock();
  };
  canvas.addEventListener('mousedown', onCanvasMouseDown);

  const stopBattleStart = bus.on('ui:battleStart', () => {
    void ensureTouchControls().then((controls) => controls?.refresh?.()).catch(() => null);
    if (!input.isTouchLayout()) input.requestLock();
  });

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stopDenied();
      stopRestored();
      stopBattleStart();
      canvas.removeEventListener('mousedown', onCanvasMouseDown);
      removeToast();
    },
  };
}
