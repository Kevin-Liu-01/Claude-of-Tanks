// blackWorldGuard.selftest.mjs — the battle's black-world guard (engine/blackWorldGuard.ts, 2026-10-19, black-screen-228)
// on a stub renderer whose scene pass lands nothing exactly when the owner's signature says it would: a camera without
// layer 0, a hidden scene or battlefield root, an override material, the scene pass switched off, an empty viewport, a
// GL state that rejects every world draw, a non-finite history. The probe's answers come through two occlusion queries
// that are available two frames later, as on a GPU. Every incident must be detected within two probes, healed
// inside 30 frames by the right rung, named in its receipt, and reported once; a healthy battle, a covered entry, a
// black lunar sky overhead and an unfocused page never open one; 600 healthy frames allocate nothing in the guard.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Session } from 'node:inspector/promises';
import { fileURLToPath } from 'node:url';
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
const DT = 1 / 60;

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
  const gpu = { glMasked: false, nan: false, errors: [], queries: 0, lost: false, census: 0, airless: false, groundInView: true };
  let sceneOutput = 'lit';
  let activeQuery = null;
  const gl = {
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, ANY_SAMPLES_PASSED: 0x8c2f, QUERY_RESULT: 0x8866, QUERY_RESULT_AVAILABLE: 0x8867,
    NO_ERROR: 0, FRAMEBUFFER: 0x8d40, FRAMEBUFFER_COMPLETE: 0x8cd5, COLOR_WRITEMASK: 0xc23, DEPTH_WRITEMASK: 0xb72,
    DEPTH_TEST: 0xb71, DEPTH_FUNC: 0xb74, VIEWPORT: 0xba2, SCISSOR_TEST: 0xc11, SCISSOR_BOX: 0xc10, BLEND: 0xbe2,
    CULL_FACE: 0xb44, RASTERIZER_DISCARD: 0x8c89, CURRENT_PROGRAM: 0x8b8d,
    isContextLost: () => gpu.lost,
    createQuery: () => { gpu.queries++; return { polls: 0, passed: false }; },
    deleteQuery() {},
    beginQuery(_target, query) { activeQuery = query; query.polls = 0; query.passed = false; },
    endQuery() { activeQuery = null; },
    getQueryParameter(query, name) { return name === gl.QUERY_RESULT_AVAILABLE ? ++query.polls >= 2 : (query.passed ? 1 : 0); },
    readPixels(_x, _y, w, h, _format, _type, out) {
      gpu.census++;
      for (let i = 0; i < w * h; i++) {
        const lit = sceneOutput === 'lit';
        out[i * 4] = lit ? 255 : 0; out[i * 4 + 1] = gpu.nan && i % 16 < 4 ? 255 : 0; out[i * 4 + 2] = lit ? 255 : 0;
        out[i * 4 + 3] = Math.floor(i / 16) < 4 ? 255 : 0;
      }
    },
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
    // the probe's draws: a query counts the cells its material keeps (an airless map keeps ground cells only)
    render(object) {
      info.render.calls += 1;
      const name = object?.material?.name;
      if (!activeQuery) return;
      if (name === 'BlackWorldGuard.ProbeLit') {
        activeQuery.passed = sceneOutput === 'lit' && (object.material.uniforms.uAllCells.value === 1 || gpu.groundInView);
      } else if (name === 'BlackWorldGuard.ProbeNan') activeQuery.passed = gpu.nan;
    },
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
  const aerial = { enabled: true, uniforms: { uHazeDatum: { value: 0 }, uAirless: { value: 0 } } };
  const lateFx = { enabled: true, target: lateTarget, prepared: true };
  const gtao = { enabled: false, setSize() { history.ao++; } };
  const taa = { resetHistory() { history.taa++; } };
  const composer = { passes: [sceneAA, aerial, gtao, lateFx], renderTarget1: new THREE.WebGLRenderTarget(4, 4),
    renderTarget2: new THREE.WebGLRenderTarget(4, 4) };
  const post = {
    sceneAA, aerial, lateFx, gtao, taa, composer, dynScale: 0.67, perfTrim: 0, msaaSamples: 0, sizes: [],
    render() {
      info.render.calls += 12; // shadow-free post passes
      if (sceneAA.enabled) post.sceneAA.render(renderer, null, null, DT, false);
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
      post.render(DT, DT);
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

// ---- the allocation child (spawned below): warm the path up, then three sampled windows of 600 healthy frames ----
if (process.argv.includes('--allocation-windows')) {
  const h = createWorld();
  h.frames(60_000);
  const session = new Session();
  session.connect();
  await session.post('HeapProfiler.enable');
  // (one unsampled sampling window first: turning the sampler on can send the hot path back through the JIT once)
  await session.post('HeapProfiler.startSampling', { samplingInterval: 16 });
  h.frames(1200);
  await session.post('HeapProfiler.stopSampling');
  const windows = [];
  for (let w = 0; w < 5; w++) {
    await session.post('HeapProfiler.startSampling', { samplingInterval: 16,
      includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    h.frames(600);
    const { profile } = await session.post('HeapProfiler.stopSampling');
    const where = [];
    const walk = (node) => {
      if (/blackWorldGuard\.ts/.test(node.callFrame.url) && node.selfSize > 0) {
        where.push([`${node.callFrame.functionName || '(anonymous)'}:${node.callFrame.lineNumber + 1}`, node.selfSize]);
      }
      for (const next of node.children) walk(next);
    };
    walk(profile.head);
    windows.push({ bytes: where.reduce((sum, [, size]) => sum + size, 0), where });
  }
  session.disconnect();
  console.log(JSON.stringify({ windows, probes: h.guard.stats().probes }));
  process.exit(0);
}

// ---- the pure parts ----
{
  const cells = new Uint8Array(PROBE_CELLS * 4);
  const out = { black: 0, nan: 0, lit: 0, deep: 0, ground: 0, groundBlack: 0 };
  for (let i = 0; i < PROBE_CELLS; i++) cells[i * 4 + 3] = i < 64 ? 255 : 0;
  countProbeCells(cells, out);
  assert.deepEqual(out, { black: PROBE_CELLS, nan: 0, lit: 0, deep: 0, ground: 64, groundBlack: 64 }, 'an empty scene target: every cell black');
  for (let i = 0; i < PROBE_CELLS; i++) { cells[i * 4] = 255; cells[i * 4 + 2] = 255; }
  countProbeCells(cells, out);
  assert.equal(out.black, 0);
  // the ground census: a camera 10 m up looking at the horizon sees ground in its lower half, one looking at the
  // zenith none (a black lunar sky overhead is not a black world)
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  camera.position.set(0, 10, 0); camera.lookAt(0, 10, -100); camera.updateMatrixWorld(true);
  const horizon = countGroundCells(camera.matrixWorld, camera.projectionMatrixInverse, 10, 4000);
  assert.ok(horizon >= 0.4 * PROBE_CELLS && horizon <= 0.6 * PROBE_CELLS, `horizon view: ${horizon} ground cells`);
  camera.lookAt(0, 1000, -1); camera.updateMatrixWorld(true);
  assert.equal(countGroundCells(camera.matrixWorld, camera.projectionMatrixInverse, 10, 4000), 0, 'zenith view: no ground cell');
  const dark = { anyLit: false, anyNan: false, allCells: true, ground: 0 };
  assert.equal(judgeVerdict(0, dark), 'gl-masked', 'nothing drawn anywhere');
  assert.equal(judgeVerdict(CPU.EMPTY, dark), 'empty-scene-pass');
  assert.equal(judgeVerdict(CPU.MASK | CPU.EMPTY, dark), 'camera-layer-mask', 'a CPU signal names the class first');
  assert.equal(judgeVerdict(0, { ...dark, allCells: false, ground: 0 }), null, 'airless, looking at black space: no verdict');
  assert.equal(judgeVerdict(0, { ...dark, allCells: false, ground: 72 }), 'gl-masked', 'airless, ground in view and black');
  assert.equal(judgeVerdict(0, { ...dark, anyLit: true }), null, 'any lit cell: the world drew');
  assert.equal(judgeVerdict(0, { anyLit: true, anyNan: true, allCells: true, ground: 0 }), 'nan-history');
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
  // heap sampling (five 600-frame windows, in a child on the optimizing tier alone: --no-maglev)
  // (no inlining either: a stand-in's own allocation must not be billed to the guard frame that called it)
  const child = spawnSync(process.execPath, ['--no-maglev', '--no-turbo-inlining', '--max-old-space-size=2048', fileURLToPath(import.meta.url),
    '--allocation-windows'], { encoding: 'utf8', maxBuffer: 16 << 20 });
  const line = String(child.stdout).trim().split('\n').filter((l) => l.startsWith('{"windows"')).pop();
  assert.ok(child.status === 0 && line, `the allocation child ran: ${child.status} ${String(child.stderr).slice(-400)}`);
  const { windows } = JSON.parse(line);
  // a per-frame or per-probe allocation reads in every window (9.6 KB or 0.8 KB at 16 B); a one-off of the runtime (a
  // feedback vector, a code tier-up: ~2 KB once) reads in one: at least three of the five windows hold nothing at all
  assert.ok(windows.filter((w) => w.bytes === 0).length >= 3, `no guard allocation in steady 600-frame windows: ${JSON.stringify(windows)}`);
  h.frames(600);
  assert.equal(h.guard.stats().incidents, 0);
  assert.ok(h.guard.stats().probes >= 50, 'the probe kept its cadence');
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

// ---- an airless map looking up at black space: no incident; the same map with its ground black: healed ----
{
  const h = createWorld();
  h.post.aerial.uniforms.uAirless.value = 1;
  h.frames(30);
  // the camera at the zenith: black space and no ground cell in view, the scene healthy: nothing for the lit query to keep
  h.camera.lookAt(0, 1000, -1); h.camera.updateMatrixWorld(true);
  h.gpu.groundInView = false;
  h.frames(60);
  assert.equal(h.guard.stats().incidents, 0, 'a black lunar sky overhead opens no incident');
  assert.equal(h.guard.stats().lastLit, false, '(the lit query kept nothing)');
  // back to the horizon, the ground in view, and the scene pass landing nothing: a black world
  h.camera.lookAt(0, 10, -100); h.camera.updateMatrixWorld(true);
  h.gpu.groundInView = true;
  const frames = healFrames(h, () => { h.gpu.glMasked = true; });
  assert.ok(frames <= 30, `airless, ground in view, black: healed in ${frames} frames`);
  assert.equal(h.guard.receipts[0].class, 'gl-masked');
  assert.ok(h.guard.receipts[0].probe.ground > 0, 'the census counts the ground cells');
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
  + 'enumerated receipts and one record per incident, gating, the ladder, resume policy, no guard allocation in steady 600-frame windows');
