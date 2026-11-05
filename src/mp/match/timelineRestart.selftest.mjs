// Proof (implicit state machine audit, round 2 U1, review round 1, 2026-11-04): a client follows a host that restarts the
// battle behind its clocks. A kept host (matchSession.ts bootKeptHost: the room had nobody else to elect) restarts a battle
// in progress (migrationFallback's last resort) on the newest tick it knows, which is behind every peer's clock by the
// time since the old host's last report, and by the whole battle when it knew none. The clients kept the old host's
// timeline: the TickClock ignored the new host's older ticks, the ServerClock's window held the old host's samples, and
// the input stream started at the WELCOME on the old timeline. Every INPUT ran far ahead of the new host (past the seat
// input buffer's MAX_LEAD_TICKS: refused), and once the server clock had turned over, the stream sent none at all until the
// new timeline caught up with it. Now the WELCOME re-anchors the tick clock on the link's host, and the first snapshot
// re-anchors the server clock and the input stream when it runs further from the clock than the clock's hard resync bound.
//   (a) a migration that continues the timeline (its WELCOME stamped at the resume tick, before the loop skipped the boot's
//       ticks): no re-anchor, the seat's inputs are admitted at once;
//   (b) a host that restarts the battle 1500 ticks behind on the same epoch (tick-locked, as matchActor.ts stamps frames):
//       the clocks re-anchor once, and the seat's inputs are admitted within a few frames and from then on.
import assert from 'node:assert/strict';
import { MigratingTransport, createLoopbackPair } from '../transport/index.ts';
import { MESSAGE_TYPE, TEAM, TICK_HZ, decodeMessage, encodeMessage } from '../wire/index.ts';
import { MatchClient } from './index.ts';
import { ScriptedMatchServer } from './scriptedServer.test-support.ts';
import { MAX_LEAD_TICKS } from '../../../server/match/inputBuffer.ts';

const SPEC = {
  enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
  turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
  armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
};
const FIELD = { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' };
const TICK_MS = 1000 / TICK_HZ;
const SEATS = [{ entityId: 1, specId: 'm1', playerId: 'p1', name: 'One', team: TEAM.ALPHA, token: 'tok-1', x: 0, z: 0, yaw: 0 }];
const LINK = { latencyMs: 30, jitterMs: 0, loss: 0 };
const controls = () => ({ throttle: 0.5, steer: 0, brake: false, fire: false, aimLocked: true, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 });

/** A link whose WELCOMEs read `shiftTicks` behind (a migrated host welcomes its held seats at the resume tick). */
function welcomeBehind(inner, shiftTicks) {
  return {
    kind: 'welcome-behind',
    get state() { return inner.state; }, get bufferedBytes() { return inner.bufferedBytes; }, get stats() { return inner.stats; },
    open: () => inner.open(), send: (frame) => inner.send(frame), reconnect: (reason, detail) => inner.reconnect(reason, detail),
    close: (reason, detail) => inner.close(reason, detail), onState: (listener) => inner.onState(listener),
    onFrame: (listener) => inner.onFrame((frame) => {
      const decoded = decodeMessage(frame);
      if (!decoded.ok || decoded.message.type !== MESSAGE_TYPE.WELCOME || !shiftTicks) { listener(frame); return; }
      const welcome = decoded.message;
      listener(encodeMessage({ ...welcome, serverTick: welcome.serverTick - shiftTicks, serverTimeMs: (welcome.serverTimeMs - Math.round(shiftTicks * TICK_MS)) >>> 0 }));
    }),
  };
}

function run({ newHostTick, welcomeShiftTicks = 0 }) {
  let nowMs = 100_000;
  const clock = () => nowMs;
  const first = new ScriptedMatchServer({ clock, heightField: FIELD, specFor: () => SPEC, seats: SEATS, countdownTicks: 0 });
  // the battle has run for 30 s before this seat's last link (in steps: the fixture skips a stall's dead time)
  for (let step = 0; step < 300; step++) { nowMs += 100; first.advance(nowMs); }
  const pairs = [];
  const oldPair = createLoopbackPair({ clock, clientToServer: LINK, serverToClient: LINK });
  pairs.push(oldPair);
  first.attach(oldPair.server);
  const servers = [first];
  const migrating = new MigratingTransport(oldPair.client);
  const client = new MatchClient({ transport: migrating, token: 'tok-1', clock, controls });
  const frame = () => {
    nowMs += 1000 / 60;
    for (const pair of pairs) pair.pump(nowMs);
    for (const server of servers) server.advance();
    for (const pair of pairs) pair.pump(nowMs);
    client.update(nowMs, 1 / 60);
  };
  client.connect();
  for (let index = 0; index < 180; index++) frame();
  assert.equal(client.isSeated, true, 'seated on the first host');
  const oldTick = first.currentTick;
  // the first host goes; the next runs the same epoch from `newHostTick`, its time locked to its ticks as matchActor.ts
  // stamps them (the fixture's own clock runs `behindMs` late, so its stall skip never moves the epoch)
  servers.length = 0;
  const startTick = newHostTick === 'continue' ? first.currentTick : newHostTick;
  const behindMs = (first.currentTick - startTick) * TICK_MS;
  const next = new ScriptedMatchServer({ clock: () => nowMs - behindMs, heightField: FIELD, specFor: () => SPEC, seats: SEATS, countdownTicks: 0 });
  next.tick = startTick;
  next.startedAtMs = first.startedAtMs;
  servers.push(next);
  const nextPair = createLoopbackPair({ clock, clientToServer: LINK, serverToClient: LINK });
  pairs.push(nextPair);
  next.attach(nextPair.server);
  const inputs = [];
  let frameIndex = 0;
  nextPair.server.onFrame((bytes) => {
    const decoded = decodeMessage(bytes, { maxBytes: 4096 });
    if (decoded.ok && decoded.message.type === MESSAGE_TYPE.INPUT) inputs.push({ frame: frameIndex, clientTick: decoded.message.clientTick, serverTick: next.currentTick });
  });
  migrating.replace(welcomeBehind(nextPair.client, welcomeShiftTicks), 'host changed');
  for (frameIndex = 0; frameIndex < 120; frameIndex++) frame();
  const admitted = (input) => input.clientTick <= input.serverTick + MAX_LEAD_TICKS && input.clientTick > input.serverTick;
  const stats = client.stats();
  client.dispose();
  return { oldTick, newTick: next.currentTick, inputs, admitted, timelineRestarts: stats.timelineRestarts ?? 0 };
}

// (a) a migration on the timeline: the WELCOME is stamped 420 ticks behind (a 7 s boot and hold), the loop is not
{
  const result = run({ newHostTick: 'continue', welcomeShiftTicks: 420 });
  assert.equal(result.timelineRestarts, 0, '(a) a host on the clients\' timeline re-anchors nothing (its WELCOME stamp is the resume tick, before the skip)');
  assert.ok(result.inputs.length > 50, `(a) the seat sends its inputs (${result.inputs.length})`);
  const refused = result.inputs.filter((input) => !result.admitted(input));
  assert.equal(refused.length, 0, `(a) every input lands inside the new host's lead window: ${JSON.stringify(refused.slice(0, 3))}`);
}

// (b) a kept host restarts the battle 1500 ticks behind on the same epoch
{
  const result = run({ newHostTick: 300 });
  assert.ok(result.oldTick - 300 > 1500, `(b) the restart runs behind the old timeline (${result.oldTick} -> 300)`);
  const late = result.inputs.filter((input) => input.frame >= 30);
  assert.ok(late.length > 40, `(b) the seat keeps sending inputs after the restart (${late.length} from frame 30 on; the stream sent ${result.inputs.length} in all${result.inputs.length ? `, the first at tick ${result.inputs[0].clientTick} against the host's ${result.inputs[0].serverTick}` : ''})`);
  const refused = late.filter((input) => !result.admitted(input));
  assert.equal(refused.length, 0, `(b) the new host admits them (lead ${MAX_LEAD_TICKS}): ${JSON.stringify(refused.slice(0, 3))}`);
  assert.equal(result.timelineRestarts, 1, '(b) the clocks re-anchored once, at the first snapshot');
}

console.log('timelineRestart.selftest: a client follows a host that restarts the battle behind its clocks (re-anchored at the first snapshot, inputs admitted), and keeps its clocks on a host that continues the timeline');
