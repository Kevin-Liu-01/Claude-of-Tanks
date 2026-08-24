// Modern-expansion integration probe (integration verifier tooling).
// Usage: node tools/modernbattleprobe.mjs
// Verifies, headless:
//   1. Roster registration — >= 20 modern vehicles in ALL_TANK_IDS.
//   2. Era-matched matchmaking — a modern-tank battle fields a 100% modern
//      roster; the RANDOM battlefield card may roll mixed-era.
//   3. Battle E2E for one VARIANT newcomer (t90a) and one PROCEDURAL
//      newcomer (k2): drive (hull moves >= 8 m), fire (player shells leave
//      the gun), hit (player shell resolves on an enemy).
//   4. Zero page console errors throughout.
// Exits non-zero with a reason on any gate failure.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5700 + Math.floor(Math.random() * 200);
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('404')) {
    pageErrors.push(msg.text());
  }
});

const fails = [];
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) fails.push(label);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

  // 1. roster registration
  const roster = await page.evaluate(async () => {
    const s = await import('/src/vehicles/specs.js');
    const specs = s.ALL_TANK_IDS.map((id) => s.TANK_SPECS[id]);
    return {
      total: specs.length,
      modern: specs.filter((x) => x.era === 'modern').map((x) => x.id),
    };
  });
  ok(roster.modern.length >= 20, `>=20 modern vehicles registered (got ${roster.modern.length}/${roster.total} total)`);

  // helper: run one battle E2E for a spec id
  async function battleE2E(specId, label) {
    const r = await page.evaluate(async (id) => {
      const D = window.__DEBUG;
      const res = { rosterEras: [], fired: 0, hits: 0, moved: 0, count: 0 };
      let firedN = 0;
      let hitsN = 0;
      const offF = D.bus.on('shell:fired', (ev) => { if (ev.isPlayer) firedN++; });
      const offH = D.bus.on('shell:hit', (ev) => {
        if (ev.attackerId === id && ev.targetId && ev.targetId !== id) hitsN++;
      });
      await D.startBattle(id, 'verdant');
      res.count = D.game.tanks.length;
      res.rosterEras = D.game.tanks.map((t) => t.spec.era);
      const p0 = { x: D.game.player.state.pos.x, z: D.game.player.state.pos.z };
      // drive forward 6 s
      D.game.player.input.throttle = 1;
      D.fastForward(6);
      D.game.player.input.throttle = 0;
      res.moved = Math.hypot(D.game.player.state.pos.x - p0.x, D.game.player.state.pos.z - p0.z);
      // aim at nearest enemy and volley for up to 48 s of sim time.
      // task_9db94319 diagnosis: the old parked 30 s volley was at the mercy
      // of the battle instance — when every lane from the spawn stayed
      // LOS/muzzle-blocked (aimAtNearest -> null), forceFire emptied the gun
      // into a stale terrain aim point and the hit gate flaked (t90a's
      // battle: 7 blind shells, 0 acquisitions, 4/4 runs). Play it like a
      // player instead: while no target is acquirable, keep ADVANCING
      // (throttle 1) — bots also converge on the muzzle flashes — and stop
      // to shoot once a lane opens. Settled shells measure 0.0-0.2 m off the
      // commanded aim point, so acquired attempts convert.
      D.flags.forceFire = true;
      for (let i = 0; i < 16 && hitsN < 1; i++) {
        const acquired = !!D.aimAtNearest();
        D.game.player.input.throttle = acquired ? 0 : 1;
        D.fastForward(3);
      }
      D.game.player.input.throttle = 0;
      D.flags.forceFire = false;
      res.fired = firedN;
      res.hits = hitsN;
      offF(); offH();
      return res;
    }, specId);
    ok(r.count === 8, `${label}: battle fields 8 participants (got ${r.count})`);
    ok(r.rosterEras.every((e) => e === 'modern'), `${label}: era-matched roster (all modern; got [${r.rosterEras.join(',')}])`);
    ok(r.moved >= 8, `${label}: drive — hull moved ${r.moved.toFixed(1)} m (>= 8 m)`);
    ok(r.fired >= 1, `${label}: fire — player fired ${r.fired} shells`);
    ok(r.hits >= 1, `${label}: hit — ${r.hits} player shell(s) resolved on an enemy`);
  }

  // 2+3. one variant newcomer + one procedural newcomer
  await battleE2E('t90a', 'T-90A (variant GLB)');
  await battleE2E('k2', 'K2 Black Panther (procedural)');

  // 4. RANDOM battlefield may mix eras (mixedEra path exercises without throwing)
  const rnd = await page.evaluate(async () => {
    const D = window.__DEBUG;
    await D.startBattle('m4a3e8', 'random');
    return { count: D.game.tanks.length, eras: D.game.tanks.map((t) => t.spec.era) };
  });
  ok(rnd.count === 8, `random battlefield battle fields 8 (got ${rnd.count})`);
  console.log(`INFO  random-map roster eras: [${rnd.eras.join(',')}]`);

  // WW2 era-matching sanity
  const ww2 = await page.evaluate(async () => {
    const D = window.__DEBUG;
    await D.startBattle('m4a3e8', 'verdant');
    return D.game.tanks.map((t) => t.spec.era);
  });
  ok(ww2.every((e) => e === 'ww2'), `WWII battle era-matched (got [${ww2.join(',')}])`);

  ok(pageErrors.length === 0, `zero console errors (got ${pageErrors.length}${pageErrors.length ? ': ' + pageErrors[0] : ''})`);
} catch (e) {
  fails.push(`probe crashed: ${e.message}`);
  console.error(e);
} finally {
  await browser.close();
  await server.close();
}

if (fails.length) {
  console.error(`\n${fails.length} gate(s) FAILED`);
  process.exit(1);
}
console.log('\nALL GATES GREEN');
