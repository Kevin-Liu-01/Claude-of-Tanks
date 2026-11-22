// tools/landmark-shots.mjs — every map's set pieces at the battle camera, staged identically on every build (landmarks-271,
// the owner 2026-11-06: "new special buildings like the way our airport map has hangars and our seaside map has a harbor
// area with a lighthouse ... that all need to look great and integrated with the whole identity of the map"). The A/B
// for the 11-06 sign-test rule, ported from buildings-270's building-style-shots (02d7f7856f, its cloud pin unchanged).
//
//   node tools/landmark-shots.mjs --out=<dir> --jobs=<jobs.json> --poses=<poses.json> [--root=<checkout>] [--tag=v1]
//        [--wait-hours=16] [--pair-minutes=10] [--kinds=a,b]
//
// jobs.json: [{ "name": "after-desktop", "dist": "<built dist>", "device": "desktop" | "phone", "maps": [...],
//               "poses": ["chase", ...] }, ...] — list the AFTER job first: its poses are written to poses.json, and every
// later job (BEFORE, the A/A repeat, phone) reuses them byte for byte, so the two arms of a pair share one camera even
// though the BEFORE build has no set piece for a ray to find.
// Poses, aimed at the map's set pieces (props.landmarks of --kinds, their centres and footprints from the map config):
//   chase   — the battle's chase eye (3.4 m over the ground) on open ground in front of the first piece, the eye at its
//             reach + 26 m from its centre, the first heading of a 24-step fan from its front whose ray toward the piece's
//             middle meets a solid within the piece's reach of its centre (the piece, not a wall at the lens);
//   chase2  — the same on the second piece, or the first from its other side;
//   long    — 22 m over the ground 230 m from the first piece, looking at it: the piece in its place's silhouette.
// The clouds as building-style-shots pins them: every frame at CLOUD_TIME_S of scene time, drift held, trace and resolve
// held, so two builds draw one sky.
import { launchGuardedBrowser, setBrowserGuardContext } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { freezePage, startViteChild, thawPage } from './capture-hold.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { isMainModule, mapProbeLaunchOptions, sleep } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { censusShotView } from './visual-census.mjs';
import { grassSettled } from './frame-budget-probe.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { LANDMARK_KINDS, resolveLandmarkParams } from '../src/world/landmarks/plan.ts';

const TOOL = 'landmark-shots';
const DEVICES = Object.freeze({
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, query: 'tier=desktop', preset: 'high' },
  phone: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, query: 'tier=mobile', preset: null },
});
const POSES = Object.freeze(['chase', 'chase2', 'long']);

function parse(argv) {
  const out = { root: process.cwd(), out: null, jobs: null, waitHours: 16, tag: 'v1', pairMinutes: 10, poses: null, kinds: null };
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    const [, key, value] = m;
    if (key === 'out') out.out = path.resolve(value);
    else if (key === 'jobs') out.jobs = path.resolve(value);
    else if (key === 'root') out.root = path.resolve(value);
    else if (key === 'wait-hours') out.waitHours = Number(value);
    else if (key === 'tag') out.tag = value;
    else if (key === 'pair-minutes') out.pairMinutes = Number(value);
    else if (key === 'poses') out.poses = path.resolve(value);
    else if (key === 'kinds') out.kinds = new Set(value.split(','));
    else throw new Error(`unknown flag --${key}`);
  }
  if (!out.out || !out.jobs || !out.poses) throw new Error('--out=<dir>, --jobs=<jobs.json> and --poses=<poses.json> are required');
  out.jobs = JSON.parse(readFileSync(out.jobs, 'utf8'));
  for (const job of out.jobs) {
    job.dist = path.resolve(job.dist);
    job.poses ??= [...POSES];
    if (!DEVICES[job.device]) throw new Error(`${job.name}: unknown device ${job.device}`);
    for (const id of job.maps) if (!MAP_IDS.includes(id)) throw new Error(`${job.name}: unknown map ${id}`);
    for (const p of job.poses) if (!POSES.includes(p)) throw new Error(`${job.name}: unknown pose ${p}`);
    if (!existsSync(path.join(job.dist, 'index.html'))) throw new Error(`${job.dist} has no build`);
  }
  return out;
}

function stamp() { return new Date().toISOString().slice(11, 19); }

/** The staged battlefield's buildings (page side). */
function pageStage() {
  const D = window.__DEBUG, world = D.world, f = world.getMinimapFeatures();
  return { mapId: world?.mapId ?? null, buildings: f.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w || 0, d: b.d || 0 })) };
}

/** The map's set pieces of this lane (centre, heading, reach), from the config (node side). */
function landmarkTargets(mapId, kinds) {
  return (getMapConfig(mapId).props?.landmarks ?? []).filter((p) => !kinds || kinds.has(p.kind)).map((p) => {
    const [hw, hl] = LANDMARK_KINDS[p.kind].footprint(resolveLandmarkParams(p));
    return { kind: p.kind, name: p.name ?? p.kind, x: p.x, z: p.z, yawDeg: p.yawDeg ?? 0, reach: Math.hypot(hw, hl), half: Math.min(hw, hl) };
  });
}

/**
 * The standpoints on the map's set pieces (page side, AFTER arm only): for each pose, the first heading of a 24-step fan
 * from the piece's front whose eye is dry, inside the square, clear of every minimap building by 6 m, and whose ray to
 * the piece's middle meets a solid within the piece's reach of its centre.
 */
function pagePlan({ targets, buildings }) {
  const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
  const h = (x, z) => hf.getHeightAt(Math.max(-511, Math.min(511, x)), Math.max(-511, Math.min(511, z)));
  const B = buildings.map((b) => ({ x: b.x, z: b.z, r: Math.max(b.w, b.d) / 2 }));
  if (!targets.length) return { targets: [] };
  const stand = (t, dist, eyeUp, after) => {
    const front = t.yawDeg * Math.PI / 180;
    for (let k = 0; k < 24; k++) {
      const step = ((k + after) % 24), a = front + (step % 2 ? -1 : 1) * Math.ceil(step / 2) * (Math.PI / 12);
      const sx = Math.sin(a), sz = Math.cos(a), ex = t.x + sx * dist, ez = t.z + sz * dist;
      if (Math.max(Math.abs(ex), Math.abs(ez)) > 478) continue;
      if ((hf.getWaterMaskAt?.(ex, ez) ?? 0) > 0.02) continue;
      if (B.some((b) => Math.hypot(b.x - ex, b.z - ez) < b.r + 6)) continue;
      const ey = h(ex, ez) + eyeUp, ty = h(t.x, t.z) + Math.min(8, 2 + t.half * 0.25);
      const dir = new V(t.x - ex, ty - ey, t.z - ez), len = dir.length();
      const hit = D.world.raycast?.(new V(ex, ey, ez), dir.normalize(), len + t.reach);
      const d = hit?.dist ?? Infinity;
      if (!(d > len - t.reach - 2 && d < len + 4)) continue;
      return { cam: [ex, ey, ez], at: [t.x, ty, t.z], heading: k, hitM: Number.isFinite(d) ? +d.toFixed(1) : null, target: t.name };
    }
    return null;
  };
  const [first, second] = targets;
  const chase = stand(first, first.reach + 26, 3.4, 0);
  const chase2 = second ? stand(second, second.reach + 26, 3.4, 0) : stand(first, first.reach + 26, 3.4, (chase?.heading ?? 0) + 12);
  const long = stand(first, 230, 22, 0);
  return { targets: targets.map((t) => t.name), chase, chase2, long };
}

/** The scene time the clouds are drawn at, and the frames traced there before the layer is held. */
const CLOUD_TIME_S = 0, CLOUD_FRAMES = 48;

/**
 * The cloud layer pinned (page side): at CLOUD_TIME_S, a fresh trace sequence, its drift held (the frame's dt 0) while
 * CLOUD_FRAMES frames trace and resolve, then held; `release` lets it run (the settle between poses).
 */
function pinClouds(release = false) {
  return `(() => {
    const vc = window.__DEBUG.scene.userData.volumetricClouds;
    if (!vc) return true;
    if (!vc.__pin) {
      const live = vc.beforeSceneRender.bind(vc);
      vc.__pin = { held: false, left: 0 };
      vc.beforeSceneRender = (renderer, camera, dt, ...rest) => {
        const pin = vc.__pin;
        if (!pin.held) return live(renderer, camera, dt, ...rest);
        live(renderer, camera, 0, ...rest);
        if (pin.left > 0 && --pin.left === 0) vc.frozen = true;
      };
    }
    vc.frozen = false;
    if (${release}) { vc.__pin.held = false; return true; }
    vc.setCaptureTime(${CLOUD_TIME_S}, true);
    Object.assign(vc.__pin, { held: true, left: ${CLOUD_FRAMES} });
    return false;
  })()`;
}

/** The pinned layer held (its frames traced), or no layer. */
function cloudsHeld() {
  const vc = window.__DEBUG.scene.userData.volumetricClouds;
  return !vc || vc.frozen === true;
}

function externalPoseScript(pose) {
  return `(() => {
    const D = window.__DEBUG, V = D.camera.position.constructor;
    D.rig.setExternalPose(new V(...${JSON.stringify(pose.cam)}), new V(...${JSON.stringify(pose.at)}), ${pose.fov});
    ${pinClouds(true)};
    D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return { cam: D.camera.position.toArray(), fov: D.camera.fov };
  })()`;
}

/** Every hull's AI and inputs frozen and the track prints cleared, before a map's poses (page side). */
function pageQuiet() {
  const D = window.__DEBUG;
  for (const e of D.game.tanks) {
    if (!e.isPlayer) e.aiCtl = null;
    if (e.input) { e.input.actionBits = 0; if ('throttle' in e.input) e.input.throttle = 0; if ('steer' in e.input) e.input.steer = 0; }
    if (e.state) e.state.speed = 0;
  }
  D.world._trackMarks?.reset?.();
  return true;
}

async function bootPage(browser, baseUrl, device) {
  const page = await browser.newPage();
  const errors = [];
  const d = DEVICES[device];
  await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch });
  await page.evaluateOnNewDocument((spec, preset) => {
    try {
      localStorage.setItem(spec.storageKey, spec.playerSpecId);
      if (preset) localStorage.setItem('cot.gfxPreset', preset);
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
    } catch { /* the boot checks below fail loudly */ }
  }, PINNED_SCENE, d.preset);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon') && !text.startsWith('Failed to load resource')) errors.push(text.slice(0, 300));
  });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?nosplash=1&${d.query}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  return { page, errors, stage: null };
}

async function stageMap(entry, mapId) {
  const { page } = entry;
  await page.bringToFront();
  await page.waitForFunction('window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG', { timeout: 900000, polling: 1000 });
  await page.evaluate(configurePinnedScene, PINNED_SCENE);
  await page.evaluate((name) => window.__SHOTS.set(name), censusShotView(mapId));
  await page.evaluate(settleMapTextures, { mapId, timeoutMs: 600000 });
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  const stage = await page.evaluate(pageStage);
  if (stage.mapId !== mapId) throw new Error(`staged ${stage.mapId}, expected ${mapId}`);
  entry.stage = stage;
  entry.mapId = mapId;
}

async function shootMap(entry, options, frames) {
  const { page, mapId, stage } = entry;
  await page.bringToFront();
  await page.evaluate(pageQuiet);
  await sleep(1500);
  // (the AFTER arm plans the poses and stores them; every other arm reuses them, so a pair shares its camera)
  let plan = options.posesStore[mapId];
  if (!plan) {
    plan = await page.evaluate(pagePlan, { targets: landmarkTargets(mapId, options.kinds), buildings: stage.buildings });
    options.posesStore[mapId] = plan;
    writeFileSync(options.posesFile, `${JSON.stringify(options.posesStore, null, 1)}\n`);
  }
  const receipt = { buildings: stage.buildings.length, targets: plan.targets, poses: {} };
  for (const name of options.poses) {
    const p = plan[name];
    if (!p) { receipt.poses[name] = { skipped: true }; continue; }
    const resolved = await page.evaluate(externalPoseScript({ ...p, fov: name === 'long' ? 50 : 60 }));
    await sleep(900);
    const settled = await page.waitForFunction(grassSettled, { timeout: 8000, polling: 250 }).then(() => true, () => false);
    await page.evaluate(pinClouds());
    // (48 frames: the long view of a big town under a loaded machine draws a few a second)
    const cloudsPinned = await page.waitForFunction(cloudsHeld, { timeout: 180_000, polling: 250 }).then(() => true, () => false);
    if (!cloudsPinned) {
      const left = await page.evaluate(() => window.__DEBUG.scene.userData.volumetricClouds?.__pin?.left ?? null);
      throw new Error(`${mapId} ${name}: the cloud layer did not hold within 180 s (${left} of ${CLOUD_FRAMES} frames left)`);
    }
    const file = path.join(frames, `${mapId}-${name}.png`);
    await page.screenshot({ path: file, type: 'png' });
    receipt.poses[name] = { ...p, resolved, grassSettled: settled, clouds: { timeS: CLOUD_TIME_S, frames: CLOUD_FRAMES }, file: path.basename(file) };
  }
  receipt.errors = entry.errors.splice(0);
  return receipt;
}

async function main(argv) {
  const options = parse(argv);
  for (const job of options.jobs) {
    job.frames = path.join(options.out, job.name, 'frames');
    mkdirSync(job.frames, { recursive: true });
    job.manifestFile = path.join(options.out, job.name, `manifest-${options.tag}.json`);
    job.manifest = existsSync(job.manifestFile) ? JSON.parse(readFileSync(job.manifestFile, 'utf8'))
      : { tool: TOOL, device: job.device, dist: job.dist, maps: {} };
  }
  options.posesStore = existsSync(options.poses) ? JSON.parse(readFileSync(options.poses, 'utf8')) : {};
  const order = [...new Set(options.jobs.flatMap((job) => job.maps))];
  const pairs = order.flatMap((mapId) => options.jobs.filter((job) => job.maps.includes(mapId) && !job.manifest.maps[mapId])
    .map((job) => ({ job, mapId })));
  if (!pairs.length) { console.log(`[${TOOL}] every pair is shot`); return 0; }
  const label = `${TOOL} ${path.basename(options.out)}`;
  setBrowserGuardContext({ hold: label });
  const lock = createCaptureLock();
  const servers = new Map();
  for (const dist of new Set(options.jobs.map((job) => job.dist))) {
    servers.set(dist, await startViteChild({ root: options.root, mode: 'preview', outDir: dist, port: 5600 + ((process.pid + servers.size * 7) % 300) }));
  }
  let browser = null, held = false, entry = null, session = null, pagesSinceLaunch = 0;
  const launch = () => launchGuardedBrowser(puppeteer, { ...mapProbeLaunchOptions({ width: 1920, height: 1080, protocolTimeout: 2700000 }), timeout: 180000 });
  const openPair = async ({ job, mapId }) => {
    browser ??= await launch();
    pagesSinceLaunch++;
    entry = await bootPage(browser, servers.get(job.dist).url, job.device);
    await stageMap(entry, mapId);
  };
  const close = async () => {
    if (held) lock.release();
    held = false;
    if (browser) await browser.close().catch(() => {});
    for (const server of servers.values()) await server.close().catch(() => {});
  };
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.once(signal, async () => { console.log(`[${label}] ${signal}: releasing and closing`); await close(); process.exit(143); });
  }
  let shot = 0, failed = 0;
  try {
    await lock.acquire(options.waitHours * 3600 * 1000, {
      lockClass: 'render', prepare: async () => { await openPair(pairs[0]); session = await freezePage(entry.page); },
    });
    held = true;
    for (let i = 0; i < pairs.length; i++) {
      const { job, mapId } = pairs[i];
      const started = Date.now();
      let outcome = 'failed';
      try {
        if (session) { await thawPage(entry.page, session); session = null; } else await openPair(pairs[i]);
        const shooting = (async () => {
          const live = await entry.page.evaluate(() => window.__DEBUG?.world?.mapId ?? null).catch(() => null);
          if (live !== mapId) await stageMap(entry, mapId);
          const receipt = await shootMap({ ...entry, mapId }, { poses: job.poses, posesStore: options.posesStore, posesFile: options.poses, kinds: options.kinds }, job.frames);
          receipt.ms = Date.now() - started;
          job.manifest.maps[mapId] = receipt;
          writeFileSync(job.manifestFile, `${JSON.stringify(job.manifest, null, 2)}\n`);
          return 'shot';
        })();
        shooting.catch(() => {});
        outcome = await Promise.race([shooting, sleep(options.pairMinutes * 60_000).then(() => 'timeout')]);
      } catch (error) {
        console.log(`[${label}] ${stamp()} ${job.name} ${mapId} failed: ${String(error?.message ?? error).slice(0, 200)}`);
      } finally {
        if (entry) await entry.page.close().catch(() => {});
        entry = null;
      }
      if (outcome === 'shot') {
        shot++;
        console.log(`[${label}] ${stamp()} ${job.name} ${mapId} staged and shot in ${((Date.now() - started) / 1000).toFixed(1)} s; ${shot}/${pairs.length}`);
      } else {
        failed++;
        console.log(`[${label}] ${stamp()} ${job.name} ${mapId} ${outcome}`);
      }
      if (pagesSinceLaunch >= 8 && browser) { await browser.close().catch(() => {}); browser = null; pagesSinceLaunch = 0; }
      if (i < pairs.length - 1) {
        const cp = await lock.checkpoint({ timeoutMs: options.waitHours * 3600 * 1000,
          beforeYield: async () => { held = false; }, afterResume: async () => { held = true; } });
        if (cp.yielded) console.log(`[${label}] ${stamp()} yielded at the cap, held again after ${(cp.waitedMs / 60000).toFixed(1)} min at the back`);
      }
    }
  } finally {
    await close();
  }
  console.log(`[${label}] ${shot} pair(s) shot, ${failed} failed`);
  return failed ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
