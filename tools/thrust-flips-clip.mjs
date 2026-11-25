#!/usr/bin/env node
// The air spin's flips and rolls as still strips (thrust-flips-277; owner 2026-11-24: "right now the flips and barrel
// rolls in gravity mode look like your literally swinging around an axis instead of like a rocket strapped to your butt
// and sides being activated to change your motion"). One capture hold (tools/capture-hold.mjs runWarmHold, the render
// lock): the warm, outside the lock, starts a dev server on the checkout in the working directory (so the same tool films
// a 276 checkout for the "before" and this lane for the "after") and a guarded browser, and brings a 1920x1080 desktop
// page into a Turbo Ball battle; the hold only films.
//
//   node <lane>/tools/thrust-flips-clip.mjs --out=DIR [--map=airfield] [--mode=turbo_ball|mars] [--arrows] [--port=4258]
//                                           [--moves=front,back,roll] [--frames=8] [--step=0.1] [--webm]
//
// For each move (front: W, back: S, roll: A) the hull jumps (F), and 0.42 s into the climb the page's clock is slowed
// (performance.now and requestAnimationFrame scaled, installed before the page's own scripts) and F is pressed with the
// move's key held. From the tick the spin starts, a still every `--step` s of battle time, `--frames` of them, from two
// static cameras set at the press: `chase` behind the hull, `side` off its right flank (off its rear quarter for a roll).
// `--arrows` loads the page with thrustArrows=1 (each nozzle's force on the hull and the centre of mass drawn; a 276
// build ignores it). `--webm` also films each move's slowed take. DIR/<move>-<camera>-<k>.png, DIR/thrust-flips-clip.json:
// each still's battle time and the hull's state (attitude, spin, the burn's levels where the build has them).
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
const flag = (name) => argv.includes(`--${name}`);
const out = path.resolve(arg('out', '.qa-dev/thrust-flips'));
const mapId = arg('map', 'airfield');
const gameMode = arg('mode', 'turbo_ball');
const arrows = flag('arrows');
const webm = flag('webm');
const port = Number(arg('port', '4258'));
const FRAMES = Number(arg('frames', '8'));
const STEP_S = Number(arg('step', '0.1'));
const SLOW = Number(arg('slow', '0.04'));
/** Each move's key and the air spin's axis it picks (movement.ts AIR_SPIN_AXES). */
const MOVES = Object.freeze({
  front: { key: 'KeyW', label: 'front flip (W)', axis: -1 },
  back: { key: 'KeyS', label: 'back flip (S)', axis: 1 },
  roll: { key: 'KeyA', label: 'barrel roll left (A)', axis: 2 },
});
/** The clock while both cameras draw one instant: barely moving (a stopped clock stops the page's frames, and a
 *  screenshot then shows the frame drawn before the stop, from whichever camera drew it). */
const HOLD = 0.002;
const moves = (arg('moves', 'front,back,roll')).split(',').filter((m) => MOVES[m]);
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { root, map: mapId, mode: gameMode, arrows, slow: SLOW, stepS: STEP_S, frames: FRAMES, moves: {}, errors: [] };

/** The page's clock, scaled by window.__timeScale (installed before the page's scripts: the battle's frame loop reads
 *  performance.now and the rAF stamp, so a slowed clock slows the battle and its render alike). */
const TIME_WARP = `(() => {
  const realNow = performance.now.bind(performance);
  let lastReal = realNow(), virt = lastReal;
  window.__timeScale = 1;
  const now = () => { const r = realNow(); virt += (r - lastReal) * window.__timeScale; lastReal = r; return virt; };
  performance.now = now;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => cb(now()));
  const dateNow = Date.now.bind(Date), d0 = dateNow(), v0 = now();
  Date.now = () => d0 + (now() - v0);
})();`;

/** The player's hull as the receipt reads it. */
const hullNow = () => {
  const D = window.__DEBUG, p = D.game.player, s = p.state;
  const thrust = s._thrust ? { main: +s._thrust.main.toFixed(2), trim: +s._thrust.trim.toFixed(2), counter: +s._thrust.counter.toFixed(2), lift: s._thrust.lift } : null;
  return { t: +D.game.timeS.toFixed(3), grounded: s.grounded, y: +s.pos.y.toFixed(2), speed: +s.speed.toFixed(2),
    pitch: +s.visualPitch.toFixed(3), roll: +s.visualRoll.toFixed(3), pitchV: +s._spring.pitchV.toFixed(2), rollV: +s._spring.rollV.toFixed(2),
    spin: s._airSpinAxis, left: +(s._airSpinLeft ?? 0).toFixed(3), thrust, overturned: s.overturned };
};

/** The battle's menus off the film (tools/turbo-spin-clip.mjs: a headless page never holds the pointer lock). */
const clearMenus = () => {
  const D = window.__DEBUG;
  if (D.settings?.isOpen?.()) D.settings.close();
  if (!document.getElementById('thrust-flips-clip-veil')) {
    const style = document.createElement('style');
    style.id = 'thrust-flips-clip-veil';
    style.textContent = '.cot-resume{display:none!important}';
    document.head.append(style);
  }
  return !D.settings?.isOpen?.();
};

/** The player alone on open ground: the bots parked far off (the battle hold keeps them still and the player unhurt), the
 *  page's DOM overlays (the HUD, the world's markers) off the film. */
const stage = () => {
  const D = window.__DEBUG, game = D.game, me = game.player;
  // every element but the battle's canvas and its ancestors (the HUD may share the canvas's container)
  const canvas = D.renderer?.domElement ?? document.querySelector('canvas');
  const hide = (el) => {
    for (const child of el.children) {
      if (child === canvas) continue;
      if (canvas && child.contains(canvas)) hide(child);
      else if (child instanceof HTMLElement || child instanceof SVGElement) child.style.setProperty('visibility', 'hidden', 'important');
    }
  };
  hide(document.body);
  try { D.battleHold?.set?.(true); } catch { /* a build without the hold */ }
  for (const tank of game.tanks) {
    if (tank === me) continue;
    tank.aiCtl?.pause?.();
    const a = tank.state.pos;
    if (Math.hypot(a.x - me.state.pos.x, a.z - me.state.pos.z) < 150) a.set(a.x + 300, a.y, a.z + 300);
  }
  return true;
};

/** Two static cameras set at the press (window.__cams), and the one drawn (window.__cam), held every frame. */
const setCameras = (roll) => {
  const D = window.__DEBUG, V = D.camera.position.constructor, s = D.game.player.state, p = s.pos;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  // the hull's right: -x at heading 0 (a positive steer turns toward +x, the hull's left)
  const rx = -fz, rz = fx;
  const ahead = roll ? 0 : 5, aside = roll ? -4 : 0; // a roll travels to the left (+x side)
  const cx = p.x + fx * ahead - rx * aside, cz = p.z + fz * ahead - rz * aside, cy = p.y + 2.5;
  window.__cams = {
    chase: { eye: new V(p.x - fx * 18, p.y + 4, p.z - fz * 18), at: new V(cx, cy, cz), fov: 46 },
    side: roll
      ? { eye: new V(p.x - fx * 13 + rx * 13, p.y + 3, p.z - fz * 13 + rz * 13), at: new V(cx, cy, cz), fov: 46 }
      : { eye: new V(cx + rx * 20, p.y + 3, cz + rz * 20), at: new V(cx, cy, cz), fov: 46 },
  };
  window.__cam = 'chase';
  if (!window.__camLoop) {
    window.__camLoop = true;
    const loop = () => {
      if (!window.__camLoop) { D.rig.release(); return; }
      const cam = window.__cams?.[window.__cam];
      if (cam) D.rig.setExternalPose(cam.eye, cam.at, cam.fov);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return true;
};

const frames = (page, n) => page.evaluate((count) => new Promise((resolve) => {
  let left = count; const tick = () => (--left <= 0 ? resolve(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick);
}), n);

const untilGrounded = (page, timeout = 12000) => page.waitForFunction(() => {
  const s = window.__DEBUG.game.player.state;
  return s.grounded && !(s._ride?.rebound > 0) && !s._airSpinAxis;
}, { timeout, polling: 100 }).catch(() => {});

async function filmMove(page, name) {
  const move = MOVES[name];
  const record = receipt.moves[name] = { label: move.label, stills: [] };
  await page.evaluate(clearMenus);
  await page.evaluate(stage);
  await page.evaluate(() => { window.__timeScale = 1; });
  await untilGrounded(page);
  await sleep(900);
  // the jump; the move's key held 0.2 s into the climb (the drive's input ramps to it: a key held for a slowed instant
  // picked no axis), then the clock slowed and F 0.42 s into it
  await page.keyboard.down('KeyF'); await sleep(50); await page.keyboard.up('KeyF');
  const jumpT = await page.evaluate(() => window.__DEBUG.game.timeS);
  await page.waitForFunction((t0) => window.__DEBUG.game.timeS >= t0 + 0.2, { timeout: 5000, polling: 'raf' }, jumpT);
  await page.keyboard.down(move.key);
  await page.waitForFunction((t0) => window.__DEBUG.game.timeS >= t0 + 0.42, { timeout: 5000, polling: 'raf' }, jumpT);
  await page.evaluate((slow) => { window.__timeScale = slow; }, SLOW);
  await page.evaluate(setCameras, name === 'roll');
  await frames(page, 3);
  await page.keyboard.down('KeyF'); await frames(page, 4); await page.keyboard.up('KeyF');
  await page.waitForFunction(() => window.__DEBUG.game.player.state._airSpinAxis !== 0, { timeout: 8000, polling: 'raf' });
  const t0 = await page.evaluate(() => window.__DEBUG.game.timeS);
  record.pressT = t0;
  record.axis = await page.evaluate(() => window.__DEBUG.game.player.state._airSpinAxis);
  if (record.axis !== move.axis) receipt.errors.push(`${name}: the take turned axis ${record.axis}, not the move's ${move.axis}`);
  const recorder = webm ? await page.screencast({ path: path.join(out, `${name}.webm`), fps: 30, quality: 24, ffmpegPath: '/opt/homebrew/bin/ffmpeg' }) : null;
  try {
    for (let k = 0; k < FRAMES; k++) {
      await page.waitForFunction((t) => window.__DEBUG.game.timeS >= t, { timeout: 30000, polling: 'raf' }, t0 + k * STEP_S);
      // hold the battle while both cameras are drawn at this instant
      await page.evaluate((hold) => { window.__timeScale = hold; }, HOLD);
      for (const cam of ['chase', 'side']) {
        await page.evaluate((c) => { window.__cam = c; }, cam);
        await frames(page, 4);
        const file = `${name}-${cam}-${k}.png`;
        await page.screenshot({ path: path.join(out, file) });
        if (cam === 'chase') record.stills.push({ k, file: file.replace('-chase-', '-{cam}-'), hull: await page.evaluate(hullNow) });
      }
      await page.evaluate((c) => { window.__cam = 'chase'; window.__timeScale = c; }, SLOW);
    }
  } finally {
    if (recorder) await recorder.stop();
  }
  await page.keyboard.up(move.key);
  await page.evaluate(() => { window.__timeScale = 1; });
  await untilGrounded(page);
  record.landed = await page.evaluate(hullNow);
}

let server = null;
const writeReceipt = () => writeFileSync(path.join(out, 'thrust-flips-clip.json'), `${JSON.stringify(receipt, null, 2)}\n`);
process.on('exit', () => { try { writeReceipt(); } catch {} });
await runWarmHold({
  label: 'thrust-flips-277',
  lockClass: 'render',
  place: `thrust-flips-277-clip${arrows ? '-arrows' : ''}`,
  maxFrozenMinutes: 30,
  warm: async () => {
    const options = mapProbeServerOptions(root, path.join(root, '.qa-dev/vite-thrust-flips'));
    options.server.port = port;
    server = await createServer(options);
    await server.listen();
    const listening = server.httpServer.address().port;
    const browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: 1920, height: 1080 }), { label: 'thrust-flips-clip' });
    receipt.browserPid = browser.process()?.pid ?? null;
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.evaluateOnNewDocument(TIME_WARP);
    await stubViteSocket(page);
    rememberWarm(page, {
      url: `http://127.0.0.1:${listening}/?nosplash=1&tier=desktop&gfxreset=1${arrows ? '&thrustArrows=1' : ''}`, ready: BOOT_LOADED_EXPRESSION,
      after: (p) => beginSoloBattle(p, { specId: 'm1a1_abrams_hc', mapId, gameMode, settleMs: 2500, timeoutMs: 900_000 }),
    });
    await rewarmPage(page);
    page.on('pageerror', (error) => receipt.errors.push(String(error?.message ?? error).slice(0, 400)));
    page.on('console', (message) => { if (message.type() === 'error') receipt.errors.push(message.text().slice(0, 400)); });
    return { pages: [page], page, close: async () => { await browser.close(); await server.close(); } };
  },
  shoot: async ({ page, signal }) => {
    await page.evaluate(clearMenus);
    await page.evaluate(stage);
    await sleep(1500);
    for (const name of moves) {
      if (signal.aborted) break;
      await filmMove(page, name);
    }
    await page.evaluate(() => { window.__camLoop = false; }).catch(() => {});
  },
});
writeReceipt();
console.log(JSON.stringify({ out, moves: Object.fromEntries(Object.entries(receipt.moves).map(([k, v]) => [k, { stills: v.stills.length, landed: v.landed?.overturned === false }])), errors: receipt.errors.length }));
