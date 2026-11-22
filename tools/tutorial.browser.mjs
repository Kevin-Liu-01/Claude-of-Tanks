#!/usr/bin/env node
// tutorial.browser.mjs — the first-game tutorial's journey and its offer on the live game (272; the journey, 274).
// First-party tooling: Kevin B. Liu.
//
// One view (desktop 1440x900 or phone 390x844) and one locale (en or /cn) per run, under the capture lock (render class)
// and one guarded browser. Each case is a fresh browser context:
//  fresh      a new player (no storage) gets the Garage chapter by itself: each card is shot, the tank and Deploy lit on
//             screen and the card clear of whatever it lights; Next walks to Deploy, whose press (the lit control) is the tutorial's: the record
//             says the Garage chapter is done, the training battle rolls out (mode training, the loaner on its
//             battlefield, not the battle the Garage had picked) and its first card shows;
//  enter      the same, with Enter on the Deploy card (desktop): Enter is the tutorial's press too;
//  returning  a player with a battle in the profile (cot.profile.v2) gets the offer on the Garage, once: Not now records
//             it, and after a reload no card shows and no tutorial module loads;
//  legacy     272's record (garage, battle, tips done) gets the offer; Start launches the training battle with its card;
//  replay     `/?tutorial=1` over a returning profile runs the Garage chapter (the flag leaves the address);
//  skip       a new player's Skip (Esc on the Garage, the card's button on a phone) records the journey skipped and
//             leaves no overlay.
// The report (and every shot) is written to --out (default ../tutorial-fit-274-evidence/journey-<view>-<locale>).
//
//   node tools/tutorial.browser.mjs --view=desktop --locale=en
//   node tools/tutorial.browser.mjs --view=phone --locale=cn --cases=fresh,returning
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
const VIEW = arg('view', 'desktop');
const LOCALE = arg('locale', 'en');
const VIEWS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
assert.ok(VIEWS[VIEW] && (LOCALE === 'en' || LOCALE === 'cn'), 'usage: --view=desktop|phone --locale=en|cn');
const touch = VIEW === 'phone';
const CASES = arg('cases', touch ? 'fresh,returning,legacy,replay,skip' : 'fresh,enter,returning,legacy,replay,skip').split(',');
const OUT = resolve(arg('out', resolve(process.cwd(), `../tutorial-fit-274-evidence/journey-${VIEW}-${LOCALE}`)));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { view: VIEW, locale: LOCALE, cases: {}, errors: [], startedAt: new Date().toISOString() };
const { chapterSteps } = await import('../src/ui/tutorial/tutorialSteps.ts');
const { TRAINING_RULES } = await import('../src/sim/trainingGround.ts');
const PROFILE = '{"matches":3}';
const LEGACY = '{"garage":"done","battle":"done","tips":"done"}';

let server, browser, hold;
async function openPage(context, path, seed = {}) {
  const page = await context.newPage();
  await page.setViewport(VIEWS[VIEW]);
  if (touch) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
  }
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  await page.evaluateOnNewDocument((entries) => {
    Document.prototype.hasFocus = () => true;
    try {
      if (sessionStorage.getItem('seeded')) return; // a reload keeps what the page wrote
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    } catch { /* none */ }
  }, seed);
  const port = server.httpServer.address().port;
  const prefix = LOCALE === 'cn' ? '/cn' : '';
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`http://127.0.0.1:${port}${prefix}${path}${sep}nosplash=1&telemetry=off&diagnostics=1&tier=${touch ? 'mobile' : 'desktop'}`,
    { waitUntil: 'domcontentloaded', timeout: 300_000 });
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
    if (Date.now() > until) throw new Error(`no step matched within ${timeout} ms (last ${JSON.stringify(now)})`);
    await sleep(250);
  }
}
const record = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cot.tutorial.v1') || 'null'));
const tutorialModulesLoaded = (page) => page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name)
  .filter((name) => /tutorial(Access|Runner|Overlay)|tutorial\.css/.test(name)).length);
async function press(page, selector) {
  const handle = await page.waitForSelector(selector, { visible: true, timeout: 20_000 });
  if (touch) await handle.tap(); else await handle.click();
}
async function shot(page, name) {
  await sleep(700);
  const file = `${name}.png`;
  await page.screenshot({ path: resolve(OUT, file) });
  return file;
}
/** The battle rolled out as the training battle, its first card up. */
async function trainingRolledOut(page) {
  await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
  const battle = await page.evaluate(() => ({ mode: window.__DEBUG.game.gameMode, map: window.__DEBUG.game.mapId, player: window.__DEBUG.game.player?.specId ?? null }));
  const card = await waitStep(page, (s) => s?.chapter === 'training', 120_000);
  return { battle, card };
}
/** Walk the Garage chapter to its Deploy card: each card shot, its lit control on screen and clear of the card. */
async function walkGarage(page, label) {
  const steps = [];
  let now = await waitStep(page, (s) => s?.step === 'garage.tank', 120_000);
  for (let i = 0; i < 6; i++) {
    await sleep(900); // the card's entry and its placement settle before its box is read
    const facts = await page.evaluate(() => {
      const root = document.querySelector('.cot-tut.is-open');
      const spot = root?.querySelector('.cot-tut-spot')?.getBoundingClientRect();
      const card = root?.querySelector('.cot-tut-card')?.getBoundingClientRect();
      const lit = !!root?.classList.contains('has-spot');
      return { lit, overlap: !!(lit && card && spot && spot.left < card.right && spot.right > card.left && spot.top < card.bottom && spot.bottom > card.top) };
    });
    const file = await shot(page, `${label}-${String(i).padStart(2, '0')}-${now.step}`);
    steps.push({ ...now, ...facts, file });
    // the tank and Deploy are always on screen; the rounds' tiles only where the dossier shows them (at 1440x900 they are
    // on its Firepower tab): a control off screen leaves the card alone, by design (tutorialOverlay.ts)
    if (now.step === 'garage.tank' || now.step === 'garage.deploy') assert.ok(facts.lit, `${label} ${now.step}: its control lit on screen`);
    assert.ok(!facts.overlap, `${label} ${now.step}: the card clear of its lit control`);
    if (now.step === 'garage.deploy') break;
    await press(page, '.cot-tut-next');
    now = await waitStep(page, (s) => s?.step !== now.step);
  }
  assert.equal(now.step, 'garage.deploy', `${label}: the Garage chapter reaches its Deploy card`);
  assert.deepEqual(steps.map((s) => s.step), chapterSteps('garage', touch ? 'touch' : 'keyboard').map((s) => s.id), `${label}: every Garage card, in order`);
  return steps;
}
/** Press the Deploy card's lit control (a click or a tap on its middle). */
async function pressLit(page) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('.cot-tut.is-open .cot-tut-spot')?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  assert.ok(box, 'the Deploy card lights its control');
  if (touch) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
}

try {
  hold = await openCaptureHold({ label: 'tutorial-browser', place: `tutorial-${VIEW}-${LOCALE}`, lockClass: 'render', timeoutMs: 90 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      `--window-size=${VIEWS[VIEW].width},${VIEWS[VIEW].height + 120}`] }), { label: 'tutorial-browser', tutorial: 'keep' });

  for (const name of CASES) {
    const context = await browser.createBrowserContext();
    const out = report.cases[name] = {};
    try {
      if (name === 'fresh' || name === 'enter') {
        const page = await openPage(context, '/');
        out.steps = await walkGarage(page, name);
        if (name === 'enter') await page.keyboard.press('Enter'); else await pressLit(page);
        await sleep(1500);
        out.record = await record(page);
        assert.equal(out.record?.garage, 'done', `${name}: the Deploy press finishes the Garage chapter`);
        assert.equal(out.record?.v, 2, `${name}: in the journey's record`);
        Object.assign(out, await trainingRolledOut(page));
        assert.equal(out.battle.mode, 'training', `${name}: Deploy launched the training battle, not the Garage's pick`);
        assert.equal(out.battle.map, TRAINING_RULES.mapId, `${name}: on the training ground's battlefield`);
        assert.equal(out.battle.player, TRAINING_RULES.loanerSpecId, `${name}: in the loaner`);
        out.file = await shot(page, `${name}-training-first-card`);
      } else if (name === 'returning') {
        const page = await openPage(context, '/', { 'cot.profile.v2': PROFILE });
        out.offer = await waitStep(page, (s) => s?.chapter === 'offer', 120_000);
        out.file = await shot(page, 'returning-offer');
        out.labels = await page.evaluate(() => ({
          next: document.querySelector('.cot-tut.is-open .cot-tut-next')?.textContent ?? '', skip: document.querySelector('.cot-tut.is-open .cot-tut-skip')?.textContent ?? '',
          progressShown: getComputedStyle(document.querySelector('.cot-tut.is-open .cot-tut-progress')).display !== 'none',
          media: !!document.querySelector('.cot-tut.is-open .cot-tut-media:not([hidden])'),
        }));
        assert.ok(!out.labels.progressShown, 'the offer is one card: no progress');
        await press(page, '.cot-tut-skip');
        await page.waitForFunction(() => !document.querySelector('.cot-tut.is-open'), { timeout: 10_000 });
        out.record = await record(page);
        assert.equal(out.record?.offer, 'later', 'Not now is recorded');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
        await sleep(8000);
        out.afterReload = { card: await stepNow(page), modules: await tutorialModulesLoaded(page) };
        assert.equal(out.afterReload.card, null, 'Not now: the offer never shows again');
        assert.equal(out.afterReload.modules, 0, 'and no tutorial module loads');
      } else if (name === 'legacy') {
        const page = await openPage(context, '/', { 'cot.tutorial.v1': LEGACY });
        out.offer = await waitStep(page, (s) => s?.chapter === 'offer', 120_000);
        await press(page, '.cot-tut-next');
        Object.assign(out, await trainingRolledOut(page));
        assert.equal(out.battle.mode, 'training', 'Start launched the training battle');
        out.record = await record(page);
        assert.equal(out.record?.offer, 'start', 'Start is recorded');
      } else if (name === 'replay') {
        const page = await openPage(context, '/?tutorial=1', { 'cot.profile.v2': PROFILE });
        out.card = await waitStep(page, (s) => s?.step === 'garage.tank', 120_000);
        out.address = await page.evaluate(() => location.search);
        assert.ok(!/tutorial=/.test(out.address), 'the replay flag leaves the address');
      } else if (name === 'skip') {
        const page = await openPage(context, '/');
        await waitStep(page, (s) => s?.step === 'garage.tank', 120_000);
        if (touch) await press(page, '.cot-tut-skip'); else await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.cot-tut.is-open'), { timeout: 10_000 });
        out.record = await record(page);
        assert.deepEqual(out.record, { v: 2, garage: 'skipped', training: 'skipped', debrief: 'skipped', tour: 'skipped' }, 'Skip records the journey skipped');
      }
      out.ok = true;
      console.log(`[tutorial] ${VIEW} ${LOCALE} ${name}: PASS ${JSON.stringify(out.record ?? out.battle ?? out.card ?? {})}`);
    } catch (error) {
      out.ok = false;
      out.failure = String(error?.message ?? error).slice(0, 600);
      console.error(`[tutorial] ${VIEW} ${LOCALE} ${name}: FAIL ${out.failure}`);
    }
    await context.close();
  }
  report.ok = Object.values(report.cases).every((c) => c.ok);
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
  console.log(`[tutorial] ${report.ok ? 'PASS' : 'FAIL'}: ${Object.keys(report.cases).length} cases → ${OUT}`);
  if (!report.ok) process.exitCode = 1;
}
