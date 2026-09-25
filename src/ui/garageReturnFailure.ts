import { t } from './i18n.ts';
import { createModal, type ModalController } from './modal.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

type FailureModal = Pick<ModalController, 'setTitle' | 'body' | 'open' | 'close'>;
interface FailurePresenter {
  (error: RuntimeValue): void;
  hide(): void;
}

/** The reason text a failure carries, or the notice title when it carries none. */
function failureReason(error: RuntimeValue, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** One reusable, failure-only notice; return/entry owners keep their safe UI. */
export function createGarageReturnFailurePresenter(
  makeModal: () => FailureModal,
  getTitle: () => string,
  formatBody: (reason: string) => string = (reason) => reason,
): FailurePresenter {
  let modal: FailureModal | null = null;
  const show = (error: RuntimeValue): void => {
    const title = getTitle();
    modal ??= makeModal();
    modal.setTitle(title);
    // Errors are text, never markup. Unknown failures still have a useful
    // notice without assuming an Error's realm or retaining gameplay state.
    modal.body.textContent = formatBody(failureReason(error, title));
    modal.open();
  };
  return Object.assign(show, {
    hide: () => modal?.close({ restoreFocus: false, immediate: true }),
  });
}

// Imported by main only after a failed action, not on boot or a good rematch.
export const showGarageReturnFailure = createGarageReturnFailurePresenter(
  () => createModal({ size: 'small' }),
  () => t('boot.retry'),
);

/** Later entry/room intent releases only this already-created notice. */
export const hideGarageReturnFailure = (): void => showGarageReturnFailure.hide();

/**
 * Entry resilience (2026-09-25): a solo battle that could not start says so
 * over the recovered Garage — the reason, then the one action — instead of a
 * silent return (soloBattleEntryRuntime.ts). Demand-loaded like the return notice.
 */
export const showSoloEntryFailure = createGarageReturnFailurePresenter(
  () => createModal({ size: 'small' }),
  () => t('battle.entryFailed.title'),
  (reason) => t('battle.entryFailed.body', { reason }),
);
