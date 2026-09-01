import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { hasAmmunition } from './ammunition.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createCombatState, selectShell } from './damage.ts';
import { SIM_DT } from './movement.ts';

const input = (shellSlot, fire = false) => ({
  throttle: 0,
  steer: 0,
  brake: false,
  fire,
  aimYaw: 0,
  aimPitch: 0,
  aimDistance: 400,
  shellSlot,
  actionBits: 0,
});

const guidedRounds = [];
let multiChannelLoadouts = 0;
let depletedChannelTransitions = 0;
for (const spec of Object.values(TANK_SPECS)) {
  if (spec.gun.shells.length > 1) {
    multiChannelLoadouts++;
    for (let depletedSlot = 0; depletedSlot < spec.gun.shells.length; depletedSlot++) {
      for (let stockedSlot = 0; stockedSlot < spec.gun.shells.length; stockedSlot++) {
        if (stockedSlot === depletedSlot) continue;
        const combat = createCombatState(spec);
        combat.shellSlot = depletedSlot;
        combat.ammo[depletedSlot] = 0;
        if (!hasAmmunition(combat, stockedSlot)) continue;
        selectShell(combat, stockedSlot, spec);
        assert.equal(combat.shellSlot, stockedSlot,
          `${spec.id}: can leave depleted slot ${depletedSlot + 1} for ${stockedSlot + 1}`);
        assert.equal(hasAmmunition(combat, combat.shellSlot), true,
          `${spec.id}: selected replacement slot ${stockedSlot + 1} remains fireable`);
        depletedChannelTransitions++;
      }
    }
  }
  for (let slot = 0; slot < spec.gun.shells.length; slot++) {
    const round = spec.gun.shells[slot];
    if (!round.guided) continue;
    guidedRounds.push({ spec, round, slot });
    if (spec.gun.primaryGuided) {
      assert.equal(round.reloadS, spec.gun.reloadS,
        `${spec.id} slot ${slot + 1}: primary missile follows the main-gun reload`);
      assert.ok(round.reloadS >= 6 && round.reloadS <= 10,
        `${spec.id} slot ${slot + 1}: primary missile uses a standard tank reload`);
    } else {
      assert.ok(round.reloadS >= 2 && round.reloadS <= 3,
        `${spec.id} slot ${slot + 1}: auxiliary missile reload is 2-3 seconds`);
    }
  }
}
assert.equal(guidedRounds.length, 21, 'the complete guided-ammunition fleet is covered');
assert.ok(multiChannelLoadouts > 100,
  `the playable multi-channel fleet is covered (${multiChannelLoadouts})`);
assert.ok(depletedChannelTransitions > 200,
  `depleted-channel transitions are covered (${depletedChannelTransitions})`);

let guidedAuthorityLaunches = 0;
for (const { spec, round, slot } of guidedRounds) {
  const guidedMatch = createAuthoritativeMatch({
    mapId: 'verdant',
    countdownS: 0,
    players: [
      { id: 'guided-gunner', specId: spec.id, team: 'alpha',
        spawn: { x: 0, z: -200, yaw: 0 } },
      { id: 'guided-target', specId: 't90m', team: 'bravo',
        spawn: { x: 0, z: 200, yaw: Math.PI } },
    ],
  });
  guidedMatch.onMatchReady();
  const guidedGunner = guidedMatch.entityById.get('guided-gunner');
  const fallbackSlot = guidedGunner.spec.gun.shells.findIndex((_, index) => index !== slot);
  if (fallbackSlot >= 0) {
    guidedGunner.combat.shellSlot = fallbackSlot;
    guidedGunner.input.shellSlot = fallbackSlot;
    guidedGunner.combat.ammo[fallbackSlot] = 0;
  }
  const channel = guidedGunner.combat.reloadChannels?.[slot] || guidedGunner.combat.reload;
  channel.t = 0;
  channel.kind = 'ready';
  const before = guidedGunner.combat.ammo[slot];
  guidedMatch.step({
    dt: SIM_DT,
    inputs: new Map([
      ['guided-gunner', input(slot, true)],
      ['guided-target', input(0)],
    ]),
  });
  const guidedSnapshot = guidedMatch.snapshot({
    tick: guidedAuthorityLaunches + 1,
    serverTimeMs: (guidedAuthorityLaunches + 1) * 17,
    viewerId: 'guided-gunner',
    ackInputSeq: guidedAuthorityLaunches + 1,
  });
  assert.ok(guidedSnapshot.events.some((event) =>
    event.type === 'shell_fired' && event.shellName === round.name),
  `${spec.id} slot ${slot + 1}: guided round fires after leaving a depleted channel`);
  assert.equal(guidedGunner.combat.ammo[slot], before - 1,
    `${spec.id} slot ${slot + 1}: guided authority consumes exactly one round`);
  guidedAuthorityLaunches++;
}

const match = createAuthoritativeMatch({
  mapId: 'verdant',
  countdownS: 0,
  players: [
    { id: 'gunner', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -200, yaw: 0 } },
    { id: 'target', specId: 't90m', team: 'bravo', spawn: { x: 0, z: 200, yaw: Math.PI } },
  ],
});
match.onMatchReady();
const gunner = match.entityById.get('gunner');
const target = match.entityById.get('target');

for (let slot = 0; slot < gunner.spec.gun.shells.length; slot++) {
  gunner.combat.shellSlot = slot;
  gunner.input.shellSlot = slot;
  gunner.combat.reload.t = 0;
  gunner.combat.reload.kind = 'ready';
  const before = gunner.combat.ammo[slot];
  match.step({
    dt: SIM_DT,
    inputs: new Map([
      ['gunner', input(slot, true)],
      ['target', input(0)],
    ]),
  });
  const snapshot = match.snapshot({
    tick: slot + 1,
    serverTimeMs: (slot + 1) * 17,
    viewerId: 'gunner',
    ackInputSeq: slot + 1,
  });
  assert.ok(snapshot.events.some((event) =>
    event.type === 'shell_fired' && event.shellName === gunner.spec.gun.shells[slot].name),
  `slot ${slot + 1}: authored ammunition fires through authority`);
  assert.equal(gunner.combat.ammo[slot], before - 1,
    `slot ${slot + 1}: authority consumes exactly one matching round`);
  match.afterSnapshotBroadcast();
  target.combat.destroyed = false;
  target.combat.hp = target.combat.maxHp;
}

gunner.combat.shellSlot = 1;
gunner.input.shellSlot = 1;
gunner.combat.ammo[1] = 0;
gunner.combat.reload.t = 0;
gunner.combat.reload.kind = 'ready';
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['gunner', input(1, true)],
    ['target', input(0)],
  ]),
});
const empty = match.snapshot({
  tick: 10,
  serverTimeMs: 170,
  viewerId: 'gunner',
  ackInputSeq: 10,
});
assert.ok(empty.events.some((event) =>
  event.type === 'ammo_empty' && event.id === 'gunner' && event.slot === 1),
'an empty selected type is rejected explicitly');
assert.ok(!empty.events.some((event) => event.type === 'shell_fired'),
  'empty ammunition never spawns a projectile');

gunner.bot = true;
gunner.aiCtl = null;
gunner.combat.shellSlot = 0;
gunner.input.shellSlot = 2;
gunner.input.fire = false;
match.step({ dt: SIM_DT, inputs: new Map() });
assert.equal(gunner.combat.shellSlot, 2,
  'bot ammunition requests pass through authoritative shell selection');

console.log(`ammunitionFlow.selftest: ${multiChannelLoadouts} multi-channel loadouts, ` +
  `${depletedChannelTransitions} depleted-slot transitions, ${guidedAuthorityLaunches} guided ` +
  'authority launches, finite ammo, and reloads passed');
