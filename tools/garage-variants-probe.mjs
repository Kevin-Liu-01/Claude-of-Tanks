// Production Garage scene-pack, responsive-layout, and transition probe.
// Usage: node tools/garage-variants-probe.mjs --url=http://127.0.0.1:4178 --cpu-rate=4
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { scoreGarageQuality } from '../src/ui/garageQualityRubric.ts';

const argv = process.argv.slice(2);
const option = (name, fallback = '') => {
  const direct = argv.find((arg) => arg.startsWith(`--${name}=`));
  return direct ? direct.slice(name.length + 3) : fallback;
};
const baseUrl = option('url', 'http://127.0.0.1:4178').replace(/\/$/, '');
const shotsDir = option('shots', '');
const orbitShots = option('orbit-shots', '') === '1';
const cpuRate = Math.max(1, Number(option('cpu-rate', '1')) || 1);
const maxGapMs = Number(option('max-gap', cpuRate > 1 ? '120' : '80'));
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !/github-stars|favicon\.ico/.test(message.text())) {
    errors.push(message.text());
  }
});
page.on('pageerror', (error) => errors.push(String(error)));

const startFrameProbe = async (name) => page.evaluate((key) => {
  const probe = { gaps: [], running: true, started: performance.now() };
  let previous = performance.now();
  const frame = (now) => {
    probe.gaps.push(now - previous);
    previous = now;
    if (probe.running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window[key] = probe;
}, name);

const stopFrameProbe = async (name) => page.evaluate(async (key) => {
  const probe = window[key];
  probe.running = false;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const sorted = probe.gaps.slice().sort((a, b) => a - b);
  return {
    durationMs: +(performance.now() - probe.started).toFixed(1),
    maxGapMs: +Math.max(0, ...sorted).toFixed(1),
    p95GapMs: +(sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)] || 0).toFixed(1),
    frames: sorted.length,
  };
}, name);

try {
  await page.goto(`${baseUrl}/?nosplash=1&qa=1`, { waitUntil: 'networkidle0', timeout: 60_000 });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__GARAGE_WORKSHOP,
    { timeout: 60_000 });
  await page.waitForFunction(() => {
    const architecture = window.__GARAGE_WORKSHOP.stats().architecture;
    return architecture?.ready === true && architecture.presented === true;
  },
    { timeout: 60_000 });
  const variants = await page.evaluate(() => window.__GARAGE_WORKSHOP.variants);
  if (shotsDir) await mkdir(shotsDir, { recursive: true });

  // Preview images are a selector-demand asset, never an entry dependency.
  await page.click('.cot-garage-variant-trigger');
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll('.cot-garage-variant-card img')];
    await Promise.all(images.map((image) => image.complete ? Promise.resolve()
      : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })));
  });
  await page.click('.cot-garage-variant-trigger');

  // Reproduce the real selector race: hover starts one pack's offscreen
  // preparation, then a different card becomes selected while the first is
  // still compiling. The selected build must be pinned until its atomic
  // reveal instead of being evicted into an empty clear-color frame.
  const intentRaceTarget = variants[1].id;
  const intentRaceDecoy = variants[2].id;
  await page.click('.cot-garage-variant-trigger');
  await page.hover(`[data-variant-id="${intentRaceDecoy}"]`);
  await new Promise((resolve) => setTimeout(resolve, 8));
  await page.click(`[data-variant-id="${intentRaceTarget}"]`);
  await page.waitForFunction((id) => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return stats.selected === id && stats.architecture?.ready === true
      && stats.architecture.presented === true;
  }, { timeout: 30_000 }, intentRaceTarget);
  const intentRace = await page.evaluate(() => window.__GARAGE_WORKSHOP.stats());

  // The modern four-bay maintenance layer is demand-loaded after readiness.
  // Let the production quiet-window scheduler build it exactly as a player
  // sees it, and measure the intervening frames independently from switching.
  await startFrameProbe('__GARAGE_DRESSING_PROBE');
  await page.waitForFunction(() => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return stats.built && stats.exhibitCount === 4
      && stats.sharedMaintenanceBayCount === 4;
  }, { timeout: 60_000 });
  const dressingFrames = await stopFrameProbe('__GARAGE_DRESSING_PROBE');

  const results = [];
  for (const variant of variants) {
    await startFrameProbe('__GARAGE_SWITCH_PROBE');
    await page.click('.cot-garage-variant-trigger');
    await page.click(`[data-variant-id="${variant.id}"]`);
    await page.waitForFunction((id) => {
      const stats = window.__GARAGE_WORKSHOP.stats();
      return stats.selected === id && stats.architecture?.ready === true
        && stats.architecture.presented === true;
    }, { timeout: 30_000 }, variant.id);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const frames = await stopFrameProbe('__GARAGE_SWITCH_PROBE');
    const state = await page.evaluate((id) => {
      const stats = window.__GARAGE_WORKSHOP.stats();
      const card = document.querySelector(`[data-variant-id="${id}"]`);
      const preview = card?.querySelector('img');
      return {
        id,
        selected: stats.selected === id,
        persisted: localStorage.getItem('cot.garage.variant'),
        previewReady: !!preview?.complete && preview.naturalWidth > 0,
        stats,
      };
    }, variant.id);
    results.push({ ...state, frames });
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${variant.id}.png`) });
    if (shotsDir && orbitShots) {
      const stage = await page.evaluate(() => window.__DEBUG.showroom.debugState().stage);
      const viewport = page.viewport();
      const point = {
        x: (stage.cx + 1) * viewport.width / 2,
        y: (1 - stage.cy) * viewport.height / 2,
      };
      // 409 px at the production 0.22 degrees/px sensitivity is one quarter
      // orbit. Capture the three remaining quadrants without exposing a test-
      // only camera API or bypassing the exact pointer/input path players use.
      for (const [index, label] of ['left', 'rear', 'right'].entries()) {
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x + 409, point.y, { steps: 12 });
        await page.mouse.up();
        await new Promise((resolve) => setTimeout(resolve, 420));
        await page.screenshot({
          path: path.join(shotsDir, `${variant.id}--${label}.png`),
        });
      }
      await page.evaluate(() => window.__DEBUG.showroom.reset());
    }
  }

  // Rapid intent must converge on the final selection without exposing stale
  // async completions or creating an unbounded pack/texture cache.
  await startFrameProbe('__GARAGE_THRASH_PROBE');
  const lastId = variants.at(-1).id;
  await page.evaluate((rows) => {
    for (let pass = 0; pass < 4; pass += 1) {
      for (const row of rows) window.__GARAGE_WORKSHOP.set(row.id);
    }
  }, variants);
  await page.waitForFunction((id) => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return stats.selected === id && stats.architecture?.ready === true;
  }, { timeout: 30_000 }, lastId);
  await new Promise((resolve) => setTimeout(resolve, 180));
  const thrashFrames = await stopFrameProbe('__GARAGE_THRASH_PROBE');
  const thrash = await page.evaluate(() => window.__GARAGE_WORKSHOP.stats());

  const exerciseEnvironmentCycles = async (cycleCount) => {
    await page.evaluate(async ({ rows, cycleCount: count }) => {
      for (let cycle = 0; cycle < count; cycle += 1) {
        const id = rows[cycle % rows.length].id;
        window.__GARAGE_WORKSHOP.set(id);
        const started = performance.now();
        while (window.__GARAGE_WORKSHOP.stats().selected !== id
            || window.__GARAGE_WORKSHOP.stats().architecture?.ready !== true
            || window.__GARAGE_WORKSHOP.stats().architecture?.presented !== true) {
          if (performance.now() - started > 5_000) throw new Error(`Garage cycle timeout: ${id}`);
          await new Promise((resolve) => setTimeout(resolve, 4));
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }, { rows: variants, cycleCount });
  };

  const settleManagedHeap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    // Texture decode callbacks, compile promises, and disposal listeners can
    // clear on the task following the visible handoff. Measure retained state,
    // not those already-completed closures waiting for the next event turn.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)));
    await cdp.send('HeapProfiler.collectGarbage');
  };

  // Exercise one complete round before the residency baseline. The large
  // demand-loaded fleet can tier-up shared Three.js/geometry helpers during
  // the first repeated environment builds; counting that one-time V8 code
  // cache as retained scene memory made the leak gate depend on fleet size.
  // The measured thirty cycles below remain unchanged and start only after
  // every environment builder has reached its steady execution tier.
  await exerciseEnvironmentCycles(variants.length);

  // Thirty complete measured selection cycles exercise disposal and the
  // two-pack LRU after one-time runtime compilation has settled.
  await settleManagedHeap();
  const memoryBefore = await page.evaluate(() => ({
    heap: performance.memory?.usedJSHeapSize || 0,
    renderer: { ...(window.__DEBUG?.renderer?.info?.memory || {}) },
  }));
  await startFrameProbe('__GARAGE_CYCLE_PROBE');
  await exerciseEnvironmentCycles(30);
  const cycleFrames = await stopFrameProbe('__GARAGE_CYCLE_PROBE');
  await settleManagedHeap();
  const memoryAfter = await page.evaluate(() => ({
    heap: performance.memory?.usedJSHeapSize || 0,
    renderer: { ...(window.__DEBUG?.renderer?.info?.memory || {}) },
    stats: window.__GARAGE_WORKSHOP.stats(),
  }));

  // A saved outdoor destination is a valid cold-entry state. It must become a
  // complete visible pack on its own; historically only Verdant scheduled the
  // warm transaction, leaving direct Cinder reloads on the renderer clear color.
  const persistedOutdoorId = 'railyard_overhaul';
  await page.evaluate((id) => localStorage.setItem('cot.garage.variant', id), persistedOutdoorId);
  const persistedReloadStartedAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction((id) => {
    const stats = window.__GARAGE_WORKSHOP?.stats();
    return window.__GAME_READY === true && stats?.selected === id
      && stats?.architecture?.ready === true
      && stats.architecture.presented === true;
  }, { timeout: 60_000 }, persistedOutdoorId);
  const persistedReload = await page.evaluate((id, elapsedMs) => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return {
      id,
      elapsedMs,
      selected: stats.selected,
      ready: stats.architecture?.ready === true,
      presented: stats.architecture?.presented === true,
      drawCalls: stats.architecture?.drawCalls || 0,
      triangles: stats.architecture?.triangles || 0,
      sceneMode: stats.sceneMode,
    };
  }, persistedOutdoorId, Date.now() - persistedReloadStartedAt);

  const responsive = {};
  for (const viewport of [
    { name: 'ipad', width: 1180, height: 820 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const layout = await page.evaluate(() => {
      const root = document.querySelector('.cot-garage');
      const left = document.querySelector('.cot-leftcol');
      const right = document.querySelector('.cot-garage .stats');
      const carousel = document.querySelector('.cot-carousel');
      const countries = document.querySelector('.cot-country-rail');
      const rect = (element) => element?.getBoundingClientRect();
      const inViewport = (value) => !!value && value.left >= -1 && value.right <= innerWidth + 1
        && value.top >= -1 && value.bottom <= innerHeight + 1;
      return {
        widthClass: document.body.dataset.cotWidth || '',
        panelMode: document.body.dataset.cotPanels || '',
        leftDisplay: getComputedStyle(left).display,
        rightDisplay: getComputedStyle(right).display,
        carouselInside: inViewport(rect(carousel)),
        countriesInside: inViewport(rect(countries)),
        rootInside: inViewport(rect(root)),
      };
    });
    await page.click('.cot-mobile-nav-trigger');
    await page.click('[data-mobile-nav="environment"]');
    const selector = await page.evaluate(() => {
      const menu = document.querySelector('.cot-garage-variant-menu');
      const bounds = menu?.getBoundingClientRect();
      return {
        open: menu?.hidden === false,
        cards: menu?.querySelectorAll('.cot-garage-variant-card').length || 0,
        inside: !!bounds && bounds.left >= 0 && bounds.right <= innerWidth,
      };
    });
    responsive[viewport.name] = { ...layout, selector };
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${viewport.name}.png`) });
    await page.click('[data-variant-id="verdant_motor_pool"]');
  }

  const failures = [];
  if (intentRace.selected !== intentRaceTarget
      || intentRace.architecture?.presented !== true
      || intentRace.architecture?.drawCalls <= 0
      || intentRace.sceneMode !== 'authentic-scene-pack') {
    failures.push(`selector intent race exposed an incomplete Garage: ${JSON.stringify(intentRace)}`);
  }
  if (variants.length !== 10 || results.length !== 10) failures.push('expected ten Garage variants');
  if (new Set(results.map((row) => row.stats.architecture.signature)).size !== 10) {
    failures.push('environment signatures are not unique');
  }
  for (const result of results) {
    const architecture = result.stats.architecture;
    const isVerdant = result.id === 'verdant_motor_pool';
    if (!result.selected || result.persisted !== result.id || !result.previewReady) {
      failures.push(`${result.id}: selection/persistence/preview failed`);
    }
    if (!result.stats.built || result.stats.triangles <= 0
        || result.stats.activeWorkshopTriangles <= 0 || result.stats.exhibitCount !== 4
        || result.stats.sharedMaintenanceBayCount !== 4
        || result.stats.sharedMaintenanceBayIds?.length !== 4
        || result.stats.sharedMaintenanceBayQuadrants?.length !== 4
        || new Set(result.stats.sharedMaintenanceBayQuadrants).size !== 4
        || result.stats.workshopOrbitCoverageDegrees !== 360) {
      failures.push(`${result.id}: complete four-bay service layer is missing`);
    }
    if (result.stats.workshopExhibitTextureCount !== 0
        || result.stats.workshopPaletteCount !== 3
        || result.stats.workshopOmittedAttributeBytes <= 0
        || result.stats.workshopPresentationFinishes?.join('|')
          !== 'service_t90m|service_usa_desert|service_bmp3_rok') {
      failures.push(`${result.id}: fixed service-finish optimization is missing`);
    }
    if (!result.stats.battleScreenVisible
        || result.stats.battleScreenMode !== 'crt-scroll-slideshow'
        || result.stats.battleScreenWallBay !== 'freestanding-shared'
        || result.stats.battleScreenImageCount < 2
        || result.stats.battleScreenResidentImageLimit !== 2) {
      failures.push(`${result.id}: shared field-record display is missing`);
    }
    if (result.stats.sceneMode !== (isVerdant ? 'verdant-workshop' : 'authentic-scene-pack')
        || result.stats.roofMode !== (isVerdant ? 'enclosed-original' : 'open-environment')
        || result.stats.environment?.mode !== 'authentic-scene-pack'
        || result.stats.environment?.worldMounted) {
      failures.push(`${result.id}: authentic isolated scene-pack contract failed`);
    }
    if (isVerdant) {
      if (architecture.source !== 'verdant-workshop'
          || architecture.mode !== 'verdant-workshop'
          || architecture.enclosingSurfaces !== 4
          || architecture.terrainVertices !== 0
          || architecture.facilityStations !== 4) {
        failures.push(`${result.id}: restored workshop receipt failed`);
      }
    } else if (architecture.source !== 'authentic-garage-scene-pack'
        || architecture.drawCalls < 8 || architecture.drawCalls > 25
        || architecture.triangles <= 0 || architecture.triangles > 50_000
        || architecture.terrainVertices !== 1517
        || architecture.distinctiveElements?.length < 4
        || architecture.facilityProps < 100 || architecture.facilityStations !== 2
        || architecture.operationalMachines < 3
        || architecture.openingViewFrames !== 2
        || architecture.treeDetailTier !== 'battlefield-near'
        || architecture.horizonStyle === 'none' || architecture.horizonMaxHeightM > 13.2
        || architecture.looseParts < 40
        || architecture.placementZones < 7 || architecture.placementOverlaps !== 0
        || architecture.maxGroundContactErrorM > 0.1
        || architecture.cached > 2 || architecture.residentTextureSets > 9) {
      failures.push(`${result.id}: visual/resource receipt failed`);
    }
    if (result.stats.heroTrackContactErrorM === null
        || result.stats.heroTrackContactErrorM > 0.001) {
      failures.push(`${result.id}: hero is not seated on the common podium`);
    }
    if (result.frames.maxGapMs > maxGapMs) {
      failures.push(`${result.id}: ${result.frames.maxGapMs}ms transition frame gap`);
    }
  }
  const qualityScores = results.map((result) => scoreGarageQuality({
    id: result.id,
    isVerdant: result.id === 'verdant_motor_pool',
    architecture: result.stats.architecture,
    workshop: result.stats,
    transitionMaxGapMs: result.frames.maxGapMs,
  }));
  for (const score of qualityScores) {
    if (score.total < 90 || score.failures.length) {
      failures.push(`${score.id}: quality ${score.total}/100 (${score.failures.join(', ')})`);
    }
  }
  if (thrash.selected !== lastId || thrash.architecture.cached > 2
      || thrash.architecture.residentTextureSets > 9 || thrashFrames.maxGapMs > maxGapMs) {
    failures.push(`rapid-switch convergence failed: ${JSON.stringify({ thrash, thrashFrames })}`);
  }
  if (dressingFrames.maxGapMs > Math.max(maxGapMs, 150)) {
    failures.push(`workshop stream stalled a frame: ${dressingFrames.maxGapMs}ms`);
  }
  const heapGrowth = memoryBefore.heap && memoryAfter.heap ? memoryAfter.heap - memoryBefore.heap : 0;
  if (heapGrowth > 24 * 1024 * 1024 || memoryAfter.stats.architecture.cached > 2
      || memoryAfter.stats.architecture.residentTextureSets > 9) {
    failures.push(`30-cycle residency growth failed: ${heapGrowth} bytes`);
  }
  if (persistedReload.selected !== persistedOutdoorId || !persistedReload.ready
      || !persistedReload.presented
      || persistedReload.drawCalls < 8 || persistedReload.triangles <= 0
      || persistedReload.sceneMode !== 'authentic-scene-pack') {
    failures.push(`persisted outdoor Garage failed: ${JSON.stringify(persistedReload)}`);
  }
  for (const [name, state] of Object.entries(responsive)) {
    if (state.panelMode !== 'overlay' || state.leftDisplay !== 'none'
        || state.rightDisplay !== 'none' || !state.carouselInside || !state.countriesInside
        || !state.selector.open || state.selector.cards !== 10 || !state.selector.inside) {
      failures.push(`${name}: responsive Garage composition failed: ${JSON.stringify(state)}`);
    }
  }
  if (errors.length) failures.push(`console errors: ${errors.join(' | ')}`);

  console.log(JSON.stringify({
    cpuRate,
    maxGapMs,
    intentRace: {
      selected: intentRace.selected,
      ready: intentRace.architecture?.ready === true,
      presented: intentRace.architecture?.presented === true,
      drawCalls: intentRace.architecture?.drawCalls || 0,
    },
    variants: results.map(({ id, frames, stats }) => ({
      id,
      frames,
      buildMs: stats.architecture.lastBuildMs,
      drawCalls: stats.architecture.drawCalls,
      triangles: stats.architecture.triangles,
    })),
    qualityScores,
    dressingFrames,
    thrashFrames,
    cycleFrames,
    heapGrowth,
    memoryBefore,
    memoryAfter,
    persistedReload,
    responsive,
    errors,
    failures,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
