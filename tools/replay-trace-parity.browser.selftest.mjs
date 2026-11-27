#!/usr/bin/env node
/**
 * Replay-trace parity (replay-receipts-279): for one recording and one world, the page's replay indexer Worker
 * (src/game/replay/replayIndexerWorker.ts, in the browser) and Node's (runReplayIndexJob over the same job: the same file,
 * the same collision records, the same terrain seed) must index the battle identically, byte for byte: the track's
 * samples (every hull's numbers), its shells (offsets and data), its hulls, the steps indexed, the last step, the problem
 * and the effects' cues. Guards the class "the page's re-simulation diverges from Node's" (live 276-278: the Worker's
 * Frontline field had no trenches; tools/replay-verify.mjs passed in Node while every viewer refused the replay).
 *
 * The page: a fresh profile, a solo battle driven with real keys for --seconds (the gun raised, so shells fly:
 * tools/replay-ui-flow.browser.selftest.mjs drive), left from Settings, watched from the Service Record's Replays tab;
 * the Worker's job is copied as posted and its reply kept. Then the PLANTED CONTROL: the same recording watched again with
 * the indexer's Worker swapped for tools/replay-trace-parity.planted-worker.ts (one getter keyed wrongly: the world's
 * height field answered from a WeakMap keyed by the job, not the world). PASS needs the page's index equal to Node's AND
 * the planted index to part from Node's, named by field. Needs the dev server (the planted Worker is served from tools/).
 *
 *   node tools/with-capture-lock.mjs --lock-class=render --place=<lane> -- \
 *     node tools/replay-trace-parity.browser.selftest.mjs [--out=<dir>] [--port=4239] [--seconds=16] [--map=<id>]
 *
 * One browser and one vite child, both stopped by their own handles. Exit 0 on PASS, 1 on FAIL. First-party tooling:
 * Kevin B. Liu.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold, startViteChild } from './capture-hold.mjs';
import { isMainModule, mapProbeLaunchOptions, sleep } from './map-probe-runtime.mjs';
import { BOOT_LOADED_EXPRESSION, readinessExpression } from './game-readiness.mjs';
import { WATCH_INDEXER, drive, enterBattle, leaveBattle } from './replay-flow.test-support.mjs';
import { TRACK_FIELDS, TRACK_STRIDE } from '../src/game/replay/replayTrack.ts';

const TOOL = 'replay-trace-parity';
const QUERY = 'nosplash=1&tier=desktop&gfxreset=1';
const PLANTED = '/tools/replay-trace-parity.planted-worker.ts?worker_file&type=module';

/** In-page, before WATCH_INDEXER: with window.__replayIndexerPlant set, the indexer's Worker is the planted one. */
const PLANT_INDEXER = `(() => {
  const Native = window.Worker;
  window.Worker = new Proxy(Native, {
    construct(target, args, newTarget) {
      if (window.__replayIndexerPlant && args[1] && args[1].name === 'cot-replay-indexer') args = [new URL(window.__replayIndexerPlant, location.origin), args[1]];
      return Reflect.construct(target, args, newTarget);
    },
  });
  window.__replayKeepJobs = true;
})();`;

export function parseParityArgs(argv) {
  const out = { out: null, dist: null, port: 4239, seconds: 16, map: null, width: 1600, height: 900 };
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    if (m[1] === 'out') out.out = path.resolve(m[2]);
    else if (m[1] === 'port') out.port = Number(m[2]);
    else if (m[1] === 'seconds') out.seconds = Number(m[2]);
    else if (m[1] === 'map') out.map = m[2];
    else throw new Error(`unknown flag --${m[1]}`);
  }
  out.out ??= mkdtempSync(path.join(tmpdir(), `${TOOL}-`));
  return out;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const say = (line) => console.log(`[${TOOL}] ${stamp()} ${line}`);

/** In-page: the newest indexer job's posted message and reply, typed arrays as { $ta, b64 } (JSON-safe). */
const takeJob = (page) => page.evaluate(() => {
  const job = [...(window.__replayIndexJobs ?? [])].reverse().find((entry) => entry.index && entry.sent);
  if (!job) return null;
  const b64 = (view) => {
    const bytes = new Uint8Array(view.buffer ?? view, view.byteOffset ?? 0, view.byteLength);
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  };
  const encode = (value) => {
    if (value instanceof ArrayBuffer) return { $ta: 'ArrayBuffer', b64: b64(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) return { $ta: value.constructor.name, b64: b64(value) };
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)]));
    return value;
  };
  return JSON.stringify({ sent: encode(job.sent), index: encode(job.index) });
});

/** Node: a takeJob value back to typed arrays. */
export function decodeJob(json) {
  const decode = (value) => {
    if (value && typeof value === 'object' && typeof value.$ta === 'string') {
      const bytes = Buffer.from(value.b64, 'base64');
      const copy = new Uint8Array(bytes.length); copy.set(bytes);
      if (value.$ta === 'ArrayBuffer') return copy.buffer;
      const Type = globalThis[value.$ta];
      return new Type(copy.buffer, 0, copy.byteLength / Type.BYTES_PER_ELEMENT);
    }
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
    return value;
  };
  return decode(JSON.parse(json));
}

const bytesOf = (view) => Buffer.from(view.buffer, view.byteOffset, view.byteLength);

/**
 * The first place two indexes part, named by field (a hull's sample by its id, field name and both values), or null
 * when they are the same byte for byte. Compared in the order a reader would look: the run, the track's shape, its
 * samples, its shells, the cues.
 */
export function firstIndexDifference(a, b) {
  for (const key of ['indexedSteps', 'lastTick']) if (a[key] !== b[key]) return `${key}: page ${a[key]} (${a.problem?.message ?? 'no problem'}), node ${b[key]} (${b.problem?.message ?? 'no problem'})`;
  if (JSON.stringify(a.problem) !== JSON.stringify(b.problem)) return `problem: page ${JSON.stringify(a.problem)}, node ${JSON.stringify(b.problem)}`;
  for (const key of ['header', 'end', 'events']) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return `${key}: the recording's ${key} differ`;
  if (!a.track || !b.track) return a.track === b.track ? null : `track: page ${a.track ? 'has' : 'has none'}, node ${b.track ? 'has' : 'has none'}`;
  const ta = a.track, tb = b.track;
  for (const key of ['everySteps', 'sampleHz', 'samples']) if (ta[key] !== tb[key]) return `track.${key}: page ${ta[key]}, node ${tb[key]}`;
  if (JSON.stringify(ta.hulls) !== JSON.stringify(tb.hulls)) return 'track.hulls: another roster';
  const da = bytesOf(ta.data), db = bytesOf(tb.data);
  if (!da.equals(db)) {
    const n = Math.min(ta.data.length, tb.data.length);
    let i = 0;
    while (i < n && Object.is(ta.data[i], tb.data[i])) i++;
    const perSample = ta.hulls.length * TRACK_STRIDE;
    const sample = Math.floor(i / perSample), hull = ta.hulls[Math.floor((i % perSample) / TRACK_STRIDE)]?.id, field = TRACK_FIELDS[i % TRACK_STRIDE];
    return i < n ? `track.data: sample ${sample} (step ${(sample + 1) * ta.everySteps}) hull ${hull} ${field}: page ${ta.data[i]}, node ${tb.data[i]}`
      : `track.data: page ${ta.data.length} numbers, node ${tb.data.length}`;
  }
  for (const key of ['shellOffsets', 'shellData']) {
    if (!bytesOf(ta[key]).equals(bytesOf(tb[key]))) {
      let i = 0;
      while (i < Math.min(ta[key].length, tb[key].length) && Object.is(ta[key][i], tb[key][i])) i++;
      return `track.${key}[${i}]: page ${ta[key][i]}, node ${tb[key][i]}`;
    }
  }
  const ca = a.cues ?? [], cb = b.cues ?? [];
  for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
    if (JSON.stringify(ca[i]) !== JSON.stringify(cb[i])) return `cues[${i}]: page ${JSON.stringify(ca[i])?.slice(0, 120)}, node ${JSON.stringify(cb[i])?.slice(0, 120)}`;
  }
  return null;
}

/** Wait for the newest indexer job to reply (done or error). */
async function indexed(page, count) {
  await page.waitForFunction((n) => (window.__replayIndexJobs ?? []).length >= n && !!window.__replayIndexJobs[n - 1].reply,
    { timeout: 300_000, polling: 500 }, count);
  return page.evaluate((n) => window.__replayIndexJobs[n - 1].reply, count);
}

async function leaveViewer(page) {
  await page.evaluate(() => [...document.querySelectorAll('.cot-replay .leave')].find((el) => el.offsetParent)?.click());
  await page.waitForFunction(readinessExpression('garage'), { timeout: 120_000, polling: 250 });
}

/** Watch the newest saved recording again from the Service Record (the Garage's R, Replays, Watch). */
async function watchNewest(page) {
  await page.keyboard.press('KeyR');
  await page.waitForSelector('[data-record-tab="replays"]', { visible: true, timeout: 30_000 });
  await page.evaluate(() => document.querySelector('[data-record-tab="replays"]')?.click());
  await page.waitForSelector('[data-replay-watch]', { visible: true, timeout: 30_000 });
  await page.evaluate(() => [...document.querySelectorAll('[data-replay-watch]')].find((el) => el.offsetParent)?.click());
}

export async function runParity(options) {
  mkdirSync(options.out, { recursive: true });
  const receipt = { tool: TOOL, at: new Date().toISOString(), options: { ...options }, errors: [], log: [] };
  const log = (entry) => { receipt.log.push(entry); say(JSON.stringify(entry).slice(0, 300)); };
  let server = null, browser = null, pageJobs = null;
  try {
    server = await startViteChild({ mode: 'dev', port: options.port });
    browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: options.width, height: options.height }));
    say(`browser pid ${browser.process()?.pid ?? '?'}, dev server ${server.url}`);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(PLANT_INDEXER);
    await page.evaluateOnNewDocument(WATCH_INDEXER);
    page.on('pageerror', (error) => receipt.errors.push(String(error?.message ?? error).slice(0, 400)));
    const shot = async (tag) => { try { await page.screenshot({ path: path.join(options.out, `${tag}.png`) }); } catch { /* best effort */ } };
    await page.goto(`${server.url}/?${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(BOOT_LOADED_EXPRESSION, { timeout: 300_000 });
    await enterBattle(page, options.map);
    log({ at: 'battle', map: await page.evaluate(() => window.__DEBUG?.game?.mapId ?? null) });
    const shots = [];
    await drive(page, options.seconds, { raise: true, shots });
    log({ at: 'driven', shots });
    // the page's own indexer: leave as the player does, Watch from the Replays tab
    await leaveBattle(page);
    await sleep(1500);
    await watchNewest(page);
    const honestReply = await indexed(page, 1);
    log({ at: 'honest', reply: honestReply });
    const honest = await takeJob(page);
    await shot('honest-indexed');
    await leaveViewer(page);
    // the planted Worker over the same recording
    await page.evaluate((url) => { window.__replayIndexerPlant = url; }, PLANTED);
    await watchNewest(page);
    const plantedReply = await indexed(page, 2);
    log({ at: 'planted', reply: plantedReply });
    const planted = await takeJob(page);
    await shot('planted-indexed');
    pageJobs = { honest, planted };
    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close();
  }
  // Node: the page's own job, re-run (the same file, records and seed)
  if (!pageJobs?.honest) throw new Error('the page kept no indexer job');
  const { runReplayIndexJob } = await import('../src/game/replay/replayIndexerWorker.ts');
  const honest = decodeJob(pageJobs.honest);
  writeFileSync(path.join(options.out, 'recording.cotreplay'), Buffer.from(honest.sent.file));
  const node = (await runReplayIndexJob(honest.sent, () => {})).index;
  const parted = firstIndexDifference(honest.index, node);
  const planted = pageJobs.planted ? decodeJob(pageJobs.planted) : null;
  const plantedSameJob = planted ? Buffer.from(planted.sent.file).equals(Buffer.from(honest.sent.file)) : false;
  const plantedParted = planted ? firstIndexDifference(planted.index, node) : null;
  receipt.parity = {
    samples: node.track?.samples ?? 0, hulls: node.track?.hulls.length ?? 0, indexedSteps: node.indexedSteps, problem: node.problem,
    shellEntries: node.track ? node.track.shellOffsets[node.track.shellOffsets.length - 1] : 0, cues: node.cues.length,
    page: parted ?? 'byte-identical',
  };
  receipt.control = { sameRecording: plantedSameJob, named: plantedParted };
  receipt.pass = parted === null && node.problem === null && plantedSameJob && plantedParted !== null;
  receipt.why = parted !== null ? `the page's index parts from Node's: ${parted}`
    : node.problem ? `Node's index stops: ${node.problem.message}`
    : !plantedSameJob ? 'the planted run indexed another recording'
    : plantedParted === null ? 'control: the planted getter left the page\'s index equal to Node\'s (the receipt cannot see the class)'
    : `the page's index is Node's byte for byte (${receipt.parity.samples} samples x ${receipt.parity.hulls} hulls, ${receipt.parity.shellEntries} shell entries, ${receipt.parity.cues} cues); control named: ${plantedParted}`;
  writeFileSync(path.join(options.out, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  say(`${receipt.pass ? 'PASS' : 'FAIL'} ${receipt.why} -> ${path.join(options.out, 'receipt.json')}`);
  return receipt;
}

if (isMainModule(import.meta.url)) {
  const options = parseParityArgs(process.argv.slice(2));
  const hold = await openCaptureHold({ label: TOOL, lockClass: 'render', timeoutMs: 30 * 60_000 });
  let code = 1;
  try { code = (await runParity(options)).pass ? 0 : 1; } catch (error) { console.error(`[${TOOL}] ${error.stack ?? error}`); } finally { await hold.release(); }
  process.exit(code);
}
