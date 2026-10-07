import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Box3,Vector3,Mesh,MeshBasicMaterial,DoubleSide,Raycaster} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec,ALL_TANK_IDS,TANK_SPECS} from './specs.ts';
import {auditFleetBalance} from './balanceAudit.ts';
import {NATIONAL_MODERNIZATION_CONFIG} from './nationalModernizationConfig.ts';
import {NATIONAL_LEGACY_CONFIG} from './nationalLegacyConfig.ts';
const configs=[...NATIONAL_MODERNIZATION_CONFIG,...NATIONAL_LEGACY_CONFIG.map(c=>({...c,model:c.donor==='t72b3m_x'?1:2}))];
import {NATIONAL_ROOF_LOADOUTS} from './nationalRoofConfig.ts';
import {auxiliaryWeaponProfile} from './auxiliaryWeapons.ts';
import {decorManifestFor} from './decorations.ts';
import {censusEquipment} from '../../tools/source-equipment-policy.mjs';
import {nationalModernizationDesign} from './nationalModernizationDesign.ts';
import {tankTier} from './tier.ts';
import {shellPart,auditShellParts} from '../../tools/base-shell-audit-math.mjs';
const legacyIds=new Set(NATIONAL_LEGACY_CONFIG.map(c=>c.id));
for(const c of NATIONAL_LEGACY_CONFIG)assert.equal(getSpec(c.id).balancePeerOf,c.predecessor,
 `${c.id}: preserved design shares its predecessor's unchanged combat weighting`);
assert.deepEqual(
 auditFleetBalance(ALL_TANK_IDS,TANK_SPECS,tankTier).filter(issue=>!legacyIds.has(issue.id)),
 auditFleetBalance(ALL_TANK_IDS.filter(id=>!legacyIds.has(id)),TANK_SPECS,tankTier),
 'preserved visual variants do not shift other vehicles\' combat balance medians');
import {buildT80UXHullCore} from './profiles/t80uX.ts';
import {buildT72B3MXHullCore} from './profiles/t72b3mX.ts';
import {buildT72B3XHullCore} from './profiles/t72b3X.ts';
const vertexKey=(x,y,z)=>[x,y,z].map(v=>Math.round(v*10000)).join(',');
const coreVertices=[buildT80UXHullCore,buildT72B3MXHullCore,buildT72B3XHullCore].map(build=>{
 const points=new Set();build({add(_bucket,g,x=0,y=0,z=0){
  const a=g.attributes.position;for(let i=0;i<a.count;i++)points.add(vertexKey(a.getX(i)+x,a.getY(i)+y,a.getZ(i)+z));g.dispose();
 }});return points;
});
const fingerprint=g=>createHash('sha256').update(Buffer.from(g.getAttribute('position').array.buffer)).digest('hex');
function armorFingerprint(root){const h=createHash('sha256');root.traverse(o=>{if(o.isMesh&&o.geometry?.attributes.position)h.update(Buffer.from(o.geometry.attributes.position.array.buffer));});return h.digest('hex');}
const hulls=new Map(),gears=new Map();
const gearDatums=root=>root.getObjectByName('rig_hull').userData.runningGearReceipts.map(r=>({
 wheelZs:r.wheelZs,wheelR:r.wheelR,xcLeft:r.xcLeft,xcRight:r.xcRight,trackW:r.trackW,sprocket:r.sprocket,idler:r.idler,topY:r.topY,
}));
// Fixed interior stations on three separate panels, away from the intentional
// hinge gaps. Different national layouts put their seams in different places.
const skirtProbeStations={
 ua:[[-.976,0,.976],[-.697,0,.697],[-1.22,-.407,.407]],
 pl:[[-.706,.03,.766],[-1.385,-.415,.555],[-.936,-.292,.352]],
 cn:[[-1.26,-.38,.5],[-.604,.215,1.034],[-.844,.16,1.164]],
 ru:[[-1.17,-.35,.47],[-.643,.06,.763],[-1.17,-.35,.47]],
};
function physicalMounts(tank,c){
 const shell=tank.root.getObjectByName('turret'),hull=tank.root.getObjectByName('hull'),d=c.design??nationalModernizationDesign(c);
 const mat=new MeshBasicMaterial({side:DoubleSide}),target=new Mesh(shell.geometry,mat),body=new Mesh(hull.geometry,mat);
 target.updateMatrixWorld(true);body.updateMatrixWorld(true);const ray=new Raycaster();
 const surroundings=[];tank.root.traverse(o=>{if(o.isMesh&&['turretExternalArmor','turretInteriorFill'].includes(o.name)){
  const proxy=new Mesh(o.geometry,mat);proxy.updateMatrixWorld(true);surroundings.push(proxy);
 }});
 const receiving=[target,...surroundings];
 for(const sector of ['skirt_era_L','skirt_era_R'])assert(tank.stripEra(sector),`${c.id}: skirt ERA removed for permanent backing probe`);
 const skirtStock=[];tank.root.traverse(o=>{if(o.isMesh&&o.name==='hullExternalArmor'){
  const proxy=new Mesh(o.geometry,mat);proxy.updateMatrixWorld(true);skirtStock.push(proxy);
 }});
 try {
  for(const p of [d.rws,d.cupola]){
   ray.set(new Vector3(p[0],p[1]+.20,p[2]),new Vector3(0,-1,0));
   const hit=ray.intersectObject(target)[0];assert(hit&&Math.abs(hit.point.y-p[1])<.009,`${c.id} roof weapon/cupola sits on its actual roof`);
  }
  // The bearing is allowed to enter the two cheeks; the barrel's central
  // pitch corridor must remain open ahead of the transverse rear bulkhead.
  for(const x of [-.34,0,.34])for(const y of [.14,.43,.71]){
   ray.set(new Vector3(x,y,3),new Vector3(0,0,-1));const hit=ray.intersectObjects(receiving,false)[0];
   assert(!hit||hit.point.z<=(c.design?.36:.56),`${c.id} primary gun aperture is real air ahead of its rear receiver`);
  }
  const mount=tank.root.getObjectByName('gunMount');mount.geometry.computeBoundingBox();
  const moving=new Mesh(mount.geometry,mat);moving.updateMatrixWorld(true);
  for(const side of [-1,1]){
   ray.set(new Vector3(0,.43,.84),new Vector3(side,0,0));const hit=ray.intersectObject(target)[0];
   assert(hit&&Math.abs(hit.point.x)<.419,`${c.id} bearing enters its receiving cheek`);
   assert(mount.geometry.boundingBox.max.x>=.419&&mount.geometry.boundingBox.min.x<=-.419,'full cross-turret bearing axle');
  }
  // At the actual elevation/depression poses the shield nearly meets the
  // cheek wall. The former narrow sleeve left 125 mm of visible daylight.
  // Probe the lower shield seat shared by even the shortest Chinese cheeks;
  // a raised muzzle ahead of a cheek is intentionally no longer beside it.
  for(const pitch of [-.24435,0,.10472])for(const z of [.14,.20,.25])for(const side of [-1,1]){
   ray.set(new Vector3(0,-.10,z),new Vector3(side,0,0));
   const movingHit=ray.intersectObject(moving)[0];assert(movingHit,'solid elevating shield');
   ray.set(new Vector3(0,.43-.10*Math.cos(pitch)-z*Math.sin(pitch),.90-.10*Math.sin(pitch)+z*Math.cos(pitch)),new Vector3(side,0,0));
   const fixedHit=ray.intersectObject(target)[0];assert(fixedHit,`${c.id}: receiving cheek alongside shield at pitch ${pitch}, z ${z}`);
   const seam=Math.abs(fixedHit.point.x)-Math.abs(movingHit.point.x);
   assert(seam>=.002&&seam<=.020,`${c.id}: mantlet/cheek seam ${seam}m at pitch ${pitch}, z ${z}`);
  }
  if(!c.design) {
   const movingStock=[moving];
   tank.root.traverse(o=>{if(o.isMesh&&/^(gunMount|gunInteriorFill)/.test(o.name)&&o.name!=='gunMount')movingStock.push(new Mesh(o.geometry,mat));});
   let rearSamples=0;
   for(const pitch of [-.24435,0,.10472]) {
    for(const stock of movingStock){stock.position.set(0,.43,.90);stock.rotation.x=pitch;stock.updateMatrixWorld(true);}
    for(const x of [-.30,0,.30])for(let degrees=-60;degrees<=60;degrees+=10) {
     const a=degrees*Math.PI/180,center=new Vector3(x,.43,.90),dir=new Vector3(0,Math.sin(a),-Math.cos(a));
     ray.set(center,dir);ray.near=.20;ray.far=.90;
     const wall=ray.intersectObjects(receiving,false)[0];if(!wall)continue;
     ray.set(center.clone().addScaledVector(dir,2),dir.clone().negate());ray.near=0;ray.far=1.8;
     const skin=ray.intersectObjects(movingStock,false)[0];if(!skin)continue;
     const gap=wall.distance-(2-skin.distance);
     assert(gap>=.020,`${c.id}: rear receiver collision ${gap} at ${degrees}°, pitch ${pitch}`);
     rearSamples++;
    }
   }
   assert(rearSamples>35,`${c.id}: finite rear receiver sweep coverage`);
   moving.position.set(0,0,0);moving.rotation.x=0;moving.updateMatrixWorld(true);
   ray.near=0;ray.far=Infinity;
   for(const x of [-.28,0,.28])for(const z of [-.35,-.20,0,.20]) {
    ray.set(new Vector3(x,.8,z),new Vector3(0,-1,0));
    const h=ray.intersectObject(moving)[0];
    assert(h&&h.point.y>.19,`${c.id}: full upper cover occupies rear gap at ${x},${z}`);
   }
  }
  // Dense longitudinal probes fall between the old isolated support beams.
  // Use only permanent surface geometry, never the generated interior fill.
  const shoulders=[];tank.root.traverse(o=>{if(o.isMesh&&['hullDetail','hullEquipment','hullExternalArmor'].includes(o.name)){
   const proxy=new Mesh(o.geometry,mat);proxy.updateMatrixWorld(true);shoulders.push(proxy);
  }});
  for(const side of [-1,1])for(const x of [1.82,1.85])for(let i=0;i<=58;i++){
   const z=-2.9+i*.1;ray.set(new Vector3(side*x,3,z),new Vector3(0,-1,0));
   const hit=ray.intersectObjects(shoulders,false).find(h=>h.point.y>.60&&h.point.y<1.80);
   assert(hit,`${c.id}: fender/skirt daylight at x ${side*x}, z ${z}`);
  }
  // The modern skirts have finite permanent backing, not just a thin ERA
  // rectangle. ERA is removed above: its cassette/lid must not count toward
  // backing thickness. Every chosen station must contain substantial stock.
  for(const side of [-1,1]){
   for(const z of skirtProbeStations[c.package][c.model]){
    ray.set(new Vector3(side*3.5,1.0,z),new Vector3(-side,0,0));
    const xs=ray.intersectObjects(skirtStock,false).map(h=>side*h.point.x).filter(x=>x>1.75);
    const thickness=xs.length?Math.max(...xs)-Math.min(...xs):0;
    assert(thickness>=.15,`${c.id}: permanent skirt backing ${thickness}m at side ${side}, z ${z}`);
   }
  }
  // Full 360-degree sweep of lower primary armor against the actual new hull.
  const samples=[];
  for(const mesh of receiving){const pos=mesh.geometry.attributes.position;
  for(let i=0;i<pos.count;i+=3){
   const a=new Vector3().fromBufferAttribute(pos,i),b=new Vector3().fromBufferAttribute(pos,i+1),v=new Vector3().fromBufferAttribute(pos,i+2);
   if(b.clone().sub(a).cross(v.clone().sub(a)).y>=-1e-5)continue;
   for(const p of [a,b,v,a.clone().add(b).add(v).multiplyScalar(1/3)])if(Math.hypot(p.x,p.z)>.97)samples.push(p);
  }
  }
  assert(samples.length>12,'sweep samples actual underside faces');
  let positiveControl=0;
  for(let yaw=0;yaw<360;yaw+=15){const angle=yaw*Math.PI/180;
   for(const v of samples){
    const x=.008+v.x*Math.cos(angle)+v.z*Math.sin(angle),z=c.z-v.x*Math.sin(angle)+v.z*Math.cos(angle),y=c.y+v.y;
    ray.set(new Vector3(x,5,z),new Vector3(0,-1,0));const hit=ray.intersectObject(body)[0];if(!hit)continue;
    assert(hit.point.y-y<=.004,`${c.id} turret penetrates hull at yaw ${yaw}: ${hit.point.y-y}m`);
    if(hit.point.y+.5-y>0)positiveControl++;
   }
  }
  assert(positiveControl>20,'raising hull .5m would fail the sweep');
 }finally{tank.resetEra();mat.dispose();}
}
for(const quality of ['high','low']) {
 for(const donorId of ['t80u_x','t72b3m_x','t72b3_x']){
  const t=createTank(donorId,null,{proceduralOnly:true,quality,geometryReceipt:true});
  hulls.set(`${quality}:${donorId}`,fingerprint(t.root.getObjectByName('hull').geometry));gears.set(`${quality}:${donorId}`,gearDatums(t.root));t.dispose();
 }
 const silhouettes=new Set(),hullShapes=new Set();
 for(const c of configs){
  assert.equal(ALL_TANK_IDS.filter(id=>id===c.id).length,1);
  const spec=getSpec(c.id);assert.deepEqual(decorManifestFor(spec,()=>.5),[],`${c.id}: authored equipment has no unsupported generic overlay`);assert(spec.name.endsWith('(Concept)'));assert.equal(spec.nation,c.nation);
  assert.equal(spec.gun.caliberMm,125);assert.equal(tankTier(c.id),10);
  for(const side of ['L','R'])assert(spec.armor.hullPlates.some(p=>p.name===`skirt_era_${side}`&&p.era),`${c.id}: visible skirt ERA has a damage sector`);
  const modules=spec.armor.modules.map(m=>m.module);assert.equal(new Set(modules).size,modules.length);
  const baseStock=[];
  const tank=createTank(c.id,null,{proceduralOnly:true,quality,geometryReceipt:true,camoSeed:4242,
   partCensus(bucket,g,source){
    if(legacyIds.has(c.id)||source!=='add'||!['hull','turret','hullExternalArmor','turretExternalArmor'].includes(bucket)
      ||Array.isArray(g.userData.eraHitFaceVertexStarts))return;
    const part=shellPart(g,{bucket,ordinal:baseStock.length});
    if(Math.max(...part.size.toArray())>=.75&&part.area>=.35)baseStock.push(part);
   },
  });
  try {
   for(const pair of auditShellParts(baseStock).mirroredPairs)
    assert(pair.maxM<.005,`${c.id} ${quality}: mirrored base stock differs by ${pair.maxM}m`);
   const hull=tank.root.getObjectByName('hull'),turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
   const bodyHash=fingerprint(hull.geometry);
   const present=new Set(),hp=hull.geometry.attributes.position;
   for(let i=0;i<hp.count;i++)present.add(vertexKey(hp.getX(i),hp.getY(i),hp.getZ(i)));
   for(const point of coreVertices[c.model])assert(present.has(point),`${c.id}: native donor hull vertex ${point} retained`);
   hullShapes.add(bodyHash);assert.deepEqual(gearDatums(tank.root),gears.get(`${quality}:${c.donor}`),`${c.id} native mechanical foundation`);
   const preservedFenders=[
    ['t80u-x-fender'],
    ['t72b3m-x-deck','t72b3m-x-rounded-front','t72b3m-x-rear-leaf'],
    ['t72b3-x-fender','t72b3-x-rear-guard'],
   ][c.model];
   for(const label of preservedFenders){
    const guards=tank.root.userData.mudguardFenderSeats.filter(r=>r.label===label);
    assert.equal(guards.length,2,`${c.id}: both native ${label} guards survive the rebuild`);
    assert(guards.every(r=>r.supported),`${c.id}: native ${label} guards connect to rebuilt bodywork`);
   }
   physicalMounts(tank,c);
   silhouettes.add(fingerprint(tank.root.getObjectByName('turret').geometry));
   turret.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.turretPivot[i])<.001));
   gun.position.toArray().forEach((v,i)=>assert(Math.abs(v-spec.armor.gunPivot[i])<.001));
   assert.equal(censusEquipment(tank.root).mg,1,`${c.id}: one physical machine gun, separate support mount`);
   // Probe actual pitch-owned receiver/barrel stock where an earlier version
   // had a 45 mm gap, and the Russian sensor saddle/outer guard connections.
   tank.root.updateMatrixWorld(true);
   assert(Math.abs(new Box3().setFromObject(tank.root).getSize(new Vector3()).y-spec.dims.heightM)<.005,`${c.id}: listed height includes roof weapon and tallest fitting`);
   const rws=(c.design??nationalModernizationDesign(c)).rws,stock=[];
   tank.root.traverse(o=>{if(o.isMesh&&o.name.startsWith('sourceMachineGun_')&&o.name!=='sourceMachineGun_yawSupport')stock.push(o);});
   const loadout=NATIONAL_ROOF_LOADOUTS[c.id];
   const contactRay=new Raycaster(),localPoints=[[rws[0],rws[1]+loadout.axisHeight,rws[2]+.255]];
   for(const p of localPoints){
    const origin=turret.localToWorld(new Vector3(p[0],p[1]+.20,p[2]));
    contactRay.set(origin,new Vector3(0,-1,0));contactRay.far=.40;
    assert(contactRay.intersectObjects(stock,false).length,`${c.id}: roof weapon socket and sight brackets contain real pitch-owned stock`);
   }

   let stations=0; tank.root.traverse(o=>{if(o.userData.remoteControlled)stations++});assert.equal(stations,1,`${c.id} one complete remote weapon`);
   for(const yaw of [-Math.PI,0,1.47])for(const pitch of [-.12,.25]){
    turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
    assert(tank.gunMuzzleWorld(new Vector3()).toArray().every(Number.isFinite));
   }
   assert(!auxiliaryWeaponProfile(loadout.caliber,c.id).shell.name.includes('roof'));
   const live=armorFingerprint(tank.root);
   for(const sector of ['skirt_era_L','skirt_era_R']){
    assert.equal(tank.stripEra(sector),true,`${c.id}: live skirt ERA is removable`);
    const spent=armorFingerprint(tank.root);assert.notEqual(spent,live);
    assert.equal(fingerprint(hull.geometry),bodyHash,'spent ERA preserves permanent primary hull');
    tank.stripEra(sector);assert.equal(armorFingerprint(tank.root),spent,'repeat hit is idempotent');
    assert.equal(tank.resetEra(),true);assert.equal(armorFingerprint(tank.root),live,'round reset restores armor');
   }
  }finally{tank.dispose()}
 }
 assert(hullShapes.size>=3,`${quality}: three distinct retained donor hull foundations`);
 assert.equal(silhouettes.size,14,`${quality}: each concept has a distinct structural turret`);
}
assert.equal(getSpec('t62mv1_x').gun.caliberMm,125);
assert.equal(tankTier('bmpt_terminator2'),9);
console.log('National modernization: 14 registrations, original concepts, preserved chassis mechanics, retained native hull vertices and distinct cast and welded modernization turrets, supported bearings, gun apertures, roof seats, full turret sweep, module owners, yaw/pitch and remote weapons PASS');
