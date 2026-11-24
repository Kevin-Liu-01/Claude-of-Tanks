// (2026-11-24, probe-fresh-browser-276) frame-budget-probe opens one browser per staging and closes the one before it first.
// The probe used to run every ABBA slot in ONE Chrome; its tree grew slot by slot until the browser guard's 10 GB tree
// cap killed two ruinspires desktop runs while the second slot staged. This receipt drives the probe's real run loop
// (runFrameProbe) and its real slot loop (measureSlot) through the real guarded launch (launchGuardedBrowser, which
// watches and kills a real process tree) on a stand-in browser: a plain node process, no GPU, that grows by GROW_MB each
// time a page of it stages. Pattern ABBA on one map; the second slot's first staging is sent back (the agreement's
// restage) and the third slot's page fails.
//   The fresh run: every staging launches its own process, every earlier one is gone (ESRCH) before the next launches,
//   each browser hands out one page, the ABBA order holds, and every slot record keeps its stagings' guard peaks, which
//   stay flat across the slots.
//   The planted control: the same run on a launcher that keeps ONE process for the run (its close leaves the tree, the
//   way the old run kept one browser): both judgements must fail on it, the reuse and the tree's climb, or they would
//   pass anything.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserGuardOf, launchGuardedBrowser } from './browser-launch.mjs';
import { RestageSignal, measureSlot, parseFrameProbeArgs, runFrameProbe } from './frame-budget-probe.mjs';

const GROW_MB = 160;
const INTERVAL_MS = 100;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const dirs = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'cot-probe-browsers-')); dirs.push(dir); return dir; };
const builtTree = () => { const dir = scratch(); mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist', 'index.html'), ''); return dir; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };

// the stand-in browser process: says 'ready', then on SIGUSR2 holds GROW_MB more (touched, so it is resident) and says 'grown'
const CHILD = `const keep = []; process.on('SIGUSR2', () => { keep.push(Buffer.allocUnsafe(${GROW_MB} << 20).fill(1)); process.stdout.write('grown\\n'); });
setInterval(() => {}, 1000); process.stdout.write('ready\\n');`;
const children = new Set();

/** A puppeteer-like launcher whose browser is a stand-in process (its own process group, the guard's token in its
 *  arguments); `ledger` records every launch, page and close in order. */
function standInLauncher(ledger) {
  let n = 0;
  return {
    async launch({ args = [] } = {}) {
      const id = ++n;
      const earlier = ledger.filter((e) => e.event === 'launch').map((e) => e.pid);
      const child = spawn(process.execPath, ['-e', CHILD, '--', ...args], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
      children.add(child);
      child.on('exit', () => children.delete(child));
      const lines = [];
      child.stdout.setEncoding('utf8').on('data', (chunk) => { lines.push(...chunk.split('\n').filter(Boolean)); child.emit('line'); });
      const said = async (word, count) => { while (lines.filter((l) => l === word).length < count) await once(child, 'line'); };
      await said('ready', 1);
      ledger.push({ event: 'launch', id, pid: child.pid, earlierAlive: earlier.filter(alive) });
      let grown = 0;
      return {
        process: () => child,
        async newPage() {
          ledger.push({ event: 'page', id });
          const page = {
            browserId: id,
            /** The staging's weight: the process holds GROW_MB more, and the guard samples it. */
            async stage() { process.kill(child.pid, 'SIGUSR2'); await said('grown', ++grown); await sleep(INTERVAL_MS * 4); },
            async close() { ledger.push({ event: 'page-close', id }); },
          };
          return page;
        },
        async close() {
          ledger.push({ event: 'close', id });
          if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
        },
      };
    },
  };
}

const guardOptions = { label: 'probe-browsers-receipt', intervalMs: INTERVAL_MS, exit: false, releaseHolds: 'none' };
const fakeLocks = async () => ({ signal: new AbortController().signal, refresh() { return true; }, release: async () => {} });

/** One ABBA run on ruinspires through the probe's run and slot loops; returns its ledger, staged order and slot records. */
async function probeRun({ launchBrowser, guardOf }) {
  const out = scratch(), root = builtTree(), staged = [];
  const options = parseFrameProbeArgs([`--roots=${root},${root}`, '--labels=base,new', '--maps=ruinspires', '--pattern=ABBA',
    `--out=${out}`, '--scene-check=off', '--tag=t']);
  const restaged = new Set();
  // the page's work: grow the stand-in; s1's first staging is sent back, s2's page fails, the others return a record
  const stage = async (page, _options, slot) => {
    staged.push(`${slot.key}@${page.browserId}`);
    await page.stage();
    if (slot.key.includes('-s1-') && !restaged.has(slot.key)) { restaged.add(slot.key); throw new RestageSignal('receipt restage'); }
    if (slot.key.includes('-s2-')) throw new Error('page crashed (receipt)');
    return { mapId: slot.mapId, readyMs: 0, entryMs: 0, void: 'receipt stand-in: no frames', scene: null, samples: [], pageErrors: [] };
  };
  const log = console.log, said = [], exitCode = process.exitCode;
  console.log = (...parts) => { said.push(parts.join(' ')); };
  let result;
  try {
    result = await runFrameProbe(options, { acquireLocks: fakeLocks, openServer: async () => ({ close: async () => {} }),
      launchBrowser, guardOf, measure: (openBrowser, o, slot, gate) => measureSlot(openBrowser, o, slot, gate, stage) });
  } finally {
    console.log = log;
    process.exitCode = exitCode;
  }
  const keys = ['s0-base', 's1-new', 's2-new', 's3-base'].map((k) => `ruinspires-${k}`);
  const records = keys.map((k) => JSON.parse(readFileSync(join(out, `t-${k}.json`), 'utf8')));
  return { result, staged, records, said: said.join('\n') };
}

/** Judgement 1: one browser per staging, the one before it gone first, one page each. Returns the failures. */
function judgeOneBrowserPerStaging(ledger, stagings) {
  const failures = [];
  const launches = ledger.filter((e) => e.event === 'launch');
  if (launches.length !== stagings) failures.push(`${launches.length} browser launch(es) for ${stagings} stagings`);
  if (new Set(launches.map((e) => e.pid)).size !== launches.length) failures.push('a browser process served two launches');
  for (const e of launches) if (e.earlierAlive.length) failures.push(`launch ${e.id} while ${e.earlierAlive.join(', ')} still ran`);
  const pages = new Map();
  for (const e of ledger.filter((x) => x.event === 'page')) pages.set(e.id, (pages.get(e.id) ?? 0) + 1);
  for (const [id, count] of pages) if (count !== 1) failures.push(`browser ${id} handed out ${count} pages`);
  return failures;
}

/** Judgement 2: every slot's guard peaks recorded, and flat: no slot's tree peak past the first slot's by half a staging. */
function judgeFlatTree(records, growMb = GROW_MB) {
  const failures = [];
  const peaks = records.map((r) => {
    const mbs = (r.browsers ?? []).map((b) => b.peakTreeMb);
    if (!mbs.length || mbs.some((mb) => typeof mb !== 'number' || mb <= 0)) failures.push(`${r.key}: no guard peak recorded (${JSON.stringify(r.browsers)})`);
    return Math.max(0, ...mbs.filter((mb) => typeof mb === 'number'));
  });
  for (let i = 1; i < peaks.length; i++) {
    if (peaks[i] - peaks[0] > growMb / 2) failures.push(`${records[i].key}: tree peak ${peaks[i]} MB climbed from ${peaks[0]} MB at the first slot`);
  }
  return { failures, peaks };
}

const failed = [];
const check = async (name, run) => { try { await run(); console.log(`ok ${name}`); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`); } };

try {
  await check('fresh browser per staging (the probe as it is)', async () => {
    const ledger = [];
    const launcher = standInLauncher(ledger);
    const { result, staged, records, said } = await probeRun({
      launchBrowser: (launchOptions, extra) => launchGuardedBrowser(launcher, launchOptions, { ...guardOptions, ...extra }), guardOf: browserGuardOf });
    assert.deepEqual(result, { ok: false, remaining: 0 }, `the run finishes; the planted page crash makes it FAILED (${said})`);
    assert.deepEqual(staged.map((s) => s.split('@')[0].replace('ruinspires-', '')),
      ['s0-base', 's1-new', 's1-new', 's2-new', 's3-base'], 'ABBA order, the restage staged again within its slot');
    assert.deepEqual(staged.map((s) => Number(s.split('@')[1])), [1, 2, 3, 4, 5], 'every staging on a browser of its own');
    assert.deepEqual(judgeOneBrowserPerStaging(ledger, 5), [], 'one browser per staging');
    // every page closes before its browser, and every browser closes before the next launches
    const order = ledger.map((e) => `${e.event}:${e.id}`);
    for (let id = 1; id <= 5; id++) {
      assert.ok(order.indexOf(`page-close:${id}`) < order.indexOf(`close:${id}`), `browser ${id}'s page closes first (${order.join(' ')})`);
      if (id < 5) assert.ok(order.indexOf(`close:${id}`) < order.indexOf(`launch:${id + 1}`), `browser ${id} closes before ${id + 1} launches`);
    }
    assert.equal(children.size, 0, 'no stand-in process outlives the run');
    assert.deepEqual(records.map((r) => r.browsers?.length), [1, 2, 1, 1], 'each slot record keeps one guard reading per staging');
    assert.ok(records.every((r) => r.browsers.every((b) => b.tripped === null && b.samples > 0)), 'the guard watched every browser, none tripped');
    assert.match(records[2].failed ?? '', /page crashed \(receipt\)/, 'the failed slot is recorded FAILED, with its browser\'s peaks');
    const flat = judgeFlatTree(records);
    assert.deepEqual(flat.failures, [], `the tree stays flat across slots (${flat.peaks.join(', ')} MB)`);
    assert.match(said, /ruinspires-s0-base VOID: .* \| tree peak \d+\.\d\d GB \(browser \d+\.\d\d; vite \d+\.\d\d\)/,
      'the slot\'s log line names its tree peak, what it was made of and the vite server (tree-breakdown-277)');
    // (tree-breakdown-277) the probe's vite companion and the tree-peak breakdown reach every staging's record
    for (const b of records.flatMap((r) => r.browsers)) {
      assert.ok(b.peakBreakdown?.byType?.browser > 0 && b.peakBreakdown.treeMb === b.peakTreeMb, `breakdown at the tree peak (${JSON.stringify(b)})`);
      assert.ok(b.peakBreakdown.companionsMb?.vite > 0 && b.peakCompanionsMb?.vite >= b.peakBreakdown.companionsMb.vite, `vite sampled (${JSON.stringify(b)})`);
    }
    console.log(`  peaks per slot: ${flat.peaks.join(', ')} MB`);
  });

  await check('planted control: one browser for the run', async () => {
    const ledger = [];
    const launcher = standInLauncher(ledger);
    let shared = null;
    // the old shape: the first launch's browser serves every staging, and a slot's close leaves its tree running
    const launchBrowser = async (launchOptions) => {
      shared ??= await launchGuardedBrowser(launcher, launchOptions, guardOptions);
      ledger.push({ event: 'launch', id: 1, pid: shared.process().pid, earlierAlive: [] });
      return { newPage: () => shared.newPage(), close: async () => {}, shared };
    };
    try {
      const { records } = await probeRun({ launchBrowser, guardOf: (b) => browserGuardOf(b.shared ?? b) });
      const reuse = judgeOneBrowserPerStaging(ledger.filter((e, i) => !(e.event === 'launch' && i === 0)), 5);
      assert.ok(reuse.some((f) => /served two launches/.test(f)) && reuse.some((f) => /handed out 5 pages/.test(f)),
        `the reuse judgement flags one browser for the run (${reuse.join('; ') || 'nothing'})`);
      const flat = judgeFlatTree(records);
      assert.ok(flat.failures.some((f) => /climbed/.test(f)), `the flat-tree judgement flags the climb (${flat.peaks.join(', ')} MB)`);
      console.log(`  control peaks per slot: ${flat.peaks.join(', ')} MB (climbing)`);
    } finally {
      if (shared) await shared.close();
    }
  });
} finally {
  for (const child of children) child.kill('SIGKILL');
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

if (failed.length) {
  console.error(`frame-budget-probe-browsers: ${failed.length} failed\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log('frame-budget-probe-browsers: one browser per staging, flat tree, control caught — ok');
