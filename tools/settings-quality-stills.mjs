#!/usr/bin/env node
// tools/settings-quality-stills.mjs — Settings' graphics levels with their previews, as a player sees them (texture-diet-277).
// The Garage of a built site (vite preview of --dist; or --url, a site already served), Settings opened (Escape), its
// Graphics tab, then each named level pointed at (desktop, 1920 x 1080: the picker open, the level under the pointer) or
// tapped (phone, 390 x 844 at 3x, tier=mobile: the segmented control stages it), and the panel shot with its preview and
// note. Each still records the preview the page shows and the note under it.
//
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/settings-quality-stills.mjs --dist=<dist> --out=<dir>
//     [--url=<served origin>] [--desktop=low,high,ultra] [--phone=mobile-low,mobile-high] [--dry]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { startViteChild } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = path.resolve(arg('out', '.qa-dev/settings-quality-stills'));
const dist = arg('dist', null);
const DEVICES = {
  desktop: { viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, query: 'tier=desktop',
    levels: arg('desktop', 'auto,ultralow,low,medium,high,ultra').split(',').filter(Boolean) },
  phone: { viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, query: 'tier=mobile',
    levels: arg('phone', 'mobile-ultralow,mobile-low,mobile,mobile-high').split(',').filter(Boolean) },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });
let server = null;
const origin = arg('url', null) ?? (server = await startViteChild({ mode: 'preview', outDir: path.resolve(dist), port: 4338 })).url;
const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 600000 },
  { label: 'settings-quality-stills' });
const report = { origin, shots: [] };
try {
  for (const [device, d] of Object.entries(DEVICES)) {
    if (!d.levels.length) continue;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
    await page.setViewport(d.viewport);
    await page.goto(`${origin.replace(/\/$/, '')}/?nosplash=1&${d.query}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
    await page.waitForFunction(readinessExpression('garage'), { timeout: 600000, polling: 500 });
    await sleep(1500);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.cot-set-panel', { visible: true, timeout: 30000 });
    await page.click('.cot-set-tab[data-tab="graphics"]');
    await page.waitForSelector('.cot-set-preview img', { visible: true, timeout: 30000 });
    // the level's note folds behind the Quality card's (i) like every Settings note (the owner's 10-24 sweep); opened here so
    // the stills show what each level changes beside its preview
    await page.click('.cot-set-card .cot-set-info');
    for (const level of d.levels) {
      if (device === 'desktop') {
        const open = await page.$('.cot-c-picker__opt[data-id="ultra"]').then((h) => h?.isVisible() ?? false);
        if (!open) await page.click('.cot-set-menu .cot-c-menu__trigger');
        await page.waitForSelector(`.cot-c-picker__opt[data-id="${level}"]`, { visible: true, timeout: 10000 });
        await page.hover(`.cot-c-picker__opt[data-id="${level}"]`);
      } else {
        await page.tap(`.cot-set-quality .cot-c-seg__opt[data-value="${level}"]`);
      }
      // the preview decoded before the shot (--dry: the navigation alone, before the previews exist)
      if (!process.argv.includes('--dry')) await page.waitForFunction(() => { const img = document.querySelector('.cot-set-preview img'); return !!img && img.complete && img.naturalWidth > 0; },
        { timeout: 30000, polling: 100 });
      await sleep(400);
      const file = path.join(out, `settings-${device}-${level}.png`);
      await page.screenshot({ path: file, type: 'png' });
      const shown = await page.evaluate(() => ({
        preview: document.querySelector('.cot-set-preview img')?.getAttribute('src') ?? null,
        note: document.querySelector('.cot-set-preview + .cot-set-note')?.textContent ?? null,
      }));
      report.shots.push({ device, level, file: path.basename(file), ...shown });
      console.log(`${device} ${level}: ${shown.preview} — ${shown.note}`);
    }
    report[`${device}Errors`] = errors;
    await page.close();
  }
} finally {
  await browser.close().catch(() => {});
  await server?.close?.().catch(() => {});
}
writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
