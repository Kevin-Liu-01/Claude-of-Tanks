import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOffscreenSceneWarmer } from '../engine/offscreenWarm.ts';
import { prepareDeploymentFxPrograms } from './deploymentFxPrograms.ts';

const complete = { status: 'complete', pending: 0 };
const incomplete = reason => ({ status: 'incomplete', pending: null, reason });

function selectionFixture() {
  const scene = new THREE.Scene(), root = new THREE.Group(), ancestor = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(30);
  scene.add(ancestor); ancestor.add(root);
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const spriteMaterial = new THREE.SpriteMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  const parent = new THREE.Mesh(geometry, hiddenMaterial);
  const child = new THREE.Mesh(geometry, material);
  parent.layers.set(7); parent.add(child); // Parent layers/material do not prune descendants.
  const line = new THREE.Line(geometry, material);
  const points = new THREE.Points(geometry, material); points.layers.set(30);
  const sprite = new THREE.Sprite(spriteMaterial);
  const array = new THREE.Mesh(geometry, [hiddenMaterial, material]);
  const instance = new THREE.InstancedMesh(geometry, material, 1);
  const hidden = new THREE.Mesh(geometry, material); hidden.visible = false;
  hidden.add(new THREE.Mesh(geometry, material));
  const excluded = new THREE.Mesh(geometry, material); excluded.layers.set(4);
  const allHidden = new THREE.Mesh(geometry, [hiddenMaterial]);
  const noMaterial = new THREE.Mesh(geometry, material); noMaterial.material = undefined;
  root.add(mesh, parent, line, points, sprite, array, instance, hidden, excluded, allHidden, noMaterial);
  const foreign = new THREE.Mesh(geometry, material); scene.add(foreign);
  const expected = [mesh, child, line, points, sprite, array, instance];
  const states = [];
  scene.traverse(object => states.push({ object, parent: object.parent, material: object.material,
    visible: object.visible, mask: object.layers.mask }));
  const cameraState = camera.toJSON();
  return {
    scene, root, ancestor, camera, expected, foreign,
    assertUnchanged() {
      for (const state of states) {
        assert.equal(state.object.parent, state.parent);
        assert.equal(state.object.material, state.material);
        assert.equal(state.object.visible, state.visible);
        assert.equal(state.object.layers.mask, state.mask);
      }
      assert.deepEqual(camera.toJSON(), cameraState);
    },
    dispose() { geometry.dispose(); material.dispose(); hiddenMaterial.dispose(); spriteMaterial.dispose(); },
  };
}

{
  const f = selectionFixture();
  let time = 0, current = true, partial;
  try {
    await assert.rejects(prepareDeploymentFxPrograms({ ...f,
      now: () => time,
      onReceipt: receipt => { partial = receipt; },
      assertCurrent() { if (!current) throw new Error('cancelled measured FX preparation'); },
      warmRender: { *prepareProgramsSteps() { time += 7; yield; return complete; } },
      yieldProgramFrame: async () => { time += 17; current = false; },
    }), /cancelled measured FX preparation/);
    assert.equal(partial.syncMs, 7);
    assert.equal(partial.maxStepMs, 7);
    assert.equal(partial.totalMs, 24, 'partial cancellation retains paid work and separate wait time');
    assert.deepEqual(partial.result, incomplete('invalidated'));
  } finally { f.dispose(); }
}

{
  const f = selectionFixture();
  let time = 0, frames = 0, closed = 0;
  try {
    const result = await prepareDeploymentFxPrograms({
      ...f, assertCurrent: f.assertUnchanged, now: () => time,
      warmRender: {
        *prepareProgramsSteps(objects, timing) {
          assert.deepEqual(objects, f.expected, 'only actual eligible FX objects are selected');
          assert.equal(new Set(objects.map(object => object.material)).size < objects.length, true,
            'shared materials do not collapse object-dependent program variants');
          try {
            time += 2; timing.submissionMs = 2; yield;
            assert.equal(frames, 1); time += 3; yield;
            assert.equal(frames, 2); time += 4; return complete;
          } finally { closed++; }
        },
        compileAsync() { assert.fail('raw compileAsync must not run'); },
      },
      yieldProgramFrame: async () => { f.assertUnchanged(); frames++; time += 17; },
    });
    assert.deepEqual(result, { objects: 7, result: complete, timing: { submissionMs: 2 },
      stepCount: 3, syncMs: 9, maxStepMs: 4, totalMs: 43 });
    assert.equal(closed, 1);
    f.assertUnchanged();
  } finally { f.dispose(); }
}

for (const disabled of ['root', 'ancestor', 'all-layers']) {
  const f = selectionFixture();
  try {
    if (disabled === 'root') f.root.visible = false;
    if (disabled === 'ancestor') f.ancestor.visible = false;
    if (disabled === 'all-layers') f.camera.layers.mask = 0;
    const result = await prepareDeploymentFxPrograms({ ...f, assertCurrent() {}, now: () => 0,
      warmRender: { prepareProgramsSteps() { assert.fail('an empty selection does no native work'); } },
      yieldProgramFrame: async () => assert.fail('an empty selection does not wait'),
    });
    assert.equal(result.objects, 0);
    assert.deepEqual(result.result, incomplete('not-requested'));
    assert.equal(result.stepCount, 0);
  } finally { f.dispose(); }
}

for (const terminal of [complete, ...['budget', 'query', 'reflection', 'invalidated', 'not-requested']
  .map(reason => ({ status: 'incomplete', pending: 2, reason })), undefined,
  { status: 'complete', pending: 2 }]) {
  const f = selectionFixture();
  let closed = 0, frames = 0;
  try {
    const result = await prepareDeploymentFxPrograms({ ...f, assertCurrent: f.assertUnchanged,
      warmRender: { *prepareProgramsSteps() {
        try { yield; return terminal; } finally { closed++; }
      } },
      yieldProgramFrame: async () => { frames++; },
    });
    assert.equal(closed, 1);
    assert.equal(frames, 1, 'incomplete terminal results do not trigger retries or a longer deadline');
    if (!terminal || (terminal.status === 'complete' && terminal.pending !== 0)) {
      assert.deepEqual(result.result, incomplete('reflection'));
      assert.match(result.error, /without a valid completion receipt/,
        'generator exhaustion alone cannot certify strict completion');
    } else {
      assert.deepEqual(result.result, terminal);
      assert.equal(result.error, undefined);
    }
  } finally { f.dispose(); }
}

for (const boundary of ['create', 'next', 'close']) {
  const f = selectionFixture();
  const failure = new Error(`native ${boundary} ${'x'.repeat(600)}`);
  let closed = 0;
  try {
    const result = await prepareDeploymentFxPrograms({ ...f, assertCurrent: f.assertUnchanged,
      warmRender: { prepareProgramsSteps() {
        if (boundary === 'create') throw failure;
        return {
          next() { if (boundary === 'next') throw failure; return { done: true, value: complete }; },
          return() { closed++; if (boundary === 'close') throw failure; return { done: true, value: complete }; },
        };
      } },
      yieldProgramFrame: async () => assert.fail('native failure cannot request another frame'),
    });
    assert.deepEqual(result.result, incomplete('reflection'));
    assert.equal(result.error, String(failure).slice(0, 512));
    assert.equal(closed, boundary === 'create' ? 0 : 1);
  } finally { f.dispose(); }
}

for (const boundary of ['before', 'next', 'frame', 'terminal', 'native-catch', 'cleanup', 'frame-rejection']) {
  const f = selectionFixture();
  const stale = new Error(`caller lease expired: ${boundary}`);
  let current = boundary !== 'before', created = 0, closed = 0, frameCalls = 0;
  try {
    await assert.rejects(prepareDeploymentFxPrograms({ ...f,
      assertCurrent() { if (!current) throw stale; f.assertUnchanged(); },
      warmRender: { prepareProgramsSteps() {
        created++;
        let next = 0;
        return {
          next() {
            next++;
            if (boundary === 'next') current = false;
            if (boundary === 'native-catch') { current = false; throw new Error('native error'); }
            if (next === 1) return { done: false };
            if (boundary === 'terminal') current = false;
            return { done: true, value: complete };
          },
          return() {
            closed++;
            if (boundary === 'cleanup') current = false;
            return { done: true, value: complete };
          },
        };
      } },
      yieldProgramFrame: async () => {
        frameCalls++;
        if (boundary === 'frame') queueMicrotask(() => { current = false; });
        if (boundary === 'frame-rejection') { current = false; throw new Error('paint failed'); }
      },
    }), error => error === stale, `${boundary}: ownership failure cannot become an optional warm fallback`);
    assert.equal(created, boundary === 'before' ? 0 : 1);
    assert.equal(closed, boundary === 'before' ? 0 : 1);
    if (['before', 'next', 'native-catch'].includes(boundary)) assert.equal(frameCalls, 0);
  } finally { f.dispose(); }
}

{
  const f = selectionFixture();
  const failure = new Error('Visible paint frame did not arrive within 1000 ms');
  let closed = 0;
  try {
    await assert.rejects(prepareDeploymentFxPrograms({ ...f, assertCurrent: f.assertUnchanged,
      warmRender: { *prepareProgramsSteps() { try { yield; return complete; } finally { closed++; } } },
      yieldProgramFrame: async () => { throw failure; },
    }), error => error === failure);
    assert.equal(closed, 1, 'a failed rendering opportunity closes the pending strict generator');
  } finally { f.dispose(); }
}

// The default scheduling port is the real nextPaintFrame, including its task
// after rAF. Controlling the peripheral host must not replace that policy.
{
  const f = selectionFixture(), events = new EventTarget(), frames = new Map(), tasks = [];
  const globals = {
    document: { hidden: false,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events) },
    requestAnimationFrame: callback => { frames.set(1, callback); return 1; },
    cancelAnimationFrame: handle => frames.delete(handle),
    scheduler: { yield: () => new Promise(resolve => tasks.push(resolve)) },
  };
  const originals = new Map(Object.keys(globals)
    .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let resumed = false;
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  try {
    const pending = prepareDeploymentFxPrograms({ ...f, assertCurrent: f.assertUnchanged,
      warmRender: { *prepareProgramsSteps() { yield; resumed = true; return complete; } },
    });
    assert.equal(frames.size, 1);
    frames.get(1)(performance.now());
    for (let index = 0; index < 8; index++) await Promise.resolve();
    assert.equal(tasks.length, 1);
    assert.equal(resumed, false, 'the animation callback alone cannot resume strict work');
    tasks.shift()();
    assert.deepEqual((await pending).result, complete);
    assert.equal(resumed, true);
    assert.equal(frames.size, 0);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    f.dispose();
  }
}

// Compose the real strict offscreen owner with deterministic native I/O. This
// exercises its exact private target, cache cohort, and completion rules without
// starting WebGL or rendering any scene.
for (const mode of ['complete', 'dispose', 'hide', 'reflection-error']) {
  const f = selectionFixture();
  let activeTarget = { caller: true }, face = 3, mip = 2, frames = 0, reflected = 0;
  const callerTarget = activeTarget, properties = new Map(), programs = [];
  const gl = {
    isContextLost: () => false,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 123 }),
    getProgramParameter: () => frames >= 2,
  };
  const renderer = {
    info: { programs }, getContext: () => gl,
    getDrawingBufferSize: size => size.set(800, 600),
    getRenderTarget: () => activeTarget, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget(target, nextFace = 0, nextMip = 0) { activeTarget = target; face = nextFace; mip = nextMip; },
    properties: { get: material => properties.get(material) },
    render() { assert.fail('program preparation does not draw'); },
    compileAsync() { assert.fail('strict preparation cannot use unguarded compileAsync'); },
    compile(selection, camera, targetScene) {
      assert.equal(camera, f.camera); assert.equal(targetScene, f.scene);
      assert.equal(activeTarget.texture.name, 'CombatWarm.color');
      assert.equal(activeTarget.texture.type, THREE.HalfFloatType);
      assert.equal(activeTarget.texture.colorSpace, THREE.LinearSRGBColorSpace);
      assert.equal(activeTarget.width, 100); assert.equal(activeTarget.height, 75);
      const materials = new Set(), selected = [];
      selection.traverse(object => {
        selected.push(object);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          if (properties.has(material)) continue;
          const program = { program: {},
            getUniforms() { if (mode === 'reflection-error') throw new Error('driver reflection failed'); reflected++; return {}; },
            getAttributes: () => ({}),
          };
          programs.push(program);
          properties.set(material, { programs: new Map([[material.id, program]]), currentProgram: null });
        }
      });
      assert.deepEqual(selected, f.expected);
      return materials;
    },
  };
  const warmRender = createOffscreenSceneWarmer(renderer, f.scene, f.camera, 0.125);
  try {
    const result = await prepareDeploymentFxPrograms({ ...f, warmRender, assertCurrent() {},
      yieldProgramFrame: async () => {
        frames++;
        assert.equal(activeTarget, callerTarget); assert.equal(face, 3); assert.equal(mip, 2);
        f.assertUnchanged();
        if (mode === 'dispose') warmRender.dispose();
        if (mode === 'hide') f.root.visible = false;
      },
    });
    assert.equal(result.objects, f.expected.length);
    if (mode === 'complete') {
      assert.deepEqual(result.result, complete);
      assert.equal(frames, 2, 'native readiness receives real program-frame opportunities, not tight task retries');
      assert.ok(reflected > 0);
    } else {
      assert.equal(result.result.status, 'incomplete');
      assert.equal(result.result.reason, mode === 'reflection-error' ? 'reflection' : 'invalidated');
    }
    assert.equal(activeTarget, callerTarget); assert.equal(face, 3); assert.equal(mip, 2);
  } finally { warmRender.dispose(); f.dispose(); }
}

console.log('deploymentFxPrograms.selftest: selected strict private-target preparation, receipts, timing, ownership and cleanup pass');
