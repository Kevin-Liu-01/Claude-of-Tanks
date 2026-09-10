// Serialized into the owned page. Selectors follow modal.ts; titles come from
// the shipped i18n catalogs used by garageReturnFailure.ts, not English-only UI.
export function inspectGarageActionOutcome({ retryTitles, priorModals = [], baselineOnly = false }) {
  const modals = [];
  for (const panel of document.querySelectorAll(
    '.cot-modal-root.is-open:not([hidden]) [role="dialog"][aria-modal="true"]',
  )) {
    const root = panel.closest('.cot-modal-root');
    if (!panel.getClientRects().length || Number(getComputedStyle(root).opacity) <= 0) continue;
    const titleId = panel.getAttribute('aria-labelledby');
    const title = document.getElementById(titleId)?.textContent?.trim();
    if (!retryTitles.includes(title)) continue;
    modals.push({ titleId, title, message: panel.querySelector('.cot-modal__body')?.textContent ?? '' });
  }
  if (baselineOnly) return { modals };
  const failure = modals.find(modal => !priorModals.some(prior =>
    prior.titleId === modal.titleId && prior.title === modal.title && prior.message === modal.message));
  // A failure never becomes successful completion just because a safe owner
  // restored the Garage underneath its notice in the same frame.
  if (failure) return { failure: { kind: 'failure-modal', ...failure } };
  return window.__ACTION_TRACE.done() ? { done: true } : false;
}

function actionFailure(action, detail) {
  const error = new Error(`${action}: ${detail.kind}: ${detail.message}`);
  error.actionFailure = { action, ...detail };
  return error;
}

/** Observe only the current trusted click/wait, never accumulated old errors. */
export async function waitForGarageAction(page, { action, retryTitles, timeoutMs, onCleanupError }, click) {
  const baseline = await page.evaluate(inspectGarageActionOutcome, { retryTitles, baselineOnly: true });
  const abort = new AbortController();
  let failure = null, primaryError = null, handle;
  const fail = (kind, message) => {
    failure ??= actionFailure(action, { kind, message });
    abort.abort(failure);
  };
  const onPageError = error => fail('pageerror', String(error));
  const onConsole = entry => { if (entry.type() === 'error') fail('console-error', entry.text()); };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  try {
    await click();
    if (failure) throw failure;
    handle = await page.waitForFunction(inspectGarageActionOutcome,
      { timeout: timeoutMs, polling: 100, signal: abort.signal },
      { retryTitles, priorModals: baseline.modals });
    const outcome = await handle.jsonValue();
    if (failure) throw failure;
    if (outcome.failure) throw actionFailure(action, outcome.failure);
  } catch (error) {
    primaryError = failure ?? error;
    throw primaryError;
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    // Puppeteer's abortable wait owns its polling task; no detached 90 s waiter
    // survives an error, a failed click, or an action completing normally.
    abort.abort();
    try { await handle?.dispose(); }
    catch (error) {
      if (!primaryError) throw error;
      onCleanupError?.(error);
    }
  }
}
