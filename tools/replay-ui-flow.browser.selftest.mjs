#!/usr/bin/env node
/**
 * The replay system as a player meets it (replay-fixes-277, docs/REPLAY.md): a page on a fresh profile, a solo battle
 * entered from the Garage's own Deploy key and driven with real keys, then each way the game offers to watch it:
 *
 *   A  leave from Settings, open the Service Record (R), its Replays tab, the newest row's Watch;
 *   B  a second battle ended by its clock, the end screen's Watch replay;
 *   C  A's file, saved by the row's Download replay, opened on a fresh profile through Open replay file (a file that is
 *      not a replay and one of another format first: each says why in the tab and enters nothing).
 *
 * The built page's battle pool (game.allTanks) must be Node's, id for id. Each path must reach a viewer that shows no
 * notice, whose transport enables, whose clock runs when Play is pressed (at 4x), and which plays to the recording's end
 * with a hull moving. Every replay indexer Worker's reply is kept (the problem it named), and each recording is saved
 * beside the receipt for tools/replay-verify.mjs. Live 276: Kevin, "the replays
 * dont actually work": the indexer's Worker drew another roster than the page had recorded and refused the replay
 * ("This replay can't be played."), while the Node round trip and the recorder's browser check both passed.
 *
 *   node tools/replay-ui-flow.browser.selftest.mjs [--dist=<built dist> | --url=<origin>] [--out=<dir>] [--port=4238]
 *     [--seconds=20] [--paths=A,B,C]
 *
 * --dist serves a build (vite preview), --url opens a running origin, and with neither it starts a dev server. Takes the shared
 * capture lock (render class; nests in a with-capture-lock hold): the manual `browser` suite's
 * (npm run test:heavy -- browser). One browser and one vite child, both stopped by their own handles. Exit 0 on PASS, 1 on
 * FAIL. First-party tooling: Kevin B. Liu.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold, startViteChild } from './capture-hold.mjs';
import { isMainModule, mapProbeLaunchOptions, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION, readinessExpression } from './game-readiness.mjs';
import { createGameState } from '../src/game/stateCore.ts';
import { spawnTanks } from '../src/game/rosterState.ts';

const TOOL = 'replay-ui-flow';
const QUERY = 'nosplash=1&tier=desktop&gfxreset=1';

/** In-page, before any script: every replay indexer Worker's last reply kept on window.__replayIndexJobs (the problem it
 *  named, the steps it indexed), so a viewer that says "can't be played" says why in the receipt. */
const WATCH_INDEXER = `(() => {
  const Native = window.Worker;
  if (!Native || Native.__cotReplayWatch) return;
  window.__replayIndexJobs = [];
  window.Worker = new Proxy(Native, {
    construct(target, args, newTarget) {
      const worker = Reflect.construct(target, args, newTarget);
      if (args[1] && args[1].name === 'cot-replay-indexer') {
        const job = { started: performance.now(), reply: null };
        window.__replayIndexJobs.push(job);
        worker.addEventListener('message', ({ data }) => {
          if (data?.type === 'done') job.reply = { type: 'done', problem: data.index?.problem ?? null, indexedSteps: data.index?.indexedSteps,
            lastTick: data.index?.lastTick, track: !!data.index?.track, ms: Math.round(performance.now() - job.started) };
          else if (data?.type === 'error') job.reply = { type: 'error', message: data.message };
        });
        worker.addEventListener('error', (event) => { job.reply = { type: 'workerError', message: String(event?.message ?? event) }; });
      }
      return worker;
    },
    get(target, key, receiver) { return key === '__cotReplayWatch' ? true : Reflect.get(target, key, receiver); },
  });
})();`;

export function parseFlowArgs(argv) {
  const out = { out: null, dist: null, port: 4238, seconds: 20, paths: ['A', 'B', 'C'], url: null, width: 1600, height: 900 };
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    if (m[1] === 'out') out.out = path.resolve(m[2]);
    else if (m[1] === 'dist') out.dist = m[2];
    else if (m[1] === 'port') out.port = Number(m[2]);
    else if (m[1] === 'seconds') out.seconds = Number(m[2]);
    else if (m[1] === 'paths') out.paths = m[2].split(',').filter((p) => p === 'A' || p === 'B' || p === 'C');
    else if (m[1] === 'url') out.url = m[2].replace(/\/$/, '');
    else throw new Error(`unknown flag --${m[1]}`);
  }
  out.out ??= mkdtempSync(path.join(tmpdir(), 'replay-ui-flow-'));
  if (!out.paths.length) throw new Error('--paths takes A, B and/or C');
  return out;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const say = (line) => console.log(`[${TOOL}] ${stamp()} ${line}`);

/** In-page: a visible element's click (no coordinates: the HUD may cover it). */
export const clickVisible = (page, selector) => page.evaluate((sel) => {
  const node = [...document.querySelectorAll(sel)].find((el) => el instanceof HTMLElement && el.offsetParent !== null);
  if (!node) return false;
  node.click();
  return true;
}, selector);

/** Enter a solo battle as the player does: the Garage's Deploy key (Enter), then any entry gate, until controls release. */
export async function enterBattle(page) {
  await page.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
  await sleep(500);
  await page.keyboard.press('Enter');
  const until = Date.now() + 300_000;
  while (Date.now() < until) {
    if (await page.evaluate(readinessExpression('controlsReleased'))) return;
    // a "press any key" gate on the entry's load screen (the player presses one)
    const gate = await page.evaluate(() => /press\s+any\s+key/i.test(document.body.innerText || ''));
    if (gate) await page.keyboard.press('Space');
    await sleep(750);
  }
  throw new Error('the battle never released its controls');
}

/** Drive with real keys for `seconds`: forward and turns, the gun fired now and then. */
export async function drive(page, seconds) {
  const end = Date.now() + seconds * 1000;
  let turn = 0;
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() < end) {
      const key = turn++ % 2 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(key);
      await sleep(900);
      await page.keyboard.up(key);
      await page.mouse.click(800, 420);
      await sleep(1100);
    }
  } finally { await page.keyboard.up('KeyW'); }
}

const recorderState = (page) => page.evaluate(() => ({
  loaded: !!window.__COT_REPLAY?.recorder,
  active: window.__COT_REPLAY?.recorder?.active ?? false,
  tick: window.__DEBUG?.game?.tick ?? null,
}));

const listReplays = (page) => page.evaluate(async () => (await window.__COT_REPLAY.list()).map((r) => ({ id: r.id, ticks: r.ticks, bytes: r.bytes, result: r.result })));

/** The viewer's state as the page shows it: the bar, its clock and note, the play button, a hull's position. */
export const viewerState = (page) => page.evaluate(() => {
  const bar = document.querySelector('.cot-replay');
  const tank = window.__DEBUG?.game?.tanks?.find((hull) => hull && !hull.combat?.destroyed) ?? null;
  return {
    bar: !!bar,
    hidden: bar ? bar.hidden || bar.offsetParent === null : null,
    clock: bar?.querySelector('.tm')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    note: bar?.querySelector('.note')?.textContent ?? null,
    playEnabled: bar ? !bar.querySelector('.play')?.disabled : false,
    playLabel: bar?.querySelector('.play')?.getAttribute('aria-label') ?? null,
    speed: bar?.querySelector('.speed')?.textContent ?? null,
    playhead: bar?.querySelector('.ph')?.style.left ?? null,
    phase: window.__DEBUG?.game?.phase ?? null,
    jobs: (window.__replayIndexJobs ?? []).map((job) => job.reply),
    tank: tank ? { id: tank.id, x: +(tank.state?.pos?.x ?? tank.position?.x ?? 0).toFixed(2), z: +(tank.state?.pos?.z ?? tank.position?.z ?? 0).toFixed(2) } : null,
  };
});

const seconds = (clock) => {
  const m = /(\d+):(\d+)\s*\/\s*(\d+):(\d+)/.exec(clock ?? '');
  return m ? { now: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] } : null;
};

/** The viewer opened by whatever the path clicked: it must index, enable Play, run at 4x and reach the end. */
async function watchToEnd(page, shot, log) {
  const opened = Date.now();
  let state = null;
  while (Date.now() - opened < 60_000) {
    state = await viewerState(page);
    if (state.bar) break;
    await sleep(500);
  }
  log.push({ at: 'bar', ms: Date.now() - opened, state });
  if (!state?.bar) return { ok: false, why: 'no replay bar appeared within 60 s of Watch' };
  await shot('viewer-opened');
  while (Date.now() - opened < 240_000) {
    state = await viewerState(page);
    if (state.playEnabled) break;
    await sleep(500);
  }
  log.push({ at: 'transport', ms: Date.now() - opened, state });
  if (!state.playEnabled) return { ok: false, why: `the transport never enabled (note: ${JSON.stringify(state.note)}, clock ${state.clock})` };
  await shot('viewer-ready');
  // Play at 4x: the speed button cycles 0.25, 0.5, 1, 2, 4
  for (let i = 0; i < 5 && state.speed !== '4×'; i++) { await clickVisible(page, '.cot-replay .speed'); state = await viewerState(page); }
  if (!/pause/i.test(state.playLabel ?? '')) await clickVisible(page, '.cot-replay .play');
  const first = await viewerState(page);
  const span = seconds(first.clock);
  if (!span || span.end < 5) return { ok: false, why: `the replay's length reads ${first.clock}` };
  log.push({ at: 'play', ms: Date.now() - opened, state: first });
  const started = Date.now();
  let last = first, moved = false, midShot = false;
  while (Date.now() - started < (span.end / 4 + 60) * 1000) {
    await sleep(1000);
    last = await viewerState(page);
    if (last.tank && first.tank && last.tank.id === first.tank.id && Math.hypot(last.tank.x - first.tank.x, last.tank.z - first.tank.z) > 0.5) moved = true;
    const at = seconds(last.clock);
    if (!midShot && at && at.now >= span.end / 2) { midShot = true; await shot('viewer-mid'); }
    if (at && at.now >= at.end) break;
  }
  log.push({ at: 'end', ms: Date.now() - opened, state: last, moved });
  await shot('viewer-end');
  const end = seconds(last.clock);
  if (last.note) return { ok: false, why: `the viewer said "${last.note}" (indexer: ${JSON.stringify(last.jobs)})` };
  if (!end || end.now < end.end) return { ok: false, why: `playback stopped at ${last.clock} (note ${JSON.stringify(last.note)})` };
  if (!moved) return { ok: false, why: 'the clock ran but no hull moved' };
  return { ok: true, why: `played ${span.end} s to the end at 4x in ${((Date.now() - started) / 1000).toFixed(1)} s` };
}

/** The saved recording `id`'s file, as stored, beside the receipt (tools/replay-verify.mjs reads it). */
async function keepRecording(page, id, out, name) {
  const bytes = await page.evaluate(async (key) => Array.from(await window.__COT_REPLAY.load(key) ?? []), id);
  if (bytes.length) writeFileSync(path.join(out, `${name}-recording.cotreplay`), Buffer.from(bytes));
}

/** Leave the viewer to the Garage by its own Leave. */
async function leaveViewer(page) {
  await clickVisible(page, '.cot-replay .leave');
  await page.waitForFunction(readinessExpression('garage'), { timeout: 120_000, polling: 250 });
}

async function pathA(page, options, shot, log) {
  await enterBattle(page);
  log.push({ at: 'battle', recorder: await recorderState(page) });
  await drive(page, options.seconds);
  log.push({ at: 'driven', recorder: await recorderState(page) });
  await shot('battle');
  return openSavedReplay(page, options, shot, log);
}

/** From a live battle: leave it as the player does, then watch its recording from the Service Record's Replays tab. */
export async function openSavedReplay(page, options, shot, log) {
  // leave as the player does: Esc opens Settings, its Leave (and a confirm, if one asks)
  await page.keyboard.press('Escape');
  await sleep(800);
  if (!(await clickVisible(page, '.cot-set-btn.leave'))) throw new Error('Settings showed no Leave');
  await sleep(600);
  await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('button')].find((b) => b.offsetParent && /^(leave|confirm|yes)/i.test(b.textContent.trim())
      && !b.classList.contains('cot-set-btn'));
    confirm?.click();
  });
  await page.waitForFunction(readinessExpression('garage'), { timeout: 120_000, polling: 250 });
  await sleep(1500);
  const saved = await listReplays(page);
  log.push({ at: 'garage', saved });
  if (!saved.length) return { ok: false, why: 'no recording was saved after leaving the battle' };
  await keepRecording(page, saved[0].id, options.out, 'A');
  await page.keyboard.press('KeyR');
  await page.waitForSelector('[data-record-tab="replays"]', { visible: true, timeout: 30_000 });
  await clickVisible(page, '[data-record-tab="replays"]');
  try { await page.waitForSelector('[data-replay-watch]', { visible: true, timeout: 30_000 }); } catch {
    await shot('record-replays');
    return { ok: false, why: 'the Replays tab listed no Watch button' };
  }
  await shot('record-replays');
  if (!options.openOnly) {
    // Download replay from the row: the page's own Blob download from the click, caught where the browser saves it
    const downloads = path.join(options.out, 'downloads');
    mkdirSync(downloads, { recursive: true });
    // (each path's page is in a browser context of its own: the download behaviour is set for that context)
    const cdp = await page.browser().target().createCDPSession();
    const contextId = page.browserContext().id;
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, ...(contextId ? { browserContextId: contextId } : {}) });
    await clickVisible(page, '[data-replay-download]');
    const until = Date.now() + 15_000;
    let file = null;
    while (!file && Date.now() < until) {
      await sleep(250);
      file = readdirSync(downloads).find((name) => name.endsWith('.cotreplay')) ?? null;
    }
    log.push({ at: 'download', file, bytes: file ? statSync(path.join(downloads, file)).size : null });
    if (!file) return { ok: false, why: 'Download replay saved no .cotreplay file' };
  }
  await clickVisible(page, '[data-replay-watch]');
  if (options.openOnly) return { ok: true, why: 'opened' };
  const result = await watchToEnd(page, shot, log);
  if (result.ok) await leaveViewer(page);
  return result;
}

/** A file through Open replay file (the browser's own file chooser from the button's press). */
export async function openReplayFile(page, file) {
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 15_000 }), clickVisible(page, '.cot-record-replays-head [data-replay-open]')]);
  await chooser.accept([file]);
}
const importNote = (page) => page.evaluate(() => document.querySelector('.cot-record-replays-note')?.textContent ?? null);

/** C: on a fresh profile, path A's downloaded file opened from the Replays tab plays to its end; a file that is not a
 *  replay and one of another format say so in the tab, entering nothing. */
async function pathC(page, options, shot, log) {
  const downloads = path.join(options.out, 'downloads');
  const name = existsSync(downloads) ? readdirSync(downloads).find((entry) => entry.endsWith('.cotreplay')) : null;
  if (!name) return { ok: false, why: 'no downloaded replay to open (path C follows path A)' };
  const good = path.join(downloads, name);
  const notReplay = path.join(options.out, 'C-not-a-replay.cotreplay');
  writeFileSync(notReplay, 'this is not a replay');
  const packed = readFileSync(good);
  const raw = packed[0] === 0x1f && packed[1] === 0x8b ? gunzipSync(packed) : packed;
  const future = Buffer.from(raw); future[4] += 1;
  const otherFormat = path.join(options.out, 'C-other-format.cotreplay');
  writeFileSync(otherFormat, future);
  await page.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 250 });
  await page.keyboard.press('KeyR');
  await page.waitForSelector('[data-record-tab="replays"]', { visible: true, timeout: 30_000 });
  await clickVisible(page, '[data-record-tab="replays"]');
  await page.waitForSelector('.cot-record-replays-head [data-replay-open]', { visible: true, timeout: 30_000 });
  for (const [file, tag, expected] of [[notReplay, 'not-replay', /isn't a Claude of Tanks replay/], [otherFormat, 'other-format', /format \d+/]]) {
    await openReplayFile(page, file);
    try { await page.waitForFunction(() => !!document.querySelector('.cot-record-replays-note'), { timeout: 15_000 }); } catch { /* read below */ }
    const note = await importNote(page);
    log.push({ at: `refuse-${tag}`, note, phase: await page.evaluate(() => window.__DEBUG?.game?.phase ?? null) });
    await shot(`refused-${tag}`);
    if (!note || !expected.test(note)) return { ok: false, why: `a ${tag} file said ${JSON.stringify(note)}` };
  }
  log.push({ at: 'open', file: name, bytes: packed.length });
  await openReplayFile(page, good);
  const result = await watchToEnd(page, shot, log);
  if (result.ok) await leaveViewer(page);
  return result;
}

async function pathB(page, options, shot, log) {
  await enterBattle(page);
  log.push({ at: 'battle', recorder: await recorderState(page) });
  await drive(page, options.seconds);
  // the battle's clock runs out a few seconds on (the debug surface's game; the rule the step reads, a timeout result)
  await page.evaluate(() => {
    const game = window.__DEBUG.game;
    game.ruleset = Object.freeze({ ...game.ruleset, timeLimitS: Math.ceil(game.timeS) + 3 });
  });
  log.push({ at: 'driven', recorder: await recorderState(page) });
  try {
    await page.waitForSelector('.cot-es.show [data-action="replay"], .cot-es.show .es-replay-actions button', { visible: true, timeout: 120_000 });
  } catch {
    await shot('end-screen');
    const actions = await page.evaluate(() => [...document.querySelectorAll('.cot-es.show button')].map((b) => b.textContent.trim()));
    return { ok: false, why: `the end screen offered no Watch replay (actions: ${JSON.stringify(actions)})` };
  }
  await shot('end-screen');
  if (!(await clickVisible(page, '.cot-es.show .es-replay-actions button'))) return { ok: false, why: 'Watch replay could not be pressed' };
  // (Watch replay saves the battle first: the newest saved recording is this one)
  await sleep(1500);
  const saved = await listReplays(page);
  log.push({ at: 'saved', saved });
  if (saved.length) await keepRecording(page, saved[0].id, options.out, 'B');
  return watchToEnd(page, shot, log);
}

/** The battle pool as Node builds it (rosterState.spawnTanks): the page's must be the same, id for id (a seeded draw over
 *  another order is another roster, the indexer's refusal of live 276). */
function nodeBattlePool() {
  const game = createGameState({});
  spawnTanks(game, { scene: { remove() {} } });
  return game.allTanks.map((entity) => entity.id);
}

export async function runFlow(options) {
  mkdirSync(options.out, { recursive: true });
  const receipt = { tool: TOOL, at: new Date().toISOString(), options: { ...options }, paths: {}, errors: [], replayLog: [], pool: null };
  const nodePool = nodeBattlePool();
  let server = null, browser = null;
  try {
    let origin = options.url;
    if (!origin) {
      say(options.dist ? `preview ${options.dist} on ${options.port}` : `dev server on ${options.port}`);
      server = await startViteChild(options.dist ? { mode: 'preview', outDir: options.dist, port: options.port } : { mode: 'dev', port: options.port });
      origin = server.url;
    }
    receipt.origin = origin;
    browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: options.width, height: options.height }));
    say(`browser pid ${browser.process()?.pid ?? '?'}`);
    for (const name of options.paths) {
      // each path on a fresh profile: no saved replays, nothing warm
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument(WATCH_INDEXER);
      page.on('pageerror', (error) => receipt.errors.push({ path: name, kind: 'pageerror', text: String(error?.message ?? error) }));
      page.on('console', (message) => {
        const text = message.text();
        if (text.includes('[replay]') || text.includes('replay index')) receipt.replayLog.push({ path: name, type: message.type(), text });
        else if (message.type() === 'error') receipt.errors.push({ path: name, kind: 'console', text: text.slice(0, 400) });
      });
      const shot = async (tag) => {
        try { await page.screenshot({ path: path.join(options.out, `${name}-${tag}.png`) }); } catch (error) { say(`still ${tag}: ${error.message}`); }
      };
      const log = [];
      say(`path ${name}: boot`);
      await page.goto(`${origin}/?${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      await page.waitForFunction(BOOT_LOADED_EXPRESSION, { timeout: 300_000 });
      if (!receipt.pool) {
        const pagePool = await page.evaluate(() => window.__DEBUG?.game?.allTanks?.map((entity) => entity.id) ?? null);
        let at = 0;
        while (pagePool && at < Math.max(pagePool.length, nodePool.length) && pagePool[at] === nodePool[at]) at++;
        receipt.pool = { hulls: nodePool.length, same: !!pagePool && at === nodePool.length && pagePool.length === nodePool.length,
          partsAt: pagePool && at < Math.max(pagePool.length, nodePool.length) ? at : null };
        say(`battle pool: ${receipt.pool.same ? 'the page\'s is Node\'s' : `the page's parts from Node's at ${receipt.pool.partsAt}`}`);
      }
      let result;
      try { result = await ({ A: pathA, B: pathB, C: pathC })[name](page, options, shot, log); } catch (error) {
        await shot('error');
        result = { ok: false, why: `threw: ${error.message}` };
      }
      receipt.paths[name] = { ...result, log };
      say(`path ${name}: ${result.ok ? 'PASS' : 'FAIL'} ${result.why}`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close();
  }
  receipt.pass = !!receipt.pool?.same && options.paths.every((name) => receipt.paths[name]?.ok);
  writeFileSync(path.join(options.out, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  say(`${receipt.pass ? 'PASS' : 'FAIL'} → ${path.join(options.out, 'receipt.json')}`);
  return receipt;
}

if (isMainModule(import.meta.url)) {
  const options = parseFlowArgs(process.argv.slice(2));
  const hold = await openCaptureHold({ label: TOOL, lockClass: 'render', timeoutMs: 45 * 60_000 });
  let code = 1;
  try { code = (await runFlow(options)).pass ? 0 : 1; } catch (error) { console.error(`[${TOOL}] ${error.stack ?? error}`); } finally { await hold.release(); }
  process.exit(code);
}
