// tools/built-env-shots.mjs — every map's built environment at the battle camera, staged identically on every build
// (item built-env-270, the owner 2026-11-05: "update roads, beach areas annd areas around water, paths, sidewalks, alleys,
// courtyards, plazas, squares, alleys, anyu built enviornmennt have to be fully updated"). The census and the A/B.
//
//   node tools/built-env-shots.mjs --out=<dir> --jobs=<jobs.json> [--root=<checkout>] [--tag=v1] [--wait-hours=16]
//        [--pair-minutes=10]
//
// jobs.json: [{ "name": "before-desktop", "dist": "<built dist>", "device": "desktop" | "phone",
//               "maps": ["urban", ...], "poses": ["street", ...], "posesByMap": { "urban": ["shore"] },
//               "customByMap": { "autumn": [{ "name": "place", "cam": [x, eyeOverGround, z], "at": [x, yOverGround, z],
//               "fov": 60 }] } }, ...]
// (built-env-270b) a custom pose is fixed in the world (its heights over the ground there), framed on every build alike:
// a round's own targets (a square, an approach, a bank), chosen to keep treeline skylines out of the frame's middle.
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
// The clouds (Main 11-06, buildings-270's pin 02d7f7856f / 7c8ed1a62f: both arms of a pair at one cloud time): every
// pose's frame is taken with the cloud layer at CLOUD_TIME_S of scene time (volumetricClouds.setCaptureTime, a fresh trace
// sequence and history), its drift held there (each frame's dt 0) for CLOUD_FRAMES frames, then the trace and resolve
// held, so two builds draw one sky; each pose's receipt records the pin.
import { launchGuardedBrowser, setBrowserGuardContext } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { startViteChild } from './capture-hold.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { isMainModule, mapProbeLaunchOptions, resolveGroundPose, sleep } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { censusShotView } from './visual-census.mjs';
import { grassSettled } from './frame-budget-probe.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { civicPavedRooms } from '../src/world/civic/plans/index.ts';
import { builtEnvironmentFor } from '../src/world/maps/builtEnvironmentTable.ts';

const TOOL = 'built-env-shots';
const DEVICES = Object.freeze({
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, query: 'tier=desktop', preset: 'high' },
  phone: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, query: 'tier=mobile', preset: null },
});
const POSES = Object.freeze(['street', 'road', 'plaza', 'shore', 'long']);
const EYE = 3.4;
const MAPS_PER_PAGE = 4;

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
    for (const [id, list] of Object.entries(job.customByMap ?? {})) {
      if (!job.maps.includes(id)) throw new Error(`${job.name}: custom poses for ${id}, which the job does not shoot`);
      for (const c of list) {
        if (!/^[a-z0-9-]+$/.test(c.name) || POSES.includes(c.name)) throw new Error(`${job.name}: custom pose name ${c.name}`);
        if (c.cam?.length !== 3 || c.at?.length !== 3) throw new Error(`${job.name}: ${id}-${c.name} needs cam and at [x, y, z]`);
      }
    }
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
        // (ground-269's 5e5dae8462: the near blades swayed between two base frames) the grass's wind held with the sky
        window.__DEBUG.world?._tallGrass?.setWindTime?.(0);
        live(renderer, camera, 0, ...rest);
        if (pin.left > 0 && --pin.left === 0) vc.frozen = true;
      };
    }
    vc.frozen = false;
    // (ground-269's e8d1e00cd7: the grass's pressure field springs back from the staging drive for a minute) cleared at
    // each pin, so the standing hulls stamp the same field in every arm
    const grass = window.__DEBUG.world?._tallGrass;
    if (!${release}) { grass?.pressure?.clear(); grass?.pressureFine?.clear(); }
    if (${release}) { vc.__pin.held = false; return true; }
    vc.setCaptureTime(${CLOUD_TIME_S}, true);
    Object.assign(vc.__pin, { held: true, left: ${CLOUD_FRAMES} });
    return false;
  })()`;
}

/** The world's clocks held for the frame (DECISIONS 2026-11-06, the A/A amendment: the base shot twice agrees inside the
 *  lane's mask; the near grass's sway, the strand's swash and the water's waves run on their own time uniforms, which the
 *  cloud pin leaves running — coastal's first A/A differed in 14 % of the frame, all of it the near grass): every material
 *  uniform whose name ends in "Time" and holds a number reads WORLD_TIME_S, whatever the frame loop writes (page side). */
const WORLD_TIME_S = 12.5;
function pinWorldTime(t) {
  const D = window.__DEBUG, props = D.renderer.properties;
  let n = 0;
  D.scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      const uniforms = props.get(m)?.uniforms ?? m.uniforms;
      if (!uniforms) continue;
      for (const [name, u] of Object.entries(uniforms)) {
        if (!/Time$/.test(name) || !u || u.__timePinned || typeof u.value !== 'number') continue;
        Object.defineProperty(u, 'value', { get: () => t, set: () => {}, configurable: true });
        u.__timePinned = true;
        n++;
      }
    }
  });
  return n;
}

/** The grass and the ground litter with no cell left to build near the camera (page side; ground-269's groundSettled). */
function groundSettled() {
  const W = window.__DEBUG.world, g = W?._tallGrass?.getState?.(), l = W?._litter?.getState?.();
  // (ground-269's f26a717570: the arm shot first drew fewer near blades) the mid ring too, and the rings' published counts
  // unchanged for 1.5 s; (its 56f6aa65d7: at load 200 frames came a second apart, so 1.5 s held no update at all) and over
  // 30 rendered frames
  if (!window.__gsFrames) {
    window.__gsFrames = { n: 0 };
    const tick = () => { window.__gsFrames.n++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  // (ab6's phone A/A: the tall grass is off on the mobile tier, and the vegetation's grass carpet was still publishing
  // cells between two base boots — 1.4 % of saltwind's street moved, all of it blades) the carpet idle and unchanged too
  const v = W?.getGrassWorkState?.();
  const idle = (!g || !g.enabled || (!g.near.pending && !g.mid.pending && !g.far.pending)) && (!l || !l.pending)
    && (!v || (!v.pendingVisible && !v.active && !v.carpet?.pending));
  const sig = (g ? [g.near, g.mid, g.far].map((r) => `${r.count}/${r.publishes}`).join() : '')
    + (v ? `|${v.built}/${v.carpet?.publishedGeneration ?? 0}` : '');
  const now = performance.now(), frame = window.__gsFrames.n, last = window.__gsSettle;
  const same = last && last.sig === sig;
  window.__gsSettle = { sig, since: same ? last.since : now, sinceFrame: same ? last.sinceFrame : frame };
  return idle && now - window.__gsSettle.since > 1500 && frame - window.__gsSettle.sinceFrame >= 30;
}

/** Holds the grass rings and the ground litter as published (page side; ground-269's pageFreezeGround): `on` from the
 *  settle to the screenshot, so the 48 held cloud frames stream no blades in. Returns the grass's ring counts. */
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
  return `${s ? [s.near, s.mid, s.far].map((r) => `${r.count}/${r.publishes}`).join() : '-'}|${v ? `${v.built}/${v.carpet?.publishedGeneration ?? 0}` : '-'}`;
}

/** The pinned layer held (its frames traced), or no layer. */
function cloudsHeld() {
  const vc = window.__DEBUG.scene.userData.volumetricClouds;
  return !vc || vc.frozen === true;
}

/** A pose whose y values are heights over the ground (`resolved`: absolute). */
function externalPoseScript(pose) {
  return `(() => {
    const resolveGroundPose = ${resolveGroundPose.toString()};
    const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
    const resolved = ${pose.resolved ? JSON.stringify({ cam: pose.cam, at: pose.at, fov: pose.fov })
    : `resolveGroundPose(${JSON.stringify({ cam: pose.cam, at: pose.at })}, (x, z) => hf.getHeightAt(x, z), 511, ${pose.fov})`};
    D.rig.setExternalPose(new V(...resolved.cam), new V(...resolved.at), resolved.fov);
    ${pinClouds(true)};
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

/**
 * (built-env-270b, Main 11-08: "a per-frame dark-band check ... so a vote can't pass a black street again") the frame's
 * street points (page side): a grid of screen points marched to the ground, kept where the ground is a road's core
 * (within 3 m of a centreline) or a row's open ground; each { u, v } in 0..1 of the frame. Both arms of a pair share the
 * terrain, so a pair's points agree; tools/built-env-darkband.py reads them.
 */
function pageStreetSamples({ cols, rows, grounds }) {
  const D = window.__DEBUG, hf = D.world.heightField, cam = D.camera, V = cam.position.constructor;
  cam.updateMatrixWorld(); cam.updateProjectionMatrix?.();
  const inGround = (x, z) => grounds.some((g) => {
    const yaw = (g.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw), dx = x - g.x, dz = z - g.z;
    return Math.abs(dx * c - dz * s) < g.hw - 0.5 && Math.abs(dx * s + dz * c) < g.hl - 0.5;
  });
  const out = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
    const o = cam.position.clone(), d = new V(u * 2 - 1, 1 - v * 2, 0.5).unproject(cam).sub(o).normalize();
    if (d.y >= -0.01) continue;
    // march to the ground: 0.5 m steps out to 400 m, then a bisection
    let t0 = 0, t1 = -1;
    for (let t = 0.5; t < 400; t += 0.5) { const p = o.clone().addScaledVector(d, t); if (p.y <= hf.getHeightAt(p.x, p.z)) { t1 = t; break; } t0 = t; }
    if (t1 < 0) continue;
    for (let k = 0; k < 12; k++) { const tm = (t0 + t1) / 2, p = o.clone().addScaledVector(d, tm); if (p.y <= hf.getHeightAt(p.x, p.z)) t1 = tm; else t0 = tm; }
    const p = o.clone().addScaledVector(d, t1);
    if ((hf.getWaterMaskAt?.(p.x, p.z) ?? 0) > 0.5) continue;
    const core = hf._roadDist(p.x, p.z) < 3.0, ground = inGround(p.x, p.z);
    if (core || ground) out.push({ u: +u.toFixed(4), v: +v.toFixed(4), road: core, ground, m: +t1.toFixed(1) });
  }
  return out;
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
  for (const c of options.custom ?? []) poses.push({ name: c.name, at: { x: c.cam[0], z: c.cam[2] }, pose: { cam: c.cam, at: c.at, fov: c.fov ?? 60 } });
  for (const pose of poses) {
    const resolved = await page.evaluate(externalPoseScript(pose.pose));
    await sleep(900);
    // (ab6, Saltmere's A/A: a pair's first page, thawed from the queue, framed its near grass still streaming in — 14 % of
    // the frame differed from the settled twin) the grass settled or the pose fails, to be shot again
    const settled = await page.waitForFunction(grassSettled, { timeout: 60_000, polling: 250 }).then(() => true, () => false);
    await page.evaluate(() => { window.__gsSettle = null; });
    const streamed = settled && await page.waitForFunction(groundSettled, { timeout: 90_000, polling: 250 }).then(() => true, () => false);
    if (!streamed) throw new Error(`${mapId} ${pose.name}: the grass or the ground litter did not settle within 90 s`);
    const grass = await page.evaluate(pageFreezeGround, true);
    const timesPinned = await page.evaluate(pinWorldTime, WORLD_TIME_S);
    await page.evaluate(pinClouds());
    // (48 frames: the long view of a big town under a loaded machine draws a few a second)
    const cloudsPinned = await page.waitForFunction(cloudsHeld, { timeout: 180_000, polling: 250 }).then(() => true, () => false);
    if (!cloudsPinned) {
      const left = await page.evaluate(() => window.__DEBUG.scene.userData.volumetricClouds?.__pin?.left ?? null);
      throw new Error(`${mapId} ${pose.name}: the cloud layer did not hold within 180 s (${left} of ${CLOUD_FRAMES} frames left)`);
    }
    const file = path.join(frames, `${mapId}-${pose.name}.png`);
    await page.screenshot({ path: file, type: 'png' });
    const streetSamples = await page.evaluate(pageStreetSamples, { cols: 96, rows: 54, grounds: builtEnvironmentFor(mapId)?.roads.ground ?? [] });
    const grassShot = await page.evaluate(pageFreezeGround, false);
    receipt.poses[pose.name] = { resolved, at: pose.at, grassSettled: settled, grass: { settled: grass, shot: grassShot }, clouds: { timeS: CLOUD_TIME_S, frames: CLOUD_FRAMES },
      worldTime: { timeS: WORLD_TIME_S, uniformsPinned: timesPinned },
      streetSamples, file: path.basename(file) };
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
  // (Main 11-06: booting the game, not the shots, ate the holds) job by job, so one booted page stages its job's maps in
  // turn (MAPS_PER_PAGE at most, then a fresh page); the pins hold both arms of a pair to one sky and one world time
  const order = [...new Set(options.jobs.flatMap((job) => job.maps))];
  const pairs = options.jobs.flatMap((job) => order.filter((mapId) => job.maps.includes(mapId) && !job.manifest.maps[mapId])
    .map((mapId) => ({ job, mapId })));
  if (!pairs.length) { console.log(`[${TOOL}] every pair is shot`); return 0; }
  const label = `${TOOL} ${path.basename(options.out)}`;
  setBrowserGuardContext({ hold: label });
  const lock = createCaptureLock();
  const servers = new Map();
  for (const dist of new Set(options.jobs.map((job) => job.dist))) {
    servers.set(dist, await startViteChild({ root: options.root, mode: 'preview', outDir: dist, port: 5600 + ((process.pid + servers.size * 7) % 300) }));
  }
  let browser = null, held = false, entry = null, pagesSinceLaunch = 0;
  const launch = () => launchGuardedBrowser(puppeteer, { ...mapProbeLaunchOptions({ width: 1920, height: 1080, protocolTimeout: 2700000 }), timeout: 180000 });
  const dropBrowser = async () => { if (browser) await browser.close().catch(() => {}); browser = null; pagesSinceLaunch = 0; };
  const openPair = async ({ job, mapId }) => {
    if (browser && !browser.connected) await dropBrowser();
    browser ??= await launch();
    pagesSinceLaunch++;
    entry = await bootPage(browser, servers.get(job.dist).url, job.device);
    entry.job = job;
    entry.staged = 0;
    await stageMap(entry, mapId);
  };
  const close = async () => {
    // the browser goes before the capture lock (capture-hold-census: the next holder's GPU work would overlap it)
    if (browser) await browser.close().catch(() => {});
    if (held) lock.release();
    held = false;
    for (const server of servers.values()) await server.close().catch(() => {});
  };
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.once(signal, async () => { console.log(`[${label}] ${signal}: releasing and closing`); await close(); process.exit(143); });
  }
  let shot = 0, failed = 0;
  try {
    await lock.acquire(options.waitHours * 3600 * 1000, {
      // (ab6: a page warmed and frozen while queued never settled its grass after the thaw — the hold's first pair timed
      // out three runs running) no warm page: the first pair boots inside the hold
      lockClass: 'render', place: `${TOOL}-${path.basename(options.out)}`,
    });
    held = true;
    for (let i = 0; i < pairs.length; i++) {
      const { job, mapId } = pairs[i];
      const started = Date.now();
      let outcome = 'failed';
      try {
        if (!entry) await openPair(pairs[i]);
        const shooting = (async () => {
          const live = await entry.page.evaluate(() => window.__DEBUG?.world?.mapId ?? null).catch(() => null);
          if (live !== mapId) await stageMap(entry, mapId);
          entry.staged++;
          const receipt = await shootMap({ ...entry, mapId }, { poses: job.posesByMap?.[mapId] ?? job.poses, custom: job.customByMap?.[mapId] }, job.frames);
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
        // (ab6: a browser that died while queued failed seven maps in one second, and its successor could not fetch
        // modules) a pair that does not shoot takes the browser down with it, and goes once more to the run's end
        if (outcome !== 'shot') {
          if (entry) await entry.page.close().catch(() => {});
          entry = null;
          await dropBrowser();
          if (!pairs[i].retried) pairs.push({ ...pairs[i], retried: true });
        }
        // the page goes on to the job's next map unless this pair failed, the job changes or the page has staged its share
        const keep = entry && pairs[i + 1]?.job === job && entry.staged < MAPS_PER_PAGE;
        if (!keep && entry) { await entry.page.close().catch(() => {}); entry = null; }
      }
      if (outcome === 'shot') {
        shot++;
        console.log(`[${label}] ${stamp()} ${job.name} ${mapId} staged and shot in ${((Date.now() - started) / 1000).toFixed(1)} s; ${shot}/${pairs.length}`);
      } else {
        failed++;
        console.log(`[${label}] ${stamp()} ${job.name} ${mapId} ${outcome}`);
      }
      if (!entry && pagesSinceLaunch >= 8) await dropBrowser();
      if (i < pairs.length - 1) {
        const cp = await lock.checkpoint({ timeoutMs: options.waitHours * 3600 * 1000,
          // (a page kept for the next map is closed while others hold: it draws nothing in their holds, and a frozen page
          // did not come back settled; the browser goes too — one left idle through an 84-min wait was dead at the resume)
          beforeYield: async () => { if (entry) { await entry.page.close().catch(() => {}); entry = null; } await dropBrowser(); held = false; },
          afterResume: async () => { held = true; } });
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
