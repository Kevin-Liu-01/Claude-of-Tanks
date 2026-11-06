// tools/built-env-shots.mjs — every map's built environment at the battle camera, staged identically on every build
// (item built-env-270, the owner 2026-11-05: "update roads, beach areas annd areas around water, paths, sidewalks, alleys,
// courtyards, plazas, squares, alleys, anyu built enviornmennt have to be fully updated"). The census and the A/B.
//
//   node tools/built-env-shots.mjs --out=<dir> --jobs=<jobs.json> [--root=<checkout>] [--tag=v1] [--wait-hours=16]
//        [--pair-minutes=10]
//
// jobs.json: [{ "name": "before-desktop", "dist": "<built dist>", "device": "desktop" | "phone",
//               "maps": ["urban", ...], "poses": ["street", ...], "posesByMap": { "urban": ["shore"] } }, ...]
//
// The harness is tools/ground-surface-shots.mjs's (item ground-269): one render-class ticket, the first (job, map) pair
// staged while it waits, every pair on its own page inside the hold, checkpoint() between pairs. Its poses, all at the
// chase eye (3.4 m over the ground) unless named:
//   street — 6–11 m off a road's centreline among the map's densest buildings (six or more within 70 m), looking 30 m
//            along the street: the carriageway, its kerb, the pavement and the frontage;
//   road   — 5–8 m off a road's centreline where the fewest buildings stand (none within 40 m), looking 40 m along it:
//            the country road, its edge and its verge;
//   plaza  — the largest civic paved room's (civic/plans) far corner, looking across it; else the open ground nearest
//            the densest cluster's centre, looking at it: the square or the yard between buildings;
//   shore  — dry ground 5–10 m from the water (the liquid mask), the most buildings within 90 m first (a quay or a
//            village front before a lonely bank), looking along the waterline 25° toward the water;
//   long   — 22 m over the ground 200 m back from the street point, looking at it: the street plan and the shore at range.
// A pose a map cannot take (no road, no water, no town) is left out and recorded. Frames land in
// <out>/<job>/frames/<map>-<pose>.png and every map's receipt in <out>/<job>/manifest-<tag>.json (a run resumes). The
// poses depend only on the terrain, the roads, the water and the minimap's buildings, so a before/after pair frames the
// same place unless one of those moved.
import { launchGuardedBrowser, setBrowserGuardContext } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { freezePage, startViteChild, thawPage } from './capture-hold.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { isMainModule, mapProbeLaunchOptions, resolveGroundPose, sleep } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { censusShotView } from './visual-census.mjs';
import { grassSettled } from './frame-budget-probe.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { civicPavedRooms } from '../src/world/civic/plans/index.ts';

const TOOL = 'built-env-shots';
const DEVICES = Object.freeze({
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, query: 'tier=desktop', preset: 'high' },
  phone: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, query: 'tier=mobile', preset: null },
});
const POSES = Object.freeze(['street', 'road', 'plaza', 'shore', 'long']);
const EYE = 3.4;

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
    // (built-env-270 ab3) a map may take its own poses (a re-shoot of the poses a fix changed)
    for (const list of Object.values(job.posesByMap ?? {})) for (const p of list) if (!POSES.includes(p)) throw new Error(`${job.name}: unknown pose ${p}`);
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

/** Every pose's ground point on this stage (page side): { street, road, plaza, shore } each { x, z, dx, dz } or null. */
function pagePlan({ buildings, rooms, eye: EYE }) {
  const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
  const rd = (x, z) => hf._roadDist(x, z), wet = (x, z) => hf.getWaterMaskAt?.(x, z) ?? 0, h = (x, z) => hf.getHeightAt(x, z);
  const B = buildings.map((b) => ({ x: b.x, z: b.z, r: Math.max(b.w, b.d) / 2 }));
  const near = (x, z, r) => B.reduce((n, b) => n + (Math.hypot(b.x - x, b.z - z) < r ? 1 : 0), 0);
  const clearOf = (x, z, m) => B.every((b) => Math.hypot(b.x - x, b.z - z) >= b.r + m);
  // an open view: five rays from the eye toward the ground 24 m out across ±20°, four of them clear for 18 m
  const open = (p, dx, dz) => {
    const y = h(p.x, p.z) + EYE;
    let ok = 0;
    for (const deg of [-20, -10, 0, 10, 20]) {
      const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      const vx = dx * c - dz * s, vz = dx * s + dz * c, tx = p.x + vx * 24, tz = p.z + vz * 24;
      const dir = new V(tx - p.x, h(tx, tz) - y, tz - p.z), len = dir.length();
      const hit = D.world.raycast?.(new V(p.x, y, p.z), dir.normalize(), len);
      if (!hit || !(hit.dist < 18)) ok++;
    }
    return ok >= 4;
  };
  const grad = (f, x, z) => {
    const e = 1.5, gx = f(x + e, z) - f(x - e, z), gz = f(x, z + e) - f(x, z - e), l = Math.hypot(gx, gz) || 1;
    return { gx: gx / l, gz: gz / l };
  };
  const along = (f, p, prefer) => {
    const { gx, gz } = grad(f, p.x, p.z);
    let dx = -gz, dz = gx;
    if (prefer && prefer(-dx, -dz) > prefer(dx, dz)) { dx = -dx; dz = -dz; }
    return { dx, dz, gx, gz };
  };
  const ahead = (p) => (sx, sz) => B.filter((b) => (b.x - p.x) * sx + (b.z - p.z) * sz > 0 && Math.hypot(b.x - p.x, b.z - p.z) < 70).length;
  const pick = (cands, dirOf) => {
    cands.sort((a, b) => b.score - a.score);
    for (const p of cands.slice(0, 80)) {
      const a = dirOf(p);
      if (open(p, a.dx, a.dz)) return { x: p.x, z: p.z, ...a, n: p.n };
    }
    return null;
  };
  const street = [], road = [], shore = [];
  for (let x = -444; x <= 444; x += 6) {
    for (let z = -444; z <= 444; z += 6) {
      if (wet(x, z) > 0.02) continue;
      const d0 = rd(x, z);
      if (d0 >= 6 && d0 <= 11 && clearOf(x, z, 4)) {
        const n = near(x, z, 70);
        if (n >= 6) street.push({ x, z, n, score: n });
      }
      if (d0 >= 5 && d0 <= 8 && near(x, z, 40) === 0) road.push({ x, z, n: 0, score: -near(x, z, 150) - Math.hypot(x, z) * 0.002 });
      // (ab2, Saltmere: the mask is flat 0 a metre round a dry point, so its gradient gave no heading) the water's side from
      // the eight 10 m probes, weighted by their wetness
      let w = 0, wx = 0, wz = 0;
      for (const [ox, oz] of [[10, 0], [-10, 0], [0, 10], [0, -10], [7, 7], [-7, 7], [7, -7], [-7, -7]]) {
        const m = wet(x + ox, z + oz);
        w = Math.max(w, m); wx += ox * m; wz += oz * m;
      }
      if (w > 0.5 && wet(x, z) < 0.01 && clearOf(x, z, 3) && Math.hypot(wx, wz) > 1e-6) {
        const n = near(x, z, 90), l = Math.hypot(wx, wz);
        shore.push({ x, z, n, gx: wx / l, gz: wz / l, score: n - Math.hypot(x, z) * 0.002 });
      }
    }
  }
  const out = {};
  out.street = pick(street, (p) => along(rd, p, ahead(p)));
  out.road = pick(road, (p) => along(rd, p, null));
  out.shore = pick(shore, (p) => {
    // along the waterline (across the water's side), toward more buildings, turned 25° toward the water
    let dx = -p.gz, dz = p.gx;
    const toward = ahead(p);
    if (toward(-dx, -dz) > toward(dx, dz)) { dx = -dx; dz = -dz; }
    const t = (25 * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    // the turn's sense: the one that brings the heading nearer the water's side
    const r1 = { dx: dx * c - dz * sn, dz: dx * sn + dz * c }, r2 = { dx: dx * c + dz * sn, dz: -dx * sn + dz * c };
    const r = r1.dx * p.gx + r1.dz * p.gz >= r2.dx * p.gx + r2.dz * p.gz ? r1 : r2;
    return { dx: r.dx, dz: r.dz, gx: p.gx, gz: p.gz };
  });
  // (ab1, Saltmere: a target over the water reads the sea bed's height and the eye looked straight down) the shore's eye
  // looks at the waterline's height from its own ground, not the bed's
  if (out.shore) out.shore.y0 = h(out.shore.x, out.shore.z);
  // the plaza: the largest paved room's far corner looking across it, else open ground by the densest cluster's centre
  const room = rooms.slice().sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
  if (room) {
    const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
    const corners = [[room.x0, room.z0], [room.x1, room.z0], [room.x0, room.z1], [room.x1, room.z1]]
      .map(([x, z]) => ({ x: x + (cx - x) * 0.15, z: z + (cz - z) * 0.15 }));
    for (const c of corners) {
      const l = Math.hypot(cx - c.x, cz - c.z) || 1;
      if (open(c, (cx - c.x) / l, (cz - c.z) / l)) { out.plaza = { x: c.x, z: c.z, dx: (cx - c.x) / l, dz: (cz - c.z) / l, room: true }; break; }
    }
  }
  if (!out.plaza && B.length >= 6) {
    let best = null;
    for (const b of B) { const n = near(b.x, b.z, 50); if (!best || n > best.n) best = { x: b.x, z: b.z, n }; }
    const ring = [];
    for (let r = 10; r <= 30; r += 4) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = best.x + Math.cos(a) * r, z = best.z + Math.sin(a) * r;
      if (wet(x, z) < 0.02 && clearOf(x, z, 3)) ring.push({ x, z, n: best.n, score: -r });
    }
    out.plaza = pick(ring, (p) => { const l = Math.hypot(best.x - p.x, best.z - p.z) || 1; return { dx: (best.x - p.x) / l, dz: (best.z - p.z) / l }; });
  }
  return out;
}

function stillClouds() {
  return `(() => {
    const D = window.__DEBUG, vc = D.scene.userData.volumetricClouds;
    if (vc) {
      for (const key of ['weatherShift', 'noiseShift', 'cirrusShift']) {
        const v = vc[key];
        if (v && typeof v.set === 'function') { if (v.isVector3) v.set(0, 0, 0); else v.set(0, 0); }
      }
      if (typeof vc.resetHistory === 'function') vc.resetHistory();
    }
  })()`;
}

/** A pose whose y values are heights over the ground (`resolved`: absolute). */
function externalPoseScript(pose) {
  return `(() => {
    const resolveGroundPose = ${resolveGroundPose.toString()};
    const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
    const resolved = ${pose.resolved ? JSON.stringify({ cam: pose.cam, at: pose.at, fov: pose.fov })
    : `resolveGroundPose(${JSON.stringify({ cam: pose.cam, at: pose.at })}, (x, z) => hf.getHeightAt(x, z), 511, ${pose.fov})`};
    D.rig.setExternalPose(new V(...resolved.cam), new V(...resolved.at), resolved.fov);
    ${stillClouds()};
    D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return resolved;
  })()`;
}

/** Every hull hidden, its AI and inputs frozen and the track prints cleared (page side). */
function pageQuietGround() {
  const D = window.__DEBUG;
  for (const e of D.game.tanks) {
    if (!e.isPlayer) e.aiCtl = null;
    if (e.input) { e.input.actionBits = 0; if ('throttle' in e.input) e.input.throttle = 0; if ('steer' in e.input) e.input.steer = 0; }
    if (e.state) e.state.speed = 0;
    const root = e.visual?.root;
    if (root) { root.visible = false; root.traverse((o) => o.layers.disableAll()); }
  }
  D.world._trackMarks?.reset?.();
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

function posesFor(plan, wanted) {
  const out = [];
  const eye = (p, run, fov = 60) => ({ cam: [p.x, EYE, p.z], at: [p.x + p.dx * run, 0.5, p.z + p.dz * run], fov });
  for (const name of wanted) {
    if (name === 'long') {
      const p = plan.street ?? plan.shore ?? plan.road;
      if (!p) continue;
      const bx = Math.max(-480, Math.min(480, p.x - p.dx * 200)), bz = Math.max(-480, Math.min(480, p.z - p.dz * 200));
      out.push({ name, at: p, pose: { cam: [bx, 22, bz], at: [p.x, 0, p.z], fov: 50 } });
    } else if (name === 'shore' && plan.shore) {
      const p = plan.shore;
      out.push({ name, at: p, pose: { cam: [p.x, p.y0 + EYE, p.z], at: [p.x + p.dx * 30, p.y0 - 0.8, p.z + p.dz * 30], fov: 60, resolved: true } });
    } else if (plan[name]) {
      const run = name === 'road' ? 40 : name === 'plaza' ? 24 : 30;
      out.push({ name, at: plan[name], pose: eye(plan[name], run) });
    }
  }
  return out;
}

async function shootMap(entry, options, frames) {
  const { page, mapId, stage } = entry;
  await page.bringToFront();
  await page.evaluate(pageQuietGround);
  await sleep(1500);
  const plan = await page.evaluate(pagePlan, { buildings: stage.buildings, rooms: civicPavedRooms(mapId), eye: EYE });
  const receipt = { plan, poses: {}, missing: [] };
  const poses = posesFor(plan, options.poses);
  receipt.missing = options.poses.filter((p) => !poses.some((q) => q.name === p));
  for (const pose of poses) {
    const resolved = await page.evaluate(externalPoseScript(pose.pose));
    await sleep(900);
    const settled = await page.waitForFunction(grassSettled, { timeout: 8000, polling: 250 }).then(() => true, () => false);
    await page.evaluate(stillClouds());
    await sleep(400);
    const file = path.join(frames, `${mapId}-${pose.name}.png`);
    await page.screenshot({ path: file, type: 'png' });
    receipt.poses[pose.name] = { resolved, at: pose.at, grassSettled: settled, file: path.basename(file) };
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
      lockClass: 'render', place: `${TOOL}-${path.basename(options.out)}`,
      prepare: async () => { await openPair(pairs[0]); session = await freezePage(entry.page); },
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
          const receipt = await shootMap({ ...entry, mapId }, { poses: job.posesByMap?.[mapId] ?? job.poses }, job.frames);
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
