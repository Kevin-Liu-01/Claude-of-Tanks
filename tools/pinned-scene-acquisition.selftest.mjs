import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  PINNED_SCENE, primePinnedSceneStorage, configurePinnedScene,
  capturePinnedScene, isPinnedSceneReceipt,
} from './pinned-scene-acquisition.mjs';

const calls = [];
const context = vm.createContext({ localStorage: { setItem: (...args) => calls.push(args) } });
const invoke = (fn, specification = PINNED_SCENE) => vm.runInContext(`(${fn.toString()})`, context)(specification);
invoke(primePinnedSceneStorage);
assert.deepEqual(calls, [['cot.lastTank.v1', 'm1a2']], 'only the boot hero preference is pinned');
assert.ok(Object.isFrozen(PINNED_SCENE) && Object.isFrozen(PINNED_SCENE.roster));

context.window = { __DEBUG: { selectedSpecId: 'm1a2', flags: { unrelated: 42 } } };
invoke(configurePinnedScene);
const D = context.window.__DEBUG;
assert.deepEqual([...D.flags.forceRoster], PINNED_SCENE.roster);
assert.notEqual(D.flags.forceRoster, PINNED_SCENE.roster, 'browser flags cannot mutate the shared specification');
assert.equal(D.flags.rosterExact, true);
assert.equal(D.flags.unrelated, 42, 'unrelated engineering flags are preserved');
const entities = PINNED_SCENE.roster.map((specId, index) => ({
  id: specId, specId, isPlayer: index === 0, team: index < 4 ? 'player' : 'enemy',
  visual: { specId, retainedObject: {} },
}));
D.game = { tanks: entities, player: entities[0] };
const good = JSON.parse(JSON.stringify(invoke(capturePinnedScene)));
assert.equal(isPinnedSceneReceipt(good), true);
assert.deepEqual(good.entities.map(entity => entity.entityId), PINNED_SCENE.roster);
assert.equal(JSON.stringify(good).includes('retainedObject'), false, 'receipt contains identities, never live owners');

for (const damage of [
  receipt => { delete receipt.protocol; },
  receipt => { receipt.selectedSpecId = 'm1a3'; },
  receipt => { receipt.playerEntityId = 'm1a3'; },
  receipt => { receipt.playerSpecId = 'm1a3'; },
  receipt => { receipt.entities.reverse(); },
  receipt => { receipt.entities.pop(); },
  receipt => { receipt.entities.push(receipt.entities[0]); },
  receipt => { receipt.entities[1].entityId = 'another-player'; },
  receipt => { receipt.entities[1].specId = 'm1a2'; },
  receipt => { receipt.entities[1].visualSpecId = 'm1a2'; },
  receipt => { receipt.entities[1].isPlayer = true; },
  receipt => { receipt.entities[1].team = 'enemy'; },
  receipt => { delete receipt.entities[1].visualSpecId; },
  receipt => { delete receipt.entities[1].isPlayer; },
]) {
  const bad = structuredClone(good); damage(bad);
  assert.equal(isPinnedSceneReceipt(bad), false, 'missing, reordered or mismatched actual identity is never accepted');
}
assert.equal(isPinnedSceneReceipt(null), false);
assert.equal(isPinnedSceneReceipt({}), false);
D.game.tanks[0].visual.specId = 'm1a3';
assert.throws(() => invoke(capturePinnedScene), /identity mismatch/);
D.selectedSpecId = 'm1a3';
assert.throws(() => invoke(configurePinnedScene), /boot selection/);
D.selectedSpecId = 'm1a2'; delete D.flags;
assert.throws(() => invoke(configurePinnedScene), /boot selection/);
delete D.game;
assert.throws(() => invoke(capturePinnedScene), /roster unavailable/);
console.log('pinned-scene-acquisition.selftest: serialized boot pin, exact roster, scalar actual identities and adversarial mismatches passed');
