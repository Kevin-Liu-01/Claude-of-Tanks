import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {MAP_IDS,getMapConfig} from './maps/index.ts';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { buildDetailedGarageTree, buildFallbackGarageTree } from './vegetation.ts';
import { TREE_SPECIES } from './treeSpecies.ts';

const previous = globalThis.document;
globalThis.document = {createElement: () => createCanvas(1, 1)};
const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
function surfaceGap(geometry, point, start=0, end=geometry.attributes.position.count) {
  const p=geometry.attributes.position; let min=Infinity;
  for(let i=start;i<end;i+=3){
    triangle.a.fromBufferAttribute(p,i);triangle.b.fromBufferAttribute(p,i+1);triangle.c.fromBufferAttribute(p,i+2);
    triangle.closestPointToPoint(point,closest); min=Math.min(min,closest.distanceTo(point));
  }
  return min;
}
// Check the shader's nonlinear flutter between the sampled centre and the
// actual rasterized triangle. Maximum map wind, multiple harmonic phases.
const moduleURL=new URL('./vegetation.ts',import.meta.url);
const source=readFileSync(moduleURL,'utf8');
const registryStart=source.indexOf('  const OAK_SHAPES:'), registryEnd=source.indexOf('  const foliageTex =',registryStart);
assert.ok(registryStart>0&&registryEnd>registryStart);
const nearStart=source.indexOf('        const geometry = SPECIES[sp].near(k, palOf(sp));');
const nearEnd=source.indexOf('        prepareTreeBarkSurface',nearStart);
const auditURL=moduleURL.href+'?attachment-registry';
const hook=registerHooks({load(url,context,next){
 const result=next(url,context);if(url!==auditURL)return result;
 assert.equal(String(result.source),source);
 return {...result,source:source+`
export function battleTree(seed,veg,sp,k){
${source.slice(registryStart,registryEnd)}
${source.slice(nearStart,nearEnd)}
return geometry;
}`};
}});
let battleTree;try{({battleTree}=await import(auditURL));}finally{hook.deregister();}
assert.ok(source.includes('float fph = (aFlex * 53.17 + (position.x * 0.37 + position.z * 0.53) * 0.05) * 6.2831853;'));
function wind(point,flex,time){
 const phase=(flex*53.17+(point.x*.37+point.z*.53)*.05)*Math.PI*2;
 const f=flex*.11*1.6;
 return point.clone().add(new THREE.Vector3(f*(Math.sin(time*3.1+phase)+.5*Math.sin(time*5.3+phase*1.9)),f*.3*Math.sin(time*4.3+phase*.7),f*.7*Math.cos(time*2.6+phase*1.3)));
}
let windGap=0;
function checkWind(cards){
 const p=cards.attributes.position,uv=cards.attributes.uv,f=cards.attributes.aFlex;
 const triangle=new THREE.Triangle(),bary=new THREE.Vector3(),center=new THREE.Vector3(.5,.5,0);
 for(let i=0;i<p.count;i+=3){
  triangle.a.set(uv.getX(i),uv.getY(i),0);triangle.b.set(uv.getX(i+1),uv.getY(i+1),0);triangle.c.set(uv.getX(i+2),uv.getY(i+2),0);
  if(!triangle.getBarycoord(center,bary)||Math.min(bary.x,bary.y,bary.z)<-1e-5)continue;
  const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));
  const point=new THREE.Vector3();vertices.forEach((v,k)=>point.addScaledVector(v,bary.getComponent(k)));
  for(const t of [0,1,4,11,23]){
   const interpolated=new THREE.Vector3();vertices.forEach((v,k)=>interpolated.addScaledVector(wind(v,f.getX(i+k),t),bary.getComponent(k)));
   windGap=Math.max(windGap,interpolated.distanceTo(wind(point,f.getX(i),t)));
  }
 }
}
let cases=0, supported=0, beforeFloating=0, maximumTriangles=0;
try{
 for(const snow of [0,.8])for(const species of TREE_SPECIES)for(const seed of [2001,29166,0])for(let variant=0;variant<3;variant++){
  const tree=buildDetailedGarageTree(species,seed,variant,{snow});
  const p=tree.trunk.attributes.position;
  try{
   assert.ok(p.array.every(Number.isFinite),`${species}: finite branches`);
   if(species==='palm'){
    const corners=new Set();for(let i=p.count-60;i<p.count;i++)corners.add(`${p.getX(i)},${p.getY(i)},${p.getZ(i)}`);
    assert.equal(corners.size,12,'palm crown retains the twelve welded icosahedron corners');
    // Each frond's UV bottom edge must enter the physical crown collar.
    const uv=tree.foliage.attributes.uv, pos=tree.foliage.attributes.position;
    for(let i=0;i<pos.count;i+=3){
     const roots=[];for(let k=0;k<3;k++)if(uv.getY(i+k)===0)roots.push(new THREE.Vector3().fromBufferAttribute(pos,i+k));
     if(roots.length===2){const root=roots[0].add(roots[1]).multiplyScalar(.5);assert.ok(surfaceGap(tree.trunk,root)<.17,'palm frond root inside collar');}
    }
   }else{
    checkWind(tree.foliage);
    const rows=tree.trunk.userData.crownAttachments, original=tree.trunk.userData.originalTrunkVertices;
    const stations=tree.foliage.attributes.aCard;
    const unique=new Set();for(let i=0;i<stations.count;i++)unique.add(`${stations.getX(i)},${stations.getY(i)},${stations.getZ(i)}`);
    assert.ok(rows.length>=unique.size,`${species}: every cluster certified`);
    maximumTriangles=Math.max(maximumTriangles,(p.count-original)/3);
    for(const row of rows){
     const root=new THREE.Vector3().fromArray(row.root), tip=new THREE.Vector3().fromArray(row.tip);
     assert.ok(surfaceGap(tree.trunk,root,0,original)<1e-5,'branch starts on actual parent surface');
     if(row.gap>.25)beforeFloating++;
     assert.ok(surfaceGap(tree.trunk,tip)<.016,`${species}: leaf centre physically supported`);
     supported++;
    }
    assert.ok((p.count-original)/3<=rows.length*6,'bounded four-sided twig geometry');
    const repeat=buildDetailedGarageTree(species,seed,variant,{snow});
    assert.deepEqual(repeat.trunk.attributes.position.array,p.array,'seed stable');
    repeat.trunk.dispose();repeat.foliage.dispose();repeat.foliageTexture.dispose();
   }
   cases++;
  }finally{tree.trunk.dispose();tree.foliage.dispose();tree.foliageTexture.dispose();}
 }
 for(const species of TREE_SPECIES.filter(s=>s!=='palm'))for(let variant=0;variant<3;variant++){
  const tree=buildFallbackGarageTree(species,2001,variant,{});
  for(const row of tree.trunk.userData.crownAttachments)assert.ok(surfaceGap(tree.trunk,new THREE.Vector3().fromArray(row.tip))<.016,'far lobe supported');
  assert.ok(tree.trunk.userData.crownAttachments.length<=12,'far branch budget');
  tree.trunk.dispose();tree.foliage.dispose();
 }
 let battleCases=0;
 for(const id of MAP_IDS){
  const veg={palettes:{},bushSpecies:'oak',...getMapConfig(id).vegetation};
  for(const species of veg.species)for(let variant=0;variant<3;variant++){
   const tree=battleTree(2001,veg,species,variant);
   if(species!=='palm'){
    assert.ok(tree.trunk.userData.crownAttachments.length>0);
    for(const row of tree.trunk.userData.crownAttachments)assert.ok(surfaceGap(tree.trunk,new THREE.Vector3().fromArray(row.tip))<.016,`${id}/${species}: supported battle foliage`);
   }
   tree.trunk.dispose();tree.cards.dispose();battleCases++;
  }
 }
 assert.ok(beforeFloating>100,'fixture reproduces originally unsupported foliage');
 assert.ok(windGap<.016,`wind attachment gap ${windGap}`);
 console.log(JSON.stringify({cases,supported,beforeFloating,maximumTriangles,windGap,battleCases}));
}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
