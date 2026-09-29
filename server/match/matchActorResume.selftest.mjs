// The match actor's peer-to-peer seams (P2 client lane): a ready collision world object stands in for the 'dedicated'
// shard (released with the actor), `resume` boots the loop at the old host's tick with the countdown skipped and the
// battle clock continued (snapshot meta and the verdict add the resumed time; the clock limit counts from it),
// `entityForWireId` / `wireIdOf` name the entities behind the wire ids in seat-then-bot order; a fresh actor is
// unchanged (tick 0, the countdown, no offset); invalid resume options are refused.
import assert from 'node:assert/strict';
import { MESSAGE_TYPE, PHASE, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { applySnapshotPacket, decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { createDedicatedWorldCollision } from '../dedicatedWorldCollision.ts';
import { createLoopbackLink } from './link.ts';
import { createMatchActor } from './matchActor.ts';

const TICK_MS = 1000 / 60;
let nowMs = 50_000;
const now = () => nowMs;
const schedule = () => () => {};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const seats = [
  { seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a2' },
  { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90m' },
];
const bots = [{ playerId: 'bot-a', name: 'Bot A', team: 'alpha', specId: 'leo2a7v' }];

function attachViewer(actor, seat, playerId) {
  const link = createLoopbackLink(playerId);
  const viewer = { frames: [], welcome: null, closed: null, history: new Map() };
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => viewer.history.get(tick) ?? null });
    assert.ok(decoded.ok, decoded.ok ? '' : decoded.error.code);
    const message = decoded.message;
    if (message.type === MESSAGE_TYPE.WELCOME) viewer.welcome = message;
    if (message.type === MESSAGE_TYPE.SNAPSHOT) {
      const frame = applySnapshotPacket(message, message.keyframe ? null : viewer.history.get(message.baseTick) ?? null);
      viewer.frames.push(frame);
      viewer.history.set(frame.tick, frame);
      link.client.send(encodeMessage({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: frame.tick }));
    }
    if (message.type === MESSAGE_TYPE.CLOSE) viewer.closed = message;
  });
  const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'x', clientBuild: 'resume' };
  actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat, playerId, name: playerId, team: 'alpha', specId: 'm1a2', iat: 0, exp: 1 });
  return viewer;
}

async function advance(actor, ticks) {
  for (let n = 0; n < ticks; n++) { nowMs += TICK_MS; actor.advance(nowMs); await flush(); }
}

// ---- invalid resume options
for (const resume of [{ tick: -1, battleTimeMs: 0 }, { tick: 1.5, battleTimeMs: 0 }, { tick: 3, battleTimeMs: -1 }, { tick: 3, battleTimeMs: Number.NaN }]) {
  assert.throws(() => createMatchActor({ roomId: 'resume-bad', mapId: 'verdant', seed: 1, seats, world: 'terrain', now, schedule, autoStart: false, resume }), /resume needs/);
}

// ---- a fresh actor: tick 0, the countdown, no offset
{
  const actor = createMatchActor({ roomId: 'fresh', mapId: 'verdant', seed: 11, seats, bots, world: 'terrain', countdownS: 1, now, schedule });
  assert.equal(actor.tick, 0);
  assert.equal(actor.resumedBattleTimeMs, 0);
  assert.equal(actor.authority.phase, 'countdown');
  assert.equal(actor.entityForWireId(1)?.id, 'p1');
  assert.equal(actor.entityForWireId(2)?.id, 'p2');
  assert.equal(actor.entityForWireId(3)?.id, 'bot-a', 'bots follow the seats');
  assert.equal(actor.entityForWireId(4), null);
  assert.equal(actor.wireIdOf('bot-a'), 3);
  assert.equal(actor.wireIdOf('nobody'), null);
  actor.stop();
}

// ---- a ready world object replaces the 'dedicated' shard and is released with the actor
{
  const world = createDedicatedWorldCollision('verdant', { retain: true });
  let released = 0;
  const wrapped = Object.assign(Object.create(world), { release: () => { released++; world.release(); } });
  const actor = createMatchActor({ roomId: 'world-obj', mapId: 'verdant', seed: 5, seats, world: wrapped, countdownS: 0, now, schedule });
  assert.ok(actor.authority.entities.length === 2);
  assert.ok(typeof actor.authority.heightField === 'object', 'the authority took the world');
  await advance(actor, 5);
  assert.equal(actor.tick, 5);
  actor.stop();
  assert.equal(released, 1, 'the object world is released once on stop');
}

// ---- resume: the tick timeline continues, the countdown is skipped, the clocks carry the resumed time
{
  const verdicts = [];
  const actor = createMatchActor({
    roomId: 'resumed', mapId: 'verdant', seed: 21, seats, bots, world: 'terrain', countdownS: 5, now, schedule,
    resume: { tick: 1200, battleTimeMs: 30_000 }, battleLimitS: 31, endedLingerTicks: 2, onVerdict: (verdict) => verdicts.push(verdict),
  });
  assert.equal(actor.tick, 1200, 'the loop starts at the resumed tick');
  assert.equal(actor.resumedBattleTimeMs, 30_000);
  assert.equal(actor.authority.phase, 'playing', 'no countdown on a resume');
  const viewer = attachViewer(actor, 0, 'p1');
  await flush();
  assert.equal(viewer.welcome.serverTick, 1200, 'WELCOME names the resumed tick');
  assert.equal(viewer.welcome.serverTimeMs, Math.round(1200 * TICK_MS), 'the server time follows the continuous tick timeline');
  await advance(actor, 12);
  assert.equal(actor.tick, 1212);
  const first = viewer.frames[0];
  assert.ok(first, 'a snapshot arrived');
  assert.ok(first.tick > 1200 && first.tick <= 1212, `snapshot ticks continue the timeline (${first.tick})`);
  assert.equal(first.meta.phase, PHASE.PLAYING);
  assert.ok(first.meta.battleTimeMs >= 30_000 && first.meta.battleTimeMs < 30_400, `the battle clock continues from 30 s (${first.meta.battleTimeMs})`);
  // the clock limit counts from the resumed time: 31 s limit − 30 s played = 1 s to the verdict
  await advance(actor, 70);
  assert.equal(verdicts.length, 1, 'the time limit fell 1 s after the resume');
  assert.equal(verdicts[0].reason, 'time_limit');
  assert.ok(verdicts[0].battleTimeMs >= 31_000 && verdicts[0].battleTimeMs < 31_300, `the verdict's battle time carries the resumed offset (${verdicts[0].battleTimeMs})`);
  assert.ok(verdicts[0].tick > 1200);
  await advance(actor, 4);
  assert.equal(actor.stopped, true);
}

// ---- a resume with the ruleset's own clock: the limit counts from the resumed time
{
  const actor = createMatchActor({ roomId: 'resumed-ruleset', mapId: 'verdant', seed: 3, seats, world: 'terrain', now, schedule, autoStart: false, resume: { tick: 60, battleTimeMs: 12_000 } });
  assert.equal(actor.tick, 60);
  assert.equal(actor.authority.phase, 'loading');
  actor.start();
  assert.equal(actor.authority.phase, 'playing');
  actor.stop();
}
console.log('matchActorResume.selftest: world object, resume tick/clock/countdown/limit, wire id lookups verified');
