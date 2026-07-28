// Automated player hull-hit-rate gate (controls_gunnery r6).
// FAILS (exit 1) unless >=80% of fully-settled aim-assisted shots at <=350 m
// (moving targets included) register a tank impact, across 3 random-roster
// battles. Every player shell's terminal event is printed from
// __DEBUG.playerShellLog so whiffs are attributable (lead error / drop /
// blocked path / collider gap). Also prints the per-battle bot-vs-player
// pressure line (__DEBUG.botPressure).
// Usage: node tools/gunnery_gate.mjs [--battles 3] [--shots 6] [--min 80]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync } from 'node:fs';

const LOCK_DIR = '/tmp/cot-shots.lock';
const LOCK_STALE_MS = 5 * 60 * 1000;
let lockHeld = false;
async function acquireLock() {
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
    try {
      if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { rmdirSync(LOCK_DIR); continue; }
    } catch (_) { continue; }
    if (Date.now() - t0 > 10 * 60 * 1000) throw new Error('cot-shots lock timeout');
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
  }
}
function releaseLock() { if (lockHeld) { lockHeld = false; try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ } } }
await acquireLock();
process.on('exit', releaseLock);

const args = process.argv.slice(2);
const opt = (n, f) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
const BATTLES = parseInt(opt('battles', '3'), 10);
const SHOTS_PER = parseInt(opt('shots', '6'), 10);
const MIN_RATE = parseInt(opt('min', '80'), 10);

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false },
  optimizeDeps: { entries: ['index.html'], include: [
    'three', 'three/examples/jsm/loaders/GLTFLoader.js',
    'three/examples/jsm/utils/SkeletonUtils.js',
    'three/examples/jsm/utils/BufferGeometryUtils.js',
    'three/examples/jsm/geometries/RoundedBoxGeometry.js',
  ] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[gunnery-gate] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let failed = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

  const report = await page.evaluate(async (BATTLES, SHOTS_PER) => {
    const D = window.__DEBUG;
    const g = D.game;
    const out = { battles: [] };
    for (let b = 0; b < BATTLES; b++) {
      D.startBattle('m1a2');
      const logStart = D.playerShellLog.length;
      let shots = 0;
      let guard = 0;
      while (shots < SHOTS_PER && guard++ < SHOTS_PER * 5) {
        if (g.phase !== 'battle' || !g.player || g.player.combat.destroyed) break;
        const aimed = D.aimAtNearest();
        if (!aimed) { D.fastForward(2); continue; }
        const tgt = g.tankById.get(aimed.id);
        if (!tgt || !tgt.state) continue;
        // settle: <=0.5 mrad AND reload done (dispersion follows bloom decay)
        let st = null;
        for (let w = 0; w < 56; w++) {
          st = D.aimState();
          if (st && st.errMrad <= 0.5 && st.reloadT <= 0) break;
          D.fastForward(0.25);
          if (!tgt.combat || tgt.combat.destroyed) break;
        }
        if (!tgt.combat || tgt.combat.destroyed) continue;
        const re = D.aimAtNearest(); // refresh sticky lead just before firing
        if (!re) continue;
        D.fastForward(0.5);
        st = D.aimState();
        if (!st || st.errMrad > 0.5 || st.reloadT > 0) continue;
        const before = g.shells.length ? Math.max(...g.shells.map((s) => s.id)) : -1;
        D.flags.forceFire = true;
        let fired = false;
        for (let i = 0; i < 10 && !fired; i++) {
          D.fastForward(0.05);
          fired = g.shells.some((s) => s.isPlayer && s.id > before);
        }
        D.flags.forceFire = false;
        if (!fired) continue;
        shots++;
        D.fastForward(6); // shell terminal + next approach
      }
      out.battles.push({
        roster: g.tanks.filter((t) => t.team === 'enemy').map((t) => t.specId),
        shells: D.playerShellLog.slice(logStart),
        botPressure: { ...D.botPressure },
      });
    }
    return out;
  }, BATTLES, SHOTS_PER);

  let settled = 0;
  let hits = 0;
  for (const b of report.battles) {
    console.log(`[gunnery-gate] roster: ${b.roster.join(', ')}`);
    for (const s of b.shells) {
      if (!s.terminal) continue;
      const inGate = s.targetDistM != null && s.targetDistM <= 350 && !s.blockedDistM;
      if (inGate) { settled++; if (s.terminal === 'tank') hits++; }
      console.log(`[gunnery-gate]   shell ${s.shellId} -> ${s.terminal}` +
        (s.hitKind ? ` (${s.hitKind}, ${s.damage} dmg)` : '') +
        ` target=${s.targetId || '-'} @${s.targetDistM || '?'}m v=${s.targetSpeed}` +
        ` missM=${s.missM == null ? '-' : s.missM}` +
        (s.blockedDistM ? ` BLOCKED@${s.blockedDistM}m` : '') +
        (inGate ? ' [gated]' : ''));
    }
    const bp = b.botPressure;
    console.log(`[gunnery-gate]   bot pressure: ${bp.enemyShells} enemy shells, ` +
      `${bp.aimedAtPlayer} aimed at player, ${bp.hitsOnPlayer} hits (${Math.round(bp.dmgOnPlayer)} dmg)`);
  }
  const rate = settled ? Math.round((hits / settled) * 100) : 0;
  console.log(`[gunnery-gate] settled shots <=350 m: ${settled}, tank impacts: ${hits}, rate: ${rate}% (min ${MIN_RATE}%)`);
  if (settled < 6) { console.error('[gunnery-gate] FAIL: not enough gated shots collected'); failed = true; }
  else if (rate < MIN_RATE) { console.error('[gunnery-gate] FAIL: hull-hit rate below gate'); failed = true; }
  if (consoleErrors.length) {
    console.error('[gunnery-gate] console errors:', consoleErrors.slice(0, 10));
    failed = true;
  }
} catch (err) {
  console.error('[gunnery-gate] FAILED:', err);
  failed = true;
} finally {
  await browser.close();
  await server.close();
  releaseLock();
}
process.exit(failed ? 1 : 0);
