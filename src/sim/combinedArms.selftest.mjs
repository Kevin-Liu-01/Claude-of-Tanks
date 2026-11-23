// Combined Arms (combined-arms-276; owner 2026-11-23: "lets add a mode with drone AND air support"): Air Support's sector
// battle with Drone's launch, through the network authority as a room hosts it (the match actor on a flat field).
// Copyright © 2026 Kevin B. Liu (NOTICE.md).
// - the battle is the three sectors with the support ledger, and every crew carries a drone on Drone's cooldown;
// - bots use both under their existing brains: they launch drones at what they fire on and spend points on call-ins;
// - one control seat: a bot flying its drone calls nothing (sim/airSupport.ts botCall), and the same bot calls once it is
//   back in its tank (the control);
// - a drone kill is a crew's own kill (the full kill points), never a call-in's.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { AERIAL_RULES, AIR_SUPPORT_RULES, matchRulesetFor } from './matchRuleset.ts';

const R = AIR_SUPPORT_RULES;
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const idle = { throttle: 0, steer: 0, fire: false, brake: true, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0 };
const ruleset = matchRulesetFor('combined_arms');
const actorOf = (seed, bots) => createMatchActor({ roomId: `arms-${seed}`, mapId: 'verdant', mode: 'combined_arms', seed,
  seats: [{ seat: 0, playerId: 'p', name: 'P', team: 'alpha', specId: SPEC }], bots, ruleset, world: world(), countdownS: 0,
  autoStart: false, now: () => 0, schedule: () => () => {}, resume: null });

// ---- the battle: three sectors, the ledger, a drone on every crew
{
  const actor = actorOf(3, [{ playerId: 'a1', name: 'A1', team: 'alpha', specId: SPEC }, { playerId: 'b1', name: 'B1', team: 'bravo', specId: SPEC }]);
  const sim = actor.authority; sim.onMatchReady();
  assert.ok(sim.modeController.airSupport, 'Combined Arms carries the support ledger');
  assert.equal(sim.modeController.state.zones?.length, 3, 'and plays the three sectors');
  for (const id of ['p', 'a1', 'b1']) {
    const aerial = sim.entityById.get(id).aerial;
    assert.equal(aerial?.kind, 'drone', `${id} carries a drone`);
    assert.equal(aerial.active, false, `${id}'s drone starts docked`);
  }
  actor.stop();
}

// ---- one control seat: a bot flying its drone calls nothing; the same bot on the same seed, in its tank, calls (the
// control). Each half on a fresh actor inside the first 6 s: from 8 s the bot launches its own drone at what it fires on,
// which (rightly) holds its call too.
{
  // a bot whose seeded preference a lone spotted enemy answers (rules.bots.minTargets: the gunship's and the missile's ask
  // for more): the first seed that gives b1 one
  let seed = 5;
  for (; seed < 40; seed++) {
    const probe = actorOf(seed, [{ playerId: 'b1', name: 'B1', team: 'bravo', specId: SPEC }]);
    probe.authority.onMatchReady();
    const preference = probe.authority.modeController.airSupport.botPreference('b1');
    probe.stop();
    if (R.bots.minTargets[preference] <= 1) break;
  }
  assert.ok(seed < 40, 'a seed gives b1 a call-in one spotted enemy answers');
  const calls = (flying) => {
    const actor = actorOf(seed, [{ playerId: 'b1', name: 'B1', team: 'bravo', specId: SPEC }]);
    const sim = actor.authority; sim.onMatchReady();
    const air = sim.modeController.airSupport;
    const bot = sim.entityById.get('b1');
    const saved = air.capture(); saved.points = saved.points.map(([id]) => [id, id === 'b1' ? R.points.cap : 0]); air.restore(saved);
    const out = [];
    for (let n = 0; n < 60 * 6 && !out.length; n++) {
      sim.entityById.get('p').state.pos.set(0, 0, 0);
      bot.state.pos.set(0, 0, 200);
      if (flying) bot.aerial.active = true;
      sim.step({ dt: 1 / 60, inputs: new Map([['p', idle]]) });
      for (const e of sim.eventsForViewer('p')) if (e.type === 'mode_strike_called' && e.callerId === 'b1') out.push(e);
      sim.afterEventBroadcast();
    }
    actor.stop();
    return out.length;
  };
  assert.equal(calls(true), 0, 'a bot flying its drone calls no strike');
  assert.ok(calls(false) > 0, 'control: the same bot, with points and the enemy spotted, calls from its tank');
}

// ---- bots use both: across a battle, bots launch drones and call strikes, never while flying
{
  const bots = [
    { playerId: 'a1', name: 'A1', team: 'alpha', specId: SPEC }, { playerId: 'a2', name: 'A2', team: 'alpha', specId: SPEC },
    { playerId: 'b1', name: 'B1', team: 'bravo', specId: SPEC }, { playerId: 'b2', name: 'B2', team: 'bravo', specId: SPEC },
    { playerId: 'b3', name: 'B3', team: 'bravo', specId: SPEC },
  ];
  const actor = actorOf(11, bots);
  const sim = actor.authority; sim.onMatchReady();
  const air = sim.modeController.airSupport;
  const ids = bots.map((bot) => bot.playerId);
  const launched = new Set(), callers = new Set(), flyingCalls = [];
  const wasActive = new Map();
  const score = () => ({ ...sim.modeController.state.score });
  let funded = false;
  for (let n = 0; n < 60 * 150 && !(launched.size && callers.size); n++) {
    sim.entityById.get('p').state.pos.set(-300, 0, -300);
    sim.step({ dt: 1 / 60, inputs: new Map([['p', idle]]) });
    for (const id of ids) {
      const e = sim.entityById.get(id);
      const active = !!e?.aerial?.active;
      if (active && !wasActive.get(id)) launched.add(id);
      wasActive.set(id, active);
    }
    for (const e of sim.eventsForViewer('p')) {
      if (e.type !== 'mode_strike_called' || !ids.includes(e.callerId)) continue;
      callers.add(e.callerId);
      if (sim.entityById.get(e.callerId)?.aerial?.active) flyingCalls.push(e.callerId);
    }
    sim.afterEventBroadcast();
    // (once the fight has started, every bot holds enough for a call: the receipt's battle is two minutes, not eight)
    if (!funded && n === 60 * 20) {
      funded = true;
      const saved = air.capture(); saved.points = saved.points.map(([id, value]) => [id, ids.includes(id) ? R.points.cap : value]); air.restore(saved);
    }
  }
  assert.ok(launched.size > 0, `bots launch drones in Combined Arms (${[...launched]})`);
  assert.ok(callers.size > 0, `bots call strikes in Combined Arms (${[...callers]})`);
  assert.deepEqual(flyingCalls, [], 'no bot called a strike while flying its drone');
  console.log('combinedArms bots', JSON.stringify({ launched: [...launched], callers: [...callers], timeS: Math.round(sim.timeS ?? 0), score: score() }));
  actor.stop();
}

assert.equal(ruleset.respawnS, matchRulesetFor('air_support').respawnS, 'Air Support\'s respawn');
assert.equal(AERIAL_RULES.drone.cooldownS, 25, 'Drone\'s own cooldown, shared');
assert.ok(R.points.kill > R.points.supportKill, 'a crew\'s own kill (its drone\'s included) is worth more than a call-in\'s');
console.log('combinedArms PASS');
