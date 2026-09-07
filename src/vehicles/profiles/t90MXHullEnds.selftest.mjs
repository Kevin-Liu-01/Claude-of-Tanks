import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const near=(actual,expected,tolerance,label)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
  `${label}: ${actual} versus independent source ${expected} ± ${tolerance}`);
function cast(root,origin,direction) {
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,8)
    .intersectObject(root,true).filter(hit=>{
      for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
      return !/shadow|gear|track|wheel/i.test(hit.object.name);
    });
}

for(const quality of ['high','low']) {
  const tank=createTank('t90m_x',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('rig_hull'),armor=tank.root.getObjectByName('hull');
    for(const side of [-1,1]) {
      for(const x of [1.2,1.4,1.7])for(const [z,y]of [[3.3,1.16676],[3.5,1.06806],[3.6,.99541],[3.7,.90524]]) {
        near(cast(hull,[side*x,2,z],[0,-1,0])[0]?.point.y,y,.010,
          `${quality}: fender crown bends down without old constant-height forward shelf`);
      }
      const well=cast(armor,[side*1.43,.90,3.3],[0,1,0])[0];
      near(well?.point.y,1.145,.003,`${quality}: actual open space above idler, not a solid mudguard block`);
      const lip=cast(armor,[side*1.4,.85,3.55],[0,0,1])[0];
      assert.ok(lip?.point.z>3.70,`${quality}: curved forward lip leaves the wheel well open`);
      near(cast(armor,[side*1.4,0,-3.3],[0,1,0])[0]?.point.y,.813344,.003,
        `${quality}: source deep rear housing has its real lower edge`);
      assert.equal(cast(armor,[side*1.8,2,-3.3],[0,-1,0]).length,0,
        `${quality}: rear housing does not invent a full-width upper shelf`);
      near(cast(hull,[side*1.8,2,-2.0],[0,-1,0])[0]?.point.y,1.14445,.003,
        `${quality}: source cage standoff remains open down to the lower skirt rail`);
      near(cast(hull,[side*.27734,0,-3.1],[0,1,0])[0]?.point.y,.544441,.002,
        `${quality}: measured inclined drum support attaches at lower transom`);
      near(cast(hull,[side*.8817,0,-3.2],[0,1,0])[0]?.point.y,.483373,.003,
        `${quality}: measured lower recovery bracket`);
      const drumX=side*.56963+.00198;
      near(cast(hull,[drumX,1.479,-4.5],[0,0,1])[0]?.point.z,-4.097161,.002,
        `${quality}: independent rear drum radius and position`);
    }
    const dark=tank.root.getObjectByName('hullDark');
    const obsolete=cast(dark,[.29,1.57,-3.19],[0,0,-1])[0];
    assert.ok(!obsolete||obsolete.point.z< -3.40,`${quality}: obsolete floating forward hose is gone`);
    const pipe=cast(dark,[.004,2,-3.433],[0,-1,0])[0];
    assert.ok(pipe?.point.y>1.56&&pipe.point.y<1.63,`${quality}: physical U-pipe joins both drum lines`);
  } finally { tank.dispose(); }
}
console.log('t90MXHullEnds: source fender crowns, open idler wells, closed rear housings and connected drum fixtures pass high/low');
