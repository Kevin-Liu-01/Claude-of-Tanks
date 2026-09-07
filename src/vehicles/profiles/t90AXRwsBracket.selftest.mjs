import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function hits(root,origin,direction,far=4) {
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,far)
    .intersectObject(root,true).filter(hit=>{
      for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
      return !/shadow/i.test(hit.object.name);
    });
}

function near(hit,axis,expected,tolerance,label) {
  assert.ok(hit&&Math.abs(hit.point[axis]-expected)<=tolerance,
    `${label}: ${hit?.point[axis]} versus independent source ${expected} ± ${tolerance}`);
}

for(const quality of ['high','low']) {
  const tank=createTank('t90a_x',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    tank.root.updateMatrixWorld(true);
    const turret=tank.root.getObjectByName('rig_turret');
    // Held source rays identify the missing adjusting boss, including the
    // short flat crest and real front bevel, independently of silhouette bins.
    for(const [x,z,y] of [[.42,.10,2.7216934],[.42,.15,2.7162117],[.42,.18,2.6674708],
      [.74,-.15,2.4146189],[.74,-.075,2.5107314],[.74,0,2.6068438],
      [.49,-.05,2.4394038]]) {
      near(hits(turret,[x,4,z],[0,-1,0])[0],'y',y,.003,
        `${quality}: measured gun support ${x}/${z}`);
    }
    const bevel=hits(turret,[.42,4,.15],[0,-1,0])[0];
    assert.ok(bevel.face.normal.y>.51&&bevel.face.normal.y<.54&&bevel.face.normal.z>.84,
      `${quality}: inclined boss face must not be a bounding box`);
    near(hits(turret,[.39,2.67,.10],[1,0,0],.15)[0],'x',.4153873,.001,
      `${quality}: inboard adjustment boss attaches to pivot`);
    assert.equal(hits(turret,[.50,2.60,-.15],[1,0,0],.28).length,0,
      `${quality}: former full-box fork cheeks must leave real air above their rear ends`);
    near(hits(turret,[.50,2.49,0],[1,0,0],.08)[0],'x',.5221355,.001,
      `${quality}: inclined left arm stays under the receiver`);
    near(hits(turret,[.45,2.30,0],[1,0,0],.08)[0],'x',.4734766,.001,
      `${quality}: mount leg reaches the existing cupola platform`);
  } finally { tank.dispose(); }
}
console.log('t90AXRwsBracket: measured pivot boss, inclined fork arms and genuine cradle air pass high/low');
