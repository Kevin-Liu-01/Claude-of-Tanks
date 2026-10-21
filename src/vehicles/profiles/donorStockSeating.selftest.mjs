// Release 227 (CN critic round 5, the census of the fleet donors): every census part of the fleet Type 96B and ZTZ-99A2
// joins its owner (turret, gun, hull) by a chain of box contacts (2 mm), the census cnAddOns.selftest.mjs holds for the
// CN turrets. Before the fix the 96B's gunner's sight housing stood 59-71 mm over its roof, its driver's three
// periscopes 108-117 mm over the hull roof (under the mantlet boot), its hatch lid 9-65 mm over the falling roof (a
// lid whose box meets the hull's box, so only the ray check below sees it), and the 99A2's rear deck louvres 5-17 mm
// over its falling deck. Each seat is measured against the actual shell by rays, each AABB negative control (the seat
// removed, or the louvres back at their level heights) must stand apart, and the gun's triangles keep 15 mm off the
// periscope row through its whole pitch range.
// The louvre field is the A2 hull's (buildZTZ99A2Hull), so its follow-up seats it on the VT-4A1 and the ZTZ-99A2
// Prototype too, and clears the prototype turret's own floaters: its race ring 15 mm under the shell, two seam bars left
// inside the moving mantlet when the beak walls were cut back for the gun channel, the rear slab's drip rails (9 and 10
// mm off it) and its eight fasteners (19-48 mm off anything). Mounted fittings join the census with their boxes: the
// prototype's rear panniers and tray case rest on its stowage rack, which no part census records.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const owner = (bucket) => (bucket.startsWith('turret') ? 'turret' : bucket.startsWith('gun') ? 'gun' : 'hull');
const label = (p) => `${p.bucket}[${p.box.min.toArray().map((v) => v.toFixed(3))}..${p.box.max.toArray().map((v) => v.toFixed(3))}]`;

function build(id, quality) {
  const parts = [];
  const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242,
    partCensus(bucket, g) {
      g.computeBoundingBox();
      parts.push({ bucket, box: g.boundingBox.clone(), pos: Float32Array.from(g.getAttribute('position').array) });
    } });
  tank.root.updateMatrixWorld(true);
  // mounted fittings (every mesh under a fitting_* group) as parts of their owner, boxed in its frame
  for (const [rigName, skip, prefix] of [['rig_hull', 'rig_turret', 'hullFitting'], ['rig_turret', 'rig_gun', 'turretFitting']]) {
    const rig = tank.root.getObjectByName(rigName), excluded = tank.root.getObjectByName(skip), toRig = rig.matrixWorld.clone().invert();
    rig.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh) return;
      let fitting = false;
      for (let q = m; q && q !== rig; q = q.parent) { if (q === excluded) return; if (/^fitting_/.test(q.name)) fitting = true; }
      if (!fitting) return;
      const box = new THREE.Box3().setFromBufferAttribute(m.geometry.getAttribute('position')).applyMatrix4(toRig.clone().multiply(m.matrixWorld));
      parts.push({ bucket: `${prefix}:${m.name}`, box, pos: null });
    });
  }
  return { tank, parts };
}

/** Parts outside the largest chain of box contacts (each box grown 2 mm). */
function apartOf(P) {
  const lead = P.map((_, i) => i), find = (i) => { while (lead[i] !== i) i = lead[i] = lead[lead[i]]; return i; };
  const grown = P.map((p) => p.box.clone().expandByScalar(.002));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (grown[i].intersectsBox(grown[j])) lead[find(i)] = find(j);
  const size = new Map(); for (let i = 0; i < P.length; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  const main = [...size].sort((a, b) => b[1] - a[1])[0][0];
  return P.filter((_, i) => find(i) !== main);
}

const vertices = (p) => { const out = []; for (let i = 0; i < p.pos.length; i += 3) out.push(new THREE.Vector3(p.pos[i], p.pos[i + 1], p.pos[i + 2])); return out; };
const near = (a, b, tol = .001) => Math.abs(a - b) <= tol;
const sized = (p, [x, y, z], tol = .002) => { const s = p.box.getSize(new THREE.Vector3()); return near(s.x, x, tol) && near(s.y, y, tol) && near(s.z, z, tol); };
const insideFootprint = (inner, outer) => inner.box.min.x >= outer.box.min.x && inner.box.max.x <= outer.box.max.x
  && inner.box.min.z >= outer.box.min.z && inner.box.max.z <= outer.box.max.z;

/** The owner's shell mesh (the bucket named after the owner) and the shell's height under a point, in the owner frame. */
function shellOf(tank, name) {
  let mesh = null; tank.root.traverse((m) => { if (m.isMesh && m.name === name && !mesh) mesh = m; });
  assert.ok(mesh, `${name} shell mesh`);
  const inv = mesh.matrixWorld.clone().invert();
  return (x, z, from = 3) => {
    const hit = new THREE.Raycaster(new THREE.Vector3(x, from, z).applyMatrix4(mesh.matrixWorld),
      new THREE.Vector3(0, -1, 0).transformDirection(mesh.matrixWorld), 0, 4).intersectObject(mesh, false)[0];
    assert.ok(hit, `${name} shell under ${x.toFixed(3)},${z.toFixed(3)}`);
    return hit.point.clone().applyMatrix4(inv).y;
  };
}

/** The part's lowest vertices (its foot) each 5-7 mm under the shell; returns the depths. */
function seatDepths(p, shellY) {
  const vs = vertices(p), low = Math.min(...vs.map((v) => v.y));
  // the foot: every vertex within the shell's fall across the footprint of the lowest one
  return vs.filter((v) => v.y < low + .08 && v.y < p.box.max.y - .01).map((v) => shellY(v.x, v.z, p.box.max.y + .5) - v.y);
}

for (const quality of ['high', 'low']) {
  // ---- Type 96B
  {
    const { tank, parts } = build('type96b', quality);
    try {
      for (const o of ['turret', 'gun', 'hull']) assert.deepEqual(apartOf(parts.filter((p) => owner(p.bucket) === o)).map(label), [],
        `type96b/${quality}: every ${o} part joins the ${o} by contact`);
      const turret = parts.filter((p) => owner(p.bucket) === 'turret'), hull = parts.filter((p) => owner(p.bucket) === 'hull');
      const turretShell = shellOf(tank, 'turret'), hullShell = shellOf(tank, 'hull');

      // the gunner's sight housing on its plinth
      const housing = turret.filter((p) => p.bucket === 'turretDetail' && sized(p, [.51, .214, .28]) && near(p.box.min.y, .729, .002));
      assert.equal(housing.length, 1, `type96b/${quality}: the gunner's sight housing`);
      const [h] = housing;
      const plinth = turret.filter((p) => p !== h && p.bucket === 'turretDetail' && insideFootprint(p, h)
        && p.box.max.y >= h.box.min.y && p.box.max.y <= h.box.min.y + .003);
      assert.equal(plinth.length, 1, `type96b/${quality}: one plinth inside the sight's footprint, its top 0-3 mm into the floor`);
      const plinthDepth = seatDepths(plinth[0], turretShell);
      assert.ok(plinthDepth.length >= 4 && plinthDepth.every((d) => d >= .005 && d <= .007),
        `type96b/${quality}: the plinth's foot 5-7 mm into the roof (${plinthDepth.map((d) => (d * 1000).toFixed(1)).join(', ')} mm)`);
      assert.ok(apartOf(turret.filter((p) => p !== plinth[0])).includes(h), `type96b/${quality}: negative control: without its plinth the sight housing stands apart`);

      // the driver's hatch lid on its coaming
      const lid = hull.filter((p) => p.bucket === 'hullDetail' && sized(p, [.64, .045, .64]) && near(p.box.min.y, 1.5775, .002));
      assert.equal(lid.length, 1, `type96b/${quality}: the driver's hatch lid`);
      const coaming = hull.filter((p) => p !== lid[0] && p.bucket === 'hullDetail' && insideFootprint(p, lid[0])
        && p.box.max.y >= lid[0].box.min.y && p.box.max.y <= lid[0].box.min.y + .003);
      assert.equal(coaming.length, 1, `type96b/${quality}: one coaming under the lid, its top 0-3 mm into the lid`);
      const coamingDepth = seatDepths(coaming[0], hullShell);
      assert.ok(coamingDepth.length >= 16 && coamingDepth.every((d) => d >= .005 && d <= .007),
        `type96b/${quality}: the coaming's foot 5-7 mm into the falling roof (${Math.min(...coamingDepth).toFixed(4)}..${Math.max(...coamingDepth).toFixed(4)})`);

      // the driver's periscope heads, each on its base, ahead of the lid
      const heads = hull.filter((p) => p.bucket === 'hullDetail' && sized(p, [.18, .06, .08]));
      assert.equal(heads.length, 3, `type96b/${quality}: three driver's periscope heads`);
      const bases = heads.map((head) => {
        const base = hull.filter((p) => p !== head && p.bucket === 'hullDetail' && insideFootprint(p, head)
          && p.box.max.y >= head.box.min.y + .006 && p.box.max.y <= head.box.min.y + .010);
        // the base reaches 6-10 mm into the head, past the round of its lower edges (no slot under its overhang)
        assert.equal(base.length, 1, `type96b/${quality}: one base under the head at x ${head.box.getCenter(new THREE.Vector3()).x.toFixed(2)}`);
        assert.ok(near(base[0].box.getSize(new THREE.Vector3()).x, head.box.getSize(new THREE.Vector3()).x - .004, .0015),
          `type96b/${quality}: the base fills the head's width but 2 mm a side`);
        const depth = seatDepths(base[0], hullShell);
        assert.ok(depth.length >= 4 && depth.every((d) => d >= .005 && d <= .007),
          `type96b/${quality}: the periscope base's foot 5-7 mm into the roof (${depth.map((d) => (d * 1000).toFixed(1)).join(', ')} mm)`);
        assert.ok(head.box.min.z > lid[0].box.max.z, `type96b/${quality}: the periscope row stands ahead of the hatch lid's rim`);
        return base[0];
      });
      // negative control: the heads lie inside the hull shell's box (the AABB census cannot see them float, as with the
      // lid), so the rays carry it: each head's own floor stands 2-14 mm over the falling roof, its base the only contact
      for (const head of heads) {
        const gap = Math.min(...vertices(head).map((v) => v.y - hullShell(v.x, v.z, head.box.max.y + .5)));
        assert.ok(gap >= .002 && gap <= .014, `type96b/${quality}: negative control: a periscope head alone stands ${(gap * 1000).toFixed(1)} mm over the roof`);
      }

      // the gun clears every periscope head (its bezel and glass included) and base by 15 mm at rest, fully depressed
      // and fully elevated
      const hullRig = tank.root.getObjectByName('rig_hull'), gunRig = tank.root.getObjectByName('rig_gun');
      const spec = getSpec('type96b'), rest = gunRig.rotation.x;
      const zones = heads.map((head, i) => head.box.clone().union(bases[i].box).expandByVector(new THREE.Vector3(0, 0, .015))
        .union(new THREE.Box3(head.box.min, head.box.max.clone().add(new THREE.Vector3(0, 0, .03)))).expandByScalar(.015));
      const tri = new THREE.Triangle(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Matrix4();
      for (const [pose, rx] of [['rest', rest], ['depressed', rest + spec.gunDepressionDeg * Math.PI / 180], ['elevated', rest - spec.gunElevationDeg * Math.PI / 180]]) {
        gunRig.rotation.x = rx; tank.root.updateMatrixWorld(true);
        const toHull = hullRig.matrixWorld.clone().invert();
        let crossings = 0;
        gunRig.traverse((mesh) => {
          if (!mesh.isMesh || /Shadow/.test(mesh.name)) return;
          m.multiplyMatrices(toHull, mesh.matrixWorld);
          const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, n = index ? index.count : p.count;
          for (let i = 0; i < n; i += 3) {
            const at = (k) => (index ? index.getX(i + k) : i + k);
            tri.set(a.fromBufferAttribute(p, at(0)).applyMatrix4(m), b.fromBufferAttribute(p, at(1)).applyMatrix4(m), c.fromBufferAttribute(p, at(2)).applyMatrix4(m));
            for (const zone of zones) if (zone.intersectsTriangle(tri)) crossings++;
          }
        });
        assert.equal(crossings, 0, `type96b/${quality}: the gun keeps 15 mm off the driver's periscopes (${pose})`);
      }
      gunRig.rotation.x = rest;
    } finally { tank.dispose(); }
  }

  // ---- the A2 hull's three tanks: the ZTZ-99A2, its prototype and the VT-4A1
  for (const id of ['ztz99a2', 'ztz99a', 'vt4a1']) {
    const { tank, parts } = build(id, quality);
    try {
      for (const o of ['turret', 'gun', 'hull']) assert.deepEqual(apartOf(parts.filter((p) => owner(p.bucket) === o)).map(label), [],
        `${id}/${quality}: every ${o} part joins the ${o} by contact`);
      const hull = parts.filter((p) => owner(p.bucket) === 'hull'), deck = shellOf(tank, 'hull');
      const field = (bucket, depth) => hull.filter((p) => p.bucket === bucket && near(p.box.min.x, -1.25) && near(p.box.max.x, 1.25)
        && near(p.box.getSize(new THREE.Vector3()).z, depth, .003) && p.box.max.z < -2.0 && p.box.min.z > -3.75);
      const plates = field('hullDark', .075), bars = field('hullDetail', .026);
      assert.equal(plates.length, 7, `${id}/${quality}: seven dark louvre plates`);
      assert.equal(bars.length, 7, `${id}/${quality}: seven louvre bars`);
      // every vertex's height over the deck under it: the plates' tops 2 mm proud, the bars' undersides 2 mm in
      const over = (p) => vertices(p).map((v) => v.y - deck(v.x, v.z));
      for (const p of plates) { const d = over(p), top = Math.max(...d); assert.ok(top >= .0015 && top <= .0025, `${id}/${quality}: plate ${label(p)} top ${(top * 1000).toFixed(2)} mm over the deck`); }
      for (const p of bars) {
        const d = over(p), foot = d.filter((v) => v < .005);
        assert.ok(foot.length >= 4 && foot.every((v) => v >= -.0025 && v <= -.0015), `${id}/${quality}: bar ${label(p)} underside ${foot.map((v) => (v * 1000).toFixed(2)).join(', ')} mm in the deck`);
      }
      // negative control: the field at its former level heights (all three hulls carried it) stands apart
      const level = new Map([...plates.map((p) => [p, [1.703, 1.721]]), ...bars.map((p) => [p, [1.721, 1.749]])]);
      const levelled = hull.map((p) => level.has(p) ? { ...p, box: new THREE.Box3(new THREE.Vector3(p.box.min.x, level.get(p)[0], p.box.min.z), new THREE.Vector3(p.box.max.x, level.get(p)[1], p.box.max.z)) } : p);
      assert.ok(apartOf(levelled).length >= 8, `${id}/${quality}: negative control: the level louvre field stands apart`);
    } finally { tank.dispose(); }
  }
}
console.log('donorStockSeating selftest: OK');
