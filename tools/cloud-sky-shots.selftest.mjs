// tools/cloud-sky-shots.mjs on the hold wrapper (round 8 Y8, sweep s6-01). The tool (269, clouds-269) held the GPU through
// its own acquire, signal handlers and close() helper, staged its first unit inside acquire's prepare (a staging failure
// there rejected the whole hold: nothing shot, and a resumed run put the same unit first again), and raced each unit
// against a ten-minute sleep without stopping the loser, which ran on against the run's shared browser: a launch that came
// back past its unit's budget became the run's browser over the one the next unit launched (`browser ??= await launch()`),
// which nothing closed. It holds through withCaptureHold now, and each unit's run is one owner (its state, budget, abort and
// page); its browsers come from one pool the hold's teardown closes before the release.
// The tool's own main runs here (its parse, units, manifests, staging and shooting code) on a real private capture lock (a
// lock and queue directory under tmpdir, as capture-hold-phases.selftest does) with a stand-in browser whose page calls
// answer at once or as a case scripts, a stand-in preview server, and no settle waits. Cases:
//   table    the unit states and their one transition function: each listed move, an ended unit's end standing, and a
//            move the table does not list refused by name; the source has one writer of a unit's state;
//   normal   three yards shot on one browser; the browser closes before the release; no timer of the run outlives it;
//   failure  a yard's staging fails mid-run: its browser is recycled, the next yard is shot on a fresh one, and every
//            browser closes before the release (exit 1);
//   warm     the first yard's staging fails while the hold is queued: once (it is opened again in the hold and shot) and
//            always (it fails, the next yard is still shot; exit 1);
//   stall    a launch that stalls past its unit's budget: the unit times out, the next yard launches its own browser, and
//            the late browser is closed when it comes back, so one browser is open when that yard is shot;
//   signal   SIGTERM and SIGINT while a yard is shooting (a child process each): the browser closes, then the release, then
//            the exit 143 / 130.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';
import { main, nextUnitState, UNIT_EDGES, UNIT_STATES } from './cloud-sky-shots.mjs';

const SELF = fileURLToPath(import.meta.url);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const roots = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'cot-cloud-sky-')); roots.push(dir); return dir; };

/** The capture lock on private directories, its holds and acted releases recorded (`record(event)`). */
function privateLock(root, record) {
  const lock = createCaptureLock({ lockDir: join(root, 'lock'), queueDir: join(root, 'queue'), log: () => {} });
  return new Proxy(lock, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (key === 'acquire') return async (...args) => { const prepared = await value.apply(target, args); record('hold'); return prepared; };
      if (key === 'release') return (...args) => { const acted = value.apply(target, args); if (acted) record('release'); return acted; };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Chrome as the tool drives it. `script({ browser, unit, method, name, arg })` gives a page call its answer: `{ ms, value,
 * error }` (ms 0: at once; Infinity: never). Browser `b<n>` launches after `launchMs(n)`. Pages carry the yard their tool
 * staged (bootPage's garage variant). Every launch, page and close is recorded; a closed browser or page refuses calls.
 */
function standInChrome({ record, script = () => ({}), launchMs = () => 0 }) {
  let launched = 0;
  const browsers = [];
  const launcher = {
    async launch() {
      const name = `b${++launched}`;
      const wait = launchMs(launched);
      if (wait) await sleep(wait);
      let connected = true;
      const pages = new Set();
      const alive = setInterval(() => {}, 10_000); // Chrome's pipe keeps a tool's process alive
      record(`launch ${name}`);
      const browser = {
        name,
        get connected() { return connected; },
        async newPage() {
          if (!connected) throw new Error(`${name}: Target closed`);
          let open = true, unit = null;
          const page = {
            on() {},
            async setViewport() {},
            async evaluateOnNewDocument(fn, ...args) { if (typeof fn === 'function') unit = args[2] ?? unit; },
            async bringToFront() { if (!open) throw new Error('Target closed'); },
            async createCDPSession() { return { send: async () => { if (!open) throw new Error('Target closed'); } }; },
            async close() { if (open) { open = false; pages.delete(page); } },
            goto: (url) => call('goto', '', url),
            waitForFunction: (expression, _options, ...args) => {
              if (typeof expression === 'function') unit = args[0] ?? unit;
              return call('waitForFunction', typeof expression === 'function' ? expression.name || 'fn' : 'expression', expression);
            },
            evaluate: (fn, arg) => call('evaluate', fn.name || 'fn', arg),
            screenshot: (options) => call('screenshot', 'screenshot', options),
          };
          const call = (method, fnName, arg) => {
            if (!open || !connected) return Promise.reject(new Error(`Protocol error (${method}): Target closed`));
            const { ms = 0, value, error, mark = null } = script({ browser: name, unit, method, name: fnName, arg }) ?? {};
            const answer = () => { if (mark) record(mark); return error ? Promise.reject(error) : Promise.resolve(value); };
            if (!ms) return answer();
            return new Promise((resolve, reject) => {
              const timer = Number.isFinite(ms) ? setTimeout(() => {
                if (!open || !connected) reject(new Error(`Protocol error (${method}): Target closed`));
                else answer().then(resolve, reject);
              }, ms) : null;
              const cut = setInterval(() => { if (!open || !connected) { clearTimeout(timer); clearInterval(cut); reject(new Error(`Protocol error (${method}): Target closed`)); } }, 20);
              if (timer) setTimeout(() => clearInterval(cut), ms + 1);
            });
          };
          pages.add(page);
          return page;
        },
        async close() {
          if (!connected) return;
          connected = false;
          clearInterval(alive);
          pages.clear();
          record(`close ${name}`);
        },
      };
      browsers.push(browser);
      return browser;
    },
  };
  return { launcher, browsers, openBrowsers: () => browsers.filter((browser) => browser.connected).map((browser) => browser.name) };
}

/** A run of the tool's main over `yards` (one desktop job) with the stand-ins; its events, lines, manifest and exit code. */
async function run({ yards, script, launchMs, unitBudgetMs, root = scratch() }) {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  const jobs = join(root, 'jobs.json');
  writeFileSync(jobs, JSON.stringify([{ name: 'job', dist, device: 'desktop', garage: yards }]));
  const events = [], said = [];
  const record = (event) => { events.push(event); };
  const chrome = standInChrome({ record, script, launchMs });
  const startServer = async () => ({ url: 'http://127.0.0.1:9', close: async () => record('server closed') });
  const timersBefore = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
  const code = await main([`--out=${join(root, 'out')}`, `--jobs=${jobs}`, '--wait-hours=0.05'], {
    launcher: chrome.launcher, startServer, hold: { lock: privateLock(root, record), log: (line) => said.push(line) },
    pause: async () => {}, freeGb: () => 500, log: (line) => said.push(line), ...(unitBudgetMs ? { unitBudgetMs } : {}),
  });
  const timersAfter = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
  const manifestFile = join(root, 'out', 'job', 'manifest-v1.json');
  const shot = existsSync(manifestFile) ? Object.keys(JSON.parse(readFileSync(manifestFile, 'utf8')).units) : [];
  return { code, events, said: said.join('\n'), shot, chrome, timersBefore, timersAfter };
}
/** Every browser the run launched closed before its (one) release. */
function closedBeforeRelease({ events, chrome }) {
  const release = events.indexOf('release');
  assert.ok(release >= 0 && events.lastIndexOf('release') === release, `one release (${events.join(', ')})`);
  for (const { name } of chrome.browsers) {
    const closed = events.indexOf(`close ${name}`);
    assert.ok(closed >= 0 && closed < release, `${name} closed before the release (${events.join(', ')})`);
  }
}
const garagePredicate = ({ method, name }) => method === 'waitForFunction' && name === 'fn'; // stageUnit's yard wait
const shooting = ({ method }) => method === 'screenshot';

if (process.argv[2] === '--signal-child') {
  // ---- the signal child: a real private lock, the yard's shot never answers; the parent signals it ----------------------
  const root = process.argv[3], eventsFile = join(root, 'events');
  const record = (event) => appendFileSync(eventsFile, `${event}\n`);
  const chrome = standInChrome({ record, script: (call) => (shooting(call) ? (record('shooting'), { ms: Infinity }) : {}) });
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'jobs.json'), JSON.stringify([{ name: 'job', dist, device: 'desktop', garage: ['g0', 'g1'] }]));
  await main([`--out=${join(root, 'out')}`, `--jobs=${join(root, 'jobs.json')}`, '--wait-hours=0.05'], {
    launcher: chrome.launcher, startServer: async () => ({ url: 'http://127.0.0.1:9', close: async () => record('server closed') }),
    hold: { lock: privateLock(root, record), log: () => {} }, pause: async () => {}, freeGb: () => 500, log: () => {},
  });
  record('main returned'); // never: the hold's signal owner exits the process
} else {
  try {
    // ---- table: the unit states and their one transition function -------------------------------------------------------
    {
      const ended = new Set(['shot', 'failed', 'timeout', 'stopped']);
      let allowed = 0, refused = 0;
      for (const from of UNIT_STATES) {
        for (const to of UNIT_STATES) {
          if (ended.has(from)) { assert.equal(nextUnitState(from, to), null, `${from} has ended: ${to} is ignored`); continue; }
          if (UNIT_EDGES[from].includes(to)) { assert.equal(nextUnitState(from, to), to); allowed++; continue; }
          assert.throws(() => nextUnitState(from, to), new RegExp(`a unit cannot move ${from} -> ${to}`));
          refused++;
        }
      }
      assert.deepEqual([allowed, refused], [14, 7], 'the table: 14 moves, 7 refused');
      for (const live of ['staging', 'warm', 'shooting']) {
        for (const end of ['failed', 'timeout', 'stopped']) assert.ok(UNIT_EDGES[live].includes(end), `${live} can end ${end}`);
      }
      assert.throws(() => nextUnitState('staging', 'queued'), /no unit state queued/);
      const source = readFileSync(new URL('./cloud-sky-shots.mjs', import.meta.url), 'utf8');
      assert.equal([...source.matchAll(/\bstate = /g)].length, 2, 'a unit\'s state is written in one place (its declaration and move())');
      assert.doesNotMatch(source, /\bcreateCaptureLock\b|process\.once\(|\bheld = /, 'no acquire, signal handler or held flag of its own');
      assert.match(source, /readinessExpression\('garage'\)/, 'the boot waits on the readiness probe');
    }

    // ---- normal: three yards on one browser; the browser closes before the release -----------------------------------------
    {
      const result = await run({ yards: ['g0', 'g1', 'g2'] });
      assert.equal(result.code, 0, result.said);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g1', 'garage-g2']);
      assert.deepEqual(result.chrome.browsers.map(({ name }) => name), ['b1'], 'one browser for three yards');
      closedBeforeRelease(result);
      assert.ok(result.events.indexOf('launch b1') < result.events.indexOf('hold'), 'the first yard staged while queued');
      assert.equal(result.timersAfter, result.timersBefore, 'no timer of the run outlives it (the old ten-minute race kept the process alive)');
    }

    // ---- failure: a yard's staging fails mid-run ----------------------------------------------------------------------------
    {
      const result = await run({ yards: ['g0', 'g1', 'g2'],
        script: (call) => (garagePredicate(call) && call.unit === 'g1' ? { error: new Error('the yard never presented') } : {}) });
      assert.equal(result.code, 1, result.said);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g2'], 'the failed yard is left; the next is shot');
      assert.match(result.said, /job garage-g1 failed: the yard never presented/);
      assert.deepEqual(result.chrome.browsers.map(({ name }) => name), ['b1', 'b2'], 'a failed unit recycles its browser');
      assert.ok(result.events.indexOf('close b1') < result.events.indexOf('launch b2'), 'the failed unit\'s browser closed before the next launch');
      closedBeforeRelease(result);
    }

    // ---- warm: the first yard's staging fails while the hold is queued ------------------------------------------------------
    {
      let tries = 0;
      const once = await run({ yards: ['g0', 'g1'],
        script: (call) => (garagePredicate(call) && call.unit === 'g0' && ++tries === 1 ? { error: new Error('cold cache') } : {}) });
      assert.equal(once.code, 0, once.said);
      assert.deepEqual(once.shot, ['garage-g0', 'garage-g1'], 'the yard is opened again in the hold and shot');
      assert.match(once.said, /garage-g0 failed: cold cache \(staging it while queued\); opening it again in the hold/);
      closedBeforeRelease(once);
      const always = await run({ yards: ['g0', 'g1'],
        script: (call) => (garagePredicate(call) && call.unit === 'g0' ? { error: new Error('no such yard') } : {}) });
      assert.equal(always.code, 1, always.said);
      assert.deepEqual(always.shot, ['garage-g1'], 'a first unit that never stages costs that unit, not the run');
      closedBeforeRelease(always);
    }

    // ---- stall: a launch past its unit's budget -----------------------------------------------------------------------------
    {
      // g0's frame fails (its browser b1 recycled); g1's launch (b2) comes back 3.8 s on, past its 3 s budget; g2 launches b3
      // and its frame is taken 1.5 s in, after b2 came back
      const result = await run({ yards: ['g0', 'g1', 'g2'], unitBudgetMs: 3000, launchMs: (n) => (n === 2 ? 3800 : 0),
        script: (call) => {
          if (shooting(call) && call.unit === 'g0') return { error: new Error('the frame failed') };
          if (shooting(call) && call.unit === 'g2') return { ms: 1500, mark: 'shot g2' };
          return {};
        } });
      assert.equal(result.code, 1, result.said);
      assert.deepEqual(result.shot, ['garage-g2']);
      assert.match(result.said, /job garage-g1 timeout/);
      const at = (event) => result.events.indexOf(event);
      assert.ok(at('launch b3') >= 0 && at('launch b2') > at('launch b3') && at('shot g2') > at('launch b2'),
        `b2 came back while g2 shot on b3 (${result.events.join(', ')})`);
      assert.ok(at('close b2') > at('launch b2') && at('close b2') < at('shot g2'), `the late browser is closed as it comes back (${result.events.join(', ')})`);
      const before = result.events.slice(0, at('shot g2'));
      const open = before.filter((event) => event.startsWith('launch ')).map((event) => event.slice(7)).filter((name) => !before.includes(`close ${name}`));
      assert.deepEqual(open, ['b3'], 'one browser open when g2 is shot');
      closedBeforeRelease(result);
    }

    // ---- signal: SIGTERM and SIGINT while a yard shoots ---------------------------------------------------------------------
    for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
      const root = scratch(), eventsFile = join(root, 'events');
      const child = spawn(process.execPath, ['--max-old-space-size=1024', SELF, '--signal-child', root], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
      const events = () => (existsSync(eventsFile) ? readFileSync(eventsFile, 'utf8').trim().split('\n') : []);
      for (let i = 0; i < 1200 && !events().includes('shooting'); i++) await sleep(50);
      assert.ok(events().includes('shooting'), `${signal}: the child reached the yard's shot (${events().join(', ')}) ${output.slice(-600)}`);
      child.kill(signal);
      const exit = await new Promise((done) => child.once('close', (status) => done(status)));
      const seen = events();
      assert.equal(exit, code, `${signal}: exits 128 + n (${seen.join(', ')}) ${output.slice(-600)}`);
      assert.ok(seen.includes('hold') && seen.indexOf('close b1') >= 0 && seen.indexOf('close b1') < seen.indexOf('release'),
        `${signal}: the browser closes before the release (${seen.join(', ')})`);
      assert.ok(!seen.includes('main returned'), `${signal}: the run did not go on past the signal`);
    }
  } finally {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  }
  console.log('cloud-sky-shots.selftest: one hold through withCaptureHold, each unit one owner: browsers closed before the release on '
    + 'the way out, after a failure and on SIGTERM/SIGINT; a first unit that fails while queued is opened again; a launch past its '
    + 'budget closes as it comes back');
}
