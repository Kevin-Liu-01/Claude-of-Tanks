import assert from 'node:assert/strict';
import {
  NETWORK_BATTLE_ENTRY_ABORTED,
  isNetworkBattleEntryAbortError,
  throwIfNetworkBattleEntryAborted,
} from './networkBattleEntryAbort.ts';

const active = new AbortController();
assert.doesNotThrow(() => throwIfNetworkBattleEntryAborted(active.signal));

active.abort('room closed during cold entry');
assert.throws(
  () => throwIfNetworkBattleEntryAborted(active.signal),
  (error) => {
    assert.equal(error.name, 'AbortError');
    assert.equal(error.code, NETWORK_BATTLE_ENTRY_ABORTED);
    assert.equal(error.message, 'room closed during cold entry');
    assert.equal(isNetworkBattleEntryAbortError(error), true);
    return true;
  },
);
assert.equal(isNetworkBattleEntryAbortError(new Error('ordinary failure')), false);

console.log('networkBattleEntryAbort.selftest: typed cancellation identity passed');
