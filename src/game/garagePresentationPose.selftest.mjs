import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  GARAGE_CAMERA_AZIMUTH_RAD,
  GARAGE_CAMERA_LOOK_HEIGHT_M,
  GARAGE_CAMERA_PITCH_RAD,
  GARAGE_HERO_HEADING_RAD,
  GARAGE_PRESENTATION_POSE,
  garageViewPoint,
  garageWorldPointToView,
  legacyGaragePointToView,
} from './garagePresentationPose.ts';

assert.ok(Object.isFrozen(GARAGE_PRESENTATION_POSE));
assert.ok(Object.isFrozen(GARAGE_PRESENTATION_POSE.cameraOffsetM));
assert.equal(GARAGE_HERO_HEADING_RAD, 0);
assert.equal(GARAGE_CAMERA_LOOK_HEIGHT_M, 1.6);
assert.deepEqual([...GARAGE_PRESENTATION_POSE.cameraOffsetM], [7.4, 2.75, -8]);
assert.equal(GARAGE_PRESENTATION_POSE.cameraFovDeg, 42);
assert.equal(GARAGE_CAMERA_AZIMUTH_RAD, Math.PI * 3 / 4);
assert.equal(GARAGE_CAMERA_PITCH_RAD, Math.atan2(1.2, Math.hypot(7.4, 8)));
const cameraPlanar = [
  GARAGE_PRESENTATION_POSE.cameraOffsetM[0],
  GARAGE_PRESENTATION_POSE.cameraOffsetM[2],
];
const heroForward = [
  Math.sin(GARAGE_HERO_HEADING_RAD),
  Math.cos(GARAGE_HERO_HEADING_RAD),
];
assert.ok(cameraPlanar[0] * heroForward[0] + cameraPlanar[1] * heroForward[1] < 0,
  'the canonical camera must remain behind the hull on the local -Z side');
const cameraRight = [
  Math.cos(GARAGE_CAMERA_AZIMUTH_RAD),
  -Math.sin(GARAGE_CAMERA_AZIMUTH_RAD),
];
assert.ok(heroForward[0] * cameraRight[0] + heroForward[1] * cameraRight[1] < 0,
  'the bow and gun must project toward screen-left in the default view');
const oldPoint = { x: -30, z: -12 };
const viewPoint = legacyGaragePointToView(oldPoint.x, oldPoint.z);
const recomposed = garageViewPoint(viewPoint.side, viewPoint.depth);
assert.ok(Math.abs(recomposed.x - oldPoint.z) < 1e-9);
assert.ok(Math.abs(recomposed.z + oldPoint.x) < 1e-9,
  'the rear camera must rotate authored scenery into the same screen-space composition');
const roundTrip = garageWorldPointToView(recomposed.x, recomposed.z);
assert.ok(Math.abs(roundTrip.side - viewPoint.side) < 1e-9);
assert.ok(Math.abs(roundTrip.depth - viewPoint.depth) < 1e-9);

const environmentSource = await readFile(
  new URL('./garageEnvironmentPresentationRuntime.ts', import.meta.url), 'utf8',
);
const stageSource = await readFile(new URL('../ui/garageStage.ts', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(environmentSource, /GARAGE_PRESENTATION_POSE/,
  'Garage camera framing must consume the canonical presentation pose');
assert.match(stageSource, /GARAGE_HERO_HEADING_RAD/,
  'Garage hero heading must consume the canonical presentation pose');
assert.doesNotMatch(environmentSource, /variant\.(camera|heading|yaw)|mapId\s*===.*camera/i,
  'Garage environment identity must never change camera or tank orientation');
assert.doesNotMatch(stageSource, /variant\.(camera|heading|yaw)|mapId\s*===.*rotation/i,
  'Garage stage identity must never change the hero orientation');
assert.match(mainSource, /heroYawRad:\s*GARAGE_CAMERA_AZIMUTH_RAD/,
  'the showroom solver must consume the canonical camera azimuth');
assert.match(mainSource, /heroPitchRad:\s*GARAGE_CAMERA_PITCH_RAD/,
  'the showroom solver must consume the canonical camera pitch');
assert.match(mainSource, /resetGarageShowroom\?\.\(\)/,
  'environment placement must reset the active showroom instead of winning the camera');

console.log('garagePresentationPose.selftest: one immutable Verdant-style composition owns every Garage');
