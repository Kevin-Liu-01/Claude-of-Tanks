// sceneProbeTarget.selftest.mjs — the scene probes draw in the production scene target's format (transitions-249).
//
// The GPU builds a pipeline per program, vertex layout, blend and attachment format: an RGBA8, single-sample probe of
// the whole scene built pipelines no frame used (13 s of a cold desktop battle entry's covered watchdog). With a
// production source configured, the probe draws into a target of the source's colour type, samples and depth, copies
// that into the RGBA8 target its calibrated readback reads, and owns and disposes both; without one it is unchanged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

globalThis.window = { __GL_DIAG: { errors: [] } };
const { runSceneBlackWatchdog, setSceneProbeTargetSource } = await import('./deviceDiag.ts');

function fixture(sample) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const camera = new THREE.PerspectiveCamera();
  const callerTarget = { name: 'caller' };
  const bound = { value: callerTarget, face: 0, mip: 0 };
  const owned = new Set();
  const disposed = new Set();
  const renders = [];
  const reads = [];
  const renderer = {
    shadowMap: { enabled: true },
    info: { programs: [] },
    getRenderTarget: () => bound.value,
    getActiveCubeFace: () => bound.face,
    getActiveMipmapLevel: () => bound.mip,
    setRenderTarget(value, face = 0, mip = 0) {
      if (value && value !== callerTarget && !owned.has(value)) {
        owned.add(value);
        value.addEventListener('dispose', () => { disposed.add(value); });
      }
      bound.value = value;
      bound.face = face;
      bound.mip = mip;
    },
    clear() {},
    render(renderScene, renderCamera) {
      renders.push({ scene: renderScene, camera: renderCamera, target: bound.value });
    },
    readRenderTargetPixels(value, x, y, width, height, pixels) {
      reads.push({ target: value, bound: bound.value, rect: [x, y, width, height] });
      pixels.fill(sample);
    },
  };
  return { scene, camera, renderer, callerTarget, bound, owned, disposed, renders, reads };
}

// a production HDR, multisampled scene target: the probe draws in its format and reads an RGBA8 copy
{
  const production = new THREE.WebGLRenderTarget(320, 180, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(320, 180),
    stencilBuffer: false,
    samples: 4,
  });
  setSceneProbeTargetSource(() => production);
  const f = fixture(120);
  const result = runSceneBlackWatchdog(f.renderer, f.scene, f.camera);
  assert.ok(result.before > 6, 'a healthy frame still reads healthy through the copy');
  assert.equal(f.renders.length, 2, 'one scene draw and one copy draw for a healthy reading');
  const [draw, copy] = f.renders;
  assert.ok(draw.scene === f.scene, 'the caller scene draws first');
  assert.equal(draw.target.texture.type, THREE.HalfFloatType, 'in the production colour type');
  assert.equal(draw.target.samples, 4, 'with the production sample count');
  assert.ok(draw.target.depthTexture?.isDepthTexture, 'with a depth texture like the production target');
  assert.equal(draw.target.depthTexture.type, production.depthTexture.type, 'of the production depth type');
  assert.equal(draw.target.stencilBuffer, false);
  assert.deepEqual([draw.target.width, draw.target.height], [64, 36], 'at the probe size');
  assert.ok(copy.scene !== f.scene, 'the copy draws its own quad, not the scene');
  assert.equal(copy.target.texture.type, THREE.UnsignedByteType, 'into an RGBA8 target');
  assert.equal(copy.target.samples, 0);
  assert.deepEqual([copy.target.width, copy.target.height], [64, 36]);
  assert.equal(f.reads.length, 1);
  assert.equal(f.reads[0].target, copy.target, 'the readback reads the RGBA8 copy');
  assert.equal(f.reads[0].bound, copy.target, 'with the copy bound');
  assert.deepEqual(f.reads[0].rect, [0, 0, 64, 22], 'the calibrated band is unchanged');
  assert.equal(f.bound.value, f.callerTarget, 'the caller target is restored');
  assert.equal(f.owned.size, 2, 'two owned targets');
  assert.deepEqual([...f.owned].filter((target) => !f.disposed.has(target)), [], 'both owned targets are disposed');
  production.dispose();
}

// an RGBA8 single-sample production target, or none: the probe keeps its one RGBA8 target
for (const source of [() => new THREE.WebGLRenderTarget(8, 8), () => null, null]) {
  setSceneProbeTargetSource(source);
  const f = fixture(120);
  runSceneBlackWatchdog(f.renderer, f.scene, f.camera);
  assert.equal(f.renders.length, 1, 'no copy draw without a different production format');
  assert.equal(f.renders[0].target.texture.type, THREE.UnsignedByteType);
  assert.equal(f.reads[0].target, f.renders[0].target, 'the drawn target is the one read');
  assert.equal(f.owned.size, 1);
  assert.equal(f.disposed.size, 1);
}

// a throwing source is not a reason to skip the probe
{
  setSceneProbeTargetSource(() => { throw new Error('post not ready'); });
  const f = fixture(120);
  const result = runSceneBlackWatchdog(f.renderer, f.scene, f.camera);
  assert.ok(result.before > 6);
  assert.equal(f.renders.length, 1);
}
setSceneProbeTargetSource(null);

// the async watchdog draws and copies the same way before its PBO readback; production wires the scene AA target
const source = readFileSync(new URL('./deviceDiag.ts', import.meta.url), 'utf8');
assert.match(source, /async function measureSceneBandAsync\([\s\S]*?const targets = createSceneProbeTargets\(64, 36\);[\s\S]*?renderer\.setRenderTarget\(targets\.draw\);[\s\S]*?targets\.copy\(renderer\);\s*return beginRgba8Readback\(/,
  'the async probe draws in the production format and reads the RGBA8 copy');
assert.match(source, /finally \{\s*targets\.dispose\(\);\s*finishSceneProbeTiming\(timing\);/,
  'the async probe disposes both targets after its readback settles');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /const post = createPost\(renderer, scene, camera\);[\s\S]{0,400}setSceneProbeTargetSource\(\(\) => post\.sceneAA\.sceneTarget\);/,
  'production mirrors the scene AA target');

console.log('sceneProbeTarget.selftest: probes draw in the production format, read an RGBA8 copy, own and dispose both');
