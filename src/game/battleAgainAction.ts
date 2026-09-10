import type { RuntimeValue } from '../runtimeTypes.ts';

interface FailureNotice {
  showGarageReturnFailure(error: RuntimeValue): void;
  hideGarageReturnFailure(): void;
}
interface BattleAgainActionOptions {
  action(): Promise<void>;
  loadFailure(): Promise<FailureNotice>;
  getPhase(): string;
  getEntryGeneration(): number;
  getRoom(): object | null;
  reportError(message: string, error: RuntimeValue): void;
}

/** Failure-only notice lifetime; the canonical return runtime still owns the action. */
export function createBattleAgainAction({
  action, loadFailure, getPhase, getEntryGeneration, getRoom, reportError,
}: BattleAgainActionOptions) {
  let pendingAction: Promise<void> | null = null;
  let actionRevision = 0;
  let noticeRevision = 0;
  let roomOwner = getRoom();
  let notice: FailureNotice | null = null;

  const invalidate = (): void => {
    noticeRevision++;
    notice?.hideGarageReturnFailure();
  };
  const onRoomState = (): void => {
    const room = getRoom();
    if (room === roomOwner) return;
    roomOwner = room;
    invalidate();
  };
  const showFailure = async (error: RuntimeValue, revision: number): Promise<void> => {
    // Capture AFTER the failed return's own Garage phase event. That legitimate
    // event must not suppress its error; subsequent lifecycle changes must.
    const failedNoticeRevision = noticeRevision;
    const phase = getPhase();
    const entryGeneration = getEntryGeneration();
    const room = getRoom();
    reportError('Battle Again failed', error);
    if (revision !== actionRevision) return;
    try {
      const loaded = await loadFailure();
      if (revision !== actionRevision || failedNoticeRevision !== noticeRevision
        || getPhase() !== phase || getEntryGeneration() !== entryGeneration
        || getRoom() !== room) return;
      notice = loaded;
      loaded.showGarageReturnFailure(error);
    } catch (noticeError) {
      // Observe even a superseded import rejection; never create an unhandled
      // rejection or replace the original action error.
      reportError('Battle Again failure notice unavailable', noticeError);
    }
  };
  const run = (): Promise<void> => {
    if (pendingAction) return pendingAction;
    const revision = ++actionRevision;
    invalidate();
    // Arm before invoking adapters, including synchronous/re-entrant ones.
    const pending = Promise.resolve().then(action).then(() => {
      if (pendingAction === pending) pendingAction = null;
    }, (error) => {
      if (pendingAction === pending) pendingAction = null;
      // A failure dialog's transfer must not keep the action latch occupied.
      return showFailure(error, revision);
    });
    pendingAction = pending;
    return pending;
  };
  return { run, invalidate, onRoomState };
}
