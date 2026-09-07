import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function first(root,origin,direction) {
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,8)
    .intersectObject(root,true).find(hit=>{
      for(let object=hit.object;object;object=object.parent)if(!object.visible)return false;
      return !/shadow/.test(hit.object.name);
    });
}

function near(hit,axis,expected,tolerance,label) {
  assert.ok(hit&&Math.abs(hit.point[axis]-expected)<=tolerance,
    `${label}: ${hit?.point[axis]} versus independent source ${expected} ± ${tolerance}`);
}

for(const quality of ['high','low']) {
  const tank=createTank('t90m_x',null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    // Held-out visible source rays: none of these targets are computed from
    // runtime bounds or borrowed from the author's primitive coordinates.
    for(const [x,z,y]of [[-.42,-.797,2.319792807],[-.35,-.782,2.319792807],
      [-.631,-1.046,2.319792807],[-.705,-1.066,2.678602099],
      [-.489,-1.252,2.493278146],[-.42,-.978,2.700091481]]) {
      near(first(tank.root,[x,4,z],[0,-1,0]),'y',y,.004,
        `${quality}: stepped RWS housing ${x}/${z}`);
    }
    for(const [x,y,z]of [[-.45,2.46,-.875182256],[-.4,2.59,-.887912340],
      [-.5,2.69,-.878556147],[-.4,2.695,-.810419038]]) {
      near(first(tank.root,[x,y,0],[0,0,-1]),'z',z,.004,
        `${quality}: recessed front and two shallow overhangs ${x}/${y}`);
    }
    const face=first(tank.root,[-.45,2.46,0],[0,0,-1]);
    const normal=face.face.normal.clone().transformDirection(face.object.matrixWorld);
    assert.ok(normal.dot(new THREE.Vector3(0,.106970176,.994262230))>.999,
      `${quality}: actual inclined source support face, not a vertical proxy`);
    for(const [x,y,z]of [[-.42,2.45,-.80],[-.35,2.50,-.78]]) {
      assert.equal(first(tank.root,[x,y,z],[0,0,1]),undefined,
        `${quality}: genuine forward air above the low collar stays open`);
    }
  } finally { tank.dispose(); }
}
console.log('t90MXRwsHousing: stepped collar, inclined recessed face, curved guard and forward air pass high/low');
