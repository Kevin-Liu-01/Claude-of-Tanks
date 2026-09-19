import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { verifyBarakBayNativeStock } from '../../../tools/barak-rear-bay-fill-policy.mjs';

const expected = {
  merkava4_trophy: { trophy: 'mk4', barak: false, namer: false },
  merkava4_barak: { trophy: 'barak', barak: true, namer: false },
  namer_ifv: { trophy: 'namer', barak: false, namer: true },
};

const rayDown = (object, x, z) => new THREE.Raycaster(
  new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0), 0, 8,
).intersectObject(object, false)[0]?.point.y;
const rayUp = (object, x, z) => new THREE.Raycaster(
  new THREE.Vector3(x, -.5, z), new THREE.Vector3(0, 1, 0), 0, 3,
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
        { crewHatchPeriscopes: 5, cylindricalSight: true, rearWhips: 2, owner: 'rig_turret' },
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
        assert.deepEqual(turretRig.userData.trophySmokeBankReceipt,
          { tubes: 12, cradles: 12, solidEnvelope: false },
          `${id}: two exposed six-tube smoke banks retain separate cradles`);
        assert.deepEqual(tank.root.getObjectByName('rig_hull')?.userData.trophyRearFaceReceipt,
          { door: true, sideHousings: 2, lamps: 2, bentFittings: 2,
            doorRecessM: 1.23, upperReceiverDepthM: .526, fullWidthClosure: false },
          `${id}: rear portal keeps the deep door, open receivers, lamps and lower fittings`);
        assert.ok(glacisY > 1.34 && glacisY < 1.40,
          `${id}: Trophy-specific cap descends onto the measured 1.362 m glacis (${glacisY})`);
        const hull=tank.root.getObjectByName('hull');
        const keelY=rayUp(hull,.65,3.00);
        assert.ok(keelY>.40&&keelY<.48,
          `${id}: measured folded lower keel replaces the former full-width belly slab (${keelY})`);
        const detail=tank.root.getObjectByName('hullDetail');
        assert.ok(rayDown(detail,-1.40,-3.88)>.75&&rayDown(detail,1.40,-3.88)>.75,
          `${id}: both source backmudguard folds close the diagonal rear corners`);
      } else {
        assert.ok(glacisY > 1.34 && glacisY < 1.40,
          `${id}: Barak retains the measured lower base-hull glacis without a false overlay (${glacisY})`);
      }
      const rearClosure = rayDown(tank.root.getObjectByName('hullDetail'), 0, -3.88);
      if(contract.barak){
        assert.equal(rearClosure,undefined,`${id}: source entrance is not bridged by the former flush slab`);
        assert.equal(verifyBarakBayNativeStock(tank.root).length,15,`${id}: real floor, roof, sidewalls and recessed back remain physical`);
      }
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
      for (const [z, floor] of [[-2.0, 1.38], [-.4, 1.40], [1.1, 1.42]]) {
        const roof = rayDown(hull, 0, z);
        assert.ok(Number.isFinite(roof) && roof > floor + .10,
          `${id}: closed troop-compartment volume at z=${z} (${roof})`);
      }
      // Complete supplied-source Object1/38 shows a real exterior lane
      // between two closed wings, ending at the forward access door.
      // The earlier blanket closed-stern assertion encoded the wrong shape.
      for (const z of [-3.4, -2.5]) {
        assert.equal(rayDown(hull, 0, z), undefined, `${id}: source rear lane remains exterior air`);
        for (const x of [-.7, .7]) assert.ok(rayDown(hull, x, z) > 1.90,
          `${id}: actual closed shoulders remain beside the lane`);
      }
      const door = new THREE.Raycaster(new THREE.Vector3(0, 1, -4.2),
        new THREE.Vector3(0, 0, 1), 0, 3).intersectObject(hull, false)[0];
      assert.ok(door && Math.abs(door.point.z + 2.19345) < .004,
        `${id}: source-positioned access door terminates the lane`);
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

console.log('merkavaModernGeometry: three modern Israeli vehicles preserve native gear, articulated ownership, configuration-specific sensors and source-correct closed body/access geometry in both LODs');
