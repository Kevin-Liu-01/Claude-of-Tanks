#!/usr/bin/env node
// tutorial-training.browser.mjs — the training battle played on the live game (273). First-party tooling: Kevin B. Liu.
//
// Boots the game (a player whose 272 tutorial is done), launches the training battle the way the tutorial does (the
// loaner on Verdant Fields, mode `training`), and plays its chapter with real input: the keys drive to each ring, the
// mouse (a finger on a phone) turns the gun onto the board, the wheel (a pinch) pulls the camera back and zooms the sight,
// Shift (the scope button) takes the sight and CapsLock holds free look. Each step is shot, with how it moved on and how
// long it took, to the evidence folder's report.json; --clip records the run.
//
// S5 to S14 (desktop): the keys drive to the rings, into bush D and behind the earthworks, H turns the armour colours off
// and on, the digits load the rounds, the mouse lays the gun on a target's plate and clicks to fire, and A or D turn the
// hull against the Sentry. A desktop walk aims as a player does, under the pointer lock: the mouse turns the view, and a
// plate the page projects is brought to the screen's centre (the reticle) before a click. (The cursor-aim fallback the
// walk used before never turns the view at all: Main's item from run 5.) --clip-s9 records S9's angle and volley alone (training-s9-volley.webm), --clip-s14 the fight (training-s14-fight.webm). --through=<step id> ends the walk
// once that step has moved on (the chapter's later scenes not walked).
//
// What it reads from the page is only for steering: the player's pose and the step's marker (as a player reads the
// screen). Every step moves on through the game's own input.
//
//   node tools/tutorial-training.browser.mjs --view=desktop --locale=en --clip
//   node tools/tutorial-training.browser.mjs --view=phone --locale=cn
//
// Holds the shared capture lock (render class) for one batch, and launches its browser through launchGuardedBrowser.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);
const VIEW = arg('view', 'desktop');
const LOCALE = arg('locale', 'en');
const VIEWS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
assert.ok(VIEWS[VIEW] && (LOCALE === 'en' || LOCALE === 'cn'), 'usage: --view=desktop|phone --locale=en|cn');
const OUT = resolve(arg('out', resolve(process.cwd(), `../tutorial-journey-272-evidence/training-${VIEW}-${LOCALE}`)));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const touch = VIEW === 'phone';
const vp = VIEWS[VIEW];
const report = { view: VIEW, locale: LOCALE, steps: [], errors: [], startedAt: new Date().toISOString() };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const { TRAINING_RULES } = await import('../src/sim/trainingGround.ts');
const { chapterSteps } = await import('../src/ui/tutorial/tutorialSteps.ts');
const allSteps = chapterSteps('training', touch ? 'touch' : 'keyboard');
const THROUGH = arg('through', null);
const stepsFor = THROUGH ? allSteps.slice(0, allSteps.findIndex((step) => step.id === THROUGH) + 1) : allSteps;
assert.ok(stepsFor.length, `--through names a step of this walk's chapter (${THROUGH})`);

let server, browser, hold, recorder, clipS9 = null, clipS14 = null;
try {
  hold = await openCaptureHold({ label: 'tutorial-training', place: `training-${VIEW}-${LOCALE}`, lockClass: 'render', timeoutMs: 90 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      `--window-size=${vp.width},${vp.height + 120}`] }), { label: 'tutorial-training' });
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (touch) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
  }
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text().slice(0, 300)}`); });
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true;
    try {
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.tutorial.v1', JSON.stringify({ garage: 'done', battle: 'done', tips: 'done' }));
    } catch { /* none */ }
  });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}${LOCALE === 'cn' ? '/cn' : ''}/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`,
    { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
  // the tutorial's launch: the loaner on the training ground's battlefield, the training mode
  await page.evaluate((specId, mapId) => window.__DEBUG.beginSoloBattle({ specId, mapId, gameMode: 'training' }),
    TRAINING_RULES.loanerSpecId, TRAINING_RULES.mapId);
  await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
  report.battle = await page.evaluate(() => {
    const g = window.__DEBUG.game;
    return { mode: g.gameMode, map: g.mapId, seed: g.matchSeed, player: g.player?.specId,
      field: g.tanks.filter((t) => t.state).map((t) => ({ id: t.id, team: t.team, x: Math.round(t.state.pos.x), z: Math.round(t.state.pos.z) })) };
  });
  console.log(`[training] battle: ${JSON.stringify(report.battle)}`);
  assert.equal(report.battle.mode, 'training');
  assert.equal(report.battle.map, TRAINING_RULES.mapId);
  assert.equal(report.battle.player, TRAINING_RULES.loanerSpecId, 'the player trains in the loaner');
  assert.equal(report.battle.seed, TRAINING_RULES.seed, 'the training battle runs on its own seed');
  if (flag('clip')) recorder = await page.screencast({ path: resolve(OUT, 'training-s1-s4.webm'), scale: touch ? 1 : 0.5 });
  // the rounds that strike the player, as the shot card hears them (the walk's report of S9's volley)
  await page.evaluate(() => {
    window.__walkHits = [];
    window.__DEBUG.bus?.on?.('shell:hit', (hit) => {
      const me = window.__DEBUG.game.player?.id;
      // the rounds that strike the player, and the player's own rounds' outcomes (a shooting step's stall reads them)
      if (hit?.targetId === me || hit?.attackerId === me) {
        window.__walkHits.push({ kind: hit.kind, by: hit.attackerId, on: hit.targetId, t: Math.round(performance.now()) });
      }
    });
  });

  const stepNow = () => page.evaluate(() => document.querySelector('.cot-tut.is-open')?.dataset.step ?? null);
  const pose = () => page.evaluate(() => {
    const s = window.__DEBUG.game.player.state;
    return { x: s.pos.x, z: s.pos.z, yaw: s.yaw, gun: s.yaw + (s.turretYaw ?? 0) };
  });
  /** The next step once the showing one moves on: its id, null when the chapter has ended (no card), undefined on a timeout. */
  async function waitChange(from, ms) {
    const until = Date.now() + ms;
    for (;;) {
      const now = await stepNow();
      if (now !== from) return now;
      if (Date.now() > until) return undefined;
      await sleep(150);
    }
  }
  /** A desktop player clicks into the battle for pointer lock; a step with its dim on (the rollout card) swallows that click,
   *  as 272.1 has it, so the walk takes the lock on the first step that leaves the field clear. A phone has no lock. */
  const locked = () => page.evaluate(() => !!document.pointerLockElement);
  async function takeLock() {
    if (touch || (await locked())) return;
    // (the click that takes the lock is a press on the battle: it may fire a round; the walk counts it)
    await page.mouse.move(vmx, vmy);
    await page.mouse.click(vmx, vmy);
    report.lockClicks = (report.lockClicks ?? 0) + 1;
    await sleep(400);
  }
  // ── Pointer-lock aim (Main, 2026-11-18). Under the lock the game reads movementX/Y, so the mouse moves from a virtual
  // position that walks one way per move, never out and back (out and back nets zero: the first desktop walk's turret
  // stall). If Chrome clamps the synthetic position at the window's edge under the lock, the view stops answering: after
  // two moves that turn nothing the walk re-centres (the lock released, the mouse home, the lock taken again).
  const cx = vp.width / 2, cy = vp.height / 2;
  let vmx = cx, vmy = cy, deadMoves = 0;
  /** rad of view per px of mouse, per view (the sight's is the zoom's share), measured as the walk turns. */
  const gainBy = { third: 0.0025, sight: 0.0004 };
  const viewOf = async () => ((await sightMode()) ? 'sight' : 'third');
  const camAim = () => page.evaluate(() => {
    const camera = window.__DEBUG.camera;
    const d = camera.getWorldDirection(camera.position.clone());
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
  });
  async function recentre() {
    await page.evaluate(() => document.exitPointerLock?.());
    await sleep(300);
    vmx = cx; vmy = cy;
    await page.mouse.move(vmx, vmy);
    report.recentres = (report.recentres ?? 0) + 1;
    await takeLock();
  }
  /** Turn the view by yaw (rad, + toward +x, the hull's left) and pitch (rad, + up), the gain learnt from the answer. */
  async function turnView(yaw, pitch) {
    if (!touch && !(await locked())) await takeLock();
    const view = await viewOf();
    const gain = gainBy[view];
    // screen-right (movementX > 0) lowers the yaw (input.ts SIGN CONTRACT); mouse-down lowers the pitch (cameraRig.ts)
    const dx = Math.max(-500, Math.min(500, -yaw / gain)), dy = Math.max(-250, Math.min(250, -pitch / gain));
    const before = await camAim();
    vmx += dx; vmy += dy;
    await page.mouse.move(vmx, vmy, { steps: Math.max(2, Math.ceil(Math.hypot(dx, dy) / 80)) });
    await sleep(350);
    const after = await camAim();
    const moved = wrap(after.yaw - before.yaw);
    if (Math.abs(dx) > 30) {
      if (Math.abs(moved) < 1e-5) { if (++deadMoves >= 2) { deadMoves = 0; await recentre(); } }
      else { deadMoves = 0; gainBy[view] = 0.5 * gain + 0.5 * Math.abs(moved / dx); }
    }
  }
  /** Bring a world point to the screen's centre (the reticle): within `tolPx` when on screen. Returns whether it is there. */
  async function layOn(point, tolPx = 4) {
    const cam = await camAim();
    const dx = point.x - cam.x, dy = point.y - cam.y, dz = point.z - cam.z;
    const yawErr = wrap(Math.atan2(dx, dz) - cam.yaw);
    const pitchErr = Math.atan2(dy, Math.hypot(dx, dz)) - cam.pitch;
    const at = await project(point);
    if (!at.behind && Math.abs(at.x - cx) <= tolPx && Math.abs(at.y - cy) <= tolPx) return true;
    await turnView(yawErr * 0.85, pitchErr * 0.85);
    return false;
  }
  /** The step's marker on the screen: the guide's ring (null while it is off screen). */
  const markerOnScreen = () => page.evaluate(() => {
    const ring = document.querySelector('.cot-tut-guide-ring');
    if (!ring || ring.getAttribute('display') === 'none') return null;
    const r = ring.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  /** Drive into a marker: hold forward, steer toward it with the keys (a phone: one finger held on the stick, moved by
   *  CDP touch events), until the step moves on. */
  async function driveTo(marker, stepId) {
    let steer = null;
    const joy = touch ? await page.$('.cot-touch .joy') : null;
    const box = joy ? await joy.boundingBox() : null;
    const cdp = touch ? await page.createCDPSession() : null;
    const cx = box ? box.x + box.width / 2 : 0, cy = box ? box.y + box.height / 2 : 0, r = box ? box.width * 0.4 : 0;
    const finger = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
    if (touch) await finger('touchStart', cx, cy);
    else await page.keyboard.down('KeyW');
    try {
      const until = Date.now() + 90_000;
      while (Date.now() < until) {
        if ((await stepNow()) !== stepId) return true;
        const p = await pose();
        const err = wrap(Math.atan2(marker.x - p.x, marker.z - p.z) - p.yaw);
        // a bearing that grows turns toward +x, the hull's left
        const want = err > 0.08 ? 'KeyA' : err < -0.08 ? 'KeyD' : null;
        if (touch) {
          const sx = Math.max(-0.8, Math.min(0.8, -err * 1.5));
          await finger('touchMove', cx + sx * r, cy - r * 0.9);
        } else if (want !== steer) {
          if (steer) await page.keyboard.up(steer);
          if (want) await page.keyboard.down(want);
          steer = want;
        }
        await sleep(120);
      }
      return false;
    } finally {
      if (steer) await page.keyboard.up(steer);
      if (touch) { await finger('touchEnd', cx, cy).catch(() => {}); await cdp.detach().catch(() => {}); }
      else await page.keyboard.up('KeyW');
    }
  }

  /** Turn the gun onto a marker: the mouse (a finger) by small moves, the sign learnt from the gun's answer once the
   *  turret has caught up with the sight (it traverses at its own rate behind the camera). */
  async function aimAt(marker, stepId) {
    const until = Date.now() + 60_000;
    while (Date.now() < until) {
      if ((await stepNow()) !== stepId) return true;
      if (touch) {
        const p = await pose();
        const err = wrap(Math.atan2(marker.x - p.x, marker.z - p.z) - p.gun);
        if (Math.abs(err) < 0.06) { await sleep(300); continue; }
        const dx = Math.max(-90, Math.min(90, -err * 180));
        const x = vp.width * 0.62, y = vp.height * 0.4;
        await page.touchscreen.touchStart(x, y); await page.touchscreen.touchMove(x + dx, y); await page.touchscreen.touchEnd();
        await sleep(800);
        continue;
      }
      // the view onto the marker's foot (the turret follows the view)
      const ground = await page.evaluate(({ x, z }) => window.__DEBUG.game._groundSampler?.(x, z) ?? 0, marker);
      const laid = await layOn({ x: marker.x, y: ground + 1, z: marker.z }, 8);
      const p = await pose();
      (report.aimLog ??= []).push({ laid, err: Math.round(wrap(Math.atan2(marker.x - p.x, marker.z - p.z) - p.gun) * 1000) / 1000 });
      if (laid) await sleep(400);
    }
    return false;
  }

  const wheel = async (deltaY, times) => {
    for (let i = 0; i < times; i++) { await page.mouse.wheel({ deltaY }); await sleep(180); }
  };
  async function pinch(outward) {
    const cx = vp.width / 2, cy = vp.height * 0.45;
    const client = await page.createCDPSession();
    const a = outward ? 20 : 120, b = outward ? 120 : 20;
    for (let k = 0; k <= 6; k++) {
      const d = a + ((b - a) * k) / 6;
      await client.send('Input.dispatchTouchEvent', { type: k === 0 ? 'touchStart' : 'touchMove',
        touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
      await sleep(40);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  }

  const MARKERS = { 'training.driveA': 'driveA', 'training.driveB': 'driveB', 'training.turret': 'board', 'training.spot': 'ringC',
    'training.peek': 'ringC', 'training.toE': 'ringE', 'training.toF': 'fireF' };
  const { actorPoint, headingFromLine } = await import('../src/ui/tutorial/tutorialGuideMath.ts');
  const sightMode = () => page.evaluate(() => window.__DEBUG.rig?.mode === 'SNIPER');
  const actorPose = (id) => page.evaluate((key) => {
    const s = window.__DEBUG.game.tankById.get(key)?.state;
    return s ? { x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw } : null;
  }, id);
  /** A world point on the screen through the battle camera (CSS px), as the guide projects it. */
  const project = (point) => page.evaluate(({ x, y, z }) => {
    const camera = window.__DEBUG.camera;
    const v = camera.position.clone().set(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, behind: v.z > 1 };
  }, point);
  /** Into a marker and stop there (bush D): the hull's speed read from the page. The forward key while far, coasting in
   *  from 14 m, the back key held until the hull stands, then a creep back into the ring if it rolled past (the first run
   *  of 2026-11-18 entered at 8 m/s, tapped the back key for half a second and rolled out of the 5 m ring). */
  /** The hull's signed speed (m/s: + forward). */
  const speed = () => page.evaluate(() => window.__DEBUG.game.player.state.speed ?? 0);
  async function driveInto(marker, stepId) {
    const until = Date.now() + 120_000;
    let steer = null, throttle = null;
    const set = async (key, want) => {
      if (key === 'steer' ? steer === want : throttle === want) return;
      const was = key === 'steer' ? steer : throttle;
      if (was) await page.keyboard.up(was);
      if (want) await page.keyboard.down(want);
      if (key === 'steer') steer = want; else throttle = want;
    };
    try {
      while (Date.now() < until) {
        if ((await stepNow()) !== stepId) return true;
        const p = await pose(), v = await speed();
        const d = Math.hypot(marker.x - p.x, marker.z - p.z);
        const err = wrap(Math.atan2(marker.x - p.x, marker.z - p.z) - p.yaw);
        const inside = d < marker.radiusM * 0.6;
        // facing away from it (it rolled past): reverse toward it, steering as a reversing hull does
        const behind = Math.abs(err) > Math.PI / 2;
        // inside: brake against the way it moves until it stands (the step wants it still 3 s)
        if (inside) { await set('steer', null); await set('throttle', v > 0.3 ? 'KeyS' : v < -0.3 ? 'KeyW' : null); }
        else if (behind && d < 20) { await set('steer', null); await set('throttle', v < -2 ? null : 'KeyS'); }
        else {
          await set('steer', err > 0.08 ? 'KeyA' : err < -0.08 ? 'KeyD' : null);
          await set('throttle', d > 14 ? 'KeyW' : v > 3 ? 'KeyS' : v < 1.5 ? 'KeyW' : null);
        }
        await sleep(80);
      }
      return false;
    } finally {
      await set('steer', null);
      await set('throttle', null);
    }
  }
  /** Lay the gun on a point of an actor (its own frame) and fire until the step moves on: the point brought to the
   *  reticle, the turret settled on it, then a click; the reload spaces the shots. */
  async function fireAt(actorId, local, stepId) {
    const until = Date.now() + 150_000;
    let shots = 0;
    while (Date.now() < until && (await stepNow()) === stepId) {
      if (await fireAtOnce(actorId, local, stepId)) {
        shots += 1;
        if ((await waitChange(stepId, 7500)) !== undefined) return shots;
      }
    }
    return shots;
  }
  /** One shot at an actor's point: laid at the reticle, the gun on it and settled, fired. */
  async function fireAtOnce(actorId, local, stepId) {
    const until = Date.now() + 30_000;
    while (Date.now() < until && (await stepNow()) === stepId) {
      const target = await actorPose(actorId);
      if (!target) return false;
      const point = actorPoint(target, local.along, local.up, local.across);
      if (!(await layOn(point, 3))) { (report.fireLog ??= []).push({ step: stepId, laying: true }); continue; }
      const p = await pose();
      const err = wrap(Math.atan2(target.x - p.x, target.z - p.z) - p.gun);
      if (Math.abs(err) > 0.03) { await sleep(300); continue; } // the turret still traversing behind the view
      await sleep(1200); // the aim settles
      if (!(await layOn(actorPoint(await actorPose(actorId), local.along, local.up, local.across), 3))) continue;
      await page.mouse.down(); await sleep(60); await page.mouse.up();
      (report.shots ??= []).push({ step: stepId, actor: actorId });
      return true;
    }
    return false;
  }
  const TARGET_POINTS = { green: { along: 3.0, up: 0.9, across: 0 }, red: { along: 1.4, up: 2.1, across: 0 }, hull: { along: 0, up: 1.2, across: 0 } };
  const ACTOR = Object.fromEntries(TRAINING_RULES.actors.map((actor) => [actor.key, actor.specId]));
  const { TRAINING_POINTS } = await import('../src/sim/trainingGround.ts');
  let shot = 0;
  let now = await waitChange(null, 60_000);
  assert.equal(now, stepsFor[0].id, 'the training chapter opens on its rollout card');
  while (now) {
    await sleep(700);
    const file = `${String(shot++).padStart(2, '0')}-${now}.png`;
    await page.screenshot({ path: resolve(OUT, file) });
    const started = Date.now();
    const id = now.replace(/(Touch|Pad)$/, '');
    let how = '';
    if (id === 'training.rollout') { how = 'next'; if (touch) await (await page.$('.cot-tut-next')).tap(); else await page.keyboard.press('Enter'); }
    else if (id === 'training.driveA' || id === 'training.driveB') { how = 'drove'; await takeLock(); await driveTo(TRAINING_POINTS[MARKERS[id]], now); }
    else if (id === 'training.spot' || id === 'training.peek' || id === 'training.toE' || id === 'training.toF') {
      // the drives in the third-person view (S5's after the zoom step left the sight on; S9's so the arc and the Sentry
      // are in the frame), as a player drives
      if ((id === 'training.spot' || id === 'training.toF') && (await sightMode())) { await page.keyboard.press('ShiftLeft'); await sleep(400); }
      how = 'drove'; await driveTo(TRAINING_POINTS[MARKERS[id]], now);
    }
    else if (id === 'training.bush') { how = 'drove in, stopped'; await driveInto(TRAINING_POINTS.bushD, now); }
    else if (id === 'training.lamp' || id === 'training.armour' || id === 'training.reload') { how = 'next'; await page.keyboard.press('Enter'); }
    else if (id === 'training.armourSight') { how = 'shift'; if (!(await sightMode())) await page.keyboard.press('ShiftLeft'); }
    else if (id === 'training.armourOff' || id === 'training.armourOn') { how = 'H'; await page.keyboard.press('KeyH'); }
    else if (id === 'training.firePen') { how = 'fired at the green plate'; how += ` (${await fireAt(ACTOR.target1, TARGET_POINTS.green, now)} shots)`; }
    else if (id === 'training.fireBounce') { how = 'fired at the turret front'; how += ` (${await fireAt(ACTOR.target1, TARGET_POINTS.red, now)} shots)`; }
    else if (id === 'training.loadHE') { how = '3'; await page.keyboard.press('Digit3'); }
    else if (id === 'training.fireHE') { how = 'fired HE at Target 2'; how += ` (${await fireAt(ACTOR.target2, TARGET_POINTS.hull, now)} shots)`; }
    else if (id === 'training.loadAP') { how = '1'; await page.keyboard.press('Digit1'); }
    else if (id === 'training.angle') {
      if (flag('clip-s9') && !clipS9) clipS9 = await page.screencast({ path: resolve(OUT, 'training-s9-volley.webm'), scale: 0.5 });
      // pivot with the hull keys until it stands 45 degrees from the line, the cursor kept on the Sentry (the gun on it)
      how = 'turned the hull';
      const until = Date.now() + 60_000;
      let key = null;
      while (Date.now() < until && (await stepNow()) === now) {
        const me = await pose(), sentry = await actorPose(ACTOR.sentry);
        const head = headingFromLine(me, sentry);
        await layOn({ x: sentry.x, y: sentry.y + 1.5, z: sentry.z }, 12); // the gun kept on it
        const want = Math.abs(head) < 42 ? (head >= 0 ? 'KeyA' : 'KeyD') : Math.abs(head) > 50 ? (head >= 0 ? 'KeyD' : 'KeyA') : null;
        if (want !== key) { if (key) await page.keyboard.up(key); if (want) await page.keyboard.down(want); key = want; }
        await sleep(100);
      }
      if (key) await page.keyboard.up(key);
      report.angleAt = Math.round(Math.abs(headingFromLine(await pose(), await actorPose(ACTOR.sentry))));
    }
    // S10 to S14
    else if (id === 'training.toG' || id === 'training.toP' || id === 'training.toKit') {
      how = 'drove in, stopped';
      await driveInto(TRAINING_POINTS[{ 'training.toG': 'ringG', 'training.toP': 'ringP', 'training.toKit': 'ringQ' }[id]], now);
    }
    else if (id === 'training.hullDown' || id === 'training.hullDownFire' || id === 'training.trackHit') {
      // hold still where the scene put the hull, the cursor on the shooter (the gun kept on it)
      how = 'held still';
      const shooter = { 'training.hullDown': ACTOR.sentry2, 'training.hullDownFire': ACTOR.sentry2, 'training.trackHit': ACTOR.sentry4 }[id];
      const until = Date.now() + 90_000;
      while (Date.now() < until && (await stepNow()) === now) {
        const them = await actorPose(shooter);
        if (them) await layOn({ x: them.x, y: them.y + 1.5, z: them.z }, 12);
        await sleep(400);
      }
    }
    else if (id === 'training.fireBack') { how = 'fired at Sentry 2 over the berm'; how += ` (${await fireAt(ACTOR.sentry2, { along: 0.6, up: 2.1, across: 0 }, now)} shots)`; }
    else if (id === 'training.peekShoot' || id === 'training.finish3') {
      // out to ring Q, one shot at Sentry 3, back behind the wall at ring P, until the step moves on
      how = 'peeked, fired, hid';
      let rounds = 0;
      while ((await stepNow()) === now && rounds < 8) {
        await driveInto(TRAINING_POINTS.ringQ, now);
        if ((await stepNow()) !== now) break;
        await fireAtOnce(ACTOR.sentry3, TARGET_POINTS.hull, now);
        await driveInto(TRAINING_POINTS.ringP, now);
        await sleep(1500);
        rounds += 1;
      }
      how += ` (${rounds} rounds)`;
    }
    else if (id === 'training.repair') { how = '4'; await page.keyboard.press('Digit4'); }
    else if (id === 'training.kitRow' || id === 'training.bulwarkFront' || id === 'training.complete') { how = 'next'; await page.keyboard.press('Enter'); }
    else if (id === 'training.smoke') { how = 'G'; await page.keyboard.press('KeyG'); }
    else if (id === 'training.toU' || id === 'training.flank') {
      how = 'drove'; await driveTo(TRAINING_POINTS[id === 'training.toU' ? 'ringU' : 'ringV'], now);
    }
    else if (id === 'training.flankFire' || id === 'training.finishBulwark') {
      how = 'fired into its side'; how += ` (${await fireAt(ACTOR.bulwark, TARGET_POINTS.hull, now)} shots)`;
    }
    else if (id === 'training.fight') {
      // the nearest enemy bot still up: drive toward it to 150 m, then lay on it and fire, until every one is down
      how = 'fought';
      if (flag('clip-s14') && !clipS14) clipS14 = await page.screencast({ path: resolve(OUT, 'training-s14-fight.webm'), scale: 0.5 });
      const enemies = TRAINING_RULES.skirmish.enemies.map((bot) => bot.specId);
      const until = Date.now() + 8 * 60_000;
      while (Date.now() < until && (await stepNow()) === now) {
        const me = await pose();
        const alive = await page.evaluate((ids) => ids.map((id) => {
          const t = window.__DEBUG.game.tankById.get(id);
          return t && !t.combat.destroyed && t.modeActive !== false ? { id, x: t.state.pos.x, z: t.state.pos.z } : null;
        }).filter(Boolean), enemies);
        if (!alive.length) { await sleep(500); continue; }
        alive.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
        const target = alive[0];
        if (Math.hypot(target.x - me.x, target.z - me.z) > 150) {
          await page.keyboard.down('KeyW');
          const err = wrap(Math.atan2(target.x - me.x, target.z - me.z) - me.yaw);
          const key = err > 0.1 ? 'KeyA' : err < -0.1 ? 'KeyD' : null;
          if (key) await page.keyboard.down(key);
          await sleep(500);
          if (key) await page.keyboard.up(key);
          await page.keyboard.up('KeyW');
          continue;
        }
        await fireAtOnce(target.id, TARGET_POINTS.hull, now);
      }
      report.fightLeft = await page.evaluate((ids) => ids.filter((id) => !window.__DEBUG.game.tankById.get(id)?.combat.destroyed), enemies);
    }
    else if (id === 'training.volley') {
      // hold the angle, the cursor on the Sentry, while its rounds land
      how = 'held the angle';
      const until = Date.now() + 90_000;
      while (Date.now() < until && (await stepNow()) === now) {
        const sentry = await actorPose(ACTOR.sentry);
        await layOn({ x: sentry.x, y: sentry.y + 1.5, z: sentry.z }, 12);
        await sleep(400);
      }
      report.hitsTaken = await page.evaluate(() => window.__walkHits ?? []);
    }
    else if (id === 'training.turret') {
      await takeLock();
      how = touch ? 'aimed (drag)' : (await locked()) ? 'aimed (mouse, pointer lock)' : 'aimed (cursor aim)';
      await aimAt(TRAINING_POINTS.board, now);
    }
    else if (id === 'training.orbit') { how = touch ? 'pinched' : 'wheel out'; if (touch) await pinch(false); else await wheel(240, 4); }
    else if (id === 'training.sight') {
      how = touch ? 'scope button' : 'shift';
      if (touch) await (await page.$('.cot-touch .round.scope')).tap(); else await page.keyboard.press('ShiftLeft');
    } else if (id === 'training.zoom') { how = touch ? 'pinched' : 'wheel in'; if (touch) await pinch(true); else await wheel(-240, 4); }
    else if (id === 'training.freeLook') {
      how = 'held CapsLock';
      await page.keyboard.down('CapsLock');
      // (one way, as every move under the lock)
      vmx += 200;
      await page.mouse.move(vmx, vmy, { steps: 6 });
      await sleep(1600);
      await page.keyboard.up('CapsLock');
    }
    const next = await waitChange(now, id === 'training.rollout' ? 10_000 : id === 'training.volley' ? 5_000 : 30_000);
    if (clipS9 && id === 'training.volley') { await sleep(2500); await clipS9.stop().catch(() => {}); clipS9 = null; }
    if (clipS14 && id === 'training.fight') { await sleep(2500); await clipS14.stop().catch(() => {}); clipS14 = null; }
    const entry = { step: now, file, how, seconds: Math.round((Date.now() - started) / 100) / 10, advanced: next !== undefined,
      ended: next === null,
      // what the game stood at as the step ended: the armour colours, the player's health, the hulls on the field
      armour: await page.evaluate(() => window.__DEBUG.input?.getSettings?.().armorAimOverlay ?? null).catch(() => null),
      hp: await page.evaluate(() => Math.round(window.__DEBUG.game.player?.combat?.hp ?? -1)).catch(() => null),
      onField: await page.evaluate(() => window.__DEBUG.game.tanks.filter((t) => t.modeActive !== false && !t.combat.destroyed).length).catch(() => null) };
    report.steps.push(entry);
    console.log(`[training] ${now}: ${how} → ${next === undefined ? 'STUCK' : next === null ? 'chapter done' : 'moved on'} (${entry.seconds} s)`);
    if (next === undefined || next === null) break;
    if (THROUGH && now === THROUGH) { report.stoppedAfter = now; break; }
    now = next;
  }
  // the chapter ended on its last step, and the battle goes on (the card is gone, nothing over the field)
  report.chapterEnded = report.steps.at(-1)?.step === stepsFor.at(-1)?.id && (THROUGH ? report.steps.at(-1)?.advanced === true : report.steps.at(-1)?.ended === true);
  report.hits = await page.evaluate(() => window.__walkHits ?? []).catch(() => []);
  report.leftOver = THROUGH ? 0 : await page.evaluate(() => document.querySelectorAll('.cot-tut, .cot-tut-guide').length);
  report.covered = report.steps.map((s) => s.step);
  // (a desktop walk aims with the cursor, where the game has no free look: the runner moves that step on by itself)
  const expected = stepsFor.map((s) => s.id).filter((stepId) => touch || stepId !== 'training.freeLook');
  report.ok = report.steps.every((s) => s.advanced) && expected.every((id) => report.covered.includes(id)) && report.chapterEnded
    && report.leftOver === 0;
  assert.ok(report.ok, `every step moved on through the game's input: ${JSON.stringify(report.steps.map((s) => [s.step, s.advanced]))}`);
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  await recorder?.stop().catch(() => {});
  await clipS9?.stop().catch(() => {});
  await clipS14?.stop().catch(() => {});
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
  console.log(`[training] ${report.ok ? 'PASS' : 'FAIL'} → ${OUT}`);
}
