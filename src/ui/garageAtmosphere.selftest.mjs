// garage r9 atmosphere receipt: the strip atlas is deterministic and inside its opacity caps; a pinned clock gives the
// same frame twice; nothing moves unless the mesh renders (no timers, so a hidden Garage costs nothing); one draw on the
// contact shadows' program; no falling precipitation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GARAGE_ATMOSPHERE_ALPHA, atmosphereBand, atmosphereDrips, atmosphereMotes, atmospherePlume, atmosphereShaft,
  atmosphereStreamer, createGarageAtmosphere, garageAtmosphereAtlasPixels, setGarageAtmosphereClock,
} from './garageAtmosphereKit.ts';
import { GARAGE_KIT_PLACEMENTS } from './garageKitPlacements.ts';

const a = garageAtmosphereAtlasPixels(), b = garageAtmosphereAtlasPixels();
assert.equal(a.length, 256 * 256 * 4);
assert.ok(a.every((value, index) => value === b[index]), 'the strip atlas is byte-stable');
const strips = Object.keys(GARAGE_ATMOSPHERE_ALPHA);
strips.forEach((strip, index) => {
  let peak = 0;
  for (let y = index * 32; y < (index + 1) * 32; y += 1) for (let x = 0; x < 256; x += 1) peak = Math.max(peak, a[(y * 256 + x) * 4 + 3]);
  assert.ok(peak <= Math.round(GARAGE_ATMOSPHERE_ALPHA[strip] * 255) + 1, `${strip}: peak alpha ${peak} over its cap`);
  assert.ok(peak > 0, `${strip}: drawn`);
});
assert.ok(GARAGE_ATMOSPHERE_ALPHA.shaft <= 0.06 && GARAGE_ATMOSPHERE_ALPHA.motes <= 0.3, 'shafts 6 %, motes 30 % a sprite');

const mesh = createGarageAtmosphere({
  drift: 0.05,
  cards: [atmosphereShaft([0, 9, 0], [2, 0, 2], 2), ...atmosphereMotes([1, 3, 1], 2), ...atmospherePlume([5, 0, 5], 8, 1.2, 'steam'),
    atmosphereBand([-10, 0, 20], [10, 0, 20], 3), atmosphereStreamer([-5, 0, 8], [5, 0, 8], 'dust'), atmosphereDrips([0, 4, 0], [4, 4, 0])],
});
assert.equal(mesh.material.type, 'MeshBasicMaterial');
assert.equal(mesh.material.transparent, true);
assert.equal(mesh.material.depthWrite, false);
assert.equal(mesh.material.side, 0, 'front-sided: the contact shadows\' program, not a double-sided one');
assert.equal(mesh.material.vertexColors, false);
assert.ok(mesh.userData.atmosphereTriangles <= 2500);
setGarageAtmosphereClock(() => 12.5);
mesh.onBeforeRender();
const first = mesh.material.map.offset.x;
mesh.onBeforeRender();
assert.equal(mesh.material.map.offset.x, first, 'a pinned clock gives the same frame');
setGarageAtmosphereClock(() => 13.5);
mesh.onBeforeRender();
assert.notEqual(mesh.material.map.offset.x, first, 'the strips drift with the clock');
setGarageAtmosphereClock(null);
// two Garages scroll their own transforms over shared pixels
const other = createGarageAtmosphere({ cards: [atmosphereShaft([0, 9, 0], [1, 0, 1], 1)] });
assert.ok(other.material.map !== mesh.material.map, 'each Garage scrolls its own strip texture');
assert.equal(other.material.map.source, mesh.material.map.source, 'one strip texture uploaded, whatever the Garage');

const source = await readFile(new URL('./garageAtmosphereKit.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame/, 'nothing ticks the atmosphere but its own render');
assert.doesNotMatch(source, /'rain'|'snowfall'|precipitation\s*=/, 'no falling rain or snow');
for (const [architecture, placement] of Object.entries(GARAGE_KIT_PLACEMENTS)) {
  const cards = placement.atmosphere?.cards ?? [];
  assert.ok(new Set(cards.map((card) => card.strip)).size >= 2 || cards.length >= 2, `${architecture}: two or more of its briefed effects`);
}
console.log('garageAtmosphere.selftest: strips byte-stable within caps, pinned clock stable, no timers');
