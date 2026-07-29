// Focused r6 probe: community tank fires? + map picker thumbs real?
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const LOCK_DIR = '/tmp/cot-shots.lock'; const QUEUE_DIR = '/tmp/cot-shots.queue';
let lockHeld = false;
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const t = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, t), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null; let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch { names = [t]; }
      for (const n of names) {
        if (n === t) { head = head || n; break; }
        const m = n.match(/-(\d+)\.t$/); const pid = m ? +m[1] : -1;
        let alive = false; try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; }
        if (!alive) { try { unlinkSync(join(QUEUE_DIR, n)); } catch {} continue; }
        head = n; break;
      }
      if (head === t) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch {}
        try { if (Date.now() - statSync(LOCK_DIR).mtimeMs > 5 * 60 * 1000) { rmdirSync(LOCK_DIR); continue; } } catch { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('lock timeout');
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally { try { unlinkSync(join(QUEUE_DIR, t)); } catch {} }
}
function releaseLock() { if (lockHeld) { lockHeld = false; try { rmdirSync(LOCK_DIR); } catch {} } }
await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);

const server = await createServer({
  root: '/Users/kevinliu/claude-of-tanks', logLevel: 'error',
  server: { port: 5200 + Math.floor(Math.random() * 700), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'], include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/utils/SkeletonUtils.js', 'three/examples/jsm/utils/BufferGeometryUtils.js', 'three/examples/jsm/geometries/RoundedBoxGeometry.js'] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const out = {};
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

  // map picker thumbs (garage is the boot screen)
  out.mapThumbs = await page.evaluate(() => [...document.querySelectorAll('.mthumb')].map((e) => (e.style.backgroundImage || 'none').slice(0, 60)));

  await page.evaluate(() => { window.__DEBUG.shotMode = false; window.__DEBUG.startBattle('kv2'); });
  await new Promise((r) => setTimeout(r, 6000));
  out.center = await page.evaluate(() => {
    const el = document.elementFromPoint(960, 540);
    return el ? `${el.tagName}.${el.className}` : null;
  });
  // hold mouse 400ms for a solid fire edge
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 400));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 1000));
  out.try1 = await page.evaluate(() => ({
    shells: window.__DEBUG.game.shells.length,
    log: (window.__DEBUG.playerShellLog || []).length,
    fireInput: window.__DEBUG.game.player.input.fire,
    reload: window.__DEBUG.game.player.combat.reloadT,
  }));
  if (!out.try1.log) {
    // second attempt after another 3 s (maybe still in intro/settle)
    await new Promise((r) => setTimeout(r, 3000));
    await page.mouse.down(); await new Promise((r) => setTimeout(r, 400)); await page.mouse.up();
    await new Promise((r) => setTimeout(r, 1200));
    out.try2 = await page.evaluate(() => ({
      shells: window.__DEBUG.game.shells.length,
      log: (window.__DEBUG.playerShellLog || []).length,
      reload: window.__DEBUG.game.player.combat.reloadT,
    }));
  }
  out.shellSample = await page.evaluate(() => (window.__DEBUG.playerShellLog || []).slice(-2));
} catch (e) { out.FATAL = String(e); }
out.errs = errs.slice(0, 8);
console.log('[fireprobe] ' + JSON.stringify(out, null, 1));
await browser.close(); await server.close();
