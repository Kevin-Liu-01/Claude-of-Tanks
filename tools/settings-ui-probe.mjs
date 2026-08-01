// tools/settings-ui-probe.mjs — SETTINGS panel visual capture + regression gate
// (settings_ui r2: premium reskin round — owner: "make our settings screen
// look much better too").
//
// Drives the REAL panel in headless Chromium (vite + puppeteer, same pattern
// as pause-probe.mjs) through BOTH contexts:
//
//   garage:  gear click opens the panel — screenshot ALL four tabs, the
//            scrolled CONTROLS list (fade masks), the listening chip, the
//            conflict bar; rebind E2E (chip click -> keypress -> persisted
//            across a full reload -> restored through the UI); tab memory
//            (close on SOUND, reopen -> SOUND); per-tab reset visibility;
//            prefers-reduced-motion disables the panel enter animation.
//   battle:  BATTLE click -> live battle -> Esc pauses — PAUSED tag + LEAVE
//            BATTLE visible, screenshot all four paused tabs, Esc resumes.
//
// Screenshots land in --out (default shots/settings-r2). Exits non-zero on
// any failed assertion or page error.
// Usage: node tools/settings-ui-probe.mjs [--out shots/settings-r2]

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const outArg = process.argv.indexOf('--out');
const SHOT_DIR = path.resolve(
  process.cwd(),
  outArg !== -1 ? process.argv[outArg + 1] : path.join('shots', 'settings-r2'));

const failures = [];
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  PASS ${name}${detail ? ` (${detail})` : ''}`);
  else {
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  // own 74xx-77xx port band (never 5001/5002); hmr/watch OFF so a mid-run
  // source save can never hot-reload the page under the assertions.
  server: {
    port: 7400 + Math.floor(Math.random() * 300),
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
const url = `http://localhost:${server.config.server.port}/?nosplash`;
console.log(`[settings-ui-probe] vite up at ${url}`);
console.log(`[settings-ui-probe] shots -> ${SHOT_DIR}`);
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required'],
});

const width = 1600;
const height = 900;
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
});
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy' })); } catch (_) {}
});

const shot = async (name) => {
  const p = path.join(SHOT_DIR, name);
  await page.screenshot({ path: p });
  console.log(`  shot: ${p}`);
};
const isOpen = () => page.evaluate(() => window.__DEBUG.settings.isOpen());
const clickSel = async (sel) => {
  const r = await page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    // offsetParent is null for position:fixed chrome (gear) — use rect+style
    const cs = getComputedStyle(n);
    const b = n.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || b.width === 0) return null;
    return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }, sel);
  if (!r) throw new Error(`clickSel: ${sel} not visible`);
  await page.mouse.click(r.cx, r.cy);
};
const tabTo = async (tab) => {
  await clickSel(`.cot-set-tab[data-tab="${tab}"]`);
  await sleep(280);
};
const openViaGear = async () => {
  await clickSel('.cot-gear');
  await page.waitForFunction('window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await sleep(350); // enter transition settles
};
const chipInfo = (action, slot) => page.evaluate(({ action, slot }) => {
  const row = document.querySelector(`.cot-set-row[data-action="${action}"]`);
  if (!row) return null;
  const chip = row.querySelectorAll('.cot-chip')[slot];
  const b = chip.getBoundingClientRect();
  return {
    text: chip.textContent, listening: chip.classList.contains('listening'),
    empty: chip.classList.contains('empty'), cx: b.x + b.width / 2, cy: b.y + b.height / 2,
  };
}, { action, slot });

try {
  console.log('\n[settings-ui-probe] === boot -> garage ===');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await sleep(1400);
  check('garage phase up', await page.evaluate(() => window.__DEBUG.game.phase === 'garage'));

  console.log('\n[settings-ui-probe] === garage: four tabs ===');
  await openViaGear();
  check('gear click opens settings', await isOpen());
  check('LEAVE BATTLE hidden in the garage', await page.evaluate(() => {
    const b = document.querySelector('.cot-set-btn.leave');
    return !!b && b.offsetParent === null;
  }));
  check('no PAUSED tag in the garage', await page.evaluate(() => {
    const el = document.querySelector('.cot-set-paused');
    return !!el && getComputedStyle(el).display === 'none';
  }));
  for (const tab of ['controls', 'gameplay', 'sound', 'graphics']) {
    await tabTo(tab);
    await shot(`garage-${tab}.png`);
  }
  // per-tab reset visibility (behavior contract): hidden on GAMEPLAY only
  await tabTo('gameplay');
  check('reset hidden on GAMEPLAY', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.cot-set-btn.reset')).visibility === 'hidden'));
  await tabTo('controls');
  check('reset visible on CONTROLS', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.cot-set-btn.reset')).visibility === 'visible'));

  // scrolled CONTROLS list — fade-mask / scrollbar read
  await page.evaluate(() => {
    const b = document.querySelector('.cot-set-body');
    b.scrollTop = Math.max(0, (b.scrollHeight - b.clientHeight) / 2);
    b.dispatchEvent(new Event('scroll'));
  });
  await sleep(250);
  await shot('garage-controls-scrolled.png');
  const overflow = await page.evaluate(() => {
    const b = document.querySelector('.cot-set-body');
    return { over: b.scrollHeight > b.clientHeight + 1, top: b.scrollTop };
  });
  check('CONTROLS list actually overflows (scroll affordance in play)', overflow.over,
    `scrollTop=${overflow.top.toFixed(0)}`);
  await page.evaluate(() => {
    const b = document.querySelector('.cot-set-body');
    b.scrollTop = 0;
    b.dispatchEvent(new Event('scroll'));
  });
  await sleep(150);

  console.log('\n[settings-ui-probe] === rebind E2E (handbrake primary) ===');
  const orig = await page.evaluate(() => window.__DEBUG.input.getBinding('handbrake', 0));
  check('handbrake primary starts bound', !!orig, `code=${orig}`);
  let ci = await chipInfo('handbrake', 0);
  await page.mouse.click(ci.cx, ci.cy);
  await sleep(150);
  ci = await chipInfo('handbrake', 0);
  check('chip click enters listening state', ci.listening, `text="${ci.text}"`);
  await shot('rebind-listening.png');
  await page.keyboard.press('KeyJ');
  await sleep(150);
  const afterBind = await page.evaluate(() => window.__DEBUG.input.getBinding('handbrake', 0));
  ci = await chipInfo('handbrake', 0);
  check('keypress rebinds handbrake -> KeyJ', afterBind === 'KeyJ' && !ci.listening,
    `binding=${afterBind} chip="${ci.text}"`);

  // persistence: full reload, reopen, same binding
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await sleep(1400);
  const persisted = await page.evaluate(() => window.__DEBUG.input.getBinding('handbrake', 0));
  check('rebind persists across reload', persisted === 'KeyJ', `binding=${persisted}`);
  await openViaGear();
  await tabTo('controls');
  ci = await chipInfo('handbrake', 0);
  check('persisted binding renders on the chip', ci && ci.text.toUpperCase() === 'J',
    `chip="${ci && ci.text}"`);
  await shot('rebind-persisted.png');

  // conflict flow: bind handbrake primary onto W (forward primary) -> bar
  await page.mouse.click(ci.cx, ci.cy);
  await sleep(120);
  await page.keyboard.press('KeyW');
  await sleep(200);
  const conflictUp = await page.evaluate(() => ({
    bar: document.querySelector('.cot-set-conflict').classList.contains('show'),
    rows: document.querySelectorAll('.cot-set-row.conflict').length,
  }));
  check('conflict bar + row highlights on duplicate key', conflictUp.bar && conflictUp.rows === 2,
    `bar=${conflictUp.bar} rows=${conflictUp.rows}`);
  await shot('rebind-conflict.png');
  await clickSel('.cot-set-conflict .dismiss');
  await sleep(150);
  const afterDismiss = await page.evaluate(() => ({
    bar: document.querySelector('.cot-set-conflict').classList.contains('show'),
    hb: window.__DEBUG.input.getBinding('handbrake', 0),
    fw: window.__DEBUG.input.getBinding('forward', 0),
  }));
  check('conflict cancel leaves both bindings untouched',
    !afterDismiss.bar && afterDismiss.hb === 'KeyJ' && afterDismiss.fw === 'KeyW',
    `hb=${afterDismiss.hb} fw=${afterDismiss.fw}`);

  // restore the original binding THROUGH the UI (second E2E pass)
  ci = await chipInfo('handbrake', 0);
  await page.mouse.click(ci.cx, ci.cy);
  await sleep(120);
  await page.keyboard.press(orig); // 'Space'
  await sleep(150);
  const restored = await page.evaluate(() => window.__DEBUG.input.getBinding('handbrake', 0));
  check('UI rebind restores the original key', restored === orig, `binding=${restored}`);

  console.log('\n[settings-ui-probe] === tab memory + reduced motion ===');
  await tabTo('sound');
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await openViaGear();
  check('panel reopens on the last tab (SOUND)', await page.evaluate(() =>
    document.querySelector('.cot-set-tab.sel').dataset.tab === 'sound'));
  const animOn = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.cot-set-panel')).animationName);
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await openViaGear();
  const animReduced = await page.evaluate(() => ({
    panel: getComputedStyle(document.querySelector('.cot-set-panel')).animationName,
    veil: getComputedStyle(document.querySelector('.cot-settings')).animationName,
  }));
  console.log(`  info: panel animation normal="${animOn}" reduced="${animReduced.panel}"`);
  check('reduced motion disables the panel enter animation',
    animReduced.panel === 'none' && animReduced.veil === 'none',
    `panel=${animReduced.panel} veil=${animReduced.veil}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await page.emulateMediaFeatures([]);

  console.log('\n[settings-ui-probe] === battle: paused variant ===');
  await clickSel('.cot-battle');
  await page.waitForFunction('window.__DEBUG.game.phase === "battle"', { timeout: 20000 });
  try {
    await page.waitForFunction('!document.querySelector(".cot-bl.on")', { timeout: 20000 });
  } catch (_) { /* battle-load overlay id may differ; flyby sleep below covers it */ }
  await sleep(4200); // battle-open flyby
  await page.keyboard.press('Escape');
  await page.waitForFunction('window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await sleep(400);
  const pausedState = await page.evaluate(() => ({
    pausedClass: document.querySelector('.cot-settings').classList.contains('paused'),
    tag: getComputedStyle(document.querySelector('.cot-set-paused')).display !== 'none',
    leave: (() => {
      const b = document.querySelector('.cot-set-btn.leave');
      return !!b && b.offsetParent !== null;
    })(),
    paused: window.__DEBUG.pauseInfo.paused,
  }));
  check('battle Esc pauses with PAUSED tag', pausedState.pausedClass && pausedState.tag && pausedState.paused,
    JSON.stringify(pausedState));
  check('LEAVE BATTLE visible in battle', pausedState.leave);
  for (const tab of ['controls', 'gameplay', 'sound', 'graphics']) {
    await tabTo(tab);
    await shot(`battle-paused-${tab}.png`);
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await page.waitForFunction('window.__DEBUG.pauseInfo.paused === false', { timeout: 2500 });
  check('Esc resumes the battle', true);

  check('no page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | ') || 'clean');
} catch (err) {
  failures.push(`CRASHED: ${err.message}`);
  console.error(`[settings-ui-probe] CRASHED: ${err.stack || err.message}`);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n[settings-ui-probe] ${checks} checks, ${failures.length} failures`);
for (const f of failures) console.error(`  FAILED: ${f}`);
process.exit(failures.length ? 1 : 0);
