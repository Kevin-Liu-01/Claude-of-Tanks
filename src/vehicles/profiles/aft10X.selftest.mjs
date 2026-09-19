import assert from 'node:assert/strict';
import * as THREE from 'three';
import { aftRearCradleLoop, aftRoadWheelStock } from './aft10X.ts';
for(const high of[false,true]) {
  const geometry=aftRearCradleLoop(high);
  geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  for(const [axis,expected]of[['x',.146],['y',.460],['z',.597]])
    assert.ok(Math.abs(size[axis]-expected)<1e-6,`${axis} envelope at ${high?'HIGH':'LOW'} must match the upright source loop`);
  const material=new THREE.MeshBasicMaterial();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(.5405,2.3537,-2.7087);mesh.updateMatrixWorld(true);
  const ray=(y,z)=>new THREE.Raycaster(new THREE.Vector3(1,y,z),new THREE.Vector3(-1,0,0)).intersectObject(mesh,false);
  assert.equal(ray(2.3537,-2.7087).length,0,'side-on ray must see daylight through the YZ loop');
  assert.ok(ray(2.3537+.22*.460/.540,-2.7087).length>0,'upper arc must face a side-on ray');
  assert.ok(ray(2.3537,-2.7087+.22*.597/.540).length>0,'rear arc must face a side-on ray');
  assert.ok(mesh.position.y+geometry.boundingBox.min.y<2.146+.062/2,'upright lower arc intersects its support foot height');
  geometry.dispose();material.dispose();
}
for(const high of[true,false]) {
  const geometry=aftRoadWheelStock(high), material=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
  try {
    const mesh=new THREE.Mesh(geometry,material), angle=.55;
    const axial=(radius,side)=>new THREE.Raycaster(
      new THREE.Vector3(side*.4,Math.sin(angle)*radius,Math.cos(angle)*radius),
      new THREE.Vector3(-side,0,0),0,.8).intersectObject(mesh)[0]?.point.x;
    // Independent canonical Object_15 scalar first hits, in wheel-local X.
    // The old generic web at +148 mm and hub at +196 mm fail these witnesses.
    for(const[r,front,back]of[[.02,.1204,-.1051],[.06,.0910,-.1091],
      [.09,.0509,-.1121],[.12,.0545,-.1150],[.18,.0619,-.1209],
      [.22,.0668,-.1249],[.26,.13235,-.1288]]) {
      assert.ok(Math.abs(axial(r,1)-front)<.0015,'source front boss/web/rim profile must remain within scalar tolerance');
      assert.ok(Math.abs(axial(r,-1)-back)<.0015,'plain source inboard cone must not become a mirrored outer hub');
    }
    assert.equal(new THREE.Raycaster(new THREE.Vector3(0,.24,-.35),new THREE.Vector3(0,0,1),0,.70)
      .intersectObject(mesh).length,0,'55.4 mm central channel stays open above R198.5 mm');
    assert.ok(new THREE.Raycaster(new THREE.Vector3(0,.18,-.35),new THREE.Vector3(0,0,1),0,.70)
      .intersectObject(mesh).length,'real central web supports both halves below the gap');
  } finally {geometry.dispose();material.dispose()}
}
console.log('aft10X: HIGH/LOW upright cradle air and source-measured asymmetric wheel boss/web/rim/channel stock pass');
