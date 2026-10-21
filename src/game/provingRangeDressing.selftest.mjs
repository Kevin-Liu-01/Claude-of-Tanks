// The proving ground's furniture (game/provingRangeDressing.ts, 2026-10-20): built once a range, every plate standing where
// the simulation's plate stands and facing its way, the range boards and the course's boards, poles and gate, a bounded
// number of draws, every lit material in the cascades and out again, a plate's face redrawn only when its strikes change,
// a new range releasing the last one's faces. Node has no document: the canvases are @napi-rs/canvas.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { Group, Vector3 } from 'three';
import { createProvingRangeDressing } from './provingRangeDressing.ts';
import { planProvingRange } from '../sim/provingGround.ts';
import { PROVING_GROUND_RULES as rules } from '../sim/matchRuleset.ts';
import { provingRangePresentation } from './provingRange.ts';

const priorDocument = globalThis.document;
globalThis.document = { createElement: (tag) => { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
try {
  const flat = { heightAt: () => 0, standable: () => true };
  const layout = planProvingRange(rules, flat);
  const player = { id: 'p', specId: 'p', state: { pos: new Vector3() }, spec: { name: 'P', armor: {}, dims: { heightM: 2 }, gun: { shells: [] } } };
  const rangeOf = () => provingRangePresentation(rules, layout, player, [], () => 0);
  const range = rangeOf();

  const setUp = new Set(), released = new Set();
  const parent = new Group();
  const dressing = createProvingRangeDressing(parent, {
    groundHeight: () => 0,
    setupMaterial: (material) => setUp.add(material),
    releaseMaterial: (material) => released.add(material),
  });
  assert.equal(parent.children.includes(dressing.root), true);
  assert.equal(dressing.root.visible, false, 'nothing shows before a range');
  assert.equal(dressing.root.children.length, 0, 'nothing is built before a range');

  dressing.update(range);
  assert.equal(dressing.root.visible, true);
  const meshes = [];
  dressing.root.traverse((object) => { if (object.isMesh) meshes.push(object); });

  // the plates: one slab each, where the simulation's plate stands, its painted face the simulation's face
  for (const plate of layout.plates) {
    const slab = meshes.find((mesh) => mesh.name === plate.id);
    assert.ok(slab, `${plate.id} stands on the range`);
    const normal = new Vector3(0, 0, 1).applyQuaternion(slab.quaternion);
    assert.ok(normal.distanceTo(new Vector3(plate.nx, plate.ny, plate.nz)) < 1e-6, `${plate.id} faces the simulation's way`);
    const thickness = Math.max(0.03, plate.mm / 1000);
    assert.ok(Math.abs(slab.scale.z - thickness) < 1e-9, `${plate.id} is ${plate.mm} mm thick`);
    // its painted face lies on the simulation's face (the slab behind it)
    const front = slab.position.clone().addScaledVector(normal, thickness / 2);
    assert.ok(front.distanceTo(new Vector3(plate.x, plate.y, plate.z)) < 1e-6, `${plate.id}'s face on the struck plane`);
    assert.equal(slab.material.length, 2, 'a plate draws its edges and its face');
    assert.ok(slab.material[1].map, 'its face carries its painted canvas');
  }
  // the boards and the course
  const named = (name) => meshes.find((mesh) => mesh.name === name);
  for (const name of ['range-plate-frames', 'range-board-posts', 'range-course-poles', 'range-course-caps']) {
    assert.ok(named(name)?.isInstancedMesh && named(name).count > 0, `${name}: one instanced mesh`);
  }
  const panels = meshes.filter((mesh) => !mesh.isInstancedMesh && !mesh.name.startsWith('range-plate-'));
  let boardsDown = 0;
  for (let along = 100; along <= 800; along += 100) {
    const x = layout.origin.x + Math.sin(layout.origin.yaw) * along, z = layout.origin.z + Math.cos(layout.origin.yaw) * along;
    if (Math.abs(x) > 500 || Math.abs(z) > 500) break;
    boardsDown++;
  }
  assert.equal(boardsDown, 8, 'the range runs 800 m inside the battlefield');
  assert.equal(panels.length, boardsDown + rules.course.features.length, 'a board every 100 m and one a course feature');
  // the draw budget: a two-group panel or slab is two draws, an instanced mesh one
  const draws = meshes.reduce((sum, mesh) => sum + (Array.isArray(mesh.material) ? mesh.geometry.groups.length : 1), 0);
  assert.ok(draws <= 2 * (layout.plates.length + panels.length) + 4, `the furniture draws in ${draws} calls`);
  assert.ok(draws <= 50, `at most 50 draws (${draws})`);
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) assert.ok(setUp.has(material), `${mesh.name || 'a board'}: every lit material joins the cascades`);
  }

  // a strike redraws its plate's face, once; a steady frame redraws nothing
  const slab = named(layout.plates[2].id);
  const texture = slab.material[1].map;
  const before = texture.version;
  dressing.update(range);
  assert.equal(texture.version, before, 'a steady frame redraws nothing');
  range.plates[2].strikes.push({ u: 0.1, v: -0.2, kind: 'pen' });
  range.lastShot = { serial: 1, kind: 'pen', targetId: layout.plates[2].id, targetName: '', shellName: '', rangeM: 95,
    penRollMm: 700, effectiveMm: 200, impactAngleDeg: 2, damage: 0 };
  dressing.update(range);
  assert.ok(texture.version > before, 'the struck plate is repainted');
  const after = texture.version;
  const other = named(layout.plates[0].id).material[1].map.version;
  dressing.update(range);
  assert.equal(texture.version, after, 'and only once');
  assert.equal(named(layout.plates[0].id).material[1].map.version, other, 'its neighbours are not');
  range.plates[2].strikes.length = 0; range.lastShot = null;
  dressing.update(range);
  assert.ok(texture.version > after, 'a reset repaints it clean');

  // hidden without a range; a new range rebuilds and lets the last one's faces go
  dressing.update(null);
  assert.equal(dressing.root.visible, false);
  const firstFaces = slab.material[1];
  dressing.update(rangeOf());
  assert.equal(dressing.root.visible, true);
  assert.ok(released.has(firstFaces), 'the last range\'s faces leave the cascades');
  dressing.dispose();
  assert.equal(parent.children.includes(dressing.root), false);
  for (const material of setUp) assert.ok(released.has(material), 'every lit material leaves the cascades with the dressing');
  console.log(`provingRangeDressing.selftest: ${layout.plates.length} plates on the simulation's faces, ${panels.length} boards, the course's poles and gate in ${draws} draws, every lit material in and out of the cascades, a strike repaints its plate once`);
} finally {
  globalThis.document = priorDocument;
}
