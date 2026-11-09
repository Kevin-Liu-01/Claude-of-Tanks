#!/usr/bin/env node
// A second solo battle in the same page reaches its reveal (268's release drive smoke, case 2: the second battle held the
// loading card at "Preparing the view" 97% for 240 s+, on integ/268 and on production 267, under machine load).
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// One page on the dev server (desktop tier), loaded the way the busy machine was: its main thread CPU-throttled through
// the DevTools protocol, and its GPU process behind (a fence or a program link reads complete only once it is
// --gpu-lag-ms old; CPU throttling alone slows the battle's load as much as the Garage restore, and never reproduced it).
// A first solo battle to its reveal, Leave to the Garage, and the second battle started the moment the phase reads garage
// (the smoke's order): the Leave's Garage GPU restore is still running when the second battle covers the screen. The
// receipt holds that the second battle reveals (the card off, the hold released) within its budget and that its reveal
// waited for one battle frame, not for that restore (which suppressed every frame while it ran); on a hang it prints
// the deployment warm's stages, the Garage return's trace and the card's last stage.
//   node tools/second-solo-battle.browser.selftest.mjs [--throttle=2] [--gpu-lag-ms=750] [--map=urban] [--first=t90am]
//     [--second=merkava4b] [--budget-s=180] [--json=<out>]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { createCaptureLock } from './capture-lock.mjs';
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

const lock = createCaptureLock();
const report = { map: MAP, first: FIRST, second: SECOND, throttle: THROTTLE, gpuLagMs: GPU_LAG_MS, errors: [], samples: [] };
let server, browser, refresh;
try {
  // a hang check under a throttled main thread: timing-sensitive, so an exclusive hold
  await lock.acquire(45 * 60_000, { place: 'second-solo-battle', lockClass: 'timing' });
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
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
    if (message.type() === 'error' || message.type() === 'warn') report.errors.push(`${message.type()}: ${message.text().slice(0, 300)}`);
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
  await page.waitForFunction('window.__GAME_READY === true && !!window.__DEBUG && window.__DEBUG.game?.phase === "garage"',
    { timeout: 420_000, polling: 250 });
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
  const revealed = (s) => s.phase === 'battle' && !s.card && !s.cinematic && !(s.preBattleS === 'hold' || s.preBattleS > 0);
  const battle = async (label, specId, budgetMs) => {
    const startedAt = Date.now();
    await page.evaluate((specId, mapId) => {
      setTimeout(() => { window.__DEBUG.beginSoloBattle({ specId, mapId }); }, 0);
    }, specId, MAP);
    let last;
    while (Date.now() - startedAt < budgetMs) {
      last = await state();
      report.samples.push({ label, wallS: Math.round((Date.now() - startedAt) / 1000), ...last });
      if (revealed(last)) return { revealed: true, ms: Date.now() - startedAt, last };
      await sleep(2000);
    }
    return { revealed: false, ms: Date.now() - startedAt, last };
  };

  report.firstBattle = await battle('first', FIRST, Math.max(BUDGET_MS, 300_000));
  assert.ok(report.firstBattle.revealed, `the first battle revealed (${JSON.stringify(report.firstBattle.last)})`);
  await sleep(2000);
  // Leave, fired and not awaited (the smoke's order), and the second battle the moment the phase reads garage
  // (a Leave a battle supersedes rejects: its outcome is reported, not thrown into the page)
  await page.evaluate(() => {
    setTimeout(() => { window.__ssbLeave = Promise.resolve(window.__DEBUG.leaveBattleToGarage()).then(() => 'resolved', (e) => String(e?.message ?? e)); }, 0);
  });
  await page.waitForFunction(() => window.__DEBUG.game.phase === 'garage', { timeout: 120_000, polling: 50 });
  report.atSecondStart = await state();
  report.secondBattle = await battle('second', SECOND, BUDGET_MS);
  report.leave = await page.evaluate(() => Promise.race([window.__ssbLeave, new Promise((done) => setTimeout(() => done('pending'), 1000))]));
  const s = report.secondBattle;
  console.log(`second-solo-battle: throttle ${THROTTLE}x, GPU lag ${GPU_LAG_MS} ms, ${MAP}: first ${report.firstBattle.ms} ms, second `
    + `${s.revealed ? `revealed in ${s.ms} ms` : `NOT revealed after ${s.ms} ms`} (reveal wait ${s.last?.warm?.stages?.openingFrame ?? '-'} ms); `
    + `the Leave ${report.leave}`);
  if (!s.revealed) console.log(JSON.stringify({ atSecondStart: report.atSecondStart, last: s.last }, null, 2));
  assert.ok(s.revealed, `the second battle revealed within ${BUDGET_MS / 1000} s (card at ${s.last?.pct} "${s.last?.stage}")`);
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
  clearInterval(refresh);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  try { lock.release(); } catch { /* the hold is reaped once this process exits */ }
}
