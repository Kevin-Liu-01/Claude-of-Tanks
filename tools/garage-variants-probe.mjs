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
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
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
    const result = await page.evaluate(async (id) => {
      const gaps = [];
      let running = true;
      let previous = performance.now();
      const sample = (now) => {
        gaps.push(now - previous);
        previous = now;
        if (running) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      const started = performance.now();
      const selected = window.__GARAGE_WORKSHOP.set(id);
      await new Promise((resolve) => setTimeout(resolve, 220));
      running = false;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const button = document.querySelector(`[data-variant-id="${id}"]`);
      const preview = button?.querySelector('img');
      return {
        id,
        selected,
        durationMs: +(performance.now() - started).toFixed(1),
        gapMaxMs: +Math.max(0, ...gaps).toFixed(1),
        persisted: localStorage.getItem('cot.garage.variant'),
        header: document.querySelector('.cot-garage-variant-label')?.textContent || '',
        optionSelected: button?.getAttribute('aria-selected') === 'true',
        previewReady: !!preview?.complete && preview.naturalWidth > 0,
        stats: window.__GARAGE_WORKSHOP.stats(),
      };
    }, variant.id);
    results.push(result);
    if (shotsDir) {
      await page.screenshot({ path: path.join(shotsDir, `${variant.id}.png`) });
    }
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const mobile = await page.evaluate(() => {
    document.querySelector('.cot-mobile-nav-trigger')?.click();
    document.querySelector('[data-mobile-nav="environment"]')?.click();
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

  const ids = new Set(results.map((result) => result.id));
  const mapIds = new Set(results.map((result) => result.stats.mapId));
  const failures = [];
  if (results.length !== 10 || ids.size !== 10 || mapIds.size !== 10) {
    failures.push('expected ten unique workshop ids and ten unique battlefield bindings');
  }
  for (const result of results) {
    if (!result.selected || result.persisted !== result.id || !result.optionSelected) {
      failures.push(`${result.id}: selection/persistence contract failed`);
    }
    if (!result.previewReady) failures.push(`${result.id}: preview did not decode`);
    if (!result.stats.built || result.stats.triangles <= 0 || result.stats.triangles > 35_000) {
      failures.push(`${result.id}: workshop triangle budget failed (${result.stats.triangles})`);
    }
    if (result.gapMaxMs > maxGapMs) {
      failures.push(`${result.id}: ${result.gapMaxMs} ms frame gap exceeds ${maxGapMs} ms`);
    }
  }
  if (!mobile.open || mobile.cards !== 10 || !mobile.insideViewport || !mobile.scrollable) {
    failures.push(`mobile selector contract failed: ${JSON.stringify(mobile)}`);
  }
  if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.join(' | ')}`);

  console.log(JSON.stringify({ variants: results, mobile, consoleErrors, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
