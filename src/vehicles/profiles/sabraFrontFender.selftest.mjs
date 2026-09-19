import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { KIT } from './kit.ts';

// Source Object_4 FrontSide calipers, canonical source SHA 5ea261fb70f7….
// These are independent visible stations, not the builder's section table.
// Check the complete native model: an AABB touching is insufficient.
await ensureInteriorFills(['sabra_mk2_x']);
let checks=0;
for(const quality of ['high','low']) {
  let gear;
  const buildGear=KIT.buildRunningGear;
  KIT.buildRunningGear=(...args)=>{gear=buildGear(...args);return gear;};
  let tank;
  try {tank=createTank('sabra_mk2_x',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});}
  finally {KIT.buildRunningGear=buildGear;}
  try {
    tank.root.updateMatrixWorld(true);
    const meshes=[];
    tank.root.traverseVisible(o=>{if(o.isMesh&&!o.userData.shadowOnly&&o.material?.colorWrite!==false)meshes.push(o);});
    const hits=(origin,direction,far=10)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction).normalize(),0,far).intersectObjects(meshes,false);
    const near=(actual,expected,tolerance,label)=>{assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${quality} ${label}: ${actual} vs ${expected}`);checks++;};
    // Union actual closed-stock intervals along a finite source mounting ray.
    const covered=(origin,direction,from,to)=>{
      const saved=new Map();
      for(const mesh of meshes)for(const m of [].concat(mesh.material))if(!saved.has(m)){saved.set(m,m.side);m.side=THREE.DoubleSide;}
      let samples;
      try{samples=hits(origin,direction);}finally{for(const[m,side]of saved)m.side=side;}
      const rayDirection=new THREE.Vector3(...direction).normalize(),events=new Map();
      for(const h of samples){const n=h.face.normal.clone().transformDirection(h.object.matrixWorld),d=n.dot(rayDirection);if(Math.abs(d)<1e-7)continue;const delta=d<0?1:-1;events.set(`${h.object.uuid}:${Math.round(h.distance*1e6)}:${delta}`,{distance:h.distance,delta});}
      let depth=0,previous=0;
      for(const e of [...events.values()].sort((a,b)=>a.distance-b.distance)){
        if(e.distance>from&&previous<to&&depth<=0&&Math.min(to,e.distance)-Math.max(from,previous)>.0005)return false;
        depth+=e.delta;previous=e.distance;if(previous>=to)return true;
      }
      return false;
    };
    const flapJoint=x=>covered([x,1.005,3.48],[0,1.25,-1],.14*Math.hypot(1,1.25),.166*Math.hypot(1,1.25));
    for(const side of[-1,1]) {
      for(const[z,y]of[[2.65,1.43960],[2.85,1.42262],[2.95,1.39181],[3.10,1.32119],[3.20,1.27036]]) {
        const h=hits([side*1.45,1.48,z],[0,-1,0],.35)[0];
        near(h?.point.y,y,.006,'curved crown');
      }
      for(const[z,y]of[[3.35,1.17501],[3.40,1.10836],[3.435,1.05886]]) {
        const h=hits([side*1.45,1.21,z],[0,-1,0],.25)[0];
        near(h?.point.y,y,.004,'short sloped flap');
      }
      // Crown side edge folds down instead of retaining the old broad block.
      near(hits([side*1.72,1.42,3.05],[0,-1,0],.20)[0]?.point.y,1.34286,.004,'rolled edge');
      assert.equal(hits([side*1.45,1.60,2.65],[0,-1,0],.12).length,0,'old elevated forward shelf is absent');checks++;
      // Three transverse stations cross the actual crown/web/flap joint.
      for(const x of[1.15,1.45,1.65]) {
        assert.ok(covered([side*x,1.210,3.40],[0,0,-1],.083,.13),'finite metal-to-sheet mounting continuity');checks++;
      }
      assert.ok(flapJoint(side*1.45),'finite diagonal crosses the exposed rubber into the receiving lip');checks++;
      assert.ok(covered([side*1.45,1.43,3.50],[0,0,-1],1.12,1.20),'crown reaches retained rear shelf');checks++;
      // Leave the measured air gap above the loaded track/idler. This
      // rejects a block used to bridge the flap or fill its surrounding air.
      for(const[z,top,bottom]of[[2.80,1.39,1.30],[3.10,1.27,1.23],[3.30,1.15,1.08]]) {
        assert.equal(hits([side*1.45,top,z],[0,-1,0],top-bottom).length,0,'source track clearance stays empty');checks++;
      }
      near(hits([side*1.45,1.7,-2.2],[0,-1,0],.3)[0]?.point.y,1.58,.00001,'aft shelf preserved');
    }
    for(const seat of tank.root.userData.mudguardFenderSeats){assert.equal(seat.supported,true,seat.label);checks++;}

    // Inspect actual transformed vertices on both native shoe LODs through
    // a complete opposed course phase. Rays start on visible moving stock,
    // and must reach the fender's real lower face with positive air between.
    const shoes=[];
    tank.root.traverse(o=>{if(o.isInstancedMesh&&['gearTrackPads','gearTrackPadsSimplified'].includes(o.name))shoes.push(o);});
    assert.equal(shoes.length,2,'actual detailed and simplified native shoes');checks++;
    const fixed=meshes.filter(m=>m.name==='hull'||m.name==='hullRubber');
    const shoePoints=new Map(shoes.map(mesh=>{
      const a=mesh.geometry.attributes.position,unique=new Map();
      for(let i=0;i<a.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i);unique.set(p.toArray().join(','),p);}
      return[mesh,[...unique.values()]];
    }));
    const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
    const ray=new THREE.Raycaster();
    let sweptPoints=0,minimumAir=Infinity,maximumShoeZ=-Infinity,flapRegionShoeVertices=0;
    const axleLayout=structuredClone(gear.roadWheelLayout);
    for(let phase=0;phase<16;phase++) {
      const pitch=shoes[0].userData.trackShoePitchM;
      gear.update(pitch*phase/16,-pitch*phase/16,0);tank.root.updateMatrixWorld(true);
      for(const mesh of shoes)for(let instance=0;instance<mesh.count;instance++) {
        mesh.getMatrixAt(instance,matrix);matrix.premultiply(mesh.matrixWorld);
        for(const local of shoePoints.get(mesh)) {
          point.copy(local).applyMatrix4(matrix);
          maximumShoeZ=Math.max(maximumShoeZ,point.z);
          if(point.z>=3.307)flapRegionShoeVertices++;
          if(point.z<2.33||point.z>3.442||point.y<.80||Math.abs(point.x)<1.015||Math.abs(point.x)>1.752)continue;
          ray.set(point,up);ray.near=0;ray.far=.65;
          const h=ray.intersectObjects(fixed,false)[0];
          assert.ok(h&&h.face.normal.clone().transformDirection(h.object.matrixWorld).y<0,
            'every shoe vertex below the curved fender meets its outward lower face');
          assert.ok(h.distance>1e-5,`moving shoe/fender clearance: ${h.distance}`);
          sweptPoints++;minimumAir=Math.min(minimumAir,h.distance);
        }
      }
      assert.deepEqual(gear.roadWheelLayout,axleLayout,'source suspension stays fixed');checks++;
    }
    assert.ok(sweptPoints>1000,'non-vacuous moving near/far stock sample');checks++;
    console.log(JSON.stringify({quality,sweptPoints,minimumAirM:minimumAir,maximumShoeZ,flapRegionShoeVertices,phases:16}));
    gear.update(0,0,0);tank.root.updateMatrixWorld(true);

    // A realistic wrong-seat negative moves only the actual front rubber
    // sheet, leaving crown, metal lip, suspension and rear flap unchanged.
    const changed=[];
    for(const mesh of meshes){
      const pos=mesh.geometry.getAttribute('position');
      if(!pos||mesh.name!=='hullRubber')continue;
      for(let i=0;i<pos.count;i++)if(pos.getZ(i)>3.30){changed.push([pos,i,pos.getY(i)]);pos.setY(i,pos.getY(i)+.10);}
      pos.needsUpdate=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    }
    assert.ok(changed.length>0,'negative must displace actual front-flap triangles');checks++;
    try {
      for(const side of[-1,1]) {
        assert.equal(flapJoint(side*1.45),false,'a misplaced flap must open the measured joint');checks++;
      }
    } finally {
      for(const[p,i,y]of changed){p.setY(i,y);p.needsUpdate=true;}
      for(const mesh of meshes)if(mesh.name==='hullRubber'){mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();}
    }
    for(const side of[-1,1]){assert.ok(flapJoint(side*1.45),'negative restored');checks++;}
  } finally {tank.dispose();}
}
console.log(JSON.stringify({test:'sabraFrontFender',qualities:['high','low'],checks,status:'pass'}));
