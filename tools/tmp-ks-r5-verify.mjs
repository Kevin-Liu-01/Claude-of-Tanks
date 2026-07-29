// TEMP killcam_shotinfo r5 verification probe (delete after review).
// r5 focus on top of the r3/r4 machinery:
//   A. fire a REAL player shot via __DEBUG, deep-copy the shell:hit payload at
//      emit, and verify EVERY rendered number on the floating card — with the
//      r5 armor-row format ('N → M mm eff.', 'external — no armor' for
//      external-module hits). Any card/payload mismatch is CRITICAL.
//   B. live death replay: the killcam annotation card rows must equal the
//      lethal payload (same fields), the header must read the DEATH direction
//      ('KILL CAM' / 'destroyed by <attacker>'), and the trail/channel rework
//      must not error.
//   C. staged killcam_xray view (player kills the Tiger): header must read the
//      KILL direction — 'FINAL BLOW' / 'Tiger I destroyed' (r5 minor: it read
//      'destroyed by <your own tank>').
// Outputs shots/ks-r5-verify/*.png + verdicts on stdout. Exit 0 = PASS.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/ks-r5-verify');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5860 + Math.floor(Math.random() * 80), strictPort: false, hmr: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 480000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const notes = [];
function check(where, name, expected, actual) {
  const ok = String(expected) === String(actual);
  if (!ok) failures.push({ where, name, expected: String(expected), actual: String(actual) });
  return ok;
}

// --- replicated presentation helpers (must match the owned UI files) --------
function zoneLabel(zone) {
  if (!zone) return '—';
  return zone.replace(/_(R|L)$/, ' $1').replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .replace(/ (r|l)$/, (m) => m.toUpperCase());
}
function penAt(sh, d) {
  if (d > 1000 && sh.pen2000Mm > 0) {
    const f2 = Math.min(1, (d - 1000) / 1000);
    return sh.pen1000Mm + (sh.pen2000Mm - sh.pen1000Mm) * f2;
  }
  const f = Math.min(1, Math.max(0, (d - 100) / 900));
  return sh.pen100Mm + (sh.pen1000Mm - sh.pen100Mm) * f;
}
const PEN_KINDS = new Set(['pen', 'he_pen']);
function classifyBadge(ev) {
  if (PEN_KINDS.has(ev.kind)) return 'PENETRATION';
  if (ev.kind === 'ricochet') return 'RICOCHET';
  if (ev.kind === 'he_splash') return (ev.damage || 0) > 0 ? 'SPLASH' : 'NO DAMAGE';
  const crits = (ev.modulesHit && ev.modulesHit.length) || (ev.crewHit && ev.crewHit.length);
  if ((ev.damage || 0) <= 0 && crits) return 'MODULE ONLY';
  if (ev.kind === 'screen_pierce') return 'SCREEN — NO DAMAGE';
  if (ev.kind === 'era') return 'NON-PEN · ERA';
  if (ev.kind === 'spaced_absorb') return 'NON-PEN · SPACED';
  return 'NON-PEN';
}
const EXT_ZONES = ['optics', 'gun', 'gun_barrel', 'trackL', 'trackR'];
/** r5 armor-row text for the floating card AND the killcam card. */
function armorRow(ev) {
  const R = Math.round;
  const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
  if (hasArmor) return `${R(ev.nominalMm || 0)} → ${R(ev.effectiveMm || 0)} mm eff.`;
  return ev.zone && EXT_ZONES.includes(ev.zone) ? 'external — no armor' : '—';
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

await page.evaluate(() => {
  const D = window.__DEBUG;
  window.__CAP = { hits: [], ended: null };
  D.bus.on('shell:hit', (ev) => window.__CAP.hits.push(JSON.parse(JSON.stringify(ev))));
  D.bus.on('battle:ended', (p) => { window.__CAP.ended = JSON.parse(JSON.stringify(p || {})); });
  D.startBattle('m1a2', 'verdant');
});
await sleep(300);

// ======================= PHASE A: outgoing shot card =========================
async function landPlayerHit(maxTries) {
  return await page.evaluate(async (tries) => {
    const D = window.__DEBUG;
    const yieldTask = () => new Promise((r) => setTimeout(r, 0));
    const pid = D.game.player.id;
    const playerHits = () => window.__CAP.hits.filter((h) => h.attackerId === pid && h.targetId !== pid);
    let aimed = null;
    for (let i = 0; i < 12 && !aimed; i++) {
      aimed = D.aimAtNearest();
      if (!aimed) { D.fastForward(1.5); await yieldTask(); }
    }
    if (!aimed) return { ok: false, why: 'no target' };
    for (let t = 0; t < tries; t++) {
      for (let s = 0; s < 30; s++) {
        const st = D.aimState();
        if (st && st.errMrad < 2.5 && st.reloadT <= 0) break;
        D.fastForward(0.25);
        await yieldTask();
      }
      const before = playerHits().length;
      D.flags.forceFire = true;
      for (let s = 0; s < 24 && playerHits().length === before; s++) {
        D.fastForward(0.25);
        await yieldTask();
      }
      D.flags.forceFire = false;
      if (playerHits().length > before) {
        const hits = playerHits();
        return { ok: true, ev: hits[hits.length - 1], pid };
      }
      D.aimAtNearest();
      await yieldTask();
    }
    return { ok: false, why: 'no hit landed' };
  }, maxTries);
}
async function teleportTargetAhead() {
  return await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    if (!p || p.combat.destroyed) return { ok: false, why: 'no player' };
    const enemy = D.game.tanks.find((t) => t.team === 'enemy' && !t.combat.destroyed);
    if (!enemy) return { ok: false, why: 'no enemy left' };
    const d = 110;
    const x = p.state.pos.x + Math.sin(p.state.yaw) * d;
    const z = p.state.pos.z + Math.cos(p.state.yaw) * d;
    enemy.state.pos.set(x, D.world.heightField.getHeightAt(x, z) + 0.4, z);
    enemy.state.speed = 0;
    enemy.state.yaw = p.state.yaw + Math.PI / 2;
    return { ok: true, id: enemy.id, d };
  });
}

let shot = await landPlayerHit(4);
if (!shot.ok) {
  const tp = await teleportTargetAhead();
  notes.push(`phaseA fallback teleport: ${JSON.stringify(tp)}`);
  if (tp.ok) shot = await landPlayerHit(5);
}
if (!shot.ok) {
  failures.push({ where: 'phaseA', name: 'landPlayerHit', expected: 'hit', actual: shot.why });
} else {
  const ev = shot.ev;
  notes.push(`phaseA event: kind=${ev.kind} dmg=${Math.round(ev.damage)} zone=${ev.zone} nom=${ev.nominalMm} eff=${Math.round(ev.effectiveMm)} roll=${Math.round(ev.penRollMm)} dist=${Math.round(ev.flightDistM)} target=${ev.targetName}`);
  const card = await page.evaluate(() => {
    const c = document.querySelector('.cot-si-cardhost .cot-si-card');
    if (!c) return null;
    const rows = {};
    for (const kv of c.querySelectorAll('.cot-si-kv')) {
      rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
    }
    const zoneEl = c.querySelector('.cot-si-zone');
    return {
      dataset: { ...c.dataset },
      badge: c.querySelector('.cot-si-badge').textContent.trim(),
      hdrDmg: c.querySelector('.cot-si-dmg').textContent.trim(),
      rows,
      zone: zoneEl ? zoneEl.childNodes[0].textContent.trim() : null,
    };
  });
  if (!card) {
    failures.push({ where: 'card', name: 'presence', expected: 'card in DOM after player hit', actual: 'missing' });
  } else {
    const R = Math.round;
    check('card.dataset', 'kind', ev.kind, card.dataset.kind);
    check('card.dataset', 'damage', R(ev.damage || 0), card.dataset.damage);
    check('card.dataset', 'dmgroll', R(ev.dmgRoll || 0), card.dataset.dmgroll);
    check('card.dataset', 'eff', R(ev.effectiveMm || 0), card.dataset.eff);
    check('card.dataset', 'pen', R(ev.penRollMm || 0), card.dataset.pen);
    check('card.dataset', 'nominal', R(ev.nominalMm || 0), card.dataset.nominal);
    check('card.dataset', 'dist', R(ev.flightDistM || 0), card.dataset.dist);
    check('card.dataset', 'angle', R(ev.impactAngleDeg || 0), card.dataset.angle);
    check('card.dataset', 'zone', ev.zone || '', card.dataset.zone);
    check('card', 'badge', classifyBadge(ev), card.badge);
    check('card', 'header damage', (ev.damage || 0) > 0 ? `−${R(ev.damage)}` : '0', card.hdrDmg);
    check('card', 'Distance row', `${R(ev.flightDistM || 0)} m`, card.rows['Distance']);
    check('card', 'Angle row', `${R(ev.impactAngleDeg || 0)}°`, card.rows['Angle']);
    if (ev.kind === 'screen_pierce') {
      check('card', 'Armor row (screen)', (ev.physicalMm || 0) > 0 ? `${R(ev.physicalMm)} mm screen` : 'screen', card.rows['Armor']);
    } else {
      check('card', 'Armor row (r5 format)', armorRow(ev), card.rows['Armor']);
      const spec = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG.game.player.spec.gun.shells)));
      const sh = spec.find((s) => s.name === ev.shellName && s.type === ev.shellType) || spec.find((s) => s.type === ev.shellType);
      const nomPen = sh ? R(penAt(sh, ev.flightDistM || 0)) : 0;
      const roll = R(ev.penRollMm || 0);
      if (roll > 0 && nomPen > 0) {
        check('card', 'Pen roll row', `${roll} / ${nomPen} mm`, card.rows['Pen roll']);
      }
      check('card', 'pennom vs independent recompute', nomPen, card.dataset.pennom);
    }
    check('card', 'Damage row', `${R(ev.damage || 0)} / ${R(ev.dmgRoll || 0)}`, card.rows['Damage']);
    check('card', 'Result row', ev.destroyed ? 'DESTROYED' : `${Math.max(0, R(ev.targetHpAfter || 0))} hp left`, card.rows['Result']);
    if (card.zone !== null) check('card', 'zone label', zoneLabel(ev.zone), card.zone);
  }
  await page.evaluate(() => { const D = window.__DEBUG; if (D.rig && D.rig.exitSniper) D.rig.exitSniper(); });
  await sleep(300);
  await page.screenshot({ path: `${outDir}/a_card.png`, clip: { x: 1920 - 320, y: 270, width: 320, height: 460 } });
}

// ============ PHASE B: live death replay — killcam card vs payload ==========
const spawned = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const yieldTask = () => new Promise((r) => setTimeout(r, 0));
  const ok = D.spawnKillShell();
  if (!ok) return { ok: false, why: 'no shell spawned' };
  for (let s = 0; s < 40; s++) {
    D.fastForward(0.25);
    await yieldTask();
    if (D.killcam.isActive()) break;
  }
  const pid = D.game.player ? D.game.player.id : null;
  const lethal = window.__CAP.hits.filter((h) => h.targetId === pid && h.destroyed);
  return { ok: D.killcam.isActive(), phase: D.killcam.phase, ev: lethal[lethal.length - 1] || null };
});
if (!spawned.ok || !spawned.ev) {
  failures.push({ where: 'phaseB', name: 'death replay start', expected: 'killcam active + lethal payload', actual: JSON.stringify({ ok: spawned.ok, hasEv: !!spawned.ev }) });
} else {
  const ev = spawned.ev;
  notes.push(`phaseB lethal: kind=${ev.kind} dmg=${Math.round(ev.damage)} zone=${ev.zone} from=${ev.attackerName}`);
  await sleep(600);
  await page.screenshot({ path: `${outDir}/b_flight.png` });
  await page.waitForFunction('window.__DEBUG.killcam.phase === "xray"', { timeout: 9000 }).catch(() => {
    failures.push({ where: 'phaseB', name: 'reached x-ray', expected: 'xray', actual: 'timeout' });
  });
  await sleep(1000);
  const kc = await page.evaluate(() => {
    const root = document.querySelector('.cot-kc');
    if (!root) return null;
    const rows = {};
    for (const kv of root.querySelectorAll('.cot-kc-kv')) {
      rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
    }
    return {
      title: root.querySelector('.cot-kc-title .t').textContent.trim(),
      sub: root.querySelector('.cot-kc-title .s').textContent.trim(),
      hdW: root.querySelector('.cot-kc-annot .hd .w').textContent.trim(),
      rows,
    };
  });
  if (!kc) {
    failures.push({ where: 'phaseB', name: 'killcam DOM', expected: 'present', actual: 'missing' });
  } else {
    const R = Math.round;
    check('killcam', 'title (death direction)', 'KILL CAM', kc.title);
    check('killcam', 'subtitle (death direction)', `destroyed by ${ev.attackerName || 'enemy fire'}`, kc.sub);
    check('killcam', 'who → whom', `${ev.attackerName || 'Enemy'} → ${ev.targetName || ''}`, kc.hdW);
    check('killcam', 'Distance row', `${R(ev.flightDistM || 0)} m`, kc.rows['Distance']);
    check('killcam', 'Impact angle row', `${R(ev.impactAngleDeg || 0)}°`, kc.rows['Impact angle']);
    check('killcam', 'Armor row (r5 format)', armorRow(ev), kc.rows['Armor']);
    check('killcam', 'Damage row', `${R(ev.damage || 0)}`, kc.rows['Damage']);
    check('killcam', 'Zone row', zoneLabel(ev.zone), kc.rows['Zone']);
    const roll = R(ev.penRollMm || 0);
    if (roll > 0) {
      const rowTxt = kc.rows['Pen roll'] || '';
      if (!(rowTxt.startsWith(String(roll)) && rowTxt.endsWith('mm'))) {
        failures.push({ where: 'killcam', name: 'Pen roll row starts with payload roll', expected: `${roll}[ / nom] mm`, actual: rowTxt });
      }
    } else {
      check('killcam', 'Pen roll row (no roll)', '—', kc.rows['Pen roll']);
    }
  }
  await sleep(800);
  await page.screenshot({ path: `${outDir}/b_xray.png` });
  await page.keyboard.press('Space');
  await sleep(500);
}

// ====== PHASE C: staged killcam_xray — FINAL BLOW direction (r5 minor) ======
await page.evaluate(() => {
  // the phase-B battle may have flushed its report — clear it so the staged
  // frame captures clean (harness runs never end a battle, probe runs can)
  const sr = document.querySelector('.cot-si-stats');
  if (sr) sr.classList.remove('show');
  document.body.classList.remove('cot-si-report');
  window.__SHOTS.set('killcam_xray');
});
await sleep(1600);
const staged = await page.evaluate(() => {
  const root = document.querySelector('.cot-kc');
  if (!root || !root.classList.contains('on')) return null;
  const rows = {};
  for (const kv of root.querySelectorAll('.cot-kc-kv')) {
    rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
  }
  return {
    title: root.querySelector('.cot-kc-title .t').textContent.trim(),
    sub: root.querySelector('.cot-kc-title .s').textContent.trim(),
    rows,
  };
});
if (!staged) {
  failures.push({ where: 'phaseC', name: 'staged killcam view', expected: 'on', actual: 'missing' });
} else {
  check('staged', 'title reads kill direction', 'FINAL BLOW', staged.title);
  check('staged', 'subtitle names the victim', 'Tiger I destroyed', staged.sub);
  if (!/^\d+ → \d+ mm eff\.$/.test(staged.rows['Armor'] || '')) {
    failures.push({ where: 'staged', name: 'Armor row carries eff. label', expected: 'N → M mm eff.', actual: staged.rows['Armor'] });
  }
  notes.push(`phaseC staged rows: Armor='${staged.rows['Armor']}' PenRoll='${staged.rows['Pen roll']}'`);
  await page.screenshot({ path: `${outDir}/c_staged.png` });
}

// ------------------------------ verdict --------------------------------------
console.log('\n================ ks-r5 verify ================');
for (const n of notes) console.log('NOTE  ', n);
for (const f of failures) console.log('FAIL  ', JSON.stringify(f));
if (errs.length) console.log('CONSOLE ERRORS:', errs.slice(0, 6));
console.log(failures.length === 0 && errs.length === 0 ? 'VERDICT: PASS' : `VERDICT: ${failures.length} failures, ${errs.length} console errors`);
await browser.close();
await server.close();
process.exit(failures.length === 0 && errs.length === 0 ? 0 : 1);
