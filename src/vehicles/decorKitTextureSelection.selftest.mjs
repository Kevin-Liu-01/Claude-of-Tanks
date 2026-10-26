// decorKitTextureSelection.selftest.mjs — a tank's decoration kit takes its own camo entry (UI-LOCKDOWN E, 2026-10-26).
// A multiplayer tank's camo selection keys its shared textures `specId::pattern`; the decoration's kit paint and roughness
// looked up the bare spec id, missed, and baked a whole default-pattern set in the kit's task (2.15 s of getImageData in
// a room entry, the perf lane's root-u profile). With the selection, both getters return the tank's own entry and paint
// nothing but the kit's own 64² canvas; with none, the default entry serves as before.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createTankMaterials, getKitPaintTexture, getSharedRoughnessTexture } from './materials.ts';

const require = createRequire(import.meta.url);
const { createCanvas, Path2D } = require('@napi-rs/canvas');
const saved = ['document', 'Path2D'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
let canvases = 0;
globalThis.Path2D = Path2D;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  canvases++;
  return createCanvas(1, 1);
} };
const spec = { id: 'decor-kit-selection', era: 'modern', visual: { base: '#4a553c', scheme: 'solid', plateLines: false } };
const engine = { anisotropy: 4 };
const owned = [];
try {
  const selected = createTankMaterials(spec, engine, 7, 'low', 'factory');
  owned.push(selected);
  const before = canvases;
  assert.equal(getSharedRoughnessTexture(spec, 'factory'), selected.hull.roughnessMap, 'the selection\'s own roughness map');
  assert.equal(canvases, before, 'the roughness lookup paints nothing');
  const kit = getKitPaintTexture(spec, 'factory');
  assert.equal(canvases, before + 1, 'the kit paints its own 64² canvas, no camo set');
  assert.equal(getKitPaintTexture(spec, 'factory'), kit, 'the kit paint is the entry\'s own');
  // the default entry still serves a tank with no selection
  const plain = createTankMaterials(spec, engine, 7, 'low');
  owned.push(plain);
  assert.equal(getSharedRoughnessTexture(spec), plain.hull.roughnessMap, 'no selection: the default entry');
  assert.notEqual(getSharedRoughnessTexture(spec), getSharedRoughnessTexture(spec, 'factory'), 'two entries, two maps');
} finally {
  for (const materials of owned) materials.dispose();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('decorKitTextureSelection.selftest: with a camo selection the decoration kit\'s paint and roughness come from '
  + 'the tank\'s own entry without a bake; with none, from the default entry');
