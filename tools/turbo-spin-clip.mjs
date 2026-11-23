#!/usr/bin/env node
// Turbo and the air spin on film (turbo-spin-275; owner 2026-11-22: "for turbo ball and gravity mode add another thing with
// going up called turbo ... f should also be an official command so u can literally spin in air but only if ur in air
// (gray if ur not)"). One capture hold (tools/capture-hold.mjs runWarmHold, the render lock): the warm, outside the lock,
// starts a dev server and a guarded browser and brings a desktop page (and a phone-tier page at a phone's landscape
// viewport) into a Turbo Ball battle; the hold only films.
//
//   node tools/turbo-spin-clip.mjs --out=DIR [--map=airfield] [--mode=turbo_ball|mars] [--only=desktop|phone]
//
// DIR/turbo-spin.webm: the desktop page in real time on a camera that follows the hull from behind its right quarter (the
// trees of a forest map hid it behind the battle camera), through the real keys: on the ground (the air spin's tile greyed),
// F then Z (the jump, then Turbo's air dash), F then F (a front flip), F, A held and F (a roll to the left), Z on the
// ground (the leap) and its cooldown counting down. DIR/*.png: the controls row on the ground and in the air, and the
// phone's survival edge on the ground. DIR/turbo-spin-clip.json: each press, the hull's state around it and the errors.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { runWarmHold, rememberWarm, rewarmPage, stubViteSocket } from './capture-hold.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mapProbeLaunchOptions, mapProbeServerOptions, beginSoloBattle, sleep } from './map-probe-runtime.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const out = path.resolve(arg('out', '.qa-dev/turbo-spin'));
const mapId = arg('map', 'airfield');
const gameMode = arg('mode', 'turbo_ball');
const only = arg('only');
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { map: mapId, mode: gameMode, presses: [], shots: [], errors: {} };
const VIEWPORTS = {
  desktop: { width: 1600, height: 900 },
  phone: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const TIERS = { desktop: 'desktop', phone: 'phone' };

/** The player's hull as the receipt reads it. */
const hullNow = () => {
  const D = window.__DEBUG, p = D.game.player, s = p.state;
  return { t: +D.game.timeS.toFixed(2), grounded: s.grounded, y: +s.pos.y.toFixed(2), speed: +s.speed.toFixed(1),
    pitch: +s.visualPitch.toFixed(2), roll: +s.visualRoll.toFixed(2), spin: s._airSpinAxis, overturned: s.overturned,
    turboReadyIn: Math.max(0, +(((p.turboReadyS ?? -Infinity) - D.game.timeS)).toFixed(2)) };
};

/** The battle's menus off the film: a headless page never holds the pointer lock, so the battle raises its click-to-resume
 *  veil, and the veil's Resume, refused the lock again, opens Settings, which takes every key (the second clip). Settings
 *  closes through the debug surface; the veil is hidden on this page only (the keys reach the battle under it). */
const clearMenus = () => {
  const D = window.__DEBUG;
  if (D.settings?.isOpen?.()) D.settings.close();
  if (!document.getElementById('turbo-spin-clip-veil')) {
    const style = document.createElement('style');
    style.id = 'turbo-spin-clip-veil';
    style.textContent = '.cot-resume{display:none!important}';
    document.head.append(style);
  }
  return !D.settings?.isOpen?.();
};

/** The player alone on open ground: the bots parked far off, the hull upright, at rest, facing the open pitch. */
const stage = () => {
  const D = window.__DEBUG, game = D.game, me = game.player;
  for (const tank of game.tanks) {
    if (tank === me) continue;
    tank.aiCtl?.pause?.();
    const a = tank.state.pos;
    if (Math.hypot(a.x - me.state.pos.x, a.z - me.state.pos.z) < 120) a.set(a.x + 300, a.y, a.z + 300);
  }
  return true;
};

/** A row element's box (the controls row's tiles), for a cropped still. */
const rowBox = (page) => page.evaluate(() => {
  const row = document.querySelector('.cot-vehicle-controls');
  const r = row?.getBoundingClientRect();
  return r && r.width > 0 ? { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(r.width + 16, 900), height: r.height + 16 } : null;
});

async function press(page, code, label, holdMs = 60) {
  await page.evaluate(clearMenus);
  const before = await page.evaluate(hullNow);
  await page.keyboard.down(code);
  await sleep(holdMs);
  await page.keyboard.up(code);
  await sleep(120);
  const after = await page.evaluate(hullNow);
  receipt.presses.push({ label, code, before, after });
}

const untilGrounded = (page, timeout = 9000) => page.waitForFunction(() => {
  const s = window.__DEBUG.game.player.state;
  return s.grounded && !(s._ride?.rebound > 0);
}, { timeout, polling: 100 }).catch(() => {});

/** A camera behind the hull's right quarter, re-aimed every frame (window.__follow false stops it). */
const follow = () => {
  const D = window.__DEBUG, V = D.camera.position.constructor, eye = new V(), at = new V();
  window.__follow = true;
  const loop = () => {
    if (!window.__follow) { D.rig.release(); return; }
    const s = D.game.player.state, p = s.pos, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    eye.set(p.x - fx * 15 + fz * 17, p.y + 6, p.z - fz * 15 - fx * 17);
    at.set(p.x + fx * 6, p.y + 1.5, p.z + fz * 6);
    D.rig.setExternalPose(eye, at, 52);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

async function filmDesktop(page, signal) {
  // (no click to focus the page: a headless page never holds the pointer lock, and the click's lost lock paused the battle
  // over every frame of the first clip; the keys reach the page without it)
  await page.evaluate(clearMenus);
  await page.evaluate(stage);
  await sleep(800);
  await page.evaluate(clearMenus);
  const row = await rowBox(page);
  if (row) { await page.screenshot({ path: path.join(out, 'desktop-row-ground.png'), clip: row }); receipt.shots.push('desktop-row-ground'); }
  await page.screenshot({ path: path.join(out, 'desktop-ground.png') });
  receipt.shots.push('desktop-ground');
  await page.evaluate(follow);
  await sleep(400);
  const webm = path.join(out, 'turbo-spin.webm');
  const recorder = await page.screencast({ path: webm, fps: 30, quality: 24, ffmpegPath: '/opt/homebrew/bin/ffmpeg' });
  try {
    await sleep(1500); // on the ground: the air spin greyed
    // 1) the jump, then Turbo in the air: an air dash
    await page.keyboard.down('KeyW');
    await sleep(1800);
    await press(page, 'KeyF', 'jump');
    await sleep(380);
    if (row) { await page.screenshot({ path: path.join(out, 'desktop-row-air.png'), clip: row }); receipt.shots.push('desktop-row-air'); }
    await press(page, 'KeyZ', 'turbo in the air');
    await untilGrounded(page);
    await page.keyboard.up('KeyW');
    await sleep(1200);
    if (signal.aborted) return;
    // 2) a front flip: the jump, then F in the air with nothing held
    await press(page, 'KeyF', 'jump');
    await sleep(450);
    await press(page, 'KeyF', 'front flip');
    await untilGrounded(page);
    await sleep(1200);
    if (signal.aborted) return;
    // 3) a roll to the left: A held, F in the air
    await press(page, 'KeyF', 'jump');
    await sleep(450);
    await page.keyboard.down('KeyA');
    await press(page, 'KeyF', 'roll left (A)');
    await sleep(300);
    await page.keyboard.up('KeyA');
    await untilGrounded(page);
    await sleep(1200);
    if (signal.aborted) return;
    // 4) Turbo on the ground: the leap, then its cooldown on the tile
    await page.keyboard.down('KeyW');
    await sleep(1500);
    await press(page, 'KeyZ', 'turbo on the ground');
    await sleep(500);
    await press(page, 'KeyZ', 'turbo again while it cools (refused)');
    await page.keyboard.up('KeyW');
    await sleep(2800);
  } finally {
    await recorder.stop();
    await page.evaluate(() => { window.__follow = false; }).catch(() => {});
  }
}

async function shootPhone(page) {
  await page.evaluate(clearMenus);
  await page.evaluate(stage);
  await sleep(1200);
  await page.screenshot({ path: path.join(out, 'phone-ground.png') });
  receipt.shots.push('phone-ground');
}

let server = null;
const writeReceipt = () => writeFileSync(path.join(out, 'turbo-spin-clip.json'), `${JSON.stringify(receipt, null, 2)}\n`);
process.on('exit', () => { try { writeReceipt(); } catch {} });
await runWarmHold({
  label: 'turbo-spin-275',
  lockClass: 'render',
  place: `turbo-spin-275-clip-${only ?? 'all'}`,
  maxFrozenMinutes: 30,
  warm: async () => {
    server = await createServer(mapProbeServerOptions(root, path.join(root, '.qa-dev/vite-turbo-spin')));
    await server.listen();
    const port = server.httpServer.address().port;
    const browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: 1600, height: 900 }), { label: 'turbo-spin-clip' });
    const pages = {};
    for (const tag of Object.keys(VIEWPORTS)) {
      if (only && only !== tag) continue;
      const errors = receipt.errors[tag] = [];
      const page = await browser.newPage();
      await page.setViewport(VIEWPORTS[tag]);
      await stubViteSocket(page);
      rememberWarm(page, {
        url: `http://127.0.0.1:${port}/?nosplash=1&tier=${TIERS[tag]}&gfxreset=1`, ready: BOOT_LOADED_EXPRESSION,
        after: (page) => beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId, gameMode, settleMs: 2500, timeoutMs: 900_000 }),
      });
      await rewarmPage(page);
      page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
      pages[tag] = page;
    }
    return { pages: Object.values(pages), byTag: pages, close: async () => { await browser.close(); await server.close(); } };
  },
  shoot: async ({ byTag, signal }) => {
    if (byTag.desktop) await filmDesktop(byTag.desktop, signal);
    if (byTag.phone && !signal.aborted) await shootPhone(byTag.phone);
  },
});
writeReceipt();
console.log(JSON.stringify({ shots: receipt.shots, presses: receipt.presses.map((p) => [p.label, p.before.grounded, p.after.spin, p.after.speed]),
  errors: Object.fromEntries(Object.entries(receipt.errors).map(([k, v]) => [k, v.length])) }));
