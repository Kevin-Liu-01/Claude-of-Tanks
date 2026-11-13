// Couch mode end to end (docs/COUCH-MODE.md, phase 1): a desktop page and several phone pages in headless Chromium,
// with the dev server and an in-process pairing service (server/rooms/localPadService.ts). Copyright © 2026 Kevin B. Liu.
//
// The desktop boots to the Garage and asks the pairing service nothing until the Deploy screen's Couch button opens the
// lobby; each phone opens the lobby's link and joins with one Start tap (the time from the link to a live controller is
// the join time); the lobby's Start deploys the seats; each phone's wheel steers its own tank and no other; the latency
// from a phone's event to its tank's input in a desktop frame is measured with every phone linked; a phone that
// vanishes with its throttle held stops its tank. Run alone (one capture ticket, under 20 minutes):
//   node tools/couch-e2e.browser.mjs [--phones=8] [--joinPhones=4] [--samples=40] [--port=5297] [--out=.qa-dev/couch-e2e]
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
// (round 8 Y5 s6-04) the pad's state words from their owners; page functions get them as arguments
import { PAD_PHONE_STATE, PAD_SEAT_STATE } from './pad-states.mjs';
import { createLocalPadService } from '../server/rooms/localPadService.ts';

const root = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const phones = Math.max(2, Math.min(8, Number(arg('phones', 8))));
const samples = Number(arg('samples', 40));
const port = Number(arg('port', 5297));
const outDir = resolve(root, arg('out', '.qa-dev/couch-e2e'));
mkdirSync(outDir, { recursive: true });
const HOLD_MS = 18 * 60 * 1000;
let startedAt = Date.now();
const deadline = () => { if (Date.now() - startedAt > HOLD_MS) throw new Error('couch-e2e: past the 18-minute hold'); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { phones, samples, checks: {}, joinMs: [], latency: {}, errors: { desktop: [], phone: [] } };
const check = (name, ok, detail = '') => {
  report.checks[name] = { ok: !!ok, ...(detail ? { detail } : {}) };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 10) / 10 : null;
};
// deviceorientation (β, γ) for a phone held in landscape (screen angle 90), turned like a wheel by θ, leaned back 30°
function orientation(wheelDeg, leanDeg = 30, screenDeg = 90) {
  const D = Math.PI / 180;
  const t = wheelDeg * D, l = leanDeg * D, a = screenDeg * D;
  const right = -Math.sin(t) * Math.cos(l), up = Math.cos(t) * Math.cos(l), normal = Math.sin(l);
  const ux = right * Math.cos(a) + up * Math.sin(a), uy = -right * Math.sin(a) + up * Math.cos(a);
  return { beta: Math.asin(uy) / D, gamma: Math.atan2(-ux, normal) / D };
}

const padServer = http.createServer();
const pads = createLocalPadService({ connectLimit: 120 });
padServer.on('upgrade', (request, socket, head) => { if (!pads.handleUpgrade(request, socket, head)) socket.destroy(); });
await new Promise((done) => padServer.listen(0, '127.0.0.1', done));
const padService = `ws://127.0.0.1:${padServer.address().port}`;

let captureHold = null; // the capture hold (tools/capture-hold.mjs openCaptureHold: refresh, cap, signals, release at exit)
let vite = null;
let browser = null;
let phoneBrowser = null;
try {
  vite = await createServer({ root, cacheDir: resolve(root, '.qa-dev/couch-e2e-vite-cache'), logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await vite.listen();
  for (const path of ['/pad', '/']) {
    await fetch(`http://127.0.0.1:${port}${path}`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(900_000) }).catch(() => {});
  }
  captureHold = await openCaptureHold({ label: 'couch-e2e', timeoutMs: 4 * 60 * 60 * 1000, lockClass: 'timing', command: 'tools/couch-e2e.browser.mjs' });
  startedAt = Date.now();
  report.loadAtGrant = (await import('node:os')).loadavg().map((v) => Math.round(v));
  const origin = `http://127.0.0.1:${port}`;
  browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120_000, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-angle=metal', '--enable-gpu'] }, { label: 'couch-e2e' });

  // ---- the desktop: boot to the Garage; nothing reaches the pairing service before Couch ----------------------------
  report.step = 'desktop boot';
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1280, height: 720 });
  const desktopRequests = [];
  desktop.on('request', (request) => desktopRequests.push(request.url()));
  desktop.on('pageerror', (error) => report.errors.desktop.push(String(error).slice(0, 300)));
  const cdp = await desktop.target().createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', ({ url }) => desktopRequests.push(url));
  await desktop.goto(`${origin}/?nosplash=1&tier=desktop&padService=${encodeURIComponent(padService)}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  // the one readiness owner (tools/game-readiness.mjs; docs/AUTOMATION-PATHS.md), as pad-e2e waits
  await desktop.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
  check('unopened: nothing reaches the pairing service', !desktopRequests.some((url) => url.startsWith(padService) || url.startsWith(padService.replace('ws:', 'http:'))));
  deadline();

  // ---- the lobby ----------------------------------------------------------------------------------------------------
  report.step = 'lobby';
  await desktop.evaluate(() => document.querySelector('[data-battle-couch]')?.click());
  await desktop.waitForFunction(() => /^[A-Z0-9]{3} [A-Z0-9]{3}$/.test(document.querySelector('.cot-couch-code')?.textContent ?? ''), { timeout: 60_000 });
  const code = (await desktop.$eval('.cot-couch-code', (el) => el.textContent)).replace(/\s/g, '');
  check('Couch opens a lobby with a code and its QR', await desktop.$eval('.cot-couch-qr', (el) => !!el.dataset.url || el.querySelector('path') !== null), code);

  // ---- the phones -----------------------------------------------------------------------------------------------------
  report.step = 'phones';
  phoneBrowser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120_000, protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'couch-e2e-phones' });
  const pages = [];
  for (let i = 0; i < phones; i++) {
    deadline();
    const page = await phoneBrowser.newPage();
    page.on('pageerror', (error) => report.errors.phone.push(`phone ${i + 1}: ${String(error).slice(0, 300)}`));
    await page.emulate({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true },
    });
    // the join time: the QR's link opened to a live controller (one Start tap)
    const opened = Date.now();
    await page.goto(`${origin}/pad?padService=${encodeURIComponent(padService)}#${code}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForSelector('.pad-form button[type="submit"]', { timeout: 240_000 });
    await page.tap('.pad-form button[type="submit"]');
    await page.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(0));
    await page.waitForFunction((live) => window.__COT_PAD_PHONE?.state === live, { timeout: 60_000 }, PAD_PHONE_STATE.live);
    report.joinMs.push(Date.now() - opened);
    const seat = Number(/(\d+)/.exec(await page.$eval('.pad-link', (el) => el.textContent))?.[1] ?? 0);
    pages.push({ page, seat });
  }
  check('every phone joins with one Start tap and names its seat', pages.every((p, i) => p.seat === i + 1), pages.map((p) => p.seat).join(','));
  check('the first four phones each join in under 20 s', report.joinMs.slice(0, 4).every((ms) => ms < 20_000), report.joinMs.map((ms) => `${(ms / 1000).toFixed(1)} s`).join(', '));
  await desktop.bringToFront();
  await desktop.waitForFunction((n, here) => document.querySelectorAll(`.cot-couch-seat[data-state="${here}"]`).length === n, { timeout: 30_000 },
    phones, PAD_SEAT_STATE.here);
  check('the lobby lights every seat', true, `${phones} seats`);
  await (await desktop.$('.cot-couch-modal'))?.screenshot({ path: resolve(outDir, 'desktop-lobby.png') });

  // ---- the battle -----------------------------------------------------------------------------------------------------
  report.step = 'battle';
  if (phones > 4) await desktop.evaluate(() => document.querySelector('.cot-couch-sides [data-value="teams"]')?.click());
  await desktop.evaluate(() => document.querySelector('.cot-couch-modal .cot-c-btn--primary')?.click());
  // the countdown over in the couch battle (controlsReleased: the lifecycle's own state, not the phase and the countdown)
  await desktop.waitForFunction(`${readinessExpression('controlsReleased')} && !!window.__DEBUG?.game?.couch`,
    { timeout: 300_000, polling: 250 });
  const seated = await desktop.evaluate(() => window.__DEBUG.game.couch.seats.map(({ seat, entity }) => ({ seat, id: entity.id, team: entity.team, bot: !!entity.aiCtl })));
  report.seated = seated;
  check('every seat drives a tank of the battle, none of them a bot', seated.length === phones && seated.every((s) => !s.bot),
    seated.map((s) => `${s.seat}:${s.team}`).join(' '));
  check('a couch battle never becomes a multiplayer session', await desktop.evaluate(() => !document.querySelector('.cot-mp-strip, .cot-net-strip')
    && !performance.getEntriesByType('resource').some((entry) => /\/rooms\//.test(entry.name))));
  await sleep(1500);
  await desktop.screenshot({ path: resolve(outDir, 'desktop-battle.png') });
  deadline();

  // each phone's wheel steers its own tank and no other
  report.step = 'isolation';
  const steerOf = () => desktop.evaluate(() => Object.fromEntries(window.__DEBUG.game.couch.seats.map(({ seat, entity }) => [seat, entity.input.steer])));
  let isolated = true;
  const crossTalk = [];
  for (const { page, seat } of pages) {
    await page.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(30));
    await desktop.waitForFunction((n) => Math.abs(window.__DEBUG.game.couch.seats.find((s) => s.seat === n)?.entity.input.steer ?? 0) > 0.2, { timeout: 5000 }, seat).catch(() => {});
    const steer = await steerOf();
    for (const [other, value] of Object.entries(steer)) {
      if (Number(other) === seat ? Math.abs(value) <= 0.2 : Math.abs(value) > 0.05) { isolated = false; crossTalk.push(`${seat}->${other}:${value.toFixed(2)}`); }
    }
    await page.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(0));
    await desktop.waitForFunction((n) => Math.abs(window.__DEBUG.game.couch.seats.find((s) => s.seat === n)?.entity.input.steer ?? 1) < 0.05, { timeout: 5000 }, seat).catch(() => {});
  }
  check('each phone steers its own tank and no other', isolated, crossTalk.join(' ') || `${pages.length} phones`);

  // ---- latency with every phone linked ------------------------------------------------------------------------------
  report.step = 'latency';
  await desktop.evaluate(() => {
    window.__couchWatch = null;
    const loop = () => {
      const watch = window.__couchWatch;
      if (watch && !watch.hit) {
        const steer = window.__DEBUG.game.couch?.seats.find((s) => s.seat === watch.seat)?.entity.input.steer ?? 0;
        if (Math.sign(steer) === Math.sign(watch.target) && Math.abs(steer) > 0.2) watch.hit = performance.timeOrigin + performance.now();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const values = [];
  const parts = { send: [], link: [] };
  for (let i = 0; i < samples; i++) {
    deadline();
    const { page, seat } = pages[i % pages.length];
    const right = Math.floor(i / pages.length) % 2 === 0;
    await desktop.evaluate((s, target) => { window.__couchWatch = { seat: s, target, hit: null }; }, seat, right ? -0.5 : 0.5);
    const sentAt = await page.evaluate((o) => {
      const at = performance.timeOrigin + performance.now();
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma }));
      return at;
    }, orientation(right ? 30 : -30));
    const hit = await desktop.waitForFunction(() => window.__couchWatch.hit, { timeout: 5000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
    if (hit) {
      values.push(hit - sentAt);
      const sent32 = Math.round(sentAt) >>> 0;
      const entry = await desktop.evaluate((s, from) => (window.__COT_PAD_SEATS?.[s]?.trace ?? []).find(([t]) => ((t - from) >>> 0) < 60_000) ?? null, seat, sent32);
      if (entry) { parts.send.push((entry[0] - sent32) | 0); parts.link.push((entry[1] - entry[0]) | 0); }
    }
    await page.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(0));
    await sleep(80 + Math.floor(Math.random() * 120));
  }
  const share = parts.send.map((value, index) => value + (parts.link[index] ?? 0));
  report.latency = { n: values.length, of: samples, p50: pct(values, 0.5), p95: pct(values, 0.95),
    controllerShare: { p50: pct(share, 0.5), p95: pct(share, 0.95) }, send: { p95: pct(parts.send, 0.95) }, link: { p95: pct(parts.link, 0.95) },
    load: (await import('node:os')).loadavg().map(Math.round) };
  console.log(`latency with ${pages.length} phones: n=${values.length}/${samples} p50=${report.latency.p50} p95=${report.latency.p95} ms; controller share p95 ${report.latency.controllerShare.p95} ms; load ${report.latency.load.join(' ')}`);
  check(`the controller's share stays under 60 ms p95 with ${pages.length} phones linked`, values.length >= samples * 0.9 && report.latency.controllerShare.p95 !== null && report.latency.controllerShare.p95 < 60,
    `share p95 ${report.latency.controllerShare.p95} ms; end to end p95 ${report.latency.p95} ms`);

  // ---- a phone that vanishes with its throttle held stops its tank ----------------------------------------------------
  report.step = 'vanish';
  const leaving = pages[pages.length - 1];
  const lever = await leaving.page.$('.pad-lever');
  const box = lever ? await lever.boundingBox() : null;
  if (box) {
    await leaving.page.touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2);
    await leaving.page.touchscreen.touchMove(box.x + box.width / 2, box.y + box.height / 2 - 140);
  }
  const held = await desktop.waitForFunction((n) => (window.__DEBUG.game.couch.seats.find((s) => s.seat === n)?.entity.input.throttle ?? 0) > 0.3, { timeout: 5000 }, leaving.seat).then(() => true).catch(() => false);
  const closedAt = Date.now();
  await leaving.page.close();
  const stopped = await desktop.waitForFunction((n) => (window.__DEBUG.game.couch.seats.find((s) => s.seat === n)?.entity.input.throttle ?? 1) === 0, { timeout: 5000 }, leaving.seat).then(() => true).catch(() => false);
  check('a phone that vanishes with its throttle held stops its tank', held && stopped, `${held ? 'held' : 'never held'}, ${stopped ? `released in ${Date.now() - closedAt} ms` : 'not released'}`);
} catch (error) {
  report.failure = `${report.step}: ${String(error?.stack ?? error).slice(0, 600)}`;
  console.error('couch-e2e failed at', report.step, error);
} finally {
  writeFileSync(resolve(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  try { await phoneBrowser?.close(); } catch { /* gone */ }
  try { await browser?.close(); } catch { /* gone */ }
  try { await vite?.close(); } catch { /* gone */ }
  await pads.close().catch(() => {});
  await new Promise((done) => padServer.close(done));
  await captureHold?.release();
}
const failed = report.failure || Object.values(report.checks).some((entry) => !entry.ok);
console.log(failed ? 'couch-e2e: FAIL' : 'couch-e2e: PASS');
process.exit(failed ? 1 : 0);
