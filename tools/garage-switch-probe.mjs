// tools/garage-switch-probe.mjs — garage tank-switch CONVERGENCE probe
// (switch-desync r1).
//
// Reproduces the live desync: rapid carousel selection could leave the
// pedestal showing the PREVIOUS tank (or an empty stage) while the stats
// card + card highlight already show the new selection, and the final
// selection never received a __SWITCH_TIMINGS row.
//
// Phase A (desync): per round, clicks 20 random REAL carousel cards (plus
//   occasional era-chip hops across all three groups) at 50-150 ms intervals
//   through actual mouse input, then asserts convergence:
//     __DEBUG.pedestalVisual.specId === __DEBUG.selectedSpecId
//       === the DOM '.cot-card.sel' dataset.specId,
//     pedestal root attached + visible + has children + at stage pose.
//   An in-page 90 ms sampler also fails the round if the stage is EVER
//   observed empty (no visible tank root on the pedestal) mid-scrub.
//   On failure the __PED_TRACE / __SWITCH_TIMINGS tails are dumped.
//
// Phase B (slow clicks): single selections at a human 1.2 s cadence must
//   still be instant on the warm/procedural paths (median guarded).
//
// Phase C (zero-viewport boot): boots the game with innerWidth/innerHeight
//   stubbed to 0 and #app collapsed (embedded-pane layout), restores the
//   layout WITHOUT dispatching a window resize event, and asserts the canvas
//   recovers to a non-zero size (the boot-hardening guard, not the resize
//   event, must fix it).
//
// Usage:
//   node tools/garage-switch-probe.mjs [--rounds 10] [--clicks 20] [--seed N]
//                                      [--root <dir>] [--skip-c] [--skip-a]
//
// Exit 0 = all phases pass.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const has = (name) => args.includes(`--${name}`);
const root = opt('root', process.cwd());
const ROUNDS = parseInt(opt('rounds', '10'), 10);
const CLICKS = parseInt(opt('clicks', '20'), 10);
const SEED = parseInt(opt('seed', String((Date.now() % 100000) | 0)), 10);

// deterministic per-run rng (seed printed for replays)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({
  root,
  logLevel: 'error',
  // own 7xxx port band (never 5001/5002 — those belong to the shared servers)
  server: { port: 7100 + Math.floor(rng() * 300), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[garage-switch-probe] vite up at ${url} (root ${root}, seed ${SEED})`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

let failures = 0;

// ---------------------------------------------------------------------------
// Phase A + B: switch convergence under rapid REAL clicks
// ---------------------------------------------------------------------------
async function phaseAB() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // boot splash subtitle: derived numbers must have replaced the stale
  // hardcoded '48 Vehicles · 4 Battlefields' line (window.__BOOT_TAG mirrors
  // the derived text so the check is immune to splash-teardown timing).
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const bootTag = await page.evaluate(() => window.__BOOT_TAG || null);
  if (!bootTag || /^48 Vehicles .+ 4 Battlefields/.test(bootTag) || !/^\d+ Vehicles · \d+ Battlefields · Tiers [IVX]+–[IVX]+$/.test(bootTag)) {
    console.error(`  [FAIL] boot splash subtitle not derived: ${JSON.stringify(bootTag)}`);
    failures++;
  } else {
    console.log(`  boot subtitle: "${bootTag}"`);
  }

  // boot hero settled on stage before the clock starts
  await page.waitForFunction(() => {
    const D = window.__DEBUG;
    const v = D && D.pedestalVisual;
    return !!(v && v.root.visible !== false);
  }, { timeout: 60000, polling: 100 });
  await sleep(2500); // post-ready idle (prefetch/thumb queue) — part of the SUT

  // in-page empty-stage sampler: any observed frame with NO visible tank on
  // the pedestal is a violation (the outgoing hero is supposed to cover until
  // the incoming reveals — the stage must never be bare).
  await page.evaluate(() => {
    window.__EMPTY_STAGE = {
      samples: 0, empty: 0, spans: [],
      reset() { this.samples = 0; this.empty = 0; this.spans.length = 0; this._start = 0; },
      _start: 0,
    };
    setInterval(() => {
      const D = window.__DEBUG;
      if (!D || !D.scene || D.game.phase !== 'garage') return;
      const E = window.__EMPTY_STAGE;
      E.samples++;
      let occupied = false;
      for (const c of D.scene.children) {
        if (!c.name || !c.name.startsWith('tank_')) continue;
        if (c.visible === false) continue;
        if (Math.abs(c.position.x + 1500) > 4 || Math.abs(c.position.z + 1500) > 4) continue;
        if (c.position.y < -80) continue; // parked heroes live 200 m down
        occupied = true;
        break;
      }
      const now = Math.round(performance.now());
      if (!occupied) {
        E.empty++;
        if (!E._start) E._start = now;
      } else if (E._start) {
        const v = D.pedestalVisual;
        E.spans.push({
          from: E._start, ms: now - E._start,
          pv: v ? `${v.specId}${v.root.visible === false ? '/hidden' : ''}` : null,
        });
        E._start = 0;
      }
    }, 90);
  });

  const clickTarget = async (kind) => {
    // pick + instant-scroll the target in-page, then real mouse click on it
    const box = await page.evaluate((k, r1, r2) => {
      let el = null;
      if (k === 'chip') {
        const chips = [...document.querySelectorAll('.cot-era-chip')];
        el = chips[(r1 * chips.length) | 0];
      } else {
        const cards = [...document.querySelectorAll('.cot-card')]
          .filter((c) => c.style.display !== 'none');
        el = cards[(r1 * cards.length) | 0];
      }
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'center' }); // instant
      const b = el.getBoundingClientRect();
      return {
        x: b.left + b.width * (0.35 + r2 * 0.3),
        y: b.top + b.height * (0.35 + r2 * 0.3),
        id: el.dataset.specId || el.dataset.era || '?',
      };
    }, kind, rng(), rng());
    if (!box) return null;
    await page.mouse.click(box.x, box.y);
    return box.id;
  };

  const converged = () => page.evaluate(() => {
    const D = window.__DEBUG;
    const sel = D.selectedSpecId;
    const dom = document.querySelector('.cot-card.sel');
    const domId = dom ? dom.dataset.specId : null;
    const v = D.pedestalVisual;
    const ok = !!(v && sel && v.specId === sel && domId === sel &&
      v.root.parent && v.root.visible !== false && v.root.children.length > 0 &&
      Math.abs(v.root.position.x + 1500) < 4 && Math.abs(v.root.position.z + 1500) < 4 &&
      v.root.position.y > -80);
    return {
      ok, sel, domId,
      pv: v ? {
        id: v.specId, visible: v.root.visible !== false,
        y: +v.root.position.y.toFixed(1), attached: !!v.root.parent,
        children: v.root.children.length,
      } : null,
    };
  });

  // --- Phase A: rapid-click rounds ---
  console.log(`[phase A] ${ROUNDS} rounds x ${CLICKS} rapid clicks (50-150 ms)`);
  let roundsFailed = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    await page.evaluate(() => window.__EMPTY_STAGE.reset());
    let lastId = '?';
    for (let i = 0; i < CLICKS; i++) {
      const kind = rng() < 0.18 ? 'chip' : 'card';
      const id = await clickTarget(kind);
      if (id) lastId = `${kind}:${id}`;
      await sleep(50 + Math.floor(rng() * 100));
    }
    // convergence: authored procedural builds can still span several frames
    const t0 = Date.now();
    let state = await converged();
    while (!state.ok && Date.now() - t0 < 10000) {
      await sleep(150);
      state = await converged();
    }
    const emptiness = await page.evaluate(() => {
      const E = window.__EMPTY_STAGE;
      return { empty: E.empty, spans: E.spans.slice(-6) };
    });
    const emptyBad = emptiness.empty > 0;
    if (!state.ok || emptyBad) {
      roundsFailed++;
      failures++;
      console.error(`  round ${round}: FAIL (last click ${lastId})`);
      console.error(`    selected=${state.sel} domSel=${state.domId} pedestal=${JSON.stringify(state.pv)}`);
      if (emptyBad) console.error(`    EMPTY STAGE observed: ${emptiness.empty} samples, spans(ms)=${JSON.stringify(emptiness.spans)}`);
      const trace = await page.evaluate(() => (window.__PED_TRACE || []).slice(-40));
      console.error('    __PED_TRACE tail:');
      for (const r of trace) console.error(`      ${JSON.stringify(r)}`);
      const tim = await page.evaluate(() => (window.__SWITCH_TIMINGS || []).slice(-8));
      console.error(`    __SWITCH_TIMINGS tail: ${JSON.stringify(tim)}`);
    } else {
      console.log(`  round ${round}: ok (converged on ${state.sel}, pedestal ${state.pv.id}, empty-samples 0)`);
    }
    await sleep(400);
  }
  console.log(`[phase A] ${ROUNDS - roundsFailed}/${ROUNDS} rounds converged`);

  // --- Phase B: slow single clicks stay instant ---
  console.log('[phase B] slow single clicks (1.2 s cadence) stay instant');
  await sleep(1500);
  const slowMs = [];
  for (let i = 0; i < 8; i++) {
    const t0 = Date.now();
    await clickTarget('card');
    let state = await converged();
    while (!state.ok && Date.now() - t0 < 12000) {
      await sleep(30);
      state = await converged();
    }
    const ms = Date.now() - t0;
    slowMs.push(state.ok ? ms : -1);
    if (!state.ok) {
      failures++;
      console.error(`  slow click ${i + 1}: FAIL — never converged (${JSON.stringify(state)})`);
    }
    await sleep(1200);
  }
  const okMs = slowMs.filter((m) => m >= 0).sort((a, b) => a - b);
  const median = okMs.length ? okMs[Math.floor(okMs.length / 2)] : -1;
  console.log(`  slow-click reveal ms: ${slowMs.join(', ')} (median ${median})`);
  // warm/procedural switches measure 20-70 ms; the round-trip overhead of the
  // probe adds ~10-40 ms. Cold GLBs may legitimately take longer; the median
  // over 8 mostly-warm revisits is the guard.
  if (median < 0 || median > 600) {
    failures++;
    console.error(`  [FAIL] slow-click median ${median} ms (budget 600)`);
  }

  if (pageErrors.length) {
    failures++;
    console.error(`[phase A/B] PAGE ERRORS (${pageErrors.length}):`);
    for (const e of pageErrors.slice(0, 6)) console.error('  - ' + e);
  }
  await page.close();
}

// ---------------------------------------------------------------------------
// Phase C: zero-size-viewport boot hardening
// ---------------------------------------------------------------------------
async function phaseC() {
  console.log('[phase C] zero-viewport boot -> layout restore (no resize event)');
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    // simulate an embedded pane that lays out at 0x0 during boot: window
    // metrics AND element client sizes report zero until "restored".
    // (Prototype getter stubs are timing-proof — a <style> injected at
    // DOMContentLoaded lands AFTER module scripts have already measured.)
    const cw = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    const chh = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 0 });
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return 0; } });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get() { return 0; } });
    window.__RESTORE_VIEWPORT = () => {
      delete window.innerWidth;   // configurable stubs — native accessors return
      delete window.innerHeight;
      Object.defineProperty(Element.prototype, 'clientWidth', cw);
      Object.defineProperty(Element.prototype, 'clientHeight', chh);
      const st = document.getElementById('zero-vp-style');
      if (st) st.remove();        // real layout change -> ResizeObserver path
      // deliberately NO window resize event: the boot guard must recover alone
    };
    addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.id = 'zero-vp-style';
      st.textContent = '#app{position:fixed !important;width:0 !important;height:0 !important;overflow:hidden !important;}';
      document.head.appendChild(st);
    });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 150000 });
  const before = await page.evaluate(() => {
    const c = document.querySelector('#app canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  console.log(`  canvas during 0-viewport boot: ${JSON.stringify(before)}`);
  if (before && before.w > 2 && before.h > 2) {
    console.log('  (canvas already non-zero at boot — stub did not take; phase inconclusive)');
  }
  await page.evaluate(() => window.__RESTORE_VIEWPORT());
  let after = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    after = await page.evaluate(() => {
      const c = document.querySelector('#app canvas');
      return c ? { w: c.width, h: c.height } : null;
    });
    if (after && after.w > 2 && after.h > 2) break;
    await sleep(150);
  }
  console.log(`  canvas after layout restore (no resize event): ${JSON.stringify(after)}`);
  if (!after || after.w <= 2 || after.h <= 2) {
    failures++;
    console.error('  [FAIL] canvas stayed zero-sized — boot guard missing/inert');
  } else {
    console.log('  recovered without a resize event: ok');
  }
  const fatal = pageErrors.filter((e) => !/WebGL|GL_|framebuffer/i.test(e));
  if (fatal.length) {
    failures++;
    console.error(`[phase C] PAGE ERRORS (${fatal.length}):`);
    for (const e of fatal.slice(0, 6)) console.error('  - ' + e);
  }
  await page.close();
}

try {
  if (!has('skip-a')) await phaseAB();
  if (!has('skip-c')) await phaseC();
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `[garage-switch-probe] FAIL (${failures} failure(s))` : '[garage-switch-probe] PASS');
process.exit(failures ? 1 : 0);
