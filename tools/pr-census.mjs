#!/usr/bin/env node
// Whole-PR draw census (2026-10-07, the perf census lane of PR #9): what a branch draws per map against its base, at the
// chase and establishing views — whole-frame and per-pass draw calls and triangles, the shadow cascades as staged and with
// every caster every frame, shader programs (by their compiled GLSL), and a per-draw attribution to scene subtrees — so a
// whole program of merges can be audited map by map before any timing.
//
//   node tools/pr-census.mjs --roots=<base>,<branch> --labels=main,pr --out=<dir> [--maps=all|<id,...>]
//        [--views=chase,establishing] [--pages=4] [--hold-min=12] [--wait-hours=4] [--entry-ms=420000]
//        [--program-dump] [--viewport=1920x1080]
//   node tools/pr-census.mjs --report=<dir> [--labels=main,pr] [--json=<file>]
//
// Staging is the cost holds' (tools/frame-budget-probe.mjs): the High preset pinned before boot, 14 v 14, the pinned
// roster, a solo battle, sourced textures awaited, every bot frozen and hidden (out of the near-vehicle shadow slots too),
// the governor pinned at full scale. Chase is the probe's hull-relative chase; establishing is the map's battlefield shot
// (config.shot, as src/dev/shotRuntime.ts poses it) taken from the LAST root's sources for every root, so a branch that
// moved a map's shot is still compared at one pose. Every pose settles the terrain LOD stream before it samples
// (world-residency-acquisition's settleResidencyTerrain, as the probe does). Counts only, no timing.
//
// Holds count only (tools/capture-hold.mjs runWarmHold, 2026-10-23): while the ticket waits in the capture FIFO, a vite
// preview of each root's dist and one Chrome come up and each job of a batch (--pages of them: a map on a root, the
// queue map-major so a map's roots share a batch) is staged in its own page, which is then frozen; inside the hold each
// page in turn comes to the front and is read. More jobs take further holds. A job that failed twice is given up;
// resumable: a job whose record says ok is skipped. A lane hold that already holds the FIFO runs it with COT_LANE_HOLD=1
// (no queue: staged and read at once).
//
// Read the counts with three facts of the renderer in mind (the report applies them):
// - the static shadow-caster cache (src/engine/shadowStaticCache.ts) reuses its copies under a still camera, so each view is
//   read twice where it exists: as staged, and with __SHADOW_DEBUG.noStaticCache (a moving camera's shadow work);
// - the outermost cascade renders on alternate frames (src/engine/shadowRefresh.ts OUTER_CASCADE_FRAME_DIVISOR), so a
//   frame median includes or drops it by the sampled frames' parity: the report compares the frame without it and adds its
//   per-frame mean;
// - three's program cache keys hold shader-cache ids and onBeforeCompile sources, which move between builds without any
//   shader change: --program-dump identifies each live program by its compiled GLSL instead.
import { launchGuardedBrowser } from './browser-launch.mjs';
import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { beginSoloBattle, isMainModule, mapProbeLaunchOptions, sleep } from './map-probe-runtime.mjs';
import {
  awaitTextures, freezeBattle, grassSettled, hideOtherVehicles, installObservers, pinnedOpponents, poseView,
} from './frame-budget-probe.mjs';
import { installFramePassTimer, summarizePassFrames } from './frame-pass-timer.mjs';
import { runWarmHold, startViteChild } from './capture-hold.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';

const TOOL = 'pr-census';
/** The cost holds' staging (frame-budget-probe's defaults: --sides=13x14, the default --spec). */
const ALLIES = 13, ENEMIES = 14, SPEC = 't90m';

// ---------------------------------------------------------------------------------------------- page side

/** The establishing camera: the shot's metres above the ground at pos / look, fov 55 (src/dev/shotRuntime.ts). */
function poseShot(shot) {
  const D = window.__DEBUG; const hf = D.world.heightField; const V = D.camera.position.constructor;
  const cam = new V(shot.pos[0], hf.getHeightAt(shot.pos[0], shot.pos[2]) + shot.pos[1], shot.pos[2]);
  const at = new V(shot.look[0], hf.getHeightAt(shot.look[0], shot.look[2]) + shot.look[1], shot.look[2]);
  D.rig.setExternalPose(cam, at, 55);
  return { cam: cam.toArray().map((v) => +v.toFixed(1)), at: at.toArray().map((v) => +v.toFixed(1)), own: D.world.config?.shot ?? null };
}

/** Visible meshes by the scene's top two levels: meshes, instances, triangles, casters. */
function sceneCensus() {
  const scene = window.__DEBUG?.scene;
  if (!scene) return null;
  const out = {};
  const name = (o) => (o.name || o.type || '?').slice(0, 48);
  const visit = (o, key) => {
    if (!o.visible) return;
    if (o.isMesh || o.isLine || o.isPoints || o.isSprite) {
      const g = o.geometry;
      const n = g ? (g.index ? g.index.count : (g.attributes?.position?.count ?? 0)) : 0;
      const dr = g?.drawRange, cnt = dr && Number.isFinite(dr.count) ? Math.min(dr.count, n) : n;
      const inst = o.isInstancedMesh ? o.count : 1;
      const e = out[key] ??= { meshes: 0, tris: 0, instances: 0, casters: 0 };
      e.meshes++; e.tris += Math.round(cnt / 3) * inst; e.instances += inst; if (o.castShadow) e.casters++;
    }
    for (const c of o.children) visit(c, key);
  };
  for (const top of scene.children) {
    if (!top.visible) continue;
    if (top.children.length && !(top.isMesh || top.isLine || top.isPoints)) for (const c of top.children) visit(c, `${name(top)}/${name(c)}`);
    else visit(top, name(top));
  }
  return out;
}

/** Every shader's GLSL and every program's shaders, kept from boot (--program-dump; installed before the page loads). */
function installGlslHook() {
  const src = new WeakMap(), shadersOf = new WeakMap();
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const P = C.prototype, shaderSource = P.shaderSource, attachShader = P.attachShader;
    P.shaderSource = function (shader, source) { try { src.set(shader, String(source)); } catch { /* kept best effort */ } return shaderSource.call(this, shader, source); };
    P.attachShader = function (program, shader) {
      try { const l = shadersOf.get(program) || []; l.push(shader); shadersOf.set(program, l); } catch { /* kept best effort */ }
      return attachShader.call(this, program, shader);
    };
  }
  window.__PR_CENSUS_GLSL = { src, shadersOf };
}

/** The live programs: count and cache-key hashes, and with the GLSL hook each one's GLSL, main() and own uniforms. */
function programCensus(dump) {
  const R = window.__DEBUG.renderer, H = window.__PR_CENSUS_GLSL;
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const THREE_U = /^(modelMatrix|modelViewMatrix|projectionMatrix|viewMatrix|normalMatrix|cameraPosition|isOrthographic|diffuse|opacity|emissive|roughness|metalness|map|mapTransform|normalMap|normalScale|normalMapTransform|envMap|envMapIntensity|envMapRotation|flipEnvMap|ambientLightColor|lightProbe|directionalLights|directionalShadowMap|directionalShadowMatrix|directionalLightShadows|spotLights|pointLights|hemisphereLights|rectAreaLights|fogColor|fogNear|fogFar|fogDensity|toneMappingExposure|logDepthBufFC|alphaTest|aoMap|aoMapIntensity|aoMapTransform|lightMap|lightMapIntensity|bumpMap|bumpScale|displacementMap|displacementScale|displacementBias|roughnessMap|metalnessMap|emissiveMap|alphaMap|specular|shininess|ior|referencePosition|nearDistance|farDistance|boneTexture|morphTargetBaseInfluence|morphTargetInfluences|morphTexture|clippingPlanes|ltc_1|ltc_2|directionalShadowMapSize|uvTransform|batchingTexture|batchingIdTexture|batchingColorTexture|instanceMatrix)$/;
  const list = [], programs = [];
  for (const p of R.info.programs || []) {
    list.push(`${p.name || '?'}#${fnv(String(p.cacheKey || ''))}`);
    if (!dump) continue;
    const shaders = (H && p.program && H.shadersOf.get(p.program)) || [];
    const glsl = shaders.map((sh) => H.src.get(sh) || '').join('\n//--\n');
    const mains = shaders.map((sh) => { const t = H.src.get(sh) || ''; const i = t.lastIndexOf('void main'); return i >= 0 ? t.slice(i) : t; }).join('\n//--\n');
    const uniforms = [...new Set([...glsl.matchAll(/uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)/g)].map((m) => m[1]))]
      .filter((u) => !THREE_U.test(u)).sort();
    programs.push({ type: p.type || null, name: p.name || null, shaderName: (/#define SHADER_NAME ([^\n]+)/.exec(glsl) || [])[1] || null,
      glsl: glsl ? fnv(glsl) : null, main: mains ? fnv(mains) : null, len: glsl.length, usedTimes: p.usedTimes, uniforms: uniforms.slice(0, 40) });
  }
  list.sort();
  return { count: list.length, list, geometries: R.info.memory.geometries, textures: R.info.memory.textures, ...(dump ? { programs } : {}) };
}

/**
 * The static shadow cache's running counts (null on a build without it), and on a build with its frame record
 * (shadowStaticCache.ts, lighting's staticCacheFrame) the re-renders by reason, the content changes by kind and what the
 * cascades did at the last lighting update.
 */
function cacheState() {
  const L = window.__DEBUG.lighting;
  const c = L?.getShadowTelemetry?.()?.staticCache;
  if (!c) return null;
  const sum = (a) => (a || []).reduce((s, v) => s + (v || 0), 0);
  const r = L.staticCacheFrame ?? null;
  return { reuses: sum(c.reuses), rebuilds: sum(c.rebuilds), fullRenders: c.fullRenders ?? null, staticCasters: c.staticCasters ?? null,
    promoted: c.promoted ?? null, unsettled: c.unsettled ?? null, hashMs: c.hashMs ?? null, lastRebuildReason: c.lastRebuildReason ?? null,
    reasons: c.reasons ?? null, contentKinds: c.contentKinds ?? null,
    last: r ? { rebuildMask: r.rebuildMask, reuseMask: r.reuseMask, fullMask: r.fullMask, unsettledMask: r.unsettledMask, moveMask: r.moveMask,
      reason: r.reason, content: r.content, changed: r.changed } : null };
}

/**
 * Per-draw attribution over `frames` frames (a frame ends where post.render returns): every renderBufferDirect charged to
 * its pass (the main camera, a cascade's shadow camera, another camera and target) and its scene subtree (the top three
 * named ancestors) and leaf, with the calls and triangles the renderer counted for it and its instance count. A page that
 * draws no frame returns what it has after 30 s.
 */
function attributeDraws(frames) {
  const D = window.__DEBUG, R = D.renderer, post = D.post;
  const lights = D.lighting?.csm?.lights ?? [];
  return new Promise((resolve) => {
    const rows = new Map(), passes = {};
    let frame = 0, finished = false;
    const original = R.renderBufferDirect, originalPost = post.render;
    const nameOf = (o) => (o?.name || o?.type || '?').slice(0, 40);
    const pathOf = (o) => {
      const chain = [];
      for (let n = o; n && !n.isScene; n = n.parent) chain.push(n);
      chain.reverse();
      return chain.slice(0, Math.min(3, Math.max(1, chain.length - 1))).map(nameOf).join('/');
    };
    const passOf = (camera) => {
      if (camera === D.camera) return R.getRenderTarget() ? 'main' : 'main-screen';
      for (let i = 0; i < lights.length; i++) if (lights[i].shadow?.camera === camera) return `shadow-c${i}`;
      return `other:${(camera?.name || camera?.type || '?').slice(0, 24)}:${String(R.getRenderTarget()?.texture?.name || '').slice(0, 24)}`;
    };
    R.renderBufferDirect = function (camera, scene, geometry, material, object) {
      const c0 = R.info.render.calls, t0 = R.info.render.triangles;
      const r = original.apply(this, arguments);
      const dc = R.info.render.calls - c0, dt = R.info.render.triangles - t0;
      if (dc > 0) {
        const pass = passOf(camera);
        const inst = object?.isInstancedMesh ? object.count : object?.isBatchedMesh ? (object._multiDrawCount ?? object.instanceCount ?? 1) : 1;
        const key = `${pass}|${pathOf(object)}|${nameOf(object)}|${material?.type || '?'}`;
        const e = rows.get(key) ?? { pass, path: pathOf(object), leaf: nameOf(object), material: `${material?.type || '?'}:${(material?.name || '').slice(0, 24)}`, calls: 0, tris: 0, instances: 0 };
        e.calls += dc; e.tris += dt; e.instances += inst;
        rows.set(key, e);
        const p = passes[pass] ??= { calls: 0, tris: 0, instances: 0 };
        p.calls += dc; p.tris += dt; p.instances += inst;
      }
      return r;
    };
    const finish = (timedOut) => {
      if (finished) return;
      finished = true;
      post.render = originalPost;
      R.renderBufferDirect = original;
      const n = Math.max(1, frame), per = (v) => +(v / n).toFixed(2);
      resolve({ frames: frame, timedOut,
        passes: Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, { calls: per(v.calls), tris: Math.round(v.tris / n), instances: per(v.instances) }])),
        rows: [...rows.values()].map((e) => ({ ...e, calls: per(e.calls), tris: Math.round(e.tris / n), instances: per(e.instances) })).sort((a, b) => b.calls - a.calls) });
    };
    post.render = function (...args) {
      try { return originalPost.apply(this, args); } finally { frame++; if (frame >= frames) finish(false); }
    };
    setTimeout(() => finish(true), 30000);
  });
}

// ---------------------------------------------------------------------------------------------- report (pure)

const shadowLabels = (byLabel, from = 0, to = 99) => Object.entries(byLabel ?? {})
  .filter(([k]) => { const m = /^shadow-c(\d+)$/.exec(k); return m && +m[1] >= from && +m[1] <= to; });

/**
 * One view of one map, the base (a) against the branch (b): the colour pass (the timer's 'scene' label), the cascades
 * (a; b as staged; b with every caster every frame), the moving frame with the alternate-frame cascade at its per-frame
 * mean, triangles, and the attribution's subtree deltas. `outer` is the alternate-frame cascade's label (desktop's four
 * cascades: c3).
 */
export function compareView(a, b, { outer = 'shadow-c3' } = {}) {
  const lab = (byLabel, name, f = 'calls') => byLabel?.[name]?.[f] ?? 0;
  const sumShadow = (byLabel) => shadowLabels(byLabel).reduce((s, [, v]) => s + (v.calls ?? 0), 0);
  const nb = b.noCache ?? null;
  const outerMean = (passes) => passes?.[outer]?.calls ?? 0;
  const movingA = a.whole.calls - lab(a.whole.byLabel, outer) + outerMean(a.attribution?.passes);
  const movingB = nb ? nb.calls - lab(nb.byLabel, outer) + outerMean(nb.passes) : null;
  const e = {
    sceneA: lab(a.whole.byLabel, 'scene'), sceneB: lab(b.whole.byLabel, 'scene'),
    sceneTrisA: lab(a.whole.byLabel, 'scene', 'tris'), sceneTrisB: lab(b.whole.byLabel, 'scene', 'tris'),
    shadowA: sumShadow(a.whole.byLabel), shadowB: sumShadow(b.whole.byLabel), shadowBmoving: nb ? sumShadow(nb.byLabel) : null,
    wholeA: a.whole.calls, wholeB: b.whole.calls, movingA, movingB,
  };
  e.dScene = e.sceneB - e.sceneA;
  e.dScenePct = e.sceneA ? (e.dScene / e.sceneA) * 100 : null;
  e.dSceneTrisPct = e.sceneTrisA ? ((e.sceneTrisB - e.sceneTrisA) / e.sceneTrisA) * 100 : null;
  e.dMoving = movingB === null ? null : movingB - movingA;
  e.dMovingPct = movingB === null || !movingA ? null : ((movingB - movingA) / movingA) * 100;
  const group = (rows, cls) => {
    const out = new Map();
    for (const r of rows ?? []) {
      const c = r.pass.startsWith('shadow') ? 'shadow' : r.pass.startsWith('main') ? 'main' : 'other';
      if (c !== cls) continue;
      const k = `${r.path.replace(/^world-[a-z_]+/, 'world')} :: ${r.leaf}`;
      out.set(k, (out.get(k) ?? 0) + r.calls);
    }
    return out;
  };
  const diff = (x, y) => [...new Set([...x.keys(), ...y.keys()])].map((k) => ({ key: k, a: x.get(k) ?? 0, b: y.get(k) ?? 0, d: +((y.get(k) ?? 0) - (x.get(k) ?? 0)).toFixed(2) }))
    .filter((r) => Math.abs(r.d) >= 1).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  e.main = diff(group(a.attribution?.rows, 'main'), group(b.attribution?.rows, 'main')).slice(0, 12);
  e.shadowMoving = nb ? diff(group(a.attribution?.rows, 'shadow'), group(nb.shadowRows, 'shadow')).slice(0, 12) : [];
  return e;
}

/** The census rule's flags for a map: draws over +10 % or +30 (colour pass, or the moving frame), triangles over +15 %. */
export function censusFlags(views) {
  const flags = [];
  for (const [v, e] of Object.entries(views)) {
    if (e.dScene > 30 || e.dScenePct > 10) flags.push(`scene draws ${v} ${e.dScene >= 0 ? '+' : ''}${e.dScene}`);
    if (e.dMoving !== null && (e.dMoving > 30 || e.dMovingPct > 10)) flags.push(`moving draws ${v} ${e.dMoving >= 0 ? '+' : ''}${e.dMoving.toFixed(0)}`);
    if (e.dSceneTrisPct > 15) flags.push(`scene tris ${v} +${e.dSceneTrisPct.toFixed(0)} %`);
  }
  return flags;
}

/** Programs of two dumps identified by their shading code: the same, new in the branch, gone from the base. */
export function comparePrograms(a, b) {
  const ka = new Set((a ?? []).map((p) => p.main)), kb = new Set((b ?? []).map((p) => p.main));
  return { same: [...kb].filter((k) => ka.has(k)).length, added: (b ?? []).filter((p) => !ka.has(p.main)), gone: (a ?? []).filter((p) => !kb.has(p.main)) };
}

/**
 * The jobs of a run (pure): per map, one per root, map-major so a batch of an even size holds a map's roots together;
 * a job is done once its record says ok or it failed twice.
 */
export function censusBatches(maps, roots, labels, pages, isDone = () => false) {
  const queue = [];
  for (const mapId of maps) roots.forEach((root, i) => queue.push({ mapId, label: labels[i], root, key: `${mapId}-${labels[i]}` }));
  const todo = queue.filter((job) => !isDone(job));
  const batches = [];
  for (let i = 0; i < todo.length; i += pages) batches.push(todo.slice(i, i + pages));
  return { queue, todo, batches };
}

function report(dir, labels) {
  const recs = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try { const r = JSON.parse(readFileSync(path.join(dir, f), 'utf8')); if (r?.mapId && r.ok) (recs[r.mapId] ??= {})[r.label] = r; } catch { /* not a record */ }
  }
  const [la, lb] = labels;
  const rows = [];
  for (const [mapId, r] of Object.entries(recs)) {
    if (!r[la] || !r[lb]) continue;
    const views = {};
    for (const v of Object.keys(r[lb].views)) if (r[la].views[v]) views[v] = compareView(r[la].views[v], r[lb].views[v]);
    const programs = r[la].programs?.programs && r[lb].programs?.programs ? comparePrograms(r[la].programs.programs, r[lb].programs.programs) : null;
    rows.push({ mapId, views, flags: censusFlags(views), programsA: r[la].programs?.count, programsB: r[lb].programs?.count,
      programs: programs && { same: programs.same, added: programs.added.length, gone: programs.gone.length } });
  }
  rows.sort((p, q) => (q.views.chase?.dMoving ?? -1e9) - (p.views.chase?.dMoving ?? -1e9));
  const f = (x) => (x === null || x === undefined ? '-' : `${x >= 0 ? '+' : ''}${Math.round(x)}`);
  const md = ['| map | Δ colour-pass draws chase / est | Δ moving draws chase / est | Δ colour-pass tris % chase / est | programs | flags |', '|---|---|---|---|---|---|'];
  for (const r of rows) {
    const c = r.views.chase ?? {}, e = r.views.establishing ?? {};
    md.push(`| ${r.mapId} | ${f(c.dScene)} / ${f(e.dScene)} | ${f(c.dMoving)} / ${f(e.dMoving)} | ${f(c.dSceneTrisPct)} / ${f(e.dSceneTrisPct)} | `
      + `${r.programsA}→${r.programsB}${r.programs ? ` (GLSL: +${r.programs.added} −${r.programs.gone})` : ''} | ${r.flags.join('; ') || '-'} |`);
  }
  return { rows, markdown: md.join('\n') };
}

// ---------------------------------------------------------------------------------------------- host side

/** Every map's establishing shot from a root's own sources (Node, behind the world receipts' DOM fixture). */
async function shotsOf(root) {
  const { installWorldBuildFixture } = await import(pathToFileURL(path.join(root, 'tools', 'headlessWorldCollision.mjs')).href)
    .catch(() => import('./headlessWorldCollision.mjs'));
  installWorldBuildFixture();
  const { getMapConfig } = await import(pathToFileURL(path.join(root, 'src', 'world', 'maps', 'index.ts')).href);
  const { MAP_IDS } = await import(pathToFileURL(path.join(root, 'src', 'world', 'maps', 'mapIds.ts')).href);
  return Object.fromEntries(MAP_IDS.map((id) => [id, getMapConfig(id).shot ?? null]));
}

/** Outside the hold: one job's page booted, staged as the cost holds stage, the timer installed (the queue-side warm). */
async function stageJob(browser, baseUrl, job, { width, height, entryMs, dump }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  try {
    // staged in front: a page behind another draws no frames, and the battle's clock runs on them
    await page.bringToFront();
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installObservers, { preset: 'high', allies: ALLIES, enemies: ENEMIES });
    if (dump) await page.evaluateOnNewDocument(installGlslHook);
    await page.goto(`${baseUrl.replace(/\/$/, '')}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 600000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 600000, polling: 1000 });
    const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
    await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, pinnedOpponents(catalog, SPEC, ALLIES + ENEMIES));
    const entryAt = Date.now();
    await beginSoloBattle(page, { specId: SPEC, mapId: job.mapId, timeoutMs: entryMs });
    const rec = { ok: false, tool: TOOL, mapId: job.mapId, label: job.label, root: job.root, entryMs: Date.now() - entryAt,
      textures: await page.evaluate(awaitTextures, 90000) };
    const frozen = await page.evaluate(freezeBattle, 'pinned');
    rec.frozen = { dynScale: frozen.dynScale, perfTrim: frozen.perfTrim, roster: frozen.roster.length };
    rec.hiddenBots = await page.evaluate(hideOtherVehicles);
    await page.waitForFunction(grassSettled, { timeout: 30000, polling: 250 }).catch(() => {});
    rec.timer = await page.evaluate(installFramePassTimer);
    return { job, page, rec, errors };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

/** Inside the hold: one view of a staged page, as staged and (where the static cache exists) with every caster every frame. */
async function readView(page, viewName, shot) {
  const pose = viewName === 'establishing' ? await page.evaluate(poseShot, shot) : await poseView(page, viewName);
  await sleep(1200);
  await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
  // the terrain LOD stream built to the pose before it is counted (fine grids stream in for ~10 s after a move)
  const terrainSettle = await page.evaluate(settleResidencyTerrain).catch((error) => ({ error: String(error?.message ?? error).slice(0, 200) }));
  await sleep(2500);
  const sampleFrames = async (frames) => summarizePassFrames(await page.evaluate((cfg) => window.__FRAME_PASS_TIMER.sample(cfg),
    { frames, block: 30, modes: ['whole'], flush: true, timeoutMs: 90000 }));
  const counts = (s) => Object.fromEntries(Object.entries(s?.passes ?? {}).map(([k, v]) => [k, { calls: v.calls?.med ?? null, tris: v.tris?.med ?? null,
    callsMean: v.calls?.mean ?? null, trisMean: v.tris?.mean ?? null }]));
  const s1 = await sampleFrames(30);
  const view = { pose, terrainSettle, whole: { calls: s1?.calls?.med ?? null, tris: s1?.tris?.med ?? null, callsMean: s1?.calls?.mean ?? null,
    trisMean: s1?.tris?.mean ?? null, byLabel: counts(s1) }, attribution: await page.evaluate(attributeDraws, 4),
  cache: await page.evaluate(cacheState), nearVehicleDetail: await page.evaluate(() => window.__DEBUG.lighting?.nearVehicleDetail ?? null) };
  if (view.cache) {
    await page.evaluate(() => { window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true }); });
    await sleep(800);
    const s2 = await sampleFrames(30);
    const a2 = await page.evaluate(attributeDraws, 4);
    view.noCache = { calls: s2?.calls?.med ?? null, tris: s2?.tris?.med ?? null, callsMean: s2?.calls?.mean ?? null, trisMean: s2?.tris?.mean ?? null,
      byLabel: counts(s2), passes: a2.passes, shadowRows: a2.rows.filter((r) => r.pass.startsWith('shadow')) };
    await page.evaluate(() => { window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: false }); });
    await sleep(800);
  }
  view.census = await page.evaluate(sceneCensus).catch(() => null);
  return view;
}

async function capture(opt) {
  const { default: puppeteer } = await import('puppeteer');
  const log = (m) => console.log(`[${TOOL} ${new Date().toTimeString().slice(0, 8)}] ${m}`);
  const roots = opt.roots.split(',').map((r) => path.resolve(r));
  const labels = (opt.labels ?? 'base,branch').split(',');
  if (labels.length !== roots.length) throw new Error('--labels must match --roots');
  for (const root of roots) if (!existsSync(path.join(root, 'dist', 'index.html'))) throw new Error(`${root} has no dist (npm run build there)`);
  const views = (opt.views ?? 'chase,establishing').split(',');
  const shots = await shotsOf(roots[roots.length - 1]);
  const maps = !opt.maps || opt.maps === 'all' ? Object.keys(shots) : opt.maps.split(',');
  for (const id of maps) if (!(id in shots)) throw new Error(`unknown map ${id}`);
  const [width, height] = (opt.viewport ?? '1920x1080').split('x').map(Number);
  const pages = Math.max(1, Math.min(6, Number(opt.pages ?? 4)));
  const holdMinutes = Number(opt['hold-min'] ?? 12), waitHours = Number(opt['wait-hours'] ?? 4), entryMs = Number(opt['entry-ms'] ?? 420000);
  const dump = !!opt['program-dump'];
  const out = path.resolve(opt.out);
  mkdirSync(out, { recursive: true });
  const fileOf = (job) => path.join(out, `${job.mapId}-${job.label}.json`);
  const priorOf = (job) => { try { return JSON.parse(readFileSync(fileOf(job), 'utf8')); } catch { return null; } };
  const isDone = (job) => { const r = priorOf(job); return !!r && (r.ok === true || (r.failedAttempts ?? 0) >= 2); };
  const failed = (job, error) => {
    const attempts = (priorOf(job)?.failedAttempts ?? 0) + 1;
    writeFileSync(fileOf(job), JSON.stringify({ ok: false, tool: TOOL, mapId: job.mapId, label: job.label, failedAttempts: attempts,
      error: String(error?.stack || error).slice(0, 1500) }, null, 1));
    log(`${job.key} FAILED (${attempts}): ${String(error?.message || error).slice(0, 200)}`);
  };
  const { queue, todo, batches } = censusBatches(maps, roots, labels, pages, isDone);
  if (!todo.length) { log('every job is done'); return 0; }
  log(`${todo.length} of ${queue.length} jobs in ${batches.length} hold(s) of up to ${pages} page(s)`);

  const warm = (batch) => async () => {
    const servers = new Map();
    let browser = null;
    const close = async () => {
      if (browser) await browser.close().catch(() => {});
      for (const server of servers.values()) await server.close().catch(() => {});
    };
    try {
      for (const job of batch) {
        if (servers.has(job.root)) continue;
        // the built dist without the project's config, as the cost holds serve it (frame-budget-probe openPreview)
        servers.set(job.root, await startViteChild({ root: job.root, mode: 'preview', config: { root: job.root, configFile: false, logLevel: 'error',
          build: { outDir: 'dist' }, preview: { host: '127.0.0.1', port: 5481 + servers.size, strictPort: false } } }));
      }
      browser = await launchGuardedBrowser(puppeteer, { ...mapProbeLaunchOptions({ width, height, protocolTimeout: 900000 }), timeout: 180000 });
      const entries = [];
      for (const job of batch) {
        try {
          entries.push(await stageJob(browser, servers.get(job.root).url, job, { width, height, entryMs, dump }));
          log(`${job.key} staged`);
        } catch (error) { failed(job, error); }
      }
      if (!entries.length) throw new Error('no page of the batch staged');
      return { pages: entries.map((e) => e.page), entries, close };
    } catch (error) {
      await close();
      throw error;
    }
  };
  const shoot = async ({ entries, signal }) => {
    for (const entry of entries) {
      const { job, page, rec } = entry;
      if (signal?.aborted) { log(`hold limit before ${job.key}`); break; }
      const t0 = Date.now();
      try {
        await page.bringToFront();
        await sleep(1500);
        rec.views = {};
        for (const v of views) rec.views[v] = await readView(page, v, shots[job.mapId]);
        rec.programs = await page.evaluate(programCensus, dump);
        rec.pageErrors = entry.errors;
        rec.ms = Date.now() - t0;
        rec.load1 = +os.loadavg()[0].toFixed(1);
        rec.ok = true;
        writeFileSync(fileOf(job), JSON.stringify(rec, null, 1));
        log(`${job.key}: chase ${rec.views.chase?.whole.calls} draws · est ${rec.views.establishing?.whole.calls} · programs ${rec.programs.count} · ${Math.round(rec.ms / 1000)} s`);
      } catch (error) { failed(job, error); }
    }
  };

  for (const batch of batches) {
    const keys = batch.map((job) => job.key).join(',');
    try {
      if (process.env.COT_LANE_HOLD === '1') {
        // a lane hold holds the FIFO for the steps it spawns: stage and read at once
        const warmed = await warm(batch)();
        try { await shoot(warmed); } finally { await warmed.close(); }
      } else {
        await runWarmHold({ label: `${TOOL} ${keys}`, place: `${TOOL}:${path.basename(out)}:${keys}`, holdMinutes, waitHours, warm: warm(batch), shoot });
      }
    } catch (error) {
      log(`hold for ${keys} failed: ${String(error?.message || error).slice(0, 300)}`);
    }
  }
  const left = queue.filter((j) => !isDone(j)).length;
  appendFileSync(path.join(out, 'runs.log'), `${new Date().toISOString()} left ${left} load ${os.loadavg()[0].toFixed(0)}\n`);
  log(`${left} job(s) left`);
  return left ? 3 : 0;
}

if (isMainModule(import.meta.url)) {
  const opt = {};
  for (const a of process.argv.slice(2)) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(a);
    if (!m) { console.error(`bad argument ${a}`); process.exit(1); }
    opt[m[1]] = m[2] ?? true;
  }
  if (opt.report) {
    const { rows, markdown } = report(path.resolve(opt.report), (opt.labels ?? 'main,pr').split(','));
    if (opt.json) writeFileSync(path.resolve(opt.json), JSON.stringify(rows, null, 1));
    console.log(markdown);
  } else {
    if (!opt.roots || !opt.out) { console.error('--roots and --out are required (or --report=<dir>)'); process.exit(1); }
    process.exitCode = await capture(opt);
  }
}
