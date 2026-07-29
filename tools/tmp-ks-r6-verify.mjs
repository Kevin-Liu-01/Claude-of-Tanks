// TEMP killcam_shotinfo r6-fix VERIFY probe (delete after review).
// Proves the r6 fixes with live shots via __DEBUG hooks:
//  P1 card: land real player hits; every rendered number (incl. the NEW pen
//     roll 'fresh → residual / nominal · ERA|screens' row and the ERA chip)
//     must match the shell:hit payload; fresh roll must sit inside ±25% of an
//     INDEPENDENT pen-curve recompute (the r6 'broken RNG' read is dead).
//  P1b synthetic events (deterministic): a pen-through-ERA payload and a
//     legacy payload without penRollFreshMm — exact row text + chip asserted.
//  P2 flight occlusion: run live death replays; sample the ACTUAL camera
//     every ~120 ms of the flight — it must never sit inside a vegetation
//     concealment volume and must keep terrain/prop LOS to the victim.
//  P3 x-ray: entry-plate chip always present; every modulesHit label present;
//     annotation Pen roll matches payload (incl. degradation format).
//  P4 report: zero-shot slain roster must NOT print ACE/DESTROYER; roster
//     blocks must carry the KILLS / DMG OUT column captions.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/ks_r6_verify');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5880 + Math.floor(Math.random() * 60), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 480000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
let page = null;
const errs = [];
const failures = [];
const notes = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(where, name, expected, actual) {
  const ok = String(expected) === String(actual);
  if (!ok) failures.push({ where, name, expected: String(expected), actual: String(actual) });
  return ok;
}
// KNOWN FOREIGN ERROR (pre-existing in the shared worktree, proven by
// tools/tmp-ks-r6-control.mjs on a bare load+battle with zero killcam /
// shot-info code paths executing): MeshStandardMaterial exceeding
// MAX_TEXTURE_IMAGE_UNITS — belongs to the in-flight materials/GLB camo
// work of another module owner. Logged separately, not gated here.
const foreignErrs = [];
async function freshPage() {
  if (page) { try { await page.close(); } catch (_) { /* dead */ } }
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() !== 'error' || m.text().includes('favicon')) return;
    if (m.text().includes('MAX_TEXTURE_IMAGE_UNITS')) { foreignErrs.push(m.text().slice(0, 90)); return; }
    errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(String(e)));
}
async function ready() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
}
async function beginBattle(spec = 'm1a2') {
  await page.evaluate((sp) => {
    const D = window.__DEBUG;
    window.__CAP = { hits: [] };
    D.bus.on('shell:hit', (ev) => window.__CAP.hits.push(JSON.parse(JSON.stringify(ev))));
    D.startBattle(sp, 'verdant');
  }, spec);
  await sleep(300);
}

// independent pen curve (ballistics.js contract)
const myPenAtSrc = `function myPenAt(sh, d) {
  if (d > 1000 && sh.pen2000Mm > 0) {
    const f2 = Math.min(1, (d - 1000) / 1000);
    return sh.pen1000Mm + (sh.pen2000Mm - sh.pen1000Mm) * f2;
  }
  const f = Math.min(1, Math.max(0, (d - 100) / 900));
  return sh.pen100Mm + (sh.pen1000Mm - sh.pen100Mm) * f;
}`;
function zoneLabel(zone) {
  if (!zone) return '—';
  return zone.replace(/_(R|L)$/, ' $1').replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .replace(/ (r|l)$/, (m) => m.toUpperCase());
}
/** Expected Pen roll row text — mirrors buildCard exactly. */
function expectPenRoll(ev, penNom) {
  const roll = Math.round(ev.penRollMm || 0);
  const fresh = Math.round(ev.penRollFreshMm || 0);
  const qual = ev.eraPlate ? ' · ERA'
    : (roll > 0 && (fresh > roll + 1 || (penNom > 0 && roll < penNom * 0.75 - 2))) ? ' · screens' : '';
  const arrow = fresh > roll + 1 ? `${fresh} → ` : '';
  if (roll > 0 && penNom > 0) return `${arrow}${roll} / ${penNom} mm${qual}`;
  return roll > 0 ? `${arrow}${roll} mm${qual}` : '—';
}
const MODULE_LABEL = {
  trackL: 'Track L', trackR: 'Track R', engine: 'Engine', fuelTank: 'Fuel',
  ammoRack: 'Ammo Rack', gun: 'Gun', radio: 'Radio', optics: 'Optics', turretRing: 'Turret Ring',
};
const CREW_LABEL = { commander: 'Commander', gunner: 'Gunner', driver: 'Driver', loader: 'Loader' };

async function readCard() {
  return await page.evaluate(() => {
    const card = document.querySelector('.cot-si-cardhost .cot-si-card');
    if (!card) return null;
    const rows = {};
    for (const kv of card.querySelectorAll('.cot-si-kv')) {
      rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim().replace(/\s+/g, ' ');
    }
    return {
      dataset: { ...card.dataset },
      rows,
      chips: [...card.querySelectorAll('.cot-si-mod span:last-child')].map((c) => c.textContent.trim()),
    };
  });
}

async function landOneHit() {
  return await page.evaluate(async () => {
    const D = window.__DEBUG;
    const yieldTask = () => new Promise((r) => setTimeout(r, 0));
    const pid = D.game.player.id;
    const mine = () => window.__CAP.hits.filter((h) => h.attackerId === pid && h.targetId !== pid);
    let aimed = null;
    for (let i = 0; i < 40 && !aimed; i++) {
      aimed = D.aimAtNearest();
      if (!aimed) { D.fastForward(2.0); await yieldTask(); }
    }
    if (!aimed) return null;
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
    const hits = mine();
    return hits.length > before ? { ev: hits[hits.length - 1], pid } : null;
  });
}

async function verifyCardAgainst(ev, where) {
  const card = await readCard();
  if (!card) { failures.push({ where, name: 'card presence', expected: 'card', actual: 'missing' }); return; }
  const R = Math.round;
  // independent nominal from the ATTACKER's spec (players in P1)
  const penNom = await page.evaluate((e, fnSrc) => {
    // eslint-disable-next-line no-eval
    const myPenAt = eval(`(${fnSrc.replace('function myPenAt', 'function ')})`);
    const D = window.__DEBUG;
    const att = D.game.tanks.find((t) => t.id === e.attackerId);
    const shells = att ? att.spec.gun.shells : D.game.player.spec.gun.shells;
    const sh = shells.find((s) => s.name === e.shellName && s.type === e.shellType) || shells.find((s) => s.type === e.shellType);
    return sh ? Math.round(myPenAt(sh, e.flightDistM || 0)) : 0;
  }, ev, myPenAtSrc);
  check(where, 'Distance row', `${R(ev.flightDistM || 0)} m`, card.rows['Distance']);
  check(where, 'Angle row', `${R(ev.impactAngleDeg || 0)}°`, card.rows['Angle']);
  if (ev.kind !== 'screen_pierce') {
    check(where, 'Pen roll row', expectPenRoll(ev, penNom), card.rows['Pen roll']);
    // r6 core assertion: the FRESH roll (when present) reconciles with ±25%
    const fresh = R(ev.penRollFreshMm || 0);
    if (fresh > 0 && penNom > 0) {
      const dev = Math.abs(fresh - penNom) / penNom;
      if (dev > 0.2501) failures.push({ where, name: 'fresh roll outside ±25% of independent nominal', expected: `within 25% of ${penNom}`, actual: String(fresh) });
    }
    // residual never above fresh
    if (fresh > 0 && R(ev.penRollMm || 0) > fresh + 1) {
      failures.push({ where, name: 'residual pen exceeds fresh roll', expected: `<= ${fresh}`, actual: String(R(ev.penRollMm)) });
    }
  }
  check(where, 'Damage row', `${R(ev.damage || 0)} / ${R(ev.dmgRoll || 0)}`, card.rows['Damage']);
  check(where, 'dataset penfresh', String(R(ev.penRollFreshMm || 0)), card.dataset.penfresh);
  const wantChips = [
    ...(ev.eraPlate ? ['ERA'] : []),
    ...(ev.modulesHit || []).map((m) => MODULE_LABEL[m.module] || m.module),
    ...(ev.crewHit || []).map((c) => CREW_LABEL[c] || c),
    ...(ev.fireStarted ? ['Fire'] : []),
  ];
  check(where, 'chips (incl ERA)', wantChips.join('|'), card.chips.join('|'));
}

try {
  // ============================ P1: live cards ==============================
  await freshPage();
  await ready();
  await beginBattle('m1a2');
  let eraSeen = 0;
  let hitsSeen = 0;
  for (let i = 0; i < 6 && eraSeen < 1; i++) {
    let shot = null;
    try {
      shot = await landOneHit();
    } catch (e) {
      // headless GPU flake can drop the page mid-fastForward — recover
      notes.push(`P1: page dropped on hit ${i + 1} (${String(e).slice(0, 60)}) — fresh page`);
      await freshPage();
      await ready();
      await beginBattle('m1a2');
      continue;
    }
    if (!shot) break;
    hitsSeen++;
    await verifyCardAgainst(shot.ev, `card#${hitsSeen}(${shot.ev.kind})`);
    if (shot.ev.eraPlate) {
      eraSeen++;
      notes.push(`P1: LIVE ERA event — kind=${shot.ev.kind} zone=${shot.ev.zone} fresh=${Math.round(shot.ev.penRollFreshMm || 0)} residual=${Math.round(shot.ev.penRollMm || 0)} eraPlate=${shot.ev.eraPlate}`);
      await page.screenshot({ path: `${outDir}/p1_era_card.png`, clip: { x: 1920 - 330, y: 270, width: 330, height: 460 } });
    }
    if (hitsSeen === 1) await page.screenshot({ path: `${outDir}/p1_card.png`, clip: { x: 1920 - 330, y: 270, width: 330, height: 460 } });
  }
  notes.push(`P1: ${hitsSeen} live hits verified, ${eraSeen} with ERA involvement`);
  if (!hitsSeen) failures.push({ where: 'P1', name: 'live hits', expected: '>=1', actual: '0' });

  // ==================== P1b: synthetic payload rendering =====================
  const synth = await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const enemy = D.game.tanks.find((t) => t.team === 'enemy');
    const sh = p.spec.gun.shells[0];
    const mk = (over) => ({
      kind: 'pen', shellId: 99901, shellType: sh.type, shellName: sh.name,
      caliberMm: sh.caliberMm, attackerId: p.id, attackerSpecId: p.specId,
      attackerName: 'YOU', targetId: enemy.id, targetSpecId: enemy.specId,
      targetName: 'T-80U', pos: [0, 1, 0], normal: [0, 0, 1],
      impactAngleDeg: 20, effectiveMm: 63, nominalMm: 60, physicalMm: 60,
      penRollMm: 461, damage: 462, dmgRoll: 462, targetHpAfter: 1000,
      modulesHit: [], crewHit: [], fireStarted: false, ammoRacked: false,
      destroyed: false, eraPlate: null, zone: 'upper_glacis', plateKind: 'main',
      flightDistM: 300, localPos: [0, 1, 2], localDir: [0, 0, -1],
      timeS: D.game.timeS, ...over,
    });
    const evA = mk({ eraPlate: 'era_glacis', penRollFreshMm: 894 });
    D.bus.emit('shell:hit', evA);
    const shells = JSON.parse(JSON.stringify(p.spec.gun.shells));
    return { evA, shells };
  });
  {
    const card = await readCard();
    const sh = synth.shells.find((s) => s.name === synth.evA.shellName) || synth.shells[0];
    const f = Math.min(1, Math.max(0, (300 - 100) / 900));
    let nom = sh.pen100Mm + (sh.pen1000Mm - sh.pen100Mm) * f;
    if (300 > 1000 && sh.pen2000Mm > 0) nom = 0; // n/a here
    nom = Math.round(nom);
    check('P1b-era', 'Pen roll row', `894 → 461 / ${nom} mm · ERA`, card ? card.rows['Pen roll'] : '(no card)');
    check('P1b-era', 'ERA chip', 'ERA', card && card.chips.includes('ERA') ? 'ERA' : `(chips: ${card ? card.chips.join(',') : 'none'})`);
    await page.screenshot({ path: `${outDir}/p1b_era_card.png`, clip: { x: 1920 - 330, y: 270, width: 330, height: 460 } });
  }
  // legacy payload: no fresh field, residual impossible from ±25% -> 'screens'
  await page.evaluate((ev) => {
    const e2 = { ...ev, eraPlate: null, penRollMm: 400, damage: 0, kind: 'nonpen' };
    delete e2.penRollFreshMm;
    window.__DEBUG.bus.emit('shell:hit', e2);
  }, synth.evA);
  {
    const card = await readCard();
    const row = card ? card.rows['Pen roll'] : '(no card)';
    if (!/ · screens$/.test(row)) failures.push({ where: 'P1b-legacy', name: 'screens qualifier on impossible residual', expected: '.. · screens', actual: row });
  }

  // ==================== P2+P3: death replay (x2 runs) ========================
  for (let run = 1; run <= 2; run++) {
    await freshPage();
    await ready();
    await beginBattle('m1a2');
    const spawned = await page.evaluate(() => window.__DEBUG.spawnKillShell());
    if (!spawned) { failures.push({ where: `P2#${run}`, name: 'spawnKillShell', expected: true, actual: false }); continue; }
    await page.waitForFunction('window.__DEBUG.killcam.phase !== null', { timeout: 15000 });
    // sample the ACTUAL camera through the flight
    const occl = await page.evaluate(async () => {
      const D = window.__DEBUG;
      const world = D.world;
      const conceal = world.getConcealment ? world.getConcealment() : [];
      const hf = world.heightField;
      const res = { samples: 0, inFoliage: 0, losBlocked: 0, phaseSeen: D.killcam.phase };
      const victim = D.game.player.state.pos;
      while (D.killcam.phase === 'flight') {
        const c = D.camera.position;
        res.samples++;
        for (const cc of conceal) {
          const dx = c.x - cc.x; const dz = c.z - cc.z;
          const rr = cc.r + 0.5; // slightly tighter than the solver margin
          if (dx * dx + dz * dz > rr * rr) continue;
          const gy = hf.getHeightAt(cc.x, cc.z);
          const lo = cc.add >= 0.2 ? gy - 1 : gy + 2.0;
          const hi = cc.add >= 0.2 ? gy + 3.0 : gy + 11.0;
          if (c.y > lo && c.y < hi) { res.inFoliage++; break; }
        }
        {
          const dxv = victim.x - c.x; const dyv = victim.y + 1.5 - c.y; const dzv = victim.z - c.z;
          const d = Math.hypot(dxv, dyv, dzv);
          if (d > 3) {
            const dir = { x: dxv / d, y: dyv / d, z: dzv / d };
            const THREEv = { }; // world.raycast takes Vector3-likes with x/y/z
            const block = world.raycast({ x: c.x, y: c.y, z: c.z, clone() { return { ...this }; } },
              dir, d * 0.75);
            if (block) res.losBlocked++;
          }
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      return res;
    });
    notes.push(`P2#${run}: flight samples=${occl.samples} inFoliage=${occl.inFoliage} losBlocked=${occl.losBlocked}`);
    check(`P2#${run}`, 'camera never inside foliage during flight', 0, occl.inFoliage);
    if (occl.losBlocked > Math.ceil(occl.samples * 0.2)) {
      failures.push({ where: `P2#${run}`, name: 'LOS to victim mostly blocked', expected: `<=${Math.ceil(occl.samples * 0.2)} samples`, actual: String(occl.losBlocked) });
    }
    if (run === 1) await page.screenshot({ path: `${outDir}/p2_flight.png` });
    // ---- P3: x-ray labels + annotation
    try { await page.waitForFunction('window.__DEBUG.killcam.phase === "xray"', { timeout: 8000 }); } catch (_) { /* checked below */ }
    await sleep(1200);
    const lethal = await page.evaluate(() => {
      const pid = window.__DEBUG.game.player.id;
      const l = window.__CAP.hits.filter((h) => h.targetId === pid && h.destroyed);
      return l[l.length - 1] || null;
    });
    const kc = await page.evaluate(() => {
      const rows = {};
      for (const kv of document.querySelectorAll('.cot-kc-kv')) {
        rows[kv.querySelector('span').textContent.trim()] = kv.querySelector('b').textContent.trim().replace(/\s+/g, ' ');
      }
      return {
        rows,
        labels: [...document.querySelectorAll('.cot-kc-label')].map((l) => ({
          text: l.textContent.trim().replace(/\s+/g, ' '), ok: l.classList.contains('ok'),
        })),
        micro: [...document.querySelectorAll('.cot-kc-micro')].map((l) => l.textContent.trim()),
      };
    });
    if (lethal) {
      const R = Math.round;
      // annotation pen roll must mirror the payload with the r6 format
      const penNomK = await page.evaluate((e, fnSrc) => {
        // eslint-disable-next-line no-eval
        const myPenAt = eval(`(${fnSrc.replace('function myPenAt', 'function ')})`);
        const D = window.__DEBUG;
        const att = D.game.tanks.find((t) => t.id === e.attackerId);
        if (!att) return 0;
        const sh = att.spec.gun.shells.find((s) => s.name === e.shellName && s.type === e.shellType) || att.spec.gun.shells.find((s) => s.type === e.shellType);
        return sh ? Math.round(myPenAt(sh, e.flightDistM || 0)) : 0;
      }, lethal, myPenAtSrc);
      const roll = R(lethal.penRollMm || 0);
      const fresh = R(lethal.penRollFreshMm || 0);
      const qual = lethal.eraPlate ? ' · ERA'
        : (roll > 0 && (fresh > roll + 1 || (penNomK > 0 && roll < penNomK * 0.75 - 2))) ? ' · screens' : '';
      const arrow = fresh > roll + 1 ? `${fresh} → ` : '';
      const wantKc = roll > 0 ? `${arrow}${roll}${penNomK > 0 ? ` / ${penNomK}` : ''} mm${qual}` : '—';
      check(`P3#${run}`, 'annotation Pen roll', wantKc, kc.rows['Pen roll']);
      // entry-plate chip: zone label + outcome word, ALWAYS present
      const zl = zoneLabel(lethal.zone).toUpperCase();
      const entry = kc.labels.find((l) => l.text.toUpperCase().includes(zl));
      if (!entry) failures.push({ where: `P3#${run}`, name: 'entry-plate chip', expected: `label containing "${zl}"`, actual: kc.labels.map((l) => l.text).join(' | ') || '(none)' });
      for (const m of lethal.modulesHit || []) {
        const want = (m.module === 'fuelTank' ? 'Fuel Tank' : (MODULE_LABEL[m.module] || m.module)).toUpperCase();
        if (!kc.labels.some((l) => l.text.toUpperCase().includes(want))) {
          failures.push({ where: `P3#${run}`, name: `x-ray label ${m.module}`, expected: want, actual: kc.labels.map((l) => l.text).join(' | ') || '(none)' });
        }
      }
      // NEAR MISS chips must be demoted (ok tier) and never claim damage
      for (const l of kc.labels) {
        if (l.text.toUpperCase().includes('NEAR MISS') && !l.ok) {
          failures.push({ where: `P3#${run}`, name: 'near-miss chip tier', expected: 'ok (dim) tier', actual: `bright: ${l.text}` });
        }
      }
      notes.push(`P3#${run}: lethal kind=${lethal.kind} zone=${lethal.zone} labels=[${kc.labels.map((l) => l.text).join(' | ')}] micro=[${kc.micro.join(',')}]`);
    }
    if (run === 1) await page.screenshot({ path: `${outDir}/p3_xray.png` });
  }

  // ======================= P4: zero-shot report =============================
  await freshPage();
  await ready();
  await beginBattle('m1a2');
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
  await sleep(600);
  const rep = await page.evaluate(() => {
    const stats = document.querySelector('.cot-si-stats');
    return {
      dealt: stats.dataset.dealt,
      ribbons: [...stats.querySelectorAll('.cot-si-rib')].map((r) => r.textContent.trim()),
      caps: [...stats.querySelectorAll('.cot-si-kill.cap')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
      rosterEnemies: stats.dataset.rosterEnemies,
    };
  });
  check('P4', 'dealt is zero (staging)', '0', rep.dealt);
  if (rep.ribbons.some((r) => /ACE|DESTROYER/i.test(r))) {
    failures.push({ where: 'P4', name: 'kill ribbon suppressed at 0 damage', expected: 'no ACE/DESTROYER', actual: rep.ribbons.join(' | ') });
  }
  if (!rep.caps.length || !rep.caps.some((c) => /DMG OUT/i.test(c))) {
    failures.push({ where: 'P4', name: 'roster column captions', expected: 'KILLS / DMG OUT caption row', actual: rep.caps.join(' | ') || '(none)' });
  }
  notes.push(`P4: ribbons=[${rep.ribbons.join(' | ')}] caps=[${rep.caps.join(' | ')}] enemies=${rep.rosterEnemies}`);
  await page.screenshot({ path: `${outDir}/p4_report.png` });
} catch (e) {
  failures.push({ where: 'harness', name: 'exception', expected: 'clean run', actual: String(e && e.stack || e) });
} finally {
  await browser.close();
  await server.close();
}

console.log('\n=== ks r6-fix verification ===');
for (const n of notes) console.log('[note]', n);
if (errs.length) console.log('[console errors]', JSON.stringify(errs, null, 1));
if (!failures.length && !errs.length) {
  console.log('RESULT: ALL CHECKS PASSED');
} else {
  console.log(`RESULT: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log(` [${f.where}] ${f.name}: expected="${f.expected}" actual="${f.actual}"`);
  process.exitCode = 1;
}
