// Trees lane (2026-10-08, the gauntlet's wave 278 on Saltmere Bay: "the young trees and shrubs ... are sparse clusters of
// flat cut-out leaf cards on bare sticks that read as stickers rather than wind-pruned coastal scrub"): on the real seeded
// producer, Saltmere's field shrubs grow as the coast's gorse — their material paints the gorse shrub atlas, their
// cushions carry half again a shrub's sprays — every one turned with its leeward side (the cushion's local +x) inland,
// west, within 15° of the wind off the bay on the east edge (treeBiomes.ts TreeBiome.wind); a map without a wind keeps
// its shrubs' free yaw (Verdant). A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeShrub, treeBiomeWindToward } from './treeBiomes.ts';
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

assert.equal(treeBiomeShrub('coastal'), 'gorse');
assert.equal(treeBiomeWindToward('coastal'), 270);
assert.equal(treeBiomeWindToward('verdant'), null, 'Verdant names no wind');

/** The field shrubs' leeward bearings (each instance's local +x on the ground), in degrees (0 = +z, 90 = +x). */
function leewardBearings(veg) {
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), x = new THREE.Vector3();
  const out = [];
  const meshes = veg.group.children.filter((m) => m.isInstancedMesh && m.userData.bush && m.count > 0);
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m4); m4.decompose(p, q, s);
      x.set(1, 0, 0).applyQuaternion(q);
      out.push(((Math.atan2(x.x, x.z) * 180 / Math.PI) + 360) % 360);
    }
  }
  return { meshes, bearings: out };
}
const within = (b, target, tol) => Math.abs(((b - target + 540) % 360) - 180) <= tol;

const restore = canvasFixture();
const report = {};
try {
  for (const mapId of ['coastal', 'verdant']) {
    const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg);
    const veg = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    try {
      const { meshes, bearings } = leewardBearings(veg);
      assert.ok(bearings.length > 50, `${mapId}: field shrubs to read (${bearings.length})`);
      const west = bearings.filter((b) => within(b, 270, 15)).length / bearings.length;
      report[mapId] = { shrubs: bearings.length, west: +west.toFixed(3) };
      if (mapId === 'coastal') {
        assert.equal(west, 1, `Saltmere: every gorse cushion turned with its leeward side inland (${(west * 100).toFixed(1)} % within 15°)`);
        const atlas = meshes.map((m) => (Array.isArray(m.material) ? m.material[0] : m.material)?.map?.name);
        assert.ok(atlas.every((n) => n === 'shrubAtlas:gorse'), `Saltmere's shrubs paint the gorse shrub atlas (${[...new Set(atlas)]})`);
        const sprays = meshes.map((m) => m.geometry.getAttribute('position').count);
        report[mapId].vertices = sprays;
      } else {
        assert.ok(west < 0.2, `Verdant keeps its shrubs' free yaw (${(west * 100).toFixed(1)} % within 15° of west)`);
      }
    } finally { veg.dispose(); disposeObject3DResources(veg.group); }
  }
} finally { restore(); }
console.log(JSON.stringify(report));
console.log('coastalScrub.selftest: Saltmere\'s shrubs grow as the coast\'s gorse, every cushion swept inland by the wind off the bay PASS');
