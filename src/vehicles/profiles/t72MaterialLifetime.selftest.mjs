import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const options = { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true };
const first = createTank('t72b3m', null, options);
const sibling = createTank('t72b3m', null, options);
function capture(tank) {
  const names = ['turretRingGapShadowBand', 'gunDark', 'gunMountDark'];
  const meshes = names.map(name => {
    const mesh = tank.root.getObjectByName(name);
    assert.ok(mesh?.isMesh, `actual ${name} owner is present`);
    return mesh;
  });
  const materials = meshes.map(mesh => mesh.material);
  assert.equal(new Set(materials).size, 3, 'three independent authored finishes');
  const geometry = meshes[0].geometry;
  const disposed = new Map([...materials, geometry].map(resource => [resource, 0]));
  for (const resource of disposed.keys()) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  return { meshes, materials, geometry, disposed };
}
const a = capture(first), b = capture(sibling);
for (const material of a.materials) assert.ok(!b.materials.includes(material));
assert.notEqual(a.geometry, b.geometry);
first.setDestroyed({ pop: false, ageS: 3 });
first.resetDestroyed();
first.resetForGaragePresentation();
assert.deepEqual(a.meshes.map(mesh => mesh.material), a.materials, 'reset retains exact original finish owners');
assert.ok([...a.disposed.values()].every(count => count === 0), 'wreck/reset does not prematurely dispose live finishes');
first.dispose();
assert.ok([...a.disposed.values()].every(count => count === 1), 'all three private materials and ring geometry dispose exactly once');
assert.ok([...b.disposed.values()].every(count => count === 0), 'first disposal leaves every sibling resource alive');
sibling.setDestroyed({ pop: true, ageS: 2 });
sibling.resetDestroyed();
assert.deepEqual(b.meshes.map(mesh => mesh.material), b.materials, 'surviving sibling still resets to its own exact materials');
sibling.dispose();
assert.ok([...b.disposed.values()].every(count => count === 1));
console.log('t72MaterialLifetime.selftest: actual private finish and ring owners survive wreck/reset and dispose once without affecting sibling');
