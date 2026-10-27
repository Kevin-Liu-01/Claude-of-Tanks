// One launcher for every browser a tool, probe, capture or receipt starts (2026-10-26, item 244).
//
// On 2026-10-23 the owner's 128 GB Mac crashed twice from memory exhaustion: the jetsam report named a Chrome for
// Testing renderer at 14.1 GB, a runaway capture page, and nothing capped the browsers lanes start. Every launch goes
// through launchGuardedBrowser (tools/browser-launch-census.selftest.mjs fails on a direct puppeteer.launch or
// chromium.launch anywhere else):
//
//   import puppeteer from 'puppeteer';
//   import { launchGuardedBrowser } from './browser-launch.mjs';
//   const browser = await launchGuardedBrowser(puppeteer, { headless: true, args: [...] }, { label: 'my-probe' });
//
// Playwright's browser types work the same (`launchGuardedBrowser(chromium, options)`); `{ method: 'launchServer' }` and
// `{ method: 'launchPersistentContext', userDataDir }` cover their other launches.
//
// - Chrome gets a V8 heap cap (`--js-flags=--max-old-space-size=3072`, merged into the caller's own --js-flags), a
//   renderer process limit (4: two would put a multi-client page set on one main thread) and no back/forward cache,
//   sync, component updates or first-run work.
// - A watchdog samples the browser's whole process tree (its process group: Chrome's helpers stay in the group of the
//   browser process puppeteer and playwright start detached) every 2 s by RSS, and every ~10 s by physical footprint for
//   large renderers, which counts the pages the compressor took from RSS on a Mac under pressure. A renderer past 6 GB
//   or the tree past 10 GB trips it: the tree is killed by its exact pids, a `[browser-guard]` line on stderr names the
//   label, the hold, the open pages and the peaks (also appended to /tmp/cot-browser-guard.log), every capture lock this
//   process holds is released at once (tools/capture-lock.mjs releaseAllCaptureHolds: the queue moves on), and the
//   process exits 86 so the caller fails fast instead of freezing the Mac. `exit: false` keeps the process running
//   (browserGuardOf(browser).tripped says why; the browser's pending calls reject as disconnected).
// - close() stops the watchdog and kills whatever of the tree outlives it; so do the browser's disconnect, process exit
//   (an uncaught error included) and a perl alarm (SIGALRM, still rc 142). Nothing is killed by pattern: only pids
//   sampled in this browser's own process group.
// - Caps: options on the third argument, else COT_BROWSER_HEAP_MB, COT_BROWSER_RENDERER_CAP_MB, COT_BROWSER_TREE_CAP_MB,
//   COT_BROWSER_GUARD_INTERVAL_MS and COT_BROWSER_RENDERER_LIMIT.
import { execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, writeSync } from 'node:fs';
import { basename } from 'node:path';
import { releaseAllCaptureHolds } from './capture-lock.mjs';

/** The exit code of a process whose browser the guard killed. */
export const BROWSER_GUARD_EXIT_CODE = 86;
/** Machine-wide record of every trip, one JSON line each (the job's own log gets the `[browser-guard]` line). */
const BROWSER_GUARD_LOG = '/tmp/cot-browser-guard.log';

const GUARD_SWITCH = '--cot-browser-guard';
const EXTRA_SWITCHES = Object.freeze(['--disable-back-forward-cache', '--disable-component-update', '--disable-sync',
  '--no-first-run', '--no-default-browser-check']);
const FOOTPRINT_EVERY = 5; // ticks between physical-footprint reads (~10 s at the default interval)
const FOOTPRINT_FROM_MB = 1024; // only processes this large are worth a footprint read

const MB = 1024 * 1024;
const live = new Set(); // guards whose browser has not been closed
let context = {};
let exitHooked = false;

const positive = (value, fallback) => {
  const number = Number(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(number) && number >= 0 ? number : fallback;
};

/** The caps and limits for one launch: the guard options, then the environment (read by name), then the defaults. */
export function browserGuardConfig(guard = {}) {
  return {
    heapMb: positive(guard.heapMb, positive(process.env.COT_BROWSER_HEAP_MB, 3072)),
    rendererCapMb: positive(guard.rendererCapMb, positive(process.env.COT_BROWSER_RENDERER_CAP_MB, 6144)),
    treeCapMb: positive(guard.treeCapMb, positive(process.env.COT_BROWSER_TREE_CAP_MB, 10240)),
    intervalMs: Math.max(100, positive(guard.intervalMs, positive(process.env.COT_BROWSER_GUARD_INTERVAL_MS, 2000))),
    rendererProcessLimit: positive(guard.rendererProcessLimit, positive(process.env.COT_BROWSER_RENDERER_LIMIT, 4)),
  };
}

/** Chrome arguments with the guard's flags merged in; the caller's own values win where it set one. */
export function guardedLaunchArgs(args = [], { heapMb = 3072, rendererProcessLimit = 4, token = null } = {}) {
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) throw new TypeError('browser guard: args must be strings');
  let jsFlags = false;
  const out = args.map((arg) => {
    if (!arg.startsWith('--js-flags=')) return arg;
    jsFlags = true;
    return /--max-old-space-size[=\s]/.test(arg) ? arg : `${arg} --max-old-space-size=${heapMb}`;
  });
  if (!jsFlags && heapMb > 0) out.push(`--js-flags=--max-old-space-size=${heapMb}`);
  const has = (flag) => out.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (rendererProcessLimit > 0 && !has('--renderer-process-limit')) out.push(`--renderer-process-limit=${rendererProcessLimit}`);
  for (const flag of EXTRA_SWITCHES) if (!has(flag)) out.push(flag);
  if (token) out.push(`${GUARD_SWITCH}=${token}`);
  return out;
}

/** Name the hold (or job) the next trip report belongs to; runWarmHold sets its label. */
export function setBrowserGuardContext(next = {}) {
  context = { ...context, ...next };
}

/** `ps -o pid=,pgid=,ppid=,rss=,command=` lines as rows ({ pid, pgid, ppid, rssKb, command }). */
export function parsePsRows(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s?(.*)$/);
    if (match) rows.push({ pid: +match[1], pgid: +match[2], ppid: +match[3], rssKb: +match[4], command: match[5] ?? '' });
  }
  return rows;
}

/** Chrome's process type from its command line: renderer, gpu-process, utility, ...; 'browser' for the root. */
export function processType(command = '') {
  return command.match(/\s--type=([\w-]+)/)?.[1] ?? 'browser';
}

/**
 * The browser's tree in a ps sample: its process group (`rootPid` leads it) and every descendant of a member. Returns
 * { pids, rendererMb, rendererPid, gpuMb, treeMb, processes }; `footprintMb` (pid -> MB) raises a process's RSS to its
 * physical footprint where that was read.
 */
export function measureTree(rows, rootPid, footprintMb = new Map()) {
  const members = new Map();
  for (const row of rows) if (row.pgid === rootPid || row.pid === rootPid) members.set(row.pid, row);
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row);
  }
  const stack = [...members.keys()];
  while (stack.length) {
    for (const child of children.get(stack.pop()) ?? []) {
      if (members.has(child.pid)) continue;
      members.set(child.pid, child);
      stack.push(child.pid);
    }
  }
  let treeMb = 0, rendererMb = 0, rendererPid = null, gpuMb = 0;
  const processes = [];
  for (const row of members.values()) {
    const type = processType(row.command);
    const mb = Math.max(row.rssKb / 1024, footprintMb.get(row.pid) ?? 0);
    treeMb += mb;
    if (type === 'renderer' && mb > rendererMb) { rendererMb = mb; rendererPid = row.pid; }
    if (type === 'gpu-process') gpuMb = Math.max(gpuMb, mb);
    processes.push({ pid: row.pid, type, mb, command: row.command });
  }
  return { pids: [...members.keys()], rendererMb, rendererPid, gpuMb, treeMb, processes };
}

/** `footprint --noCategories -f bytes` output as pid -> phys_footprint MB. */
export function parseFootprint(text) {
  const out = new Map();
  let pid = null;
  for (const line of String(text).split('\n')) {
    const head = line.match(/\[(\d+)\]:.*Footprint:\s*(\d+)\s*B/);
    if (head) { pid = +head[1]; out.set(pid, +head[2] / MB); continue; }
    const phys = line.match(/^\s*phys_footprint:\s*(\d+)\s*B/);
    if (phys && pid !== null) out.set(pid, +phys[1] / MB);
  }
  return out;
}

const run = (file, args, timeout) => new Promise((done, fail) => {
  execFile(file, args, { encoding: 'utf8', timeout, maxBuffer: 16 * MB }, (error, stdout) => {
    // ps exits 1 when no listed process remains: an empty sample, not a failure
    if (error && !(error.code === 1 && file === 'ps')) fail(error);
    else done(stdout ?? '');
  });
});

// The tree's processes: its process group when the browser leads one (puppeteer and playwright start it detached), else
// (`whole`) every process, from which measureTree keeps the browser's descendants.
const SAMPLE_COLUMNS = ['-ww', '-o', 'pid=,pgid=,ppid=,rss=,command='];
const sampleArgs = (rootPid, whole) => [...SAMPLE_COLUMNS, ...(whole ? ['-A'] : ['-g', String(rootPid)])];
const sampleGroup = (rootPid, whole = false) => run('ps', sampleArgs(rootPid, whole), 15_000).then(parsePsRows);

function sampleGroupSync(rootPid, whole = false) {
  try {
    return parsePsRows(execFileSync('ps', sampleArgs(rootPid, whole),
      { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * MB, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch (error) {
    return parsePsRows(error?.stdout ?? '');
  }
}

/** Whether `row` is a browser process this process started: it carries this launch's token, or it is a direct child
 *  of this process running as Chrome's browser process. */
function startedHere(row, token) {
  if (!row) return false;
  if (row.command.includes(`${GUARD_SWITCH}=${token}`)) return true;
  return row.ppid === process.pid && processType(row.command) === 'browser' && /\s--remote-debugging-(?:pipe|port)/.test(row.command);
}

async function processRow(pid) {
  const rows = parsePsRows(await run('ps', ['-ww', '-o', 'pid=,pgid=,ppid=,rss=,command=', '-p', String(pid)], 15_000).catch(() => ''));
  return rows.find((row) => row.pid === pid) ?? null;
}

/** The browser process a playwright launch started (its Browser has no process()): a child of this process with the
 *  launch's token, else (a launcher that rewrote the args) the one unguarded browser child. */
async function findRootPid(token) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const children = parsePsRows(await run('ps', ['-A', '-o', 'pid=,pgid=,ppid=,rss='], 15_000).catch(() => ''))
      .filter((row) => row.ppid === process.pid).map((row) => row.pid);
    if (children.length) {
      const rows = parsePsRows(await run('ps', ['-ww', '-o', 'pid=,pgid=,ppid=,rss=,command=', '-p', children.join(',')], 15_000)
        .catch(() => ''));
      const tokened = rows.find((row) => row.command.includes(`${GUARD_SWITCH}=${token}`) && processType(row.command) === 'browser');
      if (tokened) return tokened.pid;
      const watched = new Set([...live].map((guard) => guard.rootPid));
      const untracked = rows.filter((row) => startedHere(row, token) && !watched.has(row.pid));
      if (attempt >= 4 && untracked.length === 1) return untracked[0].pid;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  return null;
}

/** The install a command line runs from: its .app bundle (Chrome for Testing, Google Chrome) or the binary's folder. */
export function browserInstallPrefix(command = '') {
  const executable = String(command).split(/\s--/)[0];
  const app = executable.indexOf('.app/');
  if (app >= 0) return executable.slice(0, app + 5);
  const slash = executable.lastIndexOf('/');
  return slash > 0 ? executable.slice(0, slash + 1) : executable;
}

/** Kill exactly the sampled tree processes that run from the browser's own install (browser first, so it starts nothing
 *  new); returns the pids signalled. */
function killTree(sample, guard) {
  const ordered = sample.processes
    .filter((item) => !guard.prefix || item.command.startsWith(guard.prefix))
    .map((item) => item.pid)
    .sort((a, b) => (a === guard.rootPid ? -1 : b === guard.rootPid ? 1 : 0));
  const killed = [];
  for (const pid of ordered) {
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) continue;
    try { process.kill(pid, 'SIGKILL'); killed.push(pid); } catch { /* already gone */ }
  }
  return killed;
}

/** Every process of the tree still alive, killed (a fresh sample of its group, so nothing outside it is touched). */
function reapTree(guard) {
  return killTree(measureTree(sampleGroupSync(guard.rootPid, guard.whole), guard.rootPid), guard);
}

const shortUrl = (url) => (String(url).length > 200 ? `${String(url).slice(0, 200)}…` : String(url));

function openPages(target) {
  return listPages(target).map(shortUrl);
}

function listPages(target) {
  try {
    if (typeof target?.targets === 'function') return target.targets().filter((item) => item.type() === 'page').map((item) => item.url());
    if (typeof target?.contexts === 'function') return target.contexts().flatMap((item) => item.pages()).map((page) => page.url());
    if (typeof target?.pages === 'function' && typeof target?.browser === 'function') {
      const pages = target.pages();
      if (Array.isArray(pages)) return pages.map((page) => page.url());
    }
  } catch { /* the connection is already gone */ }
  return [];
}

function hookProcess() {
  if (exitHooked) return;
  exitHooked = true;
  // exit (process.exit, an uncaught error, the end of the event loop): kill every tree still open, synchronously
  process.on('exit', () => {
    for (const guard of [...live]) { guard.stop(); reapTree(guard); }
  });
  // a perl alarm (`perl -e 'alarm shift; exec @ARGV' secs node tool.mjs`) ends node with SIGALRM, which runs no exit
  // handler: kill the trees first, then end with the alarm's usual 142
  if (process.listenerCount('SIGALRM') === 0) {
    process.on('SIGALRM', () => {
      for (const guard of [...live]) {
        guard.stop();
        writeSync(2, `[browser-guard] ${guard.label}: alarm; killed ${reapTree(guard).length} browser process(es)\n`);
      }
      process.exit(142);
    });
  }
}

const fmt = (mb) => `${(mb / 1024).toFixed(2)} GB`;

/**
 * Watch the process tree of a browser already launched (rootPid leads its process group). Returns the guard record:
 * { label, rootPid, peakRendererMb, peakTreeMb, tripped (null, or the trip report), stop(), finish() }.
 */
function watchBrowserTree(target, rootPid, guardOptions = {}) {
  const config = { ...browserGuardConfig(guardOptions), ...guardOptions.resolved };
  const label = guardOptions.label ?? (basename(process.argv[1] ?? 'node') || 'browser');
  const exit = guardOptions.exit !== false;
  const say = guardOptions.log ?? ((line) => writeSync(2, `${line}\n`));
  const footprints = new Map();
  let timer = null, ticks = 0, stopped = false;
  let root = sampleGroupSync(rootPid).find((row) => row.pid === rootPid);
  const whole = !root; // the browser leads no process group of its own: sample every process
  if (whole) root = sampleGroupSync(rootPid, true).find((row) => row.pid === rootPid);
  const guard = {
    label, rootPid, config, whole, prefix: root ? browserInstallPrefix(root.command) : null,
    peakRendererMb: 0, peakTreeMb: 0, samples: 0, tripped: null,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      live.delete(guard);
    },
    /** Stop watching and kill whatever of the tree is still alive (close, disconnect). */
    finish() {
      const wasLive = live.has(guard) || !stopped;
      guard.stop();
      return wasLive ? reapTree(guard) : [];
    },
  };

  const trip = (sample, why) => {
    guard.stop();
    const pages = openPages(target);
    const killed = killTree(sample, guard);
    const stragglers = reapTree(guard); // a helper started between the sample and the kill
    const hold = context.hold ?? null;
    const released = releaseAllCaptureHolds(`browser guard: ${why}`);
    guard.tripped = {
      at: new Date().toISOString(), label, hold, why, pid: process.pid, rootPid,
      rendererMb: Math.round(sample.rendererMb), rendererPid: sample.rendererPid, treeMb: Math.round(sample.treeMb),
      peakRendererMb: Math.round(guard.peakRendererMb), peakTreeMb: Math.round(guard.peakTreeMb),
      rendererCapMb: config.rendererCapMb, treeCapMb: config.treeCapMb, pages, killed: [...killed, ...stragglers],
      releasedHolds: released, exitCode: exit ? BROWSER_GUARD_EXIT_CODE : null,
      command: process.argv.slice(1).join(' ').slice(0, 300),
    };
    say(`[browser-guard] ${label}: ${why}; killed the browser's ${guard.tripped.killed.length} processes `
      + `(peak renderer ${fmt(guard.peakRendererMb)}, tree ${fmt(guard.peakTreeMb)}); hold ${hold ?? 'none'}`
      + `${released.length ? ` (capture lock released: ${released.join(', ')})` : ''}; pages: ${pages.join(' | ') || 'none'}`
      + `${exit ? `; exiting ${BROWSER_GUARD_EXIT_CODE}` : ''}`);
    for (const file of new Set([guardOptions.logFile ?? BROWSER_GUARD_LOG, BROWSER_GUARD_LOG])) {
      try { appendFileSync(file, `${JSON.stringify(guard.tripped)}\n`); } catch { /* best effort */ }
    }
    try { guardOptions.onTrip?.(guard.tripped); } catch { /* the report is out; the exit still happens */ }
    if (exit) process.exit(BROWSER_GUARD_EXIT_CODE);
  };

  const tick = async () => {
    timer = null;
    if (stopped) return;
    try {
      const rows = await sampleGroup(rootPid, whole);
      if (stopped) return;
      ticks += 1;
      if (ticks % FOOTPRINT_EVERY === 0) {
        const large = measureTree(rows, rootPid).processes
          .filter((item) => item.type !== 'browser' && item.mb >= Math.min(FOOTPRINT_FROM_MB, config.rendererCapMb / 2));
        footprints.clear();
        if (large.length) {
          const text = await run('/usr/bin/footprint', ['--noCategories', '-f', 'bytes', ...large.flatMap((item) => ['-p', String(item.pid)])],
            30_000).catch(() => '');
          for (const [pid, mb] of parseFootprint(text)) footprints.set(pid, mb);
        }
        if (stopped) return;
      }
      const sample = measureTree(rows, rootPid, footprints);
      guard.samples += 1;
      guard.peakRendererMb = Math.max(guard.peakRendererMb, sample.rendererMb);
      guard.peakTreeMb = Math.max(guard.peakTreeMb, sample.treeMb);
      if (!sample.pids.length) { guard.stop(); return; } // the browser is gone
      if (config.rendererCapMb > 0 && sample.rendererMb > config.rendererCapMb) {
        trip(sample, `renderer ${sample.rendererPid} at ${fmt(sample.rendererMb)} passed the ${fmt(config.rendererCapMb)} renderer cap`);
        return;
      }
      if (config.treeCapMb > 0 && sample.treeMb > config.treeCapMb) {
        trip(sample, `browser tree at ${fmt(sample.treeMb)} passed the ${fmt(config.treeCapMb)} tree cap`);
        return;
      }
    } catch { /* a slow or failed sample: try again next tick */ }
    if (!stopped) { timer = setTimeout(tick, config.intervalMs); timer.unref(); }
  };

  hookProcess();
  live.add(guard);
  timer = setTimeout(tick, Math.min(config.intervalMs, 500));
  timer.unref();
  return guard;
}

const guards = new WeakMap();

/** The guard record of a browser launchGuardedBrowser returned (peaks, tripped), or null. */
export function browserGuardOf(browser) {
  return guards.get(browser) ?? null;
}

/**
 * Launch a browser with the guard: `launcher` is puppeteer (or puppeteer-core) or a playwright browser type (chromium).
 * `options` are the launcher's own (args gain the guard's flags). `guard`: { label, method ('launch', 'launchServer',
 * 'launchPersistentContext'), userDataDir (persistent contexts), heapMb, rendererCapMb, treeCapMb, intervalMs,
 * rendererProcessLimit, exit (false: report and kill, keep the process), onTrip(report), log(line), logFile }.
 * A launcher that starts no browser of this process (a test double, or a fixture browser with a fake pid) gets its
 * result back unwatched: the guard only ever samples and kills a process tree this process started.
 */
export async function launchGuardedBrowser(launcher, options = {}, guard = {}) {
  const method = guard.method ?? 'launch';
  if (typeof launcher?.[method] !== 'function') throw new TypeError(`launchGuardedBrowser: the launcher has no ${method}()`);
  const config = browserGuardConfig(guard);
  const token = randomBytes(8).toString('hex');
  const launchOptions = { ...(options ?? {}), args: guardedLaunchArgs(options?.args ?? [], { ...config, token }) };
  const target = method === 'launchPersistentContext'
    ? await launcher.launchPersistentContext(guard.userDataDir ?? '', launchOptions)
    : await launcher[method](launchOptions);
  let rootPid = null;
  try { rootPid = target?.process?.()?.pid ?? null; } catch { rootPid = null; }
  if (rootPid) {
    // a pid this process did not start is a test double's (a fixture's fake child): nothing to watch, never to kill
    if (!startedHere(await processRow(rootPid), token)) return target;
  } else {
    // playwright: its Browser (or persistent context) has no process(); anything else without one is a test double
    const playwright = typeof target?.browserType === 'function' || (typeof target?.browser === 'function' && typeof target?.newPage === 'function');
    if (!playwright) return target;
    rootPid = await findRootPid(token);
    if (!rootPid) {
      try { await target.close(); } catch { /* best effort */ }
      throw new Error('browser guard: the launched browser process was not found; refusing to run it unguarded');
    }
  }
  const record = watchBrowserTree(target, rootPid, { ...guard, resolved: config });
  guards.set(target, record);
  // close (and a playwright server's kill) end the watch and leave no helper behind
  for (const name of ['close', 'kill']) {
    if (typeof target[name] !== 'function') continue;
    const original = target[name].bind(target);
    target[name] = async (...args) => {
      try { return await original(...args); } finally { record.finish(); }
    };
  }
  const onGone = () => setTimeout(() => record.finish(), 1000).unref();
  try {
    if (typeof target.on === 'function') for (const event of method === 'launch' ? ['disconnected'] : ['disconnected', 'close']) {
      target.on(event, onGone);
    }
  } catch { /* an emitter without these events */ }
  return target;
}
