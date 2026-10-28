// Release 262: the Christian II (profiles/christian2.ts), a fresh first-party Danish concept build (the owner,
// 2026-10-27: "the new leo ... should rightfully be based on the new model and use totally new tank generation. the type
// 90 is a separate tank"). Its first-party concept fixture (tools/first-party-concept-policy.mjs):
//  1. its own spec: no fleet parent, its three-round bustle cycle, its armour on its own drawn hull and turret;
//  2. its own build: no hull, running-gear, turret or gun mesh hashes as any of the Type 90 X's, at HIGH and LOW;
//  3. the datum table the builder and the spec share is the vehicle drawn: the deck line by ray at its stations, the
//     turret ring and the trunnion where the rigs stand, the hull, width and overall length the spec declares;
//  4. the main gun keeps 25 mm from its hull, suit included, at every yaw at its published depression stop
//     (gunPitchByYawDeg, measured with tools/gun-depression-sweep.mjs), at level and at full elevation; negative control:
//     at the bare -9 degrees the gun meets the hull;
//  5. the spec's frame, gun and dimensions are the concept document's (first-party-concept-datums.mjs).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { geometryHash } from '../../../tools/receipt-kit.test-support.mjs';
import { CHRISTIAN2_TURRET as T } from '../christian2Armor.ts';
import { LEOPARD2_HULL as H } from '../leopard2HullDatums.ts';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';
import { firstPartyConcept } from '../../../tools/first-party-concept-policy.mjs';
import { assertConceptDatums } from '../../../tools/first-party-concept-datums.mjs';

const DEG = Math.PI / 180;
const options = { proceduralOnly: true, geometryReceipt: true, batchStatic: false, decor: false, camoSeed: 4242 };
const STOCK = /^(hull(?!.*ghillie)|gear|track|turret|gun|recoil)/;
const suit = (o) => /_ghillie_|ghillie/i.test(o.name);
const under = (o, name) => { for (let p = o; p; p = p.parent) if (p.name === name) return true; return false; };

// 1. its own spec
const spec = getSpec('christian2');
assert.equal(spec.name, 'Christian II');
assert.equal(spec.nation, 'Denmark');
assert.equal(spec.variantOf, undefined, 'no fleet parent');
assert.deepEqual(spec.gun.autoloader, { magazineSize: 3, intraClipS: 2.1, fullReloadS: 17 }, 'the bustle autoloader cycle');
assert.ok(spec.armor.turretPlates.some((p) => p.name === 'mantlet' && p.gunFollow), 'the box mantlet follows the gun');

// 2. none of the Type 90 X's stock
for (const quality of ['high', 'low']) {
  const hashes = (id) => {
    const tank = createTank(id, null, { ...options, quality }), out = new Set();
    tank.root.traverse((o) => { if (o.isMesh && o.geometry && STOCK.test(o.name) && !suit(o)) out.add(geometryHash(o.geometry)); });
    tank.dispose();
    return out;
  };
  const type90 = hashes('type90'), own = hashes('christian2');
  assert.ok(own.size > 8, `${quality}: the Christian II's stock is found (${own.size} meshes)`);
  const shared = [...own].filter((h) => type90.has(h));
  assert.equal(shared.length, 0, `${quality}: no Christian II hull, gear, turret or gun mesh is a Type 90 X mesh (${shared.length} shared)`);
}

// 3. the datum table is the vehicle drawn
{
  const tank = createTank('christian2', null, { ...options, quality: 'high' });
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
    const at = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    assert.ok(at(turret).distanceTo(new THREE.Vector3(...T.pivot)) < 1e-6, 'the turret ring stands at the datum');
    const trunnion = new THREE.Vector3(...T.gunLocal).add(new THREE.Vector3(...T.pivot));
    assert.ok(at(gun).distanceTo(trunnion) < 1e-6, 'the trunnion stands at the datum');
    const hull = [];
    root.traverse((o) => { if (o.isMesh && !suit(o) && !under(o, 'rig_turret') && /^hull/.test(o.name)) hull.push(o); });
    const ray = new THREE.Raycaster();
    // stations clear of the deck's fittings (the fan covers, louvres, ring race, hatch and splash board)
    for (const [x, z] of [[1.10, -3.30], [1.10, -2.90], [0.30, -1.60], [1.20, 0.20], [1.20, 1.20], [0.30, 2.10], [0.30, 2.70], [0.30, 3.10]]) {
      ray.set(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(hull, false)[0];
      let want = H.deck[0][1];
      for (let i = 1; i < H.deck.length; i++) {
        const [z0, y0] = H.deck[i - 1], [z1, y1] = H.deck[i];
        if (z >= z0 && z <= z1) want = y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
      }
      assert.ok(hit && Math.abs(hit.point.y - want) < 0.01,
        `z ${z}: the drawn deck ${hit ? hit.point.y.toFixed(3) : 'none'} is the datum line's ${want.toFixed(3)}`);
    }
    const box = (pred) => {
      const b = new THREE.Box3();
      root.traverse((o) => { if (o.isMesh && !suit(o) && pred(o)) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
      return b;
    };
    const hullBox = box((o) => !under(o, 'rig_turret') && !/^procShadow/.test(o.name));
    const all = box((o) => !/^procShadow/.test(o.name));
    assert.ok(Math.abs(hullBox.max.z - hullBox.min.z - spec.dims.hullLengthM) < 0.01, `hull length ${(hullBox.max.z - hullBox.min.z).toFixed(3)}`);
    assert.ok(Math.abs(hullBox.max.x - hullBox.min.x - spec.dims.widthM) < 0.01, `width ${(hullBox.max.x - hullBox.min.x).toFixed(3)}`);
    assert.ok(Math.abs(all.max.z - all.min.z - spec.dims.overallLengthM) < 0.01, `overall length ${(all.max.z - all.min.z).toFixed(3)}`);
  } finally {
    tank.dispose();
  }
}

// 4. the gun over its hull, suit included
{
  const probe = gunHullProbe('christian2');
  try {
    assert.ok(probe.spec.gunPitchByYawDeg, 'publishes its measured gunPitchByYawDeg');
    const worst = gunHullSweep(probe, probe.spec);
    console.log(`christian2: the gun's worst clearance ${(worst.d * 1000).toFixed(1)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} (${worst.part})`);
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `the main gun keeps 25 mm from its hull at every yaw (${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd} from ${worst.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: probe.spec.gunDepressionDeg }, { stop: GUN_HULL_KEEP_M });
    assert.ok(bare.d < GUN_HULL_KEEP_M, `negative control: the bare -${probe.spec.gunDepressionDeg} degrees meets the hull (${(bare.d * 1000).toFixed(2)} mm)`);
  } finally {
    probe.dispose();
  }
}

// 5. the concept document's frame and dimensions
assertConceptDatums(spec, firstPartyConcept('christian2'));
console.log('christian2.selftest: its own spec and stock, the datum table drawn, the gun clear of its hull at its published stops, the concept datums PASS');
