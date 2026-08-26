import assert from 'node:assert/strict';
import { createBattleModuleAccess } from './battleModuleAccess.ts';

const calls = new Map();
let failRoomChat = true;
const load = (name, value) => async () => {
  calls.set(name, (calls.get(name) || 0) + 1);
  if (name === 'roomChat' && failRoomChat) throw new Error('transfer failed');
  return value;
};

const playMenu = { createPlayMenu() {} };
const networkBattle = [{ createBrowserBattleBridge() {} }, { createNetworkStatus() {} },
  { createBrowserInputRuntime() {} }];
const access = createBattleModuleAccess({
  playMenu: load('playMenu', playMenu),
  networkBattle: load('networkBattle', networkBattle),
  privateMatchHandoff: load('privateMatchHandoff', { buildPrivateMatchPlayers() {} }),
  dedicatedClient: load('dedicatedClient', { connectDedicatedMatch() {} }),
  roomChat: load('roomChat', { createRoomChat() {} }),
});

const playRequests = [access.loadPlayMenuModule(), access.loadPlayMenuModule()];
assert.strictEqual(playRequests[0], playRequests[1], 'concurrent callers share one request');
assert.strictEqual(await playRequests[0], playMenu);
assert.strictEqual(await access.loadPlayMenuModule(), playMenu);
assert.equal(calls.get('playMenu'), 1, 'successful modules stay memoized');

assert.strictEqual(await access.preloadNetworkBattleModules(), networkBattle);
assert.equal(calls.get('networkBattle'), 1);

await assert.rejects(access.preloadNetworkRoomChatModule(), /transfer failed/);
failRoomChat = false;
assert.equal(typeof (await access.preloadNetworkRoomChatModule()).createRoomChat, 'function');
assert.equal(calls.get('roomChat'), 2, 'a failed transfer is retried');

console.log('battleModuleAccess.selftest: shared imports and retry recovery passed');
