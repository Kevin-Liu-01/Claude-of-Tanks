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

export interface PointerLockFeedbackRuntimeOptions {
  input: PointerLockInput;
  bus: EventBus;
  canvas: HTMLElement;
  audioResume(): void;
  isBattleStageVisible(): boolean;
  canRecapturePointer(): boolean;
  ensureTouchControls(): Promise<TouchControlsLike | null>;
  nextFrame(): Promise<unknown>;
}

export interface PointerLockFeedbackRuntime {
  dispose(): void;
}

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
  nextFrame,
}: PointerLockFeedbackRuntimeOptions): PointerLockFeedbackRuntime {
  let disposed = false;
  let toastShown = false;
  let toast: HTMLDivElement | null = null;
  let stageWaitTimer: ReturnType<typeof setTimeout> | null = null;
  const toastTimers = new Set<ReturnType<typeof setTimeout>>();

  const clearStageWait = (): void => {
    if (stageWaitTimer !== null) clearTimeout(stageWaitTimer);
    stageWaitTimer = null;
  };

  const removeToast = (): void => {
    toastShown = false;
    clearStageWait();
    if (toast) toast.remove();
    toast = null;
    for (const timer of toastTimers) clearTimeout(timer);
    toastTimers.clear();
  };

  const showToast = (): void => {
    if (disposed || !toastShown) return;
    const element = document.createElement('div');
    element.textContent = 'Mouse capture unavailable — cursor aim enabled';
    element.className = 'cot-lock-toast';
    element.style.cssText =
      'position:fixed;top:96px;left:50%;transform:translateX(-50%);z-index:66;' +
      'padding:9px 22px;pointer-events:none;background:rgba(9,13,17,.88);' +
      'border:1px solid rgba(240,176,74,.55);color:#ffd27a;' +
      "font-family:'ABC Monument Grotesk','Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
      'font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.5);opacity:1;transition:opacity 1.2s ease;';
    document.body.appendChild(element);
    toast = element;
    void nextFrame().then(() => {
      if (disposed || toast !== element) return;
      const fade = setTimeout(() => { element.style.opacity = '0'; }, 4500);
      const remove = setTimeout(() => {
        element.remove();
        toastTimers.delete(fade);
        toastTimers.delete(remove);
        if (toast === element) toast = null;
      }, 5900);
      toastTimers.add(fade);
      toastTimers.add(remove);
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
