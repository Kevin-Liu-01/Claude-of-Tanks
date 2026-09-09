import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createCanvas } from '@napi-rs/canvas';
import { buildHorizonRing, sampleHorizonGeometry } from './maps/horizon.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { resolveDeviceTier } from '../engine/quality.ts';
import { disposeObject3DResources, releaseObject3DGpuResources } from '../engine/resourceLifetime.ts';
import {
  createVerdantWoodland, mapVerdantOutlandUv, sampleVerdantWoodland,
  VERDANT_HORIZON_FRAGMENT, VERDANT_OUTLAND_SIZE,
} from './horizonVerdant.ts';

const seeds = [1337, 2049, 7719], columns = 287;
const digest = data => createHash('sha256').update(data).digest('hex');
// Authenticated by executing 28d5fd378's horizon.ts (SHA-256 below) through
// Node's TS loader with the maintained map configs, not by refreshing from
// the candidate. Only Verdant's Y and presentation are intentionally changed.
// Source: 211016b3b81afceb03b25efddbb641320d4a36364ab506f2bab7f6d5597aa0cf
const frozenOtherMaps = 'e9a5a2a1f05f8c6382b137015f9336da5518e5e65c6f46605ff8376c561fe00e';
const frozenVerdantXZSkirts = [
  'df323a796eccbe3bcecc2c0b23eeb005b9b4a4019ab1ee63bc15c8ba7fbc339b',
  '540bfd36facb2c02d05f53f6df86412222a52e3c9927e26ea50fdd2ab8aed548',
  'd6c4ddf8002baa2157510b4eba5f485313cdfab8ff8a1b5d9943aef053c828b4',
];

function preservedCoordinates(ring) {
  const values = [];
  for (let i = 0; i < ring.heights.length; i++) {
    values.push(ring.positions[i * 3], ring.positions[i * 3 + 2]);
    if (ring.rows[Math.floor(i / columns)].skirt) values.push(ring.positions[i * 3 + 1]);
  }
  return Buffer.from(new Float32Array(values).buffer);
}

function inspectWoodland(mesh, ring, seed, atlasHeight) {
  const geometry = mesh.geometry, p = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv'), rows = new Set(), sectors = new Set();
  const source = new Map();
  for (let i = 0; i < ring.heights.length; i++) {
    source.set(`${ring.positions[i * 3]}:${ring.positions[i * 3 + 2]}`, i);
  }
  assert.ok(p.count > 600 && p.count <= 1152, 'bounded old two-rank vertex capacity');
  const bytes = Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0)
    + geometry.index.array.byteLength;
  assert.ok(bytes <= 40320, 'bounded woodland allocation stays below the old 43752-byte child ceiling');
  assert.equal(geometry.index.count, p.count / 4 * 6);
  for (let base = 0; base < p.count; base += 4) {
    const endpoints = [];
    for (const bottom of [base, base + 2]) {
      const i = source.get(`${p.getX(bottom)}:${p.getZ(bottom)}`);
      assert.notEqual(i, undefined, 'every root is an actual terrain vertex');
      endpoints.push(i);
      const row = Math.floor(i / columns), height = ring.positions[i * 3 + 1];
      rows.add(row); sectors.add(Math.floor((i % columns) / columns * 8));
      assert.equal(p.getX(bottom), p.getX(bottom + 1));
      assert.equal(p.getZ(bottom), p.getZ(bottom + 1));
      const span = p.getY(bottom + 1) - p.getY(bottom);
      assert.ok(span >= 7.99998 && span <= 12.00002, 'metre-scale crown span');
      const fraction = (height - p.getY(bottom)) / span;
      assert.ok(Math.abs(fraction - .2) < 2e-6, 'terrain intersects the buried opaque apron');
      // Canvas rows are flipped by texture upload. Verify the interpolated
      // root lands inside the authored opaque fill, at both device tiers.
      const v = uv.getY(bottom) * (1 - fraction) + uv.getY(bottom + 1) * fraction;
      const rank = Math.floor(uv.getY(bottom) * 4), band = atlasHeight / 4;
      const pixelY = (1 - v) * atlasHeight;
      const apronBottom = atlasHeight - rank * band - 2;
      assert.ok(pixelY >= apronBottom - band * .27 && pixelY <= apronBottom + 1);
      assert.ok(sampleVerdantWoodland(p.getX(bottom), p.getZ(bottom), seed) >= .32);
    }
    assert.equal(Math.floor(endpoints[0] / columns), Math.floor(endpoints[1] / columns));
    assert.equal(endpoints[1] % columns, (endpoints[0] + 1) % columns,
      'quad follows one real row edge, never bridges a valley or clearing');
    assert.deepEqual(Array.from(geometry.index.array.subarray(base / 4 * 6, base / 4 * 6 + 6)),
      [base, base + 2, base + 1, base + 1, base + 2, base + 3]);
  }
  assert.equal(rows.size, 4, 'lower, middle and outer slopes all receive woodland');
  assert.ok(sectors.size >= 6, 'quota is not consumed in the first quadrant');
  for (const value of geometry.getAttribute('color').array) assert.ok(value >= 0 && value <= 1);
  assert.equal(mesh.material.fog, true); assert.equal(mesh.children.length, 0);
  assert.deepEqual(Object.keys(geometry.attributes).sort(), ['color', 'position', 'uv']);
  return { vertices: p.count, bytes };
}

const nonVerdant = createHash('sha256'), receipts = [];
for (const [seedIndex, seed] of seeds.entries()) {
  for (const id of MAP_IDS) {
    const ring = sampleHorizonGeometry(getMapConfig(id), seed);
    if (id !== 'verdant') {
      nonVerdant.update(id + ':' + seed);
      nonVerdant.update(Buffer.from(ring.positions.buffer));
      nonVerdant.update(Buffer.from(ring.heights.buffer));
      nonVerdant.update(JSON.stringify(ring.rows));
      continue;
    }
    assert.equal(digest(preservedCoordinates(ring)), frozenVerdantXZSkirts[seedIndex]);
    assert.equal(ring.rows.length, 10); assert.equal(ring.positions.length, 8610);
    assert.ok(ring.maxHeight > 50 && ring.maxHeight < 120, 'low rolling outlands, not a tall mountain wall');
    for (const value of ring.positions) assert.ok(Number.isFinite(value));
    assert.deepEqual(ring.positions, sampleHorizonGeometry(getMapConfig(id), seed).positions);
    for (const height of [64, 128]) {
      const atlas = new THREE.Texture({ height });
      const context = { ...ring, seed, layers: 2, atlas, colors: new Float32Array(ring.positions.length).fill(.5) };
      const mesh = createVerdantWoodland(context);
      receipts.push({ seed, height, ...inspectWoodland(mesh, ring, seed, height) });
      const damaged = mesh.geometry.getAttribute('position');
      const original = damaged.getY(0); damaged.setY(0, original + 1);
      assert.throws(() => inspectWoodland(mesh, ring, seed, height), /opaque apron/,
        'floating-root mutation is rejected');
      damaged.setY(0, original);
      mesh.geometry.dispose(); mesh.material.dispose(); atlas.dispose();
    }
  }
}
assert.equal(nonVerdant.digest('hex'), frozenOtherMaps, '29 nonpilot maps remain byte-exact for three seeds');
const probe = new THREE.BufferGeometry();
probe.setAttribute('position', new THREE.Float32BufferAttribute([-100, 5, 200, -100, 5, 200], 3));
probe.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 10, 0], 2));
mapVerdantOutlandUv(probe);
assert.equal(probe.getAttribute('uv').getX(0), Math.fround(-100 / VERDANT_OUTLAND_SIZE + .5));
assert.equal(probe.getAttribute('uv').getY(0), Math.fround(200 / VERDANT_OUTLAND_SIZE + .5));
assert.deepEqual(Array.from(probe.getAttribute('uv').array.slice(0, 2)),
  Array.from(probe.getAttribute('uv').array.slice(2)), 'closed seam uses identical world texture coordinates');
assert.equal((VERDANT_HORIZON_FRAGMENT.match(/texture2D\(/g) || []).length, 2);
probe.dispose();
// Exercise the real builder and Canvas2D painter, including the shader-only
// texture and supported child mesh. This is CPU/lifetime evidence, not GPU timing.
function inspectBuiltHorizon(seed, scale) {
  const mesh = buildHorizonRing(null, getMapConfig('verdant'), seed);
  const ring = sampleHorizonGeometry(getMapConfig('verdant'), seed);
  const p = mesh.geometry.getAttribute('position');
  assert.equal(p.count, 2880);
  assert.equal(mesh.geometry.index.count, 15498);
  for (let row = 0; row < ring.rows.length; row++) for (let c = 0; c < columns; c++) {
    const source = (row * columns + c) * 3, uploaded = (row * (columns + 1) + c) * 3;
    assert.deepEqual(p.array.subarray(uploaded, uploaded + 3), ring.positions.subarray(source, source + 3),
      'production renderer uploads the exact sampled low hills');
  }
  assert.equal(mesh.children.length, 1);
  const woodland = mesh.children[0], atlas = woodland.material.map;
  inspectWoodland(woodland, ring, seed, atlas.image.height);
  assert.deepEqual([atlas.image.width, atlas.image.height], [768 * scale, 128 * scale]);
  const pixels = atlas.image.getContext('2d').getImageData(0, 0, atlas.image.width, atlas.image.height).data;
  let opaque = 0, clear = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] === 255) opaque++;
    if (pixels[i] === 0) clear++;
  }
  assert.ok(opaque > pixels.length / 4 * .2 && clear > pixels.length / 4 * .1,
    'native atlas contains both opaque woodland and transparent crown gaps');
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <map_fragment>\n#include <color_fragment>' };
  mesh.material.onBeforeCompile(shader, null);
  assert.ok(shader.fragmentShader.includes(VERDANT_HORIZON_FRAGMENT));
  assert.deepEqual([mesh.material.map.image.width, mesh.material.map.image.height], [512 * scale, 192 * scale]);
  // Shared detail-noise texture has always stayed 256px on both tiers.
  assert.equal(shader.uniforms.uDetail2.value.image.width, 256);
  assert.equal(releaseObject3DGpuResources(mesh, { releaseMaterials: false }).textures, 3);
  const disposed = disposeObject3DResources(mesh);
  assert.deepEqual([disposed.geometries, disposed.materials, disposed.textures], [2, 2, 3],
    'both geometry owners and all three textures are released at final eviction');
}
const globals = new Map(['document', 'window'].map(key => [key, globalThis[key]]));
try {
  globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
  inspectBuiltHorizon(1337, 1);
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem() { return null; } } };
  assert.equal(resolveDeviceTier(), 'mobile');
  inspectBuiltHorizon(1337, .5);
} finally {
  for (const [key, value] of globals) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
console.log('horizonVerdant smoke PASS', JSON.stringify(receipts));
