import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { GRIFFIN_HULL_LENGTH_SCALE as H, GRIFFIN_TURRET_SCALE as S, GRIFFIN_TURRET_PIVOT } from './griffinProportions.ts';

function firstHit(root, origin, direction, far=20) {
  const ray=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,far);
  return ray.intersectObject(root,true).find(hit=>{
    for(let n=hit.object;n;n=n.parent)if(!n.visible)return false;
    const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;
    return m?.visible!==false&&m?.colorWrite!==false;
  });
}
function verifyRearGuards(root) {
  for(const side of [-1,1]){
    const hit=firstHit(root,[side*1.4409,1.3,-2.30*H],[0,1,0]);
    assert(hit,'measured rear guard must exist');assert.equal(hit.object.name,'hullRubber','source bend station owner');
    assert(Math.abs(hit.point.y-1.374)<.014,'rear guard follows source bend station');
  }
}
// Conservative finite-stock proof: every actual band triangle is enclosed
// by its AABB. A hull triangle separated from that larger box is also
// separated from the real band. This does not erase the raw 2 cm voxel report.
function worldTriangles(mesh) {
  const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
  const triangles=[];
  for(let i=0;i<(index?index.count:position.count);i+=3)
    triangles.push(new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3()
      .fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld))));
  return triangles;
}
function verifyBandSeparation(root) {
  const hull=worldTriangles(root.getObjectByName('hull'));
  assert.equal(hull.length,376,'complete authored hull stock enters the proof');
  for(const [name,side] of [['gearTrackBandL',-1],['gearTrackBandR',1]]) {
    const bands=worldTriangles(root.getObjectByName(name));
    assert(bands.length>1000,'actual complete band stock enters the proof');
    const boxes=bands.map(t=>new THREE.Box3().setFromPoints([t.a,t.b,t.c]));
    for(const triangle of hull)for(const box of boxes)
      assert.equal(box.intersectsTriangle(triangle),false,'finite hull/band stock must stay disjoint');
    // A genuine 20 mm lateral intrusion must fail the same conservative test.
    const intrusion=new THREE.Vector3(side*.02,0,0);
    assert(hull.some(t=>{
      const shifted=new THREE.Triangle(t.a.clone().add(intrusion),t.b.clone().add(intrusion),t.c.clone().add(intrusion));
      return boxes.some(box=>box.intersectsTriangle(shifted));
    }),'the finite-stock witness must reject actual misplaced hull stock');
  }
}
let checks=0;
for(const filled of [false,true]){
  if(filled)await ensureInteriorFills(['griffin50_x']);
  for(const quality of ['high','low']){
    const tank=createTank('griffin50_x',null,{proceduralOnly:true,quality,geometryReceipt:true,camoSeed:4242});
    try{
      const root=tank.root;root.updateMatrixWorld(true);
      const wheels=root.getObjectByName('gearRoadWheelDiscs');
      wheels.geometry.computeBoundingBox();
      const wheelSize=wheels.geometry.boundingBox.getSize(new THREE.Vector3());
      assert(Math.abs(wheelSize.y-wheelSize.z)<.00001,'lengthening the chassis must not stretch wheel circles');
      const stations=new Set(),instance=new THREE.Matrix4();
      for(let i=0;i<wheels.count;i++) {
        wheels.getMatrixAt(i,instance);
        stations.add(Number(new THREE.Vector3().setFromMatrixPosition(instance).z.toFixed(6)));
      }
      assert.deepEqual([...stations].sort((a,b)=>a-b),[-1.60435,-.80135,.00165,.80465,1.63735,2.44035],
        'road axles follow the 10% longer hull without changing wheel radii');
      const turretBounds=new THREE.Box3().setFromObject(root.getObjectByName('turret'));
      assert(Math.abs(turretBounds.max.x-turretBounds.min.x-2.718)<.0001,'turret shell is 10% narrower');
      checks+=3;
      for(const[z,sourceY,tolerance]of[[0,.570706,.002],[2.3,.566126,.002],[3.3,1.213680,.005]]){
        const hit=firstHit(root,[0,0,z*H],[0,1,0]);
        assert(hit&&Math.abs(hit.point.y-sourceY)<tolerance,'source-measured belly and bow knee');checks++;
      }
      // Actual assembled door face is recessed between the projecting wings.
      for(const[y,sourceZ]of[[.7,-2.22809],[1.2,-2.26826],[1.9,-2.32455]]){
        const hit=firstHit(root,[0,y,-4],[0,0,1]);
        assert(hit&&Math.abs(hit.point.z-sourceZ*H)<.004,'source rear door plane, whole visible scene');checks++;
      }
      assert.equal(firstHit(root,[0,.6,-2.8*H],[0,1,0],1.4),undefined,'central space behind the recessed ramp stays open');checks++;
      for(const side of[-1,1]){
        const hit=firstHit(root,[side*1.4,0,-2.8*H],[0,1,0]);
        assert(hit&&Math.abs(hit.point.y-1.337)<.004,'source rear wing underside');checks++;
      }
      verifyRearGuards(root);checks+=2;
      verifyBandSeparation(root);checks+=2;
      for(const seat of root.userData.mudguardFenderSeats){assert.equal(seat.supported,true,seat.label);checks++;}
      for(const name of['gun','gunDark']){
        const mesh=root.getObjectByName(name),bounds=new THREE.Box3().setFromObject(mesh);
        assert(bounds.max.z<GRIFFIN_TURRET_PIVOT[2]+(1.10+2.93194)*S+.002,'barrel rings must not extend beyond the source muzzle');checks++;
      }
      for(const[x,y]of[[.004,.006],[-.006,.004]]){
        const hit=firstHit(root,[x,2.07+.53*S+y,3.9],[0,0,-1]);
        assert.equal(hit?.object.name,'muzzleBoreShadowFallbackDisc','first visible bore remains open through the aligned rings');checks++;
      }
      const rubber=root.getObjectByName('hullRubber'),saved=rubber.position.z;
      try{rubber.position.z-=.1;root.updateMatrixWorld(true);assert.throws(()=>verifyRearGuards(root),/source bend station/);checks++;}
      finally{rubber.position.z=saved;root.updateMatrixWorld(true);}
      verifyRearGuards(root);
    }finally{tank.dispose();}
  }
}
console.log(`griffinAssembledHull: ${checks} HIGH/LOW cold/filled source-plane, open-space, finite-guard and muzzle checks pass`);
