// paintCaches.selftest.mjs — a vehicle paint cache keeps a null only for "no DOM", never for a paint that failed
// (2026-11-02 audit R6, alphaCutTexture.ts createPaintAttempts). Copyright © 2026 Kevin B. Liu.
//
// The foliage and garnish atlases (vehicleFoliage.ts), the ghillie cover (ghillieSuit.ts) and the camo net
// (camoNetTexture.ts) cached a paint that threw as the same null as "no DOM here", so one transient canvas failure left
// that species leafless, or that net bare, for the session. A failure is counted now: the next build paints again, and
// the third in a row stands. The canvas is the inert fixture (canvasFixture.test-support.mjs): this proves the caches'
// states, not pixels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { createPaintAttempts, PAINT_ATTEMPTS } from './alphaCutTexture.ts';
import { garnishedNetTextures } from './camoNetTexture.ts';
import { vehicleFoliageAtlas } from './vehicleFoliage.ts';

// ---- the count
{
  assert.equal(PAINT_ATTEMPTS, 3);
  const restore = installCanvasFixture();
  const settles = createPaintAttempts();
  assert.equal(settles('a', false), false); assert.equal(settles('a', false), false);
  assert.equal(settles('a', true), true, 'a painted texture settles and clears the count');
  assert.equal(settles('a', false), false); assert.equal(settles('a', false), false); assert.equal(settles('a', false), true, 'the third failure in a row stands');
  restore();
  assert.equal(createPaintAttempts()('b', false), true, 'without a DOM a null settles at once');
}

// ---- the caches, through a canvas that fails once
const restore = installCanvasFixture();
const fixtureDocument = globalThis.document;
let failNext = 0;
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement(name) {
    if (failNext > 0) { failNext--; throw new Error('canvas allocation refused'); }
    return fixtureDocument.createElement(name);
  },
} });
{
  failNext = 1;
  assert.equal(garnishedNetTextures('woodland', 7), null, 'a refused canvas paints no net this time');
  const net = garnishedNetTextures('woodland', 7);
  assert.ok(net?.map && net?.bump, 'the next build paints the net (it was cached as the null before)');
  assert.equal(garnishedNetTextures('woodland', 7), net, 'and keeps it');
}
{
  failNext = 1;
  assert.equal(vehicleFoliageAtlas('garnish-woodland'), null);
  const atlas = vehicleFoliageAtlas('garnish-woodland');
  assert.ok(atlas, 'the next build paints the garnish atlas');
  assert.equal(vehicleFoliageAtlas('garnish-woodland'), atlas);
}
{
  // a canvas that never works here stops being repainted after the third failure
  failNext = Infinity;
  for (let i = 0; i < 3; i++) assert.equal(garnishedNetTextures('arid', 9), null);
  failNext = 0;
  assert.equal(garnishedNetTextures('arid', 9), null, 'the third failure stands');
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: fixtureDocument });
restore();

// ---- the ghillie cover's painter is module-private: its cache asks the same count
{
  const source = readFileSync(new URL('./ghillieSuit.ts', import.meta.url), 'utf8');
  assert.match(source, /const settlesCover = createPaintAttempts\(\);/);
  assert.match(source, /if \(typeof document !== 'undefined' && settlesCover\(key, !!out\)\) coverCache\.set\(key, out\);/);
}
console.log('paintCaches.selftest: a failed paint is painted again by the next build, three in a row at most; no DOM still caches its null');
