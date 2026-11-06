// Proof (implicit state machine audit, round 2 U1, review rounds 1 and 2, 2026-11-04): a client follows a host that restarts
// the battle. A kept host (matchSession.ts bootKeptHost: the room had nobody else to elect) restarts a battle in progress
// (migrationFallback's last resort: a countdown from the spawns at battle time 0) on the newest tick it knows, which is
// behind every peer's clock by the time since the old host's last report, and by the whole battle when it knew none.
// Review round 1: the clients kept the old host's timeline: the TickClock ignored the new host's older ticks, the
// ServerClock's window held the old host's samples, and the input stream started at the WELCOME on the old timeline. Every
// INPUT ran far ahead of the new host (past the seat input buffer's MAX_LEAD_TICKS: refused), and once the server clock had
// turned over, the stream sent none at all until the new timeline caught up with it. Now the WELCOME re-anchors the tick
// clock on the link's host, and the first snapshot re-anchors the server clock and the input stream when it runs further
// from the clock than the clock's hard resync bound.
// Review round 2: what the client retained of the abandoned battle for the next election outlived it. Only the keyframe
// went; the props it felled, its destruction stages and its revives stayed, and a later election's resume merged them
// (migrationState.ts resumeStateFromRetained: a fence knocked down that stands in the battle being played, an old revive
// counted once the restarted timeline passed its tick). Now MigrationStore.abandonBattle drops all of it at once, and
// keeps what the restarted host sent after its WELCOME (its events may come before the snapshot that tells the restart).
//   (a) a migration that continues the timeline (its WELCOME stamped at the resume tick, before the loop skipped the boot's
//       ticks): no re-anchor, the seat's inputs are admitted at once, and everything retained of the battle stays;
//   (b) a host that restarts the battle 1500 ticks behind on the same epoch (tick-locked, as matchActor.ts stamps frames):
//       the clocks re-anchor once, and the seat's inputs are admitted within a few frames and from then on. The keyframe,
//       the fallen fence, the destruction stage and the revive retained from the old battle go, and a later election's
//       resume of the restarted battle lists nothing destroyed; the restarted host's next keyframe is kept;
//   (c) a host that restarts the battle on the clients' clock (it knew the newest tick: its countdown runs at the old
//       battle's tick): no clock re-anchor, but the battle restart is told by the phase, and the old battle's retained state
//       goes; a fall and a keyframe the restarted host sent between its WELCOME and its first snapshot stay;
//   (d) as (b), with that fall and keyframe: the restarted host's first keyframe (id 1 again, at a tick below the old
//       battle's keyframe, at the same generation) is retained, not ranked under the abandoned one.
// Round 3 (A3, 2026-11-05): a restart is told by the battle's id at the WELCOME (WelcomeMessage.battleId: kept by a
// resume, new for a fallback restart), not by the first snapshot's distance from the clock:
//   (e) a plain reconnect to the same host, the battle running on, its first snapshot 2.5 s late (a congested downlink):
//       no restart, nothing retained goes (before: read as a restart behind the clocks, the keyframe and the fallen fence
//       dropped, battleRestarts 1, so an election of this seat declined and the presentation would stand the props);
//   (f) a restart on the clients' clock seen by a seat whose first WELCOME from the restarted host comes after its
//       countdown ended (playing again): told by the battle's id (before: neither test fired, the old battle's fence,
//       stage and revive stayed retained for the next election).
import assert from 'node:assert/strict';
import { MigratingTransport, createLoopbackPair } from '../transport/index.ts';
import { MESSAGE_TYPE, TEAM, TICK_HZ, decodeMessage, encodeMessage } from '../wire/index.ts';
import { MatchClient } from './index.ts';
import { MIGRATION_EVENT_KIND } from './migrationStore.ts';
import { bytesToBase64Url } from './base64url.ts';
import { ScriptedMatchServer } from './scriptedServer.test-support.ts';
import { MAX_LEAD_TICKS } from '../../../server/match/inputBuffer.ts';
import { resumeStateFromRetained } from '../host/migrationState.ts';

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
const keyframeChunk = (id, tick) => ({ kind: MIGRATION_EVENT_KIND.KEYFRAME, payload: { id, tick, part: 0, parts: 1, data: bytesToBase64Url(new Uint8Array([id, tick & 0xff, 2, 3])) } });

/**
 * A link whose WELCOMEs read `shiftTicks` behind (a migrated host welcomes its held seats at the resume tick), and that
 * delivers `afterWelcome` events (stamped with the WELCOME's tick) right behind its WELCOME, before any snapshot.
 */
function welcomeLink(inner, shiftTicks, afterWelcome) {
  return {
    kind: 'welcome-link',
    get state() { return inner.state; }, get bufferedBytes() { return inner.bufferedBytes; }, get stats() { return inner.stats; },
    open: () => inner.open(), send: (frame) => inner.send(frame), reconnect: (reason, detail) => inner.reconnect(reason, detail),
    close: (reason, detail) => inner.close(reason, detail), onState: (listener) => inner.onState(listener),
    onFrame: (listener) => inner.onFrame((frame) => {
      const decoded = decodeMessage(frame);
      if (!decoded.ok || decoded.message.type !== MESSAGE_TYPE.WELCOME) { listener(frame); return; }
      const welcome = decoded.message;
      listener(shiftTicks
        ? encodeMessage({ ...welcome, serverTick: welcome.serverTick - shiftTicks, serverTimeMs: (welcome.serverTimeMs - Math.round(shiftTicks * TICK_MS)) >>> 0 })
        : frame);
      if (afterWelcome) listener(encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: welcome.serverTick, events: afterWelcome(welcome.serverTick) }));
    }),
  };
}

function run({ newHostTick, welcomeShiftTicks = 0, countdownTicks = 0, afterWelcome = false, firstSnapshotLateMs = 0, joinAfterTicks = 0, framesAfter = 120 }) {
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
  for (let index = 0; index < 120; index++) frame();
  assert.equal(client.isSeated, true, 'seated on the first host');
  // the first host's battle: a fence falls, a structure is damaged, the seat's hull dies and a mode revives it
  first.destroyObstacle(7);
  first.structureStage(3, 'damaged');
  first.destroy(1);
  for (let index = 0; index < 10; index++) frame();
  first.respawn(1, 5, 5, 0);
  for (let index = 0; index < 50; index++) frame();
  const oldTick = first.currentTick;
  // the keyframe the seat retained from the first host (a one-chunk blob at the first host's tick)
  client.migration.receive(keyframeChunk(1, oldTick - 30), nowMs);
  const before = client.retainedMigration();
  assert.equal(before.keyframe?.tick, oldTick - 30, 'setup: a keyframe retained from the first host');
  assert.deepEqual(before.fallen, [7], 'setup: the fence the first host felled is retained');
  assert.equal(before.destruction?.length, 1, 'setup: the structure stage is retained');
  assert.deepEqual(before.respawns?.map(([id]) => id), ['p1'], 'setup: the revive is retained');
  // the first host goes; the next runs the same epoch from `newHostTick`, its time locked to its ticks as matchActor.ts
  // stamps them (the fixture's own clock runs `behindMs` late, so its stall skip never moves the epoch). A resumed host
  // plays the same battle (its id, 0); a restarted one a battle of its own (migrationFallback's fresh id). 'same-host': a
  // plain reconnect to the first host, which plays on.
  let next = first;
  if (newHostTick !== 'same-host') {
    servers.length = 0;
    const startTick = newHostTick === 'continue' || newHostTick === 'on-clock' ? first.currentTick : newHostTick;
    const behindMs = (first.currentTick - startTick) * TICK_MS;
    next = new ScriptedMatchServer({ clock: () => nowMs - behindMs, heightField: FIELD, specFor: () => SPEC, seats: SEATS, countdownTicks: startTick + countdownTicks,
      battleId: newHostTick === 'continue' ? first.battleId : 0x5eed0001 });
    next.tick = startTick;
    next.startedAtMs = first.startedAtMs;
    if (newHostTick === 'continue') next.destroyObstacle(7); // a resumed host keeps what fell
    servers.push(next);
  }
  // a seat that comes back late: the restarted host plays on alone meanwhile
  for (let index = 0; index < joinAfterTicks; index++) { nowMs += 1000 / 60; next.advance(); }
  const nextPair = createLoopbackPair({ clock, clientToServer: LINK, serverToClient: firstSnapshotLateMs ? { ...LINK, latencyMs: firstSnapshotLateMs } : LINK });
  pairs.push(nextPair);
  next.attach(nextPair.server);
  const inputs = [];
  let frameIndex = 0;
  nextPair.server.onFrame((bytes) => {
    const decoded = decodeMessage(bytes, { maxBytes: 4096 });
    if (decoded.ok && decoded.message.type === MESSAGE_TYPE.INPUT) inputs.push({ frame: frameIndex, clientTick: decoded.message.clientTick, serverTick: next.currentTick });
  });
  // the restarted host's first fall and first keyframe (its ids restart at 1), sent before its first snapshot
  let welcomeTick = null;
  const welcomeEvents = afterWelcome ? (tick) => {
    welcomeTick = tick;
    return [{ kind: 'world_prop_destroyed', payload: { obstacleIndex: 9, kind: 'fence', cause: 'script' } }, keyframeChunk(1, tick)];
  } : null;
  migrating.replace(welcomeLink(nextPair.client, welcomeShiftTicks, welcomeEvents), 'host changed');
  for (frameIndex = 0; frameIndex < framesAfter; frameIndex++) frame();
  const admitted = (input) => input.clientTick <= input.serverTick + MAX_LEAD_TICKS && input.clientTick > input.serverTick;
  const stats = client.stats();
  const after = client.retainedMigration();
  const presented = client.update(nowMs, 0);
  // a later election resumes the battle being played from a keyframe of its own (sealed 10 ticks before the newest frame)
  const latest = after.latestFrame;
  const restartedKeyframe = {
    tick: latest.tick - 10, battleTimeMs: latest.meta.battleTimeMs, phase: 'playing', entities: [],
    frame: { ...latest, tick: latest.tick - 10, destroyed: next.destroyed, destruction: [], entities: [], meta: { ...latest.meta, destructibleRevision: next.destructibleRevision } },
  };
  const resumed = resumeStateFromRetained(restartedKeyframe, nowMs - 100, latest, nowMs, after.fallen, after.destruction ?? [], after.respawns ?? []).state;
  // the new host seals its own keyframe at its own tick
  client.migration.receive(keyframeChunk(2, next.currentTick), nowMs);
  const retainedAfterSeal = client.migration.keyframe?.tick ?? null;
  client.dispose();
  return {
    oldTick, newTick: next.currentTick, welcomeTick, inputs, admitted, after, resumed, retainedAfterSeal, presentedRestarts: presented?.battleRestarts ?? null,
    timelineRestarts: stats.timelineRestarts ?? 0, battleRestarts: stats.battleRestarts ?? 0,
  };
}

// (a) a migration on the timeline: the WELCOME is stamped 420 ticks behind (a 7 s boot and hold), the loop is not
{
  const result = run({ newHostTick: 'continue', welcomeShiftTicks: 420 });
  assert.equal(result.timelineRestarts, 0, '(a) a host on the clients\' timeline re-anchors nothing (its WELCOME stamp is the resume tick, before the skip)');
  assert.equal(result.battleRestarts, 0, '(a) a host that continues the battle restarts nothing');
  assert.ok(result.inputs.length > 50, `(a) the seat sends its inputs (${result.inputs.length})`);
  const refused = result.inputs.filter((input) => !result.admitted(input));
  assert.equal(refused.length, 0, `(a) every input lands inside the new host's lead window: ${JSON.stringify(refused.slice(0, 3))}`);
  assert.equal(result.after.keyframe?.tick, result.oldTick - 30, '(a) the retained keyframe stays: the battle goes on');
  assert.deepEqual(result.after.fallen, [7], '(a) the fallen fence stays retained');
  assert.equal(result.after.destruction?.length, 1, '(a) the structure stage stays retained');
  assert.deepEqual(result.after.respawns?.map(([id]) => id), ['p1'], '(a) the revive stays retained');
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
  assert.equal(result.battleRestarts, 1, '(b) the battle restart is told once');
  assert.equal(result.presentedRestarts, 1, '(b) the presented frame carries the restart for the settled world');
  assert.equal(result.after.keyframe, null, '(b) the keyframe of the abandoned battle goes');
  assert.deepEqual(result.after.fallen, [], '(b) the fence the abandoned battle felled goes');
  assert.deepEqual(result.after.destruction, [], '(b) the abandoned battle\'s destruction goes');
  assert.deepEqual(result.after.respawns, [], '(b) the abandoned battle\'s revive goes');
  assert.deepEqual(result.resumed.frame.destroyed, [], `(b) a later election resumes the restarted battle with nothing destroyed (${JSON.stringify(result.resumed.frame.destroyed)})`);
  assert.equal(result.resumed.frame.meta.destructibleRevision, 0, '(b) at the restarted battle\'s revision');
  assert.deepEqual(result.resumed.frame.destruction, [], '(b) and no destruction');
  assert.equal(result.resumed.respawnTicks, undefined, '(b) and no revive');
  assert.equal(result.retainedAfterSeal, result.newTick, `(b) the restarted host's keyframe is retained (held: ${result.retainedAfterSeal}, the old one was at ${result.oldTick - 30})`);
}

// (c) a kept host restarts the battle on the clients' clock, in a countdown, and sends a fall and its first keyframe
// between its WELCOME and its first snapshot
{
  const result = run({ newHostTick: 'on-clock', countdownTicks: 300, afterWelcome: true });
  assert.equal(result.timelineRestarts, 0, '(c) a host on the clients\' clock re-anchors nothing');
  assert.equal(result.battleRestarts, 1, '(c) the battle restart is told by the phase: the battle this client saw playing is in a countdown');
  assert.deepEqual(result.after.fallen, [9], '(c) only the restarted host\'s own fall is retained (the old battle\'s fence goes)');
  assert.deepEqual(result.after.destruction, [], '(c) the abandoned battle\'s destruction goes');
  assert.deepEqual(result.after.respawns, [], '(c) the abandoned battle\'s revive goes');
  assert.equal(result.after.keyframe?.tick, result.welcomeTick, '(c) the restarted host\'s first keyframe is retained, the old battle\'s goes');
}

// (d) as (b), with the restarted host's fall and first keyframe ahead of its first snapshot
{
  const result = run({ newHostTick: 300, afterWelcome: true });
  assert.equal(result.battleRestarts, 1, '(d) the battle restart is told once');
  assert.deepEqual(result.after.fallen, [9], '(d) only the restarted host\'s own fall is retained');
  assert.ok(result.welcomeTick < result.oldTick - 30, `(d) setup: the restarted host's keyframe is below the old one (${result.welcomeTick} < ${result.oldTick - 30})`);
  assert.equal(result.after.keyframe?.tick, result.welcomeTick,
    `(d) the restarted host's first keyframe is retained, not ranked under the abandoned battle's higher tick (held ${result.after.keyframe?.tick})`);
}

// (e) round 3 A3: a plain reconnect to the same host, the battle running on, every frame of the new link 2.5 s late
{
  const result = run({ newHostTick: 'same-host', firstSnapshotLateMs: 2500, framesAfter: 360 });
  assert.ok(result.after.latestFrame && result.after.latestFrame.tick > result.oldTick, `(e) setup: the late link's snapshots arrived (newest ${result.after.latestFrame?.tick}, ${result.oldTick} before it)`);
  assert.equal(result.battleRestarts, 0, `(e) a host that plays on restarts nothing, however late its first snapshot (told ${result.battleRestarts}; the clocks re-anchored ${result.timelineRestarts})`);
  assert.equal(result.after.keyframe?.tick, result.oldTick - 30, '(e) the retained keyframe stays: an election of this seat resumes the battle');
  assert.deepEqual(result.after.fallen, [7], '(e) the fallen fence stays retained');
  assert.equal(result.after.destruction?.length, 1, '(e) the structure stage stays retained');
  assert.deepEqual(result.after.respawns?.map(([id]) => id), ['p1'], '(e) the revive stays retained');
  assert.equal(result.presentedRestarts, 0, '(e) the presented frame tells no restart: the settled world stays laid');
}

// (f) round 3 A3: a restart on the clients' clock, the seat back only after the restarted battle's countdown ended
{
  const result = run({ newHostTick: 'on-clock', countdownTicks: 300, joinAfterTicks: 420 });
  assert.equal(result.after.latestFrame?.meta.phase, 2, '(f) setup: the restarted battle is playing when this seat is welcomed');
  assert.equal(result.timelineRestarts, 0, '(f) a host on the clients\' clock re-anchors nothing');
  assert.equal(result.battleRestarts, 1, `(f) the battle restart is told once, by the battle's id (told ${result.battleRestarts})`);
  assert.equal(result.presentedRestarts, 1, '(f) the presented frame carries the restart for the settled world');
  assert.equal(result.after.keyframe, null, '(f) the keyframe of the abandoned battle goes');
  assert.deepEqual(result.after.fallen, [], '(f) the fence the abandoned battle felled goes');
  assert.deepEqual(result.after.destruction, [], '(f) the abandoned battle\'s destruction goes');
  assert.deepEqual(result.after.respawns, [], '(f) the abandoned battle\'s revive goes');
  assert.deepEqual(result.resumed.frame.destroyed, [], '(f) a later election resumes the restarted battle with nothing destroyed');
}

console.log('timelineRestart.selftest: a client follows a host that restarts the battle (the clocks re-anchored when off them, inputs admitted, everything retained of the abandoned battle dropped and the restarted host\'s kept), and keeps its clocks and retained state on a host that continues the battle, a late first snapshot included (the battle\'s id tells a restart, round 3 A3)');
