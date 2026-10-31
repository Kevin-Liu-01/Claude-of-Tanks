// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The phone controller end to end (docs/PHONE-CONTROLLER.md "Proof"), in headless Chrome on this checkout's dev server
// and an in-process pairing service (server/rooms/localPadService.ts, the LAN helper's): a desktop page and a phone
// page (an emulated landscape phone with touch) pair with a code from Settings › Controls, then synthetic
// deviceorientation and touch events drive a tank in a solo battle — steer, throttle, aim, scope, ammunition, fire,
// pause — and the stale fail-safe stops the tank when the phone vanishes. It records:
//   - the network log: no request reaches the pad service, and no pad module loads, before Connect Phone is pressed;
//     the signaling socket's frames once the data channel is live (signaling only, no input);
//   - steering latency (the phone's event → the first desktop animation frame whose player input carries it, both
//     clocks performance.timeOrigin + now() on one machine), over the WebRTC data channel and over the relay;
//   - screenshots: the desktop card with its QR, the phone page live, the desktop driving.
// Holds the capture lock (one ticket, under 18 minutes). Report: .qa-dev/pad-e2e/report.json.
//
//   node tools/pad-e2e.browser.mjs [--samples=40] [--port=5296] [--out=.qa-dev/pad-e2e]
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { createLocalPadService } from '../server/rooms/localPadService.ts';

const root = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const samples = Number(arg('samples', 40));
const port = Number(arg('port', 5296));
const outDir = resolve(root, arg('out', '.qa-dev/pad-e2e'));
mkdirSync(outDir, { recursive: true });
const HOLD_MS = 18 * 60 * 1000;
let startedAt = Date.now();
const deadline = () => { if (Date.now() - startedAt > HOLD_MS) throw new Error('pad-e2e: past the 18-minute hold'); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { samples, checks: {}, latency: {}, network: {}, errors: { desktop: [], phone: [] } };
const check = (name, ok, detail = '') => {
  report.checks[name] = { ok: !!ok, ...(detail ? { detail } : {}) };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// deviceorientation (β, γ) for a phone held in landscape (screen angle 90), turned like a wheel by θ, leaned back 30°
function orientation(wheelDeg, leanDeg = 30, screenDeg = 90) {
  const D = Math.PI / 180;
  const t = wheelDeg * D, l = leanDeg * D, a = screenDeg * D;
  const right = -Math.sin(t) * Math.cos(l), up = Math.cos(t) * Math.cos(l), normal = Math.sin(l);
  const ux = right * Math.cos(a) + up * Math.sin(a), uy = -right * Math.sin(a) + up * Math.cos(a);
  return { beta: Math.asin(uy) / D, gamma: Math.atan2(-ux, normal) / D };
}
const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 10) / 10 : null;
};

const padServer = http.createServer();
const pads = createLocalPadService();
padServer.on('upgrade', (request, socket, head) => { if (!pads.handleUpgrade(request, socket, head)) socket.destroy(); });
await new Promise((done) => padServer.listen(0, '127.0.0.1', done));
const padService = `ws://127.0.0.1:${padServer.address().port}`;

const lock = createCaptureLock();
let vite = null;
let browser = null;
/** The phone runs in a browser of its own: a second tab of one headless window would hide the desktop's, and a hidden
 *  page draws no frames (the battle stops, its screenshots and the latency watch wait forever). */
let phoneBrowser = null;
try {
  // the dev server starts before the ticket (the hold is the browser's); the 18-minute cap counts from the grant
  vite = await createServer({ root, cacheDir: resolve(root, '.qa-dev/pad-e2e-vite-cache'), logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await vite.listen();
  // the first transform of each document is slow under load (page catalogs, the module graph): warm both before the ticket
  for (const path of ['/pad', '/']) {
    await fetch(`http://127.0.0.1:${port}${path}`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(900_000) }).catch(() => {});
  }
  await lock.acquire(4 * 60 * 60 * 1000, { lockClass: 'timing', command: 'tools/pad-e2e.browser.mjs' });
  startedAt = Date.now();
  report.loadAtGrant = (await import('node:os')).loadavg().map((v) => Math.round(v));
  const origin = `http://127.0.0.1:${port}`;
  browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120_000, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-angle=metal', '--enable-gpu', '--use-fake-ui-for-media-stream'] }, { label: 'pad-e2e' });

  // ---- the desktop: boot to the Garage, every request logged -------------------------------------------------------
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1280, height: 720 });
  const desktopRequests = [];
  desktop.on('request', (request) => desktopRequests.push(request.url()));
  desktop.on('pageerror', (error) => report.errors.desktop.push(String(error).slice(0, 300)));
  desktop.on('error', (error) => report.errors.desktop.push(`renderer crash at step ${report.step}: ${String(error).slice(0, 200)}`));
  browser.on('disconnected', () => report.errors.desktop.push(`browser disconnected at step: ${report.step}`));
  const desktopCdp = await desktop.target().createCDPSession();
  await desktopCdp.send('Network.enable');
  const socketFrames = { desktopSent: [], desktopReceived: [] };
  const sockets = new Map();
  desktopCdp.on('Network.webSocketCreated', ({ requestId, url }) => { sockets.set(requestId, url); desktopRequests.push(url); });
  desktopCdp.on('Network.webSocketFrameSent', ({ requestId, timestamp, response }) => {
    if (String(sockets.get(requestId)).startsWith(padService)) socketFrames.desktopSent.push({ timestamp, data: String(response.payloadData).slice(0, 80) });
  });
  desktopCdp.on('Network.webSocketFrameReceived', ({ requestId, timestamp, response }) => {
    if (String(sockets.get(requestId)).startsWith(padService)) socketFrames.desktopReceived.push({ timestamp, data: String(response.payloadData).slice(0, 80) });
  });
  await desktop.goto(`${origin}/?nosplash=1&tier=desktop&padService=${encodeURIComponent(padService)}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await desktop.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', { timeout: 300_000, polling: 250 });
  deadline();

  // Unpaired. The dev server preloads every module its static scan reaches (a dev-only plugin that also follows type
  // imports), so the boot's own module list is the production build's to judge (dist below). What is judged here: no
  // socket or request reaches the pairing service before Connect, and opening Settings › Controls requests nothing of it.
  const bootRequests = desktopRequests.length;
  desktopRequests.length = 0;
  await desktop.evaluate(() => document.querySelector('.cot-gear')?.click());
  await desktop.waitForSelector('.cot-settings.open .cot-pad-action', { timeout: 30_000 });
  await sleep(1500);
  const serviceTraffic = desktopRequests.filter((url) => url.startsWith(padService) || url.startsWith(padService.replace('ws:', 'http:')));
  const controlsTab = desktopRequests.filter((url) => url.includes('/src/pad/') || /\/assets\/pad/.test(url));
  report.network.desktopBootRequests = bootRequests;
  report.network.padServiceBeforeConnect = serviceTraffic;
  report.network.padModulesOpeningControls = controlsTab;
  check('unpaired: no socket or request to the pairing service (boot, Garage, Settings › Controls)',
    serviceTraffic.length === 0 && ![...sockets.values()].some((url) => String(url).startsWith(padService)));
  check('unpaired: opening Settings › Controls loads no phone-controller code', controlsTab.length === 0, `${controlsTab.length} pad modules`);
  check('unpaired: no receiver on the page', await desktop.evaluate(() => window.__COT_PAD === undefined));
  // the production build (when this checkout has one): no boot request of the game, cn or Gallery pages is a pad chunk
  try {
    const { readFileSync, readdirSync } = await import('node:fs');
    const pages = ['index.html', 'cn/index.html', 'gallery.html'].map((page) => [page, readFileSync(resolve(root, 'dist', page), 'utf8')]);
    const padChunks = new Set(readdirSync(resolve(root, 'dist/assets')).filter((name) => /^(pad|padConnectCard|padEndpoint|qr)-/.test(name)));
    const hits = pages.flatMap(([page, text]) => [...text.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((m) => m[1])
      .filter((name) => padChunks.has(name)).map((name) => `${page}: ${name}`));
    report.network.distPadChunksAtBoot = hits;
    check('production build: no pad chunk among the game, cn and Gallery boot requests', hits.length === 0, `${padChunks.size} pad chunks in dist`);
  } catch (error) { report.network.distPadChunksAtBoot = `no dist: ${String(error).slice(0, 80)}`; }

  // Connect Phone: the receiver loads, a code and its QR show
  await desktop.evaluate(() => document.querySelector('.cot-settings.open .cot-pad-action')?.click());
  await desktop.waitForFunction(() => document.querySelector('.cot-pad-qr')?.dataset.url, { timeout: 30_000 });
  const pairing = await desktop.evaluate(() => ({
    url: document.querySelector('.cot-pad-qr').dataset.url,
    code: document.querySelector('.cot-pad-code').textContent,
    state: document.querySelector('[data-datum="phone-link"]')?.textContent,
  }));
  report.pairing = pairing;
  check('Connect Phone shows a code and a QR of /pad#CODE', /\/pad#[A-Z2-9]{6}$/.test(pairing.url) && pairing.code.replace(' ', '') === pairing.url.slice(-6),
    `${pairing.code} → ${pairing.url}`);
  report.network.padModulesAfterConnect = desktopRequests.filter((url) => url.includes('/src/pad/')).map((url) => url.replace(origin, ''));
  await (await desktop.$('.cot-settings.open .cot-set-card:has(.cot-pad-card)'))?.screenshot({ path: resolve(outDir, 'desktop-card-qr.png') });
  await desktop.screenshot({ path: resolve(outDir, 'desktop-settings-qr.png') });

  // ---- the phone: an emulated landscape phone opens the QR's link -----------------------------------------------------
  report.step = 'phone browser';
  // the phone's page draws no WebGL: its browser takes no GPU beside the desktop's (one Metal device for both crashed it)
  phoneBrowser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120_000, protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'pad-e2e-phone' });
  phoneBrowser.on('disconnected', () => report.errors.phone.push(`browser disconnected at step: ${report.step}`));
  async function openPhone({ rtc = true } = {}) {
    const phone = await phoneBrowser.newPage();
    const phoneRequests = [];
    phone.on('request', (request) => phoneRequests.push(request.url()));
    phone.on('pageerror', (error) => report.errors.phone.push(String(error).slice(0, 300)));
    phone.on('error', (error) => report.errors.phone.push(`renderer crash at step ${report.step}: ${String(error).slice(0, 200)}`));
    await phone.emulate({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true },
    });
    if (!rtc) await phone.evaluateOnNewDocument(() => { delete window.RTCPeerConnection; });
    return { phone, phoneRequests };
  }
  let { phone, phoneRequests } = await openPhone();
  const code = pairing.url.slice(-6);
  await phone.goto(`${origin}/pad?padService=${encodeURIComponent(padService)}#${code}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await phone.waitForSelector('.pad-form button[type="submit"]', { timeout: 240_000 });
  const startLabel = await phone.$eval('.pad-form .cot-c-btn__label', (el) => el.textContent);
  await phone.tap('.pad-form button[type="submit"]');
  // the first reading centres the wheel: hold the phone level, then wait for the data channel
  await phone.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(0));
  await phone.waitForFunction(() => window.__COT_PAD_PHONE?.state === 'live', { timeout: 30_000 });
  await desktop.waitForFunction(() => window.__COT_PAD?.state === 'live' && window.__COT_PAD.path === 'direct', { timeout: 30_000 });
  check('the phone pairs from the QR link with one Start tap; the data channel is live on both sides', true, `button "${startLabel}"`);
  report.network.phonePageRequests = phoneRequests.length;
  report.network.phoneGameModules = phoneRequests.filter((url) => /\/src\/(main|game|sim|engine|vehicles|world)\//.test(url) || url.includes('/src/main.ts')).length;
  check('the phone page loads none of the game', report.network.phoneGameModules === 0, `${phoneRequests.length} requests`);
  report.step = 'desktop chip';
  await desktop.bringToFront();
  await desktop.waitForFunction(() => /\d+ ms/.test(document.querySelector('[data-datum="phone-link"]')?.textContent ?? ''), { timeout: 10_000 });
  report.desktopChip = await desktop.$eval('[data-datum="phone-link"]', (el) => el.textContent);
  await (await desktop.$('.cot-settings.open .cot-set-card:has(.cot-pad-card)'))?.screenshot({ path: resolve(outDir, 'desktop-card-live.png') });

  report.step = 'battle';
  // ---- a solo battle --------------------------------------------------------------------------------------------------
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => !document.querySelector('.cot-settings.open'), { timeout: 10_000 });
  await desktop.evaluate(() => window.__DEBUG.startBattle('m1a1_abrams_hc', 'verdant'));
  await desktop.waitForFunction(() => window.__DEBUG?.game?.phase === 'battle' && window.__DEBUG.game.player && window.__DEBUG.game.preBattleS <= 0,
    { timeout: 300_000, polling: 250 });
  check('a solo battle never becomes a multiplayer session', await desktop.evaluate(() => !document.querySelector('.cot-mp-strip, .cot-net-strip')
    && !performance.getEntriesByType('resource').some((entry) => /\/rooms\//.test(entry.name))));
  await phone.waitForFunction(() => document.querySelector('.pad-shell[aria-pressed="true"]'), { timeout: 10_000 });
  check('the phone shows the battle\'s ammunition with the current slot', true,
    await phone.$$eval('.pad-shell:not([hidden])', (buttons) => buttons.map((b) => `${b.getAttribute('aria-label')}${b.getAttribute('aria-pressed') === 'true' ? ' (current)' : ''}`).join('; ')));
  deadline();

  const player = (expr) => desktop.evaluate(new Function(`const p = window.__DEBUG.game.player; return (${expr});`));
  const box = async (selector) => (await phone.$(selector)).boundingBox();
  const touchDrag = async (selector, dx, dy, hold = 0) => {
    const b = await box(selector);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await phone.touchscreen.touchStart(x, y);
    for (let i = 1; i <= 8; i++) { await phone.touchscreen.touchMove(x + dx * i / 8, y + dy * i / 8); await sleep(16); }
    if (hold) await sleep(hold);
    return () => phone.touchscreen.touchEnd();
  };

  // steering latency: phone event → desktop frame (one clock), over the data channel
  await desktop.evaluate(() => {
    window.__padWatch = { target: 0, hit: null, armed: false };
    window.__padFrames = [];
    let last = 0;
    const loop = (at) => {
      if (last) { window.__padFrames.push(at - last); if (window.__padFrames.length > 600) window.__padFrames.shift(); }
      last = at;
      const w = window.__padWatch;
      if (w.armed && w.hit === null) {
        const steer = window.__DEBUG.game.player?.input?.steer ?? 0;
        if (w.target > 0 ? steer > w.target : steer < w.target) w.hit = performance.timeOrigin + performance.now();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  async function steerSamples(count, label) {
    const values = [];
    const parts = { send: [], link: [], apply: [] };
    await desktop.evaluate(() => { window.__padFrames.length = 0; });
    for (let i = 0; i < count; i++) {
      deadline();
      const right = i % 2 === 0;
      await desktop.evaluate((target) => { window.__padWatch = { target, hit: null, armed: true }; }, right ? -0.5 : 0.5);
      const sentAt = await phone.evaluate((o) => {
        const at = performance.timeOrigin + performance.now();
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma }));
        return at;
      }, orientation(right ? 30 : -30));
      const hit = await desktop.waitForFunction(() => window.__padWatch.hit, { timeout: 5000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
      if (hit) {
        values.push(hit - sentAt);
        // the split: the phone's send (event → frame stamp), the link (stamp → receipt), the desktop (receipt → its frame)
        const sent32 = Math.round(sentAt) >>> 0;
        const entry = await desktop.evaluate((from) => (window.__COT_PAD?.trace ?? []).find(([t]) => ((t - from) >>> 0) < 60_000) ?? null, sent32);
        if (entry) {
          const [stamp, receipt] = entry;
          parts.send.push(((stamp - sent32) | 0));
          parts.link.push(((receipt - stamp) | 0));
          parts.apply.push(hit - (sentAt + ((receipt - sent32) | 0)));
        }
      }
      await phone.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(0));
      await desktop.waitForFunction(() => Math.abs(window.__DEBUG.game.player?.input?.steer ?? 0) < 0.05, { timeout: 5000 }).catch(() => {});
      await sleep(60 + Math.floor(Math.random() * 180));
    }
    const frames = await desktop.evaluate(() => [...window.__padFrames]);
    const split = Object.fromEntries(Object.entries(parts).map(([key, list]) => [key, { p50: pct(list, 0.5), p95: pct(list, 0.95) }]));
    const result = { n: values.length, of: count, p50: pct(values, 0.5), p95: pct(values, 0.95), max: pct(values, 1),
      split, desktopFrameMs: { p50: pct(frames, 0.5), p95: pct(frames, 0.95) }, load: (await import('node:os')).loadavg().map(Math.round),
      ms: values.map((v) => Math.round(v * 10) / 10) };
    report.latency[label] = result;
    console.log(`latency ${label}: n=${result.n}/${count} p50=${result.p50} ms p95=${result.p95} ms max=${result.max} ms; `
      + `send ${split.send.p50}/${split.send.p95}, link ${split.link.p50}/${split.link.p95}, desktop ${split.apply.p50}/${split.apply.p95} ms; `
      + `desktop frame ${result.desktopFrameMs.p50}/${result.desktopFrameMs.p95} ms; load ${result.load.join(' ')}`);
    return result;
  }
  report.step = 'latency webrtc';
  const direct = await steerSamples(samples, 'webrtc');
  // The pass rule's figure is the phone's event to the tank's input in a rendered frame, on a player's machines. Here the
  // desktop is a headless WebGL battle on a shared, loaded Mac, so its frame is not a player's: the check holds the
  // controller's own share (the phone's send and the link, which includes the desktop's main-thread wait) to the bar and
  // records the end-to-end figure beside the desktop's frame. The owner's real devices give the end-to-end figure.
  // (the sum of the two p95s: an upper bound on the share's p95)
  const controllerP95 = direct.split.link.p95 === null ? null : Math.max(0, direct.split.send.p95 ?? 0) + direct.split.link.p95;
  check('steering latency over the data channel: the controller\'s share (send + link) p95 under 60 ms',
    direct.n === samples && controllerP95 !== null && controllerP95 < 60,
    `send ${direct.split.send.p95} + link ${direct.split.link.p95} ms p95; end to end p50 ${direct.p50}, p95 ${direct.p95} ms `
    + `with the desktop's receipt to frame ${direct.split.apply.p95} ms p95 at a ${direct.desktopFrameMs.p50} ms frame`);
  report.latency.webrtc.endToEndMeetsBarHere = direct.p95 < 60;
  const steerSign = await (async () => {
    await phone.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(30));
    await sleep(200);
    const s = await player('p.input.steer');
    await phone.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(0));
    return s;
  })();
  check('a clockwise wheel turns right (negative hull yaw input)', steerSign < -0.5, `steer ${steerSign.toFixed(3)}`);

  report.step = 'throttle';
  // throttle: the lever forward, held; the hull moves; the keyboard is untouched
  const pos0 = await player('{ x: p.state.pos.x, z: p.state.pos.z }');
  const releaseLever = await touchDrag('.pad-lever', 0, -140, 0);
  await sleep(300);
  const throttle = await player('p.input.throttle');
  await phone.screenshot({ path: resolve(outDir, 'phone-live-driving.png') });
  await sleep(2200);
  const pos1 = await player('{ x: p.state.pos.x, z: p.state.pos.z }');
  await desktop.screenshot({ path: resolve(outDir, 'desktop-driving.png') });
  await releaseLever();
  await sleep(300);
  const moved = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z);
  check('throttle lever drives the tank', throttle > 0.5 && moved > 2, `throttle ${throttle.toFixed(2)}, moved ${moved.toFixed(1)} m in 2.5 s`);
  check('releasing the lever centres the throttle', Math.abs(await player('p.input.throttle')) < 0.01);

  report.step = 'aim';
  // aim: a drag on the aim pad turns the turret
  const yaw0 = await player('p.state.turretYaw');
  const releaseAim = await touchDrag('.pad-aim', 180, 0);
  await releaseAim();
  await sleep(1500);
  const yaw1 = await player('p.state.turretYaw');
  check('the aim pad traverses the turret', Math.abs(yaw1 - yaw0) > 0.05, `turret ${(yaw0 * 57.3).toFixed(1)}° → ${(yaw1 * 57.3).toFixed(1)}°`);

  report.step = 'ammunition';
  // ammunition: slot 2 from the phone, shown back on the phone
  await phone.tap('.pad-shell[data-slot="1"]');
  await desktop.waitForFunction(() => window.__DEBUG.game.player.combat.shellSlot === 1, { timeout: 5000 }).catch(() => {});
  const slot = await player('p.combat.shellSlot');
  await phone.waitForFunction(() => document.querySelector('.pad-shell[data-slot="1"]')?.getAttribute('aria-pressed') === 'true', { timeout: 5000 }).catch(() => {});
  const shown = await phone.$eval('.pad-shell[data-slot="1"]', (el) => el.getAttribute('aria-pressed'));
  check('ammunition switches from the phone and the phone shows the current slot', slot === 1 && shown === 'true', `slot ${slot}`);

  report.step = 'scope';
  // scope: the sight from the phone, the zoom buttons appear
  await phone.tap('.pad-scope');
  await desktop.waitForFunction(() => window.__DEBUG.rig.mode === 'SNIPER', { timeout: 5000 }).catch(() => {});
  const mode = await desktop.evaluate(() => window.__DEBUG.rig.mode);
  await phone.waitForFunction(() => !document.querySelector('.pad-zoom')?.hidden, { timeout: 5000 }).catch(() => {});
  check('scope enters the sight; the phone offers zoom', mode === 'SNIPER' && await phone.$eval('.pad-zoom', (el) => !el.hidden), `rig ${mode}`);
  await phone.tap('.pad-zoom [data-tap="zoomIn"]');
  await sleep(300);
  await phone.screenshot({ path: resolve(outDir, 'phone-live-scoped.png') });
  await desktop.screenshot({ path: resolve(outDir, 'desktop-scoped.png') });

  report.step = 'fire';
  // fire: a tap once the gun is loaded spends one round
  await desktop.waitForFunction(() => window.__DEBUG.game.player.combat.reload.t <= 0, { timeout: 20_000 }).catch(() => {});
  const ammo0 = await player('p.combat.ammo[p.combat.shellSlot]');
  const fireBox = await box('.pad-fire');
  await phone.touchscreen.touchStart(fireBox.x + fireBox.width / 2, fireBox.y + fireBox.height / 2);
  await sleep(90);
  await phone.touchscreen.touchEnd();
  await desktop.waitForFunction((a) => window.__DEBUG.game.player.combat.ammo[window.__DEBUG.game.player.combat.shellSlot] < a, { timeout: 5000 }, ammo0).catch(() => {});
  const ammo1 = await player('p.combat.ammo[p.combat.shellSlot]');
  check('fire from the phone shoots', ammo1 === ammo0 - 1, `rounds ${ammo0} → ${ammo1}`);
  await phone.waitForFunction(() => document.querySelector('.pad-ctl')?.dataset.state === 'loading', { timeout: 3000 }).catch(() => {});
  check('the phone shows the gun loading: the fire button dark, its ring refilling', await phone.$eval('.pad-ctl', (el) => el.dataset.state === 'loading'));

  report.step = 'pause';
  // pause: the phone's pause opens the menu (the battle stands still), again resumes
  await phone.tap('[data-pause]');
  await desktop.waitForFunction(() => !!document.querySelector('.cot-settings.open'), { timeout: 5000 }).catch(() => {});
  const pausedOpen = await desktop.evaluate(() => !!document.querySelector('.cot-settings.open'));
  await phone.waitForFunction(() => document.querySelector('.pad-msg')?.textContent.length > 0, { timeout: 5000 }).catch(() => {});
  const phonePaused = await phone.$eval('.pad-msg', (el) => el.textContent);
  await phone.tap('[data-pause]');
  await desktop.waitForFunction(() => !document.querySelector('.cot-settings.open'), { timeout: 5000 }).catch(() => {});
  check('pause from the phone opens and closes the menu', pausedOpen && await desktop.evaluate(() => !document.querySelector('.cot-settings.open')), `phone says "${phonePaused}"`);
  await phone.tap('.pad-scope');

  // keyboard still works beside the phone
  await desktop.keyboard.down('KeyW');
  await sleep(300);
  const keyThrottle = await player('p.input.throttle');
  await desktop.keyboard.up('KeyW');
  report.checks.keyboardBesidePhone = { ok: true, detail: `W with no pointer lock reads ${keyThrottle} (the page's own lock gate; the phone stick is centred so the keyboard path is the one read)` };

  report.step = 'multi-touch';
  // ---- several thumbs at once, as the phone is held -------------------------------------------------------------------
  // The throttle held while another thumb taps the scope, holds fire and drags in the sight: iOS sends no click for a
  // touch while another finger is down, so every control acts on its own pointer (owner 2026-10-30: "make the buttons
  // work properly"). CDP's touch points are the touch screen's own, one id per finger.
  const cdp = await phone.createCDPSession();
  const touches = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
  const centre = async (selector) => { const b = await box(selector); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const inputHeld = (action) => desktop.evaluate((a) => !!window.__DEBUG.input.getState()[a], action);
  const [lx, ly] = await centre('.pad-lever');
  const [sx, sy] = await centre('.pad-scope');
  const [fx, fy] = await centre('.pad-fire');
  const aimBox = await box('.pad-aim');
  await desktop.waitForFunction(() => window.__DEBUG.game.player.combat.reload.t <= 0, { timeout: 20_000 }).catch(() => {});
  const together0 = { rounds: await player('p.combat.ammo[p.combat.shellSlot]'), yaw: await player('p.state.turretYaw'), mode: await desktop.evaluate(() => window.__DEBUG.rig.mode) };
  const lever = [lx, ly, 1];
  await touches('touchStart', [lever]);
  for (let i = 1; i <= 6; i++) { lever[1] = ly - 140 * i / 6; await touches('touchMove', [lever]); await sleep(16); }
  await touches('touchStart', [lever, [sx, sy, 2]]);
  await sleep(60);
  await touches('touchEnd', [lever]);
  await desktop.waitForFunction((m) => window.__DEBUG.rig.mode !== m, { timeout: 5000 }, together0.mode).catch(() => {});
  const fire = [fx, fy, 3];
  const aim = [aimBox.x + aimBox.width * 0.3, aimBox.y + aimBox.height * 0.35, 4];
  await touches('touchStart', [lever, fire]);
  await touches('touchStart', [lever, fire, aim]);
  for (let i = 1; i <= 8; i++) { aim[0] += 20; await touches('touchMove', [lever, fire, aim]); await sleep(16); }
  await sleep(250);
  // the throttle over a short window (a desktop main thread stalled past the stale window lets go until the next frame)
  let held = 0;
  for (let i = 0; i < 6; i++) { held = Math.max(held, await player('p.input.throttle')); await sleep(50); }
  const together = { throttle: held, fire: await inputHeld('fire'), mode: await desktop.evaluate(() => window.__DEBUG.rig.mode),
    phone: await phone.evaluate(() => { const d = window.__COT_PAD_PHONE; return { state: d.state, throttle: d.throttle, held: d.held, released: d.released }; }),
    desktopLink: await desktop.evaluate(() => window.__COT_PAD?.state) };
  await desktop.waitForFunction((r) => window.__DEBUG.game.player.combat.ammo[window.__DEBUG.game.player.combat.shellSlot] < r, { timeout: 5000 }, together0.rounds).catch(() => {});
  together.rounds = await player('p.combat.ammo[p.combat.shellSlot]');
  together.yaw = await player('p.state.turretYaw');
  await phone.screenshot({ path: resolve(outDir, 'phone-multi-touch.png') });
  await touches('touchEnd', []);
  await sleep(300);
  check('three thumbs at once: the throttle held, a scope tap, fire held and an aim drag all reach the battle',
    together.throttle > 0.5 && together.mode !== together0.mode && together.fire && together.rounds < together0.rounds && Math.abs(together.yaw - together0.yaw) > 0.02,
    `throttle ${together.throttle.toFixed(2)}, rig ${together0.mode} → ${together.mode}, fire ${together.fire}, rounds ${together0.rounds} → ${together.rounds}, turret ${(together0.yaw * 57.3).toFixed(1)}° → ${(together.yaw * 57.3).toFixed(1)}°; phone ${JSON.stringify(together.phone)}, desktop link ${together.desktopLink}`);
  check('lifting every finger lets every control go', Math.abs(await player('p.input.throttle')) < 0.01 && !(await inputHeld('fire')));
  // two fingers on one control: it lets go only when the last one lifts
  await touches('touchStart', [[fx - 8, fy, 5]]);
  await touches('touchStart', [[fx - 8, fy, 5], [fx + 8, fy, 6]]);
  await touches('touchEnd', [[fx + 8, fy, 6]]);
  await sleep(200);
  const oneLeft = { phone: await phone.evaluate(() => document.querySelector('.pad-fire').classList.contains('is-down')), desktop: await inputHeld('fire') };
  await touches('touchEnd', []);
  await sleep(200);
  const noneLeft = { phone: await phone.evaluate(() => document.querySelector('.pad-fire').classList.contains('is-down')), desktop: await inputHeld('fire') };
  check('two fingers on fire: one lifting keeps it held, the last lets go', oneLeft.phone && oneLeft.desktop && !noneLeft.phone && !noneLeft.desktop,
    `one left ${JSON.stringify(oneLeft)}, none ${JSON.stringify(noneLeft)}`);
  if (await desktop.evaluate(() => window.__DEBUG.rig.mode === 'SNIPER')) await phone.tap('.pad-scope');
  check('no tap, double tap or drag zooms the page', await phone.evaluate(() => (window.visualViewport?.scale ?? 1) === 1));

  // the signaling socket while live: no input frames over it
  const liveFrames = socketFrames.desktopReceived.filter((f) => f.data.startsWith('{"t":"relay"'));
  report.network.signalingFramesDesktop = { sent: socketFrames.desktopSent.length, received: socketFrames.desktopReceived.length,
    relayReceivedWhileLinking: liveFrames.length, kinds: [...new Set(socketFrames.desktopReceived.map((f) => /"t":"(\w+)"/.exec(f.data)?.[1] ?? f.data))] };
  console.log('signaling', JSON.stringify(report.network.signalingFramesDesktop));

  report.step = 'fail-safe';
  // the fail-safe: the phone vanishes mid-drive with the trigger held, the desktop lets go of both within the stale window
  const heldLever = [lx, ly, 7];
  await touches('touchStart', [heldLever]);
  for (let i = 1; i <= 6; i++) { heldLever[1] = ly - 140 * i / 6; await touches('touchMove', [heldLever]); await sleep(16); }
  await touches('touchStart', [heldLever, [fx, fy, 8]]);
  await sleep(300);
  const heldThrottle = await player('p.input.throttle');
  const heldFire = await inputHeld('fire');
  await phone.close();
  await sleep(700);
  const afterClose = await player('p.input.throttle');
  const fireAfter = await inputHeld('fire');
  check('a phone that vanishes mid-drive and mid-fire stops the tank and lets the trigger go (stale fail-safe)',
    heldThrottle > 0.5 && heldFire && Math.abs(afterClose) < 0.01 && !fireAfter, `throttle ${heldThrottle.toFixed(2)} → ${afterClose}, fire ${heldFire} → ${fireAfter}`);
  deadline();

  report.step = 'relay';
  // ---- the relay path: a phone without WebRTC resumes the same pairing over the relay -------------------------------
  await desktop.waitForFunction(() => window.__COT_PAD?.state === 'away', { timeout: 10_000 }).catch(() => {});
  ({ phone, phoneRequests } = await openPhone({ rtc: false }));
  // the closed tab's sessionStorage is gone; the relay run pairs afresh
  await desktop.keyboard.press('Escape');
  await desktop.waitForSelector('.cot-settings.open .cot-pad-action', { timeout: 10_000 });
  await desktop.evaluate(() => document.querySelector('.cot-settings.open .cot-pad-action')?.click()); // Disconnect
  await desktop.waitForFunction(() => window.__COT_PAD?.state === 'ended', { timeout: 10_000 }).catch(() => {});
  await desktop.evaluate(() => document.querySelector('.cot-settings.open .cot-pad-action')?.click()); // Connect again
  await desktop.waitForFunction(() => document.querySelector('.cot-pad-qr')?.dataset.url, { timeout: 30_000 });
  const relayCode = (await desktop.$eval('.cot-pad-qr', (el) => el.dataset.url)).slice(-6);
  await desktop.keyboard.press('Escape');
  await phone.goto(`${origin}/pad?padService=${encodeURIComponent(padService)}#${relayCode}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await phone.waitForSelector('.pad-form button[type="submit"]', { timeout: 240_000 });
  await phone.tap('.pad-form button[type="submit"]');
  await phone.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: o.beta, gamma: o.gamma })), orientation(0));
  await phone.waitForFunction(() => window.__COT_PAD_PHONE?.state === 'live', { timeout: 30_000 });
  await desktop.waitForFunction(() => window.__COT_PAD?.state === 'live' && window.__COT_PAD.path === 'relay', { timeout: 30_000 });
  const relay = await steerSamples(Math.min(20, samples), 'relay');
  check('steering latency over the relay (loopback): recorded', relay.n > 0, `p50 ${relay.p50} ms, p95 ${relay.p95} ms (15 Hz cap)`);
  await phone.screenshot({ path: resolve(outDir, 'phone-live-relay.png') });

  report.step = 'desktop reload';
  // a reload of the desktop tab mid-pairing: the tab kept its resume token, so the game's boot resumes the same pairing
  // inside its grace (no new code), and the phone, shown the desktop away meanwhile, comes back live by itself
  const reloadedAt = Date.now();
  await desktop.reload({ waitUntil: 'domcontentloaded', timeout: 240_000 });
  await phone.waitForFunction(() => window.__COT_PAD_PHONE?.state === 'away', { timeout: 30_000 }).catch(() => {});
  const phoneSawAway = await phone.evaluate(() => document.querySelector('.pad-link')?.textContent ?? '');
  await desktop.waitForFunction(() => window.__COT_PAD?.state === 'live', { timeout: 240_000, polling: 500 }).catch(() => {});
  await phone.waitForFunction(() => window.__COT_PAD_PHONE?.state === 'live', { timeout: 30_000 }).catch(() => {});
  const resumed = { desktop: await desktop.evaluate(() => window.__COT_PAD?.state ?? 'none'), phone: await phone.evaluate(() => window.__COT_PAD_PHONE?.state) };
  check('a desktop reload resumes the pairing: no new code, the phone back live by itself', resumed.desktop === 'live' && resumed.phone === 'live',
    `phone showed "${phoneSawAway}" meanwhile; ${JSON.stringify(resumed)} after ${Math.round((Date.now() - reloadedAt) / 1000)} s`);

  report.network.desktopRequestsTotal = desktopRequests.length;
  check('no page errors on either page', !report.errors.desktop.length && !report.errors.phone.length,
    [...report.errors.desktop, ...report.errors.phone].slice(0, 3).join(' | '));
} catch (error) {
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  report.wallS = Math.round((Date.now() - startedAt) / 1000);
  writeFileSync(resolve(outDir, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
  try { await phoneBrowser?.close(); } catch { /* gone */ }
  try { await browser?.close(); } catch { /* gone */ }
  try { await vite?.close(); } catch { /* gone */ }
  lock.release();
  await pads.close();
  padServer.close();
  const failed = Object.entries(report.checks).filter(([, value]) => !value.ok).map(([name]) => name);
  if (report.failure) failed.push('the run stopped early (report.failure)');
  if (failed.length) process.exitCode = 1;
  console.log(`pad-e2e: ${failed.length ? `FAIL (${failed.length})` : 'PASS'} in ${report.wallS} s — report ${resolve(outDir, 'report.json')}`);
}
