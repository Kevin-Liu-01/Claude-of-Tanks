import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const expected = {
  merkava4_trophy: { trophy: 'mk4', barak: false, namer: false },
  merkava4_barak: { trophy: 'barak', barak: true, namer: false },
  namer_ifv: { trophy: 'namer', barak: false, namer: true },
};

const rayDown = (object, x, z) => new THREE.Raycaster(
  new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0), 0, 8,
).intersectObject(object, false)[0]?.point.y;

for (const quality of ['high', 'low']) for (const [id, contract] of Object.entries(expected)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality });
  try {
    tank.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(tank.root);
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite),
      `${id}/${quality}: finite whole-vehicle bounds`);
    assert.ok(bounds.min.y >= -.012, `${id}/${quality}: no material geometry below native shoe tolerance`);
    assert.ok(Math.abs(tank.contactGeom?.bottomYM ?? 1) < 1e-8,
      `${id}/${quality}: native track contact owns ground zero`);

    const turretRig = tank.root.getObjectByName('rig_turret');
    const gunRig = tank.root.getObjectByName('rig_gun');
    assert.equal(gunRig?.parent, turretRig, `${id}: gun pitch remains inside turret yaw`);
    const trophy = turretRig?.userData.trophySuiteReceipt;
    assert.deepEqual(trophy, { configuration: contract.trophy, radarFaces: 4, launchers: 2, owner: 'rig_turret' },
      `${id}: four radar faces and two launchers stay turret-owned`);

    const shoes = [];
    tank.root.traverse(object => {
      if (object.isInstancedMesh && object.userData.runningGear && object.userData.trackShoeCountPerSide > 0) shoes.push(object);
    });
    assert.ok(shoes.length >= 1 && shoes.length <= 3, `${id}: one native animated track construction`);
    assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'), undefined,
      `${id}: no duplicate static inner track course`);

    if (contract.barak) {
      assert.deepEqual(turretRig.userData.barakSensorReceipt,
        { panoramicHead: true, ironVisionCameraClusters: 4, owner: 'rig_turret' },
        `${id}: Barak awareness kit is physical and turret-owned`);
      const whips = turretRig.getObjectByName('barakRearWhips');
      assert.equal(whips?.count, 2, `${id}: measured rear antenna pair is instanced once`);
      assert.ok(new THREE.Box3().setFromObject(whips).max.y > 5.60,
        `${id}: rear whips reach the registered source height`);
      const roofWeapons=[];
      tank.root.traverse((object)=>{
        if(object.userData?.fittingRoot&&object.userData?.fitting==='pintleMG')roofWeapons.push(object);
      });
      assert.equal(roofWeapons.length,1,`${id}: exactly one real roof weapon fitting`);
      assert.equal(roofWeapons[0].parent,turretRig,`${id}: roof weapon remains turret-owned`);
      let exactParts=0;
      roofWeapons[0].traverse((object)=>{
        if(object.isMesh&&object.userData?.fittingExact&&object.userData?.fitting==='pintleMG')exactParts++;
      });
      assert.equal(exactParts,2,`${id}: source receiver and barrel are the registered weapon stock`);
    } else {
      assert.equal(turretRig.userData.barakSensorReceipt, undefined,
        `${id}: non-Barak vehicles do not inherit Barak-only sensors`);
    }

    if (!contract.namer) {
      assert.equal(turretRig.position.y, contract.trophy === 'mk4' ? 1.615 : 1.605,
        `${id}: exact source-registered turret-ring datum`);
      const gunWorld=gunRig.getWorldPosition(new THREE.Vector3());
      assert.ok(gunWorld.toArray().every((value,index)=>Math.abs(value-
        [0,contract.trophy === 'mk4' ? 2.0034619 : 1.9934619,1.93][index])<1e-9),
        `${id}: rendered local gun pivot composes to the certified world trunnion`);
      const glacisY = rayDown(tank.root.getObjectByName('hull'), 0, 2.75);
      if (contract.trophy === 'mk4') {
        assert.ok(glacisY > 1.43,
          `${id}: Trophy-specific modern glacis cap remains a closed hull surface`);
      } else {
        assert.ok(glacisY > 1.34 && glacisY < 1.40,
          `${id}: Barak retains the measured lower base-hull glacis without a false overlay (${glacisY})`);
      }
      const rearClosure = rayDown(tank.root.getObjectByName('hullDetail'), 0, -3.88);
      assert.ok(rearClosure > 1.40,
        `${id}: late-Mk.4 rear termination is a seated hull surface`);
      if (contract.trophy === 'mk4') {
        const skirts = tank.root.getObjectByName('hullExternalArmor');
        const skirtWidth = new THREE.Box3().setFromObject(skirts).getSize(new THREE.Vector3()).x;
        assert.ok(skirtWidth > 4.20, `${id}: source-specific outboard protection is physical (${skirtWidth})`);
        assert.ok(rayDown(skirts, 1.93, 2.72) > .90 && rayDown(skirts, -1.91, 2.72) > .90,
          `${id}: localized front shoulder pods close both source-width transitions`);
      }
    }

    if (contract.namer) {
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(size.x > 3.55 && size.x < 3.62 && size.z > 7.42 && size.z < 7.55,
        `${id}: source-registered chassis envelope is retained (${size.x} × ${size.z})`);
      assert.deepEqual(tank.root.getObjectByName('rig_hull')?.userData.namerLayoutReceipt,
        { crew: 3, dismounts: 8, rearRamp: true, unmannedTurret: true, missiles: false },
        `${id}: troop-carrier and no-missile layout is explicit`);
      const hull = tank.root.getObjectByName('hull');
      assert.ok(rayDown(hull, 0, 2.75) > 1.40,
        `${id}: measured modern glacis cap remains a closed hull surface`);
      for (const [z, floor] of [[-3.4, 1.32], [-2.2, 1.38], [-.4, 1.40], [1.1, 1.42]]) {
        const roof = rayDown(hull, 0, z);
        assert.ok(Number.isFinite(roof) && roof > floor + .10,
          `${id}: closed troop-compartment volume at z=${z} (${roof})`);
      }
      const ramp = tank.root.getObjectByName('hullDetail');
      assert.ok(rayDown(ramp, 0, -3.60) > 1.7, `${id}: rear troop ramp is a physical seated surface`);
      assert.equal(tank.root.getObjectByName('missile'), undefined, `${id}: 30 mm demonstrator has no invented ATGM`);
    }

    const yawBefore = new THREE.Box3().setFromObject(turretRig).clone();
    turretRig.rotation.y = .31;
    tank.root.updateMatrixWorld(true);
    const yawAfter = new THREE.Box3().setFromObject(turretRig);
    assert.ok(!yawBefore.equals(yawAfter), `${id}: complete turret-owned silhouette follows yaw`);
  } finally {
    tank.dispose();
  }
}

console.log('merkavaModernGeometry: three modern Israeli vehicles preserve native gear, articulated ownership, configuration-specific sensors and closed troop geometry in both LODs');
