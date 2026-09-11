import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { WebGLInfo } from 'three/src/renderers/webgl/WebGLInfo.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { createPostFrameAccounting } from './postFrameAccounting.ts';

// Execute the real application frame boundary, real composer/fullscreen passes,
// real geometry counts and pinned Three info owner. The GPU submission port is
// CPU-only: no claim about pixels, GPU completion, or display presentation.
const postSource = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const start = postSource.indexOf('  function renderFrame(');
const end = postSource.indexOf('\n  // Live preset switching', start);
assert.ok(start >= 0 && end > start, 'production frame boundary remains discoverable');
const getter = postSource.match(/get lastCompletedFrame\(\) \{[^\n]+\},/)?.[0];
const binding = postSource.match(/render: frameAccounting\.render,/)?.[0];
assert.ok(getter && binding, 'public post owner must expose the accounted transaction');
const instantiate = new Function('ports', stripTypeScriptTypes(`
  const { renderer, composer, sceneAA, aerial, gtao, lateFx, scene,
    grade, createPostFrameAccounting } = ports;
  const dynGovern = () => {}, adaptiveFrameSeconds = dt => dt;
  const updateAerialZoom = () => {}, updateScopeGrade = () => {};
  const updateAerialFogColors = () => {}, updateAerialCameraBasis = () => {};
  const CLOUD_SHADE_DEFAULT = 0, lateTarget = null;
  ${postSource.slice(start, end)}
`) + `\nreturn { ${getter} ${binding} };`);
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /readRenderFrame:\s*\(\)\s*=>\s*post\.lastCompletedFrame/,
  'lazy HUD must read the actual post owner, not renderer.info tail counters');

// Preserve Three's actual frame/cache epoch behavior independently of reset.
const nativeSource = readFileSync(new URL('../../node_modules/three/src/renderers/WebGLRenderer.js', import.meta.url), 'utf8');
const nativeEpoch = nativeSource.match(/this\.info\.render\.frame\s*\+\+;\s*if \( this\.info\.autoReset === true \) this\.info\.reset\(\);/)?.[0];
assert.ok(nativeEpoch, 'pinned native render epoch/reset boundary must be inspected if changed');
const beginNativeRender = new Function(nativeEpoch);
const gl = { TRIANGLES: 4, LINES: 1, POINTS: 0 };

function fixture(autoReset = true) {
  const renderer = {
    info: new WebGLInfo(gl), target: null, nativeCalls: 0, failAt: 0,
    autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: true,
    getPixelRatio: () => 1,
    getRenderTarget() { return this.target; },
    setRenderTarget(target) { this.target = target; },
    clear() {},
    render(root) {
      beginNativeRender.call(this);
      this.nativeCalls++;
      if (this.failAt === this.nativeCalls) throw new Error('controlled native submission failure');
      const submit = object => {
        if (!object.geometry) return;
        const count = object.geometry.index?.count ?? object.geometry.attributes.position.count;
        this.info.update(count, object.isPoints ? gl.POINTS : object.isLine ? gl.LINES : gl.TRIANGLES, 1);
      };
      // Match native reset-before-shadow ownership; native shadows are draws,
      // not extra renderer.render invocations or separate application frames.
      if (root.isScene) root.traverseVisible(object => { if (object.castShadow) submit(object); });
      root.traverseVisible(submit);
    },
  };
  renderer.info.autoReset = autoReset;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  box.castShadow = true;
  const positions = new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3], 3));
  scene.add(box, new THREE.LineSegments(positions, new THREE.LineBasicMaterial()),
    new THREE.Points(positions, new THREE.PointsMaterial()));
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(8, 8));
  const sceneAA = new RenderPass(scene, camera);
  let matrixOpen = false, directOpen = false;
  sceneAA.beginMatrixFrame = () => { matrixOpen = true; };
  sceneAA.endMatrixFrame = () => { matrixOpen = false; };
  const aerial = new ShaderPass(CopyShader), gtao = new ShaderPass(CopyShader);
  aerial.uniforms.uCloudShade = { value: 0 };
  aerial.beginDirectColorFrame = () => { directOpen = true; };
  aerial.endDirectColorFrame = () => { directOpen = false; };
  gtao.enabled = false;
  const lateFx = new ShaderPass(CopyShader), final = new ShaderPass(CopyShader);
  lateFx.softState = { isActive: () => false };
  for (const pass of [sceneAA, aerial, gtao, lateFx, final]) composer.addPass(pass);
  const post = instantiate({ renderer, composer, sceneAA, aerial, gtao, lateFx, scene,
    grade: { uniforms: { uExposure: { value: 1 } } }, createPostFrameAccounting });
  return {
    renderer, composer, post, final,
    assertReleased() { assert.equal(matrixOpen, false); assert.equal(directOpen, false); },
    dispose() {
      scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    },
  };
}

const totals = { calls: 7, triangles: 27, lines: 2, points: 4 };
for (const autoReset of [true, false]) {
  const f = fixture(autoReset), { renderer, post } = f;
  try {
    assert.equal(post.lastCompletedFrame, null);
    // Negative control: the unaccounted real composer ends at precisely 1/1.
    renderer.info.autoReset = true;
    f.composer.render(1 / 60);
    assert.equal(renderer.info.render.calls, 1);
    assert.equal(renderer.info.render.triangles, 1);
    assert.equal(post.lastCompletedFrame, null, 'direct warm/debug renders are not completed post frames');
    renderer.info.autoReset = autoReset;
    renderer.info.reset();
    renderer.info.update(9, gl.TRIANGLES, 1); // An outer probe owns preceding work.
    const initialFrame = renderer.info.render.frame;
    post.render(1 / 60, 1 / 30);
    const receipt = post.lastCompletedFrame;
    assert.deepEqual(receipt, { scope: 'last-completed-post-frame', serial: 1, ...totals });
    assert.equal(renderer.info.render.frame, initialFrame + 4, 'native cache epoch advances per native render');
    assert.equal(renderer.info.autoReset, autoReset);
    assert.equal(renderer.info.render.calls, totals.calls + (autoReset ? 0 : 1));
    assert.equal(renderer.info.render.triangles, totals.triangles + (autoReset ? 0 : 3));
    f.assertReleased();
    const snapshot = { ...receipt };
    // An offscreen/fullscreen diagnostic draw must neither mutate nor replace
    // the last completed application receipt. A skipped frame calls nothing.
    f.final.render(renderer, f.composer.writeBuffer, f.composer.readBuffer);
    assert.equal(post.lastCompletedFrame, receipt);
    assert.deepEqual(receipt, snapshot);
    for (const failOffset of [1, 4]) {
      renderer.failAt = renderer.nativeCalls + failOffset;
      const beforeFrame = renderer.info.render.frame;
      assert.throws(() => post.render(1 / 60), /controlled native submission failure/);
      assert.equal(renderer.info.render.frame, beforeFrame + failOffset);
      assert.equal(renderer.info.autoReset, autoReset);
      assert.deepEqual(receipt, snapshot, 'failed/partial work never publishes success');
      f.assertReleased();
    }
    renderer.failAt = 0;
    const beforeRecovery = { ...renderer.info.render };
    post.render(1 / 60);
    assert.equal(post.lastCompletedFrame, receipt, 'one object is reused on the hot path');
    assert.deepEqual(receipt, { scope: 'last-completed-post-frame', serial: 2, ...totals });
    assert.equal(renderer.info.render.frame, beforeRecovery.frame + 4);
    assert.equal(renderer.info.render.calls, totals.calls + (autoReset ? 0 : beforeRecovery.calls));
    assert.equal(renderer.info.render.triangles, totals.triangles + (autoReset ? 0 : beforeRecovery.triangles));
    // A new native info object after context restoration must be used at entry.
    renderer.info = new WebGLInfo(gl);
    post.render(1 / 60);
    assert.equal(renderer.info.autoReset, true);
    assert.equal(renderer.info.render.frame, 4);
    assert.deepEqual(receipt, { scope: 'last-completed-post-frame', serial: 3, ...totals });
  } finally { f.dispose(); }
}

// A first failed attempt must remain unavailable, not invent an empty frame.
const cold = fixture();
try {
  cold.renderer.failAt = 2;
  assert.throws(() => cold.post.render(1 / 60), /controlled native submission failure/);
  assert.equal(cold.post.lastCompletedFrame, null);
  assert.equal(cold.renderer.info.autoReset, true);
} finally { cold.dispose(); }
console.log('postFrameAccounting.selftest: PASS (real multipass totals, native epochs, probe nesting, throws/recovery, retained receipts)');
