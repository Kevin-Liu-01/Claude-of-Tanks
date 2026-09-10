import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { waitForOpaqueTransition } from './transitionCover.ts';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
let hidden = false, opacity = 0, layout = true, current = true, time = 0, yields = 0;
const root = { getClientRects: () => layout ? [{}] : [] };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { get hidden() { return hidden; } } });
Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({ opacity: String(opacity) }) });
const options = () => ({ isCurrent: () => current, now: () => time, maxWaitMs: 100,
  yieldPaint: async () => { time += 10; yields++; } });
const reset = () => { hidden = false; opacity = 0; layout = true; current = true; time = 0; yields = 0; };
try {
  await waitForOpaqueTransition(root, { ...options(), yieldPaint: async () => {
    time += 10; yields++;
    if (yields === 1) opacity = 0.8;
    if (yields === 2) opacity = 0.95;
    if (yields === 3) opacity = 1;
  } });
  assert.equal(yields, 4, 'not just nominal fade or 95% opacity: yield after fully opaque CSS');
  reset(); opacity = 1;
  await waitForOpaqueTransition(root, options());
  assert.equal(yields, 1, 'an already opaque/reduced-motion veil still gets a paint opportunity');
  reset(); hidden = true;
  await waitForOpaqueTransition(root, options());
  assert.equal(yields, 0, 'hidden documents do not depend on animation callbacks');
  reset();
  await waitForOpaqueTransition(root, { ...options(), yieldPaint: async () => { hidden = true; yields++; } });
  assert.equal(yields, 1, 'backgrounding while fading does not strand the transaction');
  reset();
  await assert.rejects(waitForOpaqueTransition(root, options()), /did not become opaque/);
  assert.equal(time, 100, 'broken CSS/absent fade fails finitely instead of revealing heavy work');
  reset(); opacity = 1; layout = false;
  await assert.rejects(waitForOpaqueTransition(root, options()), /did not become opaque/);
  reset(); current = false;
  await assert.rejects(waitForOpaqueTransition(root, options()), { name: 'AbortError' });
  assert.equal(yields, 0);
  reset(); opacity = 1;
  await assert.rejects(waitForOpaqueTransition(root, { ...options(), yieldPaint: async () => { current = false; } }), { name: 'AbortError' });
  for (const maxWaitMs of [0, -1, NaN, Infinity]) {
    await assert.rejects(waitForOpaqueTransition(root, { ...options(), maxWaitMs }), RangeError);
  }
  const source = await readFile(new URL('./transition.ts', import.meta.url), 'utf8');
  const coverAt = source.indexOf('await waitForOpaqueTransition(root, { isCurrent })');
  assert.ok(coverAt >= 0 && coverAt < source.indexOf('result = await work('),
    'the real transition owner awaits coverage before invoking work');
  assert.match(source, /if \(isCurrent\(\)\) await api\.hide\(\)/,
    'an older transaction cannot hide the newer veil after its dwell');
  assert.match(source, /visible && hideToken === token\) root\.classList\.add\('lit'\)/,
    'a stale delayed fade-in cannot alter a newer transition');
} finally {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document;
  if (originalStyle) Object.defineProperty(globalThis, 'getComputedStyle', originalStyle); else delete globalThis.getComputedStyle;
}
console.log('transitionCover.selftest: actual opacity, paint opportunity, hidden fallback, failure and supersession pass');
