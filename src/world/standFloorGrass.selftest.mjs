// Trees round 8 pass B (2026-10-07, the ground lane: "cull the midfield tufts under `standFloor: 'canopy'`, so the stand
// floor shows"): on a map whose stand floor spreads as the drawn crowns, the midfield tufts thin under the stands — 0.85
// of them under a closed canopy, by a hash of each tuft's stored place — whichever way its chunk was built. On the real
// seeded Frontier producer:
//   - the synchronous build (every chunk built before the trees stand, culled once the cover is set) keeps no tuft the
//     rule drops, and drops some;
//   - the asynchronous build (the first-view ring before the cover, the rest built by update() after it, culled as they
//     are made) holds, in every chunk both builds made, exactly the synchronous build's tufts — no chunk line;
// (a map without the option never reaches the rule: makeTuft and the drop are gated on it.) A construction receipt: no
// GPU, no art claim.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation, createVegetationAsync } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData', 'location'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  globalThis.location = { search: '' };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

const HALF = 512, CHUNK = 128;
/** The midfield chunk meshes: frustum-culled grass instances with their chunk's sphere (the carpet's are never culled). */
function midfield(veg) {
  return veg.group.children.filter((m) => m.isInstancedMesh && m.frustumCulled && m.boundingSphere
    && /world-grass-wind/.test(m.material?.customProgramCacheKey?.() ?? ''));
}
/** A chunk mesh's tufts: its count before any update (the drop compacts in place), its exact array once built later. */
function noteTotals(veg) {
  for (const m of midfield(veg)) if (m.userData.cotTotal === undefined) m.userData.cotTotal = m.count;
}
/** Every kept tuft by its chunk (the cell of its mesh's sphere, inside the chunk): matrix and colour records, sorted. */
function tuftsByChunk(veg) {
  const chunks = new Map();
  for (const m of midfield(veg)) {
    const e = m.instanceMatrix.array, c = m.instanceColor.array, o = m.boundingSphere.center;
    const key = `${Math.floor((o.x + HALF) / CHUNK)},${Math.floor((o.z + HALF) / CHUNK)}`;
    const list = chunks.get(key) ?? chunks.set(key, []).get(key);
    for (let i = 0; i < m.userData.cotTotal; i++) list.push([...e.subarray(i * 16, i * 16 + 16), ...c.subarray(i * 3, i * 3 + 3)].join(','));
  }
  for (const list of chunks.values()) list.sort();
  return chunks;
}
const hash = (x, z, salt) => { const raw = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453; return raw - Math.floor(raw); };
/** The woods mask's bilinear cover (vegetation.ts woodsCoverAt), from the exported mask. */
function coverOf(mask) {
  const size = 256, cell = 1024 / 256;
  return (x, z) => {
    const u = Math.max(0, Math.min(size - 1.001, (x + 512) / cell - 0.5));
    const v = Math.max(0, Math.min(size - 1.001, (z + 512) / cell - 0.5));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * size + i;
    const a = mask[k] + (mask[k + 1] - mask[k]) * fu;
    const b = mask[k + size] + (mask[k + size + 1] - mask[k + size]) * fu;
    return a + (b - a) * fv;
  };
}

const restore = canvasFixture();
try {
  const cfg = getMapConfig('frontier'), field = createHeightField(1337, cfg);
  assert.equal(cfg.vegetation.standFloor, 'canopy', 'Frontier spreads its stand floor as the drawn crowns');
  const sync = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
  const lazy = await createVegetationAsync(field, { setupShadowMaterial() {} }, 2001, cfg);
  try {
    noteTotals(sync); noteTotals(lazy);
    const dropped = sync.group.userData.midfieldStandFloor?.dropped ?? 0;
    assert.ok(dropped > 1000, `the synchronous build drops the tufts under the stands (${dropped})`);
    // no kept tuft is one the rule drops
    const cover = coverOf(sync._woodsMask);
    let kept = 0, underClosed = 0;
    for (const m of midfield(sync)) {
      const e = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i++) {
        const x = e[i * 16 + 12], z = e[i * 16 + 14], w = cover(x, z);
        assert.ok(!(hash(x, z, 211) < w * 0.85), `a kept tuft the rule drops at (${x}, ${z})`);
        kept++; if (w > 0.95) underClosed++;
      }
    }
    const before = tuftsByChunk(lazy);
    const builtAtLoad = new Set(before.keys());
    // drive the camera over the far woods: update() builds the deferred chunks there after the cover is set
    const clusters = [...sync._clusters].filter((c) => c.r >= 20)
      .sort((a, b) => Math.hypot(b.x - field._layout.spawns.player.x, b.z - field._layout.spawns.player.z)
        - Math.hypot(a.x - field._layout.spawns.player.x, a.z - field._layout.spawns.player.z)).slice(0, 2);
    const cam = new THREE.Vector3(), fwd = new THREE.Vector3(1, 0, 0);
    for (const c of clusters) {
      cam.set(c.x, field.getHeightAt(c.x, c.z) + 4, c.z);
      for (let k = 0; k < 4000; k++) {
        lazy.update(0, cam, fwd, null);
        const s = lazy.getGrassWorkState();
        if (!s.active && s.pendingVisible === 0 && k > 3) break;
      }
    }
    // (a chunk built by update(): exact-length arrays, its count the density rolloff's prefix by now)
    for (const m of midfield(lazy)) if (m.userData.cotTotal === undefined) m.userData.cotTotal = m.instanceMatrix.array.length / 16;
    const after = tuftsByChunk(lazy), all = tuftsByChunk(sync);
    const later = [...after.keys()].filter((k) => !builtAtLoad.has(k));
    assert.ok(later.length >= 2, `chunks built after the cover (${later.length})`);
    let compared = 0;
    for (const [chunk, list] of after) {
      assert.deepEqual(list, all.get(chunk), `chunk ${chunk}: the same tufts in both builds`);
      compared += list.length;
    }
    console.log(JSON.stringify({ map: 'frontier', dropped, kept, underClosed, cellsAtLoad: builtAtLoad.size, cellsLater: later.length, compared }));
  } finally {
    for (const v of [sync, lazy]) { v.dispose(); disposeObject3DResources(v.group); }
  }
} finally { restore(); }
console.log('standFloorGrass.selftest: the midfield tufts thin under the stands on a canopy-floor map, the same tufts however a chunk was built PASS');
