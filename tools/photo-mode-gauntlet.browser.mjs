#!/usr/bin/env node
// The photo-mode UI gauntlet (photo-mode-271; ~/cot-launch-state/streams/brand-ui/UI-GAUNTLET.md): a real solo battle on a
// dev server, at the bar's eight sizes in en-US and zh-CN. For each size it stages the pause menu with its Photo action
// (the phone's way in), photo mode as it opens over the chase view, the hero framing on a 35 mm lens, and the top framing
// rolled +6 degrees, then closes it; once per page it saves a still (a PNG at twice the screen) and opens the Garage's
// photo mode (the same module) for the regression. Each open state is measured: nothing but the stage and the bar shows
// (the HUD steps away), the bar sits inside the screen with every control whole (no clipped label, 44 px touch targets),
// the datum census is clean, and the battle stands still (its clock and the pause edge). Runs under the capture lock
// (runWarmHold): the battles warm while queued, the hold takes the shots.
// node tools/photo-mode-gauntlet.browser.mjs --out=~/cot-lanes/photo-mode-271/gauntlet/r1 --only=desktop-en (one page a run:
// four battles warmed together pass the browser guard's tree cap)
import puppeteer from 'puppeteer';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { runWarmHold, startViteChild, warmPage } from './capture-hold.mjs';
import { datumProblems } from './datum-census.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const out = resolve(arg('out', 'outputs/photo-mode-gauntlet').replace(/^~/, process.env.HOME));
const only = arg('only', '').split(',').filter(Boolean);
const TANK = arg('tank', 'm1a1_abrams_hc');
const MAP = arg('map', '') || null;

const DESKTOP = [[2560, 1440], [1920, 1080], [1440, 900], [1280, 800], [1024, 600], [900, 700]];
const TOUCH = [[390, 844], [844, 390]];
const PAGES = [
  { id: 'desktop-en', locale: 'en-US', touch: false, sizes: DESKTOP },
  { id: 'desktop-zh', locale: 'zh-CN', touch: false, sizes: DESKTOP },
  { id: 'touch-en', locale: 'en-US', touch: true, sizes: TOUCH },
  { id: 'touch-zh', locale: 'zh-CN', touch: true, sizes: TOUCH },
].filter((page) => !only.length || only.includes(page.id));

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const frames = (page, n = 6) => page.evaluate((count) => new Promise((done) => {
  let left = count; const step = () => (--left <= 0 ? done() : requestAnimationFrame(step)); requestAnimationFrame(step);
}), n);

/** In the page: the open photo mode's measures. */
function measureOpen({ touch }) {
  const D = window.__DEBUG;
  const bar = document.querySelector('.cot-photo-bar');
  const vw = innerWidth, vh = innerHeight;
  const visible = (node) => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  // every element that paints outside the stage and the bar (text, a box with a size): none may
  const stray = [];
  for (const node of document.body.querySelectorAll('*')) {
    if (bar?.contains(node) || node.closest('#app') && node.tagName === 'CANVAS') continue;
    if (['SCRIPT', 'STYLE', 'LINK', 'svg', 'path', 'use'].includes(node.tagName)) continue;
    const r = node.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    if (!visible(node)) continue;
    const style = getComputedStyle(node);
    const paints = (node.childNodes.length && [...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      || style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none' || style.boxShadow !== 'none'
      || parseFloat(style.borderTopWidth) > 0 || node.tagName === 'IMG' || node.tagName === 'CANVAS';
    if (paints) stray.push(`${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${[...node.classList].join('.')}`);
  }
  const box = bar?.getBoundingClientRect();
  const controls = [...(bar?.querySelectorAll('.cot-c-seg__opt, .cot-c-btn') ?? [])].map((node) => {
    const r = node.getBoundingClientRect();
    const label = node.querySelector('span') ?? node;
    return { text: node.textContent.trim(), w: r.width, h: r.height, clipped: label.scrollWidth > label.clientWidth + 1
      || node.scrollWidth > node.clientWidth + 1, lines: Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight || '16')) };
  });
  // the groups and the buttons that share a row share its top and bottom edges (critic r7 line 2)
  const rowItems = [...(bar?.querySelectorAll(':scope > .cot-c-seg, .cot-photo-actions > .cot-c-btn') ?? [])]
    .map((node) => ({ text: node.textContent.trim().slice(0, 12), r: node.getBoundingClientRect() }));
  const rowEdges = [];
  for (const [i, a] of rowItems.entries()) {
    for (const b of rowItems.slice(i + 1)) {
      const sameRow = a.r.top < b.r.bottom && b.r.top < a.r.bottom;
      if (sameRow && (Math.abs(a.r.top - b.r.top) > 0.5 || Math.abs(a.r.bottom - b.r.bottom) > 0.5)) {
        rowEdges.push(`${a.text} ${a.r.top.toFixed(1)}-${a.r.bottom.toFixed(1)} vs ${b.text} ${b.r.top.toFixed(1)}-${b.r.bottom.toFixed(1)}`);
      }
    }
  }
  return {
    open: document.body.classList.contains('cot-photo-on') && document.body.dataset.cotPhoto === 'battle',
    rowEdges,
    paused: D.pauseInfo.paused === true,
    phase: D.game.phase,
    bar: box ? { x0: box.left, y0: box.top, x1: box.right, y1: box.bottom } : null,
    inside: !!box && box.left >= 15.5 && box.right <= vw - 15.5 && box.top >= 0 && box.bottom <= vh,
    controls,
    small: touch ? controls.filter((c) => c.h < 44 || c.w < 44).map((c) => `${c.text} ${c.w.toFixed(0)}x${c.h.toFixed(0)}`) : [],
    clipped: controls.filter((c) => c.clipped).map((c) => c.text),
    stray: stray.slice(0, 40),
    timeS: D.game.timeS,
    focus: document.activeElement?.closest('.cot-photo-bar') ? document.activeElement.textContent.trim() : null,
  };
}

async function shot(page, dir, name) {
  await frames(page, 4);
  const path = resolve(dir, `${name}.png`);
  await page.screenshot({ path });
  return path;
}

/** Wait until `selector` shows (or, with `hidden`, is gone or hidden), polled on an interval: puppeteer's
 *  waitForSelector visible/hidden polls on animation frames, which a frozen or background warm page never runs (r11: the
 *  pause menu's Photo button stood visible at 2560x1440 while the wait timed out). */
function waitShown(page, selector, { hidden = false, timeout = 20_000 } = {}) {
  return page.waitForFunction((sel, wantHidden) => {
    const node = document.querySelector(sel);
    const shown = !!node && node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
    return wantHidden ? !shown : shown;
  }, { timeout, polling: 100 }, selector, hidden);
}

/** Wait until the camera holds still (under 1 cm and 0.1° of change across half a second), polled on an interval: a fixed
 *  sleep shot the Garage's hero mid-flight on a throttled page (critic r12 line 8). Resolves whether it settled. */
function waitCameraSettled(page, timeout = 20_000) {
  return page.waitForFunction(() => {
    const cam = window.__DEBUG.camera;
    const now = [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w];
    const t = performance.now();
    const last = window.__cotPhotoCamLast;
    if (!last || now.slice(0, 3).some((v, i) => Math.abs(v - last.now[i]) > 0.01)
      || now.slice(3).some((v, i) => Math.abs(v - last.now[i + 3]) > 0.0009)) {
      window.__cotPhotoCamLast = { now, t };
      return false;
    }
    return t - last.t >= 500;
  }, { timeout, polling: 100 }).then(() => true, () => false);
}

async function clickIn(page, selector) {
  await waitShown(page, selector).catch(async (error) => {
    // say what the page showed instead: the target's state, the open surfaces, the battle's
    const state = await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      const r = node?.getBoundingClientRect();
      const D = window.__DEBUG;
      return { found: !!node, hidden: node?.hidden ?? null, box: r ? [r.left, r.top, r.width, r.height] : null,
        visible: node?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ?? null,
        settingsOpen: !!document.querySelector('.cot-settings.open'), surfaces: window.__cotSurfaces?.() ?? null,
        phase: D?.game.phase, result: !!D?.game.result, paused: D?.pauseInfo?.paused ?? null,
        bodyClass: document.body.className, htmlData: { ...document.documentElement.dataset } };
    }, selector).catch((probe) => ({ probe: String(probe) }));
    throw new Error(`${selector} never showed: ${JSON.stringify(state)}`, { cause: error });
  });
  // (settings-unify-278 fix-back) shown is not pressable: the click lands on whatever is drawn at the target's centre. A
  // control under another layer (the first-game tutorial offer's START over the Garage's Photo button) fails here by
  // name, not as the next wait's timeout after the press went to the cover.
  const cover = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    let r = node.getBoundingClientRect();
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // puppeteer's click scrolls the same way first
      r = node.getBoundingClientRect();
    }
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === node || node.contains(hit))) return null;
    const describe = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].map((c) => `.${c}`).join('')}` : 'nothing');
    const host = hit?.closest('[popover], dialog, section, [role="dialog"]');
    return { at: [Math.round(x), Math.round(y)], hit: describe(hit), within: host ? describe(host) : null,
      text: (hit?.closest('button, section, [role="dialog"]')?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) };
  }, selector);
  if (cover) throw new Error(`${selector} is covered at its centre: ${JSON.stringify(cover)}`);
  await (await page.$(selector)).click();
}

async function warmBattle(browser, url, spec) {
  const [w, h] = spec.sizes[0];
  const viewport = { width: w, height: h, deviceScaleFactor: 1, isMobile: spec.touch, hasTouch: spec.touch };
  // the dev server installs __DEBUG; ?debug=1 would also raise the perf panel over the menu (it took the Photo press at 844x390)
  const page = await warmPage(browser, `${url}/`, {
    viewport,
    ready: 'window.__GAME_READY === true && !!window.__DEBUG',
    after: async (p) => {
      // desktop-en: the training battle (the loaner on its ground, src/sim/trainingGround.ts), where 274's journey shows
      // its cards: photo mode is judged beside a live one (settings-unify-278 fix-back)
      if (spec.id === 'desktop-en') {
        await p.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); },
          { specId: 'm1a1', mapId: 'verdant', gameMode: 'training' });
      } else {
        await p.evaluate(async (tank, map) => {
          await window.__DEBUG.startBattle(tank, map);
        }, TANK, MAP);
      }
      await p.waitForFunction(() => window.__DEBUG.game.phase === 'battle' && !document.querySelector('.cot-bl.on'),
        { timeout: 900_000, polling: 1000 });
      await p.evaluate(() => window.__DEBUG.fastForward?.(4));
      await p.waitForFunction(() => window.__DEBUG.game.preBattleS === 0, { timeout: 300_000, polling: 1000 });
    },
  });
  return page;
}

async function shootPage(page, spec, { signal, checkpoint }) {
  const report = { id: spec.id, sizes: [], problems: [] };
  const dir = resolve(out, spec.id);
  await mkdir(dir, { recursive: true });
  for (const [width, height] of spec.sizes) {
    if (signal.aborted) break;
    const size = `${width}x${height}`;
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: spec.touch, hasTouch: spec.touch });
    await sleep(800);
    await frames(page, 10);
    const entry = { size, states: {} };
    const tutorialCard = () => page.evaluate(() => !!document.querySelector('.cot-tut-card')
      ?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
    entry.tutorialBefore = await tutorialCard();
    // 1. the pause menu and its Photo action (the phone's way in; Esc's menu on a desktop)
    await page.evaluate(() => window.__DEBUG.settings.open());
    await waitShown(page, '.cot-settings.open');
    await sleep(500);
    const menu = await page.evaluate(() => {
      const button = document.querySelector('.cot-set-btn.photo');
      const r = button?.getBoundingClientRect();
      return { shown: !!button && !button.hidden && r.width > 0, w: r?.width ?? 0, h: r?.height ?? 0,
        clipped: button ? button.scrollWidth > button.clientWidth + 1 : null, text: button?.textContent.trim() };
    });
    entry.states.menu = { shot: await shot(page, dir, `${size}-1-menu`), ...menu };
    if (!menu.shown) report.problems.push(`${spec.id} ${size}: the pause menu shows no Photo action`);
    // 2. photo mode, opened from the pause menu, over the chase view
    await clickIn(page, '.cot-set-btn.photo');
    await waitShown(page, '.cot-photo-bar', { timeout: 60_000 });
    // the bar's layout box as it first shows, against the settled one below: opening shifts nothing (critic r12 line 9).
    // The layout box, not the painted one: the bar rises into place through the shared motion vocabulary (cot-m-rise,
    // a translate that moves no layout); a layout that jumps (the fit's row/grid/stack pick) still counts
    const layoutBox = () => { const b = document.querySelector('.cot-photo-bar');
      return { x0: b.offsetLeft, y0: b.offsetTop, x1: b.offsetLeft + b.offsetWidth, y1: b.offsetTop + b.offsetHeight }; };
    const firstBar = await page.evaluate(layoutBox);
    await sleep(900);
    const t0 = await page.evaluate(() => window.__DEBUG.game.timeS);
    await sleep(700);
    const open = await page.evaluate(measureOpen, { touch: spec.touch });
    open.frozen = open.timeS === t0;
    open.firstBar = firstBar;
    const settledBar = open.bar ? await page.evaluate(layoutBox) : null;
    open.openShiftPx = settledBar ? Math.max(...['x0', 'y0', 'x1', 'y1'].map((k) => Math.abs(settledBar[k] - firstBar[k]))) : null;
    open.datum = await datumProblems(page);
    entry.states.open = { shot: await shot(page, dir, `${size}-2-open`), ...open };
    // 3. the hero framing on a 35 mm lens
    await clickIn(page, '.cot-photo-views [data-value="hero"]');
    await clickIn(page, '.cot-photo-lens [data-value="35"]');
    await sleep(1200);
    entry.states.hero = { shot: await shot(page, dir, `${size}-3-hero-35`), ...(await page.evaluate(measureOpen, { touch: spec.touch })) };
    // 4. the top framing, rolled +6 degrees, on an 18 mm lens
    await clickIn(page, '.cot-photo-views [data-value="top"]');
    await clickIn(page, '.cot-photo-tilt [data-value="6"]');
    await clickIn(page, '.cot-photo-lens [data-value="18"]');
    await sleep(1200);
    entry.states.top = { shot: await shot(page, dir, `${size}-4-top-tilt`), ...(await page.evaluate(measureOpen, { touch: spec.touch })) };
    // 4b. a keyboard's focus in the bar (the kit's focus ring), on a desktop
    if (!spec.touch) {
      await page.keyboard.press('Tab');
      await sleep(300);
      entry.states.focus = { shot: await shot(page, dir, `${size}-5-focus`), ...(await page.evaluate(measureOpen, { touch: spec.touch })),
        ring: await page.evaluate(() => { const node = document.activeElement; return node?.closest('.cot-photo-bar')
          ? { text: node.textContent.trim(), visible: node.matches(':focus-visible'), outline: getComputedStyle(node).outlineStyle,
            shadow: getComputedStyle(node).boxShadow } : null; }) };
      // the ring shows on top of the selected edge: two shadows, the focus ring's outer one 4 px wide
      if (entry.states.focus.ring?.visible && !/ 4px/.test(entry.states.focus.ring.shadow)) {
        report.problems.push(`${spec.id} ${size}: the focused option shows no focus ring ${entry.states.focus.ring.shadow}`);
      }
      if (!entry.states.focus.ring?.visible) report.problems.push(`${spec.id} ${size}: Tab shows no focus in the bar ${JSON.stringify(entry.states.focus.ring)}`);
    }
    for (const [state, value] of Object.entries(entry.states)) {
      if (state === 'menu') continue;
      if (!value.open || !value.paused) report.problems.push(`${spec.id} ${size} ${state}: open ${value.open}, paused ${value.paused}`);
      if (!value.inside) report.problems.push(`${spec.id} ${size} ${state}: the bar leaves the screen ${JSON.stringify(value.bar)}`);
      if (value.stray.length) report.problems.push(`${spec.id} ${size} ${state}: shows ${value.stray.join(', ')}`);
      if (value.clipped.length) report.problems.push(`${spec.id} ${size} ${state}: clipped ${value.clipped.join(', ')}`);
      if (value.small.length) report.problems.push(`${spec.id} ${size} ${state}: small targets ${value.small.join(', ')}`);
      if (value.datum?.length) report.problems.push(`${spec.id} ${size} ${state}: ${value.datum.join(', ')}`);
      if (value.rowEdges?.length) report.problems.push(`${spec.id} ${size} ${state}: row edges differ ${value.rowEdges.join('; ')}`);
    }
    if (!open.frozen) report.problems.push(`${spec.id} ${size}: the battle clock ran under photo mode`);
    if (!(open.openShiftPx <= 0.5)) report.problems.push(`${spec.id} ${size}: the bar moved ${open.openShiftPx} px after it showed`);
    // 5. the ways back (integ 278, settings-unify-278's shipped flow, c0281c2099): photo mode opened from Settings returns to
    //    the paused Settings it came from, by Esc; Settings' Photo mode button opens it again; Resume runs the battle; and on
    //    a desktop P opens it from the running battle, whose Esc returns to the battle, running (main.ts openBattlePhoto)
    const before = await page.evaluate(() => ({ surfaces: window.__cotSurfaces?.() ?? null,
      focus: document.activeElement?.className ?? null }));
    const closePhoto = async (how) => {
      await page.keyboard.press('Escape');
      const closed = await waitShown(page, '.cot-photo-bar', { hidden: true, timeout: 8_000 }).then(() => true, () => false);
      if (!closed) {
        report.problems.push(`${spec.id} ${size}: Esc left photo mode open (${how}) ${JSON.stringify(before)}`);
        await clickIn(page, '[data-photo-exit]');
        await waitShown(page, '.cot-photo-bar', { hidden: true, timeout: 20_000 });
      }
      await sleep(600);
    };
    const state = () => page.evaluate(() => ({ on: document.body.classList.contains('cot-photo-on'),
      paused: window.__DEBUG.pauseInfo.paused, hud: !!document.querySelector('.cot-hud')?.checkVisibility(),
      settings: !!document.querySelector('.cot-settings.open')?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) }));
    const backToSettings = (how, at) => {
      if (at.on || !at.paused || !at.settings) report.problems.push(`${spec.id} ${size}: ${how} did not return to the paused Settings ${JSON.stringify(at)}`);
    };
    const backToBattle = (how, at) => {
      if (at.on || at.paused || at.settings || !at.hud) report.problems.push(`${spec.id} ${size}: ${how} did not return to the running battle ${JSON.stringify(at)}`);
    };
    await closePhoto('opened from Settings');
    entry.ways = { settingsAfterEsc: await state() };
    backToSettings('Esc from photo mode opened in Settings', entry.ways.settingsAfterEsc);
    // way back in 1: Settings' Photo mode button, and Esc returns to Settings again
    await clickIn(page, '.cot-set-btn.photo');
    entry.ways.reopenedFromSettings = await waitShown(page, '.cot-photo-bar', { timeout: 20_000 }).then(() => true, () => false);
    if (!entry.ways.reopenedFromSettings) report.problems.push(`${spec.id} ${size}: Settings' Photo mode button did not open photo mode again`);
    else {
      await sleep(600);
      await closePhoto('reopened from Settings');
      entry.ways.settingsAgain = await state();
      backToSettings('Esc from photo mode reopened in Settings', entry.ways.settingsAgain);
    }
    // Resume runs the battle. Chrome refuses every pointer relock for 1250 ms after an Esc, and a refused relock reopens
    // Settings paused by design (aim-focus 243, settings.ts relockRefused), so Resume waits out that window as a player's
    // hand does, then the battle must be running (unpaused, Settings closed) before anything else is pressed
    await sleep(1500);
    await clickIn(page, '.cot-set-btn.resume');
    await page.waitForFunction(() => !window.__DEBUG.pauseInfo.paused && !document.querySelector('.cot-settings.open'),
      { timeout: 8_000, polling: 100 }).catch(() => {});
    await sleep(600);
    entry.ways.resumed = await state();
    backToBattle('Resume', entry.ways.resumed);
    // way back in 2, a desktop's: P from the running battle; its Esc returns to the battle, running
    if (!spec.touch && !entry.ways.resumed.paused && !entry.ways.resumed.settings) {
      await page.keyboard.press('KeyP');
      entry.ways.openedByP = await waitShown(page, '.cot-photo-bar', { timeout: 20_000 }).then(() => true, () => false);
      if (!entry.ways.openedByP) report.problems.push(`${spec.id} ${size}: P did not open photo mode from the running battle`);
      else { await sleep(600); await closePhoto('opened by P'); }
    }
    const back = await state();
    entry.back = back;
    // the tutorial's card, live before photo mode, is live again after it (it hides while photo mode shows: stray above)
    await sleep(400);
    entry.tutorialAfter = await tutorialCard();
    if (entry.tutorialBefore && !entry.tutorialAfter) report.problems.push(`${spec.id} ${size}: the tutorial card did not come back after photo mode`);
    backToBattle(spec.touch ? 'Resume' : 'Esc from photo mode opened by P', back);
    report.sizes.push(entry);
    await checkpoint?.();
  }
  if (!signal.aborted && spec.id === 'desktop-en') report.save = await saveStill(page, dir);
  if (report.save) report.problems.push(...saveProblems(report.save));
  // Save's states at two more sizes per page: the two-row layout, the other locale, both phone orientations (critic r13 line 8)
  report.saveStates = [];
  const saveSizes = spec.touch ? spec.sizes : spec.id === 'desktop-en' ? [[1024, 600]] : [[1440, 900], [1024, 600]];
  for (const size of saveSizes) {
    if (signal.aborted) break;
    const states = await saveStatesAt(page, dir, spec, size);
    report.saveStates.push(states);
    report.problems.push(...saveStateProblems(`${spec.id} ${states.size}`, states));
  }
  // desktop-en exercises the tutorial beside photo mode, in the training battle (274's journey runs its cards there only):
  // its card must have been live at some size
  if (spec.id === 'desktop-en' && !report.sizes.some((entry) => entry.tutorialBefore)) {
    report.problems.push('desktop-en: the training battle\'s tutorial card never showed, so photo mode was not judged beside it');
  }
  // the Garage keeps photo mode to its docked layout (showroom.css hides the button in the overlay one, a phone's)
  if (!signal.aborted && !spec.touch) report.garage = await garagePhoto(page, spec, dir);
  for (const entry of report.garage?.shots ?? []) {
    if (!entry.settled) report.problems.push(`${spec.id} garage ${entry.size}: the camera never settled before the shot`);
    if (!entry.inside || entry.garageVisible || entry.lens) report.problems.push(`${spec.id} garage ${entry.size}: ${JSON.stringify(entry)}`);
  }
  return report;
}

/** Save a still at 1440x900: a PNG twice the screen. */
/** Save's states with photo mode open: busy (the PNG's encode held 1.5 s; the frame is still read at the press) and
 *  failed (the canvas reads as nothing: the kit's error toast, clear of the bar, and Save enabled again). `tag` names the shots. */
const saveState = (page) => page.evaluate(() => {
  const button = document.querySelector('[data-photo-save]');
  return { disabled: button.disabled, ariaBusy: button.getAttribute('aria-busy'),
    barShown: !!document.querySelector('.cot-photo-bar')?.checkVisibility({ checkVisibilityCSS: true }) };
});
async function pressSaveBusy(page, dir, tag) {
  await page.evaluate(() => {
    const real = window.__cotRealToBlob ??= HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (done, ...rest) { real.call(this, (blob) => setTimeout(() => done(blob), 1500), ...rest); };
  });
  await clickIn(page, '[data-photo-save]');
  return { ...(await saveState(page)), shot: await shot(page, dir, `${tag}-save-1-busy`) };
}
async function pressSaveFailed(page, dir, tag, { keep = false } = {}) {
  await page.evaluate(() => {
    window.__cotRealToBlob ??= HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (done) { setTimeout(() => done(null), 0); };
  });
  await clickIn(page, '[data-photo-save]');
  const shown = await waitShown(page, '.cot-photo-notices > *', { timeout: 10_000 }).then(() => true, () => false);
  await sleep(400);
  const failed = {
    shown,
    ...(await page.evaluate(() => {
      const toast = document.querySelector('.cot-photo-notices > *');
      const bar = document.querySelector('.cot-photo-bar').getBoundingClientRect();
      const r = toast?.getBoundingClientRect();
      return { text: toast?.textContent.trim() ?? null, retry: !!toast?.querySelector('[data-notice-action]'),
        overlapsBar: !!r && r.bottom > bar.top && r.top < bar.bottom && r.right > bar.left && r.left < bar.right,
        inside: !!r && r.left >= 0 && r.right <= innerWidth && r.top >= 0,
        saveEnabled: !document.querySelector('[data-photo-save]').disabled };
    })),
    shot: await shot(page, dir, `${tag}-save-2-failed`),
  };
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__cotRealToBlob; });
  // the toast is put away before the next capture (its close), unless the caller checks it closes with photo mode
  if (!keep) {
    await page.evaluate(() => document.querySelector('.cot-photo-notices [data-notice-close]')?.click());
    await sleep(400);
  }
  return failed;
}
function saveStateProblems(where, { busy, after, failed }) {
  const problems = [];
  if (!busy.disabled || busy.ariaBusy !== 'true' || !busy.barShown) problems.push(`${where} save busy ${JSON.stringify(busy)}`);
  if (after && (after.disabled || after.ariaBusy !== 'false')) problems.push(`${where} save still busy ${JSON.stringify(after)}`);
  if (!failed.shown || failed.retry || failed.overlapsBar || !failed.inside || !failed.saveEnabled) problems.push(`${where} save failure ${JSON.stringify(failed)}`);
  return problems;
}

/** Save's busy and failed states at one size (every page captures two: a second layout, the other locale, a phone). */
async function saveStatesAt(page, dir, spec, [width, height]) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: spec.touch, hasTouch: spec.touch });
  await sleep(600);
  // through the pause menu's Photo (a phone's way in), closed with Exit
  await page.evaluate(() => window.__DEBUG.settings.open());
  await waitShown(page, '.cot-settings.open');
  await clickIn(page, '.cot-set-btn.photo');
  await waitShown(page, '.cot-photo-bar', { timeout: 60_000 });
  await sleep(800);
  const tag = `${width}x${height}`;
  const busy = await pressSaveBusy(page, dir, tag);
  await waitShown(page, '[data-photo-save]:not([disabled])', { timeout: 20_000 }).catch(() => {});
  await sleep(300);
  const after = await saveState(page);
  const failed = await pressSaveFailed(page, dir, tag);
  await clickIn(page, '[data-photo-exit]');
  await waitShown(page, '.cot-photo-bar', { hidden: true, timeout: 20_000 });
  await sleep(600);
  return { size: tag, busy, after, failed };
}

async function saveStill(page, dir) {
  const downloads = resolve(dir, 'downloads');
  await rm(downloads, { recursive: true, force: true });
  await mkdir(downloads, { recursive: true });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await sleep(600);
  const cdp = await page.createCDPSession();
  // each page has a browser context of its own: the download rule must name it
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads,
    browserContextId: page.browserContext().id });
  // (integ 278) the battle runs here (step 5 ended in it: Resume, then P and Esc), so P opens photo mode from the battle
  const entered = await page.evaluate(() => ({ paused: window.__DEBUG.pauseInfo.paused,
    settings: !!document.querySelector('.cot-settings.open')?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) }));
  await page.keyboard.press('KeyP');
  const opened = await waitShown(page, '.cot-photo-bar', { timeout: 60_000 }).then(() => true, () => false);
  if (!opened) return { entered, opened };
  await sleep(800);
  const result = { entered, opened, busy: await pressSaveBusy(page, dir, '1440x900') };
  let file = null;
  for (let i = 0; i < 120 && !file; i += 1) {
    await sleep(500);
    file = (await readdir(downloads)).find((name) => name.endsWith('.png')) ?? null;
  }
  result.file = file;
  if (file) {
    const bytes = await import('node:fs').then((fs) => fs.readFileSync(resolve(downloads, file)));
    result.width = bytes.readUInt32BE(16);
    result.height = bytes.readUInt32BE(20);
    result.bytes = (await stat(resolve(downloads, file))).size;
  }
  await sleep(300);
  result.after = await saveState(page);
  result.failed = await pressSaveFailed(page, dir, '1440x900', { keep: true });
  // reduced motion: a framing lands on the next frame (no ease), read off the camera frame by frame
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await sleep(300);
  await clickIn(page, '.cot-photo-views [data-value="side"]');
  const track = await page.evaluate(() => new Promise((done) => {
    const cam = window.__DEBUG.camera;
    const at = [];
    const step = () => { at.push([cam.position.x, cam.position.y, cam.position.z]); if (at.length < 12) requestAnimationFrame(step); else done(at); };
    requestAnimationFrame(step);
  }));
  const gap = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  result.reducedMotion = { movedAfterFirstFramesM: gap(track[2], track[11]) };
  await page.emulateMediaFeatures([]);
  await page.keyboard.press('KeyP');
  await waitShown(page, '.cot-photo-bar', { hidden: true, timeout: 20_000 });
  await sleep(600);
  // opened by P from the battle, it closes back to the battle, running
  result.closedTo = await page.evaluate(() => ({ paused: window.__DEBUG.pauseInfo.paused,
    settings: !!document.querySelector('.cot-settings.open')?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) }));
  result.toastAfterClose = await page.evaluate(() => document.querySelectorAll('.cot-photo-notices > :not([data-state=exit])').length);
  return result;
}

function saveProblems(save) {
  const problems = [];
  if (save.entered.paused || save.entered.settings) problems.push(`save: the battle was not running before P ${JSON.stringify(save.entered)}`);
  if (!save.opened) return [...problems, 'save: P did not open photo mode from the running battle'];
  if (save.closedTo.paused || save.closedTo.settings) problems.push(`save: P closed photo mode to ${JSON.stringify(save.closedTo)}, not the running battle`);
  if (!save.file || save.width !== 2880 || save.height !== 1800) problems.push(`save: no 2880x1800 still (${save.file} ${save.width}x${save.height})`);
  problems.push(...saveStateProblems('1440x900', save));
  if (!(save.reducedMotion.movedAfterFirstFramesM < 0.01)) problems.push(`save: under reduced motion the camera eased ${save.reducedMotion.movedAfterFirstFramesM} m`);
  if (save.toastAfterClose) problems.push('save: the failure toast outlived photo mode');
  return problems;
}

/** The Garage's photo mode (the same module) at two desktop sizes: one row and the two-row fold. */
async function garagePhoto(page, spec, dir) {
  await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
  await page.waitForFunction(() => window.__DEBUG.game.phase === 'garage' && !document.querySelector('.cot-bl.on'),
    { timeout: 600_000, polling: 1000 });
  await sleep(4000);
  // (settings-unify-278 fix-back) a tutorial card left open over the Garage (an unanswered first-game offer: the 272 record
  // shape opened it, the v:2 records above do not) is answered Not now, its quiet button, as a player does, before the
  // Photo press; clickIn's hit test names any other cover
  const offer = await waitShown(page, '.cot-tut .cot-tut-skip', { timeout: 6_000 }).then(() => true, () => false);
  if (offer) {
    await clickIn(page, '.cot-tut .cot-tut-skip');
    await waitShown(page, '.cot-tut .cot-tut-card', { hidden: true, timeout: 10_000 });
    await sleep(600);
  }
  const shots = [];
  for (const [width, height] of [spec.sizes[2], [1024, 600]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: spec.touch, hasTouch: spec.touch });
    await sleep(1200);
    await clickIn(page, '[data-lt-photo]');
    await waitShown(page, '.cot-photo-bar', { timeout: 60_000 });
    const settled = await waitCameraSettled(page);
    const state = await page.evaluate(() => {
      const bar = document.querySelector('.cot-photo-bar').getBoundingClientRect();
      return {
        scope: document.body.dataset.cotPhoto,
        views: [...document.querySelectorAll('.cot-photo-bar .cot-c-seg')].length,
        lens: !!document.querySelector('.cot-photo-lens'),
        garageVisible: !!document.querySelector('.cot-garage')?.checkVisibility({ checkVisibilityCSS: true }),
        inside: bar.left >= 15.5 && bar.right <= innerWidth - 15.5 && bar.bottom <= innerHeight,
      };
    });
    shots.push({ size: `${width}x${height}`, shot: await shot(page, dir, `garage-${width}x${height}`), settled, ...state });
    await page.keyboard.press('Escape');
    await waitShown(page, '.cot-photo-bar', { hidden: true, timeout: 20_000 });
  }
  return { offerAnsweredNotNow: offer, shots, settled: shots.every((entry) => entry.settled) };
}

await mkdir(out, { recursive: true });
const result = await runWarmHold({
  label: 'photo-mode-271-gauntlet',
  // one battle per run (four warmed together passed the browser guard's 10 GB tree cap): --only=<page>
  place: `photo-mode-271-gauntlet-${only.join('+') || 'all'}`,
  lockClass: 'render',
  warm: async () => {
    const server = await startViteChild({ mode: 'dev', port: 5600 + (process.pid % 300) });
    const browser = await launchGuardedBrowser(puppeteer, {
      headless: 'new',
      // a warm page waits in the background for the lock; Chrome's throttled timers there starved every interval poll
      // (r14: desktop-zh's visible Photo button timed out, touch-zh's re-warm ran past the hold cap), as couch-e2e found
      args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
      protocolTimeout: 900_000,
      timeout: 180_000,
    }, { label: 'photo-mode-271-gauntlet' });
    const pages = [];
    const bySpec = new Map();
    try {
      for (const spec of PAGES) {
        // a context per page, its locale and an easy battle set before the first document
        const context = await browser.createBrowserContext();
        const page = await warmBattle({ newPage: async () => {
          const fresh = await context.newPage();
          // the first-game tutorial (272.1): desktop-en leaves its battle chapter due, so photo mode is judged beside a
          // live card (it must step aside while photo mode shows, and come back); every other page has played it
          // (settings-unify-278 fix-back) the journey's v:2 record (274, tutorialRecord.ts RECORD_VERSION). The 272 shape
          // (garage, battle, tips; no v) reads as a returning player's: its offer opened over the Garage, and 274's
          // journey runs no card in a plain battle. desktop-en is a player who pressed the offer's Start (what
          // answerTutorialOffer writes): the training chapter is due, and its battle is the training one (warmBattle)
          const tutorial = spec.id === 'desktop-en' ? { v: 2, offer: 'start', garage: 'done' }
            : { v: 2, garage: 'skipped', training: 'skipped', debrief: 'skipped', tour: 'skipped', offer: 'later' };
          await fresh.evaluateOnNewDocument((locale, record) => {
            try {
              localStorage.setItem('cot.locale', locale);
              localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy' }));
              localStorage.setItem('cot.tutorial.v1', JSON.stringify(record));
            } catch { /* private */ }
          }, spec.locale, tutorial);
          return fresh;
        } }, server.url, spec);
        pages.push(page);
        bySpec.set(spec.id, page);
        console.log(`[photo-mode-gauntlet] warm ${spec.id}`);
      }
    } catch (error) {
      await browser.close();
      await server.close();
      throw error;
    }
    return { pages, bySpec, close: async () => { await browser.close(); await server.close(); } };
  },
  shoot: async ({ bySpec, signal, checkpoint }) => {
    const reports = [];
    for (const spec of PAGES) {
      if (signal.aborted) break;
      const page = bySpec.get(spec.id);
      await page.bringToFront();
      reports.push(await shootPage(page, spec, { signal, checkpoint }));
      await writeFile(resolve(out, `report-${spec.id}.json`), JSON.stringify(reports, null, 2));
    }
    return reports;
  },
});
const problems = (result ?? []).flatMap((report) => report.problems);
// a hold torn down before the shoot returns no pages and no problems: that run proved nothing (r14 touch-zh exited 0)
const missing = PAGES.filter((spec) => !(result ?? []).some((report) => report.id === spec.id)).map((spec) => spec.id);
if (missing.length) problems.push(`never shot: ${missing.join(', ')}`);
console.log(JSON.stringify({ out, pages: (result ?? []).map((r) => r.id), save: result?.find((r) => r.save)?.save, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
