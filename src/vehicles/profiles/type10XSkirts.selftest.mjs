import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {type10SkirtStations,type10SkirtSection} from './type10XSkirts.ts';
import {sectionSolid} from './sectionSolid.ts';
import {historicalType10Skirt} from '../type10SkirtHistory.test-support.mjs';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,
  `${label}: ${a} vs ${b} ±${t}`);
const hit=(root,p,d,far=20)=>new THREE.Raycaster(p,d,0,far).intersectObject(root,true)[0];

function closedPrimitive(geometry) {
  const p=geometry.attributes.position,edges=new Map();
  const a=v(0,0,0),b=v(0,0,0),c=v(0,0,0);
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
  for(let i=0;i<p.count;i+=3) {
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-20,'no degenerate triangles');
    for(let j=0;j<3;j++) {
      const from=key(i+j),to=key(i+(j+1)%3),edge=[from,to].sort().join('|');
      const row=edges.get(edge)??{count:0,winding:0};
      row.count++;row.winding+=from<to?1:-1;edges.set(edge,row);
    }
  }
  for(const row of edges.values())assert.deepEqual(row,{count:2,winding:0},'closed opposed shared edges');
}

function primitiveEfficiency() {
  let oldTriangles=0,newTriangles=0;
  for(const side of[-1,1])for(let panel=0;panel<5;panel++) {
    const stations=type10SkirtStations(panel);
    assert.ok(stations.length<=20&&stations.every((z,i)=>Number.isFinite(z)&&(!i||z>stations[i-1])));
    const geometry=sectionSolid(stations.map(z=>type10SkirtSection(panel,side,z)));
    try {
      closedPrimitive(geometry);newTriangles+=geometry.attributes.position.count/3;
      geometry.userData.fixedPaintedPanel='type10-painted-folded-skirt';
      const old=historicalType10Skirt(geometry.clone(),(side<0?0:5)+panel);
      try {oldTriangles+=old.attributes.position.count/3;}finally{old.dispose();}
      assert.throws(()=>historicalType10Skirt(geometry,-1),'inverse cannot select unrelated geometry');
    }finally{geometry.dispose();}
  }
  assert.equal(oldTriangles,9760,'published ten-panel station recipe');
  assert.equal(newTriangles,3120,'actual new closed stock budget, including caps and inner faces');
  console.log(JSON.stringify({type10SkirtTriangles:{before:oldTriangles,after:newTriangles,saved:oldTriangles-newTriangles}}));
}

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
    assert.equal(outer.object.name,'hullPaintedDetail',`${quality}: actual wired painted physical sheet`);
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
  const root=tank.root,detail=root.getObjectByName('hullPaintedDetail');
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

function rollerSupports(tank,quality) {
  const rig=tank.root.getObjectByName('rig_hull');
  const stock=[];rig.traverse(o=>{if(o.name==='gearReturnRollerSpindles')stock.push(o);});
  assert.equal(stock.length,2,'one instanced support mesh per side');
  assert.ok(stock.every(o=>o.isInstancedMesh&&o.count===3),'all six real roller stations have supports');
  const hull=rig.getObjectByName('hull'),rotor=rig.getObjectByName('gearReturnRollerRotors');
  assert.ok(rotor?.isInstancedMesh,'fitted rubber/painted rotor stock exists');
  assert.equal(rotor.count,6);
  const cast=(objects,x,y,z,side)=>new THREE.Raycaster(
    rig.localToWorld(v(x,y,z)),v(side,0,0).transformDirection(rig.matrixWorld),0,.7)
    .intersectObjects(objects,false)[0];
  const localX=h=>rig.worldToLocal(h.point.clone()).x;
  for(const yaw of[0,.73,-1.21]) {
    tank.root.rotation.y=yaw;tank.root.updateMatrixWorld(true);
    for(const side of[-1,1])for(const z of[-1.78,.20,2.06]) {
      const foot=cast(stock,side*.85,1.10,z,side);
      const wall=cast([hull],side*1.0,1.10,z,-side);
      const tip=cast(stock,side*1.3,1.10,z,-side);
      // The new fitted hub starts at |x|=.94414: the old .95 origin was
      // inside its closed volume and therefore missed the front-facing cap.
      const hub=cast([rotor],side*.90,1.10,z,side);
      assert.ok(foot&&wall&&tip&&hub,`${quality}: both solid receivers exist`);
      const hullLap=side*(localX(wall)-localX(foot)),hubLap=side*(localX(tip)-localX(hub));
      assert.ok(hullLap>.0005&&hullLap<.004,`${quality}: real spindle foot enters hull ${hullLap}`);
      near(hubLap,.003,1e-6,`${quality}: real spindle tip enters rotor hub`);
      assert.ok(!cast(stock,side*.95,1.14,z,side),'narrow support leaves surrounding air');
    }
  }
  tank.root.rotation.y=0;tank.root.updateMatrixWorld(true);
}

primitiveEfficiency();
for(const quality of ['high','low']) {
  const tank=createTank('type10_x',null,{quality,geometryReceipt:true,batchStatic:false,proceduralOnly:true});
  try {tank.root.updateMatrixWorld(true);sheetFaces(tank.root,quality);airAndSupport(tank,quality);rollerSupports(tank,quality);}
  finally {tank.dispose();}
}
console.log('Type10 X skirts: actual high/low thin folded faces, true extrema, source air, U straps, fascia engagement and six hull-mounted roller supports PASS');
