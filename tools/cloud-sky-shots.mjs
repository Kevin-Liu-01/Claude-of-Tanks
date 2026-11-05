// tools/cloud-sky-shots.mjs — every map's sky and every Garage yard's sky, staged identically on every build
// (item clouds-269, the owner 2026-11-04: "many clouds i see are in perfect lines or grrid which is noot like real cloud
// patterns … just make clouds more natural and also less prism-y").
//
//   node tools/cloud-sky-shots.mjs --out=<dir> --jobs=<jobs.json> [--root=<checkout>] [--tag=v1] [--wait-hours=16]
//
// jobs.json: [{ "name": "before-desktop", "dist": "<built dist>", "device": "desktop" | "phone",
//               "maps": ["verdant", ...], "garage": ["verdant_motor_pool", ...], "poses": ["battle", "horizon", "high"] }]
//
// The harness is tools/ground-surface-shots.mjs's (item ground-269): one render-class ticket, the first unit staged while
// it waits, checkpoint() between units; units run job by job, each on a fresh page, the whole unit (its staging too)
// within ten minutes. A unit is a map (its battle, under
// the pinned scene and a day sky) or a Garage yard (its opening view). Poses of a map:
//   battle  — the battle's chase rig (cameraRig snapArcade, the 13 m orbit step) behind the staged hull, pitched 12° up:
//             the sky the driver sees over the battlefield;
//   horizon — 6 m over the hull, looking along its heading 7° over the horizon at a 70° lens: the field receding to the
//             horizon, where a lattice or a row reads first (the owner's second shot);
//   high    — the same eye turned 35° off the heading, 35° up: the field overhead, its plan.
// The volumetric layer is put at scene time 0 and settled (settleForCapture) and frozen for each frame, so every build
// draws the same drift; the phone tier draws its baked decks. Frames land in <out>/<job>/frames/<unit>-<pose>.webp (q92) and
// every unit's receipt in <out>/<job>/manifest-<tag>.json (a run resumes).
import { launchGuardedBrowser, setBrowserGuardContext } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { freezePage, startViteChild, thawPage } from './capture-hold.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { isMainModule, mapProbeLaunchOptions, sleep } from './map-probe-runtime.mjs';
import { settleMapTextures } from './map-environment-acquisition.mjs';
import { PINNED_SCENE, configurePinnedScene } from './pinned-scene-acquisition.mjs';
import { censusShotView } from './visual-census.mjs';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';

const TOOL = 'cloud-sky-shots';
const DEVICES = Object.freeze({
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, query: 'tier=desktop', preset: 'high' },
  phone: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, query: 'tier=mobile', preset: null },
});
const POSES = Object.freeze(['battle', 'horizon', 'high']);

function parse(argv) {
  const out = { root: process.cwd(), out: null, jobs: null, waitHours: 16, tag: 'v1' };
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    const [, key, value] = m;
    if (key === 'out') out.out = path.resolve(value);
    else if (key === 'jobs') out.jobs = path.resolve(value);
    else if (key === 'root') out.root = path.resolve(value);
    else if (key === 'wait-hours') out.waitHours = Number(value);
    else if (key === 'tag') out.tag = value;
    else throw new Error(`unknown flag --${key}`);
  }
  if (!out.out || !out.jobs) throw new Error('--out=<dir> and --jobs=<jobs.json> are required');
  out.jobs = JSON.parse(readFileSync(out.jobs, 'utf8'));
  for (const job of out.jobs) {
    job.dist = path.resolve(job.dist);
    job.maps ??= [];
    job.garage ??= [];
    job.poses ??= [...POSES];
    if (!DEVICES[job.device]) throw new Error(`${job.name}: unknown device ${job.device}`);
    for (const id of job.maps) if (!MAP_IDS.includes(id)) throw new Error(`${job.name}: unknown map ${id}`);
    for (const p of job.poses) if (!POSES.includes(p)) throw new Error(`${job.name}: unknown pose ${p}`);
    if (!existsSync(path.join(job.dist, 'index.html'))) throw new Error(`${job.dist} has no build`);
  }
  return out;
}

function stamp() { return new Date().toISOString().slice(11, 19); }

/** Free space on the data volume (GB): no unit is staged under the lanes' 30 GB floor. */
const DISK_FLOOR_GB = 30;
function freeGb(dir) {
  const s = statfsSync(dir);
  return (s.bavail * s.bsize) / 1e9;
}

/** The staged hull (page side). */
function pageStage() {
  const D = window.__DEBUG, player = D.game.player, world = D.world;
  return {
    mapId: world?.mapId ?? null,
    player: player?.state ? { x: player.state.pos.x, z: player.state.pos.z, yaw: player.state.yaw } : null,
    regime: D.scene.userData.volumetricClouds?.currentPreset?.regime ?? null,
  };
}

/** The staged map's authored cloudscape regime and the regime the volumetric layer draws (visual-census.mjs's gate). */
function pageCloudscapeState() {
  const D = window.__DEBUG, config = D.world?.config ?? {}, vc = D.scene.userData.volumetricClouds;
  return { mapId: D.world?.mapId ?? null, layer: !!vc, authored: config.clouds?.regime ?? config.sky?.cloudscape?.regime ?? null,
    regime: vc?.currentPreset?.regime ?? null };
}
const cloudscapeReady = (s) => !s.layer || !s.authored || !s.regime || s.regime === s.authored;

/** The cloud layer at scene time 0, settled over this camera and frozen (null where the tier has none). */
function pageSettleClouds() {
  const D = window.__DEBUG, vc = D.scene.userData.volumetricClouds;
  if (!vc) return null;
  vc.frozen = false;
  vc.setCaptureTime(0, true);
  vc.resetHistory();
  const ran = vc.settleForCapture(D.camera);
  vc.frozen = true;
  return { ran, regime: vc.currentPreset?.regime ?? null };
}

function pageThawClouds() {
  const vc = window.__DEBUG.scene.userData.volumetricClouds;
  if (vc) vc.frozen = false;
}

/**
 * A sky pose from the hull: `eye` m over its ground, `elev` radians over the horizon, along its heading (`antiSun`
 * false: turned a quarter away when the heading is within 60° of the sun) or with the sun at the back, `yawOff` further.
 */
function pageSkyPose({ player, eye, yawOff, elev, fov, antiSun }) {
  const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
  const y = hf.getHeightAt(player.x, player.z) + eye;
  const L = D.lighting.csm?.lightDirection, away = L ? Math.atan2(L.x, L.z) : player.yaw + Math.PI;
  const toSun = Math.cos(player.yaw - (away + Math.PI));
  const a = (antiSun ? away : toSun > 0.5 ? player.yaw + Math.PI / 2 : player.yaw) + yawOff, c = Math.cos(elev);
  const cam = new V(player.x, y, player.z);
  const at = new V(player.x + Math.sin(a) * c * 1000, y + Math.sin(elev) * 1000, player.z + Math.cos(a) * c * 1000);
  D.rig.setExternalPose(cam, at, fov);
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  D.lighting.updateFrustums();
  D.lighting.update(true);
  return { cam: cam.toArray(), at: at.toArray(), fov };
}

function pageBattlePose({ yaw }) {
  const D = window.__DEBUG, V = D.camera.position.constructor;
  D.rig.snapArcade(2, yaw, 0.21);
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  D.lighting.updateFrustums();
  D.lighting.update(true);
  return { cam: D.camera.position.toArray(), dir: D.camera.getWorldDirection(new V()).toArray(), fov: D.camera.fov };
}

async function bootPage(browser, baseUrl, device, garageVariant = null) {
  const page = await browser.newPage();
  const errors = [];
  const d = DEVICES[device];
  await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch });
  await page.evaluateOnNewDocument((spec, preset, variant) => {
    try {
      localStorage.setItem(spec.storageKey, spec.playerSpecId);
      if (preset) localStorage.setItem('cot.gfxPreset', preset);
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
      if (variant) localStorage.setItem('cot.garage.variant', variant);
    } catch { /* the boot checks below fail loudly */ }
  }, PINNED_SCENE, d.preset, garageVariant);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon') && !text.startsWith('Failed to load resource')) errors.push(text.slice(0, 300));
  });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?nosplash=1&${d.query}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  return { page, errors, stage: null };
}

async function stageUnit(entry, unit) {
  const { page } = entry;
  await page.bringToFront();
  await page.waitForFunction('window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG', { timeout: 900000, polling: 1000 });
  if (unit.kind === 'garage') {
    await page.waitForFunction((id) => {
      const s = window.__GARAGE_WORKSHOP?.stats();
      return s?.selected === id && s?.architecture?.ready === true && s.architecture.presented === true;
    }, { timeout: 600000, polling: 500 }, unit.id);
    entry.stage = { garage: unit.id };
  } else {
    await page.evaluate(configurePinnedScene, PINNED_SCENE);
    const set = (id) => page.evaluate((name) => window.__SHOTS.set(name), censusShotView(id));
    await set(unit.id);
    // the cloudscape gate: the first battle of a page draws the boot's deck derivation until the lazy cloudscape module
    // is in; a throwaway warm-up map, then this one, applies this map's sky afresh (visual-census.mjs stageMap)
    const awaitScape = async () => { let st; for (let t = 0; t < 60; t++) { st = await page.evaluate(pageCloudscapeState); if (cloudscapeReady(st)) break; await sleep(250); } return st; };
    let scape = await awaitScape();
    if (!cloudscapeReady(scape)) {
      await set(unit.id === 'desert' ? 'verdant' : 'desert');
      await set(unit.id);
      scape = await awaitScape();
      if (!cloudscapeReady(scape)) throw new Error(`${unit.id}: the layer draws '${scape.regime}', not the authored '${scape.authored}'`);
    }
    await page.evaluate(settleMapTextures, { mapId: unit.id, timeoutMs: 600000 });
    await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
    const stage = await page.evaluate(pageStage);
    if (stage.mapId !== unit.id) throw new Error(`staged ${stage.mapId}, expected ${unit.id}`);
    entry.stage = { ...stage, cloudscape: scape };
  }
  entry.unit = unit;
}

async function frame(page, file) {
  const clouds = await page.evaluate(pageSettleClouds);
  await sleep(600);
  // (Main, 2026-11-04, the disk: WebP at q92, the same encoding on every build so a pair stays matched)
  await page.screenshot({ path: file, type: 'webp', quality: 92 });
  await page.evaluate(pageThawClouds);
  return clouds;
}

async function shootUnit(entry, options, frames) {
  const { page, unit, stage } = entry;
  await page.bringToFront();
  await sleep(1500);
  const receipt = { stage, poses: {} };
  if (unit.kind === 'garage') {
    const file = path.join(frames, `garage-${unit.id}-yard.webp`);
    receipt.poses.yard = { clouds: await frame(page, file), file: path.basename(file) };
  } else {
    for (const name of options.poses) {
      const resolved = name === 'battle' ? await page.evaluate(pageBattlePose, { yaw: stage.player.yaw })
        : await page.evaluate(pageSkyPose, name === 'horizon'
          ? { player: stage.player, eye: 6, yawOff: 0, elev: 0.122, fov: 70 }
          : { player: stage.player, eye: 6, yawOff: 0.35, elev: 0.61, fov: 70, antiSun: true });
      await sleep(900);
      const file = path.join(frames, `${unit.id}-${name}.webp`);
      receipt.poses[name] = { resolved, clouds: await frame(page, file), file: path.basename(file) };
    }
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
      : { tool: TOOL, device: job.device, dist: job.dist, units: {} };
  }
  // job by job (one build and tier at a time), the maps then the yards: a build's maps run on one live page (the browser
  // guard's tree cap holds one page of the game, not one a job — 2026-11-04, three live pages passed 10 GB)
  const units = options.jobs.flatMap((job) => [
    ...job.maps.map((id) => ({ job, unit: { kind: 'map', id, key: id } })),
    ...job.garage.map((id) => ({ job, unit: { kind: 'garage', id, key: `garage-${id}` } })),
  ]).filter(({ job, unit }) => !job.manifest.units[unit.key]);
  if (!units.length) { console.log(`[${TOOL}] every unit is shot`); return 0; }
  const label = `${TOOL} ${path.basename(options.out)}`;
  setBrowserGuardContext({ hold: label });
  const lock = createCaptureLock();
  const servers = new Map();
  for (const dist of new Set(options.jobs.map((job) => job.dist))) {
    servers.set(dist, await startViteChild({ root: options.root, mode: 'preview', outDir: dist, port: 5600 + ((process.pid + servers.size * 7) % 300) }));
  }
  let browser = null, held = false, entry = null, session = null, pagesSinceLaunch = 0;
  const launch = () => launchGuardedBrowser(puppeteer, { ...mapProbeLaunchOptions({ width: 1920, height: 1080, protocolTimeout: 2700000 }), timeout: 180000 });
  // every unit on a fresh page (2026-11-04: a page reused for a build's next map hung staging it for half an hour, and one
  // warmed long before its hold came back without its game)
  const openUnit = async ({ job, unit }) => {
    browser ??= await launch();
    pagesSinceLaunch++;
    entry = await bootPage(browser, servers.get(job.dist).url, job.device, unit.kind === 'garage' ? unit.id : null);
    await stageUnit(entry, unit);
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
      lockClass: 'render', prepare: async () => { await openUnit(units[0]); session = await freezePage(entry.page); },
    });
    held = true;
    for (let i = 0; i < units.length; i++) {
      const { job, unit } = units[i];
      const free = freeGb(options.out);
      if (free < DISK_FLOOR_GB) {
        console.log(`[${label}] ${stamp()} ${free.toFixed(1)} GB free, under the ${DISK_FLOOR_GB} GB floor: stopping before ${job.name} ${unit.key}`);
        failed++;
        break;
      }
      const started = Date.now();
      let outcome = 'failed';
      try {
        // the whole unit — its staging too — within ten minutes, so a stuck page never holds the lock past its cap
        const shooting = (async () => {
          if (session) {
            await thawPage(entry.page, session);
            session = null;
            // a page warmed long before its hold can come back without its game: stage it again on a fresh page
            const live = await entry.page.evaluate(() => window.__DEBUG?.world?.mapId ?? null).catch(() => null);
            if (unit.kind === 'map' && live !== unit.id) {
              console.log(`[${label}] ${stamp()} ${job.name} ${unit.key}: the warm page lost its game (${live}); staging afresh`);
              await entry.page.close().catch(() => {});
              await openUnit(units[i]);
            }
          } else await openUnit(units[i]);
          await entry.page.bringToFront();
          const receipt = await shootUnit(entry, { poses: job.poses }, job.frames);
          receipt.ms = Date.now() - started;
          job.manifest.units[unit.key] = receipt;
          writeFileSync(job.manifestFile, `${JSON.stringify(job.manifest, null, 2)}\n`);
          return 'shot';
        })();
        shooting.catch(() => {});
        outcome = await Promise.race([shooting, sleep(600_000).then(() => 'timeout')]);
      } catch (error) {
        console.log(`[${label}] ${stamp()} ${job.name} ${unit.key} failed: ${String(error?.message ?? error).slice(0, 200)}`
          + (entry?.errors?.length ? `; page errors: ${entry.errors.slice(0, 3).join(' | ').slice(0, 400)}` : ''));
      } finally {
        if (entry) await entry.page.close().catch(() => {});
        entry = null;
      }
      if (outcome === 'shot') {
        shot++;
        console.log(`[${label}] ${stamp()} ${job.name} ${unit.key} staged and shot in ${((Date.now() - started) / 1000).toFixed(1)} s; ${shot}/${units.length}`);
      } else {
        failed++;
        console.log(`[${label}] ${stamp()} ${job.name} ${unit.key} ${outcome}`);
      }
      if ((pagesSinceLaunch >= 8 || outcome !== 'shot') && browser) { await browser.close().catch(() => {}); browser = null; pagesSinceLaunch = 0; }
      if (i < units.length - 1) {
        const cp = await lock.checkpoint({ timeoutMs: options.waitHours * 3600 * 1000,
          beforeYield: async () => { held = false; }, afterResume: async () => { held = true; } });
        if (cp.yielded) console.log(`[${label}] ${stamp()} yielded at the cap, held again after ${(cp.waitedMs / 60000).toFixed(1)} min at the back`);
      }
    }
  } finally {
    await close();
  }
  console.log(`[${label}] ${shot} unit(s) shot, ${failed} failed`);
  return failed ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
