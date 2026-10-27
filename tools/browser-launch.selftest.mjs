// The browser guard (tools/browser-launch.mjs, 2026-10-26, item 244): the launch flags, the tree measure on synthetic ps
// rows, and two real Chrome runs against a page that allocates fast. In this process (exit: false) the guard trips on
// the renderer cap, kills the whole tree by its pids, names the page, and releases a capture lock held on a private
// lock directory with the reason in the hold log; in a child (the default) it ends the process with exit code 86 and
// leaves no process of the tree behind. The caps here are a few hundred MB, and the page stops itself at 1.5 GB, so a
// broken guard cannot grow the browser far.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import {
  BROWSER_GUARD_EXIT_CODE, browserGuardConfig, browserGuardOf, browserInstallPrefix, guardedLaunchArgs, launchGuardedBrowser,
  measureTree, parseFootprint, parsePsRows, processType,
} from './browser-launch.mjs';
import { createCaptureLock } from './capture-lock.mjs';

// a page that allocates 32 MB every 40 ms and touches every page of it; it stops at 1.5 GB whatever happens
const HOG = 'data:text/html,' + encodeURIComponent(`<title>hog</title><script>
const keep = [];
setInterval(() => {
  if (keep.length >= 48) return;
  const block = new Uint8Array(32 << 20);
  for (let j = 0; j < block.length; j += 4096) block[j] = 1;
  keep.push(block);
}, 40);
</script>`);
const LAUNCH = { headless: true, args: ['--disable-gpu'], timeout: 180_000, protocolTimeout: 180_000 };
const SMALL = { rendererCapMb: 384, treeCapMb: 4096, intervalMs: 250 };

const groupPids = (rootPid) => {
  try {
    return execFileSync('ps', ['-o', 'pid=', '-g', String(rootPid)], { encoding: 'utf8' }).split('\n').map(Number).filter(Boolean);
  } catch {
    return []; // ps exits 1 once the group is empty
  }
};
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (test, ms, what) => {
  const end = Date.now() + ms;
  while (!(await test())) {
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms: ${what}`);
    await new Promise((done) => setTimeout(done, 100));
  }
};

if (process.argv[2] === '--child') {
  // the child: a guarded browser in the default (exit) mode on the hog page; the parent reads the exit code
  const browser = await launchGuardedBrowser(puppeteer, LAUNCH, { ...SMALL, label: 'browser-guard-child' });
  console.log(`root ${browserGuardOf(browser).rootPid}`);
  const page = await browser.newPage();
  await page.goto(HOG).catch(() => {});
  await new Promise((done) => setTimeout(done, 120_000));
  console.log('the guard never tripped');
  await browser.close();
  process.exit(3);
}

// ---- flags -----------------------------------------------------------------------------------------------------------
{
  const args = guardedLaunchArgs(['--disable-gpu'], { heapMb: 3072, rendererProcessLimit: 4, token: 'abc' });
  assert.ok(args.includes('--js-flags=--max-old-space-size=3072'), 'the heap cap is added');
  assert.ok(args.includes('--renderer-process-limit=4') && args.includes('--disable-back-forward-cache'));
  assert.ok(args.includes('--cot-browser-guard=abc') && args[0] === '--disable-gpu');
  const merged = guardedLaunchArgs(['--js-flags=--expose-gc', '--renderer-process-limit=1'], { heapMb: 2048, rendererProcessLimit: 4 });
  assert.deepEqual(merged.filter((arg) => arg.startsWith('--js-flags')), ['--js-flags=--expose-gc --max-old-space-size=2048'],
    'one --js-flags: Chrome keeps only the last, so the cap joins the caller\'s');
  assert.deepEqual(merged.filter((arg) => arg.startsWith('--renderer-process-limit')), ['--renderer-process-limit=1'], 'the caller\'s limit wins');
  assert.deepEqual(guardedLaunchArgs(['--js-flags=--max-old-space-size=8192'], {}).filter((arg) => arg.startsWith('--js-flags')),
    ['--js-flags=--max-old-space-size=8192'], 'a caller\'s own heap size stays');
  assert.throws(() => guardedLaunchArgs('--x'), /args must be strings/);
  const defaults = browserGuardConfig({});
  assert.equal(defaults.rendererCapMb, Number(process.env.COT_BROWSER_RENDERER_CAP_MB || 6144));
  assert.equal(browserGuardConfig({ rendererCapMb: 100, intervalMs: 5 }).intervalMs, 100, 'the interval has a floor');
}

// ---- the tree measure --------------------------------------------------------------------------------------------------
{
  const app = '/x/Google Chrome for Testing.app';
  const rows = parsePsRows([
    ` 100   100     9  200000 ${app}/Contents/MacOS/Google Chrome for Testing --headless --cot-browser-guard=t`,
    ` 101   100   100 4000000 ${app}/Contents/Frameworks/Helper (Renderer).app/Contents/MacOS/Helper (Renderer) --type=renderer --lang=en`,
    ` 102   100   100  900000 ${app}/Contents/Frameworks/Helper (GPU).app/Contents/MacOS/Helper (GPU) --type=gpu-process`,
    ` 103   100     1  100000 ${app}/Contents/Frameworks/Helper.app/Contents/MacOS/Helper --type=utility`, // orphaned: still in the group
    ` 104   104   101   50000 /bin/sh -c child-of-a-renderer`, // a descendant outside the group
    ` 200   200     9 9000000 /Applications/Other.app/Contents/MacOS/Other --type=renderer`, // another tree
  ].join('\n'));
  assert.equal(rows.length, 6);
  assert.equal(processType(rows[0].command), 'browser');
  assert.equal(processType(rows[2].command), 'gpu-process');
  const tree = measureTree(rows, 100);
  assert.deepEqual(tree.pids.sort(), [100, 101, 102, 103, 104]);
  assert.equal(tree.rendererPid, 101);
  assert.equal(Math.round(tree.rendererMb), Math.round(4000000 / 1024));
  assert.equal(Math.round(tree.treeMb), Math.round((200000 + 4000000 + 900000 + 100000 + 50000) / 1024));
  const raised = measureTree(rows, 100, new Map([[101, 7000]]));
  assert.equal(raised.rendererMb, 7000, 'a renderer\'s physical footprint counts where it passes its RSS');
  assert.equal(browserInstallPrefix(rows[1].command), `${app}/`);
  assert.equal(browserInstallPrefix('/c/chrome-headless-shell --type=renderer'), '/c/');
  const footprints = parseFootprint(`Helper [101]: 64-bit    Footprint: 1048576 B (16384 bytes per page)\n\nAuxiliary data:\n`
    + `    phys_footprint: 2097152 B\n    phys_footprint_peak: 9 B\nHelper [102]: 64-bit    Footprint: 3145728 B (16384 bytes per page)\n`);
  assert.deepEqual([...footprints], [[101, 2], [102, 3]]);
}

// ---- test doubles: a launcher that starts no browser of this process is handed back unwatched -----------------------
{
  const fakePid = { close: async () => {}, process: () => ({ pid: 1 }), newPage: async () => ({}) };
  const seen = [];
  const returned = await launchGuardedBrowser({ launch: async (options) => { seen.push(options); return fakePid; } }, { headless: true });
  assert.equal(returned, fakePid, 'a fixture browser with a fake pid comes back as it was');
  assert.equal(browserGuardOf(returned), null, 'and nothing watches (or could kill) pid 1');
  assert.ok(seen[0].args.includes('--js-flags=--max-old-space-size=3072'), 'the launcher still saw the guarded flags');
  const noProcess = { newPage: async () => ({}), close: async () => {} };
  assert.equal(await launchGuardedBrowser({ launch: async () => noProcess }), noProcess);
  assert.equal(browserGuardOf(noProcess), null);
  await assert.rejects(launchGuardedBrowser({}, {}), /the launcher has no launch\(\)/);
}

// ---- a real browser, in this process: the trip, the kill, the page, the lock -----------------------------------------
{
  const scratch = mkdtempSync(join(tmpdir(), 'cot-browser-guard-'));
  const lock = createCaptureLock({ lockDir: join(scratch, 'lock'), queueDir: join(scratch, 'queue'), logFile: join(scratch, 'holds.log'),
    log: () => {} });
  await lock.acquire(10_000);
  assert.ok(existsSync(join(scratch, 'lock')), 'the private hold is taken');
  const lines = [];
  let report = null;
  const browser = await launchGuardedBrowser(puppeteer, LAUNCH, {
    ...SMALL, label: 'browser-guard-selftest', exit: false, log: (line) => lines.push(line), logFile: join(scratch, 'guard.log'),
    onTrip: (value) => { report = value; },
  });
  const guard = browserGuardOf(browser);
  const rootPid = guard.rootPid;
  const disconnected = new Promise((done) => browser.once('disconnected', done));
  try {
    assert.ok(groupPids(rootPid).length >= 2, 'the browser and its helpers share the process group the guard samples');
    const spawned = browser.process().spawnargs;
    assert.ok(spawned.some((arg) => arg.startsWith('--js-flags=') && arg.includes('--max-old-space-size=3072')), 'Chrome runs with the heap cap');
    const page = await browser.newPage();
    await page.goto(HOG).catch(() => {}); // the trip can land mid-navigation
    await until(() => report !== null, 90_000, 'the guard tripping on the hog page');
  } finally {
    if (!report) await browser.close().catch(() => {});
  }
  assert.match(report.why, /^renderer \d+ at [\d.]+ GB passed the 0\.38 GB renderer cap$/);
  assert.ok(report.rendererMb > SMALL.rendererCapMb && report.peakRendererMb >= report.rendererMb, `renderer ${report.rendererMb} MB`);
  assert.equal(report.label, 'browser-guard-selftest');
  assert.deepEqual(report.pages.filter((url) => url.startsWith('data:text/html')).length, 1, `the report names the open page: ${JSON.stringify(report.pages)} ${JSON.stringify(lines)}`);
  assert.equal(report.exitCode, null);
  assert.equal(guard.tripped, report);
  assert.ok(report.killed.includes(rootPid) && report.killed.length >= 2, 'the browser and its helpers were killed');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[browser-guard\] browser-guard-selftest: renderer \d+ at .* hold none \(capture lock released: .+\); pages: (?:.* \| )?data:text\/html.{0,200}…/);
  await until(() => report.killed.every((pid) => !alive(pid)) && groupPids(rootPid).length === 0, 10_000, 'every process of the tree gone');
  await disconnected;
  assert.ok(!existsSync(join(scratch, 'lock')), 'the capture lock was released at the trip');
  assert.deepEqual(report.releasedHolds.length, 1);
  const holds = readFileSync(join(scratch, 'holds.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(holds.at(-1).e, 'release');
  assert.match(holds.at(-1).reason, /^browser guard: renderer/);
  assert.equal(JSON.parse(readFileSync(join(scratch, 'guard.log'), 'utf8').trim()).rootPid, rootPid);
  assert.equal(lock.release(), false, 'the caller\'s own later release finds nothing to release');
  await browser.close().catch(() => {}); // a close after the trip is harmless
}

// ---- a real browser in a child, default mode: exit 86, nothing left -------------------------------------------------
{
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '', rootPid = null, worstRssKb = 0;
  child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; rootPid ??= Number(out.match(/^root (\d+)$/m)?.[1]) || null; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
  // the parent's own watchdog on the child: a hard timeout and an RSS ceiling (node-receipt-offheap-runaway)
  const watch = setInterval(() => {
    try { worstRssKb = Math.max(worstRssKb, Number(execFileSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' }))); } catch { /* gone */ }
    if (worstRssKb > 3 * 1024 * 1024) child.kill('SIGKILL');
  }, 1000);
  const timeout = setTimeout(() => child.kill('SIGKILL'), 150_000);
  const code = await new Promise((done) => child.once('exit', (value, signal) => done(value ?? signal)));
  clearInterval(watch);
  clearTimeout(timeout);
  assert.equal(code, BROWSER_GUARD_EXIT_CODE, `the child exits ${BROWSER_GUARD_EXIT_CODE}\n${out}\n${err.slice(-2000)}`);
  assert.match(err, /\[browser-guard\] browser-guard-child: renderer \d+ at .* passed the 0\.38 GB renderer cap; killed .*; exiting 86/);
  assert.ok(rootPid, 'the child named its browser');
  await until(() => groupPids(rootPid).length === 0, 10_000, 'the child\'s browser tree gone');
}

console.log('browser-launch.selftest: the heap cap and flags merged into the caller\'s, the process-group tree measure, a hog page '
  + 'tripping the renderer cap in-process (tree killed, page named, capture lock released with its reason) and in a child '
  + `(exit ${BROWSER_GUARD_EXIT_CODE}, no process left)`);
