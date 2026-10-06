// Showroom dolly-in framing (cameraRig.ts createShowroomOrbit, 2026-10-05, gauntlet wave 99: "in the Abrams and Leopard
// close views the gun runs under the opaque left UI panel"). At the hero pose the whole canonical frame fits the stage
// rect; dollied in past it, the subject's front end (gun included) stays inside the rect and its rear runs out, on
// whichever side the front faces; head-on the crop stays centred. A gun reaching past the canonical frame's front face
// (leo2a7v's L55 muzzle stood 160 px beyond it) counts as the front end too.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShowroomOrbit } from './cameraRig.ts';

const VIEW_W = 1600, VIEW_H = 900;
// the stage rect between the left column and the right stats panel
const RECT = { x: 330, y: 90, w: 960, h: 560 };
const toNdc = (r) => ({ x0: (r.x / VIEW_W) * 2 - 1, x1: ((r.x + r.w) / VIEW_W) * 2 - 1 });
const WIN = toNdc(RECT);
const FRAME = { x: 0, y: 1.6, z: 0, hw: 1.95, hh: 1.25, hd: 4.95 };

function settle(orbit, steps = 600) { for (let i = 0; i < steps; i++) orbit.update(1 / 60); }

const GUN_TIP_Z = FRAME.hd + 1.4;

/** Pose the orbit, optionally dolly in fully; returns the NDC x span of the frame's front and rear faces and the gun tip. */
function frame(heroYawRad, headingRad, dollyIn) {
  const camera = new THREE.PerspectiveCamera(42, VIEW_W / VIEW_H, 0.1, 500);
  camera.__cotViewW = VIEW_W; camera.__cotViewH = VIEW_H;
  const subject = new THREE.Group();
  subject.rotation.y = headingRad;
  subject.add(new THREE.Mesh(new THREE.BoxGeometry(FRAME.hw * 2, FRAME.hh * 2, FRAME.hd * 2)));
  // a long gun: a thin barrel from mid-hull out past the frame's front face
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, GUN_TIP_Z));
  barrel.position.set(0, 0.6, GUN_TIP_Z / 2);
  subject.add(barrel);
  subject.updateMatrixWorld(true);
  let pose = null;
  const orbit = createShowroomOrbit(camera,
    { setExternalPose: (position, target) => { pose = { position: position.clone(), target: target.clone() }; } },
    { getSubject: () => subject, getStageRect: () => RECT, heroYawRad, heroPitchRad: 0.2, fixedFrame: () => FRAME });
  orbit.start();
  settle(orbit);
  // the dolly settles well inside the 2 s before the idle spring returns the orbit to the hero pose
  if (dollyIn) { for (let i = 0; i < 6; i++) orbit.wheel(1); settle(orbit, 90); }
  assert.ok(pose, 'the orbit posed the camera');
  camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  // the frame is world-aligned (garage hero heading): its front face is the one the subject's +Z points through
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(subject.matrixWorld);
  const span = (zSign) => {
    let x0 = Infinity, x1 = -Infinity;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const local = new THREE.Vector3(sx * FRAME.hw, sy * FRAME.hh, zSign * FRAME.hd);
      // the corner on the face the forward axis points through
      const world = new THREE.Vector3(FRAME.x, FRAME.y, FRAME.z).add(
        new THREE.Vector3(local.x, local.y, 0).add(forward.clone().multiplyScalar(local.z)));
      const ndc = world.project(camera);
      x0 = Math.min(x0, ndc.x); x1 = Math.max(x1, ndc.x);
    }
    return { x0, x1 };
  };
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const tipX = new THREE.Vector3(0, 0.6, GUN_TIP_Z).applyMatrix4(subject.matrixWorld).project(camera).x;
  return { front: span(1), rear: span(-1), frontRight: forward.dot(right), tipX };
}

const EPS = 0.01;
for (const [label, heading] of [['front to the left', 0], ['front to the right', Math.PI]]) {
  // a three-quarter view: the front faces one side of the screen
  const hero = frame(0.78, heading, false);
  assert.ok(Math.abs(hero.frontRight) > 0.2, `${label}: a three-quarter view`);
  for (const face of [hero.front, hero.rear]) {
    assert.ok(face.x0 >= WIN.x0 - EPS && face.x1 <= WIN.x1 + EPS, `${label}: at the hero pose the whole frame fits the stage rect`);
  }
  const close = frame(0.78, heading, true);
  assert.ok(close.front.x0 >= WIN.x0 - EPS && close.front.x1 <= WIN.x1 + EPS,
    `${label}: dollied in, the front end stays inside the stage rect (${close.front.x0.toFixed(3)}..${close.front.x1.toFixed(3)})`);
  const rearOut = close.frontRight < 0 ? close.rear.x1 > WIN.x1 + EPS : close.rear.x0 < WIN.x0 - EPS;
  assert.ok(rearOut, `${label}: the rear runs out past the rect on its own side`);
  assert.ok(close.tipX >= WIN.x0 - EPS && close.tipX <= WIN.x1 + EPS,
    `${label}: dollied in, the gun's tip past the frame stays inside the stage rect (${close.tipX.toFixed(3)})`);
  // and it is the anchored edge: the front end sits on the rect's edge, not pushed in past it (2026-10-05: the old
  // one-step correction overshot about fourfold dollied in, h23f)
  const edge = close.frontRight < 0 ? Math.min(close.tipX, close.front.x0) : Math.max(close.tipX, close.front.x1);
  const target = close.frontRight < 0 ? WIN.x0 : WIN.x1;
  assert.ok(Math.abs(edge - target) < 0.02, `${label}: the front end sits on the rect's edge (${edge.toFixed(3)} against ${target.toFixed(3)})`);
}

console.log('showroomFrontAnchor.selftest: dolly-in keeps the front end, a long gun included, inside the stage rect on either side');
