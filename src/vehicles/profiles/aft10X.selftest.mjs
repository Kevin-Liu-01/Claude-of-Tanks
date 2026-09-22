import assert from 'node:assert/strict';
import * as THREE from 'three';
import { aftRearCradleLoop } from './aft10X.ts';
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
// 2026-09-22: the AFT-10's source wheel stock left with the nation wheel standard (the hull draws the Type 100 IFV
// wheel through nationWheelSets.ts); only the upright cradle remains this receipt's contract.
console.log('aft10X: HIGH/LOW upright cradle air pass');
