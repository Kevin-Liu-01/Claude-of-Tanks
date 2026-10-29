#!/usr/bin/env node
// The loading census (owner 2026-10-27: "lets ensure we have good loadin gstates for everything"; Main: every surface's
// loading state under a slow network, a cold cache and offline). Copyright (c) 2026 Kevin B. Liu. First-party tool;
// see NOTICE.md.
//
// For every row of src/ui/loadingSurfaceRegistry.ts, on a built dist, in a fresh browser context (a cold cache):
//   slow     Fast 3G (562.5 ms, 1.44 Mbit/s down, 675 kbit/s up) and a 4x CPU: a page row loads its document, an in-app
//            row presses its way in from the page at rest (the page itself booted at the same throttle, once);
//   offline  the page loads at full speed, then the network drops and the row presses its way in (or scrolls its box
//            into view): what it fetches after the shell cannot arrive.
// tools/loading-census-page.js follows each load from the press (or the navigation) until the row's content is ready
// and the census holds the less-is-more-web rules on it:
//   bare      the box stood painted but empty (no skeleton, poster, media or text) for most of a wait over 400 ms
//   spinner   a spinner turned where the box could have held a skeleton of its final layout
//   shift     layout shift during the load (CLS over 0.01 between the press and the content's settling)
//   pop       an image or video at least 64 px drawn at full opacity the frame it loaded (no fade, no hidden parent)
//   silent    a wait over 1 s that nothing announced (aria-busy, a status or progressbar, a live region with text); a
//             picture or a film arriving in a box that already reads (its text in) owes no announcement
//   blocked   a layer over most of the window covered the page's navigation links while the surface loaded
//   late      a site page's box painted more than a second after the page's first paint (its shell stood blank)
//   no-retry  offline, the content never came, no quiet retry state stood up within 15 s, and it did not come by itself
//             within 20 s of the network's return (an image that re-requests on 'online' is a quiet retry)
//   broken    offline, a broken image (a load error drawn as one) in view
// Every finding names the row's lane and owner, so the report routes itself (<out>/loading-census.json, by lane in
// <out>/loading-census.md). Exit 1 on any finding outside --allow (a comma list of `<row>:<rule>`).
//
//   node tools/loading-census.mjs --dist=<dir> --out=/absolute/new-dir [--conditions=slow,offline]
//     [--layouts=desktop,phone] [--only=<row>,...] [--pages=game,home,docs,gallery,404] [--allow=<row>:<rule>,...]
//     [--no-lock]
// One render-class capture hold (tools/capture-lock.mjs) for the run, with checkpoint() between rows and pages.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { LOADING_SURFACES } from '../src/ui/loadingSurfaceRegistry.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dist = option('dist') && resolve(option('dist'));
const out = option('out') && resolve(option('out'));
if (!dist || !out) throw new Error('Required: --dist=<built dist> --out=/absolute/new-dir');
if (existsSync(out)) throw new Error(`${out} exists: the census never overwrites an earlier run`);
mkdirSync(out, { recursive: true });
const CONDITIONS = option('conditions', 'slow,offline').split(',');
const LAYOUTS = option('layouts', 'desktop,phone').split(',');
const ONLY = option('only') ? new Set(option('only').split(',')) : null;
const PAGES = option('pages') ? new Set(option('pages').split(',')) : null;
const ALLOW = new Set(option('allow').split(',').filter(Boolean));
const LOCK = !process.argv.includes('--no-lock');
const PAGE_SCRIPT = readFileSync(join(HERE, 'loading-census-page.js'), 'utf8');
const LOG = join(out, 'loading-census.log');
const log = (line) => { console.log(line); appendFileSync(LOG, `${line}\n`); };

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// Chrome DevTools' Fast 3G preset (its throughputs are 90% of the nominal 1.6 Mbit/s and 750 kbit/s)
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024 / 8) * 0.9, uploadThroughput: (750 * 1024 / 8) * 0.9 };
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const ONLINE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const SLOW_CPU = 4;
const BOOT_TIMEOUT_MS = 12 * 60_000;
const ROW_TIMEOUT_MS = { slow: 180_000, offline: 15_000 };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
/** The links that navigate, per document (the census fails a layer that covers them while a surface loads). */
const NAV = { game: '.cot-nav .nv, .cot-boot-links a', studio: '.cot-studio button', site: 'nav.public-nav a[href]' };

const freePort = () => new Promise((done, fail) => {
  const probe = net.createServer(); probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});
async function serve() {
  const port = await freePort();
  const vercelJson = existsSync(join(dist, '..', 'vercel.json')) ? join(dist, '..', 'vercel.json') : join(HERE, '..', 'vercel.json');
  const child = spawn(process.execPath, [join(HERE, 'vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`, `--vercel-json=${vercelJson}`],
    { stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300 && !await fetch(origin).then(() => true, () => false); i++) await sleep(100);
  return { origin, stop: () => child.kill() };
}

/** The rows a run takes, by page, each page's document rows first. */
function plan() {
  const byPage = new Map();
  for (const [id, row] of Object.entries(LOADING_SURFACES)) {
    if (ONLY && !ONLY.has(id)) continue;
    if (PAGES && !PAGES.has(row.page)) continue;
    const list = byPage.get(row.page) ?? [];
    list.push({ id, ...row });
    byPage.set(row.page, list);
  }
  return byPage;
}

/** The documents whose first view is a page's own shell (the game's and the Studio's is the boot screen). */
const SITE_PAGES = new Set(['home', 'docs', 'docs-topic', 'docs-fleet', 'gallery', '404']);

/** The findings one row's timeline holds, under one condition. */
function judge(row, condition, t) {
  const found = [];
  const wait = t.readyMs === null ? null : t.readyMs - (t.boxMs ?? 0);
  if (condition === 'slow') {
    if (t.boxMs === null) found.push({ rule: 'bare', why: `the box never painted${t.boxSeen?.length ? `: ${t.boxSeen.join(' | ')}` : ' (no match)'}` });
    // a site document's box paints with its shell: one that stands blank behind a painted page for a second is late
    else if (row.document && SITE_PAGES.has(row.page) && t.fcp !== null && t.fcp !== undefined && t.boxMs - t.fcp > 1000) {
      found.push({ rule: 'late', why: `the page painted at ${t.fcp} ms and this box at ${t.boxMs} ms` });
    }
    else if ((wait === null || wait > 400) && t.waitSamples > 0 && t.bareSamples / t.waitSamples > 0.5) {
      found.push({ rule: 'bare', why: `the box stood empty for ${t.bareSamples} of ${t.waitSamples} samples (${wait ?? 'never'} ms to content)` });
    }
    if (t.spinnerSeen && !t.samples.some((s) => s.state.skeleton || s.state.poster)) found.push({ rule: 'spinner', why: 'a spinner and no skeleton or poster' });
    if (t.cls > 0.01) found.push({ rule: 'shift', why: `CLS ${t.cls}: ${t.shifts.flatMap((s) => s.sources.map((x) => x.node)).slice(0, 4).join(', ')}` });
    if (t.popped.length) found.push({ rule: 'pop', why: t.popped.slice(0, 3).map((m) => `${m.kind} ${m.src} at ${m.node}`).join('; ') });
    const pictures = /^(loaded|frame):/.test(row.ready);
    const reads = t.waitSamples > 0 && (t.textSamples ?? 0) / t.waitSamples >= 0.5;
    if ((wait === null || wait > 1000) && !t.announcedAs && !(pictures && reads)) {
      found.push({ rule: 'silent', why: `a ${wait ?? 'never-ending'} ms wait with no aria-busy, status or live region` });
    }
    if (t.covered && !row.modal) found.push({ rule: 'blocked', why: `${t.covered} covered the navigation` });
  } else {
    if (t.readyMs === null && !t.retry && t.recoveredMs == null) {
      found.push({ rule: 'no-retry', why: 'offline, no content and no retry state in 15 s, and none by itself 20 s after the network came back' });
    }
    if (t.broken.length) found.push({ rule: 'broken', why: t.broken.slice(0, 3).join(', ') });
  }
  return found.map((f) => ({ row: row.id, lane: row.lane, owner: row.owner, condition, ...f,
    allowed: ALLOW.has(`${row.id}:${f.rule}`) || Boolean(row.allow?.[f.rule]) }));
}

/** Presses a row's way in from the page at rest: each step in turn; a leading `?` presses one only when it shows, and
 *  `a || b` presses the first of its selectors that shows (a layout's own control: the desktop nav's Deploy, a phone's).
 *  A touch layout taps. A step that does not show within 10 s presses the one before it once more (a press a closing
 *  surface swallowed), then waits on. */
async function press(page, steps, touch = false) {
  const parse = (step) => {
    const optional = step.startsWith('?');
    return { optional, choices: (optional ? step.slice(1) : step).split(' || ').map((c) => c.trim()) };
  };
  // any visible match of any choice (a selector list's waitForSelector reads only its first match: the desktop nav's
  // hidden Deploy hid the phone's battle card)
  const shows = (choices, timeout) => page.waitForFunction((list) => list.some((sel) => [...document.querySelectorAll(sel)].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  })), { timeout, polling: 100 }, choices).then(() => true, () => false);
  // the first match in view of the first choice that has one (a hidden twin, a mobile menu's copy, is passed over)
  const pressOne = async (choices) => {
    for (const selector of choices) {
      for (const handle of await page.$$(selector)) {
        if (!await handle.isVisible().catch(() => false)) continue;
        await (touch ? handle.tap() : handle.click()).catch(() => handle.evaluate((el) => el.click()));
        return true;
      }
    }
    return false;
  };
  let before = null;
  for (const step of steps) {
    const { optional, choices } = parse(step);
    let shown = await shows(choices, optional ? 1500 : before ? 10_000 : 60_000);
    if (!shown && !optional && before) {
      await pressOne(before);
      shown = await shows(choices, 50_000);
    }
    if (!shown) {
      if (optional) continue;
      const seen = await page.evaluate((list) => list.flatMap((c) => window.__ls.diagnose(c)), choices).catch(() => []);
      throw new Error(`step ${choices.join(' || ')} never showed${seen.length ? `: ${seen.join(' | ')}` : ' (no match)'}`);
    }
    if (await pressOne(choices)) before = choices;
    await sleep(150);
  }
}
/** The selector a row's ready reads (its loaded:, frame: or gone: form's own). */
const readySelector = (ready) => /^(?:loaded|frame|gone):(.+)$/.exec(ready)?.[1] ?? ready;

async function pageRun(browser, origin, pageName, rows, layout, condition, rest) {
  const context = await browser.createBrowserContext(); // a cold cache: nothing cached, no storage
  const page = await context.newPage();
  const results = [];
  try {
    await page.setViewport(VIEWPORTS[layout]);
    if (VIEWPORTS[layout].isMobile) {
      await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36');
    }
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await page.evaluateOnNewDocument(PAGE_SCRIPT);
    await page.evaluateOnNewDocument(() => {
      Document.prototype.hasFocus = () => true; // the frame scheduler presents only to a focused document
      try { localStorage.setItem('cot.telemetry', 'off'); } catch { /* none */ }
    });
    const recipe = (r, key = 'open') => (Array.isArray(r[key]) ? r[key] : r[key]?.[layout]) ?? null;
    const touch = VIEWPORTS[layout].hasTouch;
    const scrolls = (r) => r.scroll === true || r.scroll === layout;
    const documentRows = rows.filter((r) => !r.open && !r.debug && !scrolls(r));
    // an in-app row whose layout has no recipe never shows there (a desktop-only trigger)
    const inAppRows = rows.filter((r) => (r.open || r.debug || scrolls(r)) && (!r.open || recipe(r)));
    const first = documentRows[0] ?? rows[0];
    if (condition === 'slow') {
      await cdp.send('Network.emulateNetworkConditions', FAST_3G);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW_CPU });
    }
    const url = `${origin}${first.path}${first.path.includes('?') ? '&' : '?'}telemetry=off`;
    log(`  ${pageName} ${layout} ${condition}: ${url}`);
    // the navigation runs on while its rows are watched from its start: wait only for the new document's instrument
    const navigation = page.goto(url, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS }).catch((error) => error);
    for (let i = 0; ; i++) {
      const ready = await page.evaluate(() => location.href !== 'about:blank' && !!window.__ls).catch(() => false);
      if (ready) break;
      if (i > 3000) throw new Error(`${url} never committed`);
      await sleep(100);
    }
    // the document rows, from the navigation's start, all at once (one watched after another would read its box from the
    // moment its watch began)
    const timelines = await Promise.all(documentRows.map((row) => page.evaluate((r, timeoutMs, nav) => window.__ls.watch({ box: r.box, ready: r.ready, nav, timeoutMs, since: 0 }),
      row, row.timeoutMs ?? (condition === 'slow' ? BOOT_TIMEOUT_MS : 120_000), NAV[pageName] ?? NAV.site).catch((error) => ({ error: String(error?.message ?? error) }))));
    for (const [index, row] of documentRows.entries()) {
      const t = timelines[index];
      if (t.error) { results.push({ row: row.id, layout, condition, error: t.error }); continue; }
      t.fcp = await page.evaluate(() => window.__ls.paints['first-contentful-paint'] ?? null);
      if (t.boxMs === null) t.boxSeen = await page.evaluate((b) => window.__ls.diagnose(b), row.box).catch(() => []);
      if (t.readyMs === null) t.readySeen = await page.evaluate((b) => window.__ls.diagnose(b), readySelector(row.ready)).catch(() => []);
      const findings = condition === 'slow' ? judge({ ...row, document: true }, condition, t) : [];
      results.push({ row: row.id, layout, condition, timeline: t, findings });
      log(`    ${row.id}: box ${t.boxMs} ms, ready ${t.readyMs} ms, fcp ${t.fcp}, cls ${t.cls}${findings.length ? ` -> ${findings.map((f) => f.rule).join(',')}` : ''}`);
    }
    const navigated = await navigation;
    if (navigated instanceof Error) results.push({ row: first.id, layout, condition, error: `navigation: ${String(navigated.message).slice(0, 200)}` });
    if (!inAppRows.length) return results;
    // the page at rest before any in-app row
    await page.waitForSelector(rest, { visible: true, timeout: BOOT_TIMEOUT_MS });
    await sleep(2000);
    if (condition === 'offline') await cdp.send('Network.emulateNetworkConditions', OFFLINE);
    let previous = null;
    for (const row of inAppRows) {
      // a row that starts from the one before it (the end of a battle) waits on that one's finish
      if (previous?.stays && !previous.finished) {
        results.push({ row: row.id, layout, condition, error: `needs ${previous.id}, which did not finish` });
        log(`    ${row.id}: SKIPPED, ${previous.id} did not finish`);
        previous = { id: row.id, stays: row.stays, finished: false };
        continue;
      }
      previous = { id: row.id, stays: row.stays, finished: false };
      try {
        const since = await page.evaluate(() => performance.now());
        // a debug expression through the protocol (the page's CSP refuses eval), a task later so the watch starts first
        if (row.debug) await page.evaluate(`setTimeout(() => { ${row.debug}; }, 0)`);
        if (recipe(row)) await press(page, recipe(row), touch);
        // a below-the-fold row: its box scrolled to the window's middle, the way a reader reaches it
        if (scrolls(row)) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center', behavior: 'instant' }), row.box);
        const t = await page.evaluate((r, timeoutMs, offline, s, nav) => window.__ls.watch({ box: r.box, ready: r.ready, nav, timeoutMs, offline, since: s, inBox: true }),
          row, condition === 'offline' ? ROW_TIMEOUT_MS.offline : row.timeoutMs ?? ROW_TIMEOUT_MS.slow, condition === 'offline', since, NAV[pageName] ?? NAV.site);
        if (t.boxMs === null) t.boxSeen = await page.evaluate((b) => window.__ls.diagnose(b), row.box).catch(() => []);
        if (t.readyMs === null) t.readySeen = await page.evaluate((b) => window.__ls.diagnose(b), readySelector(row.ready)).catch(() => []);
        // offline with no content and no retry: the network comes back, and the content may come by itself (an image that
        // re-requests on 'online'); then the network drops again for the next row
        if (condition === 'offline' && t.readyMs === null && !t.retry) {
          await cdp.send('Network.emulateNetworkConditions', ONLINE);
          const back = await page.evaluate(() => performance.now());
          const again = await page.evaluate((r, s) => window.__ls.watch({ box: r.box, ready: r.ready, timeoutMs: 20_000, since: s, inBox: true }), row, back)
            .catch(() => ({ readyMs: null }));
          t.recoveredMs = again.readyMs;
          await cdp.send('Network.emulateNetworkConditions', OFFLINE);
        }
        previous.finished = t.readyMs !== null;
        const findings = judge(row, condition, t);
        results.push({ row: row.id, layout, condition, timeline: t, findings });
        log(`    ${row.id}: box ${t.boxMs} ms, ready ${t.readyMs} ms, cls ${t.cls}${t.retry ? `, retry ${t.retry}` : ''}`
          + `${t.recoveredMs != null ? `, came by itself ${t.recoveredMs} ms after the network` : ''}${findings.length ? ` -> ${findings.map((f) => f.rule).join(',')}` : ''}`);
      } catch (error) {
        results.push({ row: row.id, layout, condition, error: String(error?.message ?? error).slice(0, 300) });
        log(`    ${row.id}: ERROR ${String(error?.message ?? error).slice(0, 200)}`);
      }
      // back to the page at rest for the next row: Escape while a surface the row opened stands (the stack's, or a native
      // dialog); an Escape on the bare Garage opens Settings, which then covered every later row's presses
      if (!row.stays) {
        for (let i = 0; i < 4; i++) {
          const open = await page.evaluate(() => (window.__cotSurfaces?.() ?? []).length + document.querySelectorAll('dialog[open]').length).catch(() => 0);
          if (!open) break;
          await page.keyboard.press('Escape').catch(() => {});
          await sleep(250);
        }
      }
      if (recipe(row, 'leave')) await press(page, recipe(row, 'leave'), touch).catch(() => {});
      // the next row starts from rest: no dialog or menu still open or closing
      if (!row.stays) {
        await page.waitForFunction(() => !document.querySelector('#cot-battle-menu.open, .cot-modal-root.is-open, dialog[open], .cot-tt, .cot-settings.open, .cot-garage[data-garage-panel="equipment"]'),
          { timeout: 5000, polling: 100 }).catch(() => {});
        await sleep(600);
      }
      if (LOCK) await lock.checkpoint();
    }
    if (condition === 'offline') await cdp.send('Network.emulateNetworkConditions', ONLINE);
    return results;
  } finally {
    await context.close().catch(() => {});
  }
}

const lock = createCaptureLock();
const report = { dist, at: new Date().toISOString(), conditions: CONDITIONS, layouts: LAYOUTS, results: [] };
let server = null, browser = null, refresh = null;
try {
  server = await serve();
  if (LOCK) await lock.acquire(240 * 60_000, { place: 'loading-census', lockClass: 'render' });
  refresh = LOCK ? setInterval(() => lock.refresh(), 30_000) : null;
  for (const [pageName, rows] of plan()) {
    for (const layout of LAYOUTS) {
      try {
        browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 1_200_000, defaultViewport: null,
          args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1460,1000'] },
          { label: `loading-census-${pageName}-${layout}` });
        for (const condition of CONDITIONS) {
          const rowsHere = rows.filter((r) => condition === 'slow' || r.offline !== false);
          // the page at rest: its row's rest (read from every row of the page, so an --only run of in-app rows still finds
          // the Garage's), or its first row's box
          const rest = Object.values(LOADING_SURFACES).find((r) => r.page === pageName && r.rest)?.rest ?? rows[0].box;
          // a page that cannot run records why and the census goes on: one run reports every page
          if (rowsHere.length) {
            try { report.results.push(...await pageRun(browser, server.origin, pageName, rowsHere, layout, condition, rest)); } catch (error) {
              report.results.push({ row: rowsHere[0].id, layout, condition, error: `page ${pageName}: ${String(error?.message ?? error).slice(0, 300)}` });
              log(`  ${pageName} ${layout} ${condition}: ERROR ${String(error?.message ?? error).slice(0, 200)}`);
            }
          }
          writeFileSync(join(out, 'loading-census.json'), JSON.stringify(report, null, 2));
        }
      } finally {
        await browser?.close().catch(() => {});
        browser = null;
      }
      if (LOCK) await lock.checkpoint();
    }
  }
} finally {
  if (refresh) clearInterval(refresh);
  await browser?.close().catch(() => {});
  server?.stop();
  if (LOCK) { try { lock.release(); } catch { /* reaped once this process exits */ } }
  writeFileSync(join(out, 'loading-census.json'), JSON.stringify(report, null, 2));
}

// the report by lane: each lane's findings with the evidence that routes them
const findings = report.results.flatMap((r) => (r.findings ?? []).map((f) => ({ ...f, layout: r.layout })));
const errors = report.results.filter((r) => r.error);
const byLane = new Map();
for (const f of findings) byLane.set(f.lane, [...(byLane.get(f.lane) ?? []), f]);
const md = [`# Loading census ${report.at}`, '', `dist ${dist}; conditions ${CONDITIONS.join(', ')}; layouts ${LAYOUTS.join(', ')}`, ''];
for (const [lane, list] of [...byLane].sort()) {
  md.push(`## ${lane}`, '');
  for (const f of list) md.push(`- ${f.allowed ? '(allowed) ' : ''}**${f.row}** ${f.rule} (${f.condition}, ${f.layout}; ${f.owner}): ${f.why}`);
  md.push('');
}
if (errors.length) { md.push('## rows that could not run', ''); for (const e of errors) md.push(`- **${e.row}** (${e.condition}, ${e.layout}): ${e.error}`); md.push(''); }
writeFileSync(join(out, 'loading-census.md'), `${md.join('\n')}\n`);
const failing = findings.filter((f) => !f.allowed);
log(`loading-census: ${report.results.length} row runs, ${findings.length} findings (${failing.length} not allowed), ${errors.length} errors; ${join(out, 'loading-census.md')}`);
process.exit(failing.length || errors.length ? 1 : 0);
