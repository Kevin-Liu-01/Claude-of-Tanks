import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {chineseArrowCassette} from './chineseChevron.ts';
const IDS=['cn_t80u_modern','cn_t72b3m_modern','cn_t72b3_modern'];
const v=p=>new T.Vector3(...p),mat=new T.MeshBasicMaterial({side:T.DoubleSide});
const reports=[];
try{for(const id of IDS)for(const quality of ['high','low']){
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
 try{
  const turret=tank.root.getObjectByName('rig_turret'),records=turret.userData.chineseChevronEra;
  assert.equal(records.length,id==='cn_t72b3_modern'?8:12,'both complete banks survive the native merge');
  const mesh=turret.getObjectByName('turretExternalArmor'),before=mesh.geometry.attributes.position.array.slice();
  const pos=mesh.geometry.attributes.position;
  const keys=new Set(Array.from({length:pos.count},(_,i)=>[pos.getX(i),pos.getY(i),pos.getZ(i)].map(n=>n.toFixed(5)).join(',')));
  for(const r of records){
   for(const p of r.vertices)assert.ok(keys.has(p.map(n=>n.toFixed(5)).join(',')),'authored cassette exists in actual native armor buffer');
   const n=v(r.normal),origin=v(r.back[0]);
   assert.ok(n.x*r.side>.25||n.z>.99,'bank faces outward on its own side or bow cap');
   assert.ok(Math.min(...r.vertices.map(p=>v(p).sub(origin).dot(n)))>.01199,'removable ERA is entirely outside the receiving plane');
   assert.equal(r.ridgeWidthM,.04,'Chinese single-piece modules have a distinct blunt ridge');
  }
  for(const side of[-1,1]){
   assert.equal(tank.stripEra(`turret_era_${side<0?'L':'R'}`),true);
   assert.ok(Array.from(pos.array).some(n=>n<-900),'physical ERA geometry disappears');
   tank.resetEra();assert.deepEqual(pos.array,before,'reset restores all exact vertices');
  }
  tank.stripEra('turret_era_L');tank.stripEra('turret_era_R');
  const permanent=['turret','turretExternalArmor'].map(name=>new T.Mesh(turret.getObjectByName(name).geometry,mat));
  permanent.forEach(m=>m.updateMatrixWorld(true));let samples=0;
  for(const r of records){
   const [a,b,c,d]=r.back.map(v),n=v(r.normal);
   for(const u of[.15,.35,.65,.85])for(const w of[.2,.4,.6,.8]){
    const p=a.clone().lerp(b,u).lerp(d.clone().lerp(c,u),w);
    const hits=new T.Raycaster(p.clone().addScaledVector(n,.5),n.clone().negate(),0,.7).intersectObjects(permanent);
    assert.ok(hits.some(h=>Math.abs(h.point.clone().sub(p).dot(n))<.00001),'carrier has actual permanent wall behind it');
    assert.ok(hits[0].point.clone().sub(p).dot(n)<.01801,`${id} stock through cassette ${JSON.stringify({back:r.back,u,w,point:hits[0].point.toArray(),protrusion:hits[0].point.clone().sub(p).dot(n)})}`);samples++;
   }
  }
  reports.push({id,quality,cassettes:records.length,contactSamples:samples});
 }finally{tank.dispose();}
}}finally{mat.dispose();}
// The frontline raised arrow follows the carrier's actual facet boundaries,
// including an intentionally bent station, without a single spanning quad.
const stations=[{x:.4,upperY:.7,upperZ:.4,ridgeY:.3,ridgeZ:1.4,lowerY:.05,lowerZ:.7},
 {x:.9,upperY:.68,upperZ:.1,ridgeY:.3,ridgeZ:1.1,lowerY:.05,lowerZ:.5},
 {x:1.4,upperY:.65,upperZ:-.2,ridgeY:.25,ridgeZ:.6,lowerY:.05,lowerZ:.1}];
for(const side of[-1,1]){const g=chineseArrowCassette(stations,side,.5,1.3);assert.ok(g.attributes.position.count>36);g.dispose();}
console.log(JSON.stringify(reports,null,2));
console.log('Chinese chevrons: native geometry, distinct ridge, exterior placement, permanent contact and ERA reset pass HIGH/LOW');
