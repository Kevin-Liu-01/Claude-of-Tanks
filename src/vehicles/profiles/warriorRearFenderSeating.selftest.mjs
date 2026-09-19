import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { isTrackShoeMesh } from '../../../tools/track-clip-classification.mjs';
import { buildFv510MilanX } from './fv510MilanX.ts';
import { KIT } from './kit.ts';

// Source-only Object_21 calipers, canonical SHA e568badc436980b9f2b718db9786120f
// cc7527b7fe6465c3efa66889fa208c04. The supplied model is never loaded by this
// native test. The roof is a thin channel, not a filled supporting wedge.
const id = 'fv510_milan_x';
const roofStations = [
  [-3.075,.964176], [-3.04,.983376], [-3,1.005318], [-2.95,1.032746],
  [-2.85,1.090433], [-2.77,1.135270], [-2.65,1.147665], [-2.57,1.148092],
];
await ensureInteriorFills([id]);
assert.ok(hasInteriorFills(id), 'actual generated interior is loaded');
const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
const ray = new THREE.Raycaster();
const summaries = [];
function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual-expected)<=tolerance,
    `${label}: ${actual} vs ${expected}`);
}
function firstVisible(root, origin, direction, far = 1) {
  ray.set(new THREE.Vector3(...origin),new THREE.Vector3(...direction));
  ray.near=0;ray.far=far;
  return ray.intersectObject(root).find(hit=>{
    for(let object=hit.object;object;object=object.parent)if(!object.visible)return false;
    const mat=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
    return mat?.colorWrite!==false && !hit.object.userData.shadowOnly;
  });
}
// Opposing FrontSide rays establish finite stock around a witness. An AABB
// containing the witness is insufficient: this also rejects a hollow cavity.
function containsStock(mesh, point, axis, reach=4) {
  const direction=new THREE.Vector3();direction[axis]=1;
  const low=point.clone().addScaledVector(direction,-reach);
  const high=point.clone().addScaledVector(direction,reach);
  ray.set(low,direction);ray.near=0;ray.far=reach*2;
  const a=ray.intersectObject(mesh)[0];
  ray.set(high,direction.clone().negate());
  const b=ray.intersectObject(mesh)[0];
  return !!a && !!b && a.point[axis]<point[axis]-1e-5 && b.point[axis]>point[axis]+1e-5;
}
function triangles(mesh) {
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index,result=[];
  for(let i=0;i<(index?.count??p.count);i+=3)result.push(new THREE.Triangle(...[0,1,2].map(k=>
    new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld))));
  return result;
}
function buildCaptured(quality, shiftFlapZ=0) {
  const guards=new Map(),hull=[];
  const save=(geo,transform)=>{
    const mesh=new THREE.Mesh(KIT.xform(geo.clone(),...transform),material);
    mesh.updateMatrixWorld(true);return mesh;
  };
  registerProfiledBuilders({[id](P){
    const add=P.add,addMudguard=P.addMudguard;
    P.add=(bucket,geo,...transform)=>{
      if(bucket==='hull')hull.push(save(geo,transform));
      return add(bucket,geo,...transform);
    };
    P.addMudguard=(label,bucket,geo,x=0,y=0,z=0,...rest)=>{
      if(label.startsWith('warrior-milan-rear-flap-'))z+=shiftFlapZ;
      const mesh=save(geo,[x,y,z,...rest]);mesh.name=label;guards.set(label,mesh);
      return addMudguard(label,bucket,geo,x,y,z,...rest);
    };
    buildFv510MilanX(P);
  }});
  let tank;
  try {tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,batchStatic:false});}
  finally {registerProfiledBuilders({[id]:buildFv510MilanX});}
  return {tank,guards,hull,dispose(){tank.dispose();for(const mesh of [...guards.values(),...hull])mesh.geometry.dispose();}};
}
try {
  for(const quality of ['high','low']) {
    const captured=buildCaptured(quality),{tank,guards,hull}=captured;
    try {
      const root=tank.root;root.updateMatrixWorld(true);
      const seats=root.userData.mudguardFenderSeats;
      assert.equal(seats.length,10,'both roofs, four webs, two lips and two flaps are registered');
      assert.ok(seats.every(seat=>seat.supported),'each native part meets the hull through actual fender stock');
      for(const side of [-1,1]) {
        const prefix=`warrior-milan-rear-${side}`;
        const web=guards.get(`${prefix}-inboard-web`),lip=guards.get(`${prefix}-lip`);
        const flap=guards.get(`warrior-milan-rear-flap-${side}`);
        const hullWitness=new THREE.Vector3(side<0?-.9619:.9600,1,-2.65);
        assert.ok(containsStock(web,hullWitness,'x'),'thin inboard web has finite material at its hull seat');
        assert.ok(hull.some(mesh=>containsStock(mesh,hullWitness,'x')),'same witness is inside the original main hull');
        for(const x of [1.10,1.30,1.50]) {
          const witness=new THREE.Vector3(side*x,.84,-3.0832);
          assert.ok(containsStock(lip,witness,'z'),'real metal lip contains each overlap witness');
          assert.ok(containsStock(flap,witness,'z'),'real rubber flap overlaps that same finite lip stock');
        }
        flap.geometry.computeBoundingBox();
        near(flap.geometry.boundingBox.min.y,.2999,1e-5,'source flap ground clearance');
        near(flap.geometry.boundingBox.max.y,.8629,1e-5,'source flap height');
        for(const [z,y] of roofStations) {
          const hit=firstVisible(root,[side*1.3,1.151,z],[0,-1,0],.55);
          assert.equal(hit?.object.name,'hull','full native scene exposes the real fender roof');
          near(hit.point.y,y,.002,'independent measured source roof station');
        }
        const rear=firstVisible(root,[side*1.3,.6,-3.3],[0,0,1],.5);
        assert.equal(rear?.object.name,'hullRubber','actual flap remains visible below the metal lip');
        near(rear.point.z,-3.0879,.0006,'source back face plus submillimetre seating');
        const overlap=firstVisible(root,[side*1.3,.84,-3.3],[0,0,1],.5);
        assert.equal(overlap?.object.name,'hull','steel lip covers the rubber overlap without coplanar fighting');
        const cavity=new THREE.Vector3(side*1.3,.90,-2.95);
        for(const mesh of guards.values())assert.equal(containsStock(mesh,cavity,'y'),false,'channel retains air above the track');
      }
      const guardTriangles=[...guards.values()].flatMap(triangles);
      const shoes=[];root.traverse(object=>{if(isTrackShoeMesh(object))shoes.push(object);});
      assert.ok(shoes.length>0,'check actual installed instanced track shoes');
      const state=createTankState(getSpec(id),new THREE.Vector3(),0);
      const matrix=new THREE.Matrix4(),world=new THREE.Matrix4();
      let checked=0;
      for(const phase of [0,.023,.057,.101,.149]) {
        state.trackScroll.l=phase;state.trackScroll.r=phase;
        tank.syncFromState(state,1);root.updateMatrixWorld(true);
        for(const mesh of shoes) {
          mesh.geometry.computeBoundingBox();
          for(let i=0;i<mesh.count;i++) {
            mesh.getMatrixAt(i,matrix);world.multiplyMatrices(mesh.matrixWorld,matrix);
            const bounds=mesh.geometry.boundingBox.clone().applyMatrix4(world).expandByScalar(.01);
            if(bounds.min.z> -2.54)continue;
            checked++;
            for(const triangle of guardTriangles)assert.equal(bounds.intersectsTriangle(triangle),false,
              `${quality}: fender clears conservative actual shoe bounds by 10 mm at phase ${phase}, ${mesh.name}/${i}`);
          }
        }
      }
      summaries.push({quality,registeredSeats:seats.length,sourceRoofRays:16,shoeBoundsChecked:checked,clearanceM:.01});
    } finally {captured.dispose();}
    // A retained registered flap translated off the real lip must fail both
    // finite stock and the existing native seating gate; no fixture skip.
    const negative=buildCaptured(quality,-.15);
    try {
      for(const side of [-1,1]) {
        const label=`warrior-milan-rear-flap-${side}`;
        assert.equal(negative.tank.root.userData.mudguardFenderSeats.find(s=>s.label===label)?.supported,false,'wrong seat is rejected by native audit');
        assert.equal(containsStock(negative.guards.get(label),new THREE.Vector3(side*1.3,.84,-3.0832),'z'),false,'translated flap has no material at the real lip');
      }
    } finally {negative.dispose();}
  }
} finally {material.dispose();registerProfiledBuilders({[id]:buildFv510MilanX});}
console.log('warriorRearFenderSeating: source stations, finite seats, open channels, wrong-seat negatives and moving-shoe clearance pass',JSON.stringify(summaries));
