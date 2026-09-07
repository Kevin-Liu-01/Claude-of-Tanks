import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) < tolerance, `${label}: ${actual}; source ${expected} ± ${tolerance}`);
const ray = (meshes, p, d, far = 5) => new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d), 0, far).intersectObjects(meshes, false)[0];

for (const quality of ['high', 'low']) {
  const tank = createTank('leclerc_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const all = [];
    tank.root.traverse(m => {
      if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) all.push(m);
    });
    // Independent complete-source rays, including held-out roof crease and
    // tapered toe stations. These are not imported builder measurements.
    for (const side of [-1, 1]) {
      for (const [x, z, top, bottom] of [[1.68, 1.5, 1.447523, .7414298],
        [1.76, 1.8, 1.4186272, .8860460], [1.68, 2.3, 1.4124462, .7421656],
        [1.76, 2.4, 1.3784982, .8872555], [1.68, 2.7, 1.3493052, .7441195],
        [1.76, 2.9, 1.3085170, .8897384], [1.68, 3.2, 1.2711511, .7466269],
        [1.76, 3.27, 1.2615166, .8915942], [1.76, 3.32, 1.2553509, 1.0171353]]) {
        const upper = ray(all, [side * x, 2, z], [0, -1, 0]);
        const lower = ray(all, [side * x, .4, z], [0, 1, 0]);
        near(upper?.point.y, top, .003, `${quality} actual folded source crown`);
        near(lower?.point.y, bottom, .003, `${quality} actual source rising underside`);
        assert.equal(upper?.object.name, 'hullExternalArmor', 'real selected armor supplies the roof');
        assert.equal(lower?.object.name, 'hullExternalArmor', 'real selected armor closes the underside');
        assert.ok(upper.face.normal.y > 0 && lower.face.normal.y < 0, 'both paired panels have outward winding');
      }
      for (const z of [1.5, 2.2, 2.9]) {
        assert.equal(ray(all, [side * 1.78, .82, z - .015], [0, 0, 1], .03), undefined,
          'source under-bevel air is not filled by a flat lower slab');
        near(ray(all, [side * 2, 1.10, z], [-side, 0, 0])?.point.x,
          side * 1.8, .000001, 'true outer armor extreme remains unchanged');
        const rootTop = ray([tank.root.getObjectByName('hull')], [side * 1.6495, 2, z], [0, -1, 0])?.point.y;
        const panelBottom = ray([tank.root.getObjectByName('hullExternalArmor')],
          [side * 1.6495, .4, z], [0, 1, 0])?.point.y;
        assert.ok(rootTop > panelBottom + .3, 'inner armor root positively engages the retained carrier');
      }
      assert.equal(ray(all, [side * 1.75, 1.15, 1.94], [0, 1, 0], .25), undefined,
        'real gap between separate source panel spans remains open');
    }
    near(tank.root.getObjectByName('gearTrackBandL').position.x, -1.3158745, .000001, 'left source lane unchanged');
    near(tank.root.getObjectByName('gearTrackBandR').position.x, 1.2727975, .000001, 'right source lane unchanged');
    near(tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).z,
      6.239235, .000001, 'non-target muzzle remains source-fixed');
  } finally { tank.dispose(); }
}
console.log('leclercXFrontSkirts: high/low source folded crowns, underside/toe, air, carrier engagement and unchanged datums pass');
