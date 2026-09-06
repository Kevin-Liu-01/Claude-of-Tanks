import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function visibleHullHit(root,x,z) {
  return new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0),0,2)
    .intersectObject(root,true).find(hit=>{
      for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
      return !/shadow|gear|track|wheel/i.test(hit.object.name);
    });
}

function near(hit,expected,tolerance,label) {
  assert.ok(hit&&Math.abs(hit.point.y-expected)<=tolerance,
    `${label}: ${hit?.point.y} versus independent source ${expected} ± ${tolerance}`);
}

for(const quality of ['high','low']) {
  const tank=createTank('t90m_x',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('rig_hull');
    // Fixed local-source ray values, not targets computed from the builder.
    for(const [x,z,y]of [[-.9,-3.3,1.23018346],[-.9,-3.2,1.29332008],[-.9,-3.1,1.33937076],
      [1.02,-3.3,1.22796137],[1.07,-3.1,1.31388156],[.6,-3.1,1.33937100]]) {
      near(visibleHullHit(hull,x,z),y,.005,`${quality}: two-slope rear cover ${x}/${z}`);
    }
    const slope=visibleHullHit(hull,-.9,-3.2);
    assert.ok(slope.face.normal.y>.8&&slope.face.normal.z<-.3,
      `${quality}: real inclined rear cover, not a level bounding box`);
    for(const [x,z,y]of [[.6,-2.970,1.34435092],[.6,-2.96,1.31833352],
      [.6,-2.9,1.30445562],[.6,-2.7,1.29619393],[0,-2.9,1.37989127],[0,-2.7,1.37260195]]) {
      near(visibleHullHit(hull,x,z),y,.003,`${quality}: recessed vanes and center spine ${x}/${z}`);
    }
    const trough=visibleHullHit(hull,.6,-2.9),peak=visibleHullHit(hull,.6,-2.970);
    assert.ok(peak.point.y-trough.point.y>.035,`${quality}: louvre trough remains exposed below the vane crest`);
    const frame=visibleHullHit(hull,.0305,-2.90);
    assert.ok(frame.point.y-trough.point.y>.08,`${quality}: narrow raised frame cannot close the grille field`);
    for(const [x,z,y]of [[-.139174,-3.40,1.38434497],[.592023,-3.40,1.38191405],
      [-.139174,-3.30,1.35915589],[.592023,-3.30,1.35813899],
      [.2299,-3.3,1.32550061],[.6,-3.2,1.33200943],[0,-3.2,1.33200943]]) {
      near(visibleHullHit(hull,x,z),y,.004,`${quality}: separate inclined access covers ${x}/${z}`);
    }
    for(const side of [-1,1]) {
      for(const [z,y]of [[-1.28,1.33308],[1.51,1.31824],[1.95,1.31029],[2.15,1.29363],[2.55,1.26030]]) {
        near(visibleHullHit(hull,side*1.38,z),y,.003,`${quality}: source-seated fender panel ${side}/${z}`);
      }
      const air=visibleHullHit(hull,side*1.80,-3.3);
      assert.ok(!air,`${quality}: aft cage standoff remains empty`);
    }
    const hoodGap=new THREE.Raycaster(new THREE.Vector3(.592023,1.31,-3.30),new THREE.Vector3(0,0,1),0,.13)
      .intersectObject(hull,true).filter(h=>!/shadow|gear|track|wheel/i.test(h.object.name));
    assert.ok(hoodGap.length>0&&hoodGap[0].distance>.07,
      `${quality}: real air below inclined access lid, with attached forward tray wall`);
  } finally { tank.dispose(); }
}
console.log('t90MXEngineDeck: two-slope cover, recessed vanes, separate lids and seated fender panels pass high/low');
