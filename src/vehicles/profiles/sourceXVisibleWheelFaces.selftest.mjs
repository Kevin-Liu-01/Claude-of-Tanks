import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

// Source axle/radius witnesses are independent of the runtime receipt. The
// opening is an intentional fitted-style repair, not a new source measurement.
const CASES = {
  t72b3m_x: {radius:.391766, opening:.33692, width:.45254, y:.4728865,
    xLeft:1.4713, xRight:1.4713,
    zs:[-1.822412,-.953673,-.089323,.858392,1.722743,2.591482]},
  t90sm_x: {radius:.3981, opening:.342366, width:.40954, zScale:1.05575,
    ys:[.47202,.45513,.45513,.45513,.45513,.51461],
    xLeft:1.423315, xRight:1.4199, faceName:'gearRoadWheelSourcePressedFaces',
    zs:[-1.93988,-.98038,-.02818,.87757,1.77558,2.70061]},
  t72b_1987_x: {radius:.360825, opening:.3103, width:.369, y:.429605,
    xLeft:1.375065, xRight:1.359965,
    zs:[-1.835365,-1.024875,-.17634,.599355,1.400955,2.228465]},
  t72b3_x: {radius:.3568, opening:.30685, width:.453, y:.395,
    xLeft:1.4518, xRight:1.4464,
    zs:[-1.70205,-.91970,-.12865,.67990,1.47690,2.28460]},
  t72bu_x: {radius:.380115, opening:.32690, width:.38270, y:.451075,
    xLeft:1.424, xRight:1.424,
    zs:[-1.58720,-.72760,.14085,1.00566,1.85831,2.72517]},
  t90a_burlak_x: {radius:.39405, opening:.33888, width:.4106, y:.44845,
    xLeft:1.4426, xRight:1.4426,
    zs:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996]},
  t90_x: {radius:.39405, opening:.33888, width:.4106, y:.44845,
    xLeft:1.4426, xRight:1.4426,
    zs:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996]},
  t90ms_x: {radius:.3884, opening:.33402, width:.4206, y:.4485,
    xLeft:1.437, xRight:1.437,
    zsLeft:[-1.81590002775,-.97714999318,-.12659997866,.72445000755,1.57635003328,2.42254996300],
    zsRight:[-1.74285000563,-.90240001678,-.05049999041,.80055001006,1.65250003338,2.49795007706]},
  t62mv1_x: {radius:.391615, opening:.33679, width:.440, y:.459085,
    xLeft:1.199465, xRight:1.199465,
    zs:[-1.858795,-.805165,.24309,1.14781,2.00987]},
};
const near = (a,b,label) => assert.ok(Number.isFinite(a) && Math.abs(a-b)<1e-6,
  `${label}: ${a}, expected ${b}`);

function closedRing(geometry, fixture, quality) {
  const p=geometry.attributes.position, index=geometry.index;
  const count=index?.count ?? p.count;
  assert.equal(count/3,8*(quality==='high'?26:12),
    'four closed ring walls cost no more triangles than the two former capped cylinders');
  const radii=Array.from({length:p.count},(_,i)=>Math.hypot(p.getY(i),p.getZ(i)/(fixture.zScale??1)));
  near(Math.min(...radii),fixture.opening,'actual inner rubber radius');
  near(Math.max(...radii),fixture.radius,'source rolling radius');
  geometry.computeBoundingBox();
  near(geometry.boundingBox.max.x-geometry.boundingBox.min.x,fixture.width,'source tire span');
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
    const tires=tank.root.getObjectByName('gearRoadWheelTires');
    const discs=tank.root.getObjectByName('gearRoadWheelDiscs');
    const detailFace=fixture.faceName?tank.root.getObjectByName(fixture.faceName):null;
    if(fixture.faceName)assert.ok(detailFace,'the source pressed face remains present');
    const visibleFaces=detailFace?[discs,detailFace]:[discs];
    assert.equal(tires.count,(fixture.zs??fixture.zsLeft).length*2,'source axle count');
    assert.equal(discs.count,tires.count,'painted cores belong to the complete wheel assembly');
    assert.equal(tires.userData.appearanceRole,'wheelTire');
    assert.equal(discs.userData.appearanceRole,'wheelDish');
    closedRing(tires.geometry,fixture,quality);
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
    console.log(`${id}/${quality}: ${witnesses} first-visible painted-face rays, closed neutral tires and fixed source axles`);
  } finally {tank.dispose();}
}
for(const [id,fixture] of Object.entries(CASES)) for(const quality of ['high','low']) check(id,fixture,quality);
