import assert from 'node:assert/strict';
import {Vector3,Raycaster,Mesh,MeshBasicMaterial,DoubleSide} from 'three';
import {createTank} from '../tankFactory.ts';
import {vehicleNightLightEmittersFor} from '../vehicleNightLighting.ts';
import {smokeSocketsFor} from '../vehicleAuxiliaryGeometry.ts';

const material=new MeshBasicMaterial({side:DoubleSide});
for(const quality of ['high','low']) {
  const tank=createTank('pl01_105',null,{proceduralOnly:true,quality,geometryReceipt:true,batchStatic:false});
  try {
    const turret=tank.root.getObjectByName('rig_turret');
    const crows=turret.getObjectByName('pl01_105_crows_weapon');
    assert(crows.userData.remoteControlled && crows.userData.hasConnectedFeed,
      'the protected CROWS uses the actual articulated gun and connected ammunition feed');
    assert.equal(crows.userData.shieldVariant,'armored');
    assert(crows.getObjectByName('auxiliaryWeaponPitch'),'gun elevation retains its physical pivot');
    tank.root.updateMatrixWorld(true);
    const stock=[],lamps=[],smoke=[];
    turret.traverse(o=>{
      if(o.isMesh&&!/Fill|Proxy|Shadow/.test(o.name)) {
        const m=new Mesh(o.geometry,material);m.matrixAutoUpdate=false;m.matrix.copy(o.matrixWorld);m.updateMatrixWorld(true);m.userData.source=o;stock.push(m);
      }
      for(const emitter of vehicleNightLightEmittersFor(o))lamps.push({o,emitter});
      for(const socket of smokeSocketsFor(o))smoke.push(socket);
    });
    const newLamps=lamps.filter(({o,emitter})=>{
      const p=turret.worldToLocal(o.localToWorld(new Vector3(...emitter.position)));
      return Math.abs(p.z-.991)<.015 && Math.abs(p.y-.68)<.015;
    });
    assert.equal(newLamps.length,2,'both new cheek white-light apertures are wired for night emission');
    const ray=new Raycaster();
    for(const {o,emitter} of newLamps) {
      const position=o.localToWorld(new Vector3(...emitter.position));
      const direction=new Vector3(...emitter.direction).transformDirection(o.matrixWorld);
      ray.set(position.addScaledVector(direction,.015),direction);ray.near=0;ray.far=1;
      assert.equal(ray.intersectObjects(stock).length,0,'headlight guards do not occlude their aperture');
    }
    assert(smoke.length>=20,'original 12 smoke tubes plus eight outward-facing mission-pod tubes');
    const shell=turret.getObjectByName('turret');
    const proxy=new Mesh(shell.geometry,material);proxy.updateMatrixWorld(true);
    for(const s of [-1,1]) {
      // Bracket roots must actually enter the casting, verified against its
      // triangles rather than trusting authored attachment flags.
      for(const [x,y,z] of [[s*.60,.445,.85],[s*.64,.42,-1.68],[s*.64,.42,-2.20]]) {
        ray.set(new Vector3(x,y,z),new Vector3(s,0,0));ray.near=0;ray.far=.7;
        assert(ray.intersectObject(proxy).length>0,'cheek carrier and bustle arms root inside the solid turret');
      }
      const bank=turret.getObjectByName(`pl01_105_forward_smoke_${s}`);
      assert.equal(bank.parent,turret,'extra smoke pod follows the turret');
      const neutral=bank.getWorldPosition(new Vector3());
      turret.rotation.y=1.1;tank.root.updateMatrixWorld(true);
      assert(bank.getWorldPosition(new Vector3()).distanceTo(neutral)>1,'equipment traverses with turret');
      turret.rotation.y=0;tank.root.updateMatrixWorld(true);
    }
    // Check actual barrel launch axis at depression and elevation against
    // stationary turret equipment, including the newly added lamp carriers.
    for(const pitch of [-.1,0,.25]) {
      const gun=turret.getObjectByName('rig_gun');gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
      const muzzle=tank.gunMuzzleWorld(new Vector3());
      const dir=new Vector3(0,0,1).transformDirection(gun.matrixWorld);
      ray.set(muzzle.clone().addScaledVector(dir,.025),dir);ray.near=0;ray.far=2;
      assert.equal(ray.intersectObjects(stock).length,0,'main-gun exit remains unobstructed');
    }
    for(const yaw of [-1,0,1])for(const elevation of [0,.3]) {
      const pitch=crows.getObjectByName('auxiliaryWeaponPitch');
      crows.rotation.y=yaw;pitch.rotation.x=-elevation;tank.root.updateMatrixWorld(true);
      for(const proxy of stock){proxy.matrix.copy(proxy.userData.source.matrixWorld);proxy.updateMatrixWorld(true);}
      const muzzle=pitch.localToWorld(new Vector3(0,crows.userData.barrelAxisLocalY,crows.userData.muzzleLocalZ)
        .sub(new Vector3(...crows.userData.auxiliaryPivot)));
      const direction=new Vector3(0,0,1).transformDirection(pitch.matrixWorld);
      ray.set(muzzle.addScaledVector(direction,.03),direction);ray.near=0;ray.far=3;
      assert.equal(ray.intersectObjects(stock).length,0,'CROWS firing line clears roof equipment while traversing and elevating');
    }
  } finally {tank.dispose();}
}
const base=createTank('pl01',null,{proceduralOnly:true,quality:'low',geometryReceipt:true});
assert.equal(base.root.getObjectByName('rig_turret').userData.pl01FieldTurret,undefined,
  'the 105 mission package does not alter the base PL-01');
base.dispose();material.dispose();
console.log('pl01FieldTurret: supported brackets, working lights, smoke, articulated CROWS and clear muzzle PASS');
