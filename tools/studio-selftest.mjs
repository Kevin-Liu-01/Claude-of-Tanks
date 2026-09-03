import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// SCENE STUDIO self-test (docs/STUDIO.md §Self-test).
// Usage: node tools/studio-selftest.mjs [--out shots/studio-selftest] [--keep]
//
// Drives the full scripted-shoot flow headlessly:
//   1. boots the game at ?studio=1&map=desert (own vite on a 7xxx port),
//   2. __STUDIO.load()s a 3-tank desert scene (one firing with a live tracer,
//      one frozen mid-ammo-rack-explosion, one burnt wreck; dust + engine
//      smoke), asserts NO battle sim is running and the fx timeline froze at
//      exactly fxTime,
//   3. captures a >= 2560 px PNG via __STUDIO.capture (probe writes the file),
//   4. verifies the scene JSON round-trips (load(state()) reproduces poses),
//   5. exercises every FX control, selected-layer deletion, and clean replay,
//   6. repeats on winter with a different camera + FOV,
//   7. exits the studio and confirms the garage phase returns.
// Exits non-zero on any assertion or page console error.
//
// Shares the /tmp/cot-shots FIFO lock with the other capture harnesses so
// concurrent agent runs never contend for the GPU (same protocol as
// tools/screenshot.mjs — keep in sync).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { MAP_IDS } from '../src/world/maps/index.ts';

// --- exclusive harness lock (FIFO ticket protocol, see screenshot.mjs) ------

await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
lockRefresher.unref();

// --- options -----------------------------------------------------------------
const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const outDir = resolve(opt('out', 'shots/studio-selftest'));
mkdirSync(outDir, { recursive: true });

// --- vite (own 7xxx port — NEVER 5001/5002) -----------------------------------
const port = 7300 + Math.floor(Math.random() * 500);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[studio-selftest] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

// --- scenes --------------------------------------------------------------------
const DESERT_SCENE = {
  map: 'desert',
  seed: 5000,
  actors: [
    { id: 't90m', name: 'shooter', pos: [-26, -14], facingDeg: 60, turretDeg: 0, gunDeg: 1.5, camo: 'desert', state: 'intact', smoking: true },
    { id: 'tiger1', name: 'victim', pos: [26, 16], facingDeg: 285, turretDeg: -20, gunDeg: 0, state: 'intact' },
    { id: 'm4a3e8', name: 'wreck', pos: [10, -26], facingDeg: 152, turretDeg: 35, gunDeg: -4, state: 'wrecked-burnt', stateAgeS: 240 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 60, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', actor: 'wreck', tMs: 250, params: { count: 12, intensity: 1, dirDeg: 150 } },
    { type: 'fire', actor: 'shooter', tMs: 590, params: { slot: 0, tracer: true, recoil: true } },
  ],
  camera: { pos: [-48, 5.5, -34], lookAt: [10, 2.5, 4], groundRel: true, fov: 42 },
  fxTime: 620,
  timeScale: 0,
};

const WINTER_SCENE = {
  map: 'winter',
  seed: 7100,
  actors: [
    { id: 'leo2a7', name: 'overwatch', pos: [-12, -6], facingDeg: 52, turretDeg: 0, gunDeg: 2, camo: 'winter', state: 'intact' },
    { id: 'is2', name: 'burnout', pos: [24, 20], facingDeg: 200, turretDeg: 90, gunDeg: -3, state: 'turret-popped', stateAgeS: 90, burning: true },
  ],
  effects: [
    { type: 'sparks', at: [24, 21.5], tMs: 700, params: { caliberMm: 100 } },
    { type: 'firing_moment', actor: 'overwatch', tMs: 900, params: { ageS: 0.05 } },
  ],
  camera: { pos: [-38, 3.2, -6], lookAt: [8, 1.8, 8], groundRel: true, fov: 36, rollDeg: -1.5 },
  fxTime: 900,
  timeScale: 0,
};

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function writeCapture(name, cap) {
  const b64 = cap.dataURL.split(',')[1];
  const buf = Buffer.from(b64, 'base64');
  const file = join(outDir, name);
  writeFileSync(file, buf);
  const dims = pngSize(buf);
  if (!dims) throw new Error(`${name}: not a PNG`);
  if (dims.width < 2560) throw new Error(`${name}: only ${dims.width}px wide (< 2560 hi-res contract)`);
  console.log(`[studio-selftest] wrote ${file} (${dims.width}x${dims.height})`);
  return dims;
}
const approx = (a, b, eps, what) => {
  if (Math.abs(a - b) > eps) throw new Error(`round-trip drift on ${what}: ${a} vs ${b}`);
};

let failed = false;
try {
  // 1. boot straight into the studio on desert
  const entryStartedAt = Date.now();
  await page.goto(`${url}?studio=1&map=desert`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  // active flips when the studio takes the frame; mapId lands once the
  // chunked world build behind the busy bar finishes
  await page.waitForFunction(
    "window.__STUDIO && window.__STUDIO.active === true && window.__STUDIO.mapId === 'desert'",
    { timeout: 120000 },
  );
  console.log('[studio-selftest] studio entered via ?studio=1&map=desert');

  const entry = await page.evaluate(() => ({
    phase: window.__DEBUG.game.phase,
    mapId: window.__STUDIO.mapId,
    bootMs: window.__BOOT_MS,
    bootTimings: window.__BOOT_TIMINGS,
    studioLoad: window.__STUDIO_LOAD,
    studioWarm: window.__STUDIO_WARM,
    combatWarm: window.__COMBAT_WARM || null,
    builtPoolVisuals: window.__DEBUG.game.allTanks.filter((ent) => !!ent.visual).length,
    poolTankVisible: (() => {
      let vis = false;
      for (const ent of window.__DEBUG.game.allTanks) {
        if (ent.visual && ent.visual.root.visible) vis = true;
      }
      return vis;
    })(),
  }));
  if (entry.phase !== 'studio') throw new Error(`phase is '${entry.phase}', expected 'studio'`);
  if (entry.mapId !== 'desert') throw new Error(`map is '${entry.mapId}', expected 'desert'`);
  if (entry.poolTankVisible) throw new Error('battle-pool tank visuals are visible in the studio');
  if (entry.builtPoolVisuals !== 0) {
    throw new Error(`direct Studio boot built ${entry.builtPoolVisuals} hidden battle-pool visuals`);
  }
  if (entry.combatWarm) throw new Error('direct Studio boot ran the complete combat warm');
  if (!entry.studioLoad?.directBoot || !entry.bootTimings?.studio) {
    throw new Error('direct Studio boot did not use the covered Studio loading stage');
  }
  console.log(
    `[studio-selftest] direct entry ${Date.now() - entryStartedAt} ms wall / ` +
    `${entry.bootMs} ms boot / ${entry.studioLoad.totalMs} ms Studio / ` +
    `${entry.studioWarm?.totalMs || 0} ms focused warm`,
  );
  console.log('[studio-selftest] phase=studio, map=desert, battle pool unbuilt + hidden');

  const panelLayout = await page.evaluate(() => {
    const mapButton = document.querySelector('.mapBtn');
    mapButton?.click();
    const result = {
      tabs: document.querySelectorAll('[role="tab"]').length,
      groups: [...document.querySelectorAll('.pgroup')].map((node) => node.dataset.group),
      hiddenSections: [...document.querySelectorAll('.pgroup .sec')]
        .filter((node) => getComputedStyle(node).display === 'none').length,
      mapCards: document.querySelectorAll('.mapCard').length,
      selectedMap: document.querySelector('.mapCard[aria-selected="true"]')?.dataset.mapId,
      hero: document.querySelector('.mapBtn .mhero')?.getAttribute('src'),
      previewsHydrated: [...document.querySelectorAll('.mapCard img')]
        .filter((image) => image.getAttribute('src')).length,
    };
    mapButton?.click();
    return result;
  });
  if (panelLayout.tabs !== 0) throw new Error(`Studio still renders ${panelLayout.tabs} workspace tabs`);
  if (panelLayout.groups.join(',') !== 'battlefield,tanks,effects,global,output') {
    throw new Error(`Studio group order is ${panelLayout.groups.join(',')}`);
  }
  if (panelLayout.hiddenSections) throw new Error(`${panelLayout.hiddenSections} Studio sections remain tab-hidden`);
  if (panelLayout.mapCards !== MAP_IDS.length || panelLayout.selectedMap !== 'desert') {
    throw new Error(`map picker rendered ${panelLayout.mapCards} cards, selected=${panelLayout.selectedMap}`);
  }
  if (!panelLayout.hero?.endsWith('/maps/desert.webp')
      || panelLayout.previewsHydrated !== MAP_IDS.length) {
    throw new Error(`map preview hydration failed: ${JSON.stringify(panelLayout)}`);
  }
  console.log(`[studio-selftest] one-workspace hierarchy and ${MAP_IDS.length}-card visual map picker are live`);

  // 2. deterministic 3-tank load
  const s1 = await page.evaluate(
    (scene) => window.__STUDIO.load(scene), DESERT_SCENE,
  );
  if (s1.actors.length !== 3) throw new Error(`load() built ${s1.actors.length} actors, expected 3`);
  if (s1.fxTime !== DESERT_SCENE.fxTime) throw new Error(`state().fxTime ${s1.fxTime} != ${DESERT_SCENE.fxTime}`);

  // battle sim must NOT be running and fx must be frozen at fxTime
  const frozen0 = await page.evaluate(() => ({
    t: window.__STUDIO.fxTimeMs, simT: window.__DEBUG.game.timeS,
    scale: window.__STUDIO.timeScale, phase: window.__DEBUG.game.phase,
    perf: window.__STUDIO.performance(),
  }));
  await new Promise((r) => setTimeout(r, 700));
  const frozen1 = await page.evaluate(() => ({
    t: window.__STUDIO.fxTimeMs, simT: window.__DEBUG.game.timeS,
    shellsAlive: window.__DEBUG.game.shells.length,
    perf: window.__STUDIO.performance(),
  }));
  if (frozen0.phase !== 'studio') throw new Error('load() left the studio phase');
  if (frozen0.scale !== 0) throw new Error(`timeScale after load is ${frozen0.scale}, expected 0`);
  if (frozen0.t !== DESERT_SCENE.fxTime || frozen1.t !== DESERT_SCENE.fxTime) {
    throw new Error(`fx clock not frozen at fxTime: ${frozen0.t} -> ${frozen1.t} (want ${DESERT_SCENE.fxTime})`);
  }
  if (frozen1.simT !== frozen0.simT) throw new Error('battle sim clock advanced inside the studio');
  if (frozen1.shellsAlive !== 0) throw new Error('battle shells are live inside the studio');
  const frozenRenders = frozen1.perf.renderedFrames - frozen0.perf.renderedFrames;
  if (frozenRenders > 4) {
    throw new Error(`frozen idle rendered ${frozenRenders} frames instead of staying on demand`);
  }
  const victim = s1.actors.find((a) => a.name === 'victim');
  if (!victim || victim.state !== 'turret-popped') {
    throw new Error(`tank_kill did not leave the victim turret-popped (got ${victim && victim.state})`);
  }
  console.log(
    `[studio-selftest] fx frozen at ${frozen1.t} ms, sim static, ` +
    `${frozen1.perf.skippedFrames - frozen0.perf.skippedFrames} idle frames skipped`,
  );

  // 3. hi-res capture (probe writes the PNG)
  const cap1 = await page.evaluate(() => window.__STUDIO.capture({ width: 2560 }));
  writeCapture('desert_threetank_kill.png', cap1);

  // 4. scene JSON round-trip: reload state() and compare poses
  const s2 = await page.evaluate(() => window.__STUDIO.load(window.__STUDIO.state()));
  for (let i = 0; i < s1.actors.length; i++) {
    const a = s1.actors[i];
    const b = s2.actors[i];
    if (a.id !== b.id || a.state !== b.state) {
      throw new Error(`round-trip actor ${i}: ${a.id}/${a.state} vs ${b.id}/${b.state}`);
    }
    approx(a.pos[0], b.pos[0], 0.05, `actor${i}.x`);
    approx(a.pos[1], b.pos[1], 0.05, `actor${i}.z`);
    approx(a.facingDeg, b.facingDeg, 0.1, `actor${i}.facing`);
    approx(a.turretDeg, b.turretDeg, 0.1, `actor${i}.turret`);
    approx(a.gunDeg, b.gunDeg, 0.1, `actor${i}.gun`);
  }
  if (s2.fxTime !== s1.fxTime) throw new Error(`round-trip fxTime ${s1.fxTime} -> ${s2.fxTime}`);
  if (s2.effects.length !== s1.effects.length
    || s2.effects.some((effect, i) => effect.id !== s1.effects[i].id)) {
    throw new Error('round-trip changed stable effect ids/order');
  }
  approx(s1.camera.pos[0], s2.camera.pos[0], 0.1, 'camera.x');
  approx(s1.camera.pos[1], s2.camera.pos[1], 0.1, 'camera.y');
  approx(s1.camera.pos[2], s2.camera.pos[2], 0.1, 'camera.z');
  approx(s1.camera.fov, s2.camera.fov, 0.1, 'camera.fov');
  console.log('[studio-selftest] scene JSON round-trips (poses, camera, fxTime)');

  // 5. FX board: place a real terrain marker, select the victim, then invoke
  // every control. Each must append its corresponding real effect type. The
  // selected tank is intentionally put through kill/detrack/smoke/burning;
  // clearEffects() must restore the authored intact baseline afterward.
  const canvas = await page.$('canvas');
  if (!canvas) throw new Error('renderer canvas missing');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('renderer canvas has no box');
  // Actor silhouettes and the responsive control rail can legitimately move
  // across one historical hard-coded pixel. Probe a small, fixed canvas grid
  // and stop on the first real terrain hit; this still exercises the shipped
  // pointer/raycast path instead of mutating Studio internals.
  for (const [x, y] of [[0.38, 0.38], [0.18, 0.72], [0.42, 0.76], [0.68, 0.72]]) {
    await page.mouse.click(canvasBox.x + canvasBox.width * x, canvasBox.y + canvasBox.height * y);
    const armed = await page.evaluate(() => window.__STUDIO._internal.markerActive);
    if (armed) break;
  }
  const board = await page.evaluate(() => {
    window.__STUDIO.selectActor('victim');
    const labels = [
      'FIRE GUN', 'MUZZLE FLASH', 'MG BURST', 'RECOIL + FLASH',
      'TRACER MARKER → ACTOR', 'EXPL SMALL', 'EXPL MEDIUM', 'EXPL LARGE',
      'BARRAGE ×5', 'DUST BURST', 'SPARKS', 'FROZEN FIREBALL',
      'IMPACT PEN', 'NON-PEN', 'RICOCHET', 'HE SPLASH', 'ERA POP', 'ARMOR SCARS',
      'KILL · AMMO-RACK', 'KILL · BURN-OUT', 'DETRACK L', 'DETRACK R',
      'EXHAUST BELCH', 'ENGINE SMOKE', 'SET BURNING', 'EXTINGUISH',
    ];
    const missing = [];
    for (const label of labels) {
      const button = [...document.querySelectorAll('.cot-studio button')]
        .find((node) => node.textContent.trim() === label);
      if (!button) missing.push(label);
      else button.click();
    }
    return {
      missing,
      marker: window.__STUDIO._internal.markerActive,
      effects: window.__STUDIO.listEffects(),
      actor: window.__STUDIO.listActors().find((a) => a.name === 'victim'),
      rows: document.querySelectorAll('.fxrow').length,
    };
  });
  if (board.missing.length) throw new Error(`FX controls missing: ${board.missing.join(', ')}`);
  if (!board.marker) throw new Error('terrain click did not arm the FX marker');
  const gotTypes = new Set(board.effects.map((effect) => effect.type));
  const missingTypes = await page.evaluate(
    (types) => window.__STUDIO.EFFECT_TYPES.filter((type) => !types.includes(type)),
    [...gotTypes],
  );
  if (missingTypes.length) throw new Error(`FX board did not route types: ${missingTypes.join(', ')}`);
  if (board.rows !== board.effects.length) {
    throw new Error(`FX stack rendered ${board.rows} rows for ${board.effects.length} effects`);
  }
  const smoke = board.effects.find((effect) => effect.type === 'engine_smoke');
  if (!smoke) throw new Error('ENGINE SMOKE did not author an effect layer');
  const deleteResult = await page.evaluate((id) => {
    window.__STUDIO.selectEffect(id);
    const row = document.querySelector(`.fxrow[data-effect-id="${id}"]`);
    if (!row || row.getAttribute('aria-selected') !== 'true') return { selected: false };
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    const actor = window.__STUDIO.listActors().find((a) => a.name === 'victim');
    return {
      selected: true,
      removed: !window.__STUDIO.listEffects().some((effect) => effect.id === id),
      actor,
    };
  }, smoke.id);
  if (!deleteResult.selected || !deleteResult.removed) {
    throw new Error('selected effect layer did not delete from the FX stack');
  }
  await page.evaluate(() => window.__STUDIO.clearEffects());
  const cleared = await page.evaluate(() => ({
    effects: window.__STUDIO.listEffects(),
    actor: window.__STUDIO.listActors().find((a) => a.name === 'victim'),
    rows: document.querySelectorAll('.fxrow').length,
  }));
  if (cleared.effects.length || cleared.rows) throw new Error('CLEAR ALL left authored FX rows behind');
  if (!cleared.actor || cleared.actor.state !== 'intact' || cleared.actor.smoking || cleared.actor.burning) {
    throw new Error(`clearEffects did not restore authored actor baseline: ${JSON.stringify(cleared.actor)}`);
  }
  console.log(`[studio-selftest] all ${board.effects.length} FX layers routed; selection/delete/replay clean`);

  // 6. change battlefield through the visual picker, then load its composed
  // scene. This proves the card routes to the same real setMap() path as the API.
  await page.evaluate(() => {
    document.querySelector('.mapBtn')?.click();
    const winter = document.querySelector('.mapCard[data-map-id="winter"]');
    if (!winter) throw new Error('winter map card missing');
    winter.click();
  });
  await page.waitForFunction(
    "window.__STUDIO.mapId === 'winter' && document.querySelector('.mapCard[data-map-id=\"winter\"]')?.getAttribute('aria-selected') === 'true'",
    { timeout: 120000 },
  );
  const winterPicker = await page.evaluate(() => ({
    name: document.querySelector('.mapBtn .mn')?.textContent,
    hero: document.querySelector('.mapBtn .mhero')?.getAttribute('src'),
  }));
  if (winterPicker.name !== 'Frosthollow' || !winterPicker.hero?.endsWith('/maps/winter.webp')) {
    throw new Error(`winter map card did not refresh its preview: ${JSON.stringify(winterPicker)}`);
  }

  // 7. winter, different camera + fov
  const w1 = await page.evaluate((scene) => window.__STUDIO.load(scene), WINTER_SCENE);
  if (w1.map !== 'winter') throw new Error(`winter load landed on '${w1.map}'`);
  if (Math.abs(w1.camera.fov - WINTER_SCENE.camera.fov) > 0.1) {
    throw new Error(`winter fov ${w1.camera.fov} != ${WINTER_SCENE.camera.fov}`);
  }
  const capW = await page.evaluate(() => window.__STUDIO.capture({ width: 3200 }));
  writeCapture('winter_overwatch_burnout.png', capW);

  // 8. a second winter framing off the same machinery (camera-only move):
  // low closeup on the burning turret-popped IS-2, popped turret foreground
  await page.evaluate(() => window.__STUDIO.setCamera({
    pos: [11, 2.6, 14.5], lookAt: [24, 2.0, 20], groundRel: true, fov: 42,
  }));
  const capW2 = await page.evaluate(() => window.__STUDIO.capture({ width: 2560 }));
  writeCapture('winter_wreck_closeup.png', capW2);

  // 9. Cinematic storyboard: direct a two-tank duel, prove the rail/actor/FX
  // tracks render in the panel, scrub deterministically, and automatically
  // fire the knockout event during accelerated preview playback.
  const duel = await page.evaluate(() => {
    const board = window.__STUDIO.directDuel();
    return {
      board,
      effects: window.__STUDIO.listEffects(),
      shotCards: document.querySelectorAll('.shotcard').length,
      cameraMarkers: document.querySelectorAll('.tlmarker.camera').length,
      actorMarkers: document.querySelectorAll('.tlmarker.actor').length,
      effectMarkers: document.querySelectorAll('.tlmarker.fx').length,
      railVisible: window.__STUDIO.railVisible,
      railObjectVisible: window.__STUDIO._internal.railObjectVisible,
    };
  });
  if (duel.board.durationMs !== 12000 || duel.board.shots.length !== 5
    || duel.board.actorTracks.length !== 2 || duel.effects.length !== 6) {
    throw new Error(`direct duel storyboard is incomplete: ${JSON.stringify(duel)}`);
  }
  if (duel.shotCards !== 5 || duel.cameraMarkers !== 5
    || duel.actorMarkers !== 6 || duel.effectMarkers !== 6
    || !duel.railVisible || !duel.railObjectVisible) {
    throw new Error(`cinematic timeline UI does not match its model: ${JSON.stringify(duel)}`);
  }
  const scrubbed = await page.evaluate(() => {
    window.__STUDIO.seek(9000);
    return {
      time: window.__STUDIO.fxTimeMs,
      actors: window.__STUDIO.listActors(),
      camera: window.__STUDIO.getCamera(),
    };
  });
  if (scrubbed.time !== 9000 || scrubbed.actors[1]?.state !== 'turret-popped') {
    throw new Error(`9 s storyboard scrub missed the authored knockout: ${JSON.stringify(scrubbed)}`);
  }
  const movedKey = duel.board.actorTracks[0].keys[1].pos;
  if (Math.hypot(scrubbed.actors[0].pos[0] - movedKey[0], scrubbed.actors[0].pos[1] - movedKey[1]) > 0.1) {
    throw new Error(`9 s storyboard scrub did not move the tank to its keyed pose: ${JSON.stringify(scrubbed.actors[0])}`);
  }
  const firstCamera = duel.board.shots[0].pos;
  if (Math.hypot(
    scrubbed.camera.pos[0] - firstCamera[0],
    scrubbed.camera.pos[1] - firstCamera[1],
    scrubbed.camera.pos[2] - firstCamera[2],
  ) < 1) {
    throw new Error('camera rail stayed on its establishing shot at 9 seconds');
  }
  await page.evaluate(() => {
    window.__STUDIO.seek(0);
    window.__STUDIO.setTimeScale(4);
  });
  await page.waitForFunction(
    'window.__STUDIO.fxTimeMs >= 9000 && window.__STUDIO.listActors()[1]?.state === "turret-popped"',
    { timeout: 5000 },
  );
  await page.evaluate(() => window.__STUDIO.pause());
  const duelRoundTrip = await page.evaluate(async () => {
    const S = window.__STUDIO;
    const before = S.getStoryboard();
    const state = S.state();
    await S.load(state);
    const after = S.getStoryboard();
    return {
      before,
      after,
      effects: S.listEffects().length,
      actors: S.listActors(),
    };
  });
  if (JSON.stringify(duelRoundTrip.before) !== JSON.stringify(duelRoundTrip.after)
    || duelRoundTrip.effects !== 6 || duelRoundTrip.actors[1]?.state !== 'turret-popped') {
    throw new Error(`duel storyboard did not round-trip: ${JSON.stringify(duelRoundTrip)}`);
  }
  console.log('[studio-selftest] 12 s duel rail, tank motion, scrub, and automatic FX playback passed');

  // 10. Browser video path: a one-second storyboard records the actual
  // postprocessed canvas to a non-empty MediaRecorder blob. Downloads stay
  // disabled in the harness; the production button enables them.
  const video = await page.evaluate(async () => {
    const S = window.__STUDIO;
    S.clearEffects();
    const camera = S.getCamera();
    const actor = S.listActors()[0];
    S.setStoryboard({
      durationMs: 1000,
      shots: [
        { id: 'record-a', label: 'Record start', tMs: 0,
          pos: camera.pos, lookAt: camera.lookAt, fov: camera.fov },
        { id: 'record-b', label: 'Record end', tMs: 1000,
          pos: [camera.pos[0] + 2, camera.pos[1] + 0.4, camera.pos[2] + 1],
          lookAt: camera.lookAt, fov: camera.fov - 2 },
      ],
      actorTracks: [{ actor: actor.name || actor.uid, keys: [
        { id: 'record-k0', tMs: 0, pos: actor.pos,
          facingDeg: actor.facingDeg, turretDeg: actor.turretDeg, gunDeg: actor.gunDeg },
        { id: 'record-k1', tMs: 1000, pos: [actor.pos[0] + 1.5, actor.pos[1]],
          facingDeg: actor.facingDeg, turretDeg: actor.turretDeg, gunDeg: actor.gunDeg },
      ] }],
    });
    S.seek(500);
    S.effect({ type: 'fire', actor: actor.name || actor.uid, params: { tracer: true, recoil: true } });
    S.seek(0);
    const result = await S.recordVideo({ fps: 30, download: false, videoBitsPerSecond: 4000000 });
    return {
      size: result.size,
      type: result.mimeType,
      durationMs: result.durationMs,
      status: S.recordingStatus(),
      time: S.fxTimeMs,
    };
  });
  if (video.durationMs !== 1000 || video.size < 1000 || video.status.active || video.time !== 1000) {
    throw new Error(`Studio video recording failed: ${JSON.stringify(video)}`);
  }
  await page.evaluate(() => document.querySelector('.pgroup[data-group="global"]')
    ?.scrollIntoView({ block: 'start' }));
  await new Promise((resolveScroll) => setTimeout(resolveScroll, 100));
  await page.screenshot({ path: join(outDir, 'cinematic_storyboard_panel.png') });
  await page.setViewport({ width: 640, height: 400, deviceScaleFactor: 1 });
  const mobileLayout = await page.evaluate(() => {
    document.querySelector('.pgroup[data-group="global"]')?.scrollIntoView({ block: 'start' });
    const dock = document.querySelector('.cot-studio .dock');
    const timeline = document.querySelector('.timelineBoard');
    const dockRect = dock.getBoundingClientRect();
    const timelineRect = timeline.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      dock: [dockRect.left, dockRect.right, dockRect.width],
      timeline: [timelineRect.left, timelineRect.right, timelineRect.width],
      horizontalOverflow: dock.scrollWidth - dock.clientWidth,
      shotCards: document.querySelectorAll('.shotcard').length,
    };
  });
  if (mobileLayout.dock[0] < -0.5 || mobileLayout.dock[1] > mobileLayout.viewport[0] + 0.5
    || mobileLayout.timeline[0] < -0.5 || mobileLayout.timeline[1] > mobileLayout.viewport[0] + 0.5
    || mobileLayout.horizontalOverflow > 1 || mobileLayout.shotCards !== 2) {
    throw new Error(`mobile cinematic panel overflowed: ${JSON.stringify(mobileLayout)}`);
  }
  await page.screenshot({ path: join(outDir, 'cinematic_storyboard_mobile.png') });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  console.log(`[studio-selftest] video recorded ${video.size} bytes as ${video.type}`);

  // 11. exit hands back to the garage
  const after = await page.evaluate(() => {
    window.__STUDIO.exit();
    return { phase: window.__DEBUG.game.phase, active: window.__STUDIO.active };
  });
  if (after.phase !== 'garage' || after.active) {
    throw new Error(`exit() left phase='${after.phase}' active=${after.active}`);
  }
  console.log('[studio-selftest] exit() returned to the garage');
} catch (err) {
  failed = true;
  console.error(`[studio-selftest] FAILED: ${err.message}`);
} finally {
  if (consoleErrors.length) {
    console.error(`[studio-selftest] page console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 30)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
process.exit(failed || consoleErrors.length ? 1 : 0);
