// photo-mode-271: the battle's photo camera opens on the view as it stood, stays within its radius of the subject and
// over the ground however it is steered, frames the shared views about the subject (whole, on any screen, above the
// interface), and hands the lens back on close.
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';

import { createPhotoCamera, lensFovDeg, PHOTO_GROUND_CLEARANCE_M, PHOTO_LENSES_MM, PHOTO_RADIUS_M } from './photoCamera.ts';

const near = (actual, expected, eps, label) => assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} vs ${expected}`);
// a ground that rises toward +x (a hillside) so the floor clamp is exercised off the flat
const groundAt = (x, _z) => Math.max(0, x * 0.25);
const subject = { x: 0, y: 1.2, z: 0, yaw: 0.4, radiusM: 3.6 };

function chaseCamera() {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 4000);
  // a chase camera: behind and above the tank, looking a little over it
  camera.position.set(-Math.sin(0.4) * 9, 4, -Math.cos(0.4) * 9);
  camera.lookAt(new Vector3(0, 2, 0));
  camera.updateMatrixWorld(true);
  return camera;
}
const settle = (photo, seconds = 3) => { for (let t = 0; t < seconds; t += 1 / 60) photo.update(1 / 60); };

// 1. opening keeps the view exactly as the player had it (no jump), and closing restores the field of view
{
  const camera = chaseCamera();
  const before = camera.position.clone();
  const forward = camera.getWorldDirection(new Vector3());
  const photo = createPhotoCamera({ camera, groundAt });
  photo.open(subject);
  assert.equal(photo.active, true);
  photo.update(1 / 60);
  near(camera.position.distanceTo(before), 0, 1e-6, 'open keeps the camera where it was');
  near(camera.getWorldDirection(new Vector3()).angleTo(forward), 0, 1e-6, 'open keeps the line of sight');
  photo.setLens(85);
  settle(photo);
  near(camera.fov, lensFovDeg(85), 1e-3, 'an 85 mm lens');
  assert.equal(photo.lensMm(), 85);
  photo.close();
  assert.equal(photo.active, false);
  assert.equal(camera.fov, 60, 'close hands back the live field of view');
  assert.equal(photo.update(1 / 60), false, 'a closed camera steers nothing');
}

// 2. the clamp: however far it is dollied, panned or orbited, the camera stays within the radius and over the ground
{
  const camera = chaseCamera();
  const photo = createPhotoCamera({ camera, groundAt });
  photo.open(subject);
  const anchor = new Vector3(subject.x, subject.y, subject.z);
  for (let step = 0; step < 400; step += 1) {
    if (step % 4 === 0) photo.dolly(3);
    if (step % 3 === 0) photo.pan(900, -700);
    photo.orbit(37, step % 50 < 25 ? 40 : -60);
    photo.update(1 / 30);
    const p = camera.position;
    const flat = Math.hypot(p.x - anchor.x, p.z - anchor.z);
    assert.ok(flat <= PHOTO_RADIUS_M + 1e-6, `step ${step}: ${flat.toFixed(2)} m from the subject`);
    assert.ok(p.y >= groundAt(p.x, p.z) + PHOTO_GROUND_CLEARANCE_M - 1e-6, `step ${step}: under the ground at ${p.toArray()}`);
    assert.ok(p.y <= anchor.y + PHOTO_RADIUS_M + 1e-6, `step ${step}: over the ceiling`);
  }
  // pitching under the deck presses the camera onto the ground, never through it
  photo.aim(0, -1, 0.3);
  settle(photo);
  assert.ok(camera.position.y >= groundAt(camera.position.x, camera.position.z) + PHOTO_GROUND_CLEARANCE_M - 1e-6);
}

// 3. the shared framings are views about the subject: front looks at the bow, side at the flank, the dolly sizes them
{
  const camera = chaseCamera();
  const photo = createPhotoCamera({ camera, groundAt: () => 0 });
  photo.open(subject);
  photo.aim(0, 8 * Math.PI / 180, 1);
  settle(photo);
  const bow = new Vector3(Math.sin(subject.yaw), 0, Math.cos(subject.yaw));
  const fromSubject = camera.position.clone().sub(new Vector3(subject.x, camera.position.y, subject.z)).normalize();
  near(fromSubject.angleTo(bow), 0, 1e-3, 'front stands on the bow');
  const frontDist = camera.position.distanceTo(new Vector3(subject.x, subject.y, subject.z));
  photo.aim(Math.PI / 2, 6 * Math.PI / 180, 2);
  settle(photo);
  const flank = camera.position.clone().sub(new Vector3(subject.x, camera.position.y, subject.z)).normalize();
  near(flank.angleTo(bow), Math.PI / 2, 1e-3, 'side stands square to the flank');
  assert.ok(camera.position.distanceTo(new Vector3(subject.x, subject.y, subject.z)) < frontDist * 0.6, 'zoom 2 dollies in');
  // the hero pose is the reset, the bow three-quarters toward the viewer
  assert.equal(photo.reset(), true);
  settle(photo);
  const hero = camera.position.clone().sub(new Vector3(subject.x, camera.position.y, subject.z)).normalize();
  near(hero.angleTo(bow), 35 * Math.PI / 180, 1e-3, 'hero is 35 degrees off the bow');
}

// 4. a sight's view (the camera at the gun) opens on the hero framing rather than a pivot inside the hull
{
  const camera = new PerspectiveCamera(7.5, 16 / 9, 0.1, 4000);
  camera.position.set(0, 2.2, 0.5);
  camera.lookAt(new Vector3(0, 2.2, 100));
  camera.updateMatrixWorld(true);
  const photo = createPhotoCamera({ camera, groundAt: () => 0 });
  photo.open(subject);
  // photo mode opens on the hero framing at its opening lens (src/ui/photoMode.ts)
  photo.setLens(35);
  photo.reset();
  settle(photo);
  const d = camera.position.distanceTo(new Vector3(subject.x, subject.y, subject.z));
  assert.ok(d > 5 && d < 20, `the hero distance from a sight: ${d}`);
}

// 6. a framing holds the subject's sphere whole on any screen: the nearer edge (a phone held upright is narrow) and the
//    lens size it, the interface's inset at the bottom shifts the lens so it centres above it, and a still drops the shift
{
  const centre = new Vector3(subject.x, subject.y, subject.z);
  const fits = (camera) => {
    // the sphere's silhouette: its centre's direction plus the radius's angle, inside the frame's half-angles
    camera.updateMatrixWorld(true);
    const local = centre.clone().applyMatrix4(camera.matrixWorldInverse);
    const dist = local.length();
    const spread = Math.asin(Math.min(1, subject.radiusM / dist));
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const halfV = Math.atan(tanV), halfH = Math.atan(tanV * camera.aspect);
    const ax = Math.abs(Math.atan2(local.x, -local.z)), ay = Math.abs(Math.atan2(local.y, -local.z));
    return ax + spread <= halfH + 1e-3 && ay + spread <= halfV + 1e-3;
  };
  const wide = chaseCamera();
  const tall = chaseCamera();
  tall.aspect = 390 / 844;
  tall.updateProjectionMatrix();
  const photos = [wide, tall].map((camera) => {
    const photo = createPhotoCamera({ camera, groundAt: () => -50, radiusM: 400 });
    photo.open(subject);
    photo.setLens(35);
    photo.reset();
    settle(photo);
    return photo;
  });
  assert.ok(fits(wide) && fits(tall), 'the hero framing holds the subject whole, wide and upright');
  const dWide = wide.position.distanceTo(centre), dTall = tall.position.distanceTo(centre);
  assert.ok(dTall > dWide * 1.6, `an upright screen frames from further (${dTall} vs ${dWide})`);
  // a longer lens refits the framing it holds
  photos[0].setLens(85);
  settle(photos[0]);
  assert.ok(fits(wide) && wide.position.distanceTo(centre) > dWide * 2, 'an 85 mm lens refits from further');
  // the bar's inset: the lens shifts down by half of it, and the framing backs off to fit above it
  const before = wide.position.distanceTo(centre);
  photos[0].inset(200);
  assert.equal(wide.view?.enabled, true);
  near(wide.view.offsetY, 100, 1e-9, 'the lens centres the frame above the inset');
  settle(photos[0]);
  assert.ok(wide.position.distanceTo(centre) > before, 'the framing fits the view above the inset');
  // a still frames the whole view; closing hands the camera back unshifted
  photos[0].inset(0);
  assert.ok(!wide.view?.enabled, 'a still carries no shift');
  photos[0].inset(200);
  photos[0].close();
  assert.ok(!wide.view?.enabled, 'closing drops the shift');
  // a drag leaves the framing: a lens change no longer moves the camera
  photos[1].orbit(40, 0);
  settle(photos[1]);
  const held = tall.position.clone();
  photos[1].setLens(50);
  settle(photos[1]);
  near(tall.position.distanceTo(held), 0, 1e-6, 'a lens change keeps a camera the player placed');
}

// 5. the roll turns the horizon and is clamped; the lenses are a wide-to-long ladder
{
  const camera = chaseCamera();
  const photo = createPhotoCamera({ camera, groundAt: () => 0 });
  photo.open(subject);
  photo.setRollDeg(12);
  settle(photo);
  near(photo.rollDeg(), 12, 1e-9, 'roll target');
  near(photo.debugState().roll, 12 * Math.PI / 180, 1e-4, 'roll eased in');
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  assert.ok(right.y < -0.1, 'a positive roll turns the camera clockwise (its right edge drops)');
  assert.ok(up.y > 0.9);
  photo.roll(10);
  assert.ok(photo.rollDeg() <= 30 + 1e-9, 'roll clamps at 30 degrees');
  for (let i = 1; i < PHOTO_LENSES_MM.length; i += 1) assert.ok(lensFovDeg(PHOTO_LENSES_MM[i]) < lensFovDeg(PHOTO_LENSES_MM[i - 1]));
}

// 7. a subject's points (a long hull and the gun past its bow) frame tighter than its sphere, and every one stays inside
//    the frame on a wide screen and an upright one
{
  const points = [];
  for (const x of [-1.8, 1.8]) for (const z of [-4.2, 4.2]) for (const y of [0, 2.6]) points.push({ x, y, z });
  points.push({ x: 0, y: 2.1, z: 8.6 });
  const shaped = { x: 0, y: 1.3, z: 2.2, yaw: 0, radiusM: 6.9, points };
  const inFrame = (camera) => points.every((p) => {
    const ndc = new Vector3(p.x, p.y, p.z).project(camera);
    return Math.abs(ndc.x) <= 1 + 1e-6 && Math.abs(ndc.y) <= 1 + 1e-6 && ndc.z < 1;
  });
  for (const aspect of [16 / 9, 390 / 844]) {
    const sphereCam = chaseCamera(), pointCam = chaseCamera();
    for (const camera of [sphereCam, pointCam]) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    const bySphere = createPhotoCamera({ camera: sphereCam, groundAt: () => -50, radiusM: 400 });
    const byPoints = createPhotoCamera({ camera: pointCam, groundAt: () => -50, radiusM: 400 });
    bySphere.open({ ...shaped, points: undefined });
    byPoints.open(shaped);
    for (const photo of [bySphere, byPoints]) { photo.setLens(35); photo.reset(); settle(photo); }
    const centre = new Vector3(shaped.x, shaped.y, shaped.z);
    assert.ok(inFrame(pointCam), `every point in frame at aspect ${aspect.toFixed(2)}`);
    assert.ok(pointCam.position.distanceTo(centre) < sphereCam.position.distanceTo(centre),
      `the points frame tighter than the sphere at aspect ${aspect.toFixed(2)}`);
  }
}

// 8. every framing at every tilt holds the whole subject above the bar: the fit takes the turned frame and the strip the
//    bar covers (a held framing refits when the tilt changes), on a wide screen, an upright phone and a landscape one
{
  const points = [];
  for (const x of [-1.8, 1.8]) for (const z of [-4.2, 4.2]) for (const y of [0, 2.6]) points.push({ x, y, z });
  points.push({ x: 0, y: 2.1, z: 8.6 });
  const shaped = { x: 0, y: 1.3, z: 2.2, yaw: 0, radiusM: 6.9, points };
  const DEG = Math.PI / 180;
  // photoMode.ts PHOTO_FRAMINGS (front, side, rear, top) and the hero (reset)
  const framings = [[0, 8], [90, 6], [135, 12], [45, 35], null];
  for (const [w, h, inset] of [[1440, 900, 80], [390, 844, 270], [844, 390, 150]]) {
    const camera = chaseCamera();
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const photo = createPhotoCamera({ camera, groundAt: () => -50, radiusM: 400, viewHeightPx: () => h });
    photo.open(shaped);
    photo.inset(inset);
    const barTop = -1 + (2 * inset) / h;
    for (const mm of [18, 35, 85]) {
      photo.setLens(mm);
      for (const framing of framings) {
        if (framing) photo.aim(framing[0] * DEG, framing[1] * DEG); else photo.reset();
        for (const tilt of [-12, 0, 12]) {
          photo.setRollDeg(tilt);
          settle(photo, 4);
          for (const p of points) {
            const ndc = new Vector3(p.x, p.y, p.z).project(camera);
            const where = `${w}x${h} ${mm} mm ${framing ? framing.join('/') : 'hero'} tilt ${tilt}`;
            assert.ok(Math.abs(ndc.x) <= 1 + 1e-6 && ndc.y <= 1 + 1e-6, `${where}: a point leaves the frame`);
            assert.ok(ndc.y >= barTop - 1e-6, `${where}: a point runs under the bar (${ndc.y.toFixed(3)} < ${barTop.toFixed(3)})`);
          }
        }
      }
    }
  }
}

// 9. reduced motion: a framing, a lens and a roll land on the first frame, never eased in (critic r12 line 9)
{
  const steer = (photo) => { photo.open(subject); photo.aim(Math.PI / 2, 6 * Math.PI / 180); photo.setLens(85); photo.setRollDeg(12); };
  const easedCamera = chaseCamera();
  const eased = createPhotoCamera({ camera: easedCamera, groundAt });
  steer(eased);
  eased.update(1 / 60);
  const easedFirst = easedCamera.position.clone();
  settle(eased);
  const reducedCamera = chaseCamera();
  const reduced = createPhotoCamera({ camera: reducedCamera, groundAt, reduceMotion: () => true });
  steer(reduced);
  reduced.update(1 / 60);
  assert.ok(easedFirst.distanceTo(easedCamera.position) > 0.5, 'the eased camera is still on its way after one frame');
  assert.ok(reducedCamera.position.distanceTo(easedCamera.position) < 1e-6, 'the reduced camera is where the settled one is, after one frame');
  near(reducedCamera.fov, easedCamera.fov, 1e-6, 'the lens lands at once');
  assert.ok(reducedCamera.quaternion.angleTo(easedCamera.quaternion) < 1e-6, 'the roll and the aim land at once');
}

console.log('photoCamera selftest: PASS');
