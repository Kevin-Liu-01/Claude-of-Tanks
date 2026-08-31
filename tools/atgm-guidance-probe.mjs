#!/usr/bin/env node
// Rendered ATGM ammunition gate:
//   E equals the numbered missile slot, click launches and consumes one round,
//   cursor movement steers the missile, and its launcher reloads independently.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';

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
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await puppeteer.launch({
    headless: 'new',
    ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
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
  // lock; ATGM selection and launch below must arrive through KeyE + LMB.
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

  await page.keyboard.press('Digit2');
  const numberedSlot = await page.evaluate(() => window.__DEBUG.game.player.combat.shellSlot);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('KeyE');

  const selected = await page.evaluate(async () => {
    const D = window.__DEBUG;
    const p = D.game.player;
    p.input.fire = false;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      selectedSlot: p.combat.shellSlot,
      missileSlot: p.specialAction.missileSlot,
      active: p.specialAction.active,
      latched: document.querySelector('.cot-special')?.classList.contains('active') || false,
      pressed: document.querySelector('.cot-special')?.getAttribute('aria-pressed') || '',
      ammo: p.combat.ammo[p.combat.shellSlot],
      reloadS: p.combat.reload.t,
      label: document.querySelector('.cot-special .sl')?.textContent || '',
      shellCount: D.game.shells.filter((shell) => shell.shooterId === p.id).length,
    };
  });
  if (selected.selectedSlot !== selected.missileSlot || selected.selectedSlot !== numberedSlot) {
    fail('E and the numbered ammunition key did not select the same guided round');
  }
  if (selected.active || !selected.latched || selected.pressed !== 'true') {
    fail(`E did not remain visibly latched on the selected ATGM: ${JSON.stringify(selected)}`);
  }
  if (selected.reloadS !== 0) fail('preloaded missile channel was not ready after selection');
  if (selected.shellCount !== 0) fail('E auto-fired instead of only selecting ammunition');
  if (selected.label !== 'Select ATGM') fail(`HUD exposed the wrong ATGM action: ${selected.label}`);

  await page.mouse.click(640, 360);
  await page.waitForFunction(
    () => {
      const D = window.__DEBUG;
      const p = D.game.player;
      return D.game.shells.some((shell) => shell.shooterId === p.id && shell.spec.guided);
    },
    { timeout: 3000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 80));

  const launched = await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const shell = D.game.shells.find((entry) => entry.shooterId === p.id && entry.spec.guided);
    return shell ? {
      id: shell.id,
      guided: shell.spec.guided === true,
      selectedSlot: p.combat.shellSlot,
      ammo: p.combat.ammo[p.combat.shellSlot],
      launcherReloadS: p.combat.reload.t,
      vx: shell.vel.x,
      vy: shell.vel.y,
      vz: shell.vel.z,
      speed: shell.vel.length(),
      aim: [p.input.aimPoint.x, p.input.aimPoint.y, p.input.aimPoint.z],
      visual: D.fx.getGuidedMissileDebug?.() || null,
      composite: {
        bound: D.post.lateFx.softState === D.fx.group.userData.softParticles,
        needsSwap: D.post.lateFx.needsSwap,
        depthCopies: D.post.lateFx.softDepthCopies,
      },
    } : null;
  });
  if (!launched) fail('click did not launch the selected ATGM');
  if (!launched.guided || launched.ammo !== selected.ammo - 1) {
    fail('ATGM launch did not consume exactly one selected missile');
  }
  if (!(launched.launcherReloadS > 2 && launched.launcherReloadS <= 3)) {
    fail(`ATGM launcher did not enter its 2-3 second cycle: ${launched.launcherReloadS}`);
  }
  if (!launched.visual || launched.visual.bodies < 1 || launched.visual.trailSegments < 2) {
    fail(`ATGM is not visibly rendered with a sustained trail: ${JSON.stringify(launched.visual)}`);
  }
  if (!launched.composite?.bound || !launched.composite.needsSwap
    || launched.composite.depthCopies < 1) {
    fail(`ATGM exists but its late composite is not presenting it: ${JSON.stringify(launched.composite)}`);
  }

  await page.mouse.move(900, 160, { steps: 10 });
  await new Promise((resolve) => setTimeout(resolve, 180));
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => {
    const button = document.querySelector('.cot-special');
    return window.__DEBUG.game.player.combat.shellSlot === 0
      && !button?.classList.contains('active')
      && button?.getAttribute('aria-pressed') === 'false';
  }, { timeout: 3000 });
  const cannon = await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    return {
      selectedSlot: p.combat.shellSlot,
      reloadS: p.combat.reload.t,
      magazineRounds: p.combat.magazine?.rounds ?? null,
      launcherReloadS: p.combat.reloadChannels[p.specialAction.missileSlot].t,
      latched: document.querySelector('.cot-special')?.classList.contains('active') || false,
      pressed: document.querySelector('.cot-special')?.getAttribute('aria-pressed') || '',
    };
  });
  if (cannon.selectedSlot !== 0 || cannon.reloadS !== 0) {
    fail(`switching away from the ATGM blocked the cannon: ${JSON.stringify(cannon)}`);
  }
  if (cannon.latched || cannon.pressed !== 'false') {
    fail(`numbered cannon selection did not release the ATGM latch: ${JSON.stringify(cannon)}`);
  }
  if (!(cannon.launcherReloadS > 0)) fail('launcher cooldown was lost after selecting the cannon');

  const steered = await page.evaluate((shellId) => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const shell = D.game.shells.find((entry) => entry.id === shellId);
    if (!shell) return null;
    return {
      vx: shell.vel.x,
      vy: shell.vel.y,
      vz: shell.vel.z,
      speed: shell.vel.length(),
      aim: [p.input.aimPoint.x, p.input.aimPoint.y, p.input.aimPoint.z],
      visual: D.fx.getGuidedMissileDebug?.() || null,
    };
  }, launched.id);
  if (!steered) fail('missile completed before the real cursor-guidance sample');
  console.log('[atgm-guidance] launch/steer:', JSON.stringify({ launched, steered }));
  const velocityDelta = Math.hypot(
    steered.vx - launched.vx,
    steered.vy - launched.vy,
    steered.vz - launched.vz,
  );
  if (!(velocityDelta > 1)) fail('missile velocity did not follow the moved cursor');
  if (Math.abs(steered.speed - launched.speed) > 1e-6) fail('guidance changed missile speed');
  const completed = await page.evaluate(async () => {
    const D = window.__DEBUG;
    const p = D.game.player;
    await new Promise((resolve) => setTimeout(resolve, 3200));
    const phaseBefore = D.game.phase;
    const timeBefore = D.game.timeS;
    const fastReturn = D.fastForward(3.2);
    const cannonSlot = p.combat.shellSlot;
    const cannonReloadS = p.combat.reload.t;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      cannonSlot,
      cannonReloadS,
      phaseBefore,
      phaseAfter: D.game.phase,
      timeBefore,
      timeAfter: D.game.timeS,
      fastReturn,
      destroyed: p.combat.destroyed,
      selectedSlot: p.combat.shellSlot,
      missileSlot: p.specialAction.missileSlot,
      missileReloadS: p.combat.reload.t,
      active: p.specialAction.active,
      latched: document.querySelector('.cot-special')?.classList.contains('active') || false,
      pressed: document.querySelector('.cot-special')?.getAttribute('aria-pressed') || '',
    };
  });
  if (completed.cannonSlot !== 0 || completed.cannonReloadS !== 0) {
    fail('cannon channel did not stay ready while the launcher cycled');
  }
  if (completed.selectedSlot !== completed.missileSlot || completed.missileReloadS !== 0) {
    fail(`launcher did not finish reloading in the background: ${JSON.stringify(completed)}`);
  }
  if (completed.active || !completed.latched || completed.pressed !== 'true') {
    fail(`reselecting the ATGM did not restore its visible latch: ${JSON.stringify(completed)}`);
  }
  if (pageErrors.length) fail(`browser errors: ${pageErrors.join(' | ')}`);

  console.log('[atgm-guidance] GREEN', JSON.stringify({ selected, launched, cannon, steered, completed }));
} finally {
  if (browser) await browser.close().catch(() => {});
  await Promise.race([
    server.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
