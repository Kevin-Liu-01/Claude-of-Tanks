import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {TANK_SPECS} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {tankPoseFromState,traceTank} from '../../sim/armor.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {ensureInteriorFills} from '../interiorFills.ts';
import {verifyGunCradleSeats} from '../gunCradleSeats.test-support.mjs';
import {TOS1A_TAGIL_LAYOUT as D,TOS1A_TAGIL_LAUNCHER_MUZZLES as M} from '../tos1aTagilLayout.ts';
import {buildTos1aTagil} from './tos1aTagil.ts';
import {KIT} from './kit.ts';

const sha=x=>createHash('sha256').update(x).digest('hex');
const attribute=a=>sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
// Authenticated a6fa51e18 native donor before the neutral chassis extraction; re-pinned 2026-09-21 for the side-station
// end-wrap bake (the T-90MS X bands are laid about each side's own outer wheels — tankFactoryCore buildRunningGear).
// 2026-09-22 nation wheel standard: the T-90MS donor chassis draws the T-90M X pressed face through nationWheelSets.ts; repinned.
// 2026-09-22 re-base (owner: "the point of adding holes instead of carving them into the barrel is that we save on triangles"): the fleet fallback mouth is a flat ring + disc (terminal-surface-fit-r3; the separate Annulus mesh is gone and the Rim geometry changed) and the second-wave/Abrams/Leclerc/Strv tubes are closed at their source tips, so the frozen digests below moved. Superseded: 9976ffbe…, 79ca4399….
// round 40 (2026-09-22): re-pinned on the combined tree — the muzzle-recess closures (r40-bores: 15 hulls' lofts end on a cap) and the
// retired dev hulls / Panther G manifest entry (r40-cleanup) moved the frozen digests below; captured from the current build
// 2026-09-25 FSP-03: T-90MS X chassis digests re-pinned once — its three source-measured return rollers return.
const donorHashes={high:'bca2c0fd979785974499c9ddceb4020f6ab7cd9a5d397726898635bfcac331ed' /* round 35 (2026-09-22): camo UV density is the fleet constant 0.5 rep/m and the first bake reads the pattern stream (camoWorldScale.ts) — uv attributes and material bakes move; positions unchanged */,low:'2f83bb5b67081a48269b19052a3f953686b45016ffa1f2170aa2192889527a9e'};
function payload(root,hullOnly=false){
  root.updateMatrixWorld(true);const rows=[];
  root.traverse(m=>{
    if(!m.isMesh||m.userData.shadowOnly||m.userData.authoredShadowProxy||m.userData.vehicleMarking||m.name.includes('InteriorFill'))return;
    let owner='';for(let p=m;p;p=p.parent){if(p.name==='rig_turret'){owner='turret';break;}if(p.name==='rig_hull'){owner='hull';break;}}
    if(hullOnly&&owner!=='hull')return;
    const g=m.geometry,materials=Array.isArray(m.material)?m.material:[m.material];
    rows.push({name:m.name,owner,attrs:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{size:a.itemSize,normalized:a.normalized,hash:attribute(a)}])),index:g.index?attribute(g.index):null,groups:g.groups,matrix:m.matrixWorld.toArray(),count:m.count,instances:m.instanceMatrix?attribute(m.instanceMatrix):null,colors:m.instanceColor?attribute(m.instanceColor):null,materials:materials.map(a=>({name:a.name,color:a.color?.getHex(),roughness:a.roughness,metalness:a.metalness,side:a.side,userData:a.userData})),triangles:(g.index?.count??g.attributes.position.count)/3*(m.isInstancedMesh?m.count:1)});
  });return rows;
}
function geometryOnly(rows){return rows.map(({materials,colors,...r})=>({...r,attrs:Object.fromEntries(Object.entries(r.attrs).filter(([name])=>!['color','uv'].includes(name)))}));}
function meshes(root){const result=[];root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly&&!m.userData.authoredShadowProxy){const materials=Array.isArray(m.material)?m.material:[m.material];if(materials.some(a=>a.visible&&a.colorWrite))result.push(m);}});return result;}
function cast(tank,frame,start,direction,far=5){
  tank.root.updateMatrixWorld(true);const ray=new T.Raycaster(frame.localToWorld(new T.Vector3(...start)),new T.Vector3(...direction).transformDirection(frame.matrixWorld),0,far),bounds=new T.Box3();
  return ray.intersectObjects(meshes(tank.root).filter(m=>{if(m.isInstancedMesh){if(!m.boundingBox)m.computeBoundingBox();bounds.copy(m.boundingBox);}else{if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();bounds.copy(m.geometry.boundingBox);}bounds.applyMatrix4(m.matrixWorld);return ray.ray.intersectsBox(bounds);}),false)[0];
}
function coordinate(tank,frame,start,direction,axis,expected,far=5){
  const hit=cast(tank,frame,start,direction,far);assert(hit,`missing physical stock at ${start}`);
  const value=frame.worldToLocal(hit.point.clone())[axis];assert(Math.abs(value-expected)<.001,`${start}: ${axis}=${value}, expected ${expected}`);return hit;
}
function cells(tank){
  const gun=tank.root.getObjectByName('rig_gun');
  for(const {x,y,z} of M){
    const terminal=coordinate(tank,gun,[x,y,z+.2],[0,0,-1],'z',D.terminalZ);
    assert.equal(terminal.object.name,'gunMountDark','deep dark breech is physical pitching stock');
    for(const [dx,dy] of [[.135,0],[-.135,0],[0,.135],[0,-.135]]){
      const ring=coordinate(tank,gun,[x+dx,y+dy,z+.2],[0,0,-1],'z',z,.3);
      assert(ring.face.normal.z>.99,'front rim faces out under normal single-sided material');
    }
    const inner=coordinate(tank,gun,[x,y,2.20],[1,0,0],'x',x+D.boreRadius,.2);
    assert.equal(inner.object.name,'gunMountDark','physical inner sleeve uses dark unpainted metal');
    const direction=new T.Vector3(-.56,.34,1).normalize();
    const oblique=cast(tank,gun,new T.Vector3(x,y,z).addScaledVector(direction,.3).toArray(),direction.negate().toArray(),.6);
    assert(oblique&&oblique.object.name==='gunMountDark','portrait-direction first hit is the deep curved metal sleeve');
    assert(!oblique.object.material.map,'no camouflage texture inside the actual launch tube');
    assert(gun.worldToLocal(oblique.point.clone()).z<2.45,'oblique mouth still exposes depth, not a dark cap');
  }
  assert(!cast(tank,gun,[-1.1,-.9,.6],[1,0,0],2.2),'real transverse air beneath pack');
}
function accessSeats(){
  const skin=authored.find(p=>p.name==='pack-skin');
  const span=(part,side,y,z)=>{
    const ray=new T.Ray(new T.Vector3(side*1.9,y,z),new T.Vector3(-side,0,0));
    const xs=triangles(part.geometry,new T.Matrix4()).flatMap(({triangle:t})=>{
      const point=ray.intersectTriangle(t.a,t.b,t.c,false,new T.Vector3());
      return point&&point.x*side>1.4?[point.x*side]:[];
    });
    assert(xs.length>=2,'finite front and back access-seat skins');return[Math.min(...xs),Math.max(...xs)];
  };
  for(const side of [-1,1]){
    const pieces=['side-access-rim','side-access-cover'].flatMap(name=>authored.filter(p=>{
      if(p.name!==name)return false;p.geometry.computeBoundingBox();return p.geometry.boundingBox.getCenter(new T.Vector3()).x*side>0;
    }));
    for(const dy of [-.05,0,.05])for(const dz of [-.05,0,.05]){
      const chain=[skin,...pieces].map(p=>span(p,side,.09+dy,-.52+dz));
      for(let i=1;i<chain.length;i++)assert(Math.min(chain[i-1][1],chain[i][1])-Math.max(chain[i-1][0],chain[i][0])>.001,'finite access cover-to-wall stock overlap');
    }
  }
}
function fixedStock(tank){
  const turret=tank.root.getObjectByName('rig_turret'),hull=tank.root.getObjectByName('rig_hull');
  tank.root.updateMatrixWorld(true);
  for(const x of [-.2,0,.2])for(const z of [-.2,0,.2]){
    const nativeHull=hull.getObjectByName('hull'),base=turret.getObjectByName('turret');
    const upper=new T.Raycaster(new T.Vector3(x,1.8,z+.118),new T.Vector3(0,-1,0),0,.4).intersectObject(nativeHull,false)[0];
    const lower=new T.Raycaster(turret.localToWorld(new T.Vector3(x,-.08,z)),new T.Vector3(0,1,0),0,.2).intersectObject(base,false)[0];
    assert(upper&&lower,'both actual bearing interface surfaces exist');
    assert(Math.abs(upper.point.y-1.5455)<.001&&Math.abs(lower.point.y-1.5305)<.001,'measured donor bearing and new lower seat');
    assert(upper.point.y-lower.point.y>.014,'finite15mm bearing overlap across9 receiving rays');
  }
  for(const [x,y,z] of [[.35,.41,.674],[-.71,.352,.794],[.71,.352,.794]]){
    const hit=coordinate(tank,turret,[x,y,z+.12],[0,0,-1],'z',z,.14);
    assert.equal(hit.object.name,'turretGlass','exposed finite optical lens');
  }
  const parts=tank.root.userData.combatGeometryParts;
  assert.equal(parts.filter(p=>p.module==='gun'&&p.parent==='turretG').length,1,'actual fixed traverse drive owns the gun damage mechanism');
  assert.equal(parts.filter(p=>p.module==='optics'&&p.parent==='turretG').length,3);
  assert.equal(parts.filter(p=>p.module==='missileRack'&&p.parent==='gunG').length,24);
  const gun=tank.root.getObjectByName('rig_gun'),mount=gun.getObjectByName('gunMount');
  assert(mount&&mount.parent===gun,'structural pack directly follows pitch, never cannon recoil');
  const receiver=coordinate(tank,turret,[-1.64,.855,.70],[0,0,-1],'z',.55,.2);
  assert(receiver.object.name.includes('sourceMachineGun'),'small roof weapon has an actual receiver');
  coordinate(tank,turret,[-1.64,.826,1.3],[0,0,-1],'z',1.05,.4);
}
function armorFaces(tank,state){
  const frame=tank.root.getObjectByName('rig_gun'),plates=TANK_SPECS.tos1a_tagil.armor.turretPlates.filter(p=>p.gunFollow);
  assert.equal(plates.length,9,'eight finite skin facets and one rear sheet, no fictitious front cover');
  for(const plate of plates){
    assert(plate.gunFollow,'all actual launcher armor follows the pitch frame');
    const points=plate.verts.map(p=>new T.Vector3(...p).sub(new T.Vector3(...D.gunPivot)));
    const center=points.reduce((sum,p)=>sum.add(p),new T.Vector3()).multiplyScalar(1/points.length);
    const normal=points[1].clone().sub(points[0]).cross(points[3].clone().sub(points[0])).normalize();
    const hit=cast(tank,frame,center.clone().addScaledVector(normal,.12).toArray(),normal.clone().negate().toArray(),.14);
    assert(hit&&frame.worldToLocal(hit.point.clone()).distanceTo(center)<.001,`${plate.name}: damage plane coincides with actual structural skin`);
    assert.equal(hit.object.name,'gunMount','armor receives its actual structural owner');
    const from=frame.localToWorld(center.clone().addScaledVector(normal,.10)),to=frame.localToWorld(center.clone().addScaledVector(normal,-.10));
    const pose=tankPoseFromState(state),armor=TANK_SPECS.tos1a_tagil.armor;
    const damage=traceTank(from,to,pose,armor).filter(h=>h.kind==='plate'&&h.plate.name===plate.name);
    assert.equal(damage.length,1,`${plate.name}: actual posed damage plane receives its own skin ray`);
  }
}
function volume(g){const a=g.attributes.position,index=g.index;let value=0;const p=new T.Vector3(),q=new T.Vector3(),r=new T.Vector3();for(let i=0;i<(index?.count??a.count);i+=3){p.fromBufferAttribute(a,index?index.getX(i):i);q.fromBufferAttribute(a,index?index.getX(i+1):i+1);r.fromBufferAttribute(a,index?index.getX(i+2):i+2);value+=p.dot(q.cross(r))/6;}return value;}
let fault=null,altered=0;const authored=[];
registerProfiledBuilders({tos1a_tagil:P=>buildTos1aTagil(new Proxy(P,{get(target,key){
  if(['add','addEquipment','addModuleVisual'].includes(key))return(...args)=>{
    const geometry=args.find(a=>a?.isBufferGeometry),name=geometry?.userData.tos1aTagil;
    if(name){
      if((fault==='missing-cell'&&name==='launch-cell'&&altered===0)||(fault==='missing-tower'&&name==='cradle-tower')||(fault==='missing-pin'&&name==='pitch-pin')){altered++;geometry.dispose();return;}
      if(fault==='shifted-tower'&&name==='cradle-tower'){geometry.translate(0,.20,0);altered++;}
      if(fault==='thin-tower'&&name==='cradle-tower'){geometry.scale(.10,1,.10);altered++;}
      if(fault==='floating-access'&&name===(target.q?'side-access-rim':'side-access-cover')){geometry.translate(Math.sign(args.filter(a=>typeof a==='number')[0])*.04,0,0);altered++;}
      if(fault==='painted-liner'&&name==='launch-cell-liner'){args[0]='gunMount';altered++;}
      const bucket=args[key==='addModuleVisual'?1:0],numbers=args.filter(a=>typeof a==='number');
      authored.push({name,bucket,geometry:KIT.xform(geometry.clone(),...numbers)});
    }
    return target[key](...args);
  };
  const value=target[key];return typeof value==='function'?value.bind(target):value;
}}))});
function cleanParts(){for(const p of authored)p.geometry.dispose();authored.length=0;}
function trianglePayload(g){
  const p=g.attributes.position,n=g.attributes.normal,index=g.index,rows=[];
  for(let i=0;i<index.count;i+=3){const row=[];for(let j=0;j<3;j++){const k=index.getX(i+j);row.push(p.getX(k),p.getY(k),p.getZ(k),n.getX(k),n.getY(k),n.getZ(k));}rows.push(JSON.stringify(row));}
  return rows.sort();
}
function closedLaunchStock(quality){
  const outer=authored.filter(p=>p.name==='launch-cell'),inner=authored.filter(p=>p.name==='launch-cell-liner');
  assert.equal(outer.length,24);assert.equal(inner.length,24);
  const original=new T.LatheGeometry([[.17,-.985],[.17,2.60],[.11,2.60],[.11,-.94],[.17,-.985]].map(p=>new T.Vector2(...p)),quality==='high'?20:12).rotateX(Math.PI/2);
  try{for(let i=0;i<24;i++){
    const expected=KIT.xform(original.clone(),M[i].x,M[i].y,0);
    try{
      assert.deepEqual([...trianglePayload(outer[i].geometry),...trianglePayload(inner[i].geometry)].sort(),trianglePayload(expected),'material partition retains every original closed-tube triangle and normal exactly once');
      assert(volume(outer[i].geometry)+volume(inner[i].geometry)>1e-10,'combined sleeve and outer wall remain finite outward-wound annular stock');
    }finally{expected.dispose();}
  }}finally{original.dispose();}
}
function lodPresentation(tank){
  const turret=tank.root.getObjectByName('rig_turret'),camera=new T.OrthographicCamera(-5,5,5,-5,.1,1000);
  const state=createTankState(TANK_SPECS.tos1a_tagil,new T.Vector3(),0);
  const visibility=[];tank.root.traverse(object=>visibility.push([object,object.visible]));
  try{
  for(const distance of [60,100,200]){
    tank.syncFromState(state,0,distance);tank.root.updateMatrixWorld(true);
    camera.position.set(0,3,distance);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
    tank.root.traverse(object=>{if(object.isLOD)object.update(camera);});
    const visible=new Set(meshes(tank.root));
    for(const name of ['hullDetail','hullExternalArmor','hullDark','turretEquipment','turretDetail','turretDark','turretGlass','gunMountDark']){
      const mesh=tank.root.getObjectByName(name);
      assert(visible.has(mesh),`${distance}m: actual structural/sight/sleeve mesh ${name} remains visible`);
      assert(!mesh.parent.isLOD,`${name}: permanent stock is not attached to an empty distance level`);
    }
    for(const x of [-1.63,1.63])coordinate(tank,turret,[x,.745,-1.0],[0,0,-1],'z',-1.19,.3);
    cells(tank);
  }
  camera.position.set(0,3,0);camera.updateMatrixWorld(true);
  tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
  tank.root.traverse(object=>{if(object.isLOD)object.update(camera);});
  }finally{for(const[object,visible]of visibility)object.visible=visible;}
}
function triangles(geometry,matrix){
  const position=geometry.attributes.position,index=geometry.index,result=[];
  for(let i=0;i<(index?.count??position.count);i+=3){
    const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(matrix));
    const triangle=new T.Triangle(...points);result.push({triangle,box:new T.Box3().setFromPoints(points)});
  }return result;
}
function crosses(a,b){
  for(const [source,target] of [[a,b],[b,a]]){
    const plane=target.getPlane(new T.Plane());
    for(const [p,q] of [[source.a,source.b],[source.b,source.c],[source.c,source.a]]){
      const dp=plane.distanceToPoint(p),dq=plane.distanceToPoint(q);
      if(Math.min(dp,dq)>=-1e-5||Math.max(dp,dq)<=1e-5)continue;
      const delta=q.clone().sub(p),length=delta.length();
      const hit=new T.Ray(p,delta.divideScalar(length)).intersectTriangle(target.a,target.b,target.c,false,new T.Vector3());
      if(hit&&hit.distanceTo(p)>1e-6&&hit.distanceTo(p)<length-1e-6)return true;
    }
  }return false;
}
function inside(point,triangles){
  const ray=new T.Ray(point,new T.Vector3(.819,.347,.456).normalize()),distances=[];
  for(const {triangle:t} of triangles){const hit=ray.intersectTriangle(t.a,t.b,t.c,false,new T.Vector3());if(hit)distances.push(hit.distanceTo(point));}
  distances.sort((a,b)=>a-b);if(distances[0]<1e-5)return false;
  return distances.filter((d,i)=>i===0||d-distances[i-1]>1e-5).length%2===1;
}
function stationaryClearance(tank){
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
  const relative=turret.matrixWorld.clone().invert().multiply(gun.matrixWorld),identity=new T.Matrix4();
  const prepared=authored.map(p=>{const rows=triangles(p.geometry,p.bucket.startsWith('gun')?relative:identity);return{...p,rows,box:rows.reduce((b,r)=>b.union(r.box),new T.Box3())};});
  const moving=prepared.filter(p=>p.bucket.startsWith('gun')&&p.name!=='pitch-pin');
  // Coaxial bearing stock is intentionally in contact and separately tested
  // by18 finite receiving columns. Every other fixed platform/sight/support
  // surface must remain outside the moving pack, not just outside its bounds.
  const fixed=prepared.filter(p=>p.bucket.startsWith('turret')&&!['fixed-trunnion','bearing-cover','bearing-boss','bearing-bolt'].includes(p.name));
  for(const part of moving)for(const receiver of fixed){
    if(!part.box.intersectsBox(receiver.box))continue;
    for(const a of part.rows)for(const b of receiver.rows)if(a.box.intersectsBox(b.box))assert(!crosses(a.triangle,b.triangle),`${part.name} crosses actual ${receiver.name} at pitch${gun.rotation.x}`);
    assert(!inside(part.rows[0].triangle.a,receiver.rows)&&!inside(receiver.rows[0].triangle.a,part.rows),`${part.name}/${receiver.name}: no whole-part containment`);
  }
}
function pose(tank){
  const spec=TANK_SPECS.tos1a_tagil,state=createTankState(spec,new T.Vector3(),0),gun=tank.root.getObjectByName('rig_gun'),turret=tank.root.getObjectByName('rig_turret'),recoil=tank.root.getObjectByName('rig_recoil');
  let poses=0,minClearance=Infinity;
  for(const degrees of [-5,0,15,30,45])for(const yaw of [-180,-90,0,90]){
    state.turretYaw=yaw*Math.PI/180;state.gunPitch=degrees*Math.PI/180;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
    assert(Math.abs(gun.rotation.x+state.gunPitch)<1e-8&&Math.abs(turret.rotation.y-state.turretYaw)<1e-8);
    assert.equal(verifyGunCradleSeats(tank.root)?.rays,18,'finite closed bearing columns connect to actual pitch pins');
    const bounds=new T.Box3().setFromObject(gun.getObjectByName('gunMount'));
    minClearance=Math.min(minClearance,bounds.min.y-1.643629);
    assert(bounds.min.y>1.643629,'actual pitching stock clears all retained hull fittings, at every yaw');
    for(let index=0;index<M.length;index++){
      const {x,y,z}=M[index],expected=gun.localToWorld(new T.Vector3(x,y,z));
      assert(tank.gunMuzzleWorld(new T.Vector3(),index,false).distanceTo(expected)<1e-6,'unguided salvo uses each actual mouth axis');
      tank.recoilKick(0,.4,index,false);tank.syncFromState(state,.035);assert(Math.abs(recoil.position.z)<1e-9,'fixed launch battery does not recoil');
    }
    if(yaw===0){cells(tank);armorFaces(tank,state);stationaryClearance(tank);}poses++;
  }
  state.turretYaw=0;state.gunPitch=0;tank.syncFromState(state,1);return{poses,minHullClearanceM:minClearance};
}
function mutations(tank){
  const gun=tank.root.getObjectByName('rig_gun'),terminal=gun.getObjectByName('gunMountDark'),saved=terminal.position.z;
  terminal.position.z+=.06;try{assert.throws(()=>cells(tank),assert.AssertionError,'shifted rear stock fails true depth rays');}finally{terminal.position.z=saved;}
  const cap=new T.Mesh(new T.CircleGeometry(.11,20),new T.MeshBasicMaterial());cap.position.set(M[0].x,M[0].y,2.56);gun.add(cap);
  try{assert.throws(()=>cells(tank),assert.AssertionError,'painted or generated mouth cover cannot masquerade as an open tube');}finally{gun.remove(cap);cap.geometry.dispose();cap.material.dispose();}
}
const options=quality=>({quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false,camoSeed:4242});
const results=[];
if(process.argv.includes('--filled'))await ensureInteriorFills(['tos1a_tagil']);
for(const quality of ['high','low']){
  const donor=createTank('t90ms_x',null,options(quality));const donorPayload=payload(donor.root),hull=payload(donor.root,true);
  assert.equal(sha(JSON.stringify(donorPayload)),donorHashes[quality],'original complete T-90MS geometry/material/instance/transform payload remains byte-identical');donor.dispose();
  cleanParts();const tank=createTank('tos1a_tagil',null,options(quality));
  try{
    assert.deepEqual(geometryOnly(payload(tank.root,true)),geometryOnly(hull),'actual complete chassis/ERA/gear physical attributes retained; paint UV projection is independent');
    assert.equal(authored.filter(p=>p.name==='launch-cell').length,24);
    closedLaunchStock(quality);
    for(const part of authored.filter(p=>!['launch-cell','launch-cell-liner'].includes(p.name)))assert(volume(part.geometry)>1e-10,`${part.name}: real finite outward-wound stock`);
    cells(tank);fixedStock(tank);accessSeats();mutations(tank);const articulation=pose(tank);
    lodPresentation(tank);
    const support=tank.root.getObjectByName('turretEquipment');support.visible=false;
    try{assert.throws(()=>lodPresentation(tank),assert.AssertionError,'hidden structural support fails actual visible scene proof');}finally{support.visible=true;}
    lodPresentation(tank);
    let triangles=0,turretTriangles=0,batches=0;for(const m of meshes(tank.root)){const count=Math.min(m.geometry.index?.count??m.geometry.attributes.position.count,m.geometry.drawRange.count)/3*(m.isInstancedMesh?m.count:1);triangles+=count;batches++;for(let p=m;p;p=p.parent)if(p.name==='rig_turret')turretTriangles+=count;}
    // 2026-09-22 nation wheel standard: the T-90MS chassis draws the T-90M X pressed road-wheel face (twelve stations,
    // +19.8k triangles at HIGH, +10.2k at LOW), so the retained-chassis budget carries that owner-ruled wheel.
    assert(triangles<=(quality==='high'?69900+30000:64652+16000),`retained chassis plus launcher owner budget ${quality}=${triangles}, launcher=${turretTriangles}`);
    const b=new T.Box3().setFromObject(tank.root);assert(Math.abs(b.max.y-D.stowedHeight)<.001);assert(b.max.x-b.min.x<=3.781&&b.max.z-b.min.z<=7.479);
    results.push({quality,triangles,turretTriangles,batches,paintUVChanges:payload(tank.root,true).filter((row,i)=>row.attrs.uv?.hash!==hull[i].attrs.uv?.hash).map(row=>row.name),bounds:{min:b.min.toArray(),max:b.max.toArray()},...articulation});
    const decorated=createTank('tos1a_tagil',null,{...options(quality),proceduralOnly:false,decor:true});
    try{assert.deepEqual(payload(decorated.root),payload(tank.root),'actual published decor:true build has the same geometry/materials as the authored native model');}finally{decorated.dispose();}
    const battle=createTank('tos1a_tagil',null,{...options(quality),batchStatic:true,battleDetailLod:true});
    try{lodPresentation(battle);}finally{battle.dispose();}
  }finally{tank.dispose();}
}
assert(results[1].turretTriangles<=results[0].turretTriangles*.70,'meaningful LOW reduction in the new battery');
for(const quality of ['high','low'])for(const corruption of ['missing-cell','missing-tower','shifted-tower','thin-tower','missing-pin','floating-access','painted-liner']){
  cleanParts();fault=corruption;altered=0;const tank=createTank('tos1a_tagil',null,options(quality));
  try{assert(altered>0,'negative changes real emitted geometry or its actual material');assert.throws(()=>['missing-cell','painted-liner'].includes(corruption)?cells(tank):corruption==='floating-access'?accessSeats():verifyGunCradleSeats(tank.root),assert.AssertionError,`${quality} ${corruption} fails physical proof`);}finally{tank.dispose();fault=null;}
}
cleanParts();console.log('tos1aTagil PASS: complete donor preservation;24 real220mm openings/terminals; exact dark sleeve partition; seated yaw/cradle/MG/optics;40 legal poses;14 broken-stock/material negatives',JSON.stringify(results));
