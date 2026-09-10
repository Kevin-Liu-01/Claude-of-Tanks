import assert from 'node:assert/strict';
import { installSourcedTextureReadiness, checkSourcedTextureReadiness } from './sourced-texture-readiness.mjs';
const good = [{ target: 'building urban/plaster', applied: true, failures: [] }];
const state = (settled = true) => ({ settled, results: settled ? structuredClone(good) : [], promise: Promise.resolve() });
const world = value => ({ mapId: 'urban', minimapTextureState: value });
function setup(value) {
  globalThis.window = { __DEBUG: { world: world(value), game: { phase: 'garage', battleCount: 0, result: null } } };
  installSourcedTextureReadiness();
  const observer = window.__SOURCE_READINESS;
  observer.arm('battle'); return observer;
}
{
  const observer = setup(state());
  observer.observe(1, false);
  Object.assign(window.__DEBUG.game, { phase: 'battle', battleCount: 1 });
  observer.observe(2, false); assert.equal(observer.finish().firstUncoveredBattle, null);
  observer.observe(3, true);
  const receipt = observer.finish();
  assert.equal(receipt.firstUncoveredBattle.atMs, 3);
  assert.equal(receipt.worldsObserved.length, 1);
  assert.deepEqual(checkSourcedTextureReadiness({ action: 'battle', sourceReadiness: receipt }), []);
  await Promise.resolve();
  assert.ok(receipt.worldsObserved[0].settlementObservedAtMs > 0);
  observer.stop(); assert.equal(window.__SOURCE_READINESS, undefined);
}
{
  let resolve;
  const pending = state(false); pending.promise = new Promise(done => { resolve = done; });
  const observer = setup(pending);
  Object.assign(window.__DEBUG.game, { phase: 'battle', battleCount: 1 });
  observer.observe(3, true);
  const first = observer.finish();
  assert.equal(first.firstUncoveredBattle.requested, null, 'pending count is unknown, never fake zero');
  assert.ok(checkSourcedTextureReadiness({ action: 'battle', sourceReadiness: first }).some(value => value.includes('first uncovered')));
  pending.results = structuredClone(good); pending.settled = true; resolve(); await Promise.resolve();
  const final = observer.finish();
  assert.equal(final.finish.applied, 1);
  assert.equal(final.firstUncoveredBattle.settled, false, 'later adoption cannot rewrite failed reveal evidence');
  observer.stop();
}
{
  const observer = setup(state()); Object.assign(window.__DEBUG.game, { phase: 'battle', battleCount: 1 });
  observer.observe(1, true); const before = observer.finish().firstUncoveredBattle;
  window.__DEBUG.world = world(state()); observer.observe(2, true);
  const receipt = observer.finish();
  assert.notEqual(before.worldId, receipt.finish.worldId);
  assert.ok(checkSourcedTextureReadiness({ action: 'battle', sourceReadiness: receipt }).some(value => value.includes('owner changed')));
  observer.stop();
}
{
  let resolve;
  const pending = state(false); pending.promise = new Promise(done => { resolve = done; });
  const observer = setup(pending); observer.observe(1, false);
  const receipt = observer.finish(); observer.stop(); resolve(); await Promise.resolve();
  assert.equal(receipt.worldsObserved[0].settlementObservedAtMs, null, 'stopped observer ignores late promise');
}
{
  const observer = setup(state());
  for (let i = 0; i < 8; i++) { window.__DEBUG.world = world(state()); observer.observe(i, false); }
  assert.equal(observer.finish().worldsObserved.length, 4);
  assert.equal(observer.finish().worldsDropped, 4); observer.stop();
}
assert.ok(checkSourcedTextureReadiness({ action: 'battle' }).length);
assert.deepEqual(checkSourcedTextureReadiness({ action: 'return-to-garage' }), []);
console.log('sourced-texture-readiness.selftest: exact owner, reveal/finish distinction, pending state, bounded observer, and cleanup passed');
