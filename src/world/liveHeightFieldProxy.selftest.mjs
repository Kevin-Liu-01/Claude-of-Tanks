import assert from 'node:assert/strict';
import { createLiveHeightFieldProxy } from './liveHeightFieldProxy.ts';

const calls = { exact: 0, fast: 0 };
const normal = { x: 0, y: 1, z: 0 };
let exactMode = false;
let world = {
  heightField: {
    size: 800,
    minY: -12,
    maxY: 44,
    getHeightAt: (x, z) => { calls.exact += 1; return x + z + 100; },
    getHeightAtFast: (x, z) => { calls.fast += 1; return x + z; },
    getNormalAt: () => normal,
    getGroundType: () => 'soft',
    getWaterMaskAt: () => 0.25,
  },
};
const fallbackNormal = { x: 0, y: 1, z: 0, fallback: true };
const proxy = createLiveHeightFieldProxy({
  getWorld: () => world,
  useExactHeight: () => exactMode,
  upNormal: fallbackNormal,
});

assert.equal(proxy.getHeightAt(2, 3), 5);
assert.deepEqual(calls, { exact: 0, fast: 1 });
exactMode = true;
assert.equal(proxy.getHeightAt(2, 3), 105);
assert.equal(proxy.getHeightAtFast(2, 3), 5);
assert.equal(proxy.getHeightAtExact(2, 3), 105);
assert.deepEqual(calls, { exact: 2, fast: 2 });
assert.equal(proxy.getNormalAt(0, 0), normal);
assert.equal(proxy.getGroundType(0, 0), 'soft');
assert.equal(proxy.getWaterMaskAt(0, 0), 0.25);
assert.equal(proxy.size, 800);
assert.equal(proxy.minY, -12);
assert.equal(proxy.maxY, 44);

world = null;
assert.equal(proxy.getHeightAt(2, 3), 0);
assert.equal(proxy.getNormalAt(0, 0), fallbackNormal);
assert.equal(proxy.getGroundType(0, 0), 'hard');
assert.equal(proxy.getWaterMaskAt(0, 0), 0);
assert.equal(proxy.size, 1000);

console.log('liveHeightFieldProxy.selftest: fast live and exact authoring terrain paths pass');
