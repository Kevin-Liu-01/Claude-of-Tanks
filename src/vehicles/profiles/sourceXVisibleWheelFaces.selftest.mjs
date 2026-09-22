import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
// Source axle/radius witnesses are independent of the runtime receipt.
// 2026-09-22 (owner: "russia uses the t-90, t-90m, t14 armata, and bmp 3m dragun wheels"): every Soviet-pattern
// MBT hull below draws the T-90 nation construction (the T-90M X source-pressed face over the fleet pressed disc,
// nationWheelSets.ts) fitted into its own wheel envelope; only the donor t90sm_x keeps its own fitted annular
// opening. The axles, radii and painted-face read stay this receipt's contract for both kinds.
const CASES = {
  t90sm_x: {radius:.3981, opening:.342366, width:.40954, zScale:1.05575,
    // 2026-09-17 ground datum re-seats the T-90 X road wheels (pre-datum ys in git history)
    ys:[.48649001121520996,.46959999203681946,.46959999203681946,.46959999203681946,.46959999203681946,.5290799736976624],
    xLeft:1.423315, xRight:1.4199, faceName:'gearRoadWheelSourcePressedFaces',
    zs:[-1.93988,-.98038,-.02818,.87757,1.77558,2.70061]},
  t72b_1987_x: {radius:.360825, standard:'t90m', y:.43082499504089355,
    xLeft:1.375065, xRight:1.359965,
    zs:[-1.835365,-1.024875,-.17634,.599355,1.400955,2.228465]},
  t72b3_x: {radius:.3568, standard:'t90m', y:.423799991607666,
    xLeft:1.4518, xRight:1.4464,
    zs:[-1.70205,-.91970,-.12865,.67990,1.47690,2.28460]},
  t72bu_x: {radius:.380115, standard:'t90', y:.4471150040626526,
    xLeft:1.424, xRight:1.424,
    zs:[-1.58720,-.72760,.14085,1.00566,1.85831,2.72517]},
  // 2026-09-17 ground datum: the shared T-90 / Burlak source axle re-seats (.44845 → .46205)
  t90a_burlak_x: {radius:.39405, standard:'t90m', y:0.4620499908924103,
    xLeft:1.4426, xRight:1.4426,
    zs:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996]},
  t90_x: {radius:.39405, standard:'t90m', y:0.4620499908924103,
    xLeft:1.4426, xRight:1.4426,
    zs:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996]},
  t90ms_x: {radius:.3884, standard:'t90m', y:.4564000070095062,
    xLeft:1.437, xRight:1.437,
    zsLeft:[-1.81590002775,-.97714999318,-.12659997866,.72445000755,1.57635003328,2.42254996300],
    zsRight:[-1.74285000563,-.90240001678,-.05049999041,.80055001006,1.65250003338,2.49795007706]},
  t62mv1_x: {radius:.391615, standard:'t90', y:.4616149961948395,
    xLeft:1.199465, xRight:1.199465,
    zs:[-1.858795,-.805165,.24309,1.14781,2.00987]},
};
const near = (a,b,label) => assert.ok(Number.isFinite(a) && Math.abs(a-b)<1e-6,
  `${label}: ${a}, expected ${b}`);

function closedTire(geometry, fixture, quality) {
  const p=geometry.attributes.position, index=geometry.index;
  const count=index?.count ?? p.count;
  const radii=Array.from({length:p.count},(_,i)=>Math.hypot(p.getY(i),p.getZ(i)/(fixture.zScale??1)));
  if(fixture.opening!==undefined) {
    assert.equal(count/3,8*(quality==='high'?26:12),
      'four closed ring walls cost no more triangles than the two former capped cylinders');
    near(Math.min(...radii),fixture.opening,'actual inner rubber radius');
    geometry.computeBoundingBox();
    near(geometry.boundingBox.max.x-geometry.boundingBox.min.x,fixture.width,'source tire span');
  }
  near(Math.max(...radii),fixture.radius,'source rolling radius');
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
  const edges=new Map();
  for(let i=0;i<count;i+=3) {
    const points=[0,1,2].map(j=>key(index?index.getX(i+j):i+j));
    for(let j=0;j<3;j++) {
      const edge=[points[j],points[(j+1)%3]].sort().join('|');
      edges.set(edge,(edges.get(edge)??0)+1);
    }
  }
  assert.ok([...edges.values()].every(count=>count===2),'no uncapped tire ends or open inner wall');
}

function check(id,fixture,quality) {
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('rig_hull');
    const patternReceipt=hull.userData.wheelPatternReceipts[0];
    if(fixture.standard) {
      assert.equal(patternReceipt.construction,'nation:t90-pressed-source-face',`${id}: draws the Russia nation wheel construction`);
      assert.equal(patternReceipt.nationStandard?.donor,fixture.standard,`${id}: nation donor`);
    } else {
      assert.equal(patternReceipt.nationDonor,'t90m',`${id}: the T-90M X family defines the Russia wheel`);
      assert.equal(patternReceipt.openAnnulus,true,`${id}: the donor keeps its fitted annular opening`);
    }
    const tires=tank.root.getObjectByName('gearRoadWheelTires');
    const discs=tank.root.getObjectByName('gearRoadWheelDiscs');
    const detailFace=tank.root.getObjectByName('gearRoadWheelSourcePressedFaces');
    assert.ok(detailFace,'the source pressed face is present');
    // 2026-09-22: the rim ring is the same painted steel (wheelDish role, dish paint). On consumer radii below the
    // donor's .3981 m its .010 m tube sits at .82 R, and LOW's 16-segment ring chords reach inside it, so a ray
    // landing on the rim is painted steel first — not rubber, dark hardware or air.
    const rims=tank.root.getObjectByName('gearRoadWheelSourceRims');
    assert.equal(rims?.userData.appearanceRole,'wheelDish','the rim ring is painted steel');
    const visibleFaces=[discs,detailFace,rims];
    assert.equal(tires.count,(fixture.zs??fixture.zsLeft).length*2,'source axle count');
    assert.equal(discs.count,tires.count,'painted cores belong to the complete wheel assembly');
    assert.equal(tires.userData.appearanceRole,'wheelTire');
    assert.equal(discs.userData.appearanceRole,'wheelDish');
    closedTire(tires.geometry,fixture,quality);
    const visible=[];
    tank.root.traverseVisible(object=>{
      if(object.isMesh && !object.userData.shadowOnly && !object.userData.authoredShadowProxy)
        visible.push(object);
    });
    const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),direction=new THREE.Vector3();
    let witnesses=0;
    for(let i=0;i<tires.count;i++) {
      tires.getMatrixAt(i,matrix);matrix.premultiply(tires.matrixWorld);
      point.setFromMatrixPosition(matrix);
      const side=Math.sign(point.x);
      near(Math.abs(point.x),side<0?fixture.xLeft:fixture.xRight,'unchanged lateral axle');
      const zs=fixture.zs??(side<0?fixture.zsLeft:fixture.zsRight);
      const station=zs.findIndex(z=>Math.abs(z-point.z)<1e-6);
      assert.ok(station>=0,'unchanged longitudinal axle');
      near(point.y,fixture.ys?.[station]??fixture.y,'unchanged axle height');
      direction.set(-side,0,0).transformDirection(tires.matrixWorld);
      // Lower exposed steel, clear of hubs and skirts, inside LOW's polygonal
      // aperture. Cast against the complete visible scene: hidden paint fails.
      for(const fraction of [.74,.78,.82]) for(const angle of [.35,1.10,2.10,2.90]) {
        const r=fixture.radius*fraction;
        point.set(side*.85,-Math.sin(angle)*r,Math.cos(angle)*r*(fixture.zScale??1)).applyMatrix4(matrix);
        const hit=new THREE.Raycaster(point,direction,0,1.2).intersectObjects(visible,false)[0];
        assert.ok(visibleFaces.includes(hit?.object),
          `${id}/${quality}/wheel ${i} at ${fraction}/${angle}: painted steel must be first, not ${hit?.object.name??'air'}`);
        witnesses++;
      }
    }
    console.log(`${id}/${quality}: ${witnesses} first-visible painted-face rays, closed tires and fixed source axles`);
  } finally {tank.dispose();}
}
for(const [id,fixture] of Object.entries(CASES)) for(const quality of ['high','low']) check(id,fixture,quality);
