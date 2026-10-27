import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { createShowroomOrbit } from './cameraRig.ts';

// The Garage's hero framing follows parts that land late (cameraRig SHOW_LATE_*): a hero's stowage and decor can arrive
// after the dense re-measure of its first seconds when the page is loaded (Main's r21 note: the KF51-U framed too close).
// A part added at 6 s widens the framing within the next late check; a hero that does not change keeps its distance.

const material = new MeshBasicMaterial();
const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 2000);
camera.__cotViewW = 1600;
camera.__cotViewH = 900;
const hero = new Group();
hero.add(new Mesh(new BoxGeometry(3.6, 2.4, 7), material));
const poses = [];
const orbit = createShowroomOrbit(camera, { setExternalPose: (position) => poses.push(position.clone()) }, {
  getSubject: () => hero,
  heroYawRad: 0.6,
  heroPitchRad: 0.18,
});
assert.ok(orbit.start(), 'the orbit measures the hero');
const tick = (seconds) => { for (let t = 0; t < seconds; t += 0.05) orbit.update(0.05); };

tick(6);
const settled = orbit.heroDist;
assert.ok(settled > 0, 'the hero is framed');
tick(1.5);
assert.equal(orbit.heroDist, settled, 'a hero that does not change keeps its distance through the late checks');

// a late part, well past the dense window: a long gun and a raised mast double the hero's reach
hero.add(new Mesh(new BoxGeometry(0.3, 0.3, 9), material).translateZ(7).translateY(1.6));
tick(2);
assert.ok(orbit.heroDist > settled * 1.2, `a part landing at 6 s re-frames the hero (${settled.toFixed(2)} m -> ${orbit.heroDist.toFixed(2)} m)`);

// past the late window a change is the caller's to announce (a new hero root): nothing is measured each second forever
const reframed = orbit.heroDist;
tick(25);
hero.add(new Mesh(new BoxGeometry(0.3, 0.3, 30), material).translateZ(20));
tick(2);
assert.equal(orbit.heroDist, reframed, 'after the late window the framing holds');

console.log(`showroomLateParts.selftest: a late part re-frames the hero (${settled.toFixed(2)} -> ${reframed.toFixed(2)} m); a still hero holds`);
