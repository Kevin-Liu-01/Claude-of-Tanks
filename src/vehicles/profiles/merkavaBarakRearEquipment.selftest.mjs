import assert from'node:assert/strict';
import * as T from'three';
import {createTank} from'../tankFactory.ts';
import {ensureInteriorFills,hasInteriorFills} from'../interiorFills.ts';
import {sourceOpeningRayProbe} from'../../../tools/source-opening-rays.mjs';
import {verifyBarakBayNativeStock} from'../../../tools/barak-rear-bay-fill-policy.mjs';

// Independent source-only rays: Object24 panels, Object29 lamps, Object22
// rails, roof sections and closed hatch. All are complete-scene first hits.
const stock=[
 ...[.118,.236,.5].map(x=>({key:`rear_case_${x}`,origin:[x,4,-3.10],direction:[0,-1,0],axis:1,value:2.4249563})),
 ...[-2.083911,-1.946121].map(z=>({key:`lift_${z}`,origin:[-.077,4,z],direction:[0,-1,0],axis:1,value:2.5998659})),
 ...[-1.376,1.375].flatMap(x=>[-1.68,-1.49,-1.22].map(z=>({key:`screen_${x}_${z}`,origin:[x,4,z],direction:[0,-1,0],axis:1,value:2.8891544}))),
 ...[-.6,.6].flatMap(x=>[1.1,1.19,1.29,1.40].map(y=>({key:`panel_${x}_${y}`,origin:[x,y,-4.3],direction:[0,0,1],axis:2,value:-3.8116348}))),
 ...[-1.6298,1.6288].map(x=>({key:`lamp_${x}`,origin:[x,1.4018,-4],direction:[0,0,1],axis:2,value:-3.6414766})),
 ...[[2.038,-3.5720768],[2.12,-3.5809008],[2.201,-3.5888302],[2.283,-3.5983927],[2.356,-3.6189477]].map(([y,value])=>({key:`rail_${y}`,origin:[.8,y,-4],direction:[0,0,1],axis:2,value})),
 ...[[-.4413,-1.145,2.6201582],[.4577,-.5177,2.8144691],[-.6673,-.1,2.7318549],[-.8,-2.4,2.5046408],[.4,-2.4,2.4705007],[.4,-1.3,2.6003609]].map(([x,z,value])=>({key:`roof_${x}_${z}`,origin:[x,4,z],direction:[0,-1,0],axis:1,value})),
];
const air=[...[[.85,2.075],[.4,2.16]].map(([x,y])=>({origin:[x,y,-4.3],direction:[0,0,1],far:.78})),
 ...[-2.083911,-1.946121].map(z=>({origin:[-.03,2.535129,z-.060],direction:[0,0,1],far:.12}))];
function read(root){const p=sourceOpeningRayProbe(root);try{return stock.map(w=>{const h=p.cast(w.origin,w.direction,6);return{key:w.key,hit:h?.point.toArray(),residual:h?Math.abs(h.point.getComponent(w.axis)-w.value):Infinity};});}finally{p.dispose();}}
await ensureInteriorFills(['merkava4_barak']);assert.ok(hasInteriorFills('merkava4_barak'));
const rows=[];
for(const quality of['high','low']){
 const tank=createTank('merkava4_barak',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
 try{
  tank.root.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0)}});
  const actual=read(tank.root);assert.ok(actual.every(r=>r.residual<=.002),JSON.stringify(actual.filter(r=>r.residual>.002)));
  const p=sourceOpeningRayProbe(tank.root);try{for(const w of air)assert.equal(p.cast(w.origin,w.direction,w.far),undefined,'measured rack gaps remain open');}finally{p.dispose();}
  verifyBarakBayNativeStock(tank.root);
  const whips=tank.root.getObjectByName('barakRearWhips');assert.equal(whips.count,2);
  whips.geometry.computeBoundingBox();
  for(const [i,base,tip]of[[0,[-1.023587,2.598081,-3.570749],[-1.023587,5.655348,-3.730985]],
    [1,[1.029952,2.607366,-3.572234],[1.029952,5.664633,-3.732470]]]){
    const m=new T.Matrix4();whips.getMatrixAt(i,m);m.premultiply(whips.matrixWorld);
    for(const [y,expected]of[[whips.geometry.boundingBox.min.y,base],[whips.geometry.boundingBox.max.y,tip]]){
      const center=new T.Vector3(0,y,0).applyMatrix4(m);
      assert.ok(center.distanceTo(new T.Vector3(...expected))<.0001,'actual instanced aerial axis retains source base/tip within 0.1 mm scalar-fit tolerance');
    }
  }
  const cage=tank.root.getObjectByName('turretOpenLattice');assert.ok(cage);cage.visible=false;
  assert.ok(read(tank.root).filter(r=>r.key.startsWith('rail')).some(r=>r.residual>.002),'missing actual rail geometry fails stock proof');cage.visible=true;
  const detail=tank.root.getObjectByName('turretDetail');detail.visible=false;
  assert.ok(read(tank.root).filter(r=>r.key.startsWith('roof')).some(r=>r.residual>.002),'missing hatch/sight fails source proof');detail.visible=true;
  const fill=new T.Mesh(new T.BoxGeometry(1.8,.40,.06),new T.MeshBasicMaterial());fill.position.set(0,2.15,-3.55);tank.root.add(fill);
  const filled=sourceOpeningRayProbe(tank.root);try{assert.ok(air.some(w=>filled.cast(w.origin,w.direction,w.far)),'negative solid rack actually fills measured air');}finally{filled.dispose();}
  tank.root.remove(fill);fill.geometry.dispose();fill.material.dispose();
  rows.push({quality,stock:actual.length,air:air.length,maxResidualM:Math.max(...actual.map(r=>r.residual))});
 }finally{tank.dispose();}
}
console.log('merkavaBarakRearEquipment PASS',JSON.stringify(rows));
