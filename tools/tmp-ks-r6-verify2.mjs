// TEMP killcam_shotinfo r6-fix VERIFY probe part 2 (delete after review).
// Lean phases (shared box runs several headless browsers — keep each page
// short-lived): P2 flight occlusion invariant, P3 x-ray labels + annotation
// payload match, P4 zero-shot report gating + roster captions.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/ks_r6_verify');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5820 + Math.floor(Math.random() * 30), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
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
async function freshPage() {
  if (page) { try { await page.close(); } catch (_) { /* dead */ } }
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() !== 'error' || m.text().includes('favicon')) return;
    if (m.text().includes('MAX_TEXTURE_IMAGE_UNITS')) return; // known foreign (see control probe)
    errs.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
}
async function ready() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 150000 });
}
async function beginBattle() {
  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__CAP = { hits: [] };
    D.bus.on('shell:hit', (ev) => window.__CAP.hits.push(JSON.parse(JSON.stringify(ev))));
    D.startBattle('m1a2', 'verdant');
  });
  await sleep(300);
}
function zoneLabel(zone) {
  if (!zone) return '—';
  return zone.replace(/_(R|L)$/, ' $1').replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .replace(/ (r|l)$/, (m) => m.toUpperCase());
}
const MODULE_LABEL = {
  trackL: 'Track L', trackR: 'Track R', engine: 'Engine', fuelTank: 'Fuel Tank',
  ammoRack: 'Ammo Rack', gun: 'Gun', radio: 'Radio', optics: 'Optics', turretRing: 'Turret Ring',
};

// ---------------- P2 + P3 (two death replays) -------------------------------
for (let run = 1; run <= 2; run++) {
  try {
    await freshPage();
    await ready();
    await beginBattle();
    const spawned = await page.evaluate(() => window.__DEBUG.spawnKillShell());
    if (!spawned) { failures.push({ where: `P2#${run}`, name: 'spawnKillShell', expected: true, actual: false }); continue; }
    await page.waitForFunction('window.__DEBUG.killcam.phase !== null', { timeout: 20000 });
    const occl = await page.evaluate(async () => {
      const D = window.__DEBUG;
      const world = D.world;
      const conceal = world.getConcealment ? world.getConcealment() : [];
      const hf = world.heightField;
      const res = { samples: 0, inFoliage: 0, losBlocked: 0 };
      const victim = D.game.player.state.pos;
      const t0 = performance.now();
      while (D.killcam.phase === 'flight' && performance.now() - t0 < 8000) {
        const c = D.camera.position;
        res.samples++;
        for (const cc of conceal) {
          const dx = c.x - cc.x; const dz = c.z - cc.z;
          const rr = cc.r + 0.5;
          if (dx * dx + dz * dz > rr * rr) continue;
          const gy = hf.getHeightAt(cc.x, cc.z);
          const lo = cc.add >= 0.2 ? gy - 1 : gy + 2.0;
          const hi = cc.add >= 0.2 ? gy + 3.0 : gy + 11.0;
          if (c.y > lo && c.y < hi) { res.inFoliage++; break; }
        }
        const dxv = victim.x - c.x; const dyv = victim.y + 1.5 - c.y; const dzv = victim.z - c.z;
        const d = Math.hypot(dxv, dyv, dzv);
        if (d > 3) {
          const block = world.raycast({ x: c.x, y: c.y, z: c.z }, { x: dxv / d, y: dyv / d, z: dzv / d }, d * 0.75);
          if (block) res.losBlocked++;
        }
        await new Promise((r) => setTimeout(r, 110));
      }
      return res;
    });
    notes.push(`P2#${run}: flight samples=${occl.samples} inFoliage=${occl.inFoliage} losBlocked=${occl.losBlocked}`);
    check(`P2#${run}`, 'camera never inside foliage during flight', 0, occl.inFoliage);
    if (occl.samples > 3 && occl.losBlocked > Math.ceil(occl.samples * 0.25)) {
      failures.push({ where: `P2#${run}`, name: 'LOS to victim mostly blocked', expected: `<=${Math.ceil(occl.samples * 0.25)}`, actual: String(occl.losBlocked) });
    }
    await page.screenshot({ path: `${outDir}/p2_flight_r${run}.png` });
    // ---- P3 x-ray
    try { await page.waitForFunction('window.__DEBUG.killcam.phase === "xray"', { timeout: 10000 }); } catch (_) { /* below */ }
    await sleep(1300);
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
    if (lethal && lethal.localPos) {
      const R = Math.round;
      const roll = R(lethal.penRollMm || 0);
      const fresh = R(lethal.penRollFreshMm || 0);
      // payload-faithful annotation (nominal from the killer's live spec)
      const penNomK = await page.evaluate((e) => {
        const D = window.__DEBUG;
        const att = D.game.tanks.find((t) => t.id === e.attackerId);
        if (!att) return 0;
        const sh = att.spec.gun.shells.find((s) => s.name === e.shellName && s.type === e.shellType) || att.spec.gun.shells.find((s) => s.type === e.shellType);
        if (!sh) return 0;
        const d = e.flightDistM || 0;
        let p;
        if (d > 1000 && sh.pen2000Mm > 0) p = sh.pen1000Mm + (sh.pen2000Mm - sh.pen1000Mm) * Math.min(1, (d - 1000) / 1000);
        else p = sh.pen100Mm + (sh.pen1000Mm - sh.pen100Mm) * Math.min(1, Math.max(0, (d - 100) / 900));
        return Math.round(p);
      }, lethal);
      const qual = lethal.eraPlate ? ' · ERA'
        : (roll > 0 && (fresh > roll + 1 || (penNomK > 0 && roll < penNomK * 0.75 - 2))) ? ' · screens' : '';
      const arrow = fresh > roll + 1 ? `${fresh} → ` : '';
      const wantKc = roll > 0 ? `${arrow}${roll}${penNomK > 0 ? ` / ${penNomK}` : ''} mm${qual}` : '—';
      check(`P3#${run}`, 'annotation Pen roll', wantKc, kc.rows['Pen roll']);
      const zl = zoneLabel(lethal.zone).toUpperCase();
      if (!kc.labels.some((l) => l.text.toUpperCase().includes(zl))) {
        failures.push({ where: `P3#${run}`, name: 'entry-plate chip', expected: `label containing "${zl}"`, actual: kc.labels.map((l) => l.text).join(' | ') || '(none)' });
      }
      for (const m of lethal.modulesHit || []) {
        const want = (MODULE_LABEL[m.module] || m.module).toUpperCase();
        if (!kc.labels.some((l) => l.text.toUpperCase().includes(want))) {
          failures.push({ where: `P3#${run}`, name: `x-ray label ${m.module}`, expected: want, actual: kc.labels.map((l) => l.text).join(' | ') || '(none)' });
        }
      }
      for (const l of kc.labels) {
        if (l.text.toUpperCase().includes('NEAR MISS') && !l.ok) {
          failures.push({ where: `P3#${run}`, name: 'near-miss chip tier', expected: 'ok (dim)', actual: `bright: ${l.text}` });
        }
      }
      notes.push(`P3#${run}: kind=${lethal.kind} zone=${lethal.zone} fresh=${fresh} roll=${roll} labels=[${kc.labels.map((l) => l.text).join(' | ')}] micro=[${kc.micro.join(',')}]`);
    } else {
      notes.push(`P3#${run}: no lethal payload with localPos — labels=[${kc.labels.map((l) => l.text).join(' | ')}]`);
    }
    await page.screenshot({ path: `${outDir}/p3_xray_r${run}.png` });
  } catch (e) {
    failures.push({ where: `P2/P3#${run}`, name: 'phase exception', expected: 'clean', actual: String(e).slice(0, 160) });
  }
}

// ---------------- P4 zero-shot report ---------------------------------------
try {
  await freshPage();
  await ready();
  await beginBattle();
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
  await page.waitForFunction('document.querySelector(".cot-si-stats.show") !== null', { timeout: 20000 });
  await sleep(600);
  const rep = await page.evaluate(() => {
    const stats = document.querySelector('.cot-si-stats');
    return {
      dealt: stats.dataset.dealt,
      ribbons: [...stats.querySelectorAll('.cot-si-rib')].map((r) => r.textContent.trim()),
      caps: [...stats.querySelectorAll('.cot-si-kill.cap')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
    };
  });
  check('P4', 'dealt is zero (staging)', '0', rep.dealt);
  if (rep.ribbons.some((r) => /ACE|DESTROYER/i.test(r))) {
    failures.push({ where: 'P4', name: 'kill ribbon suppressed at 0 damage', expected: 'no ACE/DESTROYER', actual: rep.ribbons.join(' | ') });
  }
  if (!rep.caps.length || !rep.caps.some((c) => /DMG OUT/i.test(c))) {
    failures.push({ where: 'P4', name: 'roster column captions', expected: 'KILLS / DMG OUT caption row', actual: rep.caps.join(' | ') || '(none)' });
  }
  notes.push(`P4: ribbons=[${rep.ribbons.join(' | ')}] caps=[${rep.caps.join(' | ')}]`);
  await page.screenshot({ path: `${outDir}/p4_report.png` });
} catch (e) {
  failures.push({ where: 'P4', name: 'phase exception', expected: 'clean', actual: String(e).slice(0, 160) });
}

await browser.close();
await server.close();
console.log('\n=== ks r6-fix verification (part 2) ===');
for (const n of notes) console.log('[note]', n);
if (errs.length) console.log('[console errors]', JSON.stringify(errs.slice(0, 6), null, 1));
if (!failures.length && !errs.length) console.log('RESULT: ALL CHECKS PASSED');
else {
  console.log(`RESULT: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log(` [${f.where}] ${f.name}: expected="${f.expected}" actual="${f.actual}"`);
  process.exitCode = 1;
}
