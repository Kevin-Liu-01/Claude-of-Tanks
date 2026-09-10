import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {KIT,registerProfiledBuilders} from './tankFactoryCore.ts';
import {T90_X_DATUMS,T90_X_PROFILES} from './profiles/t90X.ts';
import {addShtoraEyes} from './profiles/shtora.ts';
import {markVehicleNightLens} from './vehicleNightLighting.ts';

function signature(slot,g,pose){
  const hash=createHash('sha256').update(JSON.stringify([slot,pose]));
  for(const key of Object.keys(g.attributes).sort()){
    const array=g.attributes[key].array;
    hash.update(key).update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
  }
  if(g.index)hash.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));
  return hash.digest('hex');
}
function onTurret(P,d,slot,g,x,y,z){P.addEquipment(slot,g,x-d.yaw[0],y-d.yaw[1],z-d.yaw[2],0,0,0);}

// Exact first-party classicSensors recipe before the owner's Shtora repair.
// Used only to retain the immutable pre-ERA world-vertex witnesses. Current
// geometry, exposed emitters, viewing glass and ERA behavior are tested apart.
function priorEyes(P,d){
  for(const side of [-1,1]){
    const x=side*.82,z=1.65,y=d.gun[1]-.02;
    onTurret(P,d,'turretDetail',KIT.box(.40,.27,.23),x,y,z);
    onTurret(P,d,'turretDark',KIT.cylZ(.133,.025,20),x,y,z+.127);
    onTurret(P,d,'turretGlass',markVehicleNightLens(KIT.cylZ(.108,.012,24),'shtora'),x,y,z+.145);
    onTurret(P,d,'turretDetail',KIT.box(.44,.028,.28),x,d.gun[1]+.132,z-.005);
    onTurret(P,d,'turretDetail',KIT.box(.16,.14,.18),x,d.gun[1]-.15,z-.19);
  }
}
function currentRecipe(id,d){
  const parts=[],lenses=[],dark=new THREE.MeshStandardMaterial(),turretG=new THREE.Group();
  const add=(slot,g,...pose)=>{parts.push(signature(slot,g,pose));g.dispose();};
  addShtoraEyes({mats:{dark},turretG,add},{x:.82,y:d.gun[1]-.02,z:1.65,scale:1.3,round:true,kit:true,
    offset:[-d.yaw[0],-d.yaw[1],-d.yaw[2]]});
  const lensMaterials=new Set();
  for(const lens of turretG.children){
    lenses.push(signature('lens',lens.geometry,lens.position.toArray()));
    lens.geometry.dispose();lensMaterials.add(lens.material);
  }
  for(const material of lensMaterials)material.dispose();
  dark.dispose();
  for(const side of [-1,1])onTurret({addEquipment:add},d,'turretDetail',KIT.box(.16,.14,.52),side*.82,d.gun[1]-.12,1.29);
  const glass=KIT.box(.18,.07,.012),top=id==='t90a_x'?2.148:2.295,z=id==='t90a_x'?.847:.918;
  const viewing=signature('turretGlass',glass,[-d.yaw[0],top-.07-d.yaw[1],z+.164-d.yaw[2],0,0,0]);
  glass.dispose();assert.equal(parts.length,22);assert.equal(lenses.length,2);
  return {parts,lenses,viewing};
}

export function withHistoricalClassicShtora(id,build){
  assert.ok(id==='t90a_x'||id==='t90a_vladimir_x','only the two repaired classic emitters have this inverse');
  const d=T90_X_DATUMS[id],original=T90_X_PROFILES[id].build,expected=currentRecipe(id,d);
  let next=-1,eyes=0,glass=0;
  const lensMaterials=new Set();
  registerProfiledBuilders({[id]:P=>{
    const turret=new Proxy(P.turretG,{get(target,key){
      if(key!=='add')return Reflect.get(target,key);
      return(...objects)=>{
        for(const mesh of objects){
          if(next>=0&&eyes<2&&mesh.isMesh){
            assert.equal(signature('lens',mesh.geometry,mesh.position.toArray()),expected.lenses[eyes++],
              'only the exact two new emitter meshes have an inverse');
            mesh.geometry.dispose();lensMaterials.add(mesh.material);
          }else target.add(mesh);
        }
        return target;
      };
    }});
    original(new Proxy(P,{get(target,key){
      if(key==='turretG')return turret;
      if(key!=='addEquipment')return Reflect.get(target,key);
      return(slot,g,...pose)=>{
        const value=signature(slot,g,pose);
        if(next<0&&value===expected.parts[0]){priorEyes(target,d);next=0;}
        if(next>=0&&next<expected.parts.length){
          assert.equal(value,expected.parts[next++],'exact stock/pose/ordering only; no bucket or spatial exclusion');
          g.dispose();return;
        }
        if(value===expected.viewing){glass++;g.dispose();return;}
        target.addEquipment(slot,g,...pose);
      };
    }}));
  }});
  try{
    const tank=build();
    try{assert.equal(next,22);assert.equal(eyes,2);assert.equal(glass,1);return tank;}
    catch(error){tank.dispose();throw error;}
  }finally{
    for(const material of lensMaterials)material.dispose();
    registerProfiledBuilders({[id]:original});
  }
}
