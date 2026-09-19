import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills,hasInteriorFills} from '../interiorFills.ts';
import {KIT} from './kit.ts';

// Source Object_10 sheet component and receiving plane, canonical source
// SHA506a31e984730c4ab6a398a4f1305a2fe6220960699842d8ed62ec0b4a2658f0.
// The old failures occurred with AND without fills; fills cannot seat stock.
let checks=0;
for(const filled of[false,true]) {
  if(filled)await ensureInteriorFills(['ajax_x']);
  assert.equal(hasInteriorFills('ajax_x'),filled,'cold/filled state is explicit');checks++;
  for(const quality of[undefined,'high','low']) {
    assert.equal(hasInteriorFills('ajax_x'),filled,'a preceding build cannot secretly load fills');checks++;
    let gear;
    const build=KIT.buildRunningGear;
    KIT.buildRunningGear=(...args)=>{gear=build(...args);return gear;};
    let tank;
    try{tank=createTank('ajax_x',null,{proceduralOnly:true,geometryReceipt:true,...(quality?{quality}:{})});}
    finally{KIT.buildRunningGear=build;}
    try {
      const label=`${filled?'filled':'cold'} ${quality??'default'}`;
      tank.root.updateMatrixWorld(true);
      const meshes=[];
      tank.root.traverseVisible(o=>{if(o.isMesh&&!o.userData.shadowOnly&&o.material?.colorWrite!==false)meshes.push(o);});
      const hits=(origin,direction,far=1)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction).normalize(),0,far).intersectObjects(meshes,false);
      const close=(a,b,tolerance,message)=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${label}: ${message}: ${a} / ${b}`);checks++;};
      const covered=(origin,direction,from,to)=>{
        const saved=new Map();for(const mesh of meshes)for(const m of[].concat(mesh.material))if(!saved.has(m)){saved.set(m,m.side);m.side=THREE.DoubleSide;}
        let samples;try{samples=hits(origin,direction,3);}finally{for(const[m,side]of saved)m.side=side;}
        const axis=new THREE.Vector3(...direction).normalize(),events=new Map();
        for(const h of samples){const dot=h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(axis);if(Math.abs(dot)<1e-7)continue;const delta=dot<0?1:-1;events.set(`${h.object.uuid}:${Math.round(h.distance*1e6)}:${delta}`,{distance:h.distance,delta});}
        let depth=0,previous=0;
        for(const e of[...events.values()].sort((a,b)=>a.distance-b.distance)){
          if(e.distance>from&&previous<to&&depth<=0&&Math.min(to,e.distance)-Math.max(from,previous)>.0005)return false;
          depth+=e.delta;previous=e.distance;if(previous>=to)return true;
        }
        return false;
      };
      const rootContact=side=>covered([side*1.20,1.25,-3.292],[0,1,0],.06,.15);
      for(const side of[-1,1]) {
        for(const[x,z,originY,sourceY]of[[1.1,-3.4,1.22,1.119211],[1.2,-3.45,1.10,1.0339],
          [1.32,-3.5,1.06,.972607],[1.32,-3.4,1.23,1.145992],[1.5,-3.4,1.23,1.165425]]) {
          const h=hits([side*x,originY,z],[0,-1,0],.20)[0];
          assert.equal(h?.object.name,'hullRubber',`${label}: exposed source sheet is first actual stock`);checks++;
          close(h.point.y,sourceY,.008,'held-out source sheet station');
        }
        assert.equal(hits([side*1.32,.76,-3.60],[0,0,1],.10).length,0,'obsolete low flap is absent');checks++;
        assert.ok(rootContact(side),`${label}: finite folded root overlaps actual receiving hull`);checks++;
      }
      // The measured receiving plane must remain visible above the sheet.
      // Its old flat y1.10 bottom buried this source-visible air and skin.
      for(const[z,y]of[[-3.4,1.302982],[-3.35,1.331678]]) {
        const h=hits([1.32,1.27,z],[0,1,0],.15)[0];
        assert.equal(h?.object.name,'hullDetail','receiving module, not a fill, is first stock');checks++;
        close(h.point.y,y,.0001,'actual source receiving underside');
      }
      for(const seat of tank.root.userData.mudguardFenderSeats){assert.equal(seat.supported,true,`${label}: ${seat.label}`);checks++;}

      // Sample actual moving stock, including both detailed/simplified shoe
      // meshes. This complements, not replaces, the strict triangle audit.
      if(quality) {
        const shoes=[];tank.root.traverse(o=>{if(o.isInstancedMesh&&['gearTrackPads','gearTrackPadsSimplified'].includes(o.name))shoes.push(o);});
        assert.equal(shoes.length,2);checks++;
        const vertices=new Map(shoes.map(m=>{const p=m.geometry.attributes.position,u=new Map();for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);u.set(v.toArray().join(','),v);}return[m,[...u.values()]];}));
        const rubber=meshes.filter(m=>m.name==='hullRubber');
        const saved=new Map();for(const m of rubber)for(const mat of[].concat(m.material))if(!saved.has(mat)){saved.set(mat,mat.side);mat.side=THREE.DoubleSide;}
        const frame=new THREE.Matrix4(),point=new THREE.Vector3(),back=new THREE.Vector3(0,0,-1),ray=new THREE.Raycaster();
        const layout=structuredClone(gear.roadWheelLayout);let sampled=0,receivingHits=0,minimumAir=Infinity;
        try{
          for(let phase=0;phase<16;phase++){
            const pitch=shoes[0].userData.trackShoePitchM;gear.update(pitch*phase/16,-pitch*phase/16,0);tank.root.updateMatrixWorld(true);
            for(const m of shoes)for(let instance=0;instance<m.count;instance++){
              m.getMatrixAt(instance,frame);frame.premultiply(m.matrixWorld);
              for(const v of vertices.get(m)){
                point.copy(v).applyMatrix4(frame);
                if(Math.abs(point.x)<.993||Math.abs(point.x)>1.565||point.y<.843||point.y>1.362||point.z< -3.56||point.z> -3.0)continue;
                sampled++;ray.set(point,back);ray.near=0;ray.far=1;
                const h=ray.intersectObjects(rubber,false)[0];if(!h)continue;
                assert.ok(h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(back)<0,'moving shoe starts outside closed flap');
                assert.ok(h.distance>1e-5,'positive source-scale shoe/flap air');receivingHits++;minimumAir=Math.min(minimumAir,h.distance);
              }
            }
            assert.deepEqual(gear.roadWheelLayout,layout,'fixed source suspension');checks++;
          }
        }finally{for(const[m,side]of saved)m.side=side;gear.update(0,0,0);tank.root.updateMatrixWorld(true);}
        assert.ok(sampled>1000&&receivingHits>1000,'actual native stock witness cannot be empty');checks++;
        console.log(JSON.stringify({id:'ajax_x',filled,quality,phases:16,sampled,receivingHits,minimumAirM:minimumAir}));
      }
      // Lower only the real flap/fold geometry: its old floating ownership
      // cannot pass because an AABB or generated fill happens to be nearby.
      const rubber=meshes.find(m=>m.name==='hullRubber'),p=rubber.geometry.attributes.position,original=p.array.slice();
      try {
        for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-.12);p.needsUpdate=true;
        rubber.geometry.computeBoundingBox();rubber.geometry.computeBoundingSphere();
        for(const side of[-1,1]){assert.equal(rootContact(side),false,'displaced actual sheet must lose finite root contact');checks++;}
      }finally{p.array.set(original);p.needsUpdate=true;rubber.geometry.computeBoundingBox();rubber.geometry.computeBoundingSphere();}
      for(const side of[-1,1]){assert.ok(rootContact(side),'negative restored');checks++;}
    }finally{tank.dispose();}
  }
}
console.log(JSON.stringify({test:'ajaxRearFlapSeating',checks,status:'pass',builds:6}));
