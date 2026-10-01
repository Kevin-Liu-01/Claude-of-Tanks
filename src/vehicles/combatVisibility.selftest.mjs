import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec,PRODUCTION_TANK_IDS} from './specs.ts';
import {createTankState} from '../sim/movement.ts';
import {createHash} from 'node:crypto';

function submitted(object,root){
  for(let node=object;node;node=node.parent){if(!node.visible)return false;if(node===root)return true;}
  return false;
}
function geometryHash(root){
 const hash=createHash('sha256');root.traverse(o=>{
  for(const attribute of [o.geometry?.attributes.position,o.instanceMatrix]){
   if(attribute)hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
  }
 });return hash.digest('hex');
}
// Every missile platform plus representative armor/roof-gun families. These are
// actual rendered objects and renderer LOD selection, not just policy predicates.
const ids=PRODUCTION_TANK_IDS.filter(id=>['m1a2','t90m','t90m_proryv'].includes(id)
 || getSpec(id).armor.externalWeapons?.length);
let checks=0, guns=0, smoke=0, era=0;
for(const id of ids)for(const quality of ['high','low']){
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:true,battleDetailLod:true,camoSeed:4242});
 try{
  const spec=getSpec(id),state=createTankState(spec,new Vector3(),0);
  const camera=new PerspectiveCamera(60,16/9,.1,2000),required=[];
  const weaponBuckets=new Set(tank.root.userData.weaponGeometryParts?.map(part=>part.bucket));
  tank.root.traverse(o=>{
   if(o.userData.weaponName)guns++;
   if(o.userData.fitting==='smokeBank')smoke++;
   if(o.isMesh && (['armor','externalArmor','equipment'].includes(o.userData.combatHitboxRole)
     || weaponBuckets.has(o.name) || o.userData.fitting==='smokeBank'
     || o.userData.appearanceRole==='machineGun' || o.userData.smokeSockets?.length)) required.push(o);
  });
  assert.ok(required.length>0,`${id} has real combat stock`);
  for(const distance of [20,70,160,400,720,40]){
   state.turretYaw=.7;state.gunPitch=.1;tank.syncFromState(state,0,distance);
   camera.position.set(0,4,distance);camera.updateMatrixWorld(true);
   tank.root.updateMatrixWorld(true);tank.root.traverse(o=>{if(o.isLOD)o.update(camera);});
   for(const object of required){assert.ok(submitted(object,tank.root),`${id}/${quality}/${distance}m: ${object.name} must render`);checks++;}
  }
  // Spent ERA still disappears through its real damage owner and resets; range
  // retention never forces destroyed geometry back on.
  tank.syncFromState(state,0);tank.root.traverse(o=>{if(o.isLOD)o.update(camera);});
  const cluster=tank.root.userData.eraClusterNames?.[0];
  if(cluster){
   const intact=geometryHash(tank.root);assert.equal(tank.stripEra(cluster),true);
   assert.notEqual(geometryHash(tank.root),intact,`${id}: spent ERA changes its original stock`);
   tank.resetEra();assert.equal(geometryHash(tank.root),intact,`${id}: repair restores stock`);era++;
  }
 }finally{tank.dispose();}
}
assert.ok(guns>0 && smoke>0 && era>0,'coverage includes roof guns, smoke banks and consumable ERA');
console.log(`combatVisibility: ${ids.length} vehicles, high/low, six distances; ${checks} submitted-mesh checks; ${era} ERA damage/reset checks`);
