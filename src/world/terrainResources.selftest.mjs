import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildTerrainMeshes, createLayout } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources, releaseObject3DGpuResources } from '../engine/resourceLifetime.ts';

// Actual terrain builder and shader bindings; canvas pixels/GPU uploads are
// intentionally not simulated by this lifetime test. The native repeat-world
// probe verifies resident texture counts after these disposal events.
const originals = { document: globalThis.document, Image: globalThis.Image, ImageData: globalThis.ImageData };
globalThis.ImageData = class { constructor(data) { this.data = data; } };
globalThis.Image = class {
  width = 8; height = 8;
  set src(value) { this.url = value; queueMicrotask(() => this.onload?.()); }
};
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    }, { get(target, key) { return target[key] ?? (() => {}); } });
    canvas.getContext = () => context;
    return canvas;
  },
};

try {
  const config = getMapConfig('verdant');
  const field = { getHeightAt: () => 0, _layout: createLayout(config), _mesaW: null };
  const group = buildTerrainMeshes(field, {
    anisotropy: 4,
    setupShadowMaterial(material, hook) { material.onBeforeCompile = shader => hook?.(shader); },
  }, config);
  const results = await group.userData.sourcedTexturesReady;
  assert.ok(results.every(row => row.applied && !row.failures.length), 'in-place sourced swaps actually settle');
  const material = group.children.find(child => child.material?.customProgramCacheKey() === 'world-terrain-splat-v23').material;
  const compile = () => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader, null);
    return shader;
  };
  const shader = compile();
  const textures = Object.values(shader.uniforms).map(uniform => uniform.value).filter(value => value?.isTexture);
  assert.equal(new Set(textures).size, 10, 'eight surface maps + mask + noise, with no added texture');
  assert.ok(textures.every(texture => !Object.values(material).includes(texture)),
    'the regression really covers shader-only identities invisible to ordinary material traversal');
  const images = textures.map(texture => texture.image);
  const disposals = new Map(textures.map(texture => [texture, 0]));
  textures.forEach(texture => texture.addEventListener('dispose', () => disposals.set(texture, disposals.get(texture) + 1)));
  assert.equal(disposeObject3DResources(group, { preserveRoots: [group] }).textures, 0,
    'preserved owners protect hidden textures too');
  for (let cycle = 1; cycle <= 3; cycle++) {
    releaseObject3DGpuResources(group, { releaseMaterials: false });
    textures.forEach((texture, index) => {
      assert.equal(disposals.get(texture), cycle, 'all hidden maps release once per suspension');
      assert.equal(texture.image, images[index], 'suspension preserves CPU images for reupload');
    });
    const resumed = compile();
    assert.deepEqual(Object.values(resumed.uniforms).map(uniform => uniform.value).filter(value => value?.isTexture), textures,
      'recompiled shader uses exactly the owned textures after resume');
  }
  disposeObject3DResources(group);
  assert.ok(textures.every(texture => disposals.get(texture) === 4), 'eviction releases the full live terrain texture set');
} finally {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
  }
}
console.log('terrainResources.selftest: real terrain build owns all 10 hidden maps through sourced swap, suspend/resume and eviction');
