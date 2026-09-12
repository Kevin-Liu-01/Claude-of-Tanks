import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { arietePlaneStock } from './arieteXSuppliedArmor.ts';

// Independently frozen SOURCE ray/frame witnesses, not candidate calibrations.
const yawDatum = [0, 1.306227824, .328028885], gunDatum = [0, 1.651499209, 1.3415539];
const muzzleZ = 5.028094113;
const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} ±${tolerance}`);
const cast = (meshes, from, direction, far = 20) => new THREE.Raycaster(
  new THREE.Vector3(...from), new THREE.Vector3(...direction), 0, far).intersectObjects(meshes, false)[0];

function closedPlanePrimitive() {
  const g = arietePlaneStock([[1,0,0,-1],[-1,0,0,-1],[0,1,0,-1],[0,-1,0,0],
    [0,0,1,-2],[0,0,-1,0],[.2,.7,.6,-1.8]]);
  try {
    const p = g.attributes.position, edges = new Map(); let volume = 0;
    const point = i => new THREE.Vector3().fromBufferAttribute(p, i);
    for (let i = 0; i < p.count; i += 3) {
      const vs = [point(i), point(i+1), point(i+2)];
      volume += vs[0].dot(vs[1].clone().cross(vs[2])) / 6;
      for (let j = 0; j < 3; j++) {
        const a = vs[j].toArray().map(n=>n.toFixed(6)).join(','), b = vs[(j+1)%3].toArray().map(n=>n.toFixed(6)).join(',');
        const key = [a,b].sort().join('|'); edges.set(key,(edges.get(key)??0)+1);
      }
    }
    assert.ok(volume > 0, 'plane intersections produce positive outward solid stock');
    assert.ok([...edges.values()].every(count=>count===2),'every planar-cell edge closes exactly twice');
    assert.equal(g.attributes.uv.count,p.count,'analytic armor merges with native material buckets');
  } finally { g.dispose(); }
}

function surfaces(root, all) {
  const hull = root.getObjectByName('hull'), turret = root.getObjectByName('turret');
  for (const [x,z,y] of [[0,-2,1.497999],[.6,-1,1.379943],[.6,1,1.347441],
    [.6,2.4,1.284796],[1.2,0,1.347441]]) {
    near(cast([hull],[x,4,z],[0,-1,0])?.point.y,y,.006,'source hull roof witness');
  }
  for (const [x,z,y] of [[-.55,.8,1.8836668],[-.9,.8,1.8841406],[-.55,1.13,1.8633226],
    [-.55,1.37,1.8485267],[.55,.8,2.0250424],[.9,.8,1.9926370],
    [.55,1.13,2.0055514],[.9,1.37,1.7733723],[.55,1.59,1.7600677]]) {
    near(cast([turret],[x,4,z],[0,-1,0])?.point.y,y,.007,'held-out source cheek roof/front plane');
  }
  near(cast([hull],[0,0,0],[0,1,0])?.point.y,.402046,.000002,'source central belly');
  assert.equal(cast([turret],[0,1.84,1.80],[0,0,-1],.18),undefined,'actual round throat has forward air');
  const throat = cast([turret],[0,1.90,1.80],[0,0,-1]);
  near(throat?.point.z,1.51315,.005,'measured steep face immediately above the curved throat');
  const tube = cast(all,[0,1.651499209,5.10],[0,0,-1]);
  near(cast([root.getObjectByName('gunDark')],[0,1.651499209,5.10],[0,0,-1])?.point.z,
    3.683820288,.00001,'actual authored metal lies at source deep blind floor');
  // Fleet mouth standard (2026-09-11): the shading lining seats 0.3 mm ahead
  // of the tube edge instead of down at the source's deep blind floor.
  assert.equal(tube?.object.name,'muzzleBoreShadowFallbackDisc','visible mouth is the fleet lining');
  near(tube?.point.z,5.028094113+.0003,.0005,'native shading lining seats on the tube edge');
  assert.equal(cast(all,[0,1.651499209,5.02],[0,0,-1],1.30),undefined,'no filled barrel or MRS caps the bore');
  assert.equal(cast([turret],[.9,1.54,-1.45],[0,0,1],.42),undefined,'rising rear underside retains actual air');
  let falseMG=0;
  root.traverse(o=>{if(o.userData.fittingRoot&&['pintleMG','openYokeRws'].includes(o.userData.fitting))falseMG++;});
  assert.equal(falseMG,0,'empty source forks/optic shields do not earn machine-gun credit');
}

function gear(root) {
  const zs = [-2.055227,-1.376039,-.696431,-.016822,.662787,1.342395,2.021583];
  const roads = root.getObjectByName('gearRoadWheelDiscs'), rollers = root.getObjectByName('gearReturnRollerTires');
  assert.equal(roads.count,14); assert.equal(rollers.count,6);
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (const [mesh,stations,x,y] of [[roads,zs,1.18048348,.34611254],
    [rollers,[-1.675,-.348636,.976],1.267537,.852034]]) for(let i=0;i<mesh.count;i++) {
    mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m).applyMatrix4(mesh.matrixWorld);
    near(Math.min(...stations.map(z=>Math.abs(z-p.z))),0,2e-6,'actual source axle Z');
    near(Math.abs(p.x),x,2e-6,'source axle X');near(p.y,y,2e-6,'source axle Y');
  }
}

function poseAndEnvelope(t,all) {
  const root=t.root,yaw=root.getObjectByName('rig_turret'),gun=root.getObjectByName('rig_gun'),recoil=root.getObjectByName('rig_recoil');
  for(const [rig,datum] of [[yaw,yawDatum],[gun,gunDatum]]) near(rig.getWorldPosition(new THREE.Vector3())
    .distanceTo(new THREE.Vector3(...datum)),0,2e-6,'source functional joint');
  assert.equal(root.getObjectByName('gunMount').parent,gun);
  assert.equal(root.getObjectByName('gun').parent,recoil);
  const bounds=new THREE.Box3(),v=new THREE.Vector3(),m=new THREE.Matrix4();
  for(const o of all) for(let j=0;j<(o.isInstancedMesh?o.count:1);j++) {
    if(o.isInstancedMesh){o.getMatrixAt(j,m);m.premultiply(o.matrixWorld);}else m.copy(o.matrixWorld);
    for(let i=0;i<o.geometry.attributes.position.count;i++) {
      v.fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(m);
      assert.ok(v.toArray().every(Number.isFinite));bounds.expandByPoint(v);
    }
  }
  near(bounds.max.x-bounds.min.x,3.61,.00001,'source full-width ruler');
  near(bounds.max.y,3.564580707,.00001,'source highest actual fitting');
  assert.ok(bounds.min.y>=-1e-6,'moving-shoe stock remains above ground');
  near(t.gunMuzzleWorld(new THREE.Vector3()).z,muzzleZ,.000002,'source muzzle anchor');
  for(const y of [-.7,.9]) for(const pitch of [-.10,.16]) {
    yaw.rotation.y=y;gun.rotation.x=pitch;root.updateMatrixWorld(true);
    const expected=new THREE.Vector3(0,0,muzzleZ-gunDatum[2]).applyAxisAngle(new THREE.Vector3(1,0,0),pitch)
      .add(new THREE.Vector3(...gunDatum).sub(new THREE.Vector3(...yawDatum)))
      .applyAxisAngle(new THREE.Vector3(0,1,0),y).add(new THREE.Vector3(...yawDatum));
    near(t.gunMuzzleWorld(new THREE.Vector3()).distanceTo(expected),0,2e-6,'source muzzle follows real yaw and pitch');
    const before=t.gunMuzzleWorld(new THREE.Vector3());recoil.position.z=-.10;root.updateMatrixWorld(true);
    near(t.gunMuzzleWorld(new THREE.Vector3()).distanceTo(before),.10,2e-6,'native recoil moves the entire cannon');
    recoil.position.z=0;
  }
}
closedPlanePrimitive();
for(const quality of ['high','low']) {
  const t=createTank('ariete_c1_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    t.root.updateMatrixWorld(true);const all=[];
    t.root.traverse(o=>{if(o.isMesh&&!o.name.startsWith('procShadow_')&&!o.userData.vehicleMarking)all.push(o);});
    surfaces(t.root,all);gear(t.root);poseAndEnvelope(t,all);
  } finally {t.dispose();}
}
console.log('arieteXSupplied: actual high/low source datums, closed plane stock, held-out faces, real throat/bore/undercut, axle placement and recoil pass');
