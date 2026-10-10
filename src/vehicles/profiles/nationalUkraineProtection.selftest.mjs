import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Box3,Euler,Matrix4,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {createTank} from '../tankFactory.ts';
import {TANK_SPECS} from '../specs.ts';
import {MISSION_ATTACHMENT_SEATS} from '../../sim/missionAttachmentSeats.generated.ts';
import {NATIONAL_UKRAINE_GHILLIE} from './nationalUkraineProtection.ts';
import {collectMissionStock,nativeSupportedSeat,nativeMissionCollision,nativeMissionTakeoffCollision} from '../../../tools/mission-attachment-geometry.mjs';

const ids=['ua_t80u_modern','ua_t72b3m_modern','ua_t72b3_modern','ua_t72b3m_hetman_ii'];
assert.deepEqual(Object.keys(NATIONAL_UKRAINE_GHILLIE).sort(),[...ids].sort());
const hash=g=>createHash('sha256').update(Buffer.from(g.attributes.position.array.buffer)).digest('hex');
function fingerprint(root,names){
 const digest=createHash('sha256');
 root.traverse(o=>{if(o.isMesh&&names.includes(o.name))digest.update(hash(o.geometry));});
 return digest.digest('hex');
}

function radial(box){
 const near=a=>box.min[a]>0?box.min[a]:box.max[a]<0?-box.max[a]:0;
 const far=a=>Math.max(Math.abs(box.min[a]),Math.abs(box.max[a]));
 return [Math.hypot(near('x'),near('z')),Math.hypot(far('x'),far('z'))];
}
/** Conservative continuum proof: finite axial cells enclose every actual
 * cannon triangle and all linear recoil, pitch intervals include rotational
 * chord error, and radial intervals enclose every turret yaw, not sampled
 * headings. No cell/added-stock overlap is permitted, even at zero area. */
function fullMainGunEnvelope(tank,spec,addedHull){
 tank.root.updateMatrixWorld(true);
 const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
 const turretInverse=turret.matrixWorld.clone().invert(),gunInverse=gun.matrixWorld.clone().invert();
 const cells=[],step=.10;
 gun.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.presentationInvisible||mesh.material?.colorWrite===false)return;
  let recoil=false;for(let p=mesh;p;p=p.parent){if(!p.visible)return;if(p.name==='rig_recoil'||p.name.startsWith('rig_barrel_'))recoil=true;if(p===gun)break;}
  const matrix=gunInverse.clone().multiply(mesh.matrixWorld),positions=mesh.geometry.attributes.position,index=mesh.geometry.index,bins=new Map();
  for(let i=0;i<(index?.count??positions.count);i+=3){
   const points=[0,1,2].map(k=>new Vector3().fromBufferAttribute(positions,index?index.getX(i+k):i+k).applyMatrix4(matrix));
   const box=new Box3().setFromPoints(points);
   for(let z=Math.floor(box.min.z/step);z<=Math.floor(box.max.z/step);z++){
    const slice=box.clone();slice.min.z=Math.max(slice.min.z,z*step);slice.max.z=Math.min(slice.max.z,(z+1)*step);
    if(bins.has(z))bins.get(z).union(slice);else bins.set(z,slice);
   }
  }
  const stroke=Math.max(Math.min(.24,Math.max(.06,.13*spec.gun.caliberMm/120)),Math.min(.085,Math.max(.055,spec.gun.caliberMm*.0022)));
  for(const box of bins.values()){
   if(recoil)box.min.z-=stroke;
   cells.push({box:box.applyMatrix4(new Matrix4().makeScale(...gun.scale.toArray())),name:mesh.name});
  }
 });
 // Runtime cannon recoil can rock the whole cradle upward by 0.014 rad.
 const low=-spec.gunDepressionDeg*Math.PI/180,high=spec.gunElevationDeg*Math.PI/180+.014;
 const steps=Math.ceil((high-low)/(.5*Math.PI/180)),delta=(high-low)/steps;
 const parent=turretInverse.clone().multiply(gun.parent.matrixWorld).multiply(new Matrix4().makeTranslation(...gun.position.toArray()));
 const swept=[];
 for(const {box,name}of cells){
  const radius=Math.hypot(...['x','y','z'].map(a=>Math.max(Math.abs(box.min[a]),Math.abs(box.max[a]))));
  const pose=a=>box.clone().applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(-a,gun.rotation.y,gun.rotation.z,gun.rotation.order)));
  for(let i=0;i<steps;i++){
   const bounds=pose(low+i*delta).union(pose(low+(i+1)*delta));
   bounds.expandByScalar(radius*(1-Math.cos(delta/2))+.00001).applyMatrix4(parent);
   swept.push({bounds,range:radial(bounds),name});
  }
 }
 const hit=box=>{const range=radial(box);return swept.find(s=>box.max.y>=s.bounds.min.y&&box.min.y<=s.bounds.max.y&&range[1]>=s.range[0]&&range[0]<=s.range[1]);};
 const pieces=addedHull.map(g=>({geometry:g,matrixWorld:tank.root.getObjectByName('rig_hull').matrixWorld,name:'added hull protection'}));
 tank.root.traverse(o=>{if(o.isMesh&&o.name.includes('_ghillie_hull_'))pieces.push(o);});
 let triangles=0;
 for(const mesh of pieces){
  const matrix=turretInverse.clone().multiply(mesh.matrixWorld),p=mesh.geometry.attributes.position,index=mesh.geometry.index;
  for(let i=0;i<(index?.count??p.count);i+=3){
   const points=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(matrix));
   const box=new Box3().setFromPoints(points).expandByScalar(.004),cross=hit(box);triangles++;
   assert(!cross,spec.id+': continuous main gun envelope intersects '+mesh.name+' triangle '+i/3+' at '+JSON.stringify([box.min.toArray(),box.max.toArray()])+' against '+cross?.name+' '+JSON.stringify(cross&&[cross.bounds.min.toArray(),cross.bounds.max.toArray(),cross.range]));
  }
 }
 assert(triangles>10000&&swept.length>1000,spec.id+': native continuum sweep has meaningful stock coverage');
 // Retain both independently observed illegal contacts as negative controls.
 // Restoring either old rail cannot silently pass this test.
 const oldContact={ua_t72b3_modern:[2.37376249,1.44455850,2.41710285],ua_t72b3m_hetman_ii:[2.44307805,1.46946863,-2.64802120]}[spec.id];
 if(oldContact){
  const p=new Vector3(...oldContact).applyMatrix4(tank.root.getObjectByName('rig_hull').matrixWorld).applyMatrix4(turretInverse);
  assert(hit(new Box3(p.clone(),p.clone()).expandByScalar(.004)),spec.id+': old cage collision must remain rejected');
 }
}

for(const quality of ['high','low'])for(const id of ids){
 const material=new MeshBasicMaterial({side:DoubleSide}),stock={hull:[],turret:[]},pads=[],counts={hull:0,turret:0},addedHull=[];
 let rods=0,lashings=0,newHullEra=0;
 // Trace authoring ownership through the common cassette/seating helpers;
 // retain enough frames for the glacis caller beyond the factory wrappers.
 const previousStackLimit=Error.stackTraceLimit;Error.stackTraceLimit=30;
 const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242,
  partCensus(bucket,g){
   const owner=bucket.startsWith('hull')?'hull':'turret';
   if([owner,owner+'ExternalArmor'].includes(bucket)&&!Object.hasOwn(g.userData,'eraHitFaceVertexStarts')){
    const mesh=new Mesh(g.clone(),material);mesh.updateMatrixWorld(true);stock[owner].push(mesh);
   }
   if(g.userData.eraHitFaceVertexStarts?.length)counts[owner]++;
   const attachment=g.userData.ukrainianProtection;
   const newEra=owner==='hull'&&g.userData.eraHitFaceVertexStarts!==undefined&&/ukrainianSkirtEra|addNationalUkraineProtection|glacisTiles/.test(new Error().stack);
   if(owner==='hull'&&(attachment||newEra))addedHull.push(g.clone());
   if(newEra&&g.userData.eraHitFaceVertexStarts.length)newHullEra++;
   if(attachment?.role==='support-pad')pads.push(attachment);
   if(attachment?.role==='open-cage-rod')rods++;
   if(attachment?.role==='net-lashing')lashings++;
  },
 });
 try{
  assert.equal(pads.length,22,id+': all side and bustle cage supports emitted');
  assert(rods>225&&lashings>=35,id+': substantial framed screens with attached net headers');
  const ray=new Raycaster();
  for(const pad of pads){
   const point=new Vector3(...pad.contact),normal=new Vector3(...pad.normal);
   ray.set(point.clone().addScaledVector(normal,.040),normal.clone().negate());ray.far=.080;
   const hits=ray.intersectObjects(stock[pad.owner],false);
   assert(hits.some(h=>h.point.distanceTo(point)<.0001),id+': cage pad lies on permanent stock');
  }
  // Sich retains one flank course over its lower field housings; the other
  // three have two. Its exposed forward banks still have two cheek courses.
  assert(counts.hull>=60&&counts.turret>=(id==='ua_t72b3_modern'?18:24),id+': dense independently authored ERA cassettes '+JSON.stringify(counts));
  assert.equal(newHullEra,id==='ua_t72b3m_hetman_ii'?56:counts.hull,id+': continuous motion check includes every new hull ERA body');
  const protectedHash=fingerprint(tank.root,['hullExternalArmor','turretExternalArmor']);
  const invariantNames=['hull','turret','gunMount','hullOpenLattice','turretOpenLattice'];
  const original=fingerprint(tank.root,invariantNames);
  for(const sector of ['glacis_era_L','glacis_era_R','skirt_era_L','skirt_era_R','turret_era_L','turret_era_R']){
   assert(tank.stripEra(sector),id+': '+sector+' is live removable ERA');
   const stripped=fingerprint(tank.root,['hullExternalArmor','turretExternalArmor']);
   assert.notEqual(stripped,protectedHash,id+': '+sector+' removes its real cassette stock');
   assert.equal(fingerprint(tank.root,invariantNames),original,id+': ERA removal leaves permanent shells, guns and cages intact');
   tank.stripEra(sector);
   assert.equal(fingerprint(tank.root,['hullExternalArmor','turretExternalArmor']),stripped,id+': repeated removal is idempotent');
   tank.resetEra();
   assert.equal(fingerprint(tank.root,['hullExternalArmor','turretExternalArmor']),protectedHash,id+': reset restores every ERA leaf');
  }
  for(const owner of ['hull','turret']){
   const mesh=tank.root.getObjectByName(owner+'OpenLattice');
   assert.equal(mesh.userData.continuityRole,'open-lattice');
   const net=tank.root.getObjectByName(id+'_ghillie_'+owner+'_net');
   assert(net&&net.parent.name==='rig_'+owner,id+': physical net follows '+owner);
   // 2026-10-08 (tank-accessories round 5, merging push 3): the lane's suit builder ties all its garnish into one
   // card draw per owner, named _leaves (ghillieSuit.ts, 2026-10-05); main's split _light/_dark layers are gone. Its
   // garnish is bunches tied at points along the nets (critic waves 253 and 269 against a dense uniform card layer: "a
   // hedge sculpture", "fish scales"), so a dozen bunches (300 vertices) is physical leaves, not a painted net.
   // 2026-10-09 (launch RC): the bar counts cards, not vertices. A card is 24 vertices at high quality and a flat 12 at
   // low (ghillieSuit.ts, GHILLIE_TOP_CARDS), so the same dozen cards is 150 vertices at low.
   const leaf=tank.root.getObjectByName(id+'_ghillie_'+owner+'_leaves');
   assert(leaf?.geometry.attributes.position.count>(quality==='low'?150:300),id+': physical leaves tied on, not only painted net');
  }
  const cfg=NATIONAL_UKRAINE_GHILLIE[id];
  assert.equal(cfg.hull.top,undefined,id+': hatch and engine deck remain open');
  assert.equal(cfg.turret.top,undefined,id+': roof weapons and drone launch column remain open');
  assert.equal(cfg.hull.side.length,6,id+': one cage bay on each flank remains uncovered for visible ERA');
  tank.root.updateMatrixWorld(true);
  fullMainGunEnvelope(tank,TANK_SPECS[id],addedHull);
  const seat=MISSION_ATTACHMENT_SEATS[id],native=collectMissionStock(tank,seat.frame,-Infinity,false,TANK_SPECS[id]);
  // Re-measure at the record's own cradle rise (the generator certifies .045, .085 or .125 m, as its sameSupport does).
  const supported=nativeSupportedSeat(native,seat,seat.y-Math.max(...seat.supportY));
  assert(supported,id+': all four existing drone feet retain their native seats');
  assert(Math.abs(supported.y-seat.y)<.0001,id+': camouflage did not become the drone support');
  assert.equal(nativeMissionCollision(native,seat),null,id+': parked drone and cradle clear actual stock and main gun motion');
  assert.equal(nativeMissionTakeoffCollision(native,seat),null,id+': complete 12 m drone lift remains clear');
  console.log(id,quality,'seated cages, leaflet ERA, explicit ghillie, continuous main-gun envelope and native drone corridor PASS',counts);
 }finally{
  tank.dispose();for(const meshes of Object.values(stock))for(const m of meshes)m.geometry.dispose();for(const g of addedHull)g.dispose();material.dispose();
  Error.stackTraceLimit=previousStackLimit;
 }
}
