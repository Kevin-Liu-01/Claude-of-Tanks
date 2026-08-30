import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { SIM_DT } from './movement.ts';

const guidedRounds = [];
for (const spec of Object.values(TANK_SPECS)) {
  for (let slot = 0; slot < spec.gun.shells.length; slot++) {
    const round = spec.gun.shells[slot];
    if (!round.guided) continue;
    guidedRounds.push({ spec, round, slot });
    assert.ok(round.reloadS >= 2 && round.reloadS <= 3,
      `${spec.id} slot ${slot + 1}: guided launcher reload is 2-3 seconds`);
  }
}
assert.equal(guidedRounds.length, 19, 'the complete guided-ammunition fleet is covered');

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

console.log('ammunitionFlow.selftest: all slots, finite authority ammo, and guided reloads passed');
