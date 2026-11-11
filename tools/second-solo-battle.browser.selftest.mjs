#!/usr/bin/env node
// A second solo battle in the same page reaches its reveal (268's release drive smoke, case 2: the second battle held the
// loading card at "Preparing the view" 97% for 240 s+, on integ/268 and on production 267, under machine load).
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// One page on the dev server (desktop tier), loaded the way the busy machine was: its main thread CPU-throttled through
// the DevTools protocol, and its GPU process behind (a fence or a program link reads complete only once it is
// --gpu-lag-ms old; CPU throttling alone slows the battle's load as much as the Garage restore, and never reproduced it).
// A first solo battle to its reveal, Leave to the Garage, and the second battle started the moment the Garage takes the
// scene (the smoke's order, timed on scenePhaseExpression('garage'): the Leave's Garage GPU restore is still running).
// (round 8 Y8, sweep s6-02) A solo start waits for a Garage return in flight to settle (src/game/soloBattleEntryRuntime.ts
// whenGarageSettled: garageReturn.whenSettled, the Leave's restore included), so the second start queues behind the
// Leave rather than racing its restore. The receipt holds that contract: (1) the Leave resolves and is never refused,
// superseded or failed (the debug Leave, main.ts leaveBattleToGarage, catches every rejection and resolves, so its
// outcome is the '[garage return]' line it logs: none may appear from the Leave on); (2) the second battle is announced
// (its ui:battleStart, which the entry runs after its return wait and just before its cover) only once the Leave's
// return has settled (the trace it publishes, window.__GARAGE_ENTRY, complete: its restore done); (3) the second battle
// takes the scene (the first 'battle' phase:change after the Leave, reason 'solo-start') with that trace complete; the
// second battle reveals (its controls released) within its budget, and its reveal waited for one battle frame, not for a
// restore that suppressed every frame while it ran (482aa753b9's symptom; the cover rule for a scene-taker that does not
// wait, a network round, is src/game/garageReturnRuntime.selftest.mjs's, and the entry's queue is pinned in Node by
// src/game/soloBattleEntryAnnounce.selftest.mjs). (2) catches a start that does not wait, however long its load takes;
// (3) alone passes one whose load outlasts the restore; (1) also catches one that takes the scene mid-restore (the Leave
// is superseded). Each is judged when it happens, not from counts or the Leave's own end: a Leave writes the phase
// twice (its scene, then its screen, garageReturnRuntime.ts performReturn and showGarageScreen), and its promise ends
// after the veil's fade-out, which a start that waited correctly can beat (whenSettled resolves at the Leave's entry,
// before that fade). Every wait is the readiness probe's (tools/game-readiness.mjs), one boot wait included; the
// samples (the card's stage and percentage, the warm and return traces) are a hang's diagnostics. It holds the capture
// lock through the open hold (a timing hold, released after its browser closes). On a hang it prints the deployment
// warm's stages, the Garage return's trace and the card's last stage.
//   node tools/second-solo-battle.browser.selftest.mjs [--throttle=2] [--gpu-lag-ms=750] [--map=urban] [--first=t90am]
//     [--second=merkava4b] [--budget-s=180] [--json=<out>]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readGameReadiness, readinessExpression, scenePhaseExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const THROTTLE = Number(arg('throttle', '2'));
const GPU_LAG_MS = Number(arg('gpu-lag-ms', '750'));
const MAP = arg('map', 'urban');
const FIRST = arg('first', 't90am');
const SECOND = arg('second', 'merkava4b');
const BUDGET_MS = Number(arg('budget-s', '180')) * 1000;
const JSON_OUT = arg('json', null);
const REVEAL_WAIT_MAX_MS = 5000;
const VIEW = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const report = { map: MAP, first: FIRST, second: SECOND, throttle: THROTTLE, gpuLagMs: GPU_LAG_MS, errors: [], samples: [], returnLog: [] };
// (1)'s evidence: the debug Leave resolves on every outcome and logs a line starting RETURN_LOG on each other one (main.ts
// leaveBattleToGarage: 'Leave ignored' when refused busy or superseded, 'Leave failed'; exitFailedGarageReturn: 'return
// failed'). Read before anything opens, so a renamed line fails here rather than leaving (1) blind.
const RETURN_LOG = '[garage return]';
{
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  for (const line of ["console.info('[garage return] Leave ignored:'", "console.error('[garage return] Leave failed'",
    "console.error('[garage return] return failed'"]) {
    assert.ok(main.includes(line), `src/main.ts still logs ${line.slice(line.indexOf("'"))}: (1) reads the Leave's outcome from it`);
  }
}
let server, browser, hold, leaveFired = false;
try {
  // a hang check under a throttled main thread: timing-sensitive, so an exclusive hold; its worst case (a cold boot of 7
  // min, two battles and a Leave under the throttle) passes the 20-min cap, and it cannot yield mid-battle
  hold = await openCaptureHold({ label: 'second-solo-battle', place: 'second-solo-battle', lockClass: 'timing', timeoutMs: 45 * 60_000,
    holdCapMinutes: 30, holdCapReason: 'second-solo-battle: one throttled page through a cold boot, two solo battles and a Leave; it cannot yield mid-battle' });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 60_000, protocolTimeout: 300_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox',
      '--disable-dev-shm-usage', `--window-size=${VIEW.width},${VIEW.height + 120}`] }), { label: 'second-solo-battle' });
  report.launch = verifyNativeBrowserLaunch(browser);
  const page = await browser.newPage();
  await page.setViewport({ ...VIEW, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  page.on('console', (message) => {
    const type = message.type(), text = message.text();
    if (type === 'error' || type === 'warn') report.errors.push(`${type}: ${text.slice(0, 300)}`);
    if (leaveFired && text.startsWith(RETURN_LOG)) report.returnLog.push(`${type}: ${text.slice(0, 300)}`);
  });
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true; // the frame scheduler presents only to a focused document
    try {
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
    } catch { /* none */ }
  });
  // the loaded GPU process: a fence signals, and a link completes, no sooner than lagMs after it was issued
  await page.evaluateOnNewDocument((lagMs) => {
    if (!(lagMs > 0) || typeof WebGL2RenderingContext !== 'function') return;
    const proto = WebGL2RenderingContext.prototype, issued = new WeakMap(), COMPLETION_STATUS_KHR = 0x91b1;
    const young = (object) => { const at = issued.get(object); return at !== undefined && performance.now() - at < lagMs; };
    const { fenceSync, clientWaitSync, linkProgram, getProgramParameter } = proto;
    proto.fenceSync = function (...args) { const sync = fenceSync.apply(this, args); if (sync) issued.set(sync, performance.now()); return sync; };
    proto.clientWaitSync = function (sync, flags, timeout) {
      return timeout === 0 && young(sync) ? this.TIMEOUT_EXPIRED : clientWaitSync.call(this, sync, flags, timeout);
    };
    proto.linkProgram = function (program) { issued.set(program, performance.now()); return linkProgram.call(this, program); };
    proto.getProgramParameter = function (program, name) {
      return name === COMPLETION_STATUS_KHR && young(program) ? false : getProgramParameter.call(this, program, name);
    };
  }, GPU_LAG_MS);
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/?nosplash=1&debug=1&telemetry=off&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  // one boot wait: the settled Garage implies the boot (the probe's expression reads `booted` first)
  await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 420_000, polling: 250 });
  // the loaded machine: the page's main thread at 1/THROTTLE speed from the first battle on
  const cdp = await page.createCDPSession();
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  const state = () => page.evaluate(() => {
    const d = window.__DEBUG, warm = window.__BATTLE_COUNTDOWN_WARM, garage = window.__GARAGE_ENTRY, load = window.__BATTLE_LOAD;
    const pre = d?.game?.preBattleS;
    return {
      t: Math.round(performance.now()),
      phase: d?.game?.phase, preBattleS: pre === Infinity ? 'hold' : pre ?? null,
      card: !!document.querySelector('.cot-bl.on'), cinematic: !!d?.rig?.cinematicActive,
      pct: document.querySelector('.cot-bl .fpct')?.textContent ?? null,
      stage: document.querySelector('.cot-bl .fstage .st')?.textContent ?? null,
      spec: d?.game?.player?.specId ?? null,
      warm: warm ? { done: warm.done, stages: { ...warm.stages }, error: warm.error ?? null } : null,
      garage: garage ? { stages: { ...garage.stages }, unready: garage.presentationUnready, totalMs: garage.totalMs ?? null,
        restoreSkipped: garage.restoreSkipped ?? null } : null,
      load: load ? { stages: { ...load.stages }, totalMs: load.totalMs ?? null } : null,
    };
  });
  // revealed: the battle started after `since` (a lifecycle transitions count) is on screen with its controls released,
  // and its intro camera done
  const revealedExpression = (since) => `${readinessExpression('controlsReleased', { since })} && !window.__DEBUG?.rig?.cinematicActive`;
  const battle = async (label, specId, budgetMs) => {
    const startedAt = Date.now();
    const since = (await readGameReadiness(page)).transitions;
    await page.evaluate((specId, mapId) => {
      setTimeout(() => { window.__DEBUG.beginSoloBattle({ specId, mapId }); }, 0);
    }, specId, MAP);
    let last;
    while (Date.now() - startedAt < budgetMs) {
      last = await state();
      report.samples.push({ label, wallS: Math.round((Date.now() - startedAt) / 1000), ...last });
      if (await page.evaluate(revealedExpression(since))) return { revealed: true, ms: Date.now() - startedAt, since, last };
      await sleep(2000);
    }
    return { revealed: false, ms: Date.now() - startedAt, since, last };
  };

  report.firstBattle = await battle('first', FIRST, Math.max(BUDGET_MS, 300_000));
  assert.ok(report.firstBattle.revealed, `the first battle revealed (${JSON.stringify(report.firstBattle.last)})`);
  await sleep(2000);
  // Leave, fired and not awaited (the smoke's order): its outcome and the lifecycle when it settled are kept in the page,
  // and so are the next announcement and scene take as they happen (the first ui:battleStart and the first 'battle'
  // phase:change: whose, and whether the Garage return trace the Leave published was complete then); its log lines are
  // collected from here; then the second battle the moment the Garage takes the scene (the hand-over's timing edge)
  leaveFired = true;
  await page.evaluate(() => {
    const returnSettled = () => {
      const trace = window.__GARAGE_ENTRY;
      return { returnSettled: !!trace && trace.presentationUnready === false && Number.isFinite(trace.totalMs),
        returnStages: trace ? Object.keys(trace.stages ?? {}) : null };
    };
    const settled = (outcome) => {
      const life = window.__APP_LIFECYCLE;
      window.__ssbLeaveSettled = { outcome, phase: life?.phase ?? null, lastReason: life?.lastReason ?? null, transitions: life?.transitions ?? null };
      return outcome;
    };
    const stopStart = window.__DEBUG.bus.on('ui:battleStart', (payload) => {
      stopStart();
      window.__ssbBattleStart = { specId: payload?.specId ?? null, ...returnSettled() };
    });
    const stop = window.__DEBUG.bus.on('phase:change', (change) => {
      if (change?.phase !== 'battle') return;
      stop();
      window.__ssbSceneTake = { reason: change.reason ?? null, from: change.from ?? null, ...returnSettled() };
    });
    setTimeout(() => {
      window.__ssbLeave = Promise.resolve(window.__DEBUG.leaveBattleToGarage()).then(() => settled('resolved'), (e) => settled(String(e?.message ?? e)));
    }, 0);
  });
  await page.waitForFunction(scenePhaseExpression('garage'), { timeout: 120_000, polling: 50 });
  report.atSecondStart = await state();
  report.secondBattle = await battle('second', SECOND, BUDGET_MS);
  report.leave = await page.evaluate(() => Promise.race([window.__ssbLeave, new Promise((done) => setTimeout(() => done('pending'), 1000))]));
  report.leaveSettled = await page.evaluate(() => window.__ssbLeaveSettled ?? null);
  report.battleStart = await page.evaluate(() => window.__ssbBattleStart ?? null);
  report.sceneTake = await page.evaluate(() => window.__ssbSceneTake ?? null);
  const s = report.secondBattle;
  console.log(`second-solo-battle: throttle ${THROTTLE}x, GPU lag ${GPU_LAG_MS} ms, ${MAP}: first ${report.firstBattle.ms} ms, second `
    + `${s.revealed ? `revealed in ${s.ms} ms` : `NOT revealed after ${s.ms} ms`} (reveal wait ${s.last?.warm?.stages?.openingFrame ?? '-'} ms); `
    + `the Leave ${report.leave}`);
  if (!s.revealed) console.log(JSON.stringify({ atSecondStart: report.atSecondStart, last: s.last }, null, 2));
  assert.ok(s.revealed, `the second battle revealed within ${BUDGET_MS / 1000} s (card at ${s.last?.pct} "${s.last?.stage}")`);
  // the second start waited for the Leave: (1) the Leave resolved and logged no refusal, supersession or failure (its
  // wrapper resolves on all three); (2) the second battle was announced, just before its cover, only after the Leave's
  // return, its restore included, had settled; (3) it took the scene after that too
  assert.equal(report.leave, 'resolved', `the Leave a second start waits for resolves (${JSON.stringify(report.leaveSettled)})`);
  assert.deepEqual(report.returnLog, [], `the Leave was never refused, superseded or failed (${JSON.stringify(report.leaveSettled)})`);
  assert.equal(report.battleStart?.specId, SECOND, `the next announcement is the second battle's (${JSON.stringify(report.battleStart)})`);
  assert.equal(report.battleStart.returnSettled, true,
    `the second battle was announced, before its cover, after the Leave's return settled (${JSON.stringify(report.battleStart)})`);
  assert.equal(report.sceneTake?.reason, 'solo-start', `the next scene take is the second battle's (${JSON.stringify(report.sceneTake)})`);
  assert.equal(report.sceneTake.returnSettled, true,
    `the second battle took the scene after the Leave's return settled (${JSON.stringify(report.sceneTake)})`);
  // the reveal waits for one presented battle frame (primeReveal): never for the Leave's Garage restore, which suppressed
  // every frame while it ran (unfixed at 750 ms of GPU lag: 21 s here, the 268 smoke's 240 s+ on a loaded machine)
  const revealWaitMs = s.last?.warm?.stages?.openingFrame;
  report.revealWaitMs = revealWaitMs;
  assert.ok(Number.isFinite(revealWaitMs) && revealWaitMs < REVEAL_WAIT_MAX_MS,
    `the second battle's reveal waited ${revealWaitMs} ms for its first frame (at most ${REVEAL_WAIT_MAX_MS} ms)`);
  assert.deepEqual(report.errors.filter((e) => e.startsWith('pageerror')), [], 'no page errors');
  console.log('second-solo-battle.browser.selftest: a second solo battle in the same page reveals PASS');
} finally {
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
}
