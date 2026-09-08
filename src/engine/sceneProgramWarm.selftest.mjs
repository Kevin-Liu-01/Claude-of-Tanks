import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createForwardProgramWarmOwner } from './programWarm.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

let passed = 0;
function test(name, run) {
  run();
  passed++;
}

function fixture({ targetPolicy = 'hdr', onVisit = null, compileFailure = null, empty = false,
  linker = false, layered = false, firstUse = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BoxGeometry();
  const shared = new THREE.MeshStandardMaterial();
  const transparent = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide });
  const pointsMaterial = new THREE.PointsMaterial();
  const lineMaterial = new THREE.LineBasicMaterial();
  const spriteMaterial = new THREE.SpriteMaterial();
  const nested = new THREE.Mesh(geometry, shared);
  const child = new THREE.Mesh(geometry, [shared, transparent]);
  nested.add(child, new THREE.PointLight(0xffffff, 1));
  scene.add(nested);
  const hidden = new THREE.Group();
  hidden.visible = false;
  const hiddenMesh = new THREE.Mesh(geometry, transparent);
  hidden.add(hiddenMesh, new THREE.PointLight(0xffffff, 1));
  scene.add(hidden);
  const instance = new THREE.InstancedMesh(geometry, shared, 2);
  instance.setMatrixAt(0, new THREE.Matrix4());
  instance.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0));
  scene.add(instance, new THREE.Points(geometry, pointsMaterial),
    new THREE.Line(geometry, lineMaterial), new THREE.Sprite(spriteMaterial));
  const layerExcluded = new THREE.Mesh(geometry, shared);
  layerExcluded.layers.set(7);
  scene.add(layerExcluded);
  scene.add(new THREE.DirectionalLight(0xffffff, 2));
  const excludedLight = new THREE.PointLight(0xffffff, 1);
  excludedLight.layers.set(7);
  scene.add(excludedLight);
  for (let index = 0; index < 48; index++) {
    const mesh = new THREE.Mesh(geometry, shared);
    mesh.position.set(index, 1, 2);
    scene.add(mesh);
  }
  if (layered) {
    camera.layers.enable(LATE_FX_LAYER);
    child.layers.set(LATE_FX_LAYER);
    hiddenMesh.layers.set(LATE_FX_LAYER);
    instance.layers.enable(LATE_FX_LAYER);
    excludedLight.layers.set(LATE_FX_LAYER);
  }
  const cameraMask = camera.layers.mask;
  if (empty) scene.clear();
  const originals = [];
  scene.traverse((object) => originals.push(object));
  const renderables = originals.filter((object) => object.isMesh || object.isPoints || object.isLine || object.isSprite);
  const expectedLights = [];
  scene.traverseVisible((object) => {
    if (object.isLight) expectedLights.push(object);
  });
  const snapshots = originals.map((object) => ({
    object, parent: object.parent, children: [...object.children], visible: object.visible,
    layer: object.layers.mask, position: object.position.toArray(), quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray(), material: object.material, geometry: object.geometry,
  }));
  let graphEvents = 0;
  for (const object of originals) {
    for (const event of ['added', 'removed', 'childadded', 'childremoved']) {
      object.addEventListener(event, () => { graphEvents++; });
    }
  }
  const priorTarget = new THREE.WebGLRenderTarget(2, 2);
  const hdrTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  hdrTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const lateTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
  let disposals = 0;
  for (const resource of [geometry, shared, transparent, pointsMaterial, lineMaterial, spriteMaterial,
    instance, priorTarget, hdrTarget, lateTarget]) {
    resource.addEventListener('dispose', () => { disposals++; });
  }
  const events = [];
  const visits = [];
  const passVisits = [];
  const materialVisits = [];
  const facades = new Set();
  const batches = [];
  let target = priorTarget;
  let face = 3;
  let mip = 2;
  let clock = 0;
  let blocked = false;
  let forbiddenAccesses = 0;
  let nativeDepth = 0;
  let uniformCalls = 0;
  const cachedMaterials = new Map();
  const assertActive = (operation) => {
    if (blocked) forbiddenAccesses++;
    assert.equal(blocked, false, `no stale ${operation}`);
  };
  const traverse = scene.traverse;
  const traverseVisible = scene.traverseVisible;
  scene.traverse = function visit(callback) {
    assertActive('scene traversal');
    events.push('sceneTraversal');
    return traverse.call(this, callback);
  };
  scene.traverseVisible = function visitLights(callback) {
    assertActive('light traversal');
    events.push('lightTraversal');
    return traverseVisible.call(this, callback);
  };
  const gl = {
    lost: false,
    isContextLost() { assertActive('context query'); events.push('contextQuery'); return this.lost; },
    getExtension(name) {
      assertActive('extension acquisition');
      assert.equal(linker, true, 'submission slicing must not add linker polling');
      assert.equal(name, 'KHR_parallel_shader_compile');
      events.push('getExtension');
      return { COMPLETION_STATUS_KHR: 0x91b1 };
    },
    getProgramParameter(program, token) {
      assertActive('linker query');
      assert.equal(linker, true, 'submission slicing must not add linker polling');
      assert.equal(token, 0x91b1);
      assert.ok(renderer.info.programs.some((candidate) => candidate.program === program));
      events.push('linkerQuery');
      return true;
    },
  };
  const renderer = {
    info: { programs: [] },
    properties: { get(material) { assertActive('material properties'); return cachedMaterials.get(material); } },
    getContext() { assertActive('context acquisition'); events.push('getContext'); return gl; },
    getRenderTarget() { assertActive('target query'); return target; },
    getActiveCubeFace() { assertActive('cube-face query'); return face; },
    getActiveMipmapLevel() { assertActive('mip query'); return mip; },
    setRenderTarget(next, nextFace = 0, nextMip = 0) {
      assertActive('target mutation');
      events.push('setTarget');
      target = next; face = nextFace; mip = nextMip;
    },
    compile(root, compileCamera, targetScene) {
      assertActive('native compile');
      assert.equal(compileCamera, camera);
      assert.equal(targetScene, scene, 'the real scene owns lighting/environment/fog');
      assert.notEqual(root, scene, 'each bounded submission uses a compile-only facade');
      assert.ok(root instanceof THREE.Object3D, 'facade retains the native compile object contract');
      assert.equal(root.parent, null);
      assert.deepEqual(root.children, [], 'original objects are never attached to the facade');
      const expectedTarget = layered && camera.layers.mask === 1 << LATE_FX_LAYER
        ? lateTarget : targetPolicy === 'hdr' ? hdrTarget : priorTarget;
      assert.equal(target, expectedTarget,
        'preserve HDR binding and existing null=no-target-override policy');
      facades.add(root);
      const lights = [];
      const collectLight = (object) => {
        if (object.isLight && object.layers.test(camera.layers)) lights.push(object);
      };
      const batch = [];
      const batchMaterials = new Set();
      nativeDepth++;
      events.push('compileEnter');
      try {
        // Mirror the pinned native compile traversal contract: target lights,
        // additional-root lights, then all submitted renderable materials.
        targetScene.traverseVisible(collectLight);
        root.traverseVisible(collectLight);
        assert.deepEqual(lights, expectedLights.filter((light) => light.layers.test(camera.layers)),
          'never duplicate or omit the real scene lights for the active camera mask');
        root.traverse((object) => {
          if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return;
          assert.ok(renderables.includes(object), 'shader selection receives the original renderable');
          assert.equal(object.parent, snapshots.find((entry) => entry.object === object).parent);
          visits.push(object);
          passVisits.push({ object, mask: camera.layers.mask, target, lights: [...lights] });
          batch.push(object);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            materialVisits.push({ object, material });
            batchMaterials.add(material);
            let properties = cachedMaterials.get(material);
            if (!properties) {
              properties = { programs: new Map() };
              cachedMaterials.set(material, properties);
            }
            const sides = firstUse && material.transparent && material.side === THREE.DoubleSide
              ? ['back', 'front'] : ['single'];
            for (const side of sides) {
              const key = firstUse ? `${camera.layers.mask}:${!!object.isInstancedMesh}:${side}`
                : renderer.info.programs.length;
              let program = properties.programs.get(key);
              if (!program) {
                program = { id: renderer.info.programs.length, program: {}, getUniforms() {
                  assertActive('uniform reflection');
                  assert.equal(target, priorTarget, 'reflection does not borrow a pass target');
                  assert.equal(camera.layers.mask, cameraMask, 'reflection sees the restored camera');
                  uniformCalls++;
                  return {};
                }, getAttributes() { assertActive('attribute reflection'); return {}; } };
                properties.programs.set(key, program);
                renderer.info.programs.push(program);
              }
              properties.currentProgram = program;
            }
          }
          clock += 4;
          onVisit?.(object, { nativeDepth, visits: visits.length });
        });
        batches.push(batch);
        if (compileFailure) throw compileFailure;
        return batchMaterials;
      } finally {
        events.push('compileExit');
        nativeDepth--;
      }
    },
  };
  const owner = createForwardProgramWarmOwner({
    renderer, scene, camera, getTarget: () => targetPolicy === 'hdr' ? hdrTarget : null,
    now: () => clock,
  });
  return {
    owner, renderer, scene, camera, gl, events, visits, passVisits, materialVisits, batches, facades, renderables,
    cameraMask, hdrTarget, lateTarget,
    hiddenMesh, child, instance, layerExcluded,
    block() { blocked = true; },
    nativeDepth: () => nativeDepth,
    uniformCalls: () => uniformCalls,
    assertUntouched() {
      for (const entry of snapshots) {
        const object = entry.object;
        assert.equal(object.parent, entry.parent);
        assert.deepEqual(object.children, entry.children);
        assert.equal(object.visible, entry.visible);
        assert.equal(object.layers.mask, entry.layer);
        assert.deepEqual(object.position.toArray(), entry.position);
        assert.deepEqual(object.quaternion.toArray(), entry.quaternion);
        assert.deepEqual(object.scale.toArray(), entry.scale);
        assert.equal(object.material, entry.material);
        assert.equal(object.geometry, entry.geometry);
      }
      assert.equal(transparent.side, THREE.DoubleSide);
      assert.equal(camera.layers.mask, cameraMask, 'restore the caller camera mask before every checkpoint');
      assert.equal(graphEvents, 0, 'even temporary reparenting/restoration is forbidden');
      assert.equal(disposals, 0, 'submission never disposes caller resources');
      if (!firstUse) assert.equal(uniformCalls, 0,
        'default submission does not initialize uniforms');
      assert.equal(forbiddenAccesses, 0, 'caught failures cannot hide stale scene/GPU access');
      assert.equal(nativeDepth, 0, 'a native compile always finishes before a checkpoint');
      assert.equal(target, priorTarget);
      assert.deepEqual([face, mip], [3, 2], 'restore the exact caller target state before yielding');
    },
    assertFacadeReleased() {
      for (const facade of facades) {
        const retained = [];
        facade.traverse((object) => {
          if (renderables.includes(object)) retained.push(object);
        });
        assert.deepEqual(retained, [], 'settled facade cannot revisit its former batch references');
        assert.equal(facade.parent, null);
        assert.deepEqual(facade.children, []);
      }
    },
  };
}

function stepsFor(f, options = {}) {
  assert.equal(typeof f.owner.compileSceneSteps, 'function',
    'forward program owner must expose the covered scene submission generator');
  return f.owner.compileSceneSteps({ sliceMs: 5, ...options });
}

function firstSlice(f, options) {
  const steps = stepsFor(f, options);
  const first = steps.next();
  assert.equal(first.done, false, 'a large scene yields between bounded native submissions');
  assert.ok(f.visits.length > 0 && f.visits.length < f.renderables.length);
  f.assertUntouched();
  return steps;
}

function drain(f, steps) {
  let checkpoints = 0;
  for (;;) {
    const next = steps.next();
    f.assertUntouched();
    if (next.done) break;
    assert.ok(++checkpoints <= f.renderables.length + 1, 'submission has a bounded worklist');
  }
  f.assertFacadeReleased();
}

for (const targetPolicy of ['hdr', 'null']) {
  test(`${targetPolicy}: every original renderable and material is submitted exactly once`, () => {
    const f = fixture({ targetPolicy });
    const timing = {};
    const steps = firstSlice(f, { timing });
    drain(f, steps);
    assert.deepEqual(f.visits, f.renderables, 'preserve native depth-first order including hidden descendants');
    assert.equal(new Set(f.visits).size, f.renderables.length, 'nested mesh descendants are never submitted twice');
    assert.ok(f.visits.includes(f.hiddenMesh));
    assert.ok(f.visits.includes(f.layerExcluded), 'native compile does not filter renderables by camera layers');
    assert.ok(f.visits.includes(f.instance) && f.instance.isInstancedMesh);
    assert.deepEqual(f.materialVisits.filter(({ object }) => object === f.child).map(({ material }) => material),
      f.child.material, 'material arrays retain original identities and order');
    assert.ok(f.batches.length > 1);
    assert.ok(Object.values(timing).every((value) => Number.isFinite(value) && value >= 0));
  });
}

test('timings retain whole-job program counts across all native batches', () => {
  const f = fixture();
  const residentPrograms = [{ program: {} }, { program: {} }, { program: {} }];
  f.renderer.info.programs.push(...residentPrograms);
  const timing = {};
  const steps = firstSlice(f, { timing });
  drain(f, steps);
  assert.ok(f.batches.length > 1);
  assert.equal(timing.programsBefore, residentPrograms.length, 'retain the count before the first batch');
  assert.equal(timing.programsAfter, f.renderer.info.programs.length, 'retain the count after the final batch');
  assert.equal(timing.programsAfter - timing.programsBefore, f.materialVisits.length);
  assert.deepEqual(f.renderer.info.programs.slice(0, residentPrograms.length), residentPrograms);
  assert.ok(timing.submissionSlices >= 1);
  assert.ok(Object.values(timing).every((value) => Number.isFinite(value) && value >= 0));
});

function compositorPasses(f) {
  return [
    { layerMask: f.cameraMask & ~(1 << LATE_FX_LAYER), target: f.hdrTarget },
    { layerMask: 1 << LATE_FX_LAYER, target: f.lateTarget },
  ];
}

test('opt-in compositor passes submit hidden and overlapping objects with their exact lights and targets', () => {
  const f = fixture({ layered: true });
  const timing = {};
  const passes = compositorPasses(f);
  f.renderer.info.programs.push({ program: {} });
  drain(f, stepsFor(f, { timing, passes }));
  const expected = passes.flatMap((pass) => f.renderables
    .filter((object) => (object.layers.mask & pass.layerMask) !== 0)
    .map((object) => ({ object: object.uuid, mask: pass.layerMask, target: pass.target.texture.uuid })));
  assert.deepEqual(f.passVisits.map(({ object, mask, target }) =>
    ({ object: object.uuid, mask, target: target.texture.uuid })), expected,
    'late-only objects never acquire ordinary-light variants, and overlap objects warm both passes');
  assert.equal(f.visits.filter((object) => object === f.instance).length, 2);
  assert.ok(f.visits.includes(f.child), 'an excluded renderable parent does not prune a late-layer child');
  assert.ok(f.visits.includes(f.hiddenMesh), 'hidden variants still compile within their selected layer');
  assert.ok(!f.visits.includes(f.layerExcluded), 'unselected render layers create no unused forward variant');
  assert.equal(timing.programsBefore, 1, 'counts retain the beginning of the complete two-pass job');
  assert.equal(timing.programsAfter, 1 + f.materialVisits.length);
  assert.equal(f.passVisits.find((visit) => visit.object === f.child).lights.length, 1,
    'the late pass receives only its layer-selected light, not ordinary scene or duplicated root lights');
});

function pauseBetweenPasses(f, options) {
  const passes = compositorPasses(f);
  const ordinaryCount = f.renderables.filter((object) => (object.layers.mask & passes[0].layerMask) !== 0).length;
  const steps = stepsFor(f, { passes, ...options });
  let checkpoints = 0;
  for (;;) {
    assert.equal(steps.next().done, false, 'yield after the restored ordinary pass before starting late FX');
    f.assertUntouched();
    if (f.visits.length === ordinaryCount) {
      f.assertFacadeReleased();
      return steps;
    }
    assert.ok(++checkpoints <= ordinaryCount, 'ordinary pass has a bounded worklist');
  }
}

for (const checkpoint of ['batch', 'between-passes']) {
for (const boundary of ['return', 'throw', 'abort', 'epoch', 'renderer', 'context']) {
  test(`layered ${checkpoint} ${boundary} restores camera/target and prevents later-pass work`, () => {
    const f = fixture({ layered: true });
    const controller = new AbortController();
    const failure = new Error('layered warm cancelled');
    const options = { passes: compositorPasses(f), signal: controller.signal };
    const steps = checkpoint === 'batch' ? firstSlice(f, options) : pauseBetweenPasses(f, options);
    const eventCount = f.events.length;
    if (boundary === 'return') steps.return();
    else if (boundary === 'throw') assert.throws(() => steps.throw(failure), (error) => error === failure);
    else {
      if (boundary === 'abort') controller.abort(failure);
      if (boundary === 'epoch') f.owner.invalidate();
      if (boundary === 'renderer') f.renderer.info = { programs: [] };
      if (boundary === 'context') f.gl.lost = true;
      if (boundary !== 'context') f.block();
      if (boundary === 'abort') assert.throws(() => steps.next(), (error) => error === failure);
      else assert.equal(steps.next().done, true);
    }
    if (boundary !== 'context') assert.equal(f.events.length, eventCount);
    assert.ok(f.passVisits.every((visit) => visit.mask !== 1 << LATE_FX_LAYER));
    f.assertUntouched();
    f.assertFacadeReleased();
  });
}
}

test('an unselected pass binds no target and does not prune hidden late descendants', () => {
  const f = fixture({ layered: true });
  const passes = [{ layerMask: 0, target: f.hdrTarget }, compositorPasses(f)[1]];
  const steps = stepsFor(f, { passes });
  assert.equal(steps.next().done, false, 'the empty ordinary pass still leaves a restored pass checkpoint');
  assert.equal(f.events.includes('setTarget'), false);
  assert.equal(f.events.includes('compileEnter'), false);
  f.assertUntouched();
  drain(f, steps);
  assert.equal(f.visits.length, 3);
  assert.ok(f.visits.includes(f.child) && f.visits.includes(f.hiddenMesh) && f.visits.includes(f.instance));
  assert.ok(f.passVisits.every((visit) => visit.mask === 1 << LATE_FX_LAYER && visit.target === f.lateTarget));
});

test('native failure in the late pass restores both camera and complete target state', () => {
  const failure = new Error('late native compile failed');
  let f;
  f = fixture({ layered: true, onVisit() {
    if (f.camera.layers.mask === 1 << LATE_FX_LAYER) throw failure;
  } });
  assert.throws(() => drain(f, stepsFor(f, { passes: compositorPasses(f) })), (error) => error === failure);
  f.assertUntouched();
  f.assertFacadeReleased();
});

test('synchronous late-pass cancellation finishes native compile and restores before throwing', () => {
  const failure = new Error('cancelled inside the late compile');
  const controller = new AbortController();
  let f;
  f = fixture({ layered: true, onVisit(_object, state) {
    if (f.camera.layers.mask !== 1 << LATE_FX_LAYER) return;
    assert.equal(state.nativeDepth, 1);
    controller.abort(failure);
  } });
  assert.throws(() => drain(f, stepsFor(f, { passes: compositorPasses(f), signal: controller.signal })),
    (error) => error === failure);
  assert.equal(f.passVisits.filter((visit) => visit.mask === 1 << LATE_FX_LAYER).length, 3,
    'abort is observed after the entire native late batch exits');
  f.assertUntouched();
  f.assertFacadeReleased();
});

test('an empty scene completes without a target bind or native compile and reports unchanged program counts', () => {
  const f = fixture({ empty: true });
  f.renderer.info.programs.push({ program: {} }, { program: {} });
  const timing = {};
  const steps = stepsFor(f, { timing });
  assert.equal(steps.next().done, true);
  assert.deepEqual(f.visits, []);
  assert.deepEqual(f.batches, []);
  assert.equal(f.events.includes('setTarget'), false);
  assert.equal(f.events.includes('compileEnter'), false);
  assert.equal(timing.programsBefore, 2);
  assert.equal(timing.programsAfter, 2);
  assert.ok(Object.values(timing).every((value) => Number.isFinite(value) && value >= 0));
  f.assertFacadeReleased();
  f.assertUntouched();
});

test('return at a checkpoint clears facade references without more work', () => {
  const f = fixture();
  const steps = firstSlice(f);
  const eventCount = f.events.length;
  assert.equal(steps.return().done, true);
  assert.equal(steps.next().done, true);
  assert.equal(f.events.length, eventCount);
  f.assertFacadeReleased();
  f.assertUntouched();
});

test('caller exception at a checkpoint clears facade references and preserves the exception', () => {
  const f = fixture();
  const steps = firstSlice(f);
  const original = new Error('yielding scheduler rejected');
  const eventCount = f.events.length;
  assert.throws(() => steps.throw(original), (error) => error === original);
  assert.equal(steps.next().done, true);
  assert.equal(f.events.length, eventCount);
  f.assertFacadeReleased();
  f.assertUntouched();
});

test('already-aborted iteration never traverses or touches the renderer', () => {
  const f = fixture();
  const controller = new AbortController();
  const original = new Error('entry already cancelled');
  controller.abort(original);
  f.block();
  const steps = stepsFor(f, { signal: controller.signal });
  assert.throws(() => steps.next(), (error) => error === original);
  assert.deepEqual(f.events, []);
  f.assertUntouched();
});

test('abort after yielding stops before any disposed scene or renderer access', () => {
  const f = fixture();
  const controller = new AbortController();
  const steps = firstSlice(f, { signal: controller.signal });
  const original = new Error('room disposed the battle presentation');
  controller.abort(original);
  f.block();
  const eventCount = f.events.length;
  assert.throws(() => steps.next(), (error) => error === original);
  assert.equal(f.events.length, eventCount);
  f.assertFacadeReleased();
  f.assertUntouched();
});

test('cancellation during native traversal is observed only after native compile exits and restores', () => {
  const controller = new AbortController();
  const original = new Error('cancelled by synchronous compile callback');
  let abortedInsideNative = false;
  const f = fixture({ onVisit(_object, state) {
    if (controller.signal.aborted) return;
    assert.equal(state.nativeDepth, 1);
    abortedInsideNative = true;
    controller.abort(original);
  } });
  const steps = stepsFor(f, { signal: controller.signal });
  assert.throws(() => steps.next(), (error) => error === original);
  assert.equal(abortedInsideNative, true);
  assert.equal(f.batches.length, 1, 'native traversal completed normally rather than throwing abort inside it');
  assert.ok(f.events.indexOf('compileExit') > f.events.indexOf('compileEnter'));
  f.assertFacadeReleased();
  f.assertUntouched();
});

for (const invalidation of ['renderer-info', 'owner-epoch']) {
  test(`${invalidation} invalidates a paused job without any more source/GPU access`, () => {
    const f = fixture();
    const steps = firstSlice(f);
    if (invalidation === 'renderer-info') f.renderer.info = { programs: [] };
    else f.owner.invalidate();
    f.block();
    const eventCount = f.events.length;
    assert.equal(steps.next().done, true);
    assert.equal(f.events.length, eventCount);
    f.assertFacadeReleased();
    f.assertUntouched();
  });
}

test('context loss between batches stops submission with exact state restored', () => {
  const f = fixture();
  const steps = firstSlice(f);
  const visits = f.visits.length;
  const targetChanges = f.events.filter((event) => event === 'setTarget').length;
  f.gl.lost = true;
  assert.equal(steps.next().done, true);
  assert.equal(f.visits.length, visits);
  assert.equal(f.events.filter((event) => event === 'setTarget').length, targetChanges);
  f.assertFacadeReleased();
  f.assertUntouched();
});

test('native compile failure restores state, clears facade references and preserves its exception', () => {
  const original = new Error('native shader submission failed');
  const f = fixture({ compileFailure: original });
  const steps = stepsFor(f);
  assert.throws(() => steps.next(), (error) => error === original);
  f.assertFacadeReleased();
  f.assertUntouched();
});

function pauseBeforeLinker(f, options = {}) {
  assert.equal(typeof f.owner.prepareSceneSteps, 'function',
    'the combined owner must retain one renderer lifetime across submission and linking');
  const steps = f.owner.prepareSceneSteps({ sliceMs: 5, ...options });
  const objectCount = options.passes ? options.passes.reduce((count, pass) => count
    + f.renderables.filter((object) => (object.layers.mask & pass.layerMask) !== 0).length, 0)
    : f.renderables.length;
  let checkpoints = 0;
  for (;;) {
    assert.equal(steps.next().done, false, 'the final native submission must yield before linker work');
    f.assertUntouched();
    assert.equal(f.events.includes('getExtension'), false);
    assert.equal(f.events.includes('linkerQuery'), false);
    if (f.visits.length === objectCount) return steps;
    assert.ok(++checkpoints <= f.renderables.length + 1, 'combined submission has a bounded worklist');
  }
}

test('combined preparation polls only after the final restored submission checkpoint', () => {
  const f = fixture({ linker: true });
  const steps = pauseBeforeLinker(f);
  assert.deepEqual(f.visits, f.renderables);
  f.assertFacadeReleased();
  assert.equal(steps.next().done, true, 'all ready programs complete the linker without another wait');
  assert.equal(f.events.filter((event) => event === 'getExtension').length, 1);
  assert.equal(f.events.filter((event) => event === 'linkerQuery').length, f.renderer.info.programs.length);
  f.assertUntouched();
  f.assertFacadeReleased();
});

for (const layered of [false, true]) {
test(`timed ${layered ? 'two-pass' : 'default'} preparation captures existing programs before submitting new ones`, () => {
  const f = fixture({ linker: true, layered });
  const existing = [{ program: {} }, { program: {} }];
  f.renderer.info.programs.push(...existing);
  const timing = {};
  const steps = pauseBeforeLinker(f, { timing, passes: layered ? compositorPasses(f) : undefined });
  const submitted = f.materialVisits.length;
  assert.ok(submitted > 0, 'native compilation adds programs after the automatic baseline capture');
  assert.equal(f.renderer.info.programs.length, existing.length + submitted);
  assert.equal(timing.queryCount, undefined, 'baseline capture does not query readiness');
  assert.equal(timing.programsBefore, existing.length);
  assert.equal(timing.programsAfter, existing.length + submitted);
  assert.equal(steps.next().done, true);
  assert.equal(timing.existingQueryCount, existing.length,
    'the owner retains membership from before compilation without a caller-supplied set');
  assert.equal(timing.newQueryCount, submitted,
    'programs added by native compilation are absent from the automatic baseline');
  assert.equal(timing.queryCount, existing.length + submitted);
  assert.equal(timing.queryCount, timing.existingQueryCount + timing.newQueryCount);
  assert.equal(timing.queryMs, timing.existingQueryMs + timing.newQueryMs);
  assert.equal(f.events.filter((event) => event === 'linkerQuery').length, timing.queryCount,
    'cohort diagnostics issue exactly one native query per ready program');
  f.assertUntouched();
  f.assertFacadeReleased();
});
}

test('abort at the submission/linker handoff preserves the reason without any further GPU access', () => {
  const f = fixture({ linker: true });
  const controller = new AbortController();
  const steps = pauseBeforeLinker(f, { signal: controller.signal });
  const original = new Error('entry cancelled after final shader submission');
  controller.abort(original);
  f.block();
  const eventCount = f.events.length;
  assert.throws(() => steps.next(), (error) => error === original);
  assert.equal(f.events.length, eventCount);
  f.assertFacadeReleased();
  f.assertUntouched();
});

for (const layered of [false, true]) {
for (const invalidation of ['renderer-info', 'owner-epoch']) {
  test(`${invalidation} at the ${layered ? 'two-pass' : 'default'} submission/linker handoff stops polling`, () => {
    const f = fixture({ linker: true, layered });
    const steps = pauseBeforeLinker(f, { passes: layered ? compositorPasses(f) : undefined });
    if (invalidation === 'renderer-info') f.renderer.info = { programs: [] };
    else f.owner.invalidate();
    f.block();
    const eventCount = f.events.length;
    assert.equal(steps.next().done, true);
    assert.equal(f.events.length, eventCount);
    f.assertFacadeReleased();
    f.assertUntouched();
  });
}
}

test('context loss at the submission/linker handoff cannot acquire an extension or query programs', () => {
  const f = fixture({ linker: true });
  const steps = pauseBeforeLinker(f);
  const visits = f.visits.length;
  const targetChanges = f.events.filter((event) => event === 'setTarget').length;
  f.gl.lost = true;
  assert.equal(steps.next().done, true);
  assert.equal(f.events.includes('getExtension'), false);
  assert.equal(f.events.includes('linkerQuery'), false);
  assert.equal(f.visits.length, visits);
  assert.equal(f.events.filter((event) => event === 'setTarget').length, targetChanges);
  f.assertFacadeReleased();
  f.assertUntouched();
});

for (const layered of [false, true]) {
test(`first-use ${layered ? 'two-pass' : 'default'} material cohort retains exact variants and restores every checkpoint`, () => {
  const f = fixture({ linker: true, layered, firstUse: true });
  const timing = {};
  const unrelated = { program: {}, getUniforms() { assert.fail('unsubmitted material'); } };
  f.renderer.info.programs.push(unrelated);
  const steps = pauseBeforeLinker(f, { timing, initializeUniforms: true,
    passes: layered ? compositorPasses(f) : undefined });
  const cohort = f.renderer.info.programs.slice(1);
  assert.ok(cohort.length > new Set(f.materialVisits.map(({ material }) => material)).size,
    'transparent sides and shared-material instancing create more than one program per material');
  const later = { program: {}, getUniforms() { assert.fail('later live-array addition'); } };
  f.renderer.info.programs.unshift(later);
  drain(f, steps);
  assert.equal(f.uniformCalls(), cohort.length, 'each captured wrapper initializes once across duplicate batches');
  assert.equal(timing.uniformCount, cohort.length);
  assert.equal(timing.uniformPending, 0);
  assert.equal(timing.uniformFailures, 0);
  assert.equal(timing.uniformYields, Math.floor(cohort.length / 32),
    'cheap exact pass variants share bounded first-use chunks instead of one wait per program');
  assert.equal(timing.queryCount, cohort.length, 'no query for unrelated or late-added wrappers');
  assert.equal(timing.newQueryCount, cohort.length);
  assert.equal(timing.existingQueryCount ?? 0, 0);
  assert.equal(timing.programsBefore, 1);
  assert.equal(timing.programsAfter, cohort.length + 1,
    'first-use reflection preserves submission count receipt despite external list additions');
});
}

test('first-use cancellation during compile restores both pass state and skips material property access', () => {
  const controller = new AbortController();
  const original = new Error('cancelled during native submission');
  const f = fixture({ layered: true, firstUse: true, onVisit() { controller.abort(original); } });
  f.renderer.properties.get = () => assert.fail('no material reads after native compile was cancelled');
  const steps = f.owner.prepareSceneSteps({ initializeUniforms: true,
    passes: compositorPasses(f), signal: controller.signal });
  assert.throws(() => steps.next(), (error) => error === original);
  f.assertUntouched();
  f.assertFacadeReleased();
});

test('a missing selected-material cache fails optional first-use without leaking the pass state', () => {
  const f = fixture({ layered: true, firstUse: true });
  f.renderer.properties = undefined;
  const steps = f.owner.prepareSceneSteps({ initializeUniforms: true, passes: compositorPasses(f) });
  assert.throws(() => steps.next(), /Compiled material program cache unavailable/);
  f.assertUntouched();
  f.assertFacadeReleased();
  assert.equal(f.events.includes('getExtension'), false);
});

test('empty first-use preparation does not acquire an extension or invent pending work', () => {
  const f = fixture({ empty: true, firstUse: true });
  const timing = {};
  const steps = f.owner.prepareSceneSteps({ initializeUniforms: true, timing });
  assert.equal(steps.next().done, false, 'retain the existing final submission checkpoint');
  assert.equal(steps.next().done, true);
  assert.equal(timing.uniformCount, 0);
  assert.equal(timing.uniformPending, 0);
  assert.equal(f.events.includes('getExtension'), false);
  f.assertUntouched();
});

// Execute the production adapter body, not a parallel reconstruction of its
// pass choices. Strip its single local type annotation for this Node harness.
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const networkCompileBody = mainSource.match(
  /compile: async \(signal\?: AbortSignal\) => \{([\s\S]*?)\n\s{10}\},/,
)?.[1];
assert.ok(networkCompileBody, 'network entry retains its scoped async compile adapter');
const networkCompileFactory = new Function('post', 'camera', 'LATE_FX_LAYER', 'forwardProgramWarm', 'nextPaintFrame',
  `return async (signal) => {${networkCompileBody.replace(': ForwardProgramCompileTiming', '')}};`);
for (const composited of [false, true]) {
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(7);
  camera.layers.enable(LATE_FX_LAYER);
  const initialMask = camera.layers.mask;
  const sceneTarget = { name: 'actual sceneAA target' };
  const lateTarget = { name: 'actual lateFx target' };
  const post = composited ? {
    composer: { renderTarget1: { name: 'not either scene-pass destination' } },
    sceneAA: { sceneTarget }, lateFx: { target: lateTarget },
  } : null;
  const signal = new AbortController().signal;
  let paints = 0;
  let finalized = false;
  let receivedTiming;
  const compile = networkCompileFactory(post, camera, LATE_FX_LAYER, {
    *prepareSceneSteps(options) {
      assert.equal(options.signal, signal);
      assert.equal(camera.layers.mask, initialMask, 'the adapter never leaves camera state changed');
      assert.deepEqual(options.passes, composited ? [
        { layerMask: initialMask & ~(1 << LATE_FX_LAYER), target: sceneTarget },
        { layerMask: 1 << LATE_FX_LAYER, target: lateTarget },
      ] : undefined, 'use exact pass targets/masks, or preserve the non-composer default');
      if (composited) {
        assert.equal(options.passes[0].target, sceneTarget);
        assert.equal(options.passes[1].target, lateTarget);
      }
      receivedTiming = options.timing;
      try {
        yield;
        options.timing.programsAfter = 3;
        yield;
      } finally { finalized = true; }
    },
  }, async () => { paints++; });
  const receipt = await compile(signal);
  assert.deepEqual(receipt, { programsAfter: 3 });
  assert.notEqual(receipt, receivedTiming, 'the adapter returns its completed diagnostic copy');
  assert.equal(paints, 2, 'each owner checkpoint retains its loader paint opportunity');
  assert.equal(finalized, true);
  assert.equal(camera.layers.mask, initialMask);
  passed++;
}

test('pass-aware scene reuse keeps every submission but skips only witnessed reflection', () => {
  const f = fixture({ linker: true, layered: true, firstUse: true });
  const options = { initializeUniforms: true, passes: [
    { layerMask: f.cameraMask & ~(1 << LATE_FX_LAYER), target: f.hdrTarget },
    { layerMask: 1 << LATE_FX_LAYER, target: f.lateTarget },
  ] };
  for (const _ of f.owner.prepareSceneSteps(options)) f.assertUntouched();
  const before = f.renderer.info.programs.length;
  const timing = {};
  for (const _ of f.owner.prepareSceneSteps({ ...options, timing })) f.assertUntouched();
  assert.equal(timing.uniformReused, before);
  assert.equal(timing.uniformCount, 0);
  assert.equal(timing.queryCount, undefined);
  assert.ok(timing.submissionMs > 0, 'reuse never bypasses the exact scene compilation');
});

test('newest pending scene link gates older queries without losing hidden or pass-specific variants', () => {
  const f = fixture({ linker: true, layered: true, firstUse: true });
  const timing = {};
  const steps = pauseBeforeLinker(f, { initializeUniforms: true, timing, passes: compositorPasses(f) });
  const cohort = [...f.renderer.info.programs];
  const newest = cohort.at(-1);
  const queried = [];
  let ready = false;
  const nativeQuery = f.gl.getProgramParameter;
  f.gl.getProgramParameter = (handle, token) => {
    f.assertUntouched();
    queried.push(handle);
    nativeQuery(handle, token);
    return handle !== newest.program || ready;
  };
  assert.equal(steps.next().done, false);
  assert.deepEqual(queried, [newest.program]);
  assert.equal(timing.uniformCount, 0);
  assert.equal(timing.uniformPending, cohort.length);
  ready = true;
  f.renderer.info.programs.reverse();
  drain(f, steps);
  assert.equal(timing.uniformCount, cohort.length);
  assert.equal(timing.uniformPending, 0);
  assert.deepEqual(queried.slice(1), cohort.toReversed().map((program) => program.program));
  assert.ok(f.passVisits.some(({ object }) => object === f.hiddenMesh), 'hidden variant submission remains intact');
  f.assertFacadeReleased();
  f.assertUntouched();
});

console.log(`sceneProgramWarm.selftest: ${passed} scene submission, identity and cancellation cases passed`);
