#!/usr/bin/env node
// Rendered proof for one draw per far hull (far-hull-273, 2026-11-14): fixed cameras that put the allies past the far LOD
// (vehicles/farLod.ts), every frame a function of the scene state (the temporal AA held, the clouds' history frozen, the
// wind clock set, each frame rendered and read back in one page task, as tools/world-pools-truth.mjs does).
//
//   node tools/far-hull-truth.mjs --root=<tree with dist> [--label=new] [--maps=verdant,monsoon,autumn]
//     [--views=far-allies,far-low,far-side] [--viewport=1600x900] [--tier=desktop|mobile] [--preset=high] [--port=0]
//     [--out=<dir>] [--bisect] [--turn] [--control=tint|paired] [--place=<queue key>]
//
// Per map and view: the frame with the far hull draw (A), again (the A/A floor), with the stand-ins as they were
// (B: window.__FAR_HULL_DEBUG.set(false)) and with the draw again (A'); the colour frames A and B as PNG, a difference
// map (red where B is darker by more than 8/255 in luminance, green brighter), each far vehicle's screen box (the crops
// the blind A/B shows), the frame's draw calls either way and every vehicle's far hull draw record (what it carries, its
// fallbacks by reason). --control=tint scales every far hull draw's colour by 0.8 before A (the pixel test's
// sensitivity control: A against B must then differ wherever a far vehicle shows); --control=paired captures each pose
// untinted and then tinted in the same page and scene state, and gates the pose on the tint moving a pixel. The bots are frozen and shown; the
// far LOD builds one vehicle at a time, so each view waits until every vehicle past the far
// range shows it.
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { MAP_PROBE_BROWSER_ARGS, beginSoloBattle, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { awaitTextures, freezeBattle, grassSettled, installObservers, openPreview, pinnedOpponents } from './frame-budget-probe.mjs';
import { encodeRgbPng } from './frame-capture-compare.mjs';
import { FAR_POSES, farLodCensus, farPose } from './far-poses.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = path.resolve(arg('out', '.qa-dev/far-hull-truth'));
mkdirSync(out, { recursive: true });


/** Page side: the helpers (serialized). */
function installHelpers() {
  const D = window.__DEBUG;
  const src = D.renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = () => { ctx.drawImage(src, 0, 0); return ctx.getImageData(0, 0, cv.width, cv.height).data; };
  const hold = D.post.holdTemporalAA?.('qa') ?? null;
  const clouds = D.scene?.userData?.volumetricClouds ?? null;
  if (clouds) clouds.frozen = true;
  const frame = () => { D.world?.setWindTime?.(12.5); D.lighting.update(false, 1 / 60); D.post.render(0, 0); return D.renderer.info.render.calls; };
  const lumOf = (d) => { const o = new Uint8Array(d.length / 4); for (let p = 0, q = 0; p < o.length; p++, q += 4) o[p] = Math.round(0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]); return o; };
  const diff = (a, b) => {
    let px1 = 0, px8 = 0, max = 0;
    for (let p = 0; p < a.length; p++) { const d = Math.abs(a[p] - b[p]); if (d > 1) px1++; if (d > 8) px8++; if (d > max) max = d; }
    return { px1, px8, max };
  };
  const b64 = (o) => { let s = ''; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000)); return btoa(s); };
  const rgbOf = (d) => { const o = new Uint8Array(d.length / 4 * 3); for (let p = 0, q = 0; q < d.length; p += 3, q += 4) { o[p] = d[q]; o[p + 1] = d[q + 1]; o[p + 2] = d[q + 2]; } return o; };
  /** Each far vehicle's screen box (its root's bounds projected), in canvas pixels. */
  const boxes = () => {
    const cam = D.camera; const out = [];
    const V = cam.position.constructor;
    D.scene.traverse((o) => {
      if (!/^tank_/.test(o.name || '') || o.userData.farLod === undefined) return;
      let far = false; o.traverse((n) => { if (n.userData?.farLod && n.visible) far = true; });
      if (!far) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = true;
      const box = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
      o.traverseVisible((n) => {
        if (!n.isMesh || !n.geometry?.boundingSphere) return;
        const s = n.geometry.boundingSphere; const c = new V().copy(s.center).applyMatrix4(n.matrixWorld);
        const r = s.radius * n.matrixWorld.getMaxScaleOnAxis();
        for (const k of ['x', 'y', 'z']) { box.min[k] = Math.min(box.min[k], c[k] - r); box.max[k] = Math.max(box.max[k], c[k] + r); }
      });
      if (!Number.isFinite(box.min.x)) return;
      for (let i = 0; i < 8; i++) {
        const p = new V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        if (p.z > 1) front = false;
        const sx = (p.x * 0.5 + 0.5) * cv.width, sy = (1 - (p.y * 0.5 + 0.5)) * cv.height;
        x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
      }
      if (front && x1 > 0 && y1 > 0 && x0 < cv.width && y0 < cv.height) out.push({ name: o.name, box: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)] });
    });
    return out;
  };
  window.__FHT = {
    capture() {
      const sw = window.__FAR_HULL_DEBUG;
      if (!sw) return { error: 'no __FAR_HULL_DEBUG in this build' };
      // --control=tint (the receipt's sensitivity control): every far hull draw's colour scaled by 0.8, so A must differ
      let tinted = 0;
      if (window.__FHT_TINT) D.scene.traverse((o) => {
        if (o.name !== 'farLodHullDraw' || !o.material?.color || o.material.userData.fhtTinted) return;
        o.material.color.multiplyScalar(0.8); o.material.userData.fhtTinted = true; tinted++;
      });
      sw.set(true);
      const callsA = frame(); const A = rgba(); const lA = lumOf(A);
      frame(); const lA2 = lumOf(rgba());
      sw.set(false);
      const callsB = frame(); const B = rgba(); const lB = lumOf(B);
      sw.set(true);
      frame(); const lA3 = lumOf(rgba());
      // --bisect: each material's pieces drawn their own way in the one draw's frame; how far the difference to B falls
      let bisect = null;
      if (window.__FHT_BISECT && diff(lA, lB).px8 > 0 && sw.exclude) {
        const names = new Set();
        D.scene.traverse((o) => { if (o.name === 'farLodHullDraw' && o.visible) names.add('*'); });
        const tests = { 'live pieces': (m, p) => !!p.live, 'stand-ins and gear': (m, p) => !p.live };
        D.scene.traverse((o) => {
          if (!/^tank_/.test(o.name || '')) return;
          o.traverse((c) => { if (c.isMesh && !c.userData?.farLod) for (const m of [].concat(c.material)) if (m?.name) names.add(m.name); });
        });
        for (const name of names) if (name !== '*') tests[`material ${name}`] = (m) => m.name === name;
        bisect = [];
        for (const [label, test] of Object.entries(tests)) {
          const n = sw.exclude(test);
          if (!n) continue;
          frame(); const d = diff(lumOf(rgba()), lB);
          bisect.push({ label, pieces: n, px8: d.px8, px1: d.px1 });
        }
        sw.exclude(null); frame();
        bisect.sort((a, b) => a.px8 - b.px8);
      }
      const shaderErrors = D.renderer.info.programs?.filter?.((p) => p.diagnostics && !p.diagnostics.runnable).length ?? null;
      return { width: cv.width, height: cv.height, tinted, callsA, callsB, floor: diff(lA, lA2), ab: diff(lA, lB), again: diff(lA, lA3),
        boxes: boxes(), shaderErrors, bisect, a: b64(rgbOf(A)), b: b64(rgbOf(B)) };
    },
    /** --control=paired: every far hull draw's colour x 0.8 (on) or back (off); returns how many draws it changed. */
    tint(on) {
      let n = 0;
      D.scene.traverse((o) => {
        if (o.name !== 'farLodHullDraw' || !o.material?.color) return;
        const tinted = !!o.material.userData.fhtTinted;
        if (on && !tinted) { o.material.color.multiplyScalar(0.8); o.material.userData.fhtTinted = true; n++; }
        if (!on && tinted) { o.material.color.multiplyScalar(1 / 0.8); o.material.userData.fhtTinted = false; n++; }
      });
      return n;
    },
    release() { hold?.release?.(); if (clouds) clouds.frozen = false; },
  };
  return { width: cv.width, height: cv.height, taaHeld: !!hold, cloudsFrozen: !!clouds };
}

const root = path.resolve(arg('root', '.'));
const label = arg('label', 'new');
const maps = arg('maps', 'verdant,monsoon,autumn').split(',');
const views = arg('views', Object.keys(FAR_POSES).join(',')).split(',');
const tier = arg('tier', 'desktop');
const preset = arg('preset', tier === 'desktop' ? 'high' : 'mobile');
const [width, height] = arg('viewport', tier === 'desktop' ? '1600x900' : '1280x720').split('x').map(Number);
const port = Number(arg('port', 0)); // 0: the capture slot's preview block (capture-ports.mjs), else an OS-assigned port
const report = { root, label, tier, preset, viewport: `${width}x${height}`, loadAtStart: os.loadavg().map((v) => +v.toFixed(1)), maps: {} };
let server = null, hold = null, browser = null;
let entry_turn = null;
try {
  server = await openPreview(root, port);
  hold = await openCaptureHold({ label: 'far-hull-truth', place: arg('place', undefined), timeoutMs: 3 * 60 * 60 * 1000, lockClass: 'render', command: 'tools/far-hull-truth.mjs' });
  const startedAt = Date.now();
  for (const mapId of maps) {
    if (Date.now() - startedAt > 18 * 60 * 1000) { report.stopped = 'past 18 minutes of hold'; break; }
    await browser?.close().catch(() => {});
    browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120000, protocolTimeout: 600000,
      args: [...MAP_PROBE_BROWSER_ARGS, '--use-angle=metal', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'far-hull-truth' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 400)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' && /far hull|THREE\.WebGLProgram/.test(m.text())) errors.push(`console ${m.type()}: ${m.text().slice(0, 1200)}`); });
    const mobile = tier === 'mobile';
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument(installObservers, { preset, allies: 13, enemies: 14 });
    await page.goto(`http://127.0.0.1:${server.port}/?nosplash=1&tier=${tier}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(BOOT_LOADED_EXPRESSION, { timeout: 300000 });
    await page.evaluate(() => { window.__DEBUG.renderer.debug.checkShaderErrors = true; });
    const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
    await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, pinnedOpponents(catalog, 't90m', 27));
    await beginSoloBattle(page, { specId: 't90m', mapId, timeoutMs: 420000 });
    await page.evaluate(awaitTextures, 90000);
    await page.evaluate(freezeBattle, 'pinned');
    // --turn: every bot's turret turned to its own angle (and its gun raised a little), so the far hull draw's owners move
    // off their rest pose before the frames
    if (process.argv.includes('--turn')) {
      entry_turn = await page.evaluate(() => {
        let set = 0, held = 0, i = 0;
        for (const e of window.__DEBUG.game.tanks) {
          if (e.isPlayer || !e.state) continue;
          const yaw = ((i++ * 0.9) % 2.4) - 1.2;
          e.state.turretYaw = yaw; set++;
          if (typeof e.state.gunPitch === 'number') e.state.gunPitch = 0.06;
          e.__turnTo = yaw;
        }
        return new Promise((resolve) => setTimeout(() => {
          for (const e of window.__DEBUG.game.tanks) if (e.__turnTo !== undefined && Math.abs(e.state.turretYaw - e.__turnTo) < 1e-3) held++;
          resolve({ set, held });
        }, 1500));
      });
      console.log(`${mapId}: turrets turned ${JSON.stringify(entry_turn)}`);
    }
    const helpers = await page.evaluate(installHelpers);
    if (process.argv.includes('--bisect')) await page.evaluate(() => { window.__FHT_BISECT = true; });
    if (arg('control', '') === 'tint') await page.evaluate(() => { window.__FHT_TINT = true; });
    const entry = report.maps[mapId] = { helpers, views: {}, errors, turn: entry_turn };
    for (const view of views) {
      await page.evaluate(farPose, FAR_POSES[view]);
      await sleep(1200);
      // the far LOD builds one vehicle at a time: wait for the count showing it to stand still
      let last = -1, still = 0, state = null;
      for (let i = 0; i < 60 && still < 4; i++) {
        await sleep(500);
        state = await page.evaluate(farLodCensus);
        const key = state.far * 1000 + state.built;
        still = key === last ? still + 1 : 0; last = key;
      }
      await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
      await page.evaluate(settleResidencyTerrain).catch(() => null);
      await sleep(1500);
      const r = await page.evaluate(() => window.__FHT.capture());
      if (r.error) { entry.views[view] = r; console.log(`${mapId} ${view}: ${r.error}`); continue; }
      const stem = path.join(out, `${label}-${tier}-${mapId}-${view}`);
      const A = Buffer.from(r.a, 'base64'), B = Buffer.from(r.b, 'base64');
      writeFileSync(`${stem}-A.png`, encodeRgbPng(r.width, r.height, A));
      writeFileSync(`${stem}-B.png`, encodeRgbPng(r.width, r.height, B));
      // the raw frames (RGB, row-major from the top) for the blind A/B's crops (tools/far-hull-ab.mjs)
      writeFileSync(`${stem}-A.rgb`, A);
      writeFileSync(`${stem}-B.rgb`, B);
      const map = new Uint8Array(A.length);
      for (let p = 0; p < A.length; p += 3) {
        const la = 0.299 * A[p] + 0.587 * A[p + 1] + 0.114 * A[p + 2], lb = 0.299 * B[p] + 0.587 * B[p + 1] + 0.114 * B[p + 2];
        const d = lb - la, g = la * 0.45;
        map[p] = d < -8 ? 255 : g; map[p + 1] = d > 8 ? 255 : g; map[p + 2] = g;
      }
      writeFileSync(`${stem}-diff.png`, encodeRgbPng(r.width, r.height, map));
      delete r.a; delete r.b;
      const after = await page.evaluate(farLodCensus);
      entry.views[view] = { ...r, far: { vehicles: after.vehicles, showing: after.far, built: after.built, refused: after.refused,
        missing: after.missing, gear: after.gear }, records: after.records };
      // --control=paired: the same pose and scene state with every far hull draw's colour x 0.8 (the pose's own control);
      // gate: a far hull is in view when the tint moved at least one pixel
      if (arg('control', '') === 'paired') {
        const tinted = await page.evaluate(() => window.__FHT.tint(true));
        const t = await page.evaluate(() => window.__FHT.capture());
        await page.evaluate(() => window.__FHT.tint(false));
        if (t.error) entry.views[view].tint = { error: t.error };
        else {
          const tA = Buffer.from(t.a, 'base64');
          writeFileSync(`${stem}-tint-A.png`, encodeRgbPng(t.width, t.height, tA));
          delete t.a; delete t.b; delete t.boxes; delete t.bisect;
          entry.views[view].tint = { ...t, tinted };
        }
        const tv = entry.views[view].tint;
        entry.views[view].gate = { inView: !!tv && !tv.error && tv.ab.px1 > 0 };
        console.log(`${mapId} ${view}: tint (${tinted} draws) A/B ${JSON.stringify(tv?.ab ?? tv)}, gate ${entry.views[view].gate.inView ? 'IN VIEW' : 'no far hull in view'}`);
      }
      console.log(`${mapId} ${view}: far ${after.showing}/${after.built}, calls draw ${r.callsA} vs stand-ins ${r.callsB}, floor ${JSON.stringify(r.floor)}, A/B ${JSON.stringify(r.ab)}, again ${JSON.stringify(r.again)}, boxes ${r.boxes.length}, errors ${errors.length}`);
    }
    await page.evaluate(() => window.__FHT.release()).catch(() => {});
    await page.close().catch(() => {});
  }
} catch (error) {
  report.error = String(error?.stack ?? error).slice(0, 800);
  console.error(report.error);
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  try { await server?.close(); } catch { /* closed */ }
  await hold?.release?.();
  report.loadAtEnd = os.loadavg().map((v) => +v.toFixed(1));
  writeFileSync(path.join(out, `${label}-${tier}.json`), JSON.stringify(report, null, 1));
  console.log(`wrote ${path.join(out, `${label}-${tier}.json`)}`);
}
process.exit(0);
