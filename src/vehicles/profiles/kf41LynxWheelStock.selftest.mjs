import assert from 'node:assert/strict';
import * as THREE from 'three';
import { kf41LynxWheelStock } from './kf41LynxWheelStock.ts';

const material = new THREE.MeshBasicMaterial({side: THREE.FrontSide});
for (const high of [true, false]) {
  const stock = kf41LynxWheelStock(high);
  try {
    for (const face of stock.faces) {
      const meshes = [stock.core, face.steel, face.dark].map(g => new THREE.Mesh(g, material));
      const hitX = (radius, fromSide) => {
        const a = .55;
        const hit = new THREE.Raycaster(
          new THREE.Vector3(fromSide * .5, Math.sin(a) * radius, Math.cos(a) * radius),
          new THREE.Vector3(-fromSide, 0, 0),
        ).intersectObjects(meshes)[0];
        return hit ? hit.point.x * face.side : null;
      };
      // Scalar source witnesses: raised outer hub, recessed stamped web,
      // and the asymmetric plain axle back. A mirrored hub/cap fails these.
      assert.ok(Math.abs(hitX(.02, face.side) - .1979) < .0002);
      for (const radius of [.14, .18])
        assert.ok(Math.abs(hitX(radius, face.side) - .0595) < .001);
      for (const radius of [.02, .05, .08])
        assert.ok(Math.abs(hitX(radius, -face.side) + .1643) < .001);
      assert.equal(hitX(.32, face.side), null, 'steel must not close the tire opening');
      const gap = new THREE.Raycaster(new THREE.Vector3(0,.2,-.5), new THREE.Vector3(0,0,1));
      assert.equal(gap.intersectObjects(meshes).length, 0, 'paired webs retain central air');
      // Rim sampling cannot leave angular gaps before the rubber starts.
      for (let i = 0; i < 72; i++) {
        const a = (i + .37) * Math.PI / 36;
        const ray = new THREE.Raycaster(new THREE.Vector3(face.side*.5, Math.sin(a)*.306, Math.cos(a)*.306),
          new THREE.Vector3(-face.side,0,0));
        const outer = ray.intersectObjects(meshes)[0];
        assert.ok(outer && outer.point.x * face.side > .034, 'outer rim has stock before the tire opening');
        ray.set(new THREE.Vector3(-face.side*.5,Math.sin(a)*.306,Math.cos(a)*.306),
          new THREE.Vector3(face.side,0,0));
        const inner = ray.intersectObjects(meshes)[0];
        assert.ok(inner && inner.point.x * face.side < -.034, 'inner rim has stock before the tire opening');
      }
      // The outward eight web and four hub heads retain their source cadence;
      // a single generic dark cap cannot pass the empty intervals between them.
      const heads = new THREE.Mesh(face.dark, material);
      for (const [count, radius, phase] of [[8,.1622,0],[4,.1003,Math.PI/4]]) {
        for (let i = 0; i < count; i++) {
          const a = phase + i * Math.PI * 2 / count;
          const ray = new THREE.Raycaster(new THREE.Vector3(face.side*.4, Math.sin(a)*radius,Math.cos(a)*radius),
            new THREE.Vector3(-face.side,0,0));
          assert.ok(ray.intersectObject(heads).length, 'outboard measured fastener head exists');
          const empty = a + Math.PI / count;
          ray.set(new THREE.Vector3(face.side*.4, Math.sin(empty)*radius,Math.cos(empty)*radius),
            new THREE.Vector3(-face.side,0,0));
          assert.equal(ray.intersectObject(heads).length, 0, 'fasteners do not become a continuous dark disc');
        }
      }
    }
  } finally {
    stock.core.dispose();
    for (const face of stock.faces) { face.steel.dispose(); face.dark.dispose(); }
  }
}
material.dispose();
console.log('kf41LynxWheelStock: HIGH/LOW source hub/web/back witnesses, bilateral winding, rim stock, paired air and 8+4 fasteners pass');
