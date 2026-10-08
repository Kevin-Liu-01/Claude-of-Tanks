import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,Ray,Vector3} from 'three';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {getSpec} from '../src/vehicles/specs.ts';
import {ensureInteriorFills} from '../src/vehicles/interiorFills.ts';
import {DRONE_DOCK_CRADLE,missionAttachmentMotionClear} from '../src/sim/missionAttachment.ts';
import {collectMissionStock,nativeRoofHeight,nativeSupportedSeat,nativeMissionCollision,nativeMissionTakeoffCollision} from './mission-attachment-geometry.mjs';

// Independent authoring witnesses: these are the bare permanent housing top
// facets, not values imported from the tool's support-permission atlas. The
// Bars and Bastion intentionally retain two shoes on the original cast roof.
const cases=[
 {id:'ru_t80u_modern',x:-1.05,z:-.70,rise:.085,region:[-1.22,-1.09,-.86,-.54],
  roof:p=>.71-(.01/1.05)*(p.z+1.02),expectedHousingFeet:2},
 {id:'ru_t72b3m_modern',x:-1.45,z:.45,rise:.045,offset:[-.24,0],region:[-1.615,-1.28,.28,.62],
  roof:p=>.77-(.07/.74)*(p.z-.14),expectedHousingFeet:4},
 {id:'ru_t72b3_modern',x:-1.05,z:-.60,rise:.085,region:[-1.22,-1.085,-.77,-.44],
  roof:p=>.67-(.02/.98)*(p.z+.79),expectedHousingFeet:2},
 {id:'pl_t72b3m_modern',x:-1.51,z:-.02,rise:.125,region:[-1.69,-1.28,-.22,.28],
  roof:()=>.740,expectedHousingFeet:4},
];
const ray=new Ray(new Vector3(),new Vector3(0,-1,0)),hit=new Vector3();
let boundaries=0,shoeRays=0,nativeCases=0;

function isolatedRoof(witness,{name='turretExternalArmor',id=witness.id,frame='turret',lift=0,downward=false}={}) {
 const [left,right,rear,front]=witness.region,x=(left+right)/2,z=(rear+front)/2;
 // The source surface deliberately extends beyond the permission rectangle.
 // This distinguishes a finite support rule from a global material exception.
 const points=[[-1,-1],[-1,1],[1,1],[-1,-1],[1,1],[1,-1]].map(([dx,dz])=>{
  const p={x:x+dx*.6,z:z+dz*.6};return [p.x,witness.roof(p)+lift,p.z];
 });
 if(downward)for(let i=0;i<points.length;i+=3)[points[i],points[i+2]]=[points[i+2],points[i]];
 const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(points.flat(),3));
 const material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material),root=new Group(),turret=new Group();
 turret.name='rig_turret';mesh.name=name;root.add(turret);turret.add(mesh);root.updateMatrixWorld(true);
 const stock=collectMissionStock({root},frame,-Infinity,false,{id,armor:{turretless:false}});
 geometry.dispose();material.dispose();return stock;
}

function supportBoundaryControls(witness) {
 const [left,right,rear,front]=witness.region,x=(left+right)/2,z=(rear+front)/2;
 const stock=isolatedRoof(witness),expected=witness.roof({x,z});
 assert(Math.abs(nativeRoofHeight(stock,x,z)-expected)<2e-6,`${witness.id}: actual upward plane is eligible`);
 // A 50 mm shoe half-depth must stay wholly inside the finite patch. Moving
 // the same real roof point by 2 mm across that boundary must change admission.
 for(const [axis,inside,outside] of [
  ['x',left+.051,left+.049],['x',right-.051,right-.049],
  ['z',rear+.051,rear+.049],['z',front-.051,front-.049],
 ]) {
  const inner={x,z,[axis]:inside},outer={x,z,[axis]:outside};
  assert(Number.isFinite(nativeRoofHeight(stock,inner.x,inner.z)),`${witness.id}: interior full-foot boundary`);
  assert.equal(nativeRoofHeight(stock,outer.x,outer.z),-Infinity,`${witness.id}: protruding foot is ineligible`);
  boundaries+=2;
 }
 for(const mutation of [
  {name:'turretDetail'}, {name:'turretMissionReceiver'}, {id:'unregistered-support-negative'},
  {frame:'hull'}, {lift:.001}, {lift:.025}, {downward:true},
 ]) {
  const changed=isolatedRoof(witness,mutation);
  assert.equal(nativeRoofHeight(changed,x,z),-Infinity,`${witness.id}: wrong bucket/ID/frame/plane/winding rejected ${JSON.stringify(mutation)}`);
  boundaries++;
 }
}

function receivingSurfaceAt(stock,x,z) {
 ray.origin.set(x,30,z);let y=-Infinity,row=null;
 for(const surface of stock.support) {
  const r=surface.supportRegion;
  if(r&&(x<r.minX||x>r.maxX||z<r.minZ||z>r.maxZ))continue;
  if(ray.intersectTriangle(surface.tri.a,surface.tri.b,surface.tri.c,false,hit)&&hit.y>y) {
   y=hit.y;row=surface;
  }
 }
 return {y,row};
}

function fullShoeContact(stock,seat,witness) {
 let index=0,housingFeet=0;
 for(const dx of [-seat.footX,seat.footX])for(const dz of [-seat.footZ,seat.footZ]) {
  const x=seat.x+dx,z=seat.z+dz,nominal=seat.supportY[index++],center=receivingSurfaceAt(stock,x,z),samples=[];
  assert(Math.abs(center.y-nominal)<1e-6,`${witness.id}: recorded shoe height equals actual receiving steel`);
  if(center.row?.name==='turretExternalArmor') {
   housingFeet++;
   assert(Math.abs(center.y-witness.roof({x,z}))<2e-6,`${witness.id}: independent permanent facet datum`);
  } else assert.equal(center.row?.name,'turret',`${witness.id}: other shoes contact the actual casting`);
  for(let ix=0;ix<=8;ix++)for(let iz=0;iz<=8;iz++) {
   // The actual shared renderer's 95×100 mm support shoe, including all four
   // corners and edges. A center ray alone misses steps and cantilevered feet.
   const sx=x-.0475+ix*.095/8,sz=z-.05+iz*.10/8,surface=receivingSurfaceAt(stock,sx,sz);
   assert(Number.isFinite(surface.y),`${witness.id}: complete shoe footprint has receiving steel`);
   samples.push(surface.y);shoeRays++;
  }
  assert(Math.max(...samples)<=nominal+.012+.0001,`${witness.id}: no receiving steel pokes above the finite shoe`);
  const contacts=samples.filter(y=>y>=nominal-.004&&y<=nominal+.012).length;
  assert(contacts>=samples.length*.60,`${witness.id}: a substantial shoe area embeds in steel, not a tangent point`);
 }
 assert.equal(housingFeet,witness.expectedHousingFeet,`${witness.id}: intended cast/housing support distribution`);
}

function assertClear(stock,spec,seat,label) {
 assert(missionAttachmentMotionClear(spec,seat),`${label}: complete roof gun motion and lift volume`);
 assert.equal(nativeMissionCollision(stock,seat),null,`${label}: actual fixed stock and complete main-gun motion`);
 assert.equal(nativeMissionTakeoffCollision(stock,seat),null,`${label}: unobstructed 12 m lift column`);
 assert(nativeMissionCollision(stock,{...seat,y:seat.y-.30}),`${label}: buried payload negative control`);
}

for(const witness of cases)supportBoundaryControls(witness);
await ensureInteriorFills(cases.map(w=>w.id));
for(const witness of cases) {
 let reference;
 for(const quality of ['high','low'])for(const seed of [4000,4242,8191]) {
  const spec=getSpec(witness.id),tank=createTank(witness.id,null,{quality,camoSeed:seed,proceduralOnly:true,geometryReceipt:true});
  try {
   tank.root.updateMatrixWorld(true);
   const stock=collectMissionStock(tank,'turret',-Infinity,false,spec);
   const candidate={frame:'turret',x:witness.x,y:0,z:witness.z,...DRONE_DOCK_CRADLE,
    ...(witness.offset?{payloadOffset:witness.offset}:{})};
   const seat=nativeSupportedSeat(stock,candidate,witness.rise),label=`${witness.id}/${quality}/${seed}`;
   assert(seat,`${label}: four native support hits`);reference??=seat;
   for(let i=0;i<4;i++)assert(Math.abs(reference.supportY[i]-seat.supportY[i])<.001,`${label}: quality/seed-stable native roof`);
   fullShoeContact(stock,seat,witness);assertClear(stock,spec,seat,label);
   if(witness.id==='ru_t72b3_modern'&&quality==='high'&&seed===4000) {
    // The earlier z=-.65 trial missed a 0.467 mm cast-roof step above its
    // inner shoe. The final finite patch excludes that trial's rear shoe,
    // rejecting it before a center-only contact exception can certify it.
    assert.equal(nativeSupportedSeat(stock,{...candidate,z:-.65},witness.rise),null,
     `${label}: original stepped-roof candidate cannot regain support`);
   }
   assert(tank.stripEra('turret_era_L'));assert(tank.stripEra('turret_era_R'));
   const spent=collectMissionStock(tank,'turret',-Infinity,false,spec),reseated=nativeSupportedSeat(spent,candidate,witness.rise);
   assert(reseated,`${label}: support persists in actual rendered buffers after ERA removal`);
   for(let i=0;i<4;i++)assert(Math.abs(reseated.supportY[i]-seat.supportY[i])<1e-6,`${label}: shoes rest on permanent steel, not ERA`);
   assertClear(spent,spec,seat,label+'/ERA-spent');
   assert(tank.resetEra());nativeCases++;
  } finally {tank.dispose();}
 }
}
console.log(`Mission housing supports passed: ${nativeCases} HIGH/LOW/seed cases, ${shoeRays} full-shoe rays, ${boundaries} support-boundary and invalid-surface controls; native weapon/lift clearance and ERA survival.`);
