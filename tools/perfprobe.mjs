// Performance probe harness (perf engineer tooling).
// Usage: node tools/perfprobe.mjs [--seconds 60] [--width 1920] [--height 1080]
//        [--dsf 1|2] [--out file] [--preset low|medium|high|ultra] [--dump file]
//        [--note tag] [--no-trend]
// Starts vite, loads the game headless, measures load-to-__GAME_READY, enters
// battle on the verdant map, simulates combat (drive via synthetic keys +
// forceFire debug flag) for N seconds while sampling rAF deltas, renderer.info,
// and JS heap. Prints a JSON report to stdout (and --out file if given), and
// appends a one-line summary to docs/perf-trend.jsonl so per-commit creep
// (load-to-ready, texture MB, triangles) is visible as a series.
//
// THE CERTIFICATION WINDOW IS 60 s (default). Real battles run 5-7 minutes and
// the frame-time tail only develops as wrecks/smoke columns/end-flow
// accumulate: a 20 s slice measured p95 ~10 ms on the same build where the
// 40-60 s window hit p99 30+ ms. Short runs (--seconds 20) are fine for quick
// iteration but are NOT evidence the budget holds.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync, appendFileSync, mkdirSync, rmdirSync, statSync, utimesSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Harness serialization (performance_budget r2, critic minor #8): this machine
// hosts multiple agent sessions whose vite+puppeteer harnesses share one GPU —
// the r2 review window never saw a quiet cert because probes ran concurrently.
// Take the SAME advisory lock the screenshot harness and shot tools use
// (mkdir is atomic; stale dirs from crashed runs are reclaimed by mtime) so at
// most one GPU-bound harness runs at a time. The contention stamps below stay:
// the lock serializes THIS repo's tooling, the stamps catch everything else.
const LOCK_DIR = '/tmp/cot-shots.lock';
const LOCK_STALE_MS = 5 * 60 * 1000;
let lockHeld = false;
async function acquireLock() {
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
    try {
      if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { rmdirSync(LOCK_DIR); continue; }
    } catch (_) { continue; }
    if (Date.now() - t0 > 15 * 60 * 1000) throw new Error('cot-shots lock timeout');
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
  }
}
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}
await acquireLock();
process.on('exit', releaseLock);
// keep the lock's mtime fresh so a long 60 s certification is never reclaimed
// as stale by a sibling harness mid-run
const lockRefresher = setInterval(() => {
  try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
}, 60 * 1000);
lockRefresher.unref();

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const seconds = parseFloat(opt('seconds', '60'));
const width = parseInt(opt('width', '1920'), 10);
const height = parseInt(opt('height', '1080'), 10);
const dsf = parseFloat(opt('dsf', '1')); // deviceScaleFactor: 2 = retina default
const outFile = opt('out', '');
const noTrend = args.includes('--no-trend'); // skip the perf-trend.jsonl append
// A/B tooling: --preset forces a quality tier (writes localStorage before
// load, exactly what the settings UI persists); --dump writes the raw
// per-frame {t, ms} series for temporal tail bucketing; --note tags the
// trend row so experiment rows never read as regressions.
const forcePreset = opt('preset', '');
const dumpFile = opt('dump', '');
const trendNote = opt('note', '');

// Tracked performance budget (docs/EVALUATION.md perf gate). Every line is
// evaluated in the report's `budget` block so regressions surface in the
// probe output itself instead of by manual comparison against old JSONs.
// - drawCalls is budgeted on the WORST frame, not the median: firing-burst
//   spikes are deterministic and a AAA perf gate ships peak-frame compliance.
// - frameMs p99 <= 25 ms keeps contention hitches under 2 vsyncs at 60 Hz.
// - triangles median is across ALL passes (3 CSM cascades + main; the GTAO
//   G-buffer prepass no longer exists) — the creep guard for content/prop
//   integration. Hard gate 7 M = the 2026-07-28 content level (6.36 M) +10%;
//   RATCHET TARGET 6 M once cascade shadow-proxy LODs land (see
//   docs/handoff/performance_budget-r2.md §4).
const BUDGET = {
  fpsMedianMin: 60,
  fpsP5Min: 45,
  frameMsP99Max: 25,
  drawCallsWorstFrameMax: 900,
  // FROZEN 2026-07-28 (perf-owner): the triangle and texture gates were each
  // raised once to "observed +10%" after content rounds — a budget that moves
  // to whatever the last round shipped is not a budget. These two values do
  // not go UP again without a perf-owner sign-off note in docs/perf-*.json;
  // the RATCHET targets below are printed as warning deltas on every run so
  // the remaining creep is visible at review time.
  trianglesMedianMax: 7_000_000,
  loadToReadyMaxMs: 8000,
  // GPU texture creep guard: the scene-material texture estimate DOUBLED in
  // one content round (442 MB -> 806 MB, r2 -> r3; ~30 MB of generated canvas
  // maps per vehicle x a 17-vehicle pool resident at boot). This headless Mac
  // can't observe the consequence, but on 2-4 GB VRAM cards eviction thrash
  // collapses fps entirely. 512 = the ratchet target promised when the gate
  // was first widened; the parked-pool visual eviction (game/state.js) is what
  // makes it holdable — only fielded vehicles keep generated maps resident.
  sceneTextureMBMax: 512,
  // "Stable heap": gate on min(raw trend, post-GC floor trend) — a leak
  // raises both; GC phase skews one. The GC sawtooth on this app's ~250-400 MB
  // battle heap swings a 20 s start->end trend by roughly +-1.5 MB/s even with
  // zero leak (60 s controls trend NEGATIVE: -0.4 both trees). The 1.0 MB/s
  // line applies only at the 60 s certification window: 40-59 s runs sit in a
  // no-man's land where a single rising GC phase can dominate a thirds-floor
  // comparison (measured: a 45 s run flagged +1.18 MB/s "growth" while both
  // 60 s controls trended NEGATIVE), so anything below 60 s gets 2.0.
  heapGrowthMaxMBperS: seconds >= 60 ? 1.0 : 2.0,
};

// Ratchet targets (NOT gates yet): printed as warning deltas on every run so
// content creep toward the frozen gates is visible per-commit, not at cert
// time. Flipping a ratchet into BUDGET requires the owning module's fix to
// have landed (see docs/handoff/) + a perf-owner sign-off note.
const RATCHET = {
  trianglesMedianMax: 6_000_000, // after cascade shadow-proxy LODs (handoff §4)
};

// Machine-contention guard: perf-trend.jsonl carries six rows measured while
// 4-6 sibling agent sessions ran their own vite+puppeteer probes (load avg
// 9-13 on 18 cores) — a total budget collapse indistinguishable from a real
// regression. Certification REQUIRES a quiet machine: when the AMBIENT
// 1-minute load average (sampled before the probe spins up its own
// vite+chromium, which contribute ~3-5 themselves) exceeds 0.5x the core
// count — or the end-of-run load shows a mid-run spike beyond the probe's own
// footprint — the report is stamped contended, the trend row is flagged, and
// the budget block refuses certification (numbers still print for iteration).
const CORES = os.cpus().length;
const CONTENTION_LOAD_LIMIT = CORES * 0.5;
const PROBE_SELF_LOAD = 5; // measured own footprint headroom for the end check
const load1Start = os.loadavg()[0];
// Mid-run sampling (r7): the start/end checks missed 1-minute-scale load
// BURSTS from sibling agent sessions (2026-07-28 12:17 dsf1 run: start 8.2,
// certified FAIL with p99 40.4 ms — yet slow frames carried IDENTICAL draw
// calls/triangles to fast ones, the signature of external GPU/CPU contention,
// and the same tree certified PASS with p99 16.6 ms in a quiet window).
// Sample the 1-min load every 5 s while the probe runs and apply the SAME
// end-check formula to the true maximum — strictly better sampling, no limit
// change. A contended stamp refuses certification of BOTH outcomes.
let load1Max = load1Start;
const loadSampler = setInterval(() => {
  load1Max = Math.max(load1Max, os.loadavg()[0]);
}, 5000);
// GPU-contention guard (r7): CPU load average CANNOT see a sibling harness
// hammering the shared GPU — measured 2026-07-28: a 60 s run at load1Max 8.9
// (CPU-valid) produced mean fps 153 vs MEDIAN 60 with p99 63 ms, the bimodal
// burst/stall signature of GPU time-slicing, while scene draw calls/triangles
// on slow frames were identical to fast ones. Detect the actual contender:
// any FOREIGN headless-Chromium render process (another agent's
// puppeteer/vite probe or screenshot harness) alive during the run. Ours are
// excluded by walking each candidate's parent chain up to our browser PID.
// Symmetric like the load stamp: a foreign-GPU-contended run certifies
// NEITHER pass nor fail.
function countForeignHeadless(ownBrowserPid) {
  try {
    const rows = execSync('ps -axo pid=,ppid=,pcpu=,command=', { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/))
      .filter(Boolean);
    const ppidOf = new Map(rows.map((m) => [+m[1], +m[2]]));
    let foreign = 0;
    for (const m of rows) {
      const cmd = m[4];
      if (!/Chrome for Testing|--headless/.test(cmd) || !/[Cc]hrom/.test(cmd)) continue;
      // idle corpses (a crashed run's leaked browser at ~0% CPU) are not GPU
      // contenders and must not block certification forever; only count
      // processes actually burning CPU (renderer/GPU helpers of a live run).
      if (+m[3] < 5) continue;
      let pid = +m[1];
      let ours = false;
      for (let hop = 0; hop < 12 && pid; hop++) {
        if (pid === ownBrowserPid || pid === process.pid) { ours = true; break; }
        pid = ppidOf.get(pid) || 0;
      }
      if (!ours) foreign++;
    }
    return foreign;
  } catch (_) {
    return -1; // detection unavailable — never blocks certification by itself
  }
}
// Interactive GPU-contention guard (r5): the foreign-HEADLESS stamp misses
// the third GPU sharer on a dev box — the user's own browser. Measured
// 2026-07-28: three back-to-back valid-stamped 60 s dsf-2 runs on an
// IDENTICAL build swung p99 14.4 -> 16.5 -> 30.3 ms; during the 30.3 run the
// interactive Chrome GPU helper was burning 24 % CPU (video/WebGL), during
// the 14.4 run it idled at <3 %. A window where a foreground app is actively
// feeding the shared GPU can certify NEITHER outcome — sample the summed
// %CPU of every non-headless browser gpu-process during the run and stamp
// the report contended past a threshold comfortably above idle (~0-5 %).
const GPU_CONTENDER_CPU_LIMIT = 15;
function foreignGpuProcessCpu(ownBrowserPid) {
  try {
    const rows = execSync('ps -axo pid=,ppid=,pcpu=,command=', { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/))
      .filter(Boolean);
    const ppidOf = new Map(rows.map((m) => [+m[1], +m[2]]));
    let cpu = 0;
    for (const m of rows) {
      if (!/--type=gpu-process/.test(m[4])) continue;
      let pid = +m[1];
      let ours = false;
      for (let hop = 0; hop < 12 && pid; hop++) {
        if (pid === ownBrowserPid || pid === process.pid) { ours = true; break; }
        pid = ppidOf.get(pid) || 0;
      }
      if (!ours) cpu += +m[3];
    }
    return +cpu.toFixed(1);
  } catch (_) {
    return -1; // detection unavailable — never blocks certification by itself
  }
}

const port = 5900 + Math.floor(Math.random() * 90);
// hmr:false (content r4, same fix as tools/screenshot.mjs): concurrent
// sessions editing src/ mid-probe trigger a vite full reload that destroys
// the puppeteer execution context.
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port, strictPort: false, hmr: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.error(`[perf] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
    '--enable-precise-memory-info',
    // unlock rAF from vsync so we measure true render throughput
    '--disable-frame-rate-limit', '--disable-gpu-vsync',
    // expose window.gc for the pre-sample warmup collection (see below)
    '--js-flags=--expose-gc',
  ],
});
const ownBrowserPid = browser.process() ? browser.process().pid : -1;
let foreignHeadlessMax = countForeignHeadless(ownBrowserPid);
let foreignGpuCpuMax = foreignGpuProcessCpu(ownBrowserPid);
const foreignSampler = setInterval(() => {
  foreignHeadlessMax = Math.max(foreignHeadlessMax, countForeignHeadless(ownBrowserPid));
  foreignGpuCpuMax = Math.max(foreignGpuCpuMax, foreignGpuProcessCpu(ownBrowserPid));
}, 10000);

const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: dsf });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// Record precise time-to-ready inside the page.
await page.evaluateOnNewDocument(() => {
  window.__READY_AT = -1;
  const iv = setInterval(() => {
    if (window.__GAME_READY === true) { window.__READY_AT = performance.now(); clearInterval(iv); }
  }, 25);
});
if (forcePreset) {
  await page.evaluateOnNewDocument((p) => {
    try { window.localStorage.setItem('cot.gfxPreset', p); } catch (_) { /* ok */ }
  }, forcePreset);
}

let failed = false;
let report = null;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  const loadToReadyMs = await page.evaluate(() => window.__READY_AT);

  // Enter battle on verdant deterministically.
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.startBattle('m1a2', 'verdant');
    D.flags.forceFire = true; // fire whenever reloaded
  });
  // small settle so shaders/instances for battle HUD compile
  await new Promise((r) => setTimeout(r, 1500));
  // r2: certify the SUSTAINED battle regime — wait (bounded) for the roster's
  // GLB swap queue to drain before opening the window. The battle-staging
  // design intentionally lands sourced models during the opening flyby
  // (modelLoader idle gate + 6 s grace); starting the measurement mid-landing
  // billed each model's one-time parse/upload retention (~90 MB across 5-7
  // GLB vehicles) to the SUSTAINED heap gate and its upload hitches to the
  // frame tail. Bounded at 20 s so a broken loader can never hang the probe —
  // and the load-to-ready gate above still covers the boot path itself.
  // "Settled" must also be STABLE: __GLB_STATS.started grows as staged loads
  // kick in over the first seconds (measured: 0/2 at battle+1.5 s, 5/5 by
  // t=15 — a bare settled>=started check passes between waves). Require the
  // queue drained AND unchanged for 3 s.
  await page.waitForFunction(
    `(() => {
      const s = window.__GLB_STATS;
      if (!s) return true;
      const key = s.settled + '/' + s.started;
      if (s.settled < s.started) { window.__GLB_STABLE = null; return false; }
      if (!window.__GLB_STABLE || window.__GLB_STABLE.key !== key) {
        window.__GLB_STABLE = { key, at: performance.now() };
        return false;
      }
      return performance.now() - window.__GLB_STABLE.at > 3000;
    })()`,
    { timeout: 30000, polling: 250 },
  ).catch(() => console.error('[perf] GLB queue did not settle within 30 s — window opens anyway'));
  // Warmup collection before the measured window (standard bench hygiene, NOT
  // a masking trick): the boot bake creates ~300 MB of one-shot large-object
  // garbage (getImageData buffers of the 2048² vehicle canvases). V8 reclaims
  // large objects only on MAJOR GCs, and because this probe enters battle ~2 s
  // after boot, those majors used to land inside the certification window
  // (tail diagnosis 2026-07-28: 27-30 ms frames clustered t<30 s, flat
  // afterwards; a real player's garage dwell absorbs them long before combat).
  // Sustained-combat allocation behavior is untouched — the heap gate still
  // watches the full 60 s window, and a warmup GC makes its floor baseline
  // STRICTER (starts post-collection, so any battle growth is real).
  const heapRetainedStart = await page.evaluate(() => {
    if (window.gc) { window.gc(); window.gc(); }
    return performance.memory ? performance.memory.usedJSHeapSize : -1;
  });

  // Drive: hold W, wiggle steering + camera so combat is representative.
  await page.keyboard.down('KeyW');
  const steerTimer = (async () => {
    const keys = ['KeyA', 'KeyD'];
    for (let i = 0; i < Math.floor(seconds / 2); i++) {
      const k = keys[i % 2];
      await page.keyboard.down(k);
      await new Promise((r) => setTimeout(r, 800));
      await page.keyboard.up(k);
      await new Promise((r) => setTimeout(r, 1200));
    }
  })();

  // In-page sampler: rAF deltas + per-frame renderer.info + heap once/second.
  await page.evaluate((sampleMs) => {
    const R = window.__DEBUG.renderer;
    // renderer.info auto-resets after every internal render pass; take manual
    // control so each rAF sample sees the FULL frame (shadow + composer passes).
    R.info.autoReset = false;
    window.__PERF = { deltas: [], times: [], calls: [], tris: [], heap: [], done: false };
    const P = window.__PERF;
    let last = -1;
    const t0 = performance.now();
    if (performance.memory) P.heap.push(performance.memory.usedJSHeapSize);
    const heapIv = setInterval(() => {
      if (performance.memory) P.heap.push(performance.memory.usedJSHeapSize);
    }, 1000);
    function frame(now) {
      if (now - t0 > sampleMs) {
        clearInterval(heapIv);
        P.info = {
          geometries: R.info.memory.geometries, textures: R.info.memory.textures,
          programs: R.info.programs.length,
        };
        R.info.autoReset = true;
        P.done = true;
        return;
      }
      if (last >= 0) {
        P.deltas.push(now - last);
        P.times.push(now - t0);
        // counters accumulated since our reset at the previous rAF = one frame
        P.calls.push(R.info.render.calls);
        P.tris.push(R.info.render.triangles);
      }
      R.info.reset();
      last = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, seconds * 1000);

  await page.waitForFunction('window.__PERF && window.__PERF.done === true', { timeout: (seconds + 30) * 1000 });
  await page.keyboard.up('KeyW');
  await steerTimer;

  // RETAINED-SET heap measure (performance_budget r2): force a full major GC
  // at both window boundaries and difference the true retained set. The
  // existing raw/floor trends stay (trend continuity + they need no --expose-gc
  // outside this probe), but both are MAJOR-GC-PHASE estimators: V8 sizes its
  // old-gen allocation budget as a multiple of the live heap, so after the
  // content expansion grew the live battle heap ~+140 MB (5-7 parsed GLB
  // vehicles), a 60 s window often contains NO major GC and the "floor"
  // metric reads the accumulation of perfectly collectable garbage as growth.
  // Measured on HEAD (2026-07-28, 65 s diag): sawtooth floor climbed ~1.3
  // MB/s all window, then a single natural major at t=64 dropped 552 -> 430 MB
  // — back to the post-boot baseline; the identical build measured
  // floorGrowth 1.49-1.99 across probe runs. A REAL leak still fails this
  // metric — leaked objects survive the forced majors by definition — so the
  // 1.0 MB/s gate value is unchanged; it now gates a phase-noise-free number.
  const heapRetainedEnd = await page.evaluate(() => {
    if (window.gc) { window.gc(); window.gc(); }
    return performance.memory ? performance.memory.usedJSHeapSize : -1;
  });
  const heapRetainedMBs = (heapRetainedStart > 0 && heapRetainedEnd > 0)
    ? ((heapRetainedEnd - heapRetainedStart) / seconds) / 1048576
    : null;

  // GPU texture memory estimate: walk scene materials + render targets.
  const texEstimate = await page.evaluate(() => {
    const D = window.__DEBUG;
    const seen = new Set();
    let bytes = 0;
    function addTex(t) {
      if (!t || seen.has(t.uuid)) return;
      seen.add(t.uuid);
      const img = t.image;
      let w = 0; let h = 0;
      if (img) { w = img.width || 0; h = img.height || 0; }
      else if (t.isDataTexture && t.source && t.source.data) {
        w = t.source.data.width || 0; h = t.source.data.height || 0;
      }
      if (!w || !h) return;
      const bpp = 4;
      const mip = t.generateMipmaps ? 1.3333 : 1;
      bytes += w * h * bpp * mip * (t.isCubeTexture ? 6 : 1);
    }
    D.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) addTex(v);
        }
      }
    });
    if (D.scene.environment) addTex(D.scene.environment);
    if (D.scene.background && D.scene.background.isTexture) addTex(D.scene.background);
    // shadow maps + post targets
    let rtBytes = 0;
    D.scene.traverse((o) => {
      if (o.isLight && o.shadow && o.shadow.map) {
        rtBytes += o.shadow.map.width * o.shadow.map.height * 4;
      }
    });
    return { textureBytes: Math.round(bytes), shadowRtBytes: rtBytes, uniqueTextures: seen.size };
  });

  const perf = await page.evaluate(() => window.__PERF);
  if (dumpFile) {
    writeFileSync(resolve(dumpFile), JSON.stringify({ times: perf.times, deltas: perf.deltas, calls: perf.calls, tris: perf.tris }));
    console.error(`[perf] raw frame series dumped to ${dumpFile}`);
  }
  const deltas = perf.deltas.slice().sort((a, b) => a - b);
  const fpsList = perf.deltas.map((d) => 1000 / d).sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const heap = perf.heap;
  const heapGrowthMBs = heap.length > 2
    ? ((heap[heap.length - 1] - heap[0]) / (heap.length - 1)) / (1024 * 1024)
    : 0;
  // Leak detector robust to GC phase: raw start->end growth over a 20 s window
  // swings roughly -4..+2.5 MB/s depending on where the last major GC fell
  // (measured across seven otherwise-identical runs; a 60 s run trends -0.4).
  // The post-GC FLOOR is what a leak actually raises, so compare the minimum
  // of the first third of samples against the minimum of the last third.
  let heapFloorGrowthMBs = 0;
  if (heap.length >= 6) {
    const third = Math.floor(heap.length / 3);
    const lo = Math.min(...heap.slice(0, third));
    const hi = Math.min(...heap.slice(-third));
    heapFloorGrowthMBs = ((hi - lo) / (heap.length - third)) / (1024 * 1024);
  }

  report = {
    date: new Date().toISOString(),
    ...(forcePreset ? { forcedPreset: forcePreset } : {}),
    viewport: { width, height, deviceScaleFactor: dsf },
    sampleSeconds: seconds,
    frames: perf.deltas.length,
    loadToReadyMs: Math.round(loadToReadyMs),
    fps: {
      median: +q(fpsList, 0.5).toFixed(1),
      p5: +q(fpsList, 0.05).toFixed(1),
      p1: +q(fpsList, 0.01).toFixed(1),
      mean: +(fpsList.reduce((a, b) => a + b, 0) / fpsList.length).toFixed(1),
    },
    frameMs: { median: +q(deltas, 0.5).toFixed(2), p95: +q(deltas, 0.95).toFixed(2), p99: +q(deltas, 0.99).toFixed(2) },
    drawCalls: {
      median: q(perf.calls.slice().sort((a, b) => a - b), 0.5),
      max: Math.max(...perf.calls),
    },
    triangles: {
      median: q(perf.tris.slice().sort((a, b) => a - b), 0.5),
      max: Math.max(...perf.tris),
    },
    rendererInfo: perf.info || null,
    heap: {
      startMB: +(heap[0] / 1048576).toFixed(1),
      endMB: +(heap[heap.length - 1] / 1048576).toFixed(1),
      growthMBperS: +heapGrowthMBs.toFixed(2),
      floorGrowthMBperS: +heapFloorGrowthMBs.toFixed(2),
      // forced-major-GC retained-set delta across the window (see comment at
      // the measurement site) — null when --expose-gc/memory API unavailable
      retainedStartMB: heapRetainedStart > 0 ? +(heapRetainedStart / 1048576).toFixed(1) : null,
      retainedEndMB: heapRetainedEnd > 0 ? +(heapRetainedEnd / 1048576).toFixed(1) : null,
      retainedGrowthMBperS: heapRetainedMBs === null ? null : +heapRetainedMBs.toFixed(2),
    },
    gpuTextureEstimate: {
      sceneTextureMB: +(texEstimate.textureBytes / 1048576).toFixed(1),
      shadowRtMB: +(texEstimate.shadowRtBytes / 1048576).toFixed(1),
      uniqueTextures: texEstimate.uniqueTextures,
    },
    consoleErrors: consoleErrors.slice(0, 10),
  };
  // Machine contention stamp (see CONTENTION_LOAD_LIMIT above).
  const load1End = os.loadavg()[0];
  clearInterval(loadSampler);
  clearInterval(foreignSampler);
  load1Max = Math.max(load1Max, load1End);
  foreignHeadlessMax = Math.max(foreignHeadlessMax, countForeignHeadless(ownBrowserPid));
  foreignGpuCpuMax = Math.max(foreignGpuCpuMax, foreignGpuProcessCpu(ownBrowserPid));
  const contended = load1Start > CONTENTION_LOAD_LIMIT
    || load1Max > CONTENTION_LOAD_LIMIT + PROBE_SELF_LOAD
    || foreignHeadlessMax > 0
    || foreignGpuCpuMax > GPU_CONTENDER_CPU_LIMIT;
  report.machine = {
    cores: CORES,
    load1Start: +load1Start.toFixed(2),
    load1End: +load1End.toFixed(2),
    load1Max: +load1Max.toFixed(2),
    // foreign headless-Chromium render processes seen during the run (another
    // agent's probe/harness sharing this GPU); -1 = detection unavailable
    foreignHeadlessMax,
    // summed %CPU of non-headless browser gpu-processes (the user's own
    // browser actively using the shared GPU); -1 = detection unavailable
    foreignGpuCpuMax,
    contended,
  };
  // Budget evaluation (see BUDGET above) — machine-checkable pass/fail lines.
  const lines = {
    fpsMedian: { limit: `>=${BUDGET.fpsMedianMin}`, actual: report.fps.median, pass: report.fps.median >= BUDGET.fpsMedianMin },
    fpsP5: { limit: `>=${BUDGET.fpsP5Min}`, actual: report.fps.p5, pass: report.fps.p5 >= BUDGET.fpsP5Min },
    frameMsP99: { limit: `<=${BUDGET.frameMsP99Max}`, actual: report.frameMs.p99, pass: report.frameMs.p99 <= BUDGET.frameMsP99Max },
    drawCallsWorstFrame: { limit: `<=${BUDGET.drawCallsWorstFrameMax}`, actual: report.drawCalls.max, pass: report.drawCalls.max <= BUDGET.drawCallsWorstFrameMax },
    trianglesMedian: { limit: `<=${BUDGET.trianglesMedianMax}`, actual: report.triangles.median, pass: report.triangles.median <= BUDGET.trianglesMedianMax },
    loadToReady: { limit: `<=${BUDGET.loadToReadyMaxMs}`, actual: report.loadToReadyMs, pass: report.loadToReadyMs <= BUDGET.loadToReadyMaxMs },
    sceneTextureMB: {
      limit: `<=${BUDGET.sceneTextureMBMax} (frozen; holdable via parked-pool visual eviction)`,
      actual: report.gpuTextureEstimate.sceneTextureMB,
      pass: report.gpuTextureEstimate.sceneTextureMB <= BUDGET.sceneTextureMBMax,
    },
    // Stable heap: a real leak raises BOTH the raw start->end trend AND the
    // post-GC floor trend; GC-cycle phase in a 20 s window skews one or the
    // other (raw measured -4.6..+2.5 MB/s across identical no-leak runs, and
    // a 60 s control trends -0.4). Gate on the smaller of the two.
    // r2: prefer the forced-GC retained-set delta when available (this probe
    // always launches with --expose-gc) — it is the phase-noise-free form of
    // exactly what this gate documents ("a leak raises the post-GC floor");
    // raw/floor trends remain in report.heap for continuity. Gate UNCHANGED.
    heapStableMBperS: {
      limit: `<=${BUDGET.heapGrowthMaxMBperS}`,
      actual: report.heap.retainedGrowthMBperS !== null
        ? report.heap.retainedGrowthMBperS
        : Math.min(report.heap.growthMBperS, report.heap.floorGrowthMBperS),
      pass: (report.heap.retainedGrowthMBperS !== null
        ? report.heap.retainedGrowthMBperS
        : Math.min(report.heap.growthMBperS, report.heap.floorGrowthMBperS)) <= BUDGET.heapGrowthMaxMBperS,
    },
    consoleErrors: { limit: '=0', actual: consoleErrors.length, pass: consoleErrors.length === 0 },
  };
  report.budget = { pass: Object.values(lines).every((l) => l.pass), ...lines };
  // Certification validity: a contended machine cannot certify EITHER outcome.
  report.budget.certification = contended
    ? `REFUSED — machine contended (load1 ${report.machine.load1Start}->${report.machine.load1End}, mid-run max ${report.machine.load1Max}, foreign headless-GPU procs ${foreignHeadlessMax}, interactive-browser GPU cpu ${foreignGpuCpuMax}% (limit ${GPU_CONTENDER_CPU_LIMIT}), on ${CORES} cores, load limit ${CONTENTION_LOAD_LIMIT}); re-run quiet`
    : (report.budget.pass ? 'PASS' : 'FAIL');
  if (contended) {
    console.error(`[perf] CONTENDED MACHINE: load1 ${report.machine.load1Start} -> ${report.machine.load1End} (mid-run max ${report.machine.load1Max}), foreign headless-GPU procs ${foreignHeadlessMax}, on ${CORES} cores (load limit ${CONTENTION_LOAD_LIMIT}). Numbers are for iteration only — certification refused.`);
  }
  if (!report.budget.pass) {
    const failed = Object.entries(lines).filter(([, l]) => l && l.pass === false).map(([k, l]) => `${k}=${l.actual} (want ${l.limit})`);
    console.error(`[perf] BUDGET FAIL: ${failed.join(', ')}`);
  }
  // Ratchet warnings (frozen-gate creep visibility — see RATCHET above).
  report.ratchet = {
    trianglesMedian: { target: RATCHET.trianglesMedianMax, actual: report.triangles.median, met: report.triangles.median <= RATCHET.trianglesMedianMax },
  };
  for (const [k, r] of Object.entries(report.ratchet)) {
    if (!r.met) console.error(`[perf] RATCHET WARN: ${k}=${r.actual} still above the ${r.target} ratchet target (gate frozen — do not raise)`);
  }
  // Per-commit trend line (docs/perf-trend.jsonl): the load-to-ready and
  // texture-footprint regressions crept in ~15% per round without tripping any
  // gate — a series makes the creep visible at review time, not at cert time.
  if (!noTrend) {
    try {
      appendFileSync(resolve('docs/perf-trend.jsonl'), `${JSON.stringify({
        date: report.date,
        dsf,
        seconds,
        loadToReadyMs: report.loadToReadyMs,
        fpsMedian: report.fps.median,
        fpsP5: report.fps.p5,
        frameMsP99: report.frameMs.p99,
        drawCallsMax: report.drawCalls.max,
        trianglesMedian: report.triangles.median,
        sceneTextureMB: report.gpuTextureEstimate.sceneTextureMB,
        heapFloorMBperS: report.heap.floorGrowthMBperS,
        heapRetainedMBperS: report.heap.retainedGrowthMBperS,
        budgetPass: report.budget.pass,
        ...(forcePreset ? { preset: forcePreset } : {}),
        // contaminated rows must never read as regressions (see machine stamp)
        ...(contended ? { note: trendNote ? `contended; ${trendNote}` : 'contended', load1: report.machine.load1End, cores: CORES } : (trendNote ? { note: trendNote } : {})),
      })}\n`);
    } catch (err) {
      console.error(`[perf] trend append skipped: ${err.message}`);
    }
  }
} catch (err) {
  failed = true;
  console.error(`[perf] FAILED: ${err.message}`);
} finally {
  clearInterval(loadSampler);
  clearInterval(foreignSampler);
  clearInterval(lockRefresher);
  await browser.close();
  await server.close();
  releaseLock();
}

if (report) {
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (outFile) writeFileSync(resolve(outFile), json);
}
process.exit(failed ? 1 : 0);
