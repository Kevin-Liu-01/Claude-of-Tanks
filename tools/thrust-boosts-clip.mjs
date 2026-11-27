#!/usr/bin/env node
// The boosts on film from the player's own camera, HUD and all (thrust-boosts-279; owner 2026-11-27: "for the rocket
// modes (gravity turbo) i think we should be able to elevate/boost up multiple times into the sky, and that the subsequent
// side/rear boosts that alow you to roll shouldnt like just have you end at rogiinal position they should literally be
// just like a additional force vector added from that side"). One capture hold (tools/capture-hold.mjs runWarmHold, the
// render lock, place thrust-boosts-279): the warm, outside the lock, starts a dev server on this checkout and a guarded
// browser and brings two 1600x900 desktop pages into battles, Turbo Ball and Gravity on the Moon (the Moon chosen as the
// Play menu stores it, cot.game.teams.v1); the hold only films.
//
//   node tools/thrust-boosts-clip.mjs --out=DIR [--map=airfield] [--only=ball|moon] [--port=4259] [--dry]
//
// DIR/ball.webm, real time, the battle's own camera and HUD, the real keys (a caption names each press): F (the jump), F at
// each of three apexes (the belly: three steps up), A+F then A+F again (two side boosts: the drift and roll sum), Z (Turbo in
// flight: the butt's push, nose down), then down to the ground, F to self-right if it landed on its roof. DIR/moon.webm:
// the jump and five belly boosts at their apexes on the Moon, and the long fall. DIR/thrust-boosts-clip.json: each press
// with the hull before and 0.3 s after it (height, climb, drift, roll, boosts spent), the errors. `--dry` warms and films
// outside the lock, for a short check of the harness before a ticket.
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
const out = path.resolve(arg('out', '.qa-dev/thrust-boosts'));
const mapId = arg('map', 'airfield');
const only = arg('only');
const dry = argv.includes('--dry');
const port = Number(arg('port', '4259'));
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { root, map: mapId, takes: {}, errors: {} };
const TAKES = Object.freeze({
  ball: { gameMode: 'turbo_ball', arrangement: null },
  moon: { gameMode: 'mars', arrangement: { mars: { marsGravity: 'moon' } } },
});

/** The player's hull as the receipt reads it. */
const hullNow = () => {
  const D = window.__DEBUG, p = D.game.player, s = p.state;
  const drift = Math.hypot(s._spring.recoilVX, s._spring.recoilVZ);
  return { t: +D.game.timeS.toFixed(2), grounded: s.grounded, y: +s.pos.y.toFixed(2), climb: +s._ride.v.toFixed(2), speed: +s.speed.toFixed(2),
    drift: +drift.toFixed(2), pitch: +s.visualPitch.toFixed(2), roll: +s.visualRoll.toFixed(2), rollV: +s._spring.rollV.toFixed(2),
    boostsUsed: s._boostsUsed, nozzle: s._boostNozzle, level: +(s._thrust?.level ?? 0).toFixed(2), overturned: s.overturned };
};

/** The battle's menus off the film (a headless page never holds the pointer lock; tools/turbo-spin-clip.mjs), and a caption
 *  naming the keys of each press (presentation only, top centre). */
const clearMenus = () => {
  const D = window.__DEBUG;
  if (D.settings?.isOpen?.()) D.settings.close();
  if (!document.getElementById('thrust-boosts-clip-style')) {
    const style = document.createElement('style');
    style.id = 'thrust-boosts-clip-style';
    style.textContent = '.cot-settings.paused{display:none!important}#thrust-boosts-caption{position:fixed;top:56px;left:50%;'
      + 'transform:translateX(-50%);z-index:99999;font:600 26px/1.2 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);'
      + 'padding:6px 16px;border-radius:6px;pointer-events:none;letter-spacing:.02em}';
    document.head.append(style);
    const caption = document.createElement('div');
    caption.id = 'thrust-boosts-caption';
    document.body.append(caption);
  }
  return !D.settings?.isOpen?.();
};
const caption = (page, text) => page.evaluate((value) => { const el = document.getElementById('thrust-boosts-caption'); if (el) el.textContent = value; }, text);

/** The player alone on open ground: the bots paused and parked far off. */
const stage = () => {
  const D = window.__DEBUG, game = D.game, me = game.player;
  for (const tank of game.tanks) {
    if (tank === me) continue;
    tank.aiCtl?.pause?.();
    const a = tank.state.pos;
    if (Math.hypot(a.x - me.state.pos.x, a.z - me.state.pos.z) < 160) a.set(a.x + 400, a.y, a.z + 400);
  }
  return true;
};

/** A press of `keys` (held together, the last one tapped), recorded with the hull before and after. */
async function press(page, take, keys, label) {
  await page.evaluate(clearMenus);
  await caption(page, label);
  const before = await page.evaluate(hullNow);
  const held = keys.slice(0, -1), tap = keys.at(-1);
  for (const key of held) await page.keyboard.down(key);
  await sleep(held.length ? 90 : 0);
  await page.keyboard.down(tap);
  await sleep(70);
  await page.keyboard.up(tap);
  await sleep(230);
  for (const key of held) await page.keyboard.up(key);
  const after = await page.evaluate(hullNow);
  receipt.takes[take].presses.push({ label, keys, before, after });
}

/** Until the climb is spent (the apex), or the ground. */
const untilApex = (page, timeout = 30_000) => page.waitForFunction(() => {
  const s = window.__DEBUG.game.player.state;
  return s._ride.v <= 0 || s.grounded;
}, { timeout, polling: 30 }).catch(() => {});
const untilGrounded = (page, timeout = 40_000) => page.waitForFunction(() => {
  const s = window.__DEBUG.game.player.state;
  return s.grounded && !(s._ride?.rebound > 0);
}, { timeout, polling: 100 }).catch(() => {});

async function filmBall(page, signal) {
  const take = receipt.takes.ball = { presses: [], landed: null };
  await caption(page, 'Turbo Ball: on the ground');
  await sleep(1500);
  await press(page, 'ball', ['KeyF'], 'F: jump');
  for (let k = 1; k <= 3 && !signal.aborted; k++) {
    await untilApex(page);
    await press(page, 'ball', ['KeyF'], `F at the apex: belly boost ${k} of 5`);
  }
  await untilApex(page);
  await press(page, 'ball', ['KeyA', 'KeyF'], 'A + F: side boost (pushed left, rolls)');
  await sleep(300);
  await press(page, 'ball', ['KeyA', 'KeyF'], 'A + F again: the second side boost adds on');
  await sleep(900);
  await press(page, 'ball', ['KeyZ'], 'Z in flight: rear boost (forward, nose down)');
  await sleep(600);
  await caption(page, 'no boosts left: down to the ground');
  await untilGrounded(page);
  await sleep(1400);
  take.landed = await page.evaluate(hullNow);
  if (take.landed.overturned) {
    await press(page, 'ball', ['KeyF'], 'F on its roof: self-right');
    await sleep(3500);
  }
  if (signal.aborted) return;
  // one side boost and its honest landing (Main: "one side boost that ends on its side and the F self-right")
  await caption(page, 'one side boost, then the landing as it comes');
  await sleep(1200);
  await press(page, 'ball', ['KeyF'], 'F: jump');
  await sleep(450);
  await press(page, 'ball', ['KeyD', 'KeyF'], 'D + F: side boost (pushed right, rolls)');
  await untilGrounded(page);
  await sleep(1600);
  take.sideLanding = await page.evaluate(hullNow);
  if (take.sideLanding.overturned) {
    await caption(page, `landed on its ${Math.abs(take.sideLanding.roll) > 2.4 ? 'roof' : 'side'}`);
    await sleep(1200);
    await press(page, 'ball', ['KeyF'], 'F: self-right');
    await sleep(3500);
    take.righted = await page.evaluate(hullNow);
  }
  await caption(page, '');
  await sleep(800);
}

async function filmMoon(page, signal) {
  const take = receipt.takes.moon = { presses: [], landed: null };
  await caption(page, 'Gravity, the Moon: on the ground');
  await sleep(1500);
  await press(page, 'moon', ['KeyF'], 'F: jump');
  for (let k = 1; k <= 5 && !signal.aborted; k++) {
    await untilApex(page);
    await press(page, 'moon', ['KeyF'], `F at the apex: belly boost ${k} of 5`);
  }
  await untilApex(page);
  take.apex = await page.evaluate(hullNow);
  await caption(page, `the top: ${Math.round(take.apex.y)} m. No boosts left: the long fall`);
  await untilGrounded(page, 60_000);
  await sleep(1500);
  take.landed = await page.evaluate(hullNow);
  await caption(page, '');
  await sleep(600);
}

let server = null;
const writeReceipt = () => writeFileSync(path.join(out, 'thrust-boosts-clip.json'), `${JSON.stringify(receipt, null, 2)}\n`);
process.on('exit', () => { try { writeReceipt(); } catch {} });
const warm = async () => {
  const options = mapProbeServerOptions(root, path.join(root, '.qa-dev/vite-thrust-boosts'));
  options.server.port = port;
  server = await createServer(options);
  await server.listen();
  const listening = server.httpServer.address().port;
  const browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: 1600, height: 900 }), { label: 'thrust-boosts-clip' });
  receipt.browserPid = browser.process()?.pid ?? null;
  receipt.serverPort = listening;
  // One live battle at a time (the dry run, 2026-11-27: two booted battles took the browser tree to 10.35 GB, past the
  // guard's 10 GB cap): the first take boots while the ticket waits, each later one after the one before has closed.
  const tags = Object.keys(TAKES).filter((tag) => !only || only === tag);
  const first = tags.length ? await bootTake(browser, listening, tags[0]) : null;
  return { pages: first ? [first] : [], browser, listening, tags, first,
    close: async () => { await browser.close(); await server.close(); } };
};
/** A fresh page in `tag`'s battle (TAKES[tag]), its errors kept in the receipt. */
const bootTake = async (browser, listening, tag) => {
  const spec = TAKES[tag];
  const errors = receipt.errors[tag] = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await stubViteSocket(page);
  rememberWarm(page, {
    url: `http://127.0.0.1:${listening}/?nosplash=1&tier=desktop&gfxreset=1`, ready: BOOT_LOADED_EXPRESSION,
    after: async (p) => {
      if (spec.arrangement) await p.evaluate((value) => localStorage.setItem('cot.game.teams.v1', JSON.stringify(value)), spec.arrangement);
      await beginSoloBattle(p, { specId: 'm1a1_abrams_hc', mapId, gameMode: spec.gameMode, settleMs: 2500, timeoutMs: 900_000 });
    },
  });
  await rewarmPage(page);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 400)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
  return page;
};
const FILMS = { ball: filmBall, moon: filmMoon };
const shoot = async ({ browser, listening, tags, first, signal }) => {
  for (const tag of tags) {
    if (signal.aborted) break;
    const page = tag === tags[0] ? first : await bootTake(browser, listening, tag);
    try {
      await page.bringToFront();
      await page.evaluate(clearMenus);
      await page.evaluate(stage);
      receipt.takes[`${tag}Rules`] = await page.evaluate(() => {
        const p = window.__DEBUG.game.player;
        return { gravityScale: p.modeGravityScale, jumpMps: p.modeJumpMps, airSpin: p.modeAirSpin };
      });
      await sleep(800);
      const recorder = await page.screencast({ path: path.join(out, `${tag}.webm`), fps: 30, quality: 24, ffmpegPath: '/opt/homebrew/bin/ffmpeg' });
      try { await FILMS[tag](page, signal); } finally { await recorder.stop(); }
    } finally { await page.close(); }
  }
};
if (dry) {
  const session = await warm();
  try { await shoot({ ...session, signal: new AbortController().signal }); } finally { await session.close(); }
} else {
  await runWarmHold({ label: 'thrust-boosts-279', lockClass: 'render', place: 'thrust-boosts-279', maxFrozenMinutes: 30, warm, shoot });
}
writeReceipt();
console.log(JSON.stringify({ out, takes: Object.fromEntries(Object.entries(receipt.takes).filter(([, v]) => v?.presses).map(([k, v]) => [k, {
  presses: v.presses.map((p) => `${p.label}: y ${p.before.y}->${p.after.y} used ${p.after.boostsUsed}`), landed: v.landed, apex: v.apex?.y }])),
errors: Object.fromEntries(Object.entries(receipt.errors).map(([k, v]) => [k, v.length])) }));
