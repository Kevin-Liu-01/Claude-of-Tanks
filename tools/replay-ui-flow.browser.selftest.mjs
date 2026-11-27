#!/usr/bin/env node
/**
 * The replay system as a player meets it (replay-fixes-277, docs/REPLAY.md): a page on a fresh profile, a solo battle
 * entered from the Garage's own Deploy key and driven with real keys, then each way the game offers to watch it:
 *
 *   A  leave from Settings, open the Service Record (R), its Replays tab, the newest row's Watch;
 *   B  a second battle ended by its clock, the end screen's Watch replay;
 *   C  A's file, saved by the row's Download replay, opened on a fresh profile through Open replay file (a file that is
 *      not a replay and one of another format first: each says why in the tab and enters nothing);
 *   D  (asked for: --paths=...,D) a battle's replay filmed to an MP4 through the strip's Export video and its dialog
 *      (--film=1280x720@30:30, --hud=1 for Include HUD) and read back (ffprobe where installed): H.264 at the size
 *      asked, as long as the range; its size and export time in the receipt.
 *   E  (asked for: --paths=...,E; replay-receipts-279 r2) a battle's recording watched from the Service Record, its
 *      replay bar's Leave pressed while the replay's battle still loads (the app lifecycle 'loading' at the press): the
 *      page lands in the Garage with no dialog and no page error. Live 278: "The battle could not start: Solo battle
 *      deployment was superseded" answered the player's own Leave. --cancel=0 (dev server only) is its control: the
 *      served main.ts with the Leave's cancel removed (one replacement, or the path throws) must fail by that dialog.
 *
 * The built page's battle pool (game.allTanks) must be Node's, id for id. Each path must reach a viewer that shows no
 * notice and whose transport enables; then what is DRAWN must be the battle (drawnMotion: paused at three moments, every
 * shown hull's visual where the track puts it, every hull the track moves moved as far on screen, and the picture riding
 * the busiest hull 10 s apart changed; Kevin 11-25, "no one is actually moving": the 276 viewer posed the data and drew
 * the setup); then its clock runs when Play is pressed (at 4x) and it plays to the recording's end. A film (D) must
 * change as much between its frames 10 s apart. Every replay indexer Worker's reply is kept (the problem it named), and
 * each recording is saved beside the receipt for tools/replay-verify.mjs. Live 276: Kevin, "the replays
 * dont actually work": the indexer's Worker drew another roster than the page had recorded and refused the replay
 * ("This replay can't be played."), while the Node round trip and the recorder's browser check both passed.
 *
 *   node tools/replay-ui-flow.browser.selftest.mjs [--dist=<built dist> | --url=<origin>] [--out=<dir>] [--port=4238]
 *     [--seconds=20] [--paths=A,B,C[,D]] [--film=1280x720@30:30] [--hud=1] [--map=<id>] [--raise=0] [--cancel=0]
 *
 * (replay-receipts-279) The drive raises the gun before it fires (drive below; --raise=0 is the 278 drive, the control), so
 * a shell always flies long enough for the track to sample it, and the effects gate also reads the indexer's own track
 * census (shell entries in the track > 0) beside the shells drawn. --map enters that map (the 278 failures: cliffbridge,
 * ruinspires, steppe, foundry, titan_gorge) through the debug surface's solo start.
 *
 * --dist serves a build (vite preview), --url opens a running origin, and with neither it starts a dev server. Takes the shared
 * capture lock (render class; nests in a with-capture-lock hold): the manual `browser` suite's
 * (npm run test:heavy -- browser). One browser and one vite child, both stopped by their own handles. Exit 0 on PASS, 1 on
 * FAIL. First-party tooling: Kevin B. Liu.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold, startViteChild } from './capture-hold.mjs';
import { isMainModule, mapProbeLaunchOptions, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION, readinessExpression } from './game-readiness.mjs';
import { createGameState } from '../src/game/stateCore.ts';
import { WATCH_INDEXER, clickVisible, drive, enterBattle, leaveBattle } from './replay-flow.test-support.mjs';
import { spawnTanks } from '../src/game/rosterState.ts';

const TOOL = 'replay-ui-flow';
const QUERY = 'nosplash=1&tier=desktop&gfxreset=1';


export function parseFlowArgs(argv) {
  const out = { out: null, dist: null, port: 4238, seconds: 20, paths: ['A', 'B', 'C'], url: null, film: null, hud: false, width: 1600, height: 900,
    map: null, raise: true, cancel: true };
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    if (m[1] === 'out') out.out = path.resolve(m[2]);
    else if (m[1] === 'dist') out.dist = m[2];
    else if (m[1] === 'port') out.port = Number(m[2]);
    else if (m[1] === 'seconds') out.seconds = Number(m[2]);
    else if (m[1] === 'paths') out.paths = m[2].split(',').filter((p) => ['A', 'B', 'C', 'D', 'E'].includes(p));
    else if (m[1] === 'url') out.url = m[2].replace(/\/$/, '');
    // D's film: <width>x<height>@<fps>:<seconds> (default 1280x720@30:30)
    else if (m[1] === 'film') out.film = m[2];
    else if (m[1] === 'hud') out.hud = m[2] === '1' || m[2] === 'true';
    // (replay-receipts-279) a battle on this map (entered through the debug surface's solo start), and --raise=0: the
    // drive fires with its gun down as before 279 (the control for the gun raise)
    else if (m[1] === 'map') out.map = m[2];
    else if (m[1] === 'raise') out.raise = !(m[2] === '0' || m[2] === 'false');
    // (279 r2) --cancel=0: E's control, the Leave's cancel removed from the served main.ts
    else if (m[1] === 'cancel') out.cancel = !(m[2] === '0' || m[2] === 'false');
    else throw new Error(`unknown flag --${m[1]}`);
  }
  out.out ??= mkdtempSync(path.join(tmpdir(), 'replay-ui-flow-'));
  if (!out.paths.length) throw new Error('--paths takes A, B, C, D and/or E');
  if (!out.cancel && (out.dist || out.url)) throw new Error('--cancel=0 edits the served main.ts: a dev server only (no --dist or --url)');
  return out;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const say = (line) => console.log(`[${TOOL}] ${stamp()} ${line}`);




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
/** In-page: three animation frames (the presentation draws what the last seek posed). */
const frames = (page, n = 3) => page.evaluate((count) => new Promise((done) => {
  let left = count;
  const tick = () => { if (--left <= 0) done(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), n);

/** The fraction of pixels (160 x 90, luminance) two screenshots differ in by more than 24 levels, decoded in the page. */
const pixelChange = (page, a, b) => page.evaluate(async (first, second) => {
  const load = (data) => new Promise((done, fail) => { const img = new Image(); img.onload = () => done(img); img.onerror = fail; img.src = `data:image/png;base64,${data}`; });
  const luma = (img) => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 160, 90);
    const d = ctx.getImageData(0, 0, 160, 90).data; const out = new Float32Array(160 * 90);
    for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return out;
  };
  const [x, y] = [luma(await load(first)), luma(await load(second))];
  let changed = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 24) changed++;
  return changed / x.length;
}, a, b);

/**
 * (replay-fixes-277, Kevin 11-25 "no one is actually moving") What is DRAWN must be the battle: paused, at three moments,
 * every shown hull's visual sits where the track (the recording re-simulated) puts it; every hull the track moves more
 * than 3 m between the first and last moment moves as far on screen (at least three such hulls); and riding the hull
 * that moves most, the picture 10 s apart differs in at least 3% of its pixels. A frozen replay fails all three (its
 * hulls drawn at their setup poses while the posed data moved: the 276 viewer).
 */
async function drawnMotion(page, shot, log) {
  const probe = () => page.evaluate(() => {
    const p = window.__COT_REPLAY.viewer?.();
    return p ? { timeS: p.timeS, durationS: p.durationS, hulls: p.hulls } : null;
  });
  const seek = async (t) => { await page.evaluate((at) => window.__COT_REPLAY.viewer?.()?.seek(at), t); await frames(page); await sleep(150); await frames(page); };
  const first = await probe();
  if (!first) return { ok: false, why: 'the viewer offers no probe (no track)' };
  if (/pause/i.test(await page.evaluate(() => document.querySelector('.cot-replay .play')?.getAttribute('aria-label') ?? ''))) await clickVisible(page, '.cot-replay .play');
  const D = first.durationS;
  const moments = [0.15 * D, 0.5 * D, 0.85 * D];
  const reads = [];
  for (const t of moments) { await seek(t); reads.push(await probe()); }
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  let worst = { error: 0, id: null, t: null };
  for (const read of reads) for (const hull of read.hulls) {
    if (!hull.visible || !hull.drawn || !hull.track) continue;
    const error = flat(hull.drawn, hull.track);
    if (error > worst.error) worst = { error, id: hull.id, t: read.timeS };
  }
  const movers = [];
  for (const hull of reads[0].hulls) {
    const last = reads[2].hulls.find((entry) => entry.id === hull.id);
    if (!hull.track || !last?.track || !hull.drawn || !last.drawn) continue;
    const trackMove = flat(hull.track, last.track), drawnMove = flat(hull.drawn, last.drawn);
    if (trackMove > 3) movers.push({ id: hull.id, trackMove: +trackMove.toFixed(2), drawnMove: +drawnMove.toFixed(2) });
  }
  const lagging = movers.filter((m) => Math.abs(m.drawnMove - m.trackMove) > 1.5);
  // the picture: riding the hull that moves most, 10 s apart (or the span's ends), the HUD's bands cropped out
  movers.sort((a, b) => b.trackMove - a.trackMove);
  let change = null;
  if (movers.length) {
    await page.evaluate((id) => window.__COT_REPLAY.viewer?.()?.ride(id), movers[0].id);
    const t1 = Math.max(0.5, Math.min(D * 0.15, D - 11)), t2 = Math.min(D - 0.2, t1 + 10);
    const vp = page.viewport();
    const clip = { x: 0, y: Math.round(vp.height * 0.3), width: vp.width, height: Math.round(vp.height * 0.45) };
    await seek(t1); await sleep(1500); await frames(page);
    const a = await page.screenshot({ clip, encoding: 'base64' });
    await shot('drawn-a');
    await seek(t2); await sleep(1500); await frames(page);
    const b = await page.screenshot({ clip, encoding: 'base64' });
    await shot('drawn-b');
    change = await pixelChange(page, a, b);
  }
  const result = { moments: reads.map((r) => +r.timeS.toFixed(2)), worst: { ...worst, error: +worst.error.toFixed(3) }, movers: movers.length, lagging, change };
  log.push({ at: 'drawn', ...result });
  if (worst.error > 0.75) return { ok: false, why: `hull ${worst.id} is drawn ${worst.error.toFixed(2)} m from its track at ${worst.t?.toFixed(1)} s` };
  if (movers.length < 3) return { ok: false, why: `only ${movers.length} hulls move more than 3 m in the track` };
  if (lagging.length) return { ok: false, why: `${lagging.length} hulls are not drawn where the track moves them: ${JSON.stringify(lagging.slice(0, 3))}` };
  if (change === null || change < 0.03) return { ok: false, why: `the picture riding ${movers[0].id} changed in ${((change ?? 0) * 100).toFixed(2)}% of pixels over 10 s` };
  await seek(0);
  return { ok: true };
}

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
  const drawn = await drawnMotion(page, shot, log);
  if (!drawn.ok) return { ok: false, why: `drawn: ${drawn.why}` };
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
  // (replay-fixes-277 part 2) the battle's effects played: the cues a whole play crosses (the receipt's own drive fires
  // every 2 s, so a battle has shots), and shells drawn in flight
  const effects = await page.evaluate(() => { const p = window.__COT_REPLAY.viewer?.(); return p ? { played: p.cuesPlayed, total: p.cuesTotal, shellsPeak: p.shellsPeak } : null; });
  log.push({ at: 'effects', ...effects });
  if (!effects || effects.total === 0) return { ok: false, why: 'the replay holds no effects (no shot, hit or kill cue)' };
  if (effects.played < effects.total * 0.9) return { ok: false, why: `a whole play crossed ${effects.played} of ${effects.total} cues` };
  // (replay-receipts-279) the track's census as the indexer replied (shells in the track at all), beside what is drawn
  const census = [...(last.jobs ?? [])].reverse().find((reply) => reply?.type === 'done') ?? null;
  log.push({ at: 'track-census', samples: census?.samples ?? null, shellSamples: census?.shellSamples ?? null, shellEntries: census?.shellEntries ?? null });
  if (!census || !(census.shellEntries > 0)) return { ok: false, why: `the indexer's track holds no shell in flight (${census?.shellSamples ?? 0} of ${census?.samples ?? 0} samples)` };
  if (effects.shellsPeak === 0) return { ok: false, why: 'no shell was drawn in flight' };
  return { ok: true, why: `played ${span.end} s to the end at 4x in ${((Date.now() - started) / 1000).toFixed(1)} s (${effects.played} cues, up to ${effects.shellsPeak} shells drawn, ${census.shellSamples} of ${census.samples} track samples with a shell)` };
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

/**
 * (279 r2) E's control: the page's main.ts as the dev server serves it, with the Leave's cancel of the solo entry in
 * flight removed (the code before r2). Exactly one call is replaced, or the control has not reverted what it names.
 */
async function revertLeaveCancel(page) {
  const state = { replaced: null };
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname !== '/src/main.ts') { void request.continue(); return; }
    void (async () => {
      // (no conditional headers: a 304 would carry no body to edit)
      const served = await fetch(url, { headers: { accept: '*/*' } });
      const body = await served.text();
      const parts = body.split('soloBattleEntry.cancel()');
      state.replaced = parts.length - 1;
      await request.respond({ status: served.status, contentType: served.headers.get('content-type') ?? 'text/javascript', body: parts.join('void 0') });
    })().catch((error) => { state.replaced = `error: ${error.message}`; void request.abort(); });
  });
  return state;
}

/** Any modal dialog shown now, by its title. */
const shownDialogs = (page) => page.evaluate(() => [...document.querySelectorAll('.cot-modal-root:not([hidden])')]
  .map((root) => root.querySelector('.cot-modal__title')?.textContent?.trim() ?? '(untitled)'));

/** E: a recording watched, its replay bar's Leave pressed while the replay's battle still loads. */
async function pathE(page, options, shot, log) {
  await enterBattle(page, options.map);
  await drive(page, Math.min(options.seconds, 8), { raise: options.raise });
  const opened = await openSavedReplay(page, { ...options, openOnly: true }, shot, log);
  if (!opened.ok) return opened;
  // the Leave as soon as the replay bar shows it, the replay's battle still loading
  const until = Date.now() + 60_000;
  let pressed = null;
  const entered = ['countdown', 'live', 'verdict', 'report'];
  while (Date.now() < until) {
    pressed = await page.evaluate(() => {
      const state = window.__APP_LIFECYCLE?.state ?? null;
      const leave = [...document.querySelectorAll('.cot-replay .leave')].find((el) => el.offsetParent);
      if (!leave || state !== 'loading') return { state, leave: !!leave, clicked: false };
      leave.click();
      return { state, leave: true, clicked: true };
    });
    // pressed, or the replay's battle entered before its Leave could be pressed in the load: either ends the wait
    if (pressed.clicked || entered.includes(pressed.state)) break;
    await sleep(50);
  }
  log.push({ at: 'leave', pressed });
  if (!pressed?.clicked) return { ok: false, why: `the replay bar's Leave never showed while the battle loaded (${JSON.stringify(pressed)})` };
  await shot('left-loading');
  try { await page.waitForFunction(readinessExpression('garage'), { timeout: 60_000, polling: 250 }); } catch {
    await shot('landed');
    return { ok: false, why: 'the Leave during the load never reached the Garage' };
  }
  await sleep(3000);
  const dialogs = await shownDialogs(page);
  await shot('landed');
  log.push({ at: 'landed', dialogs, state: await page.evaluate(() => window.__APP_LIFECYCLE?.state ?? null) });
  if (dialogs.length) return { ok: false, why: `a Leave during the load landed under a dialog: ${dialogs.map((d) => `"${d}"`).join(', ')}` };
  return { ok: true, why: 'the Leave during the load landed in the Garage with no dialog' };
}

async function pathA(page, options, shot, log) {
  await enterBattle(page, options.map);
  log.push({ at: 'battle', recorder: await recorderState(page), map: await page.evaluate(() => window.__DEBUG?.game?.mapId ?? null) });
  const shots = [];
  await drive(page, options.seconds, { raise: options.raise, shots });
  log.push({ at: 'driven', recorder: await recorderState(page), raise: options.raise, shots });
  await shot('battle');
  return openSavedReplay(page, options, shot, log);
}

/** From a live battle: leave it as the player does, then watch its recording from the Service Record's Replays tab. */
export async function openSavedReplay(page, options, shot, log) {
  await leaveBattle(page);
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

/** The fraction of pixels (160 x 90 luminance, ffmpeg) two frames of a film differ in by > 24 levels; null without ffmpeg. */
function filmChange(file, atS, bS) {
  const frame = (t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=160:90,format=gray',
    '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  try {
    const a = frame(atS), b = frame(bS);
    let changed = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (Math.abs(a[i] - b[i]) > 24) changed++;
    return changed / Math.max(1, Math.min(a.length, b.length));
  } catch { return null; }
}

/** The MP4 a film saved: its size, and (where ffprobe is installed) its codec, size, rate and length as a player reads them. */
function probeFilm(file) {
  const head = readFileSync(file).subarray(0, 12);
  const probe = { bytes: statSync(file).size, ftyp: head.subarray(4, 8).toString('latin1') };
  try {
    const json = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=codec_name,profile,width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
    probe.stream = json.streams?.[0] ?? null;
    probe.durationS = Number(json.format?.duration);
  } catch (error) { probe.ffprobe = String(error.message ?? error).slice(0, 200); }
  return probe;
}

/** D: a battle long enough for the film, its replay opened from the Service Record, its playhead put `seconds` before
 *  the end on the strip's timeline, then Export video pressed on the strip and the dialog filled as a player fills it
 *  (the size, the rate, "From here", Include HUD with --hud=1) and Export pressed; the MP4 the page saves (a Blob through
 *  an anchor) is read back: H.264 at the size and rate asked, `seconds` long. */
async function pathD(page, options, shot, log) {
  const [size, rest] = (options.film ?? '1280x720@30:30').split('@');
  const [width, height] = size.split('x').map(Number);
  const [fps, seconds] = rest.split(':').map(Number);
  await enterBattle(page, options.map);
  await drive(page, Math.max(options.seconds, seconds + 6), { raise: options.raise });
  const opened = await openSavedReplay(page, { ...options, openOnly: true }, shot, log);
  if (!opened.ok) return opened;
  await page.waitForFunction(() => { const b = document.querySelector('.cot-replay .play'); return b && !b.disabled; }, { timeout: 240_000 });
  // the playhead `seconds` before the end: a press on the strip's timeline (the strip woken by the pointer first)
  await page.mouse.move(400, 400);
  await page.mouse.move(420, 410);
  const length = seconds_(await page.evaluate(() => document.querySelector('.cot-replay .tm')?.textContent ?? ''));
  if (!length || length.end < seconds + 1) return { ok: false, why: `the replay is ${length?.end ?? '?'} s, shorter than the ${seconds} s film` };
  const track = await page.evaluate(() => { const r = document.querySelector('.cot-replay .tk').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
  await page.mouse.click(track.x + track.w * ((length.end - seconds - 0.4) / length.end), track.y);
  await sleep(300);
  if (/pause/i.test(await page.evaluate(() => document.querySelector('.cot-replay .play')?.getAttribute('aria-label') ?? ''))) await clickVisible(page, '.cot-replay .play');
  // ride the player's tank (it drove the whole battle), so the film's picture follows a moving hull
  await page.evaluate(() => { const p = window.__COT_REPLAY.viewer?.(); if (p?.hulls[0]) p.ride(p.hulls[0].id); });
  await sleep(1500);
  await shot('before-export');
  // Export video on the strip: a real press on its button
  const film = await page.evaluate(() => { const r = document.querySelector('.cot-replay .film')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
  if (!film) return { ok: false, why: 'the strip has no Export video button' };
  await page.mouse.move(film.x, film.y);
  await page.mouse.click(film.x, film.y);
  try { await page.waitForSelector('.cot-replay-film .cot-replay-film-size', { visible: true, timeout: 30_000 }); } catch { return { ok: false, why: 'Export video opened no dialog' }; }
  const sizeId = height >= 1080 ? '1080p' : '720p';
  await clickVisible(page, `.cot-replay-film-size [data-value="${sizeId}"]`);
  await clickVisible(page, `.cot-replay-film-fps [data-value="${fps}"]`);
  await clickVisible(page, '.cot-replay-film-range [data-value="here"]');
  if (options.hud) await clickVisible(page, '.cot-replay-film input[name="hud"]');
  await page.waitForFunction(() => { const b = document.querySelector('.cot-replay-film .cot-modal__footer .cot-c-btn--primary'); return b && !b.disabled; }, { timeout: 30_000 })
    .catch(() => {});
  const dialog = await page.evaluate(() => ({
    notes: [...document.querySelectorAll('.cot-replay-film .note')].map((n) => n.textContent).filter(Boolean),
    disabled: document.querySelector('.cot-replay-film .cot-modal__footer .cot-c-btn--primary')?.disabled ?? null,
  }));
  await shot('dialog');
  if (dialog.disabled) return { ok: false, why: `Export stayed off: ${JSON.stringify(dialog.notes)}` };
  const downloads = path.join(options.out, 'films');
  mkdirSync(downloads, { recursive: true });
  const cdp = await page.browser().target().createCDPSession();
  const contextId = page.browserContext().id;
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, ...(contextId ? { browserContextId: contextId } : {}) });
  const started = Date.now();
  await clickVisible(page, '.cot-replay-film .cot-modal__footer .cot-c-btn--primary');
  let file = null;
  for (const until = Date.now() + 15 * 60_000; !file && Date.now() < until;) {
    await sleep(500);
    file = readdirSync(downloads).find((name) => name.endsWith('.mp4')) ?? null;
  }
  const exportMs = Date.now() - started;
  await sleep(800);
  await page.waitForFunction(() => /\.mp4/.test(document.querySelector('.cot-replay-film [data-note="status"]')?.textContent ?? ''), { timeout: 15_000 }).catch(() => {});
  const done = await page.evaluate(() => [...document.querySelectorAll('.cot-replay-film .note')].map((n) => n.textContent).filter(Boolean));
  await shot('after-film');
  const probe = file ? probeFilm(path.join(downloads, file)) : null;
  log.push({ at: 'film', request: { width, height, fps, seconds, hud: options.hud }, dialog, done, exportMs, file, probe });
  if (!file) return { ok: false, why: `no MP4 was saved (${JSON.stringify(done)})` };
  if (!done.some((line) => line.includes(file))) return { ok: false, why: `the dialog did not say the film was saved (${JSON.stringify(done)})` };
  if (probe.ftyp !== 'ftyp') return { ok: false, why: `the file is not an MP4 (box ${probe.ftyp})` };
  const stream = probe.stream;
  if (stream) {
    if (stream.codec_name !== 'h264' || stream.width !== width || stream.height !== height) return { ok: false, why: `the film reads as ${JSON.stringify(stream)}` };
    // (the playhead is set by a press on the timeline, read back in whole seconds: the range starts within ~1 s of it)
    if (Math.abs(probe.durationS - seconds) > 1.5) return { ok: false, why: `the film runs ${probe.durationS} s, not ~${seconds} s` };
  }
  // what the film shows must be the battle moving: its frames 10 s apart differ in >= 3% of their pixels (decoded small)
  const change = filmChange(path.join(downloads, file), 2, 12);
  log.push({ at: 'film-change', change });
  if (change !== null && change < 0.03) return { ok: false, why: `the film's frames at 2 s and 12 s differ in ${(change * 100).toFixed(2)}% of pixels` };
  return { ok: true, why: `${probe.durationS ?? '?'} s at ${width}x${height}@${fps}${options.hud ? ' with the HUD' : ''}: ${(probe.bytes / 1e6).toFixed(2)} MB, exported in ${(exportMs / 1000).toFixed(1)} s` };
}
const seconds_ = (clock) => {
  const m = /(\d+):(\d+)\s*\/\s*(\d+):(\d+)/.exec(clock ?? '');
  return m ? { now: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] } : null;
};

async function pathB(page, options, shot, log) {
  await enterBattle(page, options.map);
  log.push({ at: 'battle', recorder: await recorderState(page), map: await page.evaluate(() => window.__DEBUG?.game?.mapId ?? null) });
  const shots = [];
  await drive(page, options.seconds, { raise: options.raise, shots });
  log.push({ at: 'shots', raise: options.raise, shots });
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
      const reverted = name === 'E' && !options.cancel ? await revertLeaveCancel(page) : null;
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
      try {
        if (reverted && reverted.replaced !== 1) throw new Error(`E's control replaced ${reverted.replaced} cancel call(s) in the served main.ts, not 1`);
        result = await ({ A: pathA, B: pathB, C: pathC, D: pathD, E: pathE })[name](page, options, shot, log);
        if (reverted && reverted.replaced !== 1) throw new Error(`E's control replaced ${reverted.replaced} cancel call(s) in the served main.ts, not 1`);
      } catch (error) {
        await shot('error');
        result = { ok: false, why: `threw: ${error.message}` };
      }
      // (279 r2) E lands with no page error as well
      const pageErrors = receipt.errors.filter((entry) => entry.path === name && entry.kind === 'pageerror');
      if (name === 'E' && result.ok && pageErrors.length) result = { ok: false, why: `page error: ${pageErrors[0].text.slice(0, 200)}` };
      if (reverted) result = { ...result, control: { cancelRemoved: reverted.replaced } };
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
