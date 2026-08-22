import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.js';
import { GHILLIE_SUIT_CONFIGS } from './ghillieSuit.js';

const ids = [
  'jpz_e100', 'ua_t64bv', 'pt91_twardy', 'm1a2_sepv3',
  'strv103a', 'strv103', 't84', 'ua_m1a1', 'leo2a6_ua',
];

for (const id of ['t90a', 't90m', 'strv122', 'ua_t84_oplot_m']) {
  const control = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  assert.equal(control.root.getObjectByName(`${id}_ghillie_hull_net`), undefined,
    `${id} remains net-free instead of inheriting a generic family blanket`);
  control.dispose();
}

function belongsTo(object, parent) {
  for (let node = object; node; node = node.parent) if (node === parent) return true;
  return false;
}

for (const id of ids) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  assert.ok(hullRig && turretRig && gunRig, `${id} retains canonical hull/turret/gun rigs`);
  const cfg = GHILLIE_SUIT_CONFIGS[id];

  for (const owner of ['hull', 'turret', 'gun']) {
    if (!cfg[owner]) continue;
    const rig = owner === 'hull' ? hullRig : owner === 'turret' ? turretRig : gunRig;
    const expectedLayers = cfg.foliage === false ? ['net'] : ['net', 'light', 'dark'];
    for (const layer of expectedLayers) {
      const name = `${id}_ghillie_${owner}_${layer}`;
      const mesh = tank.root.getObjectByName(name);
      assert.ok(mesh?.isMesh && mesh.geometry, `${name} is a merged equipment mesh`);
      assert.ok(belongsTo(mesh, rig), `${name} follows its canonical owner rig`);
      assert.ok(mesh.geometry.getAttribute('position').count > 120,
        `${name} is detailed geometry, not a token rectangle`);
    }
    if (cfg.foliage === false) {
      for (const layer of ['light', 'dark']) {
        assert.equal(tank.root.getObjectByName(`${id}_ghillie_${owner}_${layer}`), undefined,
          `${id} keeps the carrier net but has no artificial leaf layer`);
      }
    }
  }

  const hullNet = tank.root.getObjectByName(`${id}_ghillie_hull_net`);
  const hullBounds = new THREE.Box3().setFromObject(hullNet);
  assert.ok(hullBounds.min.y > 0.52, `${id} ghillie stays above the live track corridor`);
  assert.ok(hullBounds.max.z - hullBounds.min.z > 5.5,
    `${id} hull blanket spans the vehicle instead of one selected panel`);

  if (cfg.turret) {
    const turretNet = tank.root.getObjectByName(`${id}_ghillie_turret_net`);
    // The exact center of each authored face is the reserved cannon corridor.
    // A forward-to-rear ray may meet bustle cloth, but never the front face.
    const gunWorldY = turretRig.position.y + 0.38;
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, gunWorldY, 8), new THREE.Vector3(0, 0, -1), 0, 14,
    ).intersectObject(turretNet, false);
    assert.ok(hits.every((hit) => hit.point.z < turretRig.position.z - 0.72),
      `${id} leaves the complete mantlet/gun corridor open`);
  }

  if (cfg.gun) {
    const gunNet = tank.root.getObjectByName(`${id}_ghillie_gun_net`);
    const gunBounds = new THREE.Box3().setFromObject(gunNet);
    assert.ok(gunBounds.max.z - gunBounds.min.z > 5.0,
      `${id} gun shroud covers the L55 tube without closing its bore`);
    assert.ok(gunBounds.max.z < tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).z,
      `${id} gun shroud stops behind the live muzzle anchor`);
  }

  tank.dispose();
}

const twardy = GHILLIE_SUIT_CONFIGS.pt91_twardy;
const twardyTop = twardy.turret.top[0];
assert.ok(twardyTop.yAt(0, 0) > 0.82 && twardyTop.yAt(0, 0) < 0.86,
  'Twardy net keeps a small suspended air layer over the dome crown');
assert.ok(twardyTop.yAt(1.05, 0.45) < 0.74,
  'Twardy net descends onto the ERAWA cheek instead of retaining a flat roof plane');
assert.ok(twardyTop.yAt(0, -1.48) < 0.72,
  'Twardy net seats onto the bustle roof instead of floating at crown height');
assert.ok(twardy.turret.side[0].topAt(0.90) < twardy.turret.side[0].topAt(-0.40),
  'Twardy side drape follows the falling front shoulder');
assert.ok(twardy.turret.face[0].zAt(1.0, 0.42) < twardy.turret.face[0].zAt(0.35, 0.42),
  'Twardy front drape follows the swept ERAWA wedge instead of one flat face');

console.log('Shared physical-ghillie suit selftest passed');
