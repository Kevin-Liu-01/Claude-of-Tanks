import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {KIT,registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildT90AWX} from './profiles/t90AwX.ts';
import {addShtoraEyes} from './profiles/shtora.ts';
import {sectionSolid} from './profiles/sectionSolid.ts';
import {T90_AW_X_SOURCE_DATUMS} from './t90AwXArmor.ts';
import {markVehicleNightLens} from './vehicleNightLighting.ts';

const YAW=T90_AW_X_SOURCE_DATUMS.turretPivot;
function signature(slot,g,pose){
  const h=createHash('sha256').update(JSON.stringify([slot,pose]));
  for(const k of Object.keys(g.attributes).sort()){
    const a=g.attributes[k].array;
    h.update(k).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  }
  if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));
  return h.digest('hex');
}

// Exact former first-party scalar recipe, retained from 29217600a. This is
// NOT playable geometry, a new golden or a source-mesh payload. It reconstructs
// the immutable pre-auxiliary-metadata whole-model witness only.
function priorProjectors(P){
  const part=g=>P.addEquipment('turretDetail',g,-YAW[0],-YAW[1],-YAW[2]);
  for(const x of [.876,-.8784]){
    const low=1.63648,high=1.90508;
    const rows=[[1.37837,.3809,.0103],[1.39497,.3281,.0077],[1.68787,.3281,.0077],
      [1.68788,.27,.0254],[1.71627,.27,.0254]];
    part(sectionSolid(rows.map(([z,w,c])=>({z,ring:[
      [x-w/2+c,low],[x+w/2-c,low],[x+w/2,low+c],[x+w/2,high-c],
      [x+w/2-c,high],[x-w/2+c,high],[x-w/2,high-c],[x-w/2,low+c],
    ]}))));
    part(markVehicleNightLens(KIT.cylZ(.1157,.0175,28),'shtora').translate(x,1.77158,1.70842));
    for(const[y,h]of [[1.82853,.1365],[1.69878,.1048]])part(KIT.box(.352,h,.0166).translate(x,y,1.37007));
    for(const y of [1.62923,1.91323])for(const[z,d,w]of [[1.43207,.0586,.2906],[1.52287,.1172,.3228],[1.63712,.0879,.3228]])
      part(KIT.box(w,.0163,d).translate(x,y,z));
    for(const side of [-1,1])for(const z of [1.46822,1.58292])
      part(KIT.box(.0264,.2075,.035).translate(x+side*.17725,1.77083,z));
  }
}

function currentRecipe(){
  const parts=[],lenses=[],dark=new THREE.MeshStandardMaterial(),turretG=new THREE.Group();
  const materials=new Set([dark]);
  const add=(slot,g,...pose)=>{parts.push(signature(slot,g,pose));g.dispose();};
  addShtoraEyes({mats:{dark},turretG,add},{x:.8772,y:1.77158,z:1.55,scale:1.35,round:true,kit:true,
    offset:[-YAW[0]-.0012,-YAW[1],-YAW[2]]});
  for(const m of turretG.children){
    lenses.push(signature('lens',m.geometry,m.position.toArray()));
    m.geometry.dispose();materials.add(m.material);
  }
  for(const material of materials)material.dispose();
  for(const x of [.876,-.8784]){
    add('turretDetail',KIT.box(.352,.241,.028).translate(x,1.769,1.376),-YAW[0],-YAW[1],-YAW[2]);
    add('turretDetail',KIT.box(.19,.12,.25).translate(x,1.70,1.385),-YAW[0],-YAW[1],-YAW[2]);
  }
  assert.equal(parts.length,24);assert.equal(lenses.length,2);
  return {parts,lenses};
}

export function historicalT90FittingsBuilder(builder=buildT90AWX){
  const expected=currentRecipe();let next=-1,eyes=0,weapons=0;
  return P=>{
    const discardedMaterials=new Set();
    const turret=new Proxy(P.turretG,{get(target,key){
      if(key!=='add')return Reflect.get(target,key);
      return(...objects)=>{
        for(const m of objects){
          if(m.name==='t90XMountedNsvt'){
            assert.ok(m.children.length>0,'remove only the separately tested complete weapon');weapons++;
            m.traverse(o=>o.geometry?.dispose());continue;
          }
          if(next>=0&&eyes<2&&m.isMesh){
            try{
              assert.equal(signature('lens',m.geometry,m.position.toArray()),expected.lenses[eyes++],
                'only the two exact canonical red emitter meshes have an inverse');
            }finally{m.geometry.dispose();discardedMaterials.add(m.material);}
            continue;
          }
          target.add(m);
        }
        return target;
      };
    }});
    try{builder(new Proxy(P,{get(target,key){
      if(key==='turretG')return turret;
      if(key!=='addEquipment')return Reflect.get(target,key);
      return(slot,g,...pose)=>{
        const value=signature(slot,g,pose);
        if(next<0&&value===expected.parts[0]){priorProjectors(target);next=0;}
        if(next>=0&&next<expected.parts.length){
          assert.equal(value,expected.parts[next++],'exact current fitting stock only; never a spatial/bucket exclusion');
          g.dispose();return;
        }
        return target.addEquipment(slot,g,...pose);
      };
    }}));}finally{for(const material of discardedMaterials)material.dispose();}
    assert.equal(next,24);assert.equal(eyes,2);assert.equal(weapons,1);
  };
}

export function withHistoricalT90Fittings(build,builder=buildT90AWX){
  registerProfiledBuilders({t90_x:historicalT90FittingsBuilder(builder)});
  try{return build();}
  finally{registerProfiledBuilders({t90_x:buildT90AWX});}
}
