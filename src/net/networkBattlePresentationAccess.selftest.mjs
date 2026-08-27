import assert from 'node:assert/strict';
import { createNetworkBattlePresentationAccess } from './networkBattlePresentationAccess.ts';

let loads = 0;
let optionReads = 0;
let fail = true;
const calls = [];
const runtime = { present: async (request) => calls.push(request.viewerId) };
const access = createNetworkBattlePresentationAccess({
  options: () => { optionReads++; return { marker: true }; },
  load: async () => {
    loads++;
    if (fail) throw new Error('chunk failed');
    return {
      createNetworkBattlePresentationRuntime(options) {
        assert.deepEqual(options, { marker: true });
        return runtime;
      },
    };
  },
});

await assert.rejects(access.preload(), /chunk failed/);
fail = false;
const requests = [access.preload(), access.preload()];
assert.strictEqual(requests[0], requests[1], 'concurrent intent shares one chunk request');
assert.strictEqual(await requests[0], runtime);
assert.equal(loads, 2, 'a failed chunk request remains retryable');
assert.equal(optionReads, 1, 'concrete adapters are assembled only after the chunk succeeds');
await access.present({ viewerId: 'guest' });
assert.deepEqual(calls, ['guest']);
assert.equal(loads, 2, 'entry reuses the intent-loaded runtime');

console.log('networkBattlePresentationAccess.selftest: retry, coalescing, and deferred composition pass');
