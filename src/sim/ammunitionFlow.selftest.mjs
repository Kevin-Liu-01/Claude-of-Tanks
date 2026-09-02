import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { hasAmmunition } from './ammunition.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createCombatState, selectFirstAvailableShell, selectShell } from './damage.ts';
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

{
  const spec = TANK_SPECS.m1a2;
  const combat = createCombatState(spec);
  combat.shellSlot = 1;
  combat.ammo = [5, 0, 2];
  assert.equal(selectShell(combat, 1, spec), false,
    'an exhausted slot is rejected by the canonical selector');
  assert.equal(selectFirstAvailableShell(combat, spec), 0,
    'depletion fallback selects the first stocked ammunition type');
  assert.equal(combat.shellSlot, 0);
  assert.equal(combat.reload.t, combat.reload.totalS,
    'automatic fallback begins a complete reload for its replacement type');
}

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
  const before = guidedGunner.combat.ammo[slot];
  if (fallbackSlot >= 0) {
    guidedMatch.step({
      dt: SIM_DT,
      inputs: new Map([
        ['guided-gunner', input(slot)],
        ['guided-target', input(0)],
      ]),
    });
    assert.ok(guidedGunner.combat.reload.t > 0,
      `${spec.id} slot ${slot + 1}: switching starts a complete reload`);
    const reloadTicks = Math.ceil(guidedGunner.combat.reload.t / SIM_DT) + 1;
    for (let tick = 0; tick < reloadTicks; tick++) {
      guidedMatch.step({
        dt: SIM_DT,
        inputs: new Map([
          ['guided-gunner', input(slot)],
          ['guided-target', input(0)],
        ]),
      });
    }
  } else {
    guidedGunner.combat.reload.t = 0;
    guidedGunner.combat.reload.kind = 'ready';
  }
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

{
  const guidedCase = guidedRounds.find(({ spec, slot }) =>
    spec.gun.shells.some((_, index) => index !== slot));
  assert.ok(guidedCase, 'at least one guided loadout has a conventional fallback');
  const { spec, slot } = guidedCase;
  const denialMatch = createAuthoritativeMatch({
    mapId: 'verdant',
    countdownS: 0,
    players: [
      { id: 'guided-denial-gunner', specId: spec.id, team: 'alpha',
        spawn: { x: 0, z: -200, yaw: 0 } },
      { id: 'guided-denial-target', specId: 't90m', team: 'bravo',
        spawn: { x: 0, z: 200, yaw: Math.PI } },
    ],
  });
  denialMatch.onMatchReady();
  const gunner = denialMatch.entityById.get('guided-denial-gunner');
  const fallbackSlot = gunner.spec.gun.shells.findIndex((_, index) => index !== slot);
  gunner.combat.shellSlot = fallbackSlot;
  gunner.input.shellSlot = fallbackSlot;
  gunner.combat.ammo[slot] = 0;
  denialMatch.step({
    dt: SIM_DT,
    inputs: new Map([
      ['guided-denial-gunner', input(slot)],
      ['guided-denial-target', input(0)],
    ]),
  });
  const snapshot = denialMatch.snapshot({
    tick: 1,
    serverTimeMs: 17,
    viewerId: 'guided-denial-gunner',
    ackInputSeq: 1,
  });
  assert.ok(snapshot.events.some((event) =>
    event.type === 'ammo_selection_denied' && event.id === 'guided-denial-gunner'
      && event.slot === slot && event.reason === 'AMMO_EMPTY' && event.guided === true),
  'authority identifies an empty guided channel for missile-specific HUD feedback');
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
gunner.combat.ammo[0] = Math.max(1, gunner.combat.ammo[0]);
gunner.combat.ammo[1] = 1;
gunner.combat.reload.t = 0;
gunner.combat.reload.kind = 'ready';
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['gunner', input(1, true)],
    ['target', input(0)],
  ]),
});
const depleted = match.snapshot({
  tick: 10,
  serverTimeMs: 170,
  viewerId: 'gunner',
  ackInputSeq: 10,
});
assert.ok(depleted.events.some((event) =>
  event.type === 'ammo_depleted' && event.id === 'gunner' && event.slot === 1
    && event.fallbackSlot === 0),
'firing the final round announces depletion and the first stocked fallback');
assert.equal(gunner.combat.shellSlot, 0);
assert.equal(gunner.input.shellSlot, 0);
assert.equal(gunner.combat.reload.t, gunner.combat.reload.totalS,
  'automatic fallback begins a complete reload for the replacement type');

match.afterSnapshotBroadcast();
match.step({
  dt: SIM_DT,
  inputs: new Map([
    ['gunner', input(1)],
    ['target', input(0)],
  ]),
});
const emptySelection = match.snapshot({
  tick: 11,
  serverTimeMs: 187,
  viewerId: 'gunner',
  ackInputSeq: 11,
});
assert.ok(emptySelection.events.some((event) =>
  event.type === 'ammo_selection_denied' && event.id === 'gunner'
    && event.slot === 1 && event.reason === 'AMMO_EMPTY'),
'selecting an empty type is rejected explicitly for HUD feedback');
assert.equal(gunner.combat.shellSlot, 0,
  'an empty selection never displaces the stocked fallback');
assert.ok(!emptySelection.events.some((event) => event.type === 'shell_fired'),
  'an empty selection never spawns a projectile');

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
