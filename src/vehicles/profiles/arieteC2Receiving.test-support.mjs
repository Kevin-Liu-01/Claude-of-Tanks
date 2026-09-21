import assert from 'node:assert/strict';
import * as T from 'three';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {ARIETE_X_PROFILES} from './arieteX.ts';
import {ARIETE_X_FAMILY_SCALE as S} from './arieteXFamilyFrame.ts';
import {arieteC2TubSections} from './arieteC2Tub.ts';
import {sectionSolid} from './sectionSolid.ts';
import {KIT} from './kit.ts';
import {createTankState} from '../../sim/movement.ts';
import {getSpec} from '../specs.ts';

export function capturePrimaryHull(create,id,options){
  const build=ARIETE_X_PROFILES[id].build,stocks=[];
  registerProfiledBuilders({[id]:p=>build(new Proxy(p,{get(target,key){
    if(key!=='add')return Reflect.get(target,key);
    return(bucket,geometry,...args)=>{if(bucket==='hull')stocks.push(KIT.xform(geometry.clone(),...args).scale(S,S,S));return target.add(bucket,geometry,...args);};
  }}))});
  try{return{tank:create(id,null,options),stocks};}
  catch(error){stocks.forEach(g=>g.dispose());throw error;}
  finally{registerProfiledBuilders({[id]:build});}
}
function sameGeometry(a,b,label){
  for(const key of ['position','normal']){
    assert([...a.attributes[key].array,...b.attributes[key].array].every(Number.isFinite),`${label} finite ${key}`);
    assert.deepEqual(a.attributes[key].array,b.attributes[key].array,`${label} exact ${key}`);
  }
  assert.deepEqual(a.index?.array,b.index?.array,`${label} exact indices`);
}
export function assertC2PrimaryHullDelta(c1,c2){
  assert.equal(c1.length,12);assert.equal(c2.length,12);
  for(let i=0;i<12;i++){
    if([0,8,11].includes(i))continue;
    sameGeometry(c1[i],c2[i],`unchanged primary hull stock${i}`);
  }
  const tub=sectionSolid(arieteC2TubSections()).scale(S,S,S);
  try{sameGeometry(tub,c2[0],'exact closed receiving tub');}finally{tub.dispose();}
  for(const [index,side]of[[8,-1],[11,1]]){
    const strip=KIT.box(.029,.054,3.092).translate(side*1.5195,1.063,-1.62).scale(S,S,S);
    try{sameGeometry(strip,c2[index],`exact retained outer strip${side}`);}finally{strip.dispose();}
  }
}
function probes(stocks,material){return[0,8,11].map(i=>{const mesh=new T.Mesh(stocks[i],material);mesh.updateMatrixWorld(true);return mesh;});}
function crosses(shoes,targets){
  const boxes=targets.map(m=>new T.Box3().setFromObject(m)),m=new T.Matrix4();
  for(const shoe of shoes){
    const a=shoe.geometry.attributes.position,index=shoe.geometry.index;
    for(let k=0;k<shoe.count;k++){
      shoe.getMatrixAt(k,m);if(Math.abs(m.determinant())<1e-12)continue;m.premultiply(shoe.matrixWorld);
      for(let i=0;i<(index?.count??a.count);i+=3){
        const p=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(a,index?index.getX(i+j):i+j).applyMatrix4(m));
        const box=new T.Box3().setFromPoints(p),candidates=targets.filter((_,j)=>boxes[j].intersectsBox(box));if(!candidates.length)continue;
        for(let e=0;e<3;e++){
          const d=p[(e+1)%3].clone().sub(p[e]),length=d.length();if(length<=2e-7)continue;
          const hit=new T.Raycaster(p[e],d.normalize(),1e-7,length-1e-7).intersectObjects(candidates,false)[0];
          if(hit)return{instance:k,triangle:i/3,owner:targets.indexOf(hit.object),point:hit.point.toArray()};
        }
      }
    }
  }
  return null;
}
export function assertC2ReceivingClearance(tank,oldStocks,newStocks){
  const material=new T.MeshBasicMaterial({side:T.DoubleSide}),targets=probes(newStocks,material),old=probes(oldStocks,material),shoes=[];
  tank.root.traverse(o=>{if(o.isInstancedMesh&&/^gearTrackPads(?:Simplified)?$/.test(o.name))shoes.push(o);});
  assert.equal(shoes.length,2,'both actual native shoe detail streams');
  const state=createTankState(getSpec('ariete_c2_x'),new T.Vector3(),0),pitch=shoes[0].userData.trackShoePitchM*S;
  try{
    for(const phase of [0,.25,.5,.75]){
      state.trackScroll.l=state.trackScroll.r=phase*pitch;tank.syncFromState(state,1/60,0);tank.root.updateMatrixWorld(true);
      assert.equal(crosses(shoes,targets),null,`actual HIGH/LOW shoe triangles clear all3 revised stock at phase${phase}`);
    }
    state.trackScroll.l=state.trackScroll.r=0;tank.syncFromState(state,1/60,0);tank.root.updateMatrixWorld(true);
    assert(crosses(shoes,[old[0]]),'reintroducing original tub must reproduce real link intrusion');
    assert(crosses(shoes,old.slice(1)),'reintroducing original strips must reproduce outer pin intrusion');
  }finally{material.dispose();}
}
