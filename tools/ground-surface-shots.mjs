// tools/ground-surface-shots.mjs — the ground of every map at the gameplay camera, staged identically on every build
// (item ground-269, the owner 2026-11-04: "a lot of ground esp on city maps looks flat … our old texturing with black
// spaces is kind of goofy … update the ground detail and then specifically ground textures in all mapps").
//
//   node tools/ground-surface-shots.mjs --out=<dir> --jobs=<jobs.json> [--root=<checkout>] [--tag=v1] [--wait-hours=16]
//        [--pair-minutes=10] (a pair past it is abandoned; under heavy load a seven-pose pair with two variants needs ~25)
//
// jobs.json: [{ "name": "before-desktop", "dist": "<built dist>", "device": "desktop" | "phone",
//               "variants": ["base", "u:uName.x=0"], "maps": ["urban", ...], "poses": ["chase", ...] }, ...]
//
// The harness is tools/ground-banding-shots.mjs's (item 264): one render-class ticket, the first (job, map) pair staged
// while it waits, every pair on its own page inside the hold, checkpoint() between pairs. Its poses:
//   chase    — the battle's chase rig (cameraRig snapArcade, the 13 m orbit step) behind the staged hull: the ground 10–60 m
//              ahead, as the driver sees it;
//   near     — 1.9 m over the ground five metres ahead of the hull, looking 12 m on: the surface's close-range detail;
//   long     — 14 m over the hull, looking 380 m along its heading: the ground's macro variation at 100–600 m;
//   town     — 4 m over open ground among the map's densest buildings (no building within 7 m, six or more within 70 m),
//              looking 30 m on toward their centroid: the city ground the owner named. Maps without a town skip it;
//   townnear — the same point at 1.9 m, looking 6 m ahead: the city surface's close-range detail;
//   spot200 / spot600 — the readability pair: every other vehicle hidden, one ally hull shot from 200 m and 600 m at
//              3 m over the ground, the camera on a clear terrain sight line; each pose is shot with the hull and
//              without it (`-hull` / `-bare`), so the hull's silhouette and its contrast with the ground behind it are
//              measured from the pair (tools/ground-surface-metrics.py).
// Variants `u:<uniform>[.x|y|z|w]=<number>[,…]` set terrain-program uniforms through the renderer's own uniforms (the A/B for
// one term on one build), as in the banding tool. Frames land in <out>/<job>/frames/<map>-<pose>-<variant>.png and every
// map's receipt in <out>/<job>/manifest-<tag>.json (a run resumes).
import { launchGuardedBrowser, setBrowserGuardContext } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { freezePage, startViteChild, thawPage } from './capture-hold.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { isMainModule, mapProbeLaunchOptions, resolveGroundPose, sleep } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { decodePng } from './hud-ammo-frame-ink.mjs';
import { censusShotView } from './visual-census.mjs';
import { grassSettled } from './frame-budget-probe.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';

const TOOL = 'ground-surface-shots';
const DEVICES = Object.freeze({
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, query: 'tier=desktop', preset: 'high' },
  phone: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, query: 'tier=mobile', preset: null },
});
const POSES = Object.freeze(['chase', 'near', 'long', 'town', 'townnear', 'spot200', 'spot600']);

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
    job.variants ??= ['base'];
    job.poses ??= [...POSES];
    if (!DEVICES[job.device]) throw new Error(`${job.name}: unknown device ${job.device}`);
    for (const id of job.maps) if (!MAP_IDS.includes(id)) throw new Error(`${job.name}: unknown map ${id}`);
    for (const p of job.poses) if (!POSES.includes(p)) throw new Error(`${job.name}: unknown pose ${p}`);
    for (const v of job.variants) if (!parseVariant(v)) throw new Error(`${job.name}: unknown variant ${v}`);
    if (!existsSync(path.join(job.dist, 'index.html'))) throw new Error(`${job.dist} has no build`);
  }
  return out;
}

/** `u:name[.c]=v,…` as [[name, component | null, value], …]; null for any other variant. */
function uniformVariant(variant) {
  if (!variant.startsWith('u:')) return null;
  const sets = variant.slice(2).split(',').map((item) => /^(u[A-Za-z0-9]+)(?:\.([xyzw]))?=(-?[0-9.]+)$/.exec(item));
  return sets.every(Boolean) ? sets.map(([, name, c, v]) => [name, c ?? null, Number(v)]) : null;
}

/** A variant: `base`, or `;`-joined parts — `u:` uniform sets and `hide:<decal kind>[+<kind>]` (the props' ground decals by
 * their userData.terrainDecalKind: 'ground-contact', 'apron', 'crater', …); null when a part does not parse. */
function parseVariant(variant) {
  const out = { sets: [], hide: [] };
  if (variant === 'base') return out;
  for (const part of variant.split(';')) {
    if (part.startsWith('hide:')) {
      const kinds = part.slice(5).split('+').filter(Boolean);
      if (!kinds.length) return null;
      out.hide.push(...kinds);
    } else {
      const sets = uniformVariant(part);
      if (!sets) return null;
      out.sets.push(...sets);
    }
  }
  return out;
}

function stamp() { return new Date().toISOString().slice(11, 19); }

/** The staged battlefield: the hull, its heading, the buildings and the allied hulls (page side). */
function pageStage() {
  const D = window.__DEBUG, player = D.game.player, world = D.world, f = world.getMinimapFeatures();
  const team = player?.team;
  return {
    mapId: world?.mapId ?? null,
    player: player?.state ? { x: player.state.pos.x, z: player.state.pos.z, yaw: player.state.yaw } : null,
    buildings: f.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w || 0, d: b.d || 0 })),
    // (the readability pair's hull: an ally — an enemy's root stays hidden until it is spotted, whatever a probe sets)
    allies: D.game.tanks.filter((e) => !e.isPlayer && e.team === team && e.state)
      .map((e) => ({ id: e.id, specId: e.specId, x: e.state.pos.x, y: e.state.pos.y, z: e.state.pos.z })),
  };
}

/** A street-side point among the map's densest buildings, looking along the street (null on a map without a town).
 * The point stands 6–11 m off a road's centreline (the kerb, the pavement and the yards beside it), clear of every
 * building by 4 m, with six or more buildings within 70 m; the view runs along the road (the distance field's
 * gradient turned a right angle), so the street, its edge and the town floor share the frame and no yard tree fills it. */
function pageTownPoint({ player, buildings }) {
  const hf = window.__DEBUG.world.heightField, rd = (x, z) => hf._roadDist(x, z);
  const B = buildings.map((b) => ({ x: b.x, z: b.z, r: Math.max(b.w, b.d) / 2 }));
  if (B.length < 6) return null;
  const cands = [];
  for (let x = -444; x <= 444; x += 6) {
    for (let z = -444; z <= 444; z += 6) {
      const d0 = rd(x, z);
      if (d0 < 6 || d0 > 11) continue;
      let n = 0, clear = true;
      for (const b of B) {
        const d = Math.hypot(b.x - x, b.z - z);
        if (d < b.r + 4) { clear = false; break; }
        if (d < 70) n++;
      }
      if (!clear || n < 6) continue;
      const score = n - Math.hypot(x - player.x, z - player.z) * 0.002;
      cands.push({ x, z, n, score });
    }
  }
  // (ab2, Ruinspires: a scaffold on the pavement filled the frame) the best-scored point whose view along its street is
  // open: five rays from the 4 m eye toward the ground 24 m out across ±20°, at least four of them clear for 20 m
  const D = window.__DEBUG, V = D.camera.position.constructor, h = (x, z) => hf.getHeightAt(x, z);
  const along = (p) => {
    const e = 1.5, gx = rd(p.x + e, p.z) - rd(p.x - e, p.z), gz = rd(p.x, p.z + e) - rd(p.x, p.z - e);
    const gl = Math.hypot(gx, gz) || 1;
    // along the road: the gradient turned a right angle, toward the side with more buildings ahead
    let dx = -gz / gl, dz = gx / gl;
    const ahead = (sx, sz) => B.filter((b) => (b.x - p.x) * sx + (b.z - p.z) * sz > 0 && Math.hypot(b.x - p.x, b.z - p.z) < 70).length;
    if (ahead(-dx, -dz) > ahead(dx, dz)) { dx = -dx; dz = -dz; }
    return { dx, dz, gx: gx / gl, gz: gz / gl };
  };
  const open = (p, a) => {
    const y = h(p.x, p.z) + 4;
    let ok = 0;
    for (const deg of [-20, -10, 0, 10, 20]) {
      const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      const vx = a.dx * c - a.dz * sn, vz = a.dx * sn + a.dz * c;
      const tx = p.x + vx * 24, tz = p.z + vz * 24, ty = h(tx, tz);
      const dir = new V(tx - p.x, ty - y, tz - p.z), len = dir.length();
      const hit = D.world.raycast?.(new V(p.x, y, p.z), dir.normalize(), len);
      if (!hit || !(hit.dist < 20)) ok++;
    }
    return ok >= 4;
  };
  cands.sort((a, b) => b.score - a.score);
  for (const p of cands.slice(0, 80)) {
    const a = along(p);
    if (open(p, a)) return { ...p, ...a, back: 0 };
  }
  return null;
}

/** An open-ground point beside the hull: 6–16 m to a side, off the road and clear of buildings (null when none). */
function pageNearPoint({ player, buildings }) {
  const hf = window.__DEBUG.world.heightField;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), sx = fz, sz = -fx;
  for (const side of [10, -10, 16, -16, 6, -6, 22, -22]) {
    for (const ahead of [4, 12, -6]) {
      const x = player.x + sx * side + fx * ahead, z = player.z + sz * side + fz * ahead;
      if (hf._roadDist(x, z) < 9 || (hf.getWaterMaskAt?.(x, z) ?? 0) > 0.02) continue;
      if (buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 8 + Math.max(b.w, b.d) / 2)) continue;
      return { x, z, fx, fz };
    }
  }
  return null;
}

/** The readability camera: `range` metres from the hull, on a terrain sight line (3 m over the ground at 200 m, 5 m at
 * 600 m, where a 3 m eye over rolling ground rarely sees a hull's whole height), the first heading in the fan that holds
 * one, starting from the map's centre side. The camera may stand past the square on the ring. */
function pageSpotPose({ hull, range, after = -1 }) {
  const hf = window.__DEBUG.world.heightField, h = (x, z) => hf.getHeightAt(Math.max(-511, Math.min(511, x)), Math.max(-511, Math.min(511, z)));
  const base = Math.atan2(-hull.x, -hull.z);
  const ty = h(hull.x, hull.z) + 1.2, eye = range > 300 ? 5 : 3;
  const fan = [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150, 180];
  for (let index = after + 1; index < fan.length; index++) {
    const off = fan[index], a = base + (off * Math.PI) / 180, cx = hull.x + Math.sin(a) * range, cz = hull.z + Math.cos(a) * range;
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 505) continue;
    const cy = h(cx, cz) + eye;
    let clear = true;
    for (let i = 2; i < 80 && clear; i++) {
      const t = i / 80, x = cx + (hull.x - cx) * t, z = cz + (hull.z - cz) * t, y = cy + (ty - cy) * t;
      if (h(x, z) > y - 0.2) clear = false;
    }
    if (clear) {
      // (abfull, Suzhou Creek: a ruined wall hid the hull at 200 m) the props too: a world ray from the eye toward the
      // hull's middle reaches within 6 m of it
      const D = window.__DEBUG, V = D.camera.position.constructor;
      const dir = new V(hull.x - cx, ty - cy, hull.z - cz), len = dir.length();
      const hit = D.world.raycast?.(new V(cx, cy, cz), dir.normalize(), len);
      if (hit && hit.dist < len - 6) continue;
      return { cam: [cx, cy, cz], at: [hull.x, ty, hull.z], offDeg: off, range, index };
    }
  }
  return null;
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

/** An absolute pose (`resolved: true` keeps the y values as given; otherwise they are heights over the ground). */
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

function chasePoseScript(yaw) {
  return `(() => {
    const D = window.__DEBUG, V = D.camera.position.constructor;
    D.rig.snapArcade(2, ${yaw}, -0.10);
    ${stillClouds()};
    D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
    D.lighting.updateFrustums();
    D.lighting.update(true);
    return { cam: D.camera.position.toArray(), dir: D.camera.getWorldDirection(new V()).toArray(), fov: D.camera.fov };
  })()`;
}

/** Every vehicle hidden but `keepId` (null hides them all); `show` false hides that one too. */
function pageVehicles({ keepId, show }) {
  let hidden = 0;
  for (const e of window.__DEBUG.game.tanks) {
    const root = e.visual?.root;
    if (!root) continue;
    const on = e.id === keepId && show;
    root.visible = on;
    root.traverse((o) => { if (on) o.layers.enableAll(); else o.layers.disableAll(); });
    if (!on && root.userData) delete root.userData.nearShadowDetail;
    if (!on) hidden++;
  }
  return hidden;
}

/** The props' ground decals of `kinds` hidden (an empty list shows every decal this page hid again). */
function pageHideDecals(kinds) {
  let n = 0;
  window.__DEBUG.scene.traverse((o) => {
    const kind = o.userData?.terrainDecalKind;
    if (!kind) return;
    if (o.userData.__gsVisible === undefined) o.userData.__gsVisible = o.visible;
    o.visible = kinds.includes(kind) ? false : o.userData.__gsVisible;
    if (kinds.includes(kind)) n++;
  });
  return n;
}

/** Terrain-program uniforms on every material that has them; null restores every uniform this page set. */
function pageSetUniforms(sets) {
  const D = window.__DEBUG, props = D.renderer.properties;
  let n = 0;
  D.scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      const uniforms = props.get(m)?.uniforms;
      if (!uniforms) continue;
      for (const u of Object.values(uniforms)) {
        if (!u?.__base) continue;
        for (const [key, base] of Object.entries(u.__base)) { if (key === '_') u.value = base; else u.value[key] = base; }
        delete u.__base;
      }
      let hit = false;
      for (const [name, c, v] of sets ?? []) {
        const u = uniforms[name];
        if (!u) continue;
        u.__base ??= {};
        if (c) { u.__base[c] ??= u.value[c]; u.value[c] = v; } else { u.__base._ ??= u.value; u.value = v; }
        hit = true;
      }
      if (hit) n++;
    }
  });
  return n;
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

/** The pose list on this stage (each { name, kind, pose | null }); a pose a map cannot take is left out. */
async function planPoses(page, stage, wanted) {
  const { player } = stage;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  const out = [];
  const town = wanted.some((p) => p.startsWith('town')) ? await page.evaluate(pageTownPoint, { player, buildings: stage.buildings }) : null;
  const nearPt = wanted.includes('near') ? await page.evaluate(pageNearPoint, { player, buildings: stage.buildings }) : null;
  // the ally nearest the map's centre (the most open ground round it), the same hull on every build of a pair
  const ally = stage.allies.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || String(a.id).localeCompare(String(b.id)))[0] ?? null;
  for (const name of wanted) {
    if (name === 'chase') out.push({ name, kind: 'chase' });
    else if (name === 'near' && nearPt) {
      out.push({ name, kind: 'ext', pose: { cam: [nearPt.x, 1.9, nearPt.z], at: [nearPt.x + fx * 10, 0, nearPt.z + fz * 10], fov: 60 } });
    } else if (name === 'long') {
      const tx = Math.max(-470, Math.min(470, player.x + fx * 380)), tz = Math.max(-470, Math.min(470, player.z + fz * 380));
      out.push({ name, kind: 'ext', pose: { cam: [player.x, 14, player.z], at: [tx, 0, tz], fov: 50 } });
    } else if (name === 'town' && town) {
      out.push({ name, kind: 'ext', town, pose: { cam: [town.x, 4, town.z], at: [town.x + town.dx * 34, 0.5, town.z + town.dz * 34], fov: 60 } });
    } else if (name === 'townnear' && town) {
      // across the street's edge: half along the road, half toward the town floor (away from the centreline)
      const vx = town.dx * 0.7 + town.gx * 0.7, vz = town.dz * 0.7 + town.gz * 0.7;
      out.push({ name, kind: 'ext', town, pose: { cam: [town.x, 1.9, town.z], at: [town.x + vx * 8, 0, town.z + vz * 8], fov: 60 } });
    } else if ((name === 'spot200' || name === 'spot600') && ally) {
      const range = name === 'spot200' ? 200 : 600;
      const spot = await page.evaluate(pageSpotPose, { hull: ally, range });
      if (spot) out.push({ name, kind: 'spot', hull: ally, range, index: spot.index, pose: { cam: spot.cam, at: spot.at, fov: 55, resolved: true }, offDeg: spot.offDeg });
    }
  }
  return out;
}

/** The spot pose's hull seen on pixels: shown and hidden in a window round the frame's centre (±160 px at 200 m, ±70 px
 * at 600 m), at least 80 / 12 pixels in the blob nearest the centre whose
 * luminance differs by more than 12/255 (what sways between two bare frames left out); otherwise the fan's next clear heading,
 * six tried at most (ab7, Steinburg: a wood hid the hull at 600 m, and trees are not in world.raycast). Mutates `pose`. */
/** Pixels of the shown/hidden difference's 8-connected blob nearest the window's centre (within 12 px + 8 % of the
 * window): a cloud that drifts between the two frames is a blob of its own, away from the centre (ab7, Ruinspires). */
function centreBlobPixels(a, b, b2, lum) {
  const w = a.width, h = a.height, on = new Uint8Array(w * h), seen = new Uint8Array(w * h), sway = new Uint8Array(w * h);
  // (ab7, Railyard: at 200 m the hull stood behind the crest and the grass's sway between the two frames made a 21 000 px
  // "hull") what moves between two bare frames, and 2 px round it, is the wind's, not the hull's
  for (let i = 0; i < w * h; i++) {
    if (Math.abs(lum(b.data, i * 4) - lum(b2.data, i * 4)) <= 6) continue;
    const x = i % w, y = (i - x) / w;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) sway[ny * w + nx] = 1;
    }
  }
  for (let i = 0; i < w * h; i++) on[i] = !sway[i] && Math.abs(lum(a.data, i * 4) - lum(b.data, i * 4)) > 12 ? 1 : 0;
  const reach = 12 + w * 0.08;
  let best = 0, bestNear = Infinity;
  for (let start = 0; start < w * h; start++) {
    if (!on[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0, near = Infinity;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      size++;
      near = Math.min(near, Math.hypot(x - w / 2, y - h / 2));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && on[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (near <= reach && (near < bestNear - 6 || (Math.abs(near - bestNear) <= 6 && size > best))) { best = size; bestNear = near; }
  }
  return best;
}

async function visibleSpotPose(page, pose) {
  const half = pose.range > 300 ? 70 : 160, floor = pose.range > 300 ? 12 : 80;
  const view = page.viewport() ?? { width: 1920, height: 1080 };
  const clip = { x: Math.round(view.width / 2) - half, y: Math.round(view.height / 2) - half, width: 2 * half, height: 2 * half };
  const lum = (d, o) => d[o] * 0.2126 + d[o + 1] * 0.7152 + d[o + 2] * 0.0722;
  pose.tried = [];
  for (let tries = 0; tries < 6; tries++) {
    await page.evaluate(pageVehicles, { keepId: pose.hull.id, show: true });
    await page.evaluate(externalPoseScript(pose.pose));
    await sleep(900);
    const a = decodePng(await page.screenshot({ type: 'png', clip }));
    await page.evaluate(pageVehicles, { keepId: pose.hull.id, show: false });
    await sleep(500);
    const b = decodePng(await page.screenshot({ type: 'png', clip }));
    await sleep(500);
    const b2 = decodePng(await page.screenshot({ type: 'png', clip }));
    const px = centreBlobPixels(a, b, b2, lum);
    pose.tried.push({ offDeg: pose.offDeg, px });
    if (px >= floor) return true;
    const next = await page.evaluate(pageSpotPose, { hull: pose.hull, range: pose.range, after: pose.index });
    if (!next) return false;
    Object.assign(pose, { index: next.index, offDeg: next.offDeg, pose: { cam: next.cam, at: next.at, fov: 55, resolved: true } });
  }
  return false;
}

/** Every hull's AI and inputs frozen and the track prints cleared, before a map's poses (page side). */
function pageQuietGround() {
  const D = window.__DEBUG;
  let frozen = 0;
  for (const e of D.game.tanks) {
    if (!e.isPlayer) e.aiCtl = null;
    if (e.input) { e.input.actionBits = 0; if ('throttle' in e.input) e.input.throttle = 0; if ('steer' in e.input) e.input.steer = 0; }
    if (e.state) e.state.speed = 0;
    frozen++;
  }
  D.world._trackMarks?.reset?.();
  return frozen;
}

async function shootMap(entry, options, frames) {
  const { page, mapId, stage } = entry;
  await page.bringToFront();
  // (ab6, Suzhou Creek: the bots' spin at the spawn left dozens of track arcs, read as combed streaks on the new straw)
  // the hulls frozen and the prints cleared before any pose, on both variants alike
  await page.evaluate(pageQuietGround);
  // (the hulls stood where staging left them only until the thaw: the poses read where they stand now)
  const fresh = await page.evaluate(pageStage);
  stage.allies = fresh.allies;
  await sleep(1500);
  const poses = await planPoses(page, stage, options.poses);
  const receipt = { player: stage.player, allies: stage.allies.length, poses: {}, preset: null };
  receipt.preset = await page.evaluate(() => window.__DEBUG.quality?.preset ?? window.__DEBUG.preset ?? null).catch(() => null);
  for (const pose of poses) {
    if (pose.kind === 'spot' && !(await visibleSpotPose(page, pose))) {
      receipt.poses[pose.name] = { hidden: true, hull: pose.hull, tried: pose.tried };
      continue;
    }
    if (pose.kind === 'spot') await page.evaluate(pageVehicles, { keepId: pose.hull.id, show: true });
    const resolved = pose.kind === 'chase'
      ? await page.evaluate(chasePoseScript(stage.player.yaw))
      : await page.evaluate(externalPoseScript(pose.pose));
    await sleep(900);
    const settled = await page.waitForFunction(grassSettled, { timeout: 8000, polling: 250 }).then(() => true, () => false);
    await sleep(400);
    const shots = { grassSettled: settled };
    for (const variant of options.variants) {
      const pv = parseVariant(variant);
      const n = await page.evaluate(pageSetUniforms, pv.sets);
      const hidden = await page.evaluate(pageHideDecals, pv.hide);
      // (ab3, Steinburg: the clouds and their shadows moved between a pose's variants, a global difference the ground
      // change did not make) the clouds pinned again before every variant's frame
      await page.evaluate(stillClouds());
      await sleep(400);
      const tag = variant.replace(/[^A-Za-z0-9.=-]+/g, '_');
      if (pose.kind === 'spot') {
        for (const [suffix, show] of [['hull', true], ['bare', false]]) {
          await page.evaluate(pageVehicles, { keepId: pose.hull.id, show });
          await sleep(500);
          const file = path.join(frames, `${mapId}-${pose.name}-${suffix}-${tag}.png`);
          await page.screenshot({ path: file, type: 'png' });
          shots[`${variant}:${suffix}`] = { file: path.basename(file), materials: n, decalsHidden: hidden };
        }
      } else {
        const file = path.join(frames, `${mapId}-${pose.name}-${tag}.png`);
        await page.screenshot({ path: file, type: 'png' });
        shots[variant] = { file: path.basename(file), materials: n, decalsHidden: hidden };
      }
    }
    await page.evaluate(pageSetUniforms, null);
    await page.evaluate(pageHideDecals, []);
    receipt.poses[pose.name] = { resolved, town: pose.town ?? null, hull: pose.hull ?? null, offDeg: pose.offDeg ?? null, tried: pose.tried ?? null, shots };
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
          const receipt = await shootMap({ ...entry, mapId }, { variants: job.variants, poses: job.poses }, job.frames);
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
