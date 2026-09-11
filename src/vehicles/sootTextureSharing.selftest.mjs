import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createTankMaterials, makeBurnUniforms, applyBurnHook } from './materials.ts';

// Real Canvas pixels and production material owners. The independent painter
// freezes the pre-sharing soot formula; texture sharing must not change it.
const require = createRequire(import.meta.url);
const { createCanvas, Path2D } = require('@napi-rs/canvas');
const saved = ['document', 'Path2D'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
let canvases = 0;
globalThis.Path2D = Path2D;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas'); canvases++; return createCanvas(1, 1);
} };
const owners = new Set();
function owner(id, engine, seed = 7) {
  const value = createTankMaterials({ id, era: 'ww2', visual: {
    base: '#4a553c', scheme: 'solid', plateLines: false,
  } }, engine, seed, 'low', 'factory');
  owners.add(value); return value;
}
function release(value) { if (owners.delete(value)) value.dispose(); }
function pixels(texture) {
  const c = texture.image;
  return Buffer.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
}
function baseline(aniso) {
  const canvas = createCanvas(256, 256), ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const gradient = ctx.createRadialGradient(128, 108, 8, 128, 116, 118);
  gradient.addColorStop(0, 'rgba(22,20,17,0.72)');
  gradient.addColorStop(0.55, 'rgba(26,23,19,0.36)');
  gradient.addColorStop(1, 'rgba(26,23,19,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 12; index++) {
    const x = 34 + index * 17 + ((index * 37) % 9);
    const length = 60 + ((index * 53) % 78);
    const streak = ctx.createLinearGradient(0, 110, 0, 110 + length);
    streak.addColorStop(0, 'rgba(20,18,15,0.5)');
    streak.addColorStop(1, 'rgba(20,18,15,0)');
    ctx.fillStyle = streak; ctx.fillRect(x, 110, 4 + (index % 3) * 3, length);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = aniso;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
function sampler(t) {
  return Object.fromEntries(['mapping', 'channel', 'wrapS', 'wrapT', 'magFilter',
    'minFilter', 'anisotropy', 'format', 'internalFormat', 'type', 'colorSpace',
    'generateMipmaps', 'premultiplyAlpha', 'flipY', 'unpackAlignment', 'rotation',
    'matrixAutoUpdate'].map(key => [key, t[key]]));
}

try {
  const engine = { anisotropy: 4 };
  const a = owner('soot-a', engine), b = owner('soot-b', engine, 31);
  const before = canvases, ma = a.decal('soot'), mb = b.decal('soot');
  assert.equal(canvases - before, 1, 'two visuals allocate one immutable soot canvas');
  assert.notEqual(ma, mb, 'materials remain independently owned');
  assert.equal(ma.map, mb.map, 'same engine and sampler share the actual texture');
  assert.equal(a.decal('soot'), ma, 'repeated decal acquisition retains local identity');
  const original = baseline(4);
  assert.deepEqual(pixels(ma.map), pixels(original), 'every soot byte matches pre-sharing painter');
  assert.deepEqual(sampler(ma.map), sampler(original), 'all sampler/color settings remain unchanged');
  for (const key of ['offset', 'repeat', 'center', 'matrix']) {
    assert.deepEqual(ma.map[key].toArray(), original[key].toArray());
  }
  original.dispose();

  // Applying burn hooks to real materials cannot couple the two visuals.
  const burnA = makeBurnUniforms(7), burnB = makeBurnUniforms(31);
  assert.equal(applyBurnHook(ma, burnA), true);
  assert.equal(applyBurnHook(mb, burnB), true);
  assert.equal(applyBurnHook(ma, burnB), false, 'another visual cannot adopt an existing burn owner');
  burnA.uBurnT.value = 3; burnA.uBurnGlow.value = 0.8;
  assert.equal(burnB.uBurnT.value, -1); assert.equal(burnB.uBurnGlow.value, 0);
  ma.opacity = 0.25; assert.equal(mb.opacity, 1);
  const texture = ma.map, bytes = pixels(texture);
  let disposals = 0; texture.addEventListener('dispose', () => disposals++);
  release(a); assert.equal(disposals, 0, 'releasing one visual preserves the other lease');
  assert.deepEqual(pixels(mb.map), bytes);
  const c = owner('soot-c', engine), mc = c.decal('soot', 'ignored');
  assert.equal(mc.map, texture, 'soot is independent of spec, seed and unused text');
  release(b); assert.equal(disposals, 0);
  release(c); assert.equal(disposals, 1, 'final lease disposes exactly once');
  const d = owner('soot-d', engine), md = d.decal('soot');
  assert.notEqual(md.map, texture, 'released entries are evicted');
  assert.deepEqual(pixels(md.map), bytes);
  const e = owner('soot-e', { anisotropy: 4 });
  assert.notEqual(e.decal('soot').map, md.map, 'engine contexts do not share lifetimes');
  engine.anisotropy = 8;
  const f = owner('soot-f', engine);
  assert.notEqual(f.decal('soot').map, md.map, 'different samplers do not share');
  assert.equal(f.decal('soot').map.anisotropy, 8);
  assert.notEqual(d.decal('star').map, e.decal('star').map, 'other decals remain per visual');
  const noEngineA = owner('soot-no-engine-a', null), noEngineB = owner('soot-no-engine-b', null);
  assert.notEqual(noEngineA.decal('soot').map, noEngineB.decal('soot').map);
  const cancelled = owner('soot-cancel-before-decal', engine), allocated = canvases;
  release(cancelled); assert.equal(canvases, allocated, 'cancelled owner creates no late soot work');
  console.log('[soot-texture-sharing] PASS pixels, samplers, scoped leases, eviction, burn independence and cleanup');
} finally {
  for (const value of owners) value.dispose();
  owners.clear();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}
