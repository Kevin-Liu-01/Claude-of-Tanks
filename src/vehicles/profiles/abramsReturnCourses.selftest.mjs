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
import {combatAnatomyCalibration} from '../combatAnatomyCalibrationRegistry.ts';
import {turretSeatPlane} from '../turretSeatPlane.ts';

const ids=['m1a1','m1a1ha','ua_m1a1','m1a1_abrams_hc','m1a1_abrams_sa','m1a1_abrams_aim','m1a1_abrams_fep'];
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
// Re-pinned 2026-11-02 (release 268, abrams-bradley-268 builder A): the bow course's two deck corners follow the owner's
// source glacis (1.2052 at z 3.879 and 1.21 at 3.84; the print-fit table's 1.3115 / 1.34); its lower bow and width
// corners are unchanged. The original slab above stays the opposite-diagonal negative control.
const liveBow=orientedSlab(
 [-1.6791,1.1609803438,3.879],[1.6791,1.1609803438,3.879],
 [1.6791,.9850980639,3.84],[-1.6791,.9850980639,3.84],
 [-1.6291,1.205+.005*(.002/.041),3.879],[1.6291,1.205+.005*(.002/.041),3.879],
 [1.6291,1.21,3.84],[-1.6291,1.21,3.84]);
const liveBowPart=shellPart(liveBow);
assert(mirroredSurfaceError(oldBowPart,oldBowPart).maxM>.012,'original opposite-diagonal dent is detected');
// Original bustle already had mirrored corners and triangles. Its two side
// courses still bent inward: reflection alone cannot repair this defect.
const oldBustle=symmetricSlab(
 [-1.57,.16,-2.42],[1.57,.16,-2.42],[1.54645,.28,-3.13],[-1.54645,.28,-3.13],
 [-1.27,.7583125,-2.42],[1.27,.7583125,-2.42],[1.25095,.745,-3.03],[-1.25095,.745,-3.03]);
const oldBustlePart=shellPart(oldBustle);
assert(mirroredSurfaceError(oldBustlePart,oldBustlePart).maxM<2e-6);
assert(weldedPanelConcavity(oldBustlePart.triangles[2],oldBustlePart.triangles[3])>.06,'original mirrored inward bustle fold is detected');

// 264: since 247's ring receipts (6e540cd73e) the turret seat (turretSeatRace.ts seatTurretOverDeck) lays every corner
// of a triangle reaching past its keep radius that lies under its plane onto the plane, so two bustle-bottom stations'
// low corners come up. A captured turret part is matched as the seat leaves it (the same plane, turretSeatPlane.ts).
function seatedPart(part,root,id){
 const turret=root.getObjectByName('rig_turret'),hull=root.getObjectByName('rig_hull');
 const seat=turretSeatPlane(combatAnatomyCalibration(id)?.turretRing,turret.userData);
 if(!seat)return part;
 const toHull=hull.matrixWorld.clone().invert().multiply(turret.matrixWorld),toTurret=toHull.clone().invert();
 const radius=p=>Math.hypot(p.x-seat.cx,p.z-seat.cz);
 return {...part,triangles:part.triangles.map(t=>{
  const corners=t.points.map(p=>new Vector3(...p).applyMatrix4(toHull));
  if(!corners.some(p=>radius(p)>seat.keepR))return t;
  return {...t,points:corners.map(p=>{p.y=Math.max(p.y,seat.planeAt(Math.max(seat.keepR,radius(p))));return p.applyMatrix4(toTurret).toArray();})};
 })};
}

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
 const captures=[],bodies=[];
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242,
  partCensus(bucket,g,source){
   // 2026-11-03 (release 268 builder E): the M1A1 body and bustle are the owner's model's, one loft (profiles/m1a1Turret.ts)
   // instead of the five print-era bottom stations; it is captured whole and checked below as one closed mirrored solid.
   if(source==='add'&&bucket==='turret'&&g.attributes.position.count>300
    &&new Error().stack.includes('addAbramsShellBody'))bodies.push(g);
   if(source!=='add'||!['hull','turret'].includes(bucket)||g.attributes.position.count!==36)return;
   const site=new Error().stack;
   if(bucket==='hull'&&/loftBand|loftTrackClearBand/.test(site)
    ||bucket==='turret'&&site.includes('addAbramsShellBody'))captures.push({bucket,g});
  }});
 try{
  const parts=captures.map(({bucket,g})=>({...shellPart(g),g,bucket})).filter(p=>p.bucket==='hull'||p.bounds.max.z<-.729);
  // Re-pinned 2026-11-02 (release 268, abrams-bradley-268 builder A): the M1A1 deck table follows the owner's source
  // (a sloped glacis plate and a hull roof climbing under the turret: 20 stations, was 19 with the splash step), so the
  // hull lofts capture 56 courses (58 before).
  assert.equal(parts.filter(p=>p.bucket==='hull').length,56,`${id}/${quality}: every native hull loft course captured`);
  const bustle=parts.filter(p=>p.bucket==='turret');assert.equal(bustle.length,0,'no print-era bustle station remains');
  assert.equal(bodies.length,1,`${id}/${quality}: the measured body and bustle loft captured`);
  const native=nativeStructuralStock(tank.root,['hull','turret']);assert.deepEqual(native.unsupported,[]);
  for(const p of parts){
   const drawn=p.bucket==='turret'?seatedPart(p,tank.root,id):p;
   assert.equal(mapCapturedStock(drawn,native.buckets.get(p.bucket)).status,'all-native-triangles','tested stock exists in the actual drawable mesh');
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
  assert(bow);assert.equal(bow.signature,liveBowPart.signature,'all eight original bow boundary/attachment corners survive');
  {
   const body={...shellPart(bodies[0]),bucket:'turret'};
   const drawn=seatedPart(body,tank.root,id);
   // The seat (turretSeatRace.ts) lifts the body's floor course over a mark's own deck by a millimetre or so (the HA's,
   // 1 mm, inside the bearing it is drawn in): every other triangle is the native mesh's exactly, the floor course within
   // the seat's 2 mm.
   const floorY=Math.min(...body.vertices.map(v=>v[1]))+.0005,onFloor=i=>body.triangles[i].points.every(p=>p[1]<=floorY);
   assert.equal(mapCapturedStock({...drawn,triangles:drawn.triangles.filter((_,i)=>!onFloor(i))},native.buckets.get('turret')).status,
    'all-native-triangles','measured body exists in the actual drawable mesh');
   const nativeTris=[...native.buckets.get('turret').keys()].map(k=>k.split('|').map(s=>s.split(',').map(n=>+n/1e5)));
   const floor=drawn.triangles.filter((_,i)=>onFloor(i));assert(floor.length>0,'the body has its floor course');
   for(const t of floor)assert(nativeTris.some(n=>t.points.every(p=>n.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2])<.002))),
    'the floor course lies in the drawable mesh within the seat\'s 2 mm');
   assert.deepEqual(shellEdgeTopology(body),{boundary:0,nonmanifold:0,inconsistent:0});
   assert(body.volume>0,'finite outward body');assert.equal(properSurfaceCrossings(body).length,0);
   assert(mirroredSurfaceError(body,body).maxM<2e-6,'measured body reflects without dents');
   assert(near(body.bounds.min.z,-2.56)&&near(body.bounds.max.y,.709),'the model\'s rear face and roof');
   checked++;
  }
  // Move the observation independently of the final render buffer: native
  // correspondence must reject even a small shifted counterfeit course.
  const offset=bow.g.clone().translate(.003,0,0),offsetPart=shellPart(offset);
  assert.equal(mapCapturedStock(offsetPart,native.buckets.get('hull')).matchedTriangles,0,'offset/native mismatch is detected');
  assert(mirroredSurfaceError(offsetPart,bow).maxM>.001,'offset/mirror control is detected');offset.dispose();
  trackChecks+=movingTrackClearance(tank,id,parts);
  console.log(`${id}/${quality}: ${parts.length} live courses, exact footprint/undercut, outward side facets and physical mirror passed`);
 }finally{tank.dispose();}
}
oldBow.dispose();liveBow.dispose();oldBustle.dispose();
console.log(`Abrams returns: ${checked} actual native courses; ${nonplanarOutward} explicit outward nonplanar facets retained; ${trackChecks} animated3mm-expanded shoe bounds; historic dent, inward-fold, shifted-native and track-intrusion controls passed`);
