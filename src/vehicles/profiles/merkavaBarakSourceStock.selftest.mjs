import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders,KIT} from '../tankFactoryCore.ts';
import {buildMerkava4Barak} from './merkavaX.ts';
import {ensureInteriorFills,hasInteriorFills} from '../interiorFills.ts';
import {sourceOpeningRayProbe} from '../../../tools/source-opening-rays.mjs';
import {proveBarakMovingRearStock} from './merkavaBarakMovingStock.test-support.mjs';
import {BARAK_OPENING_WITNESSES} from '../../../tools/barak-source-openings.mjs';

const id='merkava4_barak';await ensureInteriorFills([id]);assert.ok(hasInteriorFills(id));
const result=[];
function witnesses(root){
  const probe=sourceOpeningRayProbe(root);
  try{return BARAK_OPENING_WITNESSES.map(w=>{
    const hit=probe.cast(w.origin,w.direction,w.far);
    return {key:w.key,passed:w.expect==='air'?!hit:!!hit&&Math.abs(hit.point.getComponent(w.axis)-w.value)<=w.tolerance};
  });}finally{probe.dispose();}
}
function endRadius(root,x,y,z,angle){
  const normal=new T.Vector3(0,Math.cos(angle),Math.sin(angle));
  const center=new T.Vector3(x,y,z),meshes=[];
  root.traverseVisible(o=>{if(o.isMesh&&o.name==='gearEndWheelBody')meshes.push(o)});
  const hits=new T.Raycaster(center.addScaledVector(normal,.6),normal.negate(),0,.6).intersectObjects(meshes,false);
  return hits.length?.6-hits[0].distance:null;
}
function buildWithReceivers(quality){
  const receivers=[],rearSheets=[],material=new T.MeshBasicMaterial({side:T.DoubleSide});
  registerProfiledBuilders({[id]:P=>buildMerkava4Barak(new Proxy(P,{get(target,key){
    if(key!=='addEquipment')return Reflect.get(target,key);
    return(...args)=>{
      if(args[0]==='hullDetail'){
        const g=KIT.xform(args[1].clone(),...args.slice(2));g.scale(.972,1,1);g.computeBoundingBox();
        const b=g.boundingBox;
        if(b.min.z>3.50&&b.max.z>3.75&&b.max.z<3.79){const m=new T.Mesh(g,material);m.updateMatrixWorld(true);receivers.push(m);}
        else if(b.min.z<-4.07&&b.max.z>-3.34&&b.max.z<-3.30&&b.max.x-b.min.x<.10){const m=new T.Mesh(g,material);m.updateMatrixWorld(true);rearSheets.push(m);}
        else g.dispose();
      }
      return target.addEquipment(...args);
    };
  }}))});
  try{return {tank:createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242}),receivers,rearSheets,material};}
  finally{registerProfiledBuilders({[id]:buildMerkava4Barak});}
}
function receiverSeats(root,receivers,material){
  assert.equal(receivers.length,2,'both independently closed source receiver strips exist');
  const hull=root.getObjectByName('hull'),original=hull.material;hull.material=material;
  try{for(const x of[-.6,.6])for(const z of[3.514,3.52,3.53]){
    const ray=new T.Raycaster(new T.Vector3(x,3,z),new T.Vector3(0,-1,0),0,3);
    const a=ray.intersectObject(hull,false).map(h=>h.point.y),b=ray.intersectObjects(receivers,false).map(h=>h.point.y);
    assert.ok(a.length>=2&&b.length>=2,'finite entry and exit faces, not AABB overlap');
    assert.ok(Math.min(...b)>Math.min(...a)&&Math.max(...b)<Math.max(...a),'16mm rear receiver sheet lies inside real hull stock');
  }}finally{hull.material=original;}
}
// Independent source-only Object_32 held-out sections; these protect both
// asymmetric folded sheets without treating their entire bounds as solid.
const rearCalipers = [[-1.6,0.85,-3.35,-1.4055544158087552],[1.6,0.85,-3.35,1.2784575477686142],[-1.6,1.1,-3.35,-1.3722275472469154],[1.6,1.1,-3.35,1.3125076004913252],[-1.6,1.22,-3.35,-1.32560589703535],[1.6,1.22,-3.35,1.3571131495440418],[-1.6,0.85,-3.75,-1.4055544158087552],[1.6,0.85,-3.75,1.2784575477686142],[-1.6,1.1,-3.75,-1.3722275472469154],[1.6,1.1,-3.75,1.3125076004913252],[-1.6,1.22,-3.75,-1.32560589703535],[1.6,1.22,-3.75,1.3571131495440418],[-1.6,0.85,-4.02,-1.4055544158087552],[1.6,0.85,-4.02,1.2784575477686142],[-1.6,1.1,-4.02,-1.3722275472469154],[1.6,1.1,-4.02,1.3125076004913252],[-1.6,1.22,-4.02,-1.32560589703535],[1.6,1.22,-4.02,1.3571131495440418]];
function rearStock(root,sheets,material){
  assert.equal(sheets.length,6,'six distinct thin rear sheets/returns');
  const probe=sourceOpeningRayProbe(root);
  try{
    for(const[x,y,z,expected]of rearCalipers){
      const hit=probe.cast([x,y,z],[-Math.sign(x),0,0],.45);
      if(y===.85&&z===-3.35)assert.ok(!hit,'disclosed hidden receiving relief clears source-conflicting lower tip');
      else assert.ok(hit&&Math.abs(hit.point.x-expected)<.002,'source rear sheet/return first surface');
    }
    for(const side of[-1,1])assert.ok(!probe.cast([side*1.6,.75,-3.9],[-side,0,0],.3),'real air below folded rear sheets');
  }finally{probe.dispose();}
  const hull=root.getObjectByName('hull'),old=hull.material;hull.material=material;
  try{for(const[x,y]of[[-1.39,1.04],[-1.365,1.10],[1.28,1.04],[1.308,1.10]]){
    const ray=new T.Raycaster(new T.Vector3(x,y,-4.2),new T.Vector3(0,0,1),0,1);
    const a=ray.intersectObject(hull,false).map(h=>h.point.z),b=ray.intersectObjects(sheets,false).map(h=>h.point.z);
    assert.ok(a.length>=2&&b.length>=2,'rear sheet and receiver have actual entry/exit faces');
    const overlap=Math.min(Math.max(...a),Math.max(...b))-Math.max(Math.min(...a),Math.min(...b));
    assert.ok(overlap>.015,'rear returns seat at least15mm into finite existing hull stock');
  }}finally{hull.material=old;}
}
function circularShoePins(root,quality){
  const shoe=root.getObjectByName('gearTrackPads'),p=shoe.geometry.attributes.position;
  assert.equal(shoe.userData.trackShoeRadialScale,1,'explicit stock dimensions never squash hardware');
  const halfSpacing=shoe.userData.trackShoePitchM*.30;let vertices=0;
  for(let i=0;i<p.count;i++){
    if(Math.abs(Math.abs(p.getX(i))-.548*.48)>1e-6)continue;
    const dy=p.getY(i)+.006,dz=Math.abs(p.getZ(i))-halfSpacing,r=Math.hypot(dy,dz);
    if(r<1e-6||r>.01)continue;
    assert.ok(Math.abs(r-.0076)<1e-6,'actual transverse pin rim is circular in YZ');vertices++;
  }
  if(quality==='high')assert.ok(vertices>=24,'all four physical hexagonal pin caps retain their circle');
  else assert.equal(vertices,0,'approved LOW shoe omits unresolved cap detail instead of flattening it');
}
for(const quality of['high','low']){
  const {tank,receivers,rearSheets,material}=buildWithReceivers(quality);
  try{
    tank.root.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0)}});
    tank.root.updateMatrixWorld(true);
    receiverSeats(tank.root,receivers,material);
    rearStock(tank.root,rearSheets,material);
    assert.ok(witnesses(tank.root).every(row=>row.passed),`${quality}: complete rendered stock matches independent source calipers`);
    const detail=tank.root.getObjectByName('hullDetail');assert.ok(detail);
    detail.visible=false;
    assert.ok(witnesses(tank.root).some(row=>!row.passed),'removing surrounding stock cannot qualify air');
    detail.visible=true;detail.position.y-=.405;tank.root.updateMatrixWorld(true);
    assert.ok(witnesses(tank.root).some(row=>!row.passed),'historical405mm wrong seat is rejected');
    detail.position.y+=.405;tank.root.updateMatrixWorld(true);
    const filler=new T.Mesh(new T.BoxGeometry(.07,.04,.1),new T.MeshBasicMaterial());
    filler.position.set(.60,.825,3.95);tank.root.add(filler);tank.root.updateMatrixWorld(true);
    assert.equal(witnesses(tank.root).find(row=>row.key==='right-strap-aperture').passed,false,'filling the measured slot is rejected');
    tank.root.remove(filler);filler.geometry.dispose();filler.material.dispose();
    const hull=tank.root.getObjectByName('rig_hull'),receipt=hull.userData.runningGearReceipts.at(-1);
    assert.ok(Math.abs(receipt.wheelY-.3788)<.001,'source-sized shoe seats actual road-wheel axle near source378.8mm');
    assert.equal(receipt.wheelR,.332);assert.deepEqual(receipt.wheelZs,[-2.0557,-1.2559,-.2015,.7238,1.585,2.377]);
    assert.ok(Math.abs(tank.contactGeom.bottomYM)<1e-8,'native shoe sole retains ground zero');
    for(const angle of[0,Math.PI/2,Math.PI,3*Math.PI/2]){
      const drum=endRadius(tank.root,1.4,.830,3.2069,angle);
      assert.ok(drum>.14&&drum<.16,`drive axle section retains source149mm barrel, not generic310mm solid: ${drum}`);
      const rim=endRadius(tank.root,1.56,.7946,-2.9871,angle);
      assert.ok(rim>.328&&rim<.335,`idler thin tread ring retains source333mm envelope: ${rim}`);
    }
    // Mid-width open idler is actual hub/web stock. A solid full-width drum
    // would give a 320mm first hit between these source-supported webs.
    const aperture=endRadius(tank.root,1.419,.7946,-2.9871,Math.PI/10);
    assert.ok(aperture>.09&&aperture<.16,'idler hub is visible through the real space between web ribs');
    circularShoePins(tank.root,quality);
    const driveBarrelRadius=endRadius(tank.root,1.4,.830,3.2069,0);
    const moving=proveBarakMovingRearStock(tank,rearSheets);
    result.push({quality,moving,stockWitnesses:BARAK_OPENING_WITNESSES.length,wheelY:receipt.wheelY,driveBarrelRadius,idlerWebAir:true});
  }finally{tank.dispose();[...receivers,...rearSheets].forEach(m=>m.geometry.dispose());material.dispose();}
}
console.log(JSON.stringify(result));
console.log('merkavaBarakSourceStock: loaded HIGH/LOW source stock, slot air, negative controls, source-seated wheel datums and hollow end-wheel stock pass');
