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
// Pin one mixed modern 7v7 lineup so heap and renderer residency are directly
// comparable across commits. A random roster made geometry/program counts
// swing enough to hide real regressions behind vehicle-selection variance.
const RESOURCE_PLAYER = 'm1a1';
const RESOURCE_ROSTER = Object.freeze([
  'fv510_milan', 'bwp1', 'amx40', 'strv103a', 't80b', 't80bv', 'type90',
  'm60a2', 'type90a', 'm1a1ha', 'carro45t', 'ztz85_iii', 'm2a2_bradley',
]);

// Release ceilings around the measured production baseline. CPU limits retain
// host-noise margin; deterministic renderer/heap limits intentionally fail a
// meaningful residency or complete-frame workload regression.
const RESOURCE_BUDGETS = Object.freeze({
  garageIdle: Object.freeze({
    taskCoreEquivalent: 0.06,
    heapMB: 68,
    objects: 900,
    // Boot submits directly against the composer's linear-HDR target. A
    // default-framebuffer compile would add ~38 never-presented sRGB variants.
    // Fleet-layered ERA keeps its vehicle-space camouflage and two Abrams
    // workshop finish programs resident after the quiet repair-bay stream.
    // The measured settled ceiling is 63; retain one-program host/driver
    // variance without allowing another material family to slip in unnoticed.
    programs: 64,
    geometries: 300,
    // Two parked-vehicle BatchedMeshes replace twelve color submissions. Their
    // four tiny matrix/indirection DataTextures are renderer internals, not
    // visible content, so content residency is gated separately below.
    textures: 89,
    sceneGeometries: 450,
    sceneMaterials: 180,
    sceneTextures: 72,
    sceneTexturePixels: 12_000_000,
    calls: 525,
    triangles: 240_000,
  }),
  battleActive: Object.freeze({
    taskCoreEquivalent: 0.45,
    heapMB: 280,
    objects: 1150,
    programs: 205,
    // Phase-exclusive GPU suspension removes inactive workshop allocations;
    // keep these limits close enough to catch their accidental retention.
    geometries: 575,
    textures: 300,
    sceneGeometries: 650,
    sceneMaterials: 220,
    sceneTextures: 120,
    sceneTexturePixels: 27_000_000,
    // Dynamic explosions and decals move the exact sampled frame by several
    // submissions; 700 still fails a sustained scene-complexity regression.
    calls: 660,
    triangles: 3_750_000,
    shadowCalls: 235,
    shadowTriangles: 1_300_000,
  }),
  garageReturned: Object.freeze({
    taskCoreEquivalent: 0.06,
    heapMB: 205,
    objects: 1000,
    programs: 240,
    geometries: 510,
    textures: 166,
    sceneGeometries: 475,
    sceneMaterials: 200,
    sceneTextures: 82,
    sceneTexturePixels: 15_000_000,
    calls: 525,
    triangles: 240_000,
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
  const visibleMeshWork = [];
  const owners = new WeakMap();
  const markOwner = (root, owner) => root?.traverse?.((object) => owners.set(object, owner));
  markOwner(debug.world?.group, 'world');
  for (const [index, child] of (debug.world?.group?.children || []).entries()) {
    const label = child.name || child.type || `child-${index}`;
    markOwner(child, `world/${label}`);
  }
  markOwner(debug.fx?.group, 'effects');
  markOwner(debug.garageDressing?.group, 'garage/workshop');
  const vehicleRoots = new Set();
  for (const entity of debug.game?.tanks || []) {
    const root = entity?.visual?.root;
    if (!root || vehicleRoots.has(root)) continue;
    vehicleRoots.add(root);
    markOwner(root, entity.isPlayer
      ? 'vehicles/player'
      : `vehicles/${entity.team || 'other'}`);
  }
  const sceneBreakdown = {};
  const effectiveVisible = (object) => {
    for (let cursor = object; cursor; cursor = cursor.parent) {
      if (cursor.visible === false) return false;
    }
    return true;
  };
  const primitiveCount = (geometry) => {
    const available = geometry?.index?.count
      ?? geometry?.getAttribute?.('position')?.count
      ?? 0;
    const start = Math.max(0, geometry?.drawRange?.start || 0);
    const requested = geometry?.drawRange?.count;
    return Math.max(0, Math.min(
      available - start,
      Number.isFinite(requested) ? requested : available,
    ));
  };
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
      if (effectiveVisible(object)) {
        const owner = owners.get(object) || 'scene';
        const bucket = sceneBreakdown[owner] ||= {
          meshes: 0, drawGroups: 0, triangles: 0, shadowCasters: 0,
          shadowTriangles: 0, geometries: new Set(), materials: new Set(),
        };
        const instances = object.isInstancedMesh ? object.count : 1;
        const triangles = Math.floor(primitiveCount(object.geometry) / 3) * instances;
        const materialCount = Array.isArray(object.material)
          ? Math.max(1, object.geometry?.groups?.length || object.material.length)
          : 1;
        bucket.meshes += 1;
        bucket.drawGroups += materialCount;
        bucket.triangles += triangles;
        visibleMeshWork.push({
          owner,
          name: object.name || object.userData?.distanceRepresentation
            || object.geometry?.type || object.type,
          instances,
          triangles,
          castShadow: !!object.castShadow,
          shadowOnly: !!object.userData?.shadowOnly,
        });
        bucket.geometries.add(object.geometry);
        const ownedMaterials = Array.isArray(object.material)
          ? object.material : object.material ? [object.material] : [];
        ownedMaterials.forEach((material) => bucket.materials.add(material));
        if (object.castShadow) {
          bucket.shadowCasters += 1;
          bucket.shadowTriangles += triangles;
        }
      }
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
  for (const bucket of Object.values(sceneBreakdown)) {
    bucket.geometries = bucket.geometries.size;
    bucket.materials = bucket.materials.size;
  }
  visibleMeshWork.sort((a, b) => b.triangles - a.triangles);
  const textureSources = {};
  const textureWork = [];
  let sceneTexturePixels = 0;
  for (const texture of textures) {
    const image = texture.image || texture.source?.data;
    const images = Array.isArray(image) ? image : [image];
    let pixels = 0;
    let source = 'unknown';
    for (const entry of images) {
      if (!entry) continue;
      const width = entry.videoWidth || entry.naturalWidth || entry.width || 0;
      const height = entry.videoHeight || entry.naturalHeight || entry.height || 0;
      pixels += Math.max(0, width * height);
      source = entry.constructor?.name || source;
    }
    sceneTexturePixels += pixels;
    textureSources[source] = (textureSources[source] || 0) + 1;
    textureWork.push({
      name: texture.name || texture.source?.data?.name || texture.constructor?.name || 'texture',
      source,
      pixels,
      mipmapped: texture.generateMipmaps !== false,
    });
  }
  textureWork.sort((a, b) => b.pixels - a.pixels);
  const programUse = {};
  const singletonProgramNames = {};
  for (const program of renderer.info.programs || []) {
    const uses = String(program.usedTimes ?? 0);
    programUse[uses] = (programUse[uses] || 0) + 1;
    if ((program.usedTimes ?? 0) === 1) {
      const name = program.name || '(unnamed)';
      singletonProgramNames[name] = (singletonProgramNames[name] || 0) + 1;
    }
  }
  return {
    phase: debug.game.phase,
    roster: (debug.game?.tanks || []).map((entity) => ({
      specId: entity.specId,
      team: entity.team,
      isPlayer: !!entity.isPlayer,
      visual: !!entity.visual,
      textureQuality: entity.visual?.root?.userData?.textureQuality || null,
      geometryQuality: entity.visual?.root?.userData?.geometryQuality || null,
    })),
    objects,
    visibleObjects,
    meshes,
    visibleMeshes,
    sceneGeometries: geometries.size,
    sceneMaterials: materials.size,
    sceneTextures: textures.size,
    sceneTexturePixels,
    textureSources,
    topSceneTextures: textureWork.slice(0, 20),
    sceneBreakdown,
    topVisibleMeshes: visibleMeshWork.slice(0, 24),
    renderer: {
      calls: completeFrame.calls,
      triangles: completeFrame.triangles,
      lines: completeFrame.lines,
      points: completeFrame.points,
      programs: (renderer.info.programs || []).length,
      programUse,
      singletonProgramNames,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    },
    caches: {
      pedestalIds: debug.pedestalCacheIds,
      battleVisualPool: debug.battleVisualPool,
      worldIds: debug.worldCacheIds,
      residentLimits: debug.residentLimits,
      garageFramePacer: debug.garageFramePacer,
      frameLoopScheduler: debug.frameLoopScheduler,
      phaseSceneResidency: debug.phaseSceneResidency,
      garageGpuResidency: debug.garageGpuResidency,
      workshopOptimization:
        debug.garageDressing?.group?.userData?.optimizationReceipt || null,
      terrainIndexPool:
        debug.world?._buildDetail?.terrain?.indexPool || null,
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
  await page.evaluate(() => { window.__PHASE_RESOURCE_FRAMES = []; });
  const resourcesBefore = await sampleResources();
  const metricsBefore = await metricMap();
  const startedAt = performance.now();
  await sleep(seconds * 1000);
  const wallSeconds = (performance.now() - startedAt) / 1000;
  const metricsAfter = await metricMap();
  const resourcesAfter = await sampleResources();
  const frameWorkload = await page.evaluate(() => {
    const frames = window.__PHASE_RESOURCE_FRAMES || [];
    const summarize = (values) => {
      if (!values.length) return { min: 0, median: 0, max: 0, mean: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      return {
        min: sorted[0],
        median: sorted[Math.floor(sorted.length / 2)],
        max: sorted[sorted.length - 1],
        mean: +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
      };
    };
    const masks = {};
    for (const frame of frames) {
      const key = String(frame.shadowMask ?? 0);
      const bucket = masks[key] ||= { samples: 0, calls: [], triangles: [], shadowCalls: [], shadowTriangles: [] };
      bucket.samples += 1;
      bucket.calls.push(frame.calls);
      bucket.triangles.push(frame.triangles);
      bucket.shadowCalls.push(frame.shadowCalls);
      bucket.shadowTriangles.push(frame.shadowTriangles);
    }
    for (const [key, bucket] of Object.entries(masks)) {
      masks[key] = {
        samples: bucket.samples,
        calls: summarize(bucket.calls),
        triangles: summarize(bucket.triangles),
        shadowCalls: summarize(bucket.shadowCalls),
        shadowTriangles: summarize(bucket.shadowTriangles),
      };
    }
    return {
      samples: frames.length,
      calls: summarize(frames.map((frame) => frame.calls)),
      triangles: summarize(frames.map((frame) => frame.triangles)),
      shadowCalls: summarize(frames.map((frame) => frame.shadowCalls)),
      shadowTriangles: summarize(frames.map((frame) => frame.shadowTriangles)),
      byShadowMask: masks,
    };
  });
  const taskSeconds = delta(metricsAfter, metricsBefore, 'TaskDuration');
  const scriptSeconds = delta(metricsAfter, metricsBefore, 'ScriptDuration');
  const frameLoopBefore = resourcesBefore.caches.frameLoopScheduler || {};
  const frameLoopAfter = resourcesAfter.caches.frameLoopScheduler || {};
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
    frameLoopTicks: {
      animation: Math.max(0,
        (frameLoopAfter.animationTicks || 0) - (frameLoopBefore.animationTicks || 0)),
      idle: Math.max(0,
        (frameLoopAfter.idleTicks || 0) - (frameLoopBefore.idleTicks || 0)),
      inputWakeups: Math.max(0,
        (frameLoopAfter.inputWakeups || 0) - (frameLoopBefore.inputWakeups || 0)),
    },
    frameWorkload,
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

  check('garage idle render cadence', idle?.rendersPerSecond <= 0.3,
    idle?.rendersPerSecond ?? null, '<= 0.3 renders/s');
  check('garage idle animation clock sleeps',
    (idle?.frameLoopTicks?.animation || 0) / (idle?.wallSeconds || 1) <= 0.3,
    +((idle?.frameLoopTicks?.animation || 0) / (idle?.wallSeconds || 1)).toFixed(2),
    '<= 0.3 animation ticks/s');
  check('garage idle shadow submissions sleep',
    (idle?.frameWorkload?.shadowCalls?.max || 0) === 0,
    idle?.frameWorkload?.shadowCalls?.max ?? null, '0 shadow calls');
  check('garage idle CPU residency',
    idle?.taskCoreEquivalent <= RESOURCE_BUDGETS.garageIdle.taskCoreEquivalent,
    idle?.taskCoreEquivalent ?? null,
    `<= ${RESOURCE_BUDGETS.garageIdle.taskCoreEquivalent} core equivalent`);
  check('garage idle JavaScript heap',
    idle?.resources.heapMB <= RESOURCE_BUDGETS.garageIdle.heapMB,
    idle?.resources.heapMB ?? null, `<= ${RESOURCE_BUDGETS.garageIdle.heapMB} MB`);
  check('garage idle scene objects',
    idle?.resources.objects <= RESOURCE_BUDGETS.garageIdle.objects,
    idle?.resources.objects ?? null, `<= ${RESOURCE_BUDGETS.garageIdle.objects}`);
  for (const resource of ['programs', 'geometries', 'textures']) {
    check(`garage idle renderer ${resource}`,
      idle?.resources.renderer[resource] <= RESOURCE_BUDGETS.garageIdle[resource],
      idle?.resources.renderer[resource] ?? null,
      `<= ${RESOURCE_BUDGETS.garageIdle[resource]}`);
  }
  for (const resource of ['sceneGeometries', 'sceneMaterials', 'sceneTextures',
    'sceneTexturePixels']) {
    check(`garage idle visible ${resource}`,
      idle?.resources[resource] <= RESOURCE_BUDGETS.garageIdle[resource],
      idle?.resources[resource] ?? null,
      `<= ${RESOURCE_BUDGETS.garageIdle[resource]}`);
  }
  for (const workload of ['calls', 'triangles']) {
    check(`garage idle complete-frame ${workload}`,
      idle?.resources.renderer[workload] <= RESOURCE_BUDGETS.garageIdle[workload],
      idle?.resources.renderer[workload] ?? null,
      `<= ${RESOURCE_BUDGETS.garageIdle[workload]}`);
  }
  check('active battle refreshes distant shadow cascades coherently',
    Object.keys(battle?.frameWorkload?.byShadowMask || {}).length === 2
      && battle?.frameWorkload?.byShadowMask?.['3']
      && battle?.frameWorkload?.byShadowMask?.['12']
      && !battle?.frameWorkload?.byShadowMask?.['7']
      && !battle?.frameWorkload?.byShadowMask?.['11']
      && !battle?.frameWorkload?.byShadowMask?.['15'],
    Object.keys(battle?.frameWorkload?.byShadowMask || {}),
    'mutually exclusive near mask 3 and atomic far-cohort mask 12');
  for (const workload of ['shadowCalls', 'shadowTriangles']) {
    check(`active battle complete-frame ${workload}`,
      battle?.frameWorkload?.[workload]?.max
        <= RESOURCE_BUDGETS.battleActive[workload],
      battle?.frameWorkload?.[workload]?.max ?? null,
      `<= ${RESOURCE_BUDGETS.battleActive[workload]}`);
  }
  check('garage constructs no battlefield without intent',
    (idle?.resources.caches.worldIds?.length || 0) === 0,
    idle?.resources.caches.worldIds || [], '0 resident worlds');
  check('desktop pedestal cache respects resident limit',
    (idle?.resources.caches.pedestalIds?.length || 0)
      <= (idle?.resources.caches.residentLimits?.pedestalVisuals ?? 0),
    idle?.resources.caches.pedestalIds?.length ?? null,
    idle?.resources.caches.residentLimits?.pedestalVisuals ?? null);
  check('static workshop shadows are resolution-budgeted',
    (idle?.resources.caches.workshopOptimization?.shadowCastersPruned || 0) > 0,
    idle?.resources.caches.workshopOptimization || null,
    'authored proxy-safe pruning receipt');
  check('static workshop props are submission-batched',
    (idle?.resources.caches.workshopOptimization?.drawCallsRemoved || 0) >= 175
      && (idle?.resources.caches.workshopOptimization?.sourceGeometriesReleased || 0) >= 90,
    idle?.resources.caches.workshopOptimization || null,
    '>= 175 exact static draws and >= 90 source geometries removed');
  check('active battle CPU residency',
    battle?.taskCoreEquivalent <= RESOURCE_BUDGETS.battleActive.taskCoreEquivalent,
    battle?.taskCoreEquivalent ?? null,
    `<= ${RESOURCE_BUDGETS.battleActive.taskCoreEquivalent} core equivalent`);
  check('active battle JavaScript heap',
    battle?.resources.heapMB <= RESOURCE_BUDGETS.battleActive.heapMB,
    battle?.resources.heapMB ?? null, `<= ${RESOURCE_BUDGETS.battleActive.heapMB} MB`);
  check('active battle scene objects',
    battle?.resources.objects <= RESOURCE_BUDGETS.battleActive.objects,
    battle?.resources.objects ?? null, `<= ${RESOURCE_BUDGETS.battleActive.objects}`);
  check('active battle resource roster is pinned and complete',
    battle?.resources.roster?.length === 14
      && battle.resources.roster.every((entity) => entity.visual),
    battle?.resources.roster || null,
    '14 visualized actors in the pinned production roster');
  check('active battle detaches Garage roots',
    battle?.resources.caches.phaseSceneResidency?.garageMounted === false
      && battle?.resources.caches.phaseSceneResidency?.worldMounted === true,
    battle?.resources.caches.phaseSceneResidency || null,
    'Garage detached; world mounted');
  check('active battle releases hidden workshop GPU residency',
    battle?.resources.caches.garageGpuResidency?.suspended === true
      && (battle?.resources.caches.garageGpuResidency?.lastRelease?.geometries || 0) >= 200
      && (battle?.resources.caches.garageGpuResidency?.lastRelease?.textures || 0) >= 20,
    battle?.resources.caches.garageGpuResidency || null,
    'suspended with >= 200 geometries and >= 20 textures released');
  for (const resource of ['programs', 'geometries', 'textures']) {
    check(`active battle renderer ${resource}`,
      battle?.resources.renderer[resource] <= RESOURCE_BUDGETS.battleActive[resource],
      battle?.resources.renderer[resource] ?? null,
      `<= ${RESOURCE_BUDGETS.battleActive[resource]}`);
  }
  const terrainIndexPool = battle?.resources?.caches?.terrainIndexPool;
  check('active battlefield shares exact terrain topology',
    terrainIndexPool?.attributes <= 3
      && terrainIndexPool?.references >= 64
      && terrainIndexPool?.totalBytesAvoided >= 7_500_000,
    terrainIndexPool ?? null,
    '<= 3 index buffers, >= 64 references, >= 7.5 MB legacy index storage avoided');
  for (const resource of ['sceneGeometries', 'sceneMaterials', 'sceneTextures',
    'sceneTexturePixels']) {
    check(`active battle visible ${resource}`,
      battle?.resources[resource] <= RESOURCE_BUDGETS.battleActive[resource],
      battle?.resources[resource] ?? null,
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
  check('returned Garage animation clock sleeps',
    (returned?.frameLoopTicks?.animation || 0) / (returned?.wallSeconds || 1) <= 0.3,
    +((returned?.frameLoopTicks?.animation || 0) /
      (returned?.wallSeconds || 1)).toFixed(2),
    '<= 0.3 animation ticks/s');
  check('returned Garage shadow submissions sleep',
    (returned?.frameWorkload?.shadowCalls?.max || 0) === 0,
    returned?.frameWorkload?.shadowCalls?.max ?? null, '0 shadow calls');
  check('returned Garage JavaScript heap',
    returned?.resources.heapMB <= RESOURCE_BUDGETS.garageReturned.heapMB,
    returned?.resources.heapMB ?? null,
    `<= ${RESOURCE_BUDGETS.garageReturned.heapMB} MB`);
  check('returned Garage scene objects',
    returned?.resources.objects <= RESOURCE_BUDGETS.garageReturned.objects,
    returned?.resources.objects ?? null, `<= ${RESOURCE_BUDGETS.garageReturned.objects}`);
  check('returned Garage detaches battlefield root',
    returned?.resources.caches.phaseSceneResidency?.garageMounted === true
      && returned?.resources.caches.phaseSceneResidency?.worldMounted === false,
    returned?.resources.caches.phaseSceneResidency || null,
    'Garage mounted; world detached');
  check('returned Garage restores retained workshop GPU resources',
    returned?.resources.caches.garageGpuResidency?.suspended === false
      && (returned?.resources.caches.garageGpuResidency?.resumes || 0) >= 1,
    returned?.resources.caches.garageGpuResidency || null,
    'workshop resumed once behind the return transition');
  for (const resource of ['programs', 'geometries', 'textures']) {
    check(`returned Garage renderer ${resource}`,
      returned?.resources.renderer[resource] <= RESOURCE_BUDGETS.garageReturned[resource],
      returned?.resources.renderer[resource] ?? null,
      `<= ${RESOURCE_BUDGETS.garageReturned[resource]}`);
  }
  for (const resource of ['sceneGeometries', 'sceneMaterials', 'sceneTextures',
    'sceneTexturePixels']) {
    check(`returned Garage visible ${resource}`,
      returned?.resources[resource] <= RESOURCE_BUDGETS.garageReturned[resource],
      returned?.resources[resource] ?? null,
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
    const originalShadowRender = renderer.shadowMap.render.bind(renderer.shadowMap);
    window.__PHASE_RESOURCE_RENDER_COUNT = 0;
    window.__PHASE_RESOURCE_LAST_RENDER = null;
    window.__PHASE_RESOURCE_FRAMES = [];
    let measuringFrame = null;
    renderer.shadowMap.render = (...args) => {
      const before = renderer.info.render;
      const calls = before.calls;
      const triangles = before.triangles;
      const result = originalShadowRender(...args);
      if (measuringFrame) {
        measuringFrame.shadowCalls += renderer.info.render.calls - calls;
        measuringFrame.shadowTriangles += renderer.info.render.triangles - triangles;
      }
      return result;
    };
    post.render = (...args) => {
      window.__PHASE_RESOURCE_RENDER_COUNT += 1;
      // EffectComposer normally resets renderer.info for each pass, leaving
      // diagnostics with only the final fullscreen triangle. Accumulate the
      // complete application frame in this probe-only wrapper so calls and
      // primitives include the scene, shadows, and every post-process pass.
      const previousAutoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      measuringFrame = { shadowCalls: 0, shadowTriangles: 0 };
      try {
        return originalRender(...args);
      } finally {
        const frame = renderer.info.render;
        const receipt = {
          calls: frame.calls,
          triangles: frame.triangles,
          lines: frame.lines,
          points: frame.points,
          shadowCalls: measuringFrame.shadowCalls,
          shadowTriangles: measuringFrame.shadowTriangles,
          shadowMask: window.__DEBUG.lighting?.scheduledMask ?? 0,
        };
        window.__PHASE_RESOURCE_LAST_RENDER = receipt;
        const history = window.__PHASE_RESOURCE_FRAMES;
        history.push(receipt);
        if (history.length > 2400) history.splice(0, history.length - 2400);
        measuringFrame = null;
        renderer.info.autoReset = previousAutoReset;
      }
    };
  });

  await sleep(garageSettleSeconds * 1000);
  const garageIdle = await measurePhase('garage-idle');

  await page.evaluate(async ({ player, roster }) => {
    const debug = window.__DEBUG;
    debug.flags.forceRoster = roster;
    await debug.beginSoloBattle({
      specId: player,
      mapId: 'verdant',
      randomRoster: true,
    });
  }, { player: RESOURCE_PLAYER, roster: RESOURCE_ROSTER });
  await page.waitForFunction(
    'window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0',
    { timeout: 180_000 },
  );
  await page.waitForFunction(
    'window.__DEBUG.game.tanks.every((entity) => entity.visual)',
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
