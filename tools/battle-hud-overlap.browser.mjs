#!/usr/bin/env node
// The battle HUD's overlap probe (owner 2026-10-25: "fix overlapping uis like in ac 130. so many things to be careful
// of and be mindful of"). Copyright © 2026 Kevin B. Liu.
//
// Every HUD state the layout fixture stages, at the windows the HUD is reviewed at: the visible instruments' boxes, and
// any two that intersect fail unless the pair is a deliberate layering (ALLOWED, each with its reason). Nested
// instruments fold into their outermost one. The sight's own layers (the reticle canvas, the gimbal sight, a drone's
// signal-loss veil) and the world-space markers over tanks are the scene's, not instruments, and are not measured as
// boxes; in every state the markers in view pass tools/marker-census.mjs instead (no flag, whole, the side in shape and
// colour), and ?state=markers stages them (both sides in view, one enemy under the gun).
// One datum, one place (owner 2026-10-25: "prevent things like that silly double ping indicator from happening again";
// UI-LOCKDOWN part C): in every state, a networked battle's host and client among them, two visible readouts of one
// [data-datum] fail, and so does a datum with no row in src/ui/surfaceRegistry.ts or a visible link or frame-rate figure
// outside any [data-datum] (tools/datum-census.mjs, shared with the gauntlet captures).
// Notices over every view (notices-276; Kevin 2026-11-23: "fix ui overlaps like gunship overhead with X binoculars in air
// support"): the states in NOTICE_STATES run again as <state>+notices, with both lanes holding a notice (the event lane's
// .cot-alert and the condition lane's "Gunship overhead"), each measured against every control there, the controls a view
// brings among them (src/ui/hudViewControls.ts: Air Support's binoculars, rack and Support; the flight's console). A notice
// on a control fails; a lane with nothing shown fails unless the guidance plan holds it back (toasts-wait). --plant proves
// both halves in each notice state: a control planted over the notices with a view control's class (`seen`) must be kept
// clear by the planners, which read its live box, and one with a class no planner reads (`unseen`) must fail the judge.
// One place per lane (notices-polish-277; Kevin 2026-11-24: "it should be in one place, that bottom spot is saved for kills"):
// after a window's states, each notice lane's seat over its +notices states must stand at one height and in one band, the
// condition lane over the middle, the event lane in one seat too, nothing but the kill card in the kill card's seat (judge
// laneProblems); every kind's lane
// is its raise's (judge kindLanes, held in Node by the judge's receipt: no kind in two lanes).
// The judge is tools/battle-hud-overlap-judge.mjs (Node receipt: tools/battle-hud-overlap-judge.selftest.mjs).
// The full rendered regression (tools/battle-hud-layout.browser.mjs, Playwright) covers more windows and locales; this
// probe is the cheap pass over every state, and runs on Puppeteer against an existing dev server:
//   node tools/battle-hud-overlap.browser.mjs --url=http://127.0.0.1:5189 [--case=1440x900,390x844] [--state=gunship]
//     [--notices-only] [--plant] [--out=outputs/battle-hud-overlap]
// A --case outside CASES runs as its own window: WxH with a mouse, WxHt on touch (--case=1210x702t,744x1001t, 820x1180t, the
// iPads). --notices-only runs only the <state>+notices states; --shots writes a PNG of each.
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { datumProblems } from './datum-census.mjs';
import { markerProblems } from './marker-census.mjs';
import { INSTRUMENTS, PLANTS, PLANT_SELECTOR, laneProblems, measureInstruments, noticeCoverage, overlapProblems } from './battle-hud-overlap-judge.mjs';

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
export const STATES = ['idle', 'countdown', 'hints', 'notifications', 'notices', 'reports', 'combined', 'feed-burst', 'large-map', 'special',
  'sniper', 'ammo-reload-sniper', 'ammo-reload-sniper-report', 'spectator', 'watch-ride', 'watch-drone', 'gunship', 'drone',
  'mode-zone_control', 'mode-capture_the_flag', 'mode-endless_horde', 'mp-host', 'mp-client', 'markers', 'binoculars',
  // (combined-arms-276) Combined Arms: the drone docked beside the Support slot, the drone flying, the binoculars up
  'mode-combined_arms', 'combined-drone', 'combined-binoculars'];
/** The views both notice lanes are measured over (each as <state>+notices): the plain battle, the scope, the drone's feed,
 *  the gunship's sight and Air Support's binoculars; and a mode whose sectors' banner and badges stand over the centre (the
 *  condition lane pushed onto the map and the lanes, combined-arms-276's probe), with Combined Arms' drone docked and flying. */
export const NOTICE_STATES = ['idle', 'sniper', 'drone', 'gunship', 'binoculars', 'mode-zone_control', 'mode-combined_arms', 'combined-drone'];
/** The notice states that look through another view than the tank's: the tank's own notices are held there (notices-276b). */
const VIEW_STATES = ['drone', 'gunship', 'binoculars', 'combined-drone'];
const plant = process.argv.includes('--plant');
const noticesOnly = process.argv.includes('--notices-only');
const shots = process.argv.includes('--shots');
const settleFrames = (page, ms) => page.evaluate((wait) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), wait)), ms);
/** Measured until two passes in a row agree (the layout's passes settle over frames, and under load one lands after the first
 *  measure: the 844x390 notifications' aim chip read 50 px under its seat mid-settle in full runs, round 14). */
async function settledRects(page, instruments) {
  let rects = await page.evaluate(measureInstruments, instruments);
  for (let tries = 0; tries < 6; tries++) {
    await settleFrames(page, 250);
    const again = await page.evaluate(measureInstruments, instruments);
    if (JSON.stringify(again) === JSON.stringify(rects)) break;
    rects = again;
  }
  return rects;
}
/** Plants one control of `className` over the condition lane's notice (the reported case: "Gunship overhead" under a control
 *  it did not know), in the HUD's root; returns its box. (Over both lanes' union, a phone's plant spanned half the HUD.) */
const plantOver = (className) => {
  const notice = [...document.querySelectorAll('.cot-battle-notices .cot-c-notice')]
    .find((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
  if (!notice) return null;
  const { left: x0, top: y0, right: x1, bottom: y1 } = notice.getBoundingClientRect();
  const node = document.createElement('div');
  node.className = `${className} is-planted`;
  node.dataset.planted = '';
  node.style.cssText = `position:fixed;left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;display:block;transform:none;`
    + 'background:repeating-linear-gradient(45deg,#f0f3,#f0f3 6px,#0000 6px,#0000 12px);outline:2px solid #f0f;pointer-events:none';
  (document.querySelector('.cot-hud') ?? document.body).append(node);
  window.dispatchEvent(new Event('cot-hud-relayout'));
  return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
};

/** The tier the guidance plan cleared for the condition lane's notice this pass (battleHudLayout.ts writeGuidance), or -1. */
const guidanceToastTier = () => { try { return JSON.parse(document.body.dataset.hudGuidancePlan ?? '{}').toasts?.[4] ?? -1; } catch { return -1; } };

const browser = await launchGuardedBrowser(puppeteer, { headless: true, args: ['--disable-gpu', '--js-flags=--max-old-space-size=3072'] });
const report = [];
let failures = 0;
try {
  const extra = arg('case', '').split(',').filter((name) => /^\d+x\d+t?$/.test(name) && !CASES.some(([known]) => known === name))
    .map((name) => { const [width, height] = name.replace('t', '').split('x').map(Number); return [name, width, height, name.endsWith('t')]; });
  for (const [name, width, height, touch] of [...CASES, ...extra]) {
    if (arg('case', '') && !arg('case', '').split(',').includes(name)) continue;
    const runs = [...(noticesOnly ? [] : STATES.map((state) => [state, false])), ...NOTICE_STATES.map((state) => [state, true])];
    // (notices-polish-277) each lane's seat in every +notices state of this window: one place per lane (laneProblems)
    const laneSeen = [];
    for (const [state, notices] of runs) {
      if (arg('state', '') && !arg('state', '').split(',').includes(state)) continue;
      const label = notices ? `${state}+notices` : state;
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
      // the notices' holds (alerts 2.4 s, medals 3.4 s, kill rows 5.2 / 6.2 s) last while the probe measures
      await page.evaluateOnNewDocument(() => {
        const later = window.setTimeout;
        window.setTimeout = function (fn, ms, ...rest) { if ([2400, 3400, 5200, 6200].includes(ms)) ms *= 50; return later.call(this, fn, ms, ...rest); };
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?state=${state}${notices ? '&notices=1' : ''}`, { waitUntil: 'networkidle0', timeout: 120000 });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT, { timeout: 60000 });
      // the layout's planners settle over a few frames (and the Watch bar's chunk lands)
      await settleFrames(page, 600);
      const rects = await settledRects(page, INSTRUMENTS);
      const all = overlapProblems(rects, width, height, { conditionTier: await page.evaluate(guidanceToastTier) });
      // (a <state>+notices run judges the notices and the feed against everything; the state's own control-on-control
      // overlaps are its plain run's verdict, reported here as `others`)
      const problems = notices ? all.filter((p) => p.startsWith('notice ') || p.startsWith('feed ') || p.startsWith('offscreen: div.cot-alert')
        || p.startsWith('offscreen: div.cot-c-notice')) : all;
      const others = notices ? all.filter((p) => !problems.includes(p)) : [];
      // (battle-teardown-276) the fixture stages its state inside a live battle scope, as a battle does: outside one
      // battleNotices draws no condition, so every notice check below would judge an empty lane
      if (!await page.evaluate(() => !!window.__HUD_LAYOUT.battleScope?.().live)) {
        problems.push('fixture: no live battle scope (a condition raised outside a battle is never shown)');
      }
      let coverage = null;
      if (notices) laneSeen.push({ state: label, rects });
      if (notices) {
        coverage = noticeCoverage(rects, await page.evaluate(() => document.body.dataset.hudGuidance ?? ''));
        if (coverage.event !== 'shown') problems.push('notice: the event lane shows nothing');
        if (coverage.condition === 'missing') problems.push('notice: the condition lane shows nothing and does not wait');
        // (notices-276b) off the tank the tank's own notices are held (noticeKinds.ts): its event never in the seat, the
        // planted tank condition (the top rung) never in the condition lane; from the tank its event takes the seat
        const held = await page.evaluate(() => {
          const seat = document.querySelector('.cot-alert.show');
          const planted = document.body.dataset.probeTankCondition;
          const plant = planted ? document.querySelector(`.${planted}`) : null;
          return { event: seat?.dataset.tip ?? '', tank: document.body.dataset.probeTankEvent ?? '',
            planted: !!planted, plantShown: !!plant?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) };
        }).catch(() => null);
        if (VIEW_STATES.includes(state)) {
          if (held?.event && held.event === held.tank) problems.push(`hold: the tank's own event shows in ${state}`);
          if (!held?.planted) problems.push(`hold: no tank condition planted in ${state}`);
          else if (held.plantShown) problems.push(`hold: the planted tank condition shows in ${state}`);
        } else if (held?.event !== held?.tank) problems.push(`hold: the tank's own event is not in the seat in ${state} (${held?.event})`);
      }
      if (shots) await page.screenshot({ path: resolve(out, `${name}-${label}.png`) });
      // one datum, one place (tools/datum-census.mjs, the registry's runtime half)
      problems.push(...await datumProblems(page, { scope: '.cot-hud, .cot-mp-status' }));
      // the markers over tanks, as the state shows them and staged over it (one census per state; ?state=markers needs
      // both sides in view and the target plate up)
      problems.push(...await page.evaluate(markerProblems, state === 'markers'));
      await page.evaluate(() => { window.__HUD_LAYOUT.markers(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
      const seen = await page.evaluate(() => [...document.querySelectorAll('.cot-hpbars .cot-hpb, .cot-tgt')]
        .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).length);
      problems.push(...(await page.evaluate(markerProblems, false)).map((p) => `staged: ${p}`));
      for (const e of errors) problems.push(`page error: ${e}`);
      // --plant (notices states): a control over the notices the planners can read (they must move the notices off it, or hold
      // the condition back) and one they cannot (the judge must fail it); each on a fresh copy of the state
      const plants = {};
      if (plant && notices) {
        for (const kind of ['seen', 'unseen']) {
          // (a fresh copy of the state: the markers' staging above moved the field)
          await page.reload({ waitUntil: 'networkidle0', timeout: 120000 });
          await page.waitForFunction(() => !!window.__HUD_LAYOUT, { timeout: 60000 });
          await settleFrames(page, 600);
          await settledRects(page, INSTRUMENTS);
          const at = await page.evaluate(plantOver, PLANTS[kind]);
          await settleFrames(page, 400);
          const planted = await settledRects(page, [...INSTRUMENTS, PLANT_SELECTOR]);
          const found = overlapProblems(planted, width, height, { conditionTier: await page.evaluate(guidanceToastTier) }).filter((p) => p.startsWith('notice ') && p.includes('planted'));
          const caught = found.some((p) => p.startsWith('notice '));
          plants[kind] = { at, found, coverage: noticeCoverage(planted, await page.evaluate(() => document.body.dataset.hudGuidance ?? '')) };
          if (shots) await page.screenshot({ path: resolve(out, `${name}-${label}-plant-${kind}.png`) });
          if (!at) problems.push(`plant ${kind}: no notice shown to plant over`);
          else if (kind === 'seen' && found.length) problems.push(`plant seen: the planners left a notice on a control they read: ${found.join('; ')}`);
          else if (kind === 'unseen' && !caught) problems.push('plant unseen: the judge did not fail a notice under a planted control');
          console.log(`     plant ${kind.padEnd(6)} at ${JSON.stringify(at)} -> ${found.length ? found.join(' | ') : 'clear'}`
            + ` (event ${plants[kind].coverage.event}, condition ${plants[kind].coverage.condition})`);
        }
      }
      failures += problems.length;
      report.push({ case: name, state: label, problems, others, rects, markers: seen, coverage, plants });
      if (others.length) console.log(`     others (the plain state's verdict): ${others.join(' | ')}`);
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${label.padEnd(26)} markers ${String(seen).padStart(2)}`
        + `${coverage ? ` event ${coverage.event} condition ${coverage.condition}` : ''} ${problems.join(' | ')}`);
      await page.close();
    }
    if (laneSeen.length > 1) {
      const lanes = laneProblems(laneSeen, height);
      failures += lanes.problems.length;
      report.push({ case: name, state: 'lanes', problems: lanes.problems, notes: lanes.notes, lanes: lanes.record });
      console.log(`${lanes.problems.length ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${'lanes'.padEnd(26)} `
        + `${Object.entries(lanes.record).map(([lane, at]) => `${lane} ${[...new Set(Object.values(at).map((b) => b[1]))].join('/') || '-'}`).join(' ')} ${lanes.problems.join(' | ')}`);
      for (const note of lanes.notes) console.log(`     note: ${note}`);
    }
  }
} finally {
  await browser.close();
}
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`battle-hud-overlap: ${failures ? `FAIL (${failures})` : 'PASS'}; ${report.filter((r) => r.state !== 'lanes').length} states measured, `
  + `the lanes in ${report.filter((r) => r.state === 'lanes').length} windows; ${resolve(out, 'report.json')}`);
process.exitCode = failures ? 1 : 0;
