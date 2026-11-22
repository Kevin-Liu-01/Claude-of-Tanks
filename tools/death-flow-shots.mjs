#!/usr/bin/env node
// death-flow-275's look (Kevin 2026-11-21: "make the kill cam look a lot better esp in terms of ui and presentation").
// One capture hold (tools/capture-hold.mjs runWarmHold): the warm, outside the lock, starts a dev server and a guarded
// browser; the hold stages a real death in a live battle (an enemy parked ahead fires on a player left at one hit point,
// so the true death flow runs: the death beat, the kill cam's shape for the mode, the respawn dial, the spectate list) and
// shoots it at fixed beats.
//
//   node tools/death-flow-shots.mjs --out=DIR [--map=verdant] [--only=desktop|phone|landscape] [--cases=full,quick,card,strike]
//     [--burst]
//
// Cases: full (Standard: the death beat, the replay, the x-ray under the shot card, the finale, then the spectate list on
// the own wreck and a step on to an ally), quick (Zone Control: the beat, the cut to the shot, the impact, the dial),
// card (Turbo Ball: the card alone over the wreck and the dial), strike (Air Support: an enemy's bomb on the player, the
// quick cam framed on the call-in). --burst: the quick and full cams as a frame every 0.1 s (a clip at 10 fps).
// Receipt (DIR/death-flow-shots.json): each case's death (cause, killer), the shots and the page's errors.
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
const out = path.resolve(arg('out', '.qa-dev/death-flow'));
const mapId = arg('map', 'verdant');
const only = arg('only');
const cases = (arg('cases') ?? 'full,quick,card,strike').split(',');
const burst = argv.includes('--burst');
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { map: mapId, deaths: {}, shots: [], errors: {} };

const VIEWPORTS = {
  desktop: { width: 1600, height: 900 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  landscape: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const TIERS = { desktop: 'desktop', phone: 'phone', landscape: 'phone' };
// (the card case: Turbo Ball's 3 s respawn and HE rounds, which any hit lands; Gun Game's autocannon only glanced)
const MODES = { full: 'standard', quick: 'zone_control', card: 'turbo_ball', strike: 'air_support' };

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
  const yaw = p.state.yaw;
  const x = p.state.pos.x + Math.sin(yaw) * 120, z = p.state.pos.z + Math.cos(yaw) * 120;
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
  window.__dfLog = { fired: 0, hitsOnPlayer: [] };
  D.bus.on('shell:fired', (e) => { if (e.shooterId === foe.id) window.__dfLog.fired++; });
  D.bus.on('shell:hit', (e) => { if (e.targetId === p.id) window.__dfLog.hitsOnPlayer.push([e.kind, e.hpRemoved ?? e.damage, e.attackerId]); });
  return foe.id;
};
/** Fire the staged foe's gun at the player until the player is destroyed (the shot's own flight and resolve). */
const fireUntilDead = async (page, foeId, { timeoutMs = 20_000 } = {}) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const dead = await page.evaluate((foeId) => {
      const D = window.__DEBUG, g = D.game, p = g.player, foe = g.tankById.get(foeId);
      if (p.combat.destroyed) return true;
      p.combat.hp = Math.min(p.combat.hp, Math.max(1, p.combat.maxHp * 0.12)); // (a real damage figure on the card)
      if (!foe.combat.destroyed) foe.combat.hp = foe.combat.maxHp;
      foe.input.aimPoint.set(p.state.pos.x, p.state.pos.y + 1.3, p.state.pos.z);
      foe.input.fire = true;
      return false;
    }, foeId);
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

/** Shots at fixed beats after the death (seconds), or a burst every 0.1 s across `[from, to]`. */
async function beats(page, key, marks, burstSpan = null) {
  const start = Date.now();
  if (burst && burstSpan) {
    let n = 0;
    for (let t = burstSpan[0]; t <= burstSpan[1]; t += 0.1) {
      const wait = start + t * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      await shot(page, `${key}-burst-${String(n++).padStart(3, '0')}`);
    }
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
  const foeId = await page.evaluate(stageFoe);
  if (!foeId) { receipt.deaths[key] = [{ error: 'no foe' }]; return; }
  await sleep(1500);
  if (which === 'strike') {
    // an enemy's bomb on the player's hull (Air Support's own request path, its warning included)
    await page.evaluate((foeId) => {
      const D = window.__DEBUG, g = D.game, air = g.matchModeController.airSupport, p = g.player;
      const s = air.capture();
      s.points = s.points.filter(([id]) => id !== foeId).concat([[foeId, air.rules.points.cap]]);
      s.cooldowns = s.cooldowns.filter(([k]) => !k.startsWith(`${foeId}:`));
      air.restore(s);
      p.combat.hp = 1;
      return air.requestStrike(foeId, 'bomb', p.state.pos.x, p.state.pos.z, g.timeS);
    }, foeId);
    const until = Date.now() + 25_000;
    while (Date.now() < until && !(await page.evaluate(() => window.__DEBUG.game.player.combat.destroyed))) await sleep(150);
  } else if (!(await fireUntilDead(page, foeId))) {
    receipt.deaths[key] = [{ error: 'no death', log: await page.evaluate((foeId) => {
      const g = window.__DEBUG.game, foe = g.tankById.get(foeId);
      return { ...window.__dfLog, foeDestroyed: foe.combat.destroyed, reload: foe.combat.reload, slot: foe.combat.shellSlot,
        ammo: foe.combat.ammo, playerHp: g.player.combat.hp, phase: g.phase, result: g.result };
    }, foeId) }];
    return;
  }
  if (which === 'full') {
    await beats(page, key, [[0.8, 'a-beat'], [3.0, 'b-cut'], [4.6, 'c-flight'], [7.5, 'd-xray'], [10.5, 'e-xray-late'],
      [13.2, 'f-finale'], [16.5, 'g-wreck-stop']], [0, 16]);
    if (!burst) {
      await page.keyboard.press('KeyD');
      await sleep(1600);
      await shot(page, `${key}-h-ally`);
      await page.keyboard.press('KeyA');
      await sleep(1600);
      await shot(page, `${key}-i-back-on-wreck`);
    }
  } else if (which === 'quick' || which === 'strike') {
    await beats(page, key, [[0.5, 'a-beat'], [1.4, 'b-cut'], [2.2, 'c-flight'], [3.2, 'd-impact'], [4.6, 'e-wreck-dial']], [0, 6]);
  } else {
    await beats(page, key, [[0.6, 'a-card'], [2.2, 'b-card-dial']]);
  }
}

let server = null;
const writeReceipt = () => writeFileSync(path.join(out, `death-flow-shots${only ? `-${only}` : ''}${burst ? '-burst' : ''}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
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
      // the phone pages take the shapes that read differently there: the full cam's x-ray and the quick cam
      const list = tag === 'desktop' ? cases : cases.filter((c) => c === 'full' || c === 'quick');
      for (const which of list) {
        if (signal.aborted) return;
        await beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId, gameMode: MODES[which], settleMs: 3000, timeoutMs: 900_000 });
        await runCase(page, tag, which);
        await page.evaluate(() => { void window.__DEBUG.leaveBattleToGarage?.(); });
        await page.waitForFunction(() => window.__DEBUG.game.phase === 'garage', { timeout: 120_000, polling: 250 }).catch(() => {});
        await sleep(2500);
      }
    }
  },
});
writeReceipt();
console.log(JSON.stringify({ shots: receipt.shots.length, deaths: Object.fromEntries(Object.entries(receipt.deaths).map(([k, v]) => [k, v.at(-1)])),
  errors: Object.fromEntries(Object.entries(receipt.errors).map(([k, v]) => [k, v.length])) }));
