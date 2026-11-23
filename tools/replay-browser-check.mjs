#!/usr/bin/env node
/**
 * The recorder in a real page (replay-system-275, docs/REPLAY.md §2 and P1): four solo battles interleaved ON, OFF, ON,
 * OFF, each driven by real keys for --seconds after controls release, then a fifth, TRACE, recorded with the divergence
 * trace (game/replay/replayTrace.ts) and left out of the cost and frame verdict. Measures the recorder's cost per fixed
 * step in blocks (ON: every 600 steps, between frames, the recorder's own step work run 600 times on the live battle and
 * timed as one block, recorder.probeCost; Chrome's clock reads in 100 us steps and cannot time one step) and every
 * frame's delta (all arms), flags any paused block (which invalidates the run), then leaves each recorded battle,
 * fetches its saved recording from IndexedDB and replays it in Node (tools/replay-verify.mjs; the TRACE arm also through
 * tools/replay-diff.mjs). The pass rule is registered before each run: ~/cot-lanes/replay-system-notes/perf-rule-2.md
 * (the first run's rule, perf-rule.md, timed each step and read the clock's quantum; that run's FAIL stands).
 *
 *   node tools/with-capture-lock.mjs --lock-class=timing -- node tools/replay-browser-check.mjs --out=<dir> [--seconds=45]
 *
 * Heavy: a browser and a vite dev child; stops both by its own handles when done.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { runWarmHold, startViteChild, stubViteSocket } from './capture-hold.mjs';
import { beginSoloBattle, isMainModule, mapProbeLaunchOptions, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';

const TOOL = 'replay-browser-check';
const SPEC = 'm1a1_abrams_hc';
const MAP = 'verdant';
const RULE = 'perf-rule-2.md sha256 64283aa6e39cb158';
/** The arms in order: the recorder on or off, and the diagnostic trace (its arm left out of the cost and frame verdict). */
const ARMS = [{ on: true }, { on: false }, { on: true }, { on: false }, { on: true, trace: true }];

function parse(argv) {
  const out = { out: null, seconds: 45, root: process.cwd(), width: 1600, height: 900 };
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    if (m[1] === 'out') out.out = path.resolve(m[2]);
    else if (m[1] === 'seconds') out.seconds = Number(m[2]);
    else if (m[1] === 'root') out.root = path.resolve(m[2]);
    else throw new Error(`unknown flag --${m[1]}`);
  }
  if (!out.out) throw new Error('--out=<dir> is required');
  return out;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const say = (line) => console.log(`[${TOOL}] ${stamp()} ${line}`);

/** In-page: arm the samplers. `on` keeps the recorder (untouched); off replaces its step and bus hooks with no-ops. */
function armSamplers(on) {
  const R = window.__COT_REPLAY, rec = R.recorder, D = window.__DEBUG;
  const S = window.__replayCheck = { on, frames: [], blocks: [], paused: 0, pausedRun: 0, pausedMax: 0, last: performance.now(), stop: false,
    nextProbe: (D.game.tick ?? 0) + 600 };
  S.saved = { beforeStep: rec.beforeStep, afterStep: rec.afterStep, onEvent: rec.onEvent };
  if (!on) {
    rec.beforeStep = () => {};
    rec.afterStep = () => {};
    rec.onEvent = () => {};
  }
  const tick = (now) => {
    if (S.stop) return;
    S.frames.push(now - S.last);
    S.last = now;
    const paused = !!D.pauseInfo?.paused || D.settings?.isOpen?.() || D.killcam?.isActive?.() || D.game.phase !== 'battle';
    if (paused) { S.pausedRun += S.frames.at(-1); S.pausedMax = Math.max(S.pausedMax, S.pausedRun); } else S.pausedRun = 0;
    // a block of the recorder's step work every 600 steps, between frames (never inside a step)
    if (S.on && rec.active && D.game.tick >= S.nextProbe) {
      const ms = rec.probeCost(600, () => performance.now());
      if (ms != null) S.blocks.push(ms);
      S.nextProbe += 600;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function collectSamplers() {
  const S = window.__replayCheck, rec = window.__COT_REPLAY.recorder;
  S.stop = true;
  Object.assign(rec, S.saved);
  return { frames: S.frames.slice(10), blocks: S.blocks, pausedMaxMs: S.pausedMax, active: rec.active };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

async function driveBattle(page, seconds) {
  await page.keyboard.down('KeyW');
  const started = Date.now();
  let turn = 'KeyA';
  await page.keyboard.down(turn);
  let lastTurn = Date.now(), lastFire = Date.now(), switched = 0;
  while (Date.now() - started < seconds * 1000) {
    await sleep(250);
    const t = Date.now() - started;
    if (Date.now() - lastTurn > 3000) { await page.keyboard.up(turn); turn = turn === 'KeyA' ? 'KeyD' : 'KeyA'; await page.keyboard.down(turn); lastTurn = Date.now(); }
    if (Date.now() - lastFire > 4000) {
      await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; setTimeout(() => { window.__DEBUG.flags.forceFire = false; }, 300); });
      lastFire = Date.now();
    }
    if (switched === 0 && t > seconds * 330) { await page.keyboard.press('Digit2'); switched = 1; }
    if (switched === 1 && t > seconds * 660) { await page.keyboard.press('Digit1'); switched = 2; }
  }
  await page.keyboard.up(turn);
  await page.keyboard.up('KeyW');
}

async function fetchNewestReplay(page, withTrace) {
  return page.evaluate(async (withTrace) => {
    const R = window.__COT_REPLAY;
    const list = await R.list();
    if (!list.length) return null;
    const bytes = await R.load(list[0].id);
    return { summary: list[0], bytes: bytes ? Array.from(bytes) : null, trace: withTrace ? JSON.stringify(R.lastTrace()) : null };
  }, withTrace);
}

async function main(argv) {
  const options = parse(argv);
  mkdirSync(options.out, { recursive: true });
  const receipt = { tool: TOOL, rule: RULE, spec: SPEC, map: MAP, seconds: options.seconds, arms: [] };
  await runWarmHold({
    label: TOOL,
    place: `${TOOL}:${path.basename(options.out)}`,
    lockClass: 'timing',
    waitHours: 6,
    warm: async () => {
      const server = await startViteChild({ root: options.root, mode: 'dev' });
      const browser = await launchGuardedBrowser(puppeteer, { ...mapProbeLaunchOptions({ width: options.width, height: options.height, protocolTimeout: 900000 }), timeout: 180000 });
      const close = async () => { await browser.close(); await server.close(); };
      try {
        const page = await browser.newPage();
        await stubViteSocket(page);
        await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
        await page.goto(`${server.url}/?nosplash=1&tier=desktop&gfxreset=1`, { waitUntil: 'domcontentloaded', timeout: 600000 });
        await page.waitForFunction(`${BOOT_LOADED_EXPRESSION} && !!window.__DEBUG && !!window.__COT_REPLAY`, { timeout: 900000, polling: 1000 });
        return { pages: [page], page, errors, close };
      } catch (error) { await close(); throw error; }
    },
    shoot: async ({ page, errors }) => {
      for (const [index, { on, trace = false }] of ARMS.entries()) {
        say(`arm ${index + 1}: recorder ${trace ? 'TRACE' : on ? 'ON' : 'OFF'}`);
        await page.evaluate((trace) => { window.__COT_REPLAY.recorder.trace = trace; }, trace);
        await beginSoloBattle(page, { specId: SPEC, mapId: MAP, gameMode: 'standard' });
        await page.evaluate((trace) => { window.__COT_REPLAY.recorder.trace = false; }, trace);
        await page.evaluate(armSamplers, on);
        await driveBattle(page, options.seconds);
        const sample = await page.evaluate(collectSamplers);
        const arm = { on, trace, frames: sample.frames.length, frameMedianMs: median(sample.frames), frameP95Ms: pct(sample.frames, 0.95),
          blocks: sample.blocks, blockMeanMs: mean(sample.blocks), blockMaxMs: sample.blocks.length ? Math.max(...sample.blocks) : null,
          pausedMaxMs: sample.pausedMaxMs, recorderActive: sample.active };
        await page.evaluate(() => { window.__DEBUG.leaveBattleToGarage(); });
        await page.waitForFunction('window.__DEBUG.game.phase === "garage"', { timeout: 120000, polling: 250 });
        await sleep(1500);
        if (on) {
          const saved = await fetchNewestReplay(page, trace);
          if (saved?.bytes) {
            const file = path.join(options.out, `arm${index + 1}.cotreplay`);
            writeFileSync(file, Buffer.from(saved.bytes));
            if (trace && saved.trace && saved.trace !== 'null') {
              arm.traceFile = path.join(options.out, `arm${index + 1}.trace.json`);
              writeFileSync(arm.traceFile, saved.trace);
            }
            arm.replayFile = file;
            arm.replayBytes = saved.bytes.length;
            arm.replaySteps = saved.summary.ticks;
          } else arm.replayFile = null;
        }
        receipt.arms.push(arm);
        say(`arm ${index + 1}: ${JSON.stringify(arm)}`);
      }
      receipt.pageErrors = errors.splice(0);
    },
  });
  // the replays, CPU-only, after the hold
  for (const arm of receipt.arms.filter((a) => a.on)) {
    if (!arm.replayFile) { arm.replay = { holds: false, mismatch: { message: 'no saved recording' } }; continue; }
    try {
      arm.replay = JSON.parse(execFileSync(process.execPath, ['tools/replay-verify.mjs', arm.replayFile, '--json'], { cwd: options.root, encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch (error) {
      try { arm.replay = JSON.parse(String(error.stdout)); } catch { arm.replay = { holds: false, mismatch: { message: String(error.message).slice(0, 300) } }; }
    }
    // the trace arm: where the replay leaves the page, its report kept beside the recording
    if (arm.traceFile) {
      let report;
      try {
        report = execFileSync(process.execPath, ['tools/replay-diff.mjs', arm.replayFile, arm.traceFile], { cwd: options.root, encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) { report = `${error.stdout ?? ''}${error.stderr ?? ''}`; }
      arm.diffFile = arm.traceFile.replace(/\.trace\.json$/, '.diff.txt');
      writeFileSync(arm.diffFile, report);
    }
  }
  const onArms = receipt.arms.filter((a) => a.on && !a.trace), offArms = receipt.arms.filter((a) => !a.on);
  const pooled = onArms.flatMap((a) => a.blocks);
  const onMedian = median(onArms.map((a) => a.frameMedianMs)), offMedian = median(offArms.map((a) => a.frameMedianMs));
  const offNoise = Math.abs((offArms[0]?.frameMedianMs ?? 0) - (offArms[1]?.frameMedianMs ?? 0));
  const tolerance = Math.max(offMedian * 0.01, offNoise);
  const invalid = receipt.arms.some((a) => a.pausedMaxMs > 500);
  receipt.verdict = {
    recorderMeanMs: mean(pooled), recorderBlockMaxMs: pooled.length ? Math.max(...pooled) : null, blocks: pooled.length,
    cost: pooled.length >= 6 && mean(pooled) <= 0.010 && Math.max(...pooled) <= 0.020,
    frameOnMs: onMedian, frameOffMs: offMedian, toleranceMs: tolerance, frame: Math.abs(onMedian - offMedian) <= tolerance,
    replays: onArms.every((a) => a.replay?.holds === true),
    invalid,
  };
  receipt.verdict.pass = !invalid && receipt.verdict.cost && receipt.verdict.frame && receipt.verdict.replays;
  writeFileSync(path.join(options.out, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  say(`verdict ${invalid ? 'INVALID (a paused block)' : receipt.verdict.pass ? 'PASS' : 'FAIL'}: ${JSON.stringify(receipt.verdict)}`);
  return invalid ? 3 : receipt.verdict.pass ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
