import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBattleAgainAction } from './battleAgainAction.ts';
import { createGarageReturnFailurePresenter } from '../ui/garageReturnFailure.ts';

const source = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const start = source.indexOf('const battleAgainAction = createBattleAgainAction({');
const end = source.indexOf("bus.on('ui:roomOpen', async", start);
assert.ok(start > 0 && end > start, 'exercise the actual main action/event composition');
const wiring = source.slice(start, end);
assert.equal(wiring.split("import('./ui/garageReturnFailure.ts')").length, 2,
  'exactly one lazy failure import, replaced only with a controlled deferred transfer');
const compose = new Function('createBattleAgainAction', 'garageReturn', 'game',
  'networkSession', 'bus', 'console', 'loadFailure', `
  let sceneWatchdogEntryGeneration = 0;
  ${wiring.replace("import('./ui/garageReturnFailure.ts')", 'loadFailure()')}
  return { run: battleAgainAction.run, advanceEntry() { sceneWatchdogEntryGeneration++; } };
`);
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function flush() { for (let index = 0; index < 6; index++) await Promise.resolve(); }
function fixture() {
  const events = new Map(), logs = [], notices = [], closes = [], imports = [];
  const game = { phase: 'ended' }, networkSession = { match: null };
  let actionCalls = 0, nextAction = () => Promise.resolve();
  const show = createGarageReturnFailurePresenter(() => ({
    body: { textContent: '' }, setTitle() {},
    open() { notices.push(game.phase); },
    close(options) { closes.push(options); },
  }), () => 'Retry loading');
  const module = { showGarageReturnFailure: show, hideGarageReturnFailure: () => show.hide() };
  const bus = {
    on(name, handler) { const list = events.get(name) ?? []; list.push(handler); events.set(name, list); },
    emit(name) { for (const handler of events.get(name) ?? []) handler(); },
  };
  const owner = compose(createBattleAgainAction, {
    battleAgain() { actionCalls++; return nextAction(); },
  }, game, networkSession, bus, { error: (...args) => logs.push(args) }, () => {
    const transfer = deferred(); imports.push(transfer); return transfer.promise;
  });
  return { ...owner, game, networkSession, bus, module, imports, notices, closes, logs,
    setAction(value) { nextAction = value; }, get actionCalls() { return actionCalls; } };
}

// A real return emits Garage phase before it can fail. Duplicate clicks while
// the same action is pending must still produce one notice and one lazy import.
{
  const f = fixture(), gate = deferred(), error = new Error('restore failed');
  f.setAction(async () => {
    f.game.phase = 'garage'; f.bus.emit('phase:change');
    await gate.promise; throw error;
  });
  assert.equal(f.imports.length, 0);
  const first = f.run(), duplicate = f.run();
  assert.equal(first, duplicate);
  await flush();
  assert.equal(f.actionCalls, 1);
  gate.resolve(); await flush();
  assert.equal(f.imports.length, 1);
  f.imports[0].resolve(f.module); await first;
  assert.deepEqual(f.notices, ['garage']);
  assert.equal(f.logs[0][1], error);
  // Ordinary retained-room updates do not dismiss the current error.
  f.bus.emit('network:roomState');
  assert.equal(f.closes.length, 0);
  f.bus.emit('ui:battleStart');
  assert.deepEqual(f.closes, [{ restoreFocus: false, immediate: true }]);
}

for (const event of ['ui:battleAgain', 'ui:battleStart', 'phase:change', 'ui:roomOpen', 'network:roomState']) {
  const f = fixture();
  f.setAction(async () => { throw new Error('old failure'); });
  const old = f.run(); await flush();
  if (event === 'ui:battleAgain') f.setAction(async () => {});
  if (event === 'network:roomState') f.networkSession.match = {};
  f.bus.emit(event); await flush();
  f.imports[0].resolve(f.module); await old;
  assert.equal(f.notices.length, 0, `${event}: stale failure cannot cover the newer owner`);
}

// Snapshot checks supplement event invalidation, including direct/debug entry.
for (const change of ['phase', 'epoch', 'room']) {
  const f = fixture();
  f.setAction(async () => { throw new Error('old'); });
  const old = f.run(); await flush();
  if (change === 'phase') f.game.phase = 'battle';
  if (change === 'epoch') f.advanceEntry();
  if (change === 'room') f.networkSession.match = {};
  f.imports[0].resolve(f.module); await old;
  assert.equal(f.notices.length, 0, `${change}: post-import ownership check`);
}

{
  const f = fixture();
  f.setAction(async () => { throw new Error('first'); });
  const first = f.run(); await flush();
  f.setAction(async () => { throw new Error('second'); });
  const second = f.run(); await flush();
  assert.equal(f.imports.length, 2, 'pending notice transfer does not block a real retry');
  f.imports[1].resolve(f.module); await second;
  f.imports[0].resolve(f.module); await first;
  assert.equal(f.notices.length, 1, 'older import resolution cannot replace the new error');
  assert.equal(f.logs.filter(([message]) => message === 'Battle Again failed').length, 2);
}
{
  const f = fixture(), failedImport = new Error('chunk offline');
  f.setAction(() => { throw new Error('synchronous adapter failure'); });
  const first = f.run(); await flush();
  f.bus.emit('ui:roomOpen');
  f.imports[0].reject(failedImport); await first;
  assert.equal(f.notices.length, 0);
  assert.equal(f.logs.at(-1)[1], failedImport, 'even stale import rejection is observed');
  f.setAction(async () => {});
  await f.run();
  assert.equal(f.actionCalls, 2, 'failed notice transfer does not retain action ownership');
}
console.log('battleAgainAction.selftest: actual main wiring, coalescing, stale notices and failure observation pass');
