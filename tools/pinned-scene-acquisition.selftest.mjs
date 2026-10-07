import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  PINNED_SCENE, primePinnedSceneStorage, configurePinnedScene,
  capturePinnedScene, isPinnedSceneReceipt, readMapCamoPools, pinnedCamoScheme,
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

// The map's camouflage (2026-10-06): the pinned M1A2 wore its factory sand on every battlefield. The pools are the
// game's own (src/vehicles/materials.ts BIOME_PATTERN, the pools the bots' AUTO paint draws from); the tank wears the
// first scheme of its map's pool, Verdant's where the map has none.
const camo = PINNED_SCENE.camo;
assert.ok(camo && Object.isFrozen(camo) && Object.isFrozen(camo.pools), 'the camouflage pools are read and frozen');
assert.equal(camo.storagePrefix, 'cot.camo.', "the per-tank selection key is the game's");
assert.equal(pinnedCamoScheme('winter'), 'winter', 'a snow map gets a winter scheme');
assert.equal(pinnedCamoScheme('desert'), 'desert', 'a desert map gets a desert one');
assert.equal(pinnedCamoScheme('no_such_map'), camo.pools.verdant[0], "a map without a pool gets Verdant's first, as its bots do");
assert.equal(readMapCamoPools(new URL('./no-such-materials.ts', import.meta.url)), null, 'an unreadable table is a no-op');
assert.equal(pinnedCamoScheme('winter', null), null);

// The page side: every battlefield shot stores its map's scheme before the shot's own camo pass runs; other shots
// pass through; the wrapper installs once.
const stored = new Map();
const pageContext = vm.createContext({ localStorage: { setItem: (key, value) => stored.set(key, value) } });
const seen = [];
pageContext.window = {
  __DEBUG: { selectedSpecId: 'm1a2', flags: {} },
  __SHOTS: { set(name) { seen.push([name, stored.get('cot.camo.m1a2') ?? null]); return name; } },
};
const invokePage = (fn, specification = PINNED_SCENE) => vm.runInContext(`(${fn.toString()})`, pageContext)(specification);
invokePage(configurePinnedScene);
invokePage(configurePinnedScene);
const shots = pageContext.window.__SHOTS;
assert.equal(shots.pinnedCamo, true);
assert.equal(shots.set('battlefield_winter'), 'battlefield_winter', 'the shot itself still runs and returns');
shots.set('battlefield_desert');
shots.set('battlefield');
shots.set('garage');
assert.deepEqual(seen, [['battlefield_winter', 'winter'], ['battlefield_desert', 'desert'],
  ['battlefield', camo.pools.verdant[0]], ['garage', camo.pools.verdant[0]]],
'each battlefield shot sees its own map scheme stored; a non-battlefield shot stores nothing; one wrapper');
const bare = vm.createContext({ localStorage: { setItem: () => { throw new Error('no camo write without pools'); } } });
bare.window = { __DEBUG: { selectedSpecId: 'm1a2', flags: {} }, __SHOTS: { set: (name) => name } };
vm.runInContext(`(${configurePinnedScene.toString()})`, bare)({ ...PINNED_SCENE, camo: null });
assert.equal(bare.window.__SHOTS.set('battlefield_winter'), 'battlefield_winter', 'no pools: the pin is a no-op');
console.log('pinned-scene-acquisition.selftest: serialized boot pin, exact roster, scalar actual identities, adversarial mismatches and the map camouflage pin passed');
