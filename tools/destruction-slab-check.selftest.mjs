// destruction-slab-check.selftest.mjs — the stray-slab detector's judgement on known shapes (destruction-slabs lane,
// 2026-10-17; the owner's Verdant church screenshot: "these weird ugly boxes/surfaces still randomly come up").
//
// Synthetic, fast and deterministic: a 10 x 6 m building's plan; a room's ceiling inside its walls (a room behind a hole,
// dark by design) passes; the same ceiling grown 4 m past one wall, 3 m up, is flagged outside; a wall panel standing in
// the open past the walls is flagged; a fallen panel lying flat on the ground past them is debris, not flagged; a plate in
// the air with nothing under it is flagged floating; a closed 2 x 2 x 2 block is no slab; a flattened instance matrix is
// degenerate. With `--church` it also runs the real check on Verdant's church (structure 9) and asserts the owner's case:
// the storey interiors laid from the default kit's 16.8 x 28 m box stand past the church's walls.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { footprintOf, judgeSlabs, matrixTrouble, shapeOf, isSlab } from './destruction-slab-check.mjs';

/** Two triangles of a quad (corners in order). */
const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
/** A closed box's 12 triangles. */
function box(x0, y0, z0, x1, y1, z1) {
  const p = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  return [
    ...quad(p(0), p(1), p(3), p(2)), ...quad(p(4), p(6), p(7), p(5)), ...quad(p(0), p(4), p(5), p(1)),
    ...quad(p(2), p(3), p(7), p(6)), ...quad(p(0), p(2), p(6), p(4)), ...quad(p(1), p(5), p(7), p(3)),
  ];
}
const mesh = (name, tris, { map = true, color = [1, 1, 1], troubles = [] } = {}) => ({
  name, tris: Float32Array.from(tris), material: { name, map, fallback: false, color, vertexColors: false, side: 0 }, troubles, vertexTint: [1, 1, 1],
});

// the intact building: walls 10 x 6 x 6 m and a roof over them
const intact = [Float32Array.from([...box(0, 0, 0, 10, 6, 0.3), ...box(0, 0, 5.7, 10, 6, 6), ...box(0, 0, 0, 0.3, 6, 6), ...box(9.7, 0, 0, 10, 6, 6),
  ...quad([0, 6, 0], [10, 6, 0], [10, 6, 6], [0, 6, 6])])];
const footprint = footprintOf(intact);
assert.ok(footprint.has(5, 3) && footprint.has(0.1, 0.1) && !footprint.has(12, 3) && !footprint.has(5, -2), 'the plan covers the building and not past it');
const groundAt = () => 0;
// the building's live record (its shell, 0..6 m): what holds a room's ceiling inside it
const supportAt = (x, z, y) => x >= 0 && x <= 10 && z >= 0 && z <= 6 && 6 >= y - 0.8 && 0 <= y + 0.05;
const judge = (meshes) => judgeSlabs(meshes, { footprint, groundAt, supportAt });

// a room's ceiling inside the walls, dark: no finding (and listed as dark only when it is flagged)
{
  const r = judge([mesh('fx-structure-room-wood', quad([0.5, 3, 0.5], [9.5, 3, 0.5], [9.5, 3, 5.5], [0.5, 3, 5.5]), { color: [0.05, 0.05, 0.05] })]);
  assert.equal(r.findings.length, 0, `a ceiling inside the walls passes (${JSON.stringify(r.findings.map((f) => f.reasons))})`);
}
// the same ceiling 4 m past the east wall, 3 m up: outside
{
  const r = judge([mesh('fx-structure-room-wood', quad([0.5, 3, 0.5], [14, 3, 0.5], [14, 3, 5.5], [0.5, 3, 5.5]), { color: [0.05, 0.05, 0.05] })]);
  assert.equal(r.findings.length, 1, 'a ceiling past the walls is flagged');
  assert.ok(r.findings[0].reasons.some((s) => s.startsWith('outside')) && r.findings[0].orientation === 'horizontal', r.findings[0].reasons.join('; '));
  assert.ok(r.findings[0].attributes.some((s) => s.startsWith('dark')), 'it is listed as dark');
}
// a wall panel standing in the open 3 m past the walls (a room's wall at the anatomy's box, not the building's)
{
  const r = judge([mesh('fx-structure-room-plaster', quad([13, 0, 0.5], [13, 0, 5.5], [13, 2.9, 5.5], [13, 2.9, 0.5]))]);
  assert.equal(r.findings.length, 1, 'a panel standing past the walls is flagged');
  assert.equal(r.findings[0].orientation, 'vertical');
}
// a fallen panel lying flat on the ground past the walls: debris
{
  const r = judge([mesh('fx-collapse-wall-0-3.0', box(12, 0, 0, 16, 0.3, 3))]);
  assert.equal(r.findings.length, 0, `a panel lying on the ground passes (${JSON.stringify(r.findings.map((f) => f.reasons))})`);
}
// a plate in the air over the building's middle with nothing under it: floating
{
  const r = judge([mesh('fx-collapse-floor-0-1.0', box(1, 9, 1, 9, 9.2, 5))]);
  assert.equal(r.findings.length, 1, 'a plate in the air is flagged');
  assert.ok(r.findings[0].reasons.some((s) => s.startsWith('floating')), r.findings[0].reasons.join('; '));
}
// a closed block is no slab; a thin long box is
assert.ok(!isSlab(shapeOf(Float32Array.from(box(0, 0, 0, 2, 2, 2)))), 'a 2 m block is no slab');
assert.ok(isSlab(shapeOf(Float32Array.from(box(0, 0, 0, 28, 0.22, 16.8)))), 'a 28 x 16.8 x 0.22 m floor is a slab');
// a rotated slab's extents follow its sides (the moments, not its vertices' spread)
{
  const m = new THREE.Matrix4().makeRotationY(0.6);
  const t = Float32Array.from(box(0, 0, 0, 12, 0.2, 4));
  const v = new THREE.Vector3();
  for (let i = 0; i < t.length; i += 3) { v.set(t[i], t[i + 1], t[i + 2]).applyMatrix4(m); t[i] = v.x; t[i + 1] = v.y; t[i + 2] = v.z; }
  const s = shapeOf(t);
  assert.ok(Math.abs(s.ext[0] - 12) < 0.05 && Math.abs(s.ext[1] - 4) < 0.05 && Math.abs(s.ext[2] - 0.2) < 0.02, `rotated extents ${s.ext}`);
}
// matrices: identity fine; flattened, singular and NaN caught
assert.equal(matrixTrouble(new THREE.Matrix4().elements), null);
assert.match(matrixTrouble(new THREE.Matrix4().makeScale(1, 0.001, 1).elements), /flattened/);
assert.match(matrixTrouble(new THREE.Matrix4().set(NaN, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).elements), /not finite/);
{
  const r = judge([mesh('fx-fracture-body-0', box(2, 0, 2, 3, 1, 3), { troubles: ['instance 0 flattened (axes 1.000, 0.001, 1.000)'] })]);
  assert.ok(r.findings.length === 1 && r.findings[0].reasons[0].startsWith('degenerate'), 'a degenerate matrix is flagged');
}

// (2026-10-17 continuation, the owner's frame on a roofed building) a fallen roof's slab lying flat across the wall heads
// with its overhang past the walls is flagged `on the wall heads` once it is at rest; one lying flat on the top floor
// inside the walls is listed, not flagged; one still falling (not settled, not rested) is not judged yet
{
  const slab = (x0, y, x1) => mesh('fx-collapse-roof-0-1.0', box(x0, y, 1, x1, y + 0.18, 5));
  const over = judgeSlabs([slab(6, 6, 11.5)], { footprint, groundAt, supportAt, settled: true });
  assert.ok(over.findings.length === 1 && over.findings[0].reasons.some((r) => r.startsWith('on the wall heads')),
    `a roof slab flat on the wall heads past the walls is flagged (${JSON.stringify(over.findings.map((f) => f.reasons))})`);
  const inside = judgeSlabs([slab(1, 3, 9)], { footprint, groundAt, supportAt, settled: true });
  assert.equal(inside.findings.length, 0, `a roof slab flat on the top floor inside the walls passes (${JSON.stringify(inside.findings.map((f) => f.reasons))})`);
  const falling = judgeSlabs([slab(6, 6, 11.5)], { footprint, groundAt, supportAt, settled: false, rested: () => false });
  assert.equal(falling.findings.length, 0, 'a roof slab still falling is judged where it comes to rest');
  const rested = judgeSlabs([slab(6, 6, 11.5)], { footprint, groundAt, supportAt, settled: false, rested: () => true });
  assert.ok(rested.findings.length === 1 && rested.findings[0].attributes.includes('a fallen roof slab at rest'), 'a roof slab at rest is judged where it lies');
}
// a plate 4 m up reaching 2.5 m past the walls over the building's 3 m ground plinth: past the walls' plan at height
// (the plinth is in the whole plan, not in the plan at height)
{
  const plinth = Float32Array.from(quad([-3, 0.1, -3], [13, 0.1, -3], [13, 0.1, 9], [-3, 0.1, 9]));
  const whole = footprintOf([...intact, plinth]), atHeight = footprintOf(intact);
  const plate = [mesh('fx-structure-room-wood', quad([0.5, 4, 0.5], [12.5, 4, 0.5], [12.5, 4, 5.5], [0.5, 4, 5.5]))];
  assert.equal(judgeSlabs(plate, { footprint: whole, groundAt, supportAt }).findings.length, 0, 'over the plinth the whole plan holds it');
  const r = judgeSlabs(plate, { footprint: whole, upperFootprint: atHeight, groundAt, supportAt });
  assert.ok(r.findings.length === 1 && r.findings[0].reasons.some((x) => x.includes('plan at height')), `the plan at height flags it (${JSON.stringify(r.findings.map((f) => f.reasons))})`);
}

if (process.argv.includes('--church')) {
  const { runSlabCheck } = await import('./destruction-slab-check.mjs');
  const report = await runSlabCheck({ mapId: 'verdant', ids: [9], rounds: 40, storeys: [0, 1] });
  const row = report.rows[0];
  assert.equal(row?.builder, 'church', 'structure 9 is Verdant\'s church');
  assert.ok(!row.pass, 'the church\'s damage is flagged');
  const ceilings = row.worst.filter((f) => /^fx-structure-room-/.test(f.mesh) && f.orientation === 'horizontal' && f.reasons.some((s) => s.startsWith('outside')));
  assert.ok(ceilings.length >= 1, `a room ceiling past the church's walls (${JSON.stringify(row.worst.map((f) => [f.mesh, f.orientation, f.reasons]))})`);
  console.log(`destruction-slab-check selftest --church: #9 church flagged (${row.snapshots.filter((p) => p.findings.length).length} snapshots; worst ${row.worst[0].mesh} ${row.worst[0].extentsM.join(' x ')} m) — ok`);
}
console.log('destruction-slab-check selftest: inside ceiling passes; outside ceiling, standing panel, floating plate, degenerate matrix flagged; lying debris and blocks pass; roof slab on the wall heads flagged at rest, inside the walls passes; plan at height past a plinth — ok');
