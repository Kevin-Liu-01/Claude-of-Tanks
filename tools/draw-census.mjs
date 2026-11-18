#!/usr/bin/env node
// Draw census (2026-11-12, world-pools-272): which objects issue the draw calls of one battle frame, pass by pass.
// The world inventory (couch-panes-272) counts visible objects; a zero-instance pool or a shadow-only proxy outside its
// cascade costs no draw, so the census wraps renderer.renderBufferDirect for whole frames and charges every call that
// reaches the GPU (an instanced call with count 0 is a submission, not a draw) to its object's world subtree and name.
//
//   node tools/draw-census.mjs --root=<checkout with dist> [--maps=verdant,monsoon,whiteout] [--views=chase,centre-far]
//     [--viewport=1920x1080] [--tier=desktop|mobile] [--preset=high] [--frames=3] [--port=5371] [--out=<dir>] [--tag=<tag>]
//     [--bots] (the frozen bots stay drawn: their hulls' draws, the far LOD's among them) [--query=<page query>]
//
// Staging is the frame-budget probe's (docs/PERFORMANCE.md "Frame budget"): the preset pinned before boot, 14 v 14 with
// the pinned roster, every bot frozen and hidden, the governor pinned at 1, the textures awaited, the terrain settled.
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { MAP_PROBE_BROWSER_ARGS, beginSoloBattle, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { awaitTextures, freezeBattle, grassSettled, hideOtherVehicles, installObservers, openPreview, pinnedOpponents, poseView } from './frame-budget-probe.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = path.resolve(arg('root', '.'));
const maps = arg('maps', 'verdant').split(',');
const views = arg('views', 'chase,centre-far').split(',');
const [width, height] = arg('viewport', '1920x1080').split('x').map(Number);
const tier = arg('tier', 'desktop');
const preset = arg('preset', tier === 'desktop' ? 'high' : '');
const frames = Number(arg('frames', 3));
const port = Number(arg('port', 5371));
const out = path.resolve(arg('out', path.join(root, '.qa-dev/draw-census')));
const tag = arg('tag', 'census');
const query = arg('query', '');
const showBots = process.argv.includes('--bots');
mkdirSync(out, { recursive: true });

/** Poses beyond the probe's: `far-allies` stands 230 m behind and 45 m above the player's hull, looking at it, so the
 * allies round it draw at their far LOD (vehicles/farLod.ts: past 180 m of screen-equivalent distance). */
const EXTRA_POSES = { 'far-allies': { back: 230, up: 45 } };
function farPose({ back, up }) {
  const D = window.__DEBUG; const st = D.game.player.state; const V = D.camera.position.constructor;
  const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
  D.rig.setExternalPose(new V(st.pos.x - fx * back, st.pos.y + up, st.pos.z - fz * back), new V(st.pos.x, st.pos.y, st.pos.z), 55);
}

/** Page side: wrap renderBufferDirect for `n` whole frames; returns per pass and key { calls, draws, instances }. */
function censusFrames(n) {
  const D = window.__DEBUG; const R = D.renderer; const scene = D.scene;
  const label = (o) => {
    let name = o.name || ''; let p = o;
    while (!name && p.parent) { p = p.parent; name = p.name || ''; }
    const ud = o.userData || {};
    const tags = [ud.treeLod, ud.treeImpostor ? 'impostor' : '', ud.treeCanopyShadowProxy ? 'proxy' : '', ud.treeTrunk ? 'trunk' : '',
      ud.treeFoliage ? 'foliage' : '', ud.treeSpecies || ''].filter(Boolean).join(',');
    return `${(name || o.type).replace(/[0-9]+/g, '#').slice(0, 48)}${tags ? `[${tags}]` : ''}`;
  };
  const groupOf = (o) => {
    const chain = [];
    for (let p = o.parent; p && p !== scene; p = p.parent) chain.unshift(p.name || p.type);
    return chain.slice(0, 2).join('/') || '(scene)';
  };
  const rows = {};
  const totals = {};
  const matIds = new Map();
  const matOf = (m) => { if (Array.isArray(m)) m = m[0]; if (!m) return '-'; if (!matIds.has(m)) matIds.set(m, matIds.size); return `${m.type.replace('Material', '')}#${matIds.get(m)}`; };
  const orig = R.renderBufferDirect;
  let current = 'main';
  R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    const pass = sc === null ? 'shadow' : (sc === scene ? 'main' : 'other');
    const inst = object.isInstancedMesh ? object.count : (geometry?.isInstancedBufferGeometry ? geometry.instanceCount : 1);
    const key = `${pass} ${groupOf(object)} ${label(object)} {${matOf(object.material)}}`;
    const r = rows[key] ??= { calls: 0, draws: 0, instances: 0 };
    r.calls++; if (inst > 0) { r.draws++; r.instances += inst; }
    const t = totals[pass] ??= { calls: 0, draws: 0 };
    t.calls++; if (inst > 0) t.draws++;
    return orig.call(this, camera, sc, geometry, material, object, group);
  };
  return new Promise((resolve) => {
    let left = n + 1; // the first callback opens the window at a frame boundary
    let armed = false;
    const tick = () => {
      if (!armed) { armed = true; for (const k of Object.keys(rows)) delete rows[k]; for (const k of Object.keys(totals)) delete totals[k]; }
      if (--left > 0) { requestAnimationFrame(tick); return; }
      R.renderBufferDirect = orig;
      const per = (v) => Math.round(v / n * 10) / 10;
      const table = Object.entries(rows).map(([k, r]) => ({ key: k, calls: per(r.calls), draws: per(r.draws), instances: per(r.instances) }))
        .sort((a, b) => b.draws - a.draws);
      resolve({ frames: n, totals: Object.fromEntries(Object.entries(totals).map(([k, t]) => [k, { calls: per(t.calls), draws: per(t.draws) }])),
        info: { calls: R.info.render.calls, triangles: R.info.render.triangles }, table });
    };
    requestAnimationFrame(tick);
  });
}

const report = { root, tier, preset, viewport: `${width}x${height}`, maps: {}, loadAtStart: os.loadavg().map((v) => +v.toFixed(1)) };
let hold = null; let browser = null; let server = null;
try {
  server = await openPreview(root, port);
  hold = await openCaptureHold({ label: 'draw-census', timeoutMs: 3 * 60 * 60 * 1000, lockClass: 'render', command: 'tools/draw-census.mjs' });
  const startedAt = Date.now();
  browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120000, protocolTimeout: 600000,
    args: [...MAP_PROBE_BROWSER_ARGS, '--use-angle=metal', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'draw-census' });
  for (const mapId of maps) {
    if (Date.now() - startedAt > 18 * 60 * 1000) { report.stopped = 'past 18 minutes of hold'; break; }
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
    const mobile = tier === 'mobile';
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    if (preset) await page.evaluateOnNewDocument(installObservers, { preset, allies: 13, enemies: 14 });
    await page.goto(`http://127.0.0.1:${port}/?${['nosplash=1', `tier=${tier}`, query].filter(Boolean).join('&')}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(BOOT_LOADED_EXPRESSION, { timeout: 300000 });
    // (a production build skips three's shader checks: a program that fails to link draws nothing, silently)
    await page.evaluate(() => { window.__DEBUG.renderer.debug.checkShaderErrors = true; });
    if (preset) {
      const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
      const opponents = pinnedOpponents(catalog, 't90m', 27);
      await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, opponents);
    }
    await beginSoloBattle(page, { specId: 't90m', mapId, timeoutMs: 420000 });
    await page.evaluate(awaitTextures, 90000);
    await page.evaluate(freezeBattle, 'pinned');
    if (!showBots) await page.evaluate(hideOtherVehicles);
    report.maps[mapId] = { views: {}, errors };
    for (const view of views) {
      if (view in EXTRA_POSES) await page.evaluate(farPose, EXTRA_POSES[view]);
      else await poseView(page, view);
      await sleep(1200);
      await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
      await page.evaluate(settleResidencyTerrain).catch(() => null);
      await sleep(1500);
      const census = await page.evaluate(censusFrames, frames);
      report.maps[mapId].views[view] = census;
      console.log(`${mapId} ${view}: ${JSON.stringify(census.totals)} info ${JSON.stringify(census.info)}`);
    }
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
  const file = path.join(out, `${tag}.json`);
  writeFileSync(file, JSON.stringify(report, null, 1));
  console.log(`wrote ${file}`);
}
process.exit(0);
