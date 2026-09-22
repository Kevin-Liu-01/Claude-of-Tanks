import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import './tank-surface-collect.mjs'; // node canvas/document shim the builders paint their textures through
import { TRACK_LANE_BAND_PAD_VOXELS, TRACK_LANE_SHOE_PAD_VOXELS, insideTrackLane, trackLaneBoxes, trackLaneBoxesForVoxel, trackLaneVoxelMask } from './track-lane-boxes.mjs';
import { isTrackShoeMesh } from './track-clip-classification.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';

// Track lane boxes (2026-09-21): one definition of "the volume the track sweeps" shared by the fill generator and
// the watertight check. Pins: (1) both tools are wired to the shared module and the generator keeps no private copy;
// (2) the shared function reproduces the lanes the generator used for the E100 X and Leclerc classic X records in
// d0cbb9fcd (fixture captured 2026-09-21 from that commit's inline trackLaneBoxes; re-pin with a dated note when
// either hull's running gear legitimately changes); (3) a lane is the padded band box grown outboard and along y/z
// by the padded live-shoe envelope with the inboard face kept, dead (scale-0) shoe instances ignored, a shoe-only
// side lanes from its envelope; (4) the grid mask agrees with the point test voxel for voxel; (5) the watertight
// check reports the two hulls' lane air as excluded lane volume with 0 L of leak, --no-lanes still reads the plain
// leak, leak + lane is conserved, and its self-test proves a synthetic non-lane hole is still reported.
const VOXEL = 0.025;
assert.equal(TRACK_LANE_BAND_PAD_VOXELS, 2, 'band clearance: the strict clip audit samples 2 cm cells');
assert.equal(TRACK_LANE_SHOE_PAD_VOXELS, 1, 'shoe envelope clearance: one voxel');

// (1) wiring
const generator = readFileSync('tools/gen-interior-fills.mjs', 'utf8');
assert.match(generator, /^import \{ insideTrackLane, trackLaneBoxesForVoxel \} from '\.\/track-lane-boxes\.mjs';$/m, 'the generator imports the shared lanes');
assert.match(generator, /trackLaneBoxesForVoxel\(tank\.root, VOXEL\)/, 'the generator reads its lanes through the shared helper');
assert.match(generator, /insideTrackLane\(laneBoxes, grid, x, y, z\)/, 'the generator skips lane voxels with the shared point test');
assert.doesNotMatch(generator, /function trackLaneBoxes|function insideTrackLane|isTrackShoeMesh/, 'the generator keeps no private lane copy');
const check = readFileSync('tools/tank-watertight-check.mjs', 'utf8');
assert.match(check, /^import \{ trackLaneBoxesForVoxel, trackLaneVoxelMask \} from '\.\/track-lane-boxes\.mjs';$/m, 'the watertight check imports the shared lanes');
assert.match(check, /trackLaneBoxesForVoxel\(tank\.root, VOXEL\)/, 'the check reads the same lanes as the generator');

// (2) fixture: lanes per hull sorted left to right, [minX, minY, minZ, maxX, maxY, maxZ], captured 2026-09-21 from the
// d0cbb9fcd inline function at 0.025 m voxels (band pad 0.05, shoe pad 0.025), rounded to 0.1 mm.
const FIXTURE = {
  jpz_e100_x: [[-2.0723, -0.025, -3.6564, -1.1068, 1.357, 4.0103], [1.1068, -0.025, -3.6564, 2.0723, 1.357, 4.0103]],
  leclerc_classic_x: [[-1.6602, -0.025, -3.1142, -1.0092, 1.2785, 3.4342], [0.9376, -0.025, -3.1142, 1.5886, 1.2785, 3.4342]],
};
const flat = (box) => [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4();
let maskVoxels = 0;
for (const [id, fixture] of Object.entries(FIXTURE)) {
  const tank = createTank(id, null, { proceduralOnly: true });
  try {
    const lanes = trackLaneBoxesForVoxel(tank.root, VOXEL);
    assert.equal(lanes.length, 2, `${id}: one lane per track side`);
    assert.deepEqual(lanes.map(flat), trackLaneBoxes(tank.root, VOXEL * 2, VOXEL).map(flat), `${id}: the voxel helper applies the two pad constants`);
    const sorted = [...lanes].sort((a, b) => a.min.x - b.min.x);
    sorted.forEach((lane, i) => flat(lane).forEach((v, k) => assert.ok(Math.abs(v - fixture[i][k]) <= 2e-4,
      `${id}: lane ${i} coordinate ${k} reads ${v.toFixed(5)}, fixture ${fixture[i][k]} (re-pin with a dated note only for a real running-gear change)`)));
    assert.ok(sorted[0].max.x < 0 && sorted[1].min.x > 0, `${id}: lanes lie either side of the centreline`);
    // (3) structure against the live band meshes and shoe instances
    const bands = new Map(), shoeCorners = new Map();
    tank.root.updateMatrixWorld(true);
    tank.root.traverse((node) => {
      if (node.isMesh && !node.isInstancedMesh && /^gearTrackBand/.test(node.name || '')) {
        const box = new THREE.Box3().setFromObject(node); const side = Math.sign(box.min.x + box.max.x) || 1;
        (bands.get(side) ?? bands.set(side, new THREE.Box3()).get(side)).union(box); return;
      }
      if (!isTrackShoeMesh(node)) return;
      node.geometry.computeBoundingBox(); const local = node.geometry.boundingBox;
      for (let k = 0; k < node.count; k++) {
        node.getMatrixAt(k, _m); if (Math.abs(_m.determinant()) < 1e-12) continue; // dead pads: covered by the synthetic branch below
        _w.multiplyMatrices(node.matrixWorld, _m); const side = Math.sign(_w.elements[12]) || 1;
        const list = shoeCorners.get(side) ?? shoeCorners.set(side, []).get(side);
        for (let c = 0; c < 8; c++) list.push(new THREE.Vector3(c & 1 ? local.max.x : local.min.x, c & 2 ? local.max.y : local.min.y, c & 4 ? local.max.z : local.min.z).applyMatrix4(_w));
      }
    });
    for (const lane of lanes) {
      const side = Math.sign(lane.min.x + lane.max.x);
      const padded = bands.get(side)?.clone().expandByScalar(VOXEL * TRACK_LANE_BAND_PAD_VOXELS);
      assert.ok(padded && lane.containsBox(padded), `${id}: side ${side} lane contains its padded band box`);
      assert.ok(Math.abs((side > 0 ? lane.min.x : lane.max.x) - (side > 0 ? padded.min.x : padded.max.x)) < 1e-9, `${id}: the inboard lane face is the padded band's, never the shoe's`);
      assert.ok(side > 0 ? lane.max.x > padded.max.x + 1e-6 : lane.min.x < padded.min.x - 1e-6, `${id}: the shoe belt overhangs the band outboard, so the lane extends past the band`);
      const corners = shoeCorners.get(side); assert.ok(corners?.length >= 8, `${id}: live shoe instances on side ${side}`);
      const pad = VOXEL * TRACK_LANE_SHOE_PAD_VOXELS, eps = 1e-9;
      for (const p of corners) {
        assert.ok(p.y - pad >= lane.min.y - eps && p.y + pad <= lane.max.y + eps, `${id}: shoe corner y ${p.y} inside the lane with clearance`);
        assert.ok(p.z - pad >= lane.min.z - eps && p.z + pad <= lane.max.z + eps, `${id}: shoe corner z ${p.z} inside the lane with clearance`);
        assert.ok(side > 0 ? p.x + pad <= lane.max.x + eps : p.x - pad >= lane.min.x - eps, `${id}: shoe corner x ${p.x} inside the lane outboard`);
      }
    }
    // (4) mask == point test, voxel for voxel, on a grid with an odd voxel size so box faces fall between centres
    const grid = { origin: [-2.3, -0.31, -4.1], voxel: 0.03, nx: 156, ny: 60, nz: 280 };
    const mask = trackLaneVoxelMask(lanes, grid); let mismatches = 0, inside = 0;
    for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
      const expect = insideTrackLane(lanes, grid, x, y, z) ? 1 : 0; const i = (z * grid.ny + y) * grid.nx + x;
      if (mask[i] !== expect) mismatches++; inside += mask[i];
    }
    assert.equal(mismatches, 0, `${id}: trackLaneVoxelMask disagrees with insideTrackLane on ${mismatches} voxels`);
    const laneVolume = lanes.reduce((s, b) => s + (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z), 0);
    assert.ok(Math.abs(inside * grid.voxel ** 3 - laneVolume) / laneVolume < 0.05, `${id}: the mask covers the lane volume (${(inside * grid.voxel ** 3).toFixed(3)} vs ${laneVolume.toFixed(3)} m³)`);
    maskVoxels += inside;
  } finally { tank.dispose?.(); }
}

// (3b) synthetic branches: a left band with a live shoe overhanging outboard and past the band's end, a dead pad,
// and a right side that has shoes but no band
{
  const root = new THREE.Group();
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 3.0), new THREE.MeshBasicMaterial()); band.name = 'gearTrackBandL'; band.position.set(-1.2, 0.4, 0); root.add(band);
  const shoes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.05, 0.1), new THREE.MeshBasicMaterial(), 3);
  shoes.userData.runningGear = true; shoes.userData.trackShoeCountPerSide = 1;
  shoes.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-1.25, 0.05, 1.6)); // live: x -1.40..-1.10, y 0.025..0.075, z 1.55..1.65
  shoes.setMatrixAt(1, new THREE.Matrix4().makeScale(0, 0, 0).setPosition(-9, 0, 0)); // dead pad of the covered top run
  shoes.setMatrixAt(2, new THREE.Matrix4().makeTranslation(1.25, 0.05, 0)); // right side: shoes, no band
  root.add(shoes);
  const lanes = trackLaneBoxes(root, 0.05, 0.025);
  assert.equal(lanes.length, 2, 'one lane per side, the dead pad opens none');
  // BoxGeometry positions are float32: allow their rounding
  const close = (box, expect, label) => flat(box).forEach((v, k) => assert.ok(Math.abs(v - expect[k]) < 1e-6, `${label}: coordinate ${k} ${v} vs ${expect[k]}`));
  close(lanes.find((b) => b.max.x < 0), [-1.425, 0, -1.55, -1.05, 0.75, 1.675], 'left lane: band inboard face kept, shoe + pad outboard and along y/z');
  close(lanes.find((b) => b.min.x > 0), [1.1, 0, -0.075, 1.425, 0.1, 0.075], 'right lane: the shoe envelope alone, inboard face pulled back by the shoe pad');
}

// (5) the watertight check on the two hulls and its synthetic self-test
const tmp = mkdtempSync(join(tmpdir(), 'track-lane-boxes-'));
const litres = {};
try {
  const run = (...args) => { const r = spawnSync(process.execPath, ['tools/tank-watertight-check.mjs', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, `${args.join(' ')}: exit ${r.status}\n${r.stdout}\n${r.stderr}`); return r.stdout; };
  const selfTest = run('--self-test');
  assert.match(selfTest, /^\[self-test\] closed box: WATERTIGHT — 0 L reaches the deep interior \(0 gaps\); track lane 0 L excluded \(0 lanes\)/m);
  const plainHole = Number(selfTest.match(/^\[self-test\] holed box: LEAKING — ([\d.]+) L reaches the deep interior \(1 gap\); track lane 0 L excluded \(0 lanes\)/m)?.[1]);
  const beside = selfTest.match(/^\[self-test\] holed box beside a track lane: LEAKING — ([\d.]+) L reaches the deep interior \(\d+ gaps?\); track lane ([\d.]+) L excluded \(1 lane\)/m);
  assert.ok(plainHole > 0 && beside, `self-test lines present\n${selfTest}`);
  const besideLeak = Number(beside[1]), besideLane = Number(beside[2]);
  assert.ok(besideLeak > 0 && besideLane > 0 && Math.abs(besideLeak + besideLane - plainHole) <= 0.02, `synthetic hole beside a lane: leak ${besideLeak} + lane ${besideLane} = plain ${plainHole}`);
  assert.match(selfTest, /^\[self-test\] PASS/m);
  const ids = ['jpz_e100_x', 'leclerc_classic_x'];
  const lanesOut = run(`--ids=${ids.join(',')}`, `--json=${join(tmp, 'lanes.json')}`);
  const plainOut = run(`--ids=${ids.join(',')}`, '--no-lanes', `--json=${join(tmp, 'plain.json')}`);
  const lanesReport = JSON.parse(readFileSync(join(tmp, 'lanes.json'), 'utf8')).report, plainReport = JSON.parse(readFileSync(join(tmp, 'plain.json'), 'utf8')).report;
  for (const id of ids) {
    const a = lanesReport.find((r) => r.id === id), b = plainReport.find((r) => r.id === id);
    assert.ok(a && b, `${id}: both runs report`);
    assert.equal(a.lanesExcluded, true); assert.equal(b.lanesExcluded, false); assert.equal(a.laneBoxes, 2, `${id}: two lanes`);
    assert.ok(a.leakL <= 0.05 && a.watertight === true, `${id}: lane-aware leak ${a.leakL} L is within the 0.05 L gate`);
    assert.ok(a.trackLaneL >= 0.5, `${id}: the excluded lane air is reported (${a.trackLaneL} L), never hidden`);
    assert.ok(b.leakL >= 0.5 && b.watertight === false, `${id}: --no-lanes still reads the plain lane leak (${b.leakL} L)`);
    assert.ok(Math.abs(a.leakL + a.trackLaneL - b.leakL) <= 0.02, `${id}: leak ${a.leakL} + lane ${a.trackLaneL} = plain leak ${b.leakL}`);
    assert.match(lanesOut, new RegExp(`^${id}: WATERTIGHT — 0 L reaches the deep interior \\(0 gaps\\); track lane ${a.trackLaneL} L excluded \\(2 lanes\\); enclosed`, 'm'));
    assert.match(plainOut, new RegExp(`^${id}: LEAKING — ${b.leakL} L reaches the deep interior \\(\\d+ gaps?\\); track lanes not excluded \\(--no-lanes\\); enclosed`, 'm'));
    litres[id] = { lane: a.trackLaneL, plain: b.leakL };
  }
  // lane air as regenerated under the lane rule (d0cbb9fcd, 2026-09-21): E100 X 4.53 L, Leclerc classic X 0.80 L
  assert.ok(Math.abs(litres.jpz_e100_x.lane - 4.53) <= 0.3, `E100 X lane air ${litres.jpz_e100_x.lane} L (pinned 4.53 L)`);
  assert.ok(Math.abs(litres.leclerc_classic_x.lane - 0.8) <= 0.3, `Leclerc classic X lane air ${litres.leclerc_classic_x.lane} L (pinned 0.80 L)`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`track-lane-boxes.selftest: generator + check wiring, d0cbb9fcd lane fixture, band/shoe structure, mask == point test (${maskVoxels} lane voxels), synthetic branches, watertight lane exclusion (E100 X ${litres.jpz_e100_x.lane} L, Leclerc classic X ${litres.leclerc_classic_x.lane} L lane air reported, 0 L leak; --no-lanes ${litres.jpz_e100_x.plain} / ${litres.leclerc_classic_x.plain} L) and self-test hole conservation PASS`);
