import assert from 'node:assert/strict';
import {Group, BoxGeometry, MeshStandardMaterial, Vector3, Matrix4, Quaternion} from 'three';
import {DetachedGear} from './detachedGear.ts';
const root=new Group(), hull=new Group();root.add(hull);
hull.position.set(12,4,9);hull.rotation.set(.1,.7,-.06);root.updateMatrixWorld(true);
const geometry=new BoxGeometry(.5,.05,.18), material=new MeshStandardMaterial();
const kit=new DetachedGear(hull,geometry,material,22);
kit.addWheelLayer(new BoxGeometry(.2,1,1),material,0,0,0);
const slope=(x,z)=>.15*x+.07*z;
kit.launch(1,.5,-2,new Vector3(1,.6,-2),1,42,new Vector3(0,0,4));
const matrix=new Matrix4(), world=new Matrix4(), position=new Vector3();
function padPosition(){root.updateMatrixWorld(true);kit.pads.getMatrixAt(0,matrix);return position.setFromMatrixPosition(world.multiplyMatrices(kit.pads.matrixWorld,matrix)).clone();}
const launch=padPosition();kit.update(0,slope);assert(launch.distanceTo(padPosition())<1e-9,'paused effects do not move debris');
for(let n=0;n<900;n++)kit.update(1/120,slope);
const landed=padPosition();assert(landed.distanceTo(launch)>.4,'detached pieces actually travel');
for(let i=0;i<22;i++){
 kit.pads.getMatrixAt(i,matrix);
 const normal=new Vector3(-.15,1,-.07).normalize();
 const face=new Vector3(0,1,0).transformDirection(matrix);
 assert(Math.abs(face.dot(normal))>.995,'loose shoes settle on their broad face, not on an edge');
 for(let mask=0;mask<8;mask++){
  const corner=new Vector3(mask&1?.25:-.25,mask&2?.025:-.025,mask&4?.09:-.09).applyMatrix4(matrix);
  assert(corner.y>=slope(corner.x,corner.z)-.0001,'no shoe corner penetrates the slope');
 }
}
hull.position.set(-70,10,60);hull.rotation.set(-.4,-1,.3);kit.update(0,slope);
assert(landed.distanceTo(padPosition())<1e-6,'world-anchored debris stays behind a moving, turning tank');
kit.reset();assert.equal(kit.root.visible,false);
kit.launch(1,.5,-2,new Vector3(1,.6,-2),1,43,new Vector3());assert(landed.distanceTo(padPosition())>20,'new throw uses new tank location');
kit.reset();geometry.dispose();material.dispose();
console.log('detachedGear: ballistic travel, terrain contact, pause, moving-parent independence and reuse passed');
