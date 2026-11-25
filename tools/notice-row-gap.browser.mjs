#!/usr/bin/env node
// The notice row's gap probe (notices-polish-277; Kevin 2026-11-24, on live 276: "for gun travel limit ... as it disappears it
// looks like that space disappears. fix that."). Copyright © 2026 Kevin B. Liu.
//
// On the battle HUD's fixture page (tools/fixtures/battle-hud-layout.html, a live battle scope, as the overlap probe), every
// notice kind (src/ui/noticeKinds.ts) is raised on its own lane (its raise's: battle-hud-overlap-judge.mjs kindLanes), and the
// gun-limit chip by the reticle shown and taken down; each row's glyph-to-label distance is traced every frame from the raise
// until it is gone, and judged at its first frame on screen (its entry), its fullest (its hold) and its last (its exit), and
// over every frame it showed. The judge
// (tools/notice-row-gap-judge.mjs gapProblems) fails a row whose gap moves. Runs on Puppeteer against an existing dev server:
//   node tools/notice-row-gap.browser.mjs --url=http://127.0.0.1:5189 [--case=1920x1080,390x844t,844x390t] [--out=outputs/notice-row-gap]
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GAP_TOLERANCE_PX, gapProblems, NOTICE_RAISERS, startTrace, stopTrace, tracePhases } from './notice-row-gap-judge.mjs';
import { kindLanes } from './battle-hud-overlap-judge.mjs';
import { NOTICE_KINDS } from '../src/ui/noticeKinds.ts';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const { default: puppeteer } = await import('puppeteer');
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'outputs/notice-row-gap'));
await mkdir(out, { recursive: true });
const cases = arg('case', '1920x1080,390x844t,844x390t').split(',').map((name) => {
  const [width, height] = name.replace('t', '').split('x').map(Number);
  return { name, width, height, touch: name.endsWith('t') };
});
const sources = Object.fromEntries(await Promise.all(NOTICE_RAISERS.map(async (file) => [file, await readFile(file, 'utf8')])));
const { lanes } = kindLanes(sources, Object.keys(NOTICE_KINDS));
/** How long a condition holds before it is taken down, and how long the trace runs on after a row's take-down (ms). */
const HOLD_MS = 700, AFTER_MS = 600;
const pause = (page, ms) => page.evaluate((wait) => new Promise((r) => setTimeout(r, wait)), ms);

const browser = await launchGuardedBrowser(puppeteer, { headless: true, args: ['--disable-gpu', '--js-flags=--max-old-space-size=2048'] });
const report = [];
let failures = 0;
try {
  for (const { name, width, height, touch } of cases) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
    await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?state=idle`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT, { timeout: 60000 });
    await pause(page, 600);
    const samples = [];
    const spreads = [];
    const trace = async (row, lane, act) => {
      await page.evaluate(startTrace, lane);
      await act();
      const phases = tracePhases(row, lane, await page.evaluate(stopTrace));
      samples.push(...phases.samples);
      if (phases.spread > GAP_TOLERANCE_PX) spreads.push(`${lane}:${row}: the gap moves ${phases.spread.toFixed(2)} px over its ${phases.frames} frames`);
    };
    for (const [kind, [lane]] of Object.entries(lanes)) {
      const raise = (on) => page.evaluate(async (kind, lane, on) => {
        const { bus, hud, frame } = window.__HUD_LAYOUT;
        if (lane === 'condition') {
          const { battleNotices, NOTICE_PRIORITY } = await import('/src/ui/battleNotices.ts');
          if (on) battleNotices.condition({ kind, id: 'cot-gap-probe', text: `Probe ${kind}`, severity: 'warning', icon: 'alert',
            durationMs: null, dismissible: false, priority: NOTICE_PRIORITY.lost });
          else battleNotices.dismiss('cot-gap-probe');
        } else if (on) {
          const { BATTLE_EVENT } = await import('/src/ui/battleNoticeEvents.ts');
          const { NOTICE_PRIORITY } = await import('/src/ui/battleNotices.ts');
          bus.emit(BATTLE_EVENT, { kind, text: `Probe ${kind}`, priority: NOTICE_PRIORITY.lost, severity: 'warning', icon: 'alert' });
        }
        hud.update(frame);
      }, kind, lane, on);
      await trace(kind, lane, async () => {
        await raise(true);
        // (an event leaves on its own after its hold: until the seat is down; a condition when it is dismissed)
        if (lane === 'event') {
          await page.waitForFunction(() => document.querySelector('.cot-alert.show'), { timeout: 3000 }).catch(() => {});
          await page.waitForFunction(() => !document.querySelector('.cot-alert.show'), { timeout: 6000 }).catch(() => {});
        } else { await pause(page, HOLD_MS); await raise(false); }
        await pause(page, AFTER_MS);
      });
    }
    // the gun-limit chip by the reticle (its seat on a mouse layout and the roomier phones; parked, it is the condition lane's)
    const chip = (on) => page.evaluate((on) => {
      const { hud, frame } = window.__HUD_LAYOUT;
      frame.aim.gunLimitSpec = on;
      for (let i = 0; i < 3; i++) hud.update(frame);
    }, on);
    await trace('gunLimit', 'chip', async () => {
      await chip(true); await pause(page, HOLD_MS); await chip(true);
      await chip(false); await pause(page, AFTER_MS);
    });
    const problems = [...gapProblems(samples), ...spreads];
    // (a layout that parks the chip shows none by the reticle: its row is the condition lane's aimLimit)
    const chipSeen = samples.some((s) => s.lane === 'chip' && s.gap !== null);
    const judged = chipSeen ? problems : problems.filter((p) => !p.startsWith('chip:'));
    failures += judged.length;
    report.push({ case: name, samples, problems: judged });
    console.log(`${judged.length ? 'FAIL' : 'ok  '} ${name.padEnd(10)} ${samples.length / 3} rows traced${chipSeen ? '' : ' (chip parked)'} ${judged.join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`notice-row-gap: ${failures ? `FAIL (${failures})` : 'PASS'}; ${resolve(out, 'report.json')}`);
process.exitCode = failures ? 1 : 0;
