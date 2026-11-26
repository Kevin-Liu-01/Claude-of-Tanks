#!/usr/bin/env node
// modal-layer.browser.mjs — the pause and Settings over everything else in a live battle (owner 2026-11-24, live 276: "the
// settings and pause, any modal should go above any other ui stuff", over a screenshot of an Artillery incoming-strike
// notice drawn over the open Settings). Copyright © 2026 Kevin B. Liu.
//
// A real Air Support battle on a built preview (`?debug=1` for window.__DEBUG), at 1920x1080, 390x844 and 844x390 (touch):
// the binoculars up (ui:strikeViewToggle), an enemy artillery strike planted on the crew's hull (the INCOMING warning, as
// the reported screenshot), and a kill of the player's (tank:destroyed: the kill ribbon, where the layout shows one). Then
// the pause (the pointer lock let go while the page has no focus, as an alt-tab raises it; a phone's page shown again) and
// Settings (the Esc menu), each in turn: since settings-unify-278 both are the one Settings panel, the pause with its PAUSED
// chip and Resume; at a grid over the whole window and at the centre of every overlay that is up, document.elementFromPoint must hit
// the modal and nothing else. While it samples, every element takes pointer events (a style the probe adds and removes),
// so a HUD part or a notice that ignores the pointer is still hit where it paints over the modal. A hit outside the modal
// that is not visible (opacity 0, visibility hidden) is no paint and passes. Stills of each state go to --out.
//
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/modal-layer.browser.mjs --dist=dist --port=4298 \
//     --out=<dir> [--label=after] [--root=<checkout>] [--sizes=1920x1080,390x844t,844x390t] [--mode=serve] [--record-only]
// --record-only writes the report and stills and exits 0 whatever the hits (the "before" capture of a build without the
// modal layer). --mode=serve runs a dev server instead of a preview (a harness dry run).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { startViteChild } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback = null) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = resolve(arg('root', process.cwd()));
const dist = resolve(root, arg('dist', 'dist'));
const out = resolve(arg('out', 'outputs/modal-layer'));
const label = arg('label', 'after');
const mode = arg('mode', 'preview');
const port = Number(arg('port', '4298'));
const recordOnly = process.argv.includes('--record-only');
const SIZES = (arg('sizes', '1920x1080,390x844t,844x390t')).split(',').map((s) => {
  const [w, h] = s.replace(/t$/, '').split('x').map(Number);
  return { name: s, w, h, touch: s.endsWith('t') };
});
const BATTLE = Object.freeze({ specId: 'm1a1_abrams_hc', mapId: 'verdant', gameMode: 'air_support' });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
mkdirSync(out, { recursive: true });

/** In the page: raise the binoculars, keep an enemy artillery strike over the crew, credit the player a kill. */
function stage() {
  const D = window.__DEBUG, game = D.game, bus = D.bus;
  const player = game.player;
  const air = () => game.matchModeState?.air ?? null;
  const enemies = (game.tanks ?? []).filter((t) => t.team !== player.team);
  if (!document.documentElement.hasAttribute('data-cot-strike-view')) bus.emit('ui:strikeViewToggle', {});
  // the strike: an enemy artillery run on the crew's hull in the mode's own ledger (sim/airSupport.ts strikes, which every
  // view is made from), its warning ten minutes long so it never lands while the probe looks
  const ledger = game.matchModeController?.airSupport?.strikes;
  const pos = player.state?.pos, now = Number(game.timeS) || 0;
  const record = { id: 987654, kind: 'artillery', team: enemies[0]?.team ?? 'bravo', callerId: enemies[0]?.id ?? 'probe', x: pos?.x ?? 0,
    y: pos?.y ?? 0, z: pos?.z ?? 0, heading: 0, calledS: now, landsS: now + 600, endS: now + 660, hp: 1, maxHp: 1, downedS: null,
    downedBy: null, fired: 0, firedAux: 0 };
  if (Array.isArray(ledger) && !ledger.some((s) => s.id === record.id)) ledger.push(record);
  window.__modalLayerKills = (window.__modalLayerKills ?? 0);
  return { player: player?.id ?? null, enemies: enemies.length, air: !!air(), ledger: Array.isArray(ledger) };
}

/** In the page: a fresh kill of the player's (the ribbon holds 2.4 s after the latest). */
function kill() {
  const D = window.__DEBUG, game = D.game, player = game.player;
  const enemies = (game.tanks ?? []).filter((t) => t.team !== player.team);
  const victim = enemies[(window.__modalLayerKills++) % Math.max(1, enemies.length)];
  // (as state.ts tells a destruction: the effects read its pos; the HUD alone shows it, the hull drives on)
  const pos = victim?.state?.pos;
  if (victim && pos) D.bus.emit('tank:destroyed', { id: victim.id, specId: victim.specId, pos: [pos.x, pos.y, pos.z], killerId: player.id, cause: 'shot' });
  return victim?.id ?? null;
}

/** In the page: which overlays are up, and their boxes. */
function overlays() {
  const shown = (el) => !!el?.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true });
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const incoming = [...document.querySelectorAll('.cot-c-notice, .cot-alert')].find((el) => shown(el) && /incoming/i.test(el.textContent ?? ''));
  const ribbon = [...document.querySelectorAll('.cot-ribbon')].find(shown);
  const feedKill = [...document.querySelectorAll('.cot-kill-lane > *, .cot-feed > *')].find(shown);
  const binoculars = [...document.querySelectorAll('.cot-binoculars')].find(shown);
  const out = {};
  for (const [name, el] of Object.entries({ incoming, ribbon, feedKill, binoculars })) if (el) out[name] = { ...box(el), text: (el.textContent ?? '').trim().slice(0, 60) };
  return out;
}

/** In the page: elementFromPoint over the grid and the overlays' centres; every visible hit must be inside `selector`. */
function sample([selector, points]) {
  const modal = document.querySelector(selector);
  if (!modal || !modal.checkVisibility({ checkVisibilityCSS: true })) return { open: false, misses: [], hits: 0 };
  const style = document.createElement('style');
  style.textContent = 'html *, html *::before, html *::after { pointer-events: auto !important; }';
  document.head.append(style);
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].slice(0, 3).map((c) => `.${c}`).join('')}`;
  const misses = [];
  let hits = 0;
  try {
    for (const [x, y, why] of points) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      hits++;
      if (modal.contains(el)) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      let path = el, chain = [];
      while (path && path !== document.body && chain.length < 4) { chain.push(describe(path)); path = path.parentElement; }
      misses.push({ x: Math.round(x), y: Math.round(y), why, hit: chain.join(' < ') });
    }
  } finally { style.remove(); }
  const layer = { popover: modal.matches(':popover-open'), z: getComputedStyle(modal).zIndex };
  return { open: true, hits, misses, layer };
}

/** A still without ?debug=1's diagnostics panel, which no player sees (hidden for the shot only, as hud-chase-bands does). */
async function shot(page, path) {
  const hidden = await page.evaluate(() => {
    const label = [...document.querySelectorAll('body *')].find((n) => !n.children.length && /^\s*battle diagnostics\s*$/i.test(n.textContent ?? ''));
    let bar = label;
    while (bar && bar !== document.body && getComputedStyle(bar).position !== 'fixed') bar = bar.parentElement;
    if (!bar || bar === document.body) return false;
    bar.dataset.modalLayerHidden = bar.style.visibility;
    bar.style.visibility = 'hidden';
    return true;
  });
  await page.screenshot({ path });
  if (hidden) await page.evaluate(() => { for (const n of document.querySelectorAll('[data-modal-layer-hidden]')) { n.style.visibility = n.dataset.modalLayerHidden; delete n.dataset.modalLayerHidden; } });
}

/** In the page: Settings' header against its tab row (modal-layer-277; 844x390: the PAUSED chip sat on the Language tab).
 *  Every tab's box, cut to the row's visible box, must keep clear of the chip and the close. */
function headerClear() {
  const box = (el) => el?.getBoundingClientRect();
  const row = box(document.querySelector('.cot-settings .cot-set-tabs'));
  const chip = document.querySelector('.cot-settings .cot-set-paused');
  const blockers = [['paused', chip?.checkVisibility?.() ? box(chip) : null], ['close', box(document.querySelector('.cot-settings .cot-set-close'))]];
  const clashes = [];
  // (a tab the layout hides, as a touch layout hides Controls, is no tab to cover)
  const tabs = [...document.querySelectorAll('.cot-settings .cot-set-tab')].filter((tab) => tab.checkVisibility({ checkVisibilityCSS: true }));
  // (a row that collapsed shows no tab at all, and so no clash: it fails as one)
  if (!row || row.height < 30) clashes.push(`the tab row is not shown (${Math.round(row?.height ?? 0)} px tall)`);
  for (const tab of tabs) if (tab.getBoundingClientRect().height < 30) clashes.push(`${tab.dataset.tab} is not shown`);
  for (const tab of tabs) {
    const r = box(tab);
    const x0 = Math.max(r.left, row.left), x1 = Math.min(r.right, row.right);
    if (x1 <= x0) continue; // scrolled out of the row
    for (const [name, b] of blockers) {
      if (!b) continue;
      const w = Math.min(x1, b.right) - Math.max(x0, b.left), h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (w > 0.5 && h > 0.5) clashes.push(`${tab.dataset.tab} under ${name} (${Math.round(w)} x ${Math.round(h)} px)`);
    }
  }
  return { clashes, paused: !!blockers[0][1], scrolls: (document.querySelector('.cot-settings .cot-set-tabs')?.scrollWidth ?? 0) > Math.ceil(row.width) };
}

const report = { label, root, dist, mode, battle: BATTLE, startedAt: new Date().toISOString(), sizes: {}, errors: [] };
let server = null, browser = null, failed = 0;
try {
  server = await startViteChild({ root, mode, outDir: dist, port, timeoutMs: 300_000 });
  console.log(`modal-layer: ${mode} ${server.url} (pid ${server.child.pid})`);
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 180_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] }),
  { label: 'modal-layer' });
  console.log(`modal-layer: browser pid ${browser.process()?.pid ?? '?'}`);
  for (const size of SIZES) {
    const entry = report.sizes[size.name] = { states: {}, modals: {} };
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(`${size.name}: ${String(error?.message ?? error).slice(0, 240)}`));
    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: size.touch ? 2 : 1, isMobile: size.touch, hasTouch: size.touch });
    if (size.touch) {
      await page.setUserAgent(IPHONE);
      await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]).catch(() => {});
    }
    await page.evaluateOnNewDocument(() => {
      Document.prototype.hasFocus = () => true;
      try {
        localStorage.setItem('cot.telemetry', 'off');
        localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
        localStorage.setItem('cot.tutorial.v1', '{"v":2,"garage":"skipped","training":"skipped","debrief":"skipped","tour":"skipped","offer":"later"}');
        localStorage.setItem('cot.battle.hints.v2', JSON.stringify({ battles: 3, learned: [] }));
      } catch { /* none */ }
    });
    await page.goto(`${server.url}/?nosplash=1&telemetry=off&debug=1&tier=${size.touch ? 'mobile' : 'desktop'}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
    await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, BATTLE);
    await page.waitForFunction(readinessExpression('controlsReleased'), { timeout: 900_000, polling: 250 });
    entry.stage = await page.evaluate(stage);
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-cot-strike-view'), { timeout: 20_000, polling: 100 }).catch(() => {});
    await page.waitForFunction(() => [...document.querySelectorAll('.cot-c-notice, .cot-alert')].some((el) => /incoming/i.test(el.textContent ?? '')
      && el.checkVisibility({ checkOpacity: true })), { timeout: 45_000, polling: 100 }).catch(() => {});
    entry.kill = await page.evaluate(kill);
    await wait(700);
    entry.states.overlays = await page.evaluate(overlays);
    await shot(page, resolve(out, `${label}-${size.name}-1-battle.png`));
    // the pause, as an alt-tab raises it: the pointer lock let go while the page has no focus (settings.ts pauseToSettings:
    // since settings-unify-278 it is Settings, paused); a touch layout, which never locks, pauses as its page shows again;
    // a desktop page that never held the lock has no lock to lose, so it pauses the way the Esc key does
    const pauseVeil = async () => {
      const input = window.__DEBUG.input;
      const before = { locked: input?.isLocked?.() ?? null, cursorAim: input?.isCursorAim?.() ?? null, phase: window.__DEBUG.game?.phase ?? null };
      if (document.pointerLockElement) {
        const hasFocus = Document.prototype.hasFocus;
        Document.prototype.hasFocus = () => false;
        await new Promise((done) => { document.addEventListener('pointerlockchange', done, { once: true }); document.exitPointerLock(); setTimeout(done, 1000); });
        await new Promise((done) => setTimeout(done, 60));
        Document.prototype.hasFocus = hasFocus;
      } else if (input?.isTouchLayout?.()) {
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        window.__DEBUG.settings.open();
      }
      return { before, shown: !!document.querySelector('.cot-settings.open.paused'),
        resume: !!document.querySelector('.cot-settings.open .cot-set-btn.resume:not([hidden])'), veil: !!document.querySelector('.cot-resume') };
    };
    for (const [name, selector, open] of [['pause', '.cot-settings', pauseVeil],
      ['settings', '.cot-settings', () => window.__DEBUG.settings.open()]]) {
      // a fresh kill first (the ribbon holds 2.4 s after it): the kill's own beat is a presentation, under which the input
      // owner refuses the veil and the menu (battleInputOwner.ts), so the modal opens once it has passed
      await page.evaluate(kill);
      await wait(900);
      entry.modals[name] = { opener: await page.evaluate(open) };
      await page.waitForFunction((sel) => !!document.querySelector(sel)?.checkVisibility({ checkVisibilityCSS: true }), { timeout: 4_000, polling: 50 }, selector).catch(() => {});
      await wait(350); // the backdrop's fade and the panel's rise
      const up = await page.evaluate(overlays);
      const points = [];
      for (let i = 0; i < 12; i++) for (let j = 0; j < 9; j++) points.push([(i + 0.5) * size.w / 12, (j + 0.5) * size.h / 9, 'grid']);
      for (const [what, r] of Object.entries(up)) points.push([r.x + r.w / 2, r.y + r.h / 2, what], [r.x + 4, r.y + 4, what]);
      const result = await page.evaluate(sample, [selector, points]);
      entry.modals[name] = { ...entry.modals[name], overlays: up, ...result };
      await shot(page, resolve(out, `${label}-${size.name}-${name === 'pause' ? 2 : 3}-${name}.png`));
      const missing = ['incoming', 'binoculars'].filter((what) => !up[what]);
      const problems = [];
      if (name === 'settings') {
        const header = entry.modals[name].header = await page.evaluate(headerClear);
        if (header.clashes.length) problems.push(`the header covers a tab: ${header.clashes.join('; ')}`);
      }
      if (!result.open) problems.push(`${name} did not open`);
      if (name === 'pause') {
        const opened = entry.modals[name].opener;
        if (!opened?.shown) problems.push('the pause is not Settings with its PAUSED chip');
        if (!opened?.resume) problems.push('the paused Settings shows no Resume');
        if (opened?.veil) problems.push('a second veil is in the page');
      }
      if (result.misses.length) problems.push(`${result.misses.length} points hit outside the ${name}: ${[...new Set(result.misses.map((m) => `${m.why}→${m.hit}`))].slice(0, 6).join('; ')}`);
      if (missing.length) problems.push(`not up under the ${name}: ${missing.join(', ')}`);
      entry.modals[name].problems = problems;
      if (problems.length) failed++;
      console.log(`${size.name} ${name}: ${result.open ? `${result.hits} hits, ${result.misses.length} outside` : 'not open'}; up: ${Object.keys(up).join(', ') || 'none'}`
        + `; layer ${JSON.stringify(result.layer ?? {})}${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
      if (name === 'pause') {
        // Resume closes the pause, as a player's press does, before the Esc menu's own opening
        await page.evaluate(() => { const go = document.querySelector('.cot-settings.open .cot-set-btn.resume'); if (go instanceof HTMLElement) go.click(); });
        await wait(250);
        await page.evaluate(stage);
        await wait(400);
      }
    }
    await page.evaluate(() => { try { window.__DEBUG.settings.close({ noRelock: true }); } catch { /* none */ } });
    await context.close();
  }
} catch (error) {
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  failed++;
} finally {
  await Promise.race([browser?.close().catch(() => {}), wait(15_000)]);
  try { browser?.process()?.kill('SIGKILL'); } catch { /* closed */ }
  await Promise.race([server?.close().catch(() => {}), wait(15_000)]);
  report.finishedAt = new Date().toISOString();
  report.failed = failed;
  writeFileSync(resolve(out, `${label}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(failed ? `modal-layer (${label}): ${failed} states with something over the modal or a state not staged${recordOnly ? ' (recorded only)' : ''}`
  : `modal-layer (${label}): only the modal under every point, in every state`);
process.exit(failed && !recordOnly ? 1 : 0);
