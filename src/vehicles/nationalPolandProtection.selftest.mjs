import assert from 'node:assert/strict';
import {Box3,Matrix4,Plane,Ray,Triangle,Vector3} from 'three';
import {createTank} from './tankFactory.ts';
import {auxiliaryWeaponProfile} from './auxiliaryWeapons.ts';
import {NATIONAL_POLAND_GHILLIE_CONFIGS} from './nationalPolandProtectionConfig.ts';
import {sampleArmorRay} from './profiles/armorFaceSampling.ts';
import {DEFAULT_EXCLUDE} from '../../tools/tank-voxel-body.mjs';

// The smallest Y over an entire continuous pitch interval. Turret-local yaw
// does not alter Y, so a horizontal separating plane proves every yaw clear.
function pitchMinimum(y,z,lower,upper){
 let min=Math.min(y*Math.cos(lower)-z*Math.sin(lower),y*Math.cos(upper)-z*Math.sin(upper));
 const critical=Math.atan2(-z,y)+Math.PI;
 for(const theta of [critical-2*Math.PI,critical,critical+2*Math.PI])
  if(theta>=lower&&theta<=upper)min=Math.min(min,-Math.hypot(y,z));
 return min;
}
function triangles(geometry,matrix){
 const p=geometry.attributes.position,ix=geometry.index,out=[];
 for(let i=0;i<(ix?.count??p.count);i+=3){
  const v=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(matrix));
  const tri=new Triangle(...v);out.push({v,tri,plane:tri.getPlane(new Plane()),box:new Box3().setFromPoints(v)});
 }return out;
}
function intersects(a,b){
 if(!a.box.intersectsBox(b.box))return false;
 for(const[x,y]of [[a,b],[b,a]]){const d=x.v.map(p=>y.plane.distanceToPoint(p));
  if(!(Math.min(...d)<-2e-5&&Math.max(...d)>2e-5))return false;}
 for(const[x,y]of [[a,b],[b,a]])for(let i=0;i<3;i++){
  const start=x.v[i],delta=x.v[(i+1)%3].clone().sub(start),length=delta.length(),point=new Vector3();
  if(length>2e-5&&new Ray(start,delta.divideScalar(length)).intersectTriangle(y.tri.a,y.tri.b,y.tri.c,false,point)
   &&point.distanceTo(start)>2e-5&&point.distanceTo(start)<length-2e-5)return true;
 }return false;
}
// Independent regression for the real 318-degree/full-depression witness.
// Raising only the new frame back by 60 mm reproduces the prior collision.
function zubrMainGunCorner(t){
 const turret=t.root.getObjectByName('rig_turret'),hull=t.root.getObjectByName('rig_hull');
 const gun=t.root.getObjectByName('rig_gun'),recoil=t.root.getObjectByName('rig_recoil');
 const saved=[turret.rotation.y,gun.rotation.x,recoil.position.z];
 try{
  turret.rotation.y=318*Math.PI/180;gun.rotation.x=6*Math.PI/180;
  for(const travel of [0,.13*125/120]){
   recoil.position.z=-travel;t.root.updateMatrixWorld(true);
   const inverse=new Matrix4().copy(hull.matrixWorld).invert(),fixed=[],moving=[];
   hull.traverse(o=>{if(o.isMesh&&o.name==='hullOpenLattice')
    fixed.push(...triangles(o.geometry,inverse.clone().multiply(o.matrixWorld)));});
   gun.traverse(o=>{if(o.isMesh&&!o.userData.shadowOnly&&!o.userData.authoredShadowProxy&&!/^procShadow/.test(o.name))
    moving.push(...triangles(o.geometry,inverse.clone().multiply(o.matrixWorld)));});
   const bounds=new Box3();for(const f of fixed)bounds.union(f.box);
   assert(!moving.some(a=>a.box.intersectsBox(bounds)&&fixed.some(b=>intersects(a,b))),
    `Zubr II: main gun clears native hull frames at full depression/recoil ${travel}`);
   const former=fixed.filter(f=>f.box.min.x<-2.3&&f.box.max.z>2.60).map(f=>{
    const v=f.v.map(p=>p.clone().add(new Vector3(0,.06,0))),tri=new Triangle(...v);
    return{v,tri,plane:tri.getPlane(new Plane()),box:new Box3().setFromPoints(v)};
   });
   assert(moving.some(a=>former.some(b=>intersects(a,b))),
    'Zubr II: former frame height reproduces the reported native triangle collision');
  }
 }finally{[turret.rotation.y,gun.rotation.x,recoil.position.z]=saved;t.root.updateMatrixWorld(true);}
}
// The drawn whole-model cost (visible colour passes, instanced copies counted; profiles/arieteC2X.selftest's census)
// and the suit's part of it (its nets and garnish).
function census(t){
 let triangles=0,suit=0,garnish=0;
 t.root.traverse(o=>{
  if(!o.isMesh)return;let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;
  if(!visible||o.userData.shadowOnly||o.userData.authoredShadowProxy||o.name.startsWith('procShadow_'))return;
  const mats=Array.isArray(o.material)?o.material:[o.material];if(!mats.some(m=>m.colorWrite))return;
  const n=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);
  triangles+=n;if(/_ghillie_/.test(o.name))suit+=n;if(/_ghillie_.*_leaves$/.test(o.name))garnish+=n;
 });
 return{triangles,suit,garnish};
}
const costs={};
let supportShoes=0;
for(const id of Object.keys(NATIONAL_POLAND_GHILLIE_CONFIGS))for(const quality of ['high','low']){
 const added=[],permanent={hull:[],turret:[]},turretEra=[];
 let eraBodies=0;
 const t=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,camoSeed:4242,
  partCensus(bucket,g){
   if(g.userData.polishProtection)added.push({owner:bucket.startsWith('hull')?'hull':'turret',bucket,g:g.clone()});
   const hitFaces=g.userData.eraHitFaceVertexStarts;
   if(Array.isArray(hitFaces)&&hitFaces.length)eraBodies++;
   if(bucket==='turretExternalArmor'&&hitFaces!==undefined)turretEra.push(g.clone());
   if(bucket==='hullExternalArmor'||bucket==='turretExternalArmor'){
    if(hitFaces===undefined)permanent[bucket.startsWith('hull')?'hull':'turret'].push(g.clone());
   }
  },
 });
 try{
  const label=`${id}/${quality}`;
  assert(eraBodies>150,`${label}: substantial independent destructible ERA population`);
  assert(added.length>120,`${label}: complete supported screens, not a few unsupported rods`);
  for(const {owner,bucket,g}of added){
   if(g.userData.polishProtection!=='mount-shoe')assert(DEFAULT_EXCLUDE.test(bucket),`${label}: open cage members cannot close the voxel body`);
   g.computeBoundingBox();assert(!g.boundingBox.isEmpty());
   const a=g.attributes.position;for(let i=0;i<a.array.length;i++)assert(Number.isFinite(a.array[i]),`${label}: finite frame geometry`);
   if(owner==='hull'){
    const b=g.boundingBox;
    assert(b.min.x>1.85||b.max.x< -1.85,`${label}: cage and brackets clear the running-gear corridor`);
   }
   const support=g.userData.polishSupport;if(!support)continue;
   const center=new Vector3(...support.center),normal=new Vector3(...support.normal);
   const origin=center.clone().addScaledVector(normal,.20),direction=normal.clone().negate();
   const hits=permanent[owner].map(s=>sampleArmorRay(s,origin,direction)).filter(Boolean);
   assert(hits.length,`${label}: shoe has permanent steel beneath it after ERA is spent`);
   const distance=Math.min(...hits.map(h=>h.point.distanceTo(origin)));
   assert(Math.abs(distance-.185)<.00001,`${label}: shoe embeds 15 mm into the actual sloped surface, distance=${distance}`);
   supportShoes++;
  }
  for(const sector of ['glacis_era_L','glacis_era_R','skirt_era_L','skirt_era_R','turret_era_L','turret_era_R']){
   assert(t.stripEra(sector),`${label}: ERA has a live game damage sector ${sector}`);
  }
  t.resetEra();
  if(id==='t72b3_zubr_ii')zubrMainGunCorner(t);
  const turret=t.root.getObjectByName('rig_turret');
  assert(t.root.getObjectByName(id+'_ghillie_turret_net'),`${label}: camouflage is present in native factory output`);
  assert(t.root.getObjectByName(id+'_ghillie_hull_net'),`${label}: hull net is present in native factory output`);
  t.root.updateMatrixWorld(true);
  let station;turret.traverse(o=>{if(o.userData.remoteControlled)station=o;});assert(station,`${label}: existing roof station remains`);
  const weapon=station.getObjectByName('auxiliaryWeaponPitch'),profile=auxiliaryWeaponProfile(station.userData.caliberMm,id);
  const inverseWeapon=new Matrix4().copy(weapon.matrixWorld).invert(),inverseTurret=new Matrix4().copy(turret.matrixWorld).invert();
  const pivot=new Vector3().setFromMatrixPosition(weapon.matrixWorld).applyMatrix4(inverseTurret);
  let low=Infinity,high=-Infinity;
  weapon.traverse(o=>{if(!o.isMesh)return;const matrix=inverseWeapon.clone().multiply(o.matrixWorld),p=o.geometry.attributes.position;
   for(let i=0;i<p.count;i++){
    const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix);
    low=Math.min(low,pivot.y+pitchMinimum(v.y,v.z,-profile.elevationRad,profile.depressionRad));
   }
  });
  for(const g of [...added.filter(p=>p.owner==='turret').map(p=>p.g),...turretEra]){g.computeBoundingBox();high=Math.max(high,g.boundingBox.max.y);}
  // 2026-10-09 (launch RC): the suit draws its scrim as one garnish layer since the accessories lane's b0617f402
  // (2026-10-05, "one garnish draw per owner instead of two"): the light and dark flap layers became spray cards each
  // tinted between the suit's light and dark colours (ghillieSuit.ts, clumpTint), so the turret carries the merged net
  // and one garnish mesh whose cards hold both scrim colours
  const clothMeshes=[];
  turret.traverse(o=>{if(!o.isMesh||!o.name.includes('_ghillie_turret_'))return;clothMeshes.push(o);});
  assert.deepEqual(clothMeshes.map(o=>o.name.slice(id.length)).sort(),['_ghillie_turret_leaves','_ghillie_turret_net'],`${label}: merged net plus one scrim garnish layer`);
  const tint=clothMeshes.find(o=>o.name.endsWith('_leaves')).geometry.getAttribute('color'),tints=new Set();
  for(let i=0;i<(tint?.count??0);i++)tints.add([tint.getX(i),tint.getY(i),tint.getZ(i)].map(v=>v.toFixed(3)).join());
  assert(tints.size>=2,`${label}: the scrim garnish carries cards of more than one colour (${tints.size})`);
  assert(low-high>.20,`${label}: every new ERA and cage surface remains below the entire roof-gun sweep (${low-high})`);
  // 2026-10-13 (netting-pl; the owner: "also add a bunch of ghillie on the husarz and zubr polish tanks"): the Husarz and
  // both Zubrs wear the full field suit, its roof net laid on the turret roof under the station (nationalPolandProtectionConfig
  // fieldSuit), so the suit is held to the sweep where the weapon passes over it instead of to one plane under its lowest
  // reach: every turret suit vertex lies 8 mm (nationalRoof.selftest's margin) under the lowest the weapon's stock comes
  // at its distance from the station's yaw axis through the weapon's whole pitch range (25 pitches, 2 cm radial bins and
  // their neighbours). The scrim-only Wilk's screen scrim keeps the 20 cm plane.
  const axis=new Vector3().setFromMatrixPosition(station.matrixWorld).applyMatrix4(inverseTurret),floor=[];
  const savedPitch=weapon.rotation.x,toTurret=new Matrix4();
  for(let k=0;k<=24;k++){
   weapon.rotation.x=-profile.elevationRad+(profile.elevationRad+profile.depressionRad)*k/24;weapon.updateMatrixWorld(true);
   weapon.traverse(o=>{if(!o.isMesh)return;toTurret.multiplyMatrices(inverseTurret,o.matrixWorld);const p=o.geometry.attributes.position;
    for(let i=0;i<p.count;i++){const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(toTurret),bin=Math.floor(Math.hypot(v.x-axis.x,v.z-axis.z)/.02);
     floor[bin]=Math.min(floor[bin]??Infinity,v.y);}
   });
  }
  weapon.rotation.x=savedPitch;t.root.updateMatrixWorld(true);
  const field=!!NATIONAL_POLAND_GHILLIE_CONFIGS[id].fieldClearanceM;
  let suitMargin=Infinity,scrimTop=-Infinity;
  for(const mesh of clothMeshes){
   toTurret.multiplyMatrices(inverseTurret,mesh.matrixWorld);const p=mesh.geometry.attributes.position;
   for(let i=0;i<p.count;i++){
    const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(toTurret),bin=Math.floor(Math.hypot(v.x-axis.x,v.z-axis.z)/.02);
    scrimTop=Math.max(scrimTop,v.y);
    let under=Infinity;for(let b=Math.max(0,bin-1);b<=bin+1;b++)under=Math.min(under,floor[b]??Infinity);
    if(Number.isFinite(under))suitMargin=Math.min(suitMargin,under-v.y);
   }
  }
  if(field)assert(suitMargin>=.008,`${label}: the field suit stays under the roof gun's swept floor at every radius (${suitMargin.toFixed(4)})`);
  else assert(low-scrimTop>.20,`${label}: the screen scrim remains below the entire roof-gun sweep (${low-scrimTop})`);
  (costs[id]??={})[quality]=census(t);
  console.log(`${label}: ${eraBodies} ERA bodies, ${added.length} frame parts, ${(low-high).toFixed(3)} m continuous roof-gun clearance, suit ${field?`${suitMargin.toFixed(3)} m under the swept floor`:`${(low-scrimTop).toFixed(3)} m under the sweep`}`);
 }finally{
  t.dispose();for(const d of [...added.map(p=>p.g),...permanent.hull,...permanent.turret,...turretEra])d.dispose();
 }
}
assert(supportShoes>=120,'all four layouts on both geometry tiers exercised their physical mounting shoes');
// 2026-10-13 (netting-pl; the coordinator on the owner's performance push: "thin the garnish's triangle cost (fewer cards
// per clump, LOD the far clumps) rather than raise ceilings ... Fix the Zubr II LOW ratio by dropping more garnish on LOW,
// not by trimming HIGH coverage"): the three field-suited hulls had no frozen whole-model ceiling. Before their suits
// (main 7a257c3ed, ledger rows) they drew 132.3k (Husarz), 129.4k (Zubr) and 141.2k (Zubr II) triangles at HIGH, the
// Zubr II's LOW already 75.4 % of its HIGH. The suit (garnishBudget: 70 % of each clump's cards, broader; 35 % of them
// at LOW) adds 7.3-7.9k at HIGH over the screen scrim it replaces: this census 140.0k, 136.5k and 148.6k at HIGH, LOW
// 73.4, 72.8 and 74.8 % (with netting-proper's turned fallbacks, a76057e82: 140.2k, 136.7k, 148.7k; 73.3, 72.7, 74.7 %).
// Frozen here with 1.5k over the first census: each stays under its ceiling at HIGH, LOW under 75 % of HIGH, and the
// LOW garnish under a quarter of the HIGH's.
const CEILINGS={t80u_husarz:141600,t72b3_zubr:138100,t72b3_zubr_ii:150200};
for(const [id,ceiling] of Object.entries(CEILINGS)){
 const {high,low}=costs[id];
 console.log(`${id}: HIGH ${high.triangles} (suit ${high.suit}, garnish ${high.garnish}) LOW ${low.triangles} (suit ${low.suit}, garnish ${low.garnish}) = ${(100*low.triangles/high.triangles).toFixed(1)} %`);
 assert(high.triangles<=ceiling,`${id}: frozen whole-model HIGH ceiling ${ceiling} (${high.triangles})`);
 assert(low.triangles<=high.triangles*.75,`${id}: LOW <= 75 % of HIGH (${low.triangles} / ${high.triangles})`);
 assert(low.garnish<=high.garnish*.25,`${id}: the far tier draws under a quarter of the garnish (${low.garnish} / ${high.garnish})`);
}
console.log(`Polish protection: ${supportShoes} armor contact shoes; all four variants pass.`);
