import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initTopMaskRig, prepareTopDownMasks, getTopDownMasks } from './tankThumbs.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const gate = { promise, ready: false, resolve(value) { gate.ready = true; resolve(value); }, reject };
  return gate;
}

function fakeCanvas() {
  const canvas = { width: 0, height: 0 };
  const context = {
    image: null, draws: [],
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData(image, x, y) {
      assert.deepEqual([x, y], [0, 0]);
      context.image = { ...image, data: image.data.slice() };
    },
    drawImage(source, ...placement) { context.draws.push({ source, placement }); },
  };
  canvas.getContext = (kind) => { assert.equal(kind, '2d'); return context; };
  canvas.context = context;
  return canvas;
}

function batchFixture(geometry, material) {
  const mesh = new THREE.BatchedMesh(2, 48, 72, material);
  mesh.name = 'test-batch';
  mesh.perObjectFrustumCulled = false;
  mesh.sortObjects = false;
  const geometryId = mesh.addGeometry(geometry);
  for (let index = 0; index < 2; index++) {
    const instanceId = mesh.addInstance(geometryId);
    mesh.setMatrixAt(instanceId, new THREE.Matrix4().makeTranslation(index, 0.5, -index));
    mesh.setColorAt(instanceId, new THREE.Color(index ? 0x4488cc : 0xcc8844));
  }
  mesh._indirectTexture.image.data.set([0, 1]);
  let sourceDisposals = 0;
  let geometryDisposals = 0;
  const dispose = mesh.dispose;
  mesh.dispose = function () { sourceDisposals++; return dispose.call(this); };
  const ownedGeometry = mesh.geometry;
  ownedGeometry.addEventListener('dispose', () => geometryDisposals++);
  const geometryListeners = [...ownedGeometry._listeners.dispose];
  const fields = ['_indirectTexture', '_matricesTexture', '_colorsTexture'];
  const originals = fields.map((field) => {
    const texture = mesh[field];
    const row = { field, texture, source: texture.source, image: texture.image,
      data: texture.image.data, values: [...texture.image.data], sourceVersion: texture.source.version,
      textureVersion: texture.version, disposals: 0 };
    texture.addEventListener('dispose', () => row.disposals++);
    return row;
  });
  const clones = [];
  return { mesh, clones,
    capture(root, fixtureOwned) {
      const node = root.getObjectByName('test-batch');
      const record = { node, fixtureOwned, disposals: 0, geometryDisposals: 0, controls: [] };
      const nativeDispose = node.dispose;
      node.dispose = function () { record.disposals++; return nativeDispose.call(this); };
      node.geometry.addEventListener('dispose', () => record.geometryDisposals++);
      clones.push(record);
    },
    inspectPreparedClone() {
      const record = clones.at(-1);
      assert.notStrictEqual(record.node.geometry, ownedGeometry, 'batch clones own their packed geometry');
      assert.strictEqual(record.node.material, material, 'batch material remains borrowed');
      for (const original of originals) {
        const texture = record.node[original.field];
        assert(texture, `the colored batch retains ${original.field}`);
        assert.notStrictEqual(texture, original.texture);
        assert.notStrictEqual(texture.source, original.source, 'clone control Source cannot alias the live batch');
        assert.notStrictEqual(texture.image, original.image, 'clone control image cannot alias the live batch');
        assert.notStrictEqual(texture.image.data, original.data, 'clone control data cannot alias the live batch');
        assert.deepEqual([...texture.image.data], original.values, 'clone controls preserve exact source values');
        const control = { texture, disposals: 0 };
        texture.addEventListener('dispose', () => control.disposals++);
        record.controls.push(control);
      }
    },
    assertSourceUntouched() {
      assert.strictEqual(mesh.geometry, ownedGeometry);
      assert.strictEqual(mesh.material, material);
      assert.equal(sourceDisposals, 0, 'mask job never disposes the live batch');
      assert.equal(geometryDisposals, 0, 'mask job never disposes live packed geometry');
      for (const original of originals) {
        assert.strictEqual(mesh[original.field], original.texture, 'source control wrapper is stable');
        assert.strictEqual(original.texture.source, original.source, 'source control Source is stable');
        assert.strictEqual(original.texture.image, original.image, 'source control image is stable');
        assert.strictEqual(original.texture.image.data, original.data, 'native clone cannot replace source control data');
        assert.deepEqual([...original.data], original.values, 'clone rendering cannot mutate source control contents');
        assert.equal(original.source.version, original.sourceVersion, 'clone work cannot dirty the source control upload');
        assert.equal(original.texture.version, original.textureVersion, 'source texture version remains stable');
        assert.equal(original.disposals, 0, 'clone cleanup never disposes source control textures');
      }
    },
    assertReleased() {
      assert.deepEqual(ownedGeometry._listeners.dispose, geometryListeners);
      for (const clone of clones) {
        const expected = clone.fixtureOwned ? 0 : 1;
        assert.equal(clone.disposals, expected, 'each accepted batch clone is disposed once');
        assert.equal(clone.geometryDisposals, expected, 'batch cleanup releases its owned packed geometry');
        for (const control of clone.controls) assert.equal(control.disposals, expected,
          'batch cleanup releases each owned control texture once');
      }
    } };
}

function sourceVisual(id, withBatch = false) {
  let clones = 0;
  let disposals = 0;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let instanceDisposals = 0;
  let morphDisposals = 0;
  let cloneFailure = null;
  let cloneFailureAfter = null;
  const instanceClones = [];
  const discardedClones = [];
  const externalDisposals = { geometry: 0, material: 0 };
  const parent = new THREE.Group();
  const root = new THREE.Group();
  root.name = id;
  root.position.set(11, 3, -7);
  root.rotation.set(0.1, 0.7, -0.2);
  root.scale.set(1.2, 1.1, 0.9);
  parent.add(root);
  const hull = new THREE.Group(); hull.name = 'rig_hull'; root.add(hull);
  const turret = new THREE.Group(); turret.name = 'rig_turret'; root.add(turret);
  turret.position.set(0.5, 1.5, 0.25); turret.rotation.y = 0.6;
  const gun = new THREE.Group(); gun.name = 'rig_gun'; turret.add(gun); gun.rotation.x = -0.3;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x819264 });
  geometry.addEventListener('dispose', () => geometryDisposals++);
  material.addEventListener('dispose', () => materialDisposals++);
  const originalGeometryListeners = [...geometry._listeners.dispose];
  const originalMaterialListeners = [...material._listeners.dispose];
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'test-hull'; hull.add(mesh);
  gun.add(new THREE.Mesh(geometry, material));
  const instance = new THREE.InstancedMesh(geometry, material, 2);
  instance.name = 'test-instances';
  instance.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.25, 0.5, 0.75));
  instance.setColorAt(0, new THREE.Color(0x987654));
  instance.morphTexture = new THREE.DataTexture(new Float32Array([1, 0, 0.75, 0.25]), 2, 2,
    THREE.RedFormat, THREE.FloatType);
  instance.addEventListener('dispose', () => instanceDisposals++);
  instance.morphTexture.addEventListener('dispose', () => morphDisposals++);
  hull.add(instance);
  const batch = withBatch ? batchFixture(geometry, material) : null;
  if (batch) hull.add(batch.mesh);
  root.updateMatrixWorld(true);
  root.clone = (...args) => {
    clones++;
    if (cloneFailure) throw cloneFailure;
    const cloned = THREE.Object3D.prototype.clone.apply(root, args);
    cloned.traverse((node) => {
      if (!node.isInstancedMesh) return;
      assert.notStrictEqual(node, instance);
      assert.notStrictEqual(node.instanceMatrix, instance.instanceMatrix);
      assert.notStrictEqual(node.instanceColor, instance.instanceColor);
      assert.notStrictEqual(node.morphTexture, instance.morphTexture);
      assert.strictEqual(node.geometry, geometry);
      assert.strictEqual(node.material, material);
      const record = { node, disposals: 0, morphDisposals: 0, fixtureOwned: !!cloneFailureAfter };
      node.addEventListener('dispose', () => record.disposals++);
      node.morphTexture.addEventListener('dispose', () => record.morphDisposals++);
      instanceClones.push(record);
    });
    batch?.capture(cloned, !!cloneFailureAfter);
    if (cloneFailureAfter) {
      discardedClones.push(cloned);
      throw cloneFailureAfter;
    }
    return cloned;
  };
  const snapshot = () => {
    const nodes = [];
    root.traverse((node) => nodes.push({ uuid: node.uuid, parent: node.parent?.uuid,
      position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray(),
      visible: node.visible, matrix: node.matrix.toArray(), matrixWorld: node.matrixWorld.toArray(),
      geometry: node.geometry?.uuid, material: node.material?.uuid,
      instanceMatrix: node.instanceMatrix ? [...node.instanceMatrix.array] : null,
      instanceColor: node.instanceColor ? [...node.instanceColor.array] : null,
      morphTexture: node.morphTexture?.uuid }));
    return nodes;
  };
  const before = snapshot();
  const assertCloneDisposals = (expected) => {
    for (const clone of instanceClones) {
      const ownedExpected = clone.fixtureOwned ? 0 : expected;
      assert.equal(clone.disposals, ownedExpected, `${id}: each clone-only instance is disposed exactly once after ownership ends`);
      assert.equal(clone.morphDisposals, ownedExpected, `${id}: clone disposal releases only its own morph texture`);
    }
  };
  return { root, parent, mesh, instance, batch, geometry, material, assertCloneDisposals, discardedClones,
    visual: { root, dispose() { disposals++; } },
    get clones() { return clones; },
    rejectClone(error) { cloneFailure = error; },
    rejectAfterClone(error) { cloneFailureAfter = error; },
    disposeBorrowed(kind) {
      externalDisposals[kind]++;
      (kind === 'geometry' ? geometry : material).dispose();
    },
    assertWatching() {
      assert.equal(geometry._listeners.dispose.length, originalGeometryListeners.length + 1,
        'one listener guards each unique borrowed geometry, including queued work');
      assert.equal(material._listeners.dispose.length, originalMaterialListeners.length + 1,
        'one listener guards each unique borrowed material, including queued work');
    },
    assertUntouched() {
      assert.strictEqual(root.parent, parent, 'the live visual is never reparented');
      assert.deepEqual(snapshot(), before, 'live pose, visibility and matrices remain untouched');
      assert.deepEqual([disposals, geometryDisposals, materialDisposals],
        [0, externalDisposals.geometry, externalDisposals.material],
        'only explicit source-owner disposal may release borrowed resources');
      assert.deepEqual([instanceDisposals, morphDisposals], [0, 0],
        'mask cleanup never disposes the original source instance or morph texture');
      assertCloneDisposals(1);
      batch?.assertSourceUntouched();
      batch?.assertReleased();
      assert.deepEqual(geometry._listeners.dispose, originalGeometryListeners,
        'terminal mask work removes its geometry listener without removing owner listeners');
      assert.deepEqual(material._listeners.dispose, originalMaterialListeners,
        'terminal mask work removes its material listener without removing owner listeners');
    } };
}

const spec = (id) => ({ id, dims: { overallLengthM: 8, hullLengthM: 6 },
  armor: { turretPivot: [0.5, 1.5, 0.25], gunBarrel: { lengthM: 4 } } });

function fakeRenderer(sources) {
  const renderer = Object.create(THREE.WebGLRenderer.prototype);
  const originalTarget = { name: 'external-original' };
  let target = originalTarget;
  let face = 3;
  let mip = 2;
  const color = new THREE.Color(0x2468ac);
  let alpha = 0.7;
  let pack = { name: 'external-pack' };
  const initialPack = pack;
  const events = [];
  const buffers = [];
  const syncs = [];
  const destinations = [];
  const compileGates = new Map();
  const compileFailures = new Set();
  const reflectionFailures = new Set();
  const variantCounts = new Map();
  const reusePrograms = new Set();
  const compileHooks = new Map();
  const programHooks = new Map();
  const compiledPrograms = [];
  const bindings = [];
  const readbackFailures = new Set();
  const properties = new WeakMap();
  let targetRestoreFailure = null;
  let targetRestoreLayer = null;
  let currentFrame = null;
  let heldFences = false;
  const describe = (scene) => {
    const root = scene.children[0];
    const source = sources.get(root.name);
    assert(source, 'every test render uses the requested source visual');
    assert.notStrictEqual(root, source.root, 'render work owns a hierarchy clone');
    const mesh = root.getObjectByName('test-hull');
    assert.strictEqual(mesh.geometry, source.geometry);
    assert.strictEqual(mesh.material, source.material);
    return { id: root.name, layer: root.getObjectByName('rig_turret').visible ? 'turret' : 'hull' };
  };
  const gl = {
    PIXEL_PACK_BUFFER: 35051, PIXEL_PACK_BUFFER_BINDING: 35053, BUFFER_SIZE: 34660, STREAM_READ: 35041,
    RGBA: 6408, UNSIGNED_BYTE: 5121, SYNC_GPU_COMMANDS_COMPLETE: 37143,
    ALREADY_SIGNALED: 37146, TIMEOUT_EXPIRED: 37147, CONDITION_SATISFIED: 37148,
    isContextLost: () => false,
    getParameter(parameter) { assert.equal(parameter, gl.PIXEL_PACK_BUFFER_BINDING); return pack; },
    createBuffer() {
      const buffer = { data: null, deleted: 0 }; buffers.push(buffer); return buffer;
    },
    bindBuffer(binding, value) { assert.equal(binding, gl.PIXEL_PACK_BUFFER); pack = value; },
    bufferData(binding, size, usage) {
      assert.deepEqual([binding, size, usage], [gl.PIXEL_PACK_BUFFER, 384 * 384 * 4, gl.STREAM_READ]);
      pack.data = new Uint8Array(size);
    },
    getBufferParameter(binding, parameter) {
      assert.deepEqual([binding, parameter], [gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE]);
      return pack.data.byteLength;
    },
    readPixels(x, y, width, height, format, type, offset) {
      assert.deepEqual([x, y, width, height, format, type, offset],
        [0, 0, 384, 384, gl.RGBA, gl.UNSIGNED_BYTE, 0]);
      assert.equal(target.width, 384); assert.equal(target.height, 384);
      events.push({ kind: 'read', ...currentFrame, target });
      if (readbackFailures.has(currentFrame.id) || readbackFailures.has(`${currentFrame.id}:${currentFrame.layer}`)) {
        throw new Error('injected readback failure');
      }
      pack.frame = { ...currentFrame };
      const hull = currentFrame.layer === 'hull';
      const [x0, x1, y0, y1, coverage] = hull ? [80, 119, 20, 59, 120] : [160, 179, 250, 269, 200];
      for (let row = y0; row <= y1; row++) for (let column = x0; column <= x1; column++) {
        pack.data[(row * width + column) * 4 + 3] = coverage;
      }
      pack.data[3] = 8; // Sub-threshold coverage must not enlarge the mask.
    },
    fenceSync(condition, flags) {
      assert.deepEqual([condition, flags], [gl.SYNC_GPU_COMMANDS_COMPLETE, 0]);
      const sync = { signaled: !heldFences, deleted: 0, ...currentFrame }; syncs.push(sync); return sync;
    },
    flush() {},
    clientWaitSync(sync, flags, timeout) {
      assert.deepEqual([flags, timeout], [0, 0]);
      return sync.signaled ? gl.CONDITION_SATISFIED : gl.TIMEOUT_EXPIRED;
    },
    getBufferSubData(binding, offset, pixels, destinationOffset, length) {
      assert.deepEqual([binding, offset, destinationOffset, length], [gl.PIXEL_PACK_BUFFER, 0, 0, 384 * 384 * 4]);
      destinations.push(pixels);
      pixels.set(pack.data);
      events.push({ kind: 'copy', ...pack.frame });
    },
    deleteSync(sync) { sync.deleted++; },
    deleteBuffer(buffer) { buffer.deleted++; },
  };
  Object.assign(renderer, {
    info: { programs: [] },
    getRenderTarget: () => target,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    setRenderTarget(next, nextFace = 0, nextMip = 0) {
      if (targetRestoreFailure && target?.width === 384 && next?.width !== 384
          && events.at(-1)?.kind === 'read' && (!targetRestoreLayer || currentFrame?.layer === targetRestoreLayer)) {
        const failure = targetRestoreFailure;
        targetRestoreFailure = null;
        throw failure;
      }
      target = next; face = nextFace; mip = nextMip;
      bindings.push({ target, face, mip });
    },
    getClearColor(output) { return output.copy(color); },
    getClearAlpha: () => alpha,
    setClearColor(next, nextAlpha = 1) { color.set(next); alpha = nextAlpha; },
    getContext: () => gl,
    properties: { get: (material) => properties.get(material) },
    clear() {},
    compile(scene, camera) {
      const frame = describe(scene);
      assert(camera instanceof THREE.OrthographicCamera);
      assert.equal(target.width, 384); assert.equal(target.height, 384);
      events.push({ kind: 'compile', ...frame, target });
      const material = scene.children[0].getObjectByName('test-hull').material;
      const key = `${frame.id}:${frame.layer}`;
      const retained = properties.get(material);
      if (reusePrograms.has(frame.id) && retained) {
        compileHooks.get(key)?.(retained);
        return new Set([material]);
      }
      const variants = Array.from({ length: variantCounts.get(key) ?? 1 }, (_, index) => {
        const program = { program: {}, checks: 0, uniforms: 0, attributes: 0, ready: false,
          isReady() {
            program.checks++;
            if (compileFailures.has(frame.id) || compileFailures.has(key)) throw new Error('injected compile failure');
            program.ready = (compileGates.get(`${key}:${index}`) ?? compileGates.get(key))?.ready ?? true;
            programHooks.get(`${key}:isReady`)?.(program);
            return program.ready;
          },
          getUniforms() {
            assert.equal(program.ready, true, 'no mask reflection before exact readiness');
            program.uniforms++;
            if (reflectionFailures.has(key)) throw new Error('injected reflection failure');
            programHooks.get(`${key}:getUniforms`)?.(program);
            return {};
          },
          getAttributes() {
            assert.equal(program.uniforms, 1, 'both reflection tables are prepared exactly once');
            program.attributes++;
            programHooks.get(`${key}:getAttributes`)?.(program);
            return {};
          } };
        compiledPrograms.push({ ...frame, index, program });
        renderer.info.programs.push(program);
        return program;
      });
      const cache = { currentProgram: variants.at(-1), programs: new Map(variants.map((program, index) => [index, program])) };
      properties.set(material, cache);
      compileHooks.get(key)?.(cache);
      return new Set([material]);
    },
    compileAsync() { assert.fail('mask readiness must use the bounded exact-program owner'); },
    render(scene, camera) {
      currentFrame = describe(scene);
      const material = scene.children[0].getObjectByName('test-hull').material;
      assert([...properties.get(material).programs.values()]
        .every((program) => program.uniforms === 1 && program.attributes === 1),
      'rendering requires both tables for every captured variant, not currentProgram alone');
      assert(camera instanceof THREE.OrthographicCamera);
      assert.deepEqual([color.getHex(), alpha], [0, 0]);
      events.push({ kind: 'render', ...currentFrame, target });
      const batch = scene.getObjectByName('test-batch');
      if (batch) {
        batch.setVisibleAt(0, false);
        batch.onBeforeRender(renderer, scene, camera, batch.geometry, batch.material);
      }
    },
    readRenderTargetPixels() { assert.fail('the mask pipeline must not perform a blocking readback'); },
  });
  return { renderer, gl, events, buffers, syncs, destinations, compileGates, compileFailures, readbackFailures,
    reflectionFailures, variantCounts, reusePrograms, compileHooks, programHooks, compiledPrograms, bindings,
    state: () => ({ target, face, mip, color: color.getHex(), alpha, pack }),
    initialPack,
    failNextTargetRestore(error, layer = null) { targetRestoreFailure = error; targetRestoreLayer = layer; },
    holdFences() { heldFences = true; },
    releaseFences() { heldFences = false; for (const sync of syncs) sync.signaled = true; },
    assertReleased() {
      for (const buffer of buffers) assert.equal(buffer.deleted, 1, 'each submitted PBO is released once');
      for (const sync of syncs) assert.equal(sync.deleted, 1, 'each submitted fence is released once');
      assert.strictEqual(pack, initialPack, 'PBO ownership returns to the caller');
    } };
}

const saved = new Map(['document', 'window', 'performance', 'setTimeout', 'clearTimeout']
  .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalWarn = console.warn;
const warnings = [];
const unhandled = [];
const onUnhandled = (error) => unhandled.push(error);
const timers = new Map();
const sources = new Map();
let timerId = 0;
let clock = 100;
const microtasks = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
async function advanceUntil(predicate) {
  for (let i = 0; i < 100; i++) {
    await microtasks();
    if (predicate()) return;
    const next = timers.entries().next().value;
    assert(next, 'the pipeline must progress or expose its awaited gate');
    timers.delete(next[0]);
    clock += Math.max(1, next[1].delay);
    next[1].callback();
  }
  assert.fail('mask pipeline exceeded the bounded fake task budget');
}
async function settle(promise) {
  let done = false;
  let value;
  let problem;
  promise.then((result) => { value = result; done = true; }, (error) => { problem = error; done = true; });
  await advanceUntil(() => done);
  if (problem) throw problem;
  return value;
}

try {
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: { createElement(kind) { assert.equal(kind, 'canvas'); return fakeCanvas(); } } },
    window: { configurable: true, value: {} },
    performance: { configurable: true, value: { now: () => clock } },
    setTimeout: { configurable: true, value: (callback, delay = 0) => {
      timers.set(++timerId, { callback, delay }); return timerId;
    } },
    clearTimeout: { configurable: true, value: (id) => timers.delete(id) },
  });
  console.warn = (...args) => warnings.push(args);
  process.on('unhandledRejection', onUnhandled);
  const addSource = (id, withBatch = false) => {
    const source = sourceVisual(id, withBatch); sources.set(id, source); return source;
  };
  const a = addSource('mask-test-a');
  const b = addSource('mask-test-b');
  const fake = fakeRenderer(sources);
  initTopMaskRig({ renderer: {} });
  assert.equal(await prepareTopDownMasks(spec('no-renderer'), a.visual), null);
  assert.equal(a.clones, 0);
  initTopMaskRig({ renderer: fake.renderer });

  const gate = deferred();
  fake.compileGates.set('mask-test-a:hull', gate);
  fake.holdFences();
  const pendingA = prepareTopDownMasks(spec('mask-test-a'), a.visual);
  assert.strictEqual(prepareTopDownMasks(spec('mask-test-a'), b.visual), pendingA,
    'same-ID callers receive the exact pending promise, ignoring later source visuals');
  let callbackCount = 0;
  assert.equal(getTopDownMasks(spec('mask-test-a'), () => { callbackCount++; throw new Error('subscriber failed'); }, a.visual), null);
  assert.equal(getTopDownMasks(spec('mask-test-a'), () => { callbackCount++; }, a.visual), null);
  const pendingB = prepareTopDownMasks(spec('mask-test-b'), b.visual);
  const latestTrace = window.__TOP_MASK_LOAD;
  assert.deepEqual([a.clones, b.clones], [1, 1], 'each requested visual is cloned once before queued work');
  const originalState = fake.state();
  await advanceUntil(() => fake.events.some((event) => event.kind === 'compile'));
  assert.deepEqual(fake.state(), originalState, 'compile restores target/cube/mip synchronously before waiting');
  assert.deepEqual(fake.events.map(({ kind, id }) => [kind, id]), [['compile', 'mask-test-a']],
    'a queued tank cannot acquire the shared target while the first compile waits');
  assert.strictEqual(window.__TOP_MASK_LOAD, latestTrace, 'an older transaction cannot replace the latest trace');
  a.assertCloneDisposals(0);
  b.assertCloneDisposals(0);
  const submittedProgram = fake.renderer.properties.get(a.material).currentProgram;
  fake.renderer.properties.get(a.material).currentProgram = { program: {}, isReady: () => true };
  await advanceUntil(() => submittedProgram.checks > 0);
  assert(!fake.events.some((event) => event.kind === 'render'),
    'a ready world variant cannot replace the pending captured mask program');

  const duringCompile = { name: 'external-during-compile' };
  fake.renderer.setRenderTarget(duringCompile, 5, 4);
  fake.renderer.setClearColor(0xabcdef, 0.4);
  const afterCompileState = fake.state();
  gate.resolve();
  await advanceUntil(() => fake.events.some((event) => event.kind === 'read'));
  assert.deepEqual(fake.state(), afterCompileState, 'render/readback submission restores current target and color before waiting');
  assert.equal(fake.destinations.length, 0, 'pending fence cannot expose incomplete pixels');
  a.assertCloneDisposals(0);
  await advanceUntil(() => fake.events.some((event) => event.kind === 'read' && event.layer === 'turret'));
  assert.equal(fake.events.filter((event) => event.kind === 'compile').length, 2,
    'turret compile/draw overlaps the hull fence, but another tank cannot start');
  assert.equal(fake.destinations.length, 0, 'both masks can be submitted before either copy completes');
  const turretFence = fake.syncs.find((sync) => sync.layer === 'turret');
  assert(turretFence, 'turret submission owns its fence');
  turretFence.signaled = true;
  await advanceUntil(() => fake.destinations.length === 1);
  assert.deepEqual(fake.events.filter((event) => event.kind === 'copy').map(({ id, layer }) => [id, layer]),
    [['mask-test-a', 'turret']], 'the turret copy may complete before the hull without corrupting either layer');
  assert(!fake.events.some((event) => event.id === 'mask-test-b'), 'next tank still waits for the hull');
  a.assertCloneDisposals(0);
  const duringReadback = { name: 'external-during-readback' };
  fake.renderer.setRenderTarget(duringReadback, 1, 6);
  fake.renderer.setClearColor(0x654321, 0.8);
  const afterReadbackState = fake.state();
  fake.releaseFences();
  const [entryA, entryB] = await settle(Promise.all([pendingA, pendingB]));
  assert(entryA?.ready && entryB?.ready);
  a.assertUntouched();
  b.assertUntouched();
  assert.deepEqual(fake.state(), afterReadbackState, 'async completion never restores stale caller state');
  assert.equal(callbackCount, 2, 'every pending subscriber runs even if the first throws');
  assert(warnings.some((args) => args[0].includes('mask subscriber failed')));
  assert.deepEqual(fake.events.filter((event) => event.kind === 'render').map(({ id, layer }) => [id, layer]),
    [['mask-test-a', 'hull'], ['mask-test-a', 'turret'], ['mask-test-b', 'hull'], ['mask-test-b', 'turret']],
    'each tank owns both passes and canvas copies before the next tank runs');
  assert.equal(new Set(fake.events.map((event) => event.target).filter(Boolean)).size, 1,
    'all mask passes reuse the one shared render target');
  assert.equal(new Set(fake.destinations).size, 2, 'one pixel buffer per layer is reused only between serialized tanks');
  assert.equal(window.__TOP_MASK_LOAD.status, 'complete');
  assert.deepEqual(window.__TOP_MASK_LOAD.intervals.map(({ stage }) => stage).sort(),
    ['clone', 'build', 'hullCompile', 'hullRender', 'hullReadback', 'hullCanvas',
      'turretCompile', 'turretRender', 'turretReadback', 'turretCanvas'].sort());
  for (const layer of ['hull', 'turret']) {
    assert(Number.isFinite(window.__TOP_MASK_LOAD.readbacks[layer].copy));
    assert(Number.isFinite(window.__TOP_MASK_LOAD.readbacks[layer].wait));
  }

  for (const [layer, sourceX, sourceY, coverage] of [['hull', 80, 20, 120], ['turret', 160, 250, 200]]) {
    const output = entryA[layer].canvas;
    assert.deepEqual([output.width, output.height], [192, 192]);
    const [{ source, placement }] = output.context.draws;
    assert.deepEqual(placement, [0, 0, 192, 192], 'cached masks downscale the exact supersampled canvas');
    assert.deepEqual([source.width, source.height], [384, 384]);
    const pixels = source.context.image.data;
    const offset = ((383 - sourceY) * 384 + sourceX) * 4;
    assert.deepEqual([...pixels.subarray(offset, offset + 4)], [255, 255, 255, coverage],
      'readback alpha becomes a white mask at the vertically flipped row');
    assert.equal(pixels[(sourceY * 384 + sourceX) * 4 + 3], 0, 'unflipped source rows remain transparent');
    assert.equal(pixels[(383 * 384) * 4 + 3], 0, 'coverage at or below 8 does not enter the mask');
  }
  const half = 8 * 0.62 + 0.35;
  const metresPerPixel = half * 2 / 384;
  assert(Math.abs(entryA.hull.widthM - 40 * metresPerPixel) < 1e-12);
  assert(Math.abs(entryA.hull.lengthM - 40 * metresPerPixel) < 1e-12);
  assert(Math.abs(entryA.hull.cx - (half - 100 * metresPerPixel)) < 1e-12);
  assert(Math.abs(entryA.hull.cz - (half - 344 * metresPerPixel)) < 1e-12);
  assert.deepEqual(entryA.pivot, [0.5, 0.25]);
  assert.equal(entryA.pxPerM, 192 / (half * 2));
  const eventCount = fake.events.length;
  assert.strictEqual(getTopDownMasks(spec('mask-test-a'), null, a.visual), entryA,
    'synchronous activation adopts the completed entry');
  assert.strictEqual(await prepareTopDownMasks(spec('mask-test-a'), a.visual), entryA);
  assert.equal(fake.events.length, eventCount, 'completed cache activation submits no new work');
  assert.equal(a.clones, 1);

  for (const failure of ['compile', 'readback']) {
    const badId = `mask-test-${failure}-failed`;
    const goodId = `mask-test-after-${failure}`;
    const bad = addSource(badId);
    const good = addSource(goodId);
    (failure === 'compile' ? fake.compileFailures : fake.readbackFailures).add(badId);
    const rejectedMask = prepareTopDownMasks(spec(badId), bad.visual);
    const failedTrace = window.__TOP_MASK_LOAD;
    const followingMask = prepareTopDownMasks(spec(goodId), good.visual);
    const [failed, following] = await settle(Promise.all([rejectedMask, followingMask]));
    assert.equal(failed, null, `${failure}: cache preparation preserves the vector fallback`);
    assert(following?.ready, `${failure}: failure releases the queue for the next tank`);
    assert.equal(failedTrace.status, 'failed');
    assert(failedTrace.intervals.every((row) => row.endTime >= row.startTime));
    const submissions = fake.events.length;
    assert.equal(getTopDownMasks(spec(badId), null, bad.visual), null);
    assert.equal(await prepareTopDownMasks(spec(badId), bad.visual), null);
    assert.equal(fake.events.length, submissions, 'cached failure does not enqueue repeated GPU work');
    assert.deepEqual(fake.state(), afterReadbackState, `${failure}: failure preserves caller renderer state`);
  }

  const disposedSource = addSource('mask-program-disposed');
  const afterDisposedSource = addSource('mask-after-program-disposed');
  fake.compileGates.set('mask-program-disposed:hull', deferred());
  const disposedRequest = prepareTopDownMasks(spec(disposedSource.root.name), disposedSource.visual);
  const disposedTrace = window.__TOP_MASK_LOAD;
  const afterDisposedRequest = prepareTopDownMasks(spec(afterDisposedSource.root.name), afterDisposedSource.visual);
  await advanceUntil(() => fake.events.some((event) => event.kind === 'compile' && event.id === disposedSource.root.name));
  fake.renderer.properties.get(disposedSource.material).currentProgram.program = undefined;
  const [disposedResult, afterDisposedResult] = await settle(Promise.all([disposedRequest, afterDisposedRequest]));
  assert.equal(disposedResult, null, 'a destroyed captured program fails to the existing mask fallback');
  assert(afterDisposedResult?.ready, 'destroyed program ownership does not stall the next queued tank');
  assert.equal(disposedTrace.status, 'failed');
  assert(!fake.events.some((event) => event.kind === 'render' && event.id === disposedSource.root.name),
    'destroyed mask programs cannot reach a draw');
  assert.deepEqual(fake.state(), afterReadbackState);

  const restoreSource = addSource('mask-restore-failed');
  const afterRestoreSource = addSource('mask-after-restore');
  const restoreProblem = new Error('original target restoration failure');
  fake.failNextTargetRestore(restoreProblem);
  fake.holdFences();
  let restoreSettled = false;
  const restoreRequest = prepareTopDownMasks(spec(restoreSource.root.name), restoreSource.visual);
  restoreRequest.then(() => { restoreSettled = true; });
  const afterRestoreRequest = prepareTopDownMasks(spec(afterRestoreSource.root.name), afterRestoreSource.visual);
  await advanceUntil(() => fake.events.some((event) => event.kind === 'read' && event.id === restoreSource.root.name));
  assert.equal(fake.state().color, afterReadbackState.color, 'target restore failure cannot skip clear-color restoration');
  assert.equal(fake.state().alpha, afterReadbackState.alpha, 'target restore failure cannot skip clear-alpha restoration');
  assert.equal(restoreSettled, false, 'target restore failure still owns and awaits the submitted readback');
  restoreSource.assertCloneDisposals(0);
  assert(!fake.events.some((event) => event.id === afterRestoreSource.root.name),
    'the next tank cannot compile or reuse pixels before the failed transaction fence settles');
  assert(!warnings.some((args) => String(args[0]).includes(restoreSource.root.name)),
    'the failed transaction does not publish completion before its pending writer is joined');
  // A normal frame can restore its own target while the failed submission waits.
  fake.renderer.setRenderTarget(afterReadbackState.target, afterReadbackState.face, afterReadbackState.mip);
  fake.releaseFences();
  const [restoreResult, afterRestoreResult] = await settle(Promise.all([restoreRequest, afterRestoreRequest]));
  assert.equal(restoreResult, null);
  assert(afterRestoreResult?.ready);
  assert(fake.events.findIndex((event) => event.kind === 'copy' && event.id === restoreSource.root.name)
    < fake.events.findIndex((event) => event.kind === 'compile' && event.id === afterRestoreSource.root.name),
  'the submitted copy is drained before a restoration failure releases queue ownership');
  assert(warnings.some((args) => args[0].includes(restoreSource.root.name) && args[1] === restoreProblem.message),
    'the original restoration failure survives readback draining and cleanup');
  const copiesAfterRestore = fake.destinations.length;
  await microtasks();
  assert.equal(fake.destinations.length, copiesAfterRestore, 'no late copy remains after the queue resumes');
  assert.deepEqual(fake.state(), afterReadbackState);

  // Both orders of failure must drain the other layer before releasing the
  // cloned source or admitting another tank to the shared framebuffer.
  for (const failure of ['turret-compile', 'turret-reflection', 'turret-restore', 'hull-copy', 'turret-copy', 'disposed-both']) {
    const name = `mask-overlap-${failure}`;
    const borrowed = addSource(name);
    const following = addSource(`${name}-next`);
    fake.holdFences();
    const turretGate = deferred();
    if (failure === 'turret-compile') fake.compileFailures.add(`${name}:turret`);
    if (failure === 'turret-reflection') fake.reflectionFailures.add(`${name}:turret`);
    if (failure === 'turret-restore') fake.failNextTargetRestore(new Error('turret restore failed'), 'turret');
    if (failure === 'hull-copy') fake.compileGates.set(`${name}:turret`, turretGate);
    const request = prepareTopDownMasks(spec(name), borrowed.visual);
    const trace = window.__TOP_MASK_LOAD;
    let finished = false;
    request.then(() => { finished = true; });
    const next = prepareTopDownMasks(spec(following.root.name), following.visual);
    const bothSubmitted = ['turret-copy', 'turret-restore', 'disposed-both'].includes(failure);
    await advanceUntil(() => fake.events.some((event) => event.id === name
      && event.layer === 'turret' && event.kind === (bothSubmitted ? 'read' : 'compile')));
    const owned = fake.syncs.filter((sync) => sync.id === name);
    assert.equal(owned.length, bothSubmitted ? 2 : 1);
    if (failure.endsWith('copy')) {
      const layer = failure === 'hull-copy' ? 'hull' : 'turret';
      const copy = fake.gl.getBufferSubData;
      fake.gl.getBufferSubData = () => { fake.gl.getBufferSubData = copy; throw new Error(`${layer} copy failed`); };
      const failedFence = owned.find((sync) => sync.layer === layer);
      assert(failedFence, `${layer}: the failed copy owns its fence`);
      failedFence.signaled = true;
      await advanceUntil(() => failedFence.deleted === 1);
    } else if (failure === 'disposed-both') borrowed.disposeBorrowed('material');
    await microtasks();
    assert.equal(finished, false, `${failure}: settlement waits for the other outstanding phase`);
    borrowed.assertCloneDisposals(0);
    assert(!fake.events.some((event) => event.id === following.root.name));
    fake.renderer.setRenderTarget(afterReadbackState.target, afterReadbackState.face, afterReadbackState.mip);
    turretGate.resolve();
    fake.releaseFences();
    const [result, successor] = await settle(Promise.all([request, next]));
    assert.equal(result, null);
    assert(successor?.ready);
    assert.equal(trace.status, 'failed');
    assert(trace.intervals.every((row) => row.endTime >= row.startTime));
    assert(owned.every((sync) => sync.deleted === 1));
    borrowed.assertUntouched();
    assert.deepEqual(fake.state(), afterReadbackState);
  }

  {
    const lostSource = addSource('mask-overlap-context-lost');
    const following = addSource('mask-after-overlap-context-lost');
    const contextQuery = fake.gl.isContextLost;
    const copiesBefore = fake.destinations.length;
    fake.holdFences();
    const request = prepareTopDownMasks(spec(lostSource.root.name), lostSource.visual);
    const trace = window.__TOP_MASK_LOAD;
    let finished = false;
    request.then(() => { finished = true; });
    const next = prepareTopDownMasks(spec(following.root.name), following.visual);
    await advanceUntil(() => fake.events.some((event) => event.id === lostSource.root.name
      && event.layer === 'turret' && event.kind === 'read'));
    const ownedSyncs = fake.syncs.filter((sync) => sync.id === lostSource.root.name);
    const ownedBuffers = fake.buffers.filter((buffer) => buffer.frame?.id === lostSource.root.name);
    assert.equal(ownedSyncs.length, 2, 'context loss exercises both pending layer fences');
    assert.equal(ownedBuffers.length, 2, 'each pending layer owns a distinct PBO');
    assert.equal(fake.destinations.length, copiesBefore);
    try {
      fake.gl.isContextLost = () => true;
      await advanceUntil(() => ownedSyncs.filter((sync) => sync.deleted === 1).length === 1);
      assert.equal(finished, false, 'one failed layer cannot release the other pending writer');
      lostSource.assertCloneDisposals(0);
      assert(!fake.events.some((event) => event.id === following.root.name));
      assert.equal(await settle(request), null, 'context loss preserves the vector-mask fallback');
      assert.equal(trace.status, 'failed');
      assert(ownedSyncs.every((sync) => sync.deleted === 1));
      assert(ownedBuffers.every((buffer) => buffer.deleted === 1));
      assert.equal(fake.destinations.length, copiesBefore, 'lost-context writers never copy stale pixels');
      assert(!trace.intervals.some((row) => row.stage.endsWith('Canvas')));
      lostSource.assertUntouched();
      assert(!fake.events.some((event) => event.id === following.root.name),
        'the queued successor has not submitted work before context restoration');
      assert.deepEqual(fake.state(), afterReadbackState);
    } finally {
      fake.gl.isContextLost = contextQuery;
      fake.releaseFences();
    }
    assert((await settle(next))?.ready, 'restoration lets the next queued tank prepare normally');
    following.assertUntouched();
    assert.deepEqual(fake.events.filter((event) => event.kind === 'copy').slice(-2)
      .map(({ id, layer }) => [id, layer]),
    [[following.root.name, 'hull'], [following.root.name, 'turret']]);
    assert.equal(fake.destinations.length, copiesBefore + 2, 'no old writer copies after restoration');
    assert.equal(timers.size, 0, 'both lost-context writers and the successor leave no detached polls');
    assert.deepEqual(fake.state(), afterReadbackState);
  }

  const slowTurret = addSource('mask-held-turret-compile');
  const slowTurretGate = deferred();
  fake.compileGates.set(`${slowTurret.root.name}:turret`, slowTurretGate);
  const slowTurretRequest = prepareTopDownMasks(spec(slowTurret.root.name), slowTurret.visual);
  await advanceUntil(() => fake.events.some((event) => event.kind === 'copy' && event.id === slowTurret.root.name));
  assert(!fake.events.some((event) => event.kind === 'render' && event.id === slowTurret.root.name && event.layer === 'turret'));
  slowTurret.assertCloneDisposals(0);
  fake.renderer.setRenderTarget({ name: 'frame-while-turret-compiles' }, 4, 7);
  fake.renderer.setClearColor(0xabcdef, 0.2);
  const slowTurretState = fake.state();
  slowTurretGate.resolve();
  assert((await settle(slowTurretRequest))?.ready);
  assert.deepEqual(fake.state(), slowTurretState, 'turret restores the current frame state, never the hull submission state');
  slowTurret.assertUntouched();
  fake.renderer.setRenderTarget(afterReadbackState.target, afterReadbackState.face, afterReadbackState.mip);
  fake.renderer.setClearColor(afterReadbackState.color, afterReadbackState.alpha);

  for (const when of ['queued', 'hull-readback']) for (const resource of ['geometry', 'material']) {
    const name = `mask-source-dispose-${when}-${resource}`;
    const borrowed = addSource(name);
    const following = addSource(`${name}-next`);
    let blockerRequest = Promise.resolve(null);
    let blockerGate;
    if (when === 'queued') {
      const blocker = addSource(`${name}-blocker`);
      blockerGate = deferred();
      fake.compileGates.set(`${blocker.root.name}:hull`, blockerGate);
      blockerRequest = prepareTopDownMasks(spec(blocker.root.name), blocker.visual);
      await advanceUntil(() => fake.events.some((event) => event.kind === 'compile' && event.id === blocker.root.name));
    } else fake.holdFences();
    const borrowedRequest = prepareTopDownMasks(spec(name), borrowed.visual);
    const borrowedTrace = window.__TOP_MASK_LOAD;
    let borrowedSettled = false;
    borrowedRequest.then(() => { borrowedSettled = true; });
    const followingRequest = prepareTopDownMasks(spec(following.root.name), following.visual);
    borrowed.assertWatching();
    if (when === 'hull-readback') {
      await advanceUntil(() => fake.events.some((event) => event.kind === 'read' && event.id === name));
    }
    borrowed.disposeBorrowed(resource);
    const submissionsAtDisposal = fake.events.filter((event) => event.id === name && event.kind !== 'copy').length;
    await microtasks();
    assert.equal(borrowedSettled, false, 'disposal cannot abandon queued ownership or a submitted PBO writer');
    borrowed.assertCloneDisposals(0);
    assert(!fake.events.some((event) => event.id === following.root.name),
      'following work waits for the disposed request to settle in queue order');
    if (blockerGate) blockerGate.resolve();
    else fake.releaseFences();
    const [, borrowedResult, followingResult] = await settle(Promise.all([
      blockerRequest, borrowedRequest, followingRequest,
    ]));
    assert.equal(borrowedResult, null, `${when}/${resource}: disposed source uses the existing fallback`);
    assert(followingResult?.ready, `${when}/${resource}: disposal cannot poison the queue`);
    assert.equal(borrowedTrace.status, 'failed');
    assert.equal(fake.events.filter((event) => event.id === name && event.kind !== 'copy').length,
      submissionsAtDisposal, `${when}/${resource}: no further compile/render/read occurs after source disposal`);
    if (when === 'queued') {
      assert(!fake.events.some((event) => event.id === name),
        'a source disposed while queued never reaches its first compile');
    } else {
      assert(fake.events.findIndex((event) => event.kind === 'copy' && event.id === name)
        < fake.events.findIndex((event) => event.kind === 'compile' && event.id === following.root.name),
      'source disposal drains its already-started readback before releasing shared pixels');
    }
    borrowed.assertUntouched();
    following.assertUntouched();
    assert.deepEqual(fake.state(), afterReadbackState);
    const freshSource = addSource(`${name}-fresh-source`);
    const freshRequest = prepareTopDownMasks(spec(name), freshSource.visual);
    assert.strictEqual(prepareTopDownMasks(spec(name), freshSource.visual), freshRequest,
      'a new valid source coalesces one same-spec retry after source invalidation');
    assert.equal(freshSource.clones, 1, 'cancelled source lifetime does not poison the spec cache');
    assert((await settle(freshRequest))?.ready,
      `${when}/${resource}: next-match preparation can use the fresh live source`);
    freshSource.assertUntouched();
  }

  const cloneRejected = addSource('mask-clone-rejected');
  cloneRejected.rejectClone(new Error('injected clone failure'));
  assert.equal(await prepareTopDownMasks(spec(cloneRejected.root.name), cloneRejected.visual), null);
  cloneRejected.assertUntouched();
  assert(!fake.events.some((event) => event.id === cloneRejected.root.name),
    'clone rejection leaves no borrowed resource listener or queued renderer work');

  for (const throwsAfterClone of [false, true]) {
    const batched = addSource(`mask-batch-${throwsAfterClone ? 'throw' : 'success'}`, true);
    if (throwsAfterClone) batched.rejectAfterClone(new Error('injected error after native clone'));
    const batchRequest = prepareTopDownMasks(spec(batched.root.name), batched.visual);
    batched.batch.assertSourceUntouched();
    if (!throwsAfterClone) batched.batch.inspectPreparedClone();
    const batchResult = await settle(batchRequest);
    assert.equal(!!batchResult?.ready, !throwsAfterClone);
    batched.assertUntouched();
    if (throwsAfterClone) assert(!fake.events.some((event) => event.id === batched.root.name),
      'a throwing clone leaves restored source controls without scheduling GPU work');
  }

  {
    const source = addSource('mask-retained-variants');
    const key = `${source.root.name}:hull`;
    const gate = deferred();
    fake.variantCounts.set(key, 4); // Shared ordinary/instanced and back/front variants.
    fake.compileGates.set(`${key}:0`, gate);
    fake.compileHooks.set(key, (cache) => cache.programs.set('duplicate', cache.programs.get(0)));
    const request = prepareTopDownMasks(spec(source.root.name), source.visual);
    await advanceUntil(() => fake.compiledPrograms.some((entry) => entry.id === source.root.name && entry.program.checks > 0));
    const variants = fake.compiledPrograms.filter((entry) => entry.id === source.root.name);
    assert.equal(variants.length, 4);
    assert.equal(variants[0].program.uniforms, 0, 'non-current pending variants cannot be reflected');
    assert.equal(variants.at(-1).program.uniforms, 1, 'the current variant alone is already prepared');
    assert(!fake.events.some((event) => event.id === source.root.name && event.kind === 'render'),
      'a ready currentProgram cannot bypass a pending retained variant');
    gate.resolve();
    assert((await settle(request))?.ready);
    assert(variants.every(({ program }) => program.uniforms === 1 && program.attributes === 1),
      'full-cache capture deduplicates wrappers and initializes each table once');
  }

  {
    const source = addSource('mask-same-programs-both-layers');
    const id = source.root.name;
    fake.reusePrograms.add(id);
    fake.variantCounts.set(`${id}:hull`, 3);
    let originalCache;
    const accessors = [];
    fake.compileHooks.set(`${id}:hull`, (cache) => {
      originalCache = cache;
      for (const program of cache.programs.values()) {
        const calls = { uniforms: 0, attributes: 0 };
        for (const [method, field] of [['getUniforms', 'uniforms'], ['getAttributes', 'attributes']]) {
          const initialize = program[method].bind(program);
          let table;
          program[method] = () => { calls[field]++; return table ??= initialize(); };
        }
        accessors.push(calls);
      }
    });
    fake.compileHooks.set(`${id}:turret`, (cache) => assert.strictEqual(cache, originalCache,
      'native-style repeated compilation retains the exact material cache and program wrappers'));
    assert((await settle(prepareTopDownMasks(spec(id), source.visual)))?.ready);
    const created = fake.compiledPrograms.filter((entry) => entry.id === id);
    assert.equal(created.length, 3, 'the turret compile adds no replacement programs');
    assert(accessors.every(({ uniforms, attributes }) => uniforms === 2 && attributes === 2),
      'both passes validate both tables on the same borrowed wrappers');
    assert(created.every(({ program }) => program.uniforms === 1 && program.attributes === 1),
      'cached table access never repeats first-use reflection');
    assert.deepEqual(fake.events.filter((event) => event.id === id && event.kind === 'render')
      .map(({ layer }) => layer), ['hull', 'turret']);
    source.assertUntouched();
  }

  for (const invalid of ['empty-cache', 'missing-cache', 'null-handle', 'undefined-handle']) {
    const source = addSource(`mask-evidence-${invalid}`);
    fake.compileHooks.set(`${source.root.name}:hull`, (cache) => {
      if (invalid === 'empty-cache') cache.programs.clear();
      else if (invalid === 'missing-cache') delete cache.programs;
      else cache.currentProgram.program = invalid === 'null-handle' ? null : undefined;
    });
    assert.equal(await settle(prepareTopDownMasks(spec(source.root.name), source.visual)), null);
    assert(!fake.events.some((event) => event.id === source.root.name && event.kind === 'render'),
      `${invalid}: missing selected-material evidence never reaches the mask draw`);
    assert.deepEqual(fake.state(), afterReadbackState);
  }

  for (const boundary of ['compile', 'wait', 'outer-await']) {
    for (const changed of ['info', 'context']) {
      const source = addSource(`mask-${boundary}-${changed}`);
      const isolated = fakeRenderer(sources);
      initTopMaskRig({ renderer: isolated.renderer });
      const key = `${source.root.name}:hull`;
      let changedAtBindings = -1;
      const change = () => {
        changedAtBindings = isolated.bindings.length;
        if (changed === 'info') isolated.renderer.info = { programs: [...isolated.renderer.info.programs] };
        else {
          const replacement = { ...isolated.gl };
          isolated.renderer.getContext = () => replacement;
        }
      };
      if (boundary === 'compile') isolated.compileHooks.set(key, change);
      if (boundary === 'outer-await') isolated.programHooks.set(`${key}:getAttributes`, () => queueMicrotask(change));
      const request = prepareTopDownMasks(spec(source.root.name), source.visual);
      if (boundary === 'wait') {
        await advanceUntil(() => isolated.events.some((event) => event.kind === 'compile'));
        change();
      }
      assert.equal(await settle(request), null, `${boundary}/${changed}: renderer lifetime changes reject preparation`);
      assert(!isolated.events.some((event) => event.kind === 'render'),
        'even a completed receipt is revalidated after the outer await before real rendering');
      assert.equal(isolated.bindings.length, changedAtBindings,
        'a changed lifetime receives no stale target restore or subsequent mask binding');
      isolated.assertReleased();
      source.assertUntouched();
      initTopMaskRig({ renderer: fake.renderer });
    }
  }

  const cacheSources = Array.from({ length: 12 }, (_, index) => addSource(`mask-cache-${index}`));
  const cacheGate = deferred();
  fake.compileGates.set('mask-cache-0:hull', cacheGate);
  const cacheRequests = cacheSources.map((source) => prepareTopDownMasks(spec(source.root.name), source.visual));
  await advanceUntil(() => fake.events.some((event) => event.kind === 'compile' && event.id === 'mask-cache-0'));
  for (const index of [0, 5, 11]) {
    assert.strictEqual(prepareTopDownMasks(spec(`mask-cache-${index}`), cacheSources[index].visual), cacheRequests[index],
      'more than ten queued IDs cannot evict a still-pending promise');
  }
  assert(cacheSources.every((source) => source.clones === 1), 'pending-cache pressure cannot duplicate source clones');
  assert.equal(fake.events.filter((event) => event.kind === 'compile' && event.id.startsWith('mask-cache-')).length, 1,
    'the blocked first request retains exclusive ownership while more than ten IDs queue');
  cacheGate.resolve();
  const cacheEntries = await settle(Promise.all(cacheRequests));
  assert(cacheEntries.every((entry) => entry?.ready));
  const completedEvents = fake.events.length;
  assert.strictEqual(await prepareTopDownMasks(spec('mask-cache-2'), cacheSources[2].visual), cacheEntries[2],
    'touch the oldest retained completed entry before the next insertion');
  assert.equal(fake.events.length, completedEvents, 'touching a completed mask performs no render work');
  const incoming = addSource('mask-cache-12');
  assert((await settle(prepareTopDownMasks(spec('mask-cache-12'), incoming.visual)))?.ready);
  assert.strictEqual(await prepareTopDownMasks(spec('mask-cache-2'), cacheSources[2].visual), cacheEntries[2],
    'a completed prepare touch protects that entry from LRU eviction');
  const rebake = prepareTopDownMasks(spec('mask-cache-3'), cacheSources[3].visual);
  assert.strictEqual(prepareTopDownMasks(spec('mask-cache-3'), cacheSources[3].visual), rebake,
    'the evicted oldest entry still coalesces its single replacement bake');
  assert.equal(cacheSources[3].clones, 2, 'the oldest untouched completed entry was evicted and recloned once');
  const replacement = await settle(rebake);
  assert(replacement?.ready);
  assert.notStrictEqual(replacement, cacheEntries[3], 'an evicted entry produces a new completed mask');
  assert.equal(fake.events.filter((event) => event.kind === 'render' && event.id === 'mask-cache-3').length, 4,
    'one original and one replacement bake each render exactly two passes');
  assert.equal(cacheSources[2].clones, 1, 'the touched retained entry was not rebuilt');

  const failedSources = Array.from({ length: 12 }, (_, index) => addSource(`mask-failed-cache-${index}`));
  for (const source of failedSources) fake.compileFailures.add(source.root.name);
  const failedEntries = await settle(Promise.all(failedSources.map((source) =>
    prepareTopDownMasks(spec(source.root.name), source.visual))));
  assert(failedEntries.every((entry) => entry === null));
  assert.equal(await prepareTopDownMasks(spec('mask-failed-cache-2'), failedSources[2].visual), null);
  const incomingFailure = addSource('mask-failed-cache-12');
  fake.compileFailures.add(incomingFailure.root.name);
  assert.equal(await settle(prepareTopDownMasks(spec(incomingFailure.root.name), incomingFailure.visual)), null);
  assert.equal(await prepareTopDownMasks(spec('mask-failed-cache-2'), failedSources[2].visual), null);
  assert.equal(failedSources[2].clones, 1, 'a touched failed entry remains cached without repeated GPU work');
  const failureRetry = prepareTopDownMasks(spec('mask-failed-cache-3'), failedSources[3].visual);
  assert.strictEqual(prepareTopDownMasks(spec('mask-failed-cache-3'), failedSources[3].visual), failureRetry);
  assert.equal(failedSources[3].clones, 2, 'failed entries also obey the ten-entry completed-cache bound');
  assert.equal(await settle(failureRetry), null);
  assert.equal(fake.events.filter((event) => event.kind === 'compile' && event.id === 'mask-failed-cache-3').length, 2,
    'failure eviction allows one coalesced retry, not duplicate queued failures');

  for (const source of sources.values()) source.assertUntouched();
  fake.assertReleased();
  assert.equal(timers.size, 0, 'all scheduled tasks finish without detached polling');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, [], 'restoration/readback failures leave no unhandled promise rejection');
} finally {
  initTopMaskRig(null);
  timers.clear();
  for (const source of sources.values()) {
    for (const discarded of source.discardedClones) discarded.traverse((node) => {
      if (node.isInstancedMesh || node.isBatchedMesh) node.dispose();
    });
    source.batch?.mesh.dispose();
    source.instance.dispose();
    source.geometry.dispose();
    source.material.dispose();
    source.parent.clear();
  }
  sources.clear();
  process.removeListener('unhandledRejection', onUnhandled);
  console.warn = originalWarn;
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('tankThumbs.selftest: real mask exports preserve queue, cache, pixel layout, renderer and source ownership');
