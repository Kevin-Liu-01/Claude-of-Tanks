#!/usr/bin/env node
// (aircraft-hit-fire-278; Kevin 2026-11-25: "when we hit a plane in the sky with a missile or drone or smthg, it leaves
// this fire that keeps burning in the sky just in the same place") A heavy round on an aircraft in flight draws a one-shot
// airburst: nothing of it stays burning where the aircraft has flown on from. Read from what the page DRAWS: the pixels
// round the hit point, from a camera held on that point against the sky.
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// One desktop page, a solo Air Support battle. Per case, a strafing A-10 is called and, at a moment of its run high over
// the ground, a round is put through its airframe by the authority's own hit test (sim/airSupport.ts tryHitAircraft: the
// mode_aircraft_hit event, the bridge, airSupportWorld.ts strikeHits and the battle's aircraftFx port, main.ts). The
// camera stands ~150 m to the side of that point and below it, the sky behind it, and holds still. Frames: `pre` 3 s
// before the hit, `burst` 0.3 s after, `mid` 3 s after and `late` LATE_S after.
//   struck: a 120 mm HE round that does not bring it down (it flies on);
//   downed: a 120 mm HE round for all its hit points (it falls; its crash is on the ground, below the frame's disc);
//   drone:  an FPV drone's 90 mm warhead (the drone's damage, whatever it leaves).
//
// The pass rule, fixed before the first measurement. The disc: the hit point's projection, radius the projection of
// DISC_M metres (at least 18 px). A pixel has changed where its luma differs from `pre`'s by more than CHANGED_LUMA.
//   1. the round struck the aircraft (tryHitAircraft true; `downed`: its strike downed);
//   2. the burst is drawn: at `burst`, at least BURST_MIN_SHARE of the disc changed;
//   3. nothing stays: at `late`, at most LATE_MAX_SHARE of the disc changed and its mean luma difference <= LATE_MAX_MEAN;
//   4. the aircraft has moved on: its drawn root (matrixWorld) is gone from the scene (its run flown out) or at least
//      MOVED_MIN_M from the hit point at `late`, and its root's projection at least two disc radii from the disc's centre
//      (so a change left in the disc at `late` is never the aircraft itself).
// The negative control is the reverted port (main.ts aircraftFx.hit drawing a hull's destruction, 'ammorack'): it must
// fail 3. Exit 1 on any failed case.
//   node tools/with-capture-lock.mjs --lock-class=render --place=<key> -- node tools/aircraft-hit-fire.browser.mjs \
//     --out=DIR [--map=verdant] [--cases=struck,downed,drone] [--time=day|night] [--tag=fix]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold, stubViteSocket } from './capture-hold.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { decodePng } from './hud-ammo-frame-ink.mjs';
import { beginSoloBattle, mapProbeLaunchOptions, mapProbeServerOptions, sleep } from './map-probe-runtime.mjs';

const DISC_M = 12;
const CHANGED_LUMA = 24;
const BURST_MIN_SHARE = 0.1;
const LATE_S = 10;
const LATE_MAX_SHARE = 0.02;
const LATE_MAX_MEAN = 3;
const MOVED_MIN_M = 60;

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = path.resolve(arg('out', '.qa-dev/aircraft-hit-fire'));
const mapId = arg('map', 'verdant');
const cases = (arg('cases', 'struck,downed,drone')).split(',');
const timeOfDay = arg('time', 'day');
const tag = arg('tag', 'run');
const VIEW = { width: 1280, height: 720 };

const luma = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

/** The disc's change between two decoded frames: { share, mean, px } (share of its pixels past CHANGED_LUMA). */
function discChange(a, b, cx, cy, r) {
  let n = 0, changed = 0, sum = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(a.height - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(a.width - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const o = (y * a.width + x) * 4, d = Math.abs(luma(a.data, o) - luma(b.data, o));
      n++; sum += d; if (d > CHANGED_LUMA) changed++;
    }
  }
  return { px: n, share: n ? +(changed / n).toFixed(4) : 0, mean: n ? +(sum / n).toFixed(2) : 0 };
}

/** The pass rule on one case's measurements: the list of what failed (empty: pass). */
function caseProblems(m) {
  const problems = [];
  if (!m.struck) problems.push('1: the round did not strike the aircraft');
  if (m.wantDowned && !m.downed) problems.push('1: the lethal round did not down the aircraft');
  if (!(m.burst?.share >= BURST_MIN_SHARE)) problems.push(`2: the burst is not drawn (share ${m.burst?.share} < ${BURST_MIN_SHARE})`);
  if (!(m.late?.share <= LATE_MAX_SHARE)) problems.push(`3: ${m.late?.share} of the disc still changed at +${LATE_S} s (> ${LATE_MAX_SHARE})`);
  if (!(m.late?.mean <= LATE_MAX_MEAN)) problems.push(`3: mean luma difference ${m.late?.mean} at +${LATE_S} s (> ${LATE_MAX_MEAN})`);
  if (m.lateCraftM != null && !(m.lateCraftM >= MOVED_MIN_M)) problems.push(`4: the drawn aircraft is ${m.lateCraftM} m from the hit point (< ${MOVED_MIN_M})`);
  if (m.lateCraftM != null && m.late?.jetDiscPx != null && m.late.jetFront && !(m.late.jetDiscPx >= 2 * m.late.disc[2])) {
    problems.push(`4: the drawn aircraft is ${m.late.jetDiscPx} px from the disc's centre (< 2 x ${m.late.disc[2]})`);
  }
  return problems;
}

/** In the page, once: the HUD hidden, the camera held on window.__hfCam each frame. */
const install = () => {
  const D = window.__DEBUG, V = D.camera.position.constructor;
  const style = document.createElement('style');
  style.textContent = 'html.hf-hud-hidden :is(.cot-hud,.cot-dp,.cot-si-stats,.cot-hints,.cot-medal-toasts,.cot-touch,'
    + '.cot-mode-status,.cot-mp-strip,.cot-strike-rack,.cot-binoculars,.cot-strike-warning,.cot-strike-dock,.cot-battle-notices){display:none!important}';
  document.head.append(style);
  document.documentElement.classList.add('hf-hud-hidden');
  const eye = new V(), at = new V();
  window.__hfCam = null;
  const loop = () => {
    const c = window.__hfCam;
    if (c) { eye.set(c.eye[0], c.eye[1], c.eye[2]); at.set(c.at[0], c.at[1], c.at[2]); D.rig.setExternalPose(eye, at, c.fov); }
    // the crew outlives the probe: the bots' rounds never end the battle under it
    const p = D.game.player;
    if (p?.combat && !p.combat.destroyed) p.combat.hp = p.combat.maxHp;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

/** In the page: a strafing run called toward the map's middle, the hit moment chosen high on it, the camera set. */
const stageCase = async () => {
  const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport, hf = D.world.heightField;
  const runs = await import('/src/sim/strikeRuns.ts');
  const saved = air.capture();
  saved.points = saved.points.map(([id, value]) => [id, id === game.player.id ? air.rules.points.cap : value]);
  saved.cooldowns = saved.cooldowns.filter(([key]) => !key.startsWith(`${game.player.id}:`));
  saved.strikes = [];
  air.restore(saved);
  const p = game.player.state.pos, d = Math.hypot(p.x, p.z) || 1;
  const x = p.x - (p.x / d) * 400, z = p.z - (p.z / d) * 400;
  if (!air.requestStrike(game.player.id, 'strafe', x, z, game.timeS)) return { error: 'the strike was refused' };
  const strike = air.strikes[air.strikes.length - 1];
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 }, pose2 = { ...pose };
  let tHit = null;
  for (let t = game.timeS + 6; t < strike.landsS; t += 0.1) {
    runs.runPose(air.rules, strike, t, pose);
    if (pose.y - hf.getHeightAt(pose.x, pose.z) >= 80) { tHit = t; break; }
  }
  if (tHit == null) return { error: 'no moment of the run 80 m over the ground' };
  runs.runPose(air.rules, strike, tHit, pose);
  runs.runPose(air.rules, strike, tHit + 0.5, pose2);
  const vx = pose2.x - pose.x, vz = pose2.z - pose.z, vl = Math.hypot(vx, vz) || 1;
  // to its side and behind, 40 m under it: the sky behind the hit point
  const sx = -vz / vl, sz = vx / vl;
  const ex = pose.x + sx * 150 - (vx / vl) * 40, ez = pose.z + sz * 150 - (vz / vl) * 40;
  const ey = Math.max(pose.y - 40, hf.getHeightAt(ex, ez) + 4);
  window.__hfCam = { eye: [ex, ey, ez], at: [pose.x, pose.y, pose.z], fov: 50 };
  return { strikeId: strike.id, tHit, predicted: [pose.x, pose.y, pose.z], ground: hf.getHeightAt(pose.x, pose.z), eye: [ex, ey, ez] };
};

/** In the page: a round through the aircraft where it is now, by the authority's hit test. */
const hitNow = ({ strikeId, kind }) => {
  const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport;
  const strike = air.strikes.find((s) => s.id === strikeId);
  const enemy = game.tanks.find((t) => t.team !== game.player.team && !t.combat.destroyed);
  if (!strike || !enemy) return { struck: false, why: strike ? 'no enemy hull to fire it' : 'no strike' };
  const jet = D.scene.getObjectByName(`air-support jet ${strikeId}`);
  if (!jet) return { struck: false, why: 'no drawn jet' };
  jet.updateMatrixWorld(true);
  const e = jet.matrixWorld.elements, c = { x: e[12], y: e[13], z: e[14] };
  const spec = kind === 'drone' ? { dmg: 1, type: 'HEAT', caliberMm: 90, tracer: 'DRONE' }
    : { dmg: kind === 'downed' ? strike.hp : 1, type: 'HE', caliberMm: 120 };
  const shell = { dead: false, shooterId: enemy.id, prevPos: { x: c.x, y: c.y + 12, z: c.z }, pos: { x: c.x, y: c.y - 12, z: c.z }, spec };
  const struck = air.tryHitAircraft(shell, game.timeS, 1 / 60);
  return { struck, at: [shell.pos.x, shell.pos.y, shell.pos.z], hp: strike.hp, maxHp: strike.maxHp, downed: strike.downedS != null, timeS: game.timeS };
};

/** In the page: the hit point's projection and the disc's radius in px, and the drawn jet's distance from the point. */
const measureView = ({ at, strikeId }) => {
  const D = window.__DEBUG, V = D.camera.position.constructor, cam = D.camera;
  cam.updateMatrixWorld(true);
  const w = D.renderer.domElement.clientWidth, h = D.renderer.domElement.clientHeight;
  const p = new V(at[0], at[1], at[2]).project(cam);
  const right = new V(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(12);
  const q = new V(at[0] + right.x, at[1] + right.y, at[2] + right.z).project(cam);
  const cx = (p.x + 1) / 2 * w, cy = (1 - p.y) / 2 * h;
  const r = Math.hypot(((q.x + 1) / 2 * w) - cx, ((1 - q.y) / 2 * h) - cy);
  const jet = D.scene.getObjectByName(`air-support jet ${strikeId}`);
  let craftM = null, jetDiscPx = null, jetFront = false;
  if (jet) {
    jet.updateMatrixWorld(true);
    const e = jet.matrixWorld.elements;
    craftM = Math.hypot(e[12] - at[0], e[13] - at[1], e[14] - at[2]);
    const j = new V(e[12], e[13], e[14]).project(cam);
    jetFront = j.z < 1;
    jetDiscPx = Math.round(Math.hypot((j.x + 1) / 2 * w - cx, (1 - j.y) / 2 * h - cy));
  }
  return { cx, cy, r, w, h, craftM: craftM == null ? null : +craftM.toFixed(1), jetVisible: !!jet?.visible, jetDiscPx, jetFront,
    timeS: D.game.timeS };
};

const report = { map: mapId, time: timeOfDay, tag, rule: { DISC_M, CHANGED_LUMA, BURST_MIN_SHARE, LATE_S, LATE_MAX_SHARE, LATE_MAX_MEAN, MOVED_MIN_M },
  cases: {}, errors: [], pass: false };
mkdirSync(out, { recursive: true });
console.log(`[aircraft-hit-fire] ${tag}: the pass rule ${JSON.stringify(report.rule)}`);
let hold, server, browser;
try {
  hold = await openCaptureHold({ label: 'aircraft-hit-fire', place: `aircraft-hit-fire-${tag}`, lockClass: 'render', timeoutMs: 240 * 60_000 });
  server = await createServer(mapProbeServerOptions(process.cwd(), path.join(process.cwd(), `.qa-dev/vite-aircraft-hit-fire-${tag}`)));
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ ...VIEW }), { label: 'aircraft-hit-fire' });
  const page = await browser.newPage();
  await page.setViewport({ ...VIEW, deviceScaleFactor: 1 });
  await stubViteSocket(page);
  await page.evaluateOnNewDocument((time) => {
    Document.prototype.hasFocus = () => true;
    try { localStorage.setItem('cot.telemetry', 'off'); localStorage.setItem('cot.battle.times.v2', JSON.stringify([time])); } catch { /* none */ }
  }, timeOfDay);
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error' && report.errors.length < 30) report.errors.push(`console: ${m.text().slice(0, 300)}`); });
  await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=desktop&gfxreset=1&telemetry=off`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await page.waitForFunction(BOOT_LOADED_EXPRESSION, { timeout: 600_000, polling: 250 });
  await beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId, gameMode: 'air_support', settleMs: 2500, timeoutMs: 900_000 });
  await page.evaluate(install);
  const waitTime = (t) => page.waitForFunction((t) => window.__DEBUG.game.timeS >= t, { timeout: 120_000, polling: 50 }, t);
  const frame = async (name) => {
    const file = path.join(out, `${tag}-${name}.png`);
    const buffer = await page.screenshot({ path: file });
    return decodePng(Buffer.from(buffer));
  };
  for (const kind of cases) {
    const staged = await page.evaluate(stageCase);
    const m = report.cases[kind] = { kind, staged, wantDowned: kind === 'downed' };
    if (staged.error) { m.problems = [staged.error]; continue; }
    await waitTime(staged.tHit - 3);
    const pre = await frame(`${kind}-pre`);
    await waitTime(staged.tHit);
    const hit = await page.evaluate(hitNow, { strikeId: staged.strikeId, kind });
    Object.assign(m, { struck: hit.struck, downed: hit.downed, hit });
    if (!hit.struck) { m.problems = caseProblems(m); continue; }
    const at = hit.at;
    for (const [name, dt] of [['burst', 0.3], ['mid', 3], ['late', LATE_S]]) {
      await waitTime(hit.timeS + dt);
      const img = await frame(`${kind}-${name}`);
      const view = await page.evaluate(measureView, { at, strikeId: staged.strikeId });
      m[name] = { ...discChange(img, pre, view.cx, view.cy, Math.max(18, view.r)), disc: [Math.round(view.cx), Math.round(view.cy), Math.round(Math.max(18, view.r))],
        craftM: view.craftM, jetVisible: view.jetVisible, jetDiscPx: view.jetDiscPx, jetFront: view.jetFront, timeS: +view.timeS.toFixed(2) };
    }
    m.lateCraftM = m.late.craftM;
    m.problems = caseProblems(m);
    console.log(`[aircraft-hit-fire] ${tag} ${kind}: burst ${m.burst.share} late ${m.late.share}/${m.late.mean} craft ${m.lateCraftM} m `
      + `${m.problems.length ? `FAIL ${m.problems.join('; ')}` : 'PASS'}`);
    await page.evaluate(() => { window.__hfCam = null; });
  }
  await page.evaluate(() => { window.__hfCam = null; window.__DEBUG.rig.release(); });
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
} finally {
  try { await browser?.close(); } catch (error) { report.errors.push(`browser close: ${error}`); }
  try { await server?.close(); } catch (error) { report.errors.push(`server close: ${error}`); }
  await hold?.release();
}
const failed = Object.values(report.cases).filter((m) => m.problems?.length);
report.pass = !report.errors.some((e) => !e.startsWith('console:')) && Object.keys(report.cases).length === cases.length && !failed.length;
writeFileSync(path.join(out, `aircraft-hit-fire-${tag}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(`aircraft-hit-fire (${tag}): ${Object.keys(report.cases).length} cases, ${failed.length ? `FAIL ${failed.map((m) => m.kind).join(', ')}` : 'all pass'}`
  + `${report.errors.length ? `; ${report.errors.length} page errors (${report.errors[0].slice(0, 200)})` : ''} ${report.pass ? 'PASS' : 'FAIL'}`);
if (!report.pass) process.exitCode = 1;
