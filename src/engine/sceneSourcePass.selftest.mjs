import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { SceneAAPass, SceneAerialPass } from './sceneSourcePass.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

// Execute the real classes and installed composer/shader-pass scheduling.
// The renderer records attachment/uniform ownership, not simulated GPU pixels.
const source = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.match(source, /new SceneAerialPass\(AerialShader, sceneTarget\)/);
assert.match(source, /sceneAA\.directColorConsumer = aerial/);
assert.match(source, /aerial\.uniforms\.tDepth\.value = sceneDepth/);
assert.match(source, /composer\.addPass\(sceneAA\)[\s\S]*?composer\.addPass\(aerial\)/);

function fixture(samples = 0) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(LATE_FX_LAYER);
  camera.layers.enable(5);
  const initialLayers = camera.layers.mask;
  const target = new THREE.WebGLRenderTarget(320, 180, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(320, 180), samples,
  });
  const ping = new THREE.WebGLRenderTarget(320, 180, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  let current = null;
  let throwOn = null;
  const draws = [];
  const clears = [];
  const lineage = new Map();
  let frame = 0;
  const renderer = {
    autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: false,
    getPixelRatio: () => 1,
    getSize: v => v.set(320, 180),
    getRenderTarget: () => current,
    setRenderTarget: value => { current = value; },
    clear: (...flags) => clears.push([current, ...flags]),
    render: (object, view) => {
      const isScene = object === scene;
      const kind = isScene ? 'scene' : object.material.name;
      draws.push({ kind, target: current, source: object.material?.uniforms?.tDiffuse?.value });
      if (kind === throwOn) throw new Error('owned render failure');
      if (isScene) {
        assert.equal(current, target);
        assert.equal(view, camera);
        assert.equal(camera.layers.mask, initialLayers & ~(1 << LATE_FX_LAYER));
        assert.equal(renderer.autoClear, false);
        lineage.set(target.texture, `scene-${++frame}`);
      } else {
        const input = object.material.uniforms.tDiffuse.value;
        assert.notEqual(input, current?.texture, 'color source must not alias its destination');
        lineage.set(current?.texture ?? 'screen', lineage.get(input));
      }
    },
  };
  const scenePass = new SceneAAPass(scene, camera, target);
  const aerialShader = { ...CopyShader, name: 'AerialProbe', uniforms: {
    ...CopyShader.uniforms, tDepth: { value: null },
  } };
  const aerial = new SceneAerialPass(aerialShader, target);
  // Match createPost: ShaderPass clones the shader template's uniforms, then
  // the runtime binds its borrowed depth texture explicitly.
  aerial.uniforms.tDepth.value = target.depthTexture;
  scenePass.directColorConsumer = aerial;
  const composer = new EffectComposer(renderer, ping);
  const downstream = new ShaderPass({ ...CopyShader, name: 'DownstreamProbe' });
  composer.addPass(scenePass);
  composer.addPass(aerial);
  composer.addPass(downstream);
  return { scene, camera, initialLayers, target, renderer, scenePass, aerial,
    composer, downstream, draws, clears, lineage, setFailure: value => { throwOn = value; } };
}

// Both swap parities, with and without a swapping downstream consumer, over
// repeated frames. Every normal path removes exactly one identity copy draw.
for (const samples of [0, 2, 4]) {
  const f = fixture(samples);
  for (let i = 0; i < 12; i++) {
    f.downstream.enabled = i % 3 !== 0;
    f.draws.length = 0;
    f.composer.render(1 / 60);
    assert.equal(f.lineage.get('screen'), `scene-${i + 1}`);
    assert.equal(f.draws.filter(d => d.kind === 'scene').length, 1);
    assert.equal(f.draws.filter(d => d.kind === 'SceneAAPass.Copy').length, 0);
    const aerialDraw = f.draws.find(d => d.kind === 'AerialProbe');
    assert.ok(aerialDraw, 'the enabled aerial consumer submits its draw');
    assert.equal(aerialDraw.source, f.target.texture);
    assert.equal(f.aerial.uniforms.tDepth.value, f.target.depthTexture);
    assert.equal(f.target.samples, samples);
    assert.equal(f.renderer.autoClear, true);
    assert.equal(f.camera.layers.mask, f.initialLayers);
  }
  // A disabled source consumer must not expose stale ping-pong contents.
  f.aerial.enabled = false;
  f.downstream.enabled = true;
  f.draws.length = 0;
  f.composer.render(1 / 60);
  assert.equal(f.lineage.get('screen'), 'scene-13');
  assert.equal(f.draws.filter(d => d.kind === 'SceneAAPass.Copy').length, 1);
  // Terminal scene output keeps its former direct-screen copy behavior.
  f.downstream.enabled = false;
  f.composer.render(1 / 60);
  assert.equal(f.lineage.get('screen'), 'scene-14');
  assert.equal(f.scenePass.renderToScreen, true);
}

{
  const f = fixture(4);
  const originalTexture = f.target.texture;
  const originalDepth = f.target.depthTexture;
  f.composer.renderToScreen = false;
  // Match production warmFirstFrame's one-enabled-pass ordering.
  for (const active of f.composer.passes) {
    for (const pass of f.composer.passes) pass.enabled = pass === active;
    f.composer.render(1 / 60);
  }
  assert.equal(f.lineage.get(f.composer.readBuffer.texture), 'scene-1');
  for (const pass of f.composer.passes) pass.enabled = true;
  f.composer.setPixelRatio(1.5);
  f.composer.setSize(1440, 900);
  assert.deepEqual([f.target.width, f.target.height], [2160, 1350]);
  assert.equal(f.aerial.sceneTarget, f.target);
  assert.equal(f.target.texture, originalTexture);
  assert.equal(f.target.depthTexture, originalDepth);
  let disposed = 0;
  f.target.addEventListener('dispose', () => disposed++);
  f.scenePass.setSamples(4);
  assert.equal(disposed, 0, 'same-sample setting must not recreate GPU storage');
  f.scenePass.setSamples(2);
  assert.equal(disposed, 1);
  f.composer.render(1 / 60);
  assert.equal(f.aerial.uniforms.tDiffuse.value, originalTexture);
  assert.equal(f.aerial.uniforms.tDepth.value, originalDepth);
  f.aerial.dispose();
  assert.equal(disposed, 1, 'aerial borrows, but does not own, the scene target');
}

for (const failure of ['scene', 'SceneAAPass.Copy']) {
  const f = fixture();
  f.aerial.enabled = false;
  f.setFailure(failure);
  assert.throws(() => f.composer.render(1 / 60), /owned render failure/);
  assert.equal(f.renderer.autoClear, true);
  assert.equal(f.camera.layers.mask, f.initialLayers);
}

console.log('sceneSourcePass.selftest: direct color/depth ownership, swaps, warm, resize, bypass and restoration PASS');
