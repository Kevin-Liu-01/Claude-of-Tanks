import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {TANK_SPECS} from './specs.ts';
import {AUXILIARY_INVENTORY} from './auxiliaryInventory.generated.ts';
import {auxiliaryWeaponProfile} from './auxiliaryWeapons.ts';
import {requestAuxiliary,stepRoofGun,auxiliaryShot} from '../sim/auxiliarySystems.ts';
const requested={t14_x:7.62,t90a_vladimir_x:12.7,t90a_x:12.7,t90ms:12.7,
 t90m_proryv:12.7,t90:12.7,t14:30,challenger_3x:12.7,challenger_3:12.7,
 challenger2e:7.62,ztz100_x:12.7,type10_x:12.7,k2_x:12.7,k1a1_x:12.7,
 strv122_x:7.62,merkava4_trophy:7.62,merkava4_x:7.62,leo2a6_ua:7.62,ua_challenger2:7.62};
const vector=a=>new THREE.Vector3(...a);
for(const [id,caliber] of Object.entries(requested)){
 const kit=AUXILIARY_INVENTORY[id];assert.equal(kit.guns.length,1,id+' has one controlled station');
 const g=kit.guns[0];assert.equal(g.caliberMm,caliber,id);
 const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true});
 const mount=tank.root.getObjectByName(g.name),pitch=mount?.getObjectByName('auxiliaryWeaponPitch');
 assert.ok(mount&&pitch,id+' has physical yaw and elevation owners');
 const meshes=[];pitch.traverse(o=>{if(o.isMesh)meshes.push(o)});assert.ok(meshes.length,id+' pitches actual gun stock');
 tank.root.updateMatrixWorld(true);
 // The socket must touch authored weapon metal, not merely an invented offset.
 const socket=vector(g.muzzle).sub(vector(g.pivot)).applyMatrix4(pitch.matrixWorld);
 let nearest=Infinity;
 for(const mesh of meshes){const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)nearest=Math.min(nearest,new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).distanceTo(socket));}
 assert.ok(nearest<.10,`${id}: muzzle ${nearest.toFixed(3)}m from actual weapon metal`);
 const restQ=mount.quaternion.clone(),restPivot=pitch.position.clone();
 for(const [yaw,elevation] of [[0,0],[1.4,.5],[-2.2,-.12]]){
  mount.quaternion.copy(restQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw));
  pitch.rotation.x=-elevation;tank.root.updateMatrixWorld(true);
  assert.ok(pitch.position.distanceTo(restPivot)<1e-10,id+' bearing stays seated');
  const actual=vector(g.muzzle).sub(vector(g.pivot)).applyMatrix4(pitch.matrixWorld);
  assert.ok(Number.isFinite(actual.x+actual.y+actual.z),id+' finite articulated muzzle');
 }
 const shooter={id:'shooter',team:'blue',spec:TANK_SPECS[id],state:{pos:{x:3,y:2,z:1},yaw:.2,turretYaw:.3,visualPitch:.03,visualRoll:-.04},combat:{ammo:[4,6],reload:{t:9}}};
 const target={id:'enemy',team:'red',spec:{id:'target',dims:{heightM:2.5}},state:{pos:{x:38,y:2,z:95},yaw:0,turretYaw:0},combat:{}};
 assert.equal(requestAuxiliary(shooter,'roofGun',0),true,id+' toggle works');
 const context={entities:[shooter,target],visible:()=>true,clear:()=>true};
 let fired=false;
 for(let i=0;i<700&&!fired;i++)fired=stepRoofGun(shooter,i/60,1/60,context);
 assert.ok(fired,id+' acquires a visible opponent');assert.equal(auxiliaryShot.shell.caliberMm,caliber);
 assert.deepEqual(shooter.combat.ammo,[4,6]);assert.equal(shooter.combat.reload.t,9,id+' independent main reload');
 const hull=new THREE.Group(),turret=new THREE.Group(),root=new THREE.Group(),gun=new THREE.Group();
 hull.position.copy(vector(Object.values(shooter.state.pos)));hull.rotation.set(-.03,.2,-.04,'YXZ');
 turret.position.fromArray(kit.turretPivot);turret.rotation.y=.3;hull.add(turret);
 root.position.fromArray(g.position);root.scale.fromArray(g.scale);root.quaternion.fromArray(g.rotation)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),shooter.combat.auxiliary.gunYaw));turret.add(root);
 gun.position.fromArray(g.pivot);gun.rotation.x=-shooter.combat.auxiliary.gunPitch;root.add(gun);hull.updateMatrixWorld(true);
 const delta=vector(g.muzzle).sub(vector(g.pivot)).applyMatrix4(gun.matrixWorld).distanceTo(auxiliaryShot.origin);

 assert.ok(delta<1e-6,id+' authority/presentation muzzle parity '+delta);
 target.state.pos.z=500;assert.equal(stepRoofGun(shooter,20,1/60,context),false,id+' obeys effective range');
 tank.dispose();console.log(id+' mounted '+caliber+' mm PASS');
}
assert.ok(auxiliaryWeaponProfile(7.62).shell.pen100Mm<auxiliaryWeaponProfile(12.7).shell.pen100Mm);
assert.ok(auxiliaryWeaponProfile(12.7).shell.pen100Mm<auxiliaryWeaponProfile(30).shell.pen100Mm);
assert.notEqual(auxiliaryWeaponProfile(7.62).burstRounds,auxiliaryWeaponProfile(30).burstRounds);
// User's decorative C2 roof cannon must remain unarmed.
assert.equal(AUXILIARY_INVENTORY.ariete_c2_x?.guns.length??0,0);
console.log('remoteGunFleet: all 19 requested mounts, muzzle metal, articulation, range and independent firing PASS');
