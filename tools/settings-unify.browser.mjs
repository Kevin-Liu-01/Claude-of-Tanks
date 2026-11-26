#!/usr/bin/env node
// settings-unify.browser.mjs — the battle's one pause screen (settings-unify-278, Kevin 2026-11-25: "combine the pause
// modal and settings modal (we take settings modal). add the extra settings and photo mode there"). Copyright © 2026
// Kevin B. Liu.
//
// A real solo battle on a built preview (`?debug=1` for window.__DEBUG), at 1920x1080, 390x844 and 844x390 (touch). It
// reads what is drawn, never a flag alone:
//   1. pause: the battle paused the way a player pauses it (desktop: the pointer lock let go while the page has no focus,
//      as an alt-tab does, else the Esc key; touch: the page shown again, as a phone back from another app). Over a grid
//      of the whole window document.elementFromPoint hits Settings and nothing else; no second full-window layer is
//      drawn (the retired click-to-resume veil); the PAUSED chip and Resume are drawn; the battle clock holds.
//   2. Interface: its tab drawn, the language picker its first row.
//   3. Resume: a trusted click on it; Settings is no longer drawn and the battle clock runs.
//   4. Photo mode: paused again, a trusted click on Photo mode; the bar is drawn, the HUD is not (every grid hit is the
//      stage or the bar), and the picture changed (the free camera's hero framing). Its Exit returns to the paused
//      Settings, drawn again.
//   5. Leave battle: a trusted click; the Garage is drawn.
// Stills of each step go to --out. The reverted control is the build before this lane (--root=<modal-layer-277> --dist=dist):
// it must fail at 1 (the veil, no Resume) and 4 (no Photo mode).
//
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/settings-unify.browser.mjs --dist=dist --port=4299 \
//     --out=<dir> [--label=after] [--root=<checkout>] [--sizes=1920x1080,390x844t,844x390t] [--mode=serve] [--record-only]
// --record-only writes the report and stills and exits 0 whatever the checks (a "before" capture). --mode=serve runs a dev
// server instead of a preview (a harness dry run).
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
const out = resolve(arg('out', 'outputs/settings-unify'));
const label = arg('label', 'after');
const mode = arg('mode', 'preview');
const port = Number(arg('port', '4299'));
const recordOnly = process.argv.includes('--record-only');
const SIZES = (arg('sizes', '1920x1080,390x844t,844x390t')).split(',').map((s) => {
  const [w, h] = s.replace(/t$/, '').split('x').map(Number);
  return { name: s, w, h, touch: s.endsWith('t') };
});
const BATTLE = Object.freeze({ specId: 'm1a1_abrams_hc', mapId: 'verdant', gameMode: 'standard' });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
mkdirSync(out, { recursive: true });

/** In the page: what is drawn. Over a 12 x 9 grid: the hits inside `inside` (a selector list), and the rest named. The
 *  full-window layers drawn (a fixed box over 90 % of the window, visible, with a background or a backdrop): the veil
 *  this lane retired was one, Settings is the other. Each named control's box and whether a point at its centre hits it. */
function drawn([inside, controls]) {
  const shown = (el) => !!el?.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true });
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].slice(0, 3).map((c) => `.${c}`).join('')}`;
  const style = document.createElement('style');
  style.textContent = 'html *, html *::before, html *::after { pointer-events: auto !important; }';
  document.head.append(style);
  const W = innerWidth, H = innerHeight;
  const result = { inside: 0, outside: [], layers: [], controls: {} };
  try {
    const hosts = inside.map((sel) => [...document.querySelectorAll(sel)]).flat();
    for (let i = 0; i < 12; i++) for (let j = 0; j < 9; j++) {
      const x = (i + 0.5) * W / 12, y = (j + 0.5) * H / 9;
      const el = document.elementFromPoint(x, y);
      if (!el || !shown(el)) continue;
      if (hosts.some((host) => host.contains(el))) { result.inside++; continue; }
      result.outside.push(`${Math.round(x)},${Math.round(y)} ${describe(el)}`);
    }
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || !shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 0.9 * W * H) continue;
      const painted = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || (cs.backdropFilter && cs.backdropFilter !== 'none');
      if (painted) result.layers.push(describe(el));
    }
    for (const [name, sel] of Object.entries(controls)) {
      const el = [...document.querySelectorAll(sel)].find(shown);
      if (!el) { result.controls[name] = null; continue; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      result.controls[name] = { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: !!hit && el.contains(hit), text: (el.textContent ?? '').trim().slice(0, 40) };
    }
  } finally { style.remove(); }
  return result;
}

/** In the page: the battle clock and the screen phase. */
const clock = () => ({ timeS: Number(window.__DEBUG?.game?.timeS) || 0, phase: window.__DEBUG?.game?.phase ?? null,
  settingsOpen: !!window.__DEBUG?.settings?.isOpen?.() });

/** In the page: pause the battle as a player's lost page does. */
async function pauseAsPlayer(touch) {
  const before = { locked: !!document.pointerLockElement };
  if (touch) {
    document.dispatchEvent(new Event('visibilitychange'));
    return { ...before, how: 'page shown again (touch)' };
  }
  if (document.pointerLockElement) {
    const hasFocus = Document.prototype.hasFocus;
    Document.prototype.hasFocus = () => false;
    await new Promise((done) => { document.addEventListener('pointerlockchange', done, { once: true }); document.exitPointerLock(); setTimeout(done, 1000); });
    await new Promise((done) => setTimeout(done, 80));
    Document.prototype.hasFocus = hasFocus;
    // and the player comes back: the window's focus event a return from an alt-tab fires (the frame loop, which stands
    // down while the page has no focus, wakes on it: engine/frameLoopScheduler.ts)
    window.dispatchEvent(new Event('focus'));
    return { ...before, how: 'lock lost without focus (alt-tab), then back' };
  }
  return { ...before, how: 'esc' };
}

const SETTINGS = ['.cot-settings.open'];
const CONTROLS = {
  resume: '.cot-settings.open .cot-set-btn.resume', photo: '.cot-settings.open .cot-set-btn.photo', leave: '.cot-settings.open .cot-set-btn.leave',
  paused: '.cot-settings.open .cot-set-paused', interfaceTab: '.cot-settings.open .cot-set-tab[data-tab="interface"]',
  language: '.cot-settings.open .cot-set-body [data-picker-menu="settings-language"], .cot-settings.open .cot-set-body .cot-set-menu',
  photoBar: '.cot-photo-bar', photoExit: '.cot-photo-bar [data-photo-exit]',
};

const report = { label, root, dist, mode, battle: BATTLE, startedAt: new Date().toISOString(), sizes: {}, errors: [] };
let server = null, browser = null, failed = 0;
try {
  server = await startViteChild({ root, mode, outDir: dist, port, timeoutMs: 300_000 });
  console.log(`settings-unify: ${mode} ${server.url} (pid ${server.child.pid})`);
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 180_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] }),
  { label: 'settings-unify' });
  console.log(`settings-unify: browser pid ${browser.process()?.pid ?? '?'}`);
  for (const size of SIZES) {
    const entry = report.sizes[size.name] = { steps: {}, problems: [] };
    const problem = (text) => { entry.problems.push(text); };
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
    const still = (name) => page.screenshot({ path: resolve(out, `${label}-${size.name}-${name}.png`) });
    const click = async (at) => { if (size.touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y); };
    await page.goto(`${server.url}/?nosplash=1&telemetry=off&debug=1&tier=${size.touch ? 'mobile' : 'desktop'}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
    await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, BATTLE);
    await page.waitForFunction(readinessExpression('controlsReleased'), { timeout: 900_000, polling: 250 });
    await wait(1500);
    // a desktop player's battle holds the pointer: a trusted click on the stage takes it (headless may refuse it)
    if (!size.touch) { await page.mouse.click(size.w / 2, size.h / 2); await wait(400); }
    await still('1-battle');

    // 1. pause
    const how = await page.evaluate(pauseAsPlayer, size.touch);
    if (how.how === 'esc') await page.keyboard.press('Escape');
    await wait(700);
    const t0 = await page.evaluate(clock);
    await wait(1000);
    const t1 = await page.evaluate(clock);
    const pause = await page.evaluate(drawn, [SETTINGS, CONTROLS]);
    entry.steps.pause = { how, clock: [t0.timeS, t1.timeS], ...pause };
    await still('2-pause');
    if (!pause.controls.resume?.hit) problem('pause: Resume is not drawn on the pause');
    if (!pause.controls.paused?.hit) problem('pause: the PAUSED chip is not drawn');
    if (pause.outside.length) problem(`pause: ${pause.outside.length} grid points drawn outside Settings: ${[...new Set(pause.outside.map((o) => o.split(' ')[1]))].slice(0, 4).join(', ')}`);
    const others = pause.layers.filter((l) => !l.startsWith('div.cot-settings'));
    if (others.length) problem(`pause: a second full-window layer is drawn: ${others.join(', ')}`);
    if (t1.timeS !== t0.timeS) problem(`pause: the battle clock ran under the pause (${t0.timeS} -> ${t1.timeS})`);

    // 2. Interface
    if (pause.controls.interfaceTab) {
      await click(pause.controls.interfaceTab);
      await wait(500);
      const iface = await page.evaluate(drawn, [SETTINGS, CONTROLS]);
      entry.steps.interface = { language: iface.controls.language };
      if (!iface.controls.language?.hit) problem('interface: the language picker is not drawn on the Interface tab');
      await still('3-interface');
    } else problem('interface: no Interface tab is drawn');

    // 3. Resume
    if (pause.controls.resume) {
      const at = (await page.evaluate(drawn, [SETTINGS, CONTROLS])).controls.resume ?? pause.controls.resume;
      await click(at);
      await wait(900);
      const r0 = await page.evaluate(clock);
      await wait(1000);
      const r1 = await page.evaluate(clock);
      const resumed = await page.evaluate(drawn, [SETTINGS, CONTROLS]);
      entry.steps.resume = { clock: [r0.timeS, r1.timeS], inside: resumed.inside, layers: resumed.layers };
      if (resumed.inside > 0) problem('resume: Settings is still drawn after Resume');
      if (!(r1.timeS > r0.timeS)) problem(`resume: the battle clock does not run after Resume (${r0.timeS} -> ${r1.timeS})`);
      await still('4-resumed');
    } else problem('resume: no Resume to press');

    // 4. Photo mode and back
    const again = await page.evaluate(pauseAsPlayer, size.touch);
    if (again.how === 'esc') await page.keyboard.press('Escape');
    await wait(700);
    const before = await page.screenshot();
    const paused2 = await page.evaluate(drawn, [SETTINGS, CONTROLS]);
    if (paused2.controls.photo?.hit) {
      await click(paused2.controls.photo);
      await page.waitForFunction(() => !!document.querySelector('.cot-photo-bar')?.checkVisibility(), { timeout: 20_000, polling: 100 }).catch(() => {});
      await wait(1500); // the camera eases to the hero framing
      const photo = await page.evaluate(drawn, [['#app canvas', '.cot-photo-bar', '.cot-photo-notices'], CONTROLS]);
      const after = await page.screenshot();
      entry.steps.photo = { bar: photo.controls.photoBar, outside: photo.outside.slice(0, 6), changed: !before.equals(after) };
      await still('5-photo');
      if (!photo.controls.photoBar?.hit) problem('photo: the photo bar is not drawn');
      if (photo.outside.length) problem(`photo: ${photo.outside.length} grid points drawn over the picture: ${[...new Set(photo.outside.map((o) => o.split(' ')[1]))].slice(0, 4).join(', ')}`);
      if (before.equals(after)) problem('photo: the picture did not change (no free camera)');
      const exitAt = photo.controls.photoExit;
      if (exitAt) await click(exitAt); else await page.keyboard.press('Escape');
      await wait(900);
      const back = await page.evaluate(drawn, [SETTINGS, CONTROLS]);
      entry.steps.photoReturn = { resume: back.controls.resume, outside: back.outside.length, photoBar: back.controls.photoBar };
      await still('6-photo-return');
      if (!back.controls.resume?.hit) problem('photo: Exit does not return to the paused Settings');
      if (back.controls.photoBar) problem('photo: the bar is still drawn after Exit');
    } else problem('photo: no Photo mode is drawn on the pause');

    // 5. Leave battle
    const pausedLeave = await page.evaluate(drawn, [SETTINGS, CONTROLS]);
    let leaveAt = pausedLeave.controls.leave;
    if (!leaveAt) {
      const how3 = await page.evaluate(pauseAsPlayer, size.touch);
      if (how3.how === 'esc') await page.keyboard.press('Escape');
      await wait(700);
      leaveAt = (await page.evaluate(drawn, [SETTINGS, CONTROLS])).controls.leave;
    }
    if (leaveAt?.hit) {
      await click(leaveAt);
      const reached = await page.waitForFunction(readinessExpression('garage'), { timeout: 120_000, polling: 250 }).then(() => true, () => false);
      await wait(800);
      const garage = await page.evaluate(() => ({ shown: !!document.querySelector('.cot-garage')?.checkVisibility?.({ checkOpacity: true }),
        settings: !!document.querySelector('.cot-settings.open') }));
      entry.steps.leave = { reached, ...garage };
      await still('7-garage');
      if (!reached || !garage.shown) problem('leave: the Garage is not drawn after Leave battle');
      if (garage.settings) problem('leave: Settings is still open in the Garage');
    } else problem('leave: no Leave battle is drawn on the pause');

    if (entry.problems.length) failed++;
    console.log(`${size.name}: ${entry.problems.length ? `FAIL\n    ${entry.problems.join('\n    ')}` : 'pass'} (pause by ${how.how})`);
    await context.close();
  }
} catch (error) {
  report.errors.push(String(error?.stack ?? error).slice(0, 800));
  failed++;
  console.error(error);
} finally {
  await Promise.race([browser?.close().catch(() => {}), wait(15_000)]);
  try { browser?.process()?.kill('SIGKILL'); } catch { /* closed */ }
  await Promise.race([server?.close().catch(() => {}), wait(15_000)]);
}
report.finishedAt = new Date().toISOString();
report.failed = failed;
writeFileSync(resolve(out, `${label}-report.json`), JSON.stringify(report, null, 2));
console.log(`settings-unify: ${failed ? `${failed} size(s) failed` : 'every size passes'}; report ${resolve(out, `${label}-report.json`)}`);
process.exit(failed && !recordOnly ? 1 : 0);
