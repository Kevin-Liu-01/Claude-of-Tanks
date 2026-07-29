// tools/bootgate-probe.mjs — loading-screen completion gate.
//
// Regression: the boot bar parked at 85% forever because main.js never
// reported the final 'post'/'ready' stages or called boot.ready(), so the
// "press any key" gate never armed. Every other harness bypasses the splash
// (?nosplash / webdriver), which is exactly why nothing caught it.
//
// PASS 1 (player path, __COT_FORCE_SPLASH beats the webdriver bypass):
//   bar reaches 100%, all stage ticks lit, gate armed, __GAME_READY set
//   while the splash is still up, a keypress dismisses the splash.
// PASS 2 (harness path, webdriver bypass): splash auto-dismisses with no
//   keypress and __GAME_READY still sets.
// Both passes must produce zero console/page errors. Exits non-zero on any
// failed assertion. Also prints per-stage BOOT_TIMINGS so "loading is slow"
// is attributable, not vibes.
//
// Usage: node tools/bootgate-probe.mjs

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const failures = [];
let checks = 0;
function check(mode, name, cond, detail = '') {
  checks++;
  const tag = `[${mode}] ${name}`;
  if (cond) console.log(`  PASS ${tag}${detail ? ` (${detail})` : ''}`);
  else {
    failures.push(tag + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL ${tag}${detail ? ` (${detail})` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  // hmr/watch OFF: an agent saving a src file mid-run would hot-reload the
  // page and wipe the splash state under the probe's feet.
  server: {
    port: 5300 + Math.floor(Math.random() * 600),
    strictPort: false,
    hmr: false,
    watch: null,
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[bootgate-probe] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

async function bootPage(forceSplash) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
  });
  if (forceSplash) {
    await page.evaluateOnNewDocument(() => { window.__COT_FORCE_SPLASH = true; });
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return { page, pageErrors };
}

// ---------------------------------------------------------------------------
// PASS 1 — real player path: splash + entry gate exercised end to end
// ---------------------------------------------------------------------------
{
  const mode = 'gate';
  const { page, pageErrors } = await bootPage(true);
  const t0 = Date.now();

  // The bar must actually pass the old failure point and land on 100%.
  let sawPast85 = false;
  let pct = 0;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    pct = await page.evaluate(() => {
      const el = document.getElementById('cot-boot-pct');
      return el ? parseInt(el.textContent, 10) : -1;
    });
    if (pct > 85) sawPast85 = true;
    if (pct >= 100) break;
    await sleep(120);
  }
  const loadMs = Date.now() - t0;
  check(mode, 'bar passes 85%', sawPast85, `final ${pct}%`);
  check(mode, 'bar reaches 100%', pct >= 100, `${loadMs} ms wall`);

  await sleep(400); // let ready() arm the gate + light the ticks
  const state = await page.evaluate(() => ({
    gateOn: !!document.querySelector('#cot-boot-gate.on'),
    splashUp: !!document.getElementById('cot-boot'),
    ticksLit: document.querySelectorAll('#cot-boot-ticks span.on').length,
    ticksAll: document.querySelectorAll('#cot-boot-ticks span').length,
    ready: window.__GAME_READY === true,
    stageText: (document.getElementById('cot-boot-stage') || {}).textContent || '',
    timings: window.__BOOT_TIMINGS || null,
    bootMs: window.__BOOT_MS || -1,
  }));
  check(mode, 'entry gate armed', state.gateOn, `label "${state.stageText}"`);
  check(mode, 'splash still up while gated', state.splashUp);
  check(mode, 'all stage ticks lit', state.ticksLit === state.ticksAll,
    `${state.ticksLit}/${state.ticksAll}`);
  check(mode, '__GAME_READY not blocked by gate', state.ready);

  await page.keyboard.press('Space');
  // dismiss() removes the root 620 ms after the fade starts, but the
  // post-ready idle work (staged-visual streaming + combat warm) can hold
  // the main thread for seconds in headless — poll rather than spot-check.
  let splashGone = false;
  const dismissDeadline = Date.now() + 10000;
  while (Date.now() < dismissDeadline) {
    splashGone = await page.evaluate(() => !document.getElementById('cot-boot'));
    if (splashGone) break;
    await sleep(250);
  }
  check(mode, 'keypress dismisses splash', splashGone);
  check(mode, 'zero console/page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | '));

  if (state.timings) {
    const rows = Object.entries(state.timings).map(([k, v]) => `${k} ${v}ms`).join(', ');
    console.log(`  [${mode}] stage timings: ${rows}`);
    console.log(`  [${mode}] module boot total: ${state.bootMs} ms`);
  }
  await page.close();
}

// ---------------------------------------------------------------------------
// PASS 2 — harness path: webdriver bypass must still auto-dismiss
// ---------------------------------------------------------------------------
{
  const mode = 'bypass';
  const { page, pageErrors } = await bootPage(false);
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await sleep(900);
  const state = await page.evaluate(() => ({
    splashGone: !document.getElementById('cot-boot'),
    ready: window.__GAME_READY === true,
  }));
  check(mode, 'splash auto-dismissed (no keypress)', state.splashGone);
  check(mode, '__GAME_READY set', state.ready);
  check(mode, 'zero console/page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
await server.close();

console.log(`\n[bootgate-probe] ${checks - failures.length}/${checks} assertions passed`);
if (failures.length) {
  console.error('[bootgate-probe] FAILURES:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
