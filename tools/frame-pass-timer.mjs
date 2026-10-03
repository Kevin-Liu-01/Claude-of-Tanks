// Per-pass GPU and CPU timing of one rendered battle frame (2026-10-02, the frame-budget lane).
//
// `installFramePassTimer` runs IN THE PAGE (it is serialized with Function.prototype.toString, so it is
// self-contained: no imports, no closure over this module). It wraps the frame's owners — world.update (the
// water / grass / ocean simulations run inside it), the volumetric cloud march (scene.userData.volumetricClouds
// .beforeSceneRender), every EffectComposer pass, three's shadow-map render and renderer.setRenderTarget (which
// names the cascade or the simulation a draw belongs to) — and keeps exactly one EXT_disjoint_timer_query_webgl2
// TIME_ELAPSED query open through the frame, switching to a new query at every label change. Timer queries cannot
// nest, so a nested owner (the shadow maps inside the scene pass) closes its parent's query and the parent resumes
// with a fresh one; a label's time is the sum of its pieces. Labels change only at render-target boundaries (the
// passes' own), never between two draws of one target, so the tile-based GPU's render passes are not split by the
// measurement.
//
// Two modes, alternated in blocks by the sampler: `segmented` (one query per label piece) and `whole` (one query
// for the frame). The whole-frame mode is the cross-check: the per-label sums of the segmented frames must land
// on the whole frames' total (the receipt records both), or the per-pass numbers are not trusted.
//
// Host-side helpers below (summaries, A B B A pair deltas, the mid-range projection) are pure and covered by
// tools/frame-budget-probe.selftest.mjs; tools/frame-budget-probe.mjs drives them.

export const FRAME_PASS_TIMER_PROTOCOL = 'frame-pass-timer-v1';

/**
 * Page side. Installs once (idempotent) and returns the controller's description. The controller lives on
 * window.__FRAME_PASS_TIMER: sample({ frames, block, timeoutMs }) resolves the frame records, uninstall() restores
 * every wrapped function exactly.
 */
export function installFramePassTimer() {
  const existing = window.__FRAME_PASS_TIMER;
  if (existing) return existing.describe();
  const D = window.__DEBUG;
  const R = D.renderer;
  const gl = R.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const post = D.post;
  const composer = post.composer;
  const csmLights = D.lighting?.csm?.lights ?? [];
  const restores = [];

  // --- labels ------------------------------------------------------------------------------------------------
  const passLabels = new Map();
  for (const [pass, label] of [[post.sceneAA, 'scene'], [post.aerial, 'aerial'], [post.gtao, 'gtao'], [post.lateFx, 'latefx'],
    [post.taa, 'taa'], [post.bloom, 'bloom'], [post.sunShafts, 'sunshafts'], [post.lensFlare, 'lensflare'], [post.upscaler, 'upscale']]) {
    if (pass) passLabels.set(pass, label);
  }
  // the output grade and SMAA are not exposed: they are the two passes between the lens flare and the upscaler
  const passes = composer.passes;
  const flareAt = passes.indexOf(post.lensFlare), upscaleAt = passes.indexOf(post.upscaler);
  const between = flareAt >= 0 && upscaleAt > flareAt ? passes.slice(flareAt + 1, upscaleAt) : [];
  ['grade', 'smaa'].forEach((label, i) => { if (between[i] && !passLabels.has(between[i])) passLabels.set(between[i], label); });
  passes.forEach((pass, i) => { if (!passLabels.has(pass)) passLabels.set(pass, `pass${i}`); });

  // --- state -------------------------------------------------------------------------------------------------
  let mode = 'off';            // 'off' | 'segmented' | 'whole' | 'prefix' | 'cpu' (no query: a live governor owns them)
  let flushPieces = false;     // segmented: commit the command buffer at every label boundary
  let prefixLabels = [];       // prefix: the checkpoints the frames rotate through
  let prefixCursor = 0;
  let frame = null;            // the open frame's record
  let label = null;            // the label the open query (and the CPU clock) charges
  let query = null;
  let segStartedAt = 0;
  let segCalls = 0, segTris = 0;
  const stack = [];
  const pool = [];
  const pending = [];          // closed frames whose queries are still in flight
  const done = [];
  let lastFrameEndAt = null;
  let lastGpuTotal = 0;
  let disjointFrames = 0;
  let autoResetBefore = R.info.autoReset;

  const take = () => pool.pop() || gl.createQuery();
  /** Charge the open label with the CPU time and the draws since its piece began. */
  function account(now) {
    if (!frame || label === null) return;
    frame.cpu[label] = (frame.cpu[label] || 0) + (now - segStartedAt);
    const info = R.info.render;
    frame.calls[label] = (frame.calls[label] || 0) + (info.calls - segCalls);
    frame.tris[label] = (frame.tris[label] || 0) + (info.triangles - segTris);
  }
  function closeQuery(pieceLabel) {
    if (!query) return;
    if (flushPieces) gl.flush();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    frame.pieces.push({ label: pieceLabel, q: query });
    query = null;
  }
  function openQuery() {
    if (!ext) return;
    query = take();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  }
  function beginFrame(now) {
    R.info.reset();
    frame = { mode, startedAt: now, pieces: [], cpu: {}, calls: {}, tris: {} };
    label = null;
    // commit what precedes the frame (the last frame's tail, the HUD canvas) so the frame's first query starts on a
    // fresh command buffer: the 2026-10-02 pilots' first prefix step read 8 ms for 0.3 ms of simulation work
    if (ext && mode !== 'cpu') gl.flush();
    if (mode === 'whole') openQuery();
    if (mode === 'prefix') {
      frame.checkpoint = prefixLabels[prefixCursor++ % prefixLabels.length];
      openQuery();
    }
  }
  /** prefix mode: the frame's single query ends where its checkpoint label returns. */
  function checkpointReturned(returned) {
    if (mode !== 'prefix' || !frame || frame.checkpoint !== returned || !query) return;
    gl.flush();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    frame.pieces.push({ label: 'prefix', q: query });
    query = null;
  }
  function switchTo(next) {
    if (mode === 'off') return;
    const now = performance.now();
    if (!frame) beginFrame(now);
    if (next === label) return;
    account(now);
    if (mode === 'segmented') { closeQuery(label); openQuery(); }
    label = next;
    segStartedAt = now;
    segCalls = R.info.render.calls;
    segTris = R.info.render.triangles;
  }
  function push(next) { stack.push(label, next); switchTo(next); }
  function pop() {
    const returned = stack.pop();
    const parent = stack.pop();
    switchTo(parent ?? 'between');
    checkpointReturned(returned);
  }
  function endFrame() {
    if (!frame) return;
    const now = performance.now();
    account(now);
    closeQuery(frame.mode === 'whole' ? 'frame' : frame.mode === 'prefix' ? 'prefix' : label);
    frame.cpuFrame = now - frame.startedAt;
    frame.interval = lastFrameEndAt === null ? null : now - lastFrameEndAt;
    lastFrameEndAt = now;
    pending.push(frame);
    frame = null;
    label = null;
    stack.length = 0;
    resolvePending();
  }
  function resolvePending() {
    if (!pending.length) return;
    if (!ext || pending.every((f) => f.mode === 'cpu')) { while (pending.length) done.push(finishRecord(pending.shift(), null)); return; }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      disjointFrames += pending.length;
      for (const f of pending.splice(0)) for (const p of f.pieces) pool.push(p.q);
      return;
    }
    while (pending.length) {
      const f = pending[0];
      if (f.mode === 'cpu') { pending.shift(); done.push(finishRecord(f, null)); continue; }
      if (!f.pieces.every((p) => gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE))) return;
      pending.shift();
      const gpu = {};
      for (const p of f.pieces) {
        gpu[p.label] = (gpu[p.label] || 0) + gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
        pool.push(p.q);
      }
      const record = finishRecord(f, gpu);
      lastGpuTotal = record.gpuTotal ?? lastGpuTotal;
      done.push(record);
    }
  }
  function finishRecord(f, gpu) {
    const round = (o) => { const r = {}; for (const k of Object.keys(o)) r[k] = +o[k].toFixed(4); return r; };
    const gpuTotal = gpu ? Object.values(gpu).reduce((s, v) => s + v, 0) : null;
    return { mode: f.mode, checkpoint: f.checkpoint ?? null, gpu: gpu ? round(gpu) : null, gpuTotal: gpuTotal === null ? null : +gpuTotal.toFixed(4),
      cpu: round(f.cpu), cpuFrame: +f.cpuFrame.toFixed(3), interval: f.interval === null ? null : +f.interval.toFixed(3),
      calls: f.calls, tris: f.tris };
  }

  // --- hooks -------------------------------------------------------------------------------------------------
  function wrapMethod(owner, key, wrapperFor) {
    if (!owner || typeof owner[key] !== 'function') return false;
    const had = Object.prototype.hasOwnProperty.call(owner, key);
    const original = owner[key];
    owner[key] = wrapperFor(original);
    restores.push(() => { if (had) owner[key] = original; else delete owner[key]; });
    return true;
  }
  const bracket = (next) => (original) => function (...args) {
    push(next);
    try { return original.apply(this, args); } finally { pop(); }
  };
  const hooked = [];
  const world = D.world;
  if (wrapMethod(world, 'update', bracket('world'))) hooked.push('world.update');
  const clouds = D.scene.userData?.volumetricClouds;
  if (wrapMethod(clouds, 'beforeSceneRender', bracket('clouds'))) hooked.push('clouds.beforeSceneRender');
  for (const pass of passes) wrapMethod(pass, 'render', bracket(passLabels.get(pass)));
  hooked.push(`composer passes ${passes.length}`);
  if (wrapMethod(R.shadowMap, 'render', bracket('shadow'))) hooked.push('shadowMap.render');
  wrapMethod(R, 'setRenderTarget', (original) => function (target, ...rest) {
    if (mode !== 'off' && label !== null) {
      if (label.startsWith('shadow')) {
        let cascade = -1;
        for (let i = 0; i < csmLights.length; i++) if (target && csmLights[i].shadow?.map === target) { cascade = i; break; }
        if (cascade >= 0) switchTo(`shadow-c${cascade}`);
      } else if (label.startsWith('world')) {
        const name = String(target?.texture?.name || '');
        switchTo(/^waterRipples/.test(name) ? 'world-water' : /^groundPressure/.test(name) ? 'world-grass'
          : /ocean/i.test(name) ? 'world-ocean' : 'world');
      }
    }
    return original.call(this, target, ...rest);
  });
  hooked.push('renderer.setRenderTarget');
  // the frame closes when the post transaction returns (post.render is the frame's single render entry)
  wrapMethod(post, 'render', (original) => function (...args) {
    push('post');
    try { return original.apply(this, args); } finally { pop(); endFrame(); }
  });
  hooked.push('post.render');

  // --- sampler -----------------------------------------------------------------------------------------------
  function sample({ frames = 240, block = 30, timeoutMs = 60000, modes = ['segmented', 'whole'], flush = true,
    // 'shadow' returns when the scene pass's shadow-map render does (three renders the maps first inside render()):
    // its step is the cascades plus the scene pass's setup before them, the 'scene' step the main draw after them
    checkpoints = ['world', 'clouds', 'shadow', 'scene', 'aerial', 'latefx', 'bloom', 'sunshafts', 'lensflare', 'grade', 'smaa', 'upscale'] } = {}) {
    return new Promise((resolve) => {
      flushPieces = !!flush;
      // a disabled pass never returns: it cannot end a prefix
      const passOf = new Map([...passLabels].map(([pass, l]) => [l, pass]));
      prefixLabels = checkpoints.filter((l) => !passOf.has(l) || passOf.get(l).enabled !== false);
      prefixCursor = 0;
      done.length = 0;
      disjointFrames = 0;
      lastFrameEndAt = null;
      autoResetBefore = R.info.autoReset;
      R.info.autoReset = false;
      const startedAt = performance.now();
      let counted = 0, blockAt = 0, modeIndex = 0;
      mode = modes[0];
      const tick = () => {
        resolvePending();
        const recorded = done.filter((f) => f.mode !== 'off').length;
        if (recorded !== counted) {
          counted = recorded;
          if (counted - blockAt >= block && modes.length > 1) { blockAt = counted; modeIndex = (modeIndex + 1) % modes.length; mode = modes[modeIndex]; }
        }
        const timedOut = performance.now() - startedAt > timeoutMs;
        if (counted >= frames || timedOut) {
          mode = 'off';
          // let the last queries land (bounded), then hand the records back
          const drainStarted = performance.now();
          const drain = () => {
            resolvePending();
            if (pending.length && performance.now() - drainStarted < 2000) { requestAnimationFrame(drain); return; }
            R.info.autoReset = autoResetBefore;
            resolve({ protocol: 'frame-pass-timer-v1', gpuTimer: !!ext, checkpoints: prefixLabels.slice(), frames: done.splice(0), disjointFrames,
              unresolvedFrames: pending.length, timedOut, wallMs: Math.round(performance.now() - startedAt) });
            for (const f of pending.splice(0)) for (const p of f.pieces) pool.push(p.q);
          };
          requestAnimationFrame(drain);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  const controller = {
    /** True while a sample runs: the timer owns TIME_ELAPSED queries then (they cannot nest). */
    get active() { return mode !== 'off'; },
    /** GPU ms of the last resolved frame (segmented: the sum of its pieces). */
    get lastGpuTotal() { return lastGpuTotal; },
    describe: () => ({ protocol: 'frame-pass-timer-v1', gpuTimer: !!ext, hooked, labels: passes.map((p) => passLabels.get(p)),
      cascades: csmLights.length }),
    sample,
    uninstall() {
      mode = 'off';
      for (const restore of restores.reverse()) restore();
      restores.length = 0;
      for (const q of pool) gl.deleteQuery(q);
      pool.length = 0;
      delete window.__FRAME_PASS_TIMER;
    },
  };
  window.__FRAME_PASS_TIMER = controller;
  return controller.describe();
}

// ------------------------------------------------------------------------------------------------- host side

const quantile = (values, p) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const round = (v, digits = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : +v.toFixed(digits));

/** n, median, p10, p25, p75, p90, mean of a numeric list (nulls dropped). */
export function stats(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!list.length) return { n: 0, med: null, p10: null, p25: null, p75: null, p90: null, mean: null };
  return {
    n: list.length, med: round(quantile(list, 0.5)), p10: round(quantile(list, 0.1)), p25: round(quantile(list, 0.25)),
    p75: round(quantile(list, 0.75)), p90: round(quantile(list, 0.9)), mean: round(list.reduce((s, v) => s + v, 0) / list.length),
  };
}

/** Canonical display order of the frame's labels; anything else sorts after, alphabetically. */
export const FRAME_PASS_ORDER = Object.freeze([
  'world', 'world-water', 'world-grass', 'world-ocean', 'between', 'post', 'clouds',
  'scene', 'shadow', 'shadow-c0', 'shadow-c1', 'shadow-c2', 'shadow-c3',
  'aerial', 'gtao', 'latefx', 'taa', 'bloom', 'sunshafts', 'lensflare', 'grade', 'smaa', 'upscale',
]);

function orderedLabels(labels) {
  const known = FRAME_PASS_ORDER.filter((l) => labels.has(l));
  const rest = [...labels].filter((l) => !FRAME_PASS_ORDER.includes(l)).sort();
  return [...known, ...rest];
}

/**
 * Summarize one sampler result: per label (segmented frames) the GPU ms, CPU ms, draw calls and triangles; the
 * whole-frame GPU total (whole frames) beside the per-frame sum of the segmented labels, and their ratio — the
 * measurement's own consistency check. A label absent from a frame counts as 0 for that frame.
 */
export function summarizePassFrames(result) {
  const frames = result?.frames ?? [];
  const segmented = frames.filter((f) => f.mode === 'segmented' && f.gpu);
  const whole = frames.filter((f) => f.mode === 'whole' && f.gpu);
  // a prefix frame's single query ending at the frame's end is a whole frame too
  const lastCheckpoint = (result?.checkpoints ?? []).at(-1);
  for (const f of frames) if (f.mode === 'prefix' && f.gpu && f.checkpoint === lastCheckpoint) whole.push(f);
  const labels = new Set();
  for (const f of segmented) for (const k of Object.keys(f.gpu)) labels.add(k);
  for (const f of frames) for (const k of Object.keys(f.cpu || {})) labels.add(k);
  const passes = {};
  for (const l of orderedLabels(labels)) {
    passes[l] = {
      gpu: stats(segmented.map((f) => f.gpu[l] ?? 0)),
      cpu: stats(frames.map((f) => f.cpu?.[l] ?? 0)),
      calls: stats(frames.map((f) => f.calls?.[l] ?? 0)),
      tris: stats(frames.map((f) => f.tris?.[l] ?? 0)),
    };
  }
  // prefix frames: one query from the frame's start to its checkpoint; a pass is the step between checkpoints
  const prefixFrames = frames.filter((f) => f.mode === 'prefix' && f.gpu);
  const checkpoints = result?.checkpoints ?? [];
  const prefix = checkpoints.map((l) => ({ label: l, ...stats(prefixFrames.filter((f) => f.checkpoint === l).map((f) => f.gpuTotal)) }));
  const prefixPasses = {};
  for (let i = 0; i < prefix.length; i++) {
    const prev = i ? prefix[i - 1] : { med: 0, p25: 0 };
    prefixPasses[prefix[i].label] = {
      med: prefix[i].med === null || prev.med === null ? null : round(prefix[i].med - prev.med),
      p25: prefix[i].p25 === null || prev.p25 === null ? null : round(prefix[i].p25 - prev.p25),
      n: prefix[i].n,
    };
  }
  const segmentedTotal = stats(segmented.map((f) => f.gpuTotal));
  const wholeTotal = stats(whole.map((f) => f.gpuTotal));
  const allCalls = (f) => Object.values(f.calls || {}).reduce((s, v) => s + v, 0);
  const allTris = (f) => Object.values(f.tris || {}).reduce((s, v) => s + v, 0);
  return {
    frames: frames.length, segmentedFrames: segmented.length, wholeFrames: whole.length,
    disjointFrames: result?.disjointFrames ?? 0, gpuTimer: !!result?.gpuTimer,
    gpuFrame: wholeTotal, gpuSegmentedSum: segmentedTotal,
    // the per-pass pieces must add up to the whole frame (query overhead and split cost included): ~1.0
    segmentedOverWhole: segmentedTotal.med && wholeTotal.med ? round(segmentedTotal.med / wholeTotal.med, 3) : null,
    prefix, prefixPasses, prefixFrames: prefixFrames.length,
    cpuFrame: stats(frames.map((f) => f.cpuFrame)),
    interval: stats(frames.map((f) => f.interval)),
    calls: stats(frames.map(allCalls)),
    tris: stats(frames.map(allTris)),
    passes,
  };
}

/**
 * A B B A pair deltas of one statistic: `records` is the slot list [{ label, value }] in run order; consecutive
 * slots of different labels pair up (A1 B1 | B2 A2 → B1−A1, B2−A2). Returns every pair delta (b − a) and their
 * median and spread, so a reader sees the noise beside the signal.
 */
export function pairDeltas(records, a, b) {
  const deltas = [];
  for (let i = 0; i + 1 < records.length; i += 2) {
    const x = records[i], y = records[i + 1];
    if (!x || !y || x.value === null || y.value === null || x.value === undefined || y.value === undefined) continue;
    if (x.label === a && y.label === b) deltas.push(y.value - x.value);
    else if (x.label === b && y.label === a) deltas.push(x.value - y.value);
  }
  const s = stats(deltas);
  return { pairs: deltas.length, deltas: deltas.map((d) => round(d)), med: s.med,
    min: deltas.length ? round(Math.min(...deltas)) : null, max: deltas.length ? round(Math.max(...deltas)) : null };
}

/**
 * The mid-range projection (docs/PERFORMANCE.md "Frame budget"): this machine's GPU ms divided by the proxy's
 * throughput ratio, and CPU ms by the CPU ratio. The frame is bounded by the slower of the two lanes (the GPU and
 * the main thread overlap in a pipelined browser frame), so the projected frame time is their maximum.
 */
export function projectFrameMs({ gpuMs, cpuMs }, { gpuRatio, cpuRatio }) {
  if (!(gpuRatio > 0) || !(cpuRatio > 0)) throw new RangeError('projectFrameMs needs positive throughput ratios');
  const gpu = Number.isFinite(gpuMs) ? gpuMs / gpuRatio : null;
  const cpu = Number.isFinite(cpuMs) ? cpuMs / cpuRatio : null;
  const frame = gpu === null && cpu === null ? null : Math.max(gpu ?? 0, cpu ?? 0);
  return { gpuMs: round(gpu), cpuMs: round(cpu), frameMs: round(frame), fps: frame ? round(1000 / frame, 1) : null,
    bound: gpu === null || cpu === null ? (gpu === null ? 'cpu' : 'gpu') : gpu >= cpu ? 'gpu' : 'cpu' };
}

/**
 * The throughput ratios of the stated proxies against this machine (Apple M5 Max 40-core GPU, M5 Max CPU), from
 * the published cross-platform scores the docs cite (Notebookcheck's database medians, 2026). GPU: 3DMark Wild Life
 * Extreme / Steel Nomad Light; CPU: Geekbench 6 single-core (the main thread is one core).
 */
export const MID_RANGE_PROXIES = Object.freeze({
  'rtx4050-laptop': Object.freeze({
    label: 'GeForce RTX 4050 Laptop + Ryzen 7 7840HS class',
    gpu: Object.freeze({ wildLifeExtreme: [13488, 39389], steelNomadLight: [7254, 16191], steelNomad: [1669, 3924] }),
    cpu: Object.freeze({ geekbench6Single: [2664, 4268] }),
  }),
  'radeon780m': Object.freeze({
    label: 'Radeon 780M (Ryzen 7 7840HS iGPU)',
    gpu: Object.freeze({ wildLifeExtreme: [4945, 39389], steelNomadLight: [2775, 16191], steelNomad: [492, 3924] }),
    cpu: Object.freeze({ geekbench6Single: [2664, 4268] }),
  }),
});

/** The ratios a proxy implies: the most conservative (smallest) GPU score ratio, and the CPU ratio. */
export function proxyRatios(proxy) {
  const gpuRatios = Object.values(proxy.gpu).map(([theirs, ours]) => theirs / ours);
  const cpuRatios = Object.values(proxy.cpu).map(([theirs, ours]) => theirs / ours);
  return { gpuRatio: round(Math.min(...gpuRatios), 3), gpuRatioRange: [round(Math.min(...gpuRatios), 3), round(Math.max(...gpuRatios), 3)],
    cpuRatio: round(Math.min(...cpuRatios), 3) };
}
