// The armour skin is the outer surface of a frame's collision cells: shared slice faces go, a step keeps its exposed
// ring, a cell inside another adds nothing, coincident outer faces count once, and the result is closed.
import assert from 'node:assert/strict';
import { armorSkinPanels } from './armorSkin.ts';

const plate = { name: 'p' };
function box(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const vertices = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]];
  const center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const faces = [];
  for (const [a, b, c, d] of quads) {
    for (const indices of [[a, b, c], [a, c, d]]) {
      const [p, q, r] = indices.map((i) => vertices[i]);
      const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const size = Math.hypot(...n);
      const normal = n.map((value) => value / size);
      const outward = normal[0] * (p[0] - center[0]) + normal[1] * (p[1] - center[1]) + normal[2] * (p[2] - center[2]);
      assert.ok(outward > 0, 'box faces wind outward');
      faces.push({ indices, normal, constant: -(normal[0] * p[0] + normal[1] * p[1] + normal[2] * p[2]), plate });
    }
  }
  return { min, max, vertices, faces };
}

function measure(panels) {
  let area = 0;
  const closure = [0, 0, 0];
  for (const panel of panels) for (const piece of panel.pieces) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < piece.length; i++) {
      const a = piece[i], b = piece[(i + 1) % piece.length];
      x += a[1] * b[2] - a[2] * b[1]; y += a[2] * b[0] - a[0] * b[2]; z += a[0] * b[1] - a[1] * b[0];
    }
    const signed = (x * panel.normal[0] + y * panel.normal[1] + z * panel.normal[2]) / 2;
    assert.ok(signed > 0, 'pieces wind counter-clockwise about their outward normal');
    area += signed;
    for (let k = 0; k < 3; k++) closure[k] += signed * panel.normal[k];
  }
  return { area, closure };
}
const near = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const closed = (result, label) => result.closure.forEach((value, axis) => near(value, 0, 1e-6, `${label} closes (axis ${axis})`));

// Two abutting slices of one cross-section: the 2×1×2 box's surface, no shared face.
{
  const result = measure(armorSkinPanels([box([0, 0, 0], [2, 1, 1]), box([0, 0, 1], [2, 1, 2])]));
  near(result.area, 2 * (2 * 1 + 2 * 2 + 1 * 2), 1e-6, 'abutting slices');
  closed(result, 'abutting slices');
}
// A step: a 2×2 slice then a 1×1 slice behind it. The larger slice's rear face keeps its exposed ring (4 − 1 m²).
{
  const result = measure(armorSkinPanels([box([0, 0, 0], [2, 2, 1]), box([0.5, 0.5, 1], [1.5, 1.5, 2])]));
  const expected = (4 + 4 * 2) + 3 + (4 * 1 + 1);
  near(result.area, expected, 1e-6, 'stepped slices');
  closed(result, 'stepped slices');
}
// A structure cell half inside another (a cupola through the roof): its buried walls and floor go.
{
  const result = measure(armorSkinPanels([box([0, 0, 0], [4, 1, 4]), box([1, 0.5, 1], [2, 1.5, 2])]));
  const expected = 2 * (4 * 1 + 4 * 4 + 4 * 1) - 1 + (1 + 4 * 0.5);
  near(result.area, expected, 1e-6, 'buried structure cell');
  closed(result, 'buried structure cell');
}
// Two cells sharing an outer face plane (equal roofs, overlapping in x): the roof is drawn once.
{
  const result = measure(armorSkinPanels([box([0, 0, 0], [2, 1, 1]), box([1, 0, 0], [3, 1, 1])]));
  near(result.area, 2 * (3 * 1 + 3 * 1 + 1 * 1), 1e-6, 'coincident outer faces');
  closed(result, 'coincident outer faces');
}
// One plane and plate: one panel.
{
  const panels = armorSkinPanels([box([0, 0, 0], [2, 1, 1]), box([0, 0, 1], [2, 1, 2])]);
  const top = panels.filter((panel) => panel.normal[1] > 0.99);
  assert.equal(top.length, 1, 'both slices\' roofs make one roof panel');
  assert.equal(armorSkinPanels(undefined).length, 0, 'no cells, no skin');
}

console.log('armorSkin.selftest: union boundary (shared faces, steps, buried cells, coincident faces) is closed and exact');
