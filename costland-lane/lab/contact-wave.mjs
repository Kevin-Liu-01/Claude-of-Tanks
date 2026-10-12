#!/usr/bin/env node
// contact lane (2026-10-08): the track-contact evidence frames, before (A) and after (B), each side served in turn from
// the same tool (a built dist, or `dev@<source root>` through a dev server on its own private optimizer cache).
//
//   node .qa-dev/contact-wave.mjs --part=studio|garage --dists=a:<dir|dev@root>,b:<dir|dev@root> --out=<dir>
//        [--maps=desert,verdant] [--specs=m1a2,t90m,kv2] [--port=5650] [--relief=<json from an earlier run>]
//
// studio: Scene Studio on each map, one tank driven by an actor track over a crest and through a hollow found on the
//   map's own contact surface (a 9 m path, the ground level across the track gauge, nothing standing within 6 m), a
//   camera tracking it low beside the near track; the offline clock (__STUDIO.advanceFrame at 60 Hz) carries the sim
//   support and the wheels' damped conform; frames at fixed times (__STUDIO.capture). The relief is found on the first
//   side and reused on the second (written to <out>/relief.json).
// garage: the Garage boot with each spec on the pedestal: the canonical showroom view, then a low front and a low side
//   view (rig.setExternalPose, the settled-Garage pacer woken by a viewport nudge until two frames complete).
// Writes <out>/<dist>/<part>/<id>.png and <out>/run-<part>.json (per frame: id, dist, file, pose, the hull's measured
// contact: the drawn runs' gap to the rendered contact surface).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';

const root = process.cwd();
const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const out = path.resolve(arg('out', 'contact-wave'));
const part = arg('part', 'studio');
const maps = arg('maps', 'desert,verdant').split(',');
const specs = arg('specs', 'm1a2,t90m,kv2').split(',');
const port0 = Number(arg('port', '5650'));
const reliefFile = arg('relief', null);
const dists = (arg('dists', '') || '').split(',').filter(Boolean).map((pair) => { const i = pair.indexOf(':'); return { name: pair.slice(0, i), dir: pair.slice(i + 1) }; });
if (!dists.length) throw new Error('--dists=a:<dir>,b:<dir> is required');
const SP = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad';
const tool = (p) => import(pathToFileURL(path.join(root, 'tools', p)).href);
const { MAP_PROBE_BROWSER_ARGS, mapProbeServerOptions } = await tool('map-probe-runtime.mjs');
const { settleResidencyTerrain } = await tool('world-residency-acquisition.mjs');
const freezeLib = await import(pathToFileURL(path.join(SP, 'fifo2/lib/cloud-freeze.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[contact-wave] ${new Date().toTimeString().slice(0, 8)}`, ...a);
async function within(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${Math.round(ms / 1000)} s`)), ms); })]);
  } finally { clearTimeout(timer); }
}

async function startServer(distDir) {
  const devRoot = distDir.startsWith('dev@') ? path.resolve(distDir.slice(4)) : null;
  if (!devRoot && !existsSync(path.join(distDir, 'index.html'))) throw new Error(`${distDir}/index.html missing`);
  for (let p = port0; p < port0 + 20; p++) {
    try {
      if (devRoot) {
        const cacheDir = path.join(SP, 'nightsky', `vite-cache-${path.basename(devRoot)}`);
        mkdirSync(cacheDir, { recursive: true });
        const options = mapProbeServerOptions(devRoot, cacheDir);
        const server = await createServer({ ...options, server: { ...options.server, port: p, strictPort: true } });
        await server.listen();
        return { port: p, close: () => server.close() };
      }
      const server = await preview({ root, logLevel: 'error', build: { outDir: distDir }, preview: { host: '127.0.0.1', port: p, strictPort: true } });
      return { port: p, close: () => server.close() };
    } catch (error) {
      if (/already in use|EADDRINUSE/i.test(String(error?.message || error) + (error?.code || ''))) continue;
      throw error;
    }
  }
  throw new Error('no free port');
}

// ------------------------------------------------------------------------------------------------ page functions
function pageFrames(count) {
  return new Promise((resolve) => { let left = count; const tick = () => (--left <= 0 ? resolve(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
}
function pageGrassReady() {
  const D = window.__DEBUG, V = D.camera.position.constructor;
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  const s = D.world.getGrassWorkState();
  return s.pendingVisible === 0 && !s.carpet.pending;
}
/** Straight 9 m paths on the map's rendered contact surface whose middle stands over (crest) or under (hollow) its
 * ends, level across the gauge, nothing standing within 6 m, away from water. */
function pageFindRelief(o) {
  const D = window.__DEBUG, hf = D.world.heightField, world = D.world;
  const H = (x, z) => (typeof hf.getContactHeightAt === 'function' ? hf.getContactHeightAt(x, z) : hf.getHeightAt(x, z));
  const wet = (x, z) => (typeof hf.getWaterDepthAt === 'function' ? hf.getWaterDepthAt(x, z) : 0) > 0;
  const half = o.L / 2, found = { crest: [], hollow: [] };
  for (let gx = -o.R; gx <= o.R; gx += o.step) {
    for (let gz = -o.R; gz <= o.R; gz += o.step) {
      for (let a = 0; a < 8; a++) {
        const h = (a * Math.PI) / 8, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
        const prof = [];
        let ok = true;
        for (let s = -half; s <= half + 1e-6; s += 0.5) {
          const x = gx + fx * s, z = gz + fz * s;
          const hl = H(x + rx * 1.45, z + rz * 1.45), hr = H(x - rx * 1.45, z - rz * 1.45);
          if (Math.abs(hl - hr) > 0.2 || wet(x, z)) { ok = false; break; }
          prof.push(0.5 * (hl + hr));
        }
        if (!ok) continue;
        const n = prof.length, mid = prof[(n - 1) >> 1], hump = mid - 0.5 * (prof[0] + prof[n - 1]);
        let maxSlope = 0;
        for (let i = 1; i < n; i++) maxSlope = Math.max(maxSlope, Math.abs(prof[i] - prof[i - 1]) / 0.5);
        if (maxSlope > 0.42) continue;
        const kind = hump >= o.minHump && hump <= o.maxHump ? 'crest' : hump <= -o.minHump && hump >= -o.maxHump ? 'hollow' : null;
        if (!kind) continue;
        const pad = half + 6;
        const hits = world.queryObstacles ? world.queryObstacles(gx - pad, gz - pad, gx + pad, gz + pad, []) : [];
        if (hits && hits.length) continue;
        found[kind].push({ x: gx, z: gz, headingDeg: (h * 180) / Math.PI, hump: +hump.toFixed(3), maxSlope: +maxSlope.toFixed(3),
          d: Math.hypot(gx, gz) });
      }
    }
  }
  // the clearest relief nearest the middle of the map: |hump| first, then distance
  const pick = (list) => list.sort((p, q) => Math.abs(q.hump) - Math.abs(p.hump) || p.d - q.d).slice(0, 3);
  return { crest: pick(found.crest), hollow: pick(found.hollow), counts: { crest: found.crest.length, hollow: found.hollow.length } };
}
function pageStudioScene(o) {
  const h = (o.relief.headingDeg * Math.PI) / 180, fx = Math.sin(h), fz = Math.cos(h);
  const p0 = [o.relief.x - fx * o.travel / 2, o.relief.z - fz * o.travel / 2], p1 = [o.relief.x + fx * o.travel / 2, o.relief.z + fz * o.travel / 2];
  return {
    map: o.map, seed: 5000,
    actors: [{ id: o.spec, name: 'hero', pos: p0, facingDeg: o.relief.headingDeg, turretDeg: 0, gunDeg: 0, state: 'intact' }],
    storyboard: {
      version: 1, durationMs: o.durationMs, shots: [],
      actorTracks: [{ actor: 'hero', keys: [
        { id: 'key-1', tMs: 0, pos: p0, facingDeg: o.relief.headingDeg, turretDeg: 0, gunDeg: 0, transition: 'smooth' },
        { id: 'key-2', tMs: o.durationMs, pos: p1, facingDeg: o.relief.headingDeg, turretDeg: 0, gunDeg: 0, transition: 'smooth' },
      ] }],
    },
    fxTime: 0, timeScale: 0,
  };
}
/** The camera for this frame from the actor's pose now (ground-relative heights): low beside the near track, low ahead
 * of it, or the chase camera behind and above. */
function pageAimCamera(o) {
  const a = window.__STUDIO.listActors()[0];
  if (!a) return null;
  const x = a.pos[0], z = a.pos[a.pos.length - 1], h = (a.facingDeg * Math.PI) / 180;
  const fx = Math.sin(h), fz = Math.cos(h), sx = -Math.cos(h) * o.side, sz = Math.sin(h) * o.side;
  let pos, lookAt;
  if (o.rig === 'front') {
    pos = [x + fx * o.camDist + sx * 2.2, o.camUp, z + fz * o.camDist + sz * 2.2];
    lookAt = [x + fx * 2.6 + sx * 1.3, 0.25, z + fz * 2.6 + sz * 1.3];
  } else if (o.rig === 'chase') {
    pos = [x - fx * o.camDist + sx * 1.5, o.camUp, z - fz * o.camDist + sz * 1.5];
    lookAt = [x + fx * 1.0, 0.6, z + fz * 1.0];
  } else {
    pos = [x + sx * o.camDist, o.camUp, z + sz * o.camDist];
    lookAt = [x + sx * 1.2, 0.25, z + sz * 1.2];
  }
  window.__STUDIO.setCamera({ pos, lookAt, groundRel: true, fov: o.fov, rollDeg: 0, mode: 'fly' });
  return { actor: [x, z, a.facingDeg], camera: window.__STUDIO.getCamera() };
}
/** The near hulls' drawn runs against the rendered contact surface (what the term reads), for the record. */
function pageContactState() {
  const D = window.__DEBUG, hf = D.world?.heightField, scene = D.scene;
  const H = (x, z) => (hf && typeof hf.getContactHeightAt === 'function' ? hf.getContactHeightAt(x, z) : hf ? hf.getHeightAt(x, z) : NaN);
  const M = D.camera.matrixWorld.constructor, V = D.camera.position.constructor;
  const near = scene.userData.nearVehicles || [];
  const rows = [];
  for (const entry of near) {
    const r = entry.root, s = r.userData.groundAoShape;
    if (!s) continue;
    const world = new M().compose(r.position, r.quaternion, r.scale);
    if (r.parent) world.premultiply(r.parent.matrixWorld);
    let owner = null;
    r.traverse((o) => { if (!owner && typeof o.userData.runningGearGroundRun === 'function') owner = o; });
    const pairs = new Float32Array(64), gaps = [];
    for (const side of [-1, 1]) {
      const n = owner ? owner.userData.runningGearGroundRun(side, pairs) : 0;
      for (let i = 0; i < n; i++) {
        const p = new V(side * 0.5 * (s.xi + s.xo), s.y0 + pairs[i * 2 + 1], pairs[i * 2]).applyMatrix4(world);
        gaps.push(+(p.y - H(p.x, p.z)).toFixed(3));
      }
    }
    rows.push({ name: r.name, depth: +entry.depth.toFixed(1), gaps });
  }
  return { near: rows, uVehGround: D.post?.aerial?.uniforms?.uVehGround?.value ?? null };
}
function pageHeroPose(v) {
  const D = window.__DEBUG, V = D.camera.position.constructor;
  const vis = D.pedestalVisual, r = vis?.root ?? vis;
  if (!r) return null;
  r.updateMatrixWorld(true);
  const p = new V(); r.getWorldPosition(p);
  const yaw = r.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const cam = new V(p.x + rx * v.right + fx * v.fwd, p.y + v.up, p.z + rz * v.right + fz * v.fwd);
  const at = new V(p.x + rx * v.atRight + fx * v.atFwd, p.y + v.atUp, p.z + rz * v.atRight + fz * v.atFwd);
  D.rig.setExternalPose(cam, at, v.fov);
  return { root: p.toArray(), yaw, cam: cam.toArray(), at: at.toArray(), name: r.name };
}

// ------------------------------------------------------------------------------------------------ parts
async function newPage(browser, search, spec = null) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.setItem('cot.gfxPreset', 'high');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
      if (s) localStorage.setItem('cot.lastTank.v1', s);
    } catch { /* storage blocked */ }
  }, spec);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  return { page, errors, go: async (base) => {
    await page.goto(`${base}/${search}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.__GAME_READY === true && !!window.__DEBUG', { timeout: 600000, polling: 500 });
  } };
}

// the crest and the hollow, each seen by three rigs: low beside the near track (under a lifted run), low ahead (under
// the front run and its wrap) and the chase camera (behind and above: the rear wraps); --rigs limits them
const RIGS = {
  side: { rig: 'side', camDist: 6.5, camUp: 0.3, fov: 44 },
  front: { rig: 'front', camDist: 8.5, camUp: 0.35, fov: 44 },
  chase: { rig: 'chase', camDist: 9.5, camUp: 3.4, fov: 50 },
};
const rigNames = arg('rigs', 'side,front,chase').split(',');
const STRIPS = [];
for (const kind of arg('kinds', 'crest,hollow').split(',')) {
  for (const name of rigNames) STRIPS.push({ kind, side: 1, rig: name, tag: `${kind}-${name}` });
}
const TIMES = arg('times', '2000,3750,5500').split(',').map(Number);

async function runStudio(browser, base, dist, record, relief) {
  const { page, errors, go } = await newPage(browser, `?studio=1&map=${maps[0]}&nosplash=1&tier=desktop`);
  await go(base);
  for (const mapId of maps) {
    if (mapId !== maps[0]) await within(page.evaluate((m) => window.__STUDIO.setMap(m), mapId), 600000, `setMap ${mapId}`);
    await page.waitForFunction((m) => window.__STUDIO && window.__STUDIO.active === true && window.__STUDIO.mapId === m, { timeout: 600000, polling: 500 }, mapId);
    await freezeLib.installCloudFreeze(page);
    if (!relief[mapId]) {
      relief[mapId] = await page.evaluate(pageFindRelief, { L: 9, R: 300, step: 6, minHump: 0.3, maxHump: 1.1 });
      log(`${mapId}: relief ${JSON.stringify(relief[mapId].counts)} crest ${JSON.stringify(relief[mapId].crest[0])} hollow ${JSON.stringify(relief[mapId].hollow[0])}`);
    }
    for (const strip of STRIPS) {
      const r = relief[mapId][strip.kind]?.[0];
      if (!r) { log(`${mapId}: no ${strip.kind}`); continue; }
      const scene = await page.evaluate(pageStudioScene, { map: mapId, spec: 'm1a2', relief: r, side: strip.side, travel: 9, durationMs: 7500,
        ...RIGS[strip.rig] });
      await within(page.evaluate((s) => window.__STUDIO.load(s), scene), 300000, 'studio load');
      await page.evaluate(pageFrames, 4);
      let clock = 0;
      for (const t of TIMES) {
        // the offline clock at 60 Hz: the sim support and the damped wheel conform advance as in play
        clock = await page.evaluate((target, now) => {
          let c = now;
          while (c < target - 1e-6) c = window.__STUDIO.advanceFrame(Math.min(1000 / 60, target - c));
          return c;
        }, t, clock);
        const aimed = await page.evaluate(pageAimCamera, { ...RIGS[strip.rig], side: strip.side });
        try { await page.evaluate(settleResidencyTerrain); } catch { /* optional */ }
        await page.waitForFunction(pageGrassReady, { timeout: 120000, polling: 'raf' });
        await freezeLib.settleCloudsFrozenOn(page).catch(() => {});
        await page.evaluate(pageFrames, 3);
        const contact = await page.evaluate(pageContactState);
        const shot = await within(page.evaluate(() => window.__STUDIO.capture({ width: 1600, height: 900 })), 120000, 'capture');
        const id = `${mapId}-${strip.tag}-t${String(t).padStart(4, '0')}`;
        const file = path.join(dist.name, 'studio', `${id}.png`);
        mkdirSync(path.join(out, dist.name, 'studio'), { recursive: true });
        writeFileSync(path.join(out, file), Buffer.from(shot.dataURL.split(',')[1], 'base64'));
        record.frames.push({ id, dist: dist.name, part: 'studio', map: mapId, file, strip, relief: r, t, aimed, contact });
        log(`${dist.name} ${id} gaps ${JSON.stringify(contact.near[0]?.gaps ?? null)}`);
      }
    }
  }
  record.errors.push(...errors.slice(0, 20).map((e) => `${dist.name}: ${e}`));
  await page.close();
}

// the Garage camera is the showroom orbit (pointer-driven): views are drags from the canonical pose across the stage
// (the hero's front quarter, its flank), each from a fresh canonical reset
const GARAGE_VIEWS = {
  front: { dx: Number(arg('garage-front-dx', '-260')), dy: Number(arg('garage-front-dy', '-40')) },
  side: { dx: Number(arg('garage-side-dx', '330')), dy: Number(arg('garage-side-dy', '-60')) },
};
async function wakeGarage(page) {
  const before = await page.evaluate(() => window.__DEBUG.post?.lastCompletedFrame?.serial ?? 0);
  for (let i = 0; i < 6; i++) {
    await page.setViewport({ width: 1600, height: 901, deviceScaleFactor: 1 });
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    await page.evaluate(pageFrames, 3);
    const now = await page.evaluate(() => window.__DEBUG.post?.lastCompletedFrame?.serial ?? 0);
    if (now >= before + 2) return now - before;
    await sleep(250);
  }
  return -1;
}
async function runGarage(browser, base, dist, record) {
  for (const spec of specs) {
    const { page, errors, go } = await newPage(browser, '?nosplash=1&tier=desktop', spec);
    await go(base);
    await page.evaluate(async () => { const w = window.__GARAGE_WORKSHOP; if (w?.ensureBuilt) await w.ensureBuilt(); });
    await page.waitForFunction((s) => { const v = window.__DEBUG.pedestalVisual; const r = v?.root ?? v; return !!r && r.name === `tank_${s}`; },
      { timeout: 300000, polling: 500 }, spec);
    await freezeLib.installCloudFreeze(page);
    await page.evaluate(pageFrames, 30); await sleep(1200);
    mkdirSync(path.join(out, dist.name, 'garage'), { recursive: true });
    const views = ['canonical', ...Object.keys(GARAGE_VIEWS)];
    for (const view of views) {
      let pose = null;
      if (view !== 'canonical') {
        // back to the canonical frame, then drag the orbit from the stage's middle
        await page.evaluate(() => window.__DEBUG.showroom?.reset?.());
        await wakeGarage(page);
        const v = GARAGE_VIEWS[view];
        await page.mouse.move(800, 430);
        await page.mouse.down();
        await page.mouse.move(800 + v.dx, 430 + v.dy, { steps: 24 });
        await page.mouse.up();
        for (let i = 0; i < 40; i++) {
          const moving = await page.evaluate(() => !!window.__DEBUG.showroom?.moving);
          if (!moving) break;
          await page.evaluate(pageFrames, 6);
        }
        pose = await page.evaluate(() => ({ cam: window.__DEBUG.camera.position.toArray(), drag: true }));
      }
      const woke = await wakeGarage(page);
      await sleep(300);
      const contact = await page.evaluate(pageContactState);
      const id = `garage-${spec}-${view}`;
      const file = path.join(dist.name, 'garage', `${id}.png`);
      await page.screenshot({ path: path.join(out, file), type: 'png' });
      record.frames.push({ id, dist: dist.name, part: 'garage', spec, view, file, pose, woke, contact });
      log(`${dist.name} ${id} woke ${woke} near ${JSON.stringify(contact.near.map((n) => n.name))}`);
    }
    record.errors.push(...errors.slice(0, 20).map((e) => `${dist.name}/${spec}: ${e}`));
    await page.close();
  }
}

// ------------------------------------------------------------------------------------------------ run
mkdirSync(out, { recursive: true });
const record = { part, root, dists, frames: [], errors: [], started: new Date().toISOString() };
const relief = reliefFile && existsSync(reliefFile) ? JSON.parse(readFileSync(reliefFile, 'utf8')) : {};
const save = () => writeFileSync(path.join(out, `run-${part}.json`), `${JSON.stringify(record, null, 1)}\n`);
try {
  for (const dist of dists) {
    const server = await startServer(dist.dir);
    const browser = await puppeteer.launch({ headless: true, args: [...MAP_PROBE_BROWSER_ARGS, '--window-size=1600,900'], protocolTimeout: 900000 });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      if (part === 'studio') {
        await runStudio(browser, base, dist, record, relief);
        writeFileSync(path.join(out, 'relief.json'), `${JSON.stringify(relief, null, 1)}\n`);
      } else if (part === 'garage') await runGarage(browser, base, dist, record);
      else throw new Error(`unknown part ${part}`);
    } finally {
      save();
      await browser.close().catch(() => {});
      await server.close();
    }
  }
} finally {
  record.finished = new Date().toISOString();
  save();
}
log('done');
process.exit(0);
