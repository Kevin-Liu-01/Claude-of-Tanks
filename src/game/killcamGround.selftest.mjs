// killcamGround receipt (engine-cs, 2026-10-15): the staged killcam's synthetic flank muzzle, its seated shooter and
// every replay camera write stay above the ground. Unit cases on authored grounds, then every map's own height field:
// a grid of targets at four hull yaws, the muzzle and seat above their ground on every one, the line clear on
// all but the hollows no flank sees into (90 % floor; 92.2 % at 2026-10-15).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KILLCAM_LINE_CLEAR_M, KILLCAM_MUZZLE_GROUND_M, KILLCAM_MUZZLE_RISE_M, KILLCAM_SHOOTER_BACK_M,
  KILLCAM_STAGE_CANDIDATES, killcamCameraFloor, killcamLineClearance, stageKillcamFlankShot, stageKillcamShooter,
} from './killcamGround.ts';
import { createHeightField } from '../world/terrain.ts';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';

const flat = { getHeightAt: () => 0 };

// 1. flat ground: the original staging, unchanged (yaw + pi/2 + 0.35, 440 m, 9 m over the target)
{
  const target = { x: 10, y: 0.4, z: -20 }, yaw = 0.7;
  const s = stageKillcamFlankShot(target, yaw, flat);
  const az = yaw + Math.PI / 2 + 0.35;
  assert.equal(s.candidate, 0, 'flat ground keeps the original flank');
  assert.ok(s.clear);
  assert.ok(Math.abs(s.muzzle.x - (target.x + Math.sin(az) * 440)) < 1e-9);
  assert.ok(Math.abs(s.muzzle.z - (target.z + Math.cos(az) * 440)) < 1e-9);
  assert.equal(s.muzzle.y, target.y + KILLCAM_MUZZLE_RISE_M);
}

// 2. the muzzle's ground higher than the target: the muzzle keeps a gun's height over it
{
  const slope = { getHeightAt: (x) => Math.max(0, x) * 0.05 };
  const s = stageKillcamFlankShot({ x: 0, y: 0, z: 0 }, 0, slope);
  assert.ok(s.muzzle.y >= slope.getHeightAt(s.muzzle.x, s.muzzle.z) + KILLCAM_MUZZLE_GROUND_M - 1e-9, 'muzzle above its ground');
  assert.ok(s.clear, 'a smooth rise keeps a clear line');
}

// 3. a ridge across the original line: another candidate wins, its line clear
{
  const target = { x: 0, y: 0, z: 0 }, yaw = 0;
  const az = Math.PI / 2 + 0.35, ux = Math.sin(az), uz = Math.cos(az);
  // a 30 m wall 200 m out along the original flank direction only (a narrow ridge, 60 m wide)
  const ridge = { getHeightAt: (x, z) => {
    const along = x * ux + z * uz, across = Math.abs(-x * uz + z * ux);
    return along > 180 && along < 220 && across < 30 ? 30 : 0;
  } };
  const s = stageKillcamFlankShot(target, yaw, ridge);
  assert.notEqual(s.candidate, 0, 'the ridge moves the flank');
  assert.ok(s.clear && s.clearanceM >= KILLCAM_LINE_CLEAR_M);
  assert.ok(killcamLineClearance(ridge, s.muzzle, { x: 0, y: 1, z: 0 }) >= KILLCAM_LINE_CLEAR_M);
}

// 4. a pit no candidate clears: the best line is returned, flagged, the muzzle still above its ground
{
  const pit = { getHeightAt: (x, z) => (Math.hypot(x, z) > 40 ? 60 : 0) };
  const s = stageKillcamFlankShot({ x: 0, y: 0, z: 0 }, 0, pit);
  assert.equal(s.clear, false);
  assert.ok(s.muzzle.y >= pit.getHeightAt(s.muzzle.x, s.muzzle.z) + KILLCAM_MUZZLE_GROUND_M - 1e-9);
}

// 5. the shooter's seat: behind the muzzle along the horizontal shot, on its ground plus its own offset
{
  const hill = { getHeightAt: (x) => x * 0.1 };
  const seat = stageKillcamShooter({ x: 100, y: 20, z: 0 }, { x: -0.99, y: -0.14, z: 0 }, hill, 0.35);
  assert.ok(Math.abs(seat.x - (100 + KILLCAM_SHOOTER_BACK_M)) < 1e-9);
  assert.ok(Math.abs(seat.y - (hill.getHeightAt(seat.x, 0) + 0.35)) < 1e-9);
}

// 6. the camera floor: the highest ground within 1.2 m plus 0.9 m (a steep face cannot cut the near plane)
{
  const face = { getHeightAt: (x) => (x > 0.5 ? 6 : 0) };
  assert.equal(killcamCameraFloor(face, 0, 0), 6.9);
  assert.equal(killcamCameraFloor(flat, 3, 4), 0.9);
}

// 7. every map: targets on a grid, four yaws; muzzle and seat above their ground everywhere, the line clear on all but
// a handful of pits, and the candidate list never exhausted where the original flank was clear
assert.ok(KILLCAM_STAGE_CANDIDATES.length >= 20);
let total = 0, clear = 0, moved = 0;
const blocked = [];
for (const id of MAP_IDS) {
  const field = createHeightField(1337, getMapConfig(id));
  for (let gx = -300; gx <= 300; gx += 150) {
    for (let gz = -300; gz <= 300; gz += 150) {
      const target = { x: gx, y: field.getHeightAt(gx, gz) + 0.3, z: gz };
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const s = stageKillcamFlankShot(target, yaw, field);
        total++;
        const ground = field.getHeightAt(s.muzzle.x, s.muzzle.z);
        assert.ok(s.muzzle.y >= ground + KILLCAM_MUZZLE_GROUND_M - 1e-6, `${id} (${gx},${gz}) yaw ${yaw}: muzzle under ground`);
        const dir = { x: target.x - s.muzzle.x, y: target.y + 1 - s.muzzle.y, z: target.z - s.muzzle.z };
        const seat = stageKillcamShooter(s.muzzle, dir, field, 0.3);
        assert.ok(seat.y >= field.getHeightAt(seat.x, seat.z) - 1e-6, `${id}: shooter under ground`);
        if (s.clear) clear++; else blocked.push(`${id}(${gx},${gz},${yaw.toFixed(2)}) ${s.clearanceM.toFixed(1)} m`);
        if (s.candidate > 0) moved++;
      }
    }
  }
}
const share = clear / total;
console.log(`killcamGround: ${MAP_IDS.length} maps, ${total} staged shots, ${clear} clear (${(share * 100).toFixed(1)} %), ${moved} moved off the original flank`);
if (blocked.length) console.log(`  no clear line (best returned): ${blocked.slice(0, 12).join('; ')}${blocked.length > 12 ? ' …' : ''}`);
assert.ok(share >= 0.9, `the staged line clears on ${(share * 100).toFixed(1)} % of targets (floor 90 %: the rest sit in hollows no flank sees into)`);

// 8. the recipe and the replay use it: shotViews stages through the module, the killcam writes every pose through
// the floored poseCamera
const shotViews = readFileSync(new URL('../dev/shotViews.ts', import.meta.url), 'utf8');
assert.match(shotViews, /stageKillcamFlankShot\(target\.state\.pos, target\.state\.yaw, world\.heightField\)/);
assert.match(shotViews, /stageKillcamShooter\(_v1, shotDir, world\.heightField, shooterGroundOffset\)/);
assert.doesNotMatch(shotViews, /target\.state\.pos\.y \+ 9,/, 'no fixed 9 m muzzle left');
const killcam = readFileSync(new URL('./killcam.ts', import.meta.url), 'utf8');
const writes = killcam.match(/rig\.setExternalPose\(/g) || [];
assert.equal(writes.length, 1, 'the one rig write is poseCamera\'s');
assert.match(killcam, /function poseCamera\([\s\S]{0,240}killcamCameraFloor\(heightField, pos\.x, pos\.z\)[\s\S]{0,160}rig\.setExternalPose\(pos, look, fov\)/);
console.log('killcamGround.selftest PASS');
