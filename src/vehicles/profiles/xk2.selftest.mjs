import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {XK2_FRAME as D} from './xk2Frame.ts';
import {synchronizeSourceXCombatMetadata} from '../sourceXFleetSpecs.ts';

const options={proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242};
const hash=geometry=>{
  const h=createHash('sha256');
  for(const a of [geometry.attributes.position,geometry.attributes.normal,geometry.index])
    if(a)h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
  return h.digest('hex');
};
function turretStock(tank){
  const rows=[];
  tank.root.getObjectByName('rig_turret').traverse(o=>{
    if(!o.isMesh||o.userData.shadowOnly||o.userData.vehicleMarking||/interior|Shadow/.test(o.name))return;
    rows.push({name:o.name,hash:hash(o.geometry),matrix:o.matrix.toArray()});
  });
  return rows;
}
function receivingClearance(tank,yaw){
  const turret=tank.root.getObjectByName('rig_turret');
  turret.rotation.y=yaw;tank.root.updateMatrixWorld(true);
  const hull=tank.root.getObjectByName('hull'),shell=tank.root.getObjectByName('turret');
  const original=[hull.material.side,shell.material.side];
  hull.material.side=shell.material.side=T.DoubleSide;
  try {
    for(let x=-1.5;x<=1.5;x+=.2)for(let z=-2.9;z<=2.6;z+=.2){
      // The rotating ring deliberately overlaps the shallow fixed bearing.
      if(Math.hypot(x,z-D.turretPivot[2])<1.39)continue;
      const deck=new T.Raycaster(new T.Vector3(x,3,z),new T.Vector3(0,-1,0)).intersectObject(hull,false)[0];
      const floor=new T.Raycaster(new T.Vector3(x,0,z),new T.Vector3(0,1,0)).intersectObject(shell,false)[0];
      if(deck&&floor)assert(floor.point.y>=deck.point.y-.005,
        `turret penetrates deck at yaw ${yaw}, x/z ${x}/${z}: ${floor.point.y} < ${deck.point.y}`);
    }
  } finally {hull.material.side=original[0];shell.material.side=original[1];}
}
for(const quality of ['high','low']){
  const tank=createTank('k2',null,{...options,quality});
  const donor=createTank('k1a1_x',null,{...options,quality});
  try {
    tank.root.updateMatrixWorld(true);donor.root.updateMatrixWorld(true);
    assert.deepEqual(turretStock(tank),turretStock(donor),`${quality}: complete donor turret, gun and fittings preserved`);
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    assert.deepEqual(turret.position.toArray(),D.turretPivot);
    assert.deepEqual(gun.position.toArray(),D.gunPivot);
    assert.equal(tank.root.getObjectByName('gearRoadWheelDiscs').count,12,'retain six original road wheels per side');
    const bounds=new T.Box3().setFromObject(tank.root);
    assert(Math.abs(bounds.min.z+3.769)<1e-5,'original rear hull envelope');
    assert(Math.abs(bounds.max.y-D.tallestM)<1e-5,'complete donor roof equipment');
    for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2])receivingClearance(tank,yaw);
    for(const pitch of [-10,0,20]){
      gun.rotation.x=-T.MathUtils.degToRad(pitch);tank.root.updateMatrixWorld(true);
      const muzzle=gun.localToWorld(new T.Vector3(0,0,D.barrelLengthM));
      assert(muzzle.toArray().every(Number.isFinite),'finite articulated muzzle');
      assert(gun.parent===turret,'gun continues to pitch inside the rotating turret');
    }
  } finally {tank.dispose();donor.dispose();}
}
const productionFrame=()=>{
  const spec=getSpec('k2_x');
  return structuredClone({dims:spec.dims,ring:spec.armor.turretPivot,
    gun:spec.armor.gunPivot,barrel:spec.armor.gunBarrel,weapon:spec.gun,
    traverse:spec.turretTraverseDegS,pitchSpeed:spec.gunPitchDegS});
};
assert.deepEqual(getSpec('k2').gun,{...structuredClone(getSpec('k1a1_x').gun),reloadS:6.5},
  'the hybrid carries the K1A1 gun/ammunition with its prototype loading cycle');
assert.equal(getSpec('k2_x').gun.reloadS,5.7,'production K2 keeps its original loading cycle');
assert.equal(getSpec('k2_x').gun.shells[0].name,'K279 APFSDS','production K2 keeps its ammunition');
const production=productionFrame();
await import('../fleetFactory.ts');
synchronizeSourceXCombatMetadata();
assert.deepEqual(productionFrame(),production,'mixed facade imports do not transplant the hybrid into production K2');
console.log('xk2: HIGH/LOW complete K1A1 turret, retained XK2 suspension, deck clearance and independent production K2 pass');
