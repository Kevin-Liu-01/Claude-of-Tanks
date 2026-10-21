// fieldWorkSeat.selftest (the maps lane, 229: terrain-seated breastworks; the coordinator's ruling of 2026-10-18): a field
// work's module is seated on the ground under its own footprint, its courses sheared to that ground's plane (clamped), its
// base under the lowest ground relative to the plane; its collision cells keep its outlines and follow the plane.
//   1. Flat ground: level, the base FIELD_WORK_SINK_M under it.
//   2. A plane of 0.2 along the module's x (at any yaw): the shear is the plane's, the base on it less the sink.
//   3. A slope past the clamp: the shear stops at FIELD_WORK_SHEAR_MAX and the base drops under the lowest ground.
//   4. Rolling ground: no sample of the footprint, nor any point of a dense grid over it (within 2 cm), stands under the
//      base's plane.
//   5. The instance matrix: a geometry point at the plane's rise, faces plumb, the yaw and the scale of the level matrix.
//   6. The collision cells: they tile each outline (area kept), each spans at most FIELD_WORK_CELL_RISE_M of rise, and is
//      raised by the rise at its centre; an unsheared module's outlines come back as they are.
import assert from 'node:assert/strict';
import {
  FIELD_WORK_CELL_RISE_M, FIELD_WORK_SHEAR_MAX, FIELD_WORK_SINK_M, fieldWorkMatrix, fieldWorkSeat, shearRiseRange, shearedOutlines,
} from './fieldWorkSeat.ts';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
const ground = (f) => ({ getHeightAt: f });
const toWorld = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

// ---- 1. flat
{
  const seat = fieldWorkSeat(ground(() => 12.5), 40, -30, 0.7, 2.1, 0.55);
  assert.equal(seat.shearX, 0); assert.equal(seat.shearZ, 0);
  near(seat.y, 12.5 - FIELD_WORK_SINK_M, 1e-12, 'flat base');
  assert.equal(seat.min, 12.5); assert.equal(seat.max, 12.5);
}

// ---- 2. a plane along the module's local x, at several yaws
for (const yaw of [0, 0.6, Math.PI / 2, -2.4]) {
  const x = 10, z = 5;
  // (the world plane rising 0.2 per metre along the module's local x: (cos yaw, -sin yaw))
  const plane = (wx, wz) => 3 + 0.2 * ((wx - x) * Math.cos(yaw) - (wz - z) * Math.sin(yaw));
  const seat = fieldWorkSeat(ground(plane), x, z, yaw, 1.8, 0.5);
  near(seat.shearX, 0.2, 1e-9, `yaw ${yaw}: shear along x`);
  near(seat.shearZ, 0, 1e-9, `yaw ${yaw}: none along z`);
  near(seat.y, 3 - FIELD_WORK_SINK_M, 1e-9, `yaw ${yaw}: the base on the plane`);
  near(seat.max - seat.min, 0.2 * 3.6, 1e-9, `yaw ${yaw}: the ground's spread under it`);
}

// ---- 3. past the clamp: the shear stops, the base drops under the lowest ground relative to the clamped plane
{
  const steep = (wx) => 0.6 * wx;
  const seat = fieldWorkSeat(ground(steep), 0, 0, 0, 1.5, 0.4);
  near(seat.shearX, FIELD_WORK_SHEAR_MAX, 1e-12, 'the shear clamped');
  near(seat.y, -(0.6 - FIELD_WORK_SHEAR_MAX) * 1.5 - FIELD_WORK_SINK_M, 1e-9, 'the base under the downhill end');
  const gentle = fieldWorkSeat(ground((wx) => 0.01 * wx), 0, 0, 0, 1.5, 0.4);
  assert.equal(gentle.shearX, 0, 'a slope of about half a degree stands level');
}

// ---- 4. rolling ground: nothing under the base's plane
{
  const rolling = (wx, wz) => 2 * Math.sin(wx * 0.21) + 1.3 * Math.cos(wz * 0.17 + 0.4) + 0.4 * Math.sin(wx * 0.9 + wz * 0.7);
  let worst = 0;
  for (let k = 0; k < 40; k++) {
    const x = -60 + k * 3.1, z = 25 - k * 1.7, yaw = k * 0.41, hw = 0.5 + (k % 3) * 0.7, hl = 1.6 - (k % 3) * 0.5;
    const seat = fieldWorkSeat(ground(rolling), x, z, yaw, hw, hl);
    assert.ok(Math.abs(seat.shearX) <= FIELD_WORK_SHEAR_MAX && Math.abs(seat.shearZ) <= FIELD_WORK_SHEAR_MAX);
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const lx = -hw + (2 * hw * i) / 20, lz = -hl + (2 * hl * j) / 20;
        const [wx, wz] = toWorld(x, z, yaw, lx, lz);
        const base = seat.y + seat.shearX * lx + seat.shearZ * lz;
        worst = Math.max(worst, base - rolling(wx, wz));
      }
    }
  }
  // (the samples are a sink under ground; between them the ground's curvature takes at most ~2 cm of it)
  assert.ok(worst <= 0, `no point of a footprint stands under its base's plane (worst ${worst.toFixed(4)} m)`);
}

// ---- 5. the instance matrix (three's column-major elements)
{
  const [x, y, z, yaw, sc, sx, sz] = [7, 2, -4, 0.9, 1.25, 0.18, -0.07];
  const m = fieldWorkMatrix(x, y, z, yaw, sc, sx, sz);
  const apply = (p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  for (const p of [[1.2, 0.4, -0.3], [-1.7, 1.1, 0.45], [0, 0, 0]]) {
    const [wx, wy, wz] = apply(p);
    const [ex, ez] = toWorld(x, z, yaw, p[0] * sc, p[2] * sc);
    near(wx, ex, 1e-12, 'world x as the level matrix'); near(wz, ez, 1e-12, 'world z as the level matrix');
    near(wy, y + sc * (p[1] + sx * p[0] + sz * p[2]), 1e-12, 'world y at the plane\'s rise');
  }
  const top = apply([0.5, 1, 0.2]), bottom = apply([0.5, 0, 0.2]);
  near(top[0], bottom[0], 1e-12, 'faces plumb (x)'); near(top[2], bottom[2], 1e-12, 'faces plumb (z)');
}

// ---- 6. the collision cells
{
  const area = (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    return Math.abs(a) / 2;
  };
  const parts = [
    { points: [-2.2, -0.55, 2.2, -0.55, 2.2, 0.55, -2.2, 0.55], y0: -0.12, y1: 1.5 },
    { points: [-1.0, -0.6, 1.4, -0.4, 1.0, 0.7, -1.2, 0.5], y0: 0, y1: 0.5 },
  ];
  const [sx, sz] = [0.3, -0.12];
  const cells = shearedOutlines(parts, sx, sz);
  assert.ok(cells.length > parts.length, 'a sheared part is cut into cells');
  for (const part of parts) {
    const own = cells.filter((cell) => Math.abs(cell.y1 - cell.y0 - (part.y1 - part.y0)) < 1e-9);
    near(own.reduce((sum, cell) => sum + area(cell.points), 0), area(part.points), 1e-6, 'the cells tile the outline');
  }
  for (const cell of cells) {
    const owner = parts.find((part) => Math.abs(cell.y1 - cell.y0 - (part.y1 - part.y0)) < 1e-9);
    const [lo, hi] = shearRiseRange([cell], sx, sz);
    const rises = [];
    for (let i = 0; i < cell.points.length; i += 2) rises.push(sx * cell.points[i] + sz * cell.points[i + 1]);
    const span = Math.max(...rises) - Math.min(...rises);
    assert.ok(span <= 2 * FIELD_WORK_CELL_RISE_M + 1e-9, `a cell spans at most a step of rise along each axis (${span.toFixed(3)} m)`);
    const lift = cell.y0 - owner.y0;
    assert.ok(lift >= Math.min(...rises) - 1e-9 && lift <= Math.max(...rises) + 1e-9, 'raised by a rise within the cell');
    assert.ok(lo <= Math.min(0, ...rises) + 1e-9 && hi >= Math.max(0, ...rises) - 1e-9, 'the rise range spans its corners');
  }
  const level = shearedOutlines(parts, 0, 0);
  assert.deepEqual(level, parts, 'an unsheared module keeps its outlines');
  assert.notStrictEqual(level[0].points, parts[0].points, 'as copies');
}

console.log('fieldWorkSeat.selftest: flat level, plane sheared at every yaw, steep clamped and sunk, rolling ground under no base, '
  + 'the sheared matrix plumb, collision cells tile the outlines within their rise');
