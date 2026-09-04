// Phase-level CPU, heap and Three.js residency probe.
//
// Usage:
//   node tools/phase-resource-probe.mjs [--production] [--seconds 8]
//     [--garage-settle 16] [--gate] [--out /tmp/cot-phase-resources.json]
//     [--cpu-profile-out /tmp/cot-battle.cpuprofile]
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
const cpuProfilePath = option('cpu-profile-out', '');
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
    // The current first-party workshop settles at ~78.5 MB after forced GC.
    // Preserve a small diagnostic margin without letting heap growth hide
    // behind the much larger browser process footprint.
    heapMB: 82,
    objects: 900,
    // Boot submits directly against the composer's linear-HDR target. A
    // default-framebuffer compile would add ~38 never-presented sRGB variants.
    // The complete four-vehicle first-party workshop now includes the current
    // T-90, Abrams and K2 material vocabularies. The settled production graph
    // is exactly 95 programs; one slot catches a new shader family while
    // allowing driver bookkeeping variance.
    programs: 96,
    geometries: 300,
    // Two parked-vehicle BatchedMeshes replace twelve color submissions. Their
    // four tiny matrix/indirection DataTextures are renderer internals, not
    // visible content, so content residency is gated separately below.
    textures: 95,
    sceneGeometries: 450,
    sceneMaterials: 200,
    sceneTextures: 82,
    sceneTexturePixels: 12_000_000,
    calls: 525,
    triangles: 240_000,
  }),
  battleActive: Object.freeze({
    // Gate per-presented-frame main-thread cost. Absolute core residency
    // scales with the headless compositor's achieved 30/60 Hz cadence and made
    // identical code alternate between pass and fail on the same host.
    taskMsPerRender: 11.5,
    // The pinned 14-vehicle roster settles at ~300-310 MB after forced GC on
    // current V8 builds. These ceilings retain roughly one vehicle's margin.
    heapMB: 315,
    objects: 1150,
    programs: 230,
    // Desktop intentionally retains the detached Garage's immutable GPU
    // allocations so return-to-Garage never has to re-upload the workshop.
    // Keep aggregate renderer ceilings close enough to catch real growth.
    // The pinned scene owns 668 visible geometries; the renderer necessarily
    // retains those plus its tiny warm-only probe set. Keep the aggregate cap
    // aligned with the stricter visible-scene ceiling below.
    geometries: 680,
    // Stable full-warm baseline is 312, including render targets and the
    // detached desktop Garage cache. Visible/effect textures remain governed
    // independently below, so four slots here cover driver bookkeeping only.
    textures: 316,
    sceneGeometries: 680,
    sceneMaterials: 220,
    // The active graph owns 122 distinct material/uniform textures: the
    // composer depth attachment and ten shared FX textures account for the
    // small increase over the former 120-texture roster baseline. Keep two
    // slots of driver/content variance while gating the FX owner separately.
    sceneTextures: 124,
    effectTextures: 10,
    sceneTexturePixels: 27_000_000,
    // Every active cascade now shares the same presented-frame timestamp.
    // Keep these ceilings tight around the coherent all-cascade workload
    // rather than the lower but visibly flashing staggered scheduler.
    calls: 780,
    triangles: 4_800_000,
    shadowCalls: 360,
    shadowTriangles: 2_250_000,
  }),
  garageReturned: Object.freeze({
    taskCoreEquivalent: 0.06,
    heapMB: 225,
    objects: 1000,
    programs: 256,
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
  const textureOwners = new Map();
  let objects = 0;
  let visibleObjects = 0;
  let meshes = 0;
  let visibleMeshes = 0;
  const visibleMeshWork = [];
  const owners = new WeakMap();
  const markOwner = (root, owner) => root?.traverse?.((object) => owners.set(object, owner));
  const registerOwners = () => {
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
      const role = entity.isPlayer ? 'player' : (entity.team || 'other');
      markOwner(root, `vehicles/${role}/${entity.specId || 'unknown'}`);
    }
  };
  registerOwners();
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
  const collectTexture = (value, owner) => {
    if (!value?.isTexture) return;
    textures.add(value);
    const ownedBy = textureOwners.get(value) || new Set();
    ownedBy.add(owner);
    textureOwners.set(value, ownedBy);
  };
  const collectVisibleMesh = (object) => {
    if (!object.isMesh) return;
    meshes += 1;
    if (object.visible) visibleMeshes += 1;
    if (!effectiveVisible(object)) return;
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
  };
  const collectObjectMaterials = (object) => {
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    const textureOwner = owners.get(object) || 'scene';
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) collectTexture(value, textureOwner);
      for (const uniform of Object.values(material.uniforms || {})) {
        const value = uniform?.value;
        if (Array.isArray(value)) {
          for (const entry of value) collectTexture(entry, textureOwner);
        } else collectTexture(value, textureOwner);
      }
    }
  };
  const collectSceneObject = (object) => {
    objects += 1;
    if (object.visible) visibleObjects += 1;
    if (object.geometry) geometries.add(object.geometry);
    collectVisibleMesh(object);
    collectObjectMaterials(object);
  };
  debug.scene.traverse(collectSceneObject);
  const finalizeSceneBreakdown = () => {
    for (const bucket of Object.values(sceneBreakdown)) {
      bucket.geometries = bucket.geometries.size;
      bucket.materials = bucket.materials.size;
    }
    visibleMeshWork.sort((a, b) => b.triangles - a.triangles);
  };
  finalizeSceneBreakdown();
  const summarizeTextures = () => {
    const textureSources = {};
    const textureOwnerCounts = {};
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
      const ownedBy = [...(textureOwners.get(texture) || [])].sort();
      for (const owner of ownedBy) {
        textureOwnerCounts[owner] = (textureOwnerCounts[owner] || 0) + 1;
      }
      textureWork.push({
        name: texture.name || texture.source?.data?.name || texture.constructor?.name || 'texture',
        owners: ownedBy,
        source,
        pixels,
        mipmapped: texture.generateMipmaps !== false,
      });
    }
    textureWork.sort((a, b) => b.pixels - a.pixels);
    return { sceneTexturePixels, textureSources, textureOwnerCounts, textureWork };
  };
  const summarizePrograms = () => {
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
    return { programUse, singletonProgramNames };
  };
  const textureSummary = summarizeTextures();
  const programSummary = summarizePrograms();
  return {
    phase: debug.game.phase,
    roster: (debug.game?.tanks || []).map((entity) => ({
      specId: entity.specId,
      team: entity.team,
      isPlayer: !!entity.isPlayer,
      visual: !!entity.visual,
      textureQuality: entity.visual?.root?.userData?.textureQuality || null,
      geometryQuality: entity.visual?.root?.userData?.geometryQuality || null,
      staticBatchSavedDraws: entity.visual?.root?.userData?.staticBatchSavedDraws || 0,
      battleDetailGroups: entity.visual?.root?.userData?.battleDetailGroupCount || 0,
      battleDetailObjects: entity.visual?.root?.userData?.battleDetailObjectCount || 0,
    })),
    objects,
    visibleObjects,
    meshes,
    visibleMeshes,
    sceneGeometries: geometries.size,
    sceneMaterials: materials.size,
    sceneTextures: textures.size,
    sceneTexturePixels: textureSummary.sceneTexturePixels,
    textureSources: textureSummary.textureSources,
    textureOwnerCounts: textureSummary.textureOwnerCounts,
    topSceneTextures: textureSummary.textureWork.slice(0, 20),
    sceneBreakdown,
    topVisibleMeshes: visibleMeshWork.slice(0, 24),
    renderer: {
      calls: completeFrame.calls,
      triangles: completeFrame.triangles,
      lines: completeFrame.lines,
      points: completeFrame.points,
      programs: (renderer.info.programs || []).length,
      programUse: programSummary.programUse,
      singletonProgramNames: programSummary.singletonProgramNames,
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
  const framesRendered = Math.max(
    0, resourcesAfter.renderCount - resourcesBefore.renderCount);
  const frameLoopBefore = resourcesBefore.caches.frameLoopScheduler || {};
  const frameLoopAfter = resourcesAfter.caches.frameLoopScheduler || {};
  return {
    name,
    wallSeconds: +wallSeconds.toFixed(3),
    taskSeconds: +taskSeconds.toFixed(3),
    taskCoreEquivalent: +(taskSeconds / wallSeconds).toFixed(3),
    scriptSeconds: +scriptSeconds.toFixed(3),
    scriptCoreEquivalent: +(scriptSeconds / wallSeconds).toFixed(3),
    taskMsPerRender: framesRendered > 0
      ? +((taskSeconds * 1000) / framesRendered).toFixed(3)
      : null,
    scriptMsPerRender: framesRendered > 0
      ? +((scriptSeconds * 1000) / framesRendered).toFixed(3)
      : null,
    layoutCount: Math.round(delta(metricsAfter, metricsBefore, 'LayoutCount')),
    recalcStyleCount: Math.round(delta(metricsAfter, metricsBefore, 'RecalcStyleCount')),
    framesRendered,
    rendersPerSecond: +((framesRendered / wallSeconds).toFixed(2)),
    frameLoopTicks: {
      animation: Math.max(0,
        (frameLoopAfter.animationTicks || 0) - (frameLoopBefore.animationTicks || 0)),
      idle: Math.max(0,
        (frameLoopAfter.idleTicks || 0) - (frameLoopBefore.idleTicks || 0)),
      inputWakeups: Math.max(0,
        (frameLoopAfter.inputWakeups || 0) - (frameLoopBefore.inputWakeups || 0)),
      frameRateLimitedCallbacks: Math.max(0,
        (frameLoopAfter.frameRateLimitedCallbacks || 0)
          - (frameLoopBefore.frameRateLimitedCallbacks || 0)),
      backgroundSuspensions: Math.max(0,
        (frameLoopAfter.backgroundSuspensions || 0)
          - (frameLoopBefore.backgroundSuspensions || 0)),
    },
    frameWorkload,
    resources: resourcesAfter,
  };
};

const checkResourceLimits = (check, label, source, budget, resources) => {
  for (const resource of resources) {
    check(`${label} ${resource}`, source?.[resource] <= budget[resource],
      source?.[resource] ?? null, `<= ${budget[resource]}`);
  }
};

const checkGarageIdleActivity = (check, idle) => {
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
  checkResourceLimits(check, 'garage idle renderer', idle?.resources.renderer,
    RESOURCE_BUDGETS.garageIdle, ['programs', 'geometries', 'textures']);
  checkResourceLimits(check, 'garage idle visible', idle?.resources,
    RESOURCE_BUDGETS.garageIdle,
    ['sceneGeometries', 'sceneMaterials', 'sceneTextures', 'sceneTexturePixels']);
  checkResourceLimits(check, 'garage idle complete-frame', idle?.resources.renderer,
    RESOURCE_BUDGETS.garageIdle, ['calls', 'triangles']);
};

const checkGarageIdleResidency = (check, idle, returned) => {
  check('garage constructs no battlefield without intent',
    (idle?.resources.caches.worldIds?.length || 0) === 0,
    idle?.resources.caches.worldIds || [], '0 resident worlds');
  check('desktop pedestal cache respects resident limit',
    (idle?.resources.caches.pedestalIds?.length || 0)
      <= (idle?.resources.caches.residentLimits?.pedestalVisuals ?? 0),
    idle?.resources.caches.pedestalIds?.length ?? null,
    idle?.resources.caches.residentLimits?.pedestalVisuals ?? null);
  const idleWorkshop = idle?.resources.caches.workshopOptimization;
  const returnedWorkshop = returned?.resources.caches.workshopOptimization;
  check('visible Garage workshop optimization is effective',
    idleWorkshop?.drawCallsRemoved > 0 && idleWorkshop?.sourceGeometriesReleased > 0,
    idleWorkshop || null,
    'one effective optimization receipt for the visible workshop');
  check('Garage workshop optimization remains stable across the battle lifecycle',
    returnedWorkshop?.objectsFrozen === idleWorkshop?.objectsFrozen &&
      returnedWorkshop?.drawCallsRemoved === idleWorkshop?.drawCallsRemoved &&
      returnedWorkshop?.sourceGeometriesReleased === idleWorkshop?.sourceGeometriesReleased,
    {
      idle: idleWorkshop || null,
      returned: returnedWorkshop || null,
    },
    'no repeated optimization or receipt drift while the Garage is detached');
};

const checkGarageIdleBudgets = (check, idle, returned) => {
  checkGarageIdleActivity(check, idle);
  checkGarageIdleResidency(check, idle, returned);
};

const checkBattleFrameBudgets = (check, battle) => {
  const battleShadowMasks = Object.keys(battle?.frameWorkload?.byShadowMask || {});
  check('active battle refreshes every shadow cascade coherently',
    battleShadowMasks.length === 1
      && Boolean(battle?.frameWorkload?.byShadowMask?.['15']),
    battleShadowMasks,
    'all-cascade mask 15 on every presented battle frame');
  for (const workload of ['shadowCalls', 'shadowTriangles']) {
    check(`active battle complete-frame ${workload}`,
      battle?.frameWorkload?.[workload]?.max
        <= RESOURCE_BUDGETS.battleActive[workload],
      battle?.frameWorkload?.[workload]?.max ?? null,
      `<= ${RESOURCE_BUDGETS.battleActive[workload]}`);
  }
  check('active battle main-thread cost per rendered frame',
    battle?.taskMsPerRender <= RESOURCE_BUDGETS.battleActive.taskMsPerRender,
    battle?.taskMsPerRender ?? null,
    `<= ${RESOURCE_BUDGETS.battleActive.taskMsPerRender} ms/render`);
  check('active battle presentation clock is bounded',
    (battle?.frameLoopTicks?.animation || 0) / (battle?.wallSeconds || 1) <= 61,
    +((battle?.frameLoopTicks?.animation || 0) /
      (battle?.wallSeconds || 1)).toFixed(2),
    '<= 61 animation ticks/s');
  check('active battle JavaScript heap',
    battle?.resources.heapMB <= RESOURCE_BUDGETS.battleActive.heapMB,
    battle?.resources.heapMB ?? null, `<= ${RESOURCE_BUDGETS.battleActive.heapMB} MB`);
  check('active battle scene objects',
    battle?.resources.objects <= RESOURCE_BUDGETS.battleActive.objects,
    battle?.resources.objects ?? null, `<= ${RESOURCE_BUDGETS.battleActive.objects}`);
};

const checkBattleResidencyBudgets = (check, battle) => {
  check('active battle resource roster is pinned and complete',
    battle?.resources.roster?.length === 14
      && battle.resources.roster.every((entity) => entity.visual),
    battle?.resources.roster || null,
    '14 visualized actors in the pinned production roster');
  check('active battle shared effect texture residency is bounded',
    (battle?.resources.textureOwnerCounts?.effects || 0)
      <= RESOURCE_BUDGETS.battleActive.effectTextures,
    battle?.resources.textureOwnerCounts?.effects ?? null,
    `<= ${RESOURCE_BUDGETS.battleActive.effectTextures} textures`);
  check('active battle detaches Garage roots',
    battle?.resources.caches.phaseSceneResidency?.garageMounted === false
      && battle?.resources.caches.phaseSceneResidency?.worldMounted === true,
    battle?.resources.caches.phaseSceneResidency || null,
    'Garage detached; world mounted');
  check('active battle retains detached desktop Garage GPU residency',
    battle?.resources.caches.garageGpuResidency?.suspended === false
      && (battle?.resources.caches.garageGpuResidency?.releases || 0) === 0,
    battle?.resources.caches.garageGpuResidency || null,
    'detached but resident, with no release/re-upload cycle');
  checkResourceLimits(check, 'active battle renderer', battle?.resources.renderer,
    RESOURCE_BUDGETS.battleActive, ['programs', 'geometries', 'textures']);
  const terrainIndexPool = battle?.resources?.caches?.terrainIndexPool;
  check('active battlefield shares exact terrain topology',
    terrainIndexPool?.attributes <= 3
      && terrainIndexPool?.references >= 64
      && terrainIndexPool?.totalBytesAvoided >= 7_500_000,
    terrainIndexPool ?? null,
    '<= 3 index buffers, >= 64 references, >= 7.5 MB legacy index storage avoided');
};

const checkBattleBudgets = (check, battle) => {
  checkBattleFrameBudgets(check, battle);
  checkBattleResidencyBudgets(check, battle);
  checkResourceLimits(check, 'active battle visible', battle?.resources,
    RESOURCE_BUDGETS.battleActive,
    ['sceneGeometries', 'sceneMaterials', 'sceneTextures', 'sceneTexturePixels']);
  for (const workload of ['calls', 'triangles']) {
    check(`active battle complete-frame ${workload}`,
      battle?.frameWorkload?.[workload]?.max <= RESOURCE_BUDGETS.battleActive[workload],
      battle?.frameWorkload?.[workload]?.max ?? null,
      `<= ${RESOURCE_BUDGETS.battleActive[workload]}`);
  }
};

const checkReturnedGarageActivity = (check, returned) => {
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
};

const checkReturnedGarageResidency = (check, returned) => {
  check('returned Garage detaches battlefield root',
    returned?.resources.caches.phaseSceneResidency?.garageMounted === true
      && returned?.resources.caches.phaseSceneResidency?.worldMounted === false,
    returned?.resources.caches.phaseSceneResidency || null,
    'Garage mounted; world detached');
  check('returned Garage detaches battle-only effects',
    !returned?.resources.sceneBreakdown?.effects,
    returned?.resources.sceneBreakdown?.effects || null,
    'no attached effects scene or pooled battle GPU graph');
  check('returned Garage reuses retained desktop scene-pack GPU resources',
    returned?.resources.caches.garageGpuResidency?.suspended === false
      && (returned?.resources.caches.garageGpuResidency?.resumes || 0) === 0,
    returned?.resources.caches.garageGpuResidency || null,
    'scene pack remains resident without a restore upload');
  checkResourceLimits(check, 'returned Garage renderer', returned?.resources.renderer,
    RESOURCE_BUDGETS.garageReturned, ['programs', 'geometries', 'textures']);
  checkResourceLimits(check, 'returned Garage visible', returned?.resources,
    RESOURCE_BUDGETS.garageReturned,
    ['sceneGeometries', 'sceneMaterials', 'sceneTextures', 'sceneTexturePixels']);
  checkResourceLimits(check, 'returned Garage complete-frame', returned?.resources.renderer,
    RESOURCE_BUDGETS.garageReturned, ['calls', 'triangles']);
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
};

const checkReturnedGarageBudgets = (check, returned) => {
  checkReturnedGarageActivity(check, returned);
  checkReturnedGarageResidency(check, returned);
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

  checkGarageIdleBudgets(check, idle, returned);
  checkBattleBudgets(check, battle);
  checkReturnedGarageBudgets(check, returned);

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
  if (cpuProfilePath) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  }
  const battleActive = await measurePhase('battle-active');
  if (cpuProfilePath) {
    const { profile } = await cdp.send('Profiler.stop');
    writeFileSync(resolve(cpuProfilePath), `${JSON.stringify(profile)}\n`);
    await cdp.send('Profiler.disable');
  }

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
