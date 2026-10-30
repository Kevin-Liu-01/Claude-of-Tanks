// Interior-fill wreck swap (tank-opt HIDDEN, 2026-10-16; owner 2026-10-15: "inside the tanks where we cant see, we
// dont have unneeded geometry"). An intact rendered tank draws its fills as their boundary surface
// (interiorFillSurface.ts), which has fewer vertices than the closed boxes. A wreck's dents move vertices one at a
// time (materials.ts CRUMPLE_NORMAL_GLSL; the gun's CPU bend), and a large surface face with no vertex inside a dent
// stays flat under the dented plate, so a wreck draws the closed boxes it always drew. This receipt builds a battle
// tank (the player's HIGH build) and proves, on its real factory path:
//   - intact: every fill mesh draws the drawn count the records predict (interiorFillTriangleCounts);
//   - setDestroyed: every surface fill mesh then draws the closed boxes, bit for bit the shipped mesher's (the
//     2026-09-13..10-15 interiorFills.ts, reproduced here) in the rig frame the fill was built in, and the gun's fill is
//     bent from those boxes;
//   - resetDestroyed: every fill mesh holds its own surface geometry again (the same object), the swapped-in boxes
//     disposed; a second kill swaps again;
//   - a geometry-only build (a map hulk's bake, world/wrecks.ts) draws the closed boxes from the start.
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { installCanvasFixture } = await import('./canvasFixture.test-support.mjs');
installCanvasFixture();
const { createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { interiorFillRecord, interiorFillSpans, interiorFillTriangleCounts } = await import('./interiorFills.ts');

const COMPONENTS = ['hull', 'turret', 'gun'];
const RIGS = { hull: 'rig_hull', turret: 'rig_turret', gun: 'rig_gun' };

/** The closed-box mesher as it shipped through 2026-10-15 (interiorFills.ts), positions in the tank frame. */
function closedPositions(record, spans) {
  const faces = [
    [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, -1], [1, 1, 1], [1, -1, 1]],
    [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, 1, -1], [-1, -1, -1]],
    [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [-1, 1, -1], [1, 1, 1], [1, 1, -1]],
    [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, -1], [1, -1, 1]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1]],
  ];
  const count = spans.length / 6, positions = new Float32Array(count * 108);
  let k = 0;
  for (let b = 0; b < count; b++) {
    const [x0, y0, z0, x1, y1, z1] = spans.subarray(6 * b, 6 * b + 6);
    const cx = record.o[0] + ((x0 + x1 + 1) / 2) * record.v, cy = record.o[1] + ((y0 + y1 + 1) / 2) * record.v;
    const cz = record.o[2] + ((z0 + z1 + 1) / 2) * record.v;
    const sx = (x1 - x0 + 1) * record.v, sy = (y1 - y0 + 1) * record.v, sz = (z1 - z0 + 1) * record.v;
    for (const corners of faces) for (const [ux, uy, uz] of corners) {
      positions[k++] = cx + ux * sx / 2; positions[k++] = cy + uy * sy / 2; positions[k++] = cz + uz * sz / 2;
    }
  }
  return positions;
}

const sameBits = (a, b) => {
  if (a.length !== b.length) return false;
  const x = new Uint32Array(a.buffer, a.byteOffset, a.length), y = new Uint32Array(b.buffer, b.byteOffset, b.length);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

// m1a1: hull, turret and gun fills, all three drawn as the surface (264: t72b3's generated record has carried no gun fill
// since 241's exact conforming fills, cff10513dc; the M1A1's three surfaces each draw well under their boxes)
const id = 'm1a1';
await ensureTankBuilder(id);
const record = interiorFillRecord(id);
assert.ok(record, `${id}: fill record resident`);
const visual = createTank(id, null, { camoSeed: 4242, quality: 'high', geometryQuality: 'high', batchStatic: true, battleDetailLod: false, eraVisualBindingReceipt: false });
visual.root.updateMatrixWorld(true);
const fills = {}, intact = {}, closedReference = {};
for (const component of COMPONENTS) {
  const mesh = visual.root.getObjectByName(`${component}InteriorFill`);
  const spans = interiorFillSpans(record, component);
  const counts = interiorFillTriangleCounts(record, component);
  assert.ok(mesh, `${id} ${component}: fill mesh attached as its own draw`);
  assert.ok(counts.drawn < counts.closed, `${id} ${component}: the surface is the cheaper mesh`);
  assert.equal(mesh.geometry.getAttribute('position').count / 3, counts.drawn, `${id} ${component}: intact draws the surface`);
  fills[component] = mesh; intact[component] = mesh.geometry;
  // the boxes in the rig's frame, as applyInteriorFills took them there at build pose (the rigs have not moved yet)
  const rig = visual.root.getObjectByName(RIGS[component]);
  const toRig = new THREE.Matrix4().copy(rig.matrixWorld).invert();
  const reference = new THREE.BufferGeometry();
  reference.setAttribute('position', new THREE.BufferAttribute(closedPositions(record, spans), 3));
  reference.applyMatrix4(toRig);
  closedReference[component] = reference.getAttribute('position').array;
}
const disposed = new Set();
for (let kill = 0; kill < 2; kill++) {
  visual.setDestroyed({ pop: kill === 1 });
  for (const component of COMPONENTS) {
    const geometry = fills[component].geometry;
    assert.ok(geometry !== intact[component], `${id} ${component} kill ${kill}: the wreck swaps the surface out`);
    const positions = geometry.getAttribute('position').array;
    assert.equal(positions.length, closedReference[component].length, `${id} ${component} kill ${kill}: the wreck draws 36 vertices a box`);
    if (component !== 'gun') {
      assert.ok(sameBits(positions, closedReference[component]), `${id} ${component} kill ${kill}: the wreck's boxes are the shipped mesher's, bit for bit`);
      geometry.addEventListener('dispose', () => disposed.add(geometry));
    }
  }
  visual.resetDestroyed();
  for (const component of COMPONENTS) {
    assert.ok(fills[component].geometry === intact[component], `${id} ${component} kill ${kill}: the rematch restores the surface`);
  }
  assert.equal(disposed.size, 2 * (kill + 1), `kill ${kill}: the swapped-in boxes are disposed at the rematch`);
}
visual.dispose();

// the map hulk's build: geometry-only, closed boxes from the start (world/wrecks.ts bakeTankWreck's options)
const hulk = createTank(id, null, { camoSeed: 4000, quality: 'low', geometryQuality: 'low', materialMode: 'geometry-only', eraVisualBindingReceipt: false, proceduralOnly: true });
const hulkFills = COMPONENTS.map((component) => [component, hulk.root.getObjectByName(`${component}InteriorFill`)]);
const hulkGeometry = new Map();
for (const [component, mesh] of hulkFills) {
  assert.equal(mesh.geometry.getAttribute('position').count, 36 * interiorFillSpans(record, component).length / 6, `${id} ${component}: a hulk's build draws closed boxes`);
  hulkGeometry.set(component, mesh.geometry);
}
hulk.setDestroyed({ pop: true, ageS: 1000 });
for (const [component, mesh] of hulkFills) {
  if (component !== 'gun') assert.ok(mesh.geometry === hulkGeometry.get(component), `${id} ${component}: a hulk has nothing to swap`);
}
hulk.dispose();
console.log(`interiorFillWreck selftest PASS (${id}: intact ${COMPONENTS.map((c) => interiorFillTriangleCounts(record, c).drawn).join('/')} surface `
  + `triangles, wrecked ${COMPONENTS.map((c) => interiorFillTriangleCounts(record, c).closed).join('/')} closed-box triangles)`);
