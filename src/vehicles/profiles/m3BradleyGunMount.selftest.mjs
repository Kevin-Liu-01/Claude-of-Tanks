import assert from 'node:assert/strict';
import {Matrix4, Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3} from 'three';
import {createTank} from '../tankFactory.ts';
import {buildM3BradleyGunMount} from './m3BradleyGunMount.ts';
import {KIT} from './kit.ts';
import {near} from '../../../tools/receipt-kit.test-support.mjs';

const material=new MeshBasicMaterial({side:DoubleSide});
const ray=new Raycaster();
function sectionRadius(mesh,frame,z){
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
  const v=[new Vector3(),new Vector3(),new Vector3()];
  let minimum=Infinity,maximum=0;
  for(let i=0;i<(index?.count??p.count);i+=3){
    for(let k=0;k<3;k++)v[k].fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(frame);
    const points=[];
    for(let k=0;k<3;k++){
      const a=v[k],b=v[(k+1)%3];
      if(Math.abs(a.z-z)<1e-8)points.push(a.clone());
      if((a.z-z)*(b.z-z)<0)points.push(a.clone().lerp(b,(z-a.z)/(b.z-a.z)));
    }
    for(const point of points){
      const r=Math.hypot(point.x,point.y);minimum=Math.min(minimum,r);maximum=Math.max(maximum,r);
    }
    // The nearest point can be in the middle of a sliced triangle, so do not
    // mistake clear original vertices for a clear passage.
    for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){
      const from=points[a],dx=points[b].x-from.x,dy=points[b].y-from.y;
      const length2=dx*dx+dy*dy;if(length2<1e-16)continue;
      const t=Math.max(0,Math.min(1,-(from.x*dx+from.y*dy)/length2));
      minimum=Math.min(minimum,Math.hypot(from.x+t*dx,from.y+t*dy));
    }
  }
  return {minimum,maximum};
}
for(const quality of ['high','low']){
  // Inspect the finite casting itself, independently of the surrounding
  // turret. Both openings must survive triangulation at both detail levels.
  const pieces=[];
  const add=(geometry,...transform)=>pieces.push(new Mesh(KIT.xform(geometry,...transform),material));
  buildM3BradleyGunMount({q:quality==='high',addGunExtra:add,addGunExtraDark:add});
  for(const piece of pieces)piece.updateMatrixWorld(true);
  const mask=pieces[0];
  for(const[x,y]of[[0,0],[.19,.06]]){
    ray.set(new Vector3(x,y,.8),new Vector3(0,0,-1));ray.far=.7;
    assert.equal(ray.intersectObject(mask).length,0,`${quality}: actual gun/coax channel stays open`);
  }
  const front=(x,y)=>{
    ray.set(new Vector3(x,y,.8),new Vector3(0,0,-1));ray.far=.7;
    const hit=ray.intersectObject(mask)[0];assert.ok(hit);return hit.point.z;
  };
  assert.ok(front(-.18,-.11)>front(-.18,.11)+.025,`${quality}: finite raked face`);
  assert.ok(front(-.20,.08)>front(-.27,.08)+.015,`${quality}: shoulders sweep back into the cheeks`);
  ray.set(new Vector3(-.27,.17,.8),new Vector3(0,0,-1));ray.far=.7;
  assert.equal(ray.intersectObject(mask).length,0,`${quality}: clipped upper corner removes the old box silhouette`);
  for(const piece of pieces)piece.geometry.dispose();

  const tank=createTank('m3a3_bradley',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,decor:false,camoSeed:4242});
  try{
    const root=tank.root,gun=root.getObjectByName('rig_gun'),mount=root.getObjectByName('gunMount');
    const recoil=root.getObjectByName('rig_recoil'),tube=root.getObjectByName('gun');
    assert.equal(mount.parent,gun,'casting pitches without recoiling');
    near(gun.position.x,-.06,1e-7,'preserved horizontal trunnion');
    near(gun.position.y,.492,1e-7,'preserved repaired gun height');
    near(gun.position.z,.78,1e-7,'preserved repaired gun setback');
    const p=tube.geometry.attributes.position,index=tube.geometry.index;
    const vertices=[new Vector3(),new Vector3(),new Vector3()],crossing=new Vector3();
    const supports=[mount,root.getObjectByName('gunMountDark')];
    const oldAxle=new Mesh(KIT.cylX(.095,.72,24),material);
    const oldReceiver=new Mesh(KIT.cylX(.14,.56,24).translate(0,0,.04),material);
    let minimum=Infinity,passageMinimum=Infinity,oldAxleMinimum=Infinity,oldReceiverMinimum=Infinity;
    // Project actual barrel triangles onto sleeve stations throughout recoil.
    // Interpolated edge crossings catch long tapered faces whose vertices lie
    // outside a narrow collar station, which a vertex-only test would miss.
    for(const shift of [0,.015,.03,.045,.06]){
      recoil.position.z=-shift;root.updateMatrixWorld(true);
      const frame=new Matrix4().copy(gun.matrixWorld).invert().multiply(tube.matrixWorld);
      const inverseGun=new Matrix4().copy(gun.matrixWorld).invert();
      for(const z of [-.12,-.095,-.06,0,.04,.09,.12,.14,.16,.175]){
        const barrel=sectionRadius(tube,frame,z).maximum;if(!barrel)continue;
        for(const support of supports){
          const toGun=new Matrix4().copy(inverseGun).multiply(support.matrixWorld);
          const inner=sectionRadius(support,toGun,z).minimum;
          passageMinimum=Math.min(passageMinimum,inner-barrel);
          assert.ok(inner-barrel>.01,`${quality}: side journal/receiver leaves actual axial passage at ${z}, recoil ${shift}: ${inner-barrel}`);
        }
        oldAxleMinimum=Math.min(oldAxleMinimum,sectionRadius(oldAxle,new Matrix4(),z).minimum-barrel);
        oldReceiverMinimum=Math.min(oldReceiverMinimum,sectionRadius(oldReceiver,new Matrix4(),z).minimum-barrel);
      }
      for(const z of [.16,.25,.37,.43,.48,.49,.52,.56,.60,.65,.72,.77]){
        const inner=z<=.49?.123:z>=.61?.072:.123+(.072-.123)*(z-.49)/.12;
        let radius=0;
        for(let i=0;i<(index?.count??p.count);i+=3){
          for(let k=0;k<3;k++)vertices[k].fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(frame);
          for(let k=0;k<3;k++){
            const a=vertices[k],b=vertices[(k+1)%3];
            if((a.z-z)*(b.z-z)<=0&&Math.abs(a.z-b.z)>1e-10){
              crossing.copy(a).lerp(b,(z-a.z)/(b.z-a.z));
              radius=Math.max(radius,Math.hypot(crossing.x,crossing.y));
            }
          }
        }
        minimum=Math.min(minimum,inner-radius);
        assert.ok(inner-radius>.004,`${quality}: actual recoiling barrel clears sleeve at ${z}, recoil ${shift}: ${inner-radius}`);
      }
    }
    assert.ok(oldAxleMinimum<-.008,'the original cross-shaft obstructs the recoiling root');
    assert.ok(oldReceiverMinimum<-.05,'the original solid receiver obstructs the recoiling root');
    oldAxle.geometry.dispose();oldReceiver.geometry.dispose();
    console.log(`M3 ${quality}: rounded mask, real apertures and repaired pivot pass; sleeve clearance ${(minimum*1000).toFixed(2)} mm, journal/receiver passage ${(passageMinimum*1000).toFixed(2)} mm.`);
  }finally{tank.dispose();}
}
material.dispose();
