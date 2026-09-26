import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Matrix4, Vector3 } from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { synchronizeIfvReplicaCombatMetadata } from './ifvReplicaSpecs.ts';
import { censusEquipment } from '../../tools/source-equipment-policy.mjs';

const pairs=[['spz_puma_s1','spz_puma_s1_x',30,2],['cv90','cv90_x',40,0],['type89_light_tiger','type89_x',35,2]];
const originals=new Map([...pairs.map(([id])=>id),'cv90_mkiv','cv90_mkiv_x'].map(id=>[id,structuredClone(getSpec(id))]));
const replicaAnatomy=new Map(pairs.map(([,id])=>[id,structuredClone(getSpec(id).armor)]));
synchronizeIfvReplicaCombatMetadata();synchronizeIfvReplicaCombatMetadata();
for(const [id,armor] of replicaAnatomy)assert.deepEqual(getSpec(id).armor,armor,`${id}: synchronization preserves finalized anatomy`);
for(const [id,old] of originals)assert.deepEqual(getSpec(id),old,`${id}: replica synchronization never mutates an existing slot`);
function shoeFloor(mesh){
  const positions=mesh.geometry.attributes.position,matrix=new Matrix4(),point=new Vector3();
  let floor=Infinity;
  for(let j=0;j<mesh.count;j++){
    mesh.getMatrixAt(j,matrix);if(Math.abs(matrix.determinant())<1e-10)continue;
    matrix.premultiply(mesh.matrixWorld);
    for(let i=0;i<positions.count;i++)floor=Math.min(floor,point.fromBufferAttribute(positions,i).applyMatrix4(matrix).y);
  }
  return floor;
}
function shape(root,name){
  const mesh=root.getObjectByName(name);assert(mesh?.isMesh,`${name}: actual drawn armor exists`);
  return createHash('sha256').update(Buffer.from(mesh.geometry.attributes.position.array.buffer)).digest('hex');
}
for(const [original,id,caliber,tubes] of pairs){
  assert(PRODUCTION_TANK_IDS.includes(original)&&PRODUCTION_TANK_IDS.includes(id),'both versions remain selectable');
  const s=getSpec(id);assert.notEqual(s,getSpec(original));assert.equal(s.gun.caliberMm,caliber);
  const missiles=s.gun.shells.filter(r=>r.guided);assert.equal(missiles.length>0,tubes>0);
  for(const round of missiles)assert.equal(round.launcherTubes,tubes);
  assert.equal(s.gun.launcherMuzzles?.length??0,tubes);
  const previous=createTank(original,null,{proceduralOnly:true,quality:'high',geometryReceipt:true,decor:false});
  try{for(const quality of ['high','low']){
    const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,decor:false});
    try{
      tank.root.updateMatrixWorld(true);
      const b=new Box3().setFromObject(tank.root),size=b.getSize(new Vector3());
      assert(size.toArray().every(v=>Number.isFinite(v)&&v>0),'finite exterior');
      // Angled instance boxes include empty corners; measure the real shoe soles.
      const floor=shoeFloor(tank.root.getObjectByName('gearTrackPads'));
      assert(floor>=-.004&&floor<.001,`${id}/${quality}: actual shoe floor ${floor}`);
      for(const part of ['hull','turret'])assert.notEqual(shape(tank.root,part),shape(previous.root,part),`${id}: independent ${part}`);
      assert.equal(tank.root.getObjectByName('rig_hull').userData.advancedIfvScaleReceipt,undefined,'replica uses metre frame, not old 90% concept frame');
      assert.equal(censusEquipment(tank.root).mg,0,'no invented roof RWS');
      const gun=tank.root.getObjectByName('rig_gun');
      assert(tank.root.getObjectByName('gunMount').parent===gun,'rocking shield moves with cannon');
      for(let i=0;i<tubes;i++)assert(tank.root.getObjectByName(`rig_launcher_tip_${i}`),'native launcher tip');
      const muzzle0=new Vector3(),muzzle1=new Vector3();tank.gunMuzzleWorld(muzzle0);
      gun.rotation.x=-.25;tank.root.updateMatrixWorld(true);tank.gunMuzzleWorld(muzzle1);
      assert(muzzle1.distanceTo(muzzle0)>.25,'gun actually articulates');
      assert.equal(s.armor.crew.length,3,'three vehicle crew, no invented loader');
      assert.equal(s.armor.crew.some(c=>c.turretLocal),id!=='spz_puma_s1_x','correct remote or manned turret layout');
    }finally{tank.dispose();}
  }}finally{previous.dispose();}
}
console.log('IFV replicas: additive roster, isolated synchronization, real equipment, independent HIGH/LOW geometry and articulation passed');
