// 2026-11-02 audit R5 (camo paint owner): every writer of a shared camouflage entry's live canvases takes one paint-owner
// gate. A chunked repaint aborted after its albedo pass leaves the entry dirty, so a quick A, B, A no longer leaves B on
// the hull with A selected; a synchronous repaint during a chunked one ends it (no second exposure trim darkening the
// hull); a chunked quality promotion paints on private canvases (the live maps never hold half a promotion); the shared
// entry is released by identity and a material set disposes once. Real small CPU painters (@napi-rs/canvas), a manual
// timer queue for the sweep's yields.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import {
  applyCamoPatterns, applyCamoPatternsChunked, createTankMaterials, prebakeSharedTextures, setCamoOverride,
} from './materials.ts';

const require = createRequire(import.meta.url);
const { createCanvas, Path2D } = require(process.env.COT_TEST_CANVAS_MODULE || require.resolve('@napi-rs/canvas'));
const saved = ['document', 'Path2D', 'setTimeout'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); },
} });
Object.defineProperty(globalThis, 'Path2D', { configurable: true, value: Path2D });

// the sweep's yields are setTimeout; this queue runs them one at a time, so each case interleaves deterministically
const realSetTimeout = globalThis.setTimeout;
const timers = [];
const manualTimers = (on) => {
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, writable: true,
    value: on ? (callback) => { timers.push(callback); return timers.length; } : realSetTimeout });
};
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const tick = async () => { const next = timers.shift(); assert.ok(next, 'a yield is pending'); next(); await flush(); };
const drain = async () => { while (timers.length) await tick(); };

const spec = (id) => ({ id, era: 'ww2', visual: { base: '#4a553c', scheme: 'solid', plateLines: false } });
const digest = (canvas) => createHash('sha256')
  .update(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).digest('hex');
const albedo = (set) => digest(set.hull.map.image);
const rough = (set) => digest(set.hull.roughnessMap.image);

try {
  // References: one entry, each pattern painted in full by the synchronous repaint.
  const s = spec('paint-owner');
  const set = createTankMaterials(s, { anisotropy: 4 }, 7, 'low', null);
  const reference = {};
  for (const pattern of ['winter', 'desert', 'winter']) {
    setCamoOverride(s.id, pattern);
    applyCamoPatterns(s.id);
    reference[pattern] = { albedo: albedo(set), rough: rough(set) };
  }
  assert.notEqual(reference.winter.albedo, reference.desert.albedo, 'the two patterns paint differently');

  // 1. A -> B -> A: the sweep for B is aborted after its albedo pass; the sweep back to A must repaint it.
  manualTimers(true);
  setCamoOverride(s.id, 'desert');
  const towardB = applyCamoPatternsChunked({ onlySpecIds: [s.id] });
  await tick(); // the sweep's pre-paint yield: the albedo pass paints B, then yields
  assert.notEqual(albedo(set), reference.winter.albedo, 'B is on the canvas');
  setCamoOverride(s.id, 'winter');
  const backToA = applyCamoPatternsChunked({ onlySpecIds: [s.id] });
  await drain();
  await Promise.all([towardB, backToA]);
  assert.equal(albedo(set), reference.winter.albedo,
    'the hull wears A again: an aborted repaint leaves the entry dirty, not marked A');
  assert.equal(rough(set), reference.winter.rough);

  // 2. A synchronous repaint during a chunked one: the chunked repaint stops (no second exposure trim).
  setCamoOverride(s.id, 'desert');
  const chunked = applyCamoPatternsChunked({ onlySpecIds: [s.id] });
  await tick(); // albedo pass of the chunked repaint
  applyCamoPatterns(s.id); // a synchronous writer (applyPlayerCamo, Studio, shots) paints B in full
  assert.equal(albedo(set), reference.desert.albedo);
  await drain();
  await chunked;
  assert.equal(albedo(set), reference.desert.albedo, 'the hull is not darkened by the chunked repaint\'s exposure trim');
  assert.equal(rough(set), reference.desert.rough, 'nor its roughness passes run again');
  manualTimers(false);

  // 3. A chunked quality promotion paints privately: the live maps keep their size and pixels until it installs.
  {
    const before = { width: set.hull.map.image.width, albedo: albedo(set) };
    let release;
    const gate = new Promise((done) => { release = done; });
    let ticks = 0;
    const promotion = prebakeSharedTextures(s, 4, 'ai', async () => { ticks += 1; if (ticks === 2) await gate; });
    while (ticks < 2) await new Promise((done) => realSetTimeout(done, 0));
    assert.equal(set.hull.map.image.width, before.width, 'mid-promotion the live albedo keeps its size');
    assert.equal(albedo(set), before.albedo, 'and its pixels: nothing half-promoted can upload');
    release();
    await promotion;
    assert.ok(set.hull.map.image.width > before.width, 'the promotion installed');
    setCamoOverride(s.id, 'desert');
    const promoted = albedo(set);
    applyCamoPatterns(s.id);
    assert.equal(albedo(set), promoted, 'the promotion is a clean, complete bake of the entry\'s pattern');
  }

  // 4. Release by identity, dispose once: a second dispose of a disposed set never releases the entry that replaced it.
  {
    const other = spec('paint-owner-release');
    const first = createTankMaterials(other, { anisotropy: 4 }, 7, 'low', null);
    first.dispose();
    const second = createTankMaterials(other, { anisotropy: 4 }, 7, 'low', null);
    const texture = second.hull.map;
    let disposed = 0;
    texture.addEventListener('dispose', () => { disposed += 1; });
    first.dispose();
    assert.equal(disposed, 0, 'the live set\'s shared textures survive a stale second dispose');
    second.dispose();
    second.dispose();
    assert.equal(disposed, 1, 'and are released once with their own set');
  }
  set.dispose();
  setCamoOverride(s.id, null);
} finally {
  manualTimers(false);
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}

console.log('camoPaintOwner.selftest: one paint owner (A-B-A, sync over chunked, private promotion), release by identity PASS');
