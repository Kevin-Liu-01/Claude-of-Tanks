#!/usr/bin/env node
// Rendered proof of the static shadow-caster cache (engine/shadowStaticCache.ts, P20): every scenario renders the
// same scene state twice inside ONE page task — once through the cache, once with __SHADOW_DEBUG.noStaticCache — and
// compares the frames pixel for pixel (8-bit luminance). Inside one task no game frame, wind tick or cloud step runs
// between the two renders, so any difference is the cache's. The A/A floor (the uncached render twice) is measured
// first. Scenarios: a still frame (the reuse path), a hull moved and turned (the dynamic layer on the reused copy), a
// camera step across the cascade snaps, the sun moved (a time-of-day change), a tree felled and a prop destroyed with
// the fall animated through world.update (rebuild, then the moving caster promoted to the dynamic layer), and two
// sequences compared frame by frame — a hull driving past a still camera (every frame the reuse path) and a camera
// dolly (every frame a pose change) — rendered once cached and once uncached from the same scripted states.
//
//   node tools/shadow-cache-truth.mjs --root=<tree with dist/> --maps=verdant,monsoon [--out=<dir>] [--port=5395]
//        [--session-mutex=<dir>] [--query=clouds=off] [--gate]
//
// --gate exits 1 when any scenario differs by more than the A/A floor (+ --tolerance px). Writes <out>/result.json
// and, for every scenario with a difference, a diff PNG (red: darker with the cache, green: darker without).

import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { MAP_PROBE_BROWSER_ARGS, beginSoloBattle, isMainModule, sleep } from './map-probe-runtime.mjs';
import {
  acquireProbeLocks, awaitTextures, freezeBattle, grassSettled, installObservers, openPreview, pinnedOpponents, poseView,
} from './frame-budget-probe.mjs';

function parseArgs(argv) {
  const o = { root: null, maps: ['verdant'], out: path.resolve('.qa-dev', 'reports', 'shadow-cache-truth'), port: 5395,
    sessionMutex: null, query: '', gate: false, tolerance: 0, viewport: [1600, 900], spec: 't90m_x', sides: [6, 7] };
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) throw new Error(`Unknown argument ${arg}`);
    const [, k, v] = m;
    if (k === 'root') o.root = path.resolve(v);
    else if (k === 'maps') o.maps = v.split(',').filter(Boolean);
    else if (k === 'out') o.out = path.resolve(v);
    else if (k === 'port') o.port = Number(v);
    else if (k === 'session-mutex') o.sessionMutex = path.resolve(v);
    else if (k === 'query') o.query = v ?? '';
    else if (k === 'gate') o.gate = true;
    else if (k === 'tolerance') o.tolerance = Number(v);
    else if (k === 'sides') o.sides = v.split('x').map(Number);
    else throw new Error(`Unknown argument --${k}`);
  }
  if (!o.root) throw new Error('--root=<tree with a production dist> is required');
  return o;
}

// ---------------------------------------------------------------------------------------------- page side

/** Installs window.__SCT: render(cached) → 8-bit luminance, diff(a, b) → counts and a diff image. */
function installTruthHelpers() {
  const D = window.__DEBUG;
  const src = D.renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const lum = () => {
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const out = new Uint8Array(cv.width * cv.height);
    for (let p = 0, q = 0; p < out.length; p++, q += 4) out[p] = Math.round(0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]);
    return out;
  };
  const debug = () => (window.__SHADOW_DEBUG = window.__SHADOW_DEBUG || {});
  /** One complete frame of the current state: the lighting update (it arms the cache), then the post transaction. */
  const frame = (cached) => {
    debug().noStaticCache = !cached;
    D.lighting.update(false, 1 / 60);
    D.post.render(0, 0);
  };
  const telemetry = () => D.lighting.getShadowTelemetry().staticCache;
  window.__SCT = {
    width: cv.width, height: cv.height,
    frame,
    lum,
    telemetry,
    /** `warm` cached frames, capture; one uncached frame, capture; the cache back on. */
    pair(warm = 3) {
      const before = telemetry();
      for (let i = 0; i < warm; i++) frame(true);
      const a = lum();
      const mid = telemetry();
      frame(false);
      const b = lum();
      debug().noStaticCache = false;
      return { a, b, cache: { reusesDuring: (mid.reuses || []).reduce((s, v) => s + (v || 0), 0) - (before.reuses || []).reduce((s, v) => s + (v || 0), 0),
        rebuildsDuring: (mid.rebuilds || []).reduce((s, v) => s + (v || 0), 0) - (before.rebuilds || []).reduce((s, v) => s + (v || 0), 0),
        promoted: mid.promoted, lastRebuildReason: mid.lastRebuildReason, enabled: mid.enabled } };
    },
    diff(a, b, threshold = 1) {
      let px = 0, onlyA = 0, max = 0;
      for (let p = 0; p < a.length; p++) {
        const d = a[p] - b[p];
        const ad = d < 0 ? -d : d;
        if (ad > threshold) { px++; if (d < 0) onlyA++; }
        if (ad > max) max = ad;
      }
      return { px, darkerCached: onlyA, darkerUncached: px - onlyA, max };
    },
    diffPng(a, b, threshold = 1) {
      const img = ctx.createImageData(cv.width, cv.height);
      for (let p = 0, q = 0; p < a.length; p++, q += 4) {
        const d = a[p] - b[p], g = b[p] * 0.45;
        img.data[q] = d < -threshold ? 255 : g; img.data[q + 1] = d > threshold ? 255 : g; img.data[q + 2] = g; img.data[q + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    },
  };
  return { width: cv.width, height: cv.height, cacheEnabled: !!telemetry()?.enabled };
}

/** Run one scenario in the page: `body` mutates the state between pairs and returns the pairs to compare. */
async function scenario(page, name, body, out, results, tag) {
  const r = await page.evaluate(body);
  for (const item of r.items) {
    const key = `${name}${item.step !== undefined ? `-${item.step}` : ''}`;
    results.push({ scenario: name, step: item.step ?? null, ...item.diff, cache: item.cache ?? null, note: item.note ?? null });
    if (item.png) writeFileSync(path.join(out, `${tag}-${key}.png`), Buffer.from(item.png.split(',')[1], 'base64'));
  }
  return r;
}

// Scenario bodies (serialized; each runs in one task)
const S_FLOOR = `(() => {
  const T = window.__SCT; const items = [];
  window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { forceAll: true });
  T.frame(false); const a = T.lum(); T.frame(false); const b = T.lum();
  items.push({ diff: T.diff(a, b), note: 'uncached twice: the driver floor' });
  window.__SHADOW_DEBUG.noStaticCache = false;
  return { items };
})()`;

const S_STILL = `(() => {
  const T = window.__SCT; const { a, b, cache } = T.pair(4); const diff = T.diff(a, b);
  return { items: [{ diff, cache, png: diff.px ? T.diffPng(a, b) : null, note: 'still: the reuse path' }] };
})()`;

const S_TANK = `(() => {
  const D = window.__DEBUG; const T = window.__SCT; const items = [];
  const cam = D.camera.position;
  const tanks = D.game.tanks.filter((e) => !e.isPlayer && e.visual?.root).map((e) => ({ e, d: e.visual.root.position.distanceTo(cam) })).sort((x, y) => x.d - y.d);
  const pick = tanks[0];
  if (!pick) return { items: [{ diff: { px: -1 }, note: 'no bot hull' }] };
  const root = pick.e.visual.root;
  T.pair(3); // settle the copy
  root.position.x += 3; root.rotation.y += 0.35; root.updateMatrixWorld(true);
  let { a, b, cache } = T.pair(1); let diff = T.diff(a, b);
  items.push({ step: 'moved', diff, cache, png: diff.px ? T.diffPng(a, b) : null, note: 'hull ' + pick.e.specId + ' at ' + pick.d.toFixed(0) + ' m moved 3 m and turned' });
  root.position.x -= 3; root.rotation.y -= 0.35; root.updateMatrixWorld(true);
  ({ a, b, cache } = T.pair(1)); diff = T.diff(a, b);
  items.push({ step: 'back', diff, cache, png: diff.px ? T.diffPng(a, b) : null, note: 'moved back: no stale shadow left' });
  return { items };
})()`;

const S_CAMERA = `(() => {
  const D = window.__DEBUG; const T = window.__SCT; const items = [];
  const V = D.camera.position.constructor;
  const dir = D.camera.getWorldDirection(new V());
  const cam = D.camera.position.clone(), at = cam.clone().addScaledVector(dir, 40);
  T.pair(3);
  const steps = [[0.37, 0, 0, 'a third of a metre: every near snap'], [0, 0.11, 0, 'up 11 cm'], [1.6, 0, -0.9, 'a step of 1.8 m'], [0, 0, 0, 'back']];
  for (const [dx, dy, dz, note] of steps) {
    const c = dx || dy || dz ? cam.clone().add(new V(dx, dy, dz)) : cam.clone();
    D.rig.setExternalPose(c, at.clone().add(new V(dx, dy, dz)), D.camera.fov);
    const { a, b, cache } = T.pair(1); const diff = T.diff(a, b);
    items.push({ step: note.split(':')[0].replace(/[^a-z0-9]+/gi, '-'), diff, cache, png: diff.px ? T.diffPng(a, b) : null, note });
  }
  return { items };
})()`;

const S_SUN = `(() => {
  const D = window.__DEBUG; const T = window.__SCT; const items = [];
  const L = D.lighting; const csm = L.csm;
  // the rig re-resolves from this preset: both renders of a pair share it, so the comparison stays exact
  const preset = {};
  const toSun = csm.lightDirection.clone().negate();
  T.pair(3);
  const axis = new toSun.constructor(0, 1, 0);
  const moved = toSun.clone().applyAxisAngle(axis, 0.12);
  L.setSun(moved, preset);
  let { a, b, cache } = T.pair(3); let diff = T.diff(a, b);
  items.push({ step: 'moved', diff, cache, png: diff.px ? T.diffPng(a, b) : null, note: 'the sun turned 7 degrees in azimuth' });
  L.setSun(toSun, preset);
  ({ a, b, cache } = T.pair(3)); diff = T.diff(a, b);
  items.push({ step: 'back', diff, cache, png: diff.px ? T.diffPng(a, b) : null, note: 'the sun back' });
  return { items };
})()`;

/** Fell the nearest standing tree (or destroy the nearest prop) and compare during and after the fall. */
const S_FALL = (kind) => `(() => {
  const D = window.__DEBUG; const T = window.__SCT; const items = [];
  const W = D.world; const cam = D.camera.position; const V = cam.constructor;
  const isTree = (o) => o && o.treeIdx !== undefined && o.treeIdx !== null;
  const isProp = (o) => o && o.propIdx !== undefined && o.propIdx !== null;
  const wanted = ${JSON.stringify(kind)} === 'tree' ? isTree : isProp;
  const target = W.getObstacles().filter((o) => wanted(o) && !o.dead && !o.crushed)
    .map((o) => ({ o, d: Math.hypot((o.x ?? (o.min ? (o.min[0] + o.max[0]) / 2 : 0)) - cam.x, (o.z ?? (o.min ? (o.min[2] + o.max[2]) / 2 : 0)) - cam.z) }))
    .filter((x) => x.d > 8 && x.d < 70).sort((x, y) => x.d - y.d)[0];
  if (!target) return { items: [{ diff: { px: -1 }, note: 'no ' + ${JSON.stringify(kind)} + ' within 70 m' }] };
  T.pair(3);
  const ok = W.crushObstacle(target.o, 1, 0.3, 6, 'shell');
  const fwd = D.camera.getWorldDirection(new V());
  const checkpoints = [1, 12, 40, 120, 240];
  let frameNo = 0;
  for (const cp of checkpoints) {
    while (frameNo < cp) { W.update(1 / 60, cam, fwd, D.game.player?.visual?.root?.position ?? null); T.frame(true); frameNo++; }
    const { a, b, cache } = T.pair(1); const diff = T.diff(a, b);
    items.push({ step: 'f' + cp, diff, cache, png: diff.px ? T.diffPng(a, b) : null,
      note: ${JSON.stringify(kind)} + ' at ' + target.d.toFixed(0) + ' m, crushed ' + ok + ', frame ' + cp + ' of the fall' });
  }
  return { items };
})()`;

/** Two runs over the same scripted states (cached, then uncached), compared frame by frame. */
const S_SEQUENCE = (kind) => `(() => {
  const D = window.__DEBUG; const T = window.__SCT; const items = [];
  const V = D.camera.position.constructor;
  const cam0 = D.camera.position.clone(); const dir = D.camera.getWorldDirection(new V()); const at0 = cam0.clone().addScaledVector(dir, 40);
  const side = new V(dir.z, 0, -dir.x).normalize();
  const tanks = D.game.tanks.filter((e) => !e.isPlayer && e.visual?.root).map((e) => ({ e, d: e.visual.root.position.distanceTo(cam0) })).sort((x, y) => x.d - y.d);
  const root = tanks[0]?.e.visual.root; const p0 = root?.position.clone();
  const N = 24;
  const apply = (k) => {
    if (${JSON.stringify(kind)} === 'drive' && root) { root.position.copy(p0).addScaledVector(side, 0.45 * k); root.rotation.y += 0; root.updateMatrixWorld(true); }
    if (${JSON.stringify(kind)} === 'dolly') { const c = cam0.clone().addScaledVector(side, 0.23 * k).addScaledVector(dir, 0.11 * k); D.rig.setExternalPose(c, at0.clone().addScaledVector(side, 0.23 * k), D.camera.fov); }
  };
  const run = (cached) => {
    const frames = [];
    for (let k = 0; k <= N; k++) { apply(k); T.frame(cached); T.frame(cached); frames.push(T.lum()); }
    return frames;
  };
  const before = T.telemetry();
  const A = run(true);
  const mid = T.telemetry();
  const B = run(false);
  window.__SHADOW_DEBUG.noStaticCache = false;
  apply(0);
  if (root) { root.position.copy(p0); root.updateMatrixWorld(true); }
  D.rig.setExternalPose(cam0, at0, D.camera.fov);
  const sum = (x) => (x || []).reduce((s, v) => s + (v || 0), 0);
  let worst = null;
  for (let k = 0; k <= N; k++) {
    const diff = T.diff(A[k], B[k]);
    if (!worst || diff.px > worst.diff.px) worst = { k, diff };
    items.push({ step: 'k' + k, diff });
  }
  items.push({ step: 'cache', diff: { px: 0 }, cache: { reuses: sum(mid.reuses) - sum(before.reuses), rebuilds: sum(mid.rebuilds) - sum(before.rebuilds), promoted: mid.promoted },
    note: ${JSON.stringify(kind)} + ': cached run reuses/rebuilds' });
  if (worst && worst.diff.px > 0) items.push({ step: 'worst', diff: worst.diff, png: T.diffPng(A[worst.k], B[worst.k]), note: 'worst frame k' + worst.k });
  return { items };
})()`;

// ---------------------------------------------------------------------------------------------- host side

async function run(options) {
  mkdirSync(options.out, { recursive: true });
  const log = (line) => console.log(`[shadow-cache-truth ${new Date().toISOString().slice(11, 19)}] ${line}`);
  const locks = await acquireProbeLocks({ sessionMutex: options.sessionMutex, log });
  const refresh = setInterval(() => locks.refresh(), 30000); refresh.unref();
  const server = await openPreview(options.root, options.port);
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: [...MAP_PROBE_BROWSER_ARGS, `--window-size=${options.viewport[0]},${options.viewport[1]}`] });
  const report = { root: options.root, query: options.query, maps: {}, failures: [] };
  try {
    for (const mapId of options.maps) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
      try {
        await page.setViewport({ width: options.viewport[0], height: options.viewport[1], deviceScaleFactor: 1 });
        await page.evaluateOnNewDocument(installObservers, { preset: 'high', allies: options.sides[0], enemies: options.sides[1] });
        await page.goto(`http://127.0.0.1:${options.port}/?nosplash=1&tier=desktop${options.query ? `&${options.query}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
        const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
        const opponents = pinnedOpponents(catalog, options.spec, options.sides[0] + options.sides[1]);
        await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, opponents);
        await beginSoloBattle(page, { specId: options.spec, mapId, timeoutMs: 420000 });
        await page.evaluate(awaitTextures, 90000);
        await page.evaluate(freezeBattle, 'pinned');
        await page.waitForFunction(grassSettled, { timeout: 30000, polling: 250 }).catch(() => {});
        await poseView(page, 'chase');
        await sleep(2500);
        // freeze the wind and the water clocks so a capture pair differs only by the cache
        await page.evaluate(() => { window.__DEBUG.world.setWindTime?.(12.5); });
        const setup = await page.evaluate(installTruthHelpers);
        const results = [];
        const tag = mapId;
        await scenario(page, 'floor', S_FLOOR, options.out, results, tag);
        await scenario(page, 'still', S_STILL, options.out, results, tag);
        await scenario(page, 'tank', S_TANK, options.out, results, tag);
        await scenario(page, 'camera', S_CAMERA, options.out, results, tag);
        await scenario(page, 'sun', S_SUN, options.out, results, tag);
        await scenario(page, 'tree', S_FALL('tree'), options.out, results, tag);
        await scenario(page, 'prop', S_FALL('prop'), options.out, results, tag);
        await page.evaluate(() => { window.__DEBUG.world.setWindTime?.(12.5); });
        await poseView(page, 'chase');
        await scenario(page, 'drive', S_SEQUENCE('drive'), options.out, results, tag);
        await scenario(page, 'dolly', S_SEQUENCE('dolly'), options.out, results, tag);
        const floor = results.find((r) => r.scenario === 'floor')?.px ?? 0;
        const over = results.filter((r) => r.scenario !== 'floor' && r.px > floor + options.tolerance);
        for (const r of over) report.failures.push(`${mapId} ${r.scenario}${r.step ? `/${r.step}` : ''}: ${r.px} px (floor ${floor})`);
        report.maps[mapId] = { setup, floor, results, pageErrors: errors };
        log(`${mapId}: floor ${floor} px; ${results.filter((r) => r.scenario !== 'floor').map((r) => `${r.scenario}${r.step ? `/${r.step}` : ''} ${r.px}`).join(', ')}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    clearInterval(refresh);
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    locks.release();
  }
  report.pass = report.failures.length === 0;
  writeFileSync(path.join(options.out, 'result.json'), JSON.stringify(report, null, 1));
  log(report.pass ? 'PASS' : `DIFFERENCES: ${report.failures.join('; ')}`);
  if (options.gate && !report.pass) process.exitCode = 1;
  return report;
}

if (isMainModule(import.meta.url)) {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  await run(options);
}
