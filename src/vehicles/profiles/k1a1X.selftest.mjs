import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {K1A1_X_PROFILES} from './k1a1X.ts';

registerProfiledBuilders({k1a1_x:K1A1_X_PROFILES.k1a1_x.build});
const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${label}: ${a} vs ${b} ±${e}`);
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const hit=(object,origin,direction,far=15)=>new THREE.Raycaster(origin,direction,0,far).intersectObject(object,true)[0];
const top=(object,x,z)=>hit(object,v(x,7,z),v(0,-1,0))?.point.y;

function structuralChecks(tank,label) {
  const hull=tank.root.getObjectByName('hull');
  assert.ok(hull?.isMesh,'actual independently authored permanent body');
  // Held-out source main-shell rays, not candidate-generated expected values.
  for(const [z,y]of[[-2.6,1.6399],[-1.05,1.4827],[3,1.258202],[3.36,1.041452]]) {
    near(top(hull,0,z),y,.001,`${label}: independently measured hull roof ${z}`);
    const floor=hit(hull,v(0,0,z),v(0,1,0));
    assert.ok(floor&&floor.point.y<y-.015,`${label}: genuinely closed lower tub at ${z}`);
  }
  for(const side of [-1,1])for(const [z,y]of[[-2.2,1.6204],[.2,1.472],[3.53,1.3587]])
    near(top(hull,side*(z>3?1.5:1.74),z),y,.001,`${label}: paired source skirt/fender ${side}/${z}`);
  // Source centre bow ends at3.4873 while separate side mudguards extend3.8135.
  assert.equal(top(hull,0,3.60),undefined,`${label}: no invented centre prow filling guard air`);
  near(top(hull,1.50,3.53),1.3587,.001,`${label}: positive side guard remains beside that air`);
}

function rigAndGearChecks(tank,label) {
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
  near(turret.position.y,1.49566,1e-8,`${label}: measured ring-midplane seat`);
  near(turret.position.z,.42564,1e-8,`${label}: measured ring plan centre`);
  const pitch=gun.getWorldPosition(v(0,0,0));
  for(const [i,a]of pitch.toArray().entries())near(a,[.0352,1.81797,1.57716][i],1e-8,`${label}: pitch datum ${i}`);
  const gear=tank.root.getObjectByName('rig_hull').userData.runningGearReceipts;
  assert.equal(gear.length,1,`${label}: exactly one native gear unit`);
  assert.deepEqual(gear[0].wheelZs,[-2.157,-1.2769,-.4408,.5487,1.6046,2.5251]);
  near(gear[0].wheelR,.3313,1e-9,`${label}: source wheel radius`);
  near(gear[0].wheelY,.3978,1e-9,`${label}: source wheel height`);
  assert.deepEqual(gear[0].idler,{z:3.2984,y:.8305,r:.3313});
  assert.deepEqual(gear[0].sprocket,{z:-2.8851,y:.81225,r:.39725});
  near(tank.contactGeom.bottomYM,0,.003,`${label}: native flat-run pad contact datum`);
  // The source flat skin itself varies0–5.4mm above its ground datum. Check
  // real per-instance geometry in that independently measured interval.
  const actualFloor=actualShoeFloor(tank.root.getObjectByName('gearTrackPads'));
  assert.ok(actualFloor>=-1e-7&&actualFloor<=.0054,
    `${label}: actual shoe floor ${actualFloor} within source ground ripple, no penetration`);
  const simpleFloor=actualShoeFloor(tank.root.getObjectByName('gearTrackPadsSimplified'));
  assert.ok(simpleFloor>=-1e-7&&simpleFloor<.003,`${label}: simplified actual shoe contact`);
}

function rearAndCarrierChecks(tank,label) {
  const hull=tank.root.getObjectByName('hull'),flaps=tank.root.getObjectByName('hullRubber');
  for(const side of [-1,1])for(const [z,roof,floor]of[
    [-3.625,.850521,.836496],[-3.60,.874738,.860982],[-3.55,.923172,.909953]]) {
    near(top(flaps,side*1.3,z),roof,.002,`${label}: actual shallow rear sheet roof ${side}/${z}`);
    near(hit(flaps,v(side*1.3,0,z),v(0,1,0))?.point.y,floor,.003,
      `${label}: actual shallow rear sheet underside ${side}/${z}`);
    assert.ok(!hit(flaps,v(side*1.3,.70,z),v(0,0,1),.035),
      `${label}: real air below rear sheet, not old filled diagonal ${side}/${z}`);
  }
  near(top(hull,.9,-.5),1.520962,.003,`${label}: source permanent collar aft crown`);
  near(top(hull,1.3,.5),1.521256,.003,`${label}: source permanent collar side crown`);
  near(top(hull,0,1.5),1.436068,.002,`${label}: collar centre stays open above unchanged hull`);
  const cage=tank.root.getObjectByName('turretOpenLattice');
  near(top(cage,-1.65,.5),2.000476,.006,`${label}: actual canted left rail crown`);
  for(const [x,z]of[[-1.5,-2.160917],[1.5,-2.097700]])
    near(hit(cage,v(x,2.064,-2.6),v(0,0,1))?.point.z,z,.018,
      `${label}: independently measured unequal aft cage fold ${x}`);
  assert.ok(!hit(cage,v(1.66,1.86,1.40),v(0,0,-1),.20),
    `${label}: right rail genuinely turns in earlier than left`);
  const rollers=tank.root.getObjectByName('gearReturnRollerTires');
  assert.equal(rollers.count,6,`${label}: three genuine source return rollers per side`);
  const matrix=new THREE.Matrix4(),ys=[];
  for(let i=0;i<rollers.count;i++) {
    rollers.getMatrixAt(i,matrix);const centre=v(0,0,0).applyMatrix4(matrix).applyMatrix4(rollers.matrixWorld);
    ys.push(centre.y);
  }
  for(const y of [1.0256,1.0259,1.0141])
    assert.equal(ys.filter(value=>Math.abs(value-y)<1e-5).length,2,`${label}: measured roller pair Y${y}`);
}

function actualShoeFloor(mesh) {
  const p=mesh.geometry.attributes.position,point=v(0,0,0),matrix=new THREE.Matrix4();
  let minimum=Infinity;
  for(let instance=0;instance<mesh.count;instance++) {
    mesh.getMatrixAt(instance,matrix);
    if(Math.abs(matrix.determinant())<1e-10)continue;
    matrix.premultiply(mesh.matrixWorld);
    for(let vertex=0;vertex<p.count;vertex++) {
      point.fromBufferAttribute(p,vertex).applyMatrix4(matrix);
      minimum=Math.min(minimum,point.y);
    }
  }
  return minimum;
}

function gunAndAirChecks(tank,label) {
  const tube=tank.root.getObjectByName('gun'),mount=tank.root.getObjectByName('gunMount');
  assert.ok(tube.parent===tank.root.getObjectByName('rig_recoil'),`${label}: actual tube is recoil owned (${tube.parent.name})`);
  assert.ok(mount.parent===tank.root.getObjectByName('rig_gun'),`${label}: actual pitch bearing does not recoil (${mount.parent.name})`);
  near(top(tube,.0352,3.50),2.01217,.00001,`${label}: eccentric source evacuator crown`);
  near(top(tube,.0352,4.50),1.92537,.00001,`${label}: source fore jacket radius`);
  for(const [z,y,e] of [[2.83,1.949812,.001],[3.20,1.938954,.004],
    [3.90,1.940170,.001],[5.52,1.934670,.001],[5.871,1.993570,.001]])
    near(top(tube,.0352,z),y,e,`${label}: independently held-out stepped gun crown ${z}`);
  for(const [z,y] of [[1.72,2.191802],[2,2.151485],[2.20,2.122687],[2.35,1.893863]])
    near(top(mount,0,z),y,.003,`${label}: actual pitched boot roof ${z}`);
  const cage=tank.root.getObjectByName('turretOpenLattice');
  assert.ok(cage?.isMesh,`${label}: actual semantic open lattice`);
  // Complete source includes sagging cables from cage_turret_12_1. The old
  // frame-only oracle falsely called (.11,1.86) and (.38,1.83) empty slots.
  for(const [x,y]of[[.02,1.84],[.11,1.90],[.38,1.88],[-.36,1.83]])
    assert.ok(!hit(cage,v(x,y,-2.6),v(0,0,1),.35),`${label}: held-out rear cage slot ${x}`);
  for(const [x,y,z]of[[.11,1.86,-2.470823],[.38,1.83,-2.471500]])
    near(hit(cage,v(x,y,-2.6),v(0,0,1),.35)?.point.z,z,.004,
      `${label}: complete-source real sagging cable ${x}`);
  assert.ok(hit(cage,v(-.0503,1.84,-2.6),v(0,0,1),.35),`${label}: source slot border is a real positive bar`);
  // Full integrated source sight air must not be filled by a generic forward box.
  const all=hit(tank.root,v(-.811,2.44,.60),v(0,0,-1),.13);
  assert.ok(!all,`${label}: actual commander's sight forward cavity (hit ${all?.object.name} at${all?.point.z})`);
  near(hit(tank.root,v(-.811,2.44,.60),v(0,0,-1))?.point.z,.465072,.002,
    `${label}: actual source glass, not opaque-only-island false deep air`);
  assert.ok(tank.root.getObjectByName('turretGlass'),`${label}: recessed glazing remains separately owned`);
}

function roofFixtures(tank,label) {
  near(top(tank.root.getObjectByName('turretDetail'),-.4436,.641),2.75246,.001,`${label}: retained source left yoke crown`);
  assert.ok(!hit(tank.root,v(-.3867,2.67,.90),v(0,0,-1),.40),
    `${label}: actual air between the retained tray and photo-led weapon cross-pin`);
  near(hit(tank.root,v(.842,2.6,.85),v(0,0,-1))?.point.z,.781092,.01,
    `${label}: actual slotted right upright front return`);
  near(hit(tank.root,v(.915,2.59,.80),v(0,0,-1))?.point.z,.710740,.002,
    `${label}: separate outboard saddle remains real positive support`);
  for(const [y,z]of[[2.34,.458769],[2.49,.467895],[2.54,.470698]])
    near(hit(tank.root,v(-.811,y,.60),v(0,0,-1))?.point.z,z,.002,
      `${label}: source full-scene canted glazing at ${y}`);
  near(hit(tank.root,v(-2,2.48,.24),v(1,0,0))?.point.x,-1.037091,.008,
    `${label}: rounded tapered optic cross-section, not its rectangular bounds`);
  near(top(tank.root,0,1.37),2.222985,.001,`${label}: actual turret-owned hinged roof sheet`);
  for(const side of [-1,1]) {
    near(top(tank.root,side*1.75,3.44),1.275706,.018,`${label}: source folded outer guard crown`);
    assert.ok(hit(tank.root,v(side*2,.96,3.44),v(-side,0,0),.24),
      `${label}: real downturned outer guard below the flat deck`);
    near(top(tank.root,side*.965,-3.60),1.638,.001,`${label}: narrow rear exhaust bracket crown`);
    assert.ok(!hit(tank.root,v(side*1.1,1.54,-3.63),v(-side,0,0),.20),
      `${label}: rear guard triangle remains genuinely open`);
  }
}

function forwardFacetAndPouchChecks(tank,label) {
  const shell=tank.root.getObjectByName('turret'),cloth=tank.root.getObjectByName('turretCloth');
  // Held-out source504 main-shell rays cross both real crease families.
  // In particular X−1.4/Z1.5 was102mm low in the nominal five-point loft.
  for(const [x,z,y]of[[-1.4,1.15,1.877393],[-1.2,1.30,1.935687],
    [-1.4,1.50,1.877539],[-.7,1.50,1.987005],[-1.2,1.75,1.722341],
    [-.7,1.85,1.887773],[1.4,1.15,1.831188],[1.2,1.30,1.833835],
    [.7,1.50,1.999672],[.7,1.75,1.725191]])
    near(top(shell,x,z),y,.008,`${label}: actual source cheek facet ${x}/${z}`);
  assert.equal(top(shell,1.25,1.5),undefined,`${label}: right nose tapers before left`);
  assert.ok(top(shell,-1.50,1.5)>1.6,`${label}: broad left chine remains real armor`);
  for(const [x,z]of[[1.5,-1.784124],[1.55,-1.532253],[1.6,-1.469375]])
    near(hit(cloth,v(x,2,-2.6),v(0,0,1))?.point.z,z,.012,
      `${label}: diagonal source200 pouch fold ${x}`);
  assert.ok(!hit(cloth,v(1.60,2,-2.20),v(0,0,1),.50),
    `${label}: former axis-aligned pouch overfill is genuinely absent`);
  const cage=tank.root.getObjectByName('turretOpenLattice');
  near(top(cage,1.685,-1.85),2.010760,.002,`${label}: source upturned outer cable clip`);
  assert.ok(hit(cage,v(1.63,1.848,-1.9),v(0,0,1),.07),
    `${label}: folded cable clip engages the real vertical cage post`);
}

function sourceWhipChecks(tank,label) {
  const object=tank.root.getObjectByName('turretDark');
  // Source six-sided whip sections; neither height nor lateral anchor moves.
  for(const [y,x]of[[2.80,.429340],[3.00,.424939],[3.40,.424029],[3.80,.423183],[4.00,.422716]])
    near(hit(object,v(.60,y,-1.22533),v(-1,0,0))?.point.x,x,.00008,
      `${label}: actual source tapered whip section Y${y}`);
  near(top(object,.41,-1.22533),3.653053,.015,
    `${label}: real taper stops the narrow off-axis column before the tip`);
  near(top(object,.41674,-1.22533),4.070250,.00001,`${label}: actual highest fitting unchanged`);
}

for(const quality of ['high','low']) {
  const tank=createTank('k1a1_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try {
    tank.root.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(tank.root),size=b.getSize(v(0,0,0));
    near(size.x,3.6758,.0001,`${quality}: source full width including hinge tips`);
    near(size.z,9.72264,.006,`${quality}: source full length, including terminal fittings`);
    near(b.max.y,4.07025,.0001,`${quality}: source whip top, not roof datum`);
    structuralChecks(tank,quality);rigAndGearChecks(tank,quality);gunAndAirChecks(tank,quality);
    roofFixtures(tank,quality);rearAndCarrierChecks(tank,quality);forwardFacetAndPouchChecks(tank,quality);
    sourceWhipChecks(tank,quality);
  } finally {tank.dispose();}
}
console.log('k1a1X: actual high/low source envelope, body/fender rays, one six-station native gear, pitch/recoil ownership and real cage/sight air pass');
