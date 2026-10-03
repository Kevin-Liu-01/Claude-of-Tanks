import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {FLEET_RENEWAL_NEW_IDS,FLEET_RENEWAL_DONORS} from './fleetRenewalSpecs.ts';
import {VEHICLE_ROLE_PROFILES} from './roleProfiles.ts';
import {ensureInteriorFills} from './interiorFills.ts';

const donors={...FLEET_RENEWAL_DONORS,bmpt_terminator2:'t80u_x',t84:'t72b3m_x',
  type96_72_long:'t72b3_x',type96_80_feng:'t80u_x',type96_72m_lei:'t72b3m_x'};
const stock=mesh=>Array.from(mesh.geometry.getAttribute('position').array);
assert.equal(getSpec('t72b3m').name,'T-72B3M obr. 2022');
assert.equal(getSpec('t72b3m_x').name,'T-72B3M obr. 2016');
for(const id of FLEET_RENEWAL_NEW_IDS) {
  assert(getSpec(id).name.includes('(Concept)'),'original hybrids are clearly named concepts');
  assert(VEHICLE_ROLE_PROFILES[id],'explicit shared scouting/concealment profile');
  assert.equal(getSpec(id).gun.caliberMm,125);
  const modules=getSpec(id).armor.modules.map(m=>m.module);
  assert.equal(new Set(modules).size,modules.length,'hybrid modules have one damage owner');
}
for(const quality of ['high','low']) for(const [id,donorId] of Object.entries(donors)) {
  const options={quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242};
  const tank=createTank(id,null,options),donor=createTank(donorId,null,options);
  try {
    assert.deepEqual(stock(tank.root.getObjectByName('hull')),stock(donor.root.getObjectByName('hull')),
      `${id}/${quality}: retains the complete requested donor hull`);
    assert.equal(tank.root.getObjectByName('gearRoadWheelDiscs').count,
      donor.root.getObjectByName('gearRoadWheelDiscs').count,`${id}: complete donor wheel course`);
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    const spec=getSpec(id);
    turret.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.turretPivot[i])<.001,`${id}: installed ring matches hit frame`));
    gun.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.gunPivot[i])<.001,`${id}: installed trunnion matches hit frame`));
    for(const yaw of [-1.47,0,1.47]) {
      turret.rotation.y=yaw;gun.rotation.x=-.15;tank.root.updateMatrixWorld(true);
      assert(tank.gunMuzzleWorld(new Vector3()).toArray().every(Number.isFinite));
    }
    if(id==='bmpt_terminator2') {
      const sectors=tank.root.userData.eraFinishReceipt?.sectors??[];
      assert(!sectors.some(s=>s.startsWith('turret_era_')),'replaced turret cannot leave ghost donor ERA');
    }
    if(id==='t84') {
      for(const sector of ['oplot_cheek_era_L','oplot_cheek_era_R','oplot_side_era_L','oplot_side_era_R']) {
        assert(spec.armor.turretPlates.some(p=>p.name===sector&&p.era),`${id}: ${sector} retains reactive protection`);
        assert(tank.stripEra(sector),`${id}: ${sector} removes the corresponding visible cassette`);
      }
      tank.resetEra();
    }
  } finally {tank.dispose();donor.dispose();}
}
// This final-stock path reproduces the player's visible stair-step defect.
// The command tank has closed native shells; its external kit must not grow
// a voxel grid between roof optics, ERA, smoke tubes and the turret casting.
await ensureInteriorFills(['t80u']);
for(const quality of ['high','low']) {
  const t=createTank('t80u',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    const fills=[];t.root.traverse(o=>{if(o.isMesh&&/InteriorFill/.test(o.name))fills.push(o)});
    assert.equal(fills.length,0,'no generated stair/grid stock outside T-80UK shell');
  } finally {t.dispose();}
}
console.log('Fleet renewal: donor hulls/wheels, two B3M identities, four concepts, hit-frame articulation and T-80UK voxel regression PASS');
