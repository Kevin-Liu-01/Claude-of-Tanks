import assert from 'node:assert/strict';

import { createDriveTestAccess } from './driveTestAccess.ts';

let loads = 0;
const production = createDriveTestAccess({
  enabled: false,
  options: () => ({}),
  load: async () => { loads += 1; return {}; },
});
assert.equal(await production.preload(), null);
assert.equal(loads, 0, 'ordinary production entry transfers no drive-test chunk');
assert.equal(production.aimTargetId, null);
assert.equal(production.aimAtNearest(), null);
assert.equal(production.gunAimError(), Infinity);
assert.equal(production.fastForward(5), 0);
assert.equal(production.spawnKillShell(), false);

let fail = true;
let creates = 0;
const calls = [];
const controller = {
  aimTargetId: 'enemy-2',
  aimAtNearest: () => ({ id: 'enemy-2', distM: 42 }),
  gunAimError: () => 0.01,
  aimState: () => ({ locked: true }),
  fastForward: (seconds) => { calls.push(['fast', seconds]); return seconds; },
  spawnKillShell: (fraction) => { calls.push(['shell', fraction]); return true; },
  slayEnemies: () => calls.push(['slay']),
  resetAim: () => calls.push(['reset']),
};
const access = createDriveTestAccess({
  enabled: true,
  options: () => ({ marker: true }),
  load: async () => {
    loads += 1;
    if (fail) throw new Error('simulated debug chunk failure');
    return {
      createDriveTestController(options) {
        creates += 1;
        assert.equal(options.marker, true);
        return controller;
      },
    };
  },
});
await assert.rejects(access.preload(), /simulated debug chunk failure/);
fail = false;
const first = access.preload();
const joined = access.preload();
assert.equal(first, joined);
assert.equal(await first, controller);
assert.equal(creates, 1);
assert.equal(access.aimTargetId, 'enemy-2');
assert.deepEqual(access.aimAtNearest(), { id: 'enemy-2', distM: 42 });
assert.equal(access.gunAimError(), 0.01);
assert.deepEqual(access.aimState(), { locked: true });
assert.equal(access.fastForward(3), 3);
assert.equal(access.spawnKillShell(0.75), true);
access.slayEnemies();
access.resetAim();
assert.deepEqual(calls, [
  ['fast', 3], ['shell', 0.75], ['slay'], ['reset'],
]);
assert.equal(await access.preload(), controller);
assert.equal(creates, 1);

assert.throws(() => createDriveTestAccess({}), /requires intent, options, and loader/);

console.log('driveTestAccess.selftest: production exclusion, retry, join, and facade pass');
