import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { roadWheelAxialExtents } from './wheel-axial-extents.mjs';

const root = new Group(), chassis = new Group();
root.position.set(10, 20, -4);
root.rotation.set(.2, .7, .1);
root.scale.set(1.2, .8, 1.1);
chassis.scale.set(.95, 1, .976);
root.add(chassis);
const resources = [];
function layer(name, side, back, front, role, dynamic = true) {
  const geometry = new BoxGeometry(front - back, .4, .4).translate((front + back) / 2, 0, 0);
  if (side < 0) geometry.rotateY(Math.PI);
  const material = new MeshBasicMaterial();
  material.userData.appearanceRole = role;
  const mesh = new InstancedMesh(geometry, material, 1);
  mesh.name = name;
  mesh.userData.dynamicWheelFace = dynamic;
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(side, .4, 0));
  chassis.add(mesh);
  resources.push(mesh, geometry, material);
  return mesh;
}
const leftRubber = layer('leftRubberExtension', -1, -.07, .18, 'wheelTire');
layer('rightRubberExtension', 1, -.07, .18, 'wheelTire');
const leftSteel = layer('leftSteel', -1, -.3, .2, 'wheelDish');
layer('rightSteel', 1, -.3, .2, 'wheelDish');
for (const side of [-1, 1]) layer('gearRoadWheelTires', side, -.05, .05, 'wheelTire', false);
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} vs ${b}`);
try {
  const rows = roadWheelAxialExtents(root);
  for (const row of rows) {
    close(row.tireFaceM, 1.18 * 1.2 * .95, 'complete rubber stock, with root and chassis scale');
    close(row.dressingFaceM, 1.2 * 1.2 * .95, 'outboard steel face, not the long inboard axle');
    close(row.proudM, .02 * 1.2 * .95, 'signed protrusion in metres');
  }
  chassis.remove(leftRubber);
  const missing = roadWheelAxialExtents(root);
  assert.ok(missing[0].proudM > .17, 'missing left tire extension cannot borrow the right-side tire');
  close(missing[1].proudM, rows[1].proudM, 'right-side result remains unchanged');
  chassis.add(leftRubber);
  leftSteel.position.x -= .05;
  close(roadWheelAxialExtents(root)[0].proudM, .07 * 1.2 * .95,
    'a genuinely displaced left wheel face is detected through the full transform');
  leftSteel.position.x = 0;
  assert.deepEqual(roadWheelAxialExtents(root), rows, 'restoring the layer restores the measurement');
} finally {
  for (const resource of resources) resource.dispose();
}
const failedBuild = spawnSync(process.execPath,
  [fileURLToPath(new URL('./wheel-review.mjs', import.meta.url)), '--ids=__missing_wheel_fixture__', '--gate'],
  { encoding: 'utf8', cwd: fileURLToPath(new URL('../', import.meta.url)) });
assert.equal(failedBuild.status, 1, 'the audit cannot pass when a requested tank fails to build');
assert.match(failedBuild.stdout, /BUILD FAILED.*Unknown tank id/);
console.log('wheel-axial-extents: asymmetric stock, both sides, tire extensions, nested scale, rotated frame and failed-build gate pass');
