#!/usr/bin/env node
// hud-chase-bands.browser.mjs — records the HUD bands the chase framing reads from the live game (battle-camera-264;
// hud-bands-live-276). First-party tooling: Kevin B. Liu.
//
// battleHudLayout.ts publishes the bands (src/ui/battleSight.ts: the bottom chrome that never moves with the sight, the
// first battles' controls strip as transient, the head band over the centre column, the layout's rise cap) each relayout.
// This tool reads them where the player sees them: a real solo battle in a built preview (vite preview of `dist`,
// `?debug=1` for window.__DEBUG, whose `battleBands` reads battleSight.ts), at every window the receipts and the UI
// gauntlet use, idle and (mouse windows) with the controls strip, into tools/fixtures/hud-chase-bands.json. Readers:
// src/engine/chaseFraming.selftest.mjs, cameraRig, cameraViewRoundTrip, the pointer sweep (pointerFollowView).
//
// It used to record the DOM-only layout fixture (tools/fixtures/battle-hud-layout.html), which has no camera rig: its
// sight never rose, so a portrait phone's systems row sat where the live game never puts it (the page's right column one
// box at 468-520 px, the game's ~228-520), and every receipt reading the bands judged a HUD that was not the game's.
// The live battle's bands are the fixpoint of the HUD and the camera together (the row's place follows the sight's rise,
// the rise follows the bands), which only the game itself reaches.
//
//   npm run build && node tools/hud-chase-bands.browser.mjs [--check] [--dist=dist] [--sizes=390x844,1210x702t]
//     [--out=<dir>]   (stills of every frame, the rig's framing and the meshes' live screen box, report.json, and the
//     capture itself as fresh.json)
//   node tools/hud-chase-bands.browser.mjs --from=<dir>/fresh.json   (records the fixture from a capture: no browser)
// --check is the fixture's freshness receipt: a fresh live capture against the recorded file through
// tools/hud-chase-bands-drift.mjs (every box within BANDS_DRIFT_PX, 4 px); it writes nothing to the fixture and exits 1
// on any drift. Re-record (without --check) after the HUD's bottom chrome or head band moves. Heavy (a build, WebGL
// battles): run it as one script under `node tools/with-capture-lock.mjs --lock-class=render --`; it takes the lock
// itself as well (nested in a parent's hold).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold, startViteChild } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { BAND_BATTLE, BAND_SIZES, BANDS_DRIFT_PX, bandsDrift } from './hud-chase-bands-drift.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const FIXTURE = new URL('./fixtures/hud-chase-bands.json', import.meta.url);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const arg = (name, fallback = null) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const check = process.argv.includes('--check');
const root = process.cwd();
const dist = resolve(root, arg('dist', 'dist'));
const out = arg('out') ? resolve(arg('out')) : null;
const from = arg('from') ? resolve(arg('from')) : null;
const only = arg('sizes')?.split(',').map((s) => s.replace(/t$/, '')) ?? null;
const sizesToRecord = BAND_SIZES.filter(([w, h]) => !only || only.includes(`${w}x${h}`));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
if (!from && !existsSync(resolve(dist, 'index.html'))) {
  console.error(`hud-chase-bands: no built preview at ${dist} (npm run build first)`);
  process.exit(2);
}
if (out) mkdirSync(out, { recursive: true });

/** In the page: the bands, the sight's rise, the rig's framing and the player's hull box on screen (its meshes' bounds
 *  through the live camera, lens shift included), as the frame stands. */
function readFrame() {
  const D = window.__DEBUG;
  const bands = D?.battleBands ?? null;
  const shift = Number(getComputedStyle(document.body).getPropertyValue('--hud-sight-shift').replace('px', '')) || 0;
  const framing = D?.rig?.framing ?? null;
  let hull = null;
  const visual = D?.game?.player?.visual?.root ?? null, camera = D?.camera ?? null;
  if (visual && camera) {
    const V = camera.position.constructor;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    camera.updateMatrixWorld?.(true);
    visual.updateMatrixWorld?.(true);
    visual.traverse((node) => {
      if (!node.isMesh || !node.visible || !node.geometry) return;
      const g = node.geometry;
      if (!g.boundingBox) g.computeBoundingBox?.();
      const b = g.boundingBox;
      if (!b || !Number.isFinite(b.min.x)) return;
      for (let i = 0; i < 8; i++) {
        const p = new V(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(node.matrixWorld).project(camera);
        if (p.z > 1) continue;
        const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
        box.x0 = Math.min(box.x0, sx); box.x1 = Math.max(box.x1, sx); box.y0 = Math.min(box.y0, sy); box.y1 = Math.max(box.y1, sy);
      }
    });
    if (Number.isFinite(box.x0)) hull = Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]));
  }
  return {
    bands: bands && JSON.parse(JSON.stringify(bands)), shift, phase: D?.game?.phase ?? null,
    framing: framing && { distanceM: framing.distanceM, pivotAboveM: framing.pivotAboveM, sightShiftPx: framing.sightShiftPx, tank: framing.tank, floorPx: framing.floorPx },
    hull, sightY: innerHeight / 2 - shift,
  };
}

/** Polls the bands until three reads 400 ms apart agree (the HUD and the camera have reached their fixpoint). */
async function settledFrame(page, accept, where) {
  let last = null, same = 0;
  for (let i = 0; i < 90; i++) {
    const frame = await page.evaluate(readFrame);
    const key = frame.bands && accept(frame.bands) ? JSON.stringify([frame.bands, frame.shift]) : null;
    same = key && key === last ? same + 1 : 0;
    last = key;
    if (same >= 2) return frame;
    await wait(400);
  }
  throw new Error(`${where}: the bands never settled (last ${last ?? 'none'})`);
}

const sizes = {};
const report = { battle: BAND_BATTLE, commit: execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(), frames: [], errors: [] };
let server = null, browser = null, hold = null;
if (from) {
  const capture = JSON.parse(readFileSync(from, 'utf8'));
  Object.assign(sizes, capture.sizes);
  Object.assign(report, { commit: capture.commit, startedAt: capture.startedAt });
} else try {
  hold = await openCaptureHold({ label: 'hud-chase-bands', place: 'hud-chase-bands', lockClass: 'render', timeoutMs: 90 * 60_000 });
  server = await startViteChild({ root, mode: 'preview', outDir: dist, timeoutMs: 300_000 });
  console.log(`hud-chase-bands: preview ${server.url} (pid ${server.child.pid})`);
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 180_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] }),
  { label: 'hud-chase-bands' });
  console.log(`hud-chase-bands: browser pid ${browser.process()?.pid ?? '?'}`);
  for (const [w, h, touch] of sizesToRecord) {
    const size = `${w}x${h}`;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(`${size}: ${String(error?.message ?? error).slice(0, 240)}`));
    await page.setViewport({ width: w, height: h, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch });
    if (touch) {
      await page.setUserAgent(Math.min(w, h) >= 700 ? IPAD : IPHONE);
      await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]).catch(() => {});
    }
    // a returning player's profile: the tutorial done, the first battles' strip used up (shown on demand for `hints`)
    await page.evaluateOnNewDocument(() => {
      Document.prototype.hasFocus = () => true;
      try {
        localStorage.setItem('cot.telemetry', 'off');
        localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
        localStorage.setItem('cot.tutorial.v1', '{"v":2,"garage":"skipped","training":"skipped","debrief":"skipped","tour":"skipped","offer":"later"}');
        localStorage.setItem('cot.battle.hints.v2', JSON.stringify({ battles: 3, learned: [] }));
      } catch { /* none */ }
    });
    await page.goto(`${server.url}/?nosplash=1&telemetry=off&debug=1&tier=${touch ? 'mobile' : 'desktop'}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
    await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, BAND_BATTLE);
    await page.waitForFunction(readinessExpression('controlsReleased'), { timeout: 900_000, polling: 250 });
    // (a dev build holds the battle still; a public build has no hold, and the first seconds after the countdown are
    // quiet enough: the bots are a map away)
    await page.evaluate(() => { try { window.__DEBUG.battleHold?.set(true); } catch { /* public build */ } });
    for (const state of touch ? ['idle'] : ['idle', 'hints']) {
      if (state === 'hints') await page.evaluate(() => window.__DEBUG.settings.showHints());
      const frame = await settledFrame(page, (b) => b.width === w && b.height === h && (state === 'hints' ? !!b.transient?.length : !b.transient?.length), `${size} ${state}`);
      (sizes[size] ??= {})[state] = frame.bands;
      const file = out ? `${size}${touch ? 't' : ''}-${state}.png` : null;
      if (file) {
        // (the still without ?debug=1's diagnostics bar, which is no HUD band: hidden for the shot only)
        const hidden = await page.evaluate(() => {
          const label = [...document.querySelectorAll('body *')].find((n) => !n.children.length && /^\s*battle diagnostics\s*$/i.test(n.textContent ?? ''));
          let bar = label;
          while (bar && bar !== document.body && getComputedStyle(bar).position !== 'fixed') bar = bar.parentElement;
          if (!bar || bar === document.body) return false;
          bar.dataset.bandsHidden = bar.style.visibility;
          bar.style.visibility = 'hidden';
          return true;
        });
        await wait(120);
        await page.screenshot({ path: resolve(out, file) });
        if (hidden) await page.evaluate(() => { for (const n of document.querySelectorAll('[data-bands-hidden]')) { n.style.visibility = n.dataset.bandsHidden; delete n.dataset.bandsHidden; } });
      }
      // The roof against the sight is the rig's own tank box (the hull's top); the meshes' box also holds the gun and the
      // fittings, so its top stands well above the roof and is kept as a cross-check only.
      const tank = frame.framing?.tank;
      report.frames.push({ size, touch, state, file, phase: frame.phase, shift: frame.shift, sightY: frame.sightY, framing: frame.framing, meshBox: frame.hull,
        roofBelowSightPx: tank ? Math.round(tank.y0 - frame.sightY) : null });
      console.log(`${size}${touch ? 't' : ''} ${state}: ${frame.bands.floor.length} floor boxes, ${frame.bands.transient?.length ?? 0} transient, ceiling ${frame.bands.ceiling}, `
        + `rise cap ${frame.bands.riseCap ?? 'none'}; sight ${frame.sightY} (rise ${frame.shift}), roof ${frame.framing?.tank ? Math.round(frame.framing.tank.y0) : "?"}`);
    }
    await context.close();
  }
} catch (error) {
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  await Promise.race([browser?.close().catch(() => {}), wait(15_000)]);
  try { browser?.process()?.kill('SIGKILL'); } catch { /* closed */ }
  await Promise.race([server?.close().catch(() => {}), wait(15_000)]);
  await hold?.release();
  report.finishedAt = new Date().toISOString();
  if (out && !from) {
    writeFileSync(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(resolve(out, 'fresh.json'), `${JSON.stringify({ commit: report.commit, startedAt: report.startedAt, sizes }, null, 2)}\n`);
  }
}
if (process.exitCode) process.exit(process.exitCode);

const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8'));
if (check) {
  // (a partial run checks only the sizes it captured)
  const against = only ? Object.fromEntries(Object.entries(recorded.sizes).filter(([k]) => sizes[k])) : recorded.sizes;
  const drift = bandsDrift(against, sizes);
  for (const d of drift) console.log(`  ${d.size} ${d.state}: ${d.what}`);
  if (out) writeFileSync(resolve(out, 'check.json'), `${JSON.stringify({ commit: report.commit, tolerancePx: BANDS_DRIFT_PX, drift }, null, 2)}\n`);
  console.log(drift.length ? `hud-chase-bands: stale, ${drift.length} bands moved past ${BANDS_DRIFT_PX} px from the live game; re-record without --check`
    : `hud-chase-bands: the recorded bands hold within ${BANDS_DRIFT_PX} px of the live game`);
  process.exit(drift.length ? 1 : 0);
}
const merged = only ? { ...recorded.sizes, ...sizes } : sizes;
const note = `battleHudLayout's published chase bands (src/ui/battleSight.ts: the bottom chrome that never moves with the sight, the first battles' `
  + `controls strip as transient, the head band over the centre column and the layout's rise cap) in a live solo battle (${BAND_BATTLE.specId}, `
  + `${BAND_BATTLE.mapId}, ${BAND_BATTLE.gameMode}) on a built preview, idle and with the controls strip at the mouse windows (touch windows with `
  + `touch emulation and a coarse pointer); recorded by tools/hud-chase-bands.browser.mjs at ${report.commit} on ${report.startedAt.slice(0, 10)} `
  + '(hud-bands-live-276). Its --check is the freshness receipt.';
// one band per line: a re-recording reads as a diff of the boxes that moved
const lines = ['{', `  "note": ${JSON.stringify(note)},`, '  "source": "live",', '  "sizes": {'];
const keys = BAND_SIZES.map(([w, h]) => `${w}x${h}`).filter((k) => merged[k]);
keys.forEach((size, i) => {
  lines.push(`    ${JSON.stringify(size)}: {`);
  const states = Object.keys(merged[size]);
  states.forEach((state, j) => lines.push(`      ${JSON.stringify(state)}: ${JSON.stringify(merged[size][state])}${j < states.length - 1 ? ',' : ''}`));
  lines.push(`    }${i < keys.length - 1 ? ',' : ''}`);
});
lines.push('  }', '}');
writeFileSync(FIXTURE, `${lines.join('\n')}\n`);
console.log(`hud-chase-bands: recorded ${keys.length} sizes from the live game`);
process.exit(0);
