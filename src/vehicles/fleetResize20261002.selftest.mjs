import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {VEHICLE_SIZE_FACTORS,VEHICLE_HULL_LENGTH_FACTORS} from './vehicleSizePolicy.ts';
const before=JSON.parse(readFileSync(new URL('./fleetResize20261002.fixture.json',import.meta.url)));
assert.equal(before.revision,'1e6b4b738179721483f647ef04fe6ee3b249849f');
// 2026-10-08: c6b60311c (main) rebuilt the Dragun turret front and gun mount and the Kurganets gun after that
// measurement; the fixture's repinned20261008 note lists the entries re-measured as the current build / factor.
const near=(a,b,label,tol=2e-5)=>assert(Math.abs(a-b)<tol,`${label}: ${a} != ${b}`);
for(const [id,b] of Object.entries(before.rows)){
 const f=VEHICLE_SIZE_FACTORS[id],h=VEHICLE_HULL_LENGTH_FACTORS[id]??1,spec=getSpec(id);
 for(const [key,v] of Object.entries(b.dims)){
  const expected=key==='hullLengthM'?v*h*f:key==='overallLengthM'?(v+b.dims.hullLengthM*(h-1)/2)*f:v*f;
  near(spec.dims[key],expected,`${id}/${key}`);
 }
 for(const quality of ['high','low']){
  const old=b.qualities[quality],t=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true});
  try{
   t.root.updateMatrixWorld(true);
   for(const [name,bounds] of Object.entries(old.boxes)){
    const mesh=t.root.getObjectByName(name);assert(mesh,`${id}/${name}`);mesh.geometry.computeBoundingBox();
    for(const side of ['min','max'])mesh.geometry.boundingBox[side].toArray().forEach((v,k)=>
     near(v,bounds[side][k]*f*(name==='hull'&&k===2?h:1),`${id}/${quality}/${name}/${side}/${k}`));
   }
   for(const [name,key] of [['rig_turret','turret'],['rig_gun','gun']]){
    const rig=t.root.getObjectByName(name);
    rig.position.toArray().forEach((v,k)=>near(v,old[key][k]*f,`${id}/${name}/${k}`));
   }
   t.gunMuzzleWorld(new Vector3()).toArray().forEach((v,k)=>near(v,old.muzzle[k]*f,`${id}/muzzle/${k}`));
   for(const key of ['halfWidM','bottomYM'])near(t.contactGeom[key],old.contact[key]*f,`${id}/contact/${key}`);
   // 2026-10-04 (aa5fdca05): the track run's length and centre are read off the drawn band and published with the
   // combat anatomy (4 decimals), not the profile's pinned flat run this 1e6b4b738 fixture measured.
   for(const key of ['halfLenM','zCenterM'])near(t.contactGeom[key],spec.armor.trackContact[key],`${id}/contact/${key} (published)`,6e-5);
   if(h!==1){
    const gear=t.root.getObjectByName('rig_hull').userData.runningGearReceipts.at(-1);
    // Pure chassis lengthening must never turn circular tires into ellipses.
    const wheel=t.root.getObjectByName('gearRoadWheelDiscs');assert(wheel);
    const e=wheel.matrixWorld.elements;
    near(Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10]),`${id}: wheel Y/Z transform remains circular`);
    near(gear.wheelR,.31,`${id}: circular wheel radius`);
    near(Math.max(...gear.wheelZs)-Math.min(...gear.wheelZs),3.60*h,`${id}: axle spacing`);
    near(gear.sprocket.z,-2.46*h,`${id}: sprocket station`);
    near(gear.idler.z,2.54*h,`${id}: idler station`);
   }
   const yaw=t.root.getObjectByName('rig_turret'),pitch=t.root.getObjectByName('rig_gun');
   for(const angle of [-Math.PI/2,Math.PI/2,Math.PI]){
    yaw.rotation.y=angle;pitch.rotation.x=-.1;t.root.updateMatrixWorld(true);
    for(let i=0;i<(spec.gun.launcherMuzzles?.length??0);i++){
     const mouth=spec.gun.launcherMuzzles[i],owner=mouth.frame==='turret'?yaw:pitch;
     const expected=owner.localToWorld(new Vector3(mouth.x,mouth.y,mouth.z));
     assert(t.gunMuzzleWorld(new Vector3(),i,true).distanceTo(expected)<1e-5,`${id}: missile mouth follows resized station`);
    }
   }
   t.resetForGaragePresentation();assert.deepEqual(t.root.scale.toArray(),[1,1,1]);
  }finally{t.dispose();}
 }
}
console.log('fleetResize20261002: eleven baseline-relative high/low hulls, barrels, pivots, missile mouths and circular extended wheel courses PASS');
