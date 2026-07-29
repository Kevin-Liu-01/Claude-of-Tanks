// content_breadth r6 critic probe — fonts, techtree community tab + pan/zoom,
// community tank E2E (select -> battle -> drive -> fire), icon usage.
// Screenshots land in shots/critic_r6_content/. Prints a JSON summary.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
let lockHeld = false;
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const myTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, myTicket), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null; let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch { names = [myTicket]; }
      for (const n of names) {
        if (n === myTicket) { head = head || n; break; }
        const m = n.match(/-(\d+)\.t$/); const pid = m ? +m[1] : -1;
        let alive = false;
        try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; }
        if (!alive) { try { unlinkSync(join(QUEUE_DIR, n)); } catch {} continue; }
        head = n; break;
      }
      if (head === myTicket) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch {}
        try { if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { rmdirSync(LOCK_DIR); continue; } } catch { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('lock timeout');
      await new Promise((r) => setTimeout(r, head === myTicket ? 300 : 1000));
    }
  } finally { try { unlinkSync(join(QUEUE_DIR, myTicket)); } catch {} }
}
function releaseLock() { if (lockHeld) { lockHeld = false; try { rmdirSync(LOCK_DIR); } catch {} } }
await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);

const outDir = '/Users/kevinliu/claude-of-tanks/shots/critic_r6_content';
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: '/Users/kevinliu/claude-of-tanks',
  logLevel: 'error',
  server: { port: 5200 + Math.floor(Math.random() * 700), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'], include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/utils/SkeletonUtils.js', 'three/examples/jsm/utils/BufferGeometryUtils.js', 'three/examples/jsm/geometries/RoundedBoxGeometry.js'] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log('[probe] vite at', url);

const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const out = {};
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

  // ---------- 1. FONTS ----------
  out.fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
    const checks = {
      switzer400: document.fonts.check('400 16px Switzer'),
      switzer700: document.fonts.check('700 16px Switzer'),
      switzerCond600: document.fonts.check("600 16px 'Switzer Condensed'"),
    };
    // canvas metric: Switzer vs Arial width must differ if really rendering
    const c = document.createElement('canvas').getContext('2d');
    c.font = "400 32px Switzer"; const wS = c.measureText('Hamburgefonstiv 0123').width;
    c.font = "400 32px Arial"; const wA = c.measureText('Hamburgefonstiv 0123').width;
    return { loadedCount: loaded.length, loadedSample: loaded.slice(0, 6), checks, metricDiff: Math.abs(wS - wA) > 0.5, wS, wA };
  });

  // computed font-family audit across garage UI
  out.fontAuditGarage = await page.evaluate(() => {
    const bad = new Map(); let total = 0;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (!el.textContent || !el.textContent.trim()) continue;
      if (!el.checkVisibility || !el.checkVisibility()) continue;
      total++;
      const ff = cs.fontFamily;
      if (!/Switzer/i.test(ff)) bad.set(ff, (bad.get(ff) || 0) + 1);
    }
    return { total, nonSwitzer: [...bad.entries()] };
  });

  // ---------- 2. TECH TREE ----------
  await page.evaluate(() => window.__SHOTS.set('techtree'));
  await new Promise((r) => setTimeout(r, 1500));
  const ttWorldSel = await page.evaluate(() => {
    // find the element whose style.transform carries translate+scale
    const all = document.querySelectorAll('div');
    for (const el of all) {
      if (el.style && /translate\(.+\) scale\(/.test(el.style.transform)) {
        el.setAttribute('data-probe-world', '1');
        return el.style.transform;
      }
    }
    return null;
  });
  out.ttInitialTransform = ttWorldSel;

  // pan test: drag on empty canvas area
  await page.mouse.move(960, 600);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(960 + i * 25, 600 + i * 12);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
  const afterPan = await page.evaluate(() => document.querySelector('[data-probe-world]')?.style.transform || null);
  out.ttAfterPan = afterPan;
  out.ttPanWorks = !!(ttWorldSel && afterPan && ttWorldSel !== afterPan);

  // zoom test: wheel
  await page.mouse.move(960, 540);
  await page.mouse.wheel({ deltaY: -400 });
  await new Promise((r) => setTimeout(r, 400));
  const afterZoom = await page.evaluate(() => document.querySelector('[data-probe-world]')?.style.transform || null);
  out.ttAfterZoom = afterZoom;
  const scaleOf = (t) => { const m = /scale\(([\d.]+)\)/.exec(t || ''); return m ? +m[1] : null; };
  out.ttZoomWorks = scaleOf(afterZoom) !== null && scaleOf(afterPan) !== null && Math.abs(scaleOf(afterZoom) - scaleOf(afterPan)) > 0.01;

  // COMMUNITY tab
  const commTab = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('*')].filter((e) => e.childElementCount <= 3 && /^\s*COMMUNITY\s*$/i.test(e.textContent || '') && e.closest('[class*=tt]'));
    if (!tabs.length) return null;
    const t = tabs[tabs.length - 1];
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  out.communityTabFound = !!commTab;
  if (commTab) {
    await page.mouse.click(commTab.x, commTab.y);
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${outDir}/tt_community.png` });
    out.communityCredits = await page.evaluate(() => {
      const texts = [...document.querySelectorAll('*')].map((e) => e.textContent || '').filter((t) => /by .+CC[- ]BY/is.test(t) && t.length < 200);
      const cards = document.querySelectorAll('[class*=node]');
      return { creditSamples: [...new Set(texts)].slice(0, 12), nodeCount: cards.length };
    });
  }

  // ---------- 3. COMMUNITY TANK E2E ----------
  const commIds = await page.evaluate(() => {
    const g = window.__DEBUG.game;
    const ids = [];
    for (const [id, t] of g.tankById) if (t.spec && t.spec.community && !t.spec.variantOf) ids.push(id);
    return ids;
  });
  out.communitySpecIds = commIds;
  const pick = commIds.includes('kv2') ? 'kv2' : commIds[0];
  out.e2ePick = pick;
  if (pick) {
    await page.evaluate((id) => { window.__DEBUG.shotMode = false; window.__DEBUG.startBattle(id); }, pick);
    await new Promise((r) => setTimeout(r, 5000));
    const pos0 = await page.evaluate(() => {
      const p = window.__DEBUG.game.player;
      return p && p.state ? { x: p.state.pos.x, z: p.state.pos.z, spec: p.specId, hp: p.combat && p.combat.hp } : null;
    });
    out.e2eSpawned = pos0;
    // drive forward 3.5s
    await page.keyboard.down('w');
    await new Promise((r) => setTimeout(r, 3500));
    await page.keyboard.up('w');
    const pos1 = await page.evaluate(() => {
      const p = window.__DEBUG.game.player;
      return p && p.state ? { x: p.state.pos.x, z: p.state.pos.z } : null;
    });
    out.e2eMoved = pos0 && pos1 ? Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z) : 0;
    // fire
    const shellsBefore = await page.evaluate(() => (window.__DEBUG.playerShellLog || []).length);
    await page.mouse.move(960, 500);
    await page.mouse.down(); await new Promise((r) => setTimeout(r, 120)); await page.mouse.up();
    await new Promise((r) => setTimeout(r, 2500));
    const shellsAfter = await page.evaluate(() => (window.__DEBUG.playerShellLog || []).length);
    out.e2eFired = { shellsBefore, shellsAfter, fired: shellsAfter > shellsBefore };
    await page.screenshot({ path: `${outDir}/e2e_${pick}_battle.png` });

    // kill something for the kill feed, then screenshot
    await page.evaluate(() => window.__DEBUG.slayEnemies && window.__DEBUG.slayEnemies(2));
    await new Promise((r) => setTimeout(r, 1800));
    await page.screenshot({ path: `${outDir}/e2e_killfeed.png` });
    // check kill feed uses mask icons
    out.killfeedIcons = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.ksi,.vsi')];
      return els.map((e) => ({ cls: e.className, mask: (e.style.webkitMaskImage || e.style.maskImage || '').slice(0, 80) })).slice(0, 6);
    });
    // damage panel icon + minimap canvas presence
    out.damagePanelIcon = await page.evaluate(() => {
      const si = document.querySelector('.si');
      return si ? (si.style.webkitMaskImage || si.style.maskImage || '').slice(0, 90) : null;
    });
    // font audit in battle HUD
    out.fontAuditHud = await page.evaluate(() => {
      const bad = new Map(); let total = 0;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (!el.textContent || !el.textContent.trim()) continue;
        if (!el.checkVisibility || !el.checkVisibility()) continue;
        total++;
        const ff = cs.fontFamily;
        if (!/Switzer/i.test(ff)) bad.set(ff, (bad.get(ff) || 0) + 1);
      }
      return { total, nonSwitzer: [...bad.entries()] };
    });
  }

  // ---------- 4. GARAGE map picker + carousel icons ----------
  await page.evaluate(() => window.__SHOTS.set('garage'));
  await new Promise((r) => setTimeout(r, 3000));
  out.mapPicker = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter((i) => /maps\//.test(i.src));
    return imgs.map((i) => ({ src: i.src.split('/').slice(-2).join('/'), w: i.naturalWidth, h: i.naturalHeight, ok: i.complete && i.naturalWidth > 4 }));
  });
  out.carouselIcons = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img.ti')];
    const broken = imgs.filter((i) => !(i.complete && i.naturalWidth > 4)).map((i) => i.src.split('/').pop());
    const community = imgs.filter((i) => /kv2|is3|is7|strv103|t34_85_cad|object279|sherman_jumbo|t95|t30|is1|is6b|sturmtiger|recon|q_heavy|pziii_konserwa|jagdtiger|jpz_e100|tiger2|kf51|leichttraktor/.test(i.src));
    return { total: imgs.length, broken, communityCount: community.length, communitySample: community.slice(0, 5).map((i) => i.src.split('/').pop()) };
  });
} catch (err) {
  out.FATAL = String(err && err.stack || err);
} finally {
  out.consoleErrors = consoleErrors.slice(0, 20);
  console.log('[probe] RESULT ' + JSON.stringify(out, null, 1));
  await browser.close();
  await server.close();
}
