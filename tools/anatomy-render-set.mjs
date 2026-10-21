// Gallery anatomy render set (BUI-G2/G3/G4/H8 blind-critic packet source).
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// Deterministic before/after capture for the anatomy lane. Each side is served from its own checkout (the lane's
// base tree for BEFORE, the lane head for AFTER), both Vite servers warm before the capture lock is taken, and one
// NORMAL-band hold captures every planned side × viewport (19.5 min watchdog started only after the lock is taken;
// items that would pass the 17 min mark are skipped and listed in the receipt).
//
//   node tools/anatomy-render-set.mjs --plan=before:desk,after:desk,before:phone,after:phone \
//     --before-root=<base checkout> --after-root=<lane checkout> --ids=a,b,c [--phone-ids=a,b] --out=<dir> [--lockwait=ms]
//   node tools/anatomy-render-set.mjs --side=before|after --part=desk|phone|killcam   (one item, root = cwd)
//
// Views (same camera on both sides: frameView('hero'), cameraFit unchanged; Crew adds the same 5 dolly ticks):
//   exterior  control (appearance / exterior)
//   armor     the Armor layer        (BEFORE: plate overlay on the exterior · AFTER: the absolute-mm heat map)
//   modules   the Modules layer      (BEFORE: dashed kill-cam models · AFTER: the X-ray with module models and crew)
//   crew      the Crew layer         (BEFORE: dashed capsule figures · AFTER: P50 mannequins on their head shapes)
//   hitbox    exact combat shapes    (BEFORE: Modules + the workbench hitbox toggle · AFTER: Modules + Hit volumes)
//   killcam   the dev shot runtime's killcam_xray stage on the same target (seeds 9001, 4242, 555, 77)
// Output: <out>/<side>/<id>-<view>-<desktop|phone>.jpg (the #viewport stage) and …-page.jpg (the whole window).
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { uniqueIds } from './id-list.mjs';

const arg = (name, fallback = '') => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const plan = (arg('plan') || `${arg('side', 'before')}:${arg('part', 'desk')}`).split(',').filter(Boolean)
  .map((item) => { const [side, part] = item.split(':'); return { side, part }; });
const roots = {
  before: resolve(arg('before-root', process.cwd())),
  after: resolve(arg('after-root', process.cwd())),
};
const ids = uniqueIds(arg('ids', 't90m_proryv,leo2a7v,m1a2_abrams_sepv3,challenger2,merkava4,ztz99a,strv103b,kv2').split(',').filter(Boolean), 'anatomy-render-set --ids');
const phoneIds = uniqueIds((arg('phone-ids') || ids.join(',')).split(',').filter(Boolean), 'anatomy-render-set --phone-ids');
const OUT_ROOT = resolve(arg('out', '/Users/kevinliu/cot-launch-state/streams/gallery-anatomy/renders/r230'));
const views = arg('views', 'exterior,armor,modules,crew,hitbox').split(',').filter(Boolean);
const toolRoot = roots[plan[0].side];
// --swiftshader: a CPU-only preview set (no GPU, no capture lock) for early critic rounds; the GPU hold makes the finals.
const swiftshader = process.argv.includes('--swiftshader');
const toolRequire = createRequire(join(toolRoot, 'package.json'));
const puppeteer = (await import(pathToFileURL(toolRequire.resolve('puppeteer')).href)).default;
const { createCaptureLock } = await import(pathToFileURL(join(toolRoot, 'tools/capture-lock.mjs')).href);

const started = Date.now();
const log = (...m) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s]`, ...m);
const receipts = { plan, roots, ids, views, shots: [], errors: [], skipped: [], cameras: {} };
const servers = {};
let browser;

// CPU warm-up outside the GPU hold: each side's Vite transforms its entry graphs before the lock is taken.
for (const side of new Set(plan.map((item) => item.side))) {
  const root = roots[side];
  const require = createRequire(join(root, 'package.json'));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const server = await createServer({
    root, logLevel: 'error',
    // Each run keeps its own dependency cache: two servers on one checkout re-optimise a shared cache under each other.
    cacheDir: join(root, 'node_modules', `.vite-anatomy-${swiftshader ? 'sw' : 'gpu'}`),
    // Sources stay watched (no HMR): an edit made while the ticket waits is what the hold captures.
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false,
      watch: { ignored: ['**/node_modules/**', '**/.git/**', '**/public/**', '**/dist/**', '**/shots/**', '**/docs/**', '**/tools/**', '**/server/**', '**/api/**'] } },
    optimizeDeps: { entries: ['index.html', 'site/gallery.html'], include: ['three'] },
  });
  await server.listen();
  for (const entry of ['/src/gallery/gallery.ts', '/src/main.ts', '/src/vehicles/fleetFactory.ts', '/src/gallery/damageLab.ts', '/src/gallery/anatomyView.ts']) {
    try { await server.warmupRequest(entry); } catch (error) { log('warmup', side, entry, String(error?.message || error).slice(0, 120)); }
  }
  servers[side] = { server, base: `http://127.0.0.1:${server.httpServer.address().port}` };
  log('vite warm', side, root, servers[side].base);
}

const lock = swiftshader ? { acquire: async () => {}, refresh() {}, release() {} } : createCaptureLock();
await lock.acquire(Number(arg('lockwait', String(5 * 60 * 60 * 1000))));
const holdStart = Date.now();
log('capture lock held');
const refresher = setInterval(() => lock.refresh(), 30000); refresher.unref();
async function shutdown(code) {
  try { await browser?.close(); } catch {}
  for (const { server } of Object.values(servers)) { try { await server.close(); } catch {} }
  lock.release();
  try {
    await mkdir(OUT_ROOT, { recursive: true });
    await writeFile(join(OUT_ROOT, `receipt-${plan.map((item) => `${item.side}-${item.part}`).join('+')}.json`), JSON.stringify(receipts, null, 2));
  } catch {}
  process.exit(code);
}
if (!swiftshader) setTimeout(() => { log('watchdog: 19.5 min hold cap'); receipts.errors.push('watchdog'); void shutdown(124); }, 19.5 * 60 * 1000).unref();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => void shutdown(143));
const HOLD_LIMIT_MS = swiftshader ? Infinity : 17 * 60 * 1000;
const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));

const allIds = ids;
async function captureItem({ side, part }) {
  const OUT = join(OUT_ROOT, side);
  await mkdir(OUT, { recursive: true });
  const { base } = servers[side];
  const page = await browser.newPage();
  page.on('pageerror', e => receipts.errors.push(`${side}:${part}: ${String(e.message).slice(0, 300)}`));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('cot.locale', 'en-US'); } catch {} });
  const phone = part === 'phone';
  const viewportName = phone ? 'phone' : 'desktop';
  const ids = phone ? phoneIds : allIds;
  if (phone) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const shot = async (id, view) => {
    await page.mouse.move(2, 2); await settle(120);
    const stage = resolve(OUT, `${id}-${view}-${viewportName}.jpg`);
    const whole = resolve(OUT, `${id}-${view}-${viewportName}-page.jpg`);
    if (view === 'killcam') {
      await page.screenshot({ path: stage, type: 'jpeg', quality: 85 });
      receipts.shots.push(stage); log('shot', stage); return;
    }
    const el = await page.$('#viewport');
    await el.evaluate(node => node.scrollIntoView({ block: 'start' }));
    await settle(150);
    await el.screenshot({ path: stage, type: 'jpeg', quality: 85 });
    await page.screenshot({ path: whole, type: 'jpeg', quality: 85 });
    receipts.shots.push(stage, whole); log('shot', stage);
  };

  if (part === 'killcam') {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 240000, polling: 250 });
    for (const id of ids) {
      if (Date.now() - holdStart > HOLD_LIMIT_MS) { receipts.skipped.push(`${side}:${part}:${id}`); continue; }
      try {
        await page.evaluate(async (want) => { window.__DEBUG.selectGarageTank(want); await window.__DEBUG.stagePedestalTank(want); }, id);
        await page.waitForFunction(want => window.__DEBUG.selectedSpecId === want, { timeout: 60000 }, id);
        await page.evaluate(() => window.__SHOTS.set('killcam_xray'));
        await settle(2200);
        await shot(id, 'killcam');
      } catch (error) { receipts.errors.push(`${side}:${id}: ${String(error?.message || error).slice(0, 300)}`); log('error', id, error?.message); }
    }
    await page.close();
    return;
  }
  await page.goto(`${base}/gallery?id=${ids[0]}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__TANK_GALLERY?.ready, { timeout: 240000, polling: 250 });
  const api = (fn, ...a) => page.evaluate(fn, ...a);
  const anatomy = await api(() => typeof window.__TANK_GALLERY.waitAnatomyReady === 'function');
  const setView = async (view) => {
    const layer = { exterior: 'appearance', armor: 'armor', crew: 'crew', modules: 'modules', hitbox: 'modules' }[view];
    if (!anatomy) {
      const want = view === 'hitbox';
      const pressed = await page.$eval('[data-damage-action=hitboxes]', b => b.getAttribute('aria-pressed') === 'true').catch(() => null);
      if (pressed !== null && pressed !== want) { await page.click('[data-damage-action=hitboxes]'); await settle(400); }
      await api(m => window.__TANK_GALLERY.setMode(m, false), layer);
    } else {
      await api(m => window.__TANK_GALLERY.setMode(m, false), layer);
      await api(() => window.__TANK_GALLERY.waitAnatomyReady());
      if (layer === 'modules') await api(on => window.__TANK_GALLERY.setAnatomyToggle('hits', on), view === 'hitbox');
    }
    await api(() => window.__TANK_GALLERY.frameView('hero'));
    await settle(900);
    if (view === 'crew') {
      const box = await (await page.$('#viewport canvas')).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 5; i++) { await page.mouse.wheel({ deltaY: -120 }); await settle(60); }
      await settle(900);
    }
  };
  for (const id of ids) {
    if (Date.now() - holdStart > HOLD_LIMIT_MS) { receipts.skipped.push(`${side}:${part}:${id}`); continue; }
    try {
      await api(want => window.__TANK_GALLERY.loadTank(want), id);
      await page.waitForFunction(want => window.__TANK_GALLERY?.ready && window.__TANK_GALLERY.getState().selectedId === want, { timeout: 180000, polling: 250 }, id);
      await settle(1200);
      for (const view of views) {
        await setView(view);
        receipts.cameras[`${side}-${viewportName}-${id}-${view}`] = await api(() => window.__TANK_GALLERY.getState().camera);
        await shot(id, view);
      }
    } catch (error) { receipts.errors.push(`${side}:${part}:${id}: ${String(error?.message || error).slice(0, 300)}`); log('error', id, error?.message); }
  }
  await page.close();
}

try {
  browser = await puppeteer.launch({ channel: 'chrome', headless: true,
    args: swiftshader ? ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
      : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=metal', '--hide-scrollbars'] });
  for (const item of plan) {
    if (Date.now() - holdStart > HOLD_LIMIT_MS) { receipts.skipped.push(`${item.side}:${item.part}`); continue; }
    log('item', item.side, item.part);
    await captureItem(item);
  }
} catch (error) {
  receipts.errors.push(`fatal: ${String(error?.stack || error).slice(0, 600)}`);
  log('fatal', error?.stack || error);
}
log('done; held', ((Date.now() - holdStart) / 60000).toFixed(1), 'min; skipped', receipts.skipped.join(',') || 'none');
await shutdown(receipts.errors.some(e => e.startsWith('fatal')) ? 1 : 0);
