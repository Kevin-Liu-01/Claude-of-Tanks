#!/usr/bin/env node
// Air Support's look and the strike marks' cost (air-support-270). One capture hold (tools/capture-hold.mjs runWarmHold):
// the warm, outside the lock, starts a dev server and a guarded browser and brings two pages into an Air Support battle
// on Verdant (a desktop page, and a phone-tier page at a phone's landscape viewport); the hold only stages and shoots.
//
//   node tools/air-support-shots.mjs --out=DIR [--map=verdant] [--only=desktop|phone] [--no-perf]
//
// Shots (DIR/*.png): the strip in third person; the strike view's binoculars with each call-in's reticle on the ground;
// each strike from a camera over its mark (the recon jet's pass, the barrage, the strafing jet's run, the bomb, the AC-130
// in its orbit); the phone's strip, binoculars and CALL. Receipt (DIR/air-support-shots.json): every call accepted and
// the page's errors; with perf, the phone tier's GPU frame time with eight marks up against none, paired and alternated
// (the post chain's own timer, engine/gpuFrameTimer.ts), and the same on the desktop page.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { runWarmHold, warmPage } from './capture-hold.mjs';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mapProbeLaunchOptions, mapProbeServerOptions, beginSoloBattle, sleep } from './map-probe-runtime.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const out = path.resolve(arg('out', '.qa-dev/air-support'));
const mapId = arg('map', 'verdant');
const only = arg('only');
const perf = !argv.includes('--no-perf');
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { map: mapId, shots: [], calls: [], errors: {}, perf: {} };

const VIEWPORTS = {
  desktop: { width: 1600, height: 900 },
  phone: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const TIERS = { desktop: 'desktop', phone: 'phone' };

/** In the page: the player's points to the cap, the nearest enemy parked 260 m ahead (the marks' subject). */
const stage = () => {
  const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport;
  const saved = air.capture();
  saved.points = saved.points.map(([id, value]) => [id, id === game.player.id ? air.rules.points.cap : value]);
  air.restore(saved);
  const p = game.player.state.pos, yaw = game.player.state.yaw;
  const enemy = game.tanks.find((t) => t.team !== game.player.team && !t.combat.destroyed);
  const x = p.x + Math.sin(yaw) * 260, z = p.z + Math.cos(yaw) * 260;
  if (enemy) { enemy.state.pos.set(x, D.world.heightField.getHeightAt(x, z), z); enemy.state.speed = 0; }
  return { x, z, yaw, px: p.x, pz: p.z };
};

const shot = async (page, name) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  receipt.shots.push(name);
};

async function shootDesktop(page, signal, tag) {
  const spot = await page.evaluate(stage);
  await sleep(600);
  await shot(page, `${tag}-strip`);
  for (const kind of ['bomb', 'strafe', 'gunship', 'artillery', 'recon']) {
    if (signal.aborted) return;
    await page.evaluate((kind) => window.__DEBUG.bus.emit('ui:strikePick', { kind }), kind);
    await sleep(kind === 'bomb' ? 1200 : 700);
    await shot(page, `${tag}-view-${kind}`);
  }
  // each call-in on the mark ahead, filmed from a camera over the mark; the next waits for the side's air
  for (const kind of ['recon', 'artillery', 'strafe', 'bomb', 'gunship']) {
    if (signal.aborted) return;
    const accepted = await page.evaluate(async (kind) => {
      const D = window.__DEBUG, air = D.game.matchModeController.airSupport;
      const saved = air.capture();
      saved.points = saved.points.map(([id, value]) => [id, id === D.game.player.id ? air.rules.points.cap : value]);
      air.restore(saved);
      D.bus.emit('ui:strikePick', { kind });
      await new Promise((r) => setTimeout(r, 500));
      const before = air.strikes.length;
      D.bus.emit('ui:strikeCall', {});
      await new Promise((r) => setTimeout(r, 400));
      return air.strikes.length > before ? air.strikes[air.strikes.length - 1] : null;
    }, kind);
    receipt.calls.push({ kind, accepted: !!accepted });
    if (!accepted) continue;
    await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikeViewClose', {}));
    const film = async (name, atS, cam) => {
      await page.waitForFunction((t) => window.__DEBUG.game.timeS >= t, { timeout: 60_000, polling: 100 }, atS);
      await page.evaluate((s, cam) => {
        const D = window.__DEBUG, V = D.camera.position.constructor, hf = D.world.heightField;
        const y = hf.getHeightAt(s.x, s.z);
        D.rig.setExternalPose(new V(s.x + cam[0], y + cam[1], s.z + cam[2]), new V(s.x, y + cam[3], s.z), cam[4] ?? 55);
      }, accepted, cam);
      await sleep(350);
      await shot(page, `${tag}-${kind}-${name}`);
    };
    const h = accepted.heading, back = [-Math.sin(h) * 140 + Math.cos(h) * 90, 45, -Math.cos(h) * 140 - Math.sin(h) * 90, 8];
    if (kind === 'gunship') {
      await film('orbit', accepted.landsS + 3, [140, 30, 140, 150, 60]);
      await film('fire', accepted.landsS + 6, back);
    } else if (kind === 'recon') {
      await film('pass', accepted.landsS - 0.2, back);
    } else {
      await film('warning', accepted.calledS + 1, back);
      await film('inbound', accepted.landsS - (kind === 'bomb' ? 1.2 : 0.6), back);
      await film('impact', accepted.landsS + (kind === 'artillery' ? 2 : 0.35), back);
    }
    await page.evaluate(() => window.__DEBUG.rig.release());
    await page.waitForFunction((end) => window.__DEBUG.game.timeS >= end, { timeout: 90_000, polling: 250 },
      Math.min(accepted.endS, accepted.landsS + 6));
  }
  void spot;
}

/** Paired GPU frame time: eight marks up against none, alternated (the post chain's timer; null without the extension). */
async function measureMarks(page, tag) {
  return page.evaluate(async () => {
    const marks = await import('/src/engine/strikeMarks.ts');
    const D = window.__DEBUG, p = D.game.player.state.pos, yaw = D.game.player.state.yaw;
    const list = Array.from({ length: marks.STRIKE_MARK_MAX }, (_, i) => ({
      x: p.x + Math.sin(yaw) * (80 + i * 30), y: p.y, z: p.z + Math.cos(yaw) * (80 + i * 30),
      shape: ['circle', 'lane', 'orbit', 'aim-circle'][i % 4], sizeA: i % 4 === 1 ? 70 : i % 4 === 2 ? 140 : 30, sizeB: 12,
      heading: yaw, r: 0.2, g: 0.5, b: 1, urgency: 0.5,
    }));
    const read = () => D.post?.gpuFrameMs ?? null;
    const sample = async (on) => {
      const values = [];
      const until = performance.now() + 2500;
      while (performance.now() < until) {
        if (on) marks.setStrikeMarks(list, performance.now() / 1000); else marks.clearStrikeMarks();
        await new Promise((r) => requestAnimationFrame(r));
        const ms = read();
        if (ms != null) values.push(ms);
      }
      values.sort((a, b) => a - b);
      return values.length ? values[Math.floor(values.length / 2)] : null;
    };
    const pairs = [];
    for (let i = 0; i < 6; i++) {
      const off = await sample(false), on = await sample(true);
      pairs.push({ off, on });
    }
    marks.clearStrikeMarks();
    const deltas = pairs.filter((pair) => pair.on != null && pair.off != null).map((pair) => pair.on - pair.off).sort((a, b) => a - b);
    return { pairs, medianDeltaMs: deltas.length ? deltas[Math.floor(deltas.length / 2)] : null,
      timer: read() != null, canvas: [D.renderer.domElement.width, D.renderer.domElement.height] };
  }).then((result) => { receipt.perf[tag] = result; return result; });
}

let server = null;
await runWarmHold({
  label: 'air-support-270',
  place: `air-support-270-shots-${only ?? 'all'}`,
  // a battle page frozen in the queue is checked (and re-warmed if it reloaded) only past this
  maxFrozenMinutes: 90,
  warm: async () => {
    server = await createServer(mapProbeServerOptions(root, path.join(root, '.qa-dev/vite-air-support')));
    await server.listen();
    const port = server.httpServer.address().port;
    const browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: 1600, height: 900 }), { label: 'air-support-shots' });
    const pages = {};
    for (const tag of Object.keys(VIEWPORTS)) {
      if (only && only !== tag) continue;
      const errors = receipt.errors[tag] = [];
      const page = await warmPage(browser, `http://127.0.0.1:${port}/?nosplash=1&tier=${TIERS[tag]}&gfxreset=1`, {
        ready: 'window.__GAME_READY === true', viewport: VIEWPORTS[tag],
        after: (page) => beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId, gameMode: 'air_support', settleMs: 2500 }),
      });
      page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
      pages[tag] = page;
    }
    return { pages: Object.values(pages), byTag: pages, close: async () => { await browser.close(); await server.close(); } };
  },
  shoot: async ({ byTag, signal }) => {
    if (byTag.desktop) {
      await shootDesktop(byTag.desktop, signal, 'desktop');
      if (perf && !signal.aborted) await measureMarks(byTag.desktop, 'desktop');
    }
    if (byTag.phone && !signal.aborted) {
      const page = byTag.phone;
      await page.evaluate(stage);
      await sleep(600);
      await shot(page, 'phone-strip');
      await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikePick', { kind: 'strafe' }));
      await sleep(1000);
      await shot(page, 'phone-view-strafe');
      await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikeViewClose', {}));
      if (perf && !signal.aborted) await measureMarks(page, 'phone');
    }
  },
});
writeFileSync(path.join(out, `air-support-shots${only ? `-${only}` : ''}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ shots: receipt.shots.length, calls: receipt.calls, perf: receipt.perf, errors: Object.fromEntries(Object.entries(receipt.errors).map(([k, v]) => [k, v.length])) }));
