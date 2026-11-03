// 2026-11-02 audit F10: a tank visual's wreck is one declared state with one owner (vehicles/wreckLifecycle.ts).
//  - the table: intact → plain | cookoff; plain → cookoff while the wreck is young (a network peer's cause event after
//    the row's DESTROYED flag); a cook-off never un-pops; reset → intact; disposed takes nothing again;
//  - on a real visual: a late cook-off cause upgrades a plain wreck (the cook-off's char spread, the turret thrown as a
//    cook-off's, not a plain kill's 20 % hop), late past the window it does not, and a plain repeat never un-pops;
//  - resetDestroyed clears the timelines a rematch must not inherit (the twin-plant shot cursor);
//  - a disposed visual is latched: a late setDestroyed (an FX timer) wrecks nothing.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { WRECK_POP_UPGRADE_S, tankWreckMove, tankWreckNext } from './wreckLifecycle.ts';

// ---- the table ----
const step = (state, event, age = 0) => {
  const move = tankWreckMove(state, event, age);
  return [move, tankWreckNext(state, move, event.kind === 'destroy' && event.pop)];
};
assert.deepEqual(step('intact', { kind: 'destroy', pop: false }), ['wreck', 'plain']);
assert.deepEqual(step('intact', { kind: 'destroy', pop: true }), ['wreck', 'cookoff']);
assert.deepEqual(step('plain', { kind: 'destroy', pop: true }, 0.1), ['upgrade', 'cookoff'], 'a late cause upgrades a young wreck');
assert.deepEqual(step('plain', { kind: 'destroy', pop: true }, WRECK_POP_UPGRADE_S + 0.01), ['ignore', 'plain'], 'not an old one');
assert.deepEqual(step('plain', { kind: 'destroy', pop: false }, 0.1), ['ignore', 'plain']);
assert.deepEqual(step('cookoff', { kind: 'destroy', pop: false }, 0.1), ['ignore', 'cookoff'], 'a cook-off never un-pops');
assert.deepEqual(step('cookoff', { kind: 'destroy', pop: true }, 0.1), ['ignore', 'cookoff']);
for (const state of ['intact', 'plain', 'cookoff']) {
  assert.deepEqual(step(state, { kind: 'reset' }), ['reset', 'intact']);
  assert.deepEqual(step(state, { kind: 'dispose' }), ['dispose', 'disposed']);
}
for (const event of [{ kind: 'destroy', pop: true }, { kind: 'reset' }, { kind: 'dispose' }]) {
  assert.deepEqual(step('disposed', event), ['ignore', 'disposed'], `a disposed visual ignores ${event.kind}`);
}

// ---- a real visual (no wreck physics loaded in this process: the factory's scripted turret arc) ----
const PLAIN_SPREAD_S = 8.4, COOKOFF_SPREAD_S = 5.4; // tankFactoryCore BURN_SPREAD_PLAIN_S / BURN_SPREAD_COOKOFF_S
function tank(id) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0.7, 0), 0);
  for (let i = 0; i < 3; i++) visual.syncFromState(state, 0.05, 40);
  const turret = visual.root.getObjectByName('rig_turret');
  return { visual, state, turret, seatY: turret.position.y };
}
const run = (t, seconds, dt = 0.05) => { for (let s = 0; s < seconds - 1e-9; s += dt) t.visual.syncFromState(t.state, dt, 40); };
function peakRise(t, seconds) {
  let peak = 0;
  for (let s = 0; s < seconds - 1e-9; s += 0.05) {
    t.visual.syncFromState(t.state, 0.05, 40);
    peak = Math.max(peak, t.turret.position.y - t.seatY);
  }
  return peak;
}

// a plain kill hops its turret ~0.13 m; a cook-off throws it metres up
{
  const plain = tank('m1a1_abrams_hc');
  plain.visual.setDestroyed({ pop: false });
  const hop = peakRise(plain, 1.2);
  assert.ok(hop < 0.3, `a plain kill only unseats its turret (${hop.toFixed(2)} m)`);

  // the network race: the row's flag wrecked it plain, the cook-off cause lands a few ticks later
  const late = tank('m1a1_abrams_hc');
  late.visual.setDestroyed({ pop: false });
  run(late, 0.1);
  const burn = late.visual.armorPaint().uniforms;
  assert.equal(burn.uBurnK.value.z, PLAIN_SPREAD_S);
  late.visual.setDestroyed({ pop: true });
  assert.equal(burn.uBurnK.value.z, COOKOFF_SPREAD_S, 'a late cook-off cause takes the cook-off char spread');
  const thrown = peakRise(late, 1.2);
  assert.ok(thrown > 1, `a late cook-off cause throws the turret as a cook-off (${thrown.toFixed(2)} m)`);
  assert.equal(late.visual.wreckState(), 'cookoff');
  late.visual.setDestroyed({ pop: false });
  assert.equal(late.visual.wreckState(), 'cookoff', 'a plain repeat never un-pops it');
  assert.equal(burn.uBurnK.value.z, COOKOFF_SPREAD_S);

  // past the window the plain wreck stands (the turret long settled: no second throw)
  const old = tank('m1a1_abrams_hc');
  old.visual.setDestroyed({ pop: false });
  run(old, WRECK_POP_UPGRADE_S + 0.3);
  old.visual.setDestroyed({ pop: true });
  assert.equal(old.visual.wreckState(), 'plain', 'an old plain wreck keeps its look');
  assert.equal(old.visual.armorPaint().uniforms.uBurnK.value.z, PLAIN_SPREAD_S);

  // a reset stands it up; the next kill is its own
  late.visual.resetDestroyed();
  assert.equal(late.visual.wreckState(), 'intact');
  assert.equal(late.visual.isDestroyed(), false);
  late.visual.setDestroyed({ pop: false });
  assert.equal(late.visual.wreckState(), 'plain');
}

// resetDestroyed clears the twin plant's shot cursor (a rematch's first unindexed shot is the first barrel's)
{
  const twin = tank('bmpt_terminator2');
  assert.equal(twin.visual.recoilKick(), 0);
  twin.visual.resetDestroyed();
  assert.equal(twin.visual.recoilKick(), 0, 'a rematch starts the shot alternation over');
}

// a disposed visual is latched: a late setDestroyed (a deferred FX beat) wrecks nothing
{
  const gone = tank('m1a1_abrams_hc');
  gone.visual.dispose();
  gone.visual.setDestroyed({ pop: true });
  assert.equal(gone.visual.isDestroyed(), false, 'a late wreck on a disposed visual is ignored');
  assert.equal(gone.visual.wreckState(), 'disposed');
  gone.visual.resetDestroyed();
  gone.visual.dispose();
  assert.equal(gone.visual.wreckState(), 'disposed');
}

console.log('wreckLifecycle.selftest: one wreck state per visual; a late cook-off cause upgrades a young plain wreck, a cook-off never un-pops, a reset clears the shot cursors, a disposed visual takes no late wreck');
