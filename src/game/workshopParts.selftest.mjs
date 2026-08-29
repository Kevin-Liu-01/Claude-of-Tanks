import assert from 'node:assert/strict';
import { createWorkshopPartLibrary, countWorkshopTriangles, WORKSHOP_PART_KINDS } from './workshopParts.js';

const library = createWorkshopPartLibrary();
let total = 0;
for (const kind of WORKSHOP_PART_KINDS) {
  const root = library.createAssembly(kind);
  const triangles = countWorkshopTriangles(root);
  assert.ok(triangles > 0, `${kind} must contain visible geometry`);
  assert.ok(triangles < 8_000, `${kind} must remain a low-poly workshop duplicate (${triangles})`);
  assert.equal(root.userData.workshopPart, true);
  assert.ok(root.userData.sourceVehicleId, `${kind} records its fleet inspiration`);
  assert.equal(root.userData.triangles, triangles);
  total += triangles;
}
assert.ok(total < 35_000, `complete reusable workshop catalog remains bounded (${total})`);
library.dispose();

console.log('workshopParts.selftest: ok');
