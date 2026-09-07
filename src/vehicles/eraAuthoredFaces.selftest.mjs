import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { authoredEraSurfaces } from './eraAuthoredFaces.ts';
import { xform } from './factoryGeometry.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';
import { getSpec } from './specs.ts';
import './tankFactory.ts';

function trapezoid() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -1, 0, 1, 1, 0, 1, .7, 0, -1, -.7, 0, -1,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

const legacy = trapezoid();
assert.equal(authoredEraSurfaces(legacy), null, 'unannotated legacy fitter stays selected');
legacy.userData.eraHitFaceVertexStarts = [];
assert.deepEqual(authoredEraSurfaces(legacy), [], 'furniture is not protective surface');
legacy.dispose();

for (const indexed of [true, false]) {
  let geometry = trapezoid();
  if (!indexed) {
    const original = geometry;
    geometry = original.toNonIndexed();
    original.dispose();
  }
  geometry.userData.eraHitFaceVertexStarts = [0, 3];
  const before = authoredEraSurfaces(geometry);
  assert.equal(before.length, 2, 'both adjacent exact facets survive');
  for (const face of before) assert.deepEqual(face[2], face[3], 'triangle-compatible fourth corner');
  xform(geometry, 2, 3, 4, .2, -.4, .3, [1.2, .8, 1.1]);
  const after = authoredEraSurfaces(geometry);
  for (let face = 0; face < 2; face++) for (let corner = 0; corner < 3; corner++) {
    const draw = face * 3 + corner;
    const index = geometry.index ? geometry.index.getX(draw) : draw;
    const point = new Vector3().fromBufferAttribute(geometry.getAttribute('position'), index);
    assert.deepEqual(after[face][corner], point.toArray(), 'face follows actual transformed vertex');
  }
  geometry.dispose();
}

for (const bad of ['0', [-3], [1], [6], [.5], [NaN], [0, 0]]) {
  const geometry = trapezoid();
  geometry.userData.eraHitFaceVertexStarts = bad;
  assert.throws(() => authoredEraSurfaces(geometry), 'malformed or absent triangles fail closed');
  geometry.dispose();
}
for (const invalid of ['index', 'position', 'degenerate', 'hidden']) {
  const geometry = trapezoid();
  geometry.userData.eraHitFaceVertexStarts = [0];
  if (invalid === 'index') geometry.index.setX(1, 999);
  if (invalid === 'position') geometry.getAttribute('position').setX(0, Infinity);
  if (invalid === 'degenerate') geometry.index.setX(1, 0);
  if (invalid === 'hidden') geometry.setDrawRange(3, 3);
  assert.throws(() => authoredEraSurfaces(geometry), `${invalid} selected geometry fails closed`);
  geometry.dispose();
}

// Use the real authoritative quad tracer: exact triangular ERA covers do not
// protect the empty corners of their former rectangular approximation.
const geometry = trapezoid();
geometry.userData.eraHitFaceVertexStarts = [0, 3];
const plates = authoredEraSurfaces(geometry).map(verts => ({
  name: 'exact-trapezoid', kind: 'era', verts, mm: 20,
  era: { keReduction: .8, ceFlatMm: 200 },
}));
const armor = { ...getSpec('m1a2').armor, hullPlates: plates, turretPlates: [] };
const pose = tankPoseFromState({ pos: new Vector3(), yaw: 0, visualPitch: 0,
  visualRoll: 0, turretYaw: 0, gunPitch: 0 });
function covered(x, z, spent = new Set()) {
  return traceTank(new Vector3(x, .5, z), new Vector3(x, -.5, z), pose, armor, spent)
    .some(hit => hit.kind === 'plate' && plates.includes(hit.plate));
}
assert.ok(covered(0, 0) && covered(.8, .5), 'actual positive cover is hittable');
assert.equal(covered(.94, -.8), false, 'right missing trapezoid corner remains air');
assert.equal(covered(-.94, -.8), false, 'left missing trapezoid corner remains air');
assert.equal(covered(0, 0, new Set(['exact-trapezoid'])), false, 'spent exact facets leave collision');
geometry.dispose();
console.log('eraAuthoredFaces: exact transformed indexed/nonindexed facets, invalid-index rejection, real hits, empty corners and spent state pass');
