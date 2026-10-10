import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {installCanvasFixture} from '../canvasFixture.test-support.mjs';
import {sampleArmorRay} from './armorFaceSampling.ts';
import {KIT} from './kit.ts';
import {T72BU_X_SOURCE_DATUMS as DATUMS} from '../t72buXArmor.ts';
import {createTankState} from '../../sim/movement.ts';

// The old standalone oracle target and its assertions are preserved verbatim
// in docs/references/tanks/pt91m.legacy-fidelity-selftest.txt. Owner 2026-10-06
// explicitly replaced that target with the actual T-72BU and a refitted PT91 kit.
const restore=installCanvasFixture();
// The independent Twardy still clones Pendekar's combat balance, but must
// retain its own pre-rebuild spatial armor and narrow track envelope.
const twardy=getSpec('pt91_twardy');
assert.equal(twardy.visual.trackWidthM,.50);
assert.deepEqual(twardy.armor.hullPlates.find(p=>p.era)?.verts,
 [[-1.2841,1.1692,2.669],[-1.0519,1.1692,2.669],[-1.0519,1.2365,2.4558],[-1.2841,1.2365,2.4558]]);
assert.deepEqual(twardy.armor.turretPlates.find(p=>p.era)?.verts,
 [[.6004,.3902,1.1899],[.4102,.4195,1.3346],[.4102,.2341,1.3722],[.6004,.2048,1.2275]]);
const near=(a,b,tol=1e-6,label='datum')=>assert.ok(Math.abs(a-b)<=tol,`${label}: ${a} vs ${b}`);
function geometryBytes(root,names){const h=crypto.createHash('sha256');for(const name of names){const o=root.getObjectByName(name);assert.ok(o?.geometry,name);for(const key of['position','normal']){const a=o.geometry.attributes[key]?.array;if(a)h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}const a=o.geometry.index?.array;if(a)h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));if(o.isInstancedMesh){const a=o.instanceMatrix.array;h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}}return h.digest('hex');}
function triangles(mesh){const p=mesh.geometry.attributes.position,idx=mesh.geometry.index,result=[];for(let i=0;i<(idx?.count??p.count);i+=3){const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));const t=new T.Triangle(...v);if(t.getArea()<1e-10)continue;result.push({t,b:new T.Box3().setFromPoints(v)});}return result;}
const hit=new T.Vector3(),ray=new T.Ray(),direction=new T.Vector3();
function edgeCross(a,b,t){const len=direction.subVectors(b,a).length();if(len<1e-7)return false;ray.set(a,direction.clone().divideScalar(len));if(!ray.intersectTriangle(t.a,t.b,t.c,false,hit))return false;const d=hit.distanceTo(a);return d>.0001&&d<len-.0001;}
function stockCrosses(a,b,proper=false){for(const x of a)for(const y of b){if(!x.b.intersectsBox(y.b))continue;if(proper&&![[x.t,y.t],[y.t,x.t]].every(([c,d])=>{const p=d.getPlane(new T.Plane()),v=[c.a,c.b,c.c].map(v=>p.distanceToPoint(v));return Math.min(...v)<-.00002&&Math.max(...v)>.00002;}))continue;for(const [c,d]of[[x.t,y.t],[y.t,x.t]])if(edgeCross(c.a,c.b,d)||edgeCross(c.b,c.c,d)||edgeCross(c.c,c.a,d))return true;}return false;}
// Weld native positions to recover authored closed solids from the merged
// material buckets. Contact assertions use their triangles, not receipt bounds.
function components(mesh){
 const p=mesh.geometry.attributes.position,idx=mesh.geometry.index,n=idx?.count??p.count,parent=[],vertices=[],keys=new Map(),corners=[];
 const find=i=>parent[i]===i?i:parent[i]=find(parent[i]);
 for(let i=0;i<n;i++){const v=new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i):i),key=v.toArray().map(x=>Math.round(x*1e6)).join(',');if(!keys.has(key)){keys.set(key,vertices.length);parent.push(vertices.length);vertices.push(v);}corners.push(keys.get(key));}
 for(let i=0;i<n;i+=3)for(let k=1;k<3;k++)parent[find(corners[i+k])]=find(corners[i]);
 const sets=new Map();for(let i=0;i<n;i+=3){const key=find(corners[i]);if(!sets.has(key))sets.set(key,[]);sets.get(key).push(...corners.slice(i,i+3).map(j=>vertices[j]));}
 return [...sets.values()].map(points=>({points,bounds:new T.Box3().setFromPoints(points)}));
}
function selectComponent(parts,size,label,extra=()=>true){const hits=parts.filter(p=>p.bounds.getSize(new T.Vector3()).distanceTo(new T.Vector3(...size))<.00001&&extra(p));assert.equal(hits.length,1,label);return hits[0];}
function componentTriangles(part,offset=new T.Vector3()){const rows=[];for(let i=0;i<part.points.length;i+=3){const v=part.points.slice(i,i+3).map(p=>p.clone().add(offset));rows.push({t:new T.Triangle(...v),b:new T.Box3().setFromPoints(v)});}return rows;}
let checks=0;
for(const quality of['high','low']){
 const options={proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242,batchStatic:false};
 const donor=createTank('t72bu_x',null,options),tank=createTank('pt91m',null,options);
 try{
  donor.root.updateMatrixWorld(true);tank.root.updateMatrixWorld(true);
  const core=['hull','turret','gun','gunMount'];
  assert.equal(geometryBytes(tank.root,core),geometryBytes(donor.root,core),'exact donor core buffers; no second hull or turret');
  const gear=[];donor.root.traverse(o=>{if(o.geometry&&/^gear/.test(o.name)&&!gear.includes(o.name))gear.push(o.name);});
  assert.ok(gear.length>8);assert.equal(geometryBytes(tank.root,gear),geometryBytes(donor.root,gear),'complete native donor wheels/rollers/links retain buffers and instances');
  for(const name of['rig_hull','rig_turret','rig_gun','rig_recoil'])assert.deepEqual(tank.root.getObjectByName(name).matrixWorld.elements,donor.root.getObjectByName(name).matrixWorld.elements,name+' stays in donor frame');
  const spec=getSpec('pt91m');assert.equal(spec.variantOf,'t72bu_x');assert.equal(spec.gun.caliberMm,125);
  assert.deepEqual(spec.armor.turretPivot,[...DATUMS.turretPivot]);
  near(spec.armor.gunBarrel.lengthM,DATUMS.muzzleZ-DATUMS.trunnion[2]);
  const turret=tank.root.getObjectByName('rig_turret'),seats=turret.userData.pt91mEraSeats;
  assert.equal(seats.filter(s=>s.owner==='turret').length,30,'three courses of flat cheek cassettes');
  assert.equal(seats.filter(s=>s.owner==='hull').length,32,'complete refitted field on the glacis, clear of raised fender crowns');
  for(const seat of seats){
   const shell=tank.root.getObjectByName(seat.owner).geometry,n=new T.Vector3(...seat.normal);
   for(let i=0;i<4;i++){
    const root=new T.Vector3(...seat.surface[i]),tip=new T.Vector3(...seat.corners[i]);
    const hit=sampleArmorRay(shell,tip.clone().addScaledVector(n,.03),n.clone().negate());
    assert.ok(hit,'each cassette foot receives actual donor steel');near(hit.point.distanceTo(root),0,.00002,'native support intersection');
    assert.ok(tip.clone().sub(root).dot(n)>=.0179&&tip.distanceTo(root)<.16,'short finite mount, no floating tile');checks++;
   }
  }
  const coreBefore=geometryBytes(tank.root,core),armorBefore=geometryBytes(tank.root,['hullExternalArmor','turretExternalArmor']);
  const rows=tank.root.userData.eraVisualBindingReceipt.plates;assert.equal(rows.length,6);
  for(const row of rows){assert.ok(row.registered&&row.ownerMatches&&row.fittedSurfaces.length,'actual ERA triangles bind to live armor');assert.equal(tank.stripEra(row.name),true);assert.equal(geometryBytes(tank.root,core),coreBefore,'spent kit never deletes donor casting or chassis');}
  assert.notEqual(geometryBytes(tank.root,['hullExternalArmor','turretExternalArmor']),armorBefore);assert.equal(tank.resetEra(),true);assert.equal(geometryBytes(tank.root,['hullExternalArmor','turretExternalArmor']),armorBefore,'ERA resets exact stock');
  const state=createTankState(spec,new T.Vector3(),0),donorState=createTankState(getSpec('t72bu_x'),new T.Vector3(),0);
  for(const yaw of Array.from({length:24},(_,i)=>i*Math.PI/12))for(const deg of[-spec.gunDepressionDeg,0,spec.gunElevationDeg]){
   for(const s of[state,donorState]){s.turretYaw=yaw;s.gunPitch=deg*Math.PI/180;}
   tank.syncFromState(state,0);donor.syncFromState(donorState,0);
   for(const recoil of[0,-.13*spec.gun.caliberMm/120]){
    tank.root.getObjectByName('rig_recoil').position.z=recoil;donor.root.getObjectByName('rig_recoil').position.z=recoil;
    tank.root.updateMatrixWorld(true);donor.root.updateMatrixWorld(true);
    near(tank.gunMuzzleWorld(new T.Vector3()).distanceTo(donor.gunMuzzleWorld(new T.Vector3())),0,1e-6,'exact native donor gun articulation');
    const moving=[];tank.root.getObjectByName('rig_gun').traverse(o=>{if(o.isMesh&&!o.userData.shadowOnly&&!o.userData.authoredShadowProxy&&!o.name.startsWith('procShadow'))moving.push(...triangles(o));});
    const fixed=['turretExternalArmor','hullExternalArmor','turretDetail','turretDark'].flatMap(name=>triangles(tank.root.getObjectByName(name)));
    assert.equal(stockCrosses(moving,fixed,true),false,`${quality}: all new armor/furniture clear actual gun assembly at yaw${yaw} pitch${deg} recoil${recoil}`);checks++;
   }
  }
  // Reinsert the independently captured old right outer cassette. Its four
  // feet were valid, but the fender-raised cell obstructed the depressed gun.
  state.turretYaw=Math.PI/6;state.gunPitch=-spec.gunDepressionDeg*Math.PI/180;tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
  const oldNormal=new T.Vector3(.007359330039038885,.9984286425360169,.05555255192214795),oldU=new T.Vector3(0,1,0).cross(oldNormal).normalize(),oldV=new T.Vector3().crossVectors(oldNormal,oldU).normalize();
  const oldCell=new T.Mesh(KIT.box(.235,.27,.055).applyMatrix4(new T.Matrix4().makeBasis(oldU,oldV,oldNormal)).translate(.9502906935365419,1.4239309038939096,1.962194325800925));
  oldCell.matrixAutoUpdate=false;oldCell.matrixWorld.copy(tank.root.getObjectByName('hullExternalArmor').matrixWorld);
  assert.ok(stockCrosses(triangles(tank.root.getObjectByName('gun')),triangles(oldCell),true),'historical fender-raised ERA cell blocks legal 30° depressed gun and must fail');oldCell.geometry.dispose();oldCell.material.dispose();checks++;
  const gun=tank.root.getObjectByName('gun'),moving=triangles(gun),one=moving[20].t,mid=one.getMidpoint(new T.Vector3());
  const blocked=new T.Mesh(new T.BoxGeometry(.03,.03,.03));blocked.position.copy(mid);blocked.updateMatrixWorld(true);
  assert.ok(stockCrosses(moving,triangles(blocked)),'inserted armor through actual barrel is rejected');blocked.geometry.dispose();blocked.material.dispose();
  assert.ok(tank.root.getObjectByName('turretCupola'));assert.ok(tank.root.getObjectByName('pt91mCommandMG'));
  const dome=tank.root.getObjectByName('turret').geometry;
  for(const seat of turret.userData.pt91mCupolaSeats)for(let i=0;i<56;i++){
   const a=i*Math.PI/28,x=seat.center[0]+seat.radius*Math.cos(a),z=seat.center[1]+seat.radius*Math.sin(a);
   const support=sampleArmorRay(dome,new T.Vector3(x,4,z),new T.Vector3(0,-1,0));
   assert.ok(support,'entire cupola collar receives native casting');
   assert.ok(seat.bottom<support.point.y-.009&&seat.top>support.point.y+.05,'collar reaches dome around its complete circumference');checks++;
  }
  assert.equal(turret.userData.pt91mRoofEquipmentReceipt.periscopeBlocks,12);
  const detailParts=components(tank.root.getObjectByName('turretDetail')),darkParts=components(tank.root.getObjectByName('turretDark'));
  const head=selectComponent(detailParts,[.10,.08,.10],'weather head',p=>Math.abs(p.bounds.getCenter(new T.Vector3()).x+.24+DATUMS.turretPivot[0])<.00001);
  const crossbar=selectComponent(darkParts,[.27,.018,.018],'weather crossbar');
  assert.ok(stockCrosses(componentTriangles(head),componentTriangles(crossbar)),'weather crossbar enters its real sensor head');
  assert.equal(stockCrosses(componentTriangles(head),componentTriangles(crossbar,new T.Vector3(0,.045,0))),false,'historical 31 mm detached crossbar fails native contact');
  const mg=tank.root.getObjectByName('pt91mCommandMG'),mgDark=components(mg.getObjectByName('sourceMachineGun_turretDark')),mgDetail=components(mg.getObjectByName('sourceMachineGun_turretDetail'));
  const receiver=selectComponent(mgDark,[.13,.115,.42],'actual MG receiver'),feed=selectComponent(mgDark,[.065,.055,.12],'finite MG feed bracket'),ammo=selectComponent(mgDetail,[.22,.20,.25],'actual MG ammunition box');
  assert.ok(stockCrosses(componentTriangles(receiver),componentTriangles(feed))&&stockCrosses(componentTriangles(ammo),componentTriangles(feed)),'feed bracket physically joins receiver and ammunition box');
  assert.equal(stockCrosses(componentTriangles(receiver),componentTriangles(ammo)),false,'original 25 mm gap needs the actual joining bracket');checks+=4;
  const mgSight=selectComponent(mgDark,[.12,.03,.08],'MG sight block');
  assert.ok(stockCrosses(componentTriangles(receiver),componentTriangles(mgSight)),'MG sight block seats on receiver');checks++;
  const smoke=darkParts.filter(p=>{const c=p.bounds.getCenter(new T.Vector3()).add(new T.Vector3(...DATUMS.turretPivot));return Math.abs(c.x)>1.1&&Math.abs(c.x)<1.45&&c.y>1.7&&c.y<2.1&&c.z>-.3&&c.z<.1;});
  assert.equal(smoke.length,12,'both complete smoke banks');
  const detailStock=detailParts.flatMap(p=>componentTriangles(p));
  // Fleet round 1 (tankFactoryCore armouredGlassSurround): the authored .25 x .145 pane is cut into its inset window and
  // four flush 16 mm frame bars (turretDetail, one ring: the bars share their corners) inside the pane's own box; the
  // bars are the pane, not the hood.
  const lens=selectComponent(components(tank.root.getObjectByName('turretGlass')),[.25-.032,.145-.032,.022],'recessed primary sight lens'),carrier=selectComponent(darkParts,[.31,.18,.036],'sight lens carrier');
  const pane=lens.bounds.clone().expandByVector(new T.Vector3(.016+1e-6,.016+1e-6,1e-6)),paneBars=detailParts.filter(p=>pane.containsBox(p.bounds));
  const frameBounds=paneBars.reduce((b,p)=>b.union(p.bounds),new T.Box3());
  assert.ok(paneBars.length>=1&&frameBounds.getSize(new T.Vector3()).distanceTo(new T.Vector3(.25,.145,.022))<.00001,'primary sight pane frame takes the outer ring of its authored box');
  const hoodStock=detailParts.filter(p=>!paneBars.includes(p)).flatMap(p=>componentTriangles(p));
  assert.ok(stockCrosses(componentTriangles(lens),componentTriangles(carrier))&&stockCrosses(componentTriangles(carrier),hoodStock),'optic carrier physically joins lens to armored hood');
  assert.equal(stockCrosses(componentTriangles(lens),hoodStock),false,'recessed lens needs a real carrier instead of floating inside its hood');
  const handles=detailParts.filter(p=>p.bounds.getSize(new T.Vector3()).distanceTo(new T.Vector3(.10,.035,.05))<.00001);assert.equal(handles.length,2);
  for(const handle of handles){const others=detailParts.filter(p=>p!==handle).flatMap(p=>componentTriangles(p));assert.ok(stockCrosses(componentTriangles(handle),others),'hatch handle physically enters its lid');checks++;}checks+=2;
  for(const tube of smoke){assert.ok(stockCrosses(componentTriangles(tube),detailStock),'every closed smoke tube enters a finite mounting ladder');checks++;}
  const pack=selectComponent(components(tank.root.getObjectByName('turretCloth')),[.31,.19,.27],'basket kit pack');
  assert.ok(stockCrosses(componentTriangles(pack),detailStock),'basket kit pack rests on actual floor rods');
  assert.equal(stockCrosses(componentTriangles(pack,new T.Vector3(0,.008,0)),detailStock),false,'old 3 mm suspended pack fails native floor contact');checks+=2;
  assert.equal(spec.visual.scheme,'stripes');assert.equal(spec.visual.number,'312');
 }finally{tank.dispose();donor.dispose();}
}
restore();console.log(`pt91mPendekarFidelity: HIGH/LOW exact T-72BU core/gear, ${checks} native ERA support/moving-gun checks, live/spent/reset kit and PT91 roof pass; photo/source qualification remains separate`);
