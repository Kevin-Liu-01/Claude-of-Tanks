import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureEntityFrame, copyEntityFrame, tracePoints } from './killcamCapture.ts';

const hull = () => ({
  state: { pos: { x: 1, y: 2, z: 3 }, yaw: 0.5, visualPitch: 0.02, visualRoll: -0.01, turretYaw: 1.2, gunPitch: 0.05 },
  combat: {
    destroyed: false,
    modules: { engine: { state: 'ok' }, gun: { state: 'ok' } },
    crew: { driver: true, gunner: true },
    eraSpent: new Set(),
  },
});

// a step frame is held and refreshed in place, to the values a fresh capture takes
{
  const ent = hull();
  const frame = captureEntityFrame(ent);
  const { pose, crewAlive, moduleStates, eraSpent } = frame;
  const { pos } = pose;
  ent.state.pos.x = 9; ent.state.turretYaw = -0.4;
  ent.combat.crew.gunner = false;
  ent.combat.modules.engine.state = 'red';
  ent.combat.eraSpent.add('hull_L1');
  ent.combat.destroyed = true;
  assert.equal(captureEntityFrame(ent, frame), frame, 'the held frame is the one refreshed');
  assert.deepEqual(frame, captureEntityFrame(ent), 'a refreshed frame reads as a fresh capture');
  assert.equal(frame.pose, pose); assert.equal(frame.pose.pos, pos);
  assert.equal(frame.crewAlive, crewAlive); assert.equal(frame.moduleStates, moduleStates); assert.equal(frame.eraSpent, eraSpent);
}

// a hit's snapshot copies the held frame: the next steps leave it as the hit found it
{
  const ent = hull();
  const frame = captureEntityFrame(ent);
  const snapshot = copyEntityFrame(frame);
  const taken = structuredClone(snapshot);
  ent.state.pos.z = -40; ent.combat.crew.driver = false; ent.combat.modules.gun.state = 'yellow'; ent.combat.eraSpent.add('turret_R2');
  captureEntityFrame(ent, frame);
  assert.deepEqual(snapshot, taken, 'the snapshot keeps the pre-hit frame');
  assert.notEqual(snapshot.pose.pos, frame.pose.pos);
  assert.equal(frame.pose.pos[2], -40);
}

// spent ERA: the held list follows the set as it grows, and a respawn's empty set empties it
{
  const ent = hull();
  const frame = captureEntityFrame(ent);
  ent.combat.eraSpent.add('a'); ent.combat.eraSpent.add('b');
  captureEntityFrame(ent, frame);
  assert.deepEqual(frame.eraSpent, ['a', 'b']);
  ent.combat.eraSpent = new Set();
  captureEntityFrame(ent, frame);
  assert.deepEqual(frame.eraSpent, []);
  ent.combat.eraSpent.add('c');
  captureEntityFrame(ent, frame);
  assert.deepEqual(frame.eraSpent, ['c']);
  ent.combat.crew = null;
  captureEntityFrame(ent, frame);
  assert.equal(frame.crewAlive, null, 'a hull without crew holds none');
  assert.equal(captureEntityFrame({ state: null, combat: null }), null);
}

// a shell's trace: the numbers its pooled buffer holds, then the impact
{
  const pts = new Float64Array(12).fill(7);
  pts.set([0, 1, 2, 3, 4, 5]);
  assert.deepEqual(tracePoints({ pts, count: 6 }, [9, 9, 9]), [0, 1, 2, 3, 4, 5, 9, 9, 9]);
  assert.equal(tracePoints({ pts, count: 0 }, [9, 9, 9]), null);
  assert.equal(tracePoints(undefined, [9, 9, 9]), null);
}

// the owners: the step refreshes held frames and fills pooled traces; a snapshot copies; rooms and solo both capture
{
  const killcam = readFileSync(new URL('./killcam.ts', import.meta.url), 'utf8');
  assert.match(killcam, /const held = poseHistory\.get\(ent\.id\);\n\s+if \(held\) captureEntityFrame\(ent, held\);/);
  assert.match(killcam, /const before = held \? copyEntityFrame\(held\) : now;/);
  assert.match(killcam, /const pts = trajPool\.pop\(\) \?\? new Float64Array\(TRAJ_MAX_PTS\);/);
  assert.doesNotMatch(killcam, /rec\.pts\.push\(/, 'a step appends into the buffer, never grows an array');
  const presentation = readFileSync(new URL('../mp/presentation/battlePresentation.ts', import.meta.url), 'utf8');
  assert.match(presentation, /if \(mounted\) recordKillcamStep\(frame\.renderTimeMs\);/);
}

console.log('killcamCapture.selftest: held step frames refreshed in place, snapshots copied, ERA and crew, pooled traces, room and solo capture pass');
