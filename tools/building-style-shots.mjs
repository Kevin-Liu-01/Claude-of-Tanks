// tools/building-style-shots.mjs — every map's buildings at the battle camera, staged identically on every build
// (item buildings-270, the owner 2026-11-05: "update all of our buildings and structured to amke them look better and
// customize all buildings on maps to look more correct"). The census before the build and the A/B after it.
//
//   node tools/building-style-shots.mjs --out=<dir> --jobs=<jobs.json> [--root=<checkout>] [--tag=v1] [--wait-hours=16]
//        [--pair-minutes=10]
//
// jobs.json: [{ "name": "before-desktop", "dist": "<built dist>", "device": "desktop" | "phone",
//               "maps": ["urban", ...], "poses": ["chase", ...] }, ...]
//
// The harness is tools/ground-surface-shots.mjs's (item ground-269): one render-class ticket, the first (job, map) pair
// staged while it waits, every pair on its own page inside the hold, checkpoint() between pairs. Its poses, all on the
// map's two densest building clusters (the minimap's buildings, counted within 70 m):
//   chase   — the battle's chase eye (3.4 m over the ground, 7 m behind a standpoint) on open ground 36 m from the densest
//             cluster's centre, looking at it: the buildings 20–60 m off, as a driver sees a town;
//   chase2  — the same on the second cluster (at least 140 m from the first; the first again from another side when the
//             map has one cluster): where a kit repeats its houses, the two frames show it;
//   long    — 22 m over the ground 230 m from the densest cluster, looking at it: the town's silhouette and roofscape.
// Frames land in <out>/<job>/frames/<map>-<pose>.png and every map's receipt in <out>/<job>/manifest-<tag>.json (a run
// resumes). The poses depend only on the map's terrain and the minimap's building list, so a before/after pair frames
// the same place unless a footprint moved.
// The clouds (Main 11-06: both arms of a pair at one cloud time): every pose's frame is taken with the cloud layer at
// CLOUD_TIME_S of scene time (volumetricClouds.setCaptureTime, a fresh trace sequence and history), its drift held
// there (each frame's dt 0) for CLOUD_FRAMES frames, then the trace and resolve held, so two builds draw one sky.
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
import { MAP_IDS } from '../src/world/maps/mapIds.ts';

const TOOL = 'building-style-shots';
const DEVICES = Object.freeze({
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, query: 'tier=desktop', preset: 'high' },
  phone: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, query: 'tier=mobile', preset: null },
});
// (buildings-271) the street poses come only from a posesFrom manifest (tools/street-poses.mjs): the 12-15 m facade view
const POSES = Object.freeze(['chase', 'chase2', 'long', 'street1', 'street2', 'street3', 'street4', 'street5', 'street6']);

function parse(argv) {
  const out = { root: process.cwd(), out: null, jobs: null, waitHours: 16, tag: 'v1', pairMinutes: 10 };
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
    else throw new Error(`unknown flag --${key}`);
  }
  if (!out.out || !out.jobs) throw new Error('--out=<dir> and --jobs=<jobs.json> are required');
  out.jobs = JSON.parse(readFileSync(out.jobs, 'utf8'));
  for (const job of out.jobs) {
    job.dist = path.resolve(job.dist);
    job.poses ??= [...POSES];
    if (job.posesFrom) job.pinned = JSON.parse(readFileSync(path.resolve(job.posesFrom), 'utf8'));
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

/**
 * The map's two densest clusters and a standpoint on each (page side): a cluster's centre is the mean of the buildings
 * within 70 m of its densest building; a standpoint lies `range` metres from it on open ground (no building within 6 m of
 * it or of the eye 7 m behind it, dry, inside the square), the first heading of a 24-step fan whose ray from the eye
 * toward the centre's 3 m point meets a building 14–64 m out (the town's front, not a wall at the lens, not empty ground).
 */
function pagePlan({ buildings, range, longRange }) {
  const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
  const h = (x, z) => hf.getHeightAt(Math.max(-511, Math.min(511, x)), Math.max(-511, Math.min(511, z)));
  const B = buildings.map((b) => ({ x: b.x, z: b.z, r: Math.max(b.w, b.d) / 2 }));
  if (B.length < 3) return { clusters: [] };
  const around = (p) => B.filter((b) => Math.hypot(b.x - p.x, b.z - p.z) < 70);
  const ranked = B.map((b) => ({ b, n: around(b).length })).sort((a, b) => b.n - a.n || a.b.x - b.b.x || a.b.z - b.b.z);
  const centre = (b) => { const near = around(b); return { x: near.reduce((s, q) => s + q.x, 0) / near.length, z: near.reduce((s, q) => s + q.z, 0) / near.length, n: near.length }; };
  const first = centre(ranked[0].b);
  const secondSeed = ranked.find((r) => r.n >= 3 && Math.hypot(r.b.x - first.x, r.b.z - first.z) > 140);
  const second = secondSeed ? centre(secondSeed.b) : null;
  const stand = (c, dist, eyeUp, after) => {
    for (let k = 0; k < 24; k++) {
      const a = (((k + after) % 24) / 24) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      const px = c.x + sx * dist, pz = c.z + sz * dist;
      if (Math.max(Math.abs(px), Math.abs(pz)) > 480) continue;
      const ex = px + sx * 7, ez = pz + sz * 7;
      if ((hf.getWaterMaskAt?.(px, pz) ?? 0) > 0.02 || (hf.getWaterMaskAt?.(ex, ez) ?? 0) > 0.02) continue;
      if (B.some((b) => Math.hypot(b.x - px, b.z - pz) < b.r + 6 || Math.hypot(b.x - ex, b.z - ez) < b.r + 6)) continue;
      const ey = h(ex, ez) + eyeUp, ty = h(c.x, c.z) + 3;
      const dir = new V(c.x - ex, ty - ey, c.z - ez), len = dir.length();
      const hit = D.world.raycast?.(new V(ex, ey, ez), dir.normalize(), len);
      const d = hit?.dist ?? Infinity;
      if (eyeUp < 10 && !(d > 14 && d < 64)) continue;
      if (eyeUp >= 10 && d < dist * 0.6) continue;
      return { cam: [ex, ey, ez], at: [c.x, ty, c.z], heading: k, hitM: Number.isFinite(d) ? +d.toFixed(1) : null };
    }
    return null;
  };
  const clusters = [first, second].filter(Boolean);
  const chase = stand(first, range, 3.4, 0);
  const chase2 = second ? stand(second, range, 3.4, 0) : stand(first, range, 3.4, (chase?.heading ?? 0) + 8);
  const long = stand(first, longRange, 22, 0);
  return { clusters, chase, chase2, long };
}

/** The scene time the clouds are drawn at, and the frames traced there before the layer is held. */
const CLOUD_TIME_S = 0, CLOUD_FRAMES = 48;
// (ground-269's ab23, 5815c5b1bc: foundry at load 300 drew 36 of the 48 frames in 180 s) the hold's wait, longer where
// the machine is busy
const CLOUD_HOLD_S = Number(process.env.BUILDING_SHOTS_CLOUD_HOLD_S) || 180;
// the ground settle's wait (s): 90 by default; a loaded machine's desktop Autumn needed more (four of 24 frames shot unsettled)
const SETTLE_S = Number(process.env.BUILDING_SHOTS_SETTLE_S) || 90;

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
        // (ground-269's ab19 A/A: the near blades swayed between two base frames) the grass's wind held with the sky
        window.__DEBUG.world?._tallGrass?.setWindTime?.(0);
        live(renderer, camera, 0, ...rest);
        if (pin.left > 0 && --pin.left === 0) vc.frozen = true;
      };
    }
    vc.frozen = false;
    // (ground-269's ab20 A/A: 2.5 % of an urban chase frame, the near blades round the hull) the grass's pressure field
    // springs back from the staging drive for a minute; cleared at each pin, the standing hulls stamp the same field
    const grass = window.__DEBUG.world?._tallGrass;
    if (!${release}) { grass?.pressure?.clear(); grass?.pressureFine?.clear(); }
    if (${release}) { vc.__pin.held = false; return true; }
    vc.setCaptureTime(${CLOUD_TIME_S}, true);
    Object.assign(vc.__pin, { held: true, left: ${CLOUD_FRAMES} });
    return false;
  })()`;
}

/**
 * The grass rings (near, mid, far) and the ground litter built, and the rings' published counts unchanged for 1.5 s
 * (ground-269's ab21 A/A, f26a717570: the mid ring was not waited for, so the arm shot first drew fewer near blades) and
 * over 30 rendered frames (ground-269's ab22, 56f6aa65d7: at load 200 frames came a second apart, so 1.5 s held no update
 * at all and the sward kept filling after the check passed).
 */
function groundSettled() {
  const W = window.__DEBUG.world, g = W?._tallGrass?.getState?.(), l = W?._litter?.getState?.();
  if (!window.__gsFrames) {
    window.__gsFrames = { n: 0 };
    const tick = () => { window.__gsFrames.n++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  // (ground-269's ab22, 2c2d4bf757: the vegetation's grass carpet and chunks still filling, on phone with no tall grass)
  // no visible grass chunk unbuilt and the carpet idle; (27beaa0e2c, whiteout chase: a terrain level mounting between the
  // arms) the terrain stream's built count, all in the signature
  const v = W?.getGrassWorkState?.();
  const idle = (!g || !g.enabled || (!g.near.pending && !g.mid.pending && !g.far.pending)) && (!l || !l.pending)
    && (!v || (!v.pendingVisible && !v.carpet?.pending));
  const sig = (g ? [g.near, g.mid, g.far].map((r) => `${r.count}/${r.publishes}`).join() : '')
    + (v ? `|${v.built}/${v.carpet?.publishedGeneration}` : '') + `|${W?._buildDetail?.terrain?.streamedGeometryCount ?? ''}`;
  const now = performance.now(), frame = window.__gsFrames.n, last = window.__gsSettle;
  const same = last && last.sig === sig;
  window.__gsSettle = { sig, since: same ? last.since : now, sinceFrame: same ? last.sinceFrame : frame };
  return idle && now - window.__gsSettle.since > 1500 && frame - window.__gsSettle.sinceFrame >= 30;
}

/**
 * Holds the grass rings and the ground litter as published (page side), `on` from the settle to the screenshot: the cloud
 * pin takes minutes on a loaded machine and the streaming would go on filling the sward through it (ground-269,
 * 56f6aa65d7). Returns the rings', the vegetation grass's and the terrain stream's counts, which each arm records so the arms of a pose can be compared.
 */
function pageFreezeGround(on) {
  const W = window.__DEBUG.world, g = W?._tallGrass, l = W?._litter;
  if (g && !g.__gsHold) {
    const update = g.update;
    g.update = (dt, cam, focus, fwd, fill) => update.call(g, dt, cam, focus, fwd, window.__gsHold ? false : fill);
    g.__gsHold = true;
  }
  if (l && !l.__gsHold) {
    const update = l.update;
    l.update = (cam) => { if (!window.__gsHold) update.call(l, cam); };
    l.__gsHold = true;
  }
  window.__gsHold = on;
  const s = g?.getState?.(), v = W?.getGrassWorkState?.();
  return (s ? [s.near, s.mid, s.far].map((r) => `${r.count}/${r.publishes}`).join() : '')
    + (v ? `|${v.built}/${v.pendingVisible}/${v.carpet?.publishedGeneration}/${v.carpet?.pending}` : '')
    + `|${W?._buildDetail?.terrain?.streamedGeometryCount ?? ''}`;
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
    // (ground-269's ab22, 27beaa0e2c, whiteout chase: streaks near 200 m where one arm drew a chunk on its coarser level
    // while the stream built the finer one) every level this camera wants, built before the first update
    D.world.warmTerrainLookahead?.(D.camera.position, 512);
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
  const plan = await page.evaluate(pagePlan, { buildings: stage.buildings, range: 36, longRange: 230 });
  const receipt = { buildings: stage.buildings.length, clusters: plan.clusters, poses: {} };
  for (const name of options.poses) {
    // (buildings-271) a job's `posesFrom` manifest: the other arm's cameras, so a pair frames one place even where the arm's
    // own footprints moved its densest cluster (Amberford's square frontage moved the cluster 40 m: the pairs set a farmhouse
    // street against a market green, and the votes judged the framing)
    const pinned = options.pinned?.maps?.[mapId]?.poses?.[name];
    const p = pinned ? (pinned.skipped ? null : { cam: pinned.cam, at: pinned.at, heading: pinned.heading, hitM: pinned.hitM }) : plan[name];
    if (!p) { receipt.poses[name] = { skipped: true }; continue; }
    const resolved = await page.evaluate(externalPoseScript({ ...p, fov: name === 'long' ? 50 : 60 }));
    await sleep(900);
    await page.evaluate(() => { window.__gsSettle = null; });
    const settled = await page.waitForFunction(groundSettled, { timeout: SETTLE_S * 1000, polling: 250 }).then(() => true, () => false);
    const grassAtSettle = await page.evaluate(pageFreezeGround, true);
    await page.evaluate(pinClouds());
    // (48 frames: the long view of a big town under a loaded machine draws a few a second)
    const cloudsPinned = await page.waitForFunction(cloudsHeld, { timeout: CLOUD_HOLD_S * 1000, polling: 250 }).then(() => true, () => false);
    if (!cloudsPinned) {
      const left = await page.evaluate(() => window.__DEBUG.scene.userData.volumetricClouds?.__pin?.left ?? null);
      throw new Error(`${mapId} ${name}: the cloud layer did not hold within ${CLOUD_HOLD_S} s (${left} of ${CLOUD_FRAMES} frames left)`);
    }
    const file = path.join(frames, `${mapId}-${name}.png`);
    await page.screenshot({ path: file, type: 'png' });
    const grass = { settle: grassAtSettle, shot: await page.evaluate(pageFreezeGround, false) };
    receipt.poses[name] = { ...p, resolved, grassSettled: settled, grass, clouds: { timeS: CLOUD_TIME_S, frames: CLOUD_FRAMES }, file: path.basename(file) };
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
  const order = [...new Set(options.jobs.flatMap((job) => job.maps))];
  // (Main 11-06, ground-269's grass-order finding) the jobs run in turn on every other map, so no arm is always shot first
  const pairs = order.flatMap((mapId, i) => {
    const jobs = options.jobs.filter((job) => job.maps.includes(mapId) && !job.manifest.maps[mapId]);
    return (i % 2 ? jobs.reverse() : jobs).map((job) => ({ job, mapId }));
  });
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
          const receipt = await shootMap({ ...entry, mapId }, { poses: job.poses, pinned: job.pinned }, job.frames);
          if (job.pinned) receipt.posesFrom = job.posesFrom;
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
