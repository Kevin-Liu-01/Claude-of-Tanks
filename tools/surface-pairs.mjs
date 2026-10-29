// surface-pairs.mjs — the transient-surface census in the browser (owner 2026-10-27: "what if i have equipment open and
// select consumables, the old surface needs to go away while new one comes in"). Copyright © 2026 Kevin B. Liu.
//
// Against an ALREADY SERVED build, for every pair of transient surfaces (src/ui/transientSurfaceRegistry.ts) reachable
// together on a page: from rest, open A by its recipe, then press B's control once, and fail unless B is open on the
// page's surface stack (src/ui/components/surfaceStack.ts) with A gone (or under it, when B stands on A), the focus in B,
// and nothing left behind: no other surface's box in view, no stray aria-expanded, no inert, no scroll lock, no leftover
// picker-open. Beside the pairs: Escape order (the top one, then the one under it), a tank switch, the nav's Deploy, a
// resize or a rotation, the language switch and a battle start, each with a surface open. Each layout runs in a fresh
// guarded browser (tools/browser-launch.mjs), one at a time.
//
//   node tools/surface-pairs.mjs --url=http://127.0.0.1:4173 --out=/absolute/new-dir
//     [--layouts=docked,folded,pane] [--langs=en,zh] [--pages=game,gallery] [--only=<id>,...] [--battle]
// 'docked' is a desktop (1440x900), 'folded' a touch phone (390x844), 'pane' a short window under a mouse (800x600): the last
// two fold the Garage's panels and take the registry's folded recipes. 'tablet' is an iPad held wide (1180x820, touch, docked;
// turned, upright 820x1180). A recipe whose first control a size never shows is
// skipped there; every row the run's recipes name must open at one size at least.
// Exit 1 on any failure; the report is <out>/surface-pairs.json, the log <out>/surface-pairs.log.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { TRANSIENT_SURFACES } from '../src/ui/transientSurfaceRegistry.ts';

const option = (name, fallback = '') => process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = option('url').replace(/\/$/, '');
const out = option('out') && resolve(option('out'));
if (!base || !out) throw new Error('Required: --url=http(s)://served-build --out=/absolute/new-dir');
if (existsSync(out)) throw new Error(`${out} exists: the census never overwrites an earlier run`);
mkdirSync(out, { recursive: true });
const LAYOUTS = option('layouts', 'docked,folded,pane').split(',');
const LANGS = option('langs', 'en').split(',');
const PAGES = option('pages', 'game,gallery,home').split(',');
const ONLY = option('only') ? new Set(option('only').split(',')) : null;
const BATTLE = process.argv.includes('--battle');

const VIEWPORTS = {
  docked: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  folded: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  pane: { width: 800, height: 600, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  // an iPad held wide (item 262): a touch screen with the docked panels, tapped through hasTouch
  tablet: { width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const TURNED = { docked: { width: 1024, height: 600 }, folded: { width: 844, height: 390 }, pane: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180 } };
/** The registry's recipes a run's size takes. */
const RECIPES = { docked: 'docked', folded: 'folded', pane: 'folded', tablet: 'docked' };
const opened = new Set();
const absent = new Map();
const PAGE_SCREENS = { game: ['garage', 'deploy', 'settings'], gallery: ['gallery'], home: ['site'] };
const PAGE_PATH = { game: '/?nosplash=1', gallery: '/gallery', home: '/home' };
const PAGE_READY = { game: '[data-compare]', gallery: '#rivalMenu', home: '[data-trailer-open]' };
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => { console.log(line); appendFileSync(`${out}/surface-pairs.log`, `${line}\n`); };

const rows = Object.entries(TRANSIENT_SURFACES).map(([id, row]) => ({ id, ...row }));
const rowById = new Map(rows.map((row) => [row.id, row]));
let layoutNow = 'docked';
/** The surface `id` stands on in this layout. */
const onOf = (id) => { const on = rowById.get(id)?.on; return typeof on === 'string' ? on : on?.[layoutNow]; };
/** The surfaces under and including `id`, bottom to top. */
const chain = (id) => { const on = onOf(id); return on ? [...chain(on), id] : [id]; };
const strip = (step) => step.replace(/^\?/, '');

// the page's vite client never reloads a census page, and the recovery watchdogs (15 s and longer) never fire under it
const holds = () => {
  const Native = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const list = [].concat(protocols ?? []);
    if (list.includes('vite-hmr') || /[?&]token=/.test(String(url))) { const t = new EventTarget(); t.readyState = 0; t.send = () => {}; t.close = () => {}; return t; }
    return new Native(url, protocols);
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, prototype: Native.prototype });
  const native = window.setTimeout;
  window.setTimeout = function (fn, ms, ...args) { return Number(ms) >= 15000 ? 0 : native.call(window, fn, ms, ...args); };
};

/** In the page: the stack, every row's box in view, the focus's surface, the stray state. */
const readState = (boxes, owned) => {
  const shown = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const open = Object.fromEntries(Object.entries(boxes).map(([id, sel]) => [id, shown(sel)]));
  const focusIn = Object.entries(boxes).filter(([, sel]) => document.querySelector(sel)?.contains(document.activeElement)).map(([id]) => id);
  const openBoxes = Object.entries(boxes).filter(([id]) => open[id]).map(([, sel]) => document.querySelector(sel));
  const stray = [...document.querySelectorAll('[aria-expanded="true"]')].filter((el) => {
    if (!el.getClientRects().length) return false;
    if (openBoxes.some((box) => box?.contains(el))) return false;
    if (owned.some((sel) => { try { return el.matches(sel) || !!el.closest(sel); } catch { return false; } })) return false;
    const controls = el.getAttribute('aria-controls');
    const target = controls && document.getElementById(controls);
    return !(target && target.getClientRects().length && target.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  }).map((el) => el.className?.toString().split(' ')[0] || el.tagName.toLowerCase());
  return {
    stack: window.__cotSurfaces?.() ?? null,
    open,
    focusIn,
    stray,
    // (a decorative copy is inert by design, hidden from assistive tech: the hero card's clone)
    inert: document.querySelectorAll('[inert]:not([aria-hidden="true"])').length,
    scrollLock: document.body.style.overflow === 'hidden',
    modalOpen: !!document.querySelector('.cot-modal-root.is-open'),
    pickerOpen: !!document.querySelector('.cot-garage.picker-open'),
    viewport: [innerWidth, innerHeight],
    boxes: Object.fromEntries(Object.entries(boxes).filter(([id]) => open[id]).map(([id, sel]) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return [id, [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]];
    })),
  };
};

const failures = [];
const report = [];
function judge(context, state, expected, { focus = expected.at(-1), within = false } = {}) {
  const problems = [];
  if (JSON.stringify(state.stack) !== JSON.stringify(expected)) problems.push(`stack ${JSON.stringify(state.stack)} (expected ${JSON.stringify(expected)})`);
  for (const [id, shown] of Object.entries(state.open)) {
    if (shown && !expected.includes(id)) problems.push(`${id} left in view`);
    if (!shown && expected.includes(id)) problems.push(`${id} not in view`);
  }
  if (focus && !state.focusIn.includes(focus)) problems.push(`focus not in ${focus} (in ${state.focusIn.join(',') || 'none'})`);
  if (state.stray.length) problems.push(`stray aria-expanded: ${state.stray.join(', ')}`);
  if (state.inert) problems.push(`${state.inert} inert`);
  if (state.scrollLock && !state.modalOpen) problems.push('body scroll lock with no modal');
  const pickers = expected.some((id) => id === 'garage-equipment' || id === 'garage-consumables');
  if (state.pickerOpen !== pickers) problems.push(`picker-open ${state.pickerOpen}`);
  if (within) {
    const [w, h] = state.viewport;
    for (const [id, [l, t, r, b]] of Object.entries(state.boxes)) if (l < -1 || t < -1 || r > w + 1 || b > h + 1) problems.push(`${id} past the window (${l},${t},${r},${b} in ${w}x${h})`);
  }
  const entry = { ...context, ok: !problems.length, problems, stack: state.stack };
  report.push(entry);
  if (problems.length) failures.push(entry);
  log(`${problems.length ? 'FAIL' : 'ok  '} ${context.layout} ${context.lang} ${context.scenario}${context.a ? ` ${context.a}` : ''}${context.b ? ` -> ${context.b}` : ''}${problems.length ? `: ${problems.join('; ')}` : ''}`);
}

async function runPage(browser, run, lang, pageName) {
  const layout = RECIPES[run];
  layoutNow = layout;
  const screens = PAGE_SCREENS[pageName];
  const candidates = rows.filter((row) => screens.includes(row.screen) && row.open[layout] && (!ONLY || ONLY.has(row.id)));
  const sweep = rows.filter((row) => screens.includes(row.screen) && row.open[layout]);
  const boxes = Object.fromEntries(sweep.map((row) => [row.id, row.box]));
  const ownedBy = (ids) => ids.flatMap((id) => (rowById.get(id).open[layout] ?? []).map(strip));
  if (!candidates.length) return;
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(holds);
  await page.setViewport(VIEWPORTS[run]);
  page.on('pageerror', (error) => log(`pageerror ${run} ${lang} ${pageName}: ${error.message}`));
  const url = `${base}${lang === 'zh' ? '/cn' : ''}${PAGE_PATH[pageName]}`;
  const load = async () => {
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 }).catch(() => {});
    await page.waitForSelector(PAGE_READY[pageName], { timeout: 300_000 });
    await settle(2500);
    // the Compare readout on (the rival's control in view from rest)
    if (pageName === 'game') await page.evaluate(() => { const chip = document.querySelector('[data-compare="off"]'); if (chip?.getClientRects().length) chip.click(); });
    await settle(600);
  };
  const state = () => page.evaluate(readState, boxes, []);
  const stateOwned = (ids) => page.evaluate(readState, boxes, ownedBy(ids));
  /** Press a step: false when it is not in view or something covers it ('?' steps not in view are skipped). */
  const press = async (step) => {
    const optional = step.startsWith('?');
    const sel = strip(step);
    const spot = await page.evaluate((sel) => {
      const el = [...document.querySelectorAll(sel)].find((node) => node.getClientRects().length && node.checkVisibility({ visibilityProperty: true }));
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, reachable: !!hit && (el === hit || el.contains(hit)) };
    }, sel);
    if (!spot) return optional ? 'skipped' : 'missing';
    if (!spot.reachable) return optional ? 'skipped' : 'covered';
    if (VIEWPORTS[run].hasTouch) await page.touchscreen.tap(spot.x, spot.y);
    else { await page.mouse.move(spot.x, spot.y); await page.mouse.down(); await page.mouse.up(); }
    await settle(380);
    return 'pressed';
  };
  const waitTop = async (id) => {
    for (let i = 0; i < 30; i++) { if ((await page.evaluate(() => window.__cotSurfaces?.().at(-1))) === id) return true; await settle(200); }
    return false;
  };
  const rest = async () => {
    for (let i = 0; i < 6 && (await page.evaluate(() => window.__cotSurfaces?.().length ?? 0)); i++) { await page.keyboard.press('Escape'); await settle(250); }
    if (await page.evaluate(() => window.__cotSurfaces?.().length ?? 0)) await load();
    await page.mouse.move(2, 2);
    await settle(250);
  };
  const openRow = async (row) => {
    for (const [i, step] of row.open[layout].entries()) {
      const result = await press(step);
      // a first control this size never shows: the row is absent here (it must open at another size)
      if (i === 0 && result === 'missing') return 'absent';
      if (result === 'missing' || result === 'covered') return `${strip(step)} ${result}`;
    }
    if (!(await waitTop(row.id))) return 'it did not open';
    // (its entry fades over --dur-fast)
    await settle(350);
    return null;
  };

  await load();
  const atRest = await state();
  const restProblems = Object.entries(atRest.open).filter(([, shown]) => shown).map(([id]) => `${id} in view at rest`);
  if (atRest.stack === null) restProblems.push('no surface stack on the page');
  report.push({ layout: run, lang, scenario: 'rest', page: pageName, ok: !restProblems.length, problems: restProblems });
  if (restProblems.length) failures.push({ layout: run, lang, scenario: 'rest', problems: restProblems });
  log(`${restProblems.length ? 'FAIL' : 'ok  '} ${run} ${lang} rest ${pageName}${restProblems.length ? `: ${restProblems.join('; ')}` : ''}`);

  // every surface alone: it opens, Escape closes it, the focus goes back to its control
  for (const a of candidates) {
    await rest();
    const why = await openRow(a);
    const context = { layout: run, lang, scenario: 'open', a: a.id };
    if (why === 'absent') { absent.set(a.id, [...(absent.get(a.id) ?? []), run]); log(`skip ${run} ${lang} open ${a.id}: absent at this size`); continue; }
    if (!why) opened.add(a.id);
    if (why) { const entry = { ...context, ok: false, problems: [why] }; report.push(entry); failures.push(entry); log(`FAIL ${run} ${lang} open ${a.id}: ${why}`); continue; }
    judge(context, await stateOwned(chain(a.id)), chain(a.id));
    await page.keyboard.press('Escape');
    await settle(450);
    judge({ ...context, scenario: 'escape' }, await stateOwned(chain(a.id).slice(0, -1)), chain(a.id).slice(0, -1), { focus: onOf(a.id) ?? null });
  }

  // every ordered pair reachable together
  for (const a of candidates) {
    for (const b of candidates) {
      if (a === b || (onOf(b.id) && !chain(a.id).includes(onOf(b.id)) && onOf(b.id) !== onOf(a.id))) continue;
      await rest();
      if (await openRow(a)) continue;
      const stepsA = a.open[layout], stepsB = b.open[layout];
      let shared = 0;
      while (shared < stepsA.length && shared < stepsB.length - 1 && stepsA[shared] === stepsB[shared]) shared++;
      const lead = stepsB.slice(shared, -1);
      let reached = true;
      for (const step of lead) { const result = await press(step); if (result === 'missing' || result === 'covered') { reached = false; break; } }
      if (!reached) continue;
      const result = await press(stepsB.at(-1));
      if (result !== 'pressed') { report.push({ layout: run, lang, scenario: 'pair', a: a.id, b: b.id, ok: true, skipped: `B's control ${result}` }); continue; }
      await waitTop(b.id);
      await settle(300);
      const expected = chain(b.id);
      judge({ layout: run, lang, scenario: 'pair', a: a.id, b: b.id }, await stateOwned(expected), expected);
      // Escape order: the top one, then the one under it
      if (onOf(b.id) === a.id) {
        await page.keyboard.press('Escape');
        await settle(450);
        judge({ layout: run, lang, scenario: 'escape-order', a: a.id, b: b.id }, await stateOwned(chain(a.id)), chain(a.id));
      }
    }
  }

  if (pageName === 'game') {
    const garageRows = candidates.filter((row) => row.screen === 'garage' && !onOf(row.id));
    for (const a of garageRows) {
      // a tank switch with the surface open: the press on the roster closes it, and the next tank shows
      await rest();
      if (await openRow(a)) continue;
      const switched = await press('.cot-cards .cot-card:not([aria-selected="true"])');
      if (switched === 'pressed') { await settle(900); judge({ layout: run, lang, scenario: 'switch-tank', a: a.id }, await stateOwned([]), [], { focus: null }); }
      // the nav's Deploy (or the phone's tab bar): Deploy replaces the surface
      await rest();
      if (await openRow(a)) continue;
      if ((await press('[data-nav="deploy"]')) === 'pressed' || (await press('[data-tabbar="deploy"]')) === 'pressed') {
        await waitTop('deploy');
        await settle(300);
        judge({ layout: run, lang, scenario: 'nav-deploy', a: a.id }, await stateOwned(['deploy']), ['deploy']);
      }
      // a resize (docked) or a rotation (folded) with the surface open: it stays whole inside the window, or closes clean
      await rest();
      if (await openRow(a)) continue;
      await page.setViewport({ ...VIEWPORTS[run], ...TURNED[run] });
      await settle(1200);
      const turned = await stateOwned(chain(a.id));
      judge({ layout: run, lang, scenario: 'resize', a: a.id }, turned, turned.stack?.length ? chain(a.id) : [], { focus: null, within: true });
      await page.setViewport(VIEWPORTS[run]);
      await settle(1200);
    }
    // the language switch with a surface open: nothing of the old page's surfaces survives into the new language's
    const first = garageRows[0];
    if (first && layout === 'docked') {
      await rest();
      if (!(await openRow(first))) {
        const navigated = page.waitForNavigation({ timeout: 60_000 }).catch(() => null);
        if ((await press('[data-nav="locale"]')) === 'pressed') {
          await navigated;
          await page.waitForSelector('[data-compare]', { timeout: 300_000 }).catch(() => {});
          await settle(2500);
          judge({ layout: run, lang, scenario: 'locale', a: first.id }, await stateOwned([]), [], { focus: null });
          await load();
        }
      }
    }
    // a battle start with a surface open: the battle owns the screen, no Garage surface stands over it
    if (BATTLE && first && layout === 'docked') {
      await rest();
      if (!(await openRow(first))) {
        if ((await press('.cot-battle')) === 'pressed') {
          await page.waitForFunction(() => document.body.classList.contains('cot-in-battle') || !!document.querySelector('.cot-hud:not([hidden])'), { timeout: 180_000 }).catch(() => {});
          await settle(2000);
          judge({ layout: run, lang, scenario: 'battle', a: first.id }, await stateOwned([]), [], { focus: null });
        }
      }
    }
  }
  await page.close();
}

for (const run of LAYOUTS) {
  const browser = await launchGuardedBrowser(puppeteer, { headless: true, args: ['--hide-scrollbars', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] },
    { label: `surface-pairs-${run}` });
  try {
    for (const lang of LANGS) for (const pageName of PAGES) await runPage(browser, run, lang, pageName);
  } finally { await browser.close(); }
}
// every row the run's recipes name opened at one size at least
for (const [id, runs] of absent) {
  if (opened.has(id)) continue;
  const entry = { layout: runs.join(','), lang: LANGS.join(','), scenario: 'never-opened', a: id, ok: false, problems: [`its first control shows at no size (${runs.join(', ')})`] };
  report.push(entry); failures.push(entry); log(`FAIL never-opened ${id}: absent at ${runs.join(', ')}`);
}
const pairs = report.filter((entry) => entry.scenario === 'pair' && !entry.skipped).length;
// (a pair's or a scenario's skip is reported, never counted as a pass of something that did not run)
writeFileSync(`${out}/surface-pairs.json`, JSON.stringify({ base, layouts: LAYOUTS, langs: LANGS, pages: PAGES, pairs, failures, report }, null, 1));
log(`surface-pairs: ${report.length} checks (${pairs} pairs), ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
