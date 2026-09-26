import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec,PRODUCTION_TANK_IDS} from './specs.ts';
import {censusEquipment} from '../../tools/source-equipment-policy.mjs';
const configurations=[['dardo','Italy',25,0,false],['lrmv_lynx','Italy',30,0,false],['borsuk','Poland',30,2,true]];
for(const [id,nation,caliber,tubes,remote] of configurations){
  assert(PRODUCTION_TANK_IDS.includes(id));
  const spec=getSpec(id);
  assert.equal(spec.nation,nation);assert.equal(spec.gun.caliberMm,caliber);
  assert.equal(spec.gun.launcherMuzzles?.length??0,tubes);
  assert.equal(spec.armor.crew.length,3);
  assert.equal(spec.armor.crew.some(c=>c.turretLocal),!remote);
  assert.equal(spec.gun.shells.some(s=>s.guided),tubes>0);
  for(const quality of ['high','low']){
    const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,decor:false});
    try{
      tank.root.updateMatrixWorld(true);
      const size=new Box3().setFromObject(tank.root).getSize(new Vector3());
      assert(size.toArray().every(n=>Number.isFinite(n)&&n>0));
      assert.equal(censusEquipment(tank.root).mg,0,'photographed configuration has no separate roof RWS');
      const gun=tank.root.getObjectByName('rig_gun'),mount=tank.root.getObjectByName('gunMount');
      assert.equal(mount.parent,gun,'mantlet follows elevation');
      const before=new Vector3(),after=new Vector3();tank.gunMuzzleWorld(before);
      gun.rotation.x=-.30;tank.root.updateMatrixWorld(true);tank.gunMuzzleWorld(after);
      assert(after.y>before.y+.3,'elevates from real trunnion');
      if(tubes){
        assert(tank.root.userData.weaponGeometryParts.length>0,'launcher has physical damage stock');
        for(let i=0;i<tubes;i++)assert.equal(tank.root.getObjectByName(`rig_launcher_tip_${i}`).parent.name,'rig_turret');
      }
      console.log(JSON.stringify({id,quality,size:size.toArray(),ring:spec.armor.turretPivot}));
    }finally{tank.dispose();}
  }
}
console.log('European photo IFVs: roster, equipment, crew, gun articulation and launcher ownership PASS');
