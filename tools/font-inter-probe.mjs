// font-inter-probe.mjs — verification harness for the Archivo→Inter swap
// (owner-directed: rsms/inter v4.1 variable, UI weight floor 500 — see
// docs/ATTRIBUTION.md). Boots its own vite on a 7xxx port, captures: boot
// splash, garage, settings, tech tree, staged battle HUD (player_view /
// sniper_view), killcam x-ray card, live-battle results report — and audits:
// webfont actually rendering (canvas metric vs monospace), every usage weight
// resolving (500/600/700/800), FOUT on the splash wordmark, computed-stack
// coverage (zero non-Inter text), the WEIGHT FLOOR (no visible text below
// 500 — Inter renders nothing at book/regular), zero Archivo faces, and
// clipped/overflowing labels (Inter has no width axis: the former condensed
// layer runs wider, so every screen gets an overflow scan).
// Usage: node tools/font-inter-probe.mjs [--out shots/font-inter]
// Reuses the fleet's FIFO ticket lock so parallel harnesses never share the GPU.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync, utimesSync } from 'node:fs';
import { resolve, join } from 'node:path';

// --- exclusive run lock (same protocol as tools/screenshot.mjs) -------------
const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;
function ticketPid(name) { const m = name.match(/-(\d+)\.t$/); return m ? parseInt(m[1], 10) : -1; }
function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const myTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, myTicket), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch (_) { names = [myTicket]; }
      for (const n of names) {
        if (n === myTicket) { head = head || n; break; }
        let stale = false;
        try { stale = Date.now() - statSync(join(QUEUE_DIR, n)).mtimeMs > TICKET_STALE_MS; } catch (_) { continue; }
        if (stale || !ticketAlive(n)) { try { unlinkSync(join(QUEUE_DIR, n)); } catch (_) { /* raced */ } continue; }
        head = n; break;
      }
      if (head === myTicket) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { try { rmdirSync(LOCK_DIR); } catch (e) { if (e.code === 'ENOTDIR') unlinkSync(LOCK_DIR); else throw e; } continue; }
        } catch (_) { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((r) => setTimeout(r, head === myTicket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, myTicket)); } catch (_) { /* fine */ }
  }
}
function releaseLock() { if (!lockHeld) return; lockHeld = false; try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ } }
await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => { try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ } }, 60 * 1000);
lockRefresher.unref();

// --- server + browser --------------------------------------------------------
const args = process.argv.slice(2);
function opt(name, fallback) { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; }
const outDir = resolve(opt('out', 'shots/font-inter'));
mkdirSync(outDir, { recursive: true });

const port = 7100 + Math.floor(Math.random() * 400); // font agent's own 7xxx range
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
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
console.log(`[font-probe] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const FONT_PROBE_JS = `(() => {
  const c = document.createElement('canvas').getContext('2d');
  const S = 'Hamburgefonstiv RELOAD 0123456789';
  const w = (f) => { c.font = f; return c.measureText(S).width; };
  return {
    checkI500: document.fonts.check('500 16px Inter'),
    checkI600: document.fonts.check('600 16px Inter'),
    checkI700: document.fonts.check('700 16px Inter'),
    checkI800: document.fonts.check('800 16px Inter'),
    // monospace is the discriminator: if Inter resolved, the stacked
    // measure must differ from bare monospace.
    wInter: w('500 32px Inter, monospace'),
    wMono: w('500 32px monospace'),
    wArial: w('500 32px Arial'),
    // the wght axis must actually vary advances/rendering: 800 vs 500
    wInter800: w('800 32px Inter, monospace'),
  };
})()`;

// visible text elements whose content box clips: the classic "new font runs
// wider" casualty — critical here because Inter replaces a 79%-width face.
// scrollWidth is int-rounded, so tolerate 1px.
const OVERFLOW_SCAN_JS = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility || !el.checkVisibility()) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'scroll' || cs.overflowX === 'auto') continue;
    if (cs.textOverflow === 'ellipsis') continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) continue;
    const dw = el.scrollWidth - el.clientWidth;
    const dh = el.scrollHeight - el.clientHeight;
    if ((cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.whiteSpace === 'nowrap') && (dw > 1 || dh > 2)) {
      bad.push({ cls: String(el.className).slice(0, 60), text: el.textContent.trim().slice(0, 40), dw, dh });
    }
  }
  return bad.slice(0, 25);
})()`;

// weight floor 500: no visible text may compute below 500 (the type mandate —
// body/default sits at medium, hierarchy 600/700/800).
const FLOOR_SCAN_JS = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility || !el.checkVisibility()) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) continue;
    const w = parseInt(getComputedStyle(el).fontWeight, 10);
    if (w < 500) bad.push({ w, cls: String(el.className).slice(0, 60), text: el.textContent.trim().slice(0, 40) });
  }
  return bad.slice(0, 25);
})()`;

// computed-stack audit: every visible text element must resolve an Inter stack
const AUDIT_JS = `(() => {
  const bad = new Map(); let total = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (!el.textContent || !el.textContent.trim()) continue;
    if (!el.checkVisibility || !el.checkVisibility()) continue;
    total++;
    if (!/Inter/i.test(cs.fontFamily)) bad.set(cs.fontFamily, (bad.get(cs.fontFamily) || 0) + 1);
  }
  return { total, nonInter: [...bad.entries()] };
})()`;

const out = { screens: [] };
let failed = false;
async function snap(name) {
  // concurrent sessions editing src/ can 500 an unrelated lazy import and
  // vite parks its error overlay over the page — strip it, it is not ours.
  await page.evaluate(
    `document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove())`
  ).catch(() => {});
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file });
  out.screens.push(file);
  console.log(`[font-probe] captured ${file}`);
}

try {
  // -------- 1. BOOT SPLASH (pre-ready paint; FOUT check) --------
  // warm dep cache makes boot sub-second — throttle the CPU so the splash
  // actually holds still long enough to photograph, like a first visit would.
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      break;
    } catch (err) {
      if (attempt >= 1) throw err;
      console.warn(`[font-probe] load attempt failed (${err.message}) — retrying`);
      consoleErrors.length = 0;
    }
  }
  await page.waitForSelector('#cot-boot', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 450));
  out.splashFonts = await page.evaluate(FONT_PROBE_JS);
  out.splashStillUp = await page.evaluate(
    `(() => { const b = document.getElementById('cot-boot'); return !!b && !b.classList.contains('cot-boot-out'); })()`
  );
  await snap('01_boot_splash');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // -------- 2. READY + global font state --------
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate('document.fonts.ready.then(() => true)');
  out.readyFonts = await page.evaluate(FONT_PROBE_JS);
  out.loadedFaces = await page.evaluate(
    '[...document.fonts].map((f) => `${f.family} ${f.weight} ${f.stretch} ${f.status}`)'
  );

  // -------- 2b. SETTINGS (real garage phase — gear hides in shot mode) --------
  const gearOpened = await page.evaluate(`(() => {
    const g = document.querySelector('.cot-gear');
    if (!g || getComputedStyle(g).display === 'none') return false;
    g.click();
    return true;
  })()`);
  if (gearOpened) {
    await new Promise((r) => setTimeout(r, 500));
    await snap('03_settings');
    out.settingsOverflow = await page.evaluate(OVERFLOW_SCAN_JS);
    out.settingsFloor = await page.evaluate(FLOOR_SCAN_JS);
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 350));
  } else {
    out.settingsOverflow = 'gear button not visible in garage phase';
  }

  // -------- 3. GARAGE --------
  await page.evaluate(() => window.__SHOTS.set('garage'));
  await page.waitForFunction(
    `(() => {
      const s = window.__GLB_STATS;
      if (!s) return true;
      const key = s.settled + '/' + s.started;
      if (s.settled < s.started) { window.__GLB_STABLE_SHOT = null; return false; }
      if (!window.__GLB_STABLE_SHOT || window.__GLB_STABLE_SHOT.key !== key) {
        window.__GLB_STABLE_SHOT = { key, at: performance.now() };
        return false;
      }
      return performance.now() - window.__GLB_STABLE_SHOT.at > 800;
    })()`,
    { timeout: 20000, polling: 200 },
  ).catch(() => console.warn('[font-probe] garage GLB queue did not settle — capturing anyway'));
  await new Promise((r) => setTimeout(r, 1200));
  await snap('02_garage');
  out.garageAudit = await page.evaluate(AUDIT_JS);
  out.garageOverflow = await page.evaluate(OVERFLOW_SCAN_JS);
  out.garageFloor = await page.evaluate(FLOOR_SCAN_JS);

  // -------- 5. TECH TREE --------
  await page.evaluate(() => window.__SHOTS.set('techtree'));
  await new Promise((r) => setTimeout(r, 1500));
  await snap('04_techtree');
  out.techtreeOverflow = await page.evaluate(OVERFLOW_SCAN_JS);
  out.techtreeFloor = await page.evaluate(FLOOR_SCAN_JS);

  // -------- 6. STAGED BATTLE HUD --------
  await page.evaluate(() => window.__SHOTS.set('player_view'));
  await new Promise((r) => setTimeout(r, 1500));
  await snap('05_hud_player_view');
  out.hudAudit = await page.evaluate(AUDIT_JS);
  out.hudOverflow = await page.evaluate(OVERFLOW_SCAN_JS);
  out.hudFloor = await page.evaluate(FLOOR_SCAN_JS);

  await page.evaluate(() => window.__SHOTS.set('sniper_view'));
  await new Promise((r) => setTimeout(r, 1200));
  await snap('06_hud_sniper_view');

  // -------- 7. KILLCAM X-RAY CARD --------
  await page.evaluate(() => window.__SHOTS.set('killcam_xray'));
  await new Promise((r) => setTimeout(r, 1800));
  await snap('07_killcam_xray');
  out.killcamOverflow = await page.evaluate(OVERFLOW_SCAN_JS);

  // -------- 8. LIVE BATTLE -> RESULTS REPORT --------
  const battleUp = await page.evaluate(() => {
    try {
      const g = window.__DEBUG.game;
      const id = g.tankById.has('m1a2') ? 'm1a2' : [...g.tankById.keys()][0];
      window.__DEBUG.shotMode = false;
      window.__DEBUG.startBattle(id);
      return id;
    } catch (e) { return 'ERR:' + e.message; }
  });
  out.battleTank = battleUp;
  if (battleUp && !String(battleUp).startsWith('ERR:')) {
    await new Promise((r) => setTimeout(r, 5000));
    await page.evaluate(() => window.__DEBUG.slayEnemies && window.__DEBUG.slayEnemies(99));
    const endShown = await page.waitForFunction(
      `(() => { const e = document.querySelector('.cot-end'); return !!e && e.style.display === 'flex'; })()`,
      { timeout: 30000, polling: 300 },
    ).then(() => true).catch(() => false);
    out.resultsReached = endShown;
    await new Promise((r) => setTimeout(r, 1500)); // report panels ease in
    await snap('08_results_report');
    if (endShown) {
      out.resultsOverflow = await page.evaluate(OVERFLOW_SCAN_JS);
      out.resultsFloor = await page.evaluate(FLOOR_SCAN_JS);
    }
  }
} catch (err) {
  failed = true;
  console.error(`[font-probe] FAILED: ${err.message}`);
} finally {
  writeFileSync(`${outDir}/font-probe-report.json`, JSON.stringify(out, null, 2));
  console.log(`[font-probe] report -> ${outDir}/font-probe-report.json`);
  if (consoleErrors.length) {
    console.error(`[font-probe] page console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 20)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}

// verdicts the orchestrator cares about
const r = out.readyFonts || {};
const floors = [out.settingsFloor, out.garageFloor, out.techtreeFloor, out.hudFloor, out.resultsFloor]
  .filter((f) => Array.isArray(f));
const verdicts = {
  webfontRenders: r.wInter > 0 && Math.abs(r.wInter - r.wMono) > 0.5,
  weightAxisLive: r.wInter800 > 0 && Math.abs(r.wInter800 - r.wInter) > 0.5,
  allWeightsResolve: !!(r.checkI500 && r.checkI600 && r.checkI700 && r.checkI800),
  splashHadWebfont: !!(out.splashFonts && out.splashFonts.checkI800),
  weightFloorClean: floors.length > 0 && floors.every((f) => f.length === 0),
  zeroArchivoFaces: !!(out.loadedFaces && !out.loadedFaces.some((f) => /Archivo/i.test(f))),
};
console.log('[font-probe] verdicts:', JSON.stringify(verdicts));
process.exit(
  failed || !verdicts.webfontRenders || !verdicts.allWeightsResolve ||
  !verdicts.splashHadWebfont || !verdicts.weightFloorClean || !verdicts.zeroArchivoFaces
    ? 1 : 0,
);
