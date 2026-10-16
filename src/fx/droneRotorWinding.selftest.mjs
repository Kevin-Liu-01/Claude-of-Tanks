// All four rotors of a flying drone draw lit from the side the camera sees (2026-10-12, the owner: "make sure the
// american drones have all 4 rotors properly there"). poseDroneRotor mirrors the two counter-rotating props with a
// negative x scale; an instanced mesh cannot follow a per-instance negative determinant, so a double-sided material lit
// those two props and discs from behind and they drew near-black against the ground. The flight pools now never carry a
// mirrored instance: counter-rotating blades draw a pre-mirrored geometry with its winding flipped, and the symmetric
// discs take no mirror at all. The drawn props are exactly where the mirrored transform put them.
import assert from 'node:assert/strict';
import { Group, Matrix4, Object3D, Vector3 } from 'three';
import { createDronePresentation } from './dronePresentation.ts';
import { acquireDroneModelKit, droneRotorDirection, mirroredRotorGeometry, poseDroneRotor } from './droneModel.ts';

// 1. The flight pools: a spooling airframe (blades) and one at speed (discs); every rotor instance keeps a positive
//    determinant, and each airframe draws two plain and two counter-rotating blades, or four discs.
{
  const group = new Group(), pool = createDronePresentation(group), m = new Matrix4();
  pool.begin(1, new Vector3(0, 30, 0));
  pool.write(new Vector3(0, 12, 0), new Vector3(0, 0, 0), 1, 0, .45, 'USA');
  pool.write(new Vector3(10, 22, 5), new Vector3(20, 0, 5), 2, 0, 9, 'USA'); // inside the lite distance: the full pools
  pool.end();
  const mesh = (name) => group.children.find((c) => c.name === name);
  const blades = mesh('FPV spinning propellers'), counter = mesh('FPV spinning propellers (counter-rotating)'), discs = mesh('FPV rotor discs');
  assert.ok(blades && counter && discs, 'the plain, counter-rotating and disc pools exist');
  assert.equal(blades.count, 2, 'a spooling airframe draws its two plain blades');
  assert.equal(counter.count, 2, 'and its two counter-rotating blades, pre-mirrored');
  assert.equal(discs.count, 4, 'an airframe at speed draws four discs');
  // round 4b: from FAINT_DISC_S the spooling airframe also draws four faint discs over its blades (symmetric, unmirrored)
  const faint = mesh('FPV fading rotor discs');
  assert.equal(faint?.count, 4, 'the spooling airframe draws four faint discs over its quickening blades');
  for (const pool of [blades, counter, discs, faint]) for (let i = 0; i < pool.count; i++) {
    pool.getMatrixAt(i, m);
    assert.ok(m.determinant() > 0, `${pool.name} #${i}: no mirrored instance transform (a back-lit, near-black rotor)`);
  }
  pool.dispose();
}

// 2. The pre-mirrored counter-rotating prop sits exactly where the mirrored transform put the original prop, and its
//    front faces still face out along its normals (the property the GPU's front-face test relies on).
{
  const lease = acquireDroneModelKit('USA'), rotor = lease.kit.rotor, mirrored = mirroredRotorGeometry(rotor);
  const prop = new Object3D(), a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), face = new Vector3();
  const key = (v) => v.toArray().map((x) => x.toFixed(5)).join(',');
  for (const index of [0, 1, 2, 3]) {
    if (droneRotorDirection(index) > 0) continue;
    poseDroneRotor(prop, index, .7);
    assert.ok(prop.matrix.determinant() < 0, `rotor ${index} counter-rotates through a mirrored pose`);
    const before = [], after = [], pos = rotor.getAttribute('position'), mpos = mirrored.getAttribute('position');
    for (let i = 0; i < pos.count; i++) before.push(key(a.fromBufferAttribute(pos, i).applyMatrix4(prop.matrix)));
    prop.scale.set(1, 1, 1); prop.updateMatrix();
    for (let i = 0; i < mpos.count; i++) after.push(key(a.fromBufferAttribute(mpos, i).applyMatrix4(prop.matrix)));
    assert.deepEqual(after.sort(), before.sort(), `rotor ${index}: the same prop in the same place`);
  }
  // Winding against the stored normals: the share of faces whose winding normal agrees with their vertex normal is the
  // same for the mirrored prop as for the original (an unflipped mirror would invert it).
  const agree = (geometry) => {
    const p = geometry.getAttribute('position'), nr = geometry.getAttribute('normal');
    let yes = 0, all = 0;
    for (let t = 0; t < p.count; t += 3) {
      a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
      face.subVectors(c, b).cross(n.subVectors(a, b)).normalize();
      if (!Number.isFinite(face.x) || face.lengthSq() < .5) continue;
      n.fromBufferAttribute(nr, t).add(a.fromBufferAttribute(nr, t + 1)).add(b.fromBufferAttribute(nr, t + 2));
      all++; if (face.dot(n) < 0) yes++;
    }
    return yes / all;
  };
  const original = agree(rotor), flipped = agree(mirrored);
  assert.ok(Math.abs(original - flipped) < 1e-9, `winding agrees with the normals as on the original (${original.toFixed(3)} vs ${flipped.toFixed(3)})`);
  mirrored.dispose(); lease.release();
}
console.log('droneRotorWinding: every flight-pool rotor instance unmirrored (2 plain + 2 pre-mirrored blades, 4 discs, 4 faint discs); counter-rotating props unchanged in place with outward winding');
