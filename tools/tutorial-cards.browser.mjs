#!/usr/bin/env node
// tutorial-cards.browser.mjs — every tutorial card fits its screen: no scroll, nothing clipped (274). First-party tooling:
// Kevin B. Liu.
//
// Kevin, 2026-11-21: "the tutorial boxes have overflows and you need to scroll? no no none of that". For one locale per run
// and each view (desktop 1440x900, 1280x720 and 1024x768; a phone 390x844 and the same phone turned, 844x390), every card
// of every chapter is opened at its step (diagnostics: __TUTORIAL_START(chapter, atStep)) on the screen it belongs to:
// the Garage chapter, the offer, the debrief and the tour's stops on the Garage, and every training step in the training
// battle. Each card is read once its fit has settled (tutorialOverlay.ts fit) and fails on:
//  - a scroll: its scrollHeight over its clientHeight (or any child's scrollWidth over its clientWidth);
//  - a clipped child: any shown element inside the card whose box leaves the card's, the card's parts (head, bar, words,
//    buttons) lying on each other, or the words running past their own block;
//  - a card off the screen.
// It records each card's fit step, natural height and box, and its body's lines (an act card's copy runs at most two;
// past that it is listed, not failed). The desktop 1440x900 and phone 390x844 views shoot every card; the longest card of
// each view is shot too (<view>-longest.png).
//
// --beat (on the desktop view): a step completing, recorded (Kevin: "after successful completion step we have to show that
// with an animation"): the sight card met by its deed (Shift, the wheel in), its success beat and the next card's words,
// as beat-zoom.webm, beat-zoom.gif and a frame strip beat-zoom-strip.png (ffmpeg, where present).
//
//   node tools/tutorial-cards.browser.mjs --locale=en [--views=desktop,phone] [--beat] [--out=<dir>]
//   node tools/tutorial-cards.browser.mjs --locale=cn
//
// Holds the shared capture lock (render class) for one batch, and launches its browser through launchGuardedBrowser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const LOCALE = arg('locale', 'en');
/** A locale's address prefix (en at the root; the others under their own: /cn, and 275's). */
const PREFIX = LOCALE === 'en' ? '' : `/${LOCALE}`;
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ALL_VIEWS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, shoot: true },
  laptop: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, shoot: true },
  phoneLandscape: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true },
};
const VIEWS = Object.fromEntries(arg('views', Object.keys(ALL_VIEWS).join(',')).split(',').map((name) => {
  assert.ok(ALL_VIEWS[name], `unknown view ${name}`);
  return [name, ALL_VIEWS[name]];
}));
const OUT = resolve(arg('out', resolve(process.cwd(), `../tutorial-fit-274-evidence/cards-${LOCALE}`)));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { locale: LOCALE, views: Object.keys(VIEWS), cards: [], misses: [], longCopy: [], errors: [], startedAt: new Date().toISOString() };
const { chapterSteps } = await import('../src/ui/tutorial/tutorialSteps.ts');
const { TRAINING_RULES } = await import('../src/sim/trainingGround.ts');

/** In the page: the open card's fit facts (see the module comment). */
function readCard() {
  const root = document.querySelector('.cot-tut.is-open');
  const card = root?.querySelector('.cot-tut-card');
  if (!card) return null;
  const c = card.getBoundingClientRect();
  const clipped = [];
  for (const node of card.querySelectorAll('*')) {
    if (node.closest('.cot-tut-beat')) continue; // the beat lies over the card's words by design (inset 0)
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const r = node.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.left < c.left - 1 || r.top < c.top - 1 || r.right > c.right + 1 || r.bottom > c.bottom + 1) {
      clipped.push(`${node.tagName.toLowerCase()}.${[...node.classList].join('.')} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    if (node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0 && style.overflowX !== 'visible') clipped.push(`${node.tagName.toLowerCase()} scrolls sideways`);
  }
  // the card's parts never lie on each other (head, bar, words, buttons), and the words stay inside their block
  const parts = [...card.children].filter((node) => !node.classList.contains('cot-tut-beat') && getComputedStyle(node).display !== 'none')
    .map((node) => ({ name: node.className.split(' ')[0], r: node.getBoundingClientRect() })).filter((part) => part.r.height >= 1);
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].r.top < parts[i - 1].r.bottom - 1) clipped.push(`${parts[i].name} over ${parts[i - 1].name} (${Math.round(parts[i - 1].r.bottom - parts[i].r.top)} px)`);
  }
  const content = card.querySelector('.cot-tut-content');
  if (content) {
    const k = content.getBoundingClientRect();
    for (const node of content.querySelectorAll('*')) {
      const r = node.getBoundingClientRect();
      if (r.height >= 1 && getComputedStyle(node).display !== 'none' && r.bottom > k.bottom + 1) {
        clipped.push(`${node.tagName.toLowerCase()} runs ${Math.round(r.bottom - k.bottom)} px past the words' block`);
        break;
      }
    }
  }
  const body = card.querySelector('.cot-tut-body');
  const lineHeight = body ? parseFloat(getComputedStyle(body).lineHeight) : 0;
  const bodyText = body ? [...body.childNodes].filter((n) => !(n instanceof HTMLElement && n.tagName === 'UL')) : [];
  const range = document.createRange();
  let textH = 0;
  if (body && bodyText.length) { range.setStartBefore(bodyText[0]); range.setEndAfter(bodyText.at(-1)); textH = range.getBoundingClientRect().height; }
  return {
    step: root.dataset.step ?? null, mode: root.dataset.mode ?? null, fit: card.dataset.fit ?? null, layout: card.dataset.layout ?? null,
    naturalH: Number(card.dataset.naturalH) || null, box: [Math.round(c.left), Math.round(c.top), Math.round(c.width), Math.round(c.height)],
    scrollH: card.scrollHeight, clientH: card.clientHeight, maxH: getComputedStyle(card).maxHeight,
    offScreen: c.left < -1 || c.top < -1 || c.right > window.innerWidth + 1 || c.bottom > window.innerHeight + 1,
    clipped, bodyLines: lineHeight > 0 ? Math.round(textH / lineHeight) : null,
    media: card.querySelector('.cot-tut-media:not([hidden])') ? getComputedStyle(card.querySelector('.cot-tut-media')).display !== 'none' : false,
  };
}

let browser, hold, server;
try {
  hold = await openCaptureHold({ label: 'tutorial-cards', place: `tutorial-cards-${LOCALE}`, lockClass: 'render', timeoutMs: 120 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--window-size=1440,1020'] }), { label: 'tutorial-cards', tutorial: 'keep' });
  for (const [view, viewport] of Object.entries(VIEWS)) {
    const input = viewport.hasTouch ? 'touch' : 'keyboard';
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(viewport);
    if (viewport.hasTouch) {
      await page.setUserAgent(PHONE_UA);
      try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
    }
    page.on('pageerror', (error) => report.errors.push(`${view}: ${String(error?.message ?? error).slice(0, 200)}`));
    await page.evaluateOnNewDocument(() => {
      Document.prototype.hasFocus = () => true;
      try {
        localStorage.setItem('cot.telemetry', 'off');
        localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
        // the journey finished, its offer answered (tutorialRecord.ts TUTORIAL_FINISHED_RECORD): only the hook opens cards
        localStorage.setItem('cot.tutorial.v1', '{"v":2,"garage":"skipped","training":"skipped","debrief":"skipped","tour":"skipped","offer":"later"}');
      } catch { /* none */ }
    });
    await page.goto(`http://127.0.0.1:${port}${PREFIX}/?nosplash=1&telemetry=off&diagnostics=1&tier=${viewport.hasTouch ? 'mobile' : 'desktop'}`,
      { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG && !!window.__TUTORIAL_START`, { timeout: 600_000, polling: 500 });
    let longest = null;

    const open = async (chapter, index, stepId) => {
      await page.evaluate((c, i) => window.__TUTORIAL_START(c, i), chapter, index);
      const ok = await page.waitForFunction((id) => document.querySelector('.cot-tut.is-open')?.dataset.step === id, { timeout: 30_000, polling: 200 }, stepId)
        .then(() => true, () => false);
      if (!ok) { report.errors.push(`${view} ${stepId}: the card did not open`); return; }
      // the picture in (or 4 s), the entry animation done, the fit settled over a couple of the overlay's re-checks
      await page.waitForFunction(() => {
        const media = document.querySelector('.cot-tut.is-open .cot-tut-media:not([hidden]) :is(img,video)');
        return !media || (media.tagName === 'IMG' ? media.complete && media.naturalWidth > 0 : media.readyState >= 2);
      }, { timeout: 4000, polling: 200 }).catch(() => {});
      await sleep(1000);
      const facts = await page.evaluate(readCard);
      if (!facts) { report.errors.push(`${view} ${stepId}: no card to read`); return; }
      const entry = { view, chapter, ...facts };
      const problems = [
        ...(facts.scrollH > facts.clientH + 1 ? [`scrolls (${facts.scrollH} over ${facts.clientH})`] : []),
        ...facts.clipped.map((what) => `clips ${what}`),
        ...(facts.offScreen ? ['off the screen'] : []),
      ];
      if (problems.length) report.misses.push(`${view} ${stepId}: ${problems.join('; ')}`);
      if (facts.mode === 'act' && facts.bodyLines > 2) report.longCopy.push(`${view} ${stepId}: ${facts.bodyLines} lines`);
      if (viewport.shoot) { entry.file = `${view}-${stepId}.png`; await page.screenshot({ path: resolve(OUT, entry.file) }); }
      if (!longest || (facts.naturalH ?? 0) > (longest.naturalH ?? 0)) longest = { chapter, index, stepId, naturalH: facts.naturalH };
      report.cards.push(entry);
      console.log(`[cards] ${LOCALE} ${view} ${stepId}: fit ${facts.fit}${facts.layout ? ` ${facts.layout}` : ''} natural ${facts.naturalH} box ${JSON.stringify(facts.box)} max ${facts.maxH}${problems.length ? ` MISS ${problems.join('; ')}` : ''}`);
    };

    // the Garage's cards: the Garage chapter, the offer, the debrief, the tour's stops
    for (const chapter of ['garage', 'offer', 'debrief', 'tour']) {
      const steps = chapterSteps(chapter, input);
      for (let i = 0; i < steps.length; i++) await open(chapter, i, steps[i].id);
    }
    // the training battle: every step
    await page.evaluate((specId, mapId) => window.__DEBUG.beginSoloBattle({ specId, mapId, gameMode: 'training' }), TRAINING_RULES.loanerSpecId, TRAINING_RULES.mapId);
    await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
    const training = chapterSteps('training', input);
    // a step completing, recorded first, as the battle opens: the sight card (keyboard) met by its deed, Shift and the wheel
    // in, before anything has seen the player (a centre notice, DETECTED, makes the card give way: battleHudLayout.ts)
    if (process.argv.includes('--beat') && view === 'desktop') {
      const at = training.findIndex((step) => step.id === 'training.zoom');
      await page.evaluate((i) => window.__TUTORIAL_START('training', i), at);
      await page.waitForFunction(() => document.querySelector('.cot-tut.is-open')?.dataset.step === 'training.zoom', { timeout: 30_000 });
      await sleep(1200);
      const clip = resolve(OUT, 'beat-zoom.webm');
      const recorder = await page.screencast({ path: clip, scale: 0.5 });
      await sleep(400);
      if (!(await page.evaluate(() => window.__DEBUG.rig?.mode === 'SNIPER'))) await page.keyboard.press('ShiftLeft');
      await sleep(300);
      await page.mouse.move(720, 450);
      for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -240 }); await sleep(60); }
      await sleep(1800);
      await recorder.stop();
      report.beat = { clip: 'beat-zoom.webm', next: await page.evaluate(() => document.querySelector('.cot-tut.is-open')?.dataset.step ?? null) };
      try {
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip, '-vf', 'fps=10,crop=iw:ih*0.45:0:0,scale=480:-1,tile=4x4', '-frames:v', '1',
          resolve(OUT, 'beat-zoom-strip.png')]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip, '-vf', 'fps=15,crop=iw:ih*0.45:0:0,scale=640:-1:flags=lanczos', resolve(OUT, 'beat-zoom.gif')]);
        report.beat.strip = 'beat-zoom-strip.png';
        report.beat.gif = 'beat-zoom.gif';
      } catch (error) { report.beat.stripError = String(error?.message ?? error).slice(0, 200); }
      console.log(`[cards] beat: ${JSON.stringify(report.beat)}`);
    }
    for (let i = 0; i < training.length; i++) await open('training', i, training[i].id);
    // the longest card of this view, shot
    // (a Garage card is gone with the Garage: its still is the one shot above, on the views that shoot)
    if (longest) {
      if (longest.chapter === 'training') {
        await page.evaluate((c, i) => window.__TUTORIAL_START(c, i), longest.chapter, longest.index);
        await sleep(1200);
        longest.file = `${view}-longest.png`;
        await page.screenshot({ path: resolve(OUT, longest.file) });
      } else if (viewport.shoot) longest.file = `${view}-${longest.stepId}.png`;
      report[`longest-${view}`] = longest;
    }
    await context.close();
  }
  report.ok = report.misses.length === 0 && report.errors.length === 0;
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
  console.log(`[cards] ${report.ok ? 'PASS' : 'FAIL'}: ${report.cards.length} cards, ${report.misses.length} misses, ${report.longCopy.length} act cards over two lines → ${OUT}`);
  if (!report.ok) process.exitCode = 1;
}
