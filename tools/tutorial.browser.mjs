#!/usr/bin/env node
// tutorial.browser.mjs — the first-game tutorial walked on the live game (272). First-party tooling: Kevin B. Liu.
//
// One view (desktop 1920x1080 or phone 390x844) and one locale (en or /cn) per run, under the capture lock (render
// class; each mode keeps its hold under the 20-minute cap on a loaded machine) and one guarded browser:
//  --mode=walk (default): a fresh browser (no storage) gets the Garage chapter by itself; every step is shot, its lit
//     control found on screen (a step with a target that lights nothing fails) and the card kept clear of it; Next walks
//     to Deploy, whose press is the lit control. The battle chapter starts at the rollout: drive moves on when the tank
//     has driven 20 m, fire when the gun fires, shells when another loads (real input: W held, a press on the canvas or
//     the touch Fire button, the shell key); the rest by Next. --clip records the battle chapter (webm).
//  --mode=tips: the strategy tips on the Garage, shot step by step.
//  --mode=guard: a click on a live control in the dim and the Garage's hotkeys change nothing at any Garage step;
//     Settings hides the card until it closes; a battle started from elsewhere leaves no card (the chapter resumes on
//     the Garage's next showing); Enter on the Deploy step is Deploy (the battle chapter follows).
//  --mode=checks: Skip from every step of every chapter (the card's button, Esc in the Garage, Backspace in battle) leaves
//     no overlay and records every chapter skipped; Settings' Replay row and /?tutorial=1 replay (the flag leaves the
//     address); a returning player's boot shows nothing and loads no tutorial module.
// The report (and every shot) is written to --out (default ../first-game-tutorial-272-evidence/<view>-<locale>[-mode]).
//
//   node tools/tutorial.browser.mjs --view=desktop --locale=en --clip
//   node tools/tutorial.browser.mjs --view=phone --locale=cn --mode=tips
//   node tools/tutorial.browser.mjs --view=desktop --locale=en --mode=checks
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);
const VIEW = arg('view', 'desktop');
const LOCALE = arg('locale', 'en');
const MODE = arg('mode', 'walk');
const VIEWS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
assert.ok(VIEWS[VIEW] && (LOCALE === 'en' || LOCALE === 'cn'), 'usage: --view=desktop|phone --locale=en|cn');
const OUT = resolve(arg('out', resolve(process.cwd(), `../first-game-tutorial-272-evidence/${VIEW}-${LOCALE}${MODE === 'walk' ? '' : `-${MODE}`}`)));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { view: VIEW, locale: LOCALE, steps: [], checks: {}, errors: [], startedAt: new Date().toISOString() };
const touch = VIEW === 'phone';

let server, browser, hold;
async function openPage(context, path, before = null) {
  const page = await context.newPage();
  await page.setViewport(VIEWS[VIEW]);
  if (touch) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
  }
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text().slice(0, 300)}`); });
  await page.evaluateOnNewDocument((seed) => {
    Document.prototype.hasFocus = () => true;
    try {
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
      for (const [key, value] of Object.entries(seed ?? {})) localStorage.setItem(key, value);
    } catch { /* none */ }
  }, before);
  const port = server.httpServer.address().port;
  const prefix = LOCALE === 'cn' ? '/cn' : '';
  await page.goto(`http://127.0.0.1:${port}${prefix}${path}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
  return page;
}

const stepNow = (page) => page.evaluate(() => {
  const root = document.querySelector('.cot-tut.is-open');
  return root ? { chapter: root.dataset.chapter, step: root.dataset.step } : null;
});
async function waitStep(page, predicate, timeout = 60_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const now = await stepNow(page);
    if (predicate(now)) return now;
    if (Date.now() > until) throw new Error(`tutorial: timed out waiting; showing ${JSON.stringify(now)}`);
    await sleep(200);
  }
}
const overlayGone = (page) => page.evaluate(() => document.querySelectorAll('.cot-tut').length === 0);
const record = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cot.tutorial.v1') || 'null'));

/** Shoot the step showing and note what it lit. */
async function shoot(page, index) {
  await sleep(900); // the card's and the square's transitions and the one pulse settle
  const now = await stepNow(page);
  const facts = await page.evaluate(() => {
    const root = document.querySelector('.cot-tut.is-open');
    const spot = root?.querySelector('.cot-tut-spot')?.getBoundingClientRect();
    const card = root?.querySelector('.cot-tut-card')?.getBoundingClientRect();
    const box = (r) => (r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null);
    const lit = !!root?.classList.contains('has-spot');
    const overlap = lit && card && spot && spot.left < card.right && spot.right > card.left && spot.top < card.bottom && spot.bottom > card.top;
    const inView = card && card.left >= 0 && card.top >= 0 && card.right <= innerWidth + 1 && card.bottom <= innerHeight + 1;
    return {
      lit, spot: lit ? box(spot) : null, card: box(card), overlap: !!overlap, cardInView: !!inView,
      title: root?.querySelector('.cot-tut-title')?.textContent ?? '', body: root?.querySelector('.cot-tut-body')?.textContent ?? '',
      progress: root?.querySelector('.cot-tut-progress')?.textContent ?? '', place: root?.querySelector('.cot-tut-card')?.dataset.place ?? '',
      media: root?.querySelector('.cot-tut-media img,.cot-tut-media video')?.getAttribute('src') ?? null,
      next: root?.querySelector('.cot-tut-next')?.textContent ?? '', skip: root?.querySelector('.cot-tut-skip')?.textContent ?? '',
      shown: Object.fromEntries(['next', 'back', 'skip'].map((name) => {
        const button = root?.querySelector(`.cot-tut-${name}`);
        return [name, !!button && getComputedStyle(button).display !== 'none'];
      })),
    };
  });
  const file = `${String(index).padStart(2, '0')}-${now.step}.png`;
  await page.screenshot({ path: resolve(OUT, file) });
  const entry = { ...now, file, ...facts };
  const first = chapterSteps(now.chapter, touch ? 'touch' : 'keyboard')[0]?.id === now.step;
  assert.equal(entry.shown.back, !first, `${now.step}: Back shows on every step but a chapter's first`);
  assert.equal(entry.shown.next, now.step !== 'garage.deploy', `${now.step}: Next shows on every step but the press step`);
  assert.ok(entry.shown.skip, `${now.step}: Skip always shows`);
  report.steps.push(entry);
  console.log(`[tutorial] ${now.step}: lit=${facts.lit} place=${facts.place} overlap=${facts.overlap} "${facts.title}"`);
  return entry;
}

async function press(page, selector) {
  const handle = await page.waitForSelector(selector, { visible: true, timeout: 20_000 });
  if (touch) await handle.tap(); else await handle.click();
}

const { TUTORIAL_STEPS, chapterSteps } = await import('../src/ui/tutorial/tutorialSteps.ts');
const STEP_TARGETS_FROM_SOURCE = async () => TUTORIAL_STEPS;

try {
  const steps = await STEP_TARGETS_FROM_SOURCE();
  const targeted = new Set(steps.filter((step) => step.target.length).map((step) => step.id));
  hold = await openCaptureHold({ label: 'tutorial-browser', place: `tutorial-${VIEW}-${LOCALE}`, lockClass: 'render', timeoutMs: 60 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      `--window-size=${VIEWS[VIEW].width},${VIEWS[VIEW].height + 120}`] }), { label: 'tutorial-browser' });

  const context = await browser.createBrowserContext();
  if (MODE === 'walk') {
  // 1. A fresh player: the Garage chapter.
  const page = await openPage(context, `/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`);
  let shot = 0;
  let now = await waitStep(page, (s) => s?.step === 'garage.welcome', 120_000);
  for (;;) {
    const entry = await shoot(page, shot++);
    if (targeted.has(entry.step)) assert.ok(entry.lit, `${entry.step}: its control is on screen and lit`);
    assert.ok(!entry.overlap && entry.cardInView, `${entry.step}: the card is on screen and clear of the lit control`);
    if (entry.step === 'garage.deploy') break;
    await press(page, '.cot-tut-next');
    now = await waitStep(page, (s) => s?.step !== now.step);
  }
  // Deploy: the press on the lit control itself
  const deployRect = report.steps.at(-1).spot;
  if (touch) await page.touchscreen.tap(deployRect.x + deployRect.w / 2, deployRect.y + deployRect.h / 2);
  else await page.mouse.click(deployRect.x + deployRect.w / 2, deployRect.y + deployRect.h / 2);
  await sleep(2500);
  report.checks.garageRecord = await record(page);
  assert.equal(report.checks.garageRecord?.garage, 'done', 'the Deploy press finishes the Garage chapter');
  report.checks.difficulty = await page.evaluate(() => JSON.parse(localStorage.getItem('cot.settings.v1') || '{}').aiDifficulty ?? null);
  // a phone's Deploy opens the deploy tab: its launch starts the battle
  if (!(await page.evaluate(() => window.__DEBUG?.game?.phase === 'battle' || !!document.querySelector('.cot-bl.on')))) {
    await press(page, '[data-battle-launch]');
  }

  // 2. The battle chapter, with real input for the steps the player acts on.
  const recorder = flag('clip') ? await page.screencast({ path: resolve(OUT, 'battle-chapter.webm'), scale: touch ? 1 : 0.5 }) : null;
  now = await waitStep(page, (s) => s?.chapter === 'battle', 600_000);
  const advanced = {};
  for (;;) {
    const entry = await shoot(page, shot++);
    if (targeted.has(entry.step)) assert.ok(entry.lit, `${entry.step}: its control is on screen and lit`);
    assert.ok(!entry.overlap && entry.cardInView, `${entry.step}: the card is on screen and clear of the lit control`);
    const id = entry.step.replace(/(Touch|Pad)$/, '');
    let how = 'next';
    if (id === 'battle.drive') {
      how = 'drove';
      await page.keyboard.down('KeyW');
      try { await waitStep(page, (s) => s?.step !== entry.step, 30_000); } finally { await page.keyboard.up('KeyW'); }
    } else if (id === 'battle.fire') {
      how = 'fired';
      if (touch) await press(page, '.cot-touch .round.fire');
      else { await page.mouse.move(VIEWS[VIEW].width / 2, VIEWS[VIEW].height * 0.62); await page.mouse.down(); await sleep(120); await page.mouse.up(); }
      try { await waitStep(page, (s) => s?.step !== entry.step, 8_000); } catch {
        how = 'next (no fire heard)';
        await page.keyboard.press('Enter');
        await waitStep(page, (s) => s?.step !== entry.step);
      }
    } else if (id === 'battle.ammo') {
      how = 'loaded another shell';
      await page.keyboard.press('Digit2');
      try { await waitStep(page, (s) => s?.step !== entry.step, 8_000); } catch {
        how = 'next (no shell change heard)';
        await page.keyboard.press('Enter');
        await waitStep(page, (s) => s?.step !== entry.step);
      }
    } else if (touch) await press(page, '.cot-tut-next');
    else await page.keyboard.press('Enter');
    advanced[entry.step] = how;
    if (entry.step === 'battle.win') { await recorder?.stop(); break; }
    if (how === 'next') now = await waitStep(page, (s) => s?.step !== entry.step);
  }
  await waitStep(page, (s) => s === null, 10_000);
  report.checks.battleAdvanced = advanced;
  report.checks.battleRecord = await record(page);
  assert.equal(report.checks.battleRecord?.battle, 'done', 'the last battle step finishes the battle chapter');
  report.checks.hintStripDuringTutorial = await page.evaluate(() => document.querySelector('.cot-hints.show') ? 'shown' : 'not shown');

  } else if (MODE === 'tips') {
  // 3. The strategy tips, on the Garage (the walk's battle chapter records battle done; the tips follow on the Garage's
  //    next showing, which __TUTORIAL_START stands in for so one hold stays under the cap)
  const page = await openPage(context, `/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`);
  await waitStep(page, (s) => s?.step === 'garage.welcome', 120_000);
  await page.evaluate(() => window.__TUTORIAL_START('tips'));
  let shot = 30;
  let now;
  now = await waitStep(page, (s) => s?.chapter === 'tips', 120_000);
  for (;;) {
    const entry = await shoot(page, shot++);
    assert.ok(entry.cardInView, `${entry.step}: the card is on screen`);
    await press(page, '.cot-tut-next');
    const next = await waitStep(page, (s) => s?.step !== entry.step);
    if (next === null) break;
  }
  assert.ok(await overlayGone(page), 'the last tip leaves no overlay');
  report.checks.finalRecord = await record(page);
  assert.deepEqual(report.checks.finalRecord, { garage: 'done', battle: 'done', tips: 'done' }, 'every chapter done');

  } else if (MODE === 'guard') {
  // 5. The guard (272 blocker, the owner on the preview: a click on the dimmed Garage launched a Proving Ground battle and
  //    left the Deploy card and its box over the loading screen). (a) At every Garage step a click on a live control in
  //    the dim, and the Garage's hotkeys, change nothing. (b) Every screen change the step did not ask for leaves no
  //    card or box: a battle started from elsewhere closes the chapter and keeps its place (it resumes there on the
  //    Garage's next showing), Settings and another surface hide it until they close, and Enter on the Deploy step is
  //    Deploy (the battle chapter follows).
  const page = await openPage(context, `/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`);
  const guard = { dimClicks: [], hotkeys: [], screens: {} };
  report.checks.guard = guard;
  const phase = () => page.evaluate(() => window.__DEBUG?.game?.phase ?? null);
  const loading = () => page.evaluate(() => !!document.querySelector('.cot-bl.on') || window.__DEBUG?.game?.phase === 'battle');
  const shown = () => page.evaluate(() => {
    const root = document.querySelector('.cot-tut');
    if (!root) return { present: false, open: false, spot: false };
    const style = getComputedStyle(root);
    return { present: true, open: root.classList.contains('is-open') && style.display !== 'none', spot: root.classList.contains('has-spot') };
  });
  // (a) the dim and the hotkeys, step by step
  let s = await waitStep(page, (x) => x?.step === 'garage.welcome', 120_000);
  for (;;) {
    if (flag('screens-only')) break;
    await sleep(700);
    const target = await page.evaluate(() => {
      const root = document.querySelector('.cot-tut');
      const spot = root?.classList.contains('has-spot') ? root.querySelector('.cot-tut-spot')?.getBoundingClientRect() : null;
      const card = root?.querySelector('.cot-tut-card')?.getBoundingClientRect();
      const inside = (r, x, y, pad = 8) => !!r && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
      const live = [...document.querySelectorAll('button, [role="button"], a[href], .cot-card')].filter((el) => {
        if (el.closest('.cot-tut')) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        return !inside(spot, x, y) && !inside(card, x, y) && getComputedStyle(el).visibility !== 'hidden';
      });
      // the owner's click: Test Drive when it is on screen, else the first live control in the dim
      const pick = live.find((el) => /test drive|试驾/i.test(el.textContent ?? '')) ?? live[0];
      if (!pick) return null;
      const r = pick.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: (pick.textContent ?? '').trim().slice(0, 40) || pick.className };
    });
    if (target) {
      if (touch) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y);
      await sleep(1800);
      const after = { step: (await stepNow(page))?.step ?? null, phase: await phase(), loading: await loading() };
      guard.dimClicks.push({ step: s.step, clicked: target.label, ...after });
      console.log(`[tutorial] dim click at ${s.step} on "${target.label}": step ${after.step}, phase ${after.phase}, loading ${after.loading}`);
      assert.ok(after.step === s.step && after.phase === 'garage' && !after.loading, `${s.step}: a click in the dim ("${target.label}") changes nothing`);
    }
    if (!touch) {
      for (const key of ['KeyT', 'KeyB', 'Space', 'KeyG', 'Digit1', 'KeyM']) await page.keyboard.press(key);
      await sleep(1200);
      const after = { step: (await stepNow(page))?.step ?? null, phase: await phase(), loading: await loading() };
      guard.hotkeys.push({ step: s.step, ...after });
      assert.ok(after.step === s.step && after.phase === 'garage' && !after.loading, `${s.step}: the Garage's hotkeys change nothing`);
    }
    if (s.step === 'garage.deploy') break;
    await press(page, '.cot-tut-next');
    const was = s.step;
    s = await waitStep(page, (x) => !!x && x.step !== was);
  }
  // (b) screen changes. Settings over the Garage: the card hides while it is open and comes back on the same step.
  await page.evaluate(() => window.__TUTORIAL_START('garage'));
  s = await waitStep(page, (x) => x?.step === 'garage.welcome');
  await press(page, '.cot-tut-next');
  s = await waitStep(page, (x) => x?.step === 'garage.tank');
  await page.evaluate(() => document.querySelector('.cot-gear')?.click());
  await sleep(1500);
  const underSettings = await shown();
  // close it with its own X (Escape would open it again: the menu key toggles the panel)
  await page.evaluate(() => document.querySelector('.cot-settings.open .cot-set-close')?.click());
  await sleep(1500);
  const afterSettings = { ...(await shown()), step: (await stepNow(page))?.step ?? null,
    settingsOpen: await page.evaluate(() => !!document.querySelector('.cot-settings.open')) };
  assert.ok(!afterSettings.settingsOpen, 'Settings closed by its X');
  guard.screens.settings = { underSettings, afterSettings };
  assert.ok(!underSettings.open, 'Settings over the Garage: no card or box on it');
  assert.ok(afterSettings.open && afterSettings.step === 'garage.tank', 'Settings closed: the card is back on its step');
  // a battle the step did not ask for: the card leaves with the Garage, the chapter keeps its place
  // the owner's case: the Garage's Test Drive (a Proving Ground battle), started from outside the step
  await page.evaluate(() => { const g = window.__DEBUG.garage; if (typeof g?.testDrive === 'function') g.testDrive(); else window.__DEBUG.beginSoloBattle({}); });
  await page.waitForFunction(() => !!document.querySelector('.cot-bl.on') || window.__DEBUG?.game?.phase === 'battle', { timeout: 300_000, polling: 100 });
  const onLoading = await shown();
  await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
  await sleep(1500);
  const inBattle = { ...(await shown()), chapter: (await stepNow(page))?.chapter ?? null, record: await record(page) };
  guard.screens.otherBattle = { onLoading, inBattle };
  assert.ok(!onLoading.open, 'a battle started from elsewhere: no card on its loading screen');
  assert.ok(!inBattle.open && inBattle.record?.garage === undefined, 'no tutorial in a Proving Ground battle, and the Garage chapter is still to finish');
  await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
  const resumed = await waitStep(page, (x) => x?.chapter === 'garage', 300_000);
  guard.screens.resumed = resumed;
  assert.equal(resumed.step, 'garage.tank', 'back on the Garage, the chapter resumes where it left off');
  // Enter on the Deploy step is Deploy: the Garage chapter is done and the battle chapter follows
  if (!touch) {
    for (;;) { const cur = await stepNow(page); if (cur?.step === 'garage.deploy') break; await press(page, '.cot-tut-next'); await waitStep(page, (x) => !!x && x.step !== cur.step); }
    await sleep(700);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!document.querySelector('.cot-bl.on') || window.__DEBUG?.game?.phase === 'battle', { timeout: 300_000, polling: 100 });
    const enterLoading = await shown();
    const battle = await waitStep(page, (x) => x?.chapter === 'battle', 900_000);
    guard.screens.enterDeploy = { onLoading: enterLoading, battle, record: await record(page) };
    assert.ok(!enterLoading.open, 'Enter on Deploy: no Garage card on the loading screen');
    assert.equal(guard.screens.enterDeploy.record?.garage, 'done', 'Enter on Deploy finishes the Garage chapter');
  }
  } else {
  // 4. The checks: Skip from every step of every chapter, the replays, a returning player.
  const page = await openPage(context, `/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`);
  await waitStep(page, (s) => s?.step === 'garage.welcome', 120_000);
  await press(page, '.cot-tut-skip');

    const skips = [];
    for (const chapter of ['garage', 'tips']) {
      const count = chapterSteps(chapter, touch ? 'touch' : 'keyboard').length;
      for (let i = 0; i < count; i++) {
        await page.evaluate((c) => window.__TUTORIAL_START(c), chapter);
        let s = await waitStep(page, (x) => x?.chapter === chapter);
        for (let k = 0; k < i; k++) { await press(page, '.cot-tut-next'); const was = s.step; s = await waitStep(page, (x) => !!x && x.step !== was); }
        const how = i % 2 === 1 && !touch ? 'Esc' : 'button';
        if (how === 'Esc') await page.keyboard.press('Escape'); else await press(page, '.cot-tut-skip');
        await sleep(400);
        const gone = await overlayGone(page);
        const rec = await record(page);
        skips.push({ step: s.step, how, gone, record: rec });
        console.log(`[tutorial] skip at ${s.step} (${how}): gone=${gone} record=${JSON.stringify(rec)}`);
        assert.ok(gone && rec?.tips === 'skipped', `Skip at ${s.step} leaves nothing and records it`);
      }
    }
    report.checks.skips = skips;

    // Settings' Replay row
    await page.evaluate(() => localStorage.setItem('cot.tutorial.v1', JSON.stringify({ garage: 'skipped', battle: 'skipped', tips: 'skipped' })));
    await press(page, '.cot-gear');
    await press(page, '.cot-set-tab[data-tab="gameplay"]').catch(() => {});
    const replayRow = await page.waitForSelector('.cot-set-tutorial', { visible: true, timeout: 30_000 }).catch(() => null);
    if (replayRow) {
      await replayRow.click();
      await waitStep(page, (s) => s?.step === 'garage.welcome', 30_000);
      report.checks.settingsReplay = 'the Garage chapter ran again';
      await press(page, '.cot-tut-skip');
    } else report.checks.settingsReplay = 'the Gameplay tab did not show the row (not reached by this tool)';

    // A returning player: nothing shows and no tutorial module is asked for.
    const back = await browser.createBrowserContext();
    const returning = await openPage(back, `/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`, { 'cot.profile.v2': '{"matches":3}' });
    await sleep(6000);
    report.checks.returningPlayer = {
      overlay: !(await overlayGone(returning)),
      requests: await returning.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name)
        .filter((name) => /src\/ui\/tutorial|tutorialStrings|i18n-tutorial|surface-tutorial|media\/tutorial-r1/.test(name))),
    };
    assert.ok(!report.checks.returningPlayer.overlay && !report.checks.returningPlayer.requests.length, 'a returning player sees and loads nothing');
    // /?tutorial=1 replays
    await returning.goto(returning.url().replace(/\?.*/, '?nosplash=1&telemetry=off&tutorial=1'), { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await returning.waitForFunction(`${readinessExpression('garage')}`, { timeout: 600_000, polling: 500 });
    await waitStep(returning, (s) => s?.step === 'garage.welcome', 60_000);
    report.checks.urlReplay = { started: true, addressKeepsFlag: (await returning.evaluate(() => location.search)).includes('tutorial') };
    assert.ok(!report.checks.urlReplay.addressKeepsFlag, '/?tutorial=1 replays and drops the flag');
    await back.close();
  
  // Skip from every battle step, in one battle: Backspace and the card's button by turns.
  await page.evaluate(() => localStorage.setItem('cot.tutorial.v1', JSON.stringify({ garage: 'done', battle: 'done', tips: 'done' })));
  await page.evaluate(() => window.__DEBUG.beginSoloBattle({}));
  await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });

    const battleSkips = [];
    const battleCount = chapterSteps('battle', touch ? 'touch' : 'keyboard').length;
    for (let i = 0; i < battleCount; i++) {
      await page.evaluate(() => window.__TUTORIAL_START('battle'));
      let s = await waitStep(page, (x) => x?.chapter === 'battle');
      for (let k = 0; k < i; k++) { await page.keyboard.press('Enter'); const was = s.step; s = await waitStep(page, (x) => !!x && x.step !== was); }
      // the battle holds the mouse in pointer lock while the player aims, and a lost lock opens the pause menu (which hides
      // the card): Backspace is the battle's Skip on a keyboard (the button shows it), a tap on a touch layout
      if (!touch) await page.keyboard.press('Backspace'); else await press(page, '.cot-tut-skip');
      await sleep(400);
      const gone = await overlayGone(page);
      const rec = await record(page);
      console.log(`[tutorial] skip at ${s.step}: gone=${gone}`);
      battleSkips.push({ step: s.step, how: touch ? 'tap' : 'Backspace', gone, record: rec });
      assert.ok(gone && rec?.battle === 'skipped' && rec?.tips === 'skipped', `Skip at ${s.step} leaves nothing and records it`);
    }
    report.checks.battleSkips = battleSkips;
  
  }
  await context.close().catch(() => {});
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
  console.log(`[tutorial] ${report.ok ? 'PASS' : 'FAIL'}: ${report.steps.length} steps shot to ${OUT}`);
}
