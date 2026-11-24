// garage-env-276 (Main's ruling (b)): the showroom camera's spring arm against every outdoor pack's own parts
// (garageEnvironmentKit.ts cameraObstacles / cameraClearance, engine/cameraRig.ts ShowroomOrbitDeps.clearance).
// 1. the default framing is the rig's own to the bit (no part of a pack reaches the opening view);
// 2. the player's orbit, through the rig's own input (a full turn in 15-degree drags at the near and far zoom limits and the
//    default zoom, each at both pitch clamps and the default pitch): no camera sample inside any part's own (oriented) box,
//    every frame;
// 3. planted control: a post across the opening view's sightline engages the arm and the eye stays out of it; and the same
//    orbits without the arm stand the eye inside parts.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { createShowroomOrbit } from '../engine/cameraRig.ts';
import { garageCameraClearance } from './garageOrbitClearance.ts';
import { buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets } from './garageEnvironmentKit.ts';

const DT = 1 / 60;
const PX_PER_15_DEG = 409 / 6; // the rig's 0.22 degrees a pixel
const material = new THREE.MeshBasicMaterial();
/** The fleet's short and long hulls, standing on the pad at the pack's origin. */
const HEROES = [['short', [3.2, 2.2, 5.6]], ['long', [3.7, 2.9, 9.6]]].map(([name, [w, h, l]]) => {
  const hero = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
  hero.position.y = h / 2;
  hero.updateMatrixWorld(true);
  return { name, hero };
});

/** The Garage's desktop stage: the hero's rect in the free area between its panels (CSS px of a 1600 x 900 view). */
const STAGE = Object.freeze({ x: 520, y: 110, w: 760, h: 560 });
function rig(hero, clearance) {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 2000);
  camera.__cotViewW = 1600; camera.__cotViewH = 900;
  const poses = [];
  const orbit = createShowroomOrbit(camera, { setExternalPose: (eye, look) => poses.push({ eye: eye.clone(), look: look.clone() }) }, {
    getSubject: () => hero, getStageRect: () => STAGE, heroYawRad: 0.6, heroPitchRad: 0.18, floorY: () => 0, ...(clearance ? { clearance } : {}),
  });
  return { orbit, poses };
}
const settle = (orbit, seconds) => { for (let t = 0; t < seconds; t += DT) orbit.update(DT); };
const opening = (r) => { r.orbit.start(); settle(r.orbit, 3); };

const assets = createGarageEnvironmentAssetLibrary({});
const rows = [];
let samples = 0, engaged = 0, bareInside = 0;
for (const variant of GARAGE_VARIANTS.filter((v) => v.architecture !== 'field_shed')) {
  await prepareGarageEnvironmentAssets(assets, variant);
  const build = buildGarageEnvironment({}, assets, variant, () => {});
  const boxes = build.cameraObstacles ?? [], clearance = build.cameraClearance;
  assert.ok(boxes.length > 0 && typeof build.cameraClearance === 'function', `${variant.id}: the pack offers the arm its parts`);
  let packEngaged = 0, packBareInside = 0;
  for (const { name, hero } of HEROES) {
    // 1. the opening view, to the bit
    const bare = rig(hero, null), armed = rig(hero, build.cameraClearance);
    opening(bare); opening(armed);
    assert.equal(armed.poses.length, bare.poses.length, `${variant.id} ${name}: the arm adds no opening pose`);
    armed.poses.forEach((pose, i) => assert.ok(pose.eye.equals(bare.poses[i].eye) && pose.look.equals(bare.poses[i].look),
      `${variant.id} ${name}: opening pose ${i} is the rig's own to the bit`));
    // 2. the orbit
    for (const [zoomName, notches] of [['default', 0], ['near', 3], ['far', -3]]) {
      for (const [pitchName, dy] of [['default', 0], ['low', 600], ['high', -600]]) {
        const r = rig(hero, build.cameraClearance), bare = rig(hero, null);
        for (const each of [r, bare]) opening(each);
        for (const { orbit } of [r, bare]) {
          for (let n = 0; n < 3 && notches; n += 1) { orbit.wheel(notches); settle(orbit, 0.8); }
          if (dy) { orbit.beginDrag(); orbit.drag(0, dy); orbit.endDrag(); settle(orbit, 0.6); }
        }
        for (let step = 0; step < 24; step += 1) {
          for (const { orbit } of [r, bare]) { orbit.beginDrag(); orbit.drag(PX_PER_15_DEG, 0); orbit.endDrag(); }
          const from = r.poses.length, bareFrom = bare.poses.length;
          settle(r.orbit, 0.35); settle(bare.orbit, 0.35);
          for (const { eye } of bare.poses.slice(bareFrom)) if (clearance.holding(eye) >= 0) packBareInside += 1;
          for (const { eye, look } of r.poses.slice(from)) {
            samples += 1;
            const hit = clearance.holding(eye);
            assert.ok(hit < 0, `${variant.id} ${name} ${zoomName}/${pitchName} step ${step}: the camera stands inside a part `
              + `(${hit >= 0 && [boxes[hit].box.min, boxes[hit].box.max].map((v) => v.toArray().map((x) => x.toFixed(1)).join(',')).join(' .. ')}`
              + `${hit >= 0 && boxes[hit].matrix ? ', oriented' : ''}) at ${eye.toArray().map((x) => x.toFixed(1)).join(',')}`);
            if (clearance(look, eye) < 1) packEngaged += 1;
          }
        }
      }
    }
  }
  // 3. a planted post across the opening view's sightline
  const probe = rig(HEROES[1].hero, null); opening(probe);
  const { eye, look } = probe.poses.at(-1);
  const post = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().lerpVectors(look, eye, 0.92), new THREE.Vector3(0.4, 4, 0.4));
  const planted = rig(HEROES[1].hero, garageCameraClearance([...boxes, { box: post }]));
  opening(planted);
  const held = planted.poses.at(-1);
  assert.ok(held.eye.distanceTo(held.look) < eye.distanceTo(look) - 1, `${variant.id}: a planted post engages the arm`);
  assert.ok(!post.containsPoint(held.eye) && post.distanceToPoint(held.eye) > 1, `${variant.id}: the eye stands in front of the post`);
  engaged += packEngaged; bareInside += packBareInside;
  rows.push(`${variant.mapId} ${boxes.length} parts, the arm in at ${packEngaged} samples; without it ${packBareInside} inside a part`);
  build.dispose();
}
assets.dispose();
// the control: the same orbits without the arm stand the eye inside parts (the receipt can fail)
assert.ok(bareInside > 0, 'without the arm, the orbit stands the eye inside parts');
console.log(`garageCameraArm.selftest: ${samples} camera samples over ${rows.length} packs, 2 hulls, 3 zooms, 3 pitches, a full turn `
  + `each: none inside a part; opening views the rig's own to the bit; a planted post engages the arm (${engaged} samples `
  + `with the arm in; without it ${bareInside} samples stand inside a part) PASS\n  ${rows.join('\n  ')}`);
process.exit(0);
