// garage-env-276 (Main's ruling (b)): the showroom camera's spring arm (cameraRig.ts ShowroomOrbitDeps.clearance).
// 1. nothing in the way: every pose is the one the rig writes without the arm, to the bit (the default framing unchanged);
// 2. a part across the sightline, zoomed out: the eye stands in front of it, never inside;
// 3. a part met mid-orbit: the eye dollies in critically damped (no overshoot, no step over a frame's share), and when
//    the way clears it eases back out to exactly the pose without the arm.
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Ray, Vector3 } from 'three';
import { createShowroomOrbit } from './cameraRig.ts';

const material = new MeshBasicMaterial();
const hero = new Group();
hero.add(new Mesh(new BoxGeometry(3.6, 2.4, 7), material));
const make = (clearance) => {
  const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 2000);
  camera.__cotViewW = 1600; camera.__cotViewH = 900;
  const poses = [];
  const orbit = createShowroomOrbit(camera, { setExternalPose: (eye, look) => poses.push({ eye: eye.clone(), look: look.clone() }) }, {
    getSubject: () => hero, heroYawRad: 0.6, heroPitchRad: 0.18, ...(clearance ? { clearance } : {}),
  });
  return { orbit, poses };
};
const ray = new Ray(), hit = new Vector3();
/** The free share of look->eye against these boxes, inflated by the camera's 1.2 m margin (garageArchitecture.ts
 *  cameraClearance's own rule: a box holding the look point is no obstacle). */
const MARGIN = 1.2;
const clearanceOf = (boxes) => (look, eye) => {
  const length = look.distanceTo(eye);
  ray.origin.copy(look); ray.direction.subVectors(eye, look).multiplyScalar(1 / length);
  let first = length;
  for (const raw of boxes()) {
    const box = raw.clone().expandByScalar(MARGIN);
    if (!box.containsPoint(look) && ray.intersectBox(box, hit)) first = Math.min(first, hit.distanceTo(look));
  }
  return first / length;
};
const script = (orbit) => {
  orbit.start();
  for (let t = 0; t < 3; t += 1 / 60) orbit.update(1 / 60);
  orbit.beginDrag(); for (let i = 0; i < 30; i += 1) { orbit.drag(14, 0); orbit.update(1 / 60); } orbit.endDrag();
  for (let t = 0; t < 1.5; t += 1 / 60) orbit.update(1 / 60);
};

// 1. nothing in the way: the same poses, bit for bit
const bare = make(null), clear = make(() => 1);
script(bare.orbit); script(clear.orbit);
assert.equal(clear.poses.length, bare.poses.length, 'the arm adds no pose');
for (let i = 0; i < bare.poses.length; i += 1) {
  assert.ok(bare.poses[i].eye.equals(clear.poses[i].eye) && bare.poses[i].look.equals(clear.poses[i].look), `pose ${i} is the same to the bit`);
}

// 2. a post across the sightline, standing at 90 % of the way to the eye
const POST = 0.6, AT = 0.9;
// Positive notches zoom in: out to the bay's reach, where a yard part (a 0.6 m post, inflated by the margin) can stand past
// the hero's own near radius (the arm never closes inside it: a part there is the orbit audit's to forbid,
// garageOrbitClearance.ts).
const zoomOut = (orbit) => {
  for (let i = 0; i < 3; i += 1) { orbit.wheel(-3); for (let t = 0; t < 2.5; t += 1 / 60) orbit.update(1 / 60); }
};
const probe = make(null); probe.orbit.start(); zoomOut(probe.orbit);
const { eye: heroEye, look: heroLook } = probe.poses.at(-1);
const at = new Vector3().lerpVectors(heroLook, heroEye, AT);
const wall = new Box3().setFromCenterAndSize(at, new Vector3(POST, POST, POST));
const walled = make(clearanceOf(() => [wall]));
walled.orbit.start(); zoomOut(walled.orbit);
const held = walled.poses.at(-1);
assert.ok(wall.distanceToPoint(held.eye) >= MARGIN - 1e-6, `the eye keeps the margin from the part (${wall.distanceToPoint(held.eye).toFixed(2)} m)`);
assert.ok(held.eye.distanceTo(held.look) < heroEye.distanceTo(heroLook) * AT, 'it stands in front of the part');
assert.ok(held.look.equals(heroLook), 'the hero is still what it looks at');

// 3. met mid-orbit, then cleared
let boxes = [];
const arm = make(clearanceOf(() => boxes)), ref = make(null);
for (const r of [arm, ref]) { r.orbit.start(); zoomOut(r.orbit); }
const steady = arm.poses.at(-1), want = steady.eye.distanceTo(steady.look);
boxes = [new Box3().setFromCenterAndSize(new Vector3().lerpVectors(steady.look, steady.eye, AT), new Vector3(POST, POST, POST))];
arm.orbit.beginDrag(); arm.orbit.drag(0.5, 0); arm.orbit.endDrag(); // a touch of input: the rig poses again
const reaches = [];
for (let t = 0; t < 1.2; t += 1 / 60) { arm.orbit.update(1 / 60); const p = arm.poses.at(-1); reaches.push(p.eye.distanceTo(p.look)); }
const target = Math.min(...reaches.slice(-10));
assert.ok(target < want * AT - POST / 2 - MARGIN + 0.01, `the arm dollies in front of the part (${want.toFixed(2)} -> ${target.toFixed(2)} m)`);
for (let i = 1; i < reaches.length; i += 1) {
  assert.ok(reaches[i] <= reaches[i - 1] + 1e-6, 'no overshoot back out while closing');
  assert.ok(reaches[i - 1] - reaches[i] < want * 0.2, `no snap: frame ${i} moved ${(reaches[i - 1] - reaches[i]).toFixed(2)} m`);
}
boxes = [];
for (let t = 0; t < 2; t += 1 / 60) arm.orbit.update(1 / 60);
ref.orbit.beginDrag(); ref.orbit.drag(0.5, 0); ref.orbit.endDrag();
for (let t = 0; t < 1.2 + 2; t += 1 / 60) ref.orbit.update(1 / 60);
const back = arm.poses.at(-1), clean = ref.poses.at(-1);
assert.ok(back.eye.distanceTo(clean.eye) < 1e-9 && back.look.distanceTo(clean.look) < 1e-9, 'cleared, it eases back to the pose without the arm');

console.log(`showroomSpringArm.selftest: ${bare.poses.length} poses identical to the bit with nothing in the way; a post at 90 % holds `
  + `the eye in front of it; met mid-orbit the arm closes ${want.toFixed(2)} -> ${target.toFixed(2)} m with no snap or overshoot `
  + 'and eases back out to the bare pose PASS');
