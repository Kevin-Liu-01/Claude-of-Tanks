// consumableAuthority.selftest — the consumable catalog through the network authority (2026-10-26): a seat's chosen
// items reach its tank sanitized against the vehicle and the mode, a use replicates its item and charges, a timed item
// bends the viewer's multipliers the predictor reads (the Governor Override's `power`, wire 9), an armed APS charge
// stops a HEAT round short of the hull, and a mode without consumables says so. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { GOVERNOR_POWER_MULT, RATIONS_AIM_MULT } from './consumableRules.ts';
import { VIEWER_EQUIPMENT } from '../mp/wire/constants.ts';

assert.ok(VIEWER_EQUIPMENT.includes('power'), 'the viewer row carries engine power');
const input = (bits) => ({ throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true, shellSlot: 0, actionBits: bits,
  aimYaw: 0, aimPitch: 0, aimRange: 100 });

const match = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'modern', specId: 'm1a1_abrams_hc', team: 'alpha', consumables: ['governor_override', 'rations', 'aps_charge'],
      spawn: { x: -200, z: -300, yaw: 0 } },
    { id: 'ww2', specId: 'kv2', team: 'bravo', consumables: ['aps_charge', 'rations', 'foliage'],
      spawn: { x: 200, z: 300, yaw: Math.PI } },
    { id: 'default', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 260, z: 300, yaw: Math.PI } },
  ],
});
match.onMatchReady();
const modern = match.entityById.get('modern');
assert.deepEqual(modern.consumableItems, ['governor_override', 'rations', 'aps_charge'], 'a seat carries its chosen items');
assert.deepEqual(match.entityById.get('ww2').consumableItems, ['repair', 'rations', 'foliage'],
  'an item the vehicle cannot carry gives its slot to the default');
assert.deepEqual(match.entityById.get('default').consumableItems, ['repair', 'first_aid', 'extinguisher'],
  'a seat that chose nothing carries the trio');
assert.equal(modern.consumableReadyAt, modern.consumables.readyAt, 'the bots read the state itself');

// governor override: power on the viewer's multipliers while it runs, then back
match.step({ dt: 1 / 60, inputs: new Map([['modern', input(PLAYER_ACTION_BITS.REPAIR)]]) });
assert.equal(modern.combat.equipMults.power, GOVERNOR_POWER_MULT);
const used = match.snapshot({ tick: 1, serverTimeMs: 16, viewerId: 'modern', ackInputSeq: 1 }).events
  .find((event) => event.type === 'consumable_used' && event.id === 'modern');
assert.ok(used, 'the use replicates');
assert.equal(used.item, 'governor_override');
assert.equal(used.charges, 1, 'its charges left');
match.afterEventBroadcast?.();
for (let tick = 0; tick < 11 * 60; tick++) match.step({ dt: 1 / 60, inputs: new Map() });
assert.equal(modern.combat.equipMults.power, 1, 'the burst ends after ten seconds');

// rations: the aim multiplier the predictor reads
const aimBefore = modern.combat.equipMults.aimTime;
match.step({ dt: 1 / 60, inputs: new Map([['modern', input(PLAYER_ACTION_BITS.FIRST_AID)]]) });
assert.equal(modern.combat.equipMults.aimTime, aimBefore * RATIONS_AIM_MULT);

// APS: an armed charge stops a HEAT round from the front short of the hull (spent, no strike), its burst off the struck
// face; the charge is gone, so the next round strikes
const apsMatch = createAuthoritativeMatch({
  countdownS: 0, seed: 19,
  players: [
    { id: 'aps-a', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -25, yaw: 0 } },
    { id: 'aps-t', specId: 'm1a1_abrams_hc', team: 'bravo', consumables: ['aps_charge', 'first_aid', 'extinguisher'],
      spawn: { x: 0, z: 0, yaw: Math.PI } },
  ],
});
apsMatch.onMatchReady();
const apsShooter = apsMatch.entityById.get('aps-a'), apsTarget = apsMatch.entityById.get('aps-t');
const heat = apsShooter.spec.gun.shells.findIndex((shell) => shell.type === 'HEAT');
assert.ok(heat >= 0, 'the Abrams carries a HEAT round');
apsShooter.combat.shellSlot = heat;
apsShooter.input.shellSlot = heat;
const fireInput = { throttle: 0, steer: 0, brake: true, fire: true, aimYaw: 0, aimPitch: 0, shellSlot: heat, actionBits: 0 };
const apsEvents = [];
const apsStep = (inputs) => {
  apsMatch.step({ dt: 1 / 60, inputs });
  apsEvents.push(...apsMatch.eventsForViewer('aps-t'));
  apsMatch.afterEventBroadcast();
};
apsStep(new Map([['aps-t', input(PLAYER_ACTION_BITS.REPAIR)]]));
const apsHp = apsTarget.combat.hp;
for (let tick = 0; tick < 240 && !apsEvents.some((event) => event.type === 'aps_intercept'); tick++) {
  apsStep(new Map([['aps-a', fireInput]]));
  fireInput.fire = false;
}
const intercept = apsEvents.find((event) => event.type === 'aps_intercept');
assert.ok(intercept, 'the armed charge meets the HEAT round');
assert.equal(intercept.id, 'aps-t');
assert.equal(intercept.shooterId, 'aps-a');
assert.ok(Number.isFinite(intercept.x) && Number.isFinite(intercept.z) && intercept.munition, 'the burst and its munition');
for (let tick = 0; tick < 30; tick++) apsStep(new Map());
assert.equal(apsTarget.combat.hp, apsHp, 'the intercepted round does no damage');
assert.ok(!apsEvents.some((event) => event.type === 'shell_hit' && event.targetId === 'aps-t'), 'and never strikes the hull');
assert.ok(!apsMatch.snapshot({ tick: 1, serverTimeMs: 0, viewerId: 'aps-a', ackInputSeq: 1 }).shells
  .some((shell) => shell.id === intercept.shellId), 'the round is spent');
fireInput.fire = true;
for (let tick = 0; tick < 900 && !apsEvents.some((event) => event.type === 'shell_hit' && event.targetId === 'aps-t'); tick++) {
  apsStep(new Map([['aps-a', fireInput]]));
}
assert.ok(apsEvents.some((event) => event.type === 'shell_hit' && event.targetId === 'aps-t'), 'the spent charge stops no more');
assert.equal(apsEvents.filter((event) => event.type === 'aps_intercept').length, 1);

// a mode without consumables refuses every press
const realistic = createAuthoritativeMatch({
  countdownS: 0, gameMode: 'realistic',
  players: [{ id: 'p', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -300, yaw: 0 } }],
});
realistic.onMatchReady();
realistic.step({ dt: 1 / 60, inputs: new Map([['p', input(PLAYER_ACTION_BITS.REPAIR)]]) });
const denied = realistic.snapshot({ tick: 1, serverTimeMs: 16, viewerId: 'p', ackInputSeq: 1 }).events
  .find((event) => event.type === 'consumable_denied');
assert.equal(denied?.reason, 'RULESET', 'a mode without consumables says so');
console.log('consumableAuthority.selftest: seat loadouts, replicated uses, predicted multipliers, the APS interception and the ruleset refusal passed');
