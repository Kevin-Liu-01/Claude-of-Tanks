#!/usr/bin/env node
// death-flow-275's look (Kevin 2026-11-21: "make the kill cam look a lot better esp in terms of ui and presentation").
// One capture hold (tools/capture-hold.mjs runWarmHold): the warm, outside the lock, starts a dev server and a guarded
// browser; the hold stages a real death in a live battle (an enemy parked ahead fires on a player left at one hit point,
// so the true death flow runs: the death beat, the kill cam's shape for the mode, the respawn dial, the spectate list) and
// shoots it at fixed beats.
//
//   node tools/death-flow-shots.mjs --out=DIR [--map=verdant] [--only=desktop|phone|landscape] [--cases=full,quick,card,strike]
//     [--cast]
//
// Cases: full (Standard: the death beat, the replay, the x-ray under the shot card, the finale, then the spectate list on
// the own wreck and a step on to an ally), quick (Zone Control: the beat, the cut to the shot, the impact, the dial),
// card (Gun Game: the card alone over the wreck and the dial), strike (Air Support: an enemy's bomb on the player, the
// quick cam framed on the call-in). --cast: each case filmed in real time instead (Chrome's screencast at the page's own
// frame rate, every frame kept with its timestamp and held for exactly its real duration in the encode: DIR/<case>.mp4).
// (Kevin 2026-11-22 on 10 fps stitches of screenshots: "why are they so fast? is it sped up" — a screenshot took several
// times its 0.1 s slot, so those clips ran about 2.5-3x the game.)
// Receipt (DIR/death-flow-shots.json): each case's death (cause, killer), the shots, the page's errors; for a cast, every
// frame's wall time with the battle clock and kill cam phase beside it, and the playback ratio (wall s : video s, 1.0).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { runWarmHold, rememberWarm, rewarmPage, stubViteSocket } from './capture-hold.mjs';
import { BOOT_LOADED_EXPRESSION, readinessExpression } from './game-readiness.mjs';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mapProbeLaunchOptions, mapProbeServerOptions, beginSoloBattle, sleep } from './map-probe-runtime.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const out = path.resolve(arg('out', '.qa-dev/death-flow'));
const mapId = arg('map', 'verdant');
const only = arg('only');
const cases = (arg('cases') ?? 'full,quick,card,strike').split(',');
const cast = argv.includes('--cast');
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { map: mapId, deaths: {}, shots: [], errors: {}, casts: {} };

const VIEWPORTS = {
  desktop: { width: 1600, height: 900 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  landscape: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const TIERS = { desktop: 'desktop', phone: 'phone', landscape: 'phone' };
// (the card case: Gun Game's 4 s respawn; its autocannon fires into the rear, the one face it goes through. Turbo Ball's
// low gravity carried the rounds over the hull)
const MODES = { full: 'standard', quick: 'zone_control', card: 'gun_game', strike: 'air_support' };

const shot = async (page, name) => {
  await page.evaluate(() => { const go = document.querySelector('.cot-resume.show .rz-go'); go?.click(); });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  receipt.shots.push(name);
};

/**
 * In the page: every bot's brain parked (nothing else fights, so the staged shot is the one that lands and the allies the
 * spectate list steps to stay alive), the nearest enemy parked 120 m ahead facing the player with its turret on its hull
 * line (HE where it carries it: any hit then takes the last hit point), and the player stopped. Returns the foe's id.
 */
const stageFoe = () => {
  const D = window.__DEBUG, g = D.game, p = g.player, hf = D.world.heightField;
  const foe = g.tanks.find((t) => t.team !== p.team && !t.combat.destroyed && t.visual);
  if (!foe) return null;
  for (const t of g.tanks) {
    if (t === p) continue;
    t.aiCtl = null; t.input.fire = false; t.input.throttle = 0; t.input.steer = 0; t.state.speed = 0;
  }
  const yaw = p.state.yaw + (window.__dfRear ? Math.PI : 0);
  // (the card case closes to 50 m: the autocannon's stream from 120 m went into the ground)
  const range = window.__dfRear ? 50 : 120;
  const x = p.state.pos.x + Math.sin(yaw) * range, z = p.state.pos.z + Math.cos(yaw) * range;
  foe.state.pos.set(x, hf.getHeightAt(x, z), z);
  foe.state.yaw = Math.atan2(p.state.pos.x - x, p.state.pos.z - z);
  foe.state.turretYaw = 0;
  foe.state.speed = 0;
  foe.input.aimLocked = false;
  foe.input.aimPoint.set(p.state.pos.x, p.state.pos.y + 1.3, p.state.pos.z);
  const he = foe.spec.gun.shells.findIndex((shell) => /HE/.test(shell.type) && !shell.guided);
  foe.input.shellSlot = he >= 0 ? he : 0;
  // the other enemies far off, so only the staged shot can land
  for (const other of g.tanks) if (other !== foe && other.team !== p.team && !other.combat.destroyed) other.state.pos.x += 900;
  p.input.throttle = 0; p.state.speed = 0;
  window.__dfLog = { fired: 0, hitsOnPlayer: [], hitsElsewhere: 0 };
  D.bus.on('shell:fired', (e) => { if (e.shooterId === foe.id) window.__dfLog.fired++; });
  D.bus.on('shell:hit', (e) => {
    if (e.targetId === p.id) window.__dfLog.hitsOnPlayer.push([e.kind, e.hpRemoved ?? e.damage, e.attackerId]);
    else if (e.attackerId === foe.id) window.__dfLog.hitsElsewhere++;
  });
  return foe.id;
};
/** Fire the staged foe's gun at the player until the player is destroyed (the shot's own flight and resolve). */
const fireUntilDead = async (page, foeId, { timeoutMs = 20_000, hpCap = null } = {}) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const dead = await page.evaluate((foeId, hpCap) => {
      const D = window.__DEBUG, g = D.game, p = g.player, foe = g.tankById.get(foeId);
      if (p.combat.destroyed) return true;
      // (a real damage figure on the card; the autocannon's lighter hits take a lower cap)
      p.combat.hp = Math.min(p.combat.hp, hpCap ?? Math.max(1, p.combat.maxHp * 0.12));
      if (!foe.combat.destroyed) foe.combat.hp = foe.combat.maxHp;
      foe.input.aimPoint.set(p.state.pos.x, p.state.pos.y + 1.3, p.state.pos.z);
      foe.input.fire = true;
      return false;
    }, foeId, hpCap);
    if (dead) return true;
    await sleep(250);
  }
  return false;
};
const recordDeath = (page, key) => page.evaluate(() => {
  const D = window.__DEBUG, g = D.game;
  return { destroyed: !!g.player.combat.destroyed, phase: D.killcam?.phase ?? null, respawnS: g.ruleset?.respawnS ?? null,
    dial: document.querySelector('.cot-respawn:not([hidden])')?.textContent ?? null,
    card: document.querySelector('.cot-kc-card:not([hidden])')?.innerText?.replace(/\s+/g, ' ').slice(0, 240) ?? null };
}).then((state) => { (receipt.deaths[key] ??= []).push(state); return state; });

/**
 * A real-time film of the page: Chrome's screencast (Page.startScreencast), each frame written with its own timestamp, and
 * a page-side trace (every animation frame: the wall clock, the battle clock, the kill cam's phase). stop() encodes the
 * frames with each held for its real duration (ffmpeg's concat durations, then 30 fps constant), so the video runs at the
 * page's speed, and records every frame's time with the battle clock and phase interpolated from the trace.
 */
async function startCast(page, key) {
  const dir = path.join(out, `${key}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, wallS: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__dfTrace = [];
    window.__dfTraceOn = true;
    const step = () => {
      if (!window.__dfTraceOn) return;
      window.__dfTrace.push([Date.now() / 1000, D.game.timeS ?? null, D.killcam?.phase ?? null]);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const vp = page.viewport();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1,
    maxWidth: Math.round(vp.width * (vp.deviceScaleFactor ?? 1)), maxHeight: Math.round(vp.height * (vp.deviceScaleFactor ?? 1)) });
  return async () => {
    await cdp.send('Page.stopScreencast').catch(() => {});
    const endS = Date.now() / 1000;
    await sleep(300);
    await cdp.detach().catch(() => {});
    const trace = await page.evaluate(() => { window.__dfTraceOn = false; return window.__dfTrace; });
    if (frames.length < 2) { receipt.casts[key] = { error: `${frames.length} frame(s)` }; return; }
    // each frame held until the next one came (the last until the stop): the page's own timing, nothing resampled away
    const list = frames.map((frame, i) => `file '${frame.file}'\nduration ${((frames[i + 1]?.wallS ?? endS) - frame.wallS).toFixed(4)}`);
    list.push(`file '${frames.at(-1).file}'`);
    const listFile = path.join(dir, 'frames.txt');
    writeFileSync(listFile, `${list.join('\n')}\n`);
    const mp4 = path.join(out, `${key}.mp4`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-fps_mode', 'cfr', '-r', '30',
      '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', mp4]);
    const videoS = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim());
    const wallSpanS = endS - frames[0].wallS;
    // the battle clock and phase at each frame (the trace's last sample at or before it)
    let j = 0;
    const frameRows = frames.map((frame) => {
      while (j + 1 < trace.length && trace[j + 1][0] <= frame.wallS) j++;
      const [, battleS, phase] = trace[j] ?? [null, null, null];
      return [+(frame.wallS - frames[0].wallS).toFixed(3), battleS === null ? null : +battleS.toFixed(3), phase];
    });
    const battle = trace.filter((row) => row[1] !== null);
    receipt.casts[key] = {
      file: path.basename(mp4), frames: frames.length, wallSpanS: +wallSpanS.toFixed(3), videoS: +videoS.toFixed(3),
      playbackRatio: +(wallSpanS / videoS).toFixed(3),
      battleSpanS: battle.length ? +(battle.at(-1)[1] - battle[0][1]).toFixed(3) : null,
      meanFps: +((frames.length - 1) / (frames.at(-1).wallS - frames[0].wallS)).toFixed(1),
      frameRows: ['wall s since the first frame', 'battle clock s', 'kill cam phase'], frameTimes: frameRows,
    };
    rmSync(dir, { recursive: true, force: true });
  };
}

/** Shots at fixed beats after the death (seconds); under --cast the film runs instead until the last beat. */
async function beats(page, key, marks) {
  const start = Date.now();
  if (cast) {
    const wait = start + marks.at(-1)[0] * 1000 + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    await recordDeath(page, key);
    return;
  }
  for (const [t, label] of marks) {
    const wait = start + t * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    await shot(page, `${key}-${label}`);
    await recordDeath(page, key);
  }
}

async function runCase(page, tag, which) {
  const key = `${tag}-${which}`;
  await page.evaluate((rear) => { window.__dfRear = rear; }, which === 'card');
  const foeId = await page.evaluate(stageFoe);
  if (!foeId) { receipt.deaths[key] = [{ error: 'no foe' }]; return; }
  await sleep(1500);
  const castStop = cast ? await startCast(page, key) : null;
  if (which === 'strike') {
    // an enemy's bomb on the player's hull (Air Support's own request path, its warning included)
    await page.evaluate((foeId) => {
      const D = window.__DEBUG, g = D.game, air = g.matchModeController.airSupport, p = g.player;
      const s = air.capture();
      s.points = s.points.filter(([id]) => id !== foeId).concat([[foeId, air.rules.points.cap]]);
      s.cooldowns = s.cooldowns.filter(([k]) => !k.startsWith(`${foeId}:`));
      air.restore(s);
      p.combat.hp = Math.max(1, p.combat.maxHp * 0.12); // (a real damage figure on the card)
      return air.requestStrike(foeId, 'bomb', p.state.pos.x, p.state.pos.z, g.timeS);
    }, foeId);
    const until = Date.now() + 25_000;
    while (Date.now() < until && !(await page.evaluate(() => window.__DEBUG.game.player.combat.destroyed))) await sleep(150);
  } else if (!(await fireUntilDead(page, foeId, { hpCap: which === 'card' ? 60 : null }))) {
    receipt.deaths[key] = [{ error: 'no death', log: await page.evaluate((foeId) => {
      const g = window.__DEBUG.game, foe = g.tankById.get(foeId);
      return { ...window.__dfLog, foeDestroyed: foe.combat.destroyed, reload: foe.combat.reload, slot: foe.combat.shellSlot,
        ammo: foe.combat.ammo, playerHp: g.player.combat.hp, phase: g.phase, result: g.result };
    }, foeId) }];
    await castStop?.();
    return;
  }
  if (which === 'full') {
    // f-finale sits before the exit's dip through black: a capped replay ends at 2.15 + 11 = 13.15 s and the dip runs
    // about 13.07-13.69 s, so a 13.2 s beat filmed a black frame; a shorter replay is already out on the live wreck by then
    await beats(page, key, [[0.8, 'a-beat'], [3.0, 'b-cut'], [4.6, 'c-flight'], [7.5, 'd-xray'], [10.5, 'e-xray-late'],
      [12.6, 'f-finale'], [16.5, 'g-wreck-stop']]);
    // D on to an ally, A back onto the own wreck (filmed too under --cast)
    await page.keyboard.press('KeyD');
    await sleep(1600);
    if (!cast) await shot(page, `${key}-h-ally`);
    await page.keyboard.press('KeyA');
    await sleep(1600);
    if (!cast) await shot(page, `${key}-i-back-on-wreck`);
  } else if (which === 'quick' || which === 'strike') {
    // (e: after the replay's fade, the card over the live wreck until the revive)
    await beats(page, key, [[0.5, 'a-beat'], [1.4, 'b-cut'], [2.2, 'c-flight'], [3.2, 'd-impact'], [5.3, 'e-card-dial']]);
  } else {
    await beats(page, key, [[0.6, 'a-card'], [2.6, 'b-card-dial']]);
  }
  await castStop?.();
}

let server = null;
const writeReceipt = () => writeFileSync(path.join(out, `death-flow-shots${only ? `-${only}` : ''}${cast ? '-cast' : ''}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
process.on('exit', () => { try { writeReceipt(); } catch {} });
await runWarmHold({
  label: 'death-flow-275',
  lockClass: 'render',
  place: `death-flow-275-shots-${only ?? 'all'}`,
  maxFrozenMinutes: 30,
  warm: async () => {
    server = await createServer(mapProbeServerOptions(root, path.join(root, '.qa-dev/vite-death-flow')));
    await server.listen();
    const port = server.httpServer.address().port;
    const browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: 1600, height: 900 }), { label: 'death-flow-shots' });
    const pages = {};
    for (const tag of Object.keys(VIEWPORTS)) {
      if (only && only !== tag) continue;
      const errors = receipt.errors[tag] = [];
      const page = await browser.newPage();
      await page.setViewport(VIEWPORTS[tag]);
      await stubViteSocket(page);
      rememberWarm(page, { url: `http://127.0.0.1:${port}/?nosplash=1&tier=${TIERS[tag]}&gfxreset=1`, ready: BOOT_LOADED_EXPRESSION });
      await rewarmPage(page);
      page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
      pages[tag] = page;
    }
    return { pages: Object.values(pages), byTag: pages, close: async () => { await browser.close(); await server.close(); } };
  },
  shoot: async ({ byTag, signal }) => {
    for (const [tag, page] of Object.entries(byTag)) {
      // the phone pages take the shapes that read differently there: the full cam's x-ray, the quick cam, the card alone
      const list = tag === 'desktop' ? cases : cases.filter((c) => c !== 'strike');
      for (const which of list) {
        if (signal.aborted) return;
        await beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId, gameMode: MODES[which], settleMs: 3000, timeoutMs: 900_000 });
        await runCase(page, tag, which);
        // (the Leave awaited, then the readiness probe's Garage: docs/AUTOMATION-PATHS.md)
        await page.evaluate(() => window.__DEBUG.leaveBattleToGarage?.());
        await page.waitForFunction(readinessExpression('garage'), { timeout: 120_000, polling: 250 }).catch(() => {});
        await sleep(2500);
      }
    }
  },
});
writeReceipt();
console.log(JSON.stringify({ casts: Object.fromEntries(Object.entries(receipt.casts).map(([k, v]) => [k, v.error ?? {
  frames: v.frames, fps: v.meanFps, wallS: v.wallSpanS, videoS: v.videoS, ratio: v.playbackRatio, battleS: v.battleSpanS }])),
  shots: receipt.shots.length, deaths: Object.fromEntries(Object.entries(receipt.deaths).map(([k, v]) => [k, v.at(-1)])),
  errors: Object.fromEntries(Object.entries(receipt.errors).map(([k, v]) => [k, v.length])) }));
