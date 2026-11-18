#!/usr/bin/env node
// Rendered proof for the world pools (world-pools-272, 2026-11-12): fixed cameras, every frame a function of the scene
// state (the temporal AA held, the volumetric clouds' history frozen, the wind clock set, the frame rendered and read back
// in one page task, as tools/shadow-cache-truth.mjs does).
//
//   capture: node tools/world-pools-truth.mjs --root=<tree with dist> --label=<name> --load=<1|2> [--maps=verdant,monsoon,autumn]
//              [--views=chase,centre-far,bird,side] [--viewport=1600x900] [--tier=desktop|mobile] [--preset=high] [--bots]
//              [--port=5373] [--out=<dir>] [--battlefield-split-only]
//   compare: node tools/world-pools-truth.mjs --compare --out=<dir> --labels=base,new [--threshold=8] [--png]
//
// Capture, per map and view: the frame twice (the A/A floor: 0 px in one task); where the page has the draw batches
// (src/world/instancedDrawBatch.ts), the same state with the batching off and on again — the in-page A/B of the batches,
// the same scene state either side. The frame's luminance goes to <out>/<label>-L<load>-<map>-<view>.lum.
// Compare: two loads of each build (the probe's cross-build method, tools/frame-capture-compare.mjs): a pixel counts only
// where each build reproduces it across its own two loads; `changed` are those stable pixels the builds draw differently
// by more than --threshold (8/255 by default), `interior` the changed pixels at least 2 px from any unstable one.
import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { MAP_PROBE_BROWSER_ARGS, beginSoloBattle, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { awaitTextures, freezeBattle, grassSettled, hideOtherVehicles, installObservers, openPreview, pinnedOpponents, poseView } from './frame-budget-probe.mjs';
import { compareCaptureSet, decodeLum, encodeLum, encodeRgbPng, interiorChanges } from './frame-capture-compare.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);
const out = path.resolve(arg('out', '.qa-dev/world-pools-truth'));
mkdirSync(out, { recursive: true });

/** Page side: the helpers (serialized). */
function installHelpers(splitFixed = true) {
  const SPLIT_FIXED = splitFixed;
  const D = window.__DEBUG;
  const src = D.renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const lum = () => {
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const o = new Uint8Array(cv.width * cv.height);
    for (let p = 0, q = 0; p < o.length; p++, q += 4) o[p] = Math.round(0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]);
    return o;
  };
  const hold = D.post.holdTemporalAA?.('qa') ?? null;
  const clouds = D.scene?.userData?.volumetricClouds ?? null;
  if (clouds) clouds.frozen = true;
  const frame = () => { D.world?.setWindTime?.(12.5); D.lighting.update(false, 1 / 60); D.post.render(0, 0); };
  const diff = (a, b) => {
    let px1 = 0, px8 = 0, max = 0;
    for (let p = 0; p < a.length; p++) { const d = Math.abs(a[p] - b[p]); if (d > 1) px1++; if (d > 8) px8++; if (d > max) max = d; }
    return { px1, px8, max };
  };
  /**
   * The impostor pools as the base drew them, rebuilt in this page from the shared pools' own data: every InstancedMesh
   * whose aImpCell is per instance (world-pools-272's shared pool) is hidden and stood in for by one pool per distinct
   * cell and needle share (a species and far variant), each with the cell per vertex, its instances in slot order with
   * their matrix, colour, row, fade and cross-fade share copied: the base's draw structure in the same scene state.
   * Returns the restore.
   */
  const splitImpostors = (which) => {
    const made = [], hidden = [];
    D.scene.traverse((o) => {
      const cell = o.isInstancedMesh ? o.geometry.getAttribute('aImpCell') : null;
      if (!cell?.isInstancedBufferAttribute || !o.visible || !which(o)) return;
      const needle = o.geometry.getAttribute('aImpNeedle');
      const groups = new Map();
      for (let i = 0; i < o.count; i++) {
        const key = [cell.getX(i), cell.getY(i), cell.getZ(i), cell.getW(i), needle.getX(i)].join(',');
        let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(i);
      }
      const Ctor = o.constructor, G = o.geometry.constructor;
      for (const [key, slots] of groups) {
        const k = key.split(',').map(Number);
        const geometry = new G();
        for (const name of Object.keys(o.geometry.attributes)) {
          const a = o.geometry.getAttribute(name);
          if (name === 'aImpCell') { geometry.setAttribute(name, new a.constructor.__proto__(new Float32Array(Array(4).fill(k.slice(0, 4)).flat()), 4)); continue; }
          if (name === 'aImpNeedle') { geometry.setAttribute(name, new a.constructor.__proto__(new Float32Array(4).fill(k[4]), 1)); continue; }
          if (!a.isInstancedBufferAttribute) { geometry.setAttribute(name, a); continue; }
          const arr = new a.array.constructor(slots.length * a.itemSize);
          slots.forEach((s, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[s * a.itemSize + c]; });
          geometry.setAttribute(name, new a.constructor(arr, a.itemSize));
        }
        geometry.setIndex(o.geometry.index);
        const m = new Ctor(geometry, o.material, slots.length);
        slots.forEach((s, j) => {
          for (let c = 0; c < 16; c++) m.instanceMatrix.array[j * 16 + c] = o.instanceMatrix.array[s * 16 + c];
        });
        if (o.instanceColor) {
          m.instanceColor = new o.instanceColor.constructor(new Float32Array(slots.length * 3), 3);
          slots.forEach((s, j) => { for (let c = 0; c < 3; c++) m.instanceColor.array[j * 3 + c] = o.instanceColor.array[s * 3 + c]; });
        }
        for (const f of ['castShadow', 'receiveShadow', 'frustumCulled', 'matrixAutoUpdate', 'renderOrder']) m[f] = o[f];
        m.layers.mask = o.layers.mask;
        m.onBeforeRender = o.onBeforeRender;
        m.customDepthMaterial = o.customDepthMaterial;
        m.matrix.copy(o.matrix); m.matrixWorld.copy(o.matrixWorld);
        m.userData = { ...o.userData };
        o.parent.add(m);
        made.push(m);
      }
      o.visible = false; hidden.push(o);
    });
    return {
      pools: made.length, from: hidden.length,
      show(on) { for (const m of made) m.visible = on; for (const o of hidden) o.visible = !on; },
      dispose() { for (const m of made) { m.removeFromParent(); m.geometry.dispose(); m.dispose(); } for (const o of hidden) o.visible = true; },
    };
  };
  /** The ring forest's and the hinterland's pools never change: split once per page (they are large) and switched per
   * view; the battlefield's (vegetation.ts: treeImpostor, treeImpostor-outland) follow the partition: split per view. */
  const battlefield = (o) => /^treeImpostor/.test(o.name);
  let fixedSplit = null;
  const b64 = (o) => { let s = ''; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000)); return btoa(s); };
  window.__WPT = {
    capture() {
      frame(); const a = lum();
      frame(); const a2 = lum();
      const batch = window.__DRAW_BATCH_DEBUG ?? null;
      let ab = null;
      if (batch && batch.batches > 0) {
        const calls = (on) => { batch.set(on); frame(); return { calls: D.renderer.info.render.calls }; };
        const off = calls(false); const b = lum();
        const on = calls(true); const c = lum();
        ab = { batches: batch.batches, off: diff(a, b), onAgain: diff(a, c), offCalls: off.calls, onCalls: on.calls };
        if (ab.off.px8 > 0) {
          ab.offB64 = b64(b);
          // the bisection: one batch off at a time, the rest on
          ab.byBatch = [];
          for (const one of batch.list?.() ?? []) {
            one.set(false); frame(); const d = diff(a, lum()); one.set(true);
            if (d.px1 > 0) ab.byBatch.push({ name: one.name, members: one.members, ...d });
          }
          frame();
        }
      }
      // the impostor pools as the base drew them (one per species and far variant), the same state: the merge's own A/B
      // (the hinterland's pools are left whole: their copies took the browser past the guard's tree cap; they are
      // built by the same pool geometry and cell fill as the ring's)
      fixedSplit ??= splitImpostors((o) => SPLIT_FIXED && !battlefield(o) && !/^hinterland/.test(o.name));
      const split = splitImpostors(battlefield);
      fixedSplit.show(true); split.show(true);
      frame(); const s = lum();
      fixedSplit.show(false); split.dispose();
      frame(); const s2 = lum();
      const pools = split.pools + fixedSplit.pools, from = split.from + fixedSplit.from;
      const impostors = { pools, from, split: diff(a, s), restored: diff(a, s2) };
      if (impostors.split.px8 > 0) impostors.splitB64 = b64(s);
      return { width: cv.width, height: cv.height, b64: b64(a), floor: diff(a, a2), ab, impostors };
    },
    release() { fixedSplit?.dispose(); fixedSplit = null; hold?.release?.(); if (clouds) clouds.frozen = false; },
  };
  return { width: cv.width, height: cv.height, taaHeld: !!hold, cloudsFrozen: !!clouds };
}

async function capture() {
  const root = path.resolve(arg('root', '.'));
  const label = arg('label', path.basename(root));
  const load = Number(arg('load', 1));
  const maps = arg('maps', 'verdant,monsoon,autumn').split(',');
  const views = arg('views', 'chase,centre-far,bird,side').split(',');
  const [width, height] = arg('viewport', '1600x900').split('x').map(Number);
  const tier = arg('tier', 'desktop');
  const preset = arg('preset', tier === 'desktop' ? 'high' : 'mobile');
  const port = Number(arg('port', 5373));
  const report = { root, label, load, tier, preset, viewport: `${width}x${height}`, loadAtStart: os.loadavg().map((v) => +v.toFixed(1)), maps: {} };
  let server = null, hold = null, browser = null;
  try {
    server = await openPreview(root, port);
    hold = await openCaptureHold({ label: 'world-pools-truth', timeoutMs: 3 * 60 * 60 * 1000, lockClass: 'render', command: 'tools/world-pools-truth.mjs' });
    const startedAt = Date.now();
    for (const mapId of maps) {
      if (Date.now() - startedAt > 18 * 60 * 1000) { report.stopped = 'past 18 minutes of hold'; break; }
      // a browser per map: the GPU process's memory does not build up across battles past the guard's tree cap
      await browser?.close().catch(() => {});
      browser = await launchGuardedBrowser(puppeteer, { headless: true, timeout: 120000, protocolTimeout: 600000,
        args: [...MAP_PROBE_BROWSER_ARGS, '--use-angle=metal', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }, { label: 'world-pools-truth' });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument(installObservers, { preset, allies: 13, enemies: 14 });
      await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=${tier}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(BOOT_LOADED_EXPRESSION, { timeout: 300000 });
    // (a production build skips three's shader checks: a program that fails to link draws nothing, silently)
    await page.evaluate(() => { window.__DEBUG.renderer.debug.checkShaderErrors = true; });
      const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
      await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, pinnedOpponents(catalog, 't90m', 27));
      await beginSoloBattle(page, { specId: 't90m', mapId, timeoutMs: 420000 });
      await page.evaluate(awaitTextures, 90000);
      await page.evaluate(freezeBattle, 'pinned');
      if (!flag('bots')) await page.evaluate(hideOtherVehicles);
      const helpers = await page.evaluate(installHelpers, !flag('battlefield-split-only'));
      // the batches' own bytes (their copies of the members' vertices and indices, the per-instance textures) and the renderer's counts
      const memory = await page.evaluate(() => {
        let batchBytes = 0, batches = 0;
        window.__DEBUG.scene.traverse((o) => {
          if (!o.isBatchedMesh || !o.userData.instancedDrawBatch) return;
          batches++;
          for (const a of Object.values(o.geometry.attributes)) batchBytes += a.array.byteLength;
          if (o.geometry.index) batchBytes += o.geometry.index.array.byteLength;
          for (const t of [o._matricesTexture, o._indirectTexture, o._colorsTexture]) if (t) batchBytes += t.image.data.byteLength;
        });
        const R = window.__DEBUG.renderer;
        return { batches, batchMB: +(batchBytes / 1048576).toFixed(2), geometries: R.info.memory.geometries, textures: R.info.memory.textures,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
      });
      const entry = report.maps[mapId] = { helpers, memory, preset: await page.evaluate(() => window.__DEBUG.quality?.resolvePresetName?.() ?? null), views: {}, errors };
      console.log(`${label} L${load} ${mapId} memory ${JSON.stringify(memory)}`);
      for (const view of views) {
        await poseView(page, view);
        await sleep(1200);
        await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
        await page.evaluate(settleResidencyTerrain).catch(() => null);
        await sleep(1500);
        const r = await page.evaluate(() => window.__WPT.capture());
        writeFileSync(path.join(out, `${label}-L${load}-${mapId}-${view}.lum`), encodeLum(r));
        if (r.ab?.offB64) {
          // the in-page A/B's difference: grey the batched frame, red darker with the batching off, green brighter
          const a = Buffer.from(r.b64, 'base64'), b = Buffer.from(r.ab.offB64, 'base64');
          const rgb = new Uint8Array(a.length * 3);
          for (let p = 0; p < a.length; p++) {
            const d = b[p] - a[p], g = a[p] * 0.45;
            rgb[p * 3] = d < -8 ? 255 : g; rgb[p * 3 + 1] = d > 8 ? 255 : g; rgb[p * 3 + 2] = g;
          }
          writeFileSync(path.join(out, `ab-${label}-L${load}-${mapId}-${view}.png`), encodeRgbPng(r.width, r.height, rgb));
          delete r.ab.offB64;
        }
        if (r.impostors?.splitB64) {
          const a = Buffer.from(r.b64, 'base64'), b = Buffer.from(r.impostors.splitB64, 'base64');
          const rgb = new Uint8Array(a.length * 3);
          for (let p = 0; p < a.length; p++) {
            const d = b[p] - a[p], g = a[p] * 0.45;
            rgb[p * 3] = d < -8 ? 255 : g; rgb[p * 3 + 1] = d > 8 ? 255 : g; rgb[p * 3 + 2] = g;
          }
          writeFileSync(path.join(out, `imp-${label}-L${load}-${mapId}-${view}.png`), encodeRgbPng(r.width, r.height, rgb));
          delete r.impostors.splitB64;
        }
        entry.views[view] = { floor: r.floor, ab: r.ab, impostors: r.impostors };
        console.log(`${label} L${load} ${mapId} ${view}: floor ${JSON.stringify(r.floor)} batches A/B ${JSON.stringify(r.ab)} impostors A/B ${JSON.stringify(r.impostors)}`);
      }
      await page.evaluate(() => window.__WPT.release()).catch(() => {});
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
    writeFileSync(path.join(out, `${label}-L${load}.json`), JSON.stringify(report, null, 1));
  }
}

function compare() {
  const [la, lb] = arg('labels', 'base,new').split(',');
  const threshold = Number(arg('threshold', 8));
  const rows = [];
  const keys = new Set(readdirSync(out).filter((f) => f.startsWith(`${la}-L1-`) && f.endsWith('.lum')).map((f) => f.slice(`${la}-L1-`.length, -4)));
  for (const key of [...keys].sort()) {
    const files = [`${la}-L1`, `${la}-L2`, `${lb}-L1`, `${lb}-L2`].map((s) => path.join(out, `${s}-${key}.lum`));
    if (!files.every(existsSync)) { rows.push({ key, missing: files.filter((f) => !existsSync(f)).map((f) => path.basename(f)) }); continue; }
    const [a1, a2, b1, b2] = files.map((f) => decodeLum(readFileSync(f)));
    const set = compareCaptureSet(a1.data, a2.data, b1.data, b2.data, threshold);
    const interior = interiorChanges(set.classes, a1.width, a1.height, a1.data, b1.data);
    rows.push({ key, pixels: set.pixels, floorA: set.floorA, floorB: set.floorB, raw: set.raw, stable: set.stable, changed: set.changed,
      maxChanged: set.maxChanged, interior: interior.count, interiorMax: interior.max });
    if (flag('png') && set.changed > 0) {
      const rgb = new Uint8Array(set.pixels * 3);
      for (let p = 0; p < set.pixels; p++) {
        const g = a1.data[p] * 0.45, c = set.classes[p];
        rgb[p * 3] = c === 2 ? 255 : g; rgb[p * 3 + 1] = c === 3 ? 255 : g; rgb[p * 3 + 2] = c === 1 ? 160 : g;
      }
      writeFileSync(path.join(out, `diff-${key}.png`), encodeRgbPng(a1.width, a1.height, rgb));
    }
  }
  writeFileSync(path.join(out, `compare-${la}-${lb}-t${threshold}.json`), JSON.stringify({ threshold, rows }, null, 1));
  for (const r of rows) console.log(r.missing ? `${r.key}: missing ${r.missing.join(', ')}`
    : `${r.key}: stable ${r.stable}/${r.pixels}, changed ${r.changed} (max ${r.maxChanged}), interior ${r.interior} (max ${r.interiorMax}); floors ${r.floorA}/${r.floorB}`);
}

if (flag('compare')) compare();
else await capture();
process.exit(0);
