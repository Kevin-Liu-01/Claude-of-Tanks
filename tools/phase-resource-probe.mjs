// Phase-level CPU, heap and Three.js residency probe.
//
// Usage:
//   node tools/phase-resource-probe.mjs [--production] [--seconds 8]
//     [--garage-settle 16] [--gate] [--out /tmp/cot-phase-resources.json]
//
// The probe measures retained resources after an explicit GC and samples CDP
// TaskDuration over a quiet window. taskCoreEquivalent=1 means one CPU core
// was occupied continuously for the complete window; unlike FPS this exposes
// expensive work on a static Garage frame.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const production = has('production');
const trace = has('trace');
const gate = has('gate');
const seconds = Math.max(2, Math.min(30, Number(option('seconds', '8')) || 8));
const garageSettleSeconds = Math.max(
  0,
  Math.min(60, Number(option('garage-settle', '16')) || 16),
);
const outputPath = option('out', '');
const viewport = {
  width: Math.max(640, Number(option('width', '1280')) || 1280),
  height: Math.max(360, Number(option('height', '577')) || 577),
  deviceScaleFactor: Math.max(1, Number(option('dpr', '1')) || 1),
};

// Broad release ceilings, not performance targets. They sit well above the
// measured healthy baseline so ordinary host noise does not fail CI, while a
// return to full-cadence Garage work or unbounded scene/heap residency does.
const RESOURCE_BUDGETS = Object.freeze({
  garageIdle: Object.freeze({
    taskCoreEquivalent: 0.15,
    heapMB: 96,
    programs: 110,
    geometries: 425,
    textures: 100,
    calls: 1000,
    triangles: 300_000,
  }),
  battleActive: Object.freeze({
    taskCoreEquivalent: 0.65,
    heapMB: 340,
    programs: 280,
    geometries: 850,
    textures: 350,
    calls: 800,
    triangles: 4_500_000,
  }),
  garageReturned: Object.freeze({
    taskCoreEquivalent: 0.18,
    heapMB: 260,
    programs: 310,
    geometries: 650,
    textures: 220,
    calls: 1000,
    triangles: 300_000,
  }),
});

const server = production
  ? await preview({
    root: process.cwd(),
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 5840, strictPort: false },
  })
  : await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 5840, strictPort: false },
  });
if (!production) await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address
  ? address.port
  : server.config.server.port;

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 600_000,
  args: [
    '--use-gl=angle',
    '--enable-webgl',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--js-flags=--expose-gc',
  ],
});
const page = await browser.newPage();
await page.setViewport(viewport);
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');

const pageErrors = [];
const consoleErrors = [];
const failedResponses = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const entry = message.text();
  consoleErrors.push(entry);
  // Chromium reports ordinary failed subresources as console errors. Keep
  // them in the receipt, but do not confuse a blocked analytics/optional
  // asset request with an application exception.
  if (!entry.startsWith('Failed to load resource') &&
      !entry.includes('[Vercel Web Analytics]')) pageErrors.push(entry);
});
page.on('response', (response) => {
  if (response.status() < 400) return;
  failedResponses.push({ status: response.status(), url: response.url() });
});

const sleep = (durationMs) => new Promise((resolveSleep) => {
  setTimeout(resolveSleep, durationMs);
});
const metricMap = async () => new Map(
  (await cdp.send('Performance.getMetrics')).metrics
    .map((metric) => [metric.name, metric.value]),
);
const delta = (after, before, name) => (after.get(name) || 0) - (before.get(name) || 0);

const sampleResources = () => page.evaluate(() => {
  const debug = window.__DEBUG;
  const renderer = debug.renderer;
  const completeFrame = window.__PHASE_RESOURCE_LAST_RENDER || renderer.info.render;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let objects = 0;
  let visibleObjects = 0;
  let meshes = 0;
  let visibleMeshes = 0;
  const collectTexture = (value) => {
    if (value?.isTexture) textures.add(value);
  };
  debug.scene.traverse((object) => {
    objects += 1;
    if (object.visible) visibleObjects += 1;
    if (object.geometry) geometries.add(object.geometry);
    if (object.isMesh) {
      meshes += 1;
      if (object.visible) visibleMeshes += 1;
    }
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) collectTexture(value);
      for (const uniform of Object.values(material.uniforms || {})) {
        const value = uniform?.value;
        if (Array.isArray(value)) value.forEach(collectTexture);
        else collectTexture(value);
      }
    }
  });
  return {
    phase: debug.game.phase,
    objects,
    visibleObjects,
    meshes,
    visibleMeshes,
    sceneGeometries: geometries.size,
    sceneMaterials: materials.size,
    sceneTextures: textures.size,
    renderer: {
      calls: completeFrame.calls,
      triangles: completeFrame.triangles,
      lines: completeFrame.lines,
      points: completeFrame.points,
      programs: (renderer.info.programs || []).length,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    },
    caches: {
      pedestalIds: debug.pedestalCacheIds,
      battleVisualPool: debug.battleVisualPool,
      worldIds: debug.worldCacheIds,
      residentLimits: debug.residentLimits,
      garageFramePacer: debug.garageFramePacer,
    },
    renderCount: window.__PHASE_RESOURCE_RENDER_COUNT || 0,
    heapMB: performance.memory
      ? +(performance.memory.usedJSHeapSize / 1_048_576).toFixed(1)
      : null,
  };
});

const measurePhase = async (name) => {
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) { /* optional */ }
  await sleep(500);
  const resourcesBefore = await sampleResources();
  const metricsBefore = await metricMap();
  const startedAt = performance.now();
  await sleep(seconds * 1000);
  const wallSeconds = (performance.now() - startedAt) / 1000;
  const metricsAfter = await metricMap();
  const resourcesAfter = await sampleResources();
  const taskSeconds = delta(metricsAfter, metricsBefore, 'TaskDuration');
  const scriptSeconds = delta(metricsAfter, metricsBefore, 'ScriptDuration');
  return {
    name,
    wallSeconds: +wallSeconds.toFixed(3),
    taskSeconds: +taskSeconds.toFixed(3),
    taskCoreEquivalent: +(taskSeconds / wallSeconds).toFixed(3),
    scriptSeconds: +scriptSeconds.toFixed(3),
    scriptCoreEquivalent: +(scriptSeconds / wallSeconds).toFixed(3),
    layoutCount: Math.round(delta(metricsAfter, metricsBefore, 'LayoutCount')),
    recalcStyleCount: Math.round(delta(metricsAfter, metricsBefore, 'RecalcStyleCount')),
    framesRendered: resourcesAfter.renderCount - resourcesBefore.renderCount,
    rendersPerSecond: +((resourcesAfter.renderCount - resourcesBefore.renderCount) /
      wallSeconds).toFixed(2),
    resources: resourcesAfter,
  };
};

const evaluateBudgets = (phases) => {
  const byName = new Map(phases.map((phase) => [phase.name, phase]));
  const idle = byName.get('garage-idle');
  const battle = byName.get('battle-active');
  const returned = byName.get('garage-returned');
  const checks = [];
  const check = (name, pass, actual, limit) => {
    checks.push({ name, pass: Boolean(pass), actual, limit });
  };

  check('garage idle render cadence', idle?.rendersPerSecond <= 3,
    idle?.rendersPerSecond ?? null, '<= 3 renders/s');
  check('garage idle CPU residency',
    idle?.taskCoreEquivalent <= RESOURCE_BUDGETS.garageIdle.taskCoreEquivalent,
    idle?.taskCoreEquivalent ?? null,
    `<= ${RESOURCE_BUDGETS.garageIdle.taskCoreEquivalent} core equivalent`);
  check('garage idle JavaScript heap',
    idle?.resources.heapMB <= RESOURCE_BUDGETS.garageIdle.heapMB,
    idle?.resources.heapMB ?? null, `<= ${RESOURCE_BUDGETS.garageIdle.heapMB} MB`);
  for (const resource of ['programs', 'geometries', 'textures']) {
    check(`garage idle renderer ${resource}`,
      idle?.resources.renderer[resource] <= RESOURCE_BUDGETS.garageIdle[resource],
      idle?.resources.renderer[resource] ?? null,
      `<= ${RESOURCE_BUDGETS.garageIdle[resource]}`);
  }
  for (const workload of ['calls', 'triangles']) {
    check(`garage idle complete-frame ${workload}`,
      idle?.resources.renderer[workload] <= RESOURCE_BUDGETS.garageIdle[workload],
      idle?.resources.renderer[workload] ?? null,
      `<= ${RESOURCE_BUDGETS.garageIdle[workload]}`);
  }
  check('garage constructs no battlefield without intent',
    (idle?.resources.caches.worldIds?.length || 0) === 0,
    idle?.resources.caches.worldIds || [], '0 resident worlds');
  check('desktop pedestal cache respects resident limit',
    (idle?.resources.caches.pedestalIds?.length || 0)
      <= (idle?.resources.caches.residentLimits?.pedestalVisuals ?? 0),
    idle?.resources.caches.pedestalIds?.length ?? null,
    idle?.resources.caches.residentLimits?.pedestalVisuals ?? null);
  check('active battle CPU residency',
    battle?.taskCoreEquivalent <= RESOURCE_BUDGETS.battleActive.taskCoreEquivalent,
    battle?.taskCoreEquivalent ?? null,
    `<= ${RESOURCE_BUDGETS.battleActive.taskCoreEquivalent} core equivalent`);
  check('active battle JavaScript heap',
    battle?.resources.heapMB <= RESOURCE_BUDGETS.battleActive.heapMB,
    battle?.resources.heapMB ?? null, `<= ${RESOURCE_BUDGETS.battleActive.heapMB} MB`);
  for (const resource of ['programs', 'geometries', 'textures']) {
    check(`active battle renderer ${resource}`,
      battle?.resources.renderer[resource] <= RESOURCE_BUDGETS.battleActive[resource],
      battle?.resources.renderer[resource] ?? null,
      `<= ${RESOURCE_BUDGETS.battleActive[resource]}`);
  }
  for (const workload of ['calls', 'triangles']) {
    check(`active battle complete-frame ${workload}`,
      battle?.resources.renderer[workload] <= RESOURCE_BUDGETS.battleActive[workload],
      battle?.resources.renderer[workload] ?? null,
      `<= ${RESOURCE_BUDGETS.battleActive[workload]}`);
  }
  check('returned Garage CPU residency',
    returned?.taskCoreEquivalent <= RESOURCE_BUDGETS.garageReturned.taskCoreEquivalent,
    returned?.taskCoreEquivalent ?? null,
    `<= ${RESOURCE_BUDGETS.garageReturned.taskCoreEquivalent} core equivalent`);
  check('returned Garage JavaScript heap',
    returned?.resources.heapMB <= RESOURCE_BUDGETS.garageReturned.heapMB,
    returned?.resources.heapMB ?? null,
    `<= ${RESOURCE_BUDGETS.garageReturned.heapMB} MB`);
  for (const resource of ['programs', 'geometries', 'textures']) {
    check(`returned Garage renderer ${resource}`,
      returned?.resources.renderer[resource] <= RESOURCE_BUDGETS.garageReturned[resource],
      returned?.resources.renderer[resource] ?? null,
      `<= ${RESOURCE_BUDGETS.garageReturned[resource]}`);
  }
  for (const workload of ['calls', 'triangles']) {
    check(`returned Garage complete-frame ${workload}`,
      returned?.resources.renderer[workload]
        <= RESOURCE_BUDGETS.garageReturned[workload],
      returned?.resources.renderer[workload] ?? null,
      `<= ${RESOURCE_BUDGETS.garageReturned[workload]}`);
  }
  check('returned Garage battle pool respects resident limit',
    (returned?.resources.caches.battleVisualPool?.size || 0)
      <= (returned?.resources.caches.battleVisualPool?.capacity ?? 0),
    returned?.resources.caches.battleVisualPool?.size ?? null,
    returned?.resources.caches.battleVisualPool?.capacity ?? null);
  check('world cache remains bounded after battle',
    (returned?.resources.caches.worldIds?.length || 0)
      <= (returned?.resources.caches.residentLimits?.worldScenes ?? 0),
    returned?.resources.caches.worldIds?.length ?? null,
    returned?.resources.caches.residentLimits?.worldScenes ?? null);

  return { pass: checks.every((entry) => entry.pass), checks };
};

const url = new URL(`http://127.0.0.1:${port}/`);
url.searchParams.set('tier', 'desktop');
url.searchParams.set('gfxreset', '1');
url.searchParams.set('nosplash', '1');
if (production && trace) url.searchParams.set('debug', '1');

let report;
try {
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 360_000 });
  await page.waitForFunction('window.__GAME_READY === true && window.__DEBUG?.renderer', {
    timeout: 360_000,
  });
  await page.evaluate(() => {
    const post = window.__DEBUG.post;
    const renderer = window.__DEBUG.renderer;
    const originalRender = post.render.bind(post);
    window.__PHASE_RESOURCE_RENDER_COUNT = 0;
    window.__PHASE_RESOURCE_LAST_RENDER = null;
    post.render = (...args) => {
      window.__PHASE_RESOURCE_RENDER_COUNT += 1;
      // EffectComposer normally resets renderer.info for each pass, leaving
      // diagnostics with only the final fullscreen triangle. Accumulate the
      // complete application frame in this probe-only wrapper so calls and
      // primitives include the scene, shadows, and every post-process pass.
      const previousAutoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      try {
        return originalRender(...args);
      } finally {
        const frame = renderer.info.render;
        window.__PHASE_RESOURCE_LAST_RENDER = {
          calls: frame.calls,
          triangles: frame.triangles,
          lines: frame.lines,
          points: frame.points,
        };
        renderer.info.autoReset = previousAutoReset;
      }
    };
  });

  await sleep(garageSettleSeconds * 1000);
  const garageIdle = await measurePhase('garage-idle');

  await page.evaluate(async () => {
    const debug = window.__DEBUG;
    await debug.beginSoloBattle({
      specId: debug.selectedSpecId,
      mapId: 'verdant',
      randomRoster: true,
    });
  });
  await page.waitForFunction(
    'window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0',
    { timeout: 180_000 },
  );
  await sleep(1000);
  const battleActive = await measurePhase('battle-active');

  await page.evaluate(() => window.__DEBUG.enterGarage());
  await page.waitForFunction('window.__DEBUG.game.phase === "garage"', {
    timeout: 30_000,
  });
  await sleep(3000);
  const garageReturned = await measurePhase('garage-returned');

  const phases = [garageIdle, battleActive, garageReturned];
  const budgets = evaluateBudgets(phases);
  report = {
    ok: pageErrors.length === 0 && (!gate || budgets.pass),
    production,
    trace,
    gate,
    viewport,
    seconds,
    garageSettleSeconds,
    phases,
    budgets,
    errors: pageErrors,
    consoleErrors,
    failedResponses,
  };
} finally {
  await browser.close();
  if (typeof server.close === 'function') await server.close();
  else await new Promise((resolveClose) => server.httpServer.close(resolveClose));
}

if (outputPath) writeFileSync(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
