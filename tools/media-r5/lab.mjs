#!/usr/bin/env node
// Media r5 shot lab: scout candidate compositions per map, or render scene JSON
// files (with optional cameraVariants) at review resolution, then contact sheets.
// Run from a repo worktree root (the vite root):
//   node $LAB/lab.mjs --scout=verdant,desert --out=$OUT [--width=960]
//   node $LAB/lab.mjs --scenes=dir-or-file[,more] --out=$OUT [--width=1280]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const { createCaptureLock, CAPTURE_LOCK_DIR, ticketAt } = await import(join(ROOT, 'tools/capture-lock.mjs'));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z0-9-]+)=(.*)$/.exec(a); if (!m) throw Error('bad arg ' + a); return [m[1], m[2]]; }));
const out = resolve(args.out ?? 'shots/media-r5/lab');
const WIDTH = Number(args.width ?? 960);
const ASPECT = Number(args.aspect ?? 16 / 9);
const HEIGHT = Math.round(WIDTH / ASPECT);
const port = Number(args.port ?? 7420);
mkdirSync(out, { recursive: true });

// --- jobs -------------------------------------------------------------------
const jobs = []; // {map, name, scene, variants?}
if (args.scenes) {
  for (const entry of args.scenes.split(',')) {
    const p = resolve(entry);
    const files = statSync(p).isDirectory() ? readdirSync(p).filter(f => f.endsWith('.json')).sort().map(f => join(p, f)) : [p];
    for (const f of files) {
      const scene = JSON.parse(readFileSync(f, 'utf8'));
      if (args.match && !args.match.split(',').some(m => basename(f).includes(m))) continue;
      jobs.push({ map: scene.map, name: basename(f, '.json'), scene });
    }
  }
}
const scoutMaps = args.scout ? args.scout.split(',') : [];
const featureMaps = args.features ? args.features.split(',') : [];

// --- in-page helpers ----------------------------------------------------------
const SCOUT_FN = async (mapId, opts) => {
  const W = window.__DEBUG.world, hf = W.heightField;
  const H = (x, z) => hf.getHeightAt(x, z);
  const half = hf.size / 2 - 40;
  const feats = W.getMinimapFeatures();
  const cfg = W.config;
  const wet = (x, z) => (hf.getWaterMaskAt ? hf.getWaterMaskAt(x, z) : 0);
  const obstacles = W.getObstacles().filter(r => !r.dead && !r.crushed);
  const blocked = (x, z, r = 4.5) => obstacles.some(o => x > o.min[0] - r && x < o.max[0] + r && z > o.min[2] - r && z < o.max[2] + r && (o.max[1] - o.min[1]) > 0.6);
  const slope = (x, z) => { const d = 3; return Math.hypot(H(x + d, z) - H(x - d, z), H(x, z + d) - H(x, z - d)) / (2 * d); };
  const inside = (x, z) => Math.abs(x) < half && Math.abs(z) < half;
  const okTank = (x, z) => inside(x, z) && !blocked(x, z) && slope(x, z) < 0.22 && wet(x, z) < 0.25;
  const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
  const fwd = f => [Math.sin(rad(f)), Math.cos(rad(f))];
  const sites = [];
  const shot = cfg.shot;
  const scenicYaw = shot ? deg(Math.atan2(shot.look[0] - shot.pos[0], shot.look[2] - shot.pos[2])) : 0;
  for (const b of feats.tacticalBeats ?? []) sites.push({ id: `beat-${b.id ?? sites.length}`, x: b.x, z: b.z, kind: 'beat' });
  if (shot) sites.push({ id: 'scenic', x: shot.look[0], z: shot.look[2], kind: 'scenic' });
  const v = hf._layout?.village;
  if (v && Number.isFinite(v.cx)) sites.push({ id: 'village', x: v.cx, z: v.cz, kind: 'village' });
  const sp = W.spawnPoints;
  if (sp?.player?.pos) sites.push({ id: 'spawn-ally', x: sp.player.pos[0], z: sp.player.pos[2], kind: 'spawn' });
  if (sp?.enemies?.[0]?.pos) sites.push({ id: 'spawn-enemy', x: sp.enemies[0].pos[0], z: sp.enemies[0].pos[2], kind: 'spawn' });
  const roads = (feats.roads ?? []).slice().sort((a, b) => b.length - a.length);
  for (const [ri, road] of roads.slice(0, 2).entries()) {
    for (const t of [0.3, 0.62]) {
      const i = Math.floor(t * (road.length - 1)); const p = road[i], q = road[Math.min(road.length - 1, i + 1)];
      if (!p || !q) continue;
      sites.push({ id: `road${ri}-${Math.round(t * 100)}`, x: p[0], z: p[1], kind: 'road', roadYaw: deg(Math.atan2(q[0] - p[0], q[1] - p[1])) });
    }
  }
  const lineup = opts.lineup;
  const scenes = [];
  for (const [si, s] of sites.entries()) {
    if (!inside(s.x, s.z)) continue;
    // find a clear hero spot near the site
    let best = null;
    for (let ring = 0; ring < 7 && !best; ring++) for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2 + ring, r = 6 + ring * 9;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if (okTank(x, z)) { best = [x, z]; break; }
    }
    if (!best) continue;
    // heading: roads follow the road, else drive toward the camera side of the scenic axis
    const heading = s.kind === 'road' ? s.roadYaw : scenicYaw + 180 + (si % 2 ? 35 : -35);
    const [fx, fz] = fwd(heading), [rx, rz] = [fz, -fx];
    const offsets = [[0, 0], [-9, -13], [10, -17], [-3, -31], [14, -36]];
    const actors = [];
    for (const [j, [lat, lon]] of offsets.entries()) {
      const x = best[0] + rx * lat + fx * lon, z = best[1] + rz * lat + fz * lon;
      if (j && !okTank(x, z)) continue;
      actors.push({ id: lineup[(si + j) % lineup.length], name: j ? `wing${j}` : 'hero', pos: [x, z], facingDeg: heading,
        turretDeg: j ? (j % 2 ? 6 : -8) : -12, gunDeg: 1.5, camo: opts.camo, camoSeed: 4100 + si * 17 + j });
    }
    const hy = H(best[0], best[1]) + 1.9;
    const target = [best[0] + fx * 2, hy, best[1] + fz * 2];
    const rig = (name, side, along, lift, fov, roll = 0, lookLift = 0) => {
      const x = best[0] + rx * side + fx * along, z = best[1] + rz * side + fz * along;
      const y = Math.max(H(x, z) + 0.45, H(x, z) + lift);
      return { name, pos: [x, y, z], lookAt: [target[0], target[1] + lookLift, target[2]], fov, rollDeg: roll };
    };
    const cams = [
      rig('hero34', 8, 11, 1.25, 42),
      rig('worm', 4.5, 9, 0.5, 34, 0, 0.6),
      rig('side', 15, 2, 2.2, 32),
      rig('rear', -5, -46, 5.5, 44, 0, -0.5),
      rig('crane', 26, 30, 21, 48, 0, -1.2),
      rig('tele', 6, 150, 3.2, 9),
      rig('dutch', -9, 12, 1.8, 40, -7),
      rig('topdown', 0.5, 0.5, 70, 50),
    ];
    // a camera far "behind" the formation toward the scenic background
    const sceneJson = { map: mapId, timeOfDay: opts.time, seed: 7000 + si, actors, effects: [], fxTime: 0, timeScale: 0,
      camera: { pos: cams[0].pos, lookAt: cams[0].lookAt, fov: cams[0].fov } };
    scenes.push({ name: `${mapId}-${String(si).padStart(2, '0')}-${s.id}`, site: s, scene: sceneJson, variants: cams });
  }
  return scenes;
};

// --- run ----------------------------------------------------------------------
// --lens-k=<k>[,<id prefix>:<k>…] (a portrait or square reframing's lens factor; launch night, 2026-10-09: the portraits
// take 1.2 and S06 1.4, in one run)
const lensParts = String(args['lens-k'] ?? '').split(',').filter(Boolean);
const lensFor = (name) => {
  let k = null;
  for (const part of lensParts) { const m = /^([^:]+):(.+)$/.exec(part); if (!m) k = Number(part); else if (name.startsWith(m[1])) return Number(m[2]); }
  return k;
};
const lock = createCaptureLock();
// --yield-fifo2=<fifo2 runner.json> (the coordinator's overnight pacing, 2026-10-08: one media hold of at most 20 minutes
// for every two holds of the capture service): a later lease waits for that service's own hold count to rise by
// --yield-holds since this lab's last release, rather than counting lock directories, which other lanes' holds also make.
const FIFO2 = args['yield-fifo2'] ?? null;
const fifo2Holds = () => { try { const n = Number(JSON.parse(readFileSync(FIFO2, 'utf8')).holds); return Number.isFinite(n) ? n : null; } catch { return null; } };
// --yield-fifo2-base=<n>: the service's count when this lane's last hold ended (a run started later would count from a
// hold that began after it, one too many)
let fifo2Base = FIFO2 ? (args['yield-fifo2-base'] != null ? Number(args['yield-fifo2-base']) : fifo2Holds()) : null;
if (FIFO2) {
  const releaseLock = lock.release.bind(lock);
  lock.release = (...a) => { fifo2Base = fifo2Holds() ?? fifo2Base; return releaseLock(...a); };
}
// --ticket-stamp=<ms> (the finals' scheme, 2026-10-07: a per-job lease rejoined a 45-ticket line at its back for every
// take): every acquisition joins the queue at that place, the media lane's. With --lease=budget each later lease first
// lets --yield-holds other holds (2 by default; a hold is one lock directory, its inode and birth time) take the lock,
// so the place never starves the line; with the lock free a minute and nobody waiting (five minutes at most) it goes on.
const STAMP = args['ticket-stamp'] ? Number(args['ticket-stamp']) : null;
const YIELD_HOLDS = Math.max(0, Number(args['yield-holds'] ?? 2));
const holdId = () => { try { const s = statSync(CAPTURE_LOCK_DIR); return `${s.ino}:${s.birthtimeMs}`; } catch { return null; } };
let leaseCount = 0;
async function take(ms) {
  // (--yield-first: also before the first lease, for a run that follows another media lease straight away)
  if (STAMP && args.lease === 'budget' && (leaseCount > 0 || args['yield-first']) && YIELD_HOLDS) {
    const seen = new Set();
    let freeSince = Date.now(), served = 0, readAt = 0;
    for (;;) {
      const id = holdId();
      if (id) { seen.add(id); freeSince = Date.now(); }
      if (FIFO2 && Date.now() - readAt > 5000) {
        readAt = Date.now();
        const now = fifo2Holds();
        // (a restarted runner counts from zero again)
        if (now != null && fifo2Base != null && now < fifo2Base) fifo2Base = now;
        if (now != null && fifo2Base == null) fifo2Base = now;
        served = now != null && fifo2Base != null ? now - fifo2Base : 0;
      }
      if ((FIFO2 ? served : seen.size) >= YIELD_HOLDS) break;
      const free = id ? 0 : Date.now() - freeSince;
      if ((free > 60000 && !(lock.waiting?.() > 0)) || free > 300000) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const yielded = FIFO2 ? `${served} fifo2 hold${served === 1 ? '' : 's'} (${seen.size} in all)` : `${seen.size} hold${seen.size === 1 ? '' : 's'}`;
    console.log(`[lab] yielded to ${yielded}; rejoining the queue at ${STAMP} ${new Date().toTimeString().slice(0, 8)}`);
  }
  leaseCount++;
  await lock.acquire(ms, STAMP ? { ticket: ticketAt(STAMP) } : {});
  // (2026-10-08: the coordinator could not tell from the log when a lab held the shared lock)
  console.log(`[lab] lease ${leaseCount} taken ${new Date().toTimeString().slice(0, 8)}`);
}
console.log(`[lab] waiting for capture lock${STAMP ? ` at ${STAMP}` : ''}`);
await take(3 * 60 * 60 * 1000);
const bootLockAt = Date.now();
const lease = setInterval(() => lock.refresh?.(), 30000); lease.unref();
// --lease=job: hold the shared GPU lock per map load and per job (short leases), not for the whole run
const PER_JOB = args.lease === 'job', PER_MAP = args.lease === 'map' || args.lease === 'budget';
// --lease=budget --lease-min=N: keep the lock across consecutive maps until N minutes have passed, then rejoin the FIFO
const BUDGET_MS = args.lease === 'budget' ? Number(args['lease-min'] ?? 12) * 60000 : 0;
let heldSince = 0, holding = false;
const LOCK_WAIT = 3 * 60 * 60 * 1000;
let server, browser;
const results = [];
// (2026-10-08, engine review r8: S38's page spun at 100 % CPU, its film capture timed out after 10 minutes, and the lab
// went on feeding the wedged page while it held the shared lock for every lane.) A timeout marks the browser wedged and
// the run ends there, exit code 3, the rest left for a fresh browser; a signal ends it the same way, through the finally
// that releases the lock (Vite's own SIGTERM handler exited 143 before it, as cinema.mjs found on 2026-10-07).
let wedged = false, stopping = false;
const timedOut = (error) => /timed out/i.test(String(error?.message ?? error));
try {
  server = await createServer({ root: ROOT, logLevel: 'error', cacheDir: resolve(args['cache-dir'] ?? join(out, '.vite-cache')),
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  for (const listener of process.listeners('SIGTERM')) process.off('SIGTERM', listener);
  const stop = () => { if (stopping) return; stopping = true; console.error('[lab] stopped by a signal; closing'); browser?.process()?.kill('SIGKILL'); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 600000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
  let page = null;
  const errors = [];
  const maps = [...new Set([...featureMaps, ...scoutMaps, ...jobs.map(j => j.map)])];
  const first = maps[0] ?? 'verdant';
  // the boot, three tries on a fresh page 20 s apart (2026-10-08: under a load average of 500 a cold boot's prop archive
  // fetch failed and its frame detached, ending a 13-map survey the moment its lease was taken; another timed out)
  for (let attempt = 1; ; attempt++) {
    page = await browser.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    try {
      await page.goto(`http://127.0.0.1:${port}/?studio=1&nosplash=1&tier=desktop&map=${first}&diag`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForFunction(() => window.__STUDIO?.active && window.__GAME_READY, { timeout: 240000 });
      break;
    } catch (error) {
      if (attempt >= 3 || stopping) throw error;
      console.error(`[lab] boot ${attempt} failed (${String(error?.message ?? error).split('\n')[0]}); a fresh page in 20 s`);
      await page.close().catch(() => {});
      errors.length = 0;
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
  // a budget lease starts at the boot's own acquisition and runs on into the first maps (2026-10-06: releasing after
  // the boot cost a whole trip round a 30-ticket line before the first map); --lease=map and job keep their release
  if (PER_JOB || (PER_MAP && !BUDGET_MS)) lock.release();
  else if (BUDGET_MS) { holding = true; heldSince = bootLockAt; }
  const ready = async () => page.evaluate(async () => {
    const { awaitMapCaptureReadiness } = await import('/src/dev/mapCaptureReadiness.ts');
    await awaitMapCaptureReadiness(window.__DEBUG.world, () => window.__DEBUG.world);
    window.__STUDIO.pause(); window.__DEBUG.post.pinDynScale(1);
    window.__DEBUG.post.resetPerfTrims(); window.__DEBUG.post.setAdaptiveSuspended(true);
  });
  const prepareView = camera => page.evaluate(async camera => {
    if (camera) window.__STUDIO.setCamera(camera);
    const D = window.__DEBUG;
    for (let jobs = 0; jobs < 192; jobs++) { if (!D.world.warmTerrainLookahead(D.camera.position, 1)) break; await new Promise(r => requestAnimationFrame(r)); }
    D.world.update(0, D.camera.position);
    for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  }, camera);
  const capture = (w, h) => page.evaluate(size => window.__STUDIO.capture(size), { width: w, height: h });
  const save = (path, cap) => { writeFileSync(path, Buffer.from(cap.dataURL.split(',')[1], 'base64')); return path; };
  const tankIds = await page.evaluate(() => window.__STUDIO.TANK_IDS);
  writeFileSync(join(out, 'tank-ids.json'), JSON.stringify(tankIds, null, 1));
  const defaultLineup = ['abramsx', 'kf51b', 'leo2a7v', 'challenger_3', 'm1a2_sepv3', 'leclerc_xlr', 't14', 'k2', 'type10b', 't90m']
    .filter(id => tankIds.includes(id));
  for (const map of maps) {
    if (wedged || stopping) break;
    if (PER_JOB || (PER_MAP && !holding)) { await take(LOCK_WAIT); holding = true; heldSince = Date.now(); }
    try {
    const t0 = Date.now();
    await page.evaluate(map => window.__STUDIO.load({ map, actors: [], effects: [], fxTime: 0, timeScale: 0 }), map);
    await ready();
    if (PER_JOB) { lock.release(); holding = false; }
    console.log(`[lab] ${map} ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (featureMaps.includes(map)) {
      const feats = await page.evaluate(() => {
        const W = window.__DEBUG.world, hf = W.heightField, f = W.getMinimapFeatures(), sp = W.spawnPoints;
        const v = hf._layout?.village;
        const pick = o => Object.fromEntries(Object.entries(o).filter(([, val]) => ['number', 'string', 'boolean'].includes(typeof val)));
        // 2026-10-06 (the engine review): the battlefield as the engine holds it, for world-model.mjs — every collision
        // record with its footprint, height and overrun speed, the trees' canopies (their concealment discs), and 4 m
        // height and water grids — so routes and lenses are checked against the props, not only the footprints
        const r2 = x => Math.round(x * 100) / 100;
        const shapeOf = s => !s ? null : s.kind === 'obb' ? ['o', r2(s.cx), r2(s.cz), r2(s.hw), r2(s.hl), +s.yaw.toFixed(4)]
          : s.kind === 'circle' ? ['c', r2(s.cx), r2(s.cz), r2(s.r)] : s.kind === 'convex' ? ['v', s.points.map(r2)]
          : s.kind === 'compound' ? ['m', s.parts.map(p => [shapeOf(p), p.y0 == null ? null : r2(p.y0), p.y1 == null ? null : r2(p.y1)])] : null;
        const canopy = new Map((W.getConcealment?.() ?? []).map(c => [`${r2(c.x)},${r2(c.z)}`, r2(c.r)]));
        const obstacles = W.getObstacles().filter(r => !r.dead && !r.crushed).map(r => {
          const o = { k: r.kind ?? '', b: [...r.min, ...r.max].map(r2) };
          if (r.crushable) o.c = r.crushMin ?? null;
          if (r.shape2) o.s = shapeOf(r.shape2);
          if (r.treeIdx != null) { o.t = 1; const cr = canopy.get(`${r2((r.min[0] + r.max[0]) / 2)},${r2((r.min[2] + r.max[2]) / 2)}`); if (cr) o.cr = cr; }
          return o;
        });
        const STEP = 4, n = Math.floor(hf.size / STEP) + 1, h0 = -hf.size / 2;
        const heights = new Int16Array(n * n), wet = new Uint8Array(n * n);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const x = h0 + i * STEP, z = h0 + j * STEP;
          heights[j * n + i] = Math.round(hf.getHeightAt(x, z) * 10);
          wet[j * n + i] = Math.round(255 * Math.min(1, Math.max(0, hf.getWaterMaskAt ? hf.getWaterMaskAt(x, z) : 0)));
        }
        const b64 = a => { const u = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
        // the presentation crushables a hull topples without a collision record (utility poles, loop-class dressing):
        // [x, y, z, r, h, kind, dynamic]
        const crushables = (W.crushables ?? []).map(c => [r2(c.x), r2(c.y), r2(c.z), r2(c.r), r2(c.h), c.kind ?? (c.index != null ? 'pole' : 'prop'), c.dynamic ? 1 : 0]);
        // the shrubs (2026-10-08, composition wave c3: a bush at the lens filled S36's frame at 5 s, and the obstacle dump
        // held no shrub, for a hull drives through them): every bush and understorey instance the vegetation draws
        // (vegetation.ts userData.bush / understorey; one cleared out of a solid has a zero basis and is skipped), as
        // [x, y, z, crown radius, height, 0 bush | 1 understorey], once per place
        const shrubs = [], shrubAt = new Set();
        W.group.traverse(o => {
          if (!o.isInstancedMesh || !(o.userData.bush || o.userData.understorey)) return;
          const g = o.geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          const bb = g.boundingBox, mw = o.matrixWorld.elements, a = o.instanceMatrix.array;
          const ur = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)), uh = Math.max(0.1, bb.max.y);
          const msx = Math.hypot(mw[0], mw[1], mw[2]), msy = Math.hypot(mw[4], mw[5], mw[6]);
          for (let i = 0; i < o.count; i++) {
            const at = i * 16;
            const sx = Math.hypot(a[at], a[at + 1], a[at + 2]), sy = Math.hypot(a[at + 4], a[at + 5], a[at + 6]), sz = Math.hypot(a[at + 8], a[at + 9], a[at + 10]);
            if (sx === 0 && sz === 0) continue;
            const lx = a[at + 12], ly = a[at + 13], lz = a[at + 14];
            const x = mw[0] * lx + mw[4] * ly + mw[8] * lz + mw[12], y = mw[1] * lx + mw[5] * ly + mw[9] * lz + mw[13], z = mw[2] * lx + mw[6] * ly + mw[10] * lz + mw[14];
            const place = `${Math.round(x * 4)},${Math.round(z * 4)}`;
            if (shrubAt.has(place)) continue;
            shrubAt.add(place);
            shrubs.push([r2(x), r2(y), r2(z), r2(ur * Math.max(sx, sz) * msx), r2(uh * sy * msy), o.userData.bush ? 0 : 1]);
          }
        });
        return { map: W.mapId, size: hf.size, roads: f.roads, buildings: f.buildings.map(pick), tacticalBeats: f.tacticalBeats.map(pick),
          treeClusters: f.treeClusters, waterOrSoft: f.waterOrSoft.map(pick),
          spawns: [[sp.player.pos[0], sp.player.pos[2], 'ally'], ...sp.enemies.map(e => [e.pos[0], e.pos[2], 'enemy'])],
          village: v && Number.isFinite(v.cx) ? [v.cx, v.cz, v.x0, v.z0, v.x1, v.z1] : null, shot: W.config.shot ?? null,
          sky: W.config.sky ?? null, obstacles, crushables, shrubs,
          grid: { step: STEP, n, origin: h0, heightDm: b64(heights), water255: b64(wet) } };
      });
      writeFileSync(join(out, `features-${map}.json`), JSON.stringify(feats));
      console.log(`[lab] ${map}: features (${feats.buildings.length} buildings, ${feats.treeClusters.length} clusters, ${feats.shrubs.length} shrubs)`);
    }
    const mapJobs = jobs.filter(j => j.map === map);
    if (scoutMaps.includes(map)) {
      const camo = args.camo ?? (['winter', 'alpine', 'whiteout'].includes(map) ? 'winter' : ['desert', 'badlands', 'caldera', 'copper_mesa', 'oasis', 'titan_gorge', 'skybridge', 'ruinspires', 'mars', 'moon'].includes(map) ? 'desert' : 'summer');
      const scouted = await page.evaluate(SCOUT_FN, map, { lineup: defaultLineup, camo, time: args.time ?? 'day' });
      for (const s of scouted) mapJobs.push({ map, name: s.name, scene: s.scene, variants: s.variants, site: s.site });
    }
    for (const job of mapJobs) {
      if (wedged || stopping) break;
      if (PER_JOB) await take(LOCK_WAIT);
      // a budget lease is also checked between jobs, so a map with many takes never holds the line past its budget
      if (BUDGET_MS && !holding) { await take(LOCK_WAIT); holding = true; heldSince = Date.now(); }
      try {
        if (args.format) { job.scene.__format = args.format; const k = lensFor(job.name); if (k != null) job.scene.__lensK = k; }
        await page.evaluate(scene => {
          const H = (x, z) => window.__DEBUG.world.heightField.getHeightAt(x, z);
          const sb = scene.storyboard;
          // portrait / square film reframing: widen each shot's lens (vertical FOV) so the hero keeps its horizontal coverage
          if (sb && scene.__format && scene.__format !== 'landscape') {
            const k = scene.__format === 'portrait' ? 16 / 9 * (scene.__lensK ?? 0.82) : (scene.__lensK ?? 1.12);
            for (const shot of sb.shots ?? []) shot.fov = 2 * Math.atan(Math.tan(shot.fov * Math.PI / 360) * k) * 180 / Math.PI;
          }
          // autoPlace: nudge each actor to the nearest flat, unobstructed, dry spot (spiral search)
          const notes = [];
          if (scene.autoPlace !== false) {
            const W = window.__DEBUG.world, hf = W.heightField;
            const obstacles = W.getObstacles().filter(r => !r.dead && !r.crushed && (r.max[1] - r.min[1]) > 0.6);
            const blocked = (x, z, r = 4) => obstacles.some(o => x > o.min[0] - r && x < o.max[0] + r && z > o.min[2] - r && z < o.max[2] + r);
            const slope = (x, z) => { const d = 3; return Math.hypot(H(x + d, z) - H(x - d, z), H(x, z + d) - H(x, z - d)) / (2 * d); };
            const wet = (x, z) => hf.getWaterMaskAt ? hf.getWaterMaskAt(x, z) : 0;
            const placed = [];
            const ok = (x, z, a) => slope(x, z) < (scene.maxSlope ?? 0.16) && !blocked(x, z) && (a.allowWater || wet(x, z) < 0.3) && placed.every(p => Math.hypot(p[0] - x, p[1] - z) > 9);
            for (const a of scene.actors) {
              let best = null;
              if (ok(a.pos[0], a.pos[1], a)) best = a.pos;
              for (let ring = 1; ring < 14 && !best; ring++) for (let k = 0; k < 16 && !best; k++) {
                const ang = k / 16 * Math.PI * 2 + ring * 0.37, r = ring * 3;
                const x = a.pos[0] + Math.cos(ang) * r, z = a.pos[1] + Math.sin(ang) * r;
                if (ok(x, z, a)) best = [x, z];
              }
              if (best && (best[0] !== a.pos[0] || best[1] !== a.pos[1])) {
                const dx = best[0] - a.pos[0], dz = best[1] - a.pos[1];
                if (a.name === 'hero') scene.__heroDelta = [dx, dz];
                notes.push(`${a.name} moved ${Math.hypot(dx, dz).toFixed(1)}m`);
                for (const tr of scene.storyboard?.actorTracks ?? []) if (tr.actor === a.name) for (const k of tr.keys) k.pos = [k.pos[0] + dx, k.pos[1] + dz];
                a.pos = best;
              } else if (!best) notes.push(`${a.name} NO SPOT (slope ${slope(...a.pos).toFixed(2)})`);
              placed.push(a.pos);
            }
          }
          // driving shots: flag tracks that run into structures, water or steep ground
          {
            const W = window.__DEBUG.world, hf = W.heightField;
            const obs = W.getObstacles().filter(r => !r.dead && !r.crushed && (r.max[1] - r.min[1]) > 0.6 && r.kind !== 'bridge');
            const slope = (x, z) => { const q = 3; return Math.hypot(H(x + q, z) - H(x - q, z), H(x, z + q) - H(x, z - q)) / (2 * q); };
            for (const tr of scene.storyboard?.actorTracks ?? []) {
              const a = scene.actors.find(x => x.name === tr.actor); if (!a || tr.keys.length < 2) continue;
              const bad = [];
              for (const k of tr.keys) {
                const [x, z] = k.pos, hit = obs.find(o => x > o.min[0] - 1.6 && x < o.max[0] + 1.6 && z > o.min[2] - 1.6 && z < o.max[2] + 1.6);
                const wet = hf.getWaterMaskAt ? hf.getWaterMaskAt(x, z) : 0;
                if (hit) bad.push(`${(k.tMs / 1000).toFixed(1)}s ${hit.kind ?? 'obstacle'}`);
                else if (!a.allowWater && wet > 0.3) bad.push(`${(k.tMs / 1000).toFixed(1)}s water`);
                else if (slope(x, z) > 0.32) bad.push(`${(k.tMs / 1000).toFixed(1)}s slope ${slope(x, z).toFixed(2)}`);
              }
              if (bad.length) notes.push(`${tr.actor} PATH ${bad.slice(0, 3).join('; ')}${bad.length > 3 ? ` (+${bad.length - 3})` : ''}`);
            }
          }
          // cameras are staged in the hero frame: when autoPlace moved the hero, move every camera with it
          const d = scene.__heroDelta ?? [0, 0];
          if (d[0] || d[1]) {
            const mv = v => v && [v[0] + d[0], v[1], v[2] + d[1]];
            for (const shot of sb?.shots ?? []) { shot.pos = mv(shot.pos); shot.lookAt = mv(shot.lookAt); }
            if (scene.camera?.pos) { scene.camera.pos = mv(scene.camera.pos); scene.camera.lookAt = mv(scene.camera.lookAt); }
            for (const fx of scene.effects ?? []) if (fx.heroRel && Array.isArray(fx.at)) fx.at = [fx.at[0] + d[0], fx.at[1] + d[1]];
            notes.push(`cameras follow hero ${Math.hypot(d[0], d[1]).toFixed(1)}m`);
          }
          window.__LAB_HERO_DELTA = d;
          for (const fx of scene.effects ?? []) delete fx.heroRel;
          // ground-relative storyboard heights; dense rigs average the ground over +-groundSmooth keys (no terrain jitter)
          if (sb?.groundRel) {
            const shots = sb.shots ?? [], n = Number(sb.groundSmooth ?? 0);
            const gp = shots.map(sh => H(sh.pos[0], sh.pos[2])), gl = shots.map(sh => H(sh.lookAt[0], sh.lookAt[2]));
            const avg = (g, i) => { if (!n) return g[i]; let a = 0, c = 0; for (let j = Math.max(0, i - n); j <= Math.min(g.length - 1, i + n); j++) { a += g[j]; c++; } return a / c; };
            shots.forEach((sh, i) => {
              if (sh.absY) { delete sh.absY; return; } // absolute heights (bridge decks, cliff tops)
              sh.pos = [sh.pos[0], Math.max(avg(gp, i) + sh.pos[1], gp[i] + 0.25), sh.pos[2]];
              sh.lookAt = [sh.lookAt[0], avg(gl, i) + sh.lookAt[1], sh.lookAt[2]];
            });
          }
          if (sb) { delete sb.groundRel; delete sb.groundSmooth; }
          window.__LAB_NOTES = notes;
          return window.__STUDIO.load(scene);
        }, job.scene);
        // the resolved, absolute scene as Studio holds it (autoPlace, groundRel and format reframing applied)
        try {
          const resolved = await page.evaluate(() => window.__STUDIO.state());
          if (job.scene.meta) resolved.meta = job.scene.meta;
          // the hulls' crushes as the Studio planned them (studioCrush.ts): the film score sounds each one
          resolved.crushes = await page.evaluate(() => window.__STUDIO.crushEvents?.() ?? []);
          if (resolved.crushes.length) console.log(`[lab] ${job.name}: ${resolved.crushes.length} crushes (${[...new Set(resolved.crushes.map(c => c.kind))].join(', ')})`);
          writeFileSync(join(out, `${job.name}.resolved.json`), JSON.stringify(resolved, null, 1));
        } catch (error) { console.warn(`[lab] ${job.name}: state() failed ${error.message}`); }
        // --probe=<file>: an async function body run on the loaded scene, before any capture (stills, films and tracks
        // continue past the end of this loop body, so the probe sits here)
        if (args.probe) {
          const code = readFileSync(resolve(args.probe), 'utf8');
          const res = await page.evaluate(new Function(`return (async () => { ${code} })();`));
          console.log(`[lab] probe ${job.name}: ${JSON.stringify(res)}`);
          writeFileSync(join(out, `${job.name}.probe.json`), JSON.stringify(res, null, 1));
          if (args['probe-only']) continue;
        }
        if (args['resolve-only']) {
          // final-render prep: the resolved scene + its source (still timing, variants) and absolute variant cameras
          const hdr = await page.evaluate(() => window.__LAB_HERO_DELTA ?? [0, 0]);
          const vs = (job.scene.cameraVariants ?? []).map(v => ({ ...v, pos: [v.pos[0] + hdr[0], v.pos[1], v.pos[2] + hdr[1]], lookAt: [v.lookAt[0] + hdr[0], v.lookAt[1], v.lookAt[2] + hdr[1]] }));
          for (const v of vs) {
            const kf = !args.format || args.format === 'landscape' ? 1 : args.format === 'portrait' ? 16 / 9 * Number(args['lens-k'] ?? 0.82) : Number(args['lens-k'] ?? 1.12);
            const fovR = 2 * Math.atan(Math.tan(v.fov * Math.PI / 360) * kf) * 180 / Math.PI;
            await page.evaluate(c => window.__STUDIO.setCamera(c), { pos: v.pos, lookAt: v.lookAt, fov: fovR, rollDeg: v.rollDeg ?? 0, groundRel: v.groundRel ?? false });
            const absCamera = await page.evaluate(() => { try { return window.__STUDIO.getCamera(); } catch { return null; } });
            results.push({ map, name: job.name, tag: v.name, absCamera });
          }
          writeFileSync(join(out, `${job.name}.scene.json`), JSON.stringify(job.scene, null, 1));
          const rnotes = await page.evaluate(() => window.__LAB_NOTES ?? []);
          console.log(`[lab] ${job.name}: resolved${vs.length ? ` + ${vs.length} variant cameras` : ''}${rnotes.length ? ' · ' + rnotes.join(', ') : ''}`);
          continue;
        }
        if (args.track && job.scene.storyboard) {
          // screen-space track of every actor per frame (no rendering): drives tracked callouts in the edit
          const fps = Number(args.fps ?? 30), dur = job.scene.storyboard.durationMs, frames = Math.round(dur / 1000 * fps);
          const track = [];
          await page.evaluate(() => window.__STUDIO.advanceFrame(0));
          for (let f = 0; f < frames; f++) {
            if (f) await page.evaluate(target => window.__STUDIO.advanceFrame(target - window.__STUDIO.fxTimeMs), f * 1000 / fps);
            track.push(await page.evaluate(() => {
              const D = window.__DEBUG, cam = D.camera, W = D.world, v = cam.position.clone();
              cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
              return window.__STUDIO.listActors().map(a => {
                const y = W.heightField.getHeightAt(a.pos[0], a.pos[1]);
                const pts = [[0, 1.2, 0], [0, 2.6, 0], [0, 0.2, 0]].map(([dx, dy, dz]) => v.set(a.pos[0] + dx, y + dy, a.pos[1] + dz).project(cam).toArray());
                const [c, top, bot] = pts;
                return { name: a.name, id: a.id, x: +((c[0] + 1) / 2).toFixed(4), y: +((1 - c[1]) / 2).toFixed(4), top: +((1 - top[1]) / 2).toFixed(4), bot: +((1 - bot[1]) / 2).toFixed(4), z: +c[2].toFixed(4),
                  dist: +Math.hypot(a.pos[0] - cam.position.x, y + 1.2 - cam.position.y, a.pos[1] - cam.position.z).toFixed(1), state: a.state };
              });
            }));
          }
          writeFileSync(join(out, `${job.name}.track.json`), JSON.stringify({ fps, frames, aspect: ASPECT, track }));
          console.log(`[lab] ${job.name}: track ${frames} frames`);
          continue;
        }
        if (args.stills && job.scene.still && job.scene.storyboard) {
          // still preview at timeline tMs; with exposureMs, average K captures across the open shutter
          // (linear light) as a stand-in for the film renderer's motion-blur still
          const st = job.scene.still, E = Math.max(0, Number(st.exposureMs ?? 0));
          const K = E >= 12 ? Math.max(2, Number(args["blur-samples"] ?? 10)) : 1;
          const t0 = Math.max(0, Math.round(st.tMs - E / 2));
          await page.evaluate(() => window.__STUDIO.seek?.(0));
          await prepareView(null);
          await page.evaluate(() => window.__STUDIO.advanceFrame(0));
          await page.evaluate(t0 => { const S = window.__STUDIO; let guard = 0; while (S.fxTimeMs < t0 && guard++ < 2000) S.advanceFrame(Math.min(33, t0 - S.fxTimeMs)); }, t0);
          await page.evaluate(async () => { const D = window.__DEBUG; for (let j = 0; j < 64; j++) { if (!D.world.warmTerrainLookahead(D.camera.position, 1)) break; await new Promise(r => requestAnimationFrame(r)); } D.world.update(0, D.camera.position); for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r)); });
          const CW = Number(args['cap-width'] ?? WIDTH), CH = Math.round(CW / ASPECT);
          const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
          let acc = null, prev = t0;
          const cv = createCanvas(CW, CH), g2 = cv.getContext('2d');
          for (let k = 0; k < K; k++) {
            const tk = K > 1 ? t0 + Math.round(k * E / (K - 1)) : t0;
            if (tk > prev) await page.evaluate(ms => window.__STUDIO.advanceFrame(ms), tk - prev);
            prev = tk;
            const cap = await capture(CW, CH);
            if (K === 1) { save(join(out, `${job.name}__still.png`), cap); break; }
            const im = await loadImage(Buffer.from(cap.dataURL.split(',')[1], 'base64'));
            g2.drawImage(im, 0, 0, CW, CH);
            const px = g2.getImageData(0, 0, CW, CH).data;
            if (!acc) acc = new Float32Array(px.length);
            for (let i = 0; i < px.length; i += 4) { acc[i] += lin[px[i]]; acc[i + 1] += lin[px[i + 1]]; acc[i + 2] += lin[px[i + 2]]; }
          }
          if (acc) {
            const outData = g2.createImageData(CW, CH), o = outData.data;
            for (let i = 0; i < o.length; i += 4) for (let c = 0; c < 3; c++) { const v = acc[i + c] / K; o[i + c] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); o[i + 3] = 255; }
            g2.putImageData(outData, 0, 0);
            writeFileSync(join(out, `${job.name}__still.png`), cv.toBuffer('image/png'));
          }
          results.push({ map, name: job.name, tag: E ? `still ${Math.round(1000 / E) > 1 ? '1/' + Math.round(1000 / E) : E + 'ms'} s` : 'still', file: join(out, `${job.name}__still.png`) });
          writeFileSync(join(out, `${job.name}.scene.json`), JSON.stringify(job.scene, null, 1));
          const notes = await page.evaluate(() => window.__LAB_NOTES ?? []);
          console.log(`[lab] ${job.name}: still t=${st.tMs} E=${E}ms K=${K}${notes.length ? ' · ' + notes.join(', ') : ''}`);
          continue;
        }
        if (args.film && job.scene.storyboard) {
          const fps = Number(args.fps ?? 30), dur = job.scene.storyboard.durationMs, frames = Math.round(dur / 1000 * fps);
          const dir = join(out, `${job.name}-frames`); mkdirSync(dir, { recursive: true });
          await page.evaluate(() => window.__STUDIO.seek?.(0));
          await prepareView(null);
          // --film-frames=N: review sheets only (N evenly spaced captures; the timeline still steps every frame)
          const sparse = args['film-frames'] ? Number(args['film-frames']) : 0;
          const want = sparse ? new Set(Array.from({ length: sparse }, (_, i) => Math.round(i * (frames - 1) / Math.max(1, sparse - 1)))) : null;
          for (let f = 0; f < frames; f++) {
            if (f) await page.evaluate(target => window.__STUDIO.advanceFrame(target - window.__STUDIO.fxTimeMs), f * 1000 / fps);
            else await page.evaluate(() => window.__STUDIO.advanceFrame(0));
            if (want && !want.has(f)) continue;
            if (f % 15 === 0 || want) await page.evaluate(async () => { const D = window.__DEBUG; for (let j = 0; j < 24; j++) { if (!D.world.warmTerrainLookahead(D.camera.position, 1)) break; await new Promise(r => requestAnimationFrame(r)); } });
            save(join(dir, `f${String(f).padStart(5, '0')}.png`), await capture(WIDTH, HEIGHT));
          }
          const mp4 = join(out, `${job.name}.mp4`);
          const { execFileSync } = await import('node:child_process');
          if (!want) execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f%05d.png'), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', mp4]);
          for (const k of want ? [...want].sort((a, b) => a - b) : [0, Math.floor(frames / 3), Math.floor(2 * frames / 3), frames - 1]) results.push({ map, name: job.name, tag: `f${k}`, file: join(dir, `f${String(k).padStart(5, '0')}.png`) });
          writeFileSync(join(out, `${job.name}.scene.json`), JSON.stringify(job.scene, null, 1));
          const fnotes = await page.evaluate(() => window.__LAB_NOTES ?? []);
          console.log(`[lab] ${job.name}: film ${frames} frames -> ${mp4}${fnotes.length ? ' · ' + fnotes.join(', ') : ''}`);
          continue;
        }
        if (args.ui) {
          // UI screenshots: the live page (3D view + Studio panel) as a visitor sees it
          await prepareView(null);
          for (let k = 0; k < 3; k++) await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
          const shotFile = join(out, `${job.name}__ui.png`);
          await page.screenshot({ path: shotFile, type: 'png' });
          results.push({ map, name: job.name, tag: 'ui', file: shotFile });
          console.log(`[lab] ${job.name}: ui screenshot`);
          if (args['ui-only']) continue;
        }
        const notes = await page.evaluate(() => window.__LAB_NOTES ?? []);
        if (notes.length) console.log(`[lab] ${job.name}: ${notes.join(', ')}`);
        const hd = await page.evaluate(() => window.__LAB_HERO_DELTA ?? [0, 0]);
        const shiftV = v => v && (hd[0] || hd[1]) ? { ...v, pos: [v.pos[0] + hd[0], v.pos[1], v.pos[2] + hd[1]], lookAt: [v.lookAt[0] + hd[0], v.lookAt[1], v.lookAt[2] + hd[1]] } : v;
        const variants = (job.variants ?? job.scene.cameraVariants ?? [null]).map(shiftV);
        for (const [i, v] of variants.entries()) {
          const reframeFov = fov => {
            if (!args.format || args.format === 'landscape') return fov;
            const k = args.format === 'portrait' ? 16 / 9 * Number(args['lens-k'] ?? 0.82) : 1.0 * Number(args['lens-k'] ?? 1.12);
            return 2 * Math.atan(Math.tan(fov * Math.PI / 360) * k) * 180 / Math.PI;
          };
          const pull = (p, l) => { const k = Number(args.pull ?? 1); return k === 1 ? p : p.map((x, i) => l[i] + (x - l[i]) * k); };
          const cam = v ? { pos: pull(v.pos, v.lookAt), lookAt: v.lookAt, fov: reframeFov(v.fov), rollDeg: v.rollDeg ?? 0, groundRel: v.groundRel ?? false } : null;
          await prepareView(cam);
          const tag = v?.name ?? (v ? `v${i + 1}` : 'main');
          const sight = await page.evaluate(() => {
            const D = window.__DEBUG, W = D.world, cam = D.camera.position;
            const hero = window.__STUDIO.listActors()[0]; if (!hero) return null;
            // the hull's own height (a viaduct's deck, not the gorge under it; 2026-10-08), the ground when unknown
            const H = Number.isFinite(hero.y) ? hero.y : W.heightField.getHeightAt(hero.pos[0], hero.pos[1]);
            const tx = hero.pos[0] - cam.x, ty = H + 1.8 - cam.y, tz = hero.pos[1] - cam.z, d = Math.hypot(tx, ty, tz);
            const o = cam.clone(), dir = cam.clone().set(tx / d, ty / d, tz / d);
            const hit = W.raycast(o, dir, d);
            return { dist: +d.toFixed(1), hit: hit ? +hit.dist.toFixed(1) : null, kind: hit?.kind ?? null, occluded: !!hit && hit.dist < d - 4 };
          });
          const CW = Number(args['cap-width'] ?? WIDTH), CH = Math.round(CW / ASPECT);
          const file = save(join(out, `${job.name}__${tag}.png`), await capture(CW, CH));
          const absCamera = await page.evaluate(() => { try { return window.__STUDIO.getCamera(); } catch { return null; } });
          results.push({ map, name: job.name, tag, file, camera: cam ?? job.scene.camera, absCamera, site: job.site ?? null, sight });
        }
        writeFileSync(join(out, `${job.name}.scene.json`), JSON.stringify({ ...job.scene, cameraVariants: job.variants ?? job.scene.cameraVariants }, null, 1));
        console.log(`[lab] ${job.name}: ${variants.length} frame(s)`);
      } catch (error) {
        console.error(`[lab] ${job.name} FAILED ${error.message}`);
        results.push({ map, name: job.name, error: String(error.message) });
        if (timedOut(error)) { wedged = true; console.error('[lab] the browser stopped answering; the run ends here, the rest for a fresh browser'); }
      } finally {
        if (PER_JOB) lock.release();
        else if (BUDGET_MS && holding && Date.now() - heldSince >= BUDGET_MS) { lock.release(); holding = false; console.log(`[lab] lease released ${new Date().toTimeString().slice(0, 8)} (budget)`); }
      }
    }
    } finally { if (PER_MAP && holding && (!BUDGET_MS || Date.now() - heldSince >= BUDGET_MS)) { lock.release(); holding = false; } }
  }
  if (errors.length) writeFileSync(join(out, 'page-errors.txt'), errors.join('\n'));
} finally {
  await browser?.close().catch(() => {}); await server?.close().catch(() => {});
  clearInterval(lease); lock.release();
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
if (wedged) process.exitCode = 3;
else if (stopping) process.exitCode = 143;

// --- contact sheets: one per job (variants in a row-major grid) -----------------
const byJob = new Map();
for (const r of results.filter(r => r.file)) { if (!byJob.has(r.name)) byJob.set(r.name, []); byJob.get(r.name).push(r); }
const groups = args['sheet-by'] === 'map'
  ? [...new Set(results.map(r => r.map))].map(m => [m, results.filter(r => r.file && r.map === m)])
  : [...byJob.entries()];
for (const [key, rows] of groups) {
  const cols = Number(args.cols ?? 4), tw = Number(args.tile ?? 480), th = Math.round(tw / ASPECT), lab = 22;
  const n = rows.length, rcount = Math.ceil(n / cols);
  const c = createCanvas(cols * tw, rcount * (th + lab)), g = c.getContext('2d');
  g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height); g.font = 'bold 15px sans-serif';
  for (const [i, r] of rows.entries()) {
    const im = await loadImage(readFileSync(r.file)); const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + lab);
    g.drawImage(im, x, y, tw - 3, th); g.fillStyle = r.sight?.occluded ? '#ff5050' : '#ffd27a'; g.fillText(`${args['sheet-by'] === 'map' ? r.name.replace(r.map + '-', '') + ' · ' : ''}${r.tag}${r.sight ? ` · ${r.sight.dist}m${r.sight.occluded ? ' BLOCKED ' + r.sight.hit + 'm ' + r.sight.kind : ''}` : ''}`, x + 6, y + th + 16);
  }
  writeFileSync(join(out, `sheet-${key}.jpg`), c.toBuffer('image/jpeg', 84));
}
console.log(`[lab] done: ${results.filter(r => r.file).length} frames, ${results.filter(r => r.error).length} failures -> ${out}`);
