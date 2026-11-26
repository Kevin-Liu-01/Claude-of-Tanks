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
//   2. the burst is drawn: at `burst`, at least 0.1 of the disc changed (amended below: Main 2026-11-26);
//   3. nothing stays: at `late`, at most LATE_MAX_SHARE of the disc changed and its mean luma difference <= LATE_MAX_MEAN;
//   4. the aircraft has moved on: its drawn root (matrixWorld) is gone from the scene (its run flown out) or at least
//      MOVED_MIN_M from the hit point at `late`, and its root's projection at least two disc radii from the disc's centre
//      (so a change left in the disc at `late` is never the aircraft itself).
// The negative control is the reverted port (main.ts aircraftFx.hit drawing a hull's destruction, 'ammorack'): it must
// fail 3. Exit 1 on any failed case.
//
// Harness changes after the first measured pair (2026-11-26, approved by Main; the bar is unchanged):
//   - each case begins with fx.resetAll(): the cases share one battle, and the control's `downed` and `drone` `pre`
//     frames held the `struck` case's 40 s column;
//   - each measured frame is taken with the effects frozen (fx.setFrozen) in the poll that sees its time, released once
//     read: the screenshot's ~0.4 s let the effects age, so `burst` was measured at +0.7 s. Each frame records fxAgeS.
//
// Rule 2 amendment (Main 2026-11-26, rule 2 re-anchored to the control because the control fails the absolute bar).
// Rule 2 is there so the fix does not take away Kevin's hit feedback. The control, the burst Kevin saw, fails the absolute
// 0.1 itself, so the bar was miscalibrated against that goal. Amended rule 2: in each case the fix's changed share of the
// disc is at least the control's, at `burst` (+0.3 s) and at `mid` (+3 s). It is judged against a control run's report
// (--control=JSON, or offline with --judge). Rules 1, 3 and 4 are unchanged. The corrected-probe pair that settled it:
//   share at +0.3 s   struck  downed  drone        share at +3 s   struck  downed  drone
//   fix               0.0954  0.1117  0.0596       fix             0.336   0.298   0.212
//   control           0.059   0.061   0.054        control         0.192   0.273   0.138
//   node tools/with-capture-lock.mjs --lock-class=render --place=<key> -- node tools/aircraft-hit-fire.browser.mjs \
//     --out=DIR [--map=verdant] [--cases=struck,downed,drone] [--time=day|night] [--tag=fix] [--control=CONTROL.json]
//   node tools/aircraft-hit-fire.browser.mjs --judge --fix=FIX.json --control=CONTROL.json   (no browser: the rule on two reports)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const controlFile = arg('control');
const control = controlFile ? JSON.parse(readFileSync(path.resolve(controlFile), 'utf8')) : null;
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

/** The pass rule on one case's measurements, rule 2 against the control's same case (c): what failed (empty: pass). */
function caseProblems(m, c) {
  const problems = [];
  if (!m.struck) problems.push('1: the round did not strike the aircraft');
  if (m.wantDowned && !m.downed) problems.push('1: the lethal round did not down the aircraft');
  if (!c) problems.push('2: no control report to judge the burst against (--control=JSON)');
  for (const at of c ? ['burst', 'mid'] : []) {
    if (!(m[at]?.share >= c[at]?.share)) problems.push(`2: the ${at} draws less than the control's (share ${m[at]?.share} < ${c[at]?.share})`);
  }
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
  // each case starts on a clean sky: the case before's effects (the reverted build's 40 s column) gone
  D.fx.resetAll();
  const p = game.player.state.pos, d = Math.hypot(p.x, p.z) || 1;
  const x = p.x - (p.x / d) * 400, z = p.z - (p.z / d) * 400;
  if (!air.requestStrike(game.player.id, 'strafe', x, z, game.timeS)) return { error: 'the strike was refused' };
  const strike = air.strikes[air.strikes.length - 1];
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 }, pose2 = { ...pose };
  let tHit = null;
  // its whole run (the inbound leg from its call, the pass, the egress): the first moment, past the `pre` frame's lead,
  // 80 m over the ground
  for (let t = game.timeS + 4; t < runs.runExitS(air.rules, strike) - 0.5; t += 0.1) {
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

const RULE = { DISC_M, CHANGED_LUMA, RULE_2: "share >= the control's at burst and mid", LATE_S, LATE_MAX_SHARE, LATE_MAX_MEAN, MOVED_MIN_M };
if (argv.includes('--judge')) {
  // offline: the rule on a fix report against a control report, no browser
  const fix = JSON.parse(readFileSync(path.resolve(arg('fix')), 'utf8'));
  if (!control) throw new Error('--judge needs --control=JSON');
  let bad = 0;
  for (const [kind, m] of Object.entries(fix.cases)) {
    const problems = caseProblems(m, control.cases[kind]);
    if (problems.length) bad++;
    console.log(`[aircraft-hit-fire] judge ${kind}: burst ${m.burst?.share} vs ${control.cases[kind]?.burst?.share}, mid ${m.mid?.share} vs `
      + `${control.cases[kind]?.mid?.share}, late ${m.late?.share}/${m.late?.mean} craft ${m.lateCraftM} m ${problems.length ? `FAIL ${problems.join('; ')}` : 'PASS'}`);
  }
  console.log(`aircraft-hit-fire (judge): ${Object.keys(fix.cases).length} cases ${bad ? 'FAIL' : 'PASS'}`);
  process.exit(bad || !Object.keys(fix.cases).length ? 1 : 0);
}
const report = { map: mapId, time: timeOfDay, tag, rule: RULE, control: controlFile, cases: {}, errors: [], pass: false };
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
  // a measured frame is the effects at their age: frozen in the poll that sees the time (the screenshot takes ~0.4 s, and
  // the effects would age through it), released once it is read
  const freezeAt = (t) => page.waitForFunction((t) => {
    const D = window.__DEBUG;
    if (D.game.timeS < t) return false;
    D.fx.setFrozen(true);
    return D.game.timeS;
  }, { timeout: 120_000, polling: 50 }, t).then((h) => h.jsonValue());
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
    if (!hit.struck) { m.problems = caseProblems(m, control?.cases[kind]); continue; }
    const at = hit.at;
    for (const [name, dt] of [['burst', 0.3], ['mid', 3], ['late', LATE_S]]) {
      const frozenS = await freezeAt(hit.timeS + dt);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const img = await frame(`${kind}-${name}`);
      const view = await page.evaluate(measureView, { at, strikeId: staged.strikeId });
      await page.evaluate(() => window.__DEBUG.fx.setFrozen(false));
      m[name] = { ...discChange(img, pre, view.cx, view.cy, Math.max(18, view.r)), disc: [Math.round(view.cx), Math.round(view.cy), Math.round(Math.max(18, view.r))],
        craftM: view.craftM, jetVisible: view.jetVisible, jetDiscPx: view.jetDiscPx, jetFront: view.jetFront, timeS: +view.timeS.toFixed(2), fxAgeS: +(frozenS - hit.timeS).toFixed(3) };
    }
    m.lateCraftM = m.late.craftM;
    m.problems = caseProblems(m, control?.cases[kind]);
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
