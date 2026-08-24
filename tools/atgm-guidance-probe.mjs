#!/usr/bin/env node
// Rendered ATGM lifecycle gate:
//   E engages/selects without firing, click launches, later cursor movement
//   steers the live missile, and projectile death restores normal gunnery.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 7860 + Math.floor(Math.random() * 80);
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

let browser;
const pageErrors = [];
const fail = (message) => { throw new Error(message); };

try {
  await server.listen();
  const url = `http://localhost:${server.config.server.port}/?nogate&nosplash`;
  console.log(`[atgm-guidance] vite up at ${url}`);
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

  await page.evaluate(async () => {
    const D = window.__DEBUG;
    await D.startBattle('bwp1');
    D.game.player.combat.reload.t = 0;
  });

  // Use the real desktop input path. The first canvas click acquires pointer
  // lock; ATGM engagement and launch below must arrive through KeyE + LMB.
  await page.click('canvas');
  await page.waitForFunction(
    () => window.__DEBUG.input.isLocked() || window.__DEBUG.input.isCursorAim(),
    { timeout: 5000 },
  );
  // Lift the reticle above the near road so the live missile has enough flight
  // time for a player-visible body, curved trail, and steering sample.
  await page.mouse.move(640, 360);
  await page.mouse.move(640, 80, { steps: 12 });
  await page.waitForFunction(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const dx = p.input.aimPoint.x - p.state.pos.x;
    const dz = p.input.aimPoint.z - p.state.pos.z;
    return Math.hypot(dx, dz) > 250 && D.gunAimError() < 0.025;
  }, { timeout: 5000 });

  const originalSlot = await page.evaluate(() => window.__DEBUG.game.player.combat.shellSlot);
  await page.keyboard.press('KeyE');

  const engaged = await page.evaluate(async () => {
    const D = window.__DEBUG;
    const p = D.game.player;
    p.input.fire = false;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      selectedSlot: p.combat.shellSlot,
      missileSlot: p.specialAction.missileSlot,
      active: p.specialAction.active,
      pendingFire: p.specialAction.pendingFire,
      shellCount: D.game.shells.filter((shell) => shell.shooterId === p.id).length,
    };
  });
  if (!engaged.active || !engaged.pendingFire) fail('E did not engage the ATGM channel');
  if (engaged.selectedSlot !== engaged.missileSlot) fail('E did not select the guided round');
  if (engaged.shellCount !== 0) fail('E auto-fired instead of waiting for a click');
  const buttonEngaged = await page.waitForFunction(
    () => document.querySelector('.cot-special')?.classList.contains('active'),
    { timeout: 3000 },
  ).then(() => true).catch(() => false);
  if (!buttonEngaged) fail('HUD did not show ATGM guidance as engaged');

  await page.mouse.click(640, 360);
  await page.waitForFunction(
    () => window.__DEBUG.game.player.specialAction.inFlightShellId != null,
    { timeout: 3000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 80));

  const launched = await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const shell = D.game.shells.find((entry) => entry.id === p.specialAction.inFlightShellId);
    return shell ? {
      id: shell.id,
      guided: shell.spec.guided === true,
      active: p.specialAction.active,
      pendingFire: p.specialAction.pendingFire,
      inFlightShellId: p.specialAction.inFlightShellId,
      vx: shell.vel.x,
      vy: shell.vel.y,
      vz: shell.vel.z,
      speed: shell.vel.length(),
      aim: [p.input.aimPoint.x, p.input.aimPoint.y, p.input.aimPoint.z],
      visual: D.fx.getGuidedMissileDebug?.() || null,
    } : null;
  });
  if (!launched) fail('click did not launch the engaged ATGM');
  if (!launched.guided || launched.pendingFire || !launched.active) {
    fail('ATGM did not enter its guided in-flight state');
  }
  if (!launched.visual || launched.visual.bodies < 1 || launched.visual.trailSegments < 2) {
    fail(`ATGM is not visibly rendered with a sustained trail: ${JSON.stringify(launched.visual)}`);
  }

  await page.mouse.move(900, 160, { steps: 10 });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const steered = await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const shell = D.game.shells.find((entry) => entry.id === p.specialAction.inFlightShellId);
    if (!shell) return null;
    return {
      vx: shell.vel.x,
      vy: shell.vel.y,
      vz: shell.vel.z,
      speed: shell.vel.length(),
      active: p.specialAction.active,
      aim: [p.input.aimPoint.x, p.input.aimPoint.y, p.input.aimPoint.z],
      visual: D.fx.getGuidedMissileDebug?.() || null,
    };
  });
  if (!steered) fail('missile completed before the real cursor-guidance sample');
  console.log('[atgm-guidance] launch/steer:', JSON.stringify({ launched, steered }));
  const velocityDelta = Math.hypot(
    steered.vx - launched.vx,
    steered.vy - launched.vy,
    steered.vz - launched.vz,
  );
  if (!(velocityDelta > 1)) fail('missile velocity did not follow the moved cursor');
  if (Math.abs(steered.speed - launched.speed) > 1e-6) fail('guidance changed missile speed');
  if (!steered.active) fail('guidance disengaged before projectile completion');

  const completed = await page.evaluate(async (originalSlot) => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const shell = D.game.shells.find((entry) => entry.id === p.specialAction.inFlightShellId);
    // The live render loop keeps advancing between evaluate calls, so a missile
    // aimed into nearby terrain may complete naturally before this forced edge.
    // If it is still alive, deterministically exercise the same shared death path.
    if (shell) {
      shell.dead = true;
      D.fastForward(1 / 60);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      originalSlot,
      selectedSlot: p.combat.shellSlot,
      active: p.specialAction.active,
      inFlightShellId: p.specialAction.inFlightShellId,
    };
  }, originalSlot);
  if (completed.active || completed.inFlightShellId != null) fail('projectile death did not disengage E');
  if (completed.selectedSlot !== completed.originalSlot) fail('normal weapon was not restored');
  const buttonDisengaged = await page.waitForFunction(
    () => !document.querySelector('.cot-special')?.classList.contains('active'),
    { timeout: 3000 },
  ).then(() => true).catch(() => false);
  if (!buttonDisengaged) fail('HUD still showed ATGM guidance as engaged');
  if (pageErrors.length) fail(`browser errors: ${pageErrors.join(' | ')}`);

  console.log('[atgm-guidance] GREEN', JSON.stringify({ engaged, launched, steered, completed }));
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
