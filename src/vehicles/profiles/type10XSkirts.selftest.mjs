import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,
  `${label}: ${a} vs ${b} ±${t}`);
const hit=(root,p,d,far=20)=>new THREE.Raycaster(p,d,0,far).intersectObject(root,true)[0];

function sheetFaces(root,quality) {
  // Held-out complete-canonical-source lateral rays, not authoring vertices.
  // Left counterparts differ by <6 µm; 6 mm admits only the documented fine
  // dents omitted by the independently fitted smooth bend primitives.
  for(const side of [-1,1])for(const [y,z,x,back]of[
    [.6,1.5,1.5702528,1.5638592],[.5,-.8,1.5744032,1.5680445],
    [.5,.45,1.5997254,1.5933475],[.5,2.23,1.6278426,1.6201836],
    [.6,-2.1,1.5754563,1.5691177],[.6,2.6,1.5820269,1.5741018],
    [.4,-.23,1.6509249,1.6435817],[.5,-2.46,1.6373460,1.6291193],
  ]) {
    const outer=hit(root,v(side*2,y,z),v(-side,0,0));
    near(side*outer?.point.x,x,.006,`${quality}: source folded sheet ${side}/${y}/${z}`);
    assert.equal(outer.object.name,'hullDetail',`${quality}: actual wired physical sheet`);
    const inner=hit(root,v(side*1.55,y,z),v(side,0,0));
    near(side*inner?.point.x,back,.006,`${quality}: independent source inner skin`);
    // Source lateral thickness is 6.34–8.23 mm here, because the fold changes
    // the ray/surface angle. Test actual thin positive volume, not an invented
    // exact normal-thickness assertion on two non-coplanar triangulations.
    const thickness=side*(outer.point.x-inner?.point.x);
    assert.ok(thickness>.0055&&thickness<.0085,
      `${quality}: actual closed thin skin rather than filled panel bbox: ${thickness}`);
  }
}

function airAndSupport(tank,quality) {
  const root=tank.root,detail=root.getObjectByName('hullDetail');
  for(const side of [-1,1]) {
    for(const z of [-2.82,-1.10,.40,1.95,3.37])
      assert.ok(!hit(root,v(side*1.66,1.8,z),v(0,-1,0),.80),
        `${quality}: complete source air instead of former unsupported roof lug ${side}/${z}`);
    assert.ok(!hit(root,v(side*1.65,.6,1.30),v(0,0,1),.65),
      `${quality}: real clear longitudinal air outside central skirt sheet`);
    const sheet=hit(detail,v(side*1.571,1.0,1.5),v(0,-1,0));
    assert.ok(sheet?.point.y>.797&&sheet.point.y<.801,
      `${quality}: source sheet crown physically enters retained fascia bottom .7593`);
    const upperOutside=hit(detail,v(side*2,1.0,1.5),v(-side,0,0));
    const upperInside=hit(detail,v(side*1.5,1.0,1.5),v(side,0,0));
    assert.ok(side*upperOutside?.point.x>1.571&&side*upperInside?.point.x<1.571,
      `${quality}: crown witness is genuinely inside positive fascia volume`);
    // Canonical Object_3:8950 has a real narrow horizontal U, including air.
    near(hit(root,v(side*2,.8535,1.15052),v(-side,0,0))?.point.x,
      side*1.619195,.0003,`${quality}: source strap outer return`);
    assert.ok(!hit(root,v(side*1.5905,.86,1.15052),v(0,-1,0),.020),
      `${quality}: actual strap centre is air, not a filled support block`);
    near(hit(root,v(side*1.5905,.88,1.11052),v(0,-1,0))?.point.y,
      .858815,.0001,`${quality}: narrow strap arm physically borders that air`);
  }
  const box=new THREE.Box3().setFromObject(root);
  near(box.max.x,1.694648685,.00001,`${quality}: source true bent-tip maximum retained`);
  near(box.min.x,-1.694648685,.00001,`${quality}: source opposite bent-tip maximum retained`);
  const gear=root.getObjectByName('rig_hull').userData.runningGearReceipts;
  assert.equal(gear.length,1);assert.equal(gear[0].trackW,.486738);
  assert.deepEqual(gear[0].wheelZs,[-1.94594,-.88563,.17466,1.23495,2.29524]);
}

for(const quality of ['high','low']) {
  const tank=createTank('type10_x',null,{quality,geometryReceipt:true,batchStatic:false,proceduralOnly:true});
  try {tank.root.updateMatrixWorld(true);sheetFaces(tank.root,quality);airAndSupport(tank,quality);}
  finally {tank.dispose();}
}
console.log('Type10 X skirts: actual high/low thin folded faces, true extrema, source air, U straps and fascia engagement PASS');
