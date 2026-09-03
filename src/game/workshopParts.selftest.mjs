import assert from 'node:assert/strict';
import {
  createWorkshopPartLibrary, countWorkshopTriangles, WORKSHOP_FAMILY_PROFILES,
  WORKSHOP_PART_KINDS,
} from './workshopParts.ts';

const library = createWorkshopPartLibrary();
let total = 0;
const families = new Set();
const vehicleIds = new Set();
for (const kind of WORKSHOP_PART_KINDS) {
  const root = library.createAssembly(kind);
  const triangles = countWorkshopTriangles(root);
  assert.ok(triangles > 0, `${kind} must contain visible geometry`);
  assert.ok(triangles < 8_000, `${kind} must remain a low-poly workshop duplicate (${triangles})`);
  assert.equal(root.userData.workshopPart, true);
  assert.ok(root.userData.sourceVehicleId, `${kind} records its fleet inspiration`);
  assert.equal(root.userData.workshopLod, 'authored-family-low');
  if (root.userData.family !== 'support') families.add(root.userData.family);
  vehicleIds.add(root.userData.sourceVehicleId);
  if (root.userData.component === 'complete_vehicle' || root.userData.component === 'turret_and_gun') {
    assert.equal(root.userData.hasGunBore, true, `${kind} must end in a visible cannon bore`);
  }
  assert.equal(root.userData.triangles, triangles);
  total += triangles;
}
assert.ok(total < 35_000, `complete reusable workshop catalog remains bounded (${total})`);
assert.deepEqual([...families].sort(), ['abrams', 'leclerc', 't90']);
assert.ok(['m1a2', 't90m', 'leclerc'].every((id) => vehicleIds.has(id)));
assert.equal(WORKSHOP_FAMILY_PROFILES.abrams.wheels, 7);
assert.equal(WORKSHOP_FAMILY_PROFILES.t90.wheels, 6);
assert.equal(WORKSHOP_FAMILY_PROFILES.leclerc.wheels, 6);
library.dispose();

console.log('workshopParts.selftest: ok');
