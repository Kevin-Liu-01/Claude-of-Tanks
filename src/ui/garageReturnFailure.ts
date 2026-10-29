import { t } from './i18n.ts';
import { createModal, type ModalController } from './modal.ts';
import { uiIconSVG } from './uiIcons.ts';
import { isChunkFailure } from './components/loadFailure.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

type FailureModal = Pick<ModalController, 'setTitle' | 'body' | 'open' | 'close'> & Partial<Pick<ModalController, 'footer'>>;
interface FailurePresenter {
  (error: RuntimeValue, retry?: (() => void) | null): void;
  hide(): void;
}

/**
 * A failure the network caused: a file that did not arrive, a fetch that failed, or a browser that is offline. Only the
 * message counts: a production stack names a hashed /assets/ chunk whatever the error (app/lazyImportRetry.ts reads the
 * stack too, so it is not imported here; as a third importer it was a boot request of its own on the game page).
 */
export function isNetworkFailure(error: RuntimeValue, online: boolean = typeof navigator === 'undefined' || navigator.onLine !== false): boolean {
  if (!online) return true;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  // a dynamic import Chrome or Firefox could not fetch, Safari's module failure, Vite's preload of a chunk's CSS
  return /failed to fetch|networkerror|load failed|network request failed|err_internet_disconnected|dynamically imported module|importing a module script failed|unable to preload css/i
    .test(message);
}

/** The reason text a failure carries, or the notice title when it carries none. */
function failureReason(error: RuntimeValue, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** One reusable, failure-only notice; return/entry owners keep their safe UI. */
export function createGarageReturnFailurePresenter(
  makeModal: () => FailureModal,
  getTitle: () => string,
  formatBody: (reason: string, error: RuntimeValue) => string = (reason) => reason,
): FailurePresenter {
  let modal: FailureModal | null = null;
  let retryButton: HTMLButtonElement | null = null;
  let retryAction: (() => void) | null = null;
  let reloads = false;
  const show = (error: RuntimeValue, retry: (() => void) | null = null): void => {
    const title = getTitle();
    modal ??= makeModal();
    modal.setTitle(title);
    // Errors are text, never markup. Unknown failures still have a useful
    // notice without assuming an Error's realm or retaining gameplay state.
    modal.body.textContent = formatBody(failureReason(error, title), error);
    // the one action (loading states, owner 2026-10-27: an error gets a quiet retry state): the notice runs the
    // failed action again itself, instead of telling the player to find it. A chunk that did not arrive cannot arrive
    // again in this document (components/loadFailure.ts), so its action reloads the page once online instead.
    reloads = !retry && isChunkFailure(error);
    retryAction = reloads ? () => location.reload() : retry;
    if (retryAction && modal.footer && !retryButton) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-c-btn cot-c-btn--36 cot-c-btn--primary';
      button.innerHTML = `${uiIconSVG('rematch', 17)}<span>${t('battle.entryFailed.retry')}</span>`;
      button.addEventListener('click', () => {
        const action = retryAction;
        // (offline, a reload is the browser's error page: the notice stays and the press waits)
        if (reloads && navigator.onLine === false) return;
        modal?.close({ restoreFocus: false, immediate: true });
        action?.();
      });
      modal.footer.append(button);
      retryButton = button;
    }
    if (retryButton) {
      retryButton.hidden = !retryAction;
      const label = retryButton.querySelector('span');
      if (label) label.textContent = t(reloads ? 'loadFailed.reload' : 'battle.entryFailed.retry');
    }
    modal.open();
  };
  return Object.assign(show, {
    hide: () => modal?.close({ restoreFocus: false, immediate: true }),
  });
}

// Imported by main only after a failed action, not on boot or a good rematch.
export const showGarageReturnFailure = createGarageReturnFailurePresenter(
  () => createModal({ size: 'small', surface: 'garage-return-failure' }),
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
  () => createModal({ size: 'small', surface: 'battle-entry-failure' }),
  () => t('battle.entryFailed.title'),
  // a file the network dropped says so quietly (no module URL in the player's face), a chunk that did not arrive
  // asks for the page's reload; any other failure keeps its reason
  (reason, error) => (isChunkFailure(error) ? t('battle.entryFailed.reload')
    : isNetworkFailure(error) ? t('battle.entryFailed.network') : t('battle.entryFailed.body', { reason })),
);
