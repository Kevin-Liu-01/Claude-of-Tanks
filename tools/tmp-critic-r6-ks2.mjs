// TEMP r6 critic mini-probe #2 (delete after review). Two decisive questions:
//  Q1 (residual pen): for a player shot whose card prints penRollMm far below
//     ±25% of nominal, dump the FULL event chain of that shellId — does a
//     prior screen/external interaction explain the degraded roll, and does
//     the card say so?
//  Q2 (annotation stability): during a LIVE death replay, sample the
//     annotation Damage row during flight (no skip) and again in x-ray —
//     the replay must tell ONE story; also count destroyed=true hits on the
//     player around death (double-kill race).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5970 + Math.floor(Math.random() * 25), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 480000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate(() => {
  const D = window.__DEBUG;
  window.__CAP = { hits: [], firedByShell: {} };
  D.bus.on('shell:hit', (ev) => window.__CAP.hits.push(JSON.parse(JSON.stringify(ev))));
  D.startBattle('m1a2', 'verdant');
});
await sleep(300);

// ---- Q1: land several player hits, dump per-shell chains -------------------
const chains = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const yieldTask = () => new Promise((r) => setTimeout(r, 0));
  const pid = D.game.player.id;
  const mine = () => window.__CAP.hits.filter((h) => h.attackerId === pid && h.targetId !== pid);
  let aimed = null;
  for (let i = 0; i < 60 && !aimed; i++) {
    aimed = D.aimAtNearest();
    if (!aimed) { D.fastForward(2.0); await yieldTask(); }
  }
  if (!aimed) return { ok: false, why: 'no target' };
  for (let t = 0; t < 10 && mine().length < 3; t++) {
    for (let s = 0; s < 30; s++) {
      const st = D.aimState();
      if (st && st.errMrad < 2.5 && st.reloadT <= 0) break;
      D.fastForward(0.25);
      await yieldTask();
    }
    const before = mine().length;
    D.flags.forceFire = true;
    for (let s = 0; s < 24 && mine().length === before; s++) {
      D.fastForward(0.25);
      await yieldTask();
    }
    D.flags.forceFire = false;
    D.aimAtNearest();
    await yieldTask();
  }
  // group ALL events (any attacker) by shellId for the player's shells
  const byShell = {};
  for (const h of mine()) {
    (byShell[h.shellId] = byShell[h.shellId] || []).push({
      kind: h.kind, zone: h.zone, dmg: Math.round(h.damage || 0),
      penRoll: Math.round(h.penRollMm || 0), nominal: Math.round(h.nominalMm || 0),
      eff: Math.round(h.effectiveMm || 0), physicalMm: Math.round(h.physicalMm || 0),
      dist: Math.round(h.flightDistM || 0), target: h.targetName,
    });
  }
  return { ok: true, byShell, shells: JSON.parse(JSON.stringify(D.game.player.spec.gun.shells.map((s) => ({ name: s.name, type: s.type, pen100Mm: s.pen100Mm, pen1000Mm: s.pen1000Mm, pen2000Mm: s.pen2000Mm || 0 })))) };
});
console.log('Q1 chains:', JSON.stringify(chains, null, 1));

// ---- Q2: death replay annotation stability ---------------------------------
const q2 = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const ok = D.spawnKillShell();
  return ok;
});
if (!q2) {
  console.log('Q2: spawnKillShell failed');
} else {
  await page.waitForFunction('window.__DEBUG.killcam.phase !== null', { timeout: 15000 });
  const samples = [];
  for (let i = 0; i < 6; i++) {
    samples.push(await page.evaluate(() => {
      const rows = {};
      for (const kv of document.querySelectorAll('.cot-kc-kv')) {
        rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
      }
      return {
        t: performance.now(), phase: window.__DEBUG.killcam.phase,
        dmg: rows['Damage'] || null, pen: rows['Pen roll'] || null,
        deadHits: window.__CAP.hits.filter((h) => h.targetId === window.__DEBUG.game.player.id && h.destroyed)
          .map((h) => `${Math.round(h.damage)}@${h.kind}`),
      };
    }));
    await sleep(650);
  }
  // now skip to xray and sample again
  await page.keyboard.press('Space');
  await sleep(1200);
  samples.push(await page.evaluate(() => {
    const rows = {};
    for (const kv of document.querySelectorAll('.cot-kc-kv')) {
      rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
    }
    return {
      t: performance.now(), phase: window.__DEBUG.killcam.phase,
      dmg: rows['Damage'] || null, pen: rows['Pen roll'] || null,
      deadHits: window.__CAP.hits.filter((h) => h.targetId === window.__DEBUG.game.player.id && h.destroyed)
        .map((h) => `${Math.round(h.damage)}@${h.kind}`),
    };
  }));
  console.log('Q2 samples:', JSON.stringify(samples, null, 1));
  const dmgs = [...new Set(samples.filter((s) => s.dmg != null).map((s) => s.dmg))];
  console.log(dmgs.length <= 1
    ? `Q2 VERDICT: annotation stable (${dmgs.join(',')})`
    : `Q2 VERDICT: ANNOTATION CHANGED MID-REPLAY: ${dmgs.join(' -> ')}`);
  const dh = samples[samples.length - 1].deadHits;
  console.log(`Q2 destroyed-hits on player: [${dh.join(', ')}]`);
}
if (errs.length) console.log('[console errors]', JSON.stringify(errs));
await browser.close();
await server.close();
