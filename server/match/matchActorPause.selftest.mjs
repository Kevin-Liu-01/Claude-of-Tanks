// The match actor's pause (RUST-ENGINE-DECISION §7 step 5, a solo battle on a local host): a solo match paused at a tick
// boundary runs no tick while its clock moves on, resumes from the same tick on a rebased clock, and reaches the state an
// unpaused twin reaches at every tick — the pause changes when ticks run, never what they compute. A match with two human
// seats refuses it; so do a stopped actor, a second pause and a resume without one.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMatchActor } from './matchActor.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';

// The actor reads finalized combat anatomy; production hosts load their roster's groups first (Node: all).
await ensureAuthorityFleet();

const TICK_MS = 1000 / 60;
const solo = [{ seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a1_abrams_hc' }];
const bots = Array.from({ length: 7 }, (_, index) => ({
  playerId: `bot${index}`, name: `Bot ${index}`, team: index % 2 ? 'alpha' : 'bravo',
  specId: ['t90am', 'leo2_improved', 'merkava4', 'leclerc_sxxi'][index % 4], difficulty: ['easy', 'normal', 'hard'][index % 3],
}));

function twin(seats = solo) {
  const clock = { ms: 80_000 };
  const actor = createMatchActor({
    roomId: 'pause', mapId: 'verdant', seed: 11, seats, bots, world: 'terrain', countdownS: 1,
    now: () => clock.ms, schedule: () => () => {}, autoStart: false,
  });
  actor.start();
  return { actor, clock, step: (ms) => { clock.ms += ms; return actor.advance(clock.ms); } };
}

function digest(actor) {
  const hash = createHash('sha256');
  for (const e of actor.authority.entities) {
    const s = e.state, c = e.combat;
    hash.update(`${e.id}|${s.pos.x},${s.pos.y},${s.pos.z}|${s.yaw}|${s.speed}|${s.turretYaw}|${s.gunPitch}|${c.hp}|${c.destroyed}|${c.reload?.t}\n`);
  }
  return hash.digest('hex');
}

const steady = twin(), paused = twin();
let checks = 0;
for (let frame = 1; frame <= 1200; frame++) {
  steady.step(TICK_MS);
  if (frame === 400) {
    assert.equal(paused.actor.pause(), true, 'a solo match pauses');
    assert.equal(paused.actor.paused, true);
    assert.equal(paused.actor.pause(), false, 'a paused match does not pause again');
    const tick = paused.actor.tick;
    // twelve seconds of the clock, at display frames and in one long stall: no tick runs
    for (let n = 0; n < 600; n++) assert.equal(paused.step(TICK_MS), 0, 'a paused actor runs no tick');
    assert.equal(paused.step(2_000), 0, 'nor after a stall');
    assert.equal(paused.actor.tick, tick, 'the tick holds');
    paused.actor.start();
    assert.equal(paused.actor.tick, tick, 'start does not resume a paused actor');
    assert.equal(paused.actor.resume(), true, 'it resumes');
    assert.equal(paused.actor.resume(), false, 'a running match does not resume again');
    assert.equal(paused.actor.loop.stats.droppedTicks, 0, 'the pause drops no backlog');
  }
  paused.step(TICK_MS);
  assert.equal(paused.actor.tick, steady.actor.tick, `frame ${frame}: the same tick`);
  if (frame % 100 === 0) { assert.equal(digest(paused.actor), digest(steady.actor), `frame ${frame}: the same state`); checks++; }
}
assert.ok(steady.actor.authority.phase !== 'loading', 'the match runs');

// two human seats: no pause
const pair = twin([...solo, { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90am' }]);
pair.step(TICK_MS * 10);
assert.equal(pair.actor.pause(), false, 'a match with two human seats does not pause');
assert.equal(pair.actor.paused, false);
// a stopped actor: no pause
steady.actor.stop();
assert.equal(steady.actor.pause(), false, 'a stopped actor does not pause');
paused.actor.stop();
pair.actor.stop();

console.log(`matchActorPause.selftest: a solo match paused at tick 400 for 12 s resumes on the same tick and matches its unpaused twin at all ${checks} checks; two seats and a stopped actor refuse the pause`);
