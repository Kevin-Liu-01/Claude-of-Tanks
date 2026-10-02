import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills} from '../interiorFills.ts';
import {installCanvasFixture} from '../canvasFixture.test-support.mjs';
import {SHADOW_ONLY_LAYER} from '../../engine/renderLayers.ts';
function authoredNonGunShadow(mesh) {
 if (mesh.userData.authoredShadowProxy !== true) return false;
 assert.match(mesh.name, /^procShadow_(hull|turret)$/, 'only the two actual non-gun proxies are authored shadow stock');
 assert.equal(mesh.userData.shadowOnly, true, 'excluded proxy must be shadow-only');
 assert.equal(mesh.layers.mask, 1 << SHADOW_ONLY_LAYER, 'excluded proxy cannot enter the ordinary color layer');
 assert.equal(mesh.geometry.userData.authoredShadowHull, true, 'excluded proxy must contain authored shadow geometry');
 assert.equal(mesh.castShadow, true, 'excluded proxy must remain a real caster');
 assert.equal(mesh.parent.name, mesh.name.replace('procShadow_', 'rig_'), 'excluded proxy retains its real owner');
 assert.ok((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(m => m.colorWrite === false), 'excluded proxy cannot write visible color');
 return true;
}
function proxies(root){root.updateMatrixWorld(true);const gun=root.getObjectByName('rig_gun'),shadows=[];
root.traverse(o=>{if(!o.isMesh)return;let p=o.parent,inside=false;while(p){if(p===gun)inside=true;p=p.parent;}
if(!inside&&authoredNonGunShadow(o))shadows.push(o.name);});
assert.deepEqual(shadows.sort(),['procShadow_hull','procShadow_turret'],'only validated invisible authored proxies outside the gun');
return shadows;}

import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
// The frozen gun / non-gun payload digests and gun-triangle counts (pinned per quality and camo pattern) are
// retired: whole-tank change detection of type96b_x, including the 2026-10-01 forward smoke correction, is the
// fleet geometry ledger's. Kept: the boot is gun-owned and the tube recoil-owned at every legal pitch/yaw, the
// measured boot envelope and seat, the wrong-parent control, distance-policy survival and the authored
// shadow-proxy contract (+ its two rejecting controls).
const CASES=[{quality:'high',camoPattern:'factory'},{quality:'high',camoPattern:'winter'},
  {quality:'low',camoPattern:'factory'},{quality:'low',camoPattern:'winter'}];

const near=(a,b,label,eps=1e-6)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=eps,`${label}: ${a} vs ${b}`);
const restore=installCanvasFixture(),rows=[];
await ensureInteriorFills(['type96b_x']);
try {for(const {quality,camoPattern} of CASES){
 const tank=createTank('type96b_x',null,{quality,proceduralOnly:true,materialMode:'rendered',geometryReceipt:false,batchStatic:false,decor:true,camoPattern,camoSeed:4242});
 try {
  proxies(tank.root);
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
  rows.push({quality,camoPattern,legalPitchYawCases:9,wrongParentNegatives:9});
 } finally {tank.dispose();}
}} finally {restore();}
console.log(JSON.stringify({pass:true,rows,limitation:'CPU stock/material/UV/motion proof; canvas fixture draws no pixels. Final regenerated-fill native views remain separate.'}));
