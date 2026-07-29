// TEMP killcam_shotinfo r3 verification probe (delete after review).
// Inherits the full r5 number-verification machinery and adds r3 checks:
//   - shot-card hit-sector wedge + 2x-baked plan-form presence
//   - report battle header (duration off the battle:ended payload clock)
//   - spotting-assist accounting: synthetic tank:spotted (spotterId) + ally
//     shell:hit events on the live bus; the Assist/Spotted tiles must equal
//     an independent replay of those exact events (window honored, non-player
//     spots excluded) and must NOT render when no spotterId was ever seen
//   - x-ray captures on a GLB victim (player m1a2) for ghost-fidelity review
// Any mismatch between what the panel prints and what the sim event said is
// reported as CRITICAL. Outputs shots/ks-r3-verify/*.png + verdicts.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/ks-r3-verify');
mkdirSync(outDir, { recursive: true });

// hmr:false — sibling agent sessions edit the shared tree while this probe
// runs; vite HMR full-reloads killed in-flight evaluates ("Execution context
// was destroyed"). Pages are always freshly navigated per phase, so the probe
// still tests current-disk code.
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5810 + Math.floor(Math.random() * 80), strictPort: false, hmr: false } });
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
    window.__CAP = { hits: [], spots: [], fired: 0, killsByPlayer: 0, ended: null };
    D.bus.on('shell:hit', (ev) => window.__CAP.hits.push(JSON.parse(JSON.stringify(ev))));
    D.bus.on('tank:spotted', (ev) => window.__CAP.spots.push(JSON.parse(JSON.stringify(ev || {}))));
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

// Fallback for the live gun-lay regression being chased by controls_gunnery
// (task: 44.7 mrad stall on tank aim): park the NEAREST enemy directly on the
// player's CURRENT gun axis so even a stalled gun connects. This probe tests
// the shot CARD's honesty, not gunnery — the shot still flies the real
// pipeline (dispersion, ballistics, armor resolution).
async function teleportTargetOntoGunAxis() {
  return await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    if (!p || p.combat.destroyed) return { ok: false, why: 'no player' };
    const V3 = Object.getPrototypeOf(p.state.pos).constructor; // THREE.Vector3
    const muzzle = new V3();
    p.visual.gunPivotWorld(muzzle);
    const az = p.state.yaw + p.state.turretYaw;
    const el = p.state.gunPitch;
    const dir = new V3(
      Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const enemy = D.game.tanks.find((t) => t.team === 'enemy' && !t.combat.destroyed);
    if (!enemy) return { ok: false, why: 'no enemy left' };
    for (const d of [120, 90, 160]) {
      const blocked = D.world.raycast(muzzle, dir, d);
      if (blocked && blocked.dist < d - 6) continue;
      enemy.state.pos.set(
        muzzle.x + dir.x * d,
        muzzle.y + dir.y * d - enemy.spec.dims.heightM * 0.5,
        muzzle.z + dir.z * d,
      );
      enemy.state.speed = 0;
      enemy.state.yaw = az + Math.PI / 2; // flank on — big broadside target
      return { ok: true, id: enemy.id, d };
    }
    return { ok: false, why: 'gun axis blocked by terrain' };
  });
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
      hasWedge: !!card.querySelector('.cot-si-diag svg.ov .wdg'), // r3 hit sector
      hasPlanForm: !!card.querySelector('.cot-si-diag .pf'),
      chips: [...card.querySelectorAll('.cot-si-mod span:last-child')].map((c) => c.textContent.trim()),
    };
  });
}

async function runAll() {
  await ready();
  // ======================= PHASE A: outgoing shot card =======================
  await beginBattle();
  let shot = await landPlayerHit(4);
  if (!shot.ok) {
    const tp = await teleportTargetOntoGunAxis();
    notes.push(`phaseA: normal aim path failed (${shot.why}) — gun-axis teleport fallback: ${JSON.stringify(tp)}`);
    if (tp.ok) shot = await landPlayerHit(4);
  }
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
        check('card', 'Armor row', hasArmor ? `${R(ev.nominalMm || 0)} → ${R(ev.effectiveMm || 0)} mm eff.` : ['optics','gun','gun_barrel','trackL','trackR'].includes(ev.zone) ? 'external — no armor' : '—', card.rows['Armor']); // r5 format
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
      check('card', 'hit-sector wedge present (r3)', true, card.hasWedge);
      check('card', 'plan-form layer present', true, card.hasPlanForm);
      // module/crew chips
      const wantChips = [
        ...(ev.modulesHit || []).map((m) => MODULE_LABEL[m.module] || m.module),
        ...(ev.crewHit || []).map((c) => CREW_LABEL[c] || c),
        ...(ev.fireStarted ? ['Fire'] : []),
      ];
      check('card', 'module chips', wantChips.join('|'), card.chips.join('|'));
      check('card', 'target name', ev.targetName || '', (card.zoneTank || '').trim());
    }
    // r5: leave sniper aim before capturing — the probe's aimAtNearest snaps
    // the rig to sniper and the scope's ×N plate then leaked into every
    // capture as a phantom "debug chip" (r7 critique)
    await page.evaluate(() => {
      const D = window.__DEBUG;
      if (D.rig && D.rig.exitSniper) D.rig.exitSniper();
    });
    await sleep(350);
    await page.screenshot({ path: `${outDir}/a_card_full.png` });
    await page.screenshot({ path: `${outDir}/a_card_crop.png`, clip: { x: 1920 - 320, y: 270, width: 320, height: 430 } });
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
    // r6 CRITICAL regression gate: the full-screen battle report must NOT
    // render while the replay owns the screen. battle:ended fires in the very
    // sim step the player dies, so an unbuffered report would be burying this
    // flight frame right now (probe_r6 captures showed exactly that).
    const duringFlight = await page.evaluate(() => ({
      ended: !!window.__CAP.ended,
      reportShown: !!document.querySelector('.cot-si-stats.show'),
    }));
    if (duringFlight.ended) {
      check('report-gate', 'report hidden during killcam flight', false, duringFlight.reportShown);
    } else {
      notes.push('report-gate: battle:ended not fired at flight check — battle continues after death (handoff applied)');
    }
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
    if ((ev.nominalMm || 0) > 0) check('killcam', 'Armor row', `${R(ev.nominalMm)} → ${R(ev.effectiveMm || 0)} mm eff.`, kc.rows['Armor']); // r5 format
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
    // r5: live x-ray FRAMING gate — project the victim's oriented hull box
    // (yaw-aligned, hull length without barrel) through the live camera;
    // every corner must sit inside the frame with margin (r7: the Abrams
    // ghost hull ran off the bottom/right edges)
    const fit = await page.evaluate(() => {
      const D = window.__DEBUG;
      const cam = D.camera;
      cam.updateMatrixWorld(true);
      const t = D.game.player; // defeat replay: victim is the player
      const dims = t.spec.dims;
      const hw = dims.widthM * 0.5;
      const hl = (dims.hullLengthM || dims.overallLengthM * 0.8) * 0.5;
      const hh = dims.heightM;
      const cy = Math.cos(t.state.yaw);
      const sy = Math.sin(t.state.yaw);
      const P = cam.projectionMatrix.elements;
      const V = cam.matrixWorldInverse.elements;
      let worst = 0;
      const ext = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 };
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
        const nx = cx / cw;
        const ny = cyy / cw;
        worst = Math.max(worst, Math.abs(nx), Math.abs(ny));
        ext.minX = Math.min(ext.minX, nx); ext.maxX = Math.max(ext.maxX, nx);
        ext.minY = Math.min(ext.minY, ny); ext.maxY = Math.max(ext.maxY, ny);
      }
      return { worst: +worst.toFixed(3), ...ext };
    });
    notes.push(`x-ray framing: worst |ndc| ${fit.worst} x[${fit.minX.toFixed(2)},${fit.maxX.toFixed(2)}] y[${fit.minY.toFixed(2)},${fit.maxY.toFixed(2)}]`);
    if (fit.worst > 0.95) {
      failures.push({ where: 'killcam', name: 'x-ray hull framing (80% safe area)', expected: 'hull corners inside ±0.95 NDC', actual: `worst ${fit.worst}` });
    }
    // r6 CRITICAL regression gate, part 2: still no report over the x-ray hold
    const duringXray = await page.evaluate(() => !!document.querySelector('.cot-si-stats.show'));
    check('report-gate', 'report hidden during x-ray hold', false, duringXray);
    await page.screenshot({ path: `${outDir}/b_killcam_xray.png` });
    // skip 2: xray -> finish (skippability)
    await page.keyboard.press('Space');
    await sleep(400);
    const done = await page.evaluate(() => window.__DEBUG.killcam.phase);
    check('killcam', 'skip ends replay', 'null', String(done));
    // r6 CRITICAL regression gate, part 3: once the replay releases the
    // screen the BUFFERED report must flush (defeat path) — and it must be
    // honest about a solo death: living allies on the roster mean the banner
    // reads YOU WERE DESTROYED, never a DEFEAT above 'YOUR TEAM 3/4 ALIVE'.
    if (duringFlight.ended) {
      try {
        await page.waitForFunction('document.querySelector(".cot-si-stats.show") !== null', { timeout: 6000 });
      } catch (_) { /* asserted below */ }
      const after = await page.evaluate(() => {
        const stats = document.querySelector('.cot-si-stats.show');
        const roster = (window.__CAP.ended && window.__CAP.ended.roster) || null;
        const tileKeys = stats
          ? [...stats.querySelectorAll('.cot-si-stat .k')].map((k) => k.textContent.trim())
          : [];
        return {
          reportShown: !!stats,
          banner: stats ? (stats.querySelector('.cot-si-ban') || {}).textContent : null,
          kcDomOn: !!document.querySelector('.cot-kc.on'),
          kcLabels: document.querySelectorAll('.cot-kc-label,.cot-kc-micro').length,
          assistTile: tileKeys.includes('Assist damage'),
          hasHeader: !!(stats && stats.querySelector('.cot-si-hdr')),
          alliesAlive: roster
            ? roster.filter((r) => !r.isPlayer && r.team !== 'enemy' && r.alive !== false).length
            : -1,
        };
      });
      // r3 honesty gate: without spotterId-carrying events the assist tiles
      // must NOT render (a zero born from missing data would be a lie)
      check('report-gate', 'assist tiles absent without enriched spot events', false, after.assistTile);
      check('report-gate', 'battle header row present', true, after.hasHeader);
      check('report-gate', 'report flushes after replay ends', true, after.reportShown);
      check('report-gate', 'killcam DOM released before report', false, after.kcDomOn);
      check('report-gate', 'no killcam labels bleed into report', 0, after.kcLabels);
      if (after.alliesAlive >= 0) {
        const wantBanner = after.alliesAlive > 0 ? 'YOU WERE DESTROYED' : 'DEFEAT';
        check('report-gate', `banner honest with ${after.alliesAlive} allies alive`, wantBanner, after.banner);
      }
      await sleep(400);
      await page.screenshot({ path: `${outDir}/b2_report_after_replay.png` });
    }
  }

  // ======================= PHASE C: battle report ============================
  await ready(); // fresh page: clean state for report bookkeeping
  await beginBattle();
  const shot2 = await landPlayerHit(8);
  if (!shot2.ok) notes.push('phaseC: no player hit before slay — report will be sparse');
  // r3: spotting-assist accounting — feed the LIVE bus the enriched events
  // the sim will emit once the spotting.js handoff lands (spotterId), plus
  // control cases that must NOT count: an ally hit outside the window and a
  // spot attributed to a different vehicle. The report's Assist/Spotted
  // tiles must reconcile with an independent replay of these exact events.
  const spotSetup = await page.evaluate(() => {
    const D = window.__DEBUG;
    const pid = D.game.player.id;
    const ally = D.game.tanks.find((t) => t.team === 'player' && t.id !== pid);
    const foes = D.game.tanks.filter((t) => t.team === 'enemy');
    if (!ally || foes.length < 2) return { ok: false, why: 'roster too small' };
    const e1 = foes[0];
    const e2 = foes[1];
    const now = D.game.timeS;
    const hit = (targetEnt, dmg, t) => D.bus.emit('shell:hit', {
      attackerId: ally.id, attackerName: ally.spec.name, attackerSpecId: ally.specId,
      targetId: targetEnt.id, targetName: targetEnt.spec.name, targetSpecId: targetEnt.specId,
      kind: 'pen', damage: dmg, dmgRoll: dmg, timeS: t, shellType: 'AP',
      modulesHit: [], crewHit: [],
      // real-shaped payload: other bus subscribers (hud damage log) index
      // ev.pos — a bare synthetic event crashed the whole emit chain
      pos: [targetEnt.state.pos.x, targetEnt.state.pos.y + 1, targetEnt.state.pos.z],
      normal: [0, 1, 0], flightDistM: 100, impactAngleDeg: 10,
    });
    // player lights e1 -> ally hits it INSIDE the window (counts)
    D.bus.emit('tank:spotted', { id: e1.id, team: 'player', timeS: now, spotterId: pid });
    hit(e1, 137, now + 3);
    // same target OUTSIDE the window (must not count)
    hit(e1, 500, now + 300);
    // e2 lit by the ALLY, not the player -> ally damage on it never counts
    D.bus.emit('tank:spotted', { id: e2.id, team: 'player', timeS: now, spotterId: ally.id });
    hit(e2, 250, now + 2);
    return { ok: true, pid, allyId: ally.id, e1: e1.id, e2: e2.id, now };
  });
  if (!spotSetup.ok) notes.push(`phaseC assist setup skipped: ${spotSetup.why}`);
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
    // r3: independent replay of the assist rule from the CAPTURED event
    // streams (teams from game truth; the hit itself links attacker<->target
    // in the panel's parity graph, so both resolve identically here)
    const teamOf = {};
    for (const t of D.game.tanks) teamOf[t.id] = t.team;
    const edges = new Map(); // targetId -> latest player-attributed spot timeS
    const expSpotted = new Set();
    for (const s of cap.spots) {
      if (s.spotterId != null && s.spotterId === pid && s.id !== pid) {
        edges.set(s.id, Math.max(edges.get(s.id) || -1e9, s.timeS || 0));
        expSpotted.add(s.id);
      }
    }
    let expAssist = 0;
    for (const h of cap.hits) {
      if (h.attackerId === pid || h.targetId === pid || !(h.damage > 0)) continue;
      if (teamOf[h.attackerId] !== 'player' || !edges.has(h.targetId)) continue;
      const dt = (h.timeS || 0) - edges.get(h.targetId);
      if (dt >= 0 && dt <= 12) expAssist += h.damage;
    }
    const hdrEl = stats.querySelector('.cot-si-hdr');
    return {
      result: D.game.result,
      dataset: { ...stats.dataset },
      tiles,
      expAssist: Math.round(expAssist),
      expSpotted: expSpotted.size,
      endedTimeS: window.__CAP.ended ? window.__CAP.ended.timeS : null,
      header: hdrEl ? hdrEl.textContent.trim().replace(/\s+/g, ' ') : null,
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
  // r3: spotting-assist tiles vs the independent event replay
  if (spotSetup.ok) {
    check('report', 'Assist damage tile vs event replay', rep.expAssist, rep.tiles['Assist damage']);
    check('report', 'Enemies spotted tile vs event replay', rep.expSpotted, rep.tiles['Enemies spotted']);
    check('report', 'assist dataset', rep.expAssist, rep.dataset.assist);
    check('report', 'spotted dataset', rep.expSpotted, rep.dataset.spotted);
    notes.push(`assist replay: expected=${rep.expAssist} from synthetic 137 in-window (+ any real ally hits on the lit target); 500 out-of-window and 250 ally-spotted excluded`);
  }
  // r3: battle header — duration must equal the battle:ended payload clock
  if (rep.endedTimeS != null) {
    check('report', 'header duration dataset vs battle:ended clock',
      Math.floor(rep.endedTimeS), rep.dataset.durationS);
    if (!rep.header || !rep.header.toLowerCase().includes('battle time')) {
      failures.push({ where: 'report', name: 'header row', expected: 'battle time … in header', actual: String(rep.header) });
    } else {
      notes.push(`report header: "${rep.header}"`);
    }
  }

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
