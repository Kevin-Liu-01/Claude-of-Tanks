// Deterministic garage-environment release probe.
// Usage: node tools/garage-variants-probe.mjs --url=http://127.0.0.1:4178 --shots=shots/garage-variants
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const option = (name, fallback = '') => {
  const direct = argv.find((arg) => arg.startsWith(`--${name}=`));
  return direct ? direct.slice(name.length + 3) : fallback;
};
const baseUrl = option('url', 'http://127.0.0.1:4178').replace(/\/$/, '');
const shotsDir = option('shots', '');
const maxGapMs = Number(option('max-gap', '120')) || 120;
const cpuRate = Math.max(1, Number(option('cpu-rate', '1')) || 1);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
if (cpuRate > 1) {
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
}
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !/github-stars|favicon\.ico/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

try {
  await page.goto(`${baseUrl}/?nosplash=1&qa=1`, { waitUntil: 'networkidle0', timeout: 60_000 });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__GARAGE_WORKSHOP,
    { timeout: 60_000 });
  await page.evaluate(() => window.__GARAGE_WORKSHOP.ensureBuilt());
  await page.waitForFunction(() =>
    !!window.__GARAGE_WORKSHOP.stats().battleScreenCurrentImage,
  { timeout: 15_000 });
  // ensureBuilt deliberately drains the quiet-slice queue for deterministic
  // capture. Let allocation cleanup settle before timing interactive swaps;
  // the live scheduler naturally has 140 ms between every exhibit slice.
  await new Promise((resolve) => setTimeout(resolve, 400));
  // Preview art is intentionally lazy: opening the selector is its demand
  // boundary. Decode every now-visible card once, then close it for stage shots.
  await page.evaluate(async () => {
    const trigger = document.querySelector('.cot-garage-variant-trigger');
    trigger?.click();
    const images = [...document.querySelectorAll('.cot-garage-variant-card img')];
    await Promise.all(images.map((image) => image.complete
      ? Promise.resolve() : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })));
    trigger?.click();
  });
  const variants = await page.evaluate(() => window.__GARAGE_WORKSHOP.variants);
  if (shotsDir) await mkdir(shotsDir, { recursive: true });

  const results = [];
  for (const variant of variants) {
    await page.evaluate(() => {
      const gaps = [];
      const probe = { gaps, running: true, started: performance.now() };
      let previous = performance.now();
      const sample = (now) => {
        gaps.push(now - previous);
        previous = now;
        if (probe.running) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      window.__GARAGE_VARIANT_PROBE = probe;
    });
    // Exercise the same pointer path a player uses. Programmatic set() calls
    // previously hid a regression where the visible menu inherited
    // pointer-events:none from the transparent garage overlay.
    await page.click('.cot-garage-variant-trigger');
    await page.click(`[data-variant-id="${variant.id}"]`);
    await page.waitForFunction((id) => {
      const stats = window.__GARAGE_WORKSHOP.stats();
      return stats.selected === id
        && stats.architecture?.ready === true
        && stats.environment?.ready === true;
    }, { timeout: 60_000 }, variant.id);
    await page.evaluate(async () => {
      const covered = window.__GARAGE_VARIANT_PROBE;
      covered.running = false;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const gaps = [];
      const reveal = { gaps, running: true };
      let previous = performance.now();
      const sample = (now) => {
        gaps.push(now - previous);
        previous = now;
        if (reveal.running) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      window.__GARAGE_VARIANT_REVEAL_PROBE = reveal;
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const result = await page.evaluate(async (id) => {
      const covered = window.__GARAGE_VARIANT_PROBE;
      const reveal = window.__GARAGE_VARIANT_REVEAL_PROBE;
      reveal.running = false;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const button = document.querySelector(`[data-variant-id="${id}"]`);
      const preview = button?.querySelector('img');
      const stats = window.__GARAGE_WORKSHOP.stats();
      return {
        id,
        selected: stats.selected === id,
        durationMs: +(performance.now() - covered.started).toFixed(1),
        coveredGapMaxMs: +Math.max(0, ...covered.gaps).toFixed(1),
        gapMaxMs: +Math.max(0, ...reveal.gaps).toFixed(1),
        persisted: localStorage.getItem('cot.garage.variant'),
        header: document.querySelector('.cot-garage-variant-label')?.textContent || '',
        optionSelected: button?.getAttribute('aria-selected') === 'true',
        previewReady: !!preview?.complete && preview.naturalWidth > 0,
        stats,
      };
    }, variant.id);
    results.push(result);
    if (shotsDir) {
      await page.screenshot({ path: path.join(shotsDir, `${variant.id}.png`) });
    }
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.click('.cot-mobile-nav-trigger');
  await page.click('[data-mobile-nav="environment"]');
  const mobile = await page.evaluate(() => {
    const menu = document.querySelector('.cot-garage-variant-menu');
    const rect = menu?.getBoundingClientRect();
    return {
      open: menu?.hidden === false,
      cards: menu?.querySelectorAll('.cot-garage-variant-card').length || 0,
      insideViewport: !!rect && rect.left >= 0 && rect.right <= innerWidth,
      scrollable: !!menu && menu.scrollHeight >= menu.clientHeight,
    };
  });
  if (shotsDir) await page.screenshot({ path: path.join(shotsDir, 'mobile-selector.png') });
  await page.click('[data-variant-id="verdant_motor_pool"]');
  await new Promise((resolve) => setTimeout(resolve, 100));
  mobile.pointerSelect = await page.evaluate(() =>
    window.__GARAGE_WORKSHOP.stats().selected === 'verdant_motor_pool');

  const ids = new Set(results.map((result) => result.id));
  const mapIds = new Set(results.map((result) => result.stats.mapId));
  const architectureKeys = new Set(results.map((result) => result.stats.architecture?.key));
  const architectureSignatures = new Set(results.map((result) => result.stats.architecture?.signature));
  const failures = [];
  if (results.length !== 10 || ids.size !== 10 || mapIds.size !== 10) {
    failures.push('expected ten unique Garage ids and ten unique environment bindings');
  }
  if (architectureKeys.size !== 10 || architectureSignatures.size !== 10) {
    failures.push('expected ten unique Garage environment signatures');
  }
  for (const result of results) {
    const isVerdant = result.id === 'verdant_motor_pool';
    if (!result.selected || result.persisted !== result.id || !result.optionSelected) {
      failures.push(`${result.id}: selection/persistence contract failed`);
    }
    if (!result.previewReady) failures.push(`${result.id}: preview did not decode`);
    if (!result.stats.built || result.stats.triangles <= 0 || result.stats.triangles > 450_000) {
      failures.push(`${result.id}: workshop triangle budget failed (${result.stats.triangles})`);
    }
    if (!result.stats.optimizedTriangleParity
        || result.stats.optimizedTriangles !== result.stats.triangles
        || result.stats.optimization?.displayDrawCallsRemoved < 300
        || result.stats.optimization?.shadowCastersPruned < 100) {
      failures.push(`${result.id}: exact static-display optimization receipt failed`);
    }
    if (result.stats.architecture.triangles > 10_000) {
      failures.push(`${result.id}: architecture geometry budget failed`);
    }
    if (result.stats.wallLayout?.overlaps?.length) {
      failures.push(`${result.id}: overlapping wall bays ${result.stats.wallLayout.overlaps.join(', ')}`);
    }
    if (result.stats.mapImageCount !== 0
        || result.stats.battleScreenMode !== 'crt-scroll-slideshow'
        || result.stats.battleScreenWallBay !== 'south_location'
        || result.stats.battleScreenImageCount < 5
        || result.stats.battleScreenResidentImageLimit !== 2
        || result.stats.battleScreenResidentImageCount > 2
        || result.stats.battleScreenVisible !== isVerdant
        || !result.stats.battleScreenCurrentImage?.startsWith('/media/')) {
      failures.push(`${result.id}: battle archive screen contract failed`);
    }
    const expectedExhibits = isVerdant ? 4 : 0;
    if (result.stats.modelMode !== 'actual-fleet'
        || result.stats.exhibitCount !== expectedExhibits) {
      failures.push(`${result.id}: expected ${expectedExhibits} visible actual-fleet exhibits`);
    }
    if (result.stats.sharedMaintenanceBayCount !== expectedExhibits
        || (isVerdant && !['burlak_gantry', 'abrams_welding', 't90m_relikt', 'rolled_k2']
          .every((id) => result.stats.sharedMaintenanceBayIds?.includes(id)))) {
      failures.push(`${result.id}: active maintenance-bay ownership is incorrect`);
    }
    const expectedActiveWorkshopTriangles = isVerdant
      ? result.stats.verdantOriginalTriangleCount : 0;
    if (result.stats.activeWorkshopTriangles !== expectedActiveWorkshopTriangles) {
      failures.push(`${result.id}: inactive workshop geometry remains render-resident`);
    }
    if (result.stats.heroTrackContactErrorM === null
        || result.stats.heroTrackContactErrorM > 0.001) {
      failures.push(`${result.id}: hero tracks miss the podium by ${result.stats.heroTrackContactErrorM} m`);
    }
    if (isVerdant) {
      if (result.stats.sceneMode !== 'verdant-workshop'
          || result.stats.roofMode !== 'enclosed-original'
          || result.stats.architecture?.mode !== 'verdant-workshop') {
        failures.push('verdant_motor_pool: original enclosed roof/trusses were not restored');
      }
      if (!result.stats.verdantOriginalVisible
          || result.stats.verdantOriginalLayoutReceipt !== 'pre-6c7b07533-original'
          || result.stats.verdantOriginalExhibitCount !== 4
          || result.stats.verdantOriginalSetPieces?.length !== 10) {
        failures.push('verdant_motor_pool: original workshop arrangement receipt failed');
      }
      for (const id of ['t90a_burlak', 'm1a2', 't90m', 'k2']) {
        if (!result.stats.verdantOriginalExhibitIds?.includes(id)) {
          failures.push(`verdant_motor_pool: missing original ${id} set piece`);
        }
      }
    } else if (result.stats.sceneMode !== 'custom-environment'
        || result.stats.roofMode !== 'open-environment'
        || result.stats.architecture?.mode !== 'garage-environment'
        || result.stats.architecture?.enclosingSurfaces !== 0) {
      failures.push(`${result.id}: expected a wall-free custom environment`);
    } else if (result.stats.architecture?.source !== 'custom-garage-environment'
        || result.stats.architecture.objects < 5
        || result.stats.architecture.triangles <= 0
        || result.stats.architecture.terrainVertices < 625
        || !result.stats.architecture.sourceStructure
        || !result.stats.architecture.sourceBeat
        || !result.stats.architecture.terrainProfile
        || !result.stats.architecture.serviceFrame
        || result.stats.architecture.landmarkHeightM < 7
        || result.stats.architecture.distinctiveElements?.length < 4
        || result.stats.environment?.mode !== 'custom-environment'
        || result.stats.environment?.worldMounted) {
      failures.push(`${result.id}: custom Garage environment receipt failed`);
    }
    if (result.stats.verdantOriginalVisible !== isVerdant) {
      failures.push(`${result.id}: Verdant workshop visibility leaked across environments`);
    }
    if (!['burlak', 'abrams', 't90', 'k2'].every((family) => result.stats.families?.includes(family))) {
      failures.push(`${result.id}: missing family-specific actual fleet exhibit`);
    }
    if (!['t90a_burlak', 'm1a2', 't90m', 'k2']
      .every((id) => result.stats.sourceVehicleIds?.includes(id))) {
      failures.push(`${result.id}: missing expected workshop source vehicle id`);
    }
    if (result.gapMaxMs > maxGapMs) {
      failures.push(`${result.id}: ${result.gapMaxMs} ms frame gap exceeds ${maxGapMs} ms`);
    }
    if (result.durationMs > 750) {
      failures.push(`${result.id}: ${result.durationMs} ms environment switch exceeds 750 ms`);
    }
  }
  if (!mobile.open || mobile.cards !== 10 || !mobile.insideViewport || !mobile.scrollable || !mobile.pointerSelect) {
    failures.push(`mobile selector contract failed: ${JSON.stringify(mobile)}`);
  }
  const firstScreenImage = results[0]?.stats.battleScreenCurrentImage || '';
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.waitForFunction((initialImage) => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return !!stats.battleScreenCurrentImage && stats.battleScreenCurrentImage !== initialImage;
  }, { timeout: 12_000 }, firstScreenImage);
  const battleScreenRotation = await page.evaluate((initialImage) => {
    const stats = window.__GARAGE_WORKSHOP.stats();
    return {
      initialImage,
      currentImage: stats.battleScreenCurrentImage,
      changed: stats.battleScreenCurrentImage !== initialImage,
      residentImages: stats.battleScreenResidentImageCount,
    };
  }, firstScreenImage);
  if (!battleScreenRotation.changed || battleScreenRotation.residentImages > 2) {
    failures.push(`battle archive rotation failed: ${JSON.stringify(battleScreenRotation)}`);
  }
  if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.join(' | ')}`);

  console.log(JSON.stringify({
    cpuRate, variants: results, mobile, battleScreenRotation, consoleErrors, failures,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
