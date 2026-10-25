#!/usr/bin/env node
// The battle HUD's overlap probe (owner 2026-10-25: "fix overlapping uis like in ac 130. so many things to be careful
// of and be mindful of"). Copyright © 2026 Kevin B. Liu.
//
// Every HUD state the layout fixture stages, at the windows the HUD is reviewed at: the visible instruments' boxes, and
// any two that intersect fail unless the pair is a deliberate layering (ALLOWED, each with its reason). Nested
// instruments fold into their outermost one. The sight's own layers (the reticle canvas, the gimbal sight, a drone's
// signal-loss veil) and the world-space markers over tanks are the scene's, not instruments, and are not measured.
// The full rendered regression (tools/battle-hud-layout.browser.mjs, Playwright) covers more windows and locales; this
// probe is the cheap pass over every state, and runs on Puppeteer against an existing dev server:
//   node tools/battle-hud-overlap.browser.mjs --url=http://127.0.0.1:5189 [--case=1440x900,390x844] [--state=gunship]
//     [--out=outputs/battle-hud-overlap]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const { default: puppeteer } = await import('puppeteer');
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'outputs/battle-hud-overlap'));
await mkdir(out, { recursive: true });

/** [name, width, height, touch] */
/** The UI gauntlet's eight sizes (owner 2026-10-25: every surface at 2560 to the phones; 900x700 caught what 1024 did not). */
export const CASES = [['2560x1440', 2560, 1440, false], ['1920x1080', 1920, 1080, false], ['1440x900', 1440, 900, false],
  ['1280x720', 1280, 720, false], ['1024x600', 1024, 600, false], ['900x700', 900, 700, false],
  ['390x844', 390, 844, true], ['844x390', 844, 390, true]];
export const STATES = ['idle', 'countdown', 'hints', 'notifications', 'reports', 'combined', 'feed-burst', 'large-map', 'special',
  'sniper', 'ammo-reload-sniper', 'ammo-reload-sniper-report', 'spectator', 'watch-ride', 'watch-drone', 'gunship', 'drone',
  'mode-zone_control', 'mode-capture_the_flag', 'mode-endless_horde'];
/** The HUD's instruments, each a box another may not cross. */
export const INSTRUMENTS = ['.cot-top', '.cot-pips.show', '.cot-mode-status.show', '.cot-net', '.cot-mp-status.battle',
  '.cot-ear.l', '.cot-ear.r', '.cot-kill-lane.l', '.cot-kill-lane.r', '.cot-sixth.on', '.cot-alert.show', '.cot-ribbon.on',
  '.cot-medal-toasts', '.cot-revive', '.cot-prebattle', '.cot-prebattle-rules', '.cot-aim-warning:not([hidden])',
  '.cot-si-toasthost', '.cot-si-log.open', '.cot-si-cardhost:not(:empty)', '.cot-room-chat:not([hidden])', '.cot-spec.show',
  '.cot-watch', '.cot-watch-rail', '.cot-hints.show', '.cot-drive', '.cot-dp', '.cot-minimap', '.cot-shell', '.cot-con', '.cot-vehicle-controls',
  '.cot-flight-hud .flight-console', '.cot-flight-hud .gunship-solution', '.cot-scope-vision',
  '.cot-touch.on .joy', '.cot-touch.on .round', '.cot-touch.on .mobile-chrome', '.cot-touch.on .quick'];
/** Deliberate layerings: [selector a, selector b, why]. A pair matches in either order. */
export const ALLOWED = [];

function measure(instruments) {
  const els = [];
  for (const selector of instruments) for (const el of document.querySelectorAll(selector)) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    els.push({ el, selector, x: r.x, y: r.y, right: r.right, bottom: r.bottom });
  }
  // nested instruments fold into their outermost one (a slot inside a tray, a quick button inside the toolbar)
  const top = els.filter((a) => !els.some((b) => b !== a && b.el !== a.el && b.el.contains(a.el)));
  const seen = new Set();
  return top.filter((a) => (seen.has(a.el) ? false : (seen.add(a.el), true)))
    .map(({ el, selector, x, y, right, bottom }) => ({ selector, name: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, x, y, right, bottom }));
}

const allowed = (a, b) => ALLOWED.find(([x, y]) => (a.selector === x && b.selector === y) || (a.selector === y && b.selector === x));
const browser = await puppeteer.launch({ headless: true, args: ['--disable-gpu', '--js-flags=--max-old-space-size=3072'] });
const report = [];
let failures = 0;
try {
  for (const [name, width, height, touch] of CASES) {
    if (arg('case', '') && !arg('case', '').split(',').includes(name)) continue;
    for (const state of STATES) {
      if (arg('state', '') && !arg('state', '').split(',').includes(state)) continue;
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
      // the notices' holds (alerts 2.4 s, medals 3.4 s, kill rows 5.2 / 6.2 s) last while the probe measures
      await page.evaluateOnNewDocument(() => {
        const later = window.setTimeout;
        window.setTimeout = function (fn, ms, ...rest) { if ([2400, 3400, 5200, 6200].includes(ms)) ms *= 50; return later.call(this, fn, ms, ...rest); };
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?state=${state}`, { waitUntil: 'networkidle0', timeout: 120000 });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT, { timeout: 60000 });
      // the layout's planners settle over a few frames (and the Watch bar's chunk lands)
      await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 600)));
      const rects = await page.evaluate(measure, INSTRUMENTS);
      const problems = [];
      for (let i = 0; i < rects.length; i++) {
        const a = rects[i];
        if (a.x < -0.5 || a.y < -0.5 || a.right > width + 0.5 || a.bottom > height + 0.5) problems.push(`offscreen: ${a.name}`);
        for (const b of rects.slice(i + 1)) {
          const w = Math.min(a.right, b.right) - Math.max(a.x, b.x), h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          if (w > 1 && h > 1 && !allowed(a, b)) problems.push(`${a.name} overlaps ${b.name} (${Math.round(w)} x ${Math.round(h)} px)`);
        }
      }
      for (const e of errors) problems.push(`page error: ${e}`);
      failures += problems.length;
      report.push({ case: name, state, problems, rects });
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${state.padEnd(26)} ${problems.join(' | ')}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`battle-hud-overlap: ${failures ? `FAIL (${failures})` : 'PASS'}; ${report.length} states measured; ${resolve(out, 'report.json')}`);
process.exitCode = failures ? 1 : 0;
