import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function hit(meshes,x,z){return new THREE.Raycaster(new THREE.Vector3(x,6,z),new THREE.Vector3(0,-1,0),0,10)
  .intersectObjects(meshes,false)[0]?.point.y;}
const near=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<.000005,`${label}: ${a} vs ${b}`);
function top(z,rows){for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){
  const [a,ya]=rows[i-1],[b,yb]=rows[i];return ya+(yb-ya)*(z-a)/(b-a);
}throw new Error('station outside source span');}
let samples=0;
for(const quality of ['high','low'])for(const [id,name,rows] of [
  ['leo2a7v_x','a7v_upper_glacis_era',[[1.64,1.785],[2.43,1.628],[3.21,1.48155]]],
  ['leo2a6m_x','a6m_upper_glacis_era',[[1.52,1.72],[2.63,1.58],[3.15,1.52003]]],
]){
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  try{
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('hull'),cover=tank.root.getObjectByName('hullExternalArmor');
    const positions=hull.geometry.attributes.position.array.slice();
    const witnesses=[];
    for(let x=-.80;x<.81;x+=.16)for(let z=2.08;z<3.12;z+=.08){
      const expected=top(z,rows);near(hit([hull,cover],x,z),expected,`${id}: unspent source roof plane`);
      near(hit([hull],x,z),expected-.018,`${id}: closed permanent supporting floor`);
      witnesses.push([x,z,expected]);samples++;
    }
    assert.equal(tank.stripEra(name),true);
    for(const [x,z,expected]of witnesses)near(hit([hull,cover],x,z),expected-.018,`${id}: spent body retains real backing`);
    assert.deepEqual(hull.geometry.attributes.position.array,positions,'depletion never edits permanent backing');
    assert.equal(tank.resetEra(),true);
    for(const [x,z,expected]of witnesses)near(hit([hull,cover],x,z),expected,`${id}: exact reset source roof`);
    if(id==='leo2a6m_x'){
      const turret=tank.root.getObjectByName('turret'),skin=tank.root.getObjectByName('turretExternalArmor');
      const pivot=tank.root.getObjectByName('rig_turret').position;
      for(const side of ['L','R']){
        const name=`a6m_turret_cheek_era_${side}`;
        const row=tank.root.userData.eraVisualBindingReceipt.plates.find(p=>p.name===name);
        const points=row.fittedSurfaces.map(f=>f.slice(0,3).reduce((p,v)=>p.add(new THREE.Vector3(...v)),
          new THREE.Vector3()).multiplyScalar(1/3).add(pivot));
        const visible=points.filter(p=>Math.abs(hit([turret,skin],p.x,p.z)-p.y)<.000005);
        assert.ok(visible.length>=3,`${side}: independently exposed cheek skin triangles`);
        const permanent=turret.geometry.attributes.position.array.slice();
        assert.equal(tank.stripEra(name),true);
        for(const p of visible)near(hit([turret,skin],p.x,p.z),p.y-.018,`${side}: actual closed cheek backing after hit`);
        assert.deepEqual(turret.geometry.attributes.position.array,permanent,'cheek activation preserves permanent shell');
        assert.equal(tank.resetEra(),true);
        for(const p of visible)near(hit([turret,skin],p.x,p.z),p.y,`${side}: exact source cheek reset`);
      }
    }
  }finally{tank.dispose();}
}
console.log(`leopardXEraBinding: ${samples} high/low exact source planes, closed backing and reversible cover depletion pass`);
