// replayRecordingAccess.selftest.mjs — the battle recorder behind its lazy chunk (replay-lazy-276; 276's entry carried the
// whole recorder, +10.8 kB br). Copyright © 2026 Kevin B. Liu.
//
// Held, with a stub chunk (the recorder's own behaviour is replayRoundTrip's and the receipts beside it):
//  1. nothing loads until asked; before then the port is idle (inactive, no finish, every tap a no-op), the rules it
//     wrapped at boot call the plain rules, and a setup that finds no recorder is reported, never silently unrecorded;
//  2. once preloaded, one recorder is made, every tap reaches it (read at each call, so a tool's patch of a method is
//     honoured), and the boot-wrapped rules now go through the recorder's own wrapper, made once per port;
//  3. a battle set up after the preload is recorded from its first step: the order main.ts keeps (preload with the solo
//     authority, then setupBattle's beginSetup, then the steps) loses no step;
//  4. a failed chunk load leaves the port idle and the next preload asks again.
import assert from 'node:assert/strict';
import { createReplayRecordingAccess } from './replayRecordingAccess.ts';

/** A stub recorder: logs every call; `armed` once beginSetup and endSetup have run. */
function stubRecorder(log) {
  let armed = false;
  return {
    trace: false,
    get active() { return armed; },
    probeCost: (iterations) => iterations / 1000,
    beginSetup: (game, specId) => { log.push(['beginSetup', specId]); },
    endSetup: () => { armed = true; log.push(['endSetup']); },
    beforeStep: () => { if (armed) log.push(['beforeStep']); },
    afterStep: () => { if (armed) log.push(['afterStep']); },
    wrapRules(rules) {
      log.push(['wrapRules']);
      return { ...rules, selectShell: (...args) => { const result = rules.selectShell(...args); log.push(['recorded', 'selectShell', args[1]]); return result; } };
    },
    wrapBattleRules(rules) {
      log.push(['wrapBattleRules']);
      return { ...rules, resetProvingRange: (...args) => { const result = rules.resetProvingRange(...args); log.push(['recorded', 'resetProvingRange']); return result; } };
    },
    recordSeatWrite: (kind, args) => log.push(['seatWrite', kind, ...args]),
    onEvent: (type) => log.push(['event', type]),
    markStaged: () => log.push(['markStaged']),
    finish: () => { if (!armed) return null; armed = false; log.push(['finish']); return { bytes: new Uint8Array(1) }; },
    cancel: () => log.push(['cancel']),
  };
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

{
  const log = [], errors = [];
  let loads = 0, made = 0;
  const access = createReplayRecordingAccess({
    load: async () => { loads++; return { createReplayRecorder: () => { made++; return stubRecorder(log); } }; },
    reportError: (message) => errors.push(message),
  });
  const { recorder } = access;
  const plainCalls = [];
  const rules = access.recorder.wrapRules({ selectShell: (combat, slot) => { plainCalls.push(slot); return slot * 2; }, ammoLimit: 7 });
  const battleRules = recorder.wrapBattleRules({ resetProvingRange: () => { plainCalls.push('reset'); return true; } });

  // 1. idle before the chunk
  await flush();
  assert.equal(loads, 0, 'the chunk is not loaded until asked (no boot download)');
  assert.equal(access.current, null);
  assert.equal(recorder.active, false, 'the idle port reads as no recording');
  assert.equal(recorder.finish(), null, 'and finishes none');
  assert.equal(recorder.probeCost(600, () => 0), null);
  recorder.beforeStep(); recorder.afterStep(); recorder.onEvent('tank:fire', {}); recorder.recordSeatWrite('previousShellSlot', [1]);
  recorder.markStaged(); recorder.cancel(); recorder.endSetup();
  recorder.trace = true;
  assert.equal(recorder.trace, false, 'the trace switch reads the recorder (none yet)');
  assert.equal(rules.selectShell(null, 3), 6, 'a boot-wrapped rule calls the plain rule before the recorder loads');
  assert.equal(rules.ammoLimit, 7, 'and a value of the port is kept');
  assert.equal(battleRules.resetProvingRange({}), true);
  assert.deepEqual(plainCalls, [3, 'reset']);
  recorder.beginSetup({}, 'm1a2', {});
  assert.equal(errors.length, 1, 'a setup before the recorder has loaded is reported');
  assert.match(errors[0], /not recorded/);
  assert.deepEqual(log, [], 'nothing reached a recorder');

  // 2. preloaded: one recorder, every tap forwarded
  const [first, second] = await Promise.all([access.preload(), access.preload()]);
  assert.equal(loads, 1, 'concurrent preloads share one load');
  assert.equal(made, 1, 'one recorder per page');
  assert.equal(first, second);
  assert.equal(access.current, first);
  assert.equal(await access.preload(), first, 'a later preload is the loaded recorder');

  // 3. the order main.ts keeps: preload, then setup, then steps: the first step is recorded
  recorder.beginSetup({}, 'm1a2', {});
  recorder.endSetup();
  assert.equal(recorder.active, true, 'the port reads the armed recorder');
  recorder.beforeStep(); recorder.afterStep();
  assert.deepEqual(log.slice(0, 4), [['beginSetup', 'm1a2'], ['endSetup'], ['beforeStep'], ['afterStep']],
    'a battle set up after the preload is recorded from its first step');
  log.length = 0;

  assert.equal(rules.selectShell(null, 4), 8, 'the boot-wrapped rule returns what the rule returned');
  assert.equal(rules.selectShell(null, 5), 10);
  assert.deepEqual(log, [['wrapRules'], ['recorded', 'selectShell', 4], ['recorded', 'selectShell', 5]],
    'and goes through the recorder\'s own wrapper, made once');
  log.length = 0;
  battleRules.resetProvingRange({});
  assert.deepEqual(log, [['wrapBattleRules'], ['recorded', 'resetProvingRange']], 'the battle rules too');
  log.length = 0;

  // a tool's patch of a recorder method (tools/replay-browser-check.mjs arms its samplers so) is what the port calls
  first.recorder.onEvent = (type) => log.push(['patched', type]);
  recorder.onEvent('shell:hit', {});
  recorder.recordSeatWrite('previousShellSlot', [2]);
  recorder.markStaged();
  recorder.trace = true;
  assert.equal(first.recorder.trace, true, 'the trace switch reaches the loaded recorder');
  assert.equal(recorder.probeCost(600, () => 0), 0.6);
  assert.deepEqual(recorder.finish(), { bytes: new Uint8Array(1) });
  assert.equal(recorder.active, false);
  recorder.cancel();
  assert.deepEqual(log, [['patched', 'shell:hit'], ['seatWrite', 'previousShellSlot', 2], ['markStaged'], ['finish'], ['cancel']]);
  assert.equal(errors.length, 1, 'no setup after the preload is reported');
}

{
  // 4. a failed load: the port stays idle, the next preload asks again
  let attempt = 0;
  const access = createReplayRecordingAccess({
    load: async () => {
      attempt++;
      if (attempt === 1) throw new Error('offline');
      return { createReplayRecorder: () => stubRecorder([]) };
    },
    reportError: () => {},
  });
  await assert.rejects(access.preload(), /offline/);
  assert.equal(access.current, null);
  assert.equal(access.recorder.active, false);
  const loaded = await access.preload();
  assert.equal(attempt, 2, 'the next preload asks again');
  assert.equal(access.current, loaded);
}

console.log('replayRecordingAccess.selftest: the recorder loads on demand, idle before, every tap and wrapped rule bound after');
