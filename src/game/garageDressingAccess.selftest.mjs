import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGarageDressingAccess } from './garageDressingAccess.ts';

let attempts = 0;
let constructions = 0;
let pumps = 0;
let built = false;
let variantId = '';
const engineCtx = { id: 'engine' };
const pos = new THREE.Vector3(4, 5, 6);
const access = createGarageDressingAccess(engineCtx, pos, {
  dressing: async () => {
    attempts++;
    if (attempts === 1) throw new Error('simulated workshop chunk failure');
    return {
      createGarageDressing(receivedEngine, receivedPos, existing) {
        constructions++;
        assert.equal(receivedEngine, engineCtx);
        assert.equal(receivedPos, pos);
        assert.equal(existing.group, access.group);
        assert.equal(existing.bayFill.parent, access.group);
        return {
          group: existing.group,
          pump() { pumps++; built = true; return false; },
          ensureBuilt() { built = true; },
          isBuilt() { return built; },
          setVariant(id) { variantId = id; return id; },
          dispose() { existing.group.removeFromParent(); },
        };
      },
    };
  },
});

assert.deepEqual(access.group.position.toArray(), [4, 5, 6]);
assert.equal(access.group.children.filter((child) => child.isPointLight).length, 1);
await assert.rejects(access.preload(), /simulated workshop chunk failure/);
assert.equal(access.current, null);

const first = access.preload();
const shared = access.preload();
assert.equal(first, shared);
assert.equal((await first).group, access.group);
assert.equal(attempts, 2);
assert.equal(constructions, 1);
assert.equal(access.isBuilt(), false);
assert.equal(await access.pump(), false);
assert.equal(pumps, 1);
assert.equal(access.isBuilt(), true);
assert.equal(access.setVariant('winter_repair_bunker'), 'winter_repair_bunker');
assert.equal(variantId, 'winter_repair_bunker');
await access.ensureBuilt();

console.log('garageDressingAccess.selftest: light-stable retryable workshop owner passed');
