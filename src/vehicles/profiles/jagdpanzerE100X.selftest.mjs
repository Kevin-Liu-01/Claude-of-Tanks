import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {TANK_SPECS,ALL_TANK_IDS} from '../specs.ts';
const close=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<e,`${label}: ${a} vs ${b}`);
assert.ok(ALL_TANK_IDS.includes('jpz_e100_x'));
assert.equal(TANK_SPECS.jpz_e100_x.gunArcDeg,12);
assert.equal(TANK_SPECS.jpz_e100.roster.productionVisible,false,'archived original remains hidden');
for(const quality of['high','low']) {
  const tank=createTank('jpz_e100_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('hull'),yaw=tank.root.getObjectByName('rig_turret');
    const gun=tank.root.getObjectByName('rig_gun'),recoil=tank.root.getObjectByName('rig_recoil');
    const marker=tank.root.getObjectByName('rig_muzzle');
    const band=tank.root.getObjectByName('gearTrackBandL');
    const shoes=tank.root.getObjectByName('gearTrackPads');
    band.geometry.computeBoundingBox();shoes.geometry.computeBoundingBox();
    close(band.geometry.boundingBox.getSize(new THREE.Vector3()).x,.780,.00001,'continuous web is narrower than the source pin span');
    close(shoes.geometry.boundingBox.getSize(new THREE.Vector3()).x,1.000952,.00001,
      'source complete pin span is the physical moving shoe width, not a 97-percent generic footprint');
    close(Math.abs(band.position.x),1.546796,.00001,'carrier cannot move the measured lane');
    const hit=(p,d,far=20)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(tank.root,true)[0];
    assert.equal(hull.parent.name,'rig_hull','entire casemate is fixed hull geometry');
    assert.equal(tank.root.getObjectByName('rig_hull').userData.nativeRoadWheelStations,8);
    close(marker.getWorldPosition(new THREE.Vector3()).z,7.04687214,1e-6,'physical muzzle marker');
    for(const side of[-1,1])for(const y of[2.07,2.6,2.75]) {
      close(hit([side*.77,y,1],[0,0,-1])?.point.z,
        (1.212762-.506720064*y)/.862110652,.002,'source oblique fixed collar plane');
    }
    for(const[dx,dy]of[[0,0],[.05,0],[-.05,0],[0,.05],[0,-.05]]) {
      const p=[-.0007+dx,2.33805+dy,7.25];
      assert.ok(!hit(p,[0,0,-1],1.5),'deep continuous170mm bore is actual air');
      close(hit(p,[0,0,-1])?.point.z,5.7062,.00004,'physical blind floor with1.2mm seated dark lining');
    }
    for(const x of[-.8012,.8007]) {
      const p=[x,3.216,-4.03];
      const glazing=hit(p,[0,0,1]);
      assert.equal(glazing?.object.name,'hullGlass','aft visor has real glazing behind its frame');
      close(glazing.point.z,-3.939,.0001,'measured aft visor reveal');
      assert.ok(!hit(p,[0,0,1],.080),'unfilled visor recess');
    }
    close(hit([.4723,3.6,-3.4117],[0,-1,0])?.point.y,3.3952,.0001,'source raised tapered cupola, not the former flat lid');
    const weapon=tank.root.getObjectByName('jpze100XEnclosedCupolaWeapon');
    assert.equal(weapon.parent.name,'rig_hull','actual cupola weapon belongs to the fixed hull, not the cannon traverse');
    assert.equal(weapon.userData.fittingRoot,true);
    assert.equal(weapon.userData.fitting,'pintleMG');
    const receiver=tank.root.getObjectByName('jpze100XCupolaReceiver');
    const jacket=tank.root.getObjectByName('jpze100XCupolaBarrel');
    const receiverBounds=new THREE.Box3().setFromObject(receiver),jacketBounds=new THREE.Box3().setFromObject(jacket);
    close(receiverBounds.max.z-jacketBounds.min.z,.0255,.00002,'weapon jacket physically enters its receiver');
    const support=hit([.4766,3.288,-3.147],[0,0,1],.01);
    assert.equal(support?.object.name,'jpze100XCupolaReceiver','receiver is embedded in the cupola front, not floating');
    close(hit([.4764,3.2934,-2.20],[0,0,-1])?.point.z,-2.3216,.00002,'small inferred muzzle has a physical recessed floor');
    assert.ok(!hit([.4764,3.2934,-2.28],[0,0,-1],.040),'cupola weapon muzzle recess is actual air');
    close(hit([-.0126,1.7331,3.8],[0,0,-1])?.point.z,3.6005,.0001,'bow lamp is recessed');
    for(const x of[.511765,-.462957]) {
      close(hit([x,1.818,3.0],[0,0,-1])?.point.z,2.869583,.00002,'source glacis vision block reveal');
      assert.ok(!hit([x,1.818,2.88994],[0,0,-1],.019),'separate bow optic retains its actual lens recess');
      close(hit([x,2.0,2.84],[0,-1,0])?.point.y,1.868443,.00002,'source glacis vision block crown');
    }
    close(hit([0,2.31,-4.6],[0,0,1])?.point.z,-4.22827,.001,'sloped rear service door replaces the falsely inferred exhaust pair');
    assert.ok(!hit([.104,2.32,-4.255],[0,0,1],.022),'rear handle stand-off is genuine air before the door');
    const mount=tank.root.getObjectByName('gunMount');
    const rearRay=new THREE.Raycaster(new THREE.Vector3(.10,2.50,-.02),new THREE.Vector3(0,0,1),0,.42);
    assert.equal(rearRay.intersectObject(mount,false).length,0,'mantlet rear cavity has no vertical plug');
    rearRay.far=1.2;
    assert.ok(rearRay.intersectObject(mount,false)[0]?.point.z>.42,'cavity is bounded by a physical inner casting');
    for(const side of[-1,1]) {
      const bowRay=new THREE.Raycaster(new THREE.Vector3(side*1.12,.8,4),new THREE.Vector3(0,0,-1),0,.5);
      close(bowRay.intersectObject(hull,false)[0]?.point.z,3.784080,.00003,'source circular final-drive casing remains solid');
      const relief=new THREE.Raycaster(new THREE.Vector3(side*1.10,1.14,3.68),new THREE.Vector3(side,0,0),0,.2);
      assert.equal(relief.intersectObject(hull,false).length,0,'real inner return-web relief stays empty');
    }
    for(const[z,y]of[[3.72,.7798814],[4.12,1.1239582]]) {
      const r=new THREE.Raycaster(new THREE.Vector3(0,0,z),new THREE.Vector3(0,1,0),0,2);
      close(r.intersectObject(hull,false)[0]?.point.y,y,.0001,'source central lower glacis rake');
    }
    const beyond=new THREE.Raycaster(new THREE.Vector3(0,0,4.3),new THREE.Vector3(0,1,0),0,2);
    assert.equal(beyond.intersectObject(hull,false).length,0,'central nose does not extend to the outer guard-tip datum');
    close(hit([-.005527,3.5,-4.065573],[0,-1,0])?.point.y,3.149515,.00002,'source small aft fastener has its own seated support');
    for(const[x,y]of[[1.68,1.724546],[1.86,1.629055],[1.95,1.573535],[2.04,1.494031],[2.17,1.236304]]) {
      close(hit([x,2,2],[0,-1,0])?.point.y,y,.012,'held-out source rolled shoulder, not five planar facets');
    }
    const matrix=hull.matrixWorld.toArray();
    for(const y of[-.10,.10]) for(const p of[-.12,.08]) {
      yaw.rotation.y=y;gun.rotation.x=p;tank.root.updateMatrixWorld(true);
      assert.deepEqual(hull.matrixWorld.toArray(),matrix,'gun traverse cannot rotate the casemate');
      const before=marker.getWorldPosition(new THREE.Vector3());
      recoil.position.z=-.12;tank.root.updateMatrixWorld(true);
      close(before.distanceTo(marker.getWorldPosition(new THREE.Vector3())),.12,1e-6,'tube recoils along posed axis');
      recoil.position.z=0;
    }
  } finally {tank.dispose();}
}
console.log('jagdpanzerE100X: actual high/low fixed casemate, limited-traverse cannon,170mm bore, recessed visors, raised cupola and supported rear door pass');
