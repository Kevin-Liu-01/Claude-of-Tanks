// TEMP killcam_shotinfo ROUND-6 CRITIC probe (delete after review).
// Independent verification: fire a real shot via __DEBUG hooks, snapshot the
// resolved shell:hit payload off the bus at event time, then compare the
// RENDERED TEXT of every panel against that payload:
//   A  floating shot card (.cot-si-card) — badge, damage, distance, angle,
//      nominal->effective armor, pen roll vs an INDEPENDENT pen-curve
//      recompute, damage roll bounds, zone, target, module chips
//   A2 incoming toast (.cot-si-toast) — staged non-lethal enemy hit
//   B  kill-cam annotation (.cot-kc-kv) + x-ray labels + LIVE onset timing,
//      skippability, report gating, banner honesty
//   C  end-of-battle report (.cot-si-stats) — every tile vs my own bus sums,
//      econ strip reconciled from the VISIBLE tiles, roster, layout
// Any card/event mismatch is CRITICAL. Screenshots to shots/critic_r6_ks/.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_r6_ks');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5910 + Math.floor(Math.random() * 60), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 480000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
let page = null;
const errs = [];
async function freshPage() {
  if (page) { try { await page.close(); } catch (_) { /* dead */ } }
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

// --- MY OWN pen curve (from src/sim/ballistics.js contract) -----------------
function myPenAt(sh, d) {
  if (d > 1000 && sh.pen2000Mm > 0) {
    const f2 = Math.min(1, (d - 1000) / 1000);
    return sh.pen1000Mm + (sh.pen2000Mm - sh.pen1000Mm) * f2;
  }
  const f = Math.min(1, Math.max(0, (d - 100) / 900));
  return sh.pen100Mm + (sh.pen1000Mm - sh.pen100Mm) * f;
}
function zoneLabel(zone) {
  if (!zone) return '—';
  return zone.replace(/_(R|L)$/, ' $1').replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .replace(/ (r|l)$/, (m) => m.toUpperCase());
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

async function landPlayerHit(maxTries) {
  return await page.evaluate(async (tries) => {
    const D = window.__DEBUG;
    const yieldTask = () => new Promise((r) => setTimeout(r, 0));
    const pid = D.game.player.id;
    const playerHits = () => window.__CAP.hits.filter((h) => h.attackerId === pid && h.targetId !== pid);
    // acquisition can honestly take >45 s of game time (spawn separation +
    // terrain LOS) — fast-forward up to ~120 s before declaring failure
    let aimed = null;
    for (let i = 0; i < 60 && !aimed; i++) {
      aimed = D.aimAtNearest();
      if (!aimed) { D.fastForward(2.0); await yieldTask(); }
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

async function readCard() {
  return await page.evaluate(() => {
    const card = document.querySelector('.cot-si-cardhost .cot-si-card');
    if (!card) return null;
    const rows = {};
    for (const kv of card.querySelectorAll('.cot-si-kv')) {
      rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim().replace(/\s+/g, ' ');
    }
    const zoneEl = card.querySelector('.cot-si-zone');
    const penRollB = [...card.querySelectorAll('.cot-si-kv')]
      .find((kv) => kv.querySelector('span').textContent.trim() === 'Pen roll');
    const penColored = penRollB ? penRollB.querySelector('b span') : null;
    return {
      dataset: { ...card.dataset },
      badge: card.querySelector('.cot-si-badge').textContent.trim(),
      hdrDmg: card.querySelector('.cot-si-dmg').textContent.trim(),
      sub: card.querySelector('.cot-si-sub').textContent.trim().replace(/\s+/g, ' '),
      rows,
      zone: zoneEl ? zoneEl.childNodes[0].textContent.trim() : null,
      zoneTank: zoneEl ? ((zoneEl.querySelector('.tn') || {}).textContent || '') : null,
      hasDiagram: !!card.querySelector('.cot-si-diag .sil'),
      penRollColor: penColored ? penColored.style.color : null,
      chips: [...card.querySelectorAll('.cot-si-mod span:last-child')].map((c) => c.textContent.trim()),
    };
  });
}

async function runAll() {
  await ready();
  // ============================ PHASE A: card ================================
  await beginBattle();
  const shot = await landPlayerHit(8);
  if (!shot.ok) {
    failures.push({ where: 'phaseA', name: 'landPlayerHit', expected: 'hit', actual: shot.why });
  } else {
    const ev = shot.ev;
    notes.push(`A: payload kind=${ev.kind} dmg=${Math.round(ev.damage || 0)}/${Math.round(ev.dmgRoll || 0)} zone=${ev.zone} dist=${Math.round(ev.flightDistM)}m angle=${Math.round(ev.impactAngleDeg)}° armor=${Math.round(ev.nominalMm || 0)}->${Math.round(ev.effectiveMm || 0)} penRoll=${Math.round(ev.penRollMm || 0)} target=${ev.targetName} mods=${JSON.stringify(ev.modulesHit || [])}`);
    const card = await readCard();
    if (!card) {
      failures.push({ where: 'card', name: 'presence', expected: 'card in DOM after player hit', actual: 'missing' });
    } else {
      const R = Math.round;
      check('card', 'badge', classifyBadge(ev), card.badge);
      check('card', 'header damage', (ev.damage || 0) > 0 ? `−${R(ev.damage)}` : '0', card.hdrDmg);
      if (!card.sub.includes(ev.shellType)) failures.push({ where: 'card', name: 'shell type in sub', expected: ev.shellType, actual: card.sub });
      if (ev.targetName && !card.sub.includes(ev.targetName)) failures.push({ where: 'card', name: 'target in sub', expected: ev.targetName, actual: card.sub });
      check('card', 'Distance row', `${R(ev.flightDistM || 0)} m`, card.rows['Distance']);
      check('card', 'Angle row', `${R(ev.impactAngleDeg || 0)}°`, card.rows['Angle']);
      if (ev.kind === 'screen_pierce') {
        check('card', 'Armor row (screen)', (ev.physicalMm || 0) > 0 ? `${R(ev.physicalMm)} mm screen` : 'screen', card.rows['Armor']);
      } else {
        const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
        check('card', 'Armor row', hasArmor
          ? `${R(ev.nominalMm || 0)} → ${R(ev.effectiveMm || 0)} mm eff.`
          : ['optics', 'gun', 'gun_barrel', 'trackL', 'trackR'].includes(ev.zone) ? 'external — no armor' : '—',
        card.rows['Armor']);
        // INDEPENDENT nominal-pen recompute from the raw spec numbers
        const shells = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG.game.player.spec.gun.shells)));
        const sh = shells.find((s) => s.name === ev.shellName && s.type === ev.shellType) || shells.find((s) => s.type === ev.shellType);
        const nomPen = sh ? R(myPenAt(sh, ev.flightDistM || 0)) : 0;
        const roll = R(ev.penRollMm || 0);
        if (roll > 0 && nomPen > 0) {
          check('card', 'Pen roll row (roll / independent nominal)', `${roll} / ${nomPen} mm`, card.rows['Pen roll']);
          const dev = Math.abs(roll - nomPen) / nomPen;
          if (dev > 0.2501) failures.push({ where: 'sim', name: 'pen roll outside ±25% of nominal', expected: `within 25% of ${nomPen}`, actual: String(roll) });
        }
        // damage roll bounds vs raw spec dmg
        if (sh && (ev.dmgRoll || 0) > 0) {
          const dd = Math.abs(ev.dmgRoll - sh.dmg) / sh.dmg;
          if (dd > 0.2501) failures.push({ where: 'sim', name: 'damage roll outside ±25% of spec dmg', expected: `within 25% of ${sh.dmg}`, actual: String(R(ev.dmgRoll)) });
        }
        // effective-armor geometry sanity (informational unless absurd):
        if (hasArmor && (ev.impactAngleDeg || 0) >= 0) {
          const geo = (ev.nominalMm || 0) / Math.max(0.05, Math.cos((ev.impactAngleDeg || 0) * Math.PI / 180));
          notes.push(`A: eff sanity — payload eff ${R(ev.effectiveMm || 0)} vs pure-LOS ${geo.toFixed(1)} (normalization explains gaps)`);
          if ((ev.effectiveMm || 0) > geo * 1.6 + 30) failures.push({ where: 'sim', name: 'effective armor far above LOS geometry', expected: `<=~${(geo * 1.6 + 30).toFixed(0)}`, actual: String(R(ev.effectiveMm)) });
        }
      }
      check('card', 'Damage row', `${R(ev.damage || 0)} / ${R(ev.dmgRoll || 0)}`, card.rows['Damage']);
      check('card', 'Result row', ev.destroyed ? 'DESTROYED' : `${Math.max(0, R(ev.targetHpAfter || 0))} hp left`, card.rows['Result']);
      if (card.zone !== null) check('card', 'zone label', zoneLabel(ev.zone), card.zone);
      check('card', 'diagram present', true, card.hasDiagram);
      const wantChips = [
        ...(ev.modulesHit || []).map((m) => MODULE_LABEL[m.module] || m.module),
        ...(ev.crewHit || []).map((c) => CREW_LABEL[c] || c),
        ...(ev.fireStarted ? ['Fire'] : []),
      ];
      check('card', 'module chips', wantChips.join('|'), card.chips.join('|'));
      check('card', 'zone tank name', ev.targetName || '', (card.zoneTank || '').trim());
    }
    await page.evaluate(() => {
      const D = window.__DEBUG;
      if (D.rig && D.rig.exitSniper) D.rig.exitSniper();
    });
    await sleep(350);
    await page.screenshot({ path: `${outDir}/a_card_full.png` });
    await page.screenshot({ path: `${outDir}/a_card_crop.png`, clip: { x: 1920 - 330, y: 270, width: 330, height: 460 } });
  }

  // ==================== PHASE A2: staged incoming -> toast ===================
  const toastRes = await page.evaluate(async () => {
    const D = window.__DEBUG;
    const yieldTask = () => new Promise((r) => setTimeout(r, 0));
    const p = D.game.player;
    const hpBefore = p.combat.hp;
    const before = window.__CAP.hits.filter((h) => h.targetId === p.id).length;
    const ok = D.spawnKillShell();
    if (!ok) return { ok: false, why: 'no shell spawned' };
    p.combat.hp = hpBefore;
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
    failures.push({ where: 'toast', name: 'staging stayed non-lethal', expected: 'player alive', actual: 'player died' });
  } else if (!toastRes.toast) {
    failures.push({ where: 'toast', name: 'presence', expected: 'toast in DOM after incoming hit', actual: 'missing' });
  } else {
    const ev = toastRes.ev;
    const t = toastRes.toast;
    check('toast', 'dataset damage', Math.round(ev.damage || 0), t.dataset.damage);
    check('toast', 'dataset kind', ev.kind, t.dataset.kind);
    const dmgTok = (ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : classifyBadge(ev);
    if (!t.text.includes(dmgTok)) failures.push({ where: 'toast', name: 'damage text', expected: dmgTok, actual: t.text });
    if (ev.attackerName && !t.text.includes(ev.attackerName)) failures.push({ where: 'toast', name: 'attacker name', expected: ev.attackerName, actual: t.text });
    if (ev.shellType && !t.text.includes(ev.shellType)) failures.push({ where: 'toast', name: 'shell type', expected: ev.shellType, actual: t.text });
    if (ev.zone && !t.text.includes(zoneLabel(ev.zone))) failures.push({ where: 'toast', name: 'zone label', expected: zoneLabel(ev.zone), actual: t.text });
    for (const m of ev.modulesHit || []) {
      const want = MODULE_LABEL[m.module] || m.module;
      if (!t.text.includes(want)) failures.push({ where: 'toast', name: `module ${m.module}`, expected: want, actual: t.text });
    }
    notes.push(`A2: toast verified (dmg=${Math.round(ev.damage || 0)}, kind=${ev.kind}, zone=${ev.zone}, from=${ev.attackerName})`);
    await page.screenshot({ path: `${outDir}/a2_toast.png`, clip: { x: 0, y: 1080 - 452 - 160, width: 340, height: 200 } });
  }

  // ======================= PHASE B: kill-cam =================================
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
    const onset = await page.evaluate(() => ({ ...window.__ONSET }));
    const delta = onset.resultAt && onset.kcAt ? onset.kcAt - onset.resultAt : -1;
    notes.push(`B: LIVE killcam onset result->active ${delta.toFixed(0)} ms`);
    if (delta > 350) failures.push({ where: 'killcam', name: 'live onset dead air', expected: '<=350 ms', actual: `${delta.toFixed(0)} ms` });
    const ev = await page.evaluate(() => {
      const pid = window.__DEBUG.game.player.id;
      const l = window.__CAP.hits.filter((h) => h.targetId === pid && h.destroyed);
      return l[l.length - 1] || null;
    });
    if (!ev) { failures.push({ where: 'phaseB', name: 'lethal payload', expected: 'destroyed shell:hit on player', actual: 'none' }); throw new Error('no lethal payload'); }
    await sleep(700);
    await page.screenshot({ path: `${outDir}/b_flight.png` });
    const duringFlight = await page.evaluate(() => ({
      ended: !!window.__CAP.ended,
      reportShown: !!document.querySelector('.cot-si-stats.show'),
    }));
    if (duringFlight.ended) check('report-gate', 'report hidden during flight', false, duringFlight.reportShown);
    await page.keyboard.press('Space');
    await sleep(1300);
    check('killcam', 'skip advances flight->xray', 'xray', await page.evaluate(() => window.__DEBUG.killcam.phase));
    const kc = await page.evaluate(() => {
      const rows = {};
      for (const kv of document.querySelectorAll('.cot-kc-kv')) {
        rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim().replace(/\s+/g, ' ');
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
    if ((ev.nominalMm || 0) > 0) check('killcam', 'Armor row', `${R(ev.nominalMm)} → ${R(ev.effectiveMm || 0)} mm eff.`, kc.rows['Armor']);
    check('killcam', 'Damage row', `${R(ev.damage || 0)}`, kc.rows['Damage']);
    check('killcam', 'Zone row', zoneLabel(ev.zone), kc.rows['Zone']);
    // pen roll baseline INDEPENDENT recompute from the killer's spec
    const killerShells = await page.evaluate((aid) => {
      const D = window.__DEBUG;
      const k = D.game.tanks.find((t) => t.id === aid);
      return k ? JSON.parse(JSON.stringify(k.spec.gun.shells)) : null;
    }, ev.attackerId);
    if (killerShells && (ev.penRollMm || 0) > 0) {
      const sh = killerShells.find((s) => s.name === ev.shellName && s.type === ev.shellType) || killerShells.find((s) => s.type === ev.shellType);
      if (sh) {
        const nom = R(myPenAt(sh, ev.flightDistM || 0));
        check('killcam', 'Pen roll row (roll / independent nominal)', `${R(ev.penRollMm)} / ${nom} mm`, kc.rows['Pen roll']);
      }
    }
    if ((ev.damage || 0) > 0 && !kc.big.some((b) => b === `−${R(ev.damage)} HP`)) {
      failures.push({ where: 'killcam', name: 'x-ray −HP label', expected: `−${R(ev.damage)} HP`, actual: kc.big.join(',') || '(none)' });
    }
    for (const m of ev.modulesHit || []) {
      const want = (MODULE_LABEL[m.module] || m.module).replace('Fuel', 'Fuel Tank');
      if (!kc.labels.some((l) => l.toUpperCase().includes(want.toUpperCase()))) {
        failures.push({ where: 'killcam', name: `x-ray label ${m.module}`, expected: want, actual: kc.labels.join(' | ') || '(none)' });
      }
    }
    notes.push(`B: killcam title="${kc.title.trim().replace(/\s+/g, ' ')}" labels=${kc.labels.join(' | ')} big=${kc.big.join(',')}`);
    const fit = await page.evaluate(() => {
      const D = window.__DEBUG;
      const cam = D.camera;
      cam.updateMatrixWorld(true);
      const t = D.game.player;
      const dims = t.spec.dims;
      const hw = dims.widthM * 0.5;
      const hl = (dims.hullLengthM || dims.overallLengthM * 0.8) * 0.5;
      const hh = dims.heightM;
      const cy = Math.cos(t.state.yaw);
      const sy = Math.sin(t.state.yaw);
      const P = cam.projectionMatrix.elements;
      const V = cam.matrixWorldInverse.elements;
      let worst = 0;
      for (let i = 0; i < 8; i++) {
        const lx = i & 1 ? hw : -hw;
        const ly = i & 2 ? hh : 0;
        const lz = i & 4 ? hl : -hl;
        const x = t.state.pos.x + lx * cy + lz * sy;
        const y = t.state.pos.y + ly;
        const z = t.state.pos.z - lx * sy + lz * cy;
        const vx = V[0] * x + V[4] * y + V[8] * z + V[12];
        const vy = V[1] * x + V[5] * y + V[9] * z + V[13];
        const vz = V[2] * x + V[6] * y + V[10] * z + V[14];
        const cx = P[0] * vx + P[4] * vy + P[8] * vz + P[12];
        const cyy = P[1] * vx + P[5] * vy + P[9] * vz + P[13];
        const cw = P[3] * vx + P[7] * vy + P[11] * vz + P[15];
        worst = Math.max(worst, Math.abs(cx / cw), Math.abs(cyy / cw));
      }
      return +worst.toFixed(3);
    });
    notes.push(`B: x-ray framing worst |ndc| ${fit}`);
    if (fit > 0.95) failures.push({ where: 'killcam', name: 'x-ray hull framing', expected: 'corners inside ±0.95 NDC', actual: `worst ${fit}` });
    await page.screenshot({ path: `${outDir}/b_xray.png` });
    await page.keyboard.press('Space');
    await sleep(400);
    check('killcam', 'skip ends replay', 'null', String(await page.evaluate(() => window.__DEBUG.killcam.phase)));
    if (duringFlight.ended) {
      try { await page.waitForFunction('document.querySelector(".cot-si-stats.show") !== null', { timeout: 6000 }); } catch (_) { /* below */ }
      const after = await page.evaluate(() => {
        const stats = document.querySelector('.cot-si-stats.show');
        const roster = (window.__CAP.ended && window.__CAP.ended.roster) || null;
        return {
          reportShown: !!stats,
          banner: stats ? (stats.querySelector('.cot-si-ban') || {}).textContent : null,
          alliesAlive: roster ? roster.filter((r) => !r.isPlayer && r.team !== 'enemy' && r.alive !== false).length : -1,
        };
      });
      check('report-gate', 'report flushes after skip', true, after.reportShown);
      if (after.alliesAlive >= 0) {
        const want = after.alliesAlive > 0 ? 'YOU WERE DESTROYED' : 'DEFEAT';
        check('report-gate', `banner honest (${after.alliesAlive} allies alive)`, want, after.banner);
      }
      await sleep(400);
      await page.screenshot({ path: `${outDir}/b2_report_defeat.png` });
    }
  }

  // ======================= PHASE C: victory report ===========================
  await ready();
  await beginBattle();
  const shot2 = await landPlayerHit(8);
  if (!shot2.ok) notes.push('C: no player hit before slay — sparse report');
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.slayEnemies();
    D.fastForward(1.0);
  });
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
      tiles,
      dataset: { ...stats.dataset },
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
        modsRed: mine.reduce((a, h) => a + ((h.modulesHit || []).filter((m) => m.newState === 'red').length), 0),
      },
    };
  });
  check('report', 'banner', rep.result === 'victory' ? 'VICTORY' : rep.result === 'defeat' ? 'DEFEAT' : 'DRAW', rep.banner);
  check('report', 'Shots fired tile', rep.cap.fired, rep.tiles['Shots fired']);
  check('report', 'Shots hit tile', rep.cap.hits, rep.tiles['Shots hit']);
  check('report', 'Damage dealt tile', rep.cap.dealt, rep.tiles['Damage dealt']);
  check('report', 'Damage received tile', rep.cap.received, rep.tiles['Damage received']);
  check('report', 'Damage blocked tile', rep.cap.blocked, rep.tiles['Damage blocked']);
  check('report', 'Kills tile', rep.cap.kills, rep.tiles['Kills']);
  check('report', 'Modules destroyed tile', rep.cap.modsRed, rep.tiles['Modules destroyed']);
  const penRate = rep.cap.hits > 0 ? Math.round((rep.cap.pens / rep.cap.hits) * 100) : 0;
  check('report', 'Pen rate tile', `${penRate}%`, rep.tiles['Pen rate']);
  // econ reconciliation FROM THE VISIBLE TILES (the report's stated contract)
  const win = rep.result === 'victory';
  const tDealt = parseInt(rep.tiles['Damage dealt'] || '0', 10);
  const tBlocked = parseInt(rep.tiles['Damage blocked'] || '0', 10);
  const tHits = parseInt(rep.tiles['Shots hit'] || '0', 10);
  const tKills = parseInt(rep.tiles['Kills'] || '0', 10);
  const baseXp = Math.round(tDealt * 0.85 + tKills * 140 + tBlocked * 0.12 + tHits * 6);
  const wantXp = Math.round(baseXp * (win ? 1.5 : 1));
  const wantCr = Math.round(tDealt * 4.2 + tKills * 850 + tBlocked * 0.55) + (win ? 2500 : 0);
  check('report', 'XP strip reconciles with tiles', `+${wantXp.toLocaleString('en-US')}`, rep.xp);
  check('report', 'Credits strip reconciles with tiles', `+${wantCr.toLocaleString('en-US')}`, rep.credits);
  check('report', 'floating card cleared', false, rep.floatingCardLeft);
  check('report', 'toasts cleared', false, rep.toastLeft);
  check('report', 'roster allies', 4, rep.dataset.rosterAllies);
  check('report', 'roster enemies', 4, rep.dataset.rosterEnemies);
  await sleep(900);
  const layout = await page.evaluate(() => {
    const disp = (sel) => {
      const n = document.querySelector(sel);
      return n ? getComputedStyle(n).display : '(absent)';
    };
    const stats = document.querySelector('.cot-si-stats');
    const btn = document.querySelector('.cot-end button');
    const last = stats ? stats.lastElementChild : null;
    return {
      killfeed: disp('.cot-killfeed'), minimap: disp('.cot-minimap'), score: disp('.cot-top'), dmgPanel: disp('.cot-dp'),
      contentBottom: last ? last.getBoundingClientRect().bottom : -1,
      btnTop: btn ? btn.getBoundingClientRect().top : -1,
    };
  });
  for (const k of ['killfeed', 'minimap', 'score', 'dmgPanel']) check('report.layout', `${k} hidden`, 'none', layout[k]);
  if (layout.btnTop > 0 && layout.contentBottom > 0) {
    const gap = layout.btnTop - layout.contentBottom;
    if (gap < 8 || gap > 90) failures.push({ where: 'report.layout', name: 'footer pinned', expected: '8-90 px below content', actual: `${gap.toFixed(0)} px` });
    notes.push(`C: footer gap ${gap.toFixed(0)} px`);
  }
  await page.screenshot({ path: `${outDir}/c_report_victory.png` });
  notes.push(`C: caps=${JSON.stringify(rep.cap)} tiles=${JSON.stringify(rep.tiles)}`);
}

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
      if (attempts < 3) console.log(`[retry] attempt ${attempts} died — fresh page`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (attempts > 1) notes.push(`suite needed ${Math.min(attempts, 3)} attempt(s)`);

console.log('\n=== critic r6 killcam/shotinfo verification ===');
for (const n of notes) console.log('[note]', n);
if (errs.length) console.log('[console errors]', JSON.stringify(errs, null, 1));
if (!failures.length) {
  console.log('RESULT: ALL CHECKS PASSED — every rendered number matches the sim event payload.');
} else {
  console.log(`RESULT: ${failures.length} MISMATCH(ES):`);
  for (const f of failures) console.log(` [${f.where}] ${f.name}: expected="${f.expected}" actual="${f.actual}"`);
  process.exitCode = 1;
}
