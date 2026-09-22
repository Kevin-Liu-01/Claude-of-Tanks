import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills} from '../interiorFills.ts';
import {installCanvasFixture} from '../canvasFixture.test-support.mjs';
import {SHADOW_ONLY_LAYER} from '../../engine/renderLayers.ts';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function material(m){return {type:m.type,name:m.name,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,side:m.side,vertexColors:m.vertexColors,transparent:m.transparent,opacity:m.opacity,depthWrite:m.depthWrite,colorWrite:m.colorWrite,defines:m.defines??{},maps:['map','normalMap','roughnessMap','metalnessMap'].map(k=>m[k]?{key:k,repeat:m[k].repeat.toArray(),offset:m[k].offset.toArray(),wrapS:m[k].wrapS,wrapT:m[k].wrapT}:null),hook:String(m.onBeforeCompile),cache:m.customProgramCacheKey()};}
function authoredNonGunShadow(mesh) {
 if (mesh.userData.authoredShadowProxy !== true) return false;
 assert.match(mesh.name, /^procShadow_(hull|turret)$/, 'only the two actual non-gun proxies may leave the native-stock hash');
 assert.equal(mesh.userData.shadowOnly, true, 'excluded proxy must be shadow-only');
 assert.equal(mesh.layers.mask, 1 << SHADOW_ONLY_LAYER, 'excluded proxy cannot enter the ordinary color layer');
 assert.equal(mesh.geometry.userData.authoredShadowHull, true, 'excluded proxy must contain authored shadow geometry');
 assert.equal(mesh.castShadow, true, 'excluded proxy must remain a real caster');
 assert.equal(mesh.parent.name, mesh.name.replace('procShadow_', 'rig_'), 'excluded proxy retains its real owner');
 assert.ok((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(m => m.colorWrite === false), 'excluded proxy cannot write visible color');
 return true;
}
function payload(root){root.updateMatrixWorld(true);const gun=root.getObjectByName('rig_gun'),triangles=[],others=[],nativeOthers=[],shadows=[];
root.traverse(o=>{if(!o.isMesh)return;let p=o.parent,inside=false;while(p){if(p===gun)inside=true;p=p.parent;}
const g=o.geometry,attrs=Object.keys(g.attributes).sort(),mi=Array.isArray(o.material)?o.material:[o.material],mats=mi.map(material);
if(!inside){const row=[o.name,attrs.map(k=>[k,g.attributes[k].itemSize,Array.from(g.attributes[k].array)]),g.index?Array.from(g.index.array):null,o.matrixWorld.elements,mats,o.count??null,o.instanceMatrix?Array.from(o.instanceMatrix.array):null];others.push(row);if(authoredNonGunShadow(o))shadows.push(o.name);else nativeOthers.push(row);return;}
const idx=g.index,ct=idx?.count??g.attributes.position.count;for(let i=0;i<ct;i+=3){const corners=[];for(let k=0;k<3;k++){const ix=idx?idx.getX(i+k):i+k;corners.push(attrs.map(a=>{const at=g.attributes[a];return [a,Array.from(at.array.slice(ix*at.itemSize,(ix+1)*at.itemSize))];}));}const cycles=[0,1,2].map(k=>JSON.stringify([corners[k],corners[(k+1)%3],corners[(k+2)%3]])).sort();const gr=g.groups.find(v=>i>=v.start&&i<v.start+v.count);triangles.push(JSON.stringify([cycles[0],o.matrixWorld.elements,mats[gr?.materialIndex??0],o.userData.combatHitboxRole]));}});
assert.deepEqual(shadows.sort(),['procShadow_hull','procShadow_turret'],'only validated invisible authored proxies are excluded');
return {gun:digest(triangles.sort()),other:digest(others),otherNativeStock:digest(nativeOthers),gunTriangles:triangles.length};}

import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
// Authenticated before the ownership edit: profile SHA
// fb249c071781c985a452272c8a1374f4a3f2ea2f44199a399d711a0d710305f1.
// Oriented neutral triangles include every attribute and material descriptor;
// non-gun geometry, instance transforms and material descriptors remain exact.
const BEFORE=[
  {
    "quality": "high",
    "camoPattern": "factory",
    "gun": "6cf28db82e67aaa50cf5bdbcbe0b2d36ba82857c8d1f772814f9a7a9bf70620a",
    "other": "5cdf2fe1fb522c5574a610e12e83ed19d1fc9aa287ff04da82e37f8556460e9d",
    "gunTriangles": 1526
  },
  {
    "quality": "high",
    "camoPattern": "winter",
    "gun": "6cf28db82e67aaa50cf5bdbcbe0b2d36ba82857c8d1f772814f9a7a9bf70620a",
    "other": "28073e67d7dcd789b07fed6ba0dedff68bc771a8d5cd7d76a16b6b4bc7bbf598",
    "gunTriangles": 1526
  },
  {
    "quality": "low",
    "camoPattern": "factory",
    "gun": "0d8cc113651489d2dbe80798d85c1123e0110e57fab0f3db51d0f83f936fa037",
    "other": "c243d210b3dc85b6a807d625445b1102903d6231dc02bc6b0593ae397a6a079b",
    "gunTriangles": 994
  },
  {
    "quality": "low",
    "camoPattern": "winter",
    "gun": "0d8cc113651489d2dbe80798d85c1123e0110e57fab0f3db51d0f83f936fa037",
    "other": "c5403fb244689cd6b468c47b2e641f57dc4c5086271129259829101b98c2452d",
    "gunTriangles": 994
  }
];

// Derived from that exact hash-pinned original profile, not the current model.
// Replaying it first reproduced all four complete BEFORE payloads above. The
// original/current per-mesh comparison then found only procShadow_hull changed
// after the separately tested bow-armor shadow opt-in. Preserve the complete
// historical hashes, but compare non-gun native stock without the two validated
// invisible proxies. suppliedShadowCoverage.selftest owns their actual coverage
// and budgets; gun shadow stock stays inside the original gun hash unchanged.
// Evidence: .qa-dev/tank-run/type96-gun-ownership/shadow-fixture-replay.json.
// 2026-09-21 (r35, fleet interior-fill regeneration under the track-lane rule,
// tools/gen-interior-fills.mjs --rounds=8 --min-fine=1): payload() hashes every
// mesh outside rig_gun, which includes the two generated *InteriorFill meshes, so
// the regenerated type96b_x record moved these four digests. With the fill meshes
// skipped the digests are identical before and after the regeneration (high/factory
// bf43f4236155…, high/winter cb9cd9cd3ab0…, low/factory 5dab33048edf…, low/winter
// 7d3b783a0378…), so no authored native stock changed; re-based from the record
// generated 2026-09-18 in 547457932 (ce5ef1ff09cc…, db5e8bb9493a…, 8561e26e68c7…, 354d8ebcbba0…).
const NATIVE_OTHER_BEFORE = [
 '42e282b4d9a21f47d9571c3a274957a0b55b696de74688761e3d344eb2a8cc83',
 '1f3940cd0d70841803ee1e07ba2c9f3dd556bcd7e98f9af3cd6124db6d56ba38',
 'c25e66b21462806817494dac8d483196b9c79bdd93009379c0e006173ab58597',
 '2f7de8e7373972d00a40f089a0fc127d69aca782da43e39f614b4fc758bbb03a',
];

const near=(a,b,label,eps=1e-6)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=eps,`${label}: ${a} vs ${b}`);
const restore=installCanvasFixture(),rows=[];
await ensureInteriorFills(['type96b_x']);
try {for(const [caseIndex,expected] of BEFORE.entries()){
 const {quality,camoPattern}=expected;
 const tank=createTank('type96b_x',null,{quality,proceduralOnly:true,materialMode:'rendered',geometryReceipt:false,batchStatic:false,decor:true,camoPattern,camoSeed:4242});
 try {
  const neutral=payload(tank.root);
  assert.equal(neutral.gun,expected.gun,'oriented gun stock, attributes/materials and gun shadow must remain exact');
  assert.equal(neutral.gunTriangles,expected.gunTriangles,'gun ownership cannot add or remove stock');
  assert.equal(neutral.otherNativeStock,NATIVE_OTHER_BEFORE[caseIndex],'all non-gun native stock, instances, transforms, paint/UV/colors must remain exact');
  const shadow=tank.root.getObjectByName('procShadow_hull');
  shadow.userData.shadowOnly=false;
  try {assert.throws(()=>authoredNonGunShadow(shadow),/must be shadow-only/,'a proxy flag alone cannot exclude ordinary stock');}
  finally {shadow.userData.shadowOnly=true;}
  const hull=tank.root.getObjectByName('hull'),savedAuthoredFlag=hull.userData.authoredShadowProxy;
  hull.userData.authoredShadowProxy=true;
  try {assert.throws(()=>authoredNonGunShadow(hull),/only the two actual non-gun proxies/,'visible armor cannot borrow a proxy tag to escape preservation');}
  finally {if(savedAuthoredFlag===undefined)delete hull.userData.authoredShadowProxy;else hull.userData.authoredShadowProxy=savedAuthoredFlag;}
  const root=tank.root,gun=root.getObjectByName('rig_gun'),recoil=root.getObjectByName('rig_recoil');
  const mount=gun.getObjectByName('gunMount'),barrel=recoil.getObjectByName('gun'),turret=root.getObjectByName('turret');
  assert.ok(mount?.isMesh&&barrel?.isMesh,'real boot and tube, not an empty mount');
  assert.ok(mount.parent===gun,'boot is directly gun-owned');assert.ok(barrel.parent===recoil,'barrel is recoil-owned');
  assert.ok(mount.material===barrel.material,'same actual emitted barrel material');
  assert.equal(mount.material.side,T.FrontSide);
  mount.geometry.computeBoundingBox();
  const bounds=mount.geometry.boundingBox;
  for(const [actual,value] of [[bounds.min.x,-.26],[bounds.max.x,.26],[bounds.min.y,-.2782],[bounds.max.y,.3518],[bounds.min.z,-.4],[bounds.max.z,.351]])near(actual,value,'Object_6 finite measured boot envelope');
  const spec=getSpec('type96b_x');assert.equal(spec.gunDepressionDeg,7);assert.equal(spec.gunElevationDeg,14);
  const state=createTankState(spec,new T.Vector3(),0);
  const inGun=(mesh,local)=>gun.worldToLocal(mesh.localToWorld(local.clone()));
  const witness=new T.Vector3().fromBufferAttribute(mount.geometry.attributes.position,0);
  function fixed(){root.updateMatrixWorld(true);assert.ok(inGun(mount,witness).distanceTo(witness)<1e-8,'boot must not translate with recoil');}
  function ray(mesh,point,direction){root.updateMatrixWorld(true);const dir=new T.Vector3(...direction).transformDirection(gun.matrixWorld);
   return new T.Raycaster(gun.localToWorld(new T.Vector3(...point)),dir,0,3).intersectObject(mesh,false)[0];}
  function finiteSeat(){
   const top=ray(mount,[0,1,0],[0,-1,0]);assert.ok(top,'actual outward boot crown exists');near(gun.worldToLocal(top.point.clone()).y,.3128,'boot crown source station',2e-6);
   const surfaces=[];root.traverseVisible(o=>{if(o.isMesh)surfaces.push(o)});
   // The centered roof optic legitimately occludes x within +/-125 mm.
   // Both measured boot shoulders outside that receiver must be exposed.
   for(const x of[-.16,.16]) {
    const first=new T.Raycaster(gun.localToWorld(new T.Vector3(x,1,0)),new T.Vector3(0,-1,0).transformDirection(gun.matrixWorld),0,3).intersectObjects(surfaces,false)[0];
    assert.ok(first?.object===mount,`boot shoulder ${x} instead reached ${first?.object?.name}`);
   }
   // A point 10 mm inside the measured rear cap is enclosed by the actual
   // turret receiver at every pitch. Opposing finite FrontSide rays bound it.
   const upper=ray(turret,[0,1,-.39],[0,-1,0]),lower=ray(turret,[0,-1,-.39],[0,1,0]);
   assert.ok(upper&&lower,'rear boot receiving stock must be finite on both sides');
   assert.ok(gun.worldToLocal(upper.point.clone()).y>0&&gun.worldToLocal(lower.point.clone()).y<0,'rear cap must remain inside actual turret receiver');
  }
  for(const pitch of[-7,0,14])for(const yaw of[0,.73,-1.1]){
   state.gunPitch=T.MathUtils.degToRad(pitch);state.turretYaw=yaw;
   tank.syncFromState(state,1);root.updateMatrixWorld(true);fixed();finiteSeat();
   const tubePoint=new T.Vector3().fromBufferAttribute(barrel.geometry.attributes.position,0),before=inGun(barrel,tubePoint);
   tank.recoilKick(0,1);tank.syncFromState(state,.12);root.updateMatrixWorld(true);
   fixed();finiteSeat();near(recoil.position.z,-.13541666666666666,'actual 125mm hold travel');
   near(inGun(barrel,tubePoint).z-before.z,-.13541666666666666,'actual tube stock translates');
   recoil.add(mount);root.updateMatrixWorld(true);assert.throws(fixed,/boot must not translate/,'wrong-parent control rejects original defect');gun.add(mount);
   tank.syncFromState(state,1);fixed();near(recoil.position.z,0,'tube returns to battery');
  }
  for(const distance of[15,75,200]){const camera=new T.PerspectiveCamera();camera.position.set(0,0,distance);camera.updateMatrixWorld(true);root.traverse(o=>{if(o.isLOD)o.update(camera)});assert.ok(mount.visible&&mount.parent===gun,'actual fixed boot survives original distance policy');}
  rows.push({quality,camoPattern,legalPitchYawCases:9,wrongParentNegatives:9,gunTriangles:expected.gunTriangles,historicalFullOther:expected.other,currentFullOther:neutral.other,otherNativeStock:neutral.otherNativeStock});
 } finally {tank.dispose();}
}} finally {restore();}
console.log(JSON.stringify({pass:true,rows,limitation:'CPU stock/material/UV/motion proof; canvas fixture draws no pixels. Final regenerated-fill native views remain separate.'}));
