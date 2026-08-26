import assert from 'node:assert/strict';
import { createBattleVisualStreamerAccess } from './battleVisualStreamerAccess.ts';

let attempts = 0;
const runtime = { stream() {}, stageRootTextureUploads() {}, stageBattleVisualReveal() {} };
const access = createBattleVisualStreamerAccess({ game: { tanks: [] } }, {
  async load() {
    attempts += 1;
    if (attempts === 1) throw new Error('injected streamer transfer failure');
    return { createBattleVisualStreamer: () => runtime };
  },
});
await assert.rejects(access.preload(), /injected streamer transfer failure/);
const [first, joined] = await Promise.all([access.preload(), access.preload()]);
assert.equal(first, runtime);
assert.equal(joined, runtime);
assert.equal(access.current, runtime);
assert.equal(attempts, 2);

console.log('battleVisualStreamerAccess.selftest: garage exclusion, retry, and joining passed');
