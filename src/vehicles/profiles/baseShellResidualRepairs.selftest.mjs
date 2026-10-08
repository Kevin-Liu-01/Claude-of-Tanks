import assert from 'node:assert/strict';
import { orientedSlab } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { shellPart, mirroredSurfaceError } from '../../../tools/base-shell-audit-math.mjs';
import { properSurfaceCrossings, shellEdgeTopology } from '../../../tools/base-shell-integrity.mjs';
import '../../../tools/tank-surface-collect.mjs';
import { createTank } from '../tankFactory.ts';

const near=(a,b,message)=>assert.ok(Math.abs(a-b)<3e-6,`${message}: ${a} / ${b}`);
const intact=(part,label)=>{
 assert.deepEqual(shellEdgeTopology(part),{boundary:0,nonmanifold:0,inconsistent:0},`${label}: closed, coherent stock`);
 assert.ok(part.volume>1e-6,`${label}: positive finite volume`);
 assert.equal(properSurfaceCrossings(part).length,0,`${label}: no crossing faces`);
};
// Independent historic malformed inputs are controls for the actual geometric
// assertions. Merely keeping the same count or changing a digest cannot pass.
const oldKnee=orientedSlab(
 [-.9,.61,3.12],[.9,.61,3.12],[.9,1.044,3.41],[-.9,1.044,3.41],
 [-.9,.63,3.12],[.9,.63,3.12],[.9,1.048,3.43],[-.9,1.048,3.43]);
const oldClosure=orientedSlab(
 [1,.30,.90],[1.4,.30,.86],[1.4,.30,.04],[1,.30,.08],
 [1,.555,.90],[1.4,.295,.86],[1.4,.295,.04],[1,.555,.08]);
const oldReturn=orientedSlab(
 [-.14,.17,1.48],[-.43,.20,1.42],[-.40,.50,.91],[-.23,.48,.94],
 [-.13,.35,1.18],[-.40,.43,1.08],[-.35,.75,.58],[-.20,.68,.64]);
const oldTail=orientedSlab(
 [-1.269,-.002,-1.96],[1.269,-.002,-1.96],[.65,.120,-2.441],[-.65,.120,-2.441],
 [-1.234,.15252,-1.96],[1.234,.15252,-1.96],[.615,.1154,-2.441],[-.615,.1154,-2.441]);
const oldM48=orientedSlab(
 [-1,.626,2.25],[1,.626,2.25],[.98,1.100,3.229],[-.98,1.100,3.229],
 [-1,1.44,2.25],[1,1.44,2.25],[.98,1.080,3.229],[-.98,1.080,3.229]);
const oldObjectReturn=orientedSlab(
 [1.66,.8,-3.05],[1.99,.8,-3.05],[1.60,.8,-3.46],[1.66,.8,-3.46],
 [1.66,1.95,-3.05],[1.99,1.95,-3.05],[1.60,1.95,-3.46],[1.66,1.95,-3.46]);
const oldShoulder=sectionSolid([
 {z:-3.1,ring:[[-1.729,1.390057],[-2.048333,1.406667],[-2.048333,1.350667],[-1.729,1.353057]]},
 {z:-2.8,ring:[[-1.729,1.556],[-2.071667,1.438333],[-2.071667,1.382333],[-1.729,1.519]]},
]);
for(const [label,g]of Object.entries({oldKnee,oldClosure,oldReturn,oldTail,oldM48,oldObjectReturn,oldShoulder})){
 assert.ok(properSurfaceCrossings(shellPart(g)).length>0,`${label}: malformed historic faces are detected`);
 assert.throws(()=>intact(shellPart(g),label));g.dispose();
}
const families={amx40:'bow',leclerc:'closure',leclerc_xlr:'closure',amx56:'closure',chieftain5:'return',chieftain_mk10:'return',abramsx:'tail',m48:'m48bow',object695_x:'objectReturn',ua_t72b3m_hetman_ii:'shoulder'};
let checked=0;
for(const [id,family]of Object.entries(families))for(const quality of ['high','low']){
 const emissions=[];
 const tank=createTank(id,null,{quality,proceduralOnly:true,camoSeed:4242,geometryReceipt:true,
  partCensus(bucket,g,source){if(source==='add'&&['hull','turret','hullExternalArmor'].includes(bucket))emissions.push({bucket,g,site:new Error().stack??''});}});
 try{
  const parts=emissions.map(p=>({...p,part:shellPart(p.g)})).filter(({bucket,site,part:p,g})=>{
   if(family==='bow')return bucket==='hull'&&site.includes('buildHullBody (')&&p.bounds.min.z>3.11&&p.bounds.max.z>3.42&&p.size.x>1.79&&p.size.x<1.81;
   if(family==='closure')return bucket==='turret'&&site.includes('buildLeclercTurretStage1 (')&&p.size.x>.399&&p.size.x<.401&&p.bounds.max.y>.554&&p.bounds.max.y<.556;
   if(family==='return')return bucket==='turret'&&site.includes('buildChieftainUpper2026TurretStage4 (')&&p.size.x>.299&&p.size.x<.301;
   if(family==='m48bow')return bucket==='hull'&&site.includes('curveHullHullStage3 (')&&p.bounds.min.z>2.249&&p.bounds.min.z<2.251&&p.bounds.max.z>3.228&&p.bounds.max.z<3.230&&p.size.x>1.99;
   if(family==='objectReturn')return bucket==='hullExternalArmor'&&g.userData.object695==='module-rear-chamfer';
   if(family==='shoulder')return bucket==='hullExternalArmor'&&site.includes('hullPackage (')&&p.size.z>6.499&&p.size.z<6.501;
   return bucket==='turret'&&site.includes('axArmorLayer (')&&p.bounds.min.z< -2.43&&p.bounds.max.z< -1.95;
  });
  assert.equal(parts.length,{bow:1,closure:4,return:2,tail:4,m48bow:1,objectReturn:2,shoulder:2}[family],`${id}/${quality}: complete actual stock remains`);
  for(const {part:p}of parts){
   intact(p,`${id}/${quality}`);checked++;
   if(family==='bow'){
    [-.9,.61,3.12].forEach((n,i)=>near(p.bounds.min.getComponent(i),n,'retained bow minimum'));
    [.9,1.048,3.43].forEach((n,i)=>near(p.bounds.max.getComponent(i),n,'retained bow maximum'));
   }
   if(family==='closure'){
    near(p.bounds.min.y,.285,'closure backing floor');near(p.bounds.max.y,.555,'retained visible roof datum');
    const outer=p.vertices.filter(v=>Math.abs(Math.abs(v[0])-1.4)<1e-6);assert.equal(outer.length,4);
    near(Math.max(...outer.map(v=>v[1]))-Math.min(...outer.map(v=>v[1])),.01,'finite 10 mm outboard closure depth');
   }
   if(family==='return'){
    near(Math.min(...p.vertices.map(v=>Math.abs(v[0]))),.13,'gun aperture boundary');
    near(Math.max(...p.vertices.map(v=>Math.abs(v[0]))),.43,'retained outside return boundary');
    near(p.bounds.min.z,.58,'retained rear return');near(p.bounds.max.z,1.48,'retained return front');
   }
   if(family==='m48bow'){
    [-1,.626,2.25].forEach((n,i)=>near(p.bounds.min.getComponent(i),n,'retained M48 wedge minimum'));
    [1,1.44,3.229].forEach((n,i)=>near(p.bounds.max.getComponent(i),n,'retained M48 wedge maximum'));
   }
   if(family==='objectReturn'){
    // The owner-approved vehicleSizePolicy applies the existing 90% scale.
    near(Math.min(...p.vertices.map(v=>Math.abs(v[0]))),1.60*.9,'retained rear return inner extremum');
    near(Math.max(...p.vertices.map(v=>Math.abs(v[0]))),1.99*.9,'retained skirt outer extremum');
    near(p.bounds.min.z,-3.46*.9,'retained stern join');near(p.bounds.max.z,-3.05*.9,'retained front join');
   }
   if(family==='shoulder'){
    near(p.bounds.min.z,-3.1,'retained shoulder rear');near(p.bounds.max.z,3.4,'retained shoulder front');
    const zs=[...new Set(p.vertices.map(v=>v[2]))];assert.equal(zs.length,10,'all native deck-seat stations retained');
    for(const z of zs){
     const ring=p.vertices.filter(v=>v[2]===z),xs=[...new Set(ring.map(v=>v[0]))];assert.equal(xs.length,2);
     for(const x of xs){const ys=ring.filter(v=>v[0]===x).map(v=>v[1]);near(Math.max(...ys)-Math.min(...ys),Math.abs(x)<1.8?.037:.056,'finite shoulder boundary course');}
    }
   }
   if(family==='tail'){
    const rear=p.vertices.filter(v=>Math.abs(v[2]+2.441)<1e-6);
    assert.ok(Math.max(...rear.map(v=>v[1]))-Math.min(...rear.map(v=>v[1]))>=.00499,'tail layers remain finite');
    assert.ok(Math.max(...rear.map(v=>v[1]))<=.100001,'retained rear roof datum');
   }
  }
  if(['return','objectReturn','shoulder'].includes(family))near(mirroredSurfaceError(parts[0].part,parts[1].part).maxM,0,'reflected aperture return');
  if(family==='tail'){
   const roof=Math.max(...parts.flatMap(({part:p})=>p.vertices.filter(v=>Math.abs(v[2]+2.441)<1e-6).map(v=>v[1])));near(roof,.1,'original rear exterior roof remains');
   // The rear-only fix must not create a full-width bridge across the
   // distinctive forward XM360 opening in any actual native shell layer.
   const forward=emissions.filter(p=>p.bucket==='turret'&&p.site.includes('axArmorLayer (')).map(p=>shellPart(p.g)).filter(p=>p.bounds.max.z>1.6);
   assert.ok(forward.length>0);
   for(const p of forward)assert.ok(p.bounds.max.x<=-.02||p.bounds.min.x>=.02,'main gun tunnel stays split');
  }
 }finally{tank.dispose();}
 console.log(`${id}/${quality}: repaired ${family} stock passes`);
}
console.log(`base-shell residual repairs selftest: ${checked} actual HIGH/LOW parts passed; seven malformed controls rejected`);
