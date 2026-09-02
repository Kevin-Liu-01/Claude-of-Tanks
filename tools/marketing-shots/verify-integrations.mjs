// tools/marketing-shots/verify-integrations.mjs — proof pass for the
// marketing-shot integrations:
//   1. SPLASH: forces the real splash (__COT_FORCE_SPLASH), samples its hero
//      opacity frame by frame, and screenshots it. Asserts the decoded image
//      fades over the stable first paint without restoring the grid or replayed
//      boot-chrome entrance animations.
//   2. GARAGE: boots to the garage (webdriver gate skip), waits for the
//      featured panel's first still, screenshots the garage.
//   3. OG: asserts public/brand/og-image.png exists at 1200x630.
//
// Usage: node tools/marketing-shots/verify-integrations.mjs
// Output: shots/marketing/integration/{splash,garage}.png + console report.
// Shares the cot-shots FIFO lock. Own vite on a 7xxx port (NEVER 5001/5002).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import {
  mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync,
  utimesSync, readFileSync, existsSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

// --- exclusive harness lock (FIFO ticket protocol, see screenshot.mjs) ------
const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;
function ticketPid(name) {
  const m = name.match(/-(\d+)\.t$/);
  return m ? parseInt(m[1], 10) : -1;
}
function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const myTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, myTicket), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch (_) { names = [myTicket]; }
      for (const n of names) {
        if (n === myTicket) { head = head || n; break; }
        let stale = false;
        try { stale = Date.now() - statSync(join(QUEUE_DIR, n)).mtimeMs > TICKET_STALE_MS; } catch (_) { continue; }
        if (stale || !ticketAlive(n)) { try { unlinkSync(join(QUEUE_DIR, n)); } catch (_) { /* raced */ } continue; }
        head = n; break;
      }
      if (head === myTicket) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { rmdirSync(LOCK_DIR); continue; }
        } catch (_) { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((r) => setTimeout(r, head === myTicket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, myTicket)); } catch (_) { /* fine */ }
  }
}
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}
await acquireLock(30 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
}, 60 * 1000);
lockRefresher.unref();

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = join(ROOT, 'shots/marketing/integration');
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { port: 7300 + Math.floor(Math.random() * 500), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[verify] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

const failures = [];
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!cond) failures.push(name);
};

// --- 1. stable cold splash ----------------------------------------------------
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    window.__COT_FORCE_SPLASH = true;
    window.__COT_BOOT_ANIMATIONS = [];
    window.__COT_BOOT_HERO_SAMPLES = [];
    document.addEventListener('animationstart', (event) => {
      if (event.target instanceof Element && event.target.closest('#cot-boot')) {
        window.__COT_BOOT_ANIMATIONS.push(event.animationName);
      }
    }, true);
    document.addEventListener('DOMContentLoaded', () => {
      let frames = 0;
      const sample = () => {
        const hero = document.getElementById('cot-boot-hero');
        const layers = hero ? [...hero.querySelectorAll('.hly')] : [];
        window.__COT_BOOT_HERO_SAMPLES.push({
          state: hero?.dataset.heroState || 'missing',
          layers: layers.map((layer) => ({
            src: layer.currentSrc || layer.getAttribute('src') || '',
            opacity: Number.parseFloat(getComputedStyle(layer).opacity),
            complete: layer.complete,
            naturalWidth: layer.naturalWidth,
          })),
        });
        frames += 1;
        if (frames < 900 && document.getElementById('cot-boot')) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { once: true });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 }).catch(() => {});
  await page.waitForFunction(() => {
    const layer = document.querySelector('#cot-boot-hero[data-hero-state="visible"] .hly.on');
    return !!(layer && layer.complete && layer.naturalWidth > 0);
  }, { timeout: 30000 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const splashState = await page.evaluate(() => {
    const g = document.getElementById('cot-boot-gate');
    const boot = document.getElementById('cot-boot');
    const hero = document.getElementById('cot-boot-hero');
    const layers = hero ? [...hero.querySelectorAll('.hly')] : [];
    const samples = window.__COT_BOOT_HERO_SAMPLES || [];
    const flatSamples = samples.flatMap((sample) => sample.layers || []);
    return {
      gateArmed: !!(g && g.classList.contains('on')),
      heroVisible: hero?.dataset.heroState === 'visible' &&
        layers.filter((layer) => layer.classList.contains('on')).length === 1 &&
        layers.some((layer) => layer.classList.contains('on') && layer.complete &&
          layer.naturalWidth > 0 && Number.parseFloat(getComputedStyle(layer).opacity) > 0.98),
      heroStagedHidden: flatSamples.some((sample) => sample.src && sample.complete &&
        sample.naturalWidth > 0 && sample.opacity <= 0.01),
      heroCrossfaded: flatSamples.some((sample) => sample.src &&
        sample.opacity > 0.05 && sample.opacity < 0.95),
      gridAbsent: !!boot && getComputedStyle(boot, '::after').content === 'none',
      oneShotChrome: (() => {
        const entrances = window.__COT_BOOT_ANIMATIONS.filter((name) =>
          ['cot-boot-pop', 'cot-boot-rise', 'cot-boot-fade'].includes(name));
        const count = (name) => entrances.filter((entry) => entry === name).length;
        return count('cot-boot-pop') === 1 && count('cot-boot-rise') === 6 &&
          count('cot-boot-fade') === 1 && boot?.dataset.entranceState === 'complete' &&
          !boot.classList.contains('cot-boot-enter');
      })(),
    };
  });
  check('splash: press-any-key gate armed', splashState.gateArmed);
  check('splash: decoded marketing backdrop visible', splashState.heroVisible);
  check('splash: decoded frame staged while hidden', splashState.heroStagedHidden);
  check('splash: backdrop enters through a real opacity crossfade', splashState.heroCrossfaded);
  check('splash: requested grid remains absent', splashState.gridAbsent);
  check('splash: chrome entrance plays exactly once without replay', splashState.oneShotChrome);
  await page.screenshot({ path: join(OUT, 'splash.png') });
  console.log(`[verify] wrote ${join(OUT, 'splash.png')}`);
  await page.close();
}

// --- 2. garage with featured panel -------------------------------------------
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const panelOn = await page
    .waitForFunction(() => {
      const ly = document.querySelector('.cot-featured .fly.on');
      return !!(ly && ly.style.backgroundImage);
    }, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check('garage: featured panel showing a still', panelOn);
  const caption = await page.evaluate(() => {
    const c = document.querySelector('.cot-featured .fcap');
    return c ? c.textContent : '';
  });
  check('garage: featured caption populated', !!caption, caption);
  const portraitAudit = await page.evaluate(async () => {
    const { auditPortraitPixels } = await import('/src/ui/portraitFraming.ts');
    const cards = [...document.querySelectorAll('.cot-card[data-spec-id]')];
    const loadImage = (src) => new Promise((resolveImage, rejectImage) => {
      const image = new Image();
      image.onload = () => resolveImage(image);
      image.onerror = () => rejectImage(new Error(`garage portrait failed to load: ${src}`));
      image.src = src;
    });
    const measure = async (card) => {
      const element = card.querySelector('img.ti');
      // Offscreen cards deliberately have no src until the portrait observer
      // sees them. Audit their shipped production asset directly instead of
      // scrolling the rail 125 times and perturbing the screenshot state.
      const source = element.src || `${location.origin}/icons/thumbs/${card.dataset.specId}_angle.webp`;
      const image = await loadImage(source);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const result = auditPortraitPixels(pixels, canvas.width, canvas.height);
      return {
        id: card.dataset.specId,
        width: result.displayedFullWidth,
        height: result.displayedFullHeight,
        passes: result.passes,
      };
    };
    const portraits = await Promise.all(cards.map(measure));
    const widths = portraits.map((portrait) => portrait.width);
    const targets = Object.fromEntries(
      portraits
        .filter((portrait) => ['t90sm', 't90a_burlak', 't90ms'].includes(portrait.id))
        .map((portrait) => [portrait.id, portrait.width]),
    );
    return {
      count: portraits.length,
      minimumWidth: Math.min(...widths),
      maximumWidth: Math.max(...widths),
      allPass: portraits.every((portrait) => portrait.passes),
      targets,
      titleBottom: getComputedStyle(cards[0].querySelector('.nm')).bottom,
    };
  });
  check(
    'garage: all production portraits share the fleet framing envelope',
    portraitAudit.count >= 125
      && portraitAudit.allPass
      && portraitAudit.minimumWidth >= 90
      && portraitAudit.maximumWidth <= 122,
    `${portraitAudit.count} tanks, ${portraitAudit.minimumWidth.toFixed(1)}-${portraitAudit.maximumWidth.toFixed(1)} px`,
  );
  const targetWidths = Object.values(portraitAudit.targets);
  check(
    'garage: Tagil and Burlak retain T-90-family visual weight',
    targetWidths.length === 3
      && Math.min(...targetWidths) >= 100
      && Math.max(...targetWidths) - Math.min(...targetWidths) <= 12,
    JSON.stringify(portraitAudit.targets),
  );
  check('garage: tank titles keep the card bottom inset', portraitAudit.titleBottom === '8px', portraitAudit.titleBottom);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: join(OUT, 'garage.png') });
  console.log(`[verify] wrote ${join(OUT, 'garage.png')}`);
  await page.close();
}

// --- 3. og image --------------------------------------------------------------
{
  const og = join(ROOT, 'public/brand/og-image.png');
  let dims = null;
  if (existsSync(og)) {
    const buf = readFileSync(og);
    if (buf.length >= 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
      dims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), kb: Math.round(buf.length / 1024) };
    }
  }
  check('og: public/brand/og-image.png is a 1200x630 PNG',
    !!dims && dims.w === 1200 && dims.h === 630,
    dims ? `${dims.w}x${dims.h}, ${dims.kb} KB` : 'missing');
}

await browser.close();
await server.close();
if (failures.length) {
  console.error(`[verify] ${failures.length} failure(s): ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('[verify] all integration checks green');
