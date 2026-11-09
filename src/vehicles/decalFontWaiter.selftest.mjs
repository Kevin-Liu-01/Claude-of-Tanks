// decalFontWaiter.selftest.mjs — a lettered decal's re-bake when the UI face arrives: one predicate, one waiter
// (2026-11-08 implicit-state-machine sweep, round 8 s5-09). Copyright © 2026 Kevin B. Liu.
//
// A decal is final at once (Glacis outlines, or a drawn mark that letters nothing) or provisional: lettering Glacis
// cannot set as written (a stencil's CTEx) bakes in the face at hand and again once 'Cot UI' loads. Two waiters owned
// that move: the painter redrew the canvas, and decal() set needsUpdate under its own guess at what the painter
// lettered (decalLettering), so a kind whose painter lettered another string would redraw without an upload (or bump an
// unchanged canvas), and both outlived a disposed material set. paintDecal now returns its canvas, its redraw and its own
// answer (needsUiFace); decal() registers one waiter that redraws and uploads in the same callback, and drops it once
// the set is disposed.
//
// Every kind paintDecal dispatches (and an unlisted one: the default lettering) with the text CTEx, on a fake
// document.fonts whose face loads on demand: one load per provisional decal, none for a final one; when the face
// arrives each decal's canvas redraws exactly when its texture is marked for upload; a disposed set redraws and
// uploads nothing; a face already loaded asks nothing. The census pins one load site and no second predicate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

installCanvasFixture();
const fixtureDocument = globalThis.document;
/** Each canvas's redraws (every painter clears its canvas first). */
const redraws = new Map();
const loads = [];
let faceLoaded = false;
let face = null;
const deferredFace = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const fonts = {
  check: () => faceLoaded,
  load: (font) => { loads.push(font); return face.promise; },
};
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement(name) {
    const element = fixtureDocument.createElement(name);
    const getContext = element.getContext;
    element.getContext = (...args) => {
      const context = getContext.apply(element, args);
      if (!context.countsRedraws) {
        context.countsRedraws = true;
        const clear = context.clearRect;
        context.clearRect = (...rect) => { redraws.set(element, (redraws.get(element) ?? 0) + 1); return clear.apply(context, rect); };
      }
      return context;
    };
    return element;
  },
  fonts,
} });

const { getSpec } = await import('./specs.ts');
const { createTankMaterials } = await import('./materials.ts');
const flush = () => new Promise((done) => setImmediate(done));

// every kind paintDecal dispatches, and two unlisted ones (fleet 'roundel' and 'chevron' decals: the default lettering)
const LETTERED = ['stencil', 'stencilWhite', 'plate', 'mlc', 'roundel', 'chevron'];
// drawn marks letter nothing; the designation letters the tactical number, which is always Glacis-settable (uppercase)
const FINAL = ['designation', 'insignia', 'star', 'cross', 'soot', 'crossgrey', 'flag'];
const spec = getSpec('m1a1_abrams_hc');

/** A fresh material set's decals, each with its texture and the counts it started at. */
function decalsOf(set, kinds) {
  return kinds.map((kind) => {
    const texture = set.decal(kind, 'CTEx').map;
    assert.ok(texture?.image, `${kind}: a canvas texture`);
    return { kind, texture, redraws: redraws.get(texture.image) ?? 0, version: texture.version };
  });
}
const moved = (decal) => ({ kind: decal.kind,
  redraws: (redraws.get(decal.texture.image) ?? 0) - decal.redraws, uploads: decal.texture.version - decal.version });

// ---- the face arrives: each provisional decal redraws once and is uploaded once; a final one does neither
{
  face = deferredFace();
  loads.length = 0;
  const set = createTankMaterials(spec, null, 0, 'low');
  const decals = decalsOf(set, [...LETTERED, ...FINAL]);
  assert.equal(loads.length, LETTERED.length, `one wait per provisional decal, none for a final one (${loads.length} loads asked)`);
  assert.ok(loads.every((font) => font === "bold 16px 'Cot UI'"), 'the marking face');
  face.resolve([{}]);
  await flush();
  for (const decal of decals) {
    const move = moved(decal);
    const expected = LETTERED.includes(decal.kind) ? 1 : 0;
    assert.deepEqual(move, { kind: decal.kind, redraws: expected, uploads: expected },
      `${decal.kind}: its canvas redraws exactly when its texture is uploaded (${expected ? 'provisional' : 'final'})`);
  }
  set.dispose();
}

// ---- a face that never came (load resolves with no face): nothing redraws, nothing uploads
{
  face = deferredFace();
  const set = createTankMaterials(spec, null, 0, 'low');
  const decals = decalsOf(set, LETTERED);
  face.resolve([]);
  await flush();
  for (const decal of decals) assert.deepEqual(moved(decal), { kind: decal.kind, redraws: 0, uploads: 0 }, `${decal.kind}: no face, no re-bake`);
  set.dispose();
}

// ---- a set disposed before its face arrives: the wait is dropped (it redrew a dead canvas and bumped a disposed texture)
{
  face = deferredFace();
  const set = createTankMaterials(spec, null, 0, 'low');
  const decals = decalsOf(set, LETTERED);
  set.dispose();
  face.resolve([{}]);
  await flush();
  for (const decal of decals) {
    assert.deepEqual(moved(decal), { kind: decal.kind, redraws: 0, uploads: 0 }, `${decal.kind}: a disposed set's decal is never re-baked`);
  }
}

// ---- the face already loaded, or no font API: every decal is final at once and nothing waits
{
  faceLoaded = true;
  loads.length = 0;
  const loaded = createTankMaterials(spec, null, 0, 'low');
  decalsOf(loaded, LETTERED);
  assert.equal(loads.length, 0, 'a loaded face asks nothing');
  loaded.dispose();
  faceLoaded = false;
  const saved = globalThis.document.fonts;
  delete globalThis.document.fonts;
  const bare = createTankMaterials(spec, null, 0, 'low');
  decalsOf(bare, LETTERED);
  assert.equal(loads.length, 0, 'no font API: no wait, no throw');
  bare.dispose();
  globalThis.document.fonts = saved;
}

// ---- the census: one owner asks for the face, and no second predicate guesses what a painter lettered
{
  const source = readFileSync(new URL('./materials.ts', import.meta.url), 'utf8');
  assert.equal(source.split('document.fonts.load(').length - 1, 1, 'one decal face wait in materials.ts (decal()\'s)');
  for (const gone of ['redrawWhenMarkingFontReady', 'decalLettering']) {
    assert.equal(source.includes(gone), false, `${gone} is gone: paintDecal answers for its own lettering`);
  }
}
console.log(`decalFontWaiter.selftest: ${LETTERED.length + FINAL.length} decal kinds: one wait per provisional decal, a redraw is an upload, a disposed set waits for nothing`);
