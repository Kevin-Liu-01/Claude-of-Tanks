import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {TYPE90_X_DATUMS} from './type90X.ts';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs ${b} ±${t}`);
const hit=(root,o,d,far=20)=>new THREE.Raycaster(o,d,0,far).intersectObject(root,true)[0];

function actualShoeFloor(mesh) {
  const points=mesh.geometry.attributes.position,matrix=new THREE.Matrix4(),point=v(0,0,0);
  let floor=Infinity;
  for(let j=0;j<mesh.count;j++) {
    mesh.getMatrixAt(j,matrix);if(Math.abs(matrix.determinant())<1e-10)continue;
    matrix.premultiply(mesh.matrixWorld);
    for(let i=0;i<points.count;i++)floor=Math.min(floor,point.fromBufferAttribute(points,i).applyMatrix4(matrix).y);
  }
  return floor;
}

function basicChecks(tank,quality) {
  const b=new THREE.Box3().setFromObject(tank.root);
  near(b.max.x-b.min.x,3.61781384,.0001,`${quality}: unchanged oracle's physical width, not published nominal`);
  near(b.max.z-b.min.z,9.80,.002,`${quality}: official length, assembled terminal rim included`);
  // Rotated prototype AABB corners are not shoe surfaces. Test actual
  // per-instance vertices, including the rounded rigid-shoe approach knee.
  const floor=actualShoeFloor(tank.root.getObjectByName('gearTrackPads'));
  assert.ok(floor>=-1e-7&&floor<.001,`${quality}: actual rigid shoe ground contact ${floor}`);
  near(b.max.y,4.657996,.001,`${quality}: source highest whip, independent of nominal roof`);
  const body=tank.root.getObjectByName('hull'),turret=tank.root.getObjectByName('turret');
  near(new THREE.Box3().setFromObject(body).max.z,3.899422,.00001,`${quality}: source structural forward station`);
  near(new THREE.Box3().setFromObject(body).min.z,-3.899422,.00001,`${quality}: source structural rear station`);
  near(new THREE.Box3().setFromObject(turret).max.y,2.459472,.00001,`${quality}: independently measured source roof`);
  const receipts=tank.root.getObjectByName('rig_hull').userData.runningGearReceipts;
  assert.equal(receipts.length,1,`${quality}: exactly one native running-gear unit`);
  assert.deepEqual(receipts[0].wheelZs,[...TYPE90_X_DATUMS.wheelStations]);
  near(receipts[0].wheelR,.357347,1e-9,`${quality}: independently measured source round wheel radius`);
  assert.deepEqual(receipts[0].idler,{z:3.510616,y:.81982,r:.357347});
  assert.deepEqual(receipts[0].sprocket,{z:-2.94311,y:.86132,r:.36981});
}

function physicalOpenings(tank,quality) {
  const hull=tank.root.getObjectByName('hull');
  assert.ok(!hit(hull,v(0,3,3.80),v(0,-1,0)),`${quality}: true central air beside longer forward guards`);
  assert.ok(hit(hull,v(1.30,3,3.80),v(0,-1,0)),`${quality}: positive paired guard beside central air`);
  const lattice=tank.root.getObjectByName('turretOpenLattice');
  assert.ok(!hit(lattice,v(.17,2.26,-2.70),v(0,0,1),.25),`${quality}: actual rear basket slot`);
  assert.ok(hit(lattice,v(.310584,2.26,-2.70),v(0,0,1),.25),`${quality}: positive source-spaced rack post`);
  near(hit(tank.root,v(.656,2.53,1.46),v(0,0,-1))?.point.z,1.19812,.001,
    `${quality}: complete assembled sight pane, not false deep empty hood`);
  assert.ok(!hit(tank.root,v(.656,2.53,1.46),v(0,0,-1),.24),`${quality}: real under-hood front air`);
  near(hit(tank.root,v(.656,3,1.40),v(0,-1,0))?.point.y,2.694989,.001,
    `${quality}: measured thin rising hood above that air`);
}

function gunOwnership(tank,quality) {
  const tube=tank.root.getObjectByName('gun'),mount=tank.root.getObjectByName('gunMount');
  assert.equal(tube.parent.name,'rig_recoil');assert.equal(mount.parent.name,'rig_gun');
  const a=new THREE.Box3().setFromObject(tube),b=new THREE.Box3().setFromObject(mount);
  assert.ok(b.max.z>a.min.z,`${quality}: real bearing/neck positive engagement`);
  const p=tank.root.getObjectByName('rig_gun').getWorldPosition(v(0,0,0));
  p.toArray().forEach((n,i)=>near(n,TYPE90_X_DATUMS.trunnion[i],1e-8,`${quality}: actual inferred pitch datum ${i}`));
  near(hit(tube,v(0,3,4.50),v(0,-1,0))?.point.y,2.096726,.001,
    `${quality}: independently tapered circular fore jacket`);
  // Source MG extension bridges the receiver and barrel; no floating .21m gap.
  assert.ok(hit(tank.root,v(.079,3,.68),v(0,-1,0))?.point.y>2.75,
    `${quality}: integrated positive receiver/barrel extension`);
}

function sourceFrameSurfaces(tank,quality) {
  // Held-out canonical-source rays, not values computed from builder rows.
  const roofs=[[0,-3.2,1.8405988],[1.5,-3.2,1.8009322],[1.78,-2,1.3769611],
    [-.64,.12,2.7327864]];
  for(const [x,z,y]of roofs)near(hit(tank.root,v(x,4,z),v(0,-1,0))?.point.y,y,.002,
    `${quality}: source-world held-out roof ${x}/${z}`);
  near(hit(tank.root,v(.45,1.9,2.10),v(0,-1,0))?.point.y,1.6396657,.002,
    `${quality}: source driver roof under actual turret overhang`);
  for(const x of [0,1.45])near(hit(tank.root,v(x,1.6,-4.2),v(0,0,1))?.point.z,-3.962528,.001,
    `${quality}: source stern face ${x}`);
  const rubber=tank.root.getObjectByName('hullRubber');
  near(hit(rubber,v(1.4,.85,-4.2),v(0,0,1))?.point.z,-3.500149,.001,
    `${quality}: source short rear flap, not a tall aft curtain`);
  assert.ok(!hit(tank.root,v(1.4,.85,-4.1),v(0,0,1),.5),`${quality}: real aft air before short flap`);
  const wheels=tank.root.getObjectByName('gearRoadWheelTires'),matrix=new THREE.Matrix4();
  for(let i=0;i<wheels.count;i++) {
    wheels.getMatrixAt(i,matrix);const centre=v(0,0,0).applyMatrix4(matrix).applyMatrix4(wheels.matrixWorld);
    near(Math.abs(centre.x),1.382171,.00001,`${quality}: source cast-wheel axial centre`);
    near(centre.y,.44142,.00001,`${quality}: unchanged source roadwheel height`);
  }
  for(const [y,x]of[[.44142,1.634449],[.50142,1.614967],[.64142,1.509855]])
    near(hit(tank.root,v(3,y,.5464),v(-1,0,0))?.point.x,x,.005,
      `${quality}: source recessed wheel dish and positive hub ${y}`);
}

function sourceWrapAndFolds(tank,quality) {
  const pads=tank.root.getObjectByName('gearTrackPads');
  // Source skin raw inner-return Y10.6700258 at uniform metre scale;
  // actual mechanical rollers are inferred, but their tangency is real.
  for(const z of [-1.92,.04,2.03])for(const x of [1.20,1.53])
    near(hit(pads,v(x,1.13,z),v(0,1,0),.15)?.point.y,1.15619,.0005,
      `${quality}: actual inner return skin over physical roller ${x}/${z}`);
  const rollers=tank.root.getObjectByName('gearReturnRollerTires');
  const matrix=new THREE.Matrix4();
  for(let i=0;i<rollers.count;i++) {
    rollers.getMatrixAt(i,matrix);const centre=v(0,0,0).applyMatrix4(matrix).applyMatrix4(rollers.matrixWorld);
    near(centre.y+.10,1.1559,.00001,`${quality}: actual inferred roller crown engages return skin`);
  }
  const flaps=tank.root.getObjectByName('hullRubber');
  // Independent source eight-triangle front guard plane, checked at held-out
  // longitudinal stations; native closed sheet has physical thickness.
  for(const [z,y]of[[3.906238,1.129637],[3.949582,1.036597],[4.036270,.850515]])
    near(hit(flaps,v(1.283,2,z),v(0,-1,0))?.point.y,y,.004,
      `${quality}: source steep front mudguard plane ${z}`);
  assert.ok(!hit(flaps,v(1.283,.73,3.94),v(0,0,1),.05),`${quality}: genuine air below front sheet`);
}

for(const quality of ['high','low']) {
  const tank=createTank('type90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try {tank.root.updateMatrixWorld(true);basicChecks(tank,quality);physicalOpenings(tank,quality);gunOwnership(tank,quality);sourceWrapAndFolds(tank,quality);sourceFrameSurfaces(tank,quality);}
  finally {tank.dispose();}
}
console.log('Type90 X: actual high/low independent dimensions, source axial stations, open rack/sight, positive gun connections PASS');
