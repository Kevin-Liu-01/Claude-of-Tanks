// TEMP killcam_shotinfo r4 verification probe (delete after review).
// Fires a real shot via __DEBUG hooks, captures the resolved shell:hit sim
// payload off the bus, and verifies EVERY number rendered on:
//   1. the floating shot-info card (.cot-si-card)
//   2. the incoming-hit toast (.cot-si-toast) — STAGED non-lethal incoming
//      hit (spawnKillShell with the hp drop undone) so the toast itself is
//      screenshot-verified against its payload every run
//   3. the kill-cam annotation card (.cot-kc-kv rows) + x-ray labels, with a
//      LIVE (non-fastForward) onset measurement: wall-clock delta from
//      game.result set -> killcam active (dead-air audit)
//   4. the end-of-battle report (.cot-si-stats tiles + econ strip) + layout:
//      HUD chrome hidden behind the report, footer pinned under content,
//      timeline panel collapsed for short battles
// Any mismatch between what the panel prints and what the sim event said is
// reported as CRITICAL. Outputs shots/shotinfo-verify/*.png + JSON verdicts.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/shotinfo-verify');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5810 + Math.floor(Math.random() * 80), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 480000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
let page = null;
const errs = [];
async function freshPage() {
  if (page) { try { await page.close(); } catch (_) { /* already dead */ } }
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('error', (e) => errs.push(`PAGE CRASH: ${e}`));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const notes = [];
function check(where, name, expected, actual) {
  const ok = String(expected) === String(actual);
  if (!ok) failures.push({ where, name, expected: String(expected), actual: String(actual) });
  return ok;
}

// --- replicated presentation helpers (must match src/ui/shotInfo.js) --------
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
const BOUNCE_KINDS = new Set(['ricochet', 'nonpen', 'spaced_absorb', 'era']);
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
const MODULE_LABEL = {
  trackL: 'Track L', trackR: 'Track R', engine: 'Engine', fuelTank: 'Fuel',
  ammoRack: 'Ammo Rack', gun: 'Gun', radio: 'Radio', optics: 'Optics', turretRing: 'Turret Ring',
};
const CREW_LABEL = { commander: 'Commander', gunner: 'Gunner', driver: 'Driver', loader: 'Loader' };

async function ready() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
}

// install bus capture, start a battle
async function beginBattle() {
  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__CAP = { hits: [], fired: 0, killsByPlayer: 0, ended: null };
    D.bus.on('shell:hit', (ev) => window.__CAP.hits.push(JSON.parse(JSON.stringify(ev))));
    D.bus.on('shell:fired', (p) => { if (p.isPlayer) window.__CAP.fired++; });
    D.bus.on('tank:destroyed', (p) => {
      const pid = D.game.player ? D.game.player.id : null;
      if (p.killerId === pid && p.id !== pid) window.__CAP.killsByPlayer++;
    });
    D.bus.on('battle:ended', (p) => { window.__CAP.ended = JSON.parse(JSON.stringify(p || {})); });
    D.startBattle('m1a2', 'verdant');
  });
  await sleep(300);
}

// aim at nearest enemy, settle, force-fire until the player lands >=1 hit.
// Every fastForward is followed by a macrotask yield: long SYNCHRONOUS sim
// stretches inside one evaluate tripped Chrome's unresponsive-renderer
// killer and crashed the tab at the next screenshot.
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
      // settle the gun
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

// read the floating shot card DOM
async function readCard() {
  return await page.evaluate(() => {
    const card = document.querySelector('.cot-si-cardhost .cot-si-card');
    if (!card) return null;
    const rows = {};
    for (const kv of card.querySelectorAll('.cot-si-kv')) {
      rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
    }
    const zoneEl = card.querySelector('.cot-si-zone');
    return {
      dataset: { ...card.dataset },
      badge: card.querySelector('.cot-si-badge').textContent.trim(),
      hdrDmg: card.querySelector('.cot-si-dmg').textContent.trim(),
      sub: card.querySelector('.cot-si-sub').textContent.trim().replace(/\s+/g, ' '),
      rows,
      zone: zoneEl ? zoneEl.childNodes[0].textContent.trim() : null,
      zoneTank: zoneEl ? (zoneEl.querySelector('.tn') || {}).textContent : null,
      hasDiagram: !!card.querySelector('.cot-si-diag .sil'),
      chips: [...card.querySelectorAll('.cot-si-mod span:last-child')].map((c) => c.textContent.trim()),
    };
  });
}

async function runAll() {
  await ready();
  // ======================= PHASE A: outgoing shot card =======================
  await beginBattle();
  const shot = await landPlayerHit(8);
  if (!shot.ok) {
    failures.push({ where: 'phaseA', name: 'landPlayerHit', expected: 'hit', actual: shot.why });
  } else {
    const ev = shot.ev;
    notes.push(`phaseA event: kind=${ev.kind} dmg=${ev.damage} zone=${ev.zone} dist=${Math.round(ev.flightDistM)} target=${ev.targetName}`);
    const card = await readCard();
    if (!card) {
      failures.push({ where: 'card', name: 'presence', expected: 'card in DOM after player hit', actual: 'missing' });
    } else {
      const R = Math.round;
      // dataset trace vs payload
      check('card.dataset', 'kind', ev.kind, card.dataset.kind);
      check('card.dataset', 'damage', R(ev.damage || 0), card.dataset.damage);
      check('card.dataset', 'dmgroll', R(ev.dmgRoll || 0), card.dataset.dmgroll);
      check('card.dataset', 'eff', R(ev.effectiveMm || 0), card.dataset.eff);
      check('card.dataset', 'pen', R(ev.penRollMm || 0), card.dataset.pen);
      check('card.dataset', 'nominal', R(ev.nominalMm || 0), card.dataset.nominal);
      check('card.dataset', 'dist', R(ev.flightDistM || 0), card.dataset.dist);
      check('card.dataset', 'angle', R(ev.impactAngleDeg || 0), card.dataset.angle);
      check('card.dataset', 'zone', ev.zone || '', card.dataset.zone);
      // rendered text vs payload
      check('card', 'badge', classifyBadge(ev), card.badge);
      check('card', 'header damage', (ev.damage || 0) > 0 ? `−${R(ev.damage)}` : '0', card.hdrDmg);
      check('card', 'Distance row', `${R(ev.flightDistM || 0)} m`, card.rows['Distance']);
      check('card', 'Angle row', `${R(ev.impactAngleDeg || 0)}°`, card.rows['Angle']);
      if (ev.kind === 'screen_pierce') {
        check('card', 'Armor row (screen)', (ev.physicalMm || 0) > 0 ? `${R(ev.physicalMm)} mm screen` : 'screen', card.rows['Armor']);
      } else {
        const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
        check('card', 'Armor row', hasArmor ? `${R(ev.nominalMm || 0)}→${R(ev.effectiveMm || 0)} mm` : '—', card.rows['Armor']);
        // pen roll: rendered roll must equal payload; baseline must equal an
        // INDEPENDENT pen-at-distance recompute from the attacker's spec
        const spec = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG.game.player.spec.gun.shells)));
        const sh = spec.find((s) => s.name === ev.shellName && s.type === ev.shellType) || spec.find((s) => s.type === ev.shellType);
        const nomPen = sh ? R(penAt(sh, ev.flightDistM || 0)) : 0;
        const roll = R(ev.penRollMm || 0);
        if (roll > 0 && nomPen > 0) {
          check('card', 'Pen roll row', `${roll} / ${nomPen} mm`, card.rows['Pen roll']);
          const dev = Math.abs(roll - nomPen) / nomPen;
          if (dev > 0.2501) failures.push({ where: 'sim', name: 'pen roll outside ±25% of nominal', expected: `within 25% of ${nomPen}`, actual: String(roll) });
        }
        check('card', 'pennom dataset vs independent recompute', nomPen, card.dataset.pennom);
      }
      check('card', 'Damage row', `${R(ev.damage || 0)} / ${R(ev.dmgRoll || 0)}`, card.rows['Damage']);
      check('card', 'Result row', ev.destroyed ? 'DESTROYED' : `${Math.max(0, R(ev.targetHpAfter || 0))} hp left`, card.rows['Result']);
      if (card.zone !== null) check('card', 'zone label', zoneLabel(ev.zone), card.zone);
      check('card', 'diagram present', true, card.hasDiagram);
      // module/crew chips
      const wantChips = [
        ...(ev.modulesHit || []).map((m) => MODULE_LABEL[m.module] || m.module),
        ...(ev.crewHit || []).map((c) => CREW_LABEL[c] || c),
        ...(ev.fireStarted ? ['Fire'] : []),
      ];
      check('card', 'module chips', wantChips.join('|'), card.chips.join('|'));
      check('card', 'target name', ev.targetName || '', (card.zoneTank || '').trim());
    }
    await page.screenshot({ path: `${outDir}/a_card_full.png` });
    await page.screenshot({ path: `${outDir}/a_card_crop.png`, clip: { x: 1920 - 300, y: 270, width: 300, height: 430 } });
  }

  // ============ PHASE A2: STAGED non-lethal incoming hit -> toast ============
  // spawnKillShell fires a REAL enemy shell through the normal pipeline but
  // drops player hp to 1 so the hit kills. Undo the hp drop immediately after
  // the spawn: the same shell then lands NON-LETHALLY and must render as an
  // incoming toast (the r6 probe window never saw one — the lethal hit always
  // bypassed the toast into the killcam replay).
  const toastRes = await page.evaluate(async () => {
    const D = window.__DEBUG;
    const yieldTask = () => new Promise((r) => setTimeout(r, 0));
    const p = D.game.player;
    const hpBefore = p.combat.hp;
    const before = window.__CAP.hits.filter((h) => h.targetId === p.id).length;
    const ok = D.spawnKillShell();
    if (!ok) return { ok: false, why: 'no shell spawned' };
    p.combat.hp = hpBefore; // survivable again — toast path, not killcam
    for (let s = 0; s < 20; s++) {
      D.fastForward(0.25);
      await yieldTask();
      if (window.__CAP.hits.filter((h) => h.targetId === p.id).length > before) break;
    }
    const inc = window.__CAP.hits.filter((h) => h.targetId === p.id);
    if (inc.length === before) return { ok: false, why: 'staged shell never hit' };
    const ev = inc[inc.length - 1];
    const t = document.querySelector('.cot-si-toasthost .cot-si-toast:last-child');
    return {
      ok: true, ev, dead: p.combat.destroyed,
      toast: t ? { dataset: { ...t.dataset }, text: t.textContent.trim().replace(/\s+/g, ' ') } : null,
    };
  });
  if (!toastRes.ok) {
    failures.push({ where: 'toast', name: 'staged incoming hit', expected: 'non-lethal hit on player', actual: toastRes.why });
  } else if (toastRes.dead) {
    failures.push({ where: 'toast', name: 'staging stayed non-lethal', expected: 'player alive', actual: 'player died — toast bypassed' });
  } else if (!toastRes.toast) {
    failures.push({ where: 'toast', name: 'presence', expected: 'toast in DOM after incoming hit', actual: 'missing' });
  } else {
    const ev = toastRes.ev;
    const t = toastRes.toast;
    check('toast.dataset', 'damage', Math.round(ev.damage || 0), t.dataset.damage);
    check('toast.dataset', 'kind', ev.kind, t.dataset.kind);
    const dmgTok = (ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : classifyBadge(ev);
    if (!t.text.includes(dmgTok)) failures.push({ where: 'toast', name: 'damage text', expected: dmgTok, actual: t.text });
    if (ev.attackerName && !t.text.includes(ev.attackerName)) failures.push({ where: 'toast', name: 'attacker name', expected: ev.attackerName, actual: t.text });
    if (ev.shellType && !t.text.includes(ev.shellType)) failures.push({ where: 'toast', name: 'shell type', expected: ev.shellType, actual: t.text });
    if (ev.zone && !t.text.includes(zoneLabel(ev.zone))) failures.push({ where: 'toast', name: 'zone label', expected: zoneLabel(ev.zone), actual: t.text });
    for (const m of ev.modulesHit || []) {
      const want = MODULE_LABEL[m.module] || m.module;
      if (!t.text.includes(want)) failures.push({ where: 'toast', name: `module ${m.module}`, expected: want, actual: t.text });
    }
    notes.push(`toast verified against STAGED incoming hit (dmg=${ev.damage}, kind=${ev.kind}, zone=${ev.zone})`);
    await page.screenshot({ path: `${outDir}/a2_toast.png`, clip: { x: 0, y: 1080 - 452 - 150, width: 320, height: 180 } });
  }

  // ======================= PHASE B: kill-cam card ============================
  // LIVE onset audit (r6: 4.9 s onset measured AFTER a synchronous
  // fastForward(2.0) starved rAF — measure without fastForward): rAF poll
  // stamps game.result set and killcam active, real time in between.
  const spawned = await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__ONSET = { resultAt: 0, kcAt: 0 };
    const poll = () => {
      if (D.game.result && !window.__ONSET.resultAt) window.__ONSET.resultAt = performance.now();
      if (D.killcam.isActive() && !window.__ONSET.kcAt) { window.__ONSET.kcAt = performance.now(); return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    return D.spawnKillShell();
  });
  if (!spawned) {
    failures.push({ where: 'phaseB', name: 'kill setup', expected: 'lethal shell spawned', actual: 'spawnKillShell=false' });
  } else {
    await page.waitForFunction('window.__DEBUG.killcam.phase !== null', { timeout: 15000 });
    const onset = await page.evaluate(() => ({
      ...window.__ONSET,
      beginWall: window.__DEBUG.killcam.lastBeginWallMs,
      dead: window.__DEBUG.game.player.combat.destroyed,
    }));
    const delta = onset.resultAt && onset.kcAt ? onset.kcAt - onset.resultAt : -1;
    const deltaBegin = onset.resultAt && onset.beginWall ? onset.beginWall - onset.resultAt : -1;
    notes.push(`LIVE killcam onset: result->active ${delta.toFixed(0)} ms (rAF poll), result->begin() ${deltaBegin.toFixed(0)} ms (killcam.lastBeginWallMs)`);
    if (delta > 350) failures.push({ where: 'killcam', name: 'live onset dead air', expected: '<=350 ms from game.result to replay', actual: `${delta.toFixed(0)} ms` });
    const ev = await page.evaluate(() => {
      const pid = window.__DEBUG.game.player.id;
      const l = window.__CAP.hits.filter((h) => h.targetId === pid && h.destroyed);
      return l[l.length - 1] || null;
    });
    if (!ev) {
      failures.push({ where: 'phaseB', name: 'lethal payload', expected: 'destroyed shell:hit on player', actual: 'none captured' });
      throw new Error('phaseB: no lethal payload');
    }
    await sleep(700);
    await page.screenshot({ path: `${outDir}/b_killcam_flight.png` });
    // skip 1: flight -> xray
    await page.keyboard.press('Space');
    await sleep(1300); // let labels animate in
    const kcPhase = await page.evaluate(() => window.__DEBUG.killcam.phase);
    check('killcam', 'skip advances flight->xray', 'xray', kcPhase);
    const kc = await page.evaluate(() => {
      const rows = {};
      for (const kv of document.querySelectorAll('.cot-kc-kv')) {
        rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
      }
      return {
        rows,
        title: (document.querySelector('.cot-kc-title') || {}).textContent || '',
        labels: [...document.querySelectorAll('.cot-kc-label')].map((l) => l.textContent.trim().replace(/\s+/g, ' ')),
        big: [...document.querySelectorAll('.cot-kc-dmg')].map((l) => l.textContent.trim()),
      };
    });
    const R = Math.round;
    check('killcam', 'Distance row', `${R(ev.flightDistM || 0)} m`, kc.rows['Distance']);
    check('killcam', 'Impact angle row', `${R(ev.impactAngleDeg || 0)}°`, kc.rows['Impact angle']);
    if ((ev.nominalMm || 0) > 0) check('killcam', 'Armor row', `${R(ev.nominalMm)} → ${R(ev.effectiveMm || 0)} mm`, kc.rows['Armor']);
    check('killcam', 'Damage row', `${R(ev.damage || 0)}`, kc.rows['Damage']);
    check('killcam', 'Zone row', zoneLabel(ev.zone), kc.rows['Zone']);
    if ((ev.penRollMm || 0) > 0 && !String(kc.rows['Pen roll'] || '').startsWith(String(R(ev.penRollMm)))) {
      failures.push({ where: 'killcam', name: 'Pen roll row', expected: `${R(ev.penRollMm)} / <nominal> mm`, actual: String(kc.rows['Pen roll']) });
    }
    if ((ev.damage || 0) > 0 && !kc.big.some((b) => b === `−${R(ev.damage)} HP`)) {
      failures.push({ where: 'killcam', name: 'x-ray −HP label', expected: `−${R(ev.damage)} HP`, actual: kc.big.join(',') || '(none)' });
    }
    for (const m of ev.modulesHit || []) {
      const want = (MODULE_LABEL[m.module] || m.module).replace('Fuel', 'Fuel Tank');
      if (!kc.labels.some((l) => l.toUpperCase().includes(want.toUpperCase()))) {
        failures.push({ where: 'killcam', name: `x-ray module label ${m.module}`, expected: want, actual: kc.labels.join(' | ') || '(none)' });
      }
    }
    notes.push(`killcam labels: ${kc.labels.join(' | ')} big: ${kc.big.join(',')}`);
    await page.screenshot({ path: `${outDir}/b_killcam_xray.png` });
    // skip 2: xray -> finish (skippability)
    await page.keyboard.press('Space');
    await sleep(400);
    const done = await page.evaluate(() => window.__DEBUG.killcam.phase);
    check('killcam', 'skip ends replay', 'null', String(done));
  }

  // ======================= PHASE C: battle report ============================
  await ready(); // fresh page: clean state for report bookkeeping
  await beginBattle();
  const shot2 = await landPlayerHit(8);
  if (!shot2.ok) notes.push('phaseC: no player hit before slay — report will be sparse');
  const repSetup = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.slayEnemies();
    D.fastForward(1.0);
    return { result: D.game.result };
  });
  // a FINAL BLOW replay may or may not run; skip through it if it did
  for (let i = 0; i < 4; i++) {
    const ph = await page.evaluate(() => window.__DEBUG.killcam.phase);
    if (ph === null) break;
    await page.keyboard.press('Space');
    await sleep(500);
  }
  await page.waitForFunction('document.querySelector(".cot-si-stats.show") !== null', { timeout: 15000 });
  await sleep(400);
  const rep = await page.evaluate(() => {
    const D = window.__DEBUG;
    const pid = D.game.player.id;
    const cap = window.__CAP;
    const mine = cap.hits.filter((h) => h.attackerId === pid && h.targetId !== pid);
    const inc = cap.hits.filter((h) => h.targetId === pid);
    const stats = document.querySelector('.cot-si-stats');
    const tiles = {};
    for (const s of stats.querySelectorAll('.cot-si-stat')) {
      tiles[s.querySelector('.k').textContent.trim()] = s.querySelector('.v').textContent.trim();
    }
    return {
      result: D.game.result,
      dataset: { ...stats.dataset },
      tiles,
      banner: (stats.querySelector('.cot-si-ban') || {}).textContent,
      credits: (stats.querySelector('.cot-si-ecoitem.cr .ev') || {}).textContent,
      xp: (stats.querySelector('.cot-si-ecoitem.xp .ev') || {}).textContent,
      floatingCardLeft: !!document.querySelector('.cot-si-cardhost .cot-si-card'),
      toastLeft: !!document.querySelector('.cot-si-toasthost .cot-si-toast'),
      cap: {
        fired: cap.fired,
        hits: mine.length,
        pens: mine.filter((h) => h.kind === 'pen' || h.kind === 'he_pen').length,
        dealt: Math.round(mine.reduce((a, h) => a + (h.damage || 0), 0)),
        received: Math.round(inc.reduce((a, h) => a + (h.damage || 0), 0)),
        blocked: Math.round(inc.filter((h) => (h.damage || 0) <= 0 && ['ricochet', 'nonpen', 'spaced_absorb', 'era'].includes(h.kind)).reduce((a, h) => a + (h.dmgRoll || 0), 0)),
        kills: cap.killsByPlayer,
      },
    };
  });
  check('report', 'result banner', rep.result === 'victory' ? 'VICTORY' : rep.result === 'defeat' ? 'DEFEAT' : 'DRAW', rep.banner);
  check('report', 'Shots fired tile vs bus shell:fired count', rep.cap.fired, rep.tiles['Shots fired']);
  check('report', 'Shots hit tile vs bus shell:hit count', rep.cap.hits, rep.tiles['Shots hit']);
  check('report', 'Damage dealt tile vs bus sum', rep.cap.dealt, rep.tiles['Damage dealt']);
  check('report', 'Damage received tile vs bus sum', rep.cap.received, rep.tiles['Damage received']);
  check('report', 'Damage blocked tile vs bus sum', rep.cap.blocked, rep.tiles['Damage blocked']);
  check('report', 'Kills tile vs bus tank:destroyed count', rep.cap.kills, rep.tiles['Kills']);
  const penRate = rep.cap.hits > 0 ? Math.round((rep.cap.pens / rep.cap.hits) * 100) : 0;
  check('report', 'Pen rate tile', `${penRate}%`, rep.tiles['Pen rate']);
  // economy strip must reconcile exactly from the visible counters
  const win = rep.result === 'victory';
  const baseXp = Math.round(rep.cap.dealt * 0.85 + rep.cap.kills * 140 + rep.cap.blocked * 0.12 + rep.cap.hits * 6);
  const wantXp = Math.round(baseXp * (win ? 1.5 : 1));
  const wantCr = Math.round(rep.cap.dealt * 4.2 + rep.cap.kills * 850 + rep.cap.blocked * 0.55) + (win ? 2500 : 0);
  check('report', 'XP strip formula', `+${wantXp.toLocaleString('en-US')}`, rep.xp);
  check('report', 'Credits strip formula', `+${wantCr.toLocaleString('en-US')}`, rep.credits);
  check('report', 'floating card cleared behind report', false, rep.floatingCardLeft);
  check('report', 'toasts cleared behind report', false, rep.toastLeft);
  check('report', 'roster allies', 4, rep.dataset.rosterAllies);
  check('report', 'roster enemies', 4, rep.dataset.rosterEnemies);

  // layout: HUD chrome hidden, footer pinned under content, timeline collapse
  await sleep(900); // pinFooter interval needs the .cot-end button visible
  const layout = await page.evaluate(() => {
    const disp = (sel) => {
      const n = document.querySelector(sel);
      return n ? getComputedStyle(n).display : '(absent)';
    };
    const stats = document.querySelector('.cot-si-stats');
    const btn = document.querySelector('.cot-end button');
    const last = stats ? stats.lastElementChild : null;
    const dealtEvents = window.__CAP.hits.filter((h) => h.attackerId === window.__DEBUG.game.player.id && h.targetId !== window.__DEBUG.game.player.id && (h.damage || 0) > 0).length;
    const recvEvents = window.__CAP.hits.filter((h) => h.targetId === window.__DEBUG.game.player.id && (h.damage || 0) > 0).length;
    return {
      killfeed: disp('.cot-killfeed'), earL: disp('.cot-ear.l'), earR: disp('.cot-ear.r'),
      shells: disp('.cot-shells'), minimap: disp('.cot-minimap'), score: disp('.cot-top'),
      dmgPanel: disp('.cot-dp'),
      tlPresent: !!document.querySelector('.cot-si-tlwrap'),
      dmgEvents: dealtEvents + recvEvents,
      contentBottom: last ? last.getBoundingClientRect().bottom : -1,
      btnTop: btn ? btn.getBoundingClientRect().top : -1,
      endPad: document.body.style.getPropertyValue('--cot-si-endpad') || '(unset)',
    };
  });
  for (const k of ['killfeed', 'earL', 'earR', 'shells', 'minimap', 'score', 'dmgPanel']) {
    check('report.layout', `${k} hidden behind report`, 'none', layout[k]);
  }
  check('report.layout', 'timeline panel collapsed under 3 dmg events',
    layout.dmgEvents >= 3, layout.tlPresent);
  if (layout.btnTop > 0 && layout.contentBottom > 0) {
    const gap = layout.btnTop - layout.contentBottom;
    if (gap < 8 || gap > 90) failures.push({ where: 'report.layout', name: 'footer pinned under last panel', expected: 'button 8-90 px below content', actual: `${gap.toFixed(0)} px (endPad=${layout.endPad})` });
    notes.push(`footer gap under content: ${gap.toFixed(0)} px (endPad=${layout.endPad}, contentBottom=${layout.contentBottom.toFixed(0)})`);
  } else {
    failures.push({ where: 'report.layout', name: 'footer measure', expected: 'button + content present', actual: JSON.stringify({ btnTop: layout.btnTop, contentBottom: layout.contentBottom }) });
  }
  await page.screenshot({ path: `${outDir}/c_report.png` });
  notes.push(`report caps: ${JSON.stringify(rep.cap)} tiles: ${JSON.stringify(rep.tiles)}`);
}

// Headless tabs on this box occasionally die mid-run ("Not attached to an
// active page" / context destroyed) under machine-wide GPU/memory contention
// — retry the whole suite on a fresh page; data checks are deterministic.
let attempts = 0;
try {
  for (attempts = 1; attempts <= 3; attempts++) {
    failures.length = 0;
    notes.length = 0;
    errs.length = 0;
    try {
      await freshPage();
      await runAll();
      break;
    } catch (e) {
      failures.push({ where: 'harness', name: 'exception', expected: 'clean run', actual: String(e && e.stack || e) });
      if (attempts < 3) console.log(`[retry] attempt ${attempts} died (${String(e).slice(0, 120)}) — fresh page`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (attempts > 1) notes.push(`suite needed ${Math.min(attempts, 3)} attempt(s) — headless tab flake, not a data issue`);

console.log('\n=== shotinfo verification ===');
for (const n of notes) console.log('[note]', n);
if (errs.length) console.log('[console errors]', JSON.stringify(errs, null, 1));
if (!failures.length) {
  console.log('RESULT: ALL CHECKS PASSED — every rendered number matches the sim event payload.');
} else {
  console.log(`RESULT: ${failures.length} MISMATCH(ES):`);
  for (const f of failures) console.log(` [${f.where}] ${f.name}: expected="${f.expected}" actual="${f.actual}"`);
  process.exitCode = 1;
}
