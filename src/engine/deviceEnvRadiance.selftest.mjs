import assert from 'node:assert/strict';
import * as THREE from 'three';
import { enforceEnvValidity } from './deviceDiag.ts';

const previousWindow = globalThis.window;
globalThis.window = { __GL_DIAG: { errors: [] } };
const scene = new THREE.Scene(), environment = new THREE.Texture();
let disposedEnvironment = 0;
environment.addEventListener('dispose', () => disposedEnvironment++);
const originalTarget = { name: 'original framebuffer' };
let currentTarget = originalTarget;
let pixelRadiance = 1, readbackFailure = false;
let measuredIntensity = 0, geometryDisposals = 0, materialDisposals = 0, targetDisposals = 0, renders = 0;
const renderer = {
  getRenderTarget() { return currentTarget; },
  setRenderTarget(target) {
    currentTarget = target;
    if (target !== originalTarget) target.addEventListener('dispose', () => targetDisposals++);
  },
  clear() {},
  render(probe, camera) {
    renders++;
    assert.strictEqual(probe.environment, environment);
    assert.equal(camera.isPerspectiveCamera, true);
    assert.equal(probe.children.length, 1, 'unchanged one chrome-sphere validation scene');
    const sphere = probe.children[0];
    assert.equal(sphere.material.metalness, 1); assert.equal(sphere.material.roughness, .15);
    sphere.geometry.addEventListener('dispose', () => geometryDisposals++);
    sphere.material.addEventListener('dispose', () => materialDisposals++);
    measuredIntensity = probe.environmentIntensity;
  },
  readRenderTargetPixels(_target, x, y, width, height, out) {
    assert.deepEqual([x, y, width, height], [8, 8, 1, 1]);
    if (readbackFailure) throw new Error('simulated unsupported readback');
    // Controlled response of this actual probe render, not a replacement of
    // the production validity predicate. Native GPU/NaN behavior stays unproven.
    out.fill(Math.round(20 * pixelRadiance * measuredIntensity));
  },
};

function probe(scale, expected, intensity) {
  scene.environment = environment;
  assert.equal(enforceEnvValidity(renderer, scene, scale), expected);
  assert.equal(measuredIntensity, intensity);
  assert.strictEqual(currentTarget, originalTarget, 'readback always restores renderer owner');
  assert.equal(geometryDisposals, renders); assert.equal(materialDisposals, renders);
  assert.equal(targetDisposals, renders);
}
function fallback() {
  return scene.children.filter(child => child.isAmbientLight);
}
try {
  probe(undefined, true, 1);
  probe(1, true, 1);
  assert.equal(fallback().length, 0);
  pixelRadiance = .035;
  probe(1, false, 1); // Negative control: old unit-scale validation falsely rejects a healthy night.
  assert.equal(fallback()[0].intensity, 3.1);
  probe(.035, true, 1 / .035);
  assert.equal(fallback().length, 0, 'normalized healthy night removes existing false rescue');
  pixelRadiance = 0;
  probe(.035, false, 1 / .035);
  assert.equal(scene.environment, null, 'actual black bake remains rejected');
  assert.equal(fallback().length, 1);
  const light = fallback()[0];
  assert.equal(light.intensity, 3.1 * .035);
  probe(1, false, 1);
  assert.strictEqual(fallback()[0], light); assert.equal(fallback().length, 1);
  assert.equal(light.intensity, 3.1, 'failed day re-bake rescales the same owner');
  probe(.035, false, 1 / .035);
  assert.strictEqual(fallback()[0], light); assert.equal(light.intensity, 3.1 * .035);
  for (const scale of [0, -1, .000001]) {
    probe(scale, false, 1000); assert.equal(light.intensity, 3.1 * .001);
  }
  for (const scale of [2, NaN, Infinity, -Infinity]) {
    probe(scale, false, 1); assert.equal(light.intensity, 3.1);
  }
  readbackFailure = true;
  probe(.035, false, 1 / .035);
  assert.equal(light.intensity, 3.1 * .035, 'unreadable probe still fails with night compensation');
  readbackFailure = false;
  pixelRadiance = .2;
  probe(1, false, 1); // 4+4+4=12 is still rejected: no threshold relaxation.
  pixelRadiance = .25;
  probe(1, true, 1); // 5+5+5=15 passes the original strict threshold.
  assert.equal(fallback().length, 0);
  assert.equal(disposedEnvironment, 0, 'temporary probe never disposes the scene-owned environment');
  const beforeEmpty = renders;
  scene.environment = null;
  assert.equal(enforceEnvValidity(renderer, scene, .035), true);
  assert.equal(renders, beforeEmpty, 'no environment keeps the original no-probe fast path');
} finally {
  globalThis.window = previousWindow;
  environment.dispose();
}
console.log('deviceEnvRadiance self-test: unit-radiance night validation, unchanged threshold/default, scaled fallback reuse and probe cleanup PASS');
