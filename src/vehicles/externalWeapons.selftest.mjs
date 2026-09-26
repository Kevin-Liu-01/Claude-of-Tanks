import assert from 'node:assert/strict';
import { Vector3, Matrix3 } from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { traceTank, tankPoseFromState } from '../sim/armor.ts';
import { createCombatState, resolveShellHit, startMagazineReload, startReload } from '../sim/damage.ts';
import { createShell } from '../sim/ballistics.ts';

const ids=PRODUCTION_TANK_IDS.filter(id=>getSpec(id).gun.shells.some(w=>w.launcherTubes>0));
// Puma S1 X, Type 89 X and Borsuk add three physical launcher installations.
assert.equal(ids.length,28,'external-launcher fleet census must be reviewed when the roster changes');
for(const id of PRODUCTION_TANK_IDS.filter(id=>!ids.includes(id))) {
  assert.equal(getSpec(id).armor.externalWeapons,undefined,
    `${id}: conventional vehicles do not gain launcher metadata or inherited donor hitboxes`);
}
let probes=0, damageChecks=0;
const round={name:'weapon probe',type:'APFSDS',caliberMm:120,pen100Mm:1000,pen1000Mm:1000,
  dmg:100,velocityMps:1000,moduleDmg:80};
for(const id of ids){
  const spec=getSpec(id);
  assert(spec.armor.externalWeapons?.length,`${id}: external launcher collision is registered`);
  assert(spec.armor.modules.some(module=>module.module==='missileRack'),
    `${id}: launcher is linked to a real damageable module`);
  for(const quality of ['high','low']){
    const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,camoSeed:4242});
    try{
      const native=tank.root.userData.weaponGeometryParts;
      assert(native.length,`${id}: profile tags native weapon stock`);
      const meshes=new Map();tank.root.traverse(o=>{if(o.geometry&&!meshes.has(o.name))meshes.set(o.name,o);});
      const poses=[[0,0],[.9,.18],[-1.4,spec.gunElevationDeg*Math.PI/180],
        [1.7,-spec.gunDepressionDeg*Math.PI/180]];
      for(const [yaw,pitch] of poses){
        const state=createTankState(spec,new Vector3(3,0,7),.2);
        state.turretYaw=yaw;state.gunPitch=pitch;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
        for(const part of native){
          // The largest real face gives a stable probe through finite stock,
          // not a hand-written expected hitbox or the center of a hollow tube.
          let area=0,center,normal;
          for(let i=0;i<part.indices.length;i+=3){
            const [a,b,c]=part.indices.slice(i,i+3).map(j=>new Vector3(...part.positions[j]));
            const n=b.clone().sub(a).cross(c.clone().sub(a)),size=n.lengthSq();
            if(size<=area)continue;area=size;normal=n.normalize();center=a.add(b).add(c).multiplyScalar(1/3);
          }
          if(!center)continue;
          const mesh=meshes.get(part.bucket);center.applyMatrix4(mesh.matrixWorld);
          normal.applyMatrix3(new Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
          const broadphaseCenter=state.pos.clone();broadphaseCenter.y+=spec.dims.heightM*.5;
          assert(center.distanceTo(broadphaseCenter)<=spec.armor.boundingRadiusM,
            `${id}: solo battle broadphase retains the articulated launcher`);
          assert(center.distanceTo(state.pos)<=spec.armor.boundingRadiusM+2,
            `${id}: authoritative battle broadphase retains the articulated launcher`);
          // Collision stays identical across graphics settings. Low-detail
          // tubes use 8-sided chords instead of 16-sided chords (up to 11 mm
          // inward at these radii), so allow 20 mm only for that LOD surface.
          const tolerance=quality==='low'?.02:.006;
          const from=center.clone().addScaledVector(normal,tolerance),to=center.clone().addScaledVector(normal,-tolerance);
          const hits=traceTank(from,to,tankPoseFromState(state),spec.armor);
          const housing=hits.find(h=>h.kind==='plate'&&h.plate.weaponHousing&&h.plate.moduleLink===part.module);
          assert(housing,`${id}/${quality}/${part.bucket}: native stock receives damage at yaw=${yaw} pitch=${pitch}`);
          assert(housing.point.distanceTo(center)<tolerance,`${id}: close-fitting collision matches visible stock`);
          probes++;
          if(quality==='high'&&yaw===0&&part.module==='missileRack'&&!hits.some(h=>h.kind==='plate'&&h.plate.kind==='main')){
            const combat=createCombatState(spec),target={id,spec,state,combat};
            const shell=createShell(round,'probe',false,from,to.clone().sub(from).normalize(),1);shell.pos.copy(to);
            const event=resolveShellHit(shell,target,hits,()=>0);
            assert.equal(event.modulesHit.filter(h=>h.module==='missileRack').length,1,`${id}: one module damage application`);
            assert(combat.modules.missileRack.hp<combat.modules.missileRack.maxHp,`${id}: launcher loses module HP`);
            assert.equal(combat.hp,spec.hp,`${id}: exposed launcher does not imply hull penetration`);
            damageChecks++;
          }
        }
      }
    }finally{tank.dispose();}
  }
}
// Damage has an actual gameplay consequence for both the unguided rocket
// battery and a missile primary. Ordinary cannon reload behavior stays intact.
const tos=getSpec('tos1a_tagil'),tc=createCombatState(tos);
tc.modules.missileRack.state='red';tc.magazine.rounds=0;startMagazineReload(tc,tos);
assert(Math.abs(tc.reload.totalS-86.4)<1e-8,'TOS damaged rack lengthens the 48-second refill by 1.8x');
const viper=getSpec('griffin_viper'),vc=createCombatState(viper);
vc.modules.missileRack.state='red';startReload(vc,viper);
assert(vc.reload.totalS>=1.8,'Viper missile cadence is penalized by rack damage');
assert(damageChecks>=28,'fleet checks exercise real damage, not just collision labels');
console.log(`externalWeapons.selftest: ${ids.length} vehicles, ${probes} native stock/pose probes, ${damageChecks} actual damage checks`);
