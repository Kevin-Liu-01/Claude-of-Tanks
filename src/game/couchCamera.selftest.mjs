// The couch battle's shared camera (docs/COUCH-MODE.md "The shared camera"): it frames every seat's hull along a fixed
// bearing, stands back no nearer and no farther than the rules allow, fits the wider of the view's height and width,
// and past its farthest keeps the largest group of seats rather than losing everyone to one straggler.
import assert from 'node:assert/strict';
import { solveCouchPose } from './couchCamera.ts';
import { COUCH_RULES } from '../sim/matchRuleset.ts';

const rules = COUCH_RULES;
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

assert.equal(solveCouchPose([], rules, 0, 50, 16 / 9), null, 'nothing to frame: no pose');

// one hull: the nearest distance, looking at it from behind along the bearing (yaw 0 looks toward +z)
{
  const pose = solveCouchPose([{ x: 10, y: 2, z: 20 }], rules, 0, 50, 16 / 9);
  assert.equal(pose.distance, rules.cameraMinDistanceM, 'one hull sits at the nearest distance');
  assert.deepEqual([pose.targetX, pose.targetY, pose.targetZ], [10, 2, 20]);
  assert.ok(pose.z < 20 && near(pose.x, 10), 'the camera stands behind the hull along the bearing');
  assert.ok(pose.y > 2, 'and above it');
  const pitch = Math.atan2(pose.y - pose.targetY, Math.hypot(pose.x - pose.targetX, pose.z - pose.targetZ)) * 180 / Math.PI;
  assert.ok(near(pitch, -rules.cameraPitchDeg, 1e-9), 'looking down at the rules pitch');
}

// spread hulls: farther back, every hull framed; a narrower view stands farther back still
{
  const spread = [{ x: -60, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, { x: 0, y: 0, z: 50 }];
  const wide = solveCouchPose(spread, rules, 0, 50, 16 / 9);
  assert.ok(wide.distance > rules.cameraMinDistanceM, 'spread hulls stand the camera back');
  assert.equal(wide.framed, 3);
  const narrow = solveCouchPose(spread, rules, 0, 50, 9 / 16);
  assert.ok(narrow.distance > wide.distance, 'a portrait view needs more distance for the same width');
}

// a straggler far away: the camera keeps the group and stays inside its farthest distance
{
  const group = [{ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 10 }, { x: -15, y: 0, z: 5 }];
  const pose = solveCouchPose([...group, { x: 2000, y: 0, z: 2000 }], rules, 0, 50, 16 / 9);
  assert.ok(pose.distance <= rules.cameraMaxDistanceM, 'never farther than the rules allow');
  assert.equal(pose.framed, 3, 'the three together are framed, the straggler left out');
  assert.ok(Math.abs(pose.targetX) < 30 && Math.abs(pose.targetZ) < 30, 'the view centres on the group');
}

console.log('couchCamera: PASS — frames every seat along the bearing, nearest and farthest distances, view aspect, the largest group past the farthest');
