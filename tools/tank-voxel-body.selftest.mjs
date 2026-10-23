// Exact cover above (2026-10-08): deepInterior's roof test, which the interior-fill generator and the watertight gate
// share. A voxel is deep interior only when body geometry roofs its whole footprint, or closes it as a narrow slot.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectTriangles } from './tank-surface-collect.mjs';
import { voxelise, floodExterior, deepInterior } from './tank-voxel-body.mjs';

const V = 0.025;
const plate = ([sx, sy, sz], [x, y, z], name = 'hull') => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial());
  mesh.name = name; mesh.position.set(x, y, z); return mesh;
};
// An open-topped hull tray 0.8 m square and 0.4 m deep (2 cm plates), plus whatever is laid over it.
function tray(...extra) {
  const root = new THREE.Group();
  root.add(plate([0.8, 0.02, 0.8], [0, 0.01, 0]));
  root.add(plate([0.02, 0.4, 0.8], [-0.39, 0.2, 0]), plate([0.02, 0.4, 0.8], [0.39, 0.2, 0]));
  root.add(plate([0.8, 0.4, 0.02], [0, 0.2, -0.39]), plate([0.8, 0.4, 0.02], [0, 0.2, 0.39]));
  for (const part of extra) root.add(part);
  root.updateMatrixWorld(true);
  return root;
}
function measure(root, rule) {
  const { tris, meshes } = collectTriangles(root);
  const grid = voxelise(tris, meshes, { voxel: V });
  if (rule) grid.coverRule = rule; // unset: the rule the generator and the watertight gate use
  const ext = floodExterior(grid), deep = deepInterior(grid);
  const { nx, ny, origin } = grid;
  const leaks = [];
  for (let i = 0; i < deep.length; i++) {
    if (!(deep[i] && ext[i])) continue;
    const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
    leaks.push({ x0: origin[0] + x * V, z0: origin[2] + z * V, y0: origin[1] + y * V });
  }
  let deepCount = 0; for (const d of deep) deepCount += d;
  return { leaks, deepCount };
}

// 1. A 3 mm rail across the open top, over a row of column centres. The voxel scan reads the rail's voxels as a roof
// and the air under it as deep interior that leaks, which the generator would fill: the M3A3 front deck. The
// centre-or-majority rule still keeps the columns whose centre the rail crosses. Exact cover keeps none.
{
  const rail = tray(plate([0.8, 0.02, 0.003], [0, 0.39, 0.0125]));
  assert.ok(measure(rail, 'shell').leaks.length > 0, 'control: the voxel scan fills the open air under a thin rail');
  assert.ok(measure(rail, 'centre').leaks.length > 0, 'control: a rail over the column centres passes the centre rule');
  assert.equal(measure(rail, 'slot').leaks.length, 0, 'a thin rail roofs no column: no fill stands in the open under it');
  assert.equal(measure(rail, 'all').leaks.length, 0);
  assert.equal(measure(rail).leaks.length, 0, 'the shared default is exact cover');
}

// 2. A roof plate whose edge (z = 0.116) crosses a column 64 % of the way along it, and open sky beyond. Columns wholly
// under the plate stay deep and leak (the generator fills them); the column the edge crosses would carry a fill 9 mm
// past the edge under the centre rule, and carries none under exact cover.
{
  const lip = tray(plate([0.8, 0.01, 0.516], [0, 0.395, 0.116 - 0.258]));
  const reach = (rows) => Math.max(...rows.map((r) => r.z0 + V));
  const centre = measure(lip, 'centre').leaks, slot = measure(lip).leaks;
  assert.ok(centre.length > 0 && slot.length > 0, 'the air under the roof plate is deep interior and leaks');
  assert.ok(reach(centre) > 0.116 + 0.005, 'control: the centre rule lets a fill reach past the plate edge');
  assert.ok(reach(slot) <= 0.116 + 1e-9, 'exact cover keeps every fill wholly under the plate');
  assert.ok(Math.min(...slot.map((r) => r.z0)) < -0.3, 'the plate still roofs the air behind its edge');
}

// 3. A louvred grille roof: 1 cm slats, 1 cm gaps. Every gap sample lies in a slot the slats close from both sides, so
// the air under the grille stays deep interior (dark through the louvres); without slots, the gaps would open it.
{
  const slats = []; for (let x = -0.375; x <= 0.375 + 1e-9; x += 0.02) slats.push(plate([0.01, 0.01, 0.8], [x, 0.395, 0]));
  const grille = tray(...slats);
  const shell = measure(grille, 'shell').deepCount, slot = measure(grille).deepCount, all = measure(grille, 'all').deepCount;
  assert.ok(shell > 1000, 'control: the voxel scan reads the grille as a roof');
  assert.ok(slot >= shell * 0.95, `the slot rule keeps the air under a louvred grille deep (${slot} of ${shell})`);
  assert.ok(all < shell * 0.5, `control: without slots the louvre gaps open it (${all} of ${shell})`);
}

console.log('tank-voxel-body: exact cover above drops rail-grazed and edge-straddling air, keeps louvred interiors PASS');
