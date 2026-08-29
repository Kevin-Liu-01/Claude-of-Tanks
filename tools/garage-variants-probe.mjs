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
    await new Promise((resolve) => setTimeout(resolve, 220));
    const result = await page.evaluate(async (id) => {
      const probe = window.__GARAGE_VARIANT_PROBE;
      probe.running = false;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const button = document.querySelector(`[data-variant-id="${id}"]`);
      const preview = button?.querySelector('img');
      const stats = window.__GARAGE_WORKSHOP.stats();
      return {
        id,
        selected: stats.selected === id,
        durationMs: +(performance.now() - probe.started).toFixed(1),
        gapMaxMs: +Math.max(0, ...probe.gaps).toFixed(1),
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
    failures.push('expected ten unique workshop ids and ten unique battlefield bindings');
  }
  if (architectureKeys.size !== 10 || architectureSignatures.size !== 10) {
    failures.push('expected ten unique structural garage architectures/signatures');
  }
  for (const result of results) {
    if (!result.selected || result.persisted !== result.id || !result.optionSelected) {
      failures.push(`${result.id}: selection/persistence contract failed`);
    }
    if (!result.previewReady) failures.push(`${result.id}: preview did not decode`);
    if (!result.stats.built || result.stats.triangles <= 0 || result.stats.triangles > 35_000) {
      failures.push(`${result.id}: workshop triangle budget failed (${result.stats.triangles})`);
    }
    if (!result.stats.architecture?.objects || result.stats.architecture.triangles > 10_000) {
      failures.push(`${result.id}: architecture geometry budget failed`);
    }
    if (result.stats.wallLayout?.overlaps?.length) {
      failures.push(`${result.id}: overlapping wall bays ${result.stats.wallLayout.overlaps.join(', ')}`);
    }
    if (!['abrams', 't90', 'leclerc'].every((family) => result.stats.families?.includes(family))) {
      failures.push(`${result.id}: missing family-specific workshop LOD`);
    }
    if (!['m1a2', 't90m', 'leclerc'].every((id) => result.stats.sourceVehicleIds?.includes(id))) {
      failures.push(`${result.id}: missing expected workshop source vehicle id`);
    }
    if (result.gapMaxMs > maxGapMs) {
      failures.push(`${result.id}: ${result.gapMaxMs} ms frame gap exceeds ${maxGapMs} ms`);
    }
  }
  if (!mobile.open || mobile.cards !== 10 || !mobile.insideViewport || !mobile.scrollable || !mobile.pointerSelect) {
    failures.push(`mobile selector contract failed: ${JSON.stringify(mobile)}`);
  }
  if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.join(' | ')}`);

  console.log(JSON.stringify({ cpuRate, variants: results, mobile, consoleErrors, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
