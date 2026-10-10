import assert from 'node:assert/strict';
import {Box3,Vector3,Mesh,MeshBasicMaterial,DoubleSide,Raycaster} from 'three';
import {createTank} from '../tankFactory.ts';
import {topIndex} from '../roofSweep.test-support.mjs';
import {auxiliaryCapabilities} from '../auxiliaryInventory.ts';
import {auxiliaryWeaponProfile} from '../auxiliaryWeapons.ts';
import {VEHICLE_SIZE_FACTORS} from '../vehicleSizePolicy.ts';
// 2026-10-09 (owner order: "give the griffin 50 mm its old machine gun back"): the Griffin's working roof weapon is its
// restored 10-07 M2 on the elevated cradle; the field roof 30 mm is gone.
const targets=[['griffin50_x','griffin50RoofM2',12.7],['leo2a7v_x','Leopard 2A7V remote 30 mm cannon',30],['leo2_revolution','Leopard 2 Revolution remote 30 mm cannon',30],['leo2a5_x','Leopard 2A5 remote 30 mm cannon',30],['leclerc_x','Leclerc XLR remote 30 mm cannon',30],['ua_t84_oplot_m','Oplot-M protected heavy machine gun',12.7]];
for(const quality of ['high','low'])for(const [id,name,caliber] of targets){
 const registered=auxiliaryCapabilities({id})?.guns.find(g=>g.name===name);
 assert.equal(registered?.caliberMm,caliber,`${id}: combat registry enables the authored cannon`);
 assert(registered.collisionParts.length>0,`${id}: damageable gun stock registered`);
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
 try{
  const turret=tank.root.getObjectByName('rig_turret'),station=turret.getObjectByName(name),pitch=station?.getObjectByName('auxiliaryWeaponPitch');
  assert(station&&pitch,'functional yaw and elevation owners');assert.equal(station.userData.caliberMm,caliber);
  tank.root.updateMatrixWorld(true);
  const fixed=[],stock=[];pitch.traverse(o=>{if(o.isMesh)stock.push(o)});
  turret.traverse(o=>{if(!o.isMesh||o.userData.presentationInvisible||o.name.includes('Shadow'))return;for(let p=o;p;p=p.parent)if(p===station||p===tank.root.getObjectByName('rig_gun'))return;fixed.push(o)});
  const heightAt=topIndex(fixed,station.getWorldPosition(new Vector3()).y+.10),local=[];
  const inv=pitch.matrixWorld.clone().invert();
  for(const m of stock){const p=m.geometry.attributes.position;
   for(let i=0;i<p.count;i++)local.push(new Vector3().fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).applyMatrix4(inv));
   for(let i=0;i<p.count;i+=3)local.push(new Vector3().fromBufferAttribute(p,i).add(new Vector3().fromBufferAttribute(p,i+1)).add(new Vector3().fromBufferAttribute(p,i+2)).multiplyScalar(1/3).applyMatrix4(m.matrixWorld).applyMatrix4(inv));
  }
  const profile=auxiliaryWeaponProfile(caliber,id);let samples=0,negative=0;
  const supportMat=new MeshBasicMaterial({side:DoubleSide}),supports=[];
  station.traverse(o=>{if(o.isMesh&&o.name==='sourceMachineGun_yawSupport'){const m=new Mesh(o.geometry,supportMat);m.matrixAutoUpdate=false;m.matrix.copy(o.matrixWorld);m.updateMatrixWorld(true);supports.push({mesh:m,bounds:new Box3().setFromObject(m)})}});
  const axle=pitch.getWorldPosition(new Vector3()),ray=new Raycaster(new Vector3(),new Vector3(0,1,0));
  for(const elevation of [-profile.depressionRad,0,profile.elevationRad]){
   pitch.rotation.x=-elevation;tank.root.updateMatrixWorld(true);
   for(const v of local){const p=v.clone().applyMatrix4(pitch.matrixWorld);if(Math.hypot(p.y-axle.y,p.z-axle.z)<.082)continue;
    for(const {mesh,bounds}of supports){if(!bounds.containsPoint(p))continue;ray.ray.origin.copy(p);const d=ray.intersectObject(mesh).map(h=>h.distance).filter((d,i,a)=>i===0||Math.abs(d-a[i-1])>1e-5);
     assert(d.length%2===0||d[0]<.002,`${id}: moving stock intersects its own yoke at ${elevation}: ${p.toArray()}, local ${v.toArray()}, support ${bounds.min.toArray()} to ${bounds.max.toArray()}`);
    }
   }
  }
  supportMat.dispose();
  for(let degrees=0;degrees<360;degrees+=10)for(const elevation of [-profile.depressionRad,0,profile.elevationRad]){
   station.rotation.y=degrees*Math.PI/180;pitch.rotation.x=-elevation;tank.root.updateMatrixWorld(true);
   for(const v of local){const p=v.clone().applyMatrix4(pitch.matrixWorld),h=heightAt(p);if(!Number.isFinite(h.top))continue;samples++;if(p.y-.7<h.top)negative++;
    assert(p.y-h.top>=.008,`${id}/${quality}: roof gun intersects ${h.name} at yaw ${degrees} elevation ${elevation}, gap ${p.y-h.top}, point ${p.toArray()}, local ${v.toArray()}`);
   }
  }
  assert(samples>100&&negative>100,'sweep tests actual stock and would reject a lowered station');
  station.rotation.y=0;pitch.rotation.x=0;tank.root.updateMatrixWorld(true);
  const mat=new MeshBasicMaterial({side:DoubleSide}),proxy=turret.getObjectByName('turret'),m=new Mesh(proxy.geometry,mat);m.updateMatrixWorld(true);
  const foot=station.position.clone(),hit=new Raycaster(foot.clone().add(new Vector3(0,.15,0)),new Vector3(0,-1,0),0,.25).intersectObject(m)[0];
  assert(hit&&Math.abs(hit.point.y-foot.y)<.04,`${id}: roof gun has a measured roof seat`);mat.dispose();
  console.log(id,quality,'roof mounting and full 360-degree weapon movement pass',samples);
 }finally{tank.dispose()}
}
const rearIds=['type96b_x','type96_80_feng','cn_t80u_modern','cn_t72b3m_modern','cn_t72b3_modern','ariete_c2_x','leclerc_x','m1a2','ru_t72b3m_modern'];
for(const quality of ['high','low'])for(const id of rearIds){
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
 const mat=new MeshBasicMaterial({side:DoubleSide});
 try{
  const hull=tank.root.getObjectByName('rig_hull'),receipt=hull.userData.rearFieldStowage;
  assert(receipt,`${id} has its requested rack`);
  const proxy=name=>{const source=hull.getObjectByName(name);assert(source,`${id}: ${name} stock`);const m=new Mesh(source.geometry,mat);m.updateMatrixWorld(true);return m};
  const cans=proxy('hullFittingPaint'),wood=proxy('hullWood'),body=proxy('hull');
  for(const x of receipt.canXs){
   const hit=new Raycaster(new Vector3(x+.08,.923,receipt.z-.5),new Vector3(0,0,1),0,.65).intersectObject(cans)[0];
   assert(hit&&Math.abs(hit.point.z-(receipt.z-.105))<.015,`${id}: each can has an exposed closed rear wall`);
  }
  const log=new Raycaster(new Vector3(.2,receipt.logY,receipt.z-.5),new Vector3(0,0,1),0,.65).intersectObject(wood)[0];
  assert(log&&Math.abs(log.point.z-(receipt.z-.082))<.01,`${id}: native wooden log exists at its rack`);
  for(const a of receipt.anchors){
   const hit=new Raycaster(new Vector3(a[0],a[1],a[2]-.10),new Vector3(0,0,1),0,.15).intersectObject(body)[0];
   assert(hit&&Math.abs(hit.point.z-a[2])<.001,`${id}: brackets have a real hull receiver`);
  }
  console.log(id,quality,'exposed rear cans, log and measured hull contacts PASS');
 }finally{mat.dispose();tank.dispose()}
}
// Owner-requested attachment revisions: retain real contact and articulation.
for(const quality of ['high','low'])for(const id of ['leo2a4m_x','leo2a5_x','ua_t84_oplot_m','ua_challenger2','leo2a6_ua','m1a3','challenger_3x','challenger1_x','ru_t80u_modern','ru_t72b3m_modern','cn_t72b3m_modern']){
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242}),mat=new MeshBasicMaterial({side:DoubleSide});
 try{
  const turret=tank.root.getObjectByName('rig_turret'),body=new Mesh(turret.getObjectByName('turret').geometry,mat);body.updateMatrixWorld();
  if(id==='leo2a4m_x'){
   const guns=[];turret.traverse(o=>{if(o.userData.remoteControlled&&o.userData.firingAxis==='+Z')guns.push(o)});
   assert.equal(guns.length,1,'A5M keeps exactly its original weapon');assert.equal(guns[0].name,'leo2a4m_xRoofMachineGun');assert.equal(guns[0].userData.caliberMm,7.62);
   const stock=turret.getObjectByName('leo2a4m_xRoofMachineGun_yaw_turretDetail');
   assert(stock,'original mount and sights follow the functioning gun');
  }
  if(id==='leo2a5_x'||id==='ua_t84_oplot_m'){
   let weapon;turret.traverse(o=>{if(o.userData.fieldWeaponScale)weapon=o});
   assert.deepEqual(weapon.scale.toArray(),Array(3).fill(id==='leo2a5_x'?.7:.9),'requested weapon reduction');
  }
  const cage=turret.userData.modernFieldCage;
  if(['ua_challenger2','leo2a6_ua','m1a3','challenger_3x','challenger1_x'].includes(id)){
   assert.equal(cage.panels,6);assert.equal(cage.anchors.length,12);
   for(const anchor of cage.anchors){
    const [x,y,z]=anchor.map(v=>v*(VEHICLE_SIZE_FACTORS[id]??1));
    const side=Math.sign(x),hit=new Raycaster(new Vector3(x+side*.1,y,z),new Vector3(-side,0,0),0,.15).intersectObject(body)[0];
    assert(hit&&Math.abs(hit.point.x-x)<.002,`${id}: cage bracket meets actual shell`);
   }
   assert(turret.getObjectByName('turretOpenLattice'),'physical open cage stock exists');
  }
  if(['ru_t80u_modern','ru_t72b3m_modern','cn_t72b3m_modern'].includes(id)){
   const receipt=turret.userData.cheekOptics;assert.equal(receipt.anchors.length,2);
   const lens=new Mesh(turret.getObjectByName('turretGlass').geometry,mat);lens.updateMatrixWorld();
   for(const [x,y,z]of receipt.anchors){
    assert.equal(Math.abs(x),.9);assert.equal(y,.43);
    const hit=new Raycaster(new Vector3(x,y,z+.6),new Vector3(0,0,-1),0,.4).intersectObject(lens)[0];
    assert(hit&&hit.point.z>z+.35,`${id}: paired exposed optics beside the gun`);
   }
  }
  console.log(id,quality,'requested station, cage and cheek-optic revisions PASS');
 }finally{mat.dispose();tank.dispose()}
}
