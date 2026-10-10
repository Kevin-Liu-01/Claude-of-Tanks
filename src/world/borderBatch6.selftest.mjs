// The borders lane's batch 6 is opt-in per map (borderLandform.ts batch6, the costland lane 2026-10-09; the light-touch
// rule after gauntlet waves 330/331 against main): only a map that passed a wave against main takes it — Saltmere
// (coastal) and Nordhavn (fjord) — and every other map keeps the edge main drew. On Verdant, a map that keeps it: the
// ring has no one woods field (standAt), no face trees and no far rise; its hedges are main's bodies; the height field
// keeps the tufts' old 474 m cull and the tall grass grows nothing past it.
import assert from 'node:assert/strict';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { buildHorizonRing } from './maps/horizon.ts';
import { borderBatch6 } from './borderLandform.ts';
import { createHeightField } from './terrain.ts';
import { createTallGrass } from './tallGrass.ts';

globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0, getContext() { return {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(image) { canvas.pixels = image.data; }, clearRect() {}, save() {}, restore() {}, beginPath() {}, closePath() {},
    rect() {}, clip() {}, moveTo() {}, lineTo() {}, fill() {}, createLinearGradient: () => ({ addColorStop() {} }),
  }; } };
  return canvas;
} };

const opted = MAP_IDS.filter((id) => borderBatch6(id, getMapConfig(id)?.terrain?.border ?? null));
assert.deepEqual(opted.sort(), ['coastal', 'fjord'], `batch 6 is Saltmere's and Nordhavn's alone (${opted.join(', ')})`);
assert.equal(borderBatch6(null), true, 'a field with no map (a receipt fixture) takes it');
assert.equal(borderBatch6('verdant', { batch6: true }), true, 'a map config opts in');

const cfg = getMapConfig('verdant');
const ground = createHeightField(1337, cfg);
assert.equal(ground._tuftEdgeM, 474, 'Verdant keeps the tufts\' old rim-band cull');
const mesh = buildHorizonRing(null, cfg, 1337, ground);
assert.equal(mesh.userData.horizonRing.standAt ?? null, null, 'no one woods field past the hand-over');
const forest = mesh.getObjectByName('horizon-forest');
assert.ok(forest, 'Verdant\'s ring forest');
assert.equal(forest.children.filter((c) => c.name.endsWith('-face')).length, 0, 'no face trees');
let maxH = 0;
const p = mesh.geometry.attributes.position;
for (let i = 0; i < p.count; i++) maxH = Math.max(maxH, p.getY(i));
const hedges = mesh.getObjectByName('border-hedgerows');
assert.ok(hedges, 'Verdant\'s hedgerows');
// main's bodies: two side faces of two triangles per section pair, no crowns (the crowned strings carry indices)
assert.equal(hedges.geometry.index, null, 'the hedges are main\'s non-indexed bodies');
const fjord = getMapConfig('fjord');
const fjordGround = createHeightField(1337, fjord);
assert.equal(fjordGround._tuftEdgeM, undefined, 'Nordhavn takes the tufts to the square\'s edge');
const fjordRing = buildHorizonRing(null, fjord, 1337, fjordGround);
assert.equal(typeof fjordRing.userData.horizonRing.standAt, 'function', 'Nordhavn bakes its one woods field');

// the tall grass: nothing past 474 m on Verdant even where the field carries the ring's surface
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), _ringSurfaceAt: () => 0 };
const g = createTallGrass(field, { seed: 3, tier: 'desktop', mapId: 'verdant', qualityScale: () => 1 });
assert.ok(g, 'Verdant\'s sward');
g.dispose();
console.log(`borderBatch6.selftest: batch 6 opted in on ${opted.join(', ')}; Verdant keeps main's edge (no woods field, no face trees, main's hedges, tufts to 474 m, ring max ${maxH.toFixed(0)} m) PASS`);
