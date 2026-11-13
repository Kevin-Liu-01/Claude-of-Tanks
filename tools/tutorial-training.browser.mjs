#!/usr/bin/env node
// tutorial-training.browser.mjs — the training battle played on the live game (273). First-party tooling: Kevin B. Liu.
//
// Boots the game (a player whose 272 tutorial is done), launches the training battle the way the tutorial does (the
// loaner on Verdant Fields, mode `training`), and plays its chapter with real input: the keys drive to each ring, the
// mouse (a finger on a phone) turns the gun onto the board, the wheel (a pinch) pulls the camera back and zooms the sight,
// Shift (the scope button) takes the sight and CapsLock holds free look. Each step is shot, with how it moved on and how
// long it took, to the evidence folder's report.json; --clip records the run.
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
const stepsFor = chapterSteps('training', touch ? 'touch' : 'keyboard');

let server, browser, hold, recorder;
try {
  hold = await openCaptureHold({ label: 'tutorial-training', place: `training-${VIEW}-${LOCALE}`, lockClass: 'render', timeoutMs: 20 * 60_000 });
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

  const stepNow = () => page.evaluate(() => document.querySelector('.cot-tut.is-open')?.dataset.step ?? null);
  const pose = () => page.evaluate(() => {
    const s = window.__DEBUG.game.player.state;
    return { x: s.pos.x, z: s.pos.z, yaw: s.yaw, gun: s.yaw + (s.turretYaw ?? 0) };
  });
  async function waitChange(from, ms) {
    const until = Date.now() + ms;
    for (;;) {
      const now = await stepNow();
      if (now !== from) return now;
      if (Date.now() > until) return null;
      await sleep(150);
    }
  }
  // the battle's pointer: a desktop player clicks into the battle (pointer lock); a phone has no lock
  if (!touch) { await page.mouse.move(vp.width / 2, vp.height * 0.6); await page.mouse.click(vp.width / 2, vp.height * 0.6); await sleep(300); }

  /** Drive into a marker: hold forward, steer toward it with the keys (a phone: the stick), until the step moves on. */
  async function driveTo(marker, stepId) {
    const forward = 'KeyW';
    if (!touch) await page.keyboard.down(forward);
    let steer = null;
    const joy = touch ? await page.$('.cot-touch .joy') : null;
    const box = joy ? await joy.boundingBox() : null;
    try {
      const until = Date.now() + 90_000;
      while (Date.now() < until) {
        if ((await stepNow()) !== stepId) return true;
        const p = await pose();
        const err = wrap(Math.atan2(marker.x - p.x, marker.z - p.z) - p.yaw);
        // a bearing that grows turns toward +x, the hull's left
        const want = err > 0.08 ? 'KeyA' : err < -0.08 ? 'KeyD' : null;
        if (touch && box) {
          const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.4;
          const sx = want === 'KeyA' ? -0.6 : want === 'KeyD' ? 0.6 : 0;
          await page.touchscreen.touchStart(cx, cy).catch(() => {});
          await page.touchscreen.touchMove(cx + sx * r, cy - r * 0.9).catch(() => {});
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
      if (!touch) await page.keyboard.up(forward);
      if (touch) await page.touchscreen.touchEnd().catch(() => {});
    }
  }

  /** Turn the gun onto a marker: the mouse (a finger) by small moves, the sign learnt from the gun's answer. */
  async function aimAt(marker, stepId) {
    let sign = 1;
    const until = Date.now() + 40_000;
    while (Date.now() < until) {
      if ((await stepNow()) !== stepId) return true;
      const p = await pose();
      const err = wrap(Math.atan2(marker.x - p.x, marker.z - p.z) - p.gun);
      if (Math.abs(err) < 0.05) { await sleep(300); continue; }
      const dx = Math.max(-120, Math.min(120, -err * 260)) * sign;
      if (touch) {
        const x = vp.width * 0.62, y = vp.height * 0.4;
        await page.touchscreen.touchStart(x, y); await page.touchscreen.touchMove(x + dx, y); await page.touchscreen.touchEnd();
      } else {
        await page.mouse.move(vp.width / 2 + dx, vp.height * 0.6, { steps: 4 });
        await page.mouse.move(vp.width / 2, vp.height * 0.6, { steps: 1 });
      }
      await sleep(250);
      const after = await pose();
      const errAfter = wrap(Math.atan2(marker.x - after.x, marker.z - after.z) - after.gun);
      if (Math.abs(errAfter) > Math.abs(err) + 0.01) sign = -sign;
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

  const MARKERS = { 'training.driveA': 'driveA', 'training.driveB': 'driveB', 'training.turret': 'board' };
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
    else if (id === 'training.driveA' || id === 'training.driveB') { how = 'drove'; await driveTo(TRAINING_POINTS[MARKERS[id]], now); }
    else if (id === 'training.turret') { how = 'aimed'; await aimAt(TRAINING_POINTS.board, now); }
    else if (id === 'training.orbit') { how = touch ? 'pinched' : 'wheel out'; if (touch) await pinch(false); else await wheel(240, 4); }
    else if (id === 'training.sight') {
      how = touch ? 'scope button' : 'shift';
      if (touch) await (await page.$('.cot-touch .round.scope')).tap(); else await page.keyboard.press('ShiftLeft');
    } else if (id === 'training.zoom') { how = touch ? 'pinched' : 'wheel in'; if (touch) await pinch(true); else await wheel(-240, 4); }
    else if (id === 'training.freeLook') {
      how = 'held CapsLock';
      await page.keyboard.down('CapsLock');
      await page.mouse.move(vp.width / 2 + 200, vp.height * 0.6, { steps: 6 });
      await sleep(1600);
      await page.keyboard.up('CapsLock');
    }
    const next = await waitChange(now, id === 'training.rollout' ? 10_000 : 30_000);
    const entry = { step: now, file, how, seconds: Math.round((Date.now() - started) / 100) / 10, advanced: next !== null };
    report.steps.push(entry);
    console.log(`[training] ${now}: ${how} → ${next === null ? 'STUCK' : 'moved on'} (${entry.seconds} s)`);
    if (next === null) break;
    now = next === undefined ? null : next;
    if (now === null) break;
  }
  report.covered = report.steps.map((s) => s.step);
  const expected = stepsFor.map((s) => s.id);
  report.ok = report.steps.every((s) => s.advanced) && expected.every((id) => report.covered.includes(id));
  assert.ok(report.ok, `every step moved on through the game's input: ${JSON.stringify(report.steps.map((s) => [s.step, s.advanced]))}`);
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  await recorder?.stop().catch(() => {});
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
  console.log(`[training] ${report.ok ? 'PASS' : 'FAIL'} → ${OUT}`);
}
