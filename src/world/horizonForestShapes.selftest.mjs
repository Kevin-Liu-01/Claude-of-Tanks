// Trees round 2 (2026-10-03, asked by the mountains lane): the horizon ring forest's tree shapes do not depend on the
// ring's heights. buildHorizonForest (horizonVista.ts) drew its placements and then its class shapes from one stream,
// so a change to the ring's heights re-rolled every shape: the near class's lobe trees, shadow-only casters once the
// impostors draw the visible ring, swung by up to ±44k triangles a map (Railyard +29.6k, Steppe −44k). Each class now
// draws its shape from its own stream, seeded by the ring's seed and the class. On Railyard's real seeded ring and a
// 3 % taller one (cfg.horizon.amp), the placements move and re-thin while every pool's template is byte-identical,
// so the shadow pools' triangles hold exactly. No GPU.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { createHeightField } from './terrain.ts';
import { buildHorizonRing } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
globalThis.ImageData = ImageData;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };

const renderer = {
  getRenderTarget: () => null, setRenderTarget() {}, render() {}, clear() {}, getClearColor: (target) => target,
  getClearAlpha: () => 1, setClearColor() {}, autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
};
const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

function ringForest(id, ampScale) {
  const base = getMapConfig(id);
  const cfg = { ...base, horizon: { ...(base.horizon ?? {}), amp: (base.horizon?.amp ?? 1) * ampScale } };
  const ring = buildHorizonRing({ renderer, setupShadowMaterial() {} }, cfg, 1337, createHeightField(1337, cfg));
  const forest = ring.getObjectByName('horizon-forest');
  assert.ok(forest, `${id} x${ampScale}: the ring forest`);
  return { ring, forest };
}

const rings = [];
try {
  const a = ringForest('railyard', 1), b = ringForest('railyard', 1.03);
  rings.push(a.ring, b.ring);
  const packedA = a.forest.userData.horizonForest.placements, packedB = b.forest.userData.horizonForest.placements;
  assert.ok(packedA.length !== packedB.length || packedA.some((v, i) => v !== packedB[i]),
    'the taller ring moves its trees (the tweak reaches the placements)');
  const poolsA = new Map(a.forest.children.map((mesh) => [mesh.name, mesh]));
  let shadowA = 0, shadowB = 0, compared = 0;
  for (const meshB of b.forest.children) {
    const meshA = poolsA.get(meshB.name);
    assert.ok(meshA, `${meshB.name}: the pool stands on both rings`);
    const posA = meshA.geometry.attributes.position.array, posB = meshB.geometry.attributes.position.array;
    assert.equal(triangles(meshB.geometry), triangles(meshA.geometry), `${meshB.name}: the template's triangles hold`);
    assert.ok(posA.length === posB.length && posA.every((v, i) => v === posB[i]), `${meshB.name}: the template is the same shape`);
    const colA = meshA.geometry.attributes.color?.array, colB = meshB.geometry.attributes.color?.array;
    if (colA || colB) assert.ok(colA && colB && colA.every((v, i) => v === colB[i]), `${meshB.name}: the template keeps its paint`);
    if (meshA.castShadow) shadowA += triangles(meshA.geometry) * meshA.count;
    if (meshB.castShadow) shadowB += triangles(meshB.geometry) * meshB.count;
    compared++;
  }
  assert.ok(compared >= 3, `the near, band and range pools compared (${compared})`);
  // the near class's count is set by the depth rank and its cap, so its shadow geometry holds — to within a tree or two
  // (2026-10-04, the map-borders lane: the road exits now end at the ranges' foot, terrain.ts roadExitOnRing, so a
  // taller ring moves their avenues, rides and villages and with them the near class's mix of conifers and broadleaves:
  // Railyard 231312 -> 231240 triangles; a re-rolled shape swung it by up to 44k)
  // (the borders lane, round 4, 2026-10-08: the near band's woods are copses now — glades through them, the corners'
  // fields open past the edge — and Railyard's near class stands under its cap of 1500, so a taller ring re-thins it by
  // a tree or two in a hundred: 1362 -> 1387; at the cap it holds exactly)
  const nearA = a.forest.userData.horizonForest.near, nearB = b.forest.userData.horizonForest.near;
  if (nearA >= 1500 && nearB >= 1500) assert.equal(nearB, nearA, 'the near class\'s count holds at its cap');
  else assert.ok(Math.abs(nearB - nearA) <= nearA * 0.03, `the near class's count holds within a few trees in a hundred (${nearA} -> ${nearB})`);
  assert.ok(Math.abs(shadowB - shadowA) <= shadowA * 0.03, `the near class's shadow triangles hold (${shadowA} -> ${shadowB})`);
  console.log(`horizonForestShapes.selftest: Railyard's ring 3 % taller: ${compared} pool templates identical, shadow ${shadowA} -> ${shadowB} triangles, ` +
    `${a.forest.userData.horizonForest.instances} -> ${b.forest.userData.horizonForest.instances} trees`);
} finally {
  for (const ring of rings) disposeObject3DResources(ring);
  globalThis.document = savedDocument;
  globalThis.ImageData = savedImageData;
}
