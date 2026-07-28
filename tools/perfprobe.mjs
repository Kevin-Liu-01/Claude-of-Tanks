// Performance probe harness (perf engineer tooling).
// Usage: node tools/perfprobe.mjs [--seconds 20] [--width 1920] [--height 1080] [--out -]
// Starts vite, loads the game headless, measures load-to-__GAME_READY, enters
// battle on the verdant map, simulates combat (drive via synthetic keys +
// forceFire debug flag) for N seconds while sampling rAF deltas, renderer.info,
// and JS heap. Prints a JSON report to stdout (and --out file if given).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const seconds = parseFloat(opt('seconds', '20'));
const width = parseInt(opt('width', '1920'), 10);
const height = parseInt(opt('height', '1080'), 10);
const dsf = parseFloat(opt('dsf', '1')); // deviceScaleFactor: 2 = retina default
const outFile = opt('out', '');

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
  trianglesMedianMax: 7_000_000, // ratchet to 6M after shadow-proxy LODs (handoff §4)
  loadToReadyMaxMs: 8000,
  // "Stable heap": gate on min(raw trend, post-GC floor trend) — a leak
  // raises both; GC phase skews one. The GC sawtooth on this app's ~250-400 MB
  // battle heap swings a 20 s start->end trend by roughly +-1.5 MB/s even with
  // zero leak (60 s controls trend NEGATIVE: -0.4 both trees), so short
  // windows get a wider tolerance; runs of 40 s+ are the authoritative check.
  heapGrowthMaxMBperS: seconds >= 40 ? 1.0 : 2.0,
};

const port = 5900 + Math.floor(Math.random() * 90);
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port, strictPort: false } });
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
  ],
});
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
    window.__PERF = { deltas: [], calls: [], tris: [], heap: [], done: false };
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
    },
    gpuTextureEstimate: {
      sceneTextureMB: +(texEstimate.textureBytes / 1048576).toFixed(1),
      shadowRtMB: +(texEstimate.shadowRtBytes / 1048576).toFixed(1),
      uniqueTextures: texEstimate.uniqueTextures,
    },
    consoleErrors: consoleErrors.slice(0, 10),
  };
  // Budget evaluation (see BUDGET above) — machine-checkable pass/fail lines.
  const lines = {
    fpsMedian: { limit: `>=${BUDGET.fpsMedianMin}`, actual: report.fps.median, pass: report.fps.median >= BUDGET.fpsMedianMin },
    fpsP5: { limit: `>=${BUDGET.fpsP5Min}`, actual: report.fps.p5, pass: report.fps.p5 >= BUDGET.fpsP5Min },
    frameMsP99: { limit: `<=${BUDGET.frameMsP99Max}`, actual: report.frameMs.p99, pass: report.frameMs.p99 <= BUDGET.frameMsP99Max },
    drawCallsWorstFrame: { limit: `<=${BUDGET.drawCallsWorstFrameMax}`, actual: report.drawCalls.max, pass: report.drawCalls.max <= BUDGET.drawCallsWorstFrameMax },
    trianglesMedian: { limit: `<=${BUDGET.trianglesMedianMax}`, actual: report.triangles.median, pass: report.triangles.median <= BUDGET.trianglesMedianMax },
    loadToReady: { limit: `<=${BUDGET.loadToReadyMaxMs}`, actual: report.loadToReadyMs, pass: report.loadToReadyMs <= BUDGET.loadToReadyMaxMs },
    // Stable heap: a real leak raises BOTH the raw start->end trend AND the
    // post-GC floor trend; GC-cycle phase in a 20 s window skews one or the
    // other (raw measured -4.6..+2.5 MB/s across identical no-leak runs, and
    // a 60 s control trends -0.4). Gate on the smaller of the two.
    heapStableMBperS: {
      limit: `<=${BUDGET.heapGrowthMaxMBperS}`,
      actual: Math.min(report.heap.growthMBperS, report.heap.floorGrowthMBperS),
      pass: Math.min(report.heap.growthMBperS, report.heap.floorGrowthMBperS) <= BUDGET.heapGrowthMaxMBperS,
    },
    consoleErrors: { limit: '=0', actual: consoleErrors.length, pass: consoleErrors.length === 0 },
  };
  report.budget = { pass: Object.values(lines).every((l) => l.pass), ...lines };
  if (!report.budget.pass) {
    const failed = Object.entries(lines).filter(([, l]) => !l.pass).map(([k, l]) => `${k}=${l.actual} (want ${l.limit})`);
    console.error(`[perf] BUDGET FAIL: ${failed.join(', ')}`);
  }
} catch (err) {
  failed = true;
  console.error(`[perf] FAILED: ${err.message}`);
} finally {
  await browser.close();
  await server.close();
}

if (report) {
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (outFile) writeFileSync(resolve(outFile), json);
}
process.exit(failed ? 1 : 0);
