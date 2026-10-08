// The authority's destruction on a peer's own world (docs/DESTRUCTION.md §8): a live structure_stage animates, the
// snapshot's log lays down settled what the seat did not see, a stage whose event is still owed waits for it, a world
// laid out otherwise finds its structures by footprint, a stage falls once, the collapse swaps this world's records and
// raises the heap under the prediction's ground, and the wire's destruction log round-trips through a migration's
// resume state and restores on a new host without one event.
import assert from 'node:assert/strict';
import { createDestructionMirror } from './destructionMirror.ts';
import { setCompoundShape, setObbShape } from '../../world/collision.ts';
import { createDestructionMatch } from '../../sim/destructionMatch.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { mergeDestructionLogs, quantizeDestructionEntry } from '../wire/destructionLog.ts';
import { MESSAGE_TYPE, NO_TICK, applySnapshotPacket, buildSnapshotPacket, decodeMessage, encodeMessage } from '../wire/index.ts';

const near = (actual, expected, eps, label) => assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} vs ${expected}`);

/** A street of four houses (12 × 8 m, 6 m tall), ids in build order; `shift` moves the ids (a world laid out otherwise). */
function street(shift = 0, extra = false) {
  const obstacles = [], colliders = [];
  const place = (id, cx) => {
    obstacles.push(setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: id }, cx, 0, 6, 4, 0));
    colliders.push(setCompoundShape({ min: [0, 0, 0], max: [0, 6, 0], kind: 'structure', structureIdx: id },
      [{ kind: 'obb', cx, cz: 0, hw: 6, hl: 4, yaw: 0 }]));
  };
  if (extra) place(0, -100); // a shed only this world places, first: every later id moves by one
  for (let i = 0; i < 4; i++) place(i + shift, i * 20);
  return { obstacles, colliders };
}
const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, getNormalAt: () => null, maxY: 1 };

// the authority's events for the street: house 2 damaged then collapsed
const authority = createDestructionMatch({ rules: matchRulesetFor('standard').destruction, ...street() });
const house = authority.structures.byId(2);
authority.structures.applyPoints(house, house.maxHp * 0.4, { cause: 'blast', munition: 'he', x: 40, y: 2, z: -4, dirX: 0, dirZ: 1 });
authority.step();
authority.structures.applyPoints(house, house.maxHp, { cause: 'ram', munition: null, x: 40, y: 1, z: -4, dirX: 0, dirZ: 1 });
authority.step();
const stageEvents = [];
authority.drainEvents(stageEvents);
assert.deepEqual(stageEvents.map((e) => e.stage), ['damaged', 'breached', 'collapsed']);
const log = authority.log.map(quantizeDestructionEntry);
assert.equal(log.length, 3);
assert.ok(log.every((entry) => entry.kind === 'stage' && Math.abs(entry.cx - 40) < 1e-9), 'every stage carries its footprint centre');

// ---- live events animate, once; the collapse swaps this world's records and raises the heap
{
  const world = street();
  const bus = [];
  const mirror = createDestructionMirror({ heightField: flat, getObstacles: () => world.obstacles, getColliders: () => world.colliders },
    { emit: (type, payload) => bus.push({ type, payload }) });
  for (const event of stageEvents) mirror.applyStageEvent(JSON.parse(JSON.stringify(event)));
  assert.deepEqual(bus.map((e) => [e.type, e.payload.structureId, e.payload.stage, !!e.payload.settled]),
    [['structure:stage', 2, 'damaged', false], ['structure:stage', 2, 'breached', false], ['structure:stage', 2, 'collapsed', false]]);
  assert.equal(world.obstacles[2].crushed, true, 'the collapse no longer pushes the predicted hull here');
  assert.equal(world.colliders[2].dead, true, 'nor stops this seat\'s rays');
  assert.ok(mirror.groundField.getHeightAt(40, 0) > 1, 'the heap is under the prediction');
  assert.equal(mirror.groundField.getHeightAt(-60, 0), 0, 'and nowhere else');
  // the snapshot's log names the same stages: nothing more happens
  mirror.applyLog(log, () => false);
  mirror.applyStageEvent(JSON.parse(JSON.stringify(stageEvents[2])));
  assert.equal(bus.length, 3, 'a stage happens once on a seat');
}

// ---- a late joiner: the log lays the stages down settled, without animation
{
  const world = street();
  const bus = [];
  const mirror = createDestructionMirror({ heightField: flat, getObstacles: () => world.obstacles, getColliders: () => world.colliders },
    { emit: (type, payload) => bus.push({ type, payload }) });
  mirror.applyLog(log, () => false);
  assert.deepEqual(bus.map((e) => [e.payload.stage, e.payload.settled]),
    [['damaged', true], ['breached', true], ['collapsed', true]], 'settled, in order');
  assert.equal(world.obstacles[2].crushed, true);
}

// ---- a stage whose event is still owed waits for it (it animates then), and the log resumes after it
{
  const world = street();
  const bus = [];
  const mirror = createDestructionMirror({ heightField: flat, getObstacles: () => world.obstacles, getColliders: () => world.colliders },
    { emit: (type, payload) => bus.push({ type, payload }) });
  let owed = true;
  mirror.applyLog(log, (id) => owed && id === 2);
  assert.equal(bus.length, 0, 'the log does not take a stage its event will bring');
  for (const event of stageEvents) mirror.applyStageEvent(JSON.parse(JSON.stringify(event)));
  owed = false;
  mirror.applyLog(log, () => false);
  assert.deepEqual(bus.map((e) => [e.payload.stage, !!e.payload.settled]), [['damaged', false], ['breached', false], ['collapsed', false]]);
}

// ---- a world laid out otherwise: structures by footprint, never another structure in its stead
{
  const world = street(1, true); // this world's ids are the authority's + 1, with its own shed at id 0
  const bus = [];
  const mirror = createDestructionMirror({ heightField: flat, getObstacles: () => world.obstacles, getColliders: () => world.colliders },
    { emit: (type, payload) => bus.push({ type, payload }) });
  mirror.applyLog(log, () => false);
  assert.ok(bus.every((e) => e.payload.structureId === 3 && Math.abs(e.payload.cx - 40) < 1e-9),
    'the house at x 40 (this world\'s id 3) took the stages');
  assert.equal(world.obstacles[2].crushed, false, 'this world\'s id 2 (the house at x 20) stands');
  assert.equal(world.obstacles[3].crushed, true);
  // an event for a structure this world does not have changes nothing
  assert.equal(mirror.applyStageEvent({ structureId: 9, stage: 'collapsed', cx: 500, cz: 500, massClass: 'house' }), null);
}

// ---- the wire carries the log: keyframe whole, deltas after the baseline's length; a migration keeps every stage
{
  const frame = (tick, destruction) => ({ tick, serverTimeMs: tick * 16, ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0,
    inputMarginTicks: 0, meta: { phase: 2, countdownMs: 0, battleTimeMs: tick * 16, verdict: 0, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], destruction, entities: [], shells: [], viewer: null, modeStateJson: null });
  const roundTrip = (packet, baseline) => {
    const decoded = decodeMessage(encodeMessage(packet, baseline), { resolveBaseline: (tick) => (baseline && tick === baseline.tick ? baseline : null) });
    assert.ok(decoded.ok, decoded.error?.message);
    return applySnapshotPacket(decoded.message, baseline);
  };
  const key = roundTrip(buildSnapshotPacket(frame(100, log.slice(0, 1)), null), null);
  assert.deepEqual(key.destruction, log.slice(0, 1));
  const delta = buildSnapshotPacket(frame(103, log), key);
  assert.equal(delta.destruction.length, 2, 'a delta carries only the entries after its baseline');
  assert.equal(delta.destructionBase, 1);
  const assembled = roundTrip(delta, key);
  assert.deepEqual(assembled.destruction, log, 'the client assembles the whole log');
  const emptyDelta = buildSnapshotPacket(frame(106, log), assembled);
  assert.equal(emptyDelta.destruction.length, 0);
  assert.deepEqual(roundTrip(emptyDelta, assembled).destruction, log, 'an unchanged log costs a delta nothing');
  // a seat that held a stage event the dying host never listed: the merge keeps it, the new host restores it, no event
  const retained = [{ kind: 'stage', structureId: 1, stage: 'damaged', cx: 20, cz: 0 }];
  const merged = mergeDestructionLogs(log, [...log.slice(1), ...retained]);
  assert.deepEqual(merged, [...log, ...retained], 'known entries once, the retained one appended');
  const resumed = createDestructionMatch({ rules: matchRulesetFor('standard').destruction, ...street() });
  const restoredWorld = resumed.structures;
  assert.equal(resumed.restore(merged), 4);
  resumed.step();
  assert.equal(resumed.drainEvents([]), 0, 'a restore emits nothing');
  assert.equal(restoredWorld.byId(2).stage, 3, 'the collapse stands restored');
  assert.equal(restoredWorld.byId(1).stage, 1, 'and the retained damage');
  near(restoredWorld.byId(1).hp / restoredWorld.byId(1).maxHp, 0.7, 1e-9, 'a restored stage resumes at its bound');
  assert.deepEqual(resumed.log, merged, 'the new host continues the old log');
  assert.equal(MESSAGE_TYPE.SNAPSHOT, 17);
}

console.log('destructionMirror: live stages animate once (records swapped, heap under the prediction), a late joiner\'s '
  + 'log lands settled, owed stages wait for their events, worlds laid out otherwise match by footprint, the log rides '
  + 'keyframes and deltas, and a migration restores every stage without an event PASS');
