import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNightLightingAccess } from './nightLightingAccess.ts';

function fixture(loader) {
  const scene = new THREE.Scene(), world = new THREE.Group(), actor = new THREE.Group();
  scene.add(world, actor);
  const entity = { id: 'actor-1', team: 'enemy', isPlayer: false, visual: { root: actor }, combat: { destroyed: false } };
  const state = { night: false, battle: false, spotted: false, loads: 0, scans: 0, sources: [], calls: [] };
  const runtime = {
    prepare(sources, night) { state.sources = sources; state.calls.push(['prepare', night]); },
    appendRoot(source) { state.sources.push(source); state.calls.push(['append']); },
    update(reference, active = true) { state.calls.push(['update', active]); },
    reset() { state.sources = []; state.calls.push(['reset']); },
    dispose() { state.calls.push(['dispose']); },
  };
  const options = { scene, getWorldRoot: () => world,
    getEntities: () => { state.scans++; return [entity]; },
    getCameraPosition: () => actor.position,
    isNight: () => state.night, isBattlePresentation: () => state.battle,
    isEntityVisible: () => state.spotted,
  };
  const access = createNightLightingAccess(options, async () => {
    state.loads++;
    if (loader) await loader();
    return { createNightLightingRuntime: () => runtime };
  });
  return { scene, world, actor, entity, state, access, runtime };
}

const f = fixture();
assert.equal(f.state.loads, 0); f.access.update(); f.access.appendEntity(f.entity);
await f.access.prepare(); assert.equal(f.state.loads, 0, 'day does not load/construct the lighting pool');
assert.equal(f.state.scans, 0);
f.state.night = true;
await f.access.prepare();
assert.equal(f.state.loads, 1); assert.equal(f.state.scans, 1);
assert.deepEqual(f.state.calls, [['prepare', true], ['update', true]], 'night first uniforms warm under cover even before phase activation');
assert.equal(f.state.sources.length, 2); assert.strictEqual(f.state.sources[0].root, f.world);
const source = f.state.sources[1];
assert.equal(source.isActive(), false, 'unspotted enemy has no light even if presentation is fading');
f.state.spotted = true; assert.equal(source.isActive(), true);
f.entity.networkVisible = false; assert.equal(source.isActive(), false, 'network authority visibility wins');
f.entity.networkVisible = true; f.entity.combat.destroyed = true;
assert.equal(source.isActive(), false, 'dead actor cannot emit');
f.entity.combat.destroyed = false;
f.entity.visual = { root: new THREE.Group() };
assert.equal(source.isActive(), false, 'replaced visual cannot retain old root ownership');
f.entity.visual.root = f.actor; assert.equal(source.isActive(), true);
f.state.battle = true;
for (let i = 0; i < 100; i++) f.access.update();
assert.equal(f.state.scans, 1, 'frame updates never traverse the world or enumerate roster');
f.state.battle = false; f.access.update();
assert.deepEqual(f.state.calls.at(-1), ['update', false]);
f.access.appendEntity(f.entity); assert.equal(f.state.calls.at(-1)[0], 'append');
f.access.reset();
const resetLength = f.state.calls.length;
f.access.update(); f.access.appendEntity(f.entity);
assert.equal(f.state.calls.length, resetLength, 'Garage reset cannot be reactivated by late visual construction');
f.state.night = false; await f.access.prepare(); assert.equal(f.state.loads, 1);
f.access.dispose(); f.access.dispose();
await assert.rejects(f.access.prepare(), /disposed/);

let resolveLoad;
const delayed = fixture(() => new Promise(resolve => { resolveLoad = resolve; }));
delayed.state.night = true;
const pending = delayed.access.prepare();
await Promise.resolve(); await Promise.resolve();
delayed.access.reset(); resolveLoad(); await pending;
assert.equal(delayed.state.calls.some(call => call[0] === 'prepare'), false, 'cancelled import never attaches lights');
await delayed.access.prepare(); assert.equal(delayed.state.loads, 1, 'cancelled acquisition can reuse inert pool');
delayed.access.dispose();

let disposeResolve;
const disposed = fixture(() => new Promise(resolve => { disposeResolve = resolve; }));
disposed.state.night = true;
const disposalPending = disposed.access.prepare();
await Promise.resolve(); await Promise.resolve();
disposed.access.dispose(); disposeResolve(); await disposalPending;
assert.deepEqual(disposed.state.calls, [['dispose']], 'an import resolving after disposal releases its pool without attaching');

let failure = true;
const retry = fixture(async () => { if (failure) throw new Error('missing chunk'); });
retry.state.night = true;
await assert.rejects(retry.access.prepare(), /missing chunk/);
failure = false; await retry.access.prepare();
assert.equal(retry.state.loads, 2, 'failed explicit load is retryable');
retry.access.dispose();
console.log('nightLightingAccess self-test: day is inert, covered night, no frame scans, strict actor admission and stale-load cleanup PASS');
