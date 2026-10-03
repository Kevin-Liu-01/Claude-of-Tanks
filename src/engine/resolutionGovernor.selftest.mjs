// Receipt for the dynamic-resolution governor's state machine (2026-10-02, the frame-budget lane): High's
// native-density floor (renderScalePolicy.ts), the GPU-informed rules (adaptiveQualityPolicy.ts: the predicted
// up-step, the main-thread guard, the proportional cut), the sampled GPU timer (gpuFrameTimer.ts) and a closed loop —
// the real policy driven every 1.5 s by a frame model of a mid-range GPU (GPU ms = fixed + per-pixel × scale²,
// vsync-quantized presentation) — that must settle under the budget without flapping, recover when the load drops,
// and leave a main-thread-bound frame at full resolution.
import assert from 'node:assert/strict';
import {
  AdaptiveQualityPolicy, GPU_BOUND_SHARE, GPU_DOWN_TARGET, GPU_TRUST_SHARE, GPU_UP_HEADROOM, MAX_RESOLUTION_STEPS_PER_CUT,
} from './adaptiveQualityPolicy.ts';
import { RETINA_PIXEL_RATIO, dynamicScaleFloor, internalPixelRatio, reconstructionMode } from './renderScalePolicy.ts';
import { createGpuFrameTimer } from './gpuFrameTimer.ts';
import { PRESETS } from './quality.ts';

// ---------------------------------------------------------------------------------------------- the floor

assert.equal(PRESETS.high.nativeDynMin, 0.67, 'High may fall to FSR1\'s quality ratio on a native-density display');
assert.equal(dynamicScaleFloor(1, PRESETS.high), 0.67);
assert.equal(dynamicScaleFloor(1.25, PRESETS.high), 0.67, 'a 1080p laptop at 125 % scaling is native density');
assert.equal(dynamicScaleFloor(1.5, PRESETS.high), 0.67);
assert.equal(RETINA_PIXEL_RATIO, 1.75);
assert.equal(dynamicScaleFloor(2, PRESETS.high), 0.9, 'retina High keeps its 1.35 effective floor');
assert.equal(dynamicScaleFloor(1, PRESETS.ultra), 1, 'Ultra keeps the native fence');
assert.equal(dynamicScaleFloor(1, PRESETS.medium), 1, 'Medium keeps the native fence');
assert.equal(dynamicScaleFloor(1, { nativeDynMin: 0.2 }), 0.5, 'a native floor is never below half resolution');
assert.equal(internalPixelRatio(1, PRESETS.high, 0.5), 0.67, 'the floor holds whatever the policy asks');
assert.equal(reconstructionMode(0.67), 'easu+rcas', 'the floor is reconstructed by EASU + RCAS');

// ---------------------------------------------------------------------------------------------- GPU-informed rules

const BUDGET = 1000 / 60;
const windowOf = (overrides = {}) => ({
  clockSeconds: 10, frameEmaMs: 16.6, frameBudgetMs: BUDGET, missedFrameRatio: 0, achievedFps: 60,
  dynamicScaleFloor: 0.67, maximumTrim: 0, mayRaiseTier: false, gpuFrameMs: null, ...overrides,
});
const overload = (overrides = {}) => windowOf({ frameEmaMs: 24, missedFrameRatio: 0.6, achievedFps: 42, ...overrides });

{
  const p = new AdaptiveQualityPolicy(1);
  assert.equal(p.evaluate(overload({ gpuFrameMs: null })), 'resolution-down', 'no GPU sample: the cadence rule (one step)');
  assert.ok(Math.abs(p.dynamicScale - 0.91) < 1e-12);
}
{
  const p = new AdaptiveQualityPolicy(1);
  // 30 ms of GPU presents every other vsync slot (33.3 ms)
  assert.equal(p.evaluate(overload({ frameEmaMs: 33.3, gpuFrameMs: 30 })), 'resolution-down');
  assert.ok(Math.abs(p.dynamicScale - (1 - 0.09 * MAX_RESOLUTION_STEPS_PER_CUT)) < 1e-12,
    'a GPU twice over budget cuts two steps at once (the target is under the budget, the cut is bounded)');
  const q = new AdaptiveQualityPolicy(1);
  q.evaluate(overload({ gpuFrameMs: 18 }));
  assert.ok(Math.abs(q.dynamicScale - 0.91) < 1e-12, 'a GPU just over budget: one step');
  assert.ok(GPU_DOWN_TARGET < 1);
}
{
  const p = new AdaptiveQualityPolicy(1);
  const gpu = BUDGET * GPU_BOUND_SHARE * 0.9;
  assert.equal(p.evaluate(overload({ clockSeconds: 9, gpuFrameMs: gpu })), 'none',
    'a main-thread overload never trades resolution (it strikes toward the tier lever instead)');
  assert.equal(p.dynamicScale, 1);
  for (let t = 10; t < 20; t += 2) p.evaluate(overload({ clockSeconds: t, gpuFrameMs: gpu }));
  assert.equal(p.dynamicScale, 1, 'still full resolution after repeated main-thread overloads');
}
{
  const p = new AdaptiveQualityPolicy(0.73);
  // at 0.73 the GPU reads 12 ms: the next step (0.82) predicts 12 x (0.82/0.73)^2 = 15.1 ms > 0.85 x 16.7
  assert.equal(p.evaluate(windowOf({ clockSeconds: 30, gpuFrameMs: 12 })), 'none', 'a step up that would not fit is not taken');
  assert.equal(p.dynamicScale, 0.73);
  assert.equal(p.evaluate(windowOf({ clockSeconds: 32, gpuFrameMs: 10 })), 'resolution-up',
    `10 ms predicts ${(10 * (0.82 / 0.73) ** 2).toFixed(1)} ms at the next step: inside ${GPU_UP_HEADROOM} of the budget`);
  assert.ok(Math.abs(p.dynamicScale - 0.82) < 1e-12);
}
{
  // a sample longer than the presented frames is not occupancy (a span with other work in it): the cadence decides
  assert.ok(GPU_TRUST_SHARE >= 1 && GPU_TRUST_SHARE < 1.5);
  const p = new AdaptiveQualityPolicy(1);
  assert.equal(p.evaluate(overload({ gpuFrameMs: 24 * GPU_TRUST_SHARE + 5 })), 'resolution-down');
  assert.ok(Math.abs(p.dynamicScale - 0.91) < 1e-12, 'an untrusted sample cuts one cadence step, not the proportional two');
  const q = new AdaptiveQualityPolicy(0.73);
  assert.equal(q.evaluate(windowOf({ clockSeconds: 30, gpuFrameMs: 45 })), 'resolution-up',
    'a 45 ms sample at a clean 16.6 ms cadence (the Metal-backend reading) cannot block the up-step');
  const r = new AdaptiveQualityPolicy(1);
  assert.equal(r.evaluate(overload({ clockSeconds: 9, gpuFrameMs: BUDGET * GPU_BOUND_SHARE * 0.9 })), 'none',
    'a trusted short sample still identifies the main-thread overload');
}

// ---------------------------------------------------------------------------------------------- the sampled timer

function fakeGl() {
  let now = 0, open = null, nested = 0, disjoint = false;
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  return {
    QUERY_RESULT_AVAILABLE: 0x8867, QUERY_RESULT: 0x8866,
    getExtension: () => ext,
    createQuery: () => ({ start: 0, end: 0, done: false }),
    deleteQuery() {},
    beginQuery(_t, q) { if (open) nested++; open = q; q.start = now; },
    endQuery() { open.end = now; open.done = true; open = null; },
    getQueryParameter(q, p) { return p === 0x8867 ? q.done : (q.end - q.start); },
    getParameter(p) { return p === ext.GPU_DISJOINT_EXT ? (disjoint ? (disjoint = false, true) : false) : 0; },
    isContextLost: () => false,
    spend(ms) { now += ms * 1e6; },
    disjointOnce() { disjoint = true; },
    get nested() { return nested; },
  };
}
{
  const gl = fakeGl();
  const timer = createGpuFrameTimer(gl, { every: 4 });
  assert.equal(timer.available, true);
  for (let f = 0; f < 16; f++) { timer.beginFrame(); gl.spend(5 + (f % 4)); timer.endFrame(); }
  const median = timer.takeWindow();
  assert.equal(median, 5, 'every fourth frame is sampled (frames 0, 4, 8, 12 spent 5 ms)');
  assert.equal(timer.takeWindow(), null, 'a fresh window after each decision');
  timer.paused = true;
  timer.beginFrame(); gl.spend(9); timer.endFrame();
  for (let f = 0; f < 8; f++) { timer.beginFrame(); timer.endFrame(); }
  assert.equal(timer.takeWindow(), null, 'paused: no query, no sample');
  timer.paused = false;
  timer.beginFrame(); // a frame whose last pass never ran: the next frame discards its query
  timer.beginFrame(); gl.spend(4); timer.endFrame();
  assert.equal(gl.nested, 0, 'a query is never begun inside another');
  gl.disjointOnce();
  timer.beginFrame(); gl.spend(3); timer.endFrame();
  assert.equal(timer.takeWindow(), null, 'a disjoint event drops the frames in flight');
  assert.equal(createGpuFrameTimer(null).available, false, 'no context: unavailable, the cadence rules decide');
  assert.equal(createGpuFrameTimer({ ...fakeGl(), getExtension: () => null }).available, false, 'no extension: unavailable');
}

// ---------------------------------------------------------------------------------------------- the closed loop

/**
 * Drive the real policy the way post.ts does: 90 frames (1.5 s at 60 Hz) per decision, the frame time of each frame
 * from the model at the current scale, presented on the 60 Hz grid (a frame over the budget waits for the next vsync),
 * the GPU sample the median of the window's frames. Returns the per-decision trace.
 */
function closedLoop({ gpuAt, cpuMs, seconds, startScale = 1, floor = 0.67, gpuTimer = true, noise = 0.06 }) {
  const policy = new AdaptiveQualityPolicy(startScale);
  const trace = [];
  let clock = 0, ema = 0, seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  while (clock < seconds) {
    let misses = 0, frames = 0, time = 0;
    const gpuSamples = [];
    while (time < 1.5) {
      const s = policy.dynamicScale;
      const gpu = gpuAt(s, clock + time) * (1 + noise * (rand() - 0.5));
      const cpu = cpuMs * (1 + noise * (rand() - 0.5));
      const work = Math.max(gpu, cpu);
      const presented = Math.ceil(work / BUDGET - 0.02) * BUDGET; // vsync: a late frame takes the next slot
      ema = ema === 0 ? presented : ema + (presented - ema) * 0.06;
      if (presented > BUDGET * 1.12) misses++;
      gpuSamples.push(gpu);
      frames++; time += presented / 1000;
    }
    clock += time;
    gpuSamples.sort((a, b) => a - b);
    const action = policy.evaluate({
      clockSeconds: clock, frameEmaMs: ema, frameBudgetMs: BUDGET, missedFrameRatio: misses / frames,
      achievedFps: frames / time, dynamicScaleFloor: floor, maximumTrim: 0, mayRaiseTier: false,
      gpuFrameMs: gpuTimer ? gpuSamples[Math.floor(gpuSamples.length / 2)] : null,
    });
    trace.push({ t: clock, action, scale: policy.dynamicScale, missRatio: misses / frames });
  }
  return trace;
}

const changes = (trace, from = 0) => trace.filter((d) => d.t >= from && d.action.startsWith('resolution')).length;
// The mid-range proxy's frame (an RTX 4050 Laptop class at about a third of the measuring machine): 26 ms of GPU at
// full raster, 8 ms of it fixed (shadow maps, vertex work), the rest per pixel; the main thread at 9 ms.
const proxyGpu = (s) => 8 + 18 * s * s;
{
  const trace = closedLoop({ gpuAt: proxyGpu, cpuMs: 9, seconds: 120 });
  const settled = trace.filter((d) => d.t > 20);
  const final = trace.at(-1).scale;
  assert.ok(final < 0.85 && final >= 0.67, `the governor settles below full raster (${final})`);
  assert.ok(proxyGpu(final) <= BUDGET, `the settled scale presents inside the budget (${proxyGpu(final).toFixed(1)} ms)`);
  assert.ok(trace.findIndex((d) => proxyGpu(d.scale) <= BUDGET) >= 0 && trace.find((d) => proxyGpu(d.scale) <= BUDGET).t < 8,
    'it gets there within a few decisions');
  assert.equal(changes(trace, 20), 0, 'and does not flap once settled (the predicted up-step never fits)');
  assert.ok(settled.every((d) => d.missRatio < 0.05), 'no missed-frame window after settling');
  // the same frame without a GPU timer: the cadence rules probe upward and are pushed back (the backoff bounds them)
  const blind = closedLoop({ gpuAt: proxyGpu, cpuMs: 9, seconds: 120, gpuTimer: false });
  assert.ok(changes(blind, 20) > changes(trace, 20), 'the GPU sample is what removes the periodic probes');
}
{
  // the load drops (a lighter view): the governor climbs back while the predicted step fits
  const trace = closedLoop({ gpuAt: (s, t) => (t < 40 ? proxyGpu(s) : 3 + 9 * s * s), cpuMs: 7, seconds: 90 });
  assert.equal(trace.at(-1).scale, 1, 'full raster once the GPU has the room again');
}
{
  // a main-thread-bound frame on a fast GPU: the governor never blurs it
  const trace = closedLoop({ gpuAt: (s) => 4 + 5 * s * s, cpuMs: 21, seconds: 40 });
  assert.ok(trace.every((d) => d.scale === 1), 'resolution is not traded for a main-thread overload');
}
{
  // a GPU too slow even at the floor: the floor holds (the tier lever owns the rest, auto only)
  const trace = closedLoop({ gpuAt: (s) => 14 + 30 * s * s, cpuMs: 9, seconds: 40 });
  assert.equal(trace.at(-1).scale, 0.67, 'the native floor bounds the raster');
}

// ---------------------------------------------------------------------------------------------- the default tier

{
  // what the capability gate's unmasked renderer string starts a mid-range laptop on ('auto'; a stored choice wins)
  const storage = new Map();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { search: '?tier=desktop' },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false }),
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true,
    value: { userAgent: 'Desktop', maxTouchPoints: 0, deviceMemory: 16, hardwareConcurrency: 16 } });
  const quality = await import('./quality.ts?resolution-governor-tiers');
  const tierOf = (renderer) => { quality.noteGpuRenderer(renderer); return quality.resolveAutoTier(); };
  const cases = [
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU (0x000028A1) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (AMD, AMD Radeon RX 7600M XT (0x00007480) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (AMD, AMD Radeon(TM) 8060S Graphics (0x00001586) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) 680M (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon 890M Graphics (0x0000150E) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'low'],
  ];
  for (const [renderer, tier] of cases) assert.equal(tierOf(renderer), tier, renderer);
  delete globalThis.window;
  delete globalThis.navigator;
}

console.log('resolutionGovernor.selftest: native floor, GPU-informed cut / up-step / main-thread guard, sampled timer, closed loop settles without flapping, default tiers PASS');
