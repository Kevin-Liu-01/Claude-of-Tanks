// destructibleWorldKey.selftest.mjs — a map's Frontline Assault trench variant is its own world (2026-11-02 audit R2).
//
// The standard world and its `#assault-trenches` variant keep the base map id (worldBuildConfig.ts), and desktop caches
// both. Their destructible registrations were keyed by that id, and registration replaces by key: once the variant was
// built, the standard world's entry was gone, so on a later standard battle on the map no shell broke a light prop,
// seeded a drum chain or dented a car (and a cancelled variant build, which still assembles, registered over it too).
// The structure measure queue, which holds one world's parts, grouped the two worlds by the same id.
//   - worldBuildKey names the world as the build coordinator's cache does ('mapId', 'mapId#assault-trenches');
//   - the two worlds' registrations coexist: each receives shells while it is the visible one, and the variant's
//     eviction leaves the standard world's entry in place;
//   - props.ts registers and queues its measures under that key;
//   - the variant's build drains the standard world's deferred measures (one world's parts held at most).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { notifyShellSweep, notifyShellImpact, registerWorldDestructibles, worldBuildKey } from './destructibles.ts';
import { worldBuildConfig } from './worldBuildConfig.ts';
import { describeStructure, measureDeferredStructures, measureOtherMapStructures } from './structureDamageSeam.ts';

// ---- the key: the map and its terrain variant, the coordinator's cache key
assert.equal(worldBuildKey(worldBuildConfig('verdant')), 'verdant', 'the standard world: its map id');
assert.equal(worldBuildKey(worldBuildConfig('verdant', 'assault-trenches')), 'verdant#assault-trenches', 'the trench variant: its own key');
assert.equal(worldBuildKey(null), 'verdant', 'no config: the props default map');

// ---- both worlds registered side by side; dispatch reaches the visible one; evicting the variant keeps the standard
const calls = [];
let visible = 'standard';
const entry = (name, config) => ({
  key: worldBuildKey(config),
  isActive: () => visible === name,
  sweep: () => calls.push(`${name}:sweep`),
  impact: () => calls.push(`${name}:impact`),
});
const releaseStandard = registerWorldDestructibles(entry('standard', worldBuildConfig('verdant')));
const releaseTrenches = registerWorldDestructibles(entry('trenches', worldBuildConfig('verdant', 'assault-trenches')));
visible = 'trenches';
notifyShellSweep(0, 1, 0, 5, 1, 0);
visible = 'standard';
notifyShellSweep(0, 1, 0, 5, 1, 0);
notifyShellImpact(1, 0, 1, { r: 4.6, he: true });
assert.deepEqual(calls, ['trenches:sweep', 'standard:sweep', 'standard:impact'],
  'the standard world still breaks props after its trench variant was built (Frontline Assault, then a standard battle)');
calls.length = 0;
releaseTrenches();
notifyShellSweep(0, 1, 0, 5, 1, 0);
assert.deepEqual(calls, ['standard:sweep'], 'the variant\'s eviction (or a cancelled variant build\'s disposal) leaves the standard world\'s entry');
releaseStandard();
calls.length = 0;
notifyShellSweep(0, 1, 0, 5, 1, 0);
assert.deepEqual(calls, [], 'both evicted: nothing registered');

// ---- props.ts registers and queues under the world's key, never the bare map id
const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(propsSource, /const worldKey = worldBuildKey\(cfg\);/, 'props name their world by its build key');
assert.match(propsSource, /registerWorldDestructibles\(\{\s*key: worldKey,/, 'the destructible registration is keyed by the world');
assert.match(propsSource, /measureOtherMapStructures\(worldKey, 6\)/, 'another world\'s measures drained before this build describes');
assert.match(propsSource, /describeStructure\(\{\s*structureIdx, mapId, buildKey: worldKey,/, 'each structure queued under its world');

// ---- the measure queue holds one world's parts: the trench variant's build drains the standard world's
// (a structure's measure reads its parts: a spy on the standard world's part says when it is measured)
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(0, h / 2, 0);
let standardReads = 0;
const spied = () => {
  const g = box(8, 5, 6), read = g.getAttribute.bind(g);
  g.getAttribute = (name) => { standardReads++; return read(name); };
  return g;
};
const describe = (buildKey, part = box(8, 5, 6)) => describeStructure({ structureIdx: 1, mapId: 'worldkey-test', buildKey,
  builder: 'house', style: null, parts: { stone: [part] }, w: 8, d: 6, h: 5, placement: { x: 10, y: 0, z: 10, yaw: 0 }, massClass: 'house' });
measureDeferredStructures(Infinity);
describe('worldkey-test', spied()); describe('worldkey-test', spied());
standardReads = 0;
assert.equal(measureOtherMapStructures('worldkey-test', 0), 0, 'a world\'s own queue is not another world\'s');
assert.equal(standardReads, 0, 'and stays queued for the idle measurer');
describe('worldkey-test#assault-trenches');
assert.ok(standardReads > 0,
  'the trench variant\'s first structure has the standard world\'s queued ones measured first (the queue held two worlds\' parts)');
standardReads = 0;
assert.equal(measureDeferredStructures(Infinity), 0, 'the idle measurer takes the variant\'s own');
assert.equal(standardReads, 0, 'none of the standard world\'s left in the queue');

console.log('destructibleWorldKey.selftest: the trench variant registers and queues as its own world; the standard world keeps its entry');
