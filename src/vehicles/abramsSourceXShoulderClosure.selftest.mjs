import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from './tankFactory.ts';
import { registerProfiledBuilders, KIT } from './tankFactoryCore.ts';
import { buildAbramsX } from './profiles/abramsSourceX.ts';
import { ABRAMS_SOURCE_X_IDS } from './abramsSourceXSpecs.ts';

const material = new T.MeshBasicMaterial({ side: T.FrontSide });
const vec = values => new T.Vector3(...values);
const ray = (meshes, p, d, far) => new T.Raycaster(vec(p), vec(d), 0, far).intersectObjects(meshes, false);
let builds = 0, counterexamples = 0, contacts = 0, preservedAir = 0;
for (const quality of ['high', 'low']) for (const id of ABRAMS_SOURCE_X_IDS) {
  const existing = [], added = [];
  registerProfiledBuilders({ [id]: P => buildAbramsX(new Proxy(P, { get(target, key) {
    if (key !== 'add' && key !== 'addEquipment') return Reflect.get(target, key);
    return (bucket, geometry, ...args) => {
      if (bucket.startsWith('hull') && !/Cloth|Glass|Dark|Rubber/.test(bucket)) {
        const g = KIT.xform(geometry.clone(), ...args);
        const m = new T.Mesh(g, material); m.updateMatrixWorld(true);
        (geometry.userData.abramsShoulderClosure ? added : existing).push(m);
      }
      return target[key](bucket, geometry, ...args);
    };
  } })) });
  let tank;
  try {
    tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242 });
    assert.equal(added.length, 4, 'two actual mirrored inner returns and two carriers');
    const actual = [...existing, ...added];
    for (const side of [-1, 1]) {
      const direction = [-side, 0, 0];
      assert.equal(ray(added,[side*1.90,.903945,-2.642035],direction,.15).length,0,
        'source20 aft lower-edge air remains visible below the new upper carrier');
      preservedAir++;
      for (const z of [-1.985, -.645, .025, .695, 1.365, 2.035]) {
        const point = [side * 1.90, 1.0, z];
        assert.equal(ray(existing, point, direction, .12).length, 0, 'retained old upper panel-joint gap');
        assert.ok(ray(actual, point, direction, .12).length, 'permanent receiving sheet closes upper gap');
        counterexamples++; contacts++;
        assert.equal(ray(added, [side * 1.90, .60, z], direction, .15).length, 0,
          'owner-confirmed lower road-wheel exposure retained');
        preservedAir++;
      }
      // Sample inside the old 10mm lateral seam and above the lower bow.
      assert.equal(ray(existing, [side * 1.13, 1.267, 3.4], direction, .03).length, 0,
        'old guard-to-glacis slot is a real counterexample');
      assert.ok(ray(added, [side * 1.13, 1.267, 3.4], direction, .03).length,
        'new finite inner return closes the old slot');
      counterexamples++; contacts++;
      for (const z of [3.30, 3.40, 3.50, 3.65, 3.78]) {
        const y = 1.42863 + (1.15266 - 1.42863) * (z - 1.72) / (3.913465 - 1.72) - .010;
        const base = ray(existing, [side * 1.14, y, z], direction, .065)[0];
        const stock = ray(added, [0, y, z], [side, 0, 0], 1.13)[0];
        assert.ok(base && stock, 'guard return has a receiving central glacis and positive root');
        assert.ok(side * (base.point.x - stock.point.x) >= .010, 'at least10mm real concealed lap');
        contacts++;
      }
    }
    const gear = tank.root.getObjectByName('rig_hull').userData.runningGearReceipts[0];
    for (const m of added) {
      m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      const inner = Math.min(Math.abs(b.min.x), Math.abs(b.max.x));
      const outer = Math.max(Math.abs(b.min.x), Math.abs(b.max.x));
      assert.ok(outer < Math.min(gear.xcLeft, gear.xcRight) - gear.trackW / 2 - .010 ||
        inner > Math.max(gear.xcLeft, gear.xcRight) + gear.trackW / 2 + .09,
      'every added vertex stays outside both moving tread lanes, not an enclosing filler');
      assert.ok(m.geometry.attributes.position.count / 3 <= 52, 'finite analytic sheet budget');
    }
    const rig = tank.root.getObjectByName('rig_hull');
    const exterior = [];
    rig.traverse(o => { if (o.isMesh && /^(hullDetail|hullTrackGuardL|hullTrackGuardR)$/.test(o.name)) exterior.push(o); });
    for (const name of tank.root.userData.eraClusterNames ?? []) tank.stripEra(name);
    for (const yaw of [0, .73, -1.2]) {
      tank.root.rotation.y = yaw; tank.root.updateMatrixWorld(true);
      for (const side of [-1, 1]) {
        const p = rig.localToWorld(vec([side * 1.90, 1.0, .025]));
        const d = vec([-side, 0, 0]).transformDirection(rig.matrixWorld);
        assert.ok(new T.Raycaster(p, d, 0, .12).intersectObjects(exterior, false).length,
          'actual merged permanent carrier remains seated after ERA depletion and hull yaw');
        contacts++;
      }
    }
    builds++;
  } finally {
    tank?.dispose(); for (const m of [...existing, ...added]) m.geometry.dispose();
    registerProfiledBuilders({ [id]: buildAbramsX });
  }
}
material.dispose();
assert.equal(builds, 14);
console.log(JSON.stringify({ pass: true, builds, counterexamples, contacts, preservedAir }));
