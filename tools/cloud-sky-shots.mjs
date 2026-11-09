// tools/cloud-sky-shots.mjs — every map's sky and every Garage yard's sky, staged identically on every build
// (item clouds-269, the owner 2026-11-04: "many clouds i see are in perfect lines or grrid which is noot like real cloud
// patterns … just make clouds more natural and also less prism-y").
//
//   node tools/cloud-sky-shots.mjs --out=<dir> --jobs=<jobs.json> [--root=<checkout>] [--tag=v1] [--wait-hours=16]
//
// jobs.json: [{ "name": "before-desktop", "dist": "<built dist>", "device": "desktop" | "phone",
//               "maps": ["verdant", ...], "garage": ["verdant_motor_pool", ...], "poses": ["battle", "horizon", "high"],
//               "query": "fx=off", "tune": { "CLOUD_BSM_OFF": 1 }, "cloudTime": 900 }]   (all optional, for a diagnostic
//               job: query is appended to the boot URL; tune is set as window.__LIGHT_TUNE before boot, lightModelCore.ts
//               lightTune; cloudTime is the cloud layer's capture time in seconds instead of 0 — the same build's sky drifted
//               on, the A/A control's other side)
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
//
// (round 8 Y8, sweep s6-01) The hold is the one wrapper's (tools/capture-hold.mjs withCaptureHold): it queues with the
// first unit staging (`prepare`), refreshes, owns the cap's yield (checkpoint() between units, a grace of one unit's
// budget and a minute so a unit in flight at the cap finishes), answers SIGTERM, SIGINT and SIGHUP (128 + n), and runs the teardown
// (every browser of the run closed) before the release on every way out. The tool's own acquire, signal handlers and
// close() helper are gone: the census (tools/capture-hold-census.selftest.mjs) refuses them. A staging failure while
// queued is the unit's failure, not the run's: the hold opens that unit again (a throwing prepare ended the whole run
// with nothing shot, and a resumed run put the same unit first again). Each unit has one owner (createUnitRun below):
// its states, its budget and its abort, its browser and page its own; the boot waits on the readiness probe
// (tools/game-readiness.mjs). tools/cloud-sky-shots.selftest.mjs drives the run on a stand-in browser and a private lock.
import { launchGuardedBrowser, setBrowserGuardContext } from './browser-launch.mjs';
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { freezePage, startViteChild, thawPage, withCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
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

/** The cloud layer at scene time 0 (a job's cloudTime), settled over this camera and frozen (null where the tier has none). */
function pageSettleClouds() {
  const D = window.__DEBUG, vc = D.scene.userData.volumetricClouds;
  if (!vc) return null;
  vc.frozen = false;
  vc.setCaptureTime(window.__COT_CLOUD_CAPTURE_TIME ?? 0, true);
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

/** Boot `entry`'s page (a fresh page its unit opened) on `baseUrl` for `device`. */
async function bootPage(entry, baseUrl, device, garageVariant = null, query = '', tune = null, cloudTime = 0) {
  const { page, errors } = entry;
  const d = DEVICES[device];
  await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch });
  await page.evaluateOnNewDocument((spec, preset, variant, lightTune, captureTime) => {
    try {
      if (lightTune) globalThis.__LIGHT_TUNE = lightTune;
      globalThis.__COT_CLOUD_CAPTURE_TIME = captureTime;
      localStorage.setItem(spec.storageKey, spec.playerSpecId);
      if (preset) localStorage.setItem('cot.gfxPreset', preset);
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
      if (variant) localStorage.setItem('cot.garage.variant', variant);
    } catch { /* the boot checks below fail loudly */ }
  }, PINNED_SCENE, d.preset, garageVariant, tune, cloudTime);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon') && !text.startsWith('Failed to load resource')) errors.push(text.slice(0, 300));
  });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?nosplash=1&${d.query}${query ? `&${query}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
}

async function stageUnit(entry, unit, { timeoutMs }) {
  const { page } = entry;
  await page.bringToFront();
  // (round 8 Y8) the settled Garage through the readiness probe (a 'before' dist that predates the lifecycle answers with
  // its legacy predicate), then the capture hooks, each wait inside the unit's budget
  await page.waitForFunction(readinessExpression('garage'), { timeout: timeoutMs, polling: 1000 });
  await page.waitForFunction('!!window.__SHOTS && !!window.__DEBUG', { timeout: timeoutMs, polling: 1000 });
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

async function frame(page, file, pause) {
  const clouds = await page.evaluate(pageSettleClouds);
  await pause(600);
  // (Main, 2026-11-04, the disk: WebP at q92, the same encoding on every build so a pair stays matched)
  await page.screenshot({ path: file, type: 'webp', quality: 92 });
  await page.evaluate(pageThawClouds);
  return clouds;
}

async function shootUnit(entry, options, frames, pause) {
  const { page, unit, stage } = entry;
  await page.bringToFront();
  await pause(1500);
  const receipt = { stage, poses: {} };
  if (unit.kind === 'garage') {
    const file = path.join(frames, `garage-${unit.id}-yard.webp`);
    receipt.poses.yard = { clouds: await frame(page, file, pause), file: path.basename(file) };
  } else {
    for (const name of options.poses) {
      const resolved = name === 'battle' ? await page.evaluate(pageBattlePose, { yaw: stage.player.yaw })
        : await page.evaluate(pageSkyPose, name === 'horizon'
          ? { player: stage.player, eye: 6, yawOff: 0, elev: 0.122, fov: 70 }
          : { player: stage.player, eye: 6, yawOff: 0.35, elev: 0.61, fov: 70, antiSun: true });
      await pause(900);
      const file = path.join(frames, `${unit.id}-${name}.webp`);
      receipt.poses[name] = { resolved, clouds: await frame(page, file, pause), file: path.basename(file) };
    }
  }
  receipt.errors = entry.errors.splice(0);
  return receipt;
}

// ---- a unit's life, one owner (round 8 Y8, sweep s6-01) ----------------------------------------------------------------
// The loop raced each unit against a ten-minute sleep and never stopped the loser, which ran on against the run's shared
// `browser` and `entry`: past its budget it could launch a second guarded Chrome beside the loop's (`browser ??= await
// launch()` assigns after its await, over the browser the next unit launched) or stage over the next unit's page. Now each
// unit's run owns its state, its budget and its abort: the budget (or its hold's stop) ends it, aborts its signal and
// closes its page, so every wait on that page rejects; its page is its own; it takes its browser from the run's pool,
// which launches nothing for an aborted unit and closes a launch that comes back after the abort; and a unit past its
// budget never records. The first end stands: a later move (the stopped work's own failure) is ignored, and a move the
// table does not list throws by name.
//   staging  → warm (staged and frozen while the hold is queued: the prepare) | shooting
//   warm     → shooting | staging (its frozen page lost its game: staged afresh on a fresh page)
//   shooting → shot
//   any live state → failed (its work threw) | timeout (its budget ran out) | stopped (its hold was stopped)
export const UNIT_STATES = Object.freeze(['staging', 'warm', 'shooting', 'shot', 'failed', 'timeout', 'stopped']);
const ENDS = Object.freeze(['failed', 'timeout', 'stopped']);
export const UNIT_EDGES = Object.freeze({
  staging: Object.freeze(['warm', 'shooting', ...ENDS]),
  warm: Object.freeze(['shooting', 'staging', ...ENDS]),
  shooting: Object.freeze(['shot', ...ENDS]),
  shot: Object.freeze([]), failed: Object.freeze([]), timeout: Object.freeze([]), stopped: Object.freeze([]),
});
const ENDED = new Set(['shot', ...ENDS]);
/** A unit is ten minutes at most, its staging included: a stuck page never holds the lock past its cap. */
export const UNIT_BUDGET_MS = 600_000;

/** The unit's next state for a move from `from` to `to`: `to`, or null once the unit has ended (its end stands). */
export function nextUnitState(from, to) {
  if (!UNIT_STATES.includes(from) || !UNIT_STATES.includes(to)) throw new TypeError(`${TOOL}: no unit state ${UNIT_STATES.includes(from) ? to : from}`);
  if (ENDED.has(from)) return null;
  if (!UNIT_EDGES[from].includes(to)) throw new Error(`${TOOL}: a unit cannot move ${from} -> ${to}`);
  return to;
}

/**
 * The run's browsers: the one the units share (recycled after eight pages and after any unit that did not shoot) and
 * every browser a unit launched, which the hold's teardown closes before the release. A unit takes the shared browser
 * with its signal: refused once that aborted, and a launch that comes back after it is closed at once, never shared.
 * Closed (the teardown), the pool launches nothing and closes what still comes back.
 */
function createBrowserPool(launch) {
  const open = new Set();
  let current = null, pages = 0, closed = false;
  const shut = async (browser) => {
    open.delete(browser);
    if (current === browser) { current = null; pages = 0; }
    await browser.close().catch(() => {});
  };
  return {
    get pages() { return pages; },
    async take(signal) {
      signal.throwIfAborted();
      if (closed) throw new Error('the run\'s browsers are closed');
      if (!current) {
        const browser = await launch();
        open.add(browser);
        if (closed || signal.aborted || current) {
          await shut(browser);
          signal.throwIfAborted();
          if (closed) throw new Error('the run\'s browsers are closed');
        } else current = browser;
      }
      pages++;
      return current;
    },
    /** Close the shared browser (the next unit launches a fresh one). */
    async retire() { if (current) await shut(current); },
    async closeAll() { closed = true; await Promise.all([...open].map(shut)); },
  };
}

/** One unit's run (see above). `arm(holdSignal)` starts a budget for its next part: the staging while queued, or the
 *  hold's part, which the hold's stop ends too. `ended` resolves with its end. */
function createUnitRun({ job, unit }, { pool, servers, budgetMs }) {
  const controller = new AbortController();
  let state = 'staging', entry = null, failure = null, timer = null, detach = null, settle;
  const ended = new Promise((done) => { settle = done; });
  const disarm = () => { clearTimeout(timer); timer = null; detach?.(); detach = null; };
  const move = (to) => {
    const next = nextUnitState(state, to);
    if (next === null) return false;
    state = next;
    if (ENDED.has(next)) { disarm(); settle(next); }
    return true;
  };
  const end = (to, error) => {
    if (!move(to)) return false;
    failure = error ?? null;
    if (to !== 'shot') {
      controller.abort(error ?? new Error(`${unit.key} ${to}`));
      entry?.page.close().catch(() => {}); // every wait on the page rejects
    }
    return true;
  };
  return {
    get state() { return state; },
    get signal() { return controller.signal; },
    get entry() { return entry; },
    get failure() { return failure; },
    ended,
    move,
    end,
    arm(holdSignal = null) {
      disarm();
      timer = setTimeout(() => end('timeout', new Error(`past its ${(budgetMs / 1000).toFixed(0)} s budget`)), budgetMs);
      if (holdSignal) {
        const stop = () => end('stopped', new Error(`its hold was stopped (${holdSignal.reason?.message ?? holdSignal.reason})`));
        if (holdSignal.aborted) { stop(); return; }
        holdSignal.addEventListener('abort', stop, { once: true });
        detach = () => holdSignal.removeEventListener('abort', stop);
      }
    },
    /** Its budget stops (a warm unit waits for its hold frozen). */
    pause() { disarm(); },
    /** A fresh page of the pool's shared browser, booted and staged. */
    async open() {
      const { signal } = controller;
      const browser = await pool.take(signal);
      const page = await browser.newPage();
      entry = { page, errors: [], stage: null };
      if (signal.aborted) { await page.close().catch(() => {}); signal.throwIfAborted(); }
      await bootPage(entry, servers.get(job.dist).url, job.device, unit.kind === 'garage' ? unit.id : null, job.query ?? '', job.tune ?? null,
        job.cloudTime ?? 0);
      signal.throwIfAborted();
      await stageUnit(entry, unit, { timeoutMs: budgetMs });
      signal.throwIfAborted();
    },
    async closePage() {
      const page = entry?.page;
      if (page) await page.close().catch(() => {});
    },
  };
}

/** Run `work` as `run`'s part; resolves with the state it left the run in: the work's own (warm, shot), its failure, or
 *  the budget's or the hold's end, whichever comes first (a failure after that end is the stop's echo: ignored). */
function settleRun(run, work) {
  const done = work().then(() => run.state, (error) => { run.end('failed', error); return run.state; });
  return Promise.race([done, run.ended]);
}

/**
 * Shoot every unit the manifests lack. `deps` (tools/cloud-sky-shots.selftest.mjs): `launcher` (puppeteer), `startServer`
 * (startViteChild), `hold` (laid over the hold's options: a private lock, its log), `unitBudgetMs`, `pause` (the fixed
 * settle waits), `freeGb`, `log`. Resolves to the exit code: 0 when every unit was shot.
 */
export async function main(argv, { launcher = puppeteer, startServer = startViteChild, hold = {}, unitBudgetMs = UNIT_BUDGET_MS, pause = sleep,
  freeGb: free = freeGb, log = console.log } = {}) {
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
  if (!units.length) { log(`[${TOOL}] every unit is shot`); return 0; }
  const label = `${TOOL} ${path.basename(options.out)}`;
  const say = (line) => log(`[${label}] ${stamp()} ${line}`);
  setBrowserGuardContext({ hold: label });
  const servers = new Map();
  // every unit on a fresh page (2026-11-04: a page reused for a build's next map hung staging it for half an hour, and one
  // warmed long before its hold came back without its game)
  const pool = createBrowserPool(() => launchGuardedBrowser(launcher, {
    ...mapProbeLaunchOptions({ width: 1920, height: 1080, protocolTimeout: 2700000 }), timeout: 180000 }));
  const context = { pool, servers, budgetMs: unitBudgetMs };
  const failedLine = (run, { job, unit }) => `${job.name} ${unit.key} failed: ${String(run.failure?.message ?? run.failure).slice(0, 200)}`
    + (run.entry?.errors?.length ? `; page errors: ${run.entry.errors.slice(0, 3).join(' | ').slice(0, 400)}` : '');
  let shot = 0, failed = 0;
  try {
    for (const dist of new Set(options.jobs.map((job) => job.dist))) {
      servers.set(dist, await startServer({ root: options.root, mode: 'preview', outDir: dist, port: 5600 + ((process.pid + servers.size * 7) % 300) }));
    }
    await withCaptureHold(async ({ prepared, signal, checkpoint }) => {
      // the first unit staged while queued: shot from its frozen page, or (its staging failed) opened again here
      let warm = prepared?.run?.state === 'warm' ? prepared : null;
      if (prepared?.run && !warm) say(`${failedLine(prepared.run, units[0])} (staging it while queued); opening it again in the hold`);
      for (let i = 0; i < units.length; i++) {
        const { job, unit } = units[i];
        if (signal.aborted) {
          say(`the hold was stopped (${signal.reason?.message ?? signal.reason}): ${units.length - i} unit(s) left for the next run`);
          failed += units.length - i;
          break;
        }
        const disk = free(options.out);
        if (disk < DISK_FLOOR_GB) {
          say(`${disk.toFixed(1)} GB free, under the ${DISK_FLOOR_GB} GB floor: stopping before ${job.name} ${unit.key}`);
          failed++;
          break;
        }
        const started = Date.now();
        const run = warm?.run ?? createUnitRun(units[i], context);
        const session = warm?.session ?? null;
        warm = null;
        run.arm(signal);
        const outcome = await settleRun(run, async () => {
          if (session) {
            await thawPage(run.entry.page, session);
            // a page warmed long before its hold can come back without its game: stage it again on a fresh page
            const live = await run.entry.page.evaluate(() => window.__DEBUG?.world?.mapId ?? null).catch(() => null);
            if (unit.kind === 'map' && live !== unit.id) {
              say(`${job.name} ${unit.key}: the warm page lost its game (${live}); staging afresh`);
              await run.closePage();
              run.move('staging');
              await run.open();
            }
          } else await run.open();
          run.move('shooting');
          await run.entry.page.bringToFront();
          const receipt = await shootUnit(run.entry, { poses: job.poses }, job.frames, pause);
          run.signal.throwIfAborted(); // a unit past its budget never records
          receipt.ms = Date.now() - started;
          job.manifest.units[unit.key] = receipt;
          writeFileSync(job.manifestFile, `${JSON.stringify(job.manifest, null, 2)}\n`);
          run.move('shot');
        });
        await run.closePage();
        if (outcome === 'shot') {
          shot++;
          say(`${job.name} ${unit.key} staged and shot in ${((Date.now() - started) / 1000).toFixed(1)} s; ${shot}/${units.length}`);
        } else {
          failed++;
          if (outcome === 'failed') say(failedLine(run, units[i]));
          say(`${job.name} ${unit.key} ${outcome}`);
        }
        if (pool.pages >= 8 || outcome !== 'shot') await pool.retire();
        if (i < units.length - 1) {
          let cp;
          try { cp = await checkpoint(); } catch (error) {
            say(`the cap yield did not hold again (${error?.message ?? error}): ${units.length - i - 1} unit(s) left for the next run`);
            failed += units.length - i - 1;
            break;
          }
          if (cp?.yielded) say(`yielded at the cap, held again after ${((cp.waitedMs ?? 0) / 60000).toFixed(1)} min at the back`);
        }
      }
    }, {
      label, lockClass: 'render', timeoutMs: options.waitHours * 3600 * 1000,
      // a unit in flight at the cap is given its whole budget, and a minute to close its page and browser, before the stop
      graceSeconds: unitBudgetMs / 1000 + 60,
      // the first unit stages while the ticket waits; its failure is the unit's (the hold opens it again), never the run's
      prepare: async () => {
        const run = createUnitRun(units[0], context);
        run.arm();
        let session = null;
        const reached = await settleRun(run, async () => {
          await run.open();
          session = await freezePage(run.entry.page);
          run.signal.throwIfAborted();
          run.pause();
          run.move('warm');
        });
        if (reached === 'warm') return { run, session };
        await run.closePage();
        await pool.retire();
        return { run };
      },
      // every browser of the run closes before the release, whichever way the hold ends
      teardown: () => pool.closeAll(),
      // an idle browser never waits out a yield beside the next holder's work
      onYield: () => pool.retire(),
      ...hold,
    });
  } finally {
    await pool.closeAll(); // a hold that never held (its wait ran out) closes what its prepare launched
    for (const server of servers.values()) await server.close().catch(() => {});
  }
  log(`[${label}] ${shot} unit(s) shot, ${failed} failed`);
  return failed ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
