// blackWorldGuard.selftest.mjs — the battle's black-world guard (engine/blackWorldGuard.ts, 2026-10-19, black-screen-228)
// on a stub renderer whose scene pass lands nothing exactly when the owner's signature says it would: a camera without
// layer 0, a hidden scene or battlefield root, an override material, the scene pass switched off, an empty viewport, a
// GL state that rejects every world draw, a non-finite history. The probe's readback goes through a pixel-pack buffer
// and a fence that signals two frames later, as on a GPU. Every incident must be detected within two probes, healed
// inside 30 frames by the right rung, named in its receipt, and reported once; a healthy battle, a covered entry, a
// black lunar sky overhead and an unfocused page never open one; 600 healthy frames allocate nothing in the guard.
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import * as THREE from 'three';

// a document and a window for the guard's listeners (resume, focus) and its cover lookup
const listeners = new Map();
const on = (target) => ({
  addEventListener(type, fn) { listeners.set(`${target}:${type}`, fn); },
  removeEventListener(type, fn) { if (listeners.get(`${target}:${type}`) === fn) listeners.delete(`${target}:${type}`); },
});
const cover = { classList: { on: false, contains(name) { return name === 'on' && this.on; } } };
globalThis.window = globalThis;
Object.assign(globalThis, on('window'));
globalThis.document = { ...on('document'), hidden: false, pointerLockElement: null, hasFocus: () => true,
  querySelector: (selector) => (selector === '.cot-bl' ? cover : null) };
const fire = (key) => listeners.get(key)?.();

const { installBlackWorldGuard, judgeVerdict, countProbeCells, countGroundCells, CPU, PROBE_CELLS, PROBE_EVERY } =
  await import('./blackWorldGuard.ts');
const { readRenderBlackWorld, renderBlackWorldCode, renderBlackWorldMessage, validateTelemetryRecord } =
  await import('../../server/telemetryRecord.ts');

function createWorld({ focused = () => true } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 10, -100);
  camera.updateMatrixWorld(true);
  const world = new THREE.Group(); world.name = 'world-badlands';
  world.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()); sky.name = 'atmosphere-dome';
  const tank = new THREE.Group(); tank.name = 'tank_t72'; tank.add(new THREE.Object3D());
  const fxRoot = new THREE.Group(); fxRoot.name = 'fx';
  const sun = new THREE.DirectionalLight();
  scene.add(world, sky, tank, fxRoot, sun);

  // ---- the GPU stand-in: the scene pass's output is the world model's verdict ----
  const gpu = { glMasked: false, nan: false, buffers: new Map(), errors: [], fences: 0, lost: false, readbacks: 0 };
  let sceneOutput = 'lit';
  const cells = new Uint8Array(PROBE_CELLS * 4);
  const fillCells = () => {
    for (let i = 0; i < PROBE_CELLS; i++) {
      const lit = sceneOutput === 'lit';
      cells[i * 4] = lit ? 255 : 0;
      cells[i * 4 + 1] = gpu.nan && i % 16 < 4 ? 255 : 0;
      cells[i * 4 + 2] = lit ? 255 : 0;
      cells[i * 4 + 3] = 255;
    }
  };
  let boundPack = null;
  const syncs = [{ polls: 0 }, { polls: 0 }];
  const gl = {
    PIXEL_PACK_BUFFER: 0x88eb, STREAM_READ: 0x88e1, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    TIMEOUT_EXPIRED: 0x911b, WAIT_FAILED: 0x911d, ALREADY_SIGNALED: 0x911a, NO_ERROR: 0, FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5, COLOR_WRITEMASK: 0xc23, DEPTH_WRITEMASK: 0xb72, DEPTH_TEST: 0xb71, DEPTH_FUNC: 0xb74,
    VIEWPORT: 0xba2, SCISSOR_TEST: 0xc11, SCISSOR_BOX: 0xc10, BLEND: 0xbe2, CULL_FACE: 0xb44, RASTERIZER_DISCARD: 0x8c89,
    CURRENT_PROGRAM: 0x8b8d,
    isContextLost: () => gpu.lost,
    createBuffer: () => ({ data: null }),
    deleteBuffer() {},
    bindBuffer(_target, buffer) { boundPack = buffer; },
    bufferData(_target, size) { boundPack.data = new Uint8Array(size); },
    readPixels() { fillCells(); boundPack.data.set(cells); gpu.readbacks++; },
    getBufferSubData(_target, _offset, out) { out.set(boundPack.data); },
    // (the browser hands back a fresh WebGLSync per fence: the API's one object, not the guard's; the stand-in reuses two
    // so the heap sample below measures the guard's own code)
    fenceSync() { const sync = syncs[gpu.fences++ % 2]; sync.polls = 0; return sync; },
    clientWaitSync(sync) { return ++sync.polls >= 2 ? gl.ALREADY_SIGNALED : gl.TIMEOUT_EXPIRED; },
    deleteSync() {},
    getError: () => gpu.errors.shift() ?? 0,
    getExtension: (name) => (name === 'WEBGL_lose_context' ? { loseContext() { gpu.loseCalls = (gpu.loseCalls ?? 0) + 1; }, restoreContext() {} } : null),
    getParameter: () => null,
    checkFramebufferStatus: () => 0x8cd5,
  };
  const info = { autoReset: false, render: { calls: 0, triangles: 0 }, programs: [] };
  let renderTarget = null;
  const renderer = {
    info, autoClear: true, clippingPlanes: [], localClippingEnabled: false, shadowMap: { enabled: true },
    domElement: { dataset: {}, addEventListener() {}, removeEventListener() {} },
    getContext: () => gl,
    getRenderTarget: () => renderTarget,
    setRenderTarget(target) { renderTarget = target; },
    render() { info.render.calls += 1; },
    getSize: (target) => target.set(1512, 945),
    properties: { get: () => ({}) },
    state: { bindFramebuffer() {} },
  };

  // ---- the post stand-in: the canonical chain, its scene pass draws the world model ----
  const sceneTarget = new THREE.WebGLRenderTarget(1013, 633, { depthTexture: new THREE.DepthTexture(1013, 633) });
  const lateTarget = new THREE.WebGLRenderTarget(1013, 633);
  const history = { resets: 0, taa: 0, ao: 0 };
  scene.userData.volumetricClouds = { resetHistory() { history.resets++; gpu.nan = false; } };
  sceneTarget.addEventListener('dispose', () => { gpu.glMasked = false; });
  const sceneAA = {
    enabled: true, sceneTarget,
    setSamples(samples) { sceneTarget.samples = samples; },
    render(r) {
      const drawn = (camera.layers.mask & 1) !== 0 && scene.visible && scene.overrideMaterial === null
        && world.visible && world.parent === scene && sceneTarget.viewport.z >= 1;
      if (drawn) r.info.render.calls += 240;
      sceneOutput = drawn && !gpu.glMasked ? 'lit' : 'black';
    },
  };
  const aerial = { enabled: true, uniforms: { uHazeDatum: { value: 0 } } };
  const lateFx = { enabled: true, target: lateTarget, prepared: true };
  const gtao = { enabled: false, setSize() { history.ao++; } };
  const taa = { resetHistory() { history.taa++; } };
  const composer = { passes: [sceneAA, aerial, gtao, lateFx], renderTarget1: new THREE.WebGLRenderTarget(4, 4),
    renderTarget2: new THREE.WebGLRenderTarget(4, 4) };
  const post = {
    sceneAA, aerial, lateFx, gtao, taa, composer, dynScale: 0.67, perfTrim: 0, msaaSamples: 0, sizes: [],
    render() {
      info.render.calls += 12; // shadow-free post passes
      if (sceneAA.enabled) post.sceneAA.render(renderer, null, null, 1 / 60, false);
      else sceneOutput = 'lit'; // the aerial pass reads the last scene target: a frozen world, never black
    },
    setSize(w, h) { post.sizes.push([w, h]); },
  };
  const game = { phase: 'battle', tanks: [{ visual: { root: tank } }] };
  const reports = [];
  const rescues = { count: 0 };
  let clock = 0;
  const lifecycle = { pending: false, renderingCovered: false };
  const guard = installBlackWorldGuard({
    renderer, scene, camera, post, game,
    getWorld: () => ({ group: world }),
    isCovered: () => lifecycle.pending || lifecycle.renderingCovered,
    combatWarm: { cancelRare() { rescues.cancelRare = (rescues.cancelRare ?? 0) + 1; } },
    relieveGraphics() { rescues.count++; },
    presetName: () => 'high',
    report(stage, message, code) { reports.push({ stage, message, code }); },
    now: () => clock,
    hasFocus: focused,
    isExempt: () => false,
  });
  const frames = (n, each = null) => {
    for (let i = 0; i < n; i++) {
      // the battle presentation sets every actor's visibility each frame (battlePresentationRuntime.ts)
      tank.visible = true;
      each?.(i);
      post.render(1 / 60, 1 / 60);
      clock += 1000 / 60;
    }
  };
  return { scene, camera, world, sky, tank, renderer, gl, gpu, post, sceneAA, sceneTarget, game, guard, reports, rescues,
    history, lifecycle, frames, now: () => clock };
}

/** Run until the guard's open incident (if any) closes; the frames from the fault to the healed frame. */
function healFrames(h, inject, limit = 120) {
  const incidentsBefore = h.guard.stats().incidents;
  inject();
  for (let i = 1; i <= limit; i++) {
    h.frames(1);
    const s = h.guard.stats();
    if (s.incidents > incidentsBefore && s.incident === null) return i;
  }
  return Infinity;
}

// ---- the pure parts ----
{
  const cells = new Uint8Array(PROBE_CELLS * 4);
  const out = { black: 0, nan: 0, lit: 0, deep: 0 };
  countProbeCells(cells, out);
  assert.deepEqual(out, { black: PROBE_CELLS, nan: 0, lit: 0, deep: 0 }, 'an empty scene target: every cell black');
  for (let i = 0; i < PROBE_CELLS; i++) { cells[i * 4] = 255; cells[i * 4 + 2] = 255; }
  countProbeCells(cells, out);
  assert.equal(out.black, 0);
  // the ground census: a camera 10 m up looking at the horizon sees ground in its lower half, one looking at the
  // zenith none (a black lunar sky overhead is not a black world)
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  camera.position.set(0, 10, 0); camera.lookAt(0, 10, -100); camera.updateMatrixWorld(true);
  cells.fill(0);
  const ground = { ground: 0, groundBlack: 0 };
  countGroundCells(cells, camera.matrixWorld, camera.projectionMatrixInverse, 10, 4000, ground);
  assert.ok(ground.ground >= 0.4 * PROBE_CELLS && ground.ground <= 0.6 * PROBE_CELLS, `horizon view: ${ground.ground} ground cells`);
  assert.equal(ground.groundBlack, ground.ground);
  camera.lookAt(0, 1000, -1); camera.updateMatrixWorld(true);
  countGroundCells(cells, camera.matrixWorld, camera.projectionMatrixInverse, 10, 4000, ground);
  assert.equal(ground.ground, 0, 'zenith view: no ground cell');
  const black = { black: PROBE_CELLS, nan: 0, ground: 72, groundBlack: 72 };
  assert.equal(judgeVerdict(0, black), 'gl-masked');
  assert.equal(judgeVerdict(CPU.EMPTY, black), 'empty-scene-pass');
  assert.equal(judgeVerdict(CPU.MASK | CPU.EMPTY, black), 'camera-layer-mask', 'a CPU signal names the class first');
  assert.equal(judgeVerdict(0, { ...black, ground: 0, groundBlack: 0 }), null, 'black overhead with no ground in view');
  assert.equal(judgeVerdict(0, { black: 120, nan: 0, ground: 72, groundBlack: 60 }), null, 'a dark night is not black');
  assert.equal(judgeVerdict(0, { black: 0, nan: 2, ground: 72, groundBlack: 0 }), 'nan-history');
  assert.equal(judgeVerdict(0, { black: 0, nan: 1, ground: 72, groundBlack: 0 }), null, 'one stray cell is under 1 %');
  assert.equal(judgeVerdict(CPU.EMPTY, null), null, 'an empty scene pass waits for the probe');
}

// ---- telemetry schema: enumerated, personal-data-free ----
{
  assert.equal(renderBlackWorldCode('camera-layer-mask', 'H1'), 'render-black-world:camera-layer-mask:H1');
  assert.equal(renderBlackWorldCode('player-name', 'H1'), null);
  assert.equal(renderBlackWorldCode('gl-masked', 'H9'), null);
  const message = renderBlackWorldMessage({ calls: 0, mask: 32, vis: true, preset: 'high', warm: 'rareEffects', heal: 'H1',
    room: 'ABCD', preset2: 'x', settings: 'Kevin' });
  assert.equal(message, 'calls=0 mask=32 vis=1 preset=high warm=rareEffects heal=H1', 'unknown keys and free words dropped');
  const valid = validateTelemetryRecord({ v: 2, sid: 'sabcdefgh12', build: 'v1.0.0', kind: 'error', outcome: 'notice', stage: 'render',
    code: 'render-black-world:camera-layer-mask:H1', error: { message, frames: [] } });
  assert.equal(valid.ok, true);
  const read = readRenderBlackWorld(valid.record);
  assert.equal(read.blackClass, 'camera-layer-mask');
  assert.equal(read.step, 'H1');
  assert.equal(read.fields.calls, '0');
  assert.equal(readRenderBlackWorld({ code: 'uncaught' }), null);
}

// ---- a healthy battle: probes on cadence, no incident, nothing allocated in the guard over 600 frames ----
{
  const h = createWorld();
  h.frames(60);
  const s = h.guard.stats();
  assert.equal(s.incidents, 0);
  assert.ok(s.probes >= Math.floor(60 / PROBE_EVERY) - 1 && s.probes <= Math.ceil(60 / PROBE_EVERY) + 2, `probes on cadence: ${s.probes}`);
  assert.ok(s.readbacks >= s.probes - 1, 'every probe reads back two frames later');
  assert.equal(h.reports.length, 0);
  // heap sampling: no allocation attributed to the guard's own frames (after the JIT has seen the path: the interpreter
  // boxes every double it touches, which says nothing about the code)
  h.frames(30_000);
  const session = new Session();
  session.connect();
  await session.post('HeapProfiler.enable');
  await session.post('HeapProfiler.startSampling', { samplingInterval: 16,
    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  h.frames(600);
  const { profile } = await session.post('HeapProfiler.stopSampling');
  session.disconnect();
  const guardBytes = [];
  const walk = (node) => {
    if (/blackWorldGuard\.ts/.test(node.callFrame.url) && node.selfSize > 0) {
      guardBytes.push(`${node.callFrame.functionName || '(anonymous)'}:${node.callFrame.lineNumber + 1} ${node.selfSize} B`);
    }
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  assert.deepEqual(guardBytes, [], `600 healthy frames allocate nothing in the guard (heap sampling at 16 B): ${guardBytes.join(', ')}`);
  assert.equal(h.guard.stats().incidents, 0);
  assert.ok(h.guard.stats().probes >= 50, 'the probe kept its cadence through the sampled frames');
}

// ---- gating: no probe under the cover, outside battle, when disabled; no verdict while unfocused ----
{
  const h = createWorld();
  h.lifecycle.pending = true;
  h.frames(40);
  assert.equal(h.guard.stats().probes, 0, 'covered: no probe');
  h.lifecycle.pending = false;
  cover.classList.on = true;
  h.frames(40);
  assert.equal(h.guard.stats().probes, 0, 'the loader shown: no probe');
  cover.classList.on = false;
  h.game.phase = 'garage';
  h.frames(40);
  assert.equal(h.guard.stats().probes, 0, 'the Garage: no probe');
  h.game.phase = 'battle';
  h.guard.enabled = false;
  h.camera.layers.set(5);
  h.frames(40);
  assert.equal(h.guard.stats().probes, 0, 'disabled: the wrappers pass straight through');
  assert.equal(h.guard.stats().incidents, 0);
  h.camera.layers.set(0);
  h.guard.enabled = true;
  let focused = false;
  const u = createWorld({ focused: () => focused });
  u.camera.layers.set(5);
  u.frames(60);
  assert.equal(u.guard.stats().incidents, 0, 'unfocused: no verdict');
  focused = true;
  u.frames(30);
  assert.equal(u.guard.stats().incidents, 1, 'focus back: the black world is judged');
  u.guard.dispose();
  h.guard.dispose();
}

// ---- the heal proofs (the acceptance table's injections, on the stub) ----
const proofs = [
  ['camera-layer-mask', 'H1', (h) => h.camera.layers.set(5)],
  ['roots-hidden', 'H1', (h) => { for (const root of h.scene.children) if (root.name !== 'fx' && !root.isLight) root.visible = false; }],
  ['roots-hidden', 'H1', (h) => h.scene.remove(h.world)],
  ['override', 'H1', (h) => { h.scene.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false }); }],
  ['passes', 'H1', (h) => { h.sceneAA.enabled = false; }],
  ['scene-hidden', 'H1', (h) => { h.scene.visible = false; }],
  ['viewport', 'H1', (h) => { h.sceneTarget.viewport.set(0, 0, 0, 0); }],
  ['gl-masked', 'H2', (h) => { h.gpu.glMasked = true; }],
  ['nan-history', 'H2', (h) => { h.gpu.nan = true; }],
];
for (const [expected, healedBy, inject] of proofs) {
  const h = createWorld();
  h.frames(30);
  const frames = healFrames(h, () => inject(h));
  assert.ok(frames <= 30, `${expected}: healed in ${frames} frames (<= 30 at 60 Hz)`);
  const [receipt] = h.guard.receipts;
  assert.equal(receipt.class, expected, `${expected}: named`);
  assert.equal(receipt.healedBy, healedBy, `${expected}: healed by ${healedBy} (steps ${receipt.steps.map((s) => s.step).join(',')})`);
  assert.ok(receipt.roots.length >= 4 && receipt.target.width === h.sceneTarget.width, `${expected}: the receipt names roots and target`);
  assert.equal(globalThis.__GL_DIAG.blackWorld.at(-1), receipt, `${expected}: the ring holds the receipt`);
  assert.equal(h.reports.length, 1, `${expected}: one record`);
  assert.equal(h.reports[0].stage, 'render');
  assert.equal(h.reports[0].code, `render-black-world:${expected}:${healedBy}`);
  assert.ok(validateTelemetryRecord({ v: 2, sid: 'sabcdefgh12', build: 'v1.0.0', kind: 'error', outcome: 'notice', stage: 'render',
    code: h.reports[0].code, error: { message: h.reports[0].message, frames: [] } }).ok, `${expected}: the record validates`);
  if (healedBy === 'H2') assert.ok(h.history.resets >= 1 && h.history.taa >= 1, `${expected}: the histories reset`);
  // healthy afterwards: no second incident
  h.frames(120);
  assert.equal(h.guard.stats().incidents, 1, `${expected}: stays healed`);
  assert.equal(h.camera.layers.mask & 1, 1);
  assert.ok(h.tank.visible, 'tank roots keep the presentation\'s own visibility');
  h.guard.dispose();
}

// ---- a fault re-applied every frame for 5 s climbs the ladder to H3 and logs every rung; H4 waits for CPU health ----
{
  const h = createWorld();
  h.frames(30);
  h.frames(300, () => h.camera.layers.set(5));
  const [receipt] = h.guard.receipts;
  assert.equal(receipt.class, 'camera-layer-mask');
  assert.deepEqual(receipt.steps.map((s) => s.step), ['H1', 'H2', 'H3', 'H4']);
  assert.match(receipt.steps[3].note, /skipped/, 'no context restore for a CPU signal');
  assert.equal(h.gpu.loseCalls ?? 0, 0);
  assert.equal(h.sceneTarget.samples, 0, 'H3: MSAA off');
  assert.equal(h.rescues.count, 0, 'no graphics-recovery preset for a CPU signal');
  h.frames(30);
  assert.equal(receipt.closed, true, 'the incident closes once the fault stops (H1 re-asserted inside the cooldown)');
  assert.equal(receipt.healedBy, 'H1');
  assert.ok(receipt.repeats >= 1);
  assert.equal(h.reports.length, 1);
  h.guard.dispose();
}

// ---- a GL-level fault that nothing but a context restore fixes: H3 rescues, H4 restores ----
{
  const h = createWorld();
  h.frames(30);
  h.frames(240, () => { h.gpu.glMasked = true; });
  const [receipt] = h.guard.receipts;
  assert.equal(receipt.class, 'gl-masked');
  assert.deepEqual(receipt.steps.map((s) => s.step), ['H1', 'H2', 'H3', 'H4']);
  assert.equal(h.rescues.count, 1, 'H3 takes the graphics-recovery preset on a CPU-healthy black');
  assert.equal(h.gpu.loseCalls, 1, 'H4 restores the context');
  assert.ok(h.rescues.cancelRare >= 1, 'H1 closes the live rare warm');
  h.guard.dispose();
}

// ---- a resume resets the histories only when the last probe saw a non-finite cell ----
{
  const h = createWorld();
  h.frames(30);
  const before = h.history.resets;
  fire('window:focus');
  assert.equal(h.history.resets, before, 'a clean resume keeps the histories (no re-converging cloud pop)');
  h.gpu.nan = true;
  h.frames(PROBE_EVERY + 3);
  h.gpu.nan = false; // the history itself recovered; the bit stays until a resume reads it
  fire('window:focus');
  assert.equal(h.history.resets, before + 1, 'a resume after a non-finite probe resets them');
  h.guard.onCoveredEntry();
  assert.equal(h.history.resets, before + 2, 'a covered entry resets them before the reveal');
  h.guard.dispose();
}

// ---- a lost context: the probe stands down, no verdict ----
{
  const h = createWorld();
  h.frames(30);
  h.gpu.lost = true;
  h.frames(60, () => h.camera.layers.set(5));
  assert.equal(h.guard.stats().incidents, 0, 'a lost context is the recovery owner\'s, not a black world');
  h.guard.dispose();
}

console.log('blackWorldGuard.selftest: detection within two probes, the right rung heals each injected class inside 30 frames, '
  + 'enumerated receipts and one record per incident, gating, the ladder, resume policy, zero guard allocation over 600 frames');
