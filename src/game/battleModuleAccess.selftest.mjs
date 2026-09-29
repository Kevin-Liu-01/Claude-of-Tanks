import assert from 'node:assert/strict';
import { createBattleModuleAccess } from './battleModuleAccess.ts';

let calls = 0;
let fail = true;
const playMenu = { createPlayMenu() {} };
const access = createBattleModuleAccess({
  playMenu: async () => {
    calls++;
    if (fail) throw new Error('transfer failed');
    return playMenu;
  },
});

await assert.rejects(access.loadPlayMenuModule(), /transfer failed/);
fail = false;
const playRequests = [access.loadPlayMenuModule(), access.loadPlayMenuModule()];
assert.strictEqual(playRequests[0], playRequests[1], 'concurrent callers share one request');
assert.strictEqual(await playRequests[0], playMenu);
assert.strictEqual(await access.loadPlayMenuModule(), playMenu);
assert.equal(calls, 2, 'a failed transfer is retried; a successful module stays memoized');
assert.throws(() => createBattleModuleAccess({ playMenu: null }), /requires all loaders/);

console.log('battleModuleAccess.selftest: shared imports and retry recovery passed');
