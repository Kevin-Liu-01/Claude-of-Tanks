#!/usr/bin/env node
// A battle's first building destruction links no FX program (fx-first-use-261; Main 2026-10-27: the Frontier lane's room
// census saw the guest link fx-structure-pieces-shard in a 977 ms task and fx-fracture-face/room in a 680 ms one the
// first time something broke). Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// A solo battle on a pinned map (the dev server, desktop tier). After the reveal every program the renderer makes is
// logged with the draw that made it; then the nearest structures at least 25 m off, each framed by an external camera pose
// (rig.setExternalPose), take the player's HE rounds through the battle's destruction match
// (game._destruction.shellWorldHit, the call a shell's world hit makes) until one breaks into its fracture. The receipt holds that the
// break drew its fracture (its faces, rooms, body or heap, read after every hit: the draws were real) and that no
// program was made for an FX draw after the strike.
//   node tools/destruction-first-use.browser.selftest.mjs [--map=urban] [--spec=t72b3m_bulat_m] [--json=<out>]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const MAP = arg('map', 'urban');
const SPEC = arg('spec', 't72b3m_bulat_m');
const JSON_OUT = arg('json', null);
const VIEW = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const lock = createCaptureLock();
const report = { map: MAP, spec: SPEC, errors: [] };
let server, browser, refresh;
try {
  // counts programs, times nothing: a render hold
  await lock.acquire(45 * 60_000, { place: 'destruction-first-use', lockClass: 'render' });
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 60_000, protocolTimeout: 300_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox',
      '--disable-dev-shm-usage', `--window-size=${VIEW.width},${VIEW.height + 120}`] }), { label: 'destruction-first-use' });
  report.launch = verifyNativeBrowserLaunch(browser);
  const page = await browser.newPage();
  await page.setViewport({ ...VIEW, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true; // the frame scheduler presents only to a focused document
    try {
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
    } catch { /* none */ }
  });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/?nosplash=1&debug=1&telemetry=off&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await page.waitForFunction('window.__GAME_READY === true && !!window.__DEBUG', { timeout: 300_000, polling: 250 });
  await page.evaluate((specId, mapId) => {
    setTimeout(() => { window.__dfuEntryAt = performance.now(); window.__DEBUG.beginSoloBattle({ specId, mapId }); }, 0);
  }, SPEC, MAP);
  await page.waitForFunction(() => window.__DEBUG.game.phase === 'battle' && !document.querySelector('.cot-bl.on'),
    { timeout: 420_000, polling: 100 });
  // the entry's length to the reveal (what the covered warm costs; loaded-machine wall time, a guide only)
  report.entryMs = await page.evaluate(() => Math.round(performance.now() - window.__dfuEntryAt));
  // every program made from here, with the draw (or compile) that made it
  await page.evaluate(() => {
    const R = window.__DEBUG.renderer, programs = R.info.programs;
    const log = window.__dfu = { made: [], revealAt: performance.now() };
    let drawing = null;
    const path = (object) => {
      const names = [];
      for (let o = object, i = 0; o && i < 5; o = o.parent, i++) names.push(o.name || o.type || '?');
      return names.join('<');
    };
    const direct = R.renderBufferDirect;
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const outer = drawing;
      drawing = { object, material, scene };
      try { return direct.call(this, camera, scene, geometry, material, object, group); } finally { drawing = outer; }
    };
    const push = programs.push;
    programs.push = function (...made) {
      for (const program of made) {
        log.made.push({ t: Math.round(performance.now() - log.revealAt), name: program.name || program.type || '?',
          drawer: drawing ? `${drawing.scene ? 'forward' : 'shadow'} ${path(drawing.object)} [${drawing.material?.name || drawing.material?.type || '?'}]`
            : 'compile or setup (no draw)' });
      }
      return push.apply(this, made);
    };
  });
  await sleep(4000); // the reveal's own settling (finalShadows' later batches) before the strike
  const quiet = await page.evaluate(() => window.__dfu.made.length);
  // the nearest structures at least 25 m from the battle camera, each framed by an external camera pose (the spawn view
  // need not hold one: urban's did not; frontier's nearest stands past 220 m) and struck with the player's HE until one breaks into its fracture (a small structure
  // can shed only pieces, and a shaped charge need not hole masonry, as the first urban runs showed)
  report.target = await page.evaluate(async () => {
    const { game, world, camera, rig } = window.__DEBUG;
    const V = camera.position.constructor;
    const records = [...world.getColliders(), ...world.getObstacles()].filter((r) => r.structureIdx !== undefined && r.min && r.max);
    const byStructure = new Map();
    for (const r of records) {
      const s = byStructure.get(r.structureIdx);
      if (!s) byStructure.set(r.structureIdx, { idx: r.structureIdx, record: r, min: [...r.min], max: [...r.max] });
      else for (let k = 0; k < 3; k++) { s.min[k] = Math.min(s.min[k], r.min[k]); s.max[k] = Math.max(s.max[k], r.max[k]); }
    }
    const from = camera.position.clone();
    const candidates = [...byStructure.values()].map((s) => {
      const c = new V((s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2);
      return { ...s, c, d: Math.hypot(c.x - from.x, c.z - from.z) };
    }).filter((s) => s.d >= 25).sort((a, b) => a.d - b.d).slice(0, 5);
    if (!candidates.length) return { error: `no structure 25 m or more from the camera (${byStructure.size} structures, ${records.length} records)` };
    // a high-explosive round first (HE, HE-FRAG, HESH: the charge that holes a wall), a shaped charge only without one
    const shells = game.player?.spec?.gun?.shells ?? [];
    const type = (s) => String(s.type ?? '');
    const he = shells.find((s) => /^HE(?!AT)/i.test(type(s))) ?? shells.find((s) => /HESH/i.test(type(s)))
      ?? shells.find((s) => /HEAT/i.test(type(s))) ?? shells[0];
    // what a break drew, at its most, read after every hit: its faces give way to the body and heap as it falls
    const drawn = window.__dfu.drawn = { face: 0, room: 0, body: 0, heap: 0, pieces: 0 };
    const tally = () => {
      const now = { face: 0, room: 0, body: 0, heap: 0, pieces: 0 };
      window.__DEBUG.scene.traverse((o) => {
        if (!o.visible) return;
        const kind = /^fx-fracture-(face|room|body|heap)/.exec(o.name ?? '')?.[1];
        if (kind) now[kind]++;
        else if (o.name?.startsWith('fx-structure-pieces') && (o.geometry?.instanceCount ?? 0) > 0) now.pieces++;
      });
      for (const k in now) drawn[k] = Math.max(drawn[k], now[k]);
    };
    window.__dfu.tally = tally;
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    const tried = [];
    for (const target of candidates) {
      const dx = target.c.x - from.x, dz = target.c.z - from.z, len = Math.hypot(dx, dz) || 1;
      const standoff = Math.max(30, Math.max(target.max[0] - target.min[0], target.max[2] - target.min[2]) * 1.6);
      rig.setExternalPose(new V(target.c.x - dx / len * standoff, target.max[1] + 12, target.c.z - dz / len * standoff), target.c.clone(), 60);
      await wait(3000); // the framed view's own first draws (world programs, not FX) before the strike
      window.__dfu.struckAt ??= Math.round(performance.now() - window.__dfu.revealAt);
      // the near wall, a storey up: where a round from the camera's side lands
      const halfAlong = (Math.abs(dx / len) * (target.max[0] - target.min[0]) + Math.abs(dz / len) * (target.max[2] - target.min[2])) / 2;
      const y = target.min[1] + Math.min(3, (target.max[1] - target.min[1]) / 2);
      for (let i = 0; i < 10; i++) {
        game._destruction.shellWorldHit(he, target.record, target.c.x - dx / len * halfAlong * 0.9, y, target.c.z - dz / len * halfAlong * 0.9,
          dx / len, dz / len);
        await wait(350);
        tally();
      }
      const fractured = drawn.face + drawn.room + drawn.body + drawn.heap > 0;
      tried.push({ structureIdx: target.idx, distanceM: Math.round(target.d), standoffM: Math.round(standoff), fractured });
      if (fractured) break;
    }
    return { tried, structures: byStructure.size, shell: type(he) || null };
  });
  assert.ok(!report.target.error, report.target.error);
  await sleep(8000);
  const after = await page.evaluate(() => {
    window.__dfu.tally();
    return { made: window.__dfu.made, struckAt: window.__dfu.struckAt, drawn: window.__dfu.drawn };
  });
  report.programsBeforeStrike = quiet;
  report.drawn = after.drawn;
  report.madeAfterReveal = after.made;
  const isFx = (p) => /\bfx-|<fx</.test(p.drawer) || /^fx-/.test(p.name);
  // FX programs the camera's framing reached before the strike (an ambient effect newly in view) are listed, not held:
  // the receipt is the destruction's
  report.fxBeforeStrike = after.made.filter((p) => isFx(p) && p.t < after.struckAt);
  const fxMade = after.made.filter((p) => isFx(p) && p.t >= after.struckAt);
  report.fxMade = fxMade;
  const struck = report.target.tried.map((t) => `#${t.structureIdx} at ${t.distanceM} m${t.fractured ? ' (broke)' : ''}`).join(', ');
  console.log(`destruction-first-use: ${MAP} entry ${report.entryMs} ms; struck ${struck} with ${report.target.shell}; `
    + `drawn ${JSON.stringify(after.drawn)}; ${after.made.length} programs made after the reveal, struck at +${after.struckAt} ms `
    + `(${fxMade.length} for FX after the strike, ${report.fxBeforeStrike.length} before it)`);
  for (const p of after.made) console.log(`  +${p.t} ms ${p.name}: ${p.drawer}`);
  const { face, room, body, heap } = after.drawn;
  assert.ok(face + room + body + heap > 0, `the strike broke the structure and drew its fracture (${JSON.stringify(after.drawn)})`);
  assert.deepEqual(fxMade.map((p) => `${p.name}: ${p.drawer}`), [], 'no FX program links on the first destruction');
  assert.deepEqual(report.errors, [], 'no page errors');
  console.log('destruction-first-use.browser.selftest: the first destruction linked no FX program after the reveal PASS');
} finally {
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  clearInterval(refresh);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  try { lock.release(); } catch { /* the hold is reaped once this process exits */ }
}
