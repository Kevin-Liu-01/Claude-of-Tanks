import assert from 'node:assert/strict';
import { Box3, Fog, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyGalleryCameraRange, fitGalleryDepth, GALLERY_MIN_NEAR_M, galleryFitDistance, resizeGalleryCamera } from './cameraFit.ts';

const bounds = new Box3(new Vector3(-2.1, 0, -4.8), new Vector3(2.1, 4.2, 7.1));
const target = new Vector3(0, 2.1, 0);
const originalBounds = bounds.clone();
const views = [[-1,.45,1],[0,0,1],[-1,0,0],[1,0,0],[0,0,-1],[0,1,0],[-1,1,1],[1,1,1]];

function assertFramed(camera, label) {
  camera.lookAt(target);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
  for(let i=0;i<8;i++) {
    const p=new Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,
      i&4?bounds.max.z:bounds.min.z).project(camera);
    assert.ok(Math.abs(p.x)<=1/1.18+1e-5&&Math.abs(p.y)<=1/1.18+1e-5,
      `${label}: actual corner ${i} leaves safe viewport (${p.x},${p.y})`);
    assert.ok(p.z>-1&&p.z<1,`${label}: corner ${i} crosses near/far plane`);
  }
}

// Use the real controller: its old fixed 38 m maximum invalidated a correct
// 51.9 m narrow side fit. A standalone projection test cannot catch that.
for(const view of views) {
  const camera=new PerspectiveCamera(34,1.8,.05,180);
  const controls=new OrbitControls(camera,null);
  controls.target.copy(target);controls.minDistance=2.2;controls.maxDistance=38;
  const fog=new Fog(0,18,45),outward=new Vector3(...view).normalize();
  if(view[1]===1&&view[0]===0)camera.up.set(0,0,-1);
  const fit=galleryFitDistance(bounds,target,outward,camera.up,34,1.8);
  camera.position.copy(target).addScaledVector(outward,fit);
  applyGalleryCameraRange(camera,controls,fog,bounds,fit);controls.update();
  assertFramed(camera,'real controls preset');
  const narrow=resizeGalleryCamera(camera.position,target,camera.up,bounds,34,1.8,.55);
  camera.aspect=.55;
  applyGalleryCameraRange(camera,controls,fog,bounds,narrow);controls.update();
  assertFramed(camera,'real controls narrow');
  camera.position.copy(target).addScaledVector(outward,controls.maxDistance);
  controls.update();camera.updateMatrixWorld(true);
  for(let i=0;i<8;i++) {
    const p=new Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,
      i&4?bounds.max.z:bounds.min.z).applyMatrix4(camera.matrixWorldInverse);
    assert.ok(-p.z<fog.near,'the specimen stays before scene fog throughout the allowed zoom range');
  }
}

for(const [index,view]of views.entries())for(const aspect of [.65,1,1.8,2.4]) {
  const outward=new Vector3(...view).normalize(),up=new Vector3(0,1,0);
  if(index===5)up.set(0,0,-1);
  const camera=new PerspectiveCamera(34,aspect,.1,500);camera.up.copy(up);
  const distance=galleryFitDistance(bounds,target,outward,up,34,aspect);
  camera.position.copy(target).addScaledVector(outward,distance);
  assertFramed(camera,`view ${index}/${aspect}`);
  const oldPosition=camera.position.clone();
  resizeGalleryCamera(camera.position,target,up,bounds,34,aspect,.55);
  camera.aspect=.55;assertFramed(camera,`resized ${index}/${aspect}`);
  resizeGalleryCamera(camera.position,target,up,bounds,34,.55,aspect);
  assert.ok(camera.position.distanceTo(oldPosition)<1e-9,'round-trip resize preserves orbit/zoom');
  camera.position.copy(target).addScaledVector(outward,distance*.7);
  resizeGalleryCamera(camera.position,target,up,bounds,34,aspect,.55);
  const newFit=galleryFitDistance(bounds,target,outward,up,34,.55);
  assert.ok(Math.abs(camera.position.distanceTo(target)/newFit-.7)<1e-9,'intentional close zoom preserved');
}
// 243 (the owner's "insignias and marks on tanks are still glitching ... if u drag them around the tank gallery"): the
// near plane stands short of the specimen and the plinth at every framing and zoom, and far from the old 5 cm.
{
  const floorY=-.025, stage=bounds.clone().expandByScalar(.5);
  const eyeDepth=(camera,point)=>-point.clone().applyMatrix4(camera.matrixWorldInverse).z;
  for(const [index,view]of views.entries())for(const zoom of [.6,1,1.7,3]) {
    const outward=new Vector3(...view).normalize(),up=new Vector3(0,1,0);
    if(index===5)up.set(0,0,-1);
    const camera=new PerspectiveCamera(34,1.8,GALLERY_MIN_NEAR_M,180);camera.up.copy(up);
    camera.position.copy(target).addScaledVector(outward,galleryFitDistance(bounds,target,outward,up,34,1.8)*zoom);
    camera.lookAt(target);camera.updateMatrixWorld(true);
    fitGalleryDepth(camera,stage,floorY);
    camera.updateMatrixWorld(true);
    const label=`view ${index} zoom ${zoom}: near ${camera.near.toFixed(3)}`;
    assert.ok(camera.near>=GALLERY_MIN_NEAR_M,label);
    for(let i=0;i<8;i++) {
      const corner=new Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z);
      assert.ok(eyeDepth(camera,corner)>camera.near,`${label}: the specimen's corner ${i} stays beyond the near plane`);
    }
    // the plinth along the frustum's lower edge, where its nearest visible point is
    for(let x=-1;x<=1;x+=.25) {
      const ray=new Vector3(x,-1,.5).unproject(camera).sub(camera.position).normalize();
      if(ray.y>=-1e-6||camera.position.y<=floorY)continue;
      const hit=camera.position.clone().addScaledVector(ray,(floorY-camera.position.y)/ray.y);
      assert.ok(eyeDepth(camera,hit)>camera.near*1.2,`${label}: the plinth stays beyond the near plane`);
    }
    if(zoom>=1&&index!==5)assert.ok(camera.near>.5,`${label}: depth precision is the specimen's, not a 5 cm near plane's`);
  }
  const inside=new PerspectiveCamera(34,1.8,1,180);
  inside.position.set(0,1,0);inside.lookAt(0,1,1);inside.updateMatrixWorld(true);
  fitGalleryDepth(inside,stage,floorY);
  assert.equal(inside.near,GALLERY_MIN_NEAR_M,'a camera inside the specimen keeps the close-range near plane');
}
assert.ok(bounds.equals(originalBounds),'framing cannot mutate model bounds');
assert.deepEqual(target.toArray(),[0,2.1,0],'presentation anchor stays fixed');
console.log('cameraFit: eight views, long barrel/asymmetric bustle, narrow resize, zoom, depth range and immutable bounds pass');
