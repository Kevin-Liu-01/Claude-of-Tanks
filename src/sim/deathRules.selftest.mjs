// death-flow-275 (Kevin approved 2026-11-21): the death and verdict rules both drivers keep. The room authority's clock
// follows the ruleset as the solo step does (R1), a side wiped out with the other in one step is a draw (R2), a room's
// battle limit never pre-empts a mode that times itself nor clocks a mode without a clock (R3), a seat whose player left
// is driven by a bot past its grace and handed back on a rejoin (R5), a fire's kill is its starter's and a rack it cooks
// off is an ammo-rack kill (R8), the front's clock is its own rule (R10), and a destroyed hull's wait for its revive is the
// controller's armed respawn (the respawn dial's clock). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { matchRulesetFor, rulesetClockLimitS, rulesetTimesItself, SEAT_BOT_GRACE_S } from './matchRuleset.ts';
import { createFireCredit, createRecentDamage, fireDeathCause } from './fireCredit.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { SCUTTLE_CREDIT_S } from './matchRuleset.ts';
import { createCombatState, tickFire } from './damage.ts';
import { getSpec } from '../vehicles/specs.ts';

const SPEC = 'm1a1_abrams_hc';
const step = (match, seconds) => {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && !match.result; i++) match.step({ dt: 1 / 60, inputs: new Map() });
};
const far = (id, team, x, z) => ({ id, specId: SPEC, team, spawn: { x, z, yaw: team === 'alpha' ? 0 : Math.PI } });

// ---- R1: a room's Standard battle at the clock is a draw, whatever the headcount (was: the side with more survivors) ----
{
  const match = createAuthoritativeMatch({
    countdownS: 0, battleLimitS: 1,
    players: [far('r1-a', 'alpha', -400, -400), far('r1-a2', 'alpha', -380, -400), far('r1-b', 'bravo', 400, 400)],
  });
  match.onMatchReady();
  step(match, 1.2);
  assert.equal(match.resultReason, 'time_limit');
  assert.equal(match.result, 'draw', 'R1: two survivors against one at the clock is a draw, as the solo step rules it');
}
// a sortie timed to defeat is lost by the attackers at the clock, as solo
{
  const ruleset = { ...matchRulesetFor('standard'), timeout: 'defeat' };
  const match = createAuthoritativeMatch({
    countdownS: 0, battleLimitS: 1, ruleset,
    players: [far('r1d-a', 'alpha', -400, -400), far('r1d-b', 'bravo', 400, 400)],
  });
  match.onMatchReady();
  step(match, 1.2);
  assert.equal(match.result, 'bravo', 'R1: a timeout the ruleset rules a defeat goes to the defence');
}

// ---- R2: both sides wiped out in one step is a draw ----
{
  const match = createAuthoritativeMatch({
    countdownS: 0, players: [far('r2-a', 'alpha', -400, -400), far('r2-b', 'bravo', 400, 400)],
  });
  match.onMatchReady();
  step(match, 0.1);
  for (const entity of match.entities) { entity.combat.hp = 0; entity.combat.destroyed = true; }
  step(match, 1 / 60);
  assert.equal(match.resultReason, 'elimination');
  assert.equal(match.result, 'draw', 'R2: a mutual wipe is a draw');
}

// ---- R3: the battle's clock ----
{
  const clock = (mode, limit) => rulesetClockLimitS(matchRulesetFor(mode), limit);
  assert.equal(clock('standard', 60), 60, 'R3: a room limit replaces Standard\'s clock');
  assert.equal(clock('zone_control', 120), 120, 'R3: and a score mode\'s');
  assert.equal(clock('standard', null), 900, 'R3: no room limit: the ruleset\'s clock');
  for (const mode of ['juggernaut', 'infected', 'ac130', 'frontline_assault']) {
    assert.equal(rulesetTimesItself(matchRulesetFor(mode)), true, `${mode} times itself`);
    assert.equal(clock(mode, 30), matchRulesetFor(mode).timeLimitS, `R3: a room limit never pre-empts ${mode}'s own clock`);
  }
  for (const mode of ['endless_horde', 'proving_ground', 'training']) {
    assert.equal(clock(mode, 30), Infinity, `R3: a room limit puts no clock on ${mode}`);
  }
  const horde = createAuthoritativeMatch({
    countdownS: 0, battleLimitS: 1, gameMode: 'endless_horde',
    players: [far('r3-a', 'alpha', -400, -400),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `r3-z${i}`, specId: SPEC, team: 'bravo', bot: true }))],
  });
  horde.onMatchReady();
  step(horde, 1.5);
  assert.notEqual(horde.resultReason, 'time_limit', 'R3: the Horde runs on past a room limit');
}

// ---- R5: a left seat is a bot's after its grace, and its player's again on a rejoin ----
{
  const match = createAuthoritativeMatch({
    countdownS: 0, gameMode: 'zone_control',
    players: [far('r5-a', 'alpha', -300, -300), far('r5-b', 'bravo', 300, 300)],
  });
  match.onMatchReady();
  const seat = match.entities.find((entity) => entity.id === 'r5-a');
  assert.equal(seat.bot, false);
  match.onPeerLeave({ peerId: 'r5-a' });
  step(match, SEAT_BOT_GRACE_S - 1);
  assert.equal(seat.bot, false, 'R5: inside its grace the seat waits for its player, parked');
  assert.equal(seat.input.brake, true);
  step(match, 1.5);
  assert.equal(seat.bot, true, 'R5: past the grace a bot drives the seat');
  assert.ok(seat.aiCtl, 'R5: with a controller of its own');
  match.onPeerJoin({ peerId: 'r5-a' });
  assert.equal(seat.bot, false, 'R5: the player is back: the bot hands the seat over');
  assert.equal(seat.aiCtl, undefined);
  // a rejoin inside the grace keeps the seat its player's
  match.onPeerLeave({ peerId: 'r5-a' });
  step(match, 5);
  match.onPeerJoin({ peerId: 'r5-a' });
  step(match, SEAT_BOT_GRACE_S);
  assert.equal(seat.bot, false, 'R5: a rejoin inside the grace cancels the handover');
}

// ---- R8: a fire's kill is its starter's; a rack it cooks off is an ammo-rack kill ----
{
  const credit = createFireCredit();
  credit.ignite('victim', 'victim');
  assert.equal(credit.killerOf('victim'), 'victim', 'R8: a crew\'s own splash starts no credit');
  credit.ignite('victim', 'shooter');
  credit.ignite('victim', 'another');
  assert.equal(credit.killerOf('victim'), 'shooter', 'R8: the round that set it alight keeps the credit');
  credit.clear('victim');
  assert.equal(credit.killerOf('victim'), 'victim', 'R8: a fire out (or a wreck) forgets it');
  assert.equal(fireDeathCause(true), 'ammorack');
  assert.equal(fireDeathCause(false), 'fire');
  const spec = getSpec(SPEC);
  const combat = createCombatState(spec);
  combat.fire.burning = true;
  combat.fire.ticksLeft = 50;
  combat.modules.ammoRack.hp = 1;
  let fire = null;
  for (let i = 0; i < 50 && !combat.destroyed; i++) fire = tickFire({ combat }, () => 1);
  assert.equal(combat.destroyed, true, 'the fire cooked the rack off');
  assert.equal(fire.ammoRacked, true, 'R8: tickFire reports the rack it cooked off');
}

// ---- R7: a crew scuttles its tank; the kill is the enemy's that hurt it last within the window, else nobody's ----
{
  const recent = createRecentDamage();
  recent.record('v', 'v', 10);
  assert.equal(recent.creditFor('v', 10, SCUTTLE_CREDIT_S), null, 'R7: its own damage credits nobody');
  recent.record('v', 'enemy', 10);
  assert.equal(recent.creditFor('v', 10 + SCUTTLE_CREDIT_S, SCUTTLE_CREDIT_S), 'enemy', 'R7: inside the window, the enemy');
  assert.equal(recent.creditFor('v', 10.1 + SCUTTLE_CREDIT_S, SCUTTLE_CREDIT_S), null, 'R7: past it, nobody');
  const match = createAuthoritativeMatch({
    countdownS: 0, gameMode: 'zone_control',
    players: [far('r7-a', 'alpha', -300, -300), far('r7-b', 'bravo', 300, 300)],
  });
  match.onMatchReady();
  step(match, 0.2);
  const seat = match.entities.find((entity) => entity.id === 'r7-a');
  seat.input.actionBits = PLAYER_ACTION_BITS.SCUTTLE;
  match.step({ dt: 1 / 60, inputs: new Map([['r7-a', { actionBits: PLAYER_ACTION_BITS.SCUTTLE }]]) });
  if (!seat.combat.destroyed) step(match, 1 / 60);
  assert.equal(seat.combat.destroyed, true, 'R7: the scuttle bit destroys the hull');
  const events = match.snapshot({ tick: 1, serverTimeMs: 0, viewerId: 'r7-a', ackInputSeq: null }).events ?? [];
  const death = events.find((event) => event.type === 'tank_destroyed' && event.id === 'r7-a');
  assert.ok(death, 'R7: told as a destruction');
  assert.equal(death.cause, 'scuttle');
  assert.equal(death.killerId, 'r7-a', 'R7: no enemy hurt it: its own, so nobody scores');
  assert.ok(match.modeController.respawnFor('r7-a'), 'R7: a scuttled hull revives as any other in a reviving mode');
}

// ---- R10: the front's clock is its own rule (assault_time), not a 0-0 score ----
{
  const ruleset = { ...matchRulesetFor('frontline_assault'), timeLimitS: 1 };
  const match = createAuthoritativeMatch({
    mapId: 'verdant', countdownS: 0, gameMode: 'frontline_assault', ruleset,
    players: [{ id: 'r10-a', specId: SPEC, team: 'alpha' }, { id: 'r10-b', specId: 't90am', team: 'bravo' }],
  });
  match.onMatchReady();
  step(match, 1.5);
  assert.equal(match.resultReason, 'assault_time', 'R10: the sortie out of time');
  assert.equal(match.result, 'bravo');
}

// ---- the respawn dial's clock: a destroyed hull's wait is the controller's armed revive ----
{
  const match = createAuthoritativeMatch({
    countdownS: 0, gameMode: 'zone_control',
    players: [far('dial-a', 'alpha', -300, -300), far('dial-b', 'bravo', 300, 300)],
  });
  match.onMatchReady();
  step(match, 0.5);
  const seat = match.entities.find((entity) => entity.id === 'dial-a');
  seat.combat.hp = 0;
  seat.combat.destroyed = true;
  step(match, 1 / 60);
  const wait = match.modeController.respawnFor('dial-a');
  assert.ok(wait && wait.inS === matchRulesetFor('zone_control').respawnS, `the dial reads the armed revive (${JSON.stringify(wait)})`);
  assert.deepEqual(match.modeController.serialize('dial-a').respawn, wait, 'the viewer\'s mode state carries it');
  assert.equal(match.modeController.respawnFor('dial-b'), null, 'a living hull waits for nothing');
  step(match, 2.05);
  assert.equal(match.modeController.respawnFor('dial-a').inS, matchRulesetFor('zone_control').respawnS - 2, 'whole seconds, counting down');
  step(match, 6);
  assert.equal(seat.combat.destroyed, false, 'revived');
  assert.equal(match.modeController.respawnFor('dial-a'), null, 'no wait once revived');
  assert.equal(match.modeController.serialize('dial-a').respawn, undefined);
}
{
  // one life: Standard arms no revive, so no dial
  const match = createAuthoritativeMatch({
    countdownS: 0, players: [far('one-a', 'alpha', -300, -300), far('one-a2', 'alpha', -280, -300), far('one-b', 'bravo', 300, 300)],
  });
  match.onMatchReady();
  const seat = match.entities.find((entity) => entity.id === 'one-a');
  seat.combat.hp = 0;
  seat.combat.destroyed = true;
  step(match, 1 / 60);
  assert.equal(match.modeController.respawnFor('one-a'), null, 'Standard: no revive, no wait');
}

console.log('deathRules.selftest: clock parity, mutual wipe, the room clock, left seats to bots and back, fire credit, the front\'s clock and the respawn wait pass');
