import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

const ids = ['fv510_milan_x', 'kurganets25_x', 'bmp3m_dragun125_x', 'k21_x'];
await ensureInteriorFills(ids);
for (const quality of ['high', 'low']) for (const id of ids) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverseVisible(o => {
      if (o.isMesh && !o.userData.shadowOnly && !/shadow/i.test(o.name)) meshes.push(o);
    });
    const hit = (origin, direction, far = 10) => new THREE.Raycaster(
      new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize(), 0, far,
    ).intersectObjects(meshes, false)[0];
    // Derive actual closed-stock intervals along the source mounting axis.
    // This tests physical overlap through the complete scene, independent of
    // AABB contact and the projected-mask dilation used by the separate gate.
    const covered = (origin, direction, from, to) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
      const saved = new Map();
      for (const mesh of meshes) for (const material of [].concat(mesh.material)) {
        if (!saved.has(material)) { saved.set(material, material.side); material.side = THREE.DoubleSide; }
      }
      let hits;
      try { hits = ray.intersectObjects(meshes, false); }
      finally { for (const [material, side] of saved) material.side = side; }
      const events = new Map();
      for (const h of hits) {
        const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        const delta = normal.dot(ray.ray.direction) < 0 ? 1 : -1;
        const key = `${h.object.uuid}:${Math.round(h.distance * 1e6)}:${delta}`;
        events.set(key, { distance: h.distance, delta });
      }
      const ordered = [...events.values()].sort((a,b) => a.distance-b.distance);
      let depth=0, previous=0;
      for (const event of ordered) {
        if (event.distance > from && previous < to && depth <= 0 &&
            Math.min(to,event.distance)-Math.max(from,previous) > .001)
          assert.fail(`${id} ${quality}: air in measured mounting axis from ${previous} to ${event.distance}`);
        depth += event.delta; previous=event.distance;
        if (previous >= to) return;
      }
      assert.fail(`${id} ${quality}: mounting ray ends before stock`);
    };
    if (id === 'fv510_milan_x') {
      for (const side of [-1,1]) {
        assert.equal(hit([side*2.095,1.02,3.60],[0,0,-1],.30), undefined,
          'the source corner has curved inward: no orphan outer post at z3.30');
        assert.equal(hit([side*1.43,1.01,3.60],[0,0,-1],.25)?.object.name, 'warrior_hull_open_cage',
          'the actual curved cage terminal remains');
      }
    } else if (id === 'bmp3m_dragun125_x') {
      for (const [base,tip] of [
        [[-1.013869,2.792851,-1.93194],[-1.209075,4.283319,-1.93194]],
        [[.96180,2.81351,-1.91950],[.96180,4.31671,-1.91950]],
      ]) {
        const a=new THREE.Vector3(...base),b=new THREE.Vector3(...tip),axis=b.clone().sub(a).normalize();
        const start=b.clone().addScaledVector(axis,.1),direction=axis.clone().negate();
        covered(start.toArray(),direction.toArray(),.105,start.distanceTo(a)+.20);
        const middle=a.clone().lerp(b,.5);
        const first=hit([middle.x,middle.y,middle.z+.1],[0,0,-1],.12);
        assert.equal(first?.object.name,'turretDark','the source leaning whip must be exposed');
      }
      assert.equal(hit([-1.212,2.85,-1.82],[0,0,-1],.20),undefined,
        'the left tip station must not retain the old floating base');
    } else if (id === 'k21_x') {
      for(const x of [-.883495,.884605]) {
        covered([x,4.4,-1.61599],[0,-1,0],.23,1.89);
        const first=hit([x,2.65,-1.45],[0,0,-1],.20);
        assert.equal(first?.object.name,'turretDetail','the narrow receiver is visible below the whip');
      }
    } else {
      for(const [mouth,axis] of [
        [[-.964395,2.676650,-.141980],[.371,.136,.924]],
        [[-1.512045,2.677500,-.453230],[-.084,.136,.988]],
        [[.959405,2.676650,-.141980],[-.371,.136,.924]],
        [[1.506505,2.677500,-.453230],[.084,.136,.988]],
      ]) {
        const m=new THREE.Vector3(...mouth),a=new THREE.Vector3(...axis).normalize();
        const first=hit(m.clone().addScaledVector(a,.20).toArray(),a.clone().negate().toArray(),.23);
        assert.equal(first?.object.name,'turretDark','source smoke cap remains the first visible stock');
        assert.ok(first.point.distanceTo(m.clone().addScaledVector(a,.0095))<.001);
      }
      for(const side of [-1,1]) {
        // Carrier spans the measured turret shoulder, connecting the outer
        // canister to the inner foot without closing the space below it.
        covered([side*1.08,3.30,-1.37653],[0,-1,0],.57,.68);
        const first=hit([side*1.35,2.55,-1.37463],[0,1,0],.20);
        assert.equal(first?.object.name,'turretDetail');
        assert.ok(Math.abs(first.point.y-2.57625)<.001);
      }
    }
  } finally { tank.dispose(); }
}
console.log('sourceStudyAttachmentSeats: HIGH/LOW source-mounted antennas, cage corners and smoke carriers pass');
