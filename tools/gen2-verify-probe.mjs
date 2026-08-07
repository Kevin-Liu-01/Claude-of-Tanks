// tools/gen2-verify-probe.mjs — USER DROPS wave 8 (scout-gen2) integration
// verification. For each of the 12 wave-8 vehicles (src/vehicles/userdrops7.js):
//
//   garage  — activates the vehicle's provenance/era chip, asserts its card is
//             visible under that chip, real-clicks the card, waits for pedestal
//             convergence (probe contract from garage-switch-probe.mjs), asserts
//             the HERO IS THE SOURCED GLB (local build: __glbSwapped nodes) and
//             the card icon exists, then captures
//             shots/gen2-integration/garage_<id>.png.
//   techtree — opens the tech tree, walks the touched nation tabs, asserts every
//             wave-8 node renders REAL (gold, battle-ready) with its CC credit
//             line, that the Ukraine tab exists with its two ghost ancestors,
//             then captures shots/gen2-integration/techtree_<tab>.png.
//   battle  — selects one wave-8 vehicle, enters a real battle through the
//             garage BATTLE button, drives (W) asserting displacement, fires
//             (aimAtNearest + LMB) asserting a __DEBUG.playerShellLog row, and
//             captures shots/gen2-integration/battle_<id>.png.
//
// Zero page/console errors tolerated (favicon 404s filtered, same policy as
// the other probes). Exit 0 = everything passed.
//
// Usage: node tools/gen2-verify-probe.mjs [--battle-id t84]

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const BATTLE_ID = opt('battle-id', 't84');
const OUT = resolve('shots/gen2-integration');
mkdirSync(OUT, { recursive: true });

// id -> expected garage chip. CATALOG v2 (owner re-order 2026-08-06): four
// groups — Cold War / Modern / WWII / Sources. The wave's GLB-registered ids
// live under SOURCES until they graduate; the custom builds split by era.
const WAVE8 = {
  t44: 'sources', t54: 'sources', type59: 'sources',
  amx30: 'sources', amx30b2: 'sources', m48: 'sources',
  t80: 'modern', t80b: 'modern', t80bv: 'modern', t84: 'modern',
  m60a2: 'coldwar', vickers_mk1: 'coldwar',
};
// tech-tree tabs touched by the wave: tab id -> [[node label, kind]]
const TREE_EXPECT = {
  usa: [['M48A5 Patton', 'real'], ['M60A2 Starship', 'real']],
  ussr: [['T-44', 'real'], ['T-54', 'real'], ['T-80', 'real'],
    ['T-80B', 'real'], ['T-80BV', 'real']],
  uk: [['Vickers MBT Mk.1', 'real']],
  france: [['AMX-30B', 'real'], ['AMX-30B2', 'real'], ['Leclerc S2', 'real']],
  china: [['Type 59', 'real']],
  ukraine: [['T-64BV', 'ghost'], ['T-80UD Bereza', 'ghost'], ['T-84 Oplot', 'real']],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const fail = (msg) => { failures++; console.error(`  [FAIL] ${msg}`); };
const ok = (msg) => console.log(`  ok  ${msg}`);

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  // own 7xxx port band (never 5001/5002 — those belong to the shared servers)
  server: { port: 7311, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[gen2-verify] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon') &&
      !m.text().includes('404')) pageErrors.push(m.text());
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
// boot hero + GLB queue settled before the walk starts
await page.waitForFunction(() => {
  const D = window.__DEBUG;
  const v = D && D.pedestalVisual;
  const s = window.__GLB_STATS;
  return !!(v && v.root.visible !== false && (!s || s.settled >= s.started));
}, { timeout: 60000, polling: 100 });
await sleep(2000);
console.log('[gen2-verify] boot ready');

const shoot = async (name) => {
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot({ type: 'png' }));
  console.log(`  shot ${name}.png`);
};

// ---------------------------------------------------------------------------
// Phase 1 — garage: chip, card, hero GLB, per-tank screenshot
// ---------------------------------------------------------------------------
console.log('[gen2-verify] phase 1: garage walk');
const clickSel = async (selector) => {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'center' });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, selector);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
};

for (const [id, chip] of Object.entries(WAVE8)) {
  if (!(await clickSel(`.cot-era-chip[data-era="${chip}"]`))) {
    fail(`${id}: era chip '${chip}' not found`);
    continue;
  }
  await sleep(250);
  const cardInfo = await page.evaluate((tid) => {
    const card = document.querySelector(`.cot-card[data-spec-id="${tid}"]`);
    if (!card) return { present: false };
    const img = card.querySelector('img.ti');
    return {
      present: true,
      visible: card.style.display !== 'none',
      icon: !!(img && img.getAttribute('src')),
      nation: card.querySelector('.flag i')?.textContent || null,
      flagSvg: !!card.querySelector('.flag svg'),
    };
  }, id);
  if (!cardInfo.present) { fail(`${id}: no carousel card`); continue; }
  if (!cardInfo.visible) fail(`${id}: card hidden under chip '${chip}'`);
  if (!cardInfo.icon) fail(`${id}: card has no icon src`);
  if (!cardInfo.flagSvg) fail(`${id}: card has no nation flag`);
  if (!(await clickSel(`.cot-card[data-spec-id="${id}"]`))) {
    fail(`${id}: card unclickable`);
    continue;
  }
  // convergence + GLB settle (contract from garage-switch-probe)
  let conv = null;
  try {
    await page.waitForFunction((tid) => {
      const D = window.__DEBUG;
      const v = D && D.pedestalVisual;
      const s = window.__GLB_STATS;
      return !!(v && D.selectedSpecId === tid && v.specId === tid &&
        v.root.parent && v.root.visible !== false &&
        v.root.children.length > 0 && (!s || s.settled >= s.started));
    }, { timeout: 30000, polling: 120 }, id);
    await sleep(700); // let the turntable/paint settle for the capture
    conv = await page.evaluate(() => {
      const D = window.__DEBUG;
      const v = D.pedestalVisual;
      let glb = false;
      v.root.traverse((o) => { if (o.userData && o.userData.__glbSwapped) glb = true; });
      return { id: v.specId, glb };
    });
  } catch (e) {
    fail(`${id}: pedestal never converged (${e.message})`);
    continue;
  }
  // CATALOG v2 (2026-08-06): expect a GLB hero only while the id is still
  // GLB-registered in the RUNTIME MODEL_SOURCE — graduated/flipped wave ids
  // (t80/t80b/t80bv/t84/m60a2/vickers_mk1...) legitimately play our custom
  // procedural build, so the old all-GLB wave assertion went stale.
  const wantGlb = await page.evaluate(async (tid) => {
    const m = await import('/src/vehicles/specs.js');
    return (m.MODEL_SOURCE[tid] && m.MODEL_SOURCE[tid].source) === 'glb';
  }, id);
  if (conv.glb !== wantGlb) {
    fail(`${id}: hero ${conv.glb ? 'IS' : 'is NOT'} a sourced GLB but runtime MODEL_SOURCE says ${wantGlb ? 'glb' : 'procedural'}`);
  } else {
    ok(`${id}: chip '${chip}' · card+icon+flag (${cardInfo.nation}) · ${wantGlb ? 'GLB' : 'custom procedural'} hero on pedestal`);
  }
  await shoot(`garage_${id}`);
}

// ---------------------------------------------------------------------------
// Phase 2 — tech tree: nation tabs, node states, credits, screenshots
// ---------------------------------------------------------------------------
console.log('[gen2-verify] phase 2: tech tree');
if (!(await clickSel('.cot-tech'))) fail('tech tree button not found');
await sleep(600);
const openOk = await page.evaluate(() => !!document.querySelector('.cot-tt.open'));
if (!openOk) fail('tech tree did not open');
for (const [tab, expects] of Object.entries(TREE_EXPECT)) {
  const clicked = await page.evaluate((tid) => {
    const btn = [...document.querySelectorAll('.cot-tt-tab')]
      .find((b) => (b.querySelector('span')?.textContent || '') === ({
        usa: 'USA', ussr: 'USSR · Russia', uk: 'UK', france: 'France',
        china: 'China', ukraine: 'Ukraine',
      }[tid] || tid));
    if (!btn) return false;
    btn.click();
    return true;
  }, tab);
  if (!clicked) { fail(`tab '${tab}' not found`); continue; }
  await sleep(500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.cot-tt-node')]
    .map((el) => ({
      name: el.querySelector('.nm')?.textContent || '',
      real: el.classList.contains('real'),
      ghost: el.classList.contains('ghost'),
      credit: el.querySelector('.credit')?.textContent || null,
    })));
  for (const [label, kind] of expects) {
    // name collisions are legitimate (USSR carries BOTH the 1943 T-80 light
    // ghost and the wave-8 T-80 MBT) — prefer the node matching the expected
    // kind, so the assertion tests the wave-8 node, not its namesake.
    const candidates = rows.filter((r) => r.name === label);
    const row = candidates.find((r) => (kind === 'real' ? r.real : r.ghost)) || candidates[0];
    if (!row) { fail(`tab ${tab}: node '${label}' missing`); continue; }
    if (kind === 'real' && !row.real) fail(`tab ${tab}: '${label}' not battle-ready gold`);
    else if (kind === 'ghost' && !row.ghost) fail(`tab ${tab}: '${label}' expected ghost`);
    else ok(`tree ${tab}: ${label} ${kind}${row.credit ? ` · credit "${row.credit.slice(0, 44)}…"` : ''}`);
    if (kind === 'real' && !row.credit) fail(`tab ${tab}: '${label}' missing CC credit line (local build)`);
  }
  await shoot(`techtree_${tab}`);
}
await page.evaluate(() => {
  const btn = document.querySelector('.cot-tt-close');
  if (btn) btn.click();
});
await sleep(400);

// ---------------------------------------------------------------------------
// Phase 3 — battle E2E in a wave-8 vehicle: drive + fire
// ---------------------------------------------------------------------------
console.log(`[gen2-verify] phase 3: battle E2E in ${BATTLE_ID}`);
await clickSel(`.cot-era-chip[data-era="${WAVE8[BATTLE_ID] || 'modern'}"]`);
await sleep(250);
await clickSel(`.cot-card[data-spec-id="${BATTLE_ID}"]`);
await page.waitForFunction((tid) =>
  window.__DEBUG && window.__DEBUG.selectedSpecId === tid, { timeout: 20000 }, BATTLE_ID);
await sleep(400);
if (!(await clickSel('.cot-battle'))) fail('BATTLE button not found');
try {
  await page.waitForFunction(() => {
    const D = window.__DEBUG;
    return D && D.game && D.game.phase === 'battle';
  }, { timeout: 120000, polling: 200 });
} catch (e) {
  const phase = await page.evaluate(() => window.__DEBUG?.game?.phase);
  fail(`battle never staged (phase=${phase}): ${e.message}`);
}
await sleep(2500); // spawn settle + deferred visuals
const battleInfo = await page.evaluate((tid) => {
  const D = window.__DEBUG;
  const p = D.game.player;
  return {
    playerSpec: p ? p.specId : null,
    isWave8: p ? p.specId === tid : false,
    enemies: D.game.tanks.filter((t) => t !== p).map((t) => t.specId),
  };
}, BATTLE_ID);
if (battleInfo.playerSpec !== BATTLE_ID) fail(`player spec is ${battleInfo.playerSpec}, wanted ${BATTLE_ID}`);
else ok(`battle staged: player ${battleInfo.playerSpec} vs [${battleInfo.enemies.join(', ')}]`);

// drive: W for 2.6 s must displace the hull. NO canvas focus-click here —
// LMB in battle FIRES, and the accidental round put the aimed shot below
// into the reload window (first probe run failed exactly this way).
const pos0 = await page.evaluate(() => {
  const p = window.__DEBUG.game.player;
  const r = p.visual && p.visual.root;
  return r ? [r.position.x, r.position.z] : null;
});
await page.keyboard.down('KeyW');
await sleep(2600);
await page.keyboard.up('KeyW');
const pos1 = await page.evaluate(() => {
  const p = window.__DEBUG.game.player;
  const r = p.visual && p.visual.root;
  return r ? [r.position.x, r.position.z] : null;
});
const dist = pos0 && pos1 ? Math.hypot(pos1[0] - pos0[0], pos1[1] - pos0[1]) : 0;
if (dist < 3) fail(`drive: hull moved only ${dist.toFixed(2)} m under W`);
else ok(`drive: hull displaced ${dist.toFixed(1)} m under W`);

// fire: aim at the nearest enemy, LMB, expect a playerShellLog row (retry
// once after a full reload period in case an input replay burned the round)
const shells0 = await page.evaluate(() => (window.__DEBUG.playerShellLog || []).length);
await page.evaluate(() => window.__DEBUG.aimAtNearest && window.__DEBUG.aimAtNearest());
await sleep(900);
await page.mouse.down(); await sleep(90); await page.mouse.up();
await sleep(1200);
let shells1 = await page.evaluate(() => (window.__DEBUG.playerShellLog || []).length);
if (shells1 <= shells0) {
  await sleep(8000); // longest wave-8 reload is the M60A2's 11.5 s — t84 is 6.8
  await page.evaluate(() => window.__DEBUG.aimAtNearest && window.__DEBUG.aimAtNearest());
  await sleep(400);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
  await sleep(1200);
  shells1 = await page.evaluate(() => (window.__DEBUG.playerShellLog || []).length);
}
if (shells1 <= shells0) fail(`fire: playerShellLog did not grow (${shells0} -> ${shells1})`);
else ok(`fire: shell logged (${shells0} -> ${shells1})`);
await shoot(`battle_${BATTLE_ID}`);

// ---------------------------------------------------------------------------
if (pageErrors.length) {
  fail(`page/console errors (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 8)) console.error(`    ${e}`);
}
await browser.close();
await server.close();
console.log(failures
  ? `[gen2-verify] FAIL — ${failures} problem(s)`
  : '[gen2-verify] PASS — garage walk, tech tree, battle E2E all clean');
process.exit(failures ? 1 : 0);
