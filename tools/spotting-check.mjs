// Headless spotting/camo integration check.
// Usage: node tools/spotting-check.mjs
//
// Boots the game (vite + puppeteer, same harness pattern as screenshot.mjs),
// then verifies the live battle wiring of src/sim/spotting.js:
//   1. garage camo picker exists and repaints without console errors
//   2. a stationary tank IN A BUSH is NOT spotted at a range where the same
//      tank on open ground IS spotted (same observer, hard LOS verified)
//   3. firing from that bush (15 m rule + bloom) reveals the tank
//   4. spotted linger expires
// Exits non-zero on any failure or page console error.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5200 + Math.floor(Math.random() * 700);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[spot] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let failed = false;
const fail = (msg) => { failed = true; console.error(`[spot] FAIL: ${msg}`); };
const pass = (msg) => console.log(`[spot]   ok: ${msg}`);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

  // ---- 1. garage camo picker + live repaint --------------------------------
  const picker = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.cot-camo-card')];
    if (cards.length !== 6) return { n: cards.length };
    cards[4].click(); // winter
    const selAfter = cards[4].classList.contains('sel');
    cards[1].click(); // back to factory
    return { n: cards.length, selAfter, factorySel: cards[1].classList.contains('sel') };
  });
  if (picker.n !== 6) fail(`camo picker cards: ${picker.n} (want 6)`);
  else if (!picker.selAfter || !picker.factorySel) fail('camo picker selection did not toggle');
  else pass('garage camo picker present; winter repaint + revert without errors');

  // ---- 2/3/4. bush concealment on the live battlefield ---------------------
  const res = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.startBattle('m4a3e8', 'verdant');
    const g = D.game;
    const sp = D.spotting;
    const world = D.world;
    const hf = world.heightField;
    const player = g.player;
    const observer = g.tanks.find((t) => t.id === 'tiger1');
    // single-observer setup: everything else is a wreck (dead tanks neither
    // spot nor get spotted); we drive the spotting system directly, no simStep
    for (const t of g.tanks) {
      if (!t.isPlayer && t !== observer) t.combat.destroyed = true;
    }
    const place = (ent, x, z) => {
      ent.state.pos.x = x; ent.state.pos.z = z;
      ent.state.pos.y = hf.getHeightAt(x, z);
      ent.state.speed = 0;
    };
    const los = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.hypot(dx, dy, dz);
      const hit = world.raycast({ x: a.x, y: a.y, z: a.z }, { x: dx / d, y: dy / d, z: dz / d }, d);
      return !hit || hit.dist > d - 2;
    };
    const eyeOf = (e, f) => ({
      x: e.state.pos.x, y: e.state.pos.y + e.spec.dims.heightM * f, z: e.state.pos.z,
    });

    // find a bush + observer placement at 250 m with hard LOS, plus an open
    // control spot near the bush with zero foliage on the line
    const DIST = 250;
    const bushes = world.getConcealment().filter((c) => c.add >= 0.3);
    let setup = null;
    outer:
    for (const b of bushes) {
      if (Math.max(Math.abs(b.x), Math.abs(b.z)) > 360) continue;
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const ox = b.x + Math.sin(ang) * DIST;
        const oz = b.z + Math.cos(ang) * DIST;
        if (Math.max(Math.abs(ox), Math.abs(oz)) > 430) continue;
        place(player, b.x, b.z);
        place(observer, ox, oz);
        if (!los(eyeOf(observer, 0.9), eyeOf(player, 0.85))) continue;
        // open control spot: perpendicular offset, LOS clear, NO foliage bonus
        for (const side of [1, -1]) {
          const px = Math.cos(ang) * side, pz = -Math.sin(ang) * side;
          for (const off of [22, 30, 40]) {
            const cx2 = b.x + px * off, cz2 = b.z + pz * off;
            if (Math.max(Math.abs(cx2), Math.abs(cz2)) > 430) continue;
            place(player, cx2, cz2);
            if (!los(eyeOf(observer, 0.9), eyeOf(player, 0.85))) continue;
            if (sp.bushBonusBetween(observer, player, 0) > 0) continue;
            setup = { bush: b, open: { x: cx2, z: cz2 }, obs: { x: ox, z: oz } };
            break outer;
          }
        }
      }
    }
    if (!setup) return { error: 'no bush/observer/open-spot arrangement found' };

    const out = { error: null };
    place(observer, setup.obs.x, setup.obs.z);

    // (2a) in bush, stationary, cold gun -> hidden
    place(player, setup.bush.x, setup.bush.z);
    sp.forceCheck(100);
    out.bushBonus = sp.bushBonusBetween(observer, player, 100);
    out.spottedInBush = sp.isSpotted(player.id, 'enemy');
    out.concealment = { ...sp.getConcealment(player, 100) };

    // (2b) same range, open ground -> spotted
    place(player, setup.open.x, setup.open.z);
    sp.forceCheck(200);
    out.spottedOpen = sp.isSpotted(player.id, 'enemy');

    // (4) linger: move back into the bush; >5 s later the light goes out
    place(player, setup.bush.x, setup.bush.z);
    sp.forceCheck(203); // within linger window
    out.spottedLinger = sp.isSpotted(player.id, 'enemy');
    sp.forceCheck(300); // long after linger
    out.spottedAfterLinger = sp.isSpotted(player.id, 'enemy');

    // (3) fire from the bush -> 15 m rule + bloom reveal
    sp.notifyFired(player.id, 301);
    sp.forceCheck(301.1);
    out.spottedAfterFiring = sp.isSpotted(player.id, 'enemy');

    // AI gate sanity: the spotting facade the AI uses answers consistently
    out.aiSeesAfterFiring = sp.isSpotted(player.id, 'enemy');
    out.distM = Math.hypot(observer.state.pos.x - player.state.pos.x,
      observer.state.pos.z - player.state.pos.z);
    return out;
  });

  if (res.error) fail(res.error);
  else {
    console.log(`[spot] arrangement: dist ${res.distM.toFixed(1)} m, bushBonus ${res.bushBonus.toFixed(2)}, ` +
      `camo ${res.concealment.camo.toFixed(2)} (inBush=${res.concealment.inBush})`);
    if (res.bushBonus >= 0.3) pass('bush lies on the spotter-target line');
    else fail(`bush bonus ${res.bushBonus}`);
    if (!res.spottedInBush) pass('stationary in bush @250 m: NOT spotted');
    else fail('spotted while hidden in bush');
    if (res.spottedOpen) pass('open ground @250 m: spotted');
    else fail('not spotted on open ground');
    if (res.spottedLinger) pass('spotted state lingers ~5 s');
    else fail('linger missing');
    if (!res.spottedAfterLinger) pass('linger expires back to hidden in bush');
    else fail('linger never expired');
    if (res.spottedAfterFiring) pass('firing from the bush (15 m rule) reveals');
    else fail('firing did not reveal');
  }
  // ---- 5. live battle: sixth-sense lamp + camo indicator -------------------
  const lamp = await page.evaluate(async () => {
    const D = window.__DEBUG;
    D.startBattle('m4a3e8', 'verdant'); // fresh battle (resets the wrecks above)
    const g = D.game;
    const hf = D.world.heightField;
    const en = g.tanks.find((t) => !t.isPlayer && !t.combat.destroyed);
    // park an enemy 60 m away so the 0.5 s proximity checks light the player up
    const px = g.player.state.pos.x, pz = g.player.state.pos.z;
    en.state.pos.x = px + 60; en.state.pos.z = pz;
    en.state.pos.y = hf.getHeightAt(px + 60, pz);
    D.fastForward(7); // spot (<1 s) + 3 s sixth-sense fuse + margin
    await new Promise((r) => setTimeout(r, 400)); // let rAF HUD frames run
    const sixth = document.querySelector('.cot-sixth');
    const camo = document.querySelector('.cot-camoind');
    return {
      spotted: D.spotting.isSpotted(g.player.id, 'enemy'),
      lampOn: !!(sixth && sixth.classList.contains('on')),
      camoShown: !!(camo && camo.style.display !== 'none'),
      camoText: camo ? camo.querySelector('.pct').textContent : '',
    };
  });
  if (lamp.spotted && lamp.lampOn) pass('sixth-sense lamp lit 3 s after being spotted');
  else fail(`sixth sense: spotted=${lamp.spotted} lampOn=${lamp.lampOn}`);
  if (lamp.camoShown && lamp.camoText === 'SPOTTED') pass('camo indicator shows SPOTTED state');
  else fail(`camo indicator: shown=${lamp.camoShown} text='${lamp.camoText}'`);
} catch (err) {
  fail(err.message);
} finally {
  if (consoleErrors.length) {
    failed = true;
    console.error(`[spot] page console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 20)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
console.log(failed ? '[spot] FAILED' : '[spot] all checks passed');
process.exit(failed ? 1 : 0);
