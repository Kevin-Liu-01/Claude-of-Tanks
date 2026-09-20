import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTank } from './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { internalLayoutFor } from './internalLayoutRegistry.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createCombatState, selectShell, startReload, tickReload } from '../sim/damage.ts';
import { SIM_DT, shotRecoilScale } from '../sim/movement.ts';

const definitions = {
  ztz100_prototype: { cells: 8, ammo: [12, 8, 180], reload: [8.2, 9, .30], counterpart: 'ztz100_x', caliber: 35 },
  object695_x: { cells: 12, ammo: [12, 12, 240], reload: [5.8, 6.6, .22], counterpart: 'kurganets25_x', caliber: 30 },
};
const input = (slot, fire = false) => ({ throttle: 0, steer: 0, brake: true, fire,
  aimYaw: .4, aimPitch: .1, aimDistance: 400, shellSlot: slot, actionBits: 0 });
for (const [id, expected] of Object.entries(definitions)) {
  const spec = TANK_SPECS[id], counterpart = TANK_SPECS[expected.counterpart];
  assert.equal(spec.gun.primaryGuided, true);
  assert.equal(shotRecoilScale(spec, spec.gun.shells[0]), 0, 'external missile leaves the hull seated');
  assert.equal(shotRecoilScale(spec, spec.gun.shells[2]), .36, 'backup uses the short autocannon recoil');
  assert.equal(spec.gun.caliberMm, expected.caliber);
  assert.equal(spec.gun.shells[0].guided, true, 'missiles are the actual initial selected weapon');
  assert.equal(spec.gun.launcherMuzzles.length, expected.cells);
  assert.equal(new Set(spec.gun.launcherMuzzles.map(p => JSON.stringify(p))).size, expected.cells);
  assert(!counterpart.gun.launcherMuzzles, 'service counterpart is unchanged');
  assert.equal(counterpart.gun.caliberMm, id === 'object695_x' ? 57 : 105);
  const layout = internalLayoutFor(id);
  assert.equal(layout.confidence, 'owner-directed');
  assert(layout.crew.every(station => station.frame === 'hull'), 'original unmanned design has no turret crew');
  assert.deepEqual(layout.sources, ['ownerMissileConcepts']);
  const combat = createCombatState(spec);
  assert.deepEqual(combat.ammo, expected.ammo);
  assert.strictEqual(combat.reloadChannels[0], combat.reloadChannels[1], 'HE/HEAT share the same physical rack cycle');
  assert.notStrictEqual(combat.reloadChannels[0], combat.reloadChannels[2], 'the cannon has an independent feed');
  for (let slot = 0; slot < 3; slot++) {
    selectShell(combat, slot, spec); startReload(combat, spec);
    assert.equal(combat.reload.totalS, expected.reload[slot]);
  }
  const before = combat.reloadChannels[0].t;
  tickReload(combat, .1);
  assert(Math.abs(combat.reloadChannels[0].t - (before - .1)) < 1e-8,
    'shared missile channel ticks once, not once per ammunition type');

  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, players: [
    { id: 'launcher', specId: id, team: 'alpha', spawn: { x: 0, z: -200, yaw: 0 } },
    { id: 'target', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 200, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const entity = match.entityById.get('launcher');
  const visual = createTank(id, null, { proceduralOnly: true, quality: 'low', camoSeed: 4242, geometryReceipt: true });
  visual.prepareForSimulation();
  try {
    for (let shot = 0; shot < expected.cells + 2; shot++) {
      // Exercise every physical tube, then the backup cannon, then wrap rack.
      const slot = shot === expected.cells ? 2 : shot === expected.cells + 1 ? 1 : 0;
      entity.combat.shellSlot = slot;
      entity.input.shellSlot = slot;
      entity.combat.reload = entity.combat.reloadChannels[slot];
      for (const channel of new Set(entity.combat.reloadChannels)) { channel.t = 0; channel.kind = 'ready'; }
      match.step({ dt: SIM_DT, inputs: new Map([['launcher', input(slot, true)], ['target', input(0)]]) });
      const snapshot = match.snapshot({ tick: shot + 1, serverTimeMs: 17 * (shot + 1), viewerId: 'launcher', ackInputSeq: shot + 1 });
      const event = snapshot.events.findLast(e => e.type === 'shell_fired' && e.shooterId === 'launcher');
      assert(event, `${id}: authoritative shot ${shot}`);
      assert.equal(event.shellName, spec.gun.shells[slot].name);
      const index = slot === 2 ? undefined : shot % expected.cells;
      // A cannon shot must not advance the rack cursor.
      const rackIndex = shot === expected.cells + 1 ? 0 : index;
      if (slot !== 2) assert.equal(event.muzzleIndex, rackIndex);
      visual.syncFromState(entity.state, 0);
      visual.root.updateMatrixWorld(true);
      const actual = visual.gunMuzzleWorld(new Vector3(), rackIndex, slot !== 2);
      assert(actual.distanceTo(new Vector3(event.x, event.y, event.z)) < .003,
        `${id}: server and native articulated launch mouth agree for shot ${shot}: ${actual.toArray()} vs ${[event.x, event.y, event.z]}`);
    }
  } finally { visual.dispose(); }
}
assert(TANK_SPECS.object695_x.hp < TANK_SPECS.kurganets25_x.hp);
assert(TANK_SPECS.object695_x.gun.shells[0].reloadS < TANK_SPECS.ztz100_prototype.gun.shells[0].reloadS);
assert(TANK_SPECS.object695_x.gun.shells[0].dmg < TANK_SPECS.ztz100_prototype.gun.shells[0].dmg);
console.log('missile concepts: distinct roles, independent cannon feeds, shared missile reloads, 20 physical launchers and authoritative muzzle agreement PASS');
