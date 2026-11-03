// propsShellPoolCancel.selftest.mjs — (2026-11-02 audit R1) a props build cancelled before its structure shells join stops
// the shell pool's workers. The pool was disposed only at the join (props.ts joinStructureShells), while the broken-vehicle
// pool listened for the build's abort: a background world build cancelled before the join left up to four
// cot-structure-shells workers deriving bands for a world nobody would build. The real async props build on a real map
// (the receipts' world build fixture), with a spy pool through the receipts' factory and a tick that cancels the build
// at its first checkpoint after the pool exists.
import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';
import { createDeferredStructureShellPool, setStructureShellPoolFactory } from './structureShellPool.ts';

installWorldBuildFixture();
const { getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');
const { createPropsAsync } = await import('./props.ts');
const { loadMapKits } = await import('./worldKits.ts');

const config = getMapConfig('verdant');
await loadMapKits(config);
const field = createHeightField(1337, config);
const engine = { anisotropy: 4, setupShadowMaterial() {} };

const pools = [];
setStructureShellPoolFactory(() => {
  const pool = createDeferredStructureShellPool();
  const dispose = pool.dispose.bind(pool);
  const spy = { ...pool, disposed: 0, dispose() { spy.disposed++; dispose(); } };
  pools.push(spy);
  return spy;
});
try {
  const failure = new Error('the background build was cancelled');
  await assert.rejects(createPropsAsync(field, engine, 2002, config, () => {
    if (pools.length) return Promise.reject(failure);
  }, true), (error) => error === failure, 'the cancellation stays the rejection');
  assert.equal(pools.length, 1, 'the build made its shell pool');
  assert.equal(pools[0].disposed, 1, 'a build cancelled before the join stops its shell pool');
} finally {
  setStructureShellPoolFactory(null);
}

console.log('propsShellPoolCancel.selftest: a props build cancelled before its structure shells join disposes the shell pool PASS');
