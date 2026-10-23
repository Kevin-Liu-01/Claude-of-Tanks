// tools/map-ambience-shots.mjs — the map's air (src/world/mapAmbience.ts) off and on, staged identically.
//
//   node tools/map-ambience-shots.mjs --out=<dir> [--maps=a,b] [--times=day,night] [--root=<checkout>]
//        [--width=1600] [--height=900] [--pages=4] [--wait-hours=10]
//
// Holds serve shots only (tools/capture-hold.mjs runWarmHold): while the ticket waits in the cot-shots FIFO, a vite
// preview of <root>/dist and one Chrome come up and each of at most --pages maps is loaded in its own page, staged on its
// battlefield shot (__SHOTS.set: the fx clock frozen, the wind pinned) and posed on the census's chase view (3.4 m over
// the ground, 12-15 m behind the staged hull; tools/visual-census-views.mjs selectChasePose); the pages are then frozen.
// Inside the hold each page in turn comes to the front and, for each time of day, takes the battle's preset
// (__SHOTS.battleTime, which prepares the air for that hour) and is shot with the air off, then on
// (__DEBUG.mapAmbience.setEnabled). Both frames of a pair share the pinned fx clock, so they differ by the air alone.
// Frames land in <out>/frames/<map>-<time>-<off|on>.png and every map's receipt (the pose, the air's layers and draws)
// in <out>/manifest.json, merged as each map finishes, so a run resumes; more maps than --pages take further holds.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { runWarmHold, startViteChild } from './capture-hold.mjs';
import { isMainModule, mapProbeLaunchOptions, resolveGroundPose, sleep } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { selectChasePose } from './visual-census-views.mjs';
import { censusShotView } from './visual-census.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';

const TOOL = 'map-ambience-shots';

function parse(argv) {
  const out = { maps: null, times: ['day', 'night'], root: process.cwd(), width: 1600, height: 900, pages: 4,
    waitHours: 10, out: null };
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    const [, key, value] = m;
    if (key === 'out') out.out = path.resolve(value);
    else if (key === 'maps') out.maps = value.split(',').filter(Boolean);
    else if (key === 'times') out.times = value.split(',').filter(Boolean);
    else if (key === 'root') out.root = path.resolve(value);
    else if (key === 'width') out.width = Number(value);
    else if (key === 'height') out.height = Number(value);
    else if (key === 'pages') out.pages = Math.max(1, Math.min(4, Number(value)));
    else if (key === 'wait-hours') out.waitHours = Number(value);
    else throw new Error(`unknown flag --${key}`);
  }
  if (!out.out) throw new Error('--out=<dir> is required');
  for (const id of out.maps ?? []) if (!MAP_IDS.includes(id)) throw new Error(`unknown map ${id}`);
  for (const t of out.times) if (!['day', 'sunset', 'night'].includes(t)) throw new Error(`unknown time ${t}`);
  if (!existsSync(path.join(out.root, 'dist', 'index.html'))) throw new Error(`${out.root}/dist has no build: npm run build first`);
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

/** One game page booted to ready with the pinned scene, staged on `mapId` and posed: the queue-side warm. */
async function warmMapPage(browser, baseUrl, mapId, { width, height }) {
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
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction('window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG', { timeout: 900000, polling: 1000 });
  await page.evaluate(configurePinnedScene, PINNED_SCENE);
  await page.evaluate((name) => window.__SHOTS.set(name), censusShotView(mapId));
  await page.evaluate(settleMapTextures, { mapId, timeoutMs: 600000 });
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  const stage = await page.evaluate(pageStage);
  if (stage.mapId !== mapId) throw new Error(`staged ${stage.mapId}, expected ${mapId}`);
  const pose = selectChasePose(stage.player, stage);
  pose.resolved = await page.evaluate(poseScript(pose));
  return { page, mapId, pose, errors };
}

/** Inside the hold: the staged page's day and night pairs. */
async function shootMap(entry, options, frames) {
  const { page, mapId, pose } = entry;
  await page.bringToFront();
  await sleep(1500);
  const receipt = { pose, times: {} };
  for (const time of options.times) {
    const applied = await page.evaluate((t) => window.__SHOTS.battleTime(t), time);
    await page.evaluate(poseScript(pose));
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
  receipt.errors = entry.errors.splice(0);
  return receipt;
}

async function main(argv) {
  const options = parse(argv);
  const frames = path.join(options.out, 'frames');
  mkdirSync(frames, { recursive: true });
  const manifestFile = path.join(options.out, 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { tool: TOOL, maps: {} };
  const todo = (options.maps ?? [...MAP_IDS]).filter((id) => !manifest.maps[id]);
  if (!todo.length) { console.log(`[${TOOL}] every requested map is already in ${manifestFile}`); return 0; }
  for (let i = 0; i < todo.length; i += options.pages) {
    const batch = todo.slice(i, i + options.pages);
    await runWarmHold({
      label: `${TOOL} ${batch.join(',')}`,
      place: `${TOOL}:${path.basename(options.out)}:${batch.join(',')}`,
      waitHours: options.waitHours,
      warm: async () => {
        const server = await startViteChild({ root: options.root, mode: 'preview' });
        const browser = await puppeteer.launch({ ...mapProbeLaunchOptions({ width: options.width, height: options.height, protocolTimeout: 900000 }), timeout: 180000 });
        const close = async () => { await browser.close(); await server.close(); };
        try {
          const entries = [];
          for (const mapId of batch) {
            entries.push(await warmMapPage(browser, server.url, mapId, options));
            console.log(`[${TOOL}] ${stamp()} ${mapId} staged`);
          }
          return { pages: entries.map((e) => e.page), entries, close };
        } catch (error) {
          await close();
          throw error;
        }
      },
      shoot: async ({ entries, signal }) => {
        for (const entry of entries) {
          if (signal.aborted) { console.log(`[${TOOL}] ${stamp()} hold limit before ${entry.mapId}`); break; }
          const started = Date.now();
          const receipt = await shootMap(entry, options, frames);
          receipt.ms = Date.now() - started;
          manifest.maps[entry.mapId] = receipt;
          writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
          console.log(`[${TOOL}] ${stamp()} ${entry.mapId} done in ${(receipt.ms / 1000).toFixed(1)} s`);
        }
      },
    });
  }
  const missing = todo.filter((id) => !manifest.maps[id]);
  if (missing.length) { console.log(`[${TOOL}] not shot (rerun to resume): ${missing.join(',')}`); return 1; }
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
