import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {FLEET_RENEWAL_NEW_IDS,FLEET_RENEWAL_DONORS} from './fleetRenewalSpecs.ts';
import {VEHICLE_ROLE_PROFILES} from './roleProfiles.ts';
import {ensureInteriorFills} from './interiorFills.ts';
import {COMBAT_GUN_RIGS} from './combatGunRigs.generated.ts';

// 267: the BMPT-72 (bmpt_terminator2) rides the T-72B3M (2016) X hull (it was the T-80U's)
// 274: the T-84 left this list with its Oplot concept; it draws the T-80U X hull (t80Marks.selftest.mjs holds it)
const donors={...FLEET_RENEWAL_DONORS,bmpt_terminator2:'t72b3m_2016',
  type96_72_long:'t72b3',type96_80_feng:'t80u',type96_72m_lei:'t72b3m_2016'};
const stock=mesh=>Array.from(mesh.geometry.getAttribute('position').array);
assert.equal(getSpec('t72b3m_2022').name,'T-72B3M obr. 2022');
assert.equal(getSpec('t72b3m_2016').name,'T-72B3M obr. 2016');
for(const id of FLEET_RENEWAL_NEW_IDS) {
  // the owner (2026-10-21) dropped the tag from the Fēng's and the Léi's names; the Ryś and the Lóng keep it for now
  if (id === 'type96_80_feng' || id === 'type96_72m_lei') assert(!/concept/i.test(getSpec(id).name), `${id}: no concept tag in the name`);
  else assert(getSpec(id).name.includes('(Concept)'),'original hybrids are clearly named concepts');
  assert(VEHICLE_ROLE_PROFILES[id],'explicit shared scouting/concealment profile');
  assert.equal(getSpec(id).gun.caliberMm,125);
  const modules=getSpec(id).armor.modules.map(m=>m.module);
  assert.equal(new Set(modules).size,modules.length,'hybrid modules have one damage owner');
}
for(const quality of ['high','low']) for(const [id,donorId] of Object.entries(donors)) {
  const options={quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242};
  const tank=createTank(id,null,options),donor=createTank(donorId,null,options);
  try {
    const hull=stock(tank.root.getObjectByName('hull')),donorHull=stock(donor.root.getObjectByName('hull'));
    if(id==='t62mv1') {
      // 274 (lane t62-275): one family builder draws both T-62 marks; the MV's splash board (the hull's last box, 36
      // vertices) sits lower on the upper plate, under its Kontakt-1 field, and every other hull vertex is the obr. 1975's
      const box=36*3;
      assert.equal(hull.length,donorHull.length,`${id}/${quality}: the obr. 1975 hull's vertex count`);
      assert.deepEqual(hull.slice(0,-box),donorHull.slice(0,-box),`${id}/${quality}: retains the obr. 1975 hull`);
      for(let i=hull.length-box;i<hull.length;i+=3)assert.equal(hull[i],donorHull[i],`${id}/${quality}: the splash board only slides down the plate`);
    } else assert.deepEqual(hull,donorHull,`${id}/${quality}: retains the complete requested donor hull`);
    assert.equal(tank.root.getObjectByName('gearRoadWheelDiscs').count,
      donor.root.getObjectByName('gearRoadWheelDiscs').count,`${id}: complete donor wheel course`);
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    const spec=getSpec(id);
    turret.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.turretPivot[i])<.001,`${id}: installed ring matches hit frame`));
    // 230: a combat-rig row (combatGunRigs.generated.ts) is the hit frame, and its trunnion is rig_gun projected onto the
    // drawn bore line (the T-80UK's sits 8.7 mm over rig_gun): the trunnion is drawn on the hit frame's bore, not at it
    const row=COMBAT_GUN_RIGS[id];
    if(row){
      assert.deepEqual([...spec.armor.turretPivot,...spec.armor.gunPivot],[...row.turretPivot,...row.gunPivot],`${id}: the hit frame is its combat-rig row`);
      [0,2].forEach(i=>assert(Math.abs(gun.position.getComponent(i)-row.gunPivot[i])<.001,`${id}: installed trunnion on the hit frame's bore`));
      assert(Math.abs(gun.position.y-row.gunPivot[1])<.01,`${id}: installed trunnion within 1 cm of the drawn bore`);
    } else gun.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.gunPivot[i])<.001,`${id}: installed trunnion matches hit frame`));
    for(const yaw of [-1.47,0,1.47]) {
      turret.rotation.y=yaw;gun.rotation.x=-.15;tank.root.updateMatrixWorld(true);
      assert(tank.gunMuzzleWorld(new Vector3()).toArray().every(Number.isFinite));
    }
    if(id==='bmpt_terminator2') {
      const sectors=tank.root.userData.eraFinishReceipt?.sectors??[];
      assert(!sectors.some(s=>s.startsWith('turret_era_')),'replaced turret cannot leave ghost donor ERA');
    }
  } finally {tank.dispose();donor.dispose();}
}
// This final-stock path reproduces the player's visible stair-step defect.
// The command tank has closed native shells; its external kit must not grow
// a voxel grid between roof optics, ERA, smoke tubes and the turret casting.
await ensureInteriorFills(['t80uk']);
for(const quality of ['high','low']) {
  const t=createTank('t80uk',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    const fills=[];t.root.traverse(o=>{if(o.isMesh&&/InteriorFill/.test(o.name))fills.push(o)});
    assert.equal(fills.length,0,'no generated stair/grid stock outside T-80UK shell');
  } finally {t.dispose();}
}
console.log('Fleet renewal: donor hulls/wheels, two B3M identities, four concepts, hit-frame articulation and T-80UK voxel regression PASS');
