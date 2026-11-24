#!/usr/bin/env node
// The Garage location picker is reachable at every gauntlet window (garage-env-276, Main 2026-11-24: a portrait phone
// hides the mobile nav trigger, showroom.css). Copyright © 2026 Kevin B. Liu.
//
// Per window, a fresh load at that size (touch where the deploy probe touches): the route a player has to the picker,
// whichever the layout shows: the docked picker button, the mobile nav's Environment, or the portrait tab bar's More
// and then Environment. Each step must be the element the point under it hits (elementFromPoint: on screen, not
// covered), after the scroll a player gives its list when it stands past the fold of a scrolling menu (the step is then
// reported as scrolled). The open picker's option for another location must be hit at its centre too, and choosing it
// must select that location. A window with no route fails.
//   node tools/garage-picker-reach.browser.mjs --url=http://127.0.0.1:4179 [--case=390x844,1280x800] [--out=outputs/garage-picker-reach]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;

/** [name, width, height, touch]: the UI gauntlet's eight windows and the deploy probe's four iPads (tools/deploy-overlap.browser.mjs CASES). */
export const CASES = [['2560x1440', 2560, 1440, false], ['1920x1080', 1920, 1080, false], ['1440x900', 1440, 900, false],
  ['1280x800', 1280, 800, false], ['1024x600', 1024, 600, false], ['900x700', 900, 700, false],
  ['390x844', 390, 844, true], ['844x390', 844, 390, true],
  ['1133x612', 1133, 612, true], ['1376x900', 1376, 900, true], ['820x1180', 820, 1180, true], ['1024x1366', 1024, 1366, true]];
/** The routes a player has to the picker, tried in order; each is a list of steps clicked in turn. */
export const ROUTES = [
  ['docked', ['[data-picker-menu="garage-staging"]']],
  ['mobile nav', ['.cot-mobile-nav-trigger', '[data-mobile-nav="environment"]']],
  ['tab bar', ['.cot-tabbar [data-tabbar="more"]', '[data-mobile-nav="environment"]']],
];
const OPTION = (id) => `.cot-c-menu__pop:popover-open .cot-c-picker__opt[data-id="${id}"]`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: puppeteer } = await import('puppeteer');
  const url = arg('url', 'http://127.0.0.1:4179').replace(/\/$/, '');
  const out = resolve(arg('out', 'outputs/garage-picker-reach'));
  const only = arg('case', '') ? new Set(arg('case', '').split(',')) : null;
  await mkdir(out, { recursive: true });
  const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 180_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
  const rows = [];
  try {
    for (const [name, width, height, touch] of CASES.filter(([n]) => !only || only.has(n))) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
        await page.goto(`${url}/?nosplash=1&qa=1`, { waitUntil: 'networkidle0', timeout: 180_000 });
        await page.waitForFunction(`${BOOT_LOADED_EXPRESSION} && !!window.__GARAGE_WORKSHOP`, { timeout: 180_000 });
        await page.waitForFunction(() => { const a = window.__GARAGE_WORKSHOP.stats().architecture; return a?.ready && a.presented; }, { timeout: 180_000 });
        await new Promise((r) => setTimeout(r, 800));
        /** Whether the element is on screen and the point at its centre hits it (or a child of it). */
        const hittable = (selector) => page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return false;
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
          const hit = document.elementFromPoint(x, y);
          return !!hit && (hit === el || el.contains(hit));
        }, selector);
        const selected = await page.evaluate(() => window.__GARAGE_WORKSHOP.stats().selected);
        const target = await page.evaluate((current) => window.__GARAGE_WORKSHOP.variants.map((v) => v.id).find((id) => id !== current), selected);
        let route = null, failure = null;
        const scrolled = [];
        for (const [routeName, steps] of ROUTES) {
          if (!(await hittable(steps[0]))) continue;
          route = routeName;
          for (const step of steps) {
            await page.waitForFunction((sel) => !!document.querySelector(sel), { timeout: 5000 }, step).catch(() => {});
            if (!(await hittable(step))) {
              // a player scrolls a scrolling menu to an item past its fold (overflow auto or scroll, not the page)
              const inScroller = await page.$eval(step, (el) => {
                for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
                  const style = getComputedStyle(node);
                  if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
                    el.scrollIntoView({ block: 'nearest' });
                    return true;
                  }
                }
                return false;
              }).catch(() => false);
              if (inScroller) { scrolled.push(step); await new Promise((r) => setTimeout(r, 200)); }
            }
            if (!(await hittable(step))) { failure = `${step} is not on screen or is covered`; break; }
            await page.click(step);
            await new Promise((r) => setTimeout(r, 250));
          }
          break;
        }
        if (!route) failure = 'no route to the picker is on screen';
        if (!failure) {
          await page.waitForSelector(OPTION(target), { timeout: 5000 }).catch(() => {});
          await page.$eval(OPTION(target), (el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
          if (!(await hittable(OPTION(target)))) failure = `the picker's option ${target} is not on screen or is covered`;
          else {
            await page.click(OPTION(target));
            const chosen = await page.waitForFunction((id) => window.__GARAGE_WORKSHOP.stats().selected === id, { timeout: 60_000 }, target)
              .then(() => true, () => false);
            if (!chosen) failure = `choosing ${target} did not select it`;
          }
        }
        await page.screenshot({ path: `${out}/${name}.png` });
        rows.push({ name, route, target, scrolled, ok: !failure, failure });
        console.log(`${failure ? 'FAIL' : 'ok  '} ${name.padEnd(10)} ${route ?? '-'}${scrolled.length ? ` (scrolled to ${scrolled.join(', ')})` : ''}${failure ? `: ${failure}` : ''}`);
      } finally { await page.close(); }
    }
  } finally {
    await writeFile(`${out}/receipt.json`, JSON.stringify(rows, null, 2));
    await browser.close();
  }
  const failed = rows.filter((row) => !row.ok);
  console.log(`garage-picker-reach: ${rows.length - failed.length} of ${rows.length} windows reach the location picker${failed.length ? ' FAIL' : ' PASS'}`);
  process.exit(failed.length ? 1 : 0);
}
