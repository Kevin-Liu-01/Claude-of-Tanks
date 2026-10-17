#!/usr/bin/env node
// Owner 2026-10-17: "if you are out of ammo, the reload indicators should have a special edge case, including
// autoloader/missile indicators. and for special modes like juggernaut, ammo should be endless."
// Rendered proof of the out-of-ammo and unlimited-rounds HUD states on the real HUD (tools/fixtures/
// battle-hud-layout.html, AMMO_STAGES): a normal reload, an empty cannon, an autoloader short of stowage and one empty
// between clips, an empty guided salvo rack, an empty ATGM launcher, and Juggernaut with unlimited rounds — desktop and
// phone. Each frame is checked on the reticle canvas (no amber reload sweep, countdown or ready shell on a dry weapon;
// the danger-ink empty state present) and in the DOM (struck controls, ∞ counts), then written as PNGs.
// Takes the capture lock (NORMAL band) and accepts an existing dev server:
// node tools/hud-ammo-states.browser.mjs --url=http://127.0.0.1:5189 --out=outputs/hud-ammo-states
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const out = resolve(arg('out', 'outputs/hud-ammo-states'));
const url = arg('url', 'http://127.0.0.1:5189');
const CASES = [
  { name: 'desktop', width: 1920, height: 1080, touch: false, scale: 2 },
  { name: 'phone', width: 390, height: 844, touch: true, scale: 2 },
];
// What the reticle canvas must and must not show for each stage (pixel counts inside the sight's neighbourhood).
const EXPECT = {
  'ammo-reload': { amberMin: 40, dangerMax: 4 },
  'ammo-dry-cannon': { amberMax: 4, dangerMin: 30 },
  'ammo-low-autoloader': { amberMin: 20, dangerMin: 10 },
  'ammo-dry-autoloader': { amberMax: 4, dangerMin: 30, struckControl: true },
  'ammo-dry-salvo': { amberMax: 4, dangerMin: 30, struckControl: true },
  'ammo-dry-atgm': { dangerMax: 4, struckControl: true },
  'ammo-unlimited': { amberMin: 20, dangerMax: 4, unlimited: true },
};

function readHud() {
  const canvas = document.querySelector('.cot-ret');
  const ctx = canvas.getContext('2d');
  const sx = canvas.width / innerWidth;
  const half = Math.round(150 * sx);
  const x0 = Math.max(0, Math.round(canvas.width / 2) - half);
  const y0 = Math.max(0, Math.round(canvas.height / 2) - half);
  const data = ctx.getImageData(x0, y0, Math.min(canvas.width - x0, half * 2), Math.min(canvas.height - y0, half * 2)).data;
  let amber = 0;
  let danger = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2]; const a = data[i + 3];
    if (a < 110) continue;
    if (r > 200 && g > 115 && g < 195 && b < 95) amber++;
    else if (r > 170 && r - g > 65 && g < 150 && Math.abs(g - b) < 45) danger++;
  }
  const visible = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const struck = [...document.querySelectorAll('.cot-vehicle-controls>button.empty')].filter(visible);
  const shells = [...document.querySelectorAll('.cot-shell')].filter(visible);
  return {
    amber, danger,
    struck: struck.map((el) => ({ label: el.getAttribute('aria-label'), disabled: el.disabled,
      strike: getComputedStyle(el.querySelector('.si'), '::after').content !== 'none' })),
    counts: shells.map((el) => el.querySelector('.cnt')?.textContent ?? ''),
    emptySlots: shells.filter((el) => el.classList.contains('empty')).length,
  };
}

const { chromium } = await import(arg('playwright-module', 'playwright'));
await mkdir(out, { recursive: true });
const reports = [];
const failures = [];
// NORMAL band: an ordinary FIFO ticket; wait behind the queue (default three hours), hold for well under a minute.
await acquireCaptureLock(Number(arg('lock-timeout-ms', String(3 * 3600 * 1000))));
const heartbeat = setInterval(refreshCaptureLock, 30_000);
heartbeat.unref();
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
try {
  for (const c of CASES) {
    const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, hasTouch: c.touch,
      isMobile: c.touch, deviceScaleFactor: c.scale, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(`${c.name}: ${error.message}`));
    await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?locale=en-US`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT);
    for (const [stage, expect] of Object.entries(EXPECT)) {
      await page.evaluate((name) => window.__HUD_LAYOUT.state(name), stage);
      await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
      const hud = await page.evaluate(readHud);
      const issues = [];
      if (expect.amberMin != null && hud.amber < expect.amberMin) issues.push(`reload amber ${hud.amber} < ${expect.amberMin}`);
      if (expect.amberMax != null && hud.amber > expect.amberMax) issues.push(`a dry weapon still shows reload amber (${hud.amber})`);
      if (expect.dangerMin != null && hud.danger < expect.dangerMin) issues.push(`empty-state ink ${hud.danger} < ${expect.dangerMin}`);
      if (expect.dangerMax != null && hud.danger > expect.dangerMax) issues.push(`unexpected empty-state ink (${hud.danger})`);
      if (expect.struckControl && !hud.struck.some((row) => row.strike && row.disabled)) issues.push('no struck, disabled launcher/magazine control');
      if (!expect.struckControl && hud.struck.length) issues.push(`unexpected struck control ${JSON.stringify(hud.struck)}`);
      if (expect.unlimited && (hud.emptySlots || !hud.counts.length || hud.counts.some((text) => text !== '∞'))) {
        issues.push(`unlimited rounds must print ∞ in every slot (${hud.counts.join(',')})`);
      }
      if (stage.startsWith('ammo-dry') && stage !== 'ammo-dry-atgm' && !hud.emptySlots) issues.push('no empty tray slot');
      const file = `${c.name}-${stage}.png`;
      await page.screenshot({ path: resolve(out, file) });
      if (c.name === 'desktop') {
        await page.screenshot({ path: resolve(out, `${c.name}-${stage}-reticle.png`),
          clip: { x: c.width / 2 - 170, y: c.height / 2 - 120, width: 340, height: 240 } });
      }
      reports.push({ case: c.name, stage, file, ...hud, issues });
      for (const issue of issues) failures.push(`${c.name}/${stage}: ${issue}`);
      refreshCaptureLock();
    }
    await context.close();
  }
} finally {
  await browser.close();
  clearInterval(heartbeat);
  releaseCaptureLock();
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ reports, failures }, null, 2));
}
console.log(`${reports.length} HUD ammo frames; ${failures.length} failures. ${out}`);
if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
