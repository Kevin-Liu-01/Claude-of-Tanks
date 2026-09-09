import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {T90_X_PROFILES} from './profiles/t90X.ts';
import {installCanvasFixture} from './canvasFixture.test-support.mjs';

const targets={t90m_x:3,t90a_vladimir_x:1};
const methods=new Set(['add','addEquipment','addExternalArmor','addMudguard','addHatch','addCupola']);
function digest(g){
  const h=createHash('sha256');
  for(const key of Object.keys(g.attributes).sort()){
    const a=g.attributes[key].array;h.update(key).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  }
  if(g.index){const a=g.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
  return h.digest('hex');
}
function make(id,quality,camoPattern,old){
  const build=T90_X_PROFILES[id].build,emissions=[];let cloth=0;
  registerProfiledBuilders({[id]:P=>build(new Proxy(P,{get(target,key){
    if(!methods.has(key))return Reflect.get(target,key);
    return(...args)=>{
      const g=args.find(v=>v?.isBufferGeometry),selected=args[0]==='gunMountCanvasSkin';
      if(selected)cloth++;
      emissions.push([key,...args.map(v=>v===g?digest(g):v)]);
      if(old&&selected)args[0]='gunMount';
      return target[key](...args);
    };
  }}))});
  try{return{tank:createTank(id,null,{quality,camoPattern,proceduralOnly:true,
    materialMode:'rendered',batchStatic:false,camoSeed:4242}),emissions,cloth};}
  finally{registerProfiledBuilders({[id]:build});}
}
function gunStock(root){
  root.updateMatrixWorld(true);const triangles=[],p=new T.Vector3();
  for(const name of ['gunMount','gunMountCanvasSkin']){
    const mesh=root.getObjectByName(name);if(!mesh)continue;
    const g=mesh.geometry,a=g.attributes.position,n=g.index?.count??a.count;
    for(let i=0;i<n;i+=3){const corners=[];
      for(let k=0;k<3;k++)corners.push(p.fromBufferAttribute(a,g.index?.getX(i+k)??i+k)
        .applyMatrix4(mesh.matrixWorld).toArray().join(','));
      triangles.push(corners.join('|'));
    }
  }
  return triangles.sort();
}
function assertCloth(tank){
  const cloth=tank.root.getObjectByName('gunMountCanvasSkin');
  assert.ok(cloth?.isMesh,'the real cloth stock must exist');
  const rig=tank.root.getObjectByName('rig_gun');
  assert.ok(cloth.parent===rig,'continuous gun skin keeps the original always-visible gun-rig owner');
  assert.equal(cloth.material.name,'cot:canvas');
  assert.equal(cloth.material.map,null,'fabric must not repeat the armor camouflage atlas');
  assert.equal(cloth.material.metalness,0);
  assert.equal(cloth.material.roughness,.97);
  assert.equal(cloth.material.color.getHex(),0x42452f);
}
const restore=installCanvasFixture();let builds=0;
try{for(const [id,count] of Object.entries(targets))for(const quality of ['high','low'])
  for(const scheme of ['factory','winter']){
    console.log(`t90-x-canvas-finish: ${id} ${quality} ${scheme}`);
    const old=make(id,quality,scheme,true),next=make(id,quality,scheme,false);
    try{
      assert.equal(next.cloth,count);assert.deepEqual(next.emissions,old.emissions,
        'all raw stock and transforms remain exact, including steel collars and bore geometry');
      assertCloth(next.tank);
      for(const [yaw,pitch] of [[0,0],[.8,-.15],[-1.2,.10]]){
        for(const t of [old.tank,next.tank]){
          t.root.getObjectByName('rig_turret').rotation.y=yaw;
          t.root.getObjectByName('rig_gun').rotation.x=pitch;
        }
        assert.deepEqual(gunStock(next.tank.root),gunStock(old.tank.root),'posed skin/aperture triangles unchanged');
      }
      const cloth=next.tank.root.getObjectByName('gunMountCanvasSkin'),material=cloth.material;
      cloth.material=next.tank.root.getObjectByName('hull').material;
      assert.throws(()=>assertCloth(next.tank));cloth.material=material;builds+=2;
    }finally{old.tank.dispose();next.tank.dispose();}
  }
}finally{restore();}
console.log(`t90-x-canvas-finish: ${builds} HIGH/LOW factory/winter builds; cloth finish and posed stock pass (CPU, not pixel evidence)`);
