// Proof (implicit state machine audit, round 2 U2, 2026-11-04): a migrated host restores each hull's body from its row,
// not only its pose. applyResumeState wrote the row's position, speeds and angles and nothing else: the fresh host's
// ground contact (grounded), body mode (supported), spring and ride stayed under them, although wire 10 carries the body
// bits (AIRBORNE, OVERTURNED, TUMBLING, AUTO_RIGHTING; src/mp/match/hullBodyRow.ts). So
//   - a hull in the air at the keyframe was a grounded hull to the new host: its first step seated it on the ground
//     under it (a 4 m drop in one tick) instead of flying on;
//   - a hull tumbling on its side came back supported, its rigid phase lost.
// The restore is the client's own (authorityRow.ts applyAuthorityRow: pose, body flags, spring, ride), so the two copies of
// a hull take a row the same way. Built as combatMigration's handoff: the old host's keyframe through the codec, onto a
// second actor on the same roster, both stepped one tick.
// Review round 1: the viewer's own resume hint (matchActor.ts receiveResumeHint, P3b) writes a newer pose over the
// restored one, and wrote the pose alone, so the contact, spring and ride the restore had seated on the older row stayed:
// a hull airborne in the keyframe whose newer hint has it landed flew back up to the keyframe's height on the next tick.
// The hint now seats the body on its own pose as a row does (authorityRow.ts reseatAuthorityBody), its contact read from
// its height over the ground (RESUME_HINT carries no body bits).
// Round 3 (A14, 2026-11-05): RESUME_HINT carries the row's body bits (ResumeHintMessage.flags) and the actor seats the hint
// through the row's own owner (authorityRow.ts applyAuthorityRow). Read from height, a hull resting on a roof or a bridge
// 4 m over the terrain field was airborne to the new host (it dropped onto its support in a tick), and the restored row's
// body mode stood under the newer pose (a hull tumbling at the hint came back as the keyframe had it). The client sends
// its own row's body bits (MatchClient sendResumeHint).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { createLoopbackLink } from '../../../server/match/link.ts';
import { decodeMessage, encodeMessage } from '../wire/codec.ts';
import { MatchClient } from '../match/matchClient.ts';
import { HULL_BODY_ROW_FLAGS } from '../match/hullBodyRow.ts';
import { ScriptedMatchServer } from '../match/scriptedServer.test-support.ts';
import { MigratingTransport, createLoopbackPair } from '../transport/index.ts';
import { TEAM } from '../wire/constants.ts';
import { quantizeAngle, quantizePosition, quantizeVelocity } from '../wire/quantize.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { ENTITY_FLAGS, MESSAGE_TYPE, PROTOCOL_VERSION } from '../wire/constants.ts';
import { hullBodyMode, restoreHullBodyMode, setHullGrounded } from '../../sim/hullBodyMode.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'flying', name: 'Flying', team: 'alpha', specId: 'leclerc_s2' },
  { seat: 1, playerId: 'tumbling', name: 'Tumbling', team: 'bravo', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const make = (resume) => createMatchActor({ roomId: 'resume-body', mapId: 'verdant', seed: 41, seats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const inputs = new Map();

const old = make(null), sim = old.authority;
sim.onMatchReady();
for (let n = 0; n < 60; n++) sim.step({ dt: 1 / 60, inputs });
// the old host's hulls at the keyframe: one 4 m up and climbing 3 m/s (a crest's launch), one tumbling on its side
const flying = sim.entityById.get('flying').state, tumbling = sim.entityById.get('tumbling').state;
flying.pos.y = 4; flying.verticalSpeed = 3; setHullGrounded(flying, false);
flying._ride.y = 4; flying._ride.v = 3; flying._ride.airTime = 0.2;
tumbling.visualRoll = 1.4; restoreHullBodyMode(tumbling, false, true, false);
const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
const frame = { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs }, false),
  destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
const rowOf = (id) => frame.entities.find((row) => row.entityId === old.wireIdOf(id));
assert.ok(rowOf('flying').flags & ENTITY_FLAGS.AIRBORNE, 'setup: the flying hull\'s row says airborne');
assert.ok(rowOf('tumbling').flags & ENTITY_FLAGS.TUMBLING, 'setup: the tumbling hull\'s row says tumbling');
const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs, timeS: sim.timeS, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame }));

const fresh = make({ tick, battleTimeMs });
applyResumeState(fresh, sealed);
const flown = fresh.authority.entityById.get('flying').state, tumbled = fresh.authority.entityById.get('tumbling').state;
const wrong = [];
if (flown.grounded !== false) wrong.push(`flying hull grounded ${flown.grounded} on the new host (its row says airborne)`);
if (!(Math.abs(flown._ride.y - 4) < 0.01 && Math.abs(flown._ride.v - 3) < 0.05)) wrong.push(`flying hull's ride at y ${flown._ride.y.toFixed(3)}, v ${flown._ride.v.toFixed(3)} (its row: 4 m, 3 m/s)`);
if (hullBodyMode(tumbled) !== 'tumbling') wrong.push(`tumbling hull's body mode '${hullBodyMode(tumbled)}' on the new host (its row says tumbling)`);
// one tick on both hosts: the flying hull flies on
sim.step({ dt: 1 / 60, inputs });
fresh.authority.onMatchReady();
fresh.authority.step({ dt: 1 / 60, inputs });
if (!(Math.abs(flown.pos.y - flying.pos.y) < 0.02)) wrong.push(`flying hull at y ${flown.pos.y.toFixed(3)} after a tick on the new host, ${flying.pos.y.toFixed(3)} on the old`);
if (wrong.length) {
  console.error(`resumeHullBody: ${wrong.length} body readings lost across the handoff:\n  ${wrong.join('\n  ')}`);
  assert.fail('a migrated host must restore each hull\'s ground contact, body mode, spring and ride from its row');
}

// ---- the viewer's own newer row (its resume hint): landed, at rest, a second after the airborne keyframe row
{
  const hinted = make({ tick: tick + 60, battleTimeMs: battleTimeMs + 1000 });
  applyResumeState(hinted, sealed);
  const hull = hinted.authority.entityById.get('flying').state;
  assert.equal(hull.grounded, false, 'setup: restored airborne from the keyframe row');
  const link = createLoopbackLink('flying');
  const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'x', clientBuild: 'resume' };
  assert.ok(hinted.attach(link.server, hello, { v: 1, roomId: hinted.roomId, seat: 0, playerId: 'flying', name: 'Flying', team: 'alpha', specId: 'leclerc_s2', iat: 0, exp: 1 }), 'setup: the viewer attaches');
  const x = hull.pos.x + 1, z = hull.pos.z;
  link.client.send(encodeMessage({ type: MESSAGE_TYPE.RESUME_HINT, tick: tick + 30, x: quantizePosition(x), y: quantizePosition(0.017), z: quantizePosition(z), speed: quantizeVelocity(0),
    verticalSpeed: quantizeVelocity(0), yaw: quantizeAngle(hull.yaw), pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hinted.stats().resumeHints.applied, 1, `setup: the hint is applied (${JSON.stringify(hinted.stats().resumeHints)})`);
  hinted.authority.onMatchReady();
  hinted.authority.step({ dt: 1 / 60, inputs });
  const wrongHint = [];
  if (hull.grounded !== true) wrongHint.push(`grounded ${hull.grounded} after the landed hint`);
  if (!(hull.pos.y < 0.1)) wrongHint.push(`at y ${hull.pos.y.toFixed(3)} after a tick (the hint: 0.017 m, the keyframe row: 4 m)`);
  if (!(Math.abs(hull._ride.y - hull.pos.y) < 1e-6 && Math.abs(hull.verticalSpeed) < 0.5)) wrongHint.push(`ride at y ${hull._ride.y.toFixed(3)}, v ${hull.verticalSpeed.toFixed(3)}`);
  if (wrongHint.length) {
    console.error(`resumeHullBody: the resume hint left the restored row's body under its pose:\n  ${wrongHint.join('\n  ')}`);
    assert.fail('a resume hint must seat the hull\'s body on its own pose');
  }
  hinted.stop();
}
// ---- round 3 A14: the hint's body bits, not its height, seat the hull's contact and mode
{
  const hintCase = (flags, y) => {
    const actor = make({ tick: tick + 60, battleTimeMs: battleTimeMs + 1000 });
    applyResumeState(actor, sealed);
    const hull = actor.authority.entityById.get('flying').state;
    const link = createLoopbackLink('flying');
    const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'x', clientBuild: 'resume' };
    assert.ok(actor.attach(link.server, hello, { v: 1, roomId: actor.roomId, seat: 0, playerId: 'flying', name: 'Flying', team: 'alpha', specId: 'leclerc_s2', iat: 0, exp: 1 }), 'setup: the viewer attaches');
    link.client.send(encodeMessage({ type: MESSAGE_TYPE.RESUME_HINT, tick: tick + 30, x: quantizePosition(hull.pos.x + 1), y: quantizePosition(y), z: quantizePosition(hull.pos.z),
      speed: 0, verticalSpeed: 0, yaw: quantizeAngle(hull.yaw), pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, flags }));
    return { actor, hull };
  };
  const wrongBits = [];
  // a hull resting on a roof 4 m over the terrain field (its row: on the ground, upright). The seating is what this
  // proves: the state the actor's next step starts from (grounded and supported, not airborne). The drop itself is not
  // reproduced here (review r1): this field has no deck (a map's structure manifest brings the authority's standing
  // decks), and over one the airborne hull lands on it within the same step, so a step tells the two apart only by that
  // tick's airborne state, which the reading below already shows
  {
    const { actor, hull } = hintCase(0, 4);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(actor.stats().resumeHints.applied, 1, `setup: the roof hint is applied (${JSON.stringify(actor.stats().resumeHints)})`);
    if (hull.grounded !== true) wrongBits.push(`a hull resting on a roof 4 m up is grounded ${hull.grounded} after its hint (its row says on its support)`);
    if (hullBodyMode(hull) !== 'supported') wrongBits.push(`the roof hull's body mode is '${hullBodyMode(hull)}'`);
    actor.stop();
  }
  // a hull tumbling 2 m up at the hint (the keyframe row: airborne and upright)
  {
    const { actor, hull } = hintCase(ENTITY_FLAGS.AIRBORNE | ENTITY_FLAGS.TUMBLING, 2);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(actor.stats().resumeHints.applied, 1, 'setup: the tumbling hint is applied');
    if (hull.grounded !== false) wrongBits.push(`the tumbling hull is grounded ${hull.grounded} after its airborne hint`);
    if (hullBodyMode(hull) !== 'tumbling') wrongBits.push(`the tumbling hull's body mode is '${hullBodyMode(hull)}' after its hint (the hint says tumbling)`);
    actor.stop();
  }
  // the client sends its own row's body bits
  {
    let nowMs = 10_000;
    const clock = () => nowMs;
    const SPEC = { enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42, turretTraverseDegS: 40, gunPitchDegS: 25,
      gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral', terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
      dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
      gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
      armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } } };
    const field = { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' };
    const server = new ScriptedMatchServer({ clock, heightField: field, specFor: () => SPEC, countdownTicks: 0,
      seats: [{ entityId: 1, specId: 'm1', playerId: 'p1', name: 'One', team: TEAM.ALPHA, token: 'tok-1', x: 0, z: 0, yaw: 0 }] });
    const first = createLoopbackPair({ clock });
    server.attach(first.server);
    const migrating = new MigratingTransport(first.client);
    const client = new MatchClient({ transport: migrating, token: 'tok-1', clock });
    const step = (pairs) => { nowMs += 1000 / 60; for (const pair of pairs) pair.pump(nowMs); server.advance(); for (const pair of pairs) pair.pump(nowMs); client.update(nowMs, 1 / 60); };
    client.connect();
    for (let n = 0; n < 60; n++) step([first]);
    // the seat's hull thrown up: in the air for a while, its rows flagged airborne
    const own = server.entities.find((entity) => entity.entityId === 1).state;
    own.pos.y = 30; own.verticalSpeed = 0; setHullGrounded(own, false); own._ride.y = 30; own._ride.v = 0; own._ride.airTime = 0.2;
    for (let n = 0; n < 12; n++) step([first]);
    const ownRow = client.retainedMigration().latestFrame.entities.find((row) => row.entityId === 1);
    assert.ok(ownRow.flags & ENTITY_FLAGS.AIRBORNE, 'setup: the seat\'s newest own row says airborne');
    const next = createLoopbackPair({ clock });
    next.server.open();
    const hints = [];
    next.server.onFrame((bytes) => { const decoded = decodeMessage(bytes, { maxBytes: 4096 }); if (decoded.ok && decoded.message.type === MESSAGE_TYPE.RESUME_HINT) hints.push(decoded.message); });
    migrating.replace(next.client, 'host changed');
    for (let n = 0; n < 4; n++) { nowMs += 1000 / 60; next.pump(nowMs); client.update(nowMs, 1 / 60); next.pump(nowMs); }
    assert.equal(hints.length, 1, 'the seat sends its own row as a hint on the resumed link');
    if (hints[0].flags !== (ownRow.flags & HULL_BODY_ROW_FLAGS)) wrongBits.push(`the client's hint carries body bits ${hints[0].flags} (its row: ${ownRow.flags & HULL_BODY_ROW_FLAGS})`);
    client.dispose();
  }
  if (wrongBits.length) {
    console.error(`resumeHullBody: the resume hint's contact and body mode came from its height, not its row:\n  ${wrongBits.join('\n  ')}`);
    assert.fail('a resume hint carries its row\'s body bits and the new host seats them as a row\'s');
  }
}
old.stop(); fresh.stop();
console.log('resumeHullBody: a migrated host restores each hull\'s ground contact, body mode, spring and ride from its row, as the client\'s predictor does: an airborne hull flies on, a tumbling one stays tumbling, and a viewer\'s newer hint seats the body on its own pose and its own body bits (a roof rest stays grounded, a tumble tumbles)');
