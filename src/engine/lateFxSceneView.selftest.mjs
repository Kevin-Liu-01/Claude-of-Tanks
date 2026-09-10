import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLRenderStates } from 'three/src/renderers/webgl/WebGLRenderStates.js';
import { LateFxPass } from './post.ts';
import { LateFxSceneView } from './lateFxSceneView.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

// CPU contract evidence, not pixel or performance certification. The real
// pinned render-state owner also executes the real WebGLLights count/version
// logic; the renderer below only mirrors scene traversal/callback delivery.
function lightState(states, scene, camera) {
  const state = states.get(scene, 0);
  state.init(camera);
  scene.traverseVisible(object => {
    if (object.isLight && object.layers.test(camera.layers)) state.pushLight(object);
  });
  state.setupLights();
  return state.state.lights.state;
}

function fixture() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x123456);
  scene.fog = new THREE.FogExp2(0x345678, 0.01);
  scene.environment = new THREE.Texture();
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.2, 300);
  camera.position.z = 10;
  const parent = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.5 });
  const main = new THREE.Mesh(geometry, material);
  const fx = new THREE.Mesh(geometry, material);
  fx.layers.set(LATE_FX_LAYER);
  parent.add(main, fx);
  scene.add(parent, new THREE.DirectionalLight(), new THREE.HemisphereLight());
  const sceneTarget = new THREE.WebGLRenderTarget(8, 8, { depthTexture: new THREE.DepthTexture(8, 8) });
  const lateTarget = new THREE.WebGLRenderTarget(8, 8, { depthTexture: new THREE.DepthTexture(8, 8) });
  const output = new THREE.WebGLRenderTarget(8, 8);
  const states = WebGLRenderStates({ get: () => null, has: () => false });
  const draws = [];
  const roots = [];
  let target = sceneTarget;
  let failure = false;
  let active = true;
  const renderer = {
    autoClear: true,
    initRenderTarget() {}, setRenderTarget(value) { target = value; },
    clear() {}, copyTextureToTexture() {},
    render(root, viewCamera) {
      if (!root.isScene) return; // FullScreenQuad is outside this scene oracle.
      if (root.matrixWorldAutoUpdate) root.updateMatrixWorld();
      if (viewCamera.parent === null && viewCamera.matrixWorldAutoUpdate) viewCamera.updateMatrixWorld();
      root.onBeforeRender(renderer, root, viewCamera, target);
      const lights = lightState(states, root, viewCamera);
      roots.push({ root, target, version: lights.version, directions: lights.directional.length,
        hemispheres: lights.hemi.length });
      root.traverseVisible(object => {
        if (!object.layers.test(viewCamera.layers) || !object.isMesh) return;
        const renderedMaterial = root.overrideMaterial && object.material.allowOverride
          ? root.overrideMaterial : object.material;
        if (Array.isArray(renderedMaterial) || !renderedMaterial.visible) return;
        object.onBeforeRender(renderer, root, viewCamera, object.geometry, renderedMaterial, null);
        renderedMaterial.onBeforeRender(renderer, root, viewCamera, object.geometry, object, null);
        draws.push({ object, geometry: object.geometry, material: renderedMaterial, camera: viewCamera,
          target, fog: root.fog, environment: root.environment, intensity: root.environmentIntensity,
          rotation: root.environmentRotation, matrix: [...object.matrixWorld.elements] });
        if (failure) throw new Error('owned FX draw failure');
        object.onAfterRender(renderer, root, viewCamera, object.geometry, renderedMaterial, null);
      });
      root.onAfterRender(renderer, root, viewCamera);
    },
  };
  const softState = {
    uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2() },
    uCameraNear: { value: 0 }, uCameraFar: { value: 0 }, isActive: () => active,
  };
  const pass = new LateFxPass(scene, camera, sceneTarget, lateTarget, softState);
  function frame() {
    camera.layers.set(0);
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);
    pass.render(renderer, output, output);
  }
  return { scene, camera, parent, geometry, material, main, fx, sceneTarget, lateTarget,
    output, states, draws, roots, renderer, pass, frame,
    setFailure: value => { failure = value; }, setActive: value => { active = value; } };
}

// Original same-scene behavior: the zero-light late draw overwrites the
// world's render state even though world lights themselves never changed.
{
  const f = fixture();
  const worldVersion = lightState(f.states, f.scene, f.camera).version;
  f.camera.layers.set(LATE_FX_LAYER);
  const lateVersion = lightState(f.states, f.scene, f.camera).version;
  f.camera.layers.set(0);
  const nextWorldVersion = lightState(f.states, f.scene, f.camera).version;
  assert.ok(lateVersion > worldVersion && nextWorldVersion > lateVersion);
}

// Fails before the LateFX ownership fix: real main/late/main pass calls must
// leave the main light version stable, without sharing its mutable arrays.
{
  const f = fixture();
  for (let i = 0; i < 3; i++) f.frame();
  const main = f.roots.filter(row => row.target === f.sceneTarget);
  const late = f.roots.filter(row => row.target === f.lateTarget);
  assert.equal(new Set(main.map(row => row.version)).size, 1, 'main light version must remain stable');
  assert.equal(new Set(late.map(row => row.version)).size, 1, 'late light version must remain stable');
  assert.notEqual(main[0].root, late[0].root);
  assert.equal(new Set(late.map(row => row.root)).size, 1, 'one retained view, not a per-frame scene');
  assert.ok(main.every(row => row.directions === 1 && row.hemispheres === 1));
  assert.ok(late.every(row => row.directions === 0 && row.hemispheres === 0));
}

// Live properties/children inherit directly; nothing copies or reparents the
// source graph, and main/FX may retain the exact same lit material.
{
  const f = fixture();
  let graphEvents = 0;
  let resourceDisposals = 0;
  f.scene.addEventListener('childadded', () => { graphEvents++; });
  f.scene.addEventListener('childremoved', () => { graphEvents++; });
  for (const resource of [f.geometry, f.material, f.scene.environment, f.sceneTarget, f.lateTarget]) {
    resource.addEventListener('dispose', () => { resourceDisposals++; });
  }
  const version = f.material.version;
  f.frame();
  const view = f.roots.at(-1).root;
  const ownKeys = Reflect.ownKeys(view);
  assert.deepEqual(ownKeys, ['updateMatrixWorld']);
  assert.equal(Object.getPrototypeOf(view), f.scene);
  assert.equal(view.children, f.scene.children);
  assert.equal(f.fx.parent, f.parent);
  assert.equal(graphEvents, 0);
  const newFx = new THREE.Mesh(f.geometry, f.material);
  newFx.layers.set(LATE_FX_LAYER);
  f.parent.remove(f.fx);
  f.parent.add(newFx);
  f.scene.fog = new THREE.Fog(0x876543, 3, 100);
  f.scene.environment = new THREE.Texture();
  f.scene.environmentIntensity = 1.3;
  f.scene.environmentRotation = new THREE.Euler(0, 0.8, 0);
  const background = new THREE.Color(0x654321);
  f.scene.background = background;
  f.parent.position.set(4, 2, 1);
  f.draws.length = 0;
  f.frame();
  const [mainDraw, lateDraw] = f.draws;
  assert.equal(lateDraw.object, newFx);
  assert.equal(mainDraw.object, f.main);
  assert.equal(lateDraw.geometry, f.geometry);
  assert.equal(lateDraw.material, mainDraw.material);
  assert.equal(lateDraw.material, f.material);
  assert.equal(lateDraw.camera, f.camera);
  assert.equal(lateDraw.target, f.lateTarget);
  assert.equal(lateDraw.fog, f.scene.fog);
  assert.equal(lateDraw.environment, f.scene.environment);
  assert.equal(lateDraw.intensity, 1.3);
  assert.equal(lateDraw.rotation, f.scene.environmentRotation);
  assert.deepEqual(lateDraw.matrix, mainDraw.matrix);
  assert.deepEqual(lateDraw.matrix.slice(12, 15), [4, 2, 1]);
  assert.equal(f.scene.background, background);
  assert.equal(f.roots.at(-1).root, view);
  assert.equal(f.material.version, version);
  assert.equal(resourceDisposals, 0);
  assert.equal(graphEvents, 0);
  assert.deepEqual(Reflect.ownKeys(view), ownKeys, 'no inherited field becomes unintended own state');
  f.scene.overrideMaterial = new THREE.MeshBasicMaterial();
  f.frame();
  assert.equal(f.draws.at(-1).material, f.scene.overrideMaterial);
  assert.equal(f.roots.at(-1).root, view);
  // Even replacement of the whole live children array remains visible.
  f.scene.clear();
  f.scene.children = [];
  const children = f.scene.children;
  f.frame();
  assert.equal(view.children, children);
  assert.equal(view.children.length, 0);
}

// The real root receives matrix writes and custom updateMatrixWorld calls.
// Matrix reuse and pre-existing false both retain their original semantics.
for (const reuse of [false, true]) {
  const f = fixture();
  let updates = 0;
  const update = f.scene.updateMatrixWorld;
  f.scene.updateMatrixWorld = function (force) {
    assert.equal(this, f.scene);
    assert.equal(arguments.length, 0, 'native no-argument root update remains no-argument');
    updates++;
    return update.call(this, force);
  };
  if (reuse) f.pass.sceneMatrixSource = { consumeMatrixFrame: () => true };
  for (let i = 1; i <= 3; i++) {
    f.parent.position.x = i;
    f.frame();
    assert.equal(f.draws.at(-1).matrix[12], i);
    assert.equal(updates, i * (reuse ? 1 : 2));
    assert.equal(f.scene.matrixWorldAutoUpdate, true);
    assert.equal(f.scene.matrixWorldNeedsUpdate, false);
  }
  f.scene.matrixWorldAutoUpdate = false;
  f.frame();
  assert.equal(updates, 3 * (reuse ? 1 : 2));
  assert.equal(f.scene.matrixWorldAutoUpdate, false);
}

// Arbitrary callbacks are not rebound or replaced. Their exact receiver and
// scene argument survive by selecting the original render path, including a
// callback added after an isolated frame and removed before the next one.
for (const hook of ['scene-before', 'scene-after', 'object-before', 'object-after', 'material']) {
  const f = fixture();
  f.frame();
  const view = f.roots.at(-1).root;
  let calls = 0;
  const receiver = hook.startsWith('scene') ? f.scene : hook === 'material' ? f.material : f.fx;
  const key = hook.endsWith('after') ? 'onAfterRender' : 'onBeforeRender';
  const previous = receiver[key];
  receiver[key] = function (renderer, scene, camera) {
    assert.equal(this, receiver);
    assert.equal(renderer, f.renderer);
    assert.equal(scene, f.scene);
    assert.equal(camera, f.camera);
    if (camera.layers.mask === (1 << LATE_FX_LAYER)) calls++;
  };
  f.frame();
  assert.equal(calls, 1);
  assert.equal(f.roots.at(-1).root, f.scene);
  receiver[key] = previous;
  f.frame();
  assert.equal(f.roots.at(-1).root, view);
}

{
  const f = fixture();
  const failure = new Error('owned callback failure');
  const background = f.scene.background;
  const callback = f.fx.onBeforeRender;
  f.fx.onBeforeRender = function (renderer, scene) {
    assert.equal(this, f.fx);
    assert.equal(renderer, f.renderer);
    assert.equal(scene, f.scene);
    throw failure;
  };
  assert.throws(f.frame, error => error === failure, 'the original callback error survives');
  assert.equal(f.fx.onBeforeRender === callback, false, 'no callback replacement/restore wrapper');
  assert.equal(f.scene.background, background);
  assert.equal(f.camera.layers.mask, 1);
  assert.equal(f.scene.matrixWorldAutoUpdate, true);
  assert.equal(f.renderer.autoClear, true);
  f.fx.onBeforeRender = callback;
  f.frame();
  assert.notEqual(f.roots.at(-1).root, f.scene);
}

// Eligibility only inspects layer-visible renderables, yet traverses through
// layer-excluded parents. Invisible ancestry is pruned before any hook reads.
{
  const f = fixture();
  const owner = new LateFxSceneView(f.scene);
  f.scene.background = null;
  f.camera.layers.set(LATE_FX_LAYER);
  const hidden = new THREE.Group();
  hidden.visible = false;
  const trap = new THREE.Mesh(f.geometry, f.material);
  trap.layers.set(LATE_FX_LAYER);
  Object.defineProperty(trap, 'onBeforeRender', { get() { throw new Error('hidden hook inspected'); } });
  hidden.add(trap);
  f.scene.add(hidden);
  f.main.onBeforeRender = () => { throw new Error('main-layer hook inspected'); };
  const view = owner.select(f.camera);
  assert.notEqual(view, f.scene);
  assert.equal(view.children, f.scene.children);
  f.fx.onBeforeRender = () => {};
  assert.equal(owner.select(f.camera), f.scene, 'layer-zero parent does not hide a late child callback');
  f.fx.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
  hidden.visible = true;
  assert.throws(() => owner.select(f.camera), /hidden hook inspected/);
  hidden.visible = false;
  f.fx.material = [f.material, new THREE.MeshBasicMaterial()];
  f.fx.material[1].onBeforeRender = () => {};
  assert.equal(owner.select(f.camera), f.scene, 'array materials preserve callbacks');
  f.fx.material = f.material;
  f.scene.overrideMaterial = new THREE.MeshBasicMaterial();
  f.scene.overrideMaterial.onBeforeRender = () => {};
  assert.equal(owner.select(f.camera), f.scene, 'override callbacks preserve identity');
}

for (const unsupported of ['lod', 'shadow-light', 'transmission', 'background', 'camera-layers']) {
  const f = fixture();
  const owner = new LateFxSceneView(f.scene);
  f.scene.background = null;
  f.camera.layers.set(LATE_FX_LAYER);
  if (unsupported === 'lod') {
    const lod = new THREE.LOD();
    lod.layers.set(LATE_FX_LAYER);
    f.scene.add(lod);
  }
  if (unsupported === 'shadow-light') {
    const light = new THREE.DirectionalLight();
    light.layers.set(LATE_FX_LAYER);
    light.castShadow = true;
    f.scene.add(light);
  }
  if (unsupported === 'transmission') f.fx.material = new THREE.MeshPhysicalMaterial({ transmission: 1 });
  if (unsupported === 'background') f.scene.background = new THREE.Texture();
  if (unsupported === 'camera-layers') f.camera.layers.enable(0);
  assert.equal(owner.select(f.camera), f.scene, `${unsupported} keeps the original path`);
}

// Empty activity skips selection/render; exceptions still restore pass-owned
// background/layer/matrix flags. No wrapper survives a failed draw.
{
  const f = fixture();
  f.frame();
  const background = f.scene.background;
  const view = f.roots.at(-1).root;
  f.setActive(false);
  f.frame();
  assert.equal(f.roots.at(-1).root, f.scene);
  f.setActive(true);
  f.setFailure(true);
  assert.throws(() => f.pass.render(f.renderer, f.output, f.output), /owned FX draw failure/);
  assert.equal(f.scene.background, background);
  assert.equal(f.camera.layers.mask, 1);
  assert.equal(f.scene.matrixWorldAutoUpdate, true);
  assert.equal(f.renderer.autoClear, true);
  f.setFailure(false);
  f.frame();
  assert.equal(f.roots.at(-1).root, view);
}

// Three owns the per-renderer/context weak caches. Reset/disposal rebuilds
// those caches under the same retained keys; no renderer or resource is kept
// in the view owner and another renderer receives independent light arrays.
{
  const f = fixture();
  f.frame();
  const view = f.roots.at(-1).root;
  const oldMain = f.states.get(f.scene);
  const oldLate = f.states.get(view);
  f.states.dispose();
  f.roots.length = 0;
  f.frame();
  f.frame();
  assert.notEqual(f.states.get(f.scene), oldMain);
  assert.notEqual(f.states.get(view), oldLate);
  assert.equal(f.roots[0].version, f.roots[2].version);
  assert.equal(f.roots[1].version, f.roots[3].version);
  const other = WebGLRenderStates({ get: () => null, has: () => false });
  assert.notEqual(other.get(view), f.states.get(view));
  assert.notEqual(other.get(view).state.lights.state.directional, f.states.get(view).state.lights.state.directional);
}

console.log('lateFxSceneView.selftest: pinned ownership, graph, callbacks, matrix and lifetime contracts PASS');
