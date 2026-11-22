#!/usr/bin/env node
// hud-guidance.browser.mjs — the battle's guidance on the live game, before and after the one plan (274).
// First-party tooling: Kevin B. Liu.
//
// Kevin, 2026-11-18: "for the tutorial, the armor shader hexagon and the tutorial squares at top overlap". One capture
// hold, one browser: for each tree (--before=<a checkout of main>, and this checkout) and each view (desktop 1440x900, a
// phone 390x844), a profile with the armour colours' one-time tip still due (the owner's case), the tutorial's training
// battle (274: its chapter is the tutorial's only battle chapter) with its first card up, and one more battle toast raised through the battle's notice region (the pointer
// lock's kind). Each frame is shot, and the card's, the toasts', the detection's and the alert's boxes are measured with
// every shell, kit and other control. This checkout's frames must show no surface on another or on a control.
//
//   node tools/hud-guidance.browser.mjs --before=../hud-guidance-before
//
// Holds the shared capture lock (render class) for one batch, and launches its browser through launchGuardedBrowser.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';
import { TRAINING_RULES } from '../src/sim/trainingGround.ts';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BEFORE = arg('before', null);
const ONLY_AFTER = process.argv.includes('--after-only');
const OUT = resolve(arg('out', resolve(process.cwd(), '../hud-guidance-274-evidence')));
mkdirSync(OUT, { recursive: true });
const VIEWS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { frames: [], errors: [], startedAt: new Date().toISOString() };
const CONTROLS = '.cot-shell,.cot-con,.cot-vehicle-controls>button,.cot-touch.on .round,.cot-touch.on .joy,.cot-touch.on .quick,.cot-scope-vision';

let browser, hold;
const servers = [];
try {
  hold = await openCaptureHold({ label: 'hud-guidance', place: 'hud-guidance', lockClass: 'render', timeoutMs: 90 * 60_000 });
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--window-size=1440,1020'] }), { label: 'hud-guidance' });
  const trees = [...(BEFORE && !ONLY_AFTER ? [['before', resolve(BEFORE)]] : []), ['after', process.cwd()]];
  for (const [tree, root] of trees) {
    const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
    await server.listen();
    servers.push(server);
    const port = server.httpServer.address().port;
    for (const [view, viewport] of Object.entries(VIEWS)) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport(viewport);
      if (viewport.hasTouch) {
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
        try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
      }
      page.on('pageerror', (error) => report.errors.push(`${tree} ${view}: ${String(error?.message ?? error).slice(0, 200)}`));
      // the owner's case: the armour colours' tip due (no flip marker); the training battle's chapter runs on its rollout
      await page.evaluateOnNewDocument(() => {
        Document.prototype.hasFocus = () => true;
        try {
          localStorage.setItem('cot.telemetry', 'off');
          localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
          localStorage.setItem('cot.tutorial.v1', '{"v":2,"garage":"skipped","training":"skipped","debrief":"skipped","tour":"skipped","offer":"later"}');
          localStorage.removeItem('cot.armourOverlayDefault.v1');
        } catch { /* none */ }
      });
      await page.goto(`http://127.0.0.1:${port}/?nosplash=1&telemetry=off&tier=${viewport.hasTouch ? 'mobile' : 'desktop'}`,
        { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
      await page.evaluate((specId, mapId) => window.__DEBUG.beginSoloBattle({ specId, mapId, gameMode: 'training' }),
        TRAINING_RULES.loanerSpecId, TRAINING_RULES.mapId);
      await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
      await page.waitForFunction(() => !!document.querySelector('.cot-tut.is-open[data-chapter=training]'), { timeout: 60_000, polling: 250 }).catch(() => {});
      // one more battle toast, the pointer lock's kind, through the region every battle notice uses (the same module)
      await page.evaluate(async () => {
        const { battleNotices } = await import('/src/ui/battleNotices.ts');
        battleNotices.show({ id: 'hud-guidance-probe', severity: 'info', text: 'Click the battle to aim', durationMs: null, dismissible: false });
      });
      await sleep(2500);
      const facts = await page.evaluate((controls) => {
        const box = (node) => { const r = node.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(node).visibility !== 'hidden'
          ? { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } : null; };
        const one = (selector) => { const node = document.querySelector(selector); return node ? box(node) : null; };
        const all = (selector) => [...document.querySelectorAll(selector)].map(box).filter(Boolean);
        return {
          card: one('.cot-tut.is-open .cot-tut-card'),
          toasts: all('.cot-battle-notices > *'),
          detection: one('.cot-sixth.on'), alert: one('.cot-alert.show'),
          controls: all(controls), guidance: document.body.dataset.hudGuidance ?? '', step: document.querySelector('.cot-tut.is-open')?.dataset.step ?? null,
          plan: document.body.dataset.hudGuidancePlan ?? null,
          vars: Object.fromEntries(['--hud-guidance-card-top', '--hud-guidance-card-left', '--hud-guidance-card-max-h', '--hud-battle-notices-top',
            '--hud-battle-notices-left'].map((name) => [name, document.body.style.getPropertyValue(name)])),
          region: one('.cot-battle-notices'),
        };
      }, CONTROLS);
      const meets = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
      const surfaces = [['card', facts.card], ...facts.toasts.map((t, i) => [`toast${i}`, t]), ['detection', facts.detection], ['alert', facts.alert]]
        .filter(([, b]) => b);
      const overlaps = [];
      for (let i = 0; i < surfaces.length; i++) for (let j = i + 1; j < surfaces.length; j++) {
        if (meets(surfaces[i][1], surfaces[j][1])) overlaps.push(`${surfaces[i][0]}×${surfaces[j][0]}`);
      }
      for (const [name, b] of surfaces) if (facts.controls.some((c) => meets(b, c))) overlaps.push(`${name}×control`);
      const file = `${tree}-${view}.png`;
      await page.screenshot({ path: resolve(OUT, file) });
      report.frames.push({ tree, view, file, step: facts.step, guidance: facts.guidance, plan: facts.plan, vars: facts.vars,
        rendered: Object.fromEntries(surfaces.map(([n, b]) => [n, [b.x0, b.y0, b.x1, b.y1].map(Math.round)])),
        region: facts.region && [facts.region.x0, facts.region.y0, facts.region.x1, facts.region.y1].map(Math.round), surfaces: surfaces.map(([n]) => n), overlaps });
      console.log(`[guidance] ${tree} ${view}: step ${facts.step} [${facts.guidance}] surfaces ${surfaces.map(([n]) => n).join(',')} overlaps ${overlaps.join(',') || 'none'}`);
      await context.close();
    }
  }
  for (const frame of report.frames.filter((f) => f.tree === 'after')) {
    assert.ok(frame.surfaces.includes('card'), `${frame.view}: the tutorial's training card shows`);
    assert.deepEqual(frame.overlaps, [], `${frame.view}: no guidance surface on another or on a control`);
  }
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
  for (const server of servers) await server.close().catch(() => {});
  await hold?.release();
  console.log(`[guidance] ${report.ok ? 'PASS' : 'FAIL'} → ${OUT}`);
}
