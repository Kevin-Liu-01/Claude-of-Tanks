#!/usr/bin/env node
// tutorial-cards.browser.mjs — three tutorial cards before and after a change, as stills (Kevin's feedback, 2026-11-20).
// First-party tooling: Kevin B. Liu.
//
// Kevin: "for the tutorial, the boxes are quite intrusive, should pause the game when showing things, and pictures in it
// need to be full height and show. also they need to be more helpful and minimal". For each tree (--before=<a checkout>,
// and this one) and view (desktop 1440x900, a phone 390x844), three cards are opened at their step (diagnostics:
// __TUTORIAL_START(chapter, atStep)) and shot:
//  - tips.angle on the Garage: a card with a picture; its figure's box against the picture's own size, once loaded;
//  - training.driveA in the training battle: a card the player acts on;
//  - training.armour in the training battle: a card that explains; whether the battle's clock stands while it shows.
// Writes <out>/<tree>-<view>-<card>.png and report.json.
//
//   node tools/tutorial-cards.browser.mjs --before=../tutorial-cards-before
//
// Holds the shared capture lock (render class) for one batch, and launches its browser through launchGuardedBrowser.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BEFORE = arg('before', null);
const OUT = resolve(arg('out', resolve(process.cwd(), '../tutorial-journey-272-evidence/tutorial-cards')));
mkdirSync(OUT, { recursive: true });
const VIEWS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { cards: [], errors: [], startedAt: new Date().toISOString() };
const { chapterSteps } = await import('../src/ui/tutorial/tutorialSteps.ts');
const { TRAINING_RULES } = await import('../src/sim/trainingGround.ts');
/** A card's step index for these hands: the first step whose id starts with `id` (a hand's variant counts). */
const indexOf = (chapter, input, id) => chapterSteps(chapter, input).findIndex((step) => step.id === id || step.id.startsWith(`${id}Touch`) || step.id.startsWith(`${id}Pad`));

let browser, hold;
const servers = [];
try {
  hold = await openCaptureHold({ label: 'tutorial-cards', place: 'tutorial-cards', lockClass: 'render', timeoutMs: 90 * 60_000 });
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--window-size=1440,1020'] }), { label: 'tutorial-cards', tutorial: 'keep' });
  const trees = [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', process.cwd()]];
  for (const [tree, root] of trees) {
    const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
    await server.listen();
    servers.push(server);
    const port = server.httpServer.address().port;
    for (const [view, viewport] of Object.entries(VIEWS)) {
      const input = viewport.hasTouch ? 'touch' : 'keyboard';
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport(viewport);
      if (viewport.hasTouch) {
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
        try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
      }
      page.on('pageerror', (error) => report.errors.push(`${tree} ${view}: ${String(error?.message ?? error).slice(0, 200)}`));
      await page.evaluateOnNewDocument(() => {
        Document.prototype.hasFocus = () => true;
        try {
          localStorage.setItem('cot.telemetry', 'off');
          localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
          localStorage.setItem('cot.tutorial.v1', JSON.stringify({ garage: 'done', battle: 'done', tips: 'done' }));
        } catch { /* none */ }
      });
      await page.goto(`http://127.0.0.1:${port}/?nosplash=1&telemetry=off&diagnostics=1&tier=${viewport.hasTouch ? 'mobile' : 'desktop'}`,
        { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG && !!window.__TUTORIAL_START`, { timeout: 600_000, polling: 500 });

      const shoot = async (card, chapter, id, extra = async () => ({})) => {
        const at = indexOf(chapter, input, id);
        await page.evaluate((c, i) => window.__TUTORIAL_START(c, i), chapter, at);
        await page.waitForFunction((stepId) => document.querySelector('.cot-tut.is-open')?.dataset.step?.startsWith(stepId), { timeout: 60_000, polling: 250 }, id)
          .catch(() => report.errors.push(`${tree} ${view} ${card}: the card did not open`));
        // the picture loaded (an image decoded, a loop with a frame), or 6 s
        await page.waitForFunction(() => {
          const media = document.querySelector('.cot-tut.is-open .cot-tut-media:not([hidden]) :is(img,video)');
          return !media || (media.tagName === 'IMG' ? media.complete && media.naturalWidth > 0 : media.readyState >= 2);
        }, { timeout: 6000, polling: 200 }).catch(() => {});
        await sleep(900);
        const facts = await page.evaluate(() => {
          const box = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
          const root = document.querySelector('.cot-tut.is-open');
          const media = root?.querySelector('.cot-tut-media:not([hidden])');
          const shown = media?.querySelector('img,video');
          return {
            step: root?.dataset.step ?? null, mode: root?.dataset.mode ?? null,
            card: box(root?.querySelector('.cot-tut-card')), media: box(media),
            picture: shown ? { tag: shown.tagName, natural: shown.tagName === 'IMG' ? [shown.naturalWidth, shown.naturalHeight] : [shown.videoWidth, shown.videoHeight],
              loaded: shown.tagName === 'IMG' ? shown.complete && shown.naturalWidth > 0 : shown.readyState >= 2 } : null,
            title: root?.querySelector('.cot-tut-title')?.textContent ?? null, body: root?.querySelector('.cot-tut-body')?.textContent ?? null,
          };
        });
        const file = `${tree}-${view}-${card}.png`;
        await page.screenshot({ path: resolve(OUT, file) });
        const entry = { tree, view, card, file, ...facts, ...(await extra()) };
        report.cards.push(entry);
        console.log(`[cards] ${tree} ${view} ${card}: ${facts.step} mode ${facts.mode} card ${JSON.stringify(facts.card)} media ${JSON.stringify(facts.media)}${entry.clockHeld != null ? ` clock held ${entry.clockHeld}` : ''}`);
      };

      // the Garage's picture card (the tips chapter)
      await shoot('picture', 'tips', 'tips.angle');
      // the training battle: an act card, then an explaining one (does the battle hold?)
      await page.evaluate((specId, mapId) => window.__DEBUG.beginSoloBattle({ specId, mapId, gameMode: 'training' }), TRAINING_RULES.loanerSpecId, TRAINING_RULES.mapId);
      await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
      await shoot('act', 'training', 'training.driveA');
      await shoot('explain', 'training', 'training.armour', async () => {
        const t0 = await page.evaluate(() => window.__DEBUG.game.timeS);
        await sleep(1200);
        const t1 = await page.evaluate(() => window.__DEBUG.game.timeS);
        return { clockHeld: Math.abs(t1 - t0) < 0.05, clock: [Math.round(t0 * 100) / 100, Math.round(t1 * 100) / 100] };
      });
      await context.close();
    }
  }
  report.ok = report.errors.length === 0;
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  for (const server of servers) await server.close().catch(() => {});
  await hold?.release();
  console.log(`[cards] ${report.ok ? 'DONE' : 'FAIL'} → ${OUT}`);
}
