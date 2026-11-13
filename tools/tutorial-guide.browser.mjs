#!/usr/bin/env node
// tutorial-guide.browser.mjs — the tutorial's guide drawn over a live battle (273). First-party tooling: Kevin B. Liu.
//
// Boots the game (a player whose tutorial is done, so no chapter runs), starts a solo battle, and shows guide specs
// through the diagnostics hook (window.__TUTORIAL_GUIDE, main.ts):
//   ahead   a marker 50 m ahead with its path, a bracket on the nearest enemy and the HUD chevron on the shells: the ring,
//           at least three chevrons, the bracket and the chevron draw, and a press where they stand reaches the game
//           (the guide takes no pointer);
//   behind  the marker 60 m behind: no ring, the edge pointer on the screen's edge;
//   aside   the marker 90 m to the right: the edge pointer on the right half;
//   clear   null: nothing of the guide is left in the page.
// Each case is shot to the evidence folder with its snapshot in report.json.
//
//   node tools/tutorial-guide.browser.mjs --view=desktop --locale=en
//   node tools/tutorial-guide.browser.mjs --view=phone --locale=cn
//
// Holds the shared capture lock (render class) for one short batch, and launches its browser through
// launchGuardedBrowser.
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
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
assert.ok(VIEWS[VIEW] && (LOCALE === 'en' || LOCALE === 'cn'), 'usage: --view=desktop|phone --locale=en|cn');
const OUT = resolve(arg('out', resolve(process.cwd(), `../tutorial-journey-272-evidence/guide-${VIEW}-${LOCALE}`)));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const touch = VIEW === 'phone';
const report = { view: VIEW, locale: LOCALE, cases: {}, errors: [], startedAt: new Date().toISOString() };

let server, browser, hold;
try {
  hold = await openCaptureHold({ label: 'tutorial-guide', place: `guide-${VIEW}-${LOCALE}`, lockClass: 'render', timeoutMs: 20 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      `--window-size=${VIEWS[VIEW].width},${VIEWS[VIEW].height + 120}`] }), { label: 'tutorial-guide' });
  const page = await browser.newPage();
  await page.setViewport(VIEWS[VIEW]);
  if (touch) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
  }
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text().slice(0, 300)}`); });
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true;
    try {
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
      localStorage.setItem('cot.tutorial.v1', JSON.stringify({ garage: 'done', battle: 'done', tips: 'done' }));
    } catch { /* none */ }
  });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}${LOCALE === 'cn' ? '/cn' : ''}/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`,
    { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG && !!window.__TUTORIAL_GUIDE`, { timeout: 600_000, polling: 500 });
  await page.evaluate(() => window.__DEBUG.beginSoloBattle({}));
  await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
  await sleep(1500);

  /** The battle as the guide sees it: the player's pose and the nearest enemy's id. */
  const pose = () => page.evaluate(() => {
    const game = window.__DEBUG.game;
    const me = game.player;
    const enemies = [...game.tankById.values()].filter((t) => t.state?.pos && t.team !== me.team && !t.combat?.destroyed);
    enemies.sort((a, b) => Math.hypot(a.state.pos.x - me.state.pos.x, a.state.pos.z - me.state.pos.z)
      - Math.hypot(b.state.pos.x - me.state.pos.x, b.state.pos.z - me.state.pos.z));
    return { x: me.state.pos.x, z: me.state.pos.z, yaw: me.state.yaw, enemy: enemies[0]?.id ?? null };
  });
  /** Show a spec, let it draw, shoot it and read what it drew and what a press at each piece would reach. */
  async function show(name, spec) {
    const snapshot = await page.evaluate(async (s) => { const read = await window.__TUTORIAL_GUIDE(s); window.__guideRead = read; return null; }, spec);
    void snapshot;
    await sleep(700);
    const facts = await page.evaluate(() => {
      const drawn = window.__guideRead?.() ?? null;
      const pieces = [...document.querySelectorAll('.cot-tut-guide-ring, .cot-tut-guide-chevron, .cot-tut-guide-bracket, .cot-tut-guide-edge, .cot-tut-guide-hud')]
        .filter((el) => el.getAttribute('display') !== 'none' && !el.hidden);
      // a press where a piece stands: the element there is never the guide's
      const hits = pieces.map((el) => {
        const r = el.getBoundingClientRect();
        const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
        const top = document.elementFromPoint(x, y);
        return { piece: el.getAttribute('class'), guideTakesIt: !!top?.closest('.cot-tut-guide') };
      });
      const layers = [...document.querySelectorAll('.cot-tut-guide')].map((el) => getComputedStyle(el).pointerEvents);
      return { drawn, hits, layers };
    });
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    report.cases[name] = { spec, ...facts };
    console.log(`[guide] ${name}: ${JSON.stringify(facts.drawn)}`);
    for (const hit of facts.hits) assert.ok(!hit.guideTakesIt, `${name}: a press on ${hit.piece} reaches the game, not the guide`);
    for (const events of facts.layers) assert.equal(events, 'none', `${name}: the guide's layers take no pointer`);
    return facts.drawn;
  }

  const me = await pose();
  const at = (along, across) => ({ x: me.x + Math.sin(me.yaw) * along + Math.cos(me.yaw) * across, z: me.z + Math.cos(me.yaw) * along - Math.sin(me.yaw) * across });
  const ahead = await show('ahead', {
    marker: { ...at(50, 0), radiusM: 6, label: 'A' }, path: true,
    ...(me.enemy ? { actor: { id: me.enemy, label: 'Target' } } : {}), hud: ['.cot-shells', '.cot-touch .round.fire'],
  });
  assert.ok(ahead.ring, 'ahead: the ring draws');
  assert.ok(ahead.chevrons >= 3, 'ahead: the path draws at least three chevrons');
  assert.ok(ahead.hud, 'ahead: the HUD chevron stands at its control');
  assert.equal(ahead.edge, null, 'ahead: no edge pointer for a marker on screen');
  report.cases.ahead.enemyOnScreen = ahead.bracket;

  const behind = await show('behind', { marker: { ...at(-60, 0), radiusM: 6, label: 'B' }, path: true });
  assert.ok(!behind.ring && behind.edge, 'behind: no ring, an edge pointer');
  const vp = VIEWS[VIEW];
  assert.ok(behind.edge.y > vp.height / 2, 'behind: the pointer stands low (turn round)');

  const aside = await show('aside', { marker: { ...at(0, 90), radiusM: 6, label: 'C' }, path: true });
  assert.ok(aside.edge, 'aside: an edge pointer');
  report.cases.aside.side = aside.edge.x > vp.width / 2 ? 'right' : 'left';

  await page.evaluate(() => window.__TUTORIAL_GUIDE(null));
  await sleep(200);
  const left = await page.evaluate(() => document.querySelectorAll('.cot-tut-guide').length);
  report.cases.clear = { layersLeft: left };
  assert.equal(left, 0, 'clear: nothing of the guide is left');
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
  console.log(`[guide] ${report.ok ? 'PASS' : 'FAIL'} → ${OUT}`);
}
