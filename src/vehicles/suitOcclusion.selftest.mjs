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
  // (r6; the critic r5's "bare sponson strip darkened with no net over it") the deck within the kernel's reach of the
  // net, but with no cloth over it, is not shaded either
  assert.equal(shadeAt(deck, 0.2, 0), 0, 'the bare deck 20 cm past the net\'s edge is not shaded');
  // (r7) the vertex on the net's edge belongs to triangles with a bare corner: the shade ends inside the edge, softly
  const rim = shadeAt(deck, 0.0, 0), edge = shadeAt(deck, -0.1, 0), inside = shadeAt(deck, -0.5, 0);
  assert.equal(rim, 0, 'the deck at the net\'s edge itself is not shaded');
  assert.ok(edge > 0 && edge < inside, `the shade falls off softly inside the net's edge (${edge.toFixed(2)} < ${inside.toFixed(2)})`);
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

// (r7; the critic r6's "shade on the bare sponson ledge": one long triangle whose two far corners lay under cloth) a
// coarse panel the cloth reaches at two corners takes no shade at all
{
  const root = new THREE.Group();
  const ledge = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 1, -1.4, 0.3, 1, 1.4, -0.5, 1, 1.4], 3));
  ledge.computeVertexNormals();
  if (ledge.getAttribute('normal').getY(0) < 0) ledge.setIndex([0, 2, 1]);
  ledge.computeVertexNormals();
  const panel = new THREE.Mesh(ledge, paint);
  // cloth over the two corners at z +1.4 only
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4, 12, 4).rotateX(-Math.PI / 2).translate(-0.1, 1.02, 1.4), paint);
  net.name = 'receipt_ghillie_hull_net';
  root.add(panel, net);
  drain(bakeSuitOcclusionSteps(root, []));
  assert.ok([...ledge.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE).array].every((v) => v === 0),
    'a panel whose corner lies bare takes no shade across it');
}

// (round 3) a fitted cover's shade is its own cloth's: the plate 20 cm past its edge is untouched, where a net's reaches
{
  const root = new THREE.Group();
  const deck = new THREE.Mesh(plate(1.5, 30, 1), paint);
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3, 15, 30).rotateX(-Math.PI / 2).translate(-0.75, 1.007, 0), paint);
  cover.name = 'receipt_ghillie_hull_net';
  cover.userData.fittedCover = true;
  root.add(deck, cover);
  drain(bakeSuitOcclusionSteps(root, []));
  assert.ok(shadeAt(deck, -0.75, 0) > 0.6, 'the plate under a fitted cover is shaded');
  assert.equal(shadeAt(deck, 0.2, 0), 0, 'and 20 cm past its edge it is not');
}

// (r6) a net's shade is its garnish's: where its map draws the cloth (the bunches) the plate under it is shaded deeper
// than under the open cord, and the open cord's plate still takes some (the gate is the cloth's, not the garnish's)
{
  const root = new THREE.Group();
  const deck = new THREE.Mesh(plate(1.5, 30, 1), paint);
  const S = 64, data = new Uint8Array(S * S * 4);
  // the map's left half drawn (alpha 255), its right half open cord (a drawn cord every fourth texel row and column)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) data[(y * S + x) * 4 + 3] = x < S / 2 || x % 4 === 0 || y % 4 === 0 ? 255 : 0;
  const map = new THREE.Texture({ data, width: S, height: S });
  const netPaint = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5 });
  // one tile over the whole deck: u runs along x
  const net = new THREE.Mesh(new THREE.PlaneGeometry(3, 3, 30, 30).rotateX(-Math.PI / 2).translate(0, 1.02, 0), netPaint);
  net.name = 'receipt_ghillie_hull_net';
  root.add(deck, net);
  drain(bakeSuitOcclusionSteps(root, []));
  const bunch = shadeAt(deck, -0.75, 0), open = shadeAt(deck, 0.75, 0);
  assert.ok(bunch > open && open > 0, `under the garnish deeper than under the open cord, which is still shaded (${bunch.toFixed(2)} > ${open.toFixed(2)})`);
}

// a build without a suit is untouched; every vehicle material defaults the attribute to 0
{
  const root = new THREE.Group();
  const deck = new THREE.Mesh(plate(1, 4, 1), paint);
  root.add(deck);
  assert.equal(drain(bakeSuitOcclusionSteps(root, [])), null, 'no suit: no bake');
  assert.equal(deck.geometry.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE), undefined, 'no suit: no attribute');
  assert.deepEqual(paint.defaultAttributeValues?.[VEHICLE_SUIT_OCCLUSION_ATTRIBUTE], [0], 'a registered vehicle material reads 0 without it');
  const direct = withSuitShadeDefault(new THREE.MeshStandardMaterial());
  assert.deepEqual(direct.defaultAttributeValues?.[VEHICLE_SUIT_OCCLUSION_ATTRIBUTE], [0], 'a material compiling the hook directly too');
}

console.log('suitOcclusion selftest passed');
