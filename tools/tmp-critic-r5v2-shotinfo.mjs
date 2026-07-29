// TEMP r5 CRITIC probe (independent of tools/tmp-shotinfo-verify.mjs — delete after review).
// Adversarial checks: rendered TEXT vs raw bus payload (my own subscription),
// event vs LIVE SIM STATE (target hp), pen-roll physics, killcam row truth,
// ANY-KEY skip honesty (unbound key), onset dead-air, report tiles vs bus sums.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_r5_shotinfo');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5900 + Math.floor(Math.random() * 60), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 480000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
let page = null;
const errs = [];
async function freshPage() {
  if (page) { try { await page.close(); } catch (_) {} }
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const notes = [];
function check(where, name, expected, actual) {
  const ok = String(expected) === String(actual);
  if (!ok) failures.push({ where, name, expected: String(expected), actual: String(actual) });
  return ok;
}
// presentation transforms replicated from src/ui/shotInfo.js (label formatting only)
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
const MODULE_LABEL = { trackL: 'Track L', trackR: 'Track R', engine: 'Engine', fuelTank: 'Fuel', ammoRack: 'Ammo Rack', gun: 'Gun', radio: 'Radio', optics: 'Optics', turretRing: 'Turret Ring' };
const CREW_LABEL = { commander: 'Commander', gunner: 'Gunner', driver: 'Driver', loader: 'Loader' };
function classifyBadge(ev) {
  if (ev.kind === 'pen' || ev.kind === 'he_pen') return 'PENETRATION';
  if (ev.kind === 'ricochet') return 'RICOCHET';
  if (ev.kind === 'he_splash') return (ev.damage || 0) > 0 ? 'SPLASH' : 'NO DAMAGE';
  const crits = (ev.modulesHit && ev.modulesHit.length) || (ev.crewHit && ev.crewHit.length);
  if ((ev.damage || 0) <= 0 && crits) return 'MODULE ONLY';
  if (ev.kind === 'screen_pierce') return 'SCREEN — NO DAMAGE';
  if (ev.kind === 'era') return 'NON-PEN · ERA';
  if (ev.kind === 'spaced_absorb') return 'NON-PEN · SPACED';
  return 'NON-PEN';
}

async function ready() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
}
async function beginBattle() {
  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__CAP = { hits: [], fired: 0, kills: 0, ended: null };
    D.bus.on('shell:hit', (ev) => {
      const c = JSON.parse(JSON.stringify(ev));
      // live-state cross-check data snapshotted at event time
      const t = D.game.tankById.get(ev.targetId);
      c.__liveHp = t && t.combat ? t.combat.hp : null;
      const a = D.game.tankById.get(ev.attackerId);
      c.__attTgtDist = a && t ? Math.round(a.state.pos.distanceTo(t.state.pos)) : null;
      window.__CAP.hits.push(c);
    });
    D.bus.on('shell:fired', (p) => { if (p.isPlayer) window.__CAP.fired++; });
    D.bus.on('tank:destroyed', (p) => {
      const pid = D.game.player ? D.game.player.id : null;
      if (p.killerId === pid && p.id !== pid) window.__CAP.kills++;
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
    const mine = () => window.__CAP.hits.filter((h) => h.attackerId === pid && h.targetId !== pid);
    let aimed = null;
    for (let i = 0; i < 40 && !aimed; i++) {
      aimed = D.aimAtNearest();
      if (!aimed) { D.fastForward(1.5); await yieldTask(); }
    }
    if (!aimed) return { ok: false, why: 'no target after 60s sim' };
    for (let t = 0; t < tries; t++) {
      for (let s = 0; s < 30; s++) {
        const st = D.aimState();
        if (st && st.errMrad < 2.5 && st.reloadT <= 0) break;
        D.fastForward(0.25); await yieldTask();
      }
      const before = mine().length;
      D.flags.forceFire = true;
      for (let s = 0; s < 24 && mine().length === before; s++) { D.fastForward(0.25); await yieldTask(); }
      D.flags.forceFire = false;
      if (mine().length > before) return { ok: true, ev: mine()[mine().length - 1], pid };
      D.aimAtNearest(); await yieldTask();
    }
    return { ok: false, why: 'no hit landed' };
  }, maxTries);
}
async function readCard() {
  return await page.evaluate(() => {
    const card = document.querySelector('.cot-si-cardhost .cot-si-card');
    if (!card) return null;
    const rows = {};
    for (const kv of card.querySelectorAll('.cot-si-kv')) rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
    const zoneEl = card.querySelector('.cot-si-zone');
    return {
      dataset: { ...card.dataset },
      badge: (card.querySelector('.cot-si-badge') || {}).textContent?.trim(),
      hdrDmg: (card.querySelector('.cot-si-dmg') || {}).textContent?.trim(),
      sub: (card.querySelector('.cot-si-sub') || { textContent: '' }).textContent.trim().replace(/\s+/g, ' '),
      rows,
      zone: zoneEl ? zoneEl.childNodes[0].textContent.trim() : null,
      zoneTank: zoneEl ? ((zoneEl.querySelector('.tn') || {}).textContent || '').trim() : null,
      hasDiagram: !!card.querySelector('.cot-si-diag .sil'),
      chips: [...card.querySelectorAll('.cot-si-mod span:last-child')].map((c) => c.textContent.trim()),
    };
  });
}

async function run() {
  await ready();
  await beginBattle();

  // ===== PHASE 1: outgoing card vs raw payload + live sim state =====
  const shot = await landPlayerHit(8);
  if (!shot.ok) { failures.push({ where: 'phase1', name: 'landPlayerHit', expected: 'hit', actual: shot.why }); }
  else {
    const ev = shot.ev;
    notes.push(`p1 payload: kind=${ev.kind} dmg=${ev.damage} roll=${ev.dmgRoll} zone=${ev.zone} dist=${Math.round(ev.flightDistM)} ang=${Math.round(ev.impactAngleDeg)} nom=${ev.nominalMm} eff=${ev.effectiveMm} penRoll=${ev.penRollMm} tgt=${ev.targetName} hpAfter=${ev.targetHpAfter} liveHp=${ev.__liveHp} attTgtDist=${ev.__attTgtDist}`);
    const card = await readCard();
    if (!card) failures.push({ where: 'card', name: 'presence', expected: 'card rendered after player hit', actual: 'missing' });
    else {
      const R = Math.round;
      check('card', 'badge', classifyBadge(ev), card.badge);
      check('card', 'header dmg', (ev.damage || 0) > 0 ? `−${R(ev.damage)}` : '0', card.hdrDmg);
      check('card', 'Distance', `${R(ev.flightDistM || 0)} m`, card.rows['Distance']);
      check('card', 'Angle', `${R(ev.impactAngleDeg || 0)}°`, card.rows['Angle']);
      if (ev.kind !== 'screen_pierce' && ev.kind !== 'he_splash') {
        const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
        check('card', 'Armor', hasArmor ? `${R(ev.nominalMm || 0)}→${R(ev.effectiveMm || 0)} mm` : '—', card.rows['Armor']);
      }
      check('card', 'Damage', `${R(ev.damage || 0)} / ${R(ev.dmgRoll || 0)}`, card.rows['Damage']);
      check('card', 'Result', ev.destroyed ? 'DESTROYED' : `${Math.max(0, R(ev.targetHpAfter || 0))} hp left`, card.rows['Result']);
      if (card.zone !== null && ev.zone) check('card', 'zone label', zoneLabel(ev.zone), card.zone);
      check('card', 'target name under zone', ev.targetName || '', card.zoneTank);
      check('card', 'diagram present', true, card.hasDiagram);
      const wantChips = [...(ev.modulesHit || []).map((m) => MODULE_LABEL[m.module] || m.module), ...(ev.crewHit || []).map((c) => CREW_LABEL[c] || c), ...(ev.fireStarted ? ['Fire'] : [])];
      check('card', 'module chips', wantChips.join('|'), card.chips.join('|'));
      // pen roll row against INDEPENDENT recompute from attacker spec
      const spec = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG.game.player.spec.gun.shells)));
      const sh = spec.find((s) => s.name === ev.shellName && s.type === ev.shellType) || spec.find((s) => s.type === ev.shellType);
      const nomPen = sh ? R(penAt(sh, ev.flightDistM || 0)) : 0;
      const roll = R(ev.penRollMm || 0);
      if (roll > 0 && nomPen > 0 && card.rows['Pen roll']) {
        check('card', 'Pen roll row', `${roll} / ${nomPen} mm`, card.rows['Pen roll']);
        const dev = Math.abs(roll - nomPen) / nomPen;
        if (dev > 0.2501) failures.push({ where: 'sim', name: 'pen roll outside ±25%', expected: `<=25% of ${nomPen}`, actual: `${roll} (${(dev * 100).toFixed(1)}%)` });
      }
      // EVENT vs LIVE SIM: hp left printed must equal live target hp at event time
      if (!ev.destroyed && ev.__liveHp !== null) {
        const printed = Math.max(0, R(ev.targetHpAfter || 0));
        if (Math.abs(printed - ev.__liveHp) > 0.51) failures.push({ where: 'sim-truth', name: 'Result hp vs live tank hp', expected: String(ev.__liveHp), actual: String(printed) });
      }
      // distance sanity vs attacker->target range at event time
      if (ev.__attTgtDist !== null && Math.abs(ev.__attTgtDist - (ev.flightDistM || 0)) > 40) {
        failures.push({ where: 'sim-truth', name: 'flightDistM plausibility', expected: `~${ev.__attTgtDist} m (att->tgt)`, actual: `${R(ev.flightDistM)} m` });
      }
      // physics: effective >= nominal (any obliquity only ADDS LOS thickness)
      if ((ev.nominalMm || 0) > 0 && (ev.effectiveMm || 0) > 0 && R(ev.effectiveMm) < R(ev.nominalMm) - 1) {
        failures.push({ where: 'sim-truth', name: 'effective < nominal armor', expected: `>=${R(ev.nominalMm)}`, actual: String(R(ev.effectiveMm)) });
      }
    }
    await page.evaluate(() => { const D = window.__DEBUG; if (D.rig && D.rig.exitSniper) D.rig.exitSniper(); });
    await sleep(350);
    await page.screenshot({ path: `${outDir}/p1_card.png`, clip: { x: 1920 - 340, y: 240, width: 340, height: 480 } });
    await page.screenshot({ path: `${outDir}/p1_full.png` });
  }

  // ===== PHASE 2: incoming toast (staged non-lethal) =====
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
      D.fastForward(0.25); await yieldTask();
      if (window.__CAP.hits.filter((h) => h.targetId === p.id).length > before) break;
    }
    const inc = window.__CAP.hits.filter((h) => h.targetId === p.id);
    if (inc.length === before) return { ok: false, why: 'staged shell never hit' };
    const ev = inc[inc.length - 1];
    const t = document.querySelector('.cot-si-toasthost .cot-si-toast:last-child');
    return { ok: true, ev, dead: p.combat.destroyed, toast: t ? { dataset: { ...t.dataset }, text: t.textContent.trim().replace(/\s+/g, ' ') } : null };
  });
  if (!toastRes.ok) failures.push({ where: 'toast', name: 'staged hit', expected: 'incoming hit', actual: toastRes.why });
  else if (toastRes.dead) failures.push({ where: 'toast', name: 'stayed non-lethal', expected: 'alive', actual: 'died' });
  else if (!toastRes.toast) failures.push({ where: 'toast', name: 'presence', expected: 'toast after incoming hit', actual: 'missing' });
  else {
    const ev = toastRes.ev; const t = toastRes.toast;
    check('toast', 'dataset damage', Math.round(ev.damage || 0), t.dataset.damage);
    const dmgTok = (ev.damage || 0) > 0 ? `−${Math.round(ev.damage)}` : classifyBadge(ev);
    if (!t.text.includes(dmgTok)) failures.push({ where: 'toast', name: 'damage text', expected: dmgTok, actual: t.text });
    if (ev.attackerName && !t.text.includes(ev.attackerName)) failures.push({ where: 'toast', name: 'attacker name', expected: ev.attackerName, actual: t.text });
    if (ev.zone && !t.text.includes(zoneLabel(ev.zone))) failures.push({ where: 'toast', name: 'zone', expected: zoneLabel(ev.zone), actual: t.text });
    notes.push(`toast: "${t.text}" (payload dmg=${ev.damage} kind=${ev.kind})`);
    await page.screenshot({ path: `${outDir}/p2_toast.png`, clip: { x: 0, y: 1080 - 620, width: 360, height: 220 } });
  }

  // ===== PHASE 3: killcam truth + pacing + ANY-KEY honesty =====
  const spawned = await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__ONSET = { deadAt: 0, kcAt: 0 };
    const poll = () => {
      if (D.game.player.combat.destroyed && !window.__ONSET.deadAt) window.__ONSET.deadAt = performance.now();
      if (D.killcam.isActive() && !window.__ONSET.kcAt) { window.__ONSET.kcAt = performance.now(); return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    return D.spawnKillShell();
  });
  if (!spawned) failures.push({ where: 'killcam', name: 'spawnKillShell', expected: 'true', actual: 'false' });
  else {
    await page.waitForFunction('window.__DEBUG.killcam.phase !== null', { timeout: 15000 });
    const onset = await page.evaluate(() => ({ ...window.__ONSET }));
    const delta = onset.deadAt && onset.kcAt ? onset.kcAt - onset.deadAt : (onset.kcAt ? 0 : -1);
    notes.push(`killcam onset: player death -> replay active = ${delta.toFixed(0)} ms`);
    if (delta > 400) failures.push({ where: 'killcam', name: 'onset dead air', expected: '<=400ms', actual: `${delta.toFixed(0)}ms` });
    const ev = await page.evaluate(() => {
      const pid = window.__DEBUG.game.player.id;
      const l = window.__CAP.hits.filter((h) => h.targetId === pid && h.destroyed);
      return l[l.length - 1] || null;
    });
    if (!ev) { failures.push({ where: 'killcam', name: 'lethal payload', expected: 'captured', actual: 'none' }); }
    else {
      // ANY-KEY honesty: press an unbound key (KeyJ) while still IN FLIGHT
      const phNow = await page.evaluate(() => window.__DEBUG.killcam.phase);
      if (phNow === 'flight') {
        await page.keyboard.press('KeyJ');
        await sleep(1400); // labels animate in
        const ph1 = await page.evaluate(() => window.__DEBUG.killcam.phase);
        check('killcam', 'ANY KEY (KeyJ) advances flight->xray', 'xray', ph1);
      } else {
        // flight already over (timing) — measure natural transition instead
        await page.waitForFunction('window.__DEBUG.killcam.phase === "xray"', { timeout: 6000 });
        notes.push('flight phase elapsed naturally before keypress; xray reached on its own');
        await sleep(1400);
      }
      await page.screenshot({ path: `${outDir}/p3_flight.png` });
      const kc = await page.evaluate(() => {
        const rows = {};
        for (const kv of document.querySelectorAll('.cot-kc-kv')) rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim();
        return {
          rows,
          title: (document.querySelector('.cot-kc-title') || {}).textContent || '',
          sub: (document.querySelector('.cot-kc-sub') || {}).textContent || '',
          labels: [...document.querySelectorAll('.cot-kc-label')].map((l) => l.textContent.trim().replace(/\s+/g, ' ')),
          big: [...document.querySelectorAll('.cot-kc-dmg')].map((l) => l.textContent.trim()),
        };
      });
      const R = Math.round;
      check('killcam', 'Distance', `${R(ev.flightDistM || 0)} m`, kc.rows['Distance']);
      check('killcam', 'Impact angle', `${R(ev.impactAngleDeg || 0)}°`, kc.rows['Impact angle']);
      if ((ev.nominalMm || 0) > 0) check('killcam', 'Armor', `${R(ev.nominalMm)} → ${R(ev.effectiveMm || 0)} mm`, kc.rows['Armor']);
      check('killcam', 'Damage', `${R(ev.damage || 0)}`, kc.rows['Damage']);
      if (ev.zone) check('killcam', 'Zone', zoneLabel(ev.zone), kc.rows['Zone']);
      // pen roll nominal on killcam card must reconcile with the KILLER's spec
      if ((ev.penRollMm || 0) > 0 && kc.rows['Pen roll']) {
        const killer = await page.evaluate((aid) => {
          const a = window.__DEBUG.game.tankById.get(aid);
          return a ? JSON.parse(JSON.stringify(a.spec.gun.shells)) : null;
        }, ev.attackerId);
        if (killer) {
          const ksh = killer.find((s) => s.name === ev.shellName && s.type === ev.shellType) || killer.find((s) => s.type === ev.shellType);
          const kNom = ksh ? R(penAt(ksh, ev.flightDistM || 0)) : 0;
          if (kNom > 0) check('killcam', 'Pen roll row', `${R(ev.penRollMm)} / ${kNom} mm`, kc.rows['Pen roll']);
        }
      }
      if ((ev.damage || 0) > 0 && !kc.big.some((b) => b === `−${R(ev.damage)} HP`)) {
        failures.push({ where: 'killcam', name: 'x-ray −HP label', expected: `−${R(ev.damage)} HP`, actual: kc.big.join(',') || '(none)' });
      }
      for (const m of ev.modulesHit || []) {
        const want = (MODULE_LABEL[m.module] || m.module).replace('Fuel', 'Fuel Tank');
        if (!kc.labels.some((l) => l.toUpperCase().includes(want.toUpperCase()))) failures.push({ where: 'killcam', name: `module label ${m.module}`, expected: want, actual: kc.labels.join(' | ') || '(none)' });
      }
      notes.push(`killcam lethal: kind=${ev.kind} dmg=${ev.damage} zone=${ev.zone} labels=[${kc.labels.join(' | ')}] title="${kc.title}" sub="${kc.sub}"`);
      await page.screenshot({ path: `${outDir}/p3_xray.png` });
      // skip out
      await page.keyboard.press('Space');
      await sleep(500);
      check('killcam', 'second key ends replay', 'null', String(await page.evaluate(() => window.__DEBUG.killcam.phase)));
      // defeat report only flushes if the battle actually ENDED with the death;
      // with living allies the battle continues (spectator handoff) — verify
      // whichever branch the sim took.
      const endedNow = await page.evaluate(() => !!window.__CAP.ended);
      if (endedNow) {
        try { await page.waitForFunction('document.querySelector(".cot-si-stats.show") !== null', { timeout: 6000 }); } catch (_) {}
        const rep = await page.evaluate(() => {
          const s = document.querySelector('.cot-si-stats.show');
          return { shown: !!s, banner: s ? (s.querySelector('.cot-si-ban') || {}).textContent : null };
        });
        check('killcam', 'report flushes after death replay', true, rep.shown);
        notes.push(`post-death banner: ${rep.banner}`);
      } else {
        const spect = await page.evaluate(() => ({
          alive: !window.__DEBUG.game.player.combat.destroyed,
          reportShown: !!document.querySelector('.cot-si-stats.show'),
        }));
        check('killcam', 'no premature report while battle continues', false, spect.reportShown);
        notes.push('death with living allies: battle continues (spectator handoff), report deferred — correct');
      }
      await sleep(400);
      await page.screenshot({ path: `${outDir}/p3_death_report.png` });
    }
  }

  // ===== PHASE 4: victory report tiles vs bus sums =====
  await ready();
  await beginBattle();
  const s2 = await landPlayerHit(8);
  if (!s2.ok) notes.push('p4: no pre-slay player hit; report sparse');
  await page.evaluate(() => { window.__DEBUG.slayEnemies(); window.__DEBUG.fastForward(1.0); });
  for (let i = 0; i < 4; i++) {
    const ph = await page.evaluate(() => window.__DEBUG.killcam.phase);
    if (ph === null) break;
    await page.keyboard.press('Space');
    await sleep(500);
  }
  await page.waitForFunction('document.querySelector(".cot-si-stats.show") !== null', { timeout: 15000 });
  await sleep(500);
  const rep = await page.evaluate(() => {
    const D = window.__DEBUG;
    const pid = D.game.player.id;
    const cap = window.__CAP;
    const mine = cap.hits.filter((h) => h.attackerId === pid && h.targetId !== pid);
    const inc = cap.hits.filter((h) => h.targetId === pid);
    const stats = document.querySelector('.cot-si-stats');
    const tiles = {};
    for (const s of stats.querySelectorAll('.cot-si-stat')) tiles[s.querySelector('.k').textContent.trim()] = s.querySelector('.v').textContent.trim();
    return {
      result: D.game.result, tiles, banner: (stats.querySelector('.cot-si-ban') || {}).textContent,
      credits: (stats.querySelector('.cot-si-ecoitem.cr .ev') || {}).textContent,
      xp: (stats.querySelector('.cot-si-ecoitem.xp .ev') || {}).textContent,
      rosterRows: stats.querySelectorAll('.cot-si-kill').length,
      timeline: !!stats.querySelector('.cot-si-tlwrap'),
      cap: {
        fired: cap.fired, hits: mine.length,
        pens: mine.filter((h) => h.kind === 'pen' || h.kind === 'he_pen').length,
        dealt: Math.round(mine.reduce((a, h) => a + (h.damage || 0), 0)),
        received: Math.round(inc.reduce((a, h) => a + (h.damage || 0), 0)),
        blocked: Math.round(inc.filter((h) => (h.damage || 0) <= 0 && ['ricochet', 'nonpen', 'spaced_absorb', 'era'].includes(h.kind)).reduce((a, h) => a + (h.dmgRoll || 0), 0)),
        kills: cap.kills,
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
  const penRate = rep.cap.hits > 0 ? Math.round((rep.cap.pens / rep.cap.hits) * 100) : 0;
  check('report', 'Pen rate tile', `${penRate}%`, rep.tiles['Pen rate']);
  notes.push(`report tiles: ${JSON.stringify(rep.tiles)} econ: xp=${rep.xp} cr=${rep.credits} rosterRows=${rep.rosterRows} timeline=${rep.timeline}`);
  await page.screenshot({ path: `${outDir}/p4_report.png` });
}

let attempts = 0;
try {
  for (attempts = 1; attempts <= 3; attempts++) {
    failures.length = 0; notes.length = 0; errs.length = 0;
    try { await freshPage(); await run(); break; }
    catch (e) {
      failures.push({ where: 'harness', name: 'exception', expected: 'clean run', actual: String(e && e.stack || e).slice(0, 400) });
      if (attempts < 3) console.log(`[retry] attempt ${attempts}: ${String(e).slice(0, 120)}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log('\n=== CRITIC r5 shotinfo verification ===');
for (const n of notes) console.log('[note]', n);
if (errs.length) console.log('[console errors]', JSON.stringify(errs));
if (!failures.length) console.log('RESULT: ALL CHECKS PASSED');
else {
  console.log(`RESULT: ${failures.length} FAILURE(S):`);
  for (const f of failures) console.log(` [${f.where}] ${f.name}: expected="${f.expected}" actual="${f.actual}"`);
  process.exitCode = 1;
}
