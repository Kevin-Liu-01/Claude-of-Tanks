// tools/map-ambience-shots.mjs — the map's air (src/world/mapAmbience.ts) off and on, staged identically.
//
//   node tools/map-ambience-shots.mjs --out=<dir> [--maps=a,b] [--times=day,night] [--serve=dist|dev] [--root=<checkout>]
//        [--width=1600] [--height=900] [--hold-min=15] [--lock-timeout-min=180]
//
// For each map: stage its battlefield shot (__SHOTS.set: the fx clock frozen, the wind pinned), pose the census's chase
// view (3.4 m over the ground, 12-15 m behind the staged hull, tools/visual-census-views.mjs selectChasePose), then for
// each time of day apply the battle's preset (__SHOTS.battleTime, which prepares the air for that hour) and shoot the
// frame with the air off, then on (__DEBUG.mapAmbience.setEnabled). Both frames of a pair share the pinned fx clock, so
// they differ by the air alone. Frames land in <out>/frames/<map>-<time>-<off|on>.png and every map's receipt (the
// pose, the air's layers and draws) in <out>/manifest.json, merged as each map finishes so a run resumes.
//
// GPU work takes a NORMAL ticket in the cot-shots FIFO (tools/capture-lock.mjs) and gives the lock back after
// --hold-min minutes of holding it, between maps, before queueing again. Serve dist (npm run build first) by default.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { isMainModule, resolveGroundPose, sleep, withDistProbeSession, withMapProbeSession } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { selectChasePose } from './visual-census-views.mjs';
import { censusShotView } from './visual-census.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';

const TOOL = 'map-ambience-shots';

function parse(argv) {
  const out = { maps: null, times: ['day', 'night'], serve: 'dist', root: process.cwd(), width: 1600, height: 900,
    holdMin: 15, lockTimeoutMin: 180, out: null };
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    const [, key, value] = m;
    if (key === 'out') out.out = path.resolve(value);
    else if (key === 'maps') out.maps = value.split(',').filter(Boolean);
    else if (key === 'times') out.times = value.split(',').filter(Boolean);
    else if (key === 'serve') out.serve = value;
    else if (key === 'root') out.root = path.resolve(value);
    else if (key === 'width') out.width = Number(value);
    else if (key === 'height') out.height = Number(value);
    else if (key === 'hold-min') out.holdMin = Number(value);
    else if (key === 'lock-timeout-min') out.lockTimeoutMin = Number(value);
    else throw new Error(`unknown flag --${key}`);
  }
  if (!out.out) throw new Error('--out=<dir> is required');
  for (const id of out.maps ?? []) if (!MAP_IDS.includes(id)) throw new Error(`unknown map ${id}`);
  for (const t of out.times) if (!['day', 'sunset', 'night'].includes(t)) throw new Error(`unknown time ${t}`);
  if (!['dist', 'dev'].includes(out.serve)) throw new Error('--serve is dist or dev');
  return out;
}

function stamp() { return new Date().toISOString().slice(11, 19); }

function pageStage() {
  const D = window.__DEBUG, player = D.game.player, world = D.world, f = world.getMinimapFeatures();
  return {
    mapId: world?.mapId ?? null,
    player: player?.state ? { x: player.state.pos.x, z: player.state.pos.z, yaw: player.state.yaw } : null,
    buildings: f.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w || 0, d: b.d || 0 })),
    concealers: world.getConcealment().map((c) => ({ x: c.x, z: c.z, r: c.r })),
  };
}

/** Pose the chase view over the ground and hold the clouds still (the census's pose script, its chase part). */
function poseScript(pose) {
  return `(() => {
    const resolveGroundPose = ${resolveGroundPose.toString()};
    const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
    const resolved = resolveGroundPose(${JSON.stringify({ cam: pose.cam, at: pose.at })}, (x, z) => hf.getHeightAt(x, z), 511, ${pose.fov});
    D.rig.setExternalPose(new V(...resolved.cam), new V(...resolved.at), resolved.fov);
    const vc = D.scene.userData.volumetricClouds;
    if (vc) {
      for (const key of ['weatherShift', 'noiseShift', 'cirrusShift']) {
        const v = vc[key];
        if (v && typeof v.set === 'function') { if (v.isVector3) v.set(0, 0, 0); else v.set(0, 0); }
      }
      if (typeof vc.resetHistory === 'function') vc.resetHistory();
    }
    D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return resolved;
  })()`;
}

async function bootPage(browser, baseUrl, { width, height }) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((spec) => {
    try {
      localStorage.setItem(spec.storageKey, spec.playerSpecId);
      localStorage.setItem('cot.gfxPreset', 'high');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
    } catch { /* the boot checks below fail loudly */ }
  }, PINNED_SCENE);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon') && !text.startsWith('Failed to load resource')) errors.push(text.slice(0, 300));
  });
  await page.goto(`${baseUrl}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG', { timeout: 600000, polling: 500 });
  await page.evaluate(configurePinnedScene, PINNED_SCENE);
  return { page, errors };
}

function loadManifest(file) {
  if (!existsSync(file)) return { tool: TOOL, maps: {} };
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function shootMap(page, mapId, options, frames) {
  await page.evaluate((name) => window.__SHOTS.set(name), censusShotView(mapId));
  await page.evaluate(settleMapTextures, { mapId, timeoutMs: 180000 });
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  const stage = await page.evaluate(pageStage);
  if (stage.mapId !== mapId) throw new Error(`staged ${stage.mapId}, expected ${mapId}`);
  const chase = selectChasePose(stage.player, stage);
  const receipt = { pose: chase, times: {} };
  for (const time of options.times) {
    const applied = await page.evaluate((t) => window.__SHOTS.battleTime(t), time);
    receipt.pose.resolved = await page.evaluate(poseScript(chase));
    await sleep(1800);
    const pair = {};
    for (const on of [false, true]) {
      await page.evaluate((v) => window.__DEBUG.mapAmbience.setEnabled(v), on);
      await sleep(900);
      const file = path.join(frames, `${mapId}-${time}-${on ? 'on' : 'off'}.png`);
      await page.screenshot({ path: file, type: 'png' });
      pair[on ? 'on' : 'off'] = path.basename(file);
      if (on) pair.air = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG.scene.userData.mapAmbience ?? null)));
    }
    receipt.times[time] = { applied, ...pair };
  }
  await page.evaluate(() => window.__DEBUG.mapAmbience.setEnabled(true));
  return receipt;
}

async function main(argv) {
  const options = parse(argv);
  const frames = path.join(options.out, 'frames');
  mkdirSync(frames, { recursive: true });
  const manifestFile = path.join(options.out, 'manifest.json');
  const manifest = loadManifest(manifestFile);
  const maps = (options.maps ?? [...MAP_IDS]).filter((id) => !manifest.maps[id]);
  if (!maps.length) { console.log(`[${TOOL}] every requested map is already in ${manifestFile}`); return 0; }
  const lock = createCaptureLock();
  let heldSince = 0;
  const take = async () => {
    console.log(`[${TOOL}] ${stamp()} queueing for the capture lock`);
    await lock.acquire(options.lockTimeoutMin * 60000);
    heldSince = Date.now();
    console.log(`[${TOOL}] ${stamp()} holding the capture lock`);
  };
  const refresher = setInterval(() => { if (heldSince) lock.refresh(); }, 30000);
  refresher.unref();
  const session = options.serve === 'dist'
    ? (run) => withDistProbeSession({ root: options.root, dist: path.join(options.root, 'dist'), launch: { width: options.width, height: options.height } }, run)
    : (run) => withMapProbeSession({ root: options.root, launch: { width: options.width, height: options.height } }, run);
  try {
    await session(async ({ browser, baseUrl }) => {
      // boot before the lock: the cold load is CPU work, the frames are the GPU's
      const { page, errors } = await bootPage(browser, baseUrl, options);
      console.log(`[${TOOL}] ${stamp()} booted ${baseUrl}`);
      for (const mapId of maps) {
        if (!heldSince) await take();
        const started = Date.now();
        const receipt = await shootMap(page, mapId, options, frames);
        receipt.ms = Date.now() - started;
        receipt.errors = errors.splice(0);
        manifest.maps[mapId] = receipt;
        writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(`[${TOOL}] ${stamp()} ${mapId} done in ${(receipt.ms / 1000).toFixed(1)} s`);
        if (Date.now() - heldSince > options.holdMin * 60000) {
          lock.release();
          heldSince = 0;
          console.log(`[${TOOL}] ${stamp()} gave the capture lock back after ${options.holdMin} min`);
        }
      }
    });
  } finally {
    clearInterval(refresher);
    if (heldSince) lock.release();
  }
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
