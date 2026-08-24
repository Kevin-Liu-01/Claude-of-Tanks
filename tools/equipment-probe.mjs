// tools/equipment-probe.mjs — EQUIPMENT SYSTEM live-battle + garage-UI gate.
// Usage: node tools/equipment-probe.mjs [--out shots/equipment]
//
// Boots the REAL game (own vite on a 7xxx port — NEVER 5001/5002) with
// seeded loadouts in localStorage, then proves the equipment effects are
// LIVE in battle, not garage cosmetics:
//   A. reload   — tiger1 with Rammer+Vents fires: reload.totalS 6.5 → 5.70 s;
//                 a control battle with the loadout cleared reads 6.5 s.
//   B. repair   — player (Toolbox, rate ×1.25) vs a default-kit bot: an
//                 engine set red repairs to yellow at 8 s vs 10 s.
//   C. durability — t90m with Wet Ammo Rack: ammoRack maxHp 375 → 562.5.
//   D. view     — t90m with Coated Optics: the live entity's spotter view
//                 multiplier (real sim/spotting.js module) reads ×1.10.
//   E. AI parity — every bot fields its class-default kit (equipMults live).
// Plus garage evidence screenshots: stat card with slots + tinted modified
// rows, the picker (categories, era-locked tiles), a pick round-trip, and
// the battle HUD loadout readout on the damage panel.
//
// Shares the /tmp/cot-shots FIFO lock with the other capture harnesses
// (same protocol as tools/screenshot.mjs — keep in sync).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync, utimesSync } from 'node:fs';
import { resolve, join } from 'node:path';

// --- exclusive harness lock (FIFO ticket protocol, see screenshot.mjs) ------
const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;
function ticketPid(name) {
  const m = name.match(/-(\d+)\.t$/);
  return m ? parseInt(m[1], 10) : -1;
}
function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const myTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, myTicket), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch (_) { names = [myTicket]; }
      for (const n of names) {
        if (n === myTicket) { head = head || n; break; }
        let stale = false;
        try { stale = Date.now() - statSync(join(QUEUE_DIR, n)).mtimeMs > TICKET_STALE_MS; } catch (_) { continue; }
        if (stale || !ticketAlive(n)) { try { unlinkSync(join(QUEUE_DIR, n)); } catch (_) { /* raced */ } continue; }
        head = n; break;
      }
      if (head === myTicket) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { try { rmdirSync(LOCK_DIR); } catch (e) { if (e.code === 'ENOTDIR') unlinkSync(LOCK_DIR); else throw e; } continue; }
        } catch (_) { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((r) => setTimeout(r, head === myTicket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, myTicket)); } catch (_) { /* fine */ }
  }
}
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}
await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
}, 60 * 1000);
lockRefresher.unref();

// --- options / harness -------------------------------------------------------
const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const outDir = resolve(opt('out', 'shots/equipment'));
mkdirSync(outDir, { recursive: true });

let failures = 0;
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (cond) console.log(`  ok  ${msg}`);
  else { failures++; console.error(`  FAIL ${msg}`); }
}
function near(actual, expected, tol, msg) {
  ok(Math.abs(actual - expected) <= tol, `${msg} — expected ${expected} ±${tol}, got ${actual}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 7300 + Math.floor(Math.random() * 500);
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
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[equipment-probe] vite up at ${url}`);

const W = 1600, H = 900;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
// Screenshot determinism: the garage runs entrance/swap animations and the
// hero-GLB pipeline can stall the main thread mid-animation — a capture then
// lands on a ghosted/backwards-fill frame. Reduced motion disables the
// animations (the garage honors it), and shoot() waits for a true rendered
// frame boundary before every capture.
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
async function shoot(path, clip) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot(clip ? { path, clip } : { path });
}

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

// Seed loadouts BEFORE the app boots (garage + battle both read these).
const TIGER_KIT = ['rammer', 'vents', 'toolbox'];
const T90_KIT = ['wet_rack', 'optics', 'vstab'];
await page.evaluateOnNewDocument((tiger, t90) => {
  try {
    localStorage.setItem('cot.equip.tiger1', JSON.stringify(tiger));
    localStorage.setItem('cot.equip.t90m', JSON.stringify(t90));
    localStorage.removeItem('cot.equip.m1a2'); // control tank stays bare
  } catch (_) { /* fine */ }
}, TIGER_KIT, T90_KIT);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__GAME_READY === true, { timeout: 180000 });
  await sleep(600);

  // =========================================================================
  console.log('[1] GARAGE — stat card slots + modified rows (tiger1 kit)');
  await page.evaluate(() => window.__DEBUG.selectGarageTank('tiger1'));
  await sleep(1500); // stats swap fade + thumb settle
  const card = await page.evaluate(() => {
    const stats = document.querySelector('.cot-garage .stats');
    const slots = [...stats.querySelectorAll('.eqslot')].map((s) => ({
      empty: s.classList.contains('empty'),
      label: s.querySelector('.sl') ? s.querySelector('.sl').textContent : '',
    }));
    const rows = {};
    for (const r of stats.querySelectorAll('.srow')) {
      const k = r.querySelector('.lr span').textContent;
      const v = r.querySelector('.lr b');
      rows[k] = { text: v.textContent, mod: v.classList.contains('eqmod') };
    }
    return { slots, rows, count: (stats.querySelector('.eqhead i') || {}).textContent };
  });
  ok(card.slots.length === 3, `3 equipment slots on the stats card (${card.slots.length})`);
  ok(card.slots.filter((s) => !s.empty).length === 3 && card.count === '3/3',
    `tiger1 kit fills 3/3 (${card.slots.map((s) => s.label).join(', ')})`);
  ok(card.rows.Reload && card.rows.Reload.mod && card.rows.Reload.text.startsWith('5.7'),
    `Reload row shows the modified 5.7 s in boost tint (${card.rows.Reload && card.rows.Reload.text})`);
  ok(card.rows['Aim time'] && card.rows['Aim time'].mod,
    `Aim time row modified by Vents (${card.rows['Aim time'] && card.rows['Aim time'].text})`);
  ok(card.rows['View range'] && card.rows['Camouflage'] != null,
    'View range + Camouflage rows present');
  await shoot(join(outDir, 'garage-stats-tiger1.png'), { x: W - 360, y: 96, width: 352, height: 704 });

  console.log('[2] GARAGE — picker: categories, era lock, pick round-trip');
  await page.click('.cot-garage .stats .eqslot[data-slot="1"]');
  await sleep(250);
  const pick1 = await page.evaluate(() => {
    const p = document.querySelector('.cot-eqpick');
    const tiles = [...p.querySelectorAll('.cot-eqtile')];
    return {
      open: p.classList.contains('open'),
      tiles: tiles.length,
      locked: tiles.filter((t) => t.classList.contains('locked')).length,
      fitted: tiles.filter((t) => t.classList.contains('sel')).length,
      chips: [...p.querySelectorAll('.chip')].map((c) => c.textContent),
    };
  });
  ok(pick1.open, 'picker opens from a slot click');
  ok(pick1.tiles === 15, `15 tiles: 14 catalog items + EMPTY (${pick1.tiles})`);
  ok(pick1.locked === 2, `vstab + auto_ext era-locked on a WWII tank (${pick1.locked})`);
  ok(pick1.fitted === 1, 'the item in the open slot reads FITTED');
  ok(pick1.chips.join(',') === 'All,Firepower,Recon,Mobility,Survival',
    `category chips (${pick1.chips.join(',')})`);
  await shoot(join(outDir, 'garage-picker-all.png'), { x: W - 760, y: 96, width: 752, height: 704 });

  await page.evaluate(() => {
    for (const c of document.querySelectorAll('.cot-eqpick .chip')) {
      if (c.dataset.cat === 'survival') c.click();
    }
  });
  await sleep(200);
  await shoot(join(outDir, 'garage-picker-survival.png'), { x: W - 760, y: 96, width: 752, height: 704 });

  // pick GLD into slot 2 (replacing Vents), verify the card updates, restore
  await page.evaluate(() => {
    for (const c of document.querySelectorAll('.cot-eqpick .chip')) {
      if (c.dataset.cat === 'fire') c.click();
    }
  });
  await sleep(150);
  await page.click('.cot-eqpick .cot-eqtile[data-eq="gld"]');
  await sleep(300);
  const afterPick = await page.evaluate(() => {
    const stats = document.querySelector('.cot-garage .stats');
    return {
      labels: [...stats.querySelectorAll('.eqslot .sl')].map((s) => s.textContent),
      saved: JSON.parse(localStorage.getItem('cot.equip.tiger1') || '[]'),
      aim: stats.querySelectorAll('.srow')[4].querySelector('.lr b').textContent,
    };
  });
  ok(afterPick.saved.join(',') === 'rammer,gld,toolbox',
    `pick persisted to localStorage (${afterPick.saved.join(',')})`);
  ok(afterPick.labels[1] === 'GLD', `slot 2 now shows GLD (${afterPick.labels.join(', ')})`);
  ok(afterPick.aim.startsWith('2.2'), `Aim time re-derived with GLD: 2.4 → ${afterPick.aim}`);
  await shoot(join(outDir, 'garage-after-pick.png'), { x: W - 360, y: 96, width: 352, height: 704 });
  // restore the probe kit for the battle phase
  await page.evaluate((kit) => {
    localStorage.setItem('cot.equip.tiger1', JSON.stringify(kit));
    window.__DEBUG.selectGarageTank('m4a3e8');
    window.__DEBUG.selectGarageTank('tiger1');
  }, TIGER_KIT);
  await sleep(400);

  console.log('[3] GARAGE — modern card (t90m kit: optics view tint)');
  await page.evaluate(() => window.__DEBUG.selectGarageTank('t90m'));
  await sleep(1500);
  const modernCard = await page.evaluate(() => {
    const stats = document.querySelector('.cot-garage .stats');
    const rows = {};
    for (const r of stats.querySelectorAll('.srow')) {
      const k = r.querySelector('.lr span').textContent;
      const v = r.querySelector('.lr b');
      rows[k] = { text: v.textContent, mod: v.classList.contains('eqmod') };
    }
    return rows;
  });
  ok(modernCard['View range'].mod && modernCard['View range'].text.startsWith('473'),
    `View range 430 → 473 m with Coated Optics (${modernCard['View range'].text})`);
  await shoot(join(outDir, 'garage-stats-t90m.png'), { x: W - 360, y: 96, width: 352, height: 704 });

  // =========================================================================
  console.log('[4] BATTLE A (tiger1 + Rammer/Vents/Toolbox) — live reload + repair');
  await page.evaluate(() => window.__DEBUG.startBattle('tiger1', 'verdant'));
  await sleep(1200);
  const wiring = await page.evaluate(() => {
    const g = window.__DEBUG.game;
    for (const t of g.tanks) if (!t.isPlayer) t.aiCtl = null; // becalm the bots
    const bots = g.tanks.filter((t) => !t.isPlayer).map((t) => ({
      role: t.spec.role, era: t.spec.era, equip: t.equip,
      reloadMult: t.combat.equipMults.reload,
    }));
    return {
      phase: g.phase,
      playerEquip: g.player.equip,
      mults: g.player.combat.equipMults,
      bots,
    };
  });
  ok(wiring.phase === 'battle', 'battle running');
  ok(wiring.playerEquip.join(',') === TIGER_KIT.join(','),
    `player fields the saved kit (${wiring.playerEquip.join(',')})`);
  near(wiring.mults.reload, 0.8775, 1e-6, 'player equipMults.reload = rammer × vents');
  near(wiring.mults.repair, 1.25, 1e-6, 'player equipMults.repair = toolbox');
  ok(wiring.bots.length > 0 && wiring.bots.every((b) => Array.isArray(b.equip) && b.equip.length === 3),
    `AI parity: all ${wiring.bots.length} bots field full class-default kits`);
  const rammerBots = wiring.bots.filter((b) => b.equip.includes('rammer'));
  ok(rammerBots.length > 0 && rammerBots.every((b) => Math.abs(b.reloadMult - (b.equip.includes('vents') ? 0.8775 : 0.9)) < 1e-6),
    `bot equipMults live too (${rammerBots.length} rammer bots)`);

  // live reload: force a shot, read the reload the sim actually started
  const reload = await page.evaluate(() => {
    const g = window.__DEBUG.game;
    window.__DEBUG.flags.forceFire = true;
    window.__DEBUG.fastForward(1.0);
    window.__DEBUG.flags.forceFire = false;
    return { totalS: g.player.combat.reload.totalS, t: g.player.combat.reload.t };
  });
  near(reload.totalS, 6.5 * 0.9 * 0.975, 1e-6,
    `LIVE reload with Rammer+Vents: 6.5 s spec → ${reload.totalS.toFixed(3)} s`);
  ok(reload.t > 0 && reload.t < reload.totalS, 'reload timer counting down from the modified total');

  // live repair race: player toolbox ×1.25 vs a default bot without toolbox
  const repair = await page.evaluate(() => {
    const g = window.__DEBUG.game;
    const bot = g.tanks.find((t) => !t.isPlayer && t.combat && !t.equip.includes('toolbox'));
    const red = (e) => {
      const m = e.combat.modules.engine;
      m.hp = 0; m.state = 'red'; m.repairT = 0;
    };
    red(g.player); red(bot);
    window.__DEBUG.fastForward(8.2);
    const at8 = { player: g.player.combat.modules.engine.state, bot: bot.combat.modules.engine.state };
    window.__DEBUG.fastForward(2.2);
    const at10 = { player: g.player.combat.modules.engine.state, bot: bot.combat.modules.engine.state };
    return { at8, at10, botEquip: bot.equip };
  });
  ok(repair.at8.player === 'yellow', `LIVE repair: toolbox engine red→yellow by 8.2 s (${repair.at8.player})`);
  ok(repair.at8.bot === 'red', `control bot (${repair.botEquip.join(',')}) still red at 8.2 s`);
  ok(repair.at10.bot === 'yellow', 'control bot repairs at the locked 10 s');

  // HUD loadout readout on the damage panel
  await sleep(900);
  const hudRead = await page.evaluate(() => {
    const row = document.querySelector('.cot-dp .equiprow');
    return row ? row.querySelectorAll('.eq').length : -1;
  });
  ok(hudRead === 3, `damage panel shows the 3 mounted glyphs (${hudRead})`);
  await shoot(join(outDir, 'battle-hud-loadout.png'), { x: 0, y: H - 340, width: 420, height: 340 });
  await shoot(join(outDir, 'battle-full.png'));

  console.log('[5] BATTLE B (t90m + WetRack/Optics/VStab) — durability + view');
  const battleB = await page.evaluate(async () => {
    await window.__DEBUG.startBattle('t90m', 'desert');
    await new Promise((r) => setTimeout(r, 400));
    const g = window.__DEBUG.game;
    for (const t of g.tanks) if (!t.isPlayer) t.aiCtl = null;
    const spot = await import('/src/sim/spotting.js');
    const p = g.player;
    return {
      equip: p.equip,
      rackMax: p.combat.modules.ammoRack.maxHp,
      trackMax: p.combat.modules.trackL.maxHp,
      baseView: spot.effectiveViewRangeM(p),
      multStill: spot.equipViewMult(p.equip, false),
      multMoving: spot.equipViewMult(p.equip, true),
      bloomMult: p.combat.equipMults.bloom,
    };
  });
  near(battleB.rackMax, 150 * 2.5 * 1.5, 1e-6,
    `LIVE durability: Wet Ammo Rack maxHp 375 → ${battleB.rackMax}`);
  near(battleB.trackMax, 100 * 2.5, 1e-6, 'tracks unscaled (no suspension mounted)');
  near(battleB.baseView, 430, 1e-6, 't90m base view range 430 m');
  near(battleB.multStill, 1.10, 1e-9,
    `LIVE view: the spotting mult the sim applies to this entity is ×1.10 (Coated Optics)`);
  near(battleB.bloomMult, 0.80, 1e-9, 'vstab bloom multiplier attached for the movement sim');

  console.log('[6] BATTLE C (control: loadout cleared) — reload back to spec');
  const control = await page.evaluate(async () => {
    localStorage.removeItem('cot.equip.tiger1');
    await window.__DEBUG.startBattle('tiger1', 'verdant');
    await new Promise((r) => setTimeout(r, 400));
    const g = window.__DEBUG.game;
    for (const t of g.tanks) if (!t.isPlayer) t.aiCtl = null;
    window.__DEBUG.flags.forceFire = true;
    window.__DEBUG.fastForward(1.0);
    window.__DEBUG.flags.forceFire = false;
    return {
      equip: g.player.equip,
      totalS: g.player.combat.reload.totalS,
      rackMax: g.player.combat.modules.ammoRack.maxHp,
    };
  });
  ok(control.equip.length === 0, 'control: player fields no equipment');
  near(control.totalS, 6.5, 1e-6, `control reload back at spec 6.5 s (${control.totalS})`);
  near(control.rackMax, 150, 1e-6, 'control ammo rack at base HP');

  ok(consoleErrors.length === 0,
    `no page errors (${consoleErrors.length}${consoleErrors.length ? ': ' + consoleErrors[0] : ''})`);
} catch (err) {
  failures++;
  console.error(`[equipment-probe] HARNESS FAILURE: ${err && err.stack || err}`);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  releaseLock();
}

if (failures) {
  console.error(`\nequipment-probe: ${failures} FAILURE(S) of ${checks} checks`);
  process.exit(1);
}
console.log(`\nequipment-probe: all ${checks} checks passed — shots in ${outDir}`);
process.exit(0);
