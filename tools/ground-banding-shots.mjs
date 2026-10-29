// tools/ground-banding-shots.mjs — the ground at battle range, staged identically on every map (item 264, the owner
// 2026-10-28: "weird parallel lines on ground (steinburg) … on all maps").
//
//   node tools/ground-banding-shots.mjs --out=<dir> [--maps=a,b] [--dist=<built dist>] [--root=<checkout>]
//        [--device=desktop|phone] [--variants=base,noland] [--poses-from=<manifest.json | run dir>] [--tag=<t>]
//
// One page and one render-class ticket a run (tools/capture-lock.mjs): each map is staged on the page while the ticket
// waits (acquire's prepare; its battlefield shot, __SHOTS.set, the pinned scene), and the hold is its shots alone — at
// its poses:
//   chase   — the battle's own chase rig (cameraRig snapArcade, the default 13 m orbit step) behind the staged hull,
//             pitched a little down: the camera the owner's Steinburg frame was taken from;
//   field-N — the same camera class (3.4 m over the ground, 12 m back) over the nearest worked field of the map's
//             land use (landUse.ts, through the height field's _landUseAt) in each of two crop groups — the turned and
//             row-crop fields, then the stubble, hay, vines, red earth, sunflower and rice — looking across its rows,
//             where a ruled period stands as bands on the screen. A map without a land use has no field poses.
// `noland` adds the same frame with the land use's strength at 0 (the material's uLandA.x, through the renderer's own
// uniforms of the terrain program): the A/B that names the land use as the term drawing a band, or clears it.
// `--poses-from` re-uses a reference run's field points (a manifest, or every manifest*.json of a run's directory), so a
// before and an after are posed on the same ground.
// Frames land in <out>/frames/<map>-<pose>-<variant>.png; every map's receipt in <out>/manifest[-<tag>].json (a run
// resumes; a tag per process lets several batches queue at once, each its own ticket, into one directory).
import { launchGuardedBrowser, setBrowserGuardContext } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { freezePage, startViteChild, thawPage } from './capture-hold.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { isMainModule, mapProbeLaunchOptions, resolveGroundPose, sleep } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { censusShotView } from './visual-census.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';

const TOOL = 'ground-banding-shots';
const DEVICES = Object.freeze({
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, query: 'tier=desktop', preset: 'high' },
  phone: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, query: 'tier=mobile', preset: null },
});
// the land use's crop ids (landUse.ts LAND_CROP): plough 4 and row crop 7 first, then the other ruled crops
const FIELD_GROUPS = Object.freeze([[7, 4], [5, 13, 12, 11, 6, 9]]);

function parse(argv) {
  const out = { maps: null, root: process.cwd(), dist: null, out: null, device: 'desktop', variants: ['base'], posesFrom: null,
    waitHours: 10, tag: null };
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    const [, key, value] = m;
    if (key === 'out') out.out = path.resolve(value);
    else if (key === 'maps') out.maps = value.split(',').filter(Boolean);
    else if (key === 'root') out.root = path.resolve(value);
    else if (key === 'dist') out.dist = path.resolve(value);
    else if (key === 'device') out.device = value;
    else if (key === 'variants') out.variants = value.split(',').filter(Boolean);
    else if (key === 'poses-from') out.posesFrom = path.resolve(value);
    else if (key === 'wait-hours') out.waitHours = Number(value);
    else if (key === 'tag') out.tag = value;
    else throw new Error(`unknown flag --${key}`);
  }
  if (!out.out) throw new Error('--out=<dir> is required');
  if (!DEVICES[out.device]) throw new Error(`unknown device ${out.device}`);
  for (const id of out.maps ?? []) if (!MAP_IDS.includes(id)) throw new Error(`unknown map ${id}`);
  for (const v of out.variants) if (v !== 'base' && v !== 'noland') throw new Error(`unknown variant ${v}`);
  out.dist ??= path.join(out.root, 'dist');
  if (!existsSync(path.join(out.dist, 'index.html'))) throw new Error(`${out.dist} has no build: npm run build first`);
  return out;
}

function stamp() { return new Date().toISOString().slice(11, 19); }

function pageStage() {
  const D = window.__DEBUG, player = D.game.player, world = D.world, f = world.getMinimapFeatures();
  return {
    mapId: world?.mapId ?? null,
    player: player?.state ? { x: player.state.pos.x, z: player.state.pos.z, yaw: player.state.yaw } : null,
    buildings: f.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w || 0, d: b.d || 0 })),
    landUse: typeof world.heightField?._landUseAt === 'function',
  };
}

/** The nearest worked field of each crop group round the staged hull (page side: the land use's CPU twin). */
function pageFieldPoints({ player, buildings, groups }) {
  const hf = window.__DEBUG.world.heightField;
  if (typeof hf._landUseAt !== 'function') return [];
  const s = {}, found = groups.map(() => null), h = (x, z) => hf.getHeightAt(x, z);
  for (let r = 24; r <= 440 && !found.every(Boolean); r += 6) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI, x = player.x + Math.sin(a) * r, z = player.z + Math.cos(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) continue;
      hf._landUseAt(x, z, s);
      if (!s.active || s.edgeM < 14) continue;
      // (the land use's twin knows no roads or villages: the material keeps the fields off both — an urban land use's lots
      // lie inside its village)
      if (hf._roadDist(x, z) < 16 || (!s.urban && hf._villageMask(x, z) > 0.05)) continue;
      const g = groups.findIndex((list) => list.includes(s.crop));
      if (g < 0 || found[g]) continue;
      const y = h(x, z);
      if ([[6, 0], [-6, 0], [0, 6], [0, -6]].some(([dx, dz]) => Math.abs(h(x + dx, z + dz) - y) > 0.9)) continue;
      if (buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 28 + Math.max(b.w, b.d) / 2)) continue;
      found[g] = { x, z, crop: s.crop, rowX: s.rowX, rowZ: s.rowZ, edgeM: s.edgeM, id: s.id };
    }
  }
  return found.filter(Boolean);
}

/** A field point's pose: 12 m back across its rows, 3.4 m over the ground, looking 28 m on across them. */
function fieldPose(pt) {
  const ax = -pt.rowZ, az = pt.rowX;
  return { cam: [pt.x - ax * 12, 3.4, pt.z - az * 12], at: [pt.x + ax * 28, 1.2, pt.z + az * 28], fov: 55 };
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

function externalPoseScript(pose) {
  return `(() => {
    const resolveGroundPose = ${resolveGroundPose.toString()};
    const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
    const resolved = resolveGroundPose(${JSON.stringify({ cam: pose.cam, at: pose.at })}, (x, z) => hf.getHeightAt(x, z), 511, ${pose.fov});
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

/** The terrain program's land-use strength (uLandA.x) on every material that has one; null restores it. */
function pageSetLandStrength(value) {
  const D = window.__DEBUG, props = D.renderer.properties;
  let n = 0;
  D.scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      const u = props.get(m)?.uniforms?.uLandA;
      if (!u) continue;
      if (u.value.__base == null) u.value.__base = u.value.x;
      u.value.x = value == null ? u.value.__base : value;
      n++;
    }
  });
  return n;
}

/** One game page booted to ready on the device's tier, the pinned scene's tank in storage before boot. */
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

/** Stage `mapId` on the page (its battlefield shot, the pinned scene; again after a re-warm reloaded the page). */
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

async function shootMap(entry, options, frames, reference) {
  const { page, mapId, stage } = entry;
  await page.bringToFront();
  await sleep(1500);
  const points = reference?.fields
    ?? (stage.landUse ? await page.evaluate(pageFieldPoints, { player: stage.player, buildings: stage.buildings, groups: FIELD_GROUPS }) : []);
  const poses = [{ name: 'chase', kind: 'chase' }, ...points.map((pt, i) => ({ name: `field${i + 1}`, kind: 'field', pt }))];
  const receipt = { player: stage.player, landUse: stage.landUse, fields: points, poses: {}, preset: null };
  receipt.preset = await page.evaluate(() => window.__DEBUG.quality?.preset ?? window.__DEBUG.preset ?? null).catch(() => null);
  for (const pose of poses) {
    const resolved = pose.kind === 'chase'
      ? await page.evaluate(chasePoseScript(stage.player.yaw))
      : await page.evaluate(externalPoseScript(fieldPose(pose.pt)));
    await sleep(1800);
    const shots = {};
    for (const variant of options.variants) {
      const n = await page.evaluate(pageSetLandStrength, variant === 'noland' ? 0 : null);
      await sleep(700);
      const file = path.join(frames, `${mapId}-${pose.name}-${variant}.png`);
      await page.screenshot({ path: file, type: 'png' });
      shots[variant] = { file: path.basename(file), landMaterials: n };
    }
    await page.evaluate(pageSetLandStrength, null);
    receipt.poses[pose.name] = { resolved, crop: pose.pt?.crop ?? null, shots };
  }
  receipt.errors = entry.errors.splice(0);
  return receipt;
}

/** A reference run's receipts: one manifest, or every manifest*.json of a run's directory merged. */
function readReference(file) {
  const files = statSync(file).isDirectory()
    ? readdirSync(file).filter((name) => /^manifest.*\.json$/.test(name)).map((name) => path.join(file, name)) : [file];
  const maps = {};
  for (const f of files) Object.assign(maps, JSON.parse(readFileSync(f, 'utf8')).maps);
  return { maps };
}

async function main(argv) {
  const options = parse(argv);
  const frames = path.join(options.out, 'frames');
  mkdirSync(frames, { recursive: true });
  const manifestFile = path.join(options.out, options.tag ? `manifest-${options.tag}.json` : 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8'))
    : { tool: TOOL, device: options.device, dist: options.dist, maps: {} };
  const reference = options.posesFrom ? readReference(options.posesFrom) : null;
  const todo = (options.maps ?? [...MAP_IDS]).filter((id) => !manifest.maps[id]);
  if (!todo.length) { console.log(`[${TOOL}] every requested map is already in ${manifestFile}`); return 0; }
  // One page and one render-class ticket for the run. Each map is staged while the ticket waits (acquire's `prepare`:
  // a warming ticket is passed over, so the staging holds nobody up), the page is frozen until the lock is held, and
  // the hold is that map's shots alone (~20 s); the next map re-enters under the same ticket, its first place.
  // (2026-10-28: three 1080p map pages in one browser passed the guard's 10 GB tree cap; staging inside a hold took
  // past puppeteer's 15-minute protocol timeout at load 400 and held a render slot all the while.)
  const label = `${TOOL} ${options.device} ${path.basename(options.out)}`;
  setBrowserGuardContext({ hold: label });
  const lock = createCaptureLock();
  const server = await startViteChild({ root: options.root, mode: 'preview', outDir: options.dist });
  const d = DEVICES[options.device];
  const browser = await launchGuardedBrowser(puppeteer, { ...mapProbeLaunchOptions({ width: d.width, height: d.height, protocolTimeout: 2700000 }), timeout: 180000 });
  let held = false;
  const close = async () => { if (held) lock.release(); held = false; await browser.close().catch(() => {}); await server.close(); };
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.once(signal, async () => { console.log(`[${label}] ${signal}: releasing and closing`); await close(); process.exit(143); });
  }
  try {
    const entry = await bootPage(browser, server.url, options.device);
    let ticket = null, session = null;
    for (const mapId of todo) {
      const queued = Date.now();
      await lock.acquire(options.waitHours * 3600 * 1000, {
        ticket, place: ticket ? null : `${TOOL}:${path.basename(options.out)}:${options.device}:${options.tag ?? ''}`,
        lockClass: 'render',
        prepare: async () => {
          if (session) { await thawPage(entry.page, session); session = null; }
          await stageMap(entry, mapId);
          session = await freezePage(entry.page);
        },
      });
      held = true;
      ticket = lock.lastTicket;
      const started = Date.now();
      if (session) { await thawPage(entry.page, session); session = null; }
      // (a page that lost its world while frozen is staged again, inside the hold)
      const live = await entry.page.evaluate(() => window.__DEBUG?.world?.mapId ?? null).catch(() => null);
      if (live !== mapId) await stageMap(entry, mapId);
      const receipt = await shootMap({ ...entry, mapId }, options, frames, reference?.maps?.[mapId] ?? null);
      receipt.ms = Date.now() - started;
      receipt.queuedMs = started - queued;
      session = await freezePage(entry.page);
      lock.release();
      held = false;
      manifest.maps[mapId] = receipt;
      writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`[${label}] ${stamp()} ${mapId} shot in ${(receipt.ms / 1000).toFixed(1)} s after ${(receipt.queuedMs / 60000).toFixed(1)} min `
        + `staging and queueing (${Object.keys(receipt.poses).join(',')})`);
    }
  } finally {
    await close();
  }
  const missing = todo.filter((id) => !manifest.maps[id]);
  if (missing.length) { console.log(`[${TOOL}] not shot (rerun to resume): ${missing.join(',')}`); return 1; }
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
