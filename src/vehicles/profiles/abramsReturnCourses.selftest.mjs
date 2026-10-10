import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {isTrackShoeMesh} from '../../../tools/track-clip-classification.mjs';
import {createTank} from '../tankFactory.ts';
import {orientedSlab} from './kit.ts';
import {symmetricSlab} from './facetedSlab.ts';
import {shellPart,mirroredSurfaceError,slabWarps} from '../../../tools/base-shell-audit-math.mjs';
import {shellEdgeTopology,properSurfaceCrossings,weldedPanelConcavity} from '../../../tools/base-shell-integrity.mjs';
import {nativeStructuralStock,mapCapturedStock} from '../../../tools/base-shell-live-stock.mjs';

const ids=['m1a1','m1a1ha','ua_m1a1','m1a2','m1a2_tusk','m1a2_sepv2','m1a2_sepv3'];
const key=p=>p.map(n=>Math.round(n*1e5)).join(',');
const near=(a,b)=>Math.abs(a-b)<2e-6;
// Original finite narrow bow stock: identical eight boundary corners, but
// opposite diagonals produced a 12.56 mm interior mirror discrepancy.
const oldBow=orientedSlab(
 [-1.6791,1.1609803438,3.879],[1.6791,1.1609803438,3.879],
 [1.6791,.9850980639,3.84],[-1.6791,.9850980639,3.84],
 [-1.6291,1.3114633560,3.879],[1.6291,1.3114633560,3.879],
 [1.6291,1.34,3.84],[-1.6291,1.34,3.84]);
const oldBowPart=shellPart(oldBow);
assert(mirroredSurfaceError(oldBowPart,oldBowPart).maxM>.012,'original opposite-diagonal dent is detected');
// Original bustle already had mirrored corners and triangles. Its two side
// courses still bent inward: reflection alone cannot repair this defect.
const oldBustle=symmetricSlab(
 [-1.57,.16,-2.42],[1.57,.16,-2.42],[1.54645,.28,-3.13],[-1.54645,.28,-3.13],
 [-1.27,.7583125,-2.42],[1.27,.7583125,-2.42],[1.25095,.745,-3.03],[-1.25095,.745,-3.03]);
const oldBustlePart=shellPart(oldBustle);
assert(mirroredSurfaceError(oldBustlePart,oldBustlePart).maxM<2e-6);
assert(weldedPanelConcavity(oldBustlePart.triangles[2],oldBustlePart.triangles[3])>.06,'original mirrored inward bustle fold is detected');

function movingTrackClearance(tank,id,parts){
 const root=tank.root,hull=root.getObjectByName('rig_hull'),shoes=[];
 root.traverse(object=>{if(isTrackShoeMesh(object))shoes.push(object);});
 assert(shoes.length,'actual moving track stock exists');
 const stock=parts.filter(p=>p.bucket==='hull').flatMap(p=>[2,3,6,7].map(i=>p.triangles[i].triangle));
 const state=createTankState(getSpec(id),new Vector3(),0),instance=new Matrix4(),matrix=new Matrix4();
 const pitch=Math.max(...shoes.map(s=>s.userData.trackShoePitchM));assert(pitch>.1&&pitch<.2);
 let checks=0,negative=false;
 // One complete link-pitch cycle, both directions. Use each actual animated
 // shoe's full finite bounding box, including its pins and far-LOD stock,
 // expanded by3mm; this is conservative relative to its real triangles.
 for(let phase=0;phase<64;phase++){
  state.trackScroll.l=phase/64*pitch;state.trackScroll.r=-phase/64*pitch;
  tank.syncFromState(state,1);root.updateMatrixWorld(true);
  const inverse=hull.matrixWorld.clone().invert();
  for(const shoe of shoes){shoe.geometry.computeBoundingBox();
   for(let i=0;i<shoe.count;i++){
    shoe.getMatrixAt(i,instance);if(Math.abs(instance.determinant())<1e-10)continue;
    matrix.copy(inverse).multiply(shoe.matrixWorld).multiply(instance);
    const bounds=shoe.geometry.boundingBox.clone().applyMatrix4(matrix).expandByScalar(.003);checks++;
    for(const triangle of stock)assert(!bounds.intersectsTriangle(triangle),'actual animated track stock clears repaired return surface');
    if(!negative){
     const intruded=stock[0].clone(),offset=bounds.getCenter(new Vector3()).sub(intruded.getMidpoint(new Vector3()));
     for(const vertex of[intruded.a,intruded.b,intruded.c])vertex.add(offset);
     assert(bounds.intersectsTriangle(intruded),'a real return translated into the live shoe is rejected');negative=true;
    }
   }
  }
 }
 assert(negative);return checks;
}

let checked=0,nonplanarOutward=0,trackChecks=0;
for(const id of ids)for(const quality of ['high','low']){
 const captures=[];
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242,
  partCensus(bucket,g,source){
   if(source!=='add'||!['hull','turret'].includes(bucket)||g.attributes.position.count!==36)return;
   const site=new Error().stack;
   if(bucket==='hull'&&/loftBand|loftTrackClearBand/.test(site)
    ||bucket==='turret'&&site.includes('addAbramsShellBody'))captures.push({bucket,g});
  }});
 try{
  const parts=captures.map(({bucket,g})=>({...shellPart(g),g,bucket})).filter(p=>p.bucket==='hull'||p.bounds.max.z<-.729);
  assert.equal(parts.filter(p=>p.bucket==='hull').length,58,`${id}/${quality}: every native hull loft course captured`);
  const bustle=parts.filter(p=>p.bucket==='turret');assert.equal(bustle.length,5,'five original bustle bottom stations remain separate');
  const native=nativeStructuralStock(tank.root,['hull','turret']);assert.deepEqual(native.unsupported,[]);
  for(const p of parts){
   assert.equal(mapCapturedStock(p,native.buckets.get(p.bucket)).status,'all-native-triangles','tested stock exists in the actual drawable mesh');
   assert.deepEqual(shellEdgeTopology(p),{boundary:0,nonmanifold:0,inconsistent:0});
   assert(p.volume>0,'finite outward stock');assert.equal(properSurfaceCrossings(p).length,0);
   for(const i of [2,6])assert(weldedPanelConcavity(p.triangles[i],p.triangles[i+1])<2e-6,'both physical side panels fold outward');
   // Front/rear station faces, roof and belly stay planar. The two side
   // panels may retain explicit outward facets when their datums differ.
   for(const i of [0,4,8,10]){
    const a=p.triangles[i],normal=a.triangle.getNormal(new Vector3());
    for(const v of p.triangles[i+1].points)assert(Math.abs(normal.dot(new Vector3(...v).sub(a.triangle.a)))<2e-6,'station caps/roof/belly remain planar');
   }
   const other=parts.find(q=>q.bucket===p.bucket&&q.signature===p.mirrorSignature);
   assert(other,'matching reflected boundary corners');assert(mirroredSurfaceError(p,other).maxM<2e-6,'actual triangle interiors reflect without dents');
   nonplanarOutward+=slabWarps(p).length;checked++;
  }
  assert(nonplanarOutward>0,'do not pretend preserved noncoplanar datums became planar');
  const bow=parts.find(p=>p.bucket==='hull'&&near(p.bounds.min.z,3.84)&&near(p.bounds.max.z,3.879));
  assert(bow);assert.equal(bow.signature,oldBowPart.signature,'all eight original bow boundary/attachment corners survive');
  const tail=bustle.find(p=>near(p.bounds.min.z,-3.13));assert(tail);
  assert.equal(tail.signature,oldBustlePart.signature,'all eight original bustle boundary/attachment corners survive');
  const kneeDatums=[[-.73,-.102],[-1.36,-.102],[-1.43,-.03],[-1.66,.10],[-2.42,.16],[-3.13,.28]];
  const corners=new Set(bustle.flatMap(p=>p.vertices.map(key)));
  for(const [z,y]of kneeDatums)for(const side of[-1,1])
   assert(corners.has(key([side*(z===-3.13?1.54645:1.57),y,z])),'authored undercut bottom knee is retained');
  // Move the observation independently of the final render buffer: native
  // correspondence must reject even a small shifted counterfeit course.
  const offset=bow.g.clone().translate(.003,0,0),offsetPart=shellPart(offset);
  assert.equal(mapCapturedStock(offsetPart,native.buckets.get('hull')).matchedTriangles,0,'offset/native mismatch is detected');
  assert(mirroredSurfaceError(offsetPart,bow).maxM>.001,'offset/mirror control is detected');offset.dispose();
  trackChecks+=movingTrackClearance(tank,id,parts);
  console.log(`${id}/${quality}: ${parts.length} live courses, exact footprint/undercut, outward side facets and physical mirror passed`);
 }finally{tank.dispose();}
}
oldBow.dispose();oldBustle.dispose();
console.log(`Abrams returns: ${checked} actual native courses; ${nonplanarOutward} explicit outward nonplanar facets retained; ${trackChecks} animated3mm-expanded shoe bounds; historic dent, inward-fold, shifted-native and track-intrusion controls passed`);
