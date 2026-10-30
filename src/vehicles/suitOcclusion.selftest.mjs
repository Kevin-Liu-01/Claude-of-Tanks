// The suit's shade on the armour under it (264; Main's ruling on the 263 critic's "no shadow under any laid net"):
// suitOcclusion.ts seeds the attribute on every vehicle-material draw of a suited build (one vertex layout per owner and
// material), shades the armour under the net and leaves it 0 past the net's soft edge, on the far side of a plate and
// on a geometry drawn twice; a build without a suit is untouched; every vehicle material reads 0 without the attribute.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bakeSuitOcclusionSteps } from './suitOcclusion.ts';
import { registerVehicleMaterial, VEHICLE_SUIT_OCCLUSION_ATTRIBUTE, withSuitShadeDefault } from './materials.ts';

const drain = (steps) => { let next = steps.next(); while (!next.done) next = steps.next(); return next.value; };
/** A flat plate facing up at height y, `n` x `n` quads over [-half, half]. */
function plate(half, n, y) {
  const geometry = new THREE.PlaneGeometry(half * 2, half * 2, n, n).rotateX(-Math.PI / 2).translate(0, y, 0);
  return geometry;
}
const paint = registerVehicleMaterial(null, new THREE.MeshStandardMaterial(), 'suit-occlusion-receipt');
const shadeAt = (mesh, x, z) => {
  const pos = mesh.geometry.getAttribute('position'), shade = mesh.geometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i) - x, pos.getZ(i) - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return shade.getX(best);
};

// a deck 3 m square with a net laid 2 cm over its left half; a second deck shares one geometry twice; a turret plate
// rides its own group with no suit of its own
{
  const root = new THREE.Group(), hull = new THREE.Group(), turret = new THREE.Group();
  root.add(hull, turret);
  const deck = new THREE.Mesh(plate(1.5, 30, 1), paint);
  deck.name = 'hull_deck';
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3, 15, 30).rotateX(-Math.PI / 2).translate(-0.75, 1.02, 0), paint);
  net.name = 'receipt_ghillie_hull_net';
  const twinGeometry = plate(0.3, 4, 1);
  const twinA = new THREE.Mesh(twinGeometry, paint), twinB = new THREE.Mesh(twinGeometry, paint);
  twinA.position.set(-0.75, 0, 0.5); twinB.position.set(-0.75, 0, -0.5);
  const roof = new THREE.Mesh(plate(0.6, 6, 1.8), paint);
  roof.name = 'turret_roof';
  hull.add(deck, net, twinA, twinB);
  turret.add(roof);
  const stats = drain(bakeSuitOcclusionSteps(root, [turret]));
  assert.ok(stats && stats.draws >= 4, 'a suited build seeds its vehicle draws');
  for (const mesh of [deck, net, twinA, roof]) {
    const shade = mesh.geometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE);
    assert.ok(shade && shade.normalized && shade.array instanceof Uint8Array, `${mesh.name || 'twin'} carries the Uint8 attribute`);
  }
  assert.ok(shadeAt(deck, -0.75, 0) > 0.6, `the deck under the net's middle is shaded (${shadeAt(deck, -0.75, 0).toFixed(2)})`);
  assert.equal(shadeAt(deck, 1.2, 0), 0, 'the deck well past the net\'s edge is not');
  const edge = shadeAt(deck, 0.05, 0), inside = shadeAt(deck, -0.3, 0);
  assert.ok(edge > 0 && edge < inside, `the shade falls off softly across the net's edge (${edge.toFixed(2)} < ${inside.toFixed(2)})`);
  assert.ok([...twinGeometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE).array].every((v) => v === 0), 'a geometry drawn twice keeps zeros');
  assert.ok([...roof.geometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE).array].every((v) => v === 0),
    'the turret reads only its own suit (none here): the hull net never shades it');
  assert.ok([...net.geometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE).array].every((v) => v === 0), 'the suit does not shade itself');
  // a plate facing away from the net (its underside) is not shaded by it
  const under = new THREE.Mesh(plate(1.5, 10, 0.98).rotateX(Math.PI), paint);
  hull.add(under);
  under.geometry.deleteAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE);
  drain(bakeSuitOcclusionSteps(root, [turret]));
  assert.ok([...under.geometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE).array].every((v) => v === 0), 'a face turned away is not shaded');
}

// a build without a suit is untouched; every vehicle material defaults the attribute to 0
{
  const root = new THREE.Group();
  const deck = new THREE.Mesh(plate(1, 4, 1), paint);
  root.add(deck);
  assert.equal(drain(bakeSuitOcclusionSteps(root, [])), null, 'no suit: no bake');
  assert.ok(deck.geometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE) === undefined, 'no suit: no attribute');
  assert.deepEqual(paint.defaultAttributeValues?.[VEHICLE_SUIT_OCCLUSION_ATTRIBUTE], [0], 'a registered vehicle material reads 0 without it');
  const direct = withSuitShadeDefault(new THREE.MeshStandardMaterial());
  assert.deepEqual(direct.defaultAttributeValues?.[VEHICLE_SUIT_OCCLUSION_ATTRIBUTE], [0], 'a material compiling the hook directly too');
}

console.log('suitOcclusion selftest passed');
