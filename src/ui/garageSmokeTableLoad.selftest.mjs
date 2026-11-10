// garageSmokeTableLoad.selftest.mjs — the Garage consumables' smoke table follows the one lazy-chunk policy
// (2026-11-02 audit R6, round 2 U35 review). Copyright © 2026 Kevin B. Liu.
//
// The consumables band warms the smoke table (vehicles/auxiliaryInventory.ts) on every pointer crossing into it and every
// focus entering it (garageConsumables.ts warm, bound to the band's pointerover and focusin). The table's memo was
// cleared on a failure and asked again at once by the next caller, so after a failure every hover asked the chunk again:
// one request per pointer crossing for a removed deployment's 404 or a browser that fails a re-ask at once. Now it is an
// app/lazyChunk.ts chunk: asked again at once after one failure, then past the backoff (2, 4, 8 ... s), never while
// offline, and loaded once the network is back. A chunk "fails" the way a browser's import does when the network drops:
// its resolve throws. The band is a minimal stand-in element (the warm path reads no layout).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let clock = 1000;
performance.now = () => clock; // the lazy chunk's default clock
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

const TABLE = '../vehicles/auxiliaryInventory.ts';
let failing = 5;
let asks = 0;
const TABLE_STUB = `data:text/javascript,${encodeURIComponent('export function auxiliaryCapabilities({ id }) { return id === "m1a2" ? { smoke: ["m250"] } : null; }')}`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if ((context.parentURL ?? '').includes('/src/ui/garageConsumables.ts') && specifier === TABLE) {
      asks += 1;
      if (failing > 0) { failing -= 1; throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`); }
      return { url: TABLE_STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

/** An element stand-in: what createGarageConsumables touches at its creation and the band's warm reads. */
function element() {
  const listeners = new Map();
  return {
    className: '', tabIndex: 0, innerHTML: '', textContent: '', dataset: {}, style: {},
    setAttribute() {}, removeAttribute() {}, appendChild(child) { return child; }, append() {}, prepend() {},
    replaceChildren() {}, remove() {}, focus() {}, contains() { return false; },
    querySelector() { return element(); }, querySelectorAll() { return []; }, closest() { return null; },
    addEventListener(type, listener) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push(listener); },
    removeEventListener(type, listener) { listeners.set(type, (listeners.get(type) ?? []).filter((fn) => fn !== listener)); },
    fire(type) { for (const listener of listeners.get(type) ?? []) listener({ type, target: null }); },
  };
}
globalThis.document = { createElement: () => element() };

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
try {
  const { createGarageConsumables } = await import('./garageConsumables.ts');
  const band = element();
  const consumables = createGarageConsumables({
    host: band, root: element(), vehicle: () => ({ id: 'm1a2', era: 'modern' }), locked: () => false,
    text: () => ({}), emit() {},
  });
  const hover = async (times = 1) => { for (let i = 0; i < times; i++) { band.fire('pointerover'); await settle(); } };

  // 1. ten pointer crossings after the table failed: asked at once after the first failure, then held by the backoff
  await hover(10);
  assert.equal(asks, 2, `ten hovers over a failing smoke table ask it twice, then wait for the backoff (${asks} asks: `
    + 'the memo cleared on failure was asked again by every hover)');

  // 2. offline: no hover asks, however long since the last failure
  onLine = false;
  clock += 60_000;
  await hover(5);
  band.fire('focusin');
  await settle();
  assert.equal(asks, 2, `no ask while the browser is offline (${asks} asks)`);

  // 3. back online past the backoff: one ask per backoff window (2, 4, 8 s), then the table loads and nothing asks again
  onLine = true;
  await hover();
  assert.equal(asks, 3, 'online and past the backoff: asked again');
  await hover(3);
  assert.equal(asks, 3, 'inside the next backoff (4 s): no ask');
  clock += 4000; await hover(); assert.equal(asks, 4);
  clock += 8000; await hover(); assert.equal(asks, 5);
  clock += 16_000; await hover(); assert.equal(asks, 6, 'the sixth ask loads the table');
  await hover(5);
  band.fire('focusin');
  await settle();
  assert.equal(asks, 6, 'a loaded table is never asked again');
  consumables.dispose();
} finally {
  hook.deregister();
  delete globalThis.document;
}
console.log('garageSmokeTableLoad.selftest: OK (the smoke table is asked again under the lazy-chunk policy, never per hover)');
