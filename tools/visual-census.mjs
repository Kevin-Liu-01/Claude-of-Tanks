#!/usr/bin/env node
// Visual census (2026-10-01): the fixed, repeatable baseline of the visual redesign. For every map registered in the
// game, at the map's authored time of day on the desktop tier with the High preset at 1600 x 900, it shoots the same
// views — the game's own establishing shot, chase, bird, sky west, sky south, a terrain close-up and a tree close-up
// (tools/visual-census-views.mjs) — through the game's deterministic shot controls (__SHOTS.set stages the map: world,
// sourced textures, pinned roster, frozen effects and wind), waiting for the capture readiness gates before every
// frame: sourced-texture receipt, terrain lookahead drained, grass work drained, tree impostors baked, the volumetric
// cloud history settled with its wind drift zeroed. Metrics per frame (tools/visual-census-metrics.mjs), contact
// sheets, the index and an A/B compare come from tools/visual-census-report.mjs.
//
//   npm run build
//   nice -n 19 node tools/visual-census.mjs capture --out=<dir> [--root=<checkout>] [--maps=a,b] [--views=chase,bird]
//        [--batch=<n> --budget-min=<m>] [--serve=dist|dev] [--port=5421]
//   node tools/visual-census.mjs report --out=<dir>            (metrics + sheets + index.md)
//   node tools/visual-census.mjs compare --a=<dirA> --b=<dirB> --out=<dir>
//
// capture serves <root>/dist through vite preview (or a vite dev server on a private optimizer cache with
// --serve=dev) on 127.0.0.1, the first free port of --port..--port+19, drives one headless Chrome, takes the
// repository's cot-shots capture lock (tools/capture-lock.mjs) for the whole session and merges each map into
// <out>/census.json as soon as it is done, so batches resume: --batch=<n> captures at most n maps not yet captured,
// --budget-min stops starting maps after that many minutes. Agents also hold the shared probe mutex around every
// capture process and run it at nice 19 (tools/map-probe-runtime.mjs header); the tool never takes that mutex itself.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';
import { MAP_PROBE_BROWSER_ARGS, isMainModule, mapProbeServerOptions, resolveGroundPose } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import {
  CENSUS_HALF, CENSUS_PROTOCOL, CENSUS_VIEWPORT, CENSUS_VIEWS, selectCensusViews, selectChasePose, selectSkySite,
  selectTerrainSite, selectTreePose, skyPose, skySamplePoints, skySiteCandidates, terrainPose, terrainSamplePoints,
  terrainSiteCandidates,
} from './visual-census-views.mjs';
import { buildSheets, compareCensus, loadCensus, measureCensus, openCensus, saveCensus, writeIndex } from './visual-census-report.mjs';

const TOOL = 'visual-census';
const PORT_SPAN = 20;
const GAME_QUERY = 'nosplash=1&tier=desktop';
const COMMANDS = Object.freeze(['capture', 'metrics', 'sheets', 'index', 'report', 'compare']);
const FLAGS = Object.freeze({
  capture: ['root', 'out', 'maps', 'views', 'serve', 'port', 'batch', 'budget-min', 'lock-timeout-min', 'settle-ms'],
  metrics: ['out', 'force'], sheets: ['out'], index: ['out'], report: ['out', 'force'], compare: ['a', 'b', 'out'],
});
const NUMERIC = new Set(['port', 'batch', 'budget-min', 'lock-timeout-min', 'settle-ms']);
const LISTS = new Set(['maps', 'views']);
const BOOLEANS = new Set(['force']);

export const CENSUS_HELP = `node tools/${TOOL}.mjs <command> [--flag=value ...]

  capture  --out=<dir> [--root=<checkout>] [--maps=a,b] [--views=a,b] [--serve=dist|dev] [--port=5421]
           [--batch=<n>] [--budget-min=<m>] [--lock-timeout-min=30] [--settle-ms=1200]
           Shoot ${CENSUS_VIEWS.map((v) => v.name).join(', ')} of every registered map (or --maps) into <out>/frames
           and merge each map into <out>/census.json. --serve=dist (default) previews <root>/dist: run npm run build
           first. --batch / --budget-min bound one run so batches resume where the last stopped.
  metrics  --out=<dir> [--force]      per-frame metrics into census.json (only frames without them unless --force)
  sheets   --out=<dir>                contact sheets: one per view (every map), one per map (every view)
  index    --out=<dir>                <out>/index.md (keeps the hand-written visual read between its markers)
  report   --out=<dir> [--force]      metrics + sheets + index
  compare  --a=<dir> --b=<dir> --out=<dir>   A | B sheets per map and compare.json (pixel and metric deltas)

Hold the probe mutex and run capture under nice -n 19; it takes the cot-shots capture lock itself.`;

// ---------------------------------------------------------------------------------------------- arguments

/** Parse argv (command first, then --name=value flags; booleans bare). Fails closed before anything starts. */
export function parseCensusArgs(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) return { help: true };
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command "${command}" (${COMMANDS.join(', ')})`);
  const values = {};
  for (const arg of rest) {
    const match = /^--([a-z][a-z-]*)(?:=(.*))?$/s.exec(arg);
    if (!match) throw new Error(`Unknown argument "${arg}"`);
    const [, name, raw] = match;
    if (!FLAGS[command].includes(name)) throw new Error(`Unknown argument --${name} for ${command}`);
    if (name in values) throw new Error(`Duplicate --${name}`);
    if (BOOLEANS.has(name)) {
      if (raw !== undefined) throw new Error(`--${name} takes no value`);
      values[name] = true;
      continue;
    }
    if (raw === undefined || raw === '') throw new Error(`--${name} requires an explicit =value`);
    if (NUMERIC.has(name)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number, got "${raw}"`);
      values[name] = n;
    } else if (LISTS.has(name)) {
      const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (!list.length) throw new Error(`--${name} needs at least one entry`);
      values[name] = list;
    } else values[name] = raw;
  }
  const required = command === 'compare' ? ['a', 'b', 'out'] : ['out'];
  for (const name of required) if (!values[name]) throw new Error(`--${name}=<dir> is required for ${command}`);
  const options = { command, out: path.resolve(values.out), force: !!values.force };
  if (command === 'compare') Object.assign(options, { a: path.resolve(values.a), b: path.resolve(values.b) });
  if (command === 'capture') {
    const serve = values.serve ?? 'dist';
    if (serve !== 'dist' && serve !== 'dev') throw new Error(`--serve must be dist or dev, got "${serve}"`);
    const port = values.port ?? 5421;
    if (!Number.isInteger(port) || port < 1024 || port + PORT_SPAN > 65536) throw new Error(`--port must be an integer port, got ${port}`);
    if ([5197, 5198, 5199].some((p) => p >= port && p < port + PORT_SPAN)) throw new Error('--port range must avoid 5197–5199');
    Object.assign(options, {
      root: path.resolve(values.root ?? process.cwd()), maps: values.maps ?? null, views: selectCensusViews(values.views),
      serve, port, batch: values.batch ?? null, budgetMin: values['budget-min'] ?? null,
      lockTimeoutMin: values['lock-timeout-min'] ?? 30, settleMs: values['settle-ms'] ?? 1200,
      argv: [...argv],
    });
  }
  return { help: false, options };
}

/**
 * The maps one capture run takes: the requested ids (all registered by default) in registry order, minus those a
 * batch run finds done (status ok) or given up on (two failed sessions), capped at `batch`.
 */
export function pickCaptureMaps(registered, census, { maps = null, batch = null } = {}) {
  const unknown = (maps || []).filter((id) => !registered.includes(id));
  if (unknown.length) throw new Error(`Unknown map id(s): ${unknown.join(', ')}`);
  let ids = maps ? registered.filter((id) => maps.includes(id)) : [...registered];
  if (batch) {
    ids = ids.filter((id) => census?.maps?.[id]?.status !== 'ok' && (census?.maps?.[id]?.failures ?? 0) < 2);
    ids = ids.slice(0, batch);
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------- identity

const git = (root, args) => {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};

function censusHeader(root, serve) {
  const distIndex = path.join(root, 'dist', 'index.html');
  return {
    protocol: CENSUS_PROTOCOL, tool: TOOL, root, serve, viewport: CENSUS_VIEWPORT, query: GAME_QUERY, preset: 'high',
    pinnedScene: PINNED_SCENE,
    views: CENSUS_VIEWS, viewsDigest: createHash('sha256').update(JSON.stringify(CENSUS_VIEWS)).digest('hex'),
    revision: git(root, ['rev-parse', 'HEAD']), revisionShort: git(root, ['rev-parse', '--short=9', 'HEAD']),
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    gameRevision: git(root, ['log', '-1', '--format=%H %s', '--', 'src', 'public', 'index.html', 'vite.config.ts']),
    sourceTree: Object.fromEntries([['src', 'src'], ['public', 'public'], ['index', 'index.html'], ['viteConfig', 'vite.config.ts']]
      .map(([key, p]) => [key, git(root, ['rev-parse', `HEAD:${p}`])])),
    dirtyGamePaths: (git(root, ['status', '--porcelain', '--', 'src', 'public', 'index.html', 'vite.config.ts']) || '').split('\n').filter(Boolean),
    distIndexSha256: serve === 'dist' && existsSync(distIndex) ? createHash('sha256').update(readFileSync(distIndex)).digest('hex') : null,
    distBuiltAt: serve === 'dist' && existsSync(distIndex) ? statSync(distIndex).mtime.toISOString() : null,
  };
}

async function registeredMaps(root) {
  const light = path.join(root, 'src/world/maps/mapIds.ts');
  const mod = await import(pathToFileURL(existsSync(light) ? light : path.join(root, 'src/world/maps/catalog.ts')).href);
  return { ids: [...mod.MAP_IDS], nameOf: (id) => (typeof mod.getMapName === 'function' ? mod.getMapName(id) : id) };
}

// ---------------------------------------------------------------------------------------------- server, browser

async function startServer({ root, serve, port }) {
  if (serve === 'dist' && !existsSync(path.join(root, 'dist', 'index.html'))) {
    throw new Error(`${root}/dist/index.html is missing: run npm run build first (or --serve=dev)`);
  }
  for (let p = port; p < port + PORT_SPAN; p++) {
    let cacheDir = null;
    try {
      if (serve === 'dist') {
        const server = await preview({ root, logLevel: 'error', preview: { host: '127.0.0.1', port: p, strictPort: true } });
        return { port: p, close: () => server.close() };
      }
      cacheDir = mkdtempSync(path.join(os.tmpdir(), 'cot-visual-census-vite-'));
      const options = mapProbeServerOptions(root, cacheDir);
      const server = await createServer({ ...options, server: { ...options.server, port: p, strictPort: true } });
      await server.listen();
      return { port: p, close: async () => { await server.close(); rmSync(cacheDir, { recursive: true, force: true }); } };
    } catch (error) {
      if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
      if (/already in use|EADDRINUSE/i.test(String(error?.message || error) + (error?.code || ''))) continue;
      throw error;
    }
  }
  throw new Error(`no free port in ${port}..${port + PORT_SPAN - 1}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function within(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${Math.round(ms / 1000)} s`)), ms); })]);
  } finally { clearTimeout(timer); }
}

// Page-side functions: serialized by puppeteer, so each is self-contained.
function pageEnvironment() {
  const D = window.__DEBUG, gl = D.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  let tier = null;
  try { tier = D.telemetry()?.quality?.tier ?? null; } catch { /* optional */ }
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), preset: D.quality.resolvePresetName(),
    tier, shotViews: [...window.__SHOTS.views] };
}

function pageStageState() {
  const D = window.__DEBUG, world = D.world, sky = world?.config?.sky || {}, player = D.game.player;
  const weather = D.battleAtmosphere?.current?.weather ?? D.battleAtmosphere?.weather ?? null;
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, sky[k] ?? null]));
  return {
    mapId: world?.mapId ?? null, name: world?.config?.name ?? null, phase: D.game.phase, shotMode: D.shotMode,
    preset: D.quality.resolvePresetName(), timeOfDay: weather?.timeOfDay ?? 'authored',
    authoredSky: pick(['sunElevationDeg', 'sunAzimuthDeg', 'sunIntensity', 'sunColorHex', 'hemiIntensity', 'postExposure', 'fogDensity', 'cloudOpacity']),
    player: player?.state ? { specId: player.specId, x: player.state.pos.x, y: player.state.pos.y, z: player.state.pos.z, yaw: player.state.yaw } : null,
  };
}

function pageMapData() {
  const world = window.__DEBUG.world, f = world.getMinimapFeatures();
  return {
    buildings: f.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w || 0, d: b.d || 0 })),
    clusters: f.treeClusters, water: f.waterOrSoft.map((d) => ({ x: d.x, z: d.z, r: d.r || 0 })), roads: f.roads,
    concealers: world.getConcealment().map((c) => ({ x: c.x, z: c.z, r: c.r })),
  };
}

function pageHeights(points) {
  const hf = window.__DEBUG.world.heightField;
  return points.map(([x, z]) => [hf.getHeightAt(x, z), hf.getWaterDepthAt?.(x, z) ?? 0]);
}

function pageGrassReady() {
  const D = window.__DEBUG, V = D.camera.position.constructor;
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  const s = D.world.getGrassWorkState();
  return s.pendingVisible === 0 && !s.carpet.pending;
}

function pageSettleClouds() {
  const D = window.__DEBUG, vc = D.scene.userData.volumetricClouds;
  if (!vc) return { present: false };
  const ran = vc.settleForCapture(D.camera);
  return { present: true, ran, remaining: vc.captureFramesRemaining };
}

function pageCloudsReady() {
  const vc = window.__DEBUG.scene.userData.volumetricClouds;
  return !vc || vc.captureFramesRemaining === 0;
}

function pageFrames(count) {
  return new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve(true) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
}

function pageCaptureState() {
  const D = window.__DEBUG, cam = D.camera, V = cam.position.constructor, canvas = D.renderer.domElement, ds = canvas.dataset;
  const hf = D.world.heightField, vc = D.scene.userData.volumetricClouds, csm = D.lighting.csm, sun = csm?.lights?.[0];
  const g = D.world.getGrassWorkState?.(), weather = D.battleAtmosphere?.current?.weather ?? D.battleAtmosphere?.weather ?? null;
  return {
    camera: { position: cam.position.toArray(), quaternion: cam.quaternion.toArray(), forward: cam.getWorldDirection(new V()).toArray(),
      fov: cam.fov, clearance: cam.position.y - hf.getHeightAt(cam.position.x, cam.position.z) },
    render: { canvas: [canvas.width, canvas.height], renderScale: ds.renderScale ?? null, dynScale: ds.dynScale ?? null,
      postAa: ds.postAa ?? null, perfTrim: ds.perfTrim ?? null, preset: D.quality.resolvePresetName() },
    lighting: { sunIntensity: sun?.intensity ?? null, sunColor: sun?.color?.getHexString?.() ?? null,
      sunDirection: csm?.lightDirection?.toArray?.() ?? null, hemi: D.lighting.hemi?.intensity ?? null,
      exposure: D.scene.userData.postExposure ?? null, fogDensity: D.scene.fog?.density ?? null, timeOfDay: weather?.timeOfDay ?? 'authored' },
    clouds: vc ? { active: vc.active ?? null, framesShown: vc.framesShown ?? null, cuts: vc.cuts ?? null, remaining: vc.captureFramesRemaining } : null,
    grass: g ? { pendingVisible: g.pendingVisible, carpetPending: !!g.carpet?.pending } : null,
    world: { mapId: D.world.mapId, phase: D.game.phase, shotMode: D.shotMode },
  };
}

/** The page script that poses one view (null pose = keep the staged shot), zeroes the cloud drift and resets its history. */
function poseScript(pose) {
  const posing = pose ? `resolved = resolveGroundPose(${JSON.stringify({ cam: pose.cam, at: pose.at })}, (x, z) => hf.getHeightAt(x, z), ${CENSUS_HALF}, ${pose.fov});
    D.rig.setExternalPose(new V(...resolved.cam), new V(...resolved.at), resolved.fov);` : '';
  return `(() => {
    const resolveGroundPose = ${resolveGroundPose.toString()};
    const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
    let resolved = null;
    ${posing}
    const vc = D.scene.userData.volumetricClouds, clouds = { present: !!vc, zeroed: [], reset: false };
    if (vc) {
      for (const key of ['weatherShift', 'noiseShift', 'cirrusShift']) {
        const v = vc[key];
        if (v && typeof v.set === 'function') { if (v.isVector3) v.set(0, 0, 0); else v.set(0, 0); clouds.zeroed.push(key); }
      }
      if (typeof vc.resetHistory === 'function') { vc.resetHistory(); clouds.reset = true; }
    }
    D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return { resolved, clouds };
  })()`;
}

async function bootPage(browser, baseUrl) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport({ ...CENSUS_VIEWPORT, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((spec) => {
    try {
      localStorage.setItem(spec.storageKey, spec.playerSpecId);
      localStorage.setItem('cot.gfxPreset', 'high');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
    } catch { /* storage blocked: the boot checks below fail loudly */ }
  }, PINNED_SCENE);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon') && !text.startsWith('Failed to load resource')) errors.push(text.slice(0, 300));
  });
  await page.goto(`${baseUrl}/?${GAME_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG', { timeout: 600000, polling: 500 });
  await page.evaluate(configurePinnedScene, PINNED_SCENE);
  const env = await page.evaluate(pageEnvironment);
  if (env.preset !== 'high') throw new Error(`boot preset is ${env.preset}, expected high`);
  return { page, errors, env };
}

async function pageAlive(page) {
  if (!page || page.isClosed()) return false;
  try { return (await within(page.evaluate('1 + 1'), 30000, 'page ping')) === 2; } catch { return false; }
}

// ---------------------------------------------------------------------------------------------- one map

async function stageMap(page, mapId, env, timeoutMs) {
  const shotView = mapId === 'verdant' ? 'battlefield' : `battlefield_${mapId}`;
  if (!env.shotViews.includes(shotView)) throw new Error(`this build has no ${shotView} shot view`);
  const started = Date.now();
  await within(page.evaluate((name) => window.__SHOTS.set(name), shotView), timeoutMs, `__SHOTS.set(${shotView})`);
  const readiness = await page.evaluate(settleMapTextures, { mapId, timeoutMs: 180000 });
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  const state = await page.evaluate(pageStageState);
  if (state.mapId !== mapId) throw new Error(`staged ${state.mapId}, expected ${mapId}`);
  if (state.preset !== 'high') throw new Error(`preset ${state.preset}, expected high`);
  if (!state.player) throw new Error('the shot recipe staged no player hull');
  return { shotView, ms: Date.now() - started, readiness: { evidence: readiness.evidence, targets: readiness.results?.length ?? null }, ...state };
}

/** Node-side poses of every view from the page's layout data (one heights round trip for the site searches). */
async function planViews(page, views, player) {
  const data = await page.evaluate(pageMapData);
  const searches = new Map();
  for (const view of views) {
    if (view.kind === 'terrain') { const candidates = terrainSiteCandidates(player, view); searches.set(view.name, { candidates, points: terrainSamplePoints(candidates) }); }
    if (view.kind === 'sky') { const candidates = skySiteCandidates(view); searches.set(view.name, { candidates, points: skySamplePoints(candidates) }); }
  }
  const points = [...searches.values()].flatMap((search) => search.points);
  const samples = points.length ? await page.evaluate(pageHeights, points) : [];
  const table = new Map(points.map(([x, z], i) => [`${x},${z}`, samples[i]]));
  const ground = { ...data, heightAt: (x, z) => table.get(`${x},${z}`)?.[0], waterDepthAt: (x, z) => table.get(`${x},${z}`)?.[1] ?? 0 };
  const plans = {};
  for (const view of views) {
    let pose = null;
    if (view.kind === 'table') pose = { cam: view.cam, at: view.at, fov: view.fov };
    else if (view.kind === 'hull') pose = selectChasePose(player, data, view);
    else if (view.kind === 'terrain') pose = terrainPose(selectTerrainSite(searches.get(view.name).candidates, ground), view);
    else if (view.kind === 'sky') pose = skyPose(selectSkySite(searches.get(view.name).candidates, ground, view), view);
    else if (view.kind === 'tree') pose = selectTreePose(data, view);
    plans[view.name] = pose?.skipped ? { skipped: pose.skipped } : { pose, selection: pose?.selection ?? null };
  }
  return { plans, layout: { buildings: data.buildings.length, clusters: data.clusters.length, water: data.water.length, roads: data.roads.length, concealers: data.concealers.length } };
}

async function shootView(page, out, mapId, view, plan, settleMs) {
  const t = {}; let mark = Date.now();
  const lap = (key) => { t[key] = Date.now() - mark; mark = Date.now(); };
  const posed = await page.evaluate(poseScript(plan.pose));
  let terrain;
  try {
    const settled = await page.evaluate(settleResidencyTerrain);
    terrain = { jobs: settled.jobs, exhausted: settled.exhausted };
  } catch (error) { terrain = { error: String(error?.message || error).slice(0, 200) }; }
  lap('terrainMs');
  await page.waitForFunction(pageGrassReady, { timeout: 120000, polling: 'raf' });
  lap('grassMs');
  const impostors = await page.evaluate(() => { try { return window.__DEBUG.world.warmImpostors?.() ?? null; } catch (e) { return String(e).slice(0, 120); } });
  await page.evaluate(pageFrames, 2);
  const clouds = await page.evaluate(pageSettleClouds);
  await page.waitForFunction(pageCloudsReady, { timeout: 120000, polling: 250 });
  lap('cloudsMs');
  await page.evaluate(pageFrames, 6);
  await sleep(settleMs);
  lap('settleMs');
  const state = await page.evaluate(pageCaptureState);
  const rel = path.posix.join('frames', mapId, `${view.name}.png`);
  mkdirSync(path.join(out, 'frames', mapId), { recursive: true });
  await within(page.screenshot({ path: path.join(out, rel), type: 'png' }), 120000, 'screenshot');
  lap('screenshotMs');
  return { file: rel, pose: posed.resolved, cloudsReset: posed.clouds, terrainSettle: terrain, impostors, cloudSettle: clouds, state, timings: t };
}

// ---------------------------------------------------------------------------------------------- capture run

const stamp = () => new Date().toTimeString().slice(0, 8);

async function runCapture(options) {
  process.chdir(options.root); // the repository's vite config resolves its source graph from the cwd
  const registry = await registeredMaps(options.root);
  const header = censusHeader(options.root, options.serve);
  const census = openCensus(loadCensus(options.out), header);
  const maps = pickCaptureMaps(registry.ids, census, options);
  const session = {
    index: census.sessions.length, startedAt: new Date().toISOString(), endedAt: null, argv: options.argv, node: process.version,
    loadAvgStart: os.loadavg().map((v) => Math.round(v * 10) / 10), maps, done: [], failed: [], port: null, browserVersion: null, gpu: null,
  };
  census.sessions.push(session);
  saveCensus(options.out, census);
  if (!maps.length) { console.log(`[${TOOL}] nothing to capture (remaining 0)`); session.endedAt = new Date().toISOString(); saveCensus(options.out, census); return { ok: true, remaining: 0 }; }
  console.log(`[${TOOL}] ${stamp()} session ${session.index}: ${maps.length} map(s) ${maps.join(',')} → ${options.out}`);

  const lock = createCaptureLock();
  let server = null, browser = null, refresher = null, booted = null;
  const cleanup = async () => {
    clearInterval(refresher);
    try { if (browser) await browser.close(); } catch { /* already gone */ }
    try { if (server) await server.close(); } catch { /* already gone */ }
    lock.release();
  };
  const onSignal = (signal) => { console.error(`[${TOOL}] ${signal}: closing`); cleanup().finally(() => process.exit(130)); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  try {
    await lock.acquire(options.lockTimeoutMin * 60000);
    refresher = setInterval(() => lock.refresh(), 30000);
    refresher.unref();
    server = await startServer(options);
    session.port = server.port;
    browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
      args: [...MAP_PROBE_BROWSER_ARGS, `--window-size=${CENSUS_VIEWPORT.width},${CENSUS_VIEWPORT.height}`] });
    session.browserVersion = await browser.version();
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const boot = async () => { booted = await bootPage(browser, baseUrl); session.gpu = booted.env.gpu; return booted; };
    await boot();
    console.log(`[${TOOL}] ${stamp()} booted on :${server.port} (${session.gpu})`);
    const started = Date.now();
    for (const mapId of maps) {
      if (options.budgetMin && (Date.now() - started) / 60000 > options.budgetMin) { console.log(`[${TOOL}] budget reached, stopping before ${mapId}`); break; }
      const record = await captureMap({ census, mapId, name: registry.nameOf(mapId), options, boot, getBooted: () => booted, sessionIndex: session.index });
      (record.status === 'failed' ? session.failed : session.done).push(mapId);
      saveCensus(options.out, census);
    }
  } finally {
    session.endedAt = new Date().toISOString();
    session.loadAvgEnd = os.loadavg().map((v) => Math.round(v * 10) / 10);
    saveCensus(options.out, census);
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    await cleanup();
  }
  const remaining = pickCaptureMaps(registry.ids, census, { maps: options.maps, batch: Infinity }).length;
  console.log(`[${TOOL}] ${stamp()} session ${session.index} done: ${session.done.length} ok, ${session.failed.length} failed (${session.failed.join(',') || '-'}); remaining ${remaining}`);
  return { ok: session.failed.length === 0, remaining };
}

async function captureMap({ census, mapId, name, options, boot, getBooted, sessionIndex }) {
  const prior = census.maps[mapId];
  const record = { name, status: 'running', session: sessionIndex, capturedAt: new Date().toISOString(), failures: prior?.failures ?? 0, views: {}, pageErrors: [] };
  census.maps[mapId] = record;
  const t0 = Date.now();
  let rebooted = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { page, errors, env } = getBooted();
    const errorMark = errors.length;
    try {
      record.stage = await stageMap(page, mapId, env, 900000);
      record.stage.attempts = attempt;
      record.authoredSky = record.stage.authoredSky; record.player = record.stage.player; record.timeOfDay = record.stage.timeOfDay;
      const { plans, layout } = await planViews(page, options.views, record.player);
      record.layout = layout;
      for (const view of options.views) {
        const plan = plans[view.name];
        if (plan.skipped) { record.views[view.name] = { status: 'skipped', reason: plan.skipped }; continue; }
        if (record.views[view.name]?.status === 'ok') continue;
        record.views[view.name] = await shootWithRetry(page, options, mapId, view, plan);
        saveCensus(options.out, census);
      }
      record.pageErrors = errors.slice(errorMark, errorMark + 20);
      break;
    } catch (error) {
      record.lastError = String(error?.stack || error).slice(0, 600);
      console.error(`[${TOOL}] ${stamp()} ${mapId} attempt ${attempt}: ${String(error?.message || error).slice(0, 200)}`);
      if (attempt === 2) break;
      if (!(await pageAlive(page)) && !rebooted) {
        rebooted = true;
        try { await page.close().catch(() => {}); await boot(); } catch (bootError) { record.lastError += ` | reboot: ${String(bootError?.message || bootError).slice(0, 200)}`; break; }
      }
    }
  }
  const views = Object.values(record.views);
  const allOk = options.views.every((v) => ['ok', 'skipped'].includes(record.views[v.name]?.status));
  record.status = allOk ? 'ok' : views.some((v) => v.status === 'ok') ? 'partial' : 'failed';
  if (record.status !== 'ok') { record.failures += 1; record.error = record.lastError || 'views failed'; }
  record.ms = Date.now() - t0;
  console.log(`[${TOOL}] ${stamp()} ${mapId}: ${record.status} in ${Math.round(record.ms / 1000)} s (${options.views.map((v) => `${v.name}:${record.views[v.name]?.status || '-'}`).join(' ')})`);
  return record;
}

async function shootWithRetry(page, options, mapId, view, plan) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const shot = await shootView(page, options.out, mapId, view, plan, options.settleMs);
      return { status: 'ok', attempts: attempt, selection: plan.selection ?? null, ...shot };
    } catch (error) {
      lastError = String(error?.message || error).slice(0, 300);
      console.error(`[${TOOL}] ${stamp()} ${mapId}/${view.name} attempt ${attempt}: ${lastError}`);
      if (!(await pageAlive(page))) throw error;
    }
  }
  return { status: 'failed', attempts: 2, error: lastError, selection: plan.selection ?? null };
}

// ---------------------------------------------------------------------------------------------- reports

/** The reproduce block of the index: the build, every capture session's exact command, the report. */
function reproduceLines(census, out) {
  const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
  return [
    `cd ${census.root}`,
    ...(census.serve === 'dist' ? ['npm run build'] : []),
    '# every capture run under the probe mutex at nice 19; the tool takes the cot-shots capture lock itself',
    ...census.sessions.filter((s) => s.maps?.length).map((s) => `nice -n 19 node tools/${TOOL}.mjs ${s.argv.map(quote).join(' ')}`),
    `node tools/${TOOL}.mjs report --out=${out}`,
  ];
}

async function runReport(options, steps) {
  const census = loadCensus(options.out);
  if (!census) throw new Error(`no census.json in ${options.out}`);
  if (steps.includes('metrics')) {
    const n = await measureCensus(options.out, census, { force: options.force });
    saveCensus(options.out, census);
    console.log(`[${TOOL}] metrics: ${n} frame(s) measured`);
  }
  const registry = await registeredMaps(census.root).catch(() => null);
  const mapIds = registry ? registry.ids.filter((id) => census.maps[id]) : Object.keys(census.maps);
  let sheets = null;
  if (steps.includes('sheets') || steps.includes('index')) {
    if (steps.includes('sheets')) sheets = await buildSheets(options.out, census, { mapIds });
    else sheets = { views: CENSUS_VIEWS.map((v) => `sheets/view-${v.name}.jpg`), maps: mapIds.map((id) => `sheets/map-${id}.jpg`) };
    if (steps.includes('sheets')) console.log(`[${TOOL}] sheets: ${sheets.views.length + sheets.maps.length} written`);
  }
  if (steps.includes('index')) console.log(`[${TOOL}] index: ${writeIndex(options.out, census, { mapIds, sheets, reproduce: reproduceLines(census, options.out) })}`);
  return { ok: true };
}

async function main(argv) {
  let parsed;
  try { parsed = parseCensusArgs(argv); }
  catch (error) { console.error(`${error.message}\n\n${CENSUS_HELP}`); return 1; }
  if (parsed.help) { console.log(CENSUS_HELP); return 0; }
  const { options } = parsed;
  if (options.command === 'capture') return (await runCapture(options)).ok ? 0 : 1;
  if (options.command === 'compare') {
    const report = await compareCensus(options.a, options.b, options.out);
    console.log(`[${TOOL}] compare: ${report.rows.length} frame pairs → ${options.out}`);
    return 0;
  }
  const steps = { metrics: ['metrics'], sheets: ['sheets'], index: ['index'], report: ['metrics', 'sheets', 'index'] }[options.command];
  return (await runReport(options, steps)).ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
