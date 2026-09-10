import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkGarageBattleActions, checkGarageActionAudio, GARAGE_BATTLE_ACTIONS } from './garage-battle-actions-contract.mjs';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectGarageActionOutcome, waitForGarageAction } from './garage-action-failure.mjs';
import { withGarageActionProfile } from './garage-action-timing.mjs';

const rows = GARAGE_BATTLE_ACTIONS.map((action, index) => {
  const returning = action === 'return-to-garage';
  const selected = { selectedSpecId: 'm1a1', selectedMapId: 'urban' };
  return { action, trusted: true, coverMs: 220, totalMs: 4000,
    before: { ...selected, battleOrdinal: index },
    after: { ...selected, phase: returning ? 'garage' : 'battle',
      battleOrdinal: index + 1, playerSpecId: 'm1a1', mapId: 'urban', pedestalSpecId: 'm1a1' } };
});
assert.deepEqual(checkGarageBattleActions(rows), []);
assert.ok(checkGarageActionAudio(rows).length, 'absent clock evidence does not pass the separate audio gate');
const audioRows = structuredClone(rows);
const loadingBefore = { atMs: 100, contextId: 1, state: 'running', currentTimeS: 1,
  loadingActive: true, covered: true };
audioRows[0].audio = { loadingActiveObserved: true, observationErrors: [],
  coveredLoadingClockWitness: { before: loadingBefore, after: { ...loadingBefore, atMs: 120, currentTimeS: 1.02 } } };
audioRows[2].audio = { completion: { contextId: 1, state: 'running', loadingActive: false, ambientActive: false } };
assert.deepEqual(checkGarageActionAudio(audioRows), []);
for (const [key, value] of [['contextId', 2], ['state', 'suspended'], ['currentTimeS', 1],
  ['currentTimeS', NaN], ['covered', false], ['loadingActive', false], ['atMs', Infinity]]) {
  const changed = structuredClone(audioRows);
  changed[0].audio.coveredLoadingClockWitness.after[key] = value;
  assert.ok(checkGarageActionAudio(changed).length, `audio witness rejects ${key}=${value}`);
  assert.deepEqual(checkGarageBattleActions(changed), [], 'audio evidence never changes functional handoff policy');
}
for (const [key, value] of [['loadingActive', true], ['ambientActive', true], ['state', 'closed'], ['contextId', 2]]) {
  const changed = structuredClone(audioRows);
  changed[2].audio.completion[key] = value;
  assert.ok(checkGarageActionAudio(changed).length, `return audio rejects ${key}=${value}`);
}
for (const [property, value] of [['trusted', false], ['coverMs', null], ['coverMs', 501], ['totalMs', 0]]) {
  const changed = structuredClone(rows);
  changed[1][property] = value;
  assert.ok(checkGarageBattleActions(changed).length, `reject ${property}=${value}`);
}
for (const [property, value] of [['battleOrdinal', 4], ['phase', 'garage'],
  ['playerSpecId', 't90'], ['mapId', 'desert'], ['selectedSpecId', 't90']]) {
  const changed = structuredClone(rows);
  changed[1].after[property] = value;
  assert.ok(checkGarageBattleActions(changed).length, `reject handoff ${property}=${value}`);
}
assert.ok(checkGarageBattleActions(rows.slice(1)).length, 'missing initial click cannot pass');
const source = await readFile(new URL('./garage-battle-actions-probe.mjs', import.meta.url), 'utf8');
assert.match(source, /await page\.click\(selector\)/, 'the measured actions use browser input');
assert.match(source, /__DEBUG\.slayEnemies\(\)/, 'fixture ending uses the maintained diagnostic owner');
assert.doesNotMatch(source, /__DEBUG\.(beginBattleEntry|beginSoloBattle|enterGarage|leaveBattleToGarage)\(/,
  'real-action coverage must not fall back to bypassing the controls');

const retryTitles = await Promise.all(['en-US', 'zh-CN'].map(async locale => JSON.parse(
  await readFile(new URL(`../src/ui/i18nCatalog.${locale}.json`, import.meta.url), 'utf8'))['boot.retry']));
const originals = new Map(['document', 'window', 'getComputedStyle'].map(name =>
  [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
let panels = [], done = false;
const modal = (title, message, extra = {}) => ({
  title, message, titleId: 'cot-modal-1-title', opacity: '1', shown: true,
  getAttribute() { return this.titleId; },
  getClientRects() { return this.shown ? [{}] : []; },
  closest() { return this; },
  querySelector(selector) {
    assert.equal(selector, '.cot-modal__body');
    return { textContent: this.message };
  }, ...extra,
});
Object.defineProperties(globalThis, {
  document: { configurable: true, value: {
    querySelectorAll(selector) {
      assert.equal(selector, '.cot-modal-root.is-open:not([hidden]) [role="dialog"][aria-modal="true"]');
      return panels;
    },
    getElementById: id => ({ textContent: panels.find(panel => panel.titleId === id)?.title }),
  } },
  window: { configurable: true, value: { __ACTION_TRACE: { done: () => done } } },
  getComputedStyle: { configurable: true, value: root => ({ opacity: root.opacity }) },
});
try {
  assert.equal(inspectGarageActionOutcome({ retryTitles }), false);
  panels = [modal('Settings', 'not an action failure')];
  assert.equal(inspectGarageActionOutcome({ retryTitles }), false, 'ordinary dialogs do not fail actions');
  panels = [modal(retryTitles[0], 'budget exceeded', { shown: false })];
  assert.equal(inspectGarageActionOutcome({ retryTitles }), false, 'hidden notices do not fail actions');
  panels[0].shown = true;
  panels[0].opacity = '0';
  assert.equal(inspectGarageActionOutcome({ retryTitles }), false, 'unpainted notices are not yet visible');
  panels[0].opacity = '1';
  const baseline = inspectGarageActionOutcome({ retryTitles, baselineOnly: true }).modals;
  assert.equal(inspectGarageActionOutcome({ retryTitles, priorModals: baseline }), false,
    'an old visible notice is not an error from the newly measured action');
  panels[0].message = 'new readiness budget failure';
  done = true;
  assert.equal(inspectGarageActionOutcome({ retryTitles, priorModals: baseline }).failure.message,
    'new readiness budget failure', 'new failure wins over an underlying ready Garage');
  panels = [modal(retryTitles[1], '重试错误')];
  assert.equal(inspectGarageActionOutcome({ retryTitles }).failure.title, retryTitles[1]);
  panels = [];
  assert.deepEqual(inspectGarageActionOutcome({ retryTitles }), { done: true });
} finally {
  for (const [name, original] of originals) {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  }
}

function waitFixture({ outcome = { done: true }, waiting = false, disposeFails = false } = {}) {
  const page = new EventEmitter();
  const counts = { waits: 0, disposed: 0, aborted: 0 };
  page.evaluate = async () => ({ modals: [{ titleId: 'old', title: retryTitles[0], message: 'past' }] });
  page.waitForFunction = async (inspect, options, argument) => {
    counts.waits++;
    assert.equal(inspect, inspectGarageActionOutcome);
    assert.equal(options.timeout, 90000);
    assert.equal(argument.priorModals[0].titleId, 'old');
    if (waiting) return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { counts.aborted++; reject(options.signal.reason); }, { once: true });
      queueMicrotask(() => page.emit('console', { type: () => 'error', text: () => 'new console error' }));
    });
    return { jsonValue: async () => outcome, dispose: async () => {
      counts.disposed++;
      if (disposeFails) throw new Error('dispose failure');
    } };
  };
  return { page, counts, run: (click = async () => {}, onCleanupError) =>
    waitForGarageAction(page, { action: 'battle-again', retryTitles, timeoutMs: 90000, onCleanupError }, click) };
}
const clean = waitFixture();
clean.page.emit('console', { type: () => 'error', text: () => 'old error' });
await clean.run(async () => clean.page.emit('console', { type: () => 'warn', text: () => 'warning only' }));
assert.equal(clean.counts.disposed, 1);
assert.equal(clean.page.listenerCount('console'), 0);
assert.equal(clean.page.listenerCount('pageerror'), 0);
const clickFailure = waitFixture();
await assert.rejects(clickFailure.run(async () => clickFailure.page.emit('pageerror', new Error('click failure'))),
  error => error.actionFailure.action === 'battle-again' && error.actionFailure.kind === 'pageerror');
assert.equal(clickFailure.counts.waits, 0, 'a click-time failure never starts a long wait');
const waitingFailure = waitFixture({ waiting: true });
await assert.rejects(waitingFailure.run(), /console-error: new console error/);
assert.equal(waitingFailure.counts.aborted, 1, 'console error cancels the real pending wait');
assert.equal(waitingFailure.page.listenerCount('console'), 0);
const modalFailure = waitFixture({ outcome: { failure: { kind: 'failure-modal', message: 'budget' } }, disposeFails: true });
const cleanup = [];
await assert.rejects(modalFailure.run(undefined, error => cleanup.push(error.message)), /failure-modal: budget/);
assert.deepEqual(cleanup, ['dispose failure'], 'cleanup does not overwrite the original modal failure');
const profileEvents = [], profileReceipts = [];
const guardedFailure = waitFixture({ waiting: true });
await assert.rejects(withGarageActionProfile({
  enabled: true, action: 'battle-again', page: { evaluate: async () => 1 },
  cdp: { send: async method => { profileEvents.push(method); return { profile: {} }; } },
  onProfile: async (_profile, capture) => profileReceipts.push(capture), onCleanupError: assert.fail,
}, () => guardedFailure.run()), /console-error/);
assert.equal(profileReceipts[0].completedAction, false, 'fast failure retains incomplete profile evidence');
assert.deepEqual(profileEvents.slice(-2), ['Profiler.stop', 'Profiler.disable']);
assert.match(source, /report\.partialAction = await page\.evaluate/, 'partial action capture survives fast failure');
assert.match(source, /report\.actionFailure = error\.actionFailure/, 'failure reason is retained in the report');
console.log('garage-battle-actions-contract.selftest: real-click, cover, route and completion receipts pass');

// Signal cleanup runs the actual probe with fake ports, never a browser/lease.
{
  const probePath = fileURLToPath(new URL('./garage-battle-actions-probe.mjs', import.meta.url));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const index = 'frozen-r9-index';
  const indexHash = createHash('sha256').update(index).digest('hex');
  let assertions = 0;
  function equal(a, b, message) { assert.deepEqual(a, b, message); assertions++; }
  function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
  function fakeProcess() { return Object.assign(new EventEmitter(), {
    argv: ['node', probePath, '--url=http://127.0.0.1:5994', '--out=/fake-evidence'],
    execPath: '/fake-node', env: {}, exitCode: undefined,
  }); }
  async function execute(file, ports) {
    const source = (await readFile(file, 'utf8')).replace(/^import [\s\S]*?;\n/gm, '')
      .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href));
    await new AsyncFunction(...Object.keys(ports), source)(...Object.values(ports));
  }

  async function probeCase(phase) {
    const process = fakeProcess(), writes = [], navigation = deferred();
    const calls = { acquired: 0, released: 0, launched: 0, page: 0, closed: 0, gate: 0 };
    let closed = false, action = '';
    const page = {
      isClosed: () => closed, setDefaultTimeout() {}, setViewport: async () => {},
      createCDPSession: async () => ({}), on() {}, evaluateOnNewDocument: async () => {},
      waitForFunction: async () => {}, waitForSelector: async () => {}, click: async () => {},
      screenshot: async () => {},
      async goto() {
        if (phase === 'active') { process.emit('SIGINT'); return navigation.promise; }
        return { ok: () => true, text: async () => index };
      },
      async evaluate(fn, ...args) {
        const body = String(fn);
        if (body.includes('__ACTION_TRACE.arm')) action = args[0];
        if (body.includes('__ACTION_TRACE.finish')) return { action };
        return {};
      },
    };
    const browser = { version: async () => 'Fake lifecycle browser',
      async newPage() { calls.page++; return page; },
      async close() {
        calls.closed++; equal(calls.released, 0, 'browser closes before its owned lease is released');
        closed = true;
        if (phase === 'active') navigation.reject(new Error('Target closed'));
        if (phase === 'closing') process.emit('SIGTERM');
      },
    };
    await execute(probePath, {
      process, URL, console: { log() {} }, createHash, resolve,
      setInterval: () => ({ unref() {} }), clearInterval() {},
      mkdir: async () => {}, readFile: async url => String(url).endsWith('.json') ? '{"boot.retry":"Retry"}' : 'source',
      writeFile: async (file, text) => writes.push({ file, value: JSON.parse(text) }),
      createCaptureLock: () => ({ async acquire() {
        if (phase === 'queued' || phase === 'rejected-queue') {
          process.emit('SIGTERM');
          equal(calls.released, 0, 'queued signal does not release a foreign lease');
          equal(calls.launched, 0, 'queued signal does not launch a browser');
        }
        if (phase === 'rejected-queue') throw new Error('Queue rejected');
        calls.acquired++;
      }, refresh() {}, release() { calls.released++; } }),
      puppeteer: { async launch(options) {
        calls.launched++;
        equal([options.handleSIGINT, options.handleSIGTERM], [false, false],
          'Puppeteer default signal listeners cannot exit the process before the owned finally');
        if (phase === 'launching') process.emit('SIGTERM');
        return browser;
      } },
      checkGarageBattleActions: () => { calls.gate++; return []; }, checkGarageActionAudio: () => [],
      readPhaseEnvironment() {}, installGarageActionTiming() {}, summarizeGarageActionTiming: () => ({}),
      withGarageActionProfile: async (options, run) => run(),
      waitForGarageAction: async (page, options, click) => click(),
    });
    equal(writes.length, 1, 'one final receipt is retained');
    const report = writes[0].value;
    equal(calls.released, calls.acquired, 'release occurs exactly once only after own acquisition');
    equal(calls.closed, calls.launched, 'every launched browser is closed exactly once');
    equal(process.listenerCount('SIGINT') + process.listenerCount('SIGTERM'), 0, 'signal handlers are removed after cleanup');
    if (phase === 'normal') {
      equal(report.pass, true, 'unchanged success still passes existing gates');
      equal(report.actions.map(row => row.action), ['battle', 'battle-again', 'return-to-garage'], 'all existing actions remain');
    } else {
      equal(report.pass, false, 'interruption cannot report pass even when functional/audio gates return no errors');
      equal(report.interruptedBy, phase === 'active' ? 'SIGINT' : 'SIGTERM', 'signal is recorded');
      equal(process.exitCode, phase === 'active' ? 130 : 143, 'interrupted process is nonzero');
    }
    if (phase === 'queued' || phase === 'rejected-queue') equal(calls.launched, 0, 'queued canceled owner aborts before launch');
    if (phase === 'launching') equal(calls.page, 0, 'late launched browser is closed before page/actions');
    if (phase === 'closing') equal(calls.gate, 1, 'late cleanup cancellation defeats an otherwise successful run');
  }
  for (const phase of ['queued', 'rejected-queue', 'launching', 'active', 'closing', 'normal']) await probeCase(phase);

  console.log(`garage-battle-actions-contract.selftest: ${assertions} lifecycle assertions pass`);
}
