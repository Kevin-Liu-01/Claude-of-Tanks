// TEMP killcam_shotinfo r4 verification probe (delete after review).
// r4 focus, on top of the r3/r5 number-verification machinery:
//   A. fire a REAL player shot via __DEBUG, read the floating shot card and
//      verify EVERY rendered number against the sim event payload (result,
//      distance, angle, nominal/effective armor, rolls, hp-left, modules) —
//      any mismatch is CRITICAL (the panel must never lie).
//   B. HUD-bleed defense (r4 major): during a LIVE death replay, simulate the
//      stale flyby-latch race by clearing the HUD's inline display mid-replay
//      — the body.cot-kc-live css rule must keep .cot-hud computed
//      display:none through flight AND x-ray; class must drop after finish.
//   C. x-ray backdrop scrim (r4 major): sun/hemi intensities must dim during
//      the hold and restore EXACTLY after it; live x-ray frame captured over
//      grass for visual judgment.
//   D. report receipt (r4): itemized credit/xp rows must reconcile exactly
//      with the strip totals + dataset; expandable enemy rows must open and
//      list the same exchanges the bus events recorded.
// Outputs shots/ks-r4-verify/*.png + verdicts on stdout.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/ks-r4-verify');
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
const num = (s) => parseFloat(String(s).replace(/[+,−]/g, '').replace(/−/g, ''));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

// install bus capture, start a battle
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
async function teleportTargetOntoGunAxis() {
  return await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    if (!p || p.combat.destroyed) return { ok: false, why: 'no player' };
    const V3 = Object.getPrototypeOf(p.state.pos).constructor;
    const muzzle = new V3();
    p.visual.gunPivotWorld(muzzle);
    const az = p.state.yaw + p.state.turretYaw;
    const el = p.state.gunPitch;
    const dir = new V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const enemy = D.game.tanks.find((t) => t.team === 'enemy' && !t.combat.destroyed);
    if (!enemy) return { ok: false, why: 'no enemy left' };
    for (const d of [120, 90, 160]) {
      const blocked = D.world.raycast(muzzle, dir, d);
      if (blocked && blocked.dist < d - 6) continue;
      enemy.state.pos.set(muzzle.x + dir.x * d, muzzle.y + dir.y * d - enemy.spec.dims.heightM * 0.5, muzzle.z + dir.z * d);
      enemy.state.speed = 0;
      enemy.state.yaw = az + Math.PI / 2;
      return { ok: true, id: enemy.id, d };
    }
    return { ok: false, why: 'gun axis blocked by terrain' };
  });
}

// Fallback 2: park the nearest enemy broadside on FLAT ground 110 m ahead of
// the player's hull (terrain-conformed), then let the normal aim path work.
async function teleportTargetAhead() {
  return await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    if (!p || p.combat.destroyed) return { ok: false, why: 'no player' };
    const enemy = D.game.tanks.find((t) => t.team === 'enemy' && !t.combat.destroyed);
    if (!enemy) return { ok: false, why: 'no enemy left' };
    for (const d of [110, 140, 80]) {
      const x = p.state.pos.x + Math.sin(p.state.yaw) * d;
      const z = p.state.pos.z + Math.cos(p.state.yaw) * d;
      enemy.state.pos.set(x, D.world.heightField.getHeightAt(x, z) + 0.4, z);
      enemy.state.speed = 0;
      enemy.state.yaw = p.state.yaw + Math.PI / 2;
      return { ok: true, id: enemy.id, d };
    }
    return { ok: false, why: 'unreachable' };
  });
}

let shot = await landPlayerHit(4);
if (!shot.ok) {
  const tp = await teleportTargetOntoGunAxis();
  notes.push(`phaseA fallback teleport: ${JSON.stringify(tp)}`);
  if (tp.ok) shot = await landPlayerHit(4);
}
if (!shot.ok) {
  const tp2 = await teleportTargetAhead();
  notes.push(`phaseA fallback2 (ahead): ${JSON.stringify(tp2)}`);
  if (tp2.ok) shot = await landPlayerHit(5);
}
if (!shot.ok) {
  failures.push({ where: 'phaseA', name: 'landPlayerHit', expected: 'hit', actual: shot.why });
} else {
  const ev = shot.ev;
  notes.push(`phaseA event: kind=${ev.kind} dmg=${ev.damage} zone=${ev.zone} dist=${Math.round(ev.flightDistM)} target=${ev.targetName}`);
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
      zoneTank: zoneEl ? (zoneEl.querySelector('.tn') || {}).textContent : null,
      hasDiagram: !!c.querySelector('.cot-si-diag .sil'),
      hasWedge: !!c.querySelector('.cot-si-diag svg.ov .wdg'),
      hasPlanForm: !!c.querySelector('.cot-si-diag .pf'),
      chips: [...c.querySelectorAll('.cot-si-mod span:last-child')].map((x) => x.textContent.trim()),
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
      const hasArmor = (ev.nominalMm || 0) > 0 || (ev.effectiveMm || 0) > 0;
      check('card', 'Armor row', hasArmor ? `${R(ev.nominalMm || 0)}→${R(ev.effectiveMm || 0)} mm` : '—', card.rows['Armor']);
      const spec = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DEBUG.game.player.spec.gun.shells)));
      const sh = spec.find((s) => s.name === ev.shellName && s.type === ev.shellType) || spec.find((s) => s.type === ev.shellType);
      const nomPen = sh ? R(penAt(sh, ev.flightDistM || 0)) : 0;
      const roll = R(ev.penRollMm || 0);
      if (roll > 0 && nomPen > 0) {
        check('card', 'Pen roll row', `${roll} / ${nomPen} mm`, card.rows['Pen roll']);
        const dev = Math.abs(roll - nomPen) / nomPen;
        if (dev > 0.2501) failures.push({ where: 'sim', name: 'pen roll outside ±25%', expected: `within 25% of ${nomPen}`, actual: String(roll) });
      }
      check('card', 'pennom vs independent recompute', nomPen, card.dataset.pennom);
    }
    check('card', 'Damage row', `${R(ev.damage || 0)} / ${R(ev.dmgRoll || 0)}`, card.rows['Damage']);
    check('card', 'Result row', ev.destroyed ? 'DESTROYED' : `${Math.max(0, R(ev.targetHpAfter || 0))} hp left`, card.rows['Result']);
    if (card.zone !== null) check('card', 'zone label', zoneLabel(ev.zone), card.zone);
    check('card', 'diagram present', true, card.hasDiagram);
    check('card', 'wedge present', true, card.hasWedge);
    check('card', 'plan-form present', true, card.hasPlanForm);
    const wantChips = [
      ...(ev.modulesHit || []).map((m) => MODULE_LABEL[m.module] || m.module),
      ...(ev.crewHit || []).map((c) => CREW_LABEL[c] || c),
      ...(ev.fireStarted ? ['Fire'] : []),
    ];
    check('card', 'module chips', wantChips.join('|'), card.chips.join('|'));
    check('card', 'target name', ev.targetName || '', (card.zoneTank || '').trim());
  }
  await page.evaluate(() => { const D = window.__DEBUG; if (D.rig && D.rig.exitSniper) D.rig.exitSniper(); });
  await sleep(400);
  await page.screenshot({ path: `${outDir}/a_card_crop.png`, clip: { x: 1920 - 320, y: 270, width: 320, height: 460 } });
}

// ============== PHASE B+C: death replay — HUD veil + scrim ==================
// record pre-replay light intensities
const preLights = await page.evaluate(() => {
  const out = [];
  window.__DEBUG.scene.traverse((o) => {
    if ((o.isDirectionalLight || o.isHemisphereLight) && o.intensity > 0) {
      out.push({ name: o.name || o.type, i: o.intensity });
    }
  });
  return out;
});
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
  return { ok: D.killcam.isActive(), phase: D.killcam.phase };
});
if (!spawned.ok) {
  failures.push({ where: 'phaseB', name: 'death replay start', expected: 'killcam active', actual: JSON.stringify(spawned) });
} else {
  notes.push(`phaseB: killcam active, phase=${spawned.phase}`);
  // simulate the stale flyby-latch race: clear the HUD's inline veil while
  // the replay owns the screen — the css defense must keep it hidden
  const flight = await page.evaluate(() => {
    const D = window.__DEBUG;
    const hud = document.querySelector('.cot-hud');
    if (hud) hud.style.display = ''; // what a stray veilHud(false) does
    const cs = hud ? getComputedStyle(hud).display : 'missing';
    return {
      phase: D.killcam.phase,
      bodyStamp: document.body.classList.contains('cot-kc-live'),
      hudComputed: cs,
    };
  });
  check('phaseB', 'body.cot-kc-live during replay', true, flight.bodyStamp);
  check('phaseB', `HUD stays hidden after inline unveil (${flight.phase})`, 'none', flight.hudComputed);
  await sleep(900);
  await page.screenshot({ path: `${outDir}/b_flight.png` });
  // wait for x-ray
  await page.waitForFunction('window.__DEBUG.killcam.phase === "xray"', { timeout: 9000 }).catch(() => {
    failures.push({ where: 'phaseB', name: 'reached x-ray', expected: 'xray', actual: 'timeout' });
  });
  const xray = await page.evaluate(() => {
    const hud = document.querySelector('.cot-hud');
    if (hud) hud.style.display = ''; // race again mid-x-ray
    const lights = [];
    window.__DEBUG.scene.traverse((o) => {
      if ((o.isDirectionalLight || o.isHemisphereLight) && o.intensity > 0) {
        lights.push({ name: o.name || o.type, i: o.intensity });
      }
    });
    return {
      bodyStamp: document.body.classList.contains('cot-kc-live'),
      hudComputed: hud ? getComputedStyle(hud).display : 'missing',
      veilOn: !!document.querySelector('.cot-kc.xr'),
      lights,
    };
  });
  check('phaseB', 'body stamp during x-ray', true, xray.bodyStamp);
  check('phaseB', 'HUD stays hidden after inline unveil (xray)', 'none', xray.hudComputed);
  check('phaseC', 'x-ray veil class on', true, xray.veilOn);
  // scrim: every directional/hemi light dimmed vs pre-replay
  const preSum = preLights.reduce((a, l) => a + l.i, 0);
  const xSum = xray.lights.reduce((a, l) => a + l.i, 0);
  if (!(xSum < preSum * 0.6)) {
    failures.push({ where: 'phaseC', name: 'backdrop lights dimmed in x-ray', expected: `< ${(preSum * 0.6).toFixed(2)}`, actual: xSum.toFixed(2) });
  } else notes.push(`phaseC: scene light sum ${preSum.toFixed(1)} -> ${xSum.toFixed(1)} during x-ray`);
  await sleep(1200);
  await page.screenshot({ path: `${outDir}/c_xray_live.png` });
  // skip out of the replay (any key)
  await page.keyboard.press('Space');
  await sleep(600);
  const post = await page.evaluate(() => {
    const lights = [];
    window.__DEBUG.scene.traverse((o) => {
      if ((o.isDirectionalLight || o.isHemisphereLight) && o.intensity > 0) {
        lights.push({ name: o.name || o.type, i: o.intensity });
      }
    });
    return {
      kcActive: window.__DEBUG.killcam.isActive(),
      bodyStamp: document.body.classList.contains('cot-kc-live'),
      lights,
    };
  });
  check('phaseB', 'killcam finished after skip', false, post.kcActive);
  check('phaseB', 'body stamp removed after finish', false, post.bodyStamp);
  const postSum = post.lights.reduce((a, l) => a + l.i, 0);
  if (Math.abs(postSum - preSum) > 0.001) {
    failures.push({ where: 'phaseC', name: 'light intensities restored exactly', expected: preSum.toFixed(4), actual: postSum.toFixed(4) });
  } else notes.push('phaseC: light intensities restored exactly after finish');
}

// ================= PHASE D: battle report receipt + expansion ===============
// The player death alone may leave the battle running (allies fighting) — no
// battle:ended, no report. Debug-slay the remaining enemies to resolve it.
await page.evaluate(async () => {
  const D = window.__DEBUG;
  const yieldTask = () => new Promise((r) => setTimeout(r, 0));
  for (let s = 0; s < 40 && !window.__CAP.ended; s++) {
    if (s === 2) D.slayEnemies();
    D.fastForward(0.3);
    await yieldTask();
  }
});
await page.waitForFunction('document.querySelector(".cot-si-stats.show") !== null', { timeout: 20000 }).catch(() => {
  failures.push({ where: 'phaseD', name: 'report shown', expected: 'report', actual: 'timeout' });
});
const report = await page.evaluate(() => {
  const sr = document.querySelector('.cot-si-stats');
  if (!sr || !sr.classList.contains('show')) return null;
  const box = (sel) => {
    const it = document.querySelector(sel);
    if (!it) return null;
    const total = it.querySelector('.ev').textContent.trim();
    const rows = [...it.querySelectorAll('.cot-si-erows > div')].map((r) => ({
      label: r.querySelector('span').textContent.trim(),
      val: r.querySelector('b').textContent.trim(),
      tot: r.classList.contains('tot'),
    }));
    return { total, rows };
  };
  return {
    dataset: { ...sr.dataset },
    cr: box('.cot-si-ecoitem.cr'),
    xp: box('.cot-si-ecoitem.xp'),
    expandable: document.querySelectorAll('.cot-si-kill.x').length,
    banner: sr.dataset.banner,
  };
});
if (!report) {
  failures.push({ where: 'phaseD', name: 'report DOM', expected: 'present', actual: 'missing' });
} else {
  notes.push(`phaseD: banner=${report.banner} expandableRows=${report.expandable}`);
  const ds = report.dataset;
  const win = report.banner === 'VICTORY';
  for (const [tag, box, strip] of [['credits', report.cr, ds.credits], ['xp', report.xp, ds.xp]]) {
    if (!box) { failures.push({ where: 'phaseD', name: `${tag} receipt`, expected: 'rows', actual: 'missing' }); continue; }
    check('phaseD', `${tag} strip == dataset`, `+${Number(strip).toLocaleString('en-US')}`, box.total);
    const totRow = box.rows.find((r) => r.tot);
    check('phaseD', `${tag} total row == strip`, box.total, totRow ? totRow.val : 'missing');
    // sum of visible non-total rows must round to the total (xp: base rows +
    // victory bonus; the 'Base (rounded)' row is informational, skip it)
    const sum = box.rows.filter((r) => !r.tot && !/^Base/.test(r.label))
      .reduce((a, r) => a + num(r.val), 0);
    if (Math.abs(Math.round(sum) - num(box.total)) > 0.51) {
      failures.push({ where: 'phaseD', name: `${tag} rows reconcile`, expected: String(num(box.total)), actual: `${sum} (rounded ${Math.round(sum)})` });
    }
  }
  // independent recompute from the dataset counters the r4 critic verified
  const killsRow = (report.cr.rows.find((r) => /^Kills/.test(r.label)) || { label: 'Kills 0 ×' }).label;
  const kills = parseInt(killsRow.replace(/^Kills\s+(\d+).*$/, '$1'), 10) || 0;
  const dealtR = Number(ds.dealt);
  const blockedR = Number(ds.blocked);
  const hits = Number(ds.hits);
  const expBase = Math.round(dealtR * 0.85 + kills * 140 + blockedR * 0.12 + hits * 6);
  const expXp = Math.round(expBase * (win ? 1.5 : 1));
  const expCr = Math.round(dealtR * 4.2 + kills * 850 + blockedR * 0.55) + (win ? 2500 : 0);
  check('phaseD', 'credits formula recompute', expCr, ds.credits);
  check('phaseD', 'xp formula recompute', expXp, ds.xp);
  check('phaseD', 'xpBase dataset', expBase, ds.xpBase);
  // expandable rows: open the first, verify ledger lines against bus events
  if (report.expandable > 0) {
    const led = await page.evaluate(() => {
      const row = document.querySelector('.cot-si-kill.x');
      const name = row.querySelector('.n').textContent.replace('YOU', '').trim();
      row.click();
      const xd = row.nextElementSibling;
      const open = xd && xd.classList.contains('open');
      const lines = open ? [...xd.querySelectorAll('.xr')].map((l) => l.textContent.trim().replace(/\s+/g, ' ')) : [];
      // independent count from the captured bus events for this enemy name
      const pid = window.__DEBUG.game.player.id;
      const hitsOn = window.__CAP.hits.filter((h) => h.attackerId === pid && h.targetName === name).length;
      const hitsFrom = window.__CAP.hits.filter((h) => h.targetId === pid && h.attackerName === name).length;
      return { name, open, lines, expect: hitsOn + hitsFrom };
    });
    check('phaseD', `row "${led.name}" expands`, true, led.open);
    check('phaseD', 'ledger line count == bus events', led.expect, led.lines.length);
    notes.push(`phaseD ledger[${led.name}]: ${led.lines.slice(0, 4).join(' | ')}${led.lines.length > 4 ? ' …' : ''}`);
  } else {
    notes.push('phaseD: no expandable rows (no traffic with any single enemy?)');
  }
  await page.screenshot({ path: `${outDir}/d_report.png` });
}

// ------------------------------ verdict --------------------------------------
console.log('\n================ ks-r4 verify ================');
for (const n of notes) console.log('NOTE  ', n);
for (const f of failures) console.log('FAIL  ', JSON.stringify(f));
if (errs.length) console.log('CONSOLE ERRORS:', errs.slice(0, 6));
console.log(failures.length === 0 && errs.length === 0 ? 'VERDICT: PASS' : `VERDICT: ${failures.length} failures, ${errs.length} console errors`);
await browser.close();
await server.close();
process.exit(failures.length === 0 && errs.length === 0 ? 0 : 1);
