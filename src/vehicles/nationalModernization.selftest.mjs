import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec,ALL_TANK_IDS} from './specs.ts';
import {NATIONAL_MODERNIZATION_CONFIG} from './nationalModernizationConfig.ts';
import {auxiliaryWeaponProfile} from './auxiliaryWeapons.ts';
import {decorManifestFor} from './decorations.ts';
import {censusEquipment} from '../../tools/source-equipment-policy.mjs';
import {tankTier} from './tier.ts';
const fingerprint=g=>createHash('sha256').update(Buffer.from(g.getAttribute('position').array.buffer)).digest('hex');
function armorFingerprint(root){const h=createHash('sha256');root.traverse(o=>{if(o.isMesh&&o.geometry?.attributes.position)h.update(Buffer.from(o.geometry.attributes.position.array.buffer));});return h.digest('hex');}
const hulls=new Map();
for(const quality of ['high','low']) {
 for(const donorId of ['t80u_x','t72b3m_x','t72b3_x']){
  const t=createTank(donorId,null,{proceduralOnly:true,quality,geometryReceipt:true});
  hulls.set(`${quality}:${donorId}`,fingerprint(t.root.getObjectByName('hull').geometry));t.dispose();
 }
 const silhouettes=new Set();
 for(const c of NATIONAL_MODERNIZATION_CONFIG){
  assert.equal(ALL_TANK_IDS.filter(id=>id===c.id).length,1);
  const spec=getSpec(c.id);assert.deepEqual(decorManifestFor(spec,()=>.5),[],`${c.id}: authored equipment has no unsupported generic overlay`);assert(spec.name.endsWith('(Concept)'));assert.equal(spec.nation,c.nation);
  assert.equal(spec.gun.caliberMm,125);assert.equal(tankTier(c.id),10);
  for(const side of ['L','R'])assert(spec.armor.hullPlates.some(p=>p.name===`skirt_era_${side}`&&p.era),`${c.id}: visible skirt ERA has a damage sector`);
  const modules=spec.armor.modules.map(m=>m.module);assert.equal(new Set(modules).size,modules.length);
  const tank=createTank(c.id,null,{proceduralOnly:true,quality,geometryReceipt:true,camoSeed:4242});
  try {
   const hull=tank.root.getObjectByName('hull'),turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
   assert.equal(fingerprint(hull.geometry),hulls.get(`${quality}:${c.donor}`),`${c.id} hull preservation`);
   silhouettes.add(fingerprint(tank.root.getObjectByName('turret').geometry));
   turret.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.turretPivot[i])<.001));
   gun.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.gunPivot[i])<.001));
   assert.equal(censusEquipment(tank.root).mg,1,`${c.id}: one physical machine gun, separate support mount`);
   let stations=0; tank.root.traverse(o=>{if(o.userData.remoteControlled)stations++});assert.equal(stations,1,`${c.id} one complete remote weapon`);
   for(const yaw of [-Math.PI,0,1.47])for(const pitch of [-.12,.25]){
    turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
    assert(tank.gunMuzzleWorld(new Vector3()).toArray().every(Number.isFinite));
   }
   assert(!auxiliaryWeaponProfile(12.7,c.id).shell.name.includes('roof'));
   const live=armorFingerprint(tank.root);
   for(const sector of ['skirt_era_L','skirt_era_R']){
    assert.equal(tank.stripEra(sector),true,`${c.id}: live skirt ERA is removable`);
    const spent=armorFingerprint(tank.root);assert.notEqual(spent,live);
    assert.equal(fingerprint(hull.geometry),hulls.get(`${quality}:${c.donor}`),'spent ERA preserves chassis');
    tank.stripEra(sector);assert.equal(armorFingerprint(tank.root),spent,'repeat hit is idempotent');
    assert.equal(tank.resetEra(),true);assert.equal(armorFingerprint(tank.root),live,'round reset restores armor');
   }
  }finally{tank.dispose()}
 }
 assert.equal(silhouettes.size,12,`${quality}: each concept has a distinct structural turret`);
}
assert.equal(getSpec('t62mv1_x').gun.caliberMm,125);
assert.equal(tankTier('bmpt_terminator2'),9);
console.log('National modernization: 12 registrations, original concepts, donor hulls, distinct upper structures, module owners, yaw/pitch and remote weapons PASS');
