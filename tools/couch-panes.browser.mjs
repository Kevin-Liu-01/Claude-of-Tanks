// Couch mode's split screen end to end (docs/COUCH-MODE.md phase 2): a 1920x1080 desktop page and simulated phones
// (/pad pages in headless Chromium) against the in-process pairing service, one couch battle per layout. Copyright ©
// 2026 Kevin B. Liu.
//
// Per layout (--layouts, the seats in play: 1, 2, 4, 8): the lobby seats that many phones (joining more between
// battles through the lobby's Reopen), its Start deploys them on the split screen, and the run
// - screenshots the big screen (panes-<n>.png);
// - checks the per-view HUD context: each pane's HUD reads its own seat's tank (two seats given different hull points
//   and rounds show different figures, each its own), its own camera and its own spotting;
// - checks spotting per seat on every pane's draw: no pane draws an enemy its own seat's side has not spotted, and the
//   pane HUD's spotting read (the minimap's and the markers') agrees with the seat's own;
// - with --measure, samples whole frames through the frame-budget probe's timer (tools/frame-pass-timer.mjs: one GPU
//   timer query a frame, the main thread's render path) and projects them onto the mid-range laptop (the RTX 4050
//   Laptop proxy, docs/PERFORMANCE.md "Frame budget").
// Run alone under the capture lock (tools/capture-hold.mjs, FIFO; the run stops itself at 18 minutes):
//   node tools/couch-panes.browser.mjs [--layouts=2,4] [--sides=teams] [--measure [--no-baseline]] [--frames=180]
//     [--max-load=10] [--load-wait-min=0]
//     [--preview=<root with dist>] [--port=5298] [--out=.qa-dev/couch-panes]
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer, preview } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { installFramePassTimer, summarizePassFrames, projectFrameMs, proxyRatios, MID_RANGE_PROXIES } from './frame-pass-timer.mjs';
import { PAD_PHONE_STATE, PAD_SEAT_STATE } from './pad-states.mjs';
import { createLocalPadService } from '../server/rooms/localPadService.ts';

const root = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);
const layouts = String(arg('layouts', '2,4')).split(',').map(Number).filter((n) => n >= 1 && n <= 8).sort((a, b) => a - b);
const sides = arg('sides', 'teams') === 'together' ? 'together' : 'teams';
const measure = flag('measure');
/** The solo baseline (with --measure): the same build, tier and map, every layout reported as a ratio to it. */
const baseline = !flag('no-baseline');
/** A quiet machine: the 1-minute load the run waits for before it takes the capture lock, and records against. */
const maxLoad = Number(arg('max-load', 10));
const loadWaitMin = Number(arg('load-wait-min', 0));
let soloEntry = null;
/** Pane 1's core at the first layout (one pane: the solo HUD's size), the size every later layout's core keeps. */
let coreAtOne = null;
const frames = Number(arg('frames', 180));
const previewRoot = arg('preview', '');
const map = arg('map', 'verdant');
const port = Number(arg('port', 5298));
const outDir = resolve(root, arg('out', '.qa-dev/couch-panes'));
mkdirSync(outDir, { recursive: true });
const HOLD_MS = 18 * 60 * 1000;
let startedAt = Date.now();
const deadline = () => { if (Date.now() - startedAt > HOLD_MS) throw new Error('couch-panes: past the 18-minute hold'); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { layouts, sides, map, measure, build: previewRoot ? 'production' : 'dev', checks: {}, frames: {}, errors: { desktop: [], phone: [] } };
const check = (name, ok, detail = '') => {
  report.checks[name] = { ok: !!ok, ...(detail ? { detail } : {}) };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const padServer = http.createServer();
const pads = createLocalPadService({ connectLimit: 120 });
padServer.on('upgrade', (request, socket, head) => { if (!pads.handleUpgrade(request, socket, head)) socket.destroy(); });
await new Promise((done) => padServer.listen(0, '127.0.0.1', done));
const padService = `ws://127.0.0.1:${padServer.address().port}`;

let captureHold = null;
let server = null;
let browser = null;
let phoneBrowser = null;
try {
  if (previewRoot) {
    server = await preview({ root: resolve(previewRoot), logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true } });
  } else {
    server = await createServer({ root, cacheDir: resolve(root, '.qa-dev/couch-panes-vite-cache'), logLevel: 'error',
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
    await server.listen();
    for (const path of ['/pad', '/']) {
      await fetch(`http://127.0.0.1:${port}${path}`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(900_000) }).catch(() => {});
    }
  }
  // a quiet machine first (docs/PERFORMANCE.md: a loaded machine's frames measure the machine): wait up to
  // --load-wait-min minutes for the 1-minute load under --max-load before taking the lock; the report records it either way
  const waitUntil = Date.now() + loadWaitMin * 60_000;
  while (measure && os.loadavg()[0] > maxLoad && Date.now() < waitUntil) await sleep(30_000);
  report.loadAtStart = os.loadavg().map((v) => Math.round(v * 10) / 10);
  if (measure) console.log(`load ${report.loadAtStart.join(' ')} (quiet under ${maxLoad}: ${report.loadAtStart[0] <= maxLoad})`);
  captureHold = await openCaptureHold({ label: 'couch-panes', timeoutMs: 4 * 60 * 60 * 1000, lockClass: 'timing', command: 'tools/couch-panes.browser.mjs' });
  startedAt = Date.now();
  report.loadAtGrant = os.loadavg().map(Math.round);
  const origin = `http://127.0.0.1:${port}`;
  browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120_000, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-angle=metal', '--enable-gpu'] }, { label: 'couch-panes' });

  report.step = 'desktop boot';
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  desktop.on('pageerror', (error) => report.errors.desktop.push(String(error).slice(0, 300)));
  desktop.on('console', (message) => { if (message.type() === 'error') report.errors.desktop.push(`console: ${message.text().slice(0, 300)}`); });
  await desktop.goto(`${origin}/?nosplash=1&tier=desktop&padService=${encodeURIComponent(padService)}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await desktop.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
  await desktop.evaluate((id) => window.__DEBUG.garage.setSelectedMap(id), map);

  phoneBrowser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120_000, protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'couch-panes-phones' });
  const phones = [];
  let code = '';
  const openLobby = async () => {
    await desktop.evaluate(() => document.querySelector('[data-battle-couch]')?.click());
    await desktop.waitForFunction(() => /^[A-Z0-9]{3} [A-Z0-9]{3}$/.test(document.querySelector('.cot-couch-code')?.textContent ?? ''), { timeout: 60_000 });
    code = (await desktop.$eval('.cot-couch-code', (el) => el.textContent)).replace(/\s/g, '');
  };
  const joinPhone = async () => {
    const page = await phoneBrowser.newPage();
    const index = phones.length + 1;
    page.on('pageerror', (error) => report.errors.phone.push(`phone ${index}: ${String(error).slice(0, 300)}`));
    await page.emulate({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true },
    });
    await page.goto(`${origin}/${previewRoot ? 'pad.html' : 'pad'}?padService=${encodeURIComponent(padService)}&padDebug=1#${code}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForSelector('.pad-form button[type="submit"]', { timeout: 240_000 });
    await page.tap('.pad-form button[type="submit"]');
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 0, gamma: -60 })));
    await page.waitForFunction((live) => window.__COT_PAD_PHONE?.state === live, { timeout: 60_000 }, PAD_PHONE_STATE.live);
    phones.push(page);
  };

  /** The frame-budget probe's staging and timer over the frame on screen now (a split battle or the solo baseline). */
  const measureFrames = async (label) => {
    // the frame-budget probe's staging (tools/frame-budget-probe.mjs freezeBattle): every bot frozen in place, the
    // governor held and pinned at full scale, so the layouts' frames compare
    await desktop.evaluate(() => {
      const D = window.__DEBUG;
      for (const e of D.game.tanks) {
        if (e.aiCtl) e.aiCtl = null;
        if (e.input) { e.input.actionBits = 0; if ('throttle' in e.input) e.input.throttle = 0; if ('steer' in e.input) e.input.steer = 0; }
        if (e.state) e.state.speed = 0;
      }
      try { D.post.resetPerfTrims?.(); } catch { /* optional */ }
      try { D.post.setAdaptiveSuspended?.(true); } catch { /* optional */ }
      try { D.post.pinDynScale?.(1); } catch { /* optional */ }
    });
    await desktop.evaluate(installFramePassTimer);
    await sleep(1500);
    const loadBefore = os.loadavg().map((v) => Math.round(v * 10) / 10);
    const result = await desktop.evaluate((n) => window.__FRAME_PASS_TIMER.sample({ frames: n, block: 30, modes: ['whole'], timeoutMs: 120000 }), frames);
    const summary = summarizePassFrames(result);
    // the split screen's own main-thread split over the next frames: every pane's HUD frame, every pane's draw
    const split = await desktop.evaluate(async (n) => {
      const hud = [], draw = [];
      for (let i = 0; i < n; i++) {
        await new Promise((done) => requestAnimationFrame(done));
        const t = window.__COT_COUCH?.paneViews?.timing;
        if (t) { hud.push(t.hudMs); draw.push(t.drawMs); }
      }
      const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[s.length >> 1] * 100) / 100 : null; };
      return { hudMs: med(hud), drawMs: med(draw), n: hud.length };
    }, 60);
    // what the scene pass draws for the first view, by the scene's top-level owner (meshes in the view's frustum, on its
    // layers, every ancestor visible): the categories the detail rule acts on
    const census = await desktop.evaluate(() => {
      const D = window.__DEBUG;
      const pane = window.__COT_COUCH?.paneViews?.panes?.[0];
      const cam = pane?.camera ?? D.camera;
      const scene = D.scene;
      const F = cam.projectionMatrix.constructor;
      const m = new F().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const out = {};
      const near = (obj) => {
        const g = obj.geometry;
        if (!g) return true;
        if (!g.boundingSphere) g.computeBoundingSphere?.();
        const bs = g.boundingSphere;
        if (!bs) return true;
        const c = bs.center.clone().applyMatrix4(obj.matrixWorld);
        const r = bs.radius * obj.matrixWorld.getMaxScaleOnAxis();
        const e = m.elements;
        const planes = [[e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]], [e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]],
          [e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]], [e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]],
          [e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]], [e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]]];
        for (const [a, b, cc, d] of planes) {
          const len = Math.hypot(a, b, cc) || 1;
          if ((a * c.x + b * c.y + cc * c.z + d) / len < -r) return false;
        }
        return true;
      };
      const walk = (obj, owner) => {
        if (!obj.visible) return;
        if ((obj.isMesh || obj.isPoints || obj.isLine || obj.isSprite) && obj.layers.test(cam.layers)
          && (!obj.frustumCulled || obj.isInstancedMesh || near(obj))) {
          const key = owner;
          const mats = Array.isArray(obj.material) ? obj.material.length : 1;
          out[key] = (out[key] ?? 0) + mats * (obj.isInstancedMesh && obj.count === 0 ? 0 : 1);
        }
        for (const child of obj.children) walk(child, owner);
      };
      // (the world's root by its own groups: its draws are the categories a draw distance acts on)
      for (const child of scene.children) {
        const owner = child.name || child.userData?.kind || child.type;
        if (/^world/.test(owner)) for (const part of child.children) walk(part, `${owner}/${part.name || part.userData?.kind || part.type}`);
        else walk(child, owner);
      }
      return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 24));
    });
    const ratios = proxyRatios(MID_RANGE_PROXIES['rtx4050-laptop']);
    const projected = projectFrameMs({ gpuMs: summary.gpuFrame.p25 ?? summary.gpuFrame.med, cpuMs: summary.cpuFrame.med }, ratios);
    const row = { loadBefore, loadAfter: os.loadavg().map((v) => Math.round(v * 10) / 10), quiet: loadBefore[0] <= maxLoad,
      gpuFrame: summary.gpuFrame, cpuFrame: summary.cpuFrame, interval: summary.interval, calls: summary.calls, tris: summary.tris,
      projected, split, census, cpuByLabel: Object.fromEntries(Object.entries(summary.passes).map(([k, pass]) => [k, pass.cpu.med])) };
    console.log(`frames ${label}: GPU p25 ${summary.gpuFrame.p25} med ${summary.gpuFrame.med} ms; main ${summary.cpuFrame.med} ms; `
      + `scene ${row.cpuByLabel.scene} ms; draws ${summary.calls.med}; projected ${projected.frameMs} ms (${projected.fps} fps, ${projected.bound}); `
      + `panes' HUD ${split.hudMs} ms, draw ${split.drawMs} ms; load ${loadBefore.join(' ')}${row.quiet ? '' : ' (NOT QUIET)'}`);
    await desktop.evaluate(() => window.__FRAME_PASS_TIMER?.uninstall?.());
    return row;
  };
  /** The solo baseline: the same spec, mode and map, at the couch tier, the page's one view (no couch session). */
  const soloFrames = async (label) => {
    report.step = `${label}: battle`;
    await desktop.evaluate(() => window.__COT_COUCH.holdTierForProbe(true));
    await desktop.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); },
      { specId: soloEntry.specId, mapId: map, gameMode: soloEntry.gameMode });
    await desktop.waitForFunction(readinessExpression('controlsReleased'), { timeout: 300_000, polling: 250 });
    await sleep(4000);
    report.step = `${label}: measure`;
    const row = await measureFrames(label);
    row.solo = await desktop.evaluate(() => ({ couch: !!window.__DEBUG.game.couch, specId: window.__DEBUG.game.player?.specId,
      tier: document.querySelector('canvas')?.dataset.renderScale ?? null }));
    await desktop.evaluate(() => window.__DEBUG.leaveBattleToGarage());
    await desktop.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
    return row;
  };

  for (const count of layouts) {
    deadline();
    report.step = `layout ${count}: lobby`;
    await openLobby();
    if (phones.length < count) {
      // a lobby closed by the last Start lets the late arrivals in through Reopen
      await desktop.evaluate(() => {
        const reopen = [...document.querySelectorAll('.cot-couch-modal button')].find((b) => b.classList.contains('cot-c-btn--secondary') && !b.hidden);
        reopen?.click();
      });
      await sleep(500);
      while (phones.length < count) { deadline(); await joinPhone(); }
    }
    await desktop.bringToFront();
    await desktop.waitForFunction((n, here) => document.querySelectorAll(`.cot-couch-seat[data-state="${here}"]`).length >= n,
      { timeout: 60_000 }, count, PAD_SEAT_STATE.here);
    // the lobby's sides and the split screen (its default), then Start
    if (count > 1) await desktop.evaluate((value) => document.querySelector(`.cot-couch-sides [data-value="${value}"]`)?.click(), sides);
    await desktop.evaluate(() => document.querySelector('.cot-couch-view [data-value="split"]')?.click());
    if (count === layouts[0]) await (await desktop.$('.cot-couch-modal'))?.screenshot({ path: resolve(outDir, 'lobby.png') });
    report.step = `layout ${count}: battle`;
    await desktop.evaluate(() => document.querySelector('.cot-couch-modal .cot-c-btn--primary')?.click());
    await desktop.waitForFunction(`${readinessExpression('controlsReleased')} && !!window.__DEBUG?.game?.couch`, { timeout: 300_000, polling: 250 });
    await desktop.waitForFunction((n) => {
      const panes = window.__COT_COUCH?.paneViews?.panes ?? [];
      return panes.length === n && panes.every((pane) => pane.hud && pane.doc.querySelector('.cot-hud'));
    }, { timeout: 60_000, polling: 250 }, count);
    // each phone turns its camera a little its own way, so the panes differ by more than their tanks
    for (let i = 0; i < phones.length && i < count; i++) {
      await phones[i].evaluate(() => window.__COT_PAD_PHONE?.state).catch(() => null);
    }
    await sleep(4000);

    // the fit settles (a part a few frames, FIT_SETTLE_FRAMES apiece)
    await desktop.waitForFunction(() => window.__COT_COUCH.paneViews.panes.every((pane) => pane.fitted || !pane.coreFits),
      { timeout: 30_000, polling: 250 }).catch(() => {});
    report.step = `layout ${count}: probe`;
    const probe = await desktop.evaluate(() => {
      const game = window.__DEBUG.game;
      const couch = window.__COT_COUCH;
      const panes = couch.paneViews.panes;
      return {
        tier: document.body.classList.contains('cot-couch-split'),
        layout: couch.paneViews.layout && { columns: couch.paneViews.layout.columns, rows: couch.paneViews.layout.rows },
        panes: panes.map((pane) => ({ seat: pane.seat, id: pane.entityId, team: pane.team, rect: pane.rect,
          dropped: pane.dropped, fitted: pane.fitted, coreFits: pane.coreFits, boxes: pane.boxes, clash: pane.clash, clashLog: pane.clashLog,
          hudScale: pane.doc.defaultView.frameElement.style.transform || 'scale(1)',
          // the core at its solo size: its panels' boxes and the hull points' type (compared with one pane's)
          core: Object.fromEntries([['health', '.cot-dp'], ['ammunition', '.cot-shell'], ['speed', '.cot-drive']].map(([part, sel]) => {
            const el = pane.doc.querySelector(sel);
            const b = el?.getBoundingClientRect();
            return [part, b && b.width ? [Math.round(b.width), Math.round(b.height)] : null];
          }).concat([['hpFont', pane.doc.defaultView.getComputedStyle(pane.doc.querySelector('.cot-dp .hpnum') ?? pane.doc.body).fontSize]])),
          layoutBox: [pane.doc.documentElement.clientWidth, pane.doc.documentElement.clientHeight],
          widthBand: pane.doc.body.dataset.cotWidth, heightBand: pane.doc.body.dataset.cotHeight,
          minimap: (() => {
            const mm = pane.doc.querySelector('.cot-minimap');
            if (!mm) return null;
            const box = mm.getBoundingClientRect();
            const style = pane.doc.defaultView.getComputedStyle(mm);
            return { box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)], display: style.display,
              visibility: style.visibility, hidden: mm.hidden, mapMax: pane.doc.body.style.getPropertyValue('--hud-map-max') || null };
          })() })),
        pageHudHidden: getComputedStyle(document.querySelector('.cot-hud')).visibility === 'hidden',
        preset: window.__DEBUG.post ? document.querySelector('canvas')?.dataset.renderScale : null,
        tanks: game.tanks.length,
      };
    });
    report[`layout${count}`] = probe;
    // the battle opens with every gun inside its own limits (the start look follows the hull's pitch: engine/chaseStart.ts)
    const limited = await desktop.evaluate(() => window.__COT_COUCH.paneViews.panes.filter((pane) => pane.atGunLimit).map((pane) => {
      const tank = window.__DEBUG.game.tanks.find((t) => t.id === pane.entityId);
      const st = tank?.state ?? {};
      const deg = (r) => (Number.isFinite(r) ? Math.round(r * 1800 / Math.PI) / 10 : null);
      const cam = pane.camera.position;
      return { seat: pane.seat, spec: tank?.specId, hullPitch: deg(st._spring?.pitch), terrPitch: deg(st._terr?.pitch),
        tankPos: st.pos && [Math.round(st.pos.x), Math.round(st.pos.y), Math.round(st.pos.z)],
        aimPoint: tank?.input?.aimPoint && [Math.round(tank.input.aimPoint.x), Math.round(tank.input.aimPoint.y), Math.round(tank.input.aimPoint.z)],
        camera: [Math.round(cam.x), Math.round(cam.y), Math.round(cam.z)], gunPitch: deg(st.gunPitch), turretYaw: deg(st.turretYaw),
        depression: tank?.spec?.gunDepressionDeg ?? null, arc: tank?.spec?.gunArcDeg ?? null, hydro: !!tank?.spec?.hydropneumaticAim,
        suspensionAim: st.suspensionAim ?? null, autoTraverse: st._autoTraverse ?? null, rig: pane.rigMode,
        aimPitch: deg(Math.atan2((tank?.input?.aimPoint?.y ?? 0) - (st.pos?.y ?? 0), Math.hypot((tank?.input?.aimPoint?.x ?? 0) - (st.pos?.x ?? 0), (tank?.input?.aimPoint?.z ?? 0) - (st.pos?.z ?? 0)))) };
    }));
    report[`gunLimit${count}`] = limited;
    check(`${count}: no pane opens at its gun's travel limit`, limited.length === 0, limited.length ? JSON.stringify(limited) : `${count} panes`);
    check(`${count}: one pane per seat, each with its own HUD`, probe.panes.length === count && probe.pageHudHidden,
      `${probe.layout?.columns}x${probe.layout?.rows}; ${probe.panes.map((p) => `${p.rect.width}x${p.rect.height} ${p.hudScale}`).join(' | ')}`);
    const first = probe.panes[0];
    // what each pane shows: the core and every part it kept (the overlays, the sight, the hits and the messages, stay)
    const shownParts = (pane) => ['sight', 'hits', 'messages', ...new Set(pane.boxes.map((box) => box.part))]
      .filter((part) => !pane.dropped.includes(part));
    report[`survivors${count}`] = probe.panes.map((pane) => ({ seat: pane.seat, shows: shownParts(pane), dropped: pane.dropped }));
    console.log(`   ${count} panes survive: ${probe.panes.map((pane) => `${pane.seat}=[${shownParts(pane).join(' ')}]`).join(' ')}`);
    console.log(`   ${count} panes: pane 1 gave up [${first.dropped.join(', ')}] (${first.clashLog.join('; ')}); fits ${first.fitted}; core fits ${first.coreFits}; `
      + `core ${JSON.stringify(first.core)}; boxes ${JSON.stringify(first.boxes.map((b) => [b.part, Math.round(b.x0), Math.round(b.y0), Math.round(b.x1), Math.round(b.y1)]))}`);
    check(`${count}: every pane's core fits at full size`, probe.panes.every((p) => p.coreFits),
      probe.panes.map((p) => `${p.seat}:${p.coreFits ? 'fits' : 'NO'}`).join(' '));
    check(`${count}: no pane's HUD is scaled`, probe.panes.every((p) => p.hudScale === 'scale(1)'));
    coreAtOne ??= first.core;
    check(`${count}: pane 1's core is one pane's size (no squish)`, JSON.stringify(first.core) === JSON.stringify(coreAtOne),
      `${JSON.stringify(first.core)} against ${JSON.stringify(coreAtOne)}`);
    await desktop.screenshot({ path: resolve(outDir, `panes-${count}.png`) });

    if (count >= 2) {
      // the per-view HUD context: two seats with different hull points and rounds each show their own
      const context = await desktop.evaluate(async () => {
        const game = window.__DEBUG.game;
        const seats = game.couch.seats;
        const [a, b] = [seats[0].entity, seats[1].entity];
        a.combat.hp = Math.round(a.combat.maxHp * 0.42);
        b.combat.hp = Math.round(b.combat.maxHp * 0.81);
        a.combat.ammo[0] = Math.max(1, a.combat.ammo[0] - 7);
        b.combat.ammo[0] = Math.max(1, b.combat.ammo[0] - 2);
        await new Promise((done) => setTimeout(done, 1200));
        const panes = window.__COT_COUCH.paneViews.panes;
        const read = (pane) => ({
          hp: pane.doc.querySelector('.cot-dp .hpnum')?.textContent?.trim() ?? null,
          rounds: pane.doc.querySelector('.cot-shell .cnt')?.textContent?.trim() ?? null,
        });
        return {
          seat: [{ hp: a.combat.hp, rounds: a.combat.ammo[0] }, { hp: b.combat.hp, rounds: b.combat.ammo[0] }],
          pane: [read(panes[0]), read(panes[1])],
        };
      });
      report[`context${count}`] = context;
      const digits = (text) => (text ?? '').replace(/[^0-9]/g, '');
      const ownHp = context.pane.every((pane, i) => digits(pane.hp) === String(context.seat[i].hp));
      const ownRounds = context.pane.every((pane, i) => digits(pane.rounds) === String(context.seat[i].rounds));
      check(`${count}: each pane's HUD shows its own seat's hull points`, ownHp && context.pane[0].hp !== context.pane[1].hp,
        context.pane.map((p, i) => `pane ${i + 1} ${p.hp} (seat ${context.seat[i].hp})`).join(', '));
      check(`${count}: each pane's HUD shows its own seat's rounds`, ownRounds,
        context.pane.map((p, i) => `pane ${i + 1} "${p.rounds}" (seat ${context.seat[i].rounds})`).join(', '));

      // spotting per seat on every pane's draw and in every pane's HUD
      const spot = await desktop.evaluate(async () => {
        const out = { panes: [], leaks: [], hudMismatch: [], hiddenHereShownThere: 0 };
        for (let frame = 0; frame < 30; frame++) {
          await new Promise((done) => requestAnimationFrame(done));
          const game = window.__DEBUG.game;
          const panes = window.__COT_COUCH.paneViews.panes;
          const drawnBy = panes.map((pane) => new Set(pane.drawn));
          panes.forEach((pane, index) => {
            const seat = game.tanks.find((t) => t.id === pane.entityId);
            for (const tank of game.tanks) {
              const enemy = tank.team !== pane.team && !tank.combat?.destroyed;
              const spotted = !game.spotting || game.spotting.isSpotted(tank.id, pane.team, seat);
              if (enemy && drawnBy[index].has(tank.id) && !spotted) out.leaks.push(`pane ${index + 1} drew ${tank.id}`);
              if (enemy && pane.hudSpotted(tank.id) !== spotted) out.hudMismatch.push(`pane ${index + 1} HUD ${tank.id}`);
              if (!drawnBy[index].has(tank.id) && drawnBy.some((set, other) => other !== index && set.has(tank.id))) out.hiddenHereShownThere++;
            }
            if (frame === 29) out.panes.push({ seat: pane.seat, team: pane.team, drawn: pane.drawn.length });
          });
        }
        return out;
      });
      report[`spotting${count}`] = { ...spot, leaks: spot.leaks.slice(0, 20), hudMismatch: spot.hudMismatch.slice(0, 20) };
      check(`${count}: no pane draws an enemy its own seat's side has not spotted (30 frames)`, spot.leaks.length === 0,
        `${spot.leaks.length} leaks; ${spot.hiddenHereShownThere} hull-frames hidden in one pane and drawn in another`);
      check(`${count}: each pane's HUD spotting (minimap, markers) is its own seat's`, spot.hudMismatch.length === 0,
        `${spot.hudMismatch.length} mismatches`);
    }

    if (measure) {
      report.step = `layout ${count}: measure`;
      if (count === layouts[0]) {
        soloEntry = await desktop.evaluate(() => ({ specId: window.__DEBUG.game.player?.specId ?? null,
          gameMode: window.__DEBUG.game.gameMode ?? 'standard' }));
      }
      report.frames[count] = await measureFrames(`${count} panes`);
      if (count === 1 && baseline) {
        // the like-for-like baseline: this battle, seat 1's same camera, drawn the solo way (one view, the page's HUD)
        await desktop.evaluate(() => window.__COT_COUCH.probeSoloView(true));
        await sleep(2500);
        report.frames.soloView = await measureFrames('same battle, solo view');
        await desktop.evaluate(() => window.__COT_COUCH.probeSoloView(false));
        await sleep(1500);
      }
    }

    report.step = `layout ${count}: leave`;
    await desktop.evaluate(() => window.__DEBUG.leaveBattleToGarage());
    await desktop.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
    check(`${count}: the panes go with the battle`, await desktop.evaluate(() => !document.querySelector('.cot-couch-panes')
      && !document.body.classList.contains('cot-couch-split')));
  }
  if (measure && baseline && soloEntry) {
    // a solo battle on the same build, tier and map (context: its roster is the solo entry's, not the couch battle's);
    // the ratios are to the same couch battle drawn the solo way (frames.soloView), the like-for-like baseline
    report.frames.solo = await soloFrames('solo battle');
    const solo = report.frames.soloView ?? report.frames.solo;
    report.ratios = {};
    for (const count of layouts) {
      const row = report.frames[count];
      if (!row) continue;
      const ratio = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? Math.round((a / b) * 1000) / 1000 : null);
      report.ratios[count] = { main: ratio(row.cpuFrame.med, solo.cpuFrame.med), gpu: ratio(row.gpuFrame.p25, solo.gpuFrame.p25),
        scene: ratio(row.cpuByLabel.scene, solo.cpuByLabel.scene), draws: ratio(row.calls.med, solo.calls.med),
        perPaneMainMs: count > 1 && report.frames[layouts[0]] ? Math.round(((row.cpuFrame.med - report.frames[layouts[0]].cpuFrame.med) / (count - 1)) * 100) / 100 : null };
      console.log(`ratio ${count} panes / solo: main ${report.ratios[count].main}, GPU ${report.ratios[count].gpu}, scene ${report.ratios[count].scene}, `
        + `draws ${report.ratios[count].draws}; per added pane ${report.ratios[count].perPaneMainMs} ms`);
    }
    if (report.ratios[1]) {
      check('the harness: one pane is within 5 % of solo (main thread; the same battle, the same camera, drawn the solo way)',
        Math.abs(report.ratios[1].main - 1) <= 0.05, `1 pane / solo view = ${report.ratios[1].main} (main), ${report.ratios[1].draws} (draws)`);
    }
  }
} catch (error) {
  report.failure = `${report.step}: ${String(error?.stack ?? error).slice(0, 800)}`;
  console.error('couch-panes failed at', report.step, error);
} finally {
  writeFileSync(resolve(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  try { await phoneBrowser?.close(); } catch { /* gone */ }
  try { await browser?.close(); } catch { /* gone */ }
  try { await (server?.close?.() ?? server?.httpServer?.close()); } catch { /* gone */ }
  await pads.close().catch(() => {});
  await new Promise((done) => padServer.close(done));
  await captureHold?.release();
}
const failed = report.failure || Object.values(report.checks).some((entry) => !entry.ok);
console.log(failed ? 'couch-panes: FAIL' : 'couch-panes: PASS');
process.exit(failed ? 1 : 0);
