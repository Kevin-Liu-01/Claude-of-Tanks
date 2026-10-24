import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { waitForOpaqueTransition } from './transitionCover.ts';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
let hidden = false, opacity = 0, layout = true, current = true, time = 0, yields = 0;
const root = { getClientRects: () => layout ? [{}] : [] };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { get hidden() { return hidden; } } });
Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({ opacity: String(opacity) }) });
// minFrames 1: these cases pin the wall-clock deadline alone (the frame floor has its own cases below)
const options = () => ({ isCurrent: () => current, now: () => time, maxWaitMs: 100, minFrames: 1,
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
  for (const minFrames of [0, 1.5, NaN]) {
    await assert.rejects(waitForOpaqueTransition(root, { ...options(), minFrames }), RangeError);
  }
  // transitions-250: a slow main thread (a probe polling every 25 ms stranded a Studio exit at the 1 s deadline). Frames
  // of 150 ms: the deadline waits for the frame floor too, and a fade still unfinished there is cut to opaque, not failed
  const slow = (extra = {}) => ({ isCurrent: () => current, now: () => time, maxWaitMs: 1000, ...extra });
  reset();
  let forcedCalls = 0;
  await waitForOpaqueTransition(root, slow({ forceOpaque: () => { forcedCalls++; opacity = 1; },
    yieldPaint: async () => { time += 150; yields++; if (yields === 9) opacity = 1; } }));
  assert.equal(forcedCalls, 0, 'a fade that finishes after a loaded second but within the frame floor is waited for');
  assert.equal(yields, 10, 'and proceeds one paint after it reads opaque');
  reset(); forcedCalls = 0;
  await waitForOpaqueTransition(root, slow({ forceOpaque: () => { forcedCalls++; opacity = 1; },
    yieldPaint: async () => { time += 150; yields++; } }));
  assert.equal(forcedCalls, 1, 'a fade still not opaque at the deadline and the frame floor is cut to opaque');
  assert.equal(yields, 14, 'twelve frames, the forced cover\'s frame, and the paint after it reads opaque');
  reset(); forcedCalls = 0;
  await assert.rejects(waitForOpaqueTransition(root, slow({ forceOpaque: () => { forcedCalls++; },
    yieldPaint: async () => { time += 150; yields++; } })), /did not become opaque/);
  assert.ok(forcedCalls === 1 && yields === 13, 'a cover that stays clear even when forced (broken CSS) still fails, one frame later');
  reset();
  await assert.rejects(waitForOpaqueTransition(root, slow({ yieldPaint: async () => { time += 150; yields++; } })),
    /did not become opaque/);
  assert.equal(yields, 12, 'without a fallback the frame floor still bounds the wait');
  const source = await readFile(new URL('./transition.ts', import.meta.url), 'utf8');
  const coverAt = source.indexOf('await waitForOpaqueTransition(root, { isCurrent, forceOpaque: () => {');
  assert.match(source, /forceOpaque: \(\) => \{\s*root\.style\.transition = 'none';\s*root\.classList\.add\('lit'\);/,
    'the real transition cuts an unfinished fade to its lit, opaque state');
  assert.ok((source.match(/root\.style\.transition = '';/g) ?? []).length === 2, 'and show() and hide() fade normally again');
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
// transitions-249: a fading cover passes clicks to the screen showing through it (a Garage press in its last ~180 ms was
// swallowed); an opaque or fading-in cover still takes them
{
  const transition = await readFile(new URL('./transition.ts', import.meta.url), 'utf8');
  assert.match(transition, /\.cot-trans\.out\{[^}]*pointer-events:none/, 'a fading-out cover lets clicks through');
  assert.doesNotMatch(transition, /\.cot-trans(?:\.on|\.lit)?\{[^}]*pointer-events:none/, 'a shown cover still takes them');
}
console.log('transitionCover.selftest: actual opacity, paint opportunity, hidden fallback, failure and supersession pass');
