// A desktop player's Esc on a locked battle, as Chrome takes it, for headless browser receipts (photo-from-pause-279).
// Headless Chrome does neither half of it: the Escape key reaches the page (Settings' own settingsMenu action then
// releases the lock as 'settings', a claimed unlock), and no relock is refused after it. A real Chrome swallows the key
// as its unlock gesture (an unclaimed unlock: the page sees only pointerlockchange) and refuses every relock in the
// 1250 ms after it (MouseLockController), the window src/game/chromePointerLockPage.test-support.mjs models for the
// selftests. Here the same two rules run in the page:
// - browserEsc(page): the browser's unlock: document.exitPointerLock from outside the game, no key event, and the
//   refusal window opens.
// - installChromeEscModel(page): from then on, a requestPointerLock inside that window is refused as Chrome refuses it
//   (its promise rejects with a SecurityError and pointerlockerror fires); outside it the real request runs.
// - chromeEscTimes(page): the page clock's last trusted click, last lock landed, and the refusals counted.
// First-party tooling: Kevin B. Liu.

export const CHROME_ESC_REFUSAL_MS = 1250;

/** Wrap requestPointerLock once per document; inert until browserEsc opens a window. */
export const installChromeEscModel = (page) => page.evaluate((windowMs) => {
  if (window.__cotChromeEsc) return;
  const model = { lastEscMs: -Infinity, clickMs: null, lockedMs: null, refused: 0, windowMs };
  window.__cotChromeEsc = model;
  const ask = Element.prototype.requestPointerLock;
  Element.prototype.requestPointerLock = function requestPointerLock(...args) {
    if (performance.now() < model.lastEscMs + model.windowMs) {
      model.refused += 1;
      setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
      return Promise.reject(new DOMException('The user has exited the lock before this request was completed.', 'SecurityError'));
    }
    return ask.apply(this, args);
  };
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) model.lockedMs = performance.now(); });
  window.addEventListener('click', (event) => { if (event.isTrusted) model.clickMs = performance.now(); }, true);
}, CHROME_ESC_REFUSAL_MS);

/** The browser's Esc: an unclaimed unlock with no key event, opening the refusal window. 'not locked' if none held. */
export const browserEsc = (page) => page.evaluate(() => {
  if (!document.pointerLockElement) return 'not locked';
  window.__cotChromeEsc.lastEscMs = performance.now();
  window.__cotChromeEsc.lockedMs = null;
  document.exitPointerLock();
  return 'the browser\'s Esc';
});

/** { clickMs, lockedMs, refused } on the page's clock, and lockedAfterClickMs when the lock landed after the last click. */
export const chromeEscTimes = (page) => page.evaluate(() => {
  const { clickMs, lockedMs, refused } = window.__cotChromeEsc;
  const lockedAfterClickMs = clickMs !== null && lockedMs !== null && lockedMs >= clickMs ? Math.round(lockedMs - clickMs) : null;
  return { clickMs, lockedMs, refused, lockedAfterClickMs };
});
