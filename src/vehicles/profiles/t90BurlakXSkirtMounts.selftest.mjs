import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
const hit=(meshes,p,d,far=10)=>new T.Raycaster(new T.Vector3(...p),
  new T.Vector3(...d),0,far).intersectObjects(meshes,false)[0];
const near=(a,b,e,message)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,
  `${message}: ${a} vs complete-source ${b} ±${e}`);
function inside(mesh,p){
  const material=new T.MeshBasicMaterial({side:T.DoubleSide});
  const probe=new T.Mesh(mesh.geometry,material);probe.matrixWorld.copy(mesh.matrixWorld);
  try{
    const rows=new T.Raycaster(new T.Vector3(...p),new T.Vector3(1,0,0),0,10)
      .intersectObject(probe,false);let winding=0,last=-1,lastSign=0;
    for(const h of rows){
      const nx=h.face.normal.clone().transformDirection(mesh.matrixWorld).x;
      if(Math.abs(nx)<1e-7)continue;const sign=Math.sign(nx);
      if(Math.abs(h.distance-last)<1e-7&&sign===lastSign)continue;
      winding+=sign;last=h.distance;lastSign=sign;
    }return winding>0;
  }finally{material.dispose();}
}
for(const quality of ['high','low']){
  const t=createTank('t90a_burlak_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{
    t.root.updateMatrixWorld(true);const all=[];
    t.root.traverseVisible(o=>{if(o.isMesh&&!o.userData.shadowOnly&&!o.userData.vehicleMarking)all.push(o);});
    const hull=t.root.getObjectByName('hull'),detail=t.root.getObjectByName('hullDetail');
    for(const side of [-1,1]){
      const shift=side<0?.0019:0;
      for(const[z,y]of [[1.74315,1.29],[2.29935,1.29],[1.62205,1.3208],[2.17835,1.3208]]){
        const p=[side*(1.784+shift),y,z];
        assert.ok(inside(hull,p)&&inside(detail,p),'actual permanent fender/carrier share positive closed stock');
      }
      for(const[z,y,e]of [[2.26,side<0?1.21449155:1.21503638,.002],
        [2.27705,1.21503638,.002],[2.33695,1.21503638,.002],
        [2.30,1.296748,.003],[1.618134,1.3418,.003],[1.60,1.330725,.003]])
        near(hit(all,[side*(1.82+shift),2,z],[0,-1,0])?.point.y,y,e,
          'independent source receiver flange or hinge crown');
      for(const z of [1.618134,2.27705,2.30,2.33695])
        assert.equal(Boolean(hit(all,[side*(1.844+shift),1.35,z],[0,-1,0],.20)),false,
          'the real open channel outboard of the small receivers is retained');
      for(const z of [2.26,2.33695])
        assert.equal(Boolean(hit(all,[side*(1.82+shift),1.29,z],[0,-1,0],.060)),false,
          'air above the projecting low flange is not filled with a tall block');
    }
    const before=detail.geometry.attributes.position.array.slice();
    for(const side of ['L','R'])assert.equal(t.stripEra(`skirt_era_${side}`),true);
    assert.deepEqual(detail.geometry.attributes.position.array,before,
      'source mounting stock stays behind when both outer ERA cassettes are spent');
  }finally{t.dispose();}
}
console.log('t90BurlakXSkirtMounts: high/low source flange/hinge witnesses, permanent contact, actual standoff air and ERA independence PASS');
