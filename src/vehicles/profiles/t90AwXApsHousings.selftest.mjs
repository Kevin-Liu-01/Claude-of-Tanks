import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90AWApsHousings} from './t90AwXApsHousings.ts';
import {addT90AWProjectors} from './t90AwXDetails.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
const packet=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90_x.aps-heldouts.json',import.meta.url),'utf8'));
function hit(ms,p,d,far=2){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(ms,false)[0];}
function interior(m,p,axis){return Boolean(hit([m],p,axis,.2)&&hit([m],p,axis.map(n=>-n),.2));}
function helper(){
  const parts=[],mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),pivot=T90_AW_X_SOURCE_DATUMS.turretPivot;
  const port={addEquipment(_b,g,x=0,y=0,z=0){g.translate(x+pivot[0],y+pivot[1],z+pivot[2]);const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();parts.push(m);}};
  addT90AWApsHousings(port);
  for(const side of [-1,1]){
    const x=side>0?1.2:-1.20189996;
    assert.equal(Boolean(hit(parts,[x,1.99,1.2],[0,1,0],.09)),false,'canted shell retains actual open under-roof cavity');
    const reflected=p=>[side>0?p[0]:-p[0]-.00189996,p[1],p[2]];
    for(const p of [[1.048205,2.069,.951487],[.907545,2.069,1.14841]])
      assert.ok(parts.filter(m=>interior(m,reflected(p),[0,0,1])).length>=2,`inclined hinge continuation physically engages shell ${side}/${p}`);
    // Source retention ring's clamp feet meet the open upper/lower frame.
    for(const p of [[.876,1.9475,1.517],[.876,1.5945,1.517]])
      assert.ok(parts.filter(m=>interior(m,reflected(p),[0,1,0])).length>=2,'actual narrow frame/foot engagement');
  }
  const count=parts.length;addT90AWProjectors(port);const projectors=parts.slice(count),fittings=parts.slice(0,count);
  for(const side of [-1,1])for(const y of [1.6367,1.9052]){
    const p=[side>0?.876:-.8779,y,1.517];
    assert.ok(fittings.some(m=>interior(m,p,[0,1,0]))&&projectors.some(m=>interior(m,p,[0,1,0])),'actual narrow clamp foot positively seats to unchanged original projector body');
  }
  for(const m of parts)m.geometry.dispose();mat.dispose();
}
helper();assert.equal(packet.rays.length,83);
for(const quality of ['high','low']){
  const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const ms=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)ms.push(m);});
    for(const r of packet.rays){const h=hit(ms,r.origin,r.direction);assert.ok(h&&h.point.distanceTo(new THREE.Vector3(...r.point))<=.006,`source APS shell/lead ${r.origin}: ${h?.point.toArray()} vs ${r.point}`);
      if(r.direction[1]===-1&&Math.abs(r.normal[0])>.3&&r.normal[1]>.91)
        assert.ok(h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(new THREE.Vector3(...r.normal))>.9999,'actual roof retains source canted normal, not merely bounds');
    }
    for(const side of [-1,1])for(const[x,y,z]of [[.9,1.98,1.5335700511932355],[1.1,1.94,1.5283404758768344]]){
      const h=hit(ms,[side*x,y,2.1],[0,0,-1]);assert.ok(h&&Math.abs(h.point.z-z)<.006,`source rear retention frame ${side*x}/${y}: ${h?.point.z} vs ${z}`);
    }
  }finally{t.dispose();}
}
console.log('t90AwXApsHousings: actual high/low 83 source shell/lead rays, open underside, narrow supported retention frame and canted hinge seats pass');
