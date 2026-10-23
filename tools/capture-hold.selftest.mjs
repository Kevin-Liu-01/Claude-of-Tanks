// runWarmHold (tools/capture-hold.mjs, 2026-10-22): warm while queued, frozen pages while waiting, the hold for shots
// only, the limit and grace, and cleanup on every path. A fake lock and fake pages record the order of events.
import assert from 'node:assert/strict';
import { runWarmHold } from './capture-hold.mjs';

function rig({ acquireError = null, freezeError = null } = {}) {
  const events = [];
  const lock = {
    async acquire(_ms, { prepare, place }) {
      events.push(`queue${place ? `:${place}` : ''}`);
      const prepared = await prepare();
      if (acquireError) throw Object.assign(new Error(acquireError), { prepared });
      events.push('hold');
      return prepared;
    },
    refresh() { return true; },
    release() { events.push('release'); return true; },
  };
  const freeze = async (page) => {
    if (freezeError) throw new Error(freezeError);
    events.push(`freeze ${page.name}`);
    return `session ${page.name}`;
  };
  const thaw = async (page, session) => { events.push(`thaw ${page.name} (${session})`); };
  return { events, lock, freeze, thaw, log: () => {} };
}
const pages = () => [{ name: 'a' }, { name: 'b' }];

{
  const { events, ...options } = rig();
  const result = await runWarmHold({ ...options, place: 'lane-x',
    warm: async () => { events.push('warm'); return { pages: pages(), close: async () => { events.push('close'); } }; },
    shoot: async ({ pages: warmed, signal, heldAt }) => {
      assert.equal(warmed.length, 2);
      assert.equal(signal.aborted, false);
      assert.ok(Number.isFinite(heldAt));
      events.push('shoot');
      return 'shots';
    } });
  assert.equal(result, 'shots');
  assert.deepEqual(events, ['queue:lane-x', 'warm', 'freeze a', 'freeze b', 'hold', 'thaw a (session a)', 'thaw b (session b)',
    'shoot', 'freeze a', 'freeze b', 'release', 'close'],
  'warm and freeze while queued; thaw, shoot, freeze again, release, then close');
}

{
  const { events, ...options } = rig();
  let stop;
  await assert.rejects(runWarmHold({ ...options, holdMinutes: 0.001, graceSeconds: 0.05,
    warm: async () => ({ pages: [], close: async () => { events.push('close'); stop(new Error('browser closed')); } }),
    shoot: ({ signal }) => new Promise((_, reject) => { stop = reject; signal.addEventListener('abort', () => events.push('abort')); }) }),
  /browser closed/);
  assert.deepEqual(events, ['queue', 'hold', 'abort', 'close', 'release'],
    'a shoot past the limit and the grace has its browser closed before the release');
}

{
  const { events, ...options } = rig({ acquireError: 'cot-shots lock timeout' });
  await assert.rejects(runWarmHold({ ...options,
    warm: async () => ({ pages: pages(), close: async () => { events.push('close'); } }), shoot: async () => events.push('shoot') }),
  /cot-shots lock timeout/);
  assert.deepEqual(events, ['queue', 'freeze a', 'freeze b', 'close'], 'a wait that ends without a hold closes the warm resources');
}

{
  const { events, ...options } = rig({ freezeError: 'target closed' });
  await assert.rejects(runWarmHold({ ...options,
    warm: async () => ({ pages: pages(), close: async () => { events.push('close'); } }), shoot: async () => events.push('shoot') }),
  /target closed/);
  assert.deepEqual(events, ['queue', 'close'], 'a page that cannot be frozen closes the warm resources and never holds');
}

{
  const { events, ...options } = rig();
  await assert.rejects(runWarmHold({ ...options,
    warm: async () => ({ pages: [], close: async () => { events.push('close'); } }),
    shoot: async () => { throw new Error('shot failed'); } }), /shot failed/);
  assert.deepEqual(events, ['queue', 'hold', 'release', 'close'], 'a failed shoot still releases and closes');
}

await assert.rejects(runWarmHold({ warm: async () => ({}) }), /needs warm\(\) and shoot\(\)/);
assert.deepEqual(['SIGTERM', 'SIGINT', 'SIGHUP'].map((signal) => process.listenerCount(signal)), [0, 0, 0],
  'every run removes its signal handlers');
console.log('capture-hold.selftest: warm and freeze while queued, thaw-shoot-refreeze in the hold, the limit and grace, and cleanup on every path');
