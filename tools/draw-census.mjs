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
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { MAP_PROBE_BROWSER_ARGS, beginSoloBattle, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { FAR_POSES, farPose } from './far-poses.mjs';
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
/** --inventory: also list, per vehicle at its far LOD, every colour-pass draw with its material's program and maps
 * (far-hull-273: what one draw per far hull has to express). */
const inventory = process.argv.includes('--inventory');
mkdirSync(out, { recursive: true });

/** Poses beyond the probe's: the far poses (tools/far-poses.mjs) put the allies round the player past the far LOD. */
const EXTRA_POSES = FAR_POSES;

/** Page side: one frame's colour-pass draws under each vehicle whose far LOD shows, with their materials. */
function inventoryFrame() {
  const D = window.__DEBUG; const R = D.renderer; const scene = D.scene;
  const ids = new Map(); const idOf = (x) => { if (!x) return null; if (!ids.has(x)) ids.set(x, ids.size); return ids.get(x); };
  const rootOf = (o) => { for (let p = o; p; p = p.parent) if (/^tank_/.test(p.name || '')) return p; return null; };
  const rows = []; const orig = R.renderBufferDirect;
  R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    const root = sc === scene ? rootOf(object) : null;
    if (root && root.userData.farLod) {
      let far = false; root.traverse((n) => { if (n.userData?.farLod && n.visible) far = true; });
      const m = material; const g = geometry;
      const key = (() => { try { return m.customProgramCacheKey?.(); } catch { return '?'; } })();
      rows.push({ tank: root.name, far, owner: object.parent?.name || object.parent?.type, name: object.name || object.type,
        kind: object.isInstancedMesh ? 'instanced' : object.isBatchedMesh ? 'batched' : object.isSkinnedMesh ? 'skinned' : 'mesh',
        farLod: !!object.userData.farLod, marking: !!object.userData.vehicleMarking, group: group ? group.materialIndex : null,
        attrs: Object.keys(g.attributes).sort().join(','), verts: g.attributes.position?.count, index: g.index?.count ?? null,
        mat: { type: m.type, id: idOf(m), name: m.name, key, defines: Object.keys(m.defines || {}).sort().join(','),
          map: idOf(m.map), normalMap: idOf(m.normalMap), roughnessMap: idOf(m.roughnessMap), alphaMap: idOf(m.alphaMap),
          emissiveMap: idOf(m.emissiveMap), metalnessMap: idOf(m.metalnessMap), aoMap: idOf(m.aoMap),
          color: m.color?.getHexString?.(), emissive: m.emissive?.getHexString?.(), roughness: m.roughness, metalness: m.metalness,
          env: m.envMapIntensity, clearcoat: m.clearcoat, sheen: m.sheen, specularIntensity: m.specularIntensity,
          normalScale: m.normalScale ? [m.normalScale.x, m.normalScale.y] : null, vertexColors: m.vertexColors,
          transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, depthWrite: m.depthWrite,
          polygonOffset: m.polygonOffset ? m.polygonOffsetUnits : null, role: m.userData?.vehicleMaterialRole ?? null,
          burn: !!m.userData?.__burnU, flatShading: m.flatShading, toneMapped: m.toneMapped, fog: m.fog } });
    }
    return orig.call(this, camera, sc, geometry, material, object, group);
  };
  return new Promise((resolve) => {
    requestAnimationFrame(() => { rows.length = 0; requestAnimationFrame(() => { R.renderBufferDirect = orig; resolve(rows); }); });
  });
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

/** The browser's process tree's resident memory (MB) by process name: the GPU process holds a Mac's GPU memory. */
function treeMemory(rootPid) {
  if (!rootPid) return null;
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,args='], { encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], comm: m[4] }));
  const tree = new Set([rootPid]);
  for (let grew = true; grew;) { grew = false; for (const r of rows) if (!tree.has(r.pid) && tree.has(r.ppid)) { tree.add(r.pid); grew = true; } }
  const members = rows.filter((r) => tree.has(r.pid));
  const gpu = members.filter((r) => /--type=gpu-process/.test(r.comm)).reduce((s, r) => s + r.rss, 0);
  return { treeMB: Math.round(members.reduce((s, r) => s + r.rss, 0) / 1024), processes: members.length, gpuMB: Math.round(gpu / 1024) };
}

const report = { root, tier, preset, viewport: `${width}x${height}`, maps: {}, loadAtStart: os.loadavg().map((v) => +v.toFixed(1)) };
let hold = null; let browser = null; let server = null;
try {
  server = await openPreview(root, port);
  hold = await openCaptureHold({ label: 'draw-census', timeoutMs: 3 * 60 * 60 * 1000, lockClass: 'render', command: 'tools/draw-census.mjs' });
  const startedAt = Date.now();
  for (const mapId of maps) {
    if (Date.now() - startedAt > 18 * 60 * 1000) { report.stopped = 'past 18 minutes of hold'; break; }
    // a browser per map (far-hull-273): each map's memory is its own, not the maps' before it
    await browser?.close().catch(() => {});
    browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120000, protocolTimeout: 600000,
      args: [...MAP_PROBE_BROWSER_ARGS, '--use-angle=metal', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'draw-census' });
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
    const farBytes = () => page.evaluate(() => {
      let bytes = 0, draws = 0;
      window.__DEBUG.scene.traverse((o) => {
        if (o.name !== 'farLodHullDraw' || !o.geometry) return;
        draws++;
        for (const a of Object.values(o.geometry.attributes)) bytes += a.array.byteLength;
        if (o.geometry.index) bytes += o.geometry.index.array.byteLength;
      });
      const R = window.__DEBUG.renderer;
      return { farDraws: draws, farMB: +(bytes / 1048576).toFixed(2), geometries: R.info.memory.geometries, textures: R.info.memory.textures,
        programs: R.info.programs?.length ?? null, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
    });
    for (const view of views) {
      if (view in EXTRA_POSES) {
        await page.evaluate(farPose, EXTRA_POSES[view]);
        // the far LOD builds one vehicle at a time: wait for the count showing it to stand still
        let last = -1, still = 0;
        for (let i = 0; i < 60 && still < 4; i++) {
          await sleep(500);
          const n = await page.evaluate(() => { let k = 0; window.__DEBUG.scene.traverse((o) => { if (!/^tank_/.test(o.name || '') || o.userData.farLod === undefined) return; let far = false; o.traverse((c) => { if (c.userData?.farLod && c.visible) far = true; }); if (far) k += 1000; if (o.userData.farLod?.hullDraw) k++; }); return k; });
          still = n === last ? still + 1 : 0; last = n;
        }
      } else await poseView(page, view);
      await sleep(1200);
      await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
      await page.evaluate(settleResidencyTerrain).catch(() => null);
      await sleep(1500);
      const census = await page.evaluate(censusFrames, frames);
      if (inventory) census.inventory = await page.evaluate(inventoryFrame);
      // each vehicle's far LOD record (its far hull draw: what it carries and leaves, its build time)
      census.farLod = await page.evaluate(() => { const out = []; window.__DEBUG.scene.traverse((o) => { if (/^tank_/.test(o.name || '') && o.userData.farLod) out.push({ name: o.name, ...o.userData.farLod }); }); return out; });
      report.maps[mapId].views[view] = census;
      console.log(`${mapId} ${view}: ${JSON.stringify(census.totals)} info ${JSON.stringify(census.info)}`);
    }
    report.maps[mapId].memory = { ...(await farBytes().catch(() => null)), ...treeMemory(browser.process()?.pid) };
    console.log(`${mapId} memory ${JSON.stringify(report.maps[mapId].memory)}`);
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
