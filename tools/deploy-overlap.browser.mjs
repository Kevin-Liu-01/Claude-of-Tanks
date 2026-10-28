#!/usr/bin/env node
// The Deploy screen's overlap probe (Main 2026-10-26, on Deploy's plate at 1280x800: with Custom sides picked, the
// bot-count row sat half hidden under the tank card). Copyright © 2026 Kevin B. Liu.
//
// Every mode on the quick tab's plate (DEPLOY_MODE_ORDER: the battle modes and the range), at rest and with the further options open, at the UI gauntlet's eight
// windows. Per state:
// - overlap: the plate's rows and controls (ROWS, and any element on the plate holding words of its own; nested ones fold
//   into their outermost) are measured as each shows,
//   cut to its scrolling column; any two that intersect fail, except a phone's docked foot over the column it scrolls.
// - cut: on a window the layout calls neither compact nor short, nothing on the plate is cut by its column at rest (the
//   plate fits; a compact window's column scrolls by design, and its edge is the scroll edge).
// - one datum, one place (tools/datum-census.mjs, shared with the HUD probe and the gauntlet captures).
// Runs on Puppeteer against an existing dev server:
//   node tools/deploy-overlap.browser.mjs --url=http://127.0.0.1:5189 [--case=1280x800,390x844] [--mode=juggernaut]
//     [--out=outputs/deploy-overlap]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { datumProblems } from './datum-census.mjs';
import { DEPLOY_MODE_ORDER } from '../src/sim/gameModeCatalog.ts';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const { default: puppeteer } = await import('puppeteer');
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'outputs/deploy-overlap'));
await mkdir(out, { recursive: true });

/** [name, width, height, touch]: the UI gauntlet's eight windows, and four iPads (item 262: held wide, the docked plate on
 *  touch; upright, the column). */
export const CASES = [['2560x1440', 2560, 1440, false], ['1920x1080', 1920, 1080, false], ['1440x900', 1440, 900, false],
  ['1280x800', 1280, 800, false], ['1024x600', 1024, 600, false], ['900x700', 900, 700, false],
  ['390x844', 390, 844, true], ['844x390', 844, 390, true],
  ['1133x612', 1133, 612, true], ['1376x900', 1376, 900, true], ['820x1180', 820, 1180, true], ['1024x1366', 1024, 1366, true]];
/** Every mode Deploy offers (the battle modes and the range), as its picker lists them. */
export const MODES = [...DEPLOY_MODE_ORDER];
/** The plate's rows and controls, each a box another may not cross. */
export const ROWS = ['.cot-battle-preview', '.cot-deploy-rules > *', '.cot-deploy-field', '.cot-battle-times', '.cot-battle-galaxy',
  '.cot-battle-sides', '.cot-deploy-diff', '.cot-deploy-more', '.cot-mode-settings > .cot-arrange-field', '.cot-mode-settings > .cot-teams',
  '.cot-battle-mars', '[data-mars-label]', '.cot-deploy-tank', '.cot-deploy-acts > *'];

function measure(rows) {
  const compact = ['compact', 'short'].includes(document.body.dataset.cotHeight ?? '');
  // the named rows, then every element on the plate that holds words of its own (a row no one named still counts)
  const named = rows.flatMap((selector) => [...document.querySelectorAll(`.cot-battle-menu.open ${selector}`)].map((el) => [el, selector]));
  const words = [...document.querySelectorAll('.cot-battle-menu.open :is(.cot-battle-details,.cot-battle-menu-foot) *')]
    .filter((el) => !el.closest('.cot-c-menu__pop,[data-deploy-field-pop]')
      && [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
    .map((el) => [el, 'words']);
  const els = [];
  for (const [el, selector] of [...named, ...words]) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    // a visually hidden readout (1 px, clipped) is not on screen
    if (r.width <= 1 || r.height <= 1) continue;
    // the part its scrolling columns show
    let box = { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) {
      const cs = getComputedStyle(at);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = at.getBoundingClientRect();
      box = { x: Math.max(box.x, c.x), y: Math.max(box.y, c.y), right: Math.min(box.right, c.right), bottom: Math.min(box.bottom, c.bottom) };
    }
    const shown = box.right - box.x > 1 && box.bottom - box.y > 1;
    const cut = shown && (box.y > r.y + 1 || box.bottom < r.bottom - 1);
    const docked = getComputedStyle(el.closest('.cot-battle-menu-foot') ?? document.body).position === 'fixed';
    els.push({ el, selector, shown, cut, docked, ...box });
  }
  const top = els.filter((a) => !els.some((b) => b !== a && b.el !== a.el && b.el.contains(a.el)));
  const seen = new Set();
  return { compact, rects: top.filter((a) => (seen.has(a.el) ? false : (seen.add(a.el), true)))
    .map(({ el, selector, shown, cut, docked, x, y, right, bottom }) => ({ selector, shown, cut, docked,
      name: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.dataset.modeField ? `[${el.dataset.modeField}]` : ''}`
        + (selector === 'words' ? ` "${el.textContent.trim().slice(0, 24)}"` : ''), x, y, right, bottom })) };
}

const browser = await launchGuardedBrowser(puppeteer, { headless: true, args: ['--disable-gpu', '--js-flags=--max-old-space-size=3072'] });
const report = [];
let failures = 0;
try {
  for (const [name, width, height, touch] of CASES) {
    if (arg('case', '') && !arg('case', '').split(',').includes(name)) continue;
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}/tools/fixtures/mobile-surfaces.html?locale=en-US&full`, { waitUntil: 'networkidle0', timeout: 180000 });
    await page.evaluate(() => (document.querySelector('[data-nav="deploy"]') ?? document.querySelector('.cot-battle-mode'))?.click());
    await page.waitForFunction((count) => document.querySelectorAll('[data-deploy-modes] .cot-c-picker__opt').length >= count, { timeout: 120000 }, MODES.length);
    for (const mode of MODES) {
      if (arg('mode', '') && !arg('mode', '').split(',').includes(mode)) continue;
      for (const state of ['rest', 'more']) {
        // a mode without further options to open (the range: its one switch stands in the row) has no 'more' state
        const applies = await page.evaluate((id, open) => {
          document.querySelector(`[data-deploy-modes] .cot-c-picker__opt[data-id="${id}"]`)?.click();
          const more = document.querySelector('.cot-deploy-more');
          if (open && !more?.checkVisibility()) return false;
          if ((more?.getAttribute('aria-expanded') === 'true') !== open) more?.click();
          // the column at its top, as the screen opens
          for (const el of document.querySelectorAll('.cot-battle-details,.cot-battle-menu-scroll')) el.scrollTop = 0;
          return true;
        }, mode, state === 'more');
        if (!applies) continue;
        await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 300)));
        const { compact, rects } = await page.evaluate(measure, ROWS);
        const problems = [];
        const shown = rects.filter((a) => a.shown);
        for (let i = 0; i < shown.length; i++) {
          const a = shown[i];
          if (state === 'rest' && !compact && !touch && a.cut) problems.push(`cut at rest: ${a.name}`);
          for (const b of shown.slice(i + 1)) {
            // a phone's docked foot stands over the column it scrolls
            if (a.docked !== b.docked && touch) continue;
            const w = Math.min(a.right, b.right) - Math.max(a.x, b.x), h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
            if (w > 1 && h > 1) problems.push(`${a.name} overlaps ${b.name} (${Math.round(w)} x ${Math.round(h)} px)`);
          }
        }
        problems.push(...await datumProblems(page, { scope: '.cot-battle-menu.open' }));
        for (const e of errors.splice(0)) problems.push(`page error: ${e}`);
        failures += problems.length;
        report.push({ case: name, mode, state, problems, rects });
        console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${`${mode} ${state}`.padEnd(24)} ${problems.join(' | ')}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`deploy-overlap: ${failures ? `FAIL (${failures})` : 'PASS'}; ${report.length} states measured; ${resolve(out, 'report.json')}`);
process.exitCode = failures ? 1 : 0;
