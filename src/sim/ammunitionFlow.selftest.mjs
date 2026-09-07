import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import {
  firstAvailableAmmunitionSlot,
  hasAmmunition,
  shellAmmunitionCapacity,
  totalAmmunition,
  totalAmmunitionCapacity,
} from './ammunition.ts';
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
const supportedShellTypes = new Set(['AP', 'APCR', 'APFSDS', 'HEAT', 'HE', 'HESH']);
let authoredShellChannels = 0;
let multiChannelLoadouts = 0;
let depletedChannelTransitions = 0;
for (const spec of Object.values(TANK_SPECS)) {
  assert.ok(spec.gun.shells.length >= 1 && spec.gun.shells.length <= 3,
    `${spec.id}: every playable gun exposes one to three numbered ammunition channels`);
  assert.ok(Number.isFinite(spec.gun.reloadS) && spec.gun.reloadS > 0,
    `${spec.id}: gun reload is finite and positive`);
  const fresh = createCombatState(spec);
  assert.equal(fresh.shellSlot, 0, `${spec.id}: a fresh vehicle selects slot 1`);
  assert.equal(fresh.ammo.length, spec.gun.shells.length,
    `${spec.id}: inventory length matches its authored loadout`);
  assert.equal(fresh.ammoCapacity.length, spec.gun.shells.length,
    `${spec.id}: capacity length matches its authored loadout`);
  assert.equal(fresh.reloadChannels.length, spec.gun.shells.length,
    `${spec.id}: every ammunition type owns a reload-channel binding`);
  assert.deepEqual(fresh.ammo, fresh.ammoCapacity,
    `${spec.id}: every ammunition channel starts fully stocked`);
  assert.equal(totalAmmunition(fresh), totalAmmunitionCapacity(fresh),
    `${spec.id}: fresh total inventory equals authored total capacity`);

  const shellNames = new Set();
  for (let slot = 0; slot < spec.gun.shells.length; slot++) {
    const round = spec.gun.shells[slot];
    authoredShellChannels++;
    assert.equal(typeof round.name, 'string', `${spec.id} slot ${slot + 1}: shell is named`);
    assert.ok(round.name.trim().length > 0,
      `${spec.id} slot ${slot + 1}: shell name is non-empty`);
    assert.equal(shellNames.has(round.name), false,
      `${spec.id} slot ${slot + 1}: shell name is unique within the vehicle`);
    shellNames.add(round.name);
    assert.ok(supportedShellTypes.has(round.type),
      `${spec.id} slot ${slot + 1}: ${round.type} has combat behavior`);
    for (const field of ['caliberMm', 'dmg', 'velocityMps']) {
      assert.ok(Number.isFinite(round[field]) && round[field] > 0,
        `${spec.id} slot ${slot + 1}: ${field} is finite and positive`);
    }
    for (const field of ['pen100Mm', 'pen1000Mm']) {
      assert.ok(Number.isFinite(round[field]) && round[field] >= 0,
        `${spec.id} slot ${slot + 1}: ${field} is finite and non-negative`);
    }
    if (round.pen2000Mm != null) {
      assert.ok(Number.isFinite(round.pen2000Mm) && round.pen2000Mm >= 0,
        `${spec.id} slot ${slot + 1}: optional 2 km penetration is valid`);
    }
    if (round.reloadS != null) {
      assert.ok(Number.isFinite(round.reloadS) && round.reloadS > 0,
        `${spec.id} slot ${slot + 1}: per-channel reload is finite and positive`);
    }
    if (round.count != null) {
      assert.ok(Number.isInteger(round.count) && round.count > 0,
        `${spec.id} slot ${slot + 1}: authored capacity is a positive integer`);
    }
    const capacity = shellAmmunitionCapacity(round);
    assert.ok(Number.isInteger(capacity) && capacity > 0,
      `${spec.id} slot ${slot + 1}: resolved capacity is a positive integer`);
    assert.equal(fresh.ammo[slot], capacity,
      `${spec.id} slot ${slot + 1}: combat inventory uses the resolved capacity`);
    const reloadChannel = fresh.reloadChannels[slot];
    assert.ok(reloadChannel, `${spec.id} slot ${slot + 1}: reload channel exists`);
    if (round.guided === true) {
      assert.notEqual(reloadChannel, fresh.gunReload,
        `${spec.id} slot ${slot + 1}: external guided launcher has an isolated cycle`);
    } else {
      assert.equal(reloadChannel, fresh.gunReload,
        `${spec.id} slot ${slot + 1}: conventional rounds share the gun cycle`);
    }
  }

  if (spec.gun.shells.length > 1) {
    multiChannelLoadouts++;
    for (let depletedSlot = 0; depletedSlot < spec.gun.shells.length; depletedSlot++) {
      for (let stockedSlot = 0; stockedSlot < spec.gun.shells.length; stockedSlot++) {
        if (stockedSlot === depletedSlot) continue;
        const combat = createCombatState(spec);
        combat.shellSlot = depletedSlot;
        combat.ammo[depletedSlot] = 0;
        if (!hasAmmunition(combat, stockedSlot)) continue;
        assert.equal(selectShell(combat, stockedSlot, spec), true,
          `${spec.id}: stocked slot ${stockedSlot + 1} accepts selection`);
        assert.equal(combat.shellSlot, stockedSlot,
          `${spec.id}: can leave depleted slot ${depletedSlot + 1} for ${stockedSlot + 1}`);
        assert.equal(hasAmmunition(combat, combat.shellSlot), true,
          `${spec.id}: selected replacement slot ${stockedSlot + 1} remains fireable`);
        assert.equal(combat.reload, combat.reloadChannels[stockedSlot],
          `${spec.id}: selection activates slot ${stockedSlot + 1}'s reload channel`);
        const round = spec.gun.shells[stockedSlot];
        const expectedReloadS = round.guided === true
          ? (round.reloadS || spec.gun.reloadS)
          : spec.gun.autoloader
            ? (spec.gun.autoloader.fullReloadS || spec.gun.reloadS)
            : (round.reloadS || spec.gun.reloadS);
        assert.ok(Math.abs(combat.reload.totalS - expectedReloadS) < 1e-9,
          `${spec.id}: slot ${stockedSlot + 1} begins its complete authored load cycle`);
        assert.equal(combat.reload.kind,
          round.guided === true ? 'shell' : spec.gun.autoloader ? 'magazine' : 'shell',
          `${spec.id}: slot ${stockedSlot + 1} uses the correct reload mode`);
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
assert.equal(guidedRounds.length, 22, 'the complete guided-ammunition fleet is covered');
// The preserved 494-channel fleet plus thirteen three-channel source X builds.
assert.equal(authoredShellChannels, 533,
  'every authored ammunition channel in the saved fleet is covered');
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

let fleetFinalRoundLaunches = 0;
for (const spec of Object.values(TANK_SPECS)) {
  const fleetMatch = createAuthoritativeMatch({
    mapId: 'verdant',
    countdownS: 0,
    players: [
      { id: 'fleet-gunner', specId: spec.id, team: 'alpha',
        spawn: { x: 0, z: -200, yaw: 0 } },
      { id: 'fleet-target', specId: 't90m', team: 'bravo',
        spawn: { x: 0, z: 200, yaw: Math.PI } },
    ],
  });
  fleetMatch.onMatchReady();
  const fleetGunner = fleetMatch.entityById.get('fleet-gunner');

  for (let slot = 0; slot < spec.gun.shells.length; slot++) {
    const round = spec.gun.shells[slot];
    const fallbackSlot = spec.gun.shells.findIndex((_, index) => index !== slot);
    fleetGunner.combat.ammo.fill(0);
    fleetGunner.combat.ammo[slot] = 1;
    if (fallbackSlot >= 0) fleetGunner.combat.ammo[fallbackSlot] = 1;
    fleetGunner.combat.shellSlot = slot;
    fleetGunner.input.shellSlot = slot;
    fleetGunner.input.fire = false;
    fleetGunner._deniedShellSlot = undefined;
    for (const channel of new Set(fleetGunner.combat.reloadChannels)) {
      channel.t = 0;
      channel.kind = 'ready';
    }
    fleetGunner.combat.reload = fleetGunner.combat.reloadChannels[slot];
    if (fleetGunner.combat.magazine) {
      fleetGunner.combat.magazine.rounds = Math.max(1, fleetGunner.combat.magazine.rounds);
    }

    fleetMatch.step({
      dt: SIM_DT,
      inputs: new Map([
        ['fleet-gunner', input(slot, true)],
        ['fleet-target', input(0)],
      ]),
    });
    const fired = fleetMatch.snapshot({
      tick: fleetFinalRoundLaunches + 1,
      serverTimeMs: (fleetFinalRoundLaunches + 1) * 17,
      viewerId: 'fleet-gunner',
      ackInputSeq: fleetFinalRoundLaunches + 1,
    });
    assert.ok(fired.events.some((event) =>
      event.type === 'shell_fired' && event.shooterId === 'fleet-gunner'
        && event.shellName === round.name && event.shellType === round.type),
    `${spec.id} slot ${slot + 1}: final authored round fires through authority`);
    assert.equal(fleetGunner.combat.ammo[slot], 0,
      `${spec.id} slot ${slot + 1}: final authored round is consumed exactly once`);
    assert.ok(fired.events.some((event) =>
      event.type === 'ammo_depleted' && event.id === 'fleet-gunner'
        && event.slot === slot && event.fallbackSlot === fallbackSlot),
    `${spec.id} slot ${slot + 1}: authority reports the exact depletion fallback`);
    assert.equal(fleetGunner.combat.shellSlot, fallbackSlot >= 0 ? fallbackSlot : slot,
      `${spec.id} slot ${slot + 1}: depletion leaves a canonical combat selection`);
    assert.equal(fleetGunner.input.shellSlot, fallbackSlot >= 0 ? fallbackSlot : slot,
      `${spec.id} slot ${slot + 1}: authority mirrors the canonical input selection`);

    fleetMatch.afterSnapshotBroadcast();
    if (fallbackSlot >= 0) {
      fleetMatch.step({
        dt: SIM_DT,
        inputs: new Map([
          ['fleet-gunner', input(slot, true)],
          ['fleet-target', input(0)],
        ]),
      });
      const denied = fleetMatch.snapshot({
        tick: fleetFinalRoundLaunches + 2,
        serverTimeMs: (fleetFinalRoundLaunches + 2) * 17,
        viewerId: 'fleet-gunner',
        ackInputSeq: fleetFinalRoundLaunches + 2,
      });
      assert.ok(denied.events.some((event) =>
        event.type === 'ammo_selection_denied' && event.id === 'fleet-gunner'
          && event.slot === slot && event.reason === 'AMMO_EMPTY'
          && event.guided === (round.guided === true)),
      `${spec.id} slot ${slot + 1}: reselecting the empty channel is denied explicitly`);
      assert.equal(fleetGunner.combat.shellSlot, fallbackSlot,
        `${spec.id} slot ${slot + 1}: an empty request cannot displace the fallback`);
      assert.ok(!denied.events.some((event) => event.type === 'shell_fired'),
        `${spec.id} slot ${slot + 1}: an empty request cannot spawn another shell`);
      fleetMatch.afterSnapshotBroadcast();
    } else {
      assert.equal(firstAvailableAmmunitionSlot(fleetGunner.combat), -1,
        `${spec.id}: a fully exhausted single-channel vehicle has no synthetic ammunition`);
    }
    fleetFinalRoundLaunches++;
  }
}
assert.equal(fleetFinalRoundLaunches, authoredShellChannels,
  'every authored ammunition channel passes the authoritative final-round flow');

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
  `authority launches, ${fleetFinalRoundLaunches} fleet final-round launches, finite ammo, ` +
  'and reloads passed');
