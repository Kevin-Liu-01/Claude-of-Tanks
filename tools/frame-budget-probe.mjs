#!/usr/bin/env node
// Frame-budget probe (2026-10-02, the frame-budget lane): per-pass GPU and CPU cost of a live battle frame, in
// A B B A pairs across production builds, with the mid-range projection the docs' frame budget reads.
//
//   node tools/frame-budget-probe.mjs --roots=<treeA>,<treeB> --labels=base,new --maps=verdant,desert,whiteout,monsoon \
//        [--pattern=ABBA] [--views=chase,centre-far] [--viewports=1600x900,1920x1080] [--frames=240] [--block=30] \
//        [--sides=13x14] [--spec=t90m_x] [--preset=high] [--governor=pinned|live] [--emulate=<proxy>] \
//        [--queries=,<query>] [--toggle=<name>] [--shots] [--port=5395] [--session-mutex=<dir>] [--budget-min=18] \
//        [--out=<dir>] [--tag=<tag>]
//   node tools/frame-budget-probe.mjs --report=<dir>[,<dir>...] [--labels=base,new]
//
// Every root is a checkout with a production build in <root>/dist (`npm run build`); the probe serves one root at
// a time through `vite preview` on --port (127.0.0.1) and opens ONE headless Chrome (hardware ANGLE, the repo's
// capture flags) for the run. Per slot (one page): the desktop preset pinned in storage before boot (an explicit
// choice, so the session auto tier cannot step down), the sides switch at --sides (13x14 = the 14 v 14 preset), a
// pinned roster (every production id but the player, sorted, every k-th — the same 27 opponents on every build of
// one catalog; the receipt lists them), a solo battle through __DEBUG.beginSoloBattle, the sourced textures
// awaited, every bot frozen, the render governor pinned at full scale (unless --governor=live), then per viewport
// (a resize in the same page) and per view: the pose, a settle, and --frames rendered frames through the per-pass
// timer (tools/frame-pass-timer.mjs; segmented and whole-frame blocks alternate, the whole frames check the
// per-pass sum). --toggle=<name> samples A B B A blocks of a runtime switch inside the page at every pose (the
// same scene, the same pose: the tightest A/B there is). --emulate=<proxy> adds a GPU-only load after every frame
// that tracks (1/ratio − 1) × the frame's own GPU time, so this GPU presents the proxy's frame times to a live
// governor. Locks: the machine-wide capture FIFO (tools/capture-lock.mjs) for the whole run; with --session-mutex,
// that directory too, taken only once the FIFO is ours and released with it (a busy mutex gives the FIFO back).

import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import {
  HULL_RELATIVE_POSES, MAP_PROBE_BROWSER_ARGS, MAP_PROBE_FOV, applyGroundPose, beginSoloBattle, isMainModule,
  resolveHullRelativePose, sleep,
} from './map-probe-runtime.mjs';
import { selectMapViews } from './map-view-probe-views.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import {
  FRAME_PASS_TIMER_PROTOCOL, MID_RANGE_PROXIES, installFramePassTimer, pairDeltas, projectFrameMs, proxyRatios,
  summarizePassFrames,
} from './frame-pass-timer.mjs';

const TOOL = 'frame-budget-probe';
const DEFAULTS = Object.freeze({
  pattern: 'ABBA', views: ['chase', 'centre-far'], viewports: ['1600x900', '1920x1080'], frames: 240, block: 30,
  sides: '13x14', spec: 't90m_x', preset: 'high', governor: 'pinned', port: 5395, budgetMin: 18, settleMs: 2500,
  tier: 'desktop', prefixFrames: 330, noFlush: false, segmented: false, scales: null,
});
/** Runtime A/B switches the probe can flip inside one page (off = the baseline). */
const FRAME_PROBE_TOGGLES = Object.freeze({
  // the static shadow-caster cache (engine/shadowStaticCache.ts): off forces every caster every frame
  'shadow-cache': Object.freeze({ on: 'window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: false })',
    off: 'window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true })' }),
  // the water / grass simulations' idle sleep (world/simulationSleep.ts): off steps them every frame
  'sim-sleep': Object.freeze({ on: 'window.__WORLD_SIM_DEBUG = Object.assign(window.__WORLD_SIM_DEBUG || {}, { noSleep: false })',
    off: 'window.__WORLD_SIM_DEBUG = Object.assign(window.__WORLD_SIM_DEBUG || {}, { noSleep: true })' }),
});

// ---------------------------------------------------------------------------------------------- arguments

export function parseFrameProbeArgs(argv) {
  const o = { ...DEFAULTS, roots: null, labels: null, maps: null, queries: null, toggle: null, shots: false, out: null,
    tag: 'fb', sessionMutex: null, report: null, emulate: null };
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  for (const arg of argv) {
    const m = /^--([a-z][a-z-]*)(?:=(.*))?$/s.exec(arg);
    if (!m) throw new Error(`Unknown argument "${arg}" (flags are --name=value)`);
    const [, name, raw] = m;
    const need = () => { if (raw === undefined || raw === '') throw new Error(`--${name} needs a value`); return raw; };
    switch (name) {
      case 'roots': o.roots = list(need()).map((r) => path.resolve(r)); break;
      case 'labels': o.labels = list(need()); break;
      case 'maps': o.maps = list(need()); break;
      case 'views': o.views = list(need()); break;
      case 'viewports': o.viewports = list(need()); break;
      case 'pattern': o.pattern = need().toUpperCase(); break;
      case 'frames': o.frames = Math.max(30, Number(need()) || DEFAULTS.frames); break;
      case 'block': o.block = Math.max(5, Number(need()) || DEFAULTS.block); break;
      case 'sides': o.sides = need(); break;
      case 'spec': o.spec = need(); break;
      case 'preset': o.preset = need(); break;
      case 'governor': o.governor = need(); break;
      case 'emulate': o.emulate = need(); break;
      case 'queries': o.queries = (raw ?? '').split(','); break;
      case 'toggle': o.toggle = need(); break;
      case 'shots': if (raw !== undefined) throw new Error('--shots takes no value'); o.shots = true; break;
      case 'port': o.port = Number(need()); break;
      case 'session-mutex': o.sessionMutex = path.resolve(need()); break;
      case 'budget-min': o.budgetMin = Number(need()); break;
      case 'settle-ms': o.settleMs = Number(need()); break;
      case 'prefix-frames': o.prefixFrames = Math.max(0, Number(need()) || 0); break;
      case 'no-flush': if (raw !== undefined) throw new Error('--no-flush takes no value'); o.noFlush = true; break;
      case 'segmented': if (raw !== undefined) throw new Error('--segmented takes no value'); o.segmented = true; break;
      case 'scales': o.scales = list(need()).map(Number); break;
      case 'tier': o.tier = need(); break;
      case 'out': o.out = path.resolve(need()); break;
      case 'tag': o.tag = need(); break;
      case 'report': o.report = list(need()).map((r) => path.resolve(r)); break;
      default: throw new Error(`Unknown argument --${name}`);
    }
  }
  if (o.report) return o;
  if (!o.roots?.length) throw new Error('--roots=<tree>[,<tree>...] is required');
  if (!o.maps?.length) throw new Error('--maps=<id>[,<id>...] is required');
  if (!o.labels) o.labels = o.roots.map((r) => path.basename(r));
  if (o.labels.length !== o.roots.length) throw new Error('--labels must match --roots');
  if (o.queries && o.queries.length !== o.roots.length) throw new Error('--queries must match --roots');
  if (!/^[A-Z]+$/.test(o.pattern)) throw new Error('--pattern is a string of A, B, ... letters');
  for (const ch of o.pattern) if (ch.charCodeAt(0) - 65 >= o.roots.length) throw new Error(`--pattern letter ${ch} has no root`);
  if (!/^\d+x\d+$/.test(o.sides)) throw new Error('--sides is <allies>x<enemies> (13x14 = the 14 v 14 preset)');
  for (const v of o.viewports) if (!/^\d+x\d+$/.test(v)) throw new Error(`--viewports entries are WxH, got ${v}`);
  for (const v of o.views) if (!(v in HULL_RELATIVE_POSES)) selectMapViews([v]);
  if (!['pinned', 'live'].includes(o.governor)) throw new Error('--governor is pinned or live');
  if (o.scales && (o.governor !== 'pinned' || o.scales.some((v) => !(v > 0 && v <= 1)))) throw new Error('--scales are pinned render scales in (0, 1]');
  if (o.toggle && !FRAME_PROBE_TOGGLES[o.toggle]) throw new Error(`--toggle must be one of ${Object.keys(FRAME_PROBE_TOGGLES).join(', ')}`);
  if (o.emulate && !MID_RANGE_PROXIES[o.emulate]) throw new Error(`--emulate must be one of ${Object.keys(MID_RANGE_PROXIES).join(', ')}`);
  if (!(o.port >= 1024 && o.port < 65536)) throw new Error('--port must be a TCP port');
  if (!o.out) o.out = path.resolve('.qa-dev', 'reports', TOOL);
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(o.tag)) throw new Error('--tag must be a file-name token');
  return o;
}

/** The pinned opponents: every catalog id but the player, sorted, every k-th, `count` of them. */
export function pinnedOpponents(ids, playerSpecId, count) {
  const pool = [...new Set(ids)].filter((id) => id !== playerSpecId).sort();
  if (pool.length < count) throw new Error(`the catalog has ${pool.length} opponents for ${count} seats`);
  const stride = pool.length / count;
  const picked = [];
  for (let i = 0; i < count; i++) picked.push(pool[Math.floor(i * stride)]);
  return picked;
}

// ---------------------------------------------------------------------------------------------- page side

/** Before boot: long tasks, the preset (an explicit stored choice) and the sides switch. */
export function installObservers({ preset, allies, enemies }) {
  const tasks = [];
  window.__FBP = { tasks };
  try {
    window.localStorage.setItem('cot.gfxPreset', preset);
    window.localStorage.removeItem('cot.gfxAutoTier');
    const arrangement = { allies, enemies, waveSize: null, enemyNation: null };
    const all = {};
    for (const mode of ['standard', 'capture_the_flag', 'king_of_the_hill', 'turbo_ball', 'mars']) all[mode] = arrangement;
    window.localStorage.setItem('cot.game.teams.v1', JSON.stringify(all));
  } catch { /* storage blocked */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push({ t: +e.startTime.toFixed(1), ms: +e.duration.toFixed(1) });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }
}

/** Freeze every bot and the player's inputs; pin (or release) the governor. */
export function freezeBattle(governor) {
  const D = window.__DEBUG;
  const roster = [];
  for (const e of D.game.tanks) {
    roster.push({ id: e.id, specId: e.specId, team: e.team, isPlayer: !!e.isPlayer });
    if (!e.isPlayer) e.aiCtl = null;
    if (e.input) { e.input.actionBits = 0; if ('throttle' in e.input) e.input.throttle = 0; if ('steer' in e.input) e.input.steer = 0; }
    if (e.state) e.state.speed = 0;
  }
  const P = D.post;
  try { P.resetPerfTrims?.(); } catch { /* optional */ }
  if (governor === 'pinned') {
    try { P.setAdaptiveSuspended?.(true); } catch { /* optional */ }
    try { P.pinDynScale?.(1); } catch { /* optional */ }
  } else {
    try { P.setAdaptiveSuspended?.(false); } catch { /* optional */ }
    try { P.pinDynScale?.(null); } catch { /* optional */ }
  }
  return { roster, dynScale: P.dynScale, perfTrim: P.perfTrim };
}

export async function awaitTextures(timeoutMs) {
  const state = window.__DEBUG.world?.minimapTextureState;
  if (!state?.promise) return { available: false };
  let timer;
  const started = performance.now();
  try {
    await Promise.race([state.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })]);
  } catch { return { available: true, settled: !!state.settled, timedOut: true, waitedMs: Math.round(performance.now() - started) }; }
  finally { clearTimeout(timer); }
  return { available: true, settled: !!state.settled, waitedMs: Math.round(performance.now() - started) };
}

/** The live graphics state a record is read against. */
function graphicsState() {
  const D = window.__DEBUG;
  const c = D.renderer.domElement;
  const t = D.lighting?.getShadowTelemetry?.();
  return {
    preset: D.quality?.resolvePresetName?.() ?? null,
    canvas: [c.width, c.height], renderScale: Number(c.dataset.renderScale) || null, dynScale: D.post.dynScale,
    perfTrim: D.post.perfTrim, postAa: c.dataset.postAa || null, lightFx: c.dataset.lightFx || null,
    shadowSizes: t ? t.cascades.map((x) => x.size) : null, shadowMaxFar: t?.maxFar ?? null,
    programs: D.renderer.info.programs?.length ?? null,
  };
}

/**
 * Mid-range emulation: after every frame, one fullscreen pass into a small target whose loop count tracks
 * (1/ratio − 1) × the frame's own GPU time, measured by a whole-frame timer query (EMA over the last answers).
 * The burn is GPU-only (one draw), so the main thread is untouched and the presented frame time is the proxy's.
 */
function installGpuEmulator(ratio) {
  if (window.__FBP_EMULATOR) return window.__FBP_EMULATOR.state;
  const D = window.__DEBUG; const R = D.renderer; const gl = R.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { ok: false, reason: 'no timer query' };
  const vs = '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const fs = '#version 300 es\nprecision highp float; uniform int uN; uniform float uS; out vec4 o;\n'
    + 'void main(){ vec2 v = gl_FragCoord.xy * 0.001 + uS; float a = 0.0; for (int i = 0; i < 100000; i++) { if (i >= uN) break; v = fract(v * 1.618 + vec2(0.13, 0.37)); a += v.x * v.y; } o = vec4(a * 1e-6); }';
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { ok: false, reason: gl.getProgramInfoLog(prog) };
  const buf = gl.createBuffer();
  const vao = gl.createVertexArray();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const uN = gl.getUniformLocation(prog, 'uN'), uS = gl.getUniformLocation(prog, 'uS');
  const state = { ok: true, ratio, frameGpuMs: 0, burnGpuMs: 0, iterations: 64, targetBurnMs: 0, frames: 0 };
  const pendingFrame = [], pendingBurn = [];
  let frameQuery = null;
  const post = D.post;
  const original = post.render;
  const readQueries = () => {
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { pendingFrame.length = 0; pendingBurn.length = 0; return; }
    while (pendingFrame.length && gl.getQueryParameter(pendingFrame[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pendingFrame.shift();
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q);
      state.frameGpuMs = state.frameGpuMs ? state.frameGpuMs + (ms - state.frameGpuMs) * 0.2 : ms;
    }
    while (pendingBurn.length && gl.getQueryParameter(pendingBurn[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const { q, n } = pendingBurn.shift();
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q);
      state.burnGpuMs = ms;
      // proportional control of the loop count toward the target burn time (the per-iteration cost is ~constant)
      if (ms > 0.02 && state.targetBurnMs > 0) state.iterations = Math.max(1, Math.min(100000, Math.round(n * state.targetBurnMs / ms)));
    }
  };
  post.render = function (...args) {
    readQueries();
    // The frame-pass timer owns the TIME_ELAPSED target while it samples (queries cannot nest): read its frames then.
    const timer = window.__FRAME_PASS_TIMER;
    const own = !(timer && timer.active);
    if (own && !frameQuery) { frameQuery = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, frameQuery); }
    try { return original.apply(this, args); } finally {
      if (own && frameQuery) { gl.endQuery(ext.TIME_ELAPSED_EXT); pendingFrame.push(frameQuery); frameQuery = null; }
      if (!own && timer.lastGpuTotal > 0) {
        state.frameGpuMs = state.frameGpuMs ? state.frameGpuMs + (timer.lastGpuTotal - state.frameGpuMs) * 0.2 : timer.lastGpuTotal;
      }
      state.targetBurnMs = state.frameGpuMs * (1 / ratio - 1);
      const q = gl.createQuery();
      const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING), prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
      const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING), prevViewport = gl.getParameter(gl.VIEWPORT);
      const blend = gl.isEnabled(gl.BLEND), depth = gl.isEnabled(gl.DEPTH_TEST), cull = gl.isEnabled(gl.CULL_FACE), scissor = gl.isEnabled(gl.SCISSOR_TEST);
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, 64, 64);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
      gl.useProgram(prog); gl.uniform1i(uN, state.iterations); gl.uniform1f(uS, (state.frames++ % 97) * 0.01);
      gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.endQuery(ext.TIME_ELAPSED_EXT); pendingBurn.push({ q, n: state.iterations });
      gl.bindVertexArray(prevVao); gl.useProgram(prevProg); gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
      if (blend) gl.enable(gl.BLEND); if (depth) gl.enable(gl.DEPTH_TEST); if (cull) gl.enable(gl.CULL_FACE); if (scissor) gl.enable(gl.SCISSOR_TEST);
      // three caches GL state: tell it every binding it relied on may have changed
      R.resetState();
    }
  };
  window.__FBP_EMULATOR = { state, uninstall() { post.render = original; delete window.__FBP_EMULATOR; } };
  return state;
}

// ---------------------------------------------------------------------------------------------- host side

function loadAverage() { return os.loadavg().map((v) => +v.toFixed(2)); }
/** CPU of other processes' GPU processes (headless Chrome, Playwright): the shared GPU's foreign load, by proxy. */
export function foreignGpuCpu() {
  try {
    const rows = execSync('ps -axo pid=,ppid=,pcpu=,command=', { encoding: 'utf8' }).split('\n');
    let sum = 0, n = 0;
    for (const row of rows) {
      const m = row.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/);
      if (!m || !/--type=gpu-process/.test(m[4])) continue;
      if (Number(m[2]) === process.pid) continue;
      sum += Number(m[3]); n++;
    }
    return { cpu: +sum.toFixed(1), processes: n };
  } catch { return { cpu: -1, processes: -1 }; }
}

/** The FIFO, then (optionally) the session mutex — taken only while the FIFO is ours; a busy mutex returns the FIFO. */
export async function acquireProbeLocks({ sessionMutex = null, log = () => {}, fifoTimeoutMs = 3 * 60 * 60 * 1000,
  mutexWaitMs = 60_000, lock = createCaptureLock(), tryMutex = defaultTryMutex, releaseMutex = defaultReleaseMutex,
  pause = sleep } = {}) {
  for (let round = 1; ; round++) {
    await lock.acquire(fifoTimeoutMs);
    if (!sessionMutex) return { round, release: () => lock.release(), refresh: () => lock.refresh() };
    const started = Date.now();
    while (Date.now() - started < mutexWaitMs) {
      if (tryMutex(sessionMutex)) {
        log(`capture FIFO and session mutex held (round ${round})`);
        return { round, refresh: () => lock.refresh(), release: () => { releaseMutex(sessionMutex); lock.release(); } };
      }
      lock.refresh();
      await pause(500);
    }
    lock.release();
    log(`session mutex busy for ${Math.round(mutexWaitMs / 1000)} s at the FIFO head: FIFO released, queueing again (round ${round})`);
    await pause(15_000);
  }
}
function defaultTryMutex(dir) {
  try { mkdirSync(dir); writeFileSync(path.join(dir, 'pid'), String(process.pid)); return true; } catch { return false; }
}
function defaultReleaseMutex(dir) {
  try {
    const owner = readFileSync(path.join(dir, 'pid'), 'utf8').trim();
    if (owner === String(process.pid)) rmSync(dir, { recursive: true, force: true });
  } catch { /* already gone */ }
}

export async function openPreview(root, port) {
  if (!existsSync(path.join(root, 'dist', 'index.html'))) throw new Error(`root ${root} has no dist/index.html (run npm run build there)`);
  const server = await preview({ root, configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true } });
  return { close: () => server.close() };
}

export async function poseView(page, name) {
  if (name in HULL_RELATIVE_POSES) {
    return page.evaluate(`(() => {
      const resolveHullRelativePose = ${resolveHullRelativePose.toString()};
      const D = window.__DEBUG; const st = D.game.player.state; const V = D.camera.position.constructor;
      const pose = resolveHullRelativePose({ pos: st.pos, yaw: st.yaw }, ${JSON.stringify(name)}, ${JSON.stringify(HULL_RELATIVE_POSES)}, ${MAP_PROBE_FOV});
      D.rig.setExternalPose(new V(...pose.cam), new V(...pose.at), pose.fov);
      return { cam: pose.cam.map((v) => +v.toFixed(1)), at: pose.at.map((v) => +v.toFixed(1)) };
    })()`);
  }
  const pose = await applyGroundPose(page, selectMapViews([name])[0], { settleMs: 0 });
  return { cam: pose.cam.map((v) => +v.toFixed(1)), at: pose.at.map((v) => +v.toFixed(1)) };
}

export const grassSettled = () => {
  const g = window.__DEBUG.world?._tallGrass?.getState?.();
  return !g || !g.enabled || (!g.near.pending && !g.far.pending);
};

async function sampleView(page, options) {
  // segmented pieces over-count on ANGLE Metal (their command-buffer spans overlap: the pieces summed to 4-5x the
  // whole frame in the 2026-10-02 pilots), so they are a diagnostic only (--segmented); the per-pass split is the
  // prefix decomposition — one query per frame from its start to a rotating checkpoint
  const modesOf = () => (options.segmented ? ['whole', 'segmented'] : ['whole']);
  const sample = (frames, modes = modesOf()) => page.evaluate((cfg) => window.__FRAME_PASS_TIMER.sample(cfg),
    { frames, block: options.block, modes, flush: !options.noFlush, timeoutMs: Math.max(60000, frames * 400) });
  if (!options.toggle) {
    const result = await sample(options.frames);
    const prefix = options.prefixFrames > 0 ? await sample(options.prefixFrames, ['prefix']) : null;
    return { result, prefix };
  }
  const t = FRAME_PROBE_TOGGLES[options.toggle];
  const half = Math.max(30, Math.round(options.frames / 2));
  const blocks = [];
  for (const side of ['off', 'on', 'on', 'off']) {
    await page.evaluate(t[side]);
    await sleep(700);
    blocks.push({ side, result: await sample(half) });
  }
  await page.evaluate(t.on);
  return { toggle: options.toggle, blocks };
}

async function measureSlot(browser, options, slot) {
  const [w0, h0] = options.viewports[0].split('x').map(Number);
  const [allies, enemies] = options.sides.split('x').map(Number);
  const page = await browser.newPage();
  try {
    return await measureOnPage(page, options, slot, { w0, h0, allies, enemies });
  } finally {
    await page.close().catch(() => {});
  }
}

async function measureOnPage(page, options, slot, { w0, h0, allies, enemies }) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 400)));
  await page.setViewport({ width: w0, height: h0, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(installObservers, { preset: options.preset, allies, enemies });
  const gotoAt = Date.now();
  const query = [`nosplash=1`, `tier=${options.tier}`, slot.query].filter(Boolean).join('&');
  await page.goto(`http://127.0.0.1:${options.port}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
  const readyMs = Date.now() - gotoAt;
  const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
  const opponents = pinnedOpponents(catalog, options.spec, allies + enemies);
  await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, opponents);
  const entryAt = Date.now();
  await beginSoloBattle(page, { specId: options.spec, mapId: slot.mapId, timeoutMs: 420000 });
  const entryMs = Date.now() - entryAt;
  const textures = await page.evaluate(awaitTextures, 90000);
  const frozen = await page.evaluate(freezeBattle, options.governor);
  await page.waitForFunction(grassSettled, { timeout: 30000, polling: 250 }).catch(() => {});
  const timer = await page.evaluate(installFramePassTimer);
  let emulator = null;
  if (options.emulate) emulator = await page.evaluate(installGpuEmulator, proxyRatios(MID_RANGE_PROXIES[options.emulate]).gpuRatio);
  await sleep(options.settleMs);
  const samples = [];
  for (const viewport of options.viewports) {
    const [w, h] = viewport.split('x').map(Number);
    if (w !== page.viewport().width || h !== page.viewport().height) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await sleep(1500);
    }
    for (const view of options.views) {
      const pose = await poseView(page, view);
      await sleep(1200);
      await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
      if (options.governor === 'live') await sleep(Math.max(0, options.settleMs * 3)); // let the governor walk
      for (const scale of options.scales ?? [null]) {
        if (scale !== null) { await page.evaluate((v) => window.__DEBUG.post.pinDynScale(v), scale); await sleep(1200); }
        await sleep(options.settleMs);
        const graphics = await page.evaluate(graphicsState);
        const measured = await sampleView(page, options);
        const after = await page.evaluate(graphicsState);
        const suffix = scale === null ? '' : `-s${Math.round(scale * 100)}`;
        if (options.shots) {
          await page.screenshot({ path: path.join(options.out, `${options.tag}-${slot.key}-${viewport}-${view}${suffix}.png`) });
        }
        const emulation = options.emulate ? await page.evaluate(() => ({ ...window.__FBP_EMULATOR?.state })) : null;
        samples.push({ viewport, view: `${view}${suffix}`, scale, pose, graphics, graphicsAfter: after, emulation, ...measured });
      }
      if (options.scales) await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
    }
  }
  const memory = await page.evaluate(() => {
    const R = window.__DEBUG.renderer;
    return { geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs?.length ?? null,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
  const tasks = await page.evaluate(() => window.__FBP.tasks);
  return { mapId: slot.mapId, readyMs, entryMs, textures, timer, emulator, frozen: { dynScale: frozen.dynScale, perfTrim: frozen.perfTrim },
    roster: { count: frozen.roster.length, player: frozen.roster.find((r) => r.isPlayer)?.specId ?? null,
      opponents, teams: frozen.roster.reduce((a, r) => { a[r.team] = (a[r.team] || 0) + 1; return a; }, {}) },
    samples, memory, longTasks: { total: tasks.length, over100: tasks.filter((t) => t.ms >= 100).length, max: tasks.reduce((m, t) => Math.max(m, t.ms), 0) },
    pageErrors: errors };
}

async function run(options) {
  mkdirSync(options.out, { recursive: true });
  const log = (line) => console.log(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${line}`);
  const slotFile = (key) => path.join(options.out, `${options.tag}-${key}.json`);
  const slotsFor = (mapId) => [...options.pattern].map((ch, i) => {
    const r = ch.charCodeAt(0) - 65;
    return { mapId, root: options.roots[r], label: options.labels[r], query: options.queries?.[r] || '', key: `${mapId}-s${i}-${options.labels[r]}` };
  });
  const todo = options.maps.flatMap(slotsFor).filter((s) => {
    try { return !!JSON.parse(readFileSync(slotFile(s.key), 'utf8')).failed; } catch { return true; }
  });
  if (!todo.length) { log('every slot is already measured'); return { ok: true, remaining: 0 }; }
  const locks = await acquireProbeLocks({ sessionMutex: options.sessionMutex, log });
  const refresh = setInterval(() => locks.refresh(), 30000);
  refresh.unref();
  const machine = { cores: os.cpus().length, loadStart: loadAverage(), samples: [] };
  const sampler = setInterval(() => machine.samples.push({ at: new Date().toISOString(), load1: +os.loadavg()[0].toFixed(2), foreignGpu: foreignGpuCpu() }), 15000);
  const started = Date.now();
  let browser = null, server = null, serving = null, ok = true, remaining = 0;
  try {
    browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
      args: [...MAP_PROBE_BROWSER_ARGS, '--enable-precise-memory-info', '--window-size=1920,1080'] });
    for (const slot of todo) {
      if (options.budgetMin && (Date.now() - started) / 60000 > options.budgetMin) { remaining++; continue; }
      if (serving !== slot.root) {
        if (server) await server.close();
        server = await openPreview(slot.root, options.port);
        serving = slot.root;
      }
      const loadBefore = +os.loadavg()[0].toFixed(2), foreignBefore = foreignGpuCpu(), slotStarted = Date.now();
      let record;
      try {
        record = await measureSlot(browser, options, slot);
        record.label = slot.label; record.key = slot.key; record.root = slot.root; record.query = slot.query;
        record.load1 = { before: loadBefore, after: +os.loadavg()[0].toFixed(2) };
        record.foreignGpu = { before: foreignBefore, after: foreignGpuCpu() };
        for (const s of record.samples) {
          if (s.result) s.summary = summarizePassFrames(s.result);
          if (s.prefix) s.prefixSummary = summarizePassFrames(s.prefix);
          for (const b of s.blocks ?? []) b.summary = summarizePassFrames(b.result);
        }
        const first = record.samples[0];
        const sm = first.summary ?? first.blocks?.[1]?.summary;
        log(`${slot.key} ${first.viewport} ${first.view}: gpu ${sm?.gpuFrame.med} ms (pieces ${sm?.gpuSegmentedSum.med}, ratio ${sm?.segmentedOverWhole}) cpu ${sm?.cpuFrame.med} calls ${sm?.calls.med} | entry ${Math.round(record.entryMs / 1000)} s | load ${loadBefore} fgGPU ${foreignBefore.cpu}% | ${Math.round((Date.now() - slotStarted) / 1000)} s${record.pageErrors.length ? ` (page errors ${record.pageErrors.length})` : ''}`);
      } catch (error) {
        ok = false;
        record = { failed: String(error?.stack || error).slice(0, 2000), key: slot.key, label: slot.label, mapId: slot.mapId };
        log(`${slot.key} FAILED: ${String(error?.message || error).slice(0, 400)}`);
      }
      writeFileSync(slotFile(slot.key), JSON.stringify(record, null, 1));
    }
  } finally {
    clearInterval(sampler);
    clearInterval(refresh);
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    locks.release();
  }
  machine.loadEnd = loadAverage();
  writeFileSync(path.join(options.out, `${options.tag}.receipt.json`), JSON.stringify({ tool: TOOL, protocol: FRAME_PASS_TIMER_PROTOCOL,
    writtenAt: new Date().toISOString(), options, machine, remaining, node: process.version }, null, 1));
  log(`${ok ? 'done' : 'FAILED'}${remaining ? ` (${remaining} slot(s) left for the next hold)` : ''}`);
  if (ok && remaining) process.exitCode = 3;
  return { ok, remaining };
}

// ---------------------------------------------------------------------------------------------- report

/** Read every slot record of the given directories. */
function readSlotRecords(dirs) {
  const records = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json') && !n.endsWith('.receipt.json')).sort()) {
      try {
        const record = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
        if (record && !record.failed && Array.isArray(record.samples)) records.push(record);
      } catch { /* not a slot record */ }
    }
  }
  return records;
}

/** Slot order inside a map's pattern (the key's s<i>). */
const slotIndex = (record) => Number(/-s(\d+)-/.exec(record.key)?.[1] ?? 0);

/**
 * One table per map × viewport × view: per pass the median GPU ms of each label (median over that label's slots),
 * and for two labels the A B B A pair deltas of every pass with their spread; frame totals, CPU, draws.
 */
export function buildFrameReport(records, labels = null) {
  const out = {};
  const keyOf = (r, s) => `${r.mapId} ${s.viewport} ${s.view}`;
  for (const r of records) {
    for (const s of r.samples) {
      const summary = s.summary ?? null;
      if (!summary) continue;
      const k = keyOf(r, s);
      (out[k] ||= { mapId: r.mapId, viewport: s.viewport, view: s.view, slots: [] }).slots.push({ label: r.label, order: slotIndex(r), summary,
        load1: r.load1, foreignGpu: r.foreignGpu });
    }
  }
  for (const row of Object.values(out)) {
    row.slots.sort((a, b) => a.order - b.order);
    const present = labels ?? [...new Set(row.slots.map((s) => s.label))];
    const passNames = new Set();
    for (const s of row.slots) for (const p of Object.keys(s.summary.passes)) passNames.add(p);
    row.byLabel = {};
    const median = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? +v[Math.floor((v.length - 1) / 2)].toFixed(2) : null; };
    for (const label of present) {
      const slots = row.slots.filter((s) => s.label === label);
      row.byLabel[label] = {
        slots: slots.length,
        gpuFrame: median(slots.map((s) => s.summary.gpuFrame.med)),
        gpuFrameP25: median(slots.map((s) => s.summary.gpuFrame.p25)),
        cpuFrame: median(slots.map((s) => s.summary.cpuFrame.med)),
        calls: median(slots.map((s) => s.summary.calls.med)),
        tris: median(slots.map((s) => s.summary.tris.med)),
        segmentedOverWhole: median(slots.map((s) => s.summary.segmentedOverWhole)),
        passes: Object.fromEntries([...passNames].map((p) => [p, {
          gpu: median(slots.map((s) => s.summary.passes[p]?.gpu.med ?? 0)),
          cpu: median(slots.map((s) => s.summary.passes[p]?.cpu.med ?? 0)),
          calls: median(slots.map((s) => s.summary.passes[p]?.calls.med ?? 0)),
        }])),
      };
    }
    if (present.length === 2) {
      const [a, b] = present;
      const seq = (get) => row.slots.map((s) => ({ label: s.label, value: get(s.summary) }));
      row.deltas = {
        gpuFrame: pairDeltas(seq((s) => s.gpuFrame.med), a, b),
        gpuFrameP25: pairDeltas(seq((s) => s.gpuFrame.p25), a, b),
        cpuFrame: pairDeltas(seq((s) => s.cpuFrame.med), a, b),
        calls: pairDeltas(seq((s) => s.calls.med), a, b),
        passes: Object.fromEntries([...passNames].map((p) => [p, pairDeltas(seq((s) => s.passes[p]?.gpu.med ?? 0), a, b)])),
      };
    }
  }
  return out;
}

/** Markdown for a report: one table per map × viewport × view. */
function formatFrameReport(report, { proxy = 'rtx4050-laptop' } = {}) {
  const ratios = proxyRatios(MID_RANGE_PROXIES[proxy]);
  const lines = [];
  for (const row of Object.values(report)) {
    const labels = Object.keys(row.byLabel);
    lines.push(`### ${row.mapId} · ${row.view} · ${row.viewport}`, '');
    lines.push(`| pass | ${labels.map((l) => `${l} GPU ms`).join(' | ')}${row.deltas ? ' | Δ (pairs: med [min..max]) |' : ' |'}`);
    lines.push(`| --- | ${labels.map(() => '---:').join(' | ')}${row.deltas ? ' | ---: |' : ' |'}`);
    const passNames = Object.keys(row.byLabel[labels[0]].passes);
    for (const p of passNames) {
      const cells = labels.map((l) => row.byLabel[l].passes[p]?.gpu ?? '');
      const d = row.deltas?.passes[p];
      lines.push(`| ${p} | ${cells.join(' | ')}${d ? ` | ${d.med} [${d.min}..${d.max}] |` : ' |'}`);
    }
    for (const [name, key] of [['frame GPU (whole-frame query)', 'gpuFrame'], ['frame GPU p25', 'gpuFrameP25'], ['main-thread CPU (render path)', 'cpuFrame'], ['draw calls', 'calls']]) {
      const d = row.deltas?.[key];
      lines.push(`| **${name}** | ${labels.map((l) => row.byLabel[l][key]).join(' | ')}${d ? ` | ${d.med} [${d.min}..${d.max}] |` : ' |'}`);
    }
    const proj = labels.map((l) => projectFrameMs({ gpuMs: row.byLabel[l].gpuFrame, cpuMs: row.byLabel[l].cpuFrame }, ratios));
    lines.push(`| **projected ${proxy} frame** | ${proj.map((p) => `${p.frameMs} ms (${p.bound})`).join(' | ')} | |`, '');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------- CLI

if (isMainModule(import.meta.url)) {
  let options;
  try { options = parseFrameProbeArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exit(1); }
  if (options.report) {
    const report = buildFrameReport(readSlotRecords(options.report), options.labels);
    const outDir = options.report[0];
    writeFileSync(path.join(outDir, 'frame-report.json'), JSON.stringify(report, null, 1));
    const md = formatFrameReport(report);
    writeFileSync(path.join(outDir, 'frame-report.md'), md);
    console.log(md);
  } else {
    const result = await run(options);
    if (!result.ok) process.exitCode = 1;
  }
}
