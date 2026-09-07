import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {TYPE10_X_DATUMS} from './type10X.ts';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const near=(actual,expected,tolerance,label)=>assert.ok(Number.isFinite(actual)&&
  Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected} ±${tolerance}`);
const hit=(root,origin,direction,far=20)=>new THREE.Raycaster(origin,direction,0,far).intersectObject(root,true)[0];

function envelopeAndOwnership(tank,quality) {
  const bounds=new THREE.Box3().setFromObject(tank.root);
  near(bounds.max.x-bounds.min.x,3.38929737,.0001,`${quality}: supplied source width, official conflict kept separate`);
  near(bounds.max.z-bounds.min.z,9.42,.002,`${quality}: official overall length with native bore rim`);
  assert.ok(bounds.min.y>=-1e-6,`${quality}: no geometry below ground`);
  near(bounds.max.y,4.12156,.0002,`${quality}: independently measured source highest whip`);
  const pitch=tank.root.getObjectByName('rig_gun').getWorldPosition(v(0,0,0));
  pitch.toArray().forEach((value,i)=>near(value,TYPE10_X_DATUMS.trunnion[i],1e-7,`${quality}: inferred physical trunnion ${i}`));
  assert.equal(tank.root.getObjectByName('gun').parent.name,'rig_recoil');
  assert.equal(tank.root.getObjectByName('gunMount').parent.name,'rig_gun');
  const gear=tank.root.getObjectByName('rig_hull').userData.runningGearReceipts;
  assert.equal(gear.length,1,`${quality}: one native running-gear course`);
  assert.deepEqual(gear[0].wheelZs,[...TYPE10_X_DATUMS.wheelStations]);
  near(gear[0].wheelR,.33617,1e-9,`${quality}: measured source wheel radius`);
  assert.deepEqual(gear[0].idler,{z:3.2069,y:.8113,r:.33617});
  assert.deepEqual(gear[0].sprocket,{z:-2.8495,y:.748,r:.3131});
}

function foldedGuard(tank,quality) {
  const hull=tank.root.getObjectByName('hull');
  // Source Object_4:92 triangle-plane measurements at raw X±1.1. X is
  // independently authored at the unchanged uniform-oracle metre scale.
  for(const side of [-1,1])for(const [z,roof,floor] of[
    [3.665198,1.110784,1.092888],[3.778860,.890474,.871269],
  ]) {
    const x=side*1.25038;
    near(hit(hull,v(x,3,z),v(0,-1,0))?.point.y,roof,.006,`${quality}: source folded-sheet roof`);
    near(hit(hull,v(x,0,z),v(0,1,0))?.point.y,floor,.012,`${quality}: source folded-sheet underside`);
    assert.ok(!hit(hull,v(x,.72,z-.015),v(0,0,1),.030),`${quality}: real air below folded tip`);
  }
  assert.ok(!hit(hull,v(0,3,3.73),v(0,-1,0)),`${quality}: no broad central nose at side-guard station`);
}

function sightAndRack(tank,quality) {
  // These are complete-source glass witnesses, not opaque-only false air.
  near(hit(tank.root,v(.66112,2.33,1.50),v(0,0,-1))?.point.z,1.3104,.001,
    `${quality}: forward sight recessed first glass`);
  near(hit(tank.root,v(-1.02097,2.612,-.30),v(0,0,-1))?.point.z,-.41652,.001,
    `${quality}: rear optic source glazing depth`);
  assert.ok(!hit(tank.root,v(-1.02097,2.612,-.30),v(0,0,-1),.10),`${quality}: actual optic front air`);
  const frame=tank.root.getObjectByName('turretOpenLattice');
  assert.ok(frame?.isMesh,`${quality}: separated open rear frame`);
  assert.ok(!hit(frame,v(.66,1.88,-3.4),v(0,0,1),.25),`${quality}: source rear rack slot is not a filled box`);
  assert.ok(hit(frame,v(.57639,1.88,-3.4),v(0,0,1),.25),`${quality}: real measured rack post borders air`);
}

function sourceRearAndCourses(tank,quality) {
  const rubber=tank.root.getObjectByName('hullRubber');
  for(const side of [-1,1])for(const [y,z]of[[.679268,-3.340590],[.508775,-3.355127],[.395112,-3.359810]])
    near(hit(rubber,v(side*1.1953,y,-3.60),v(0,0,1))?.point.z,z,.002,
      `${quality}: actual source rear flexible sheet, not whole-model aft datum`);
  const detail=tank.root.getObjectByName('hullDetail');
  near(hit(detail,v(2,1.0,0),v(-1,0,0))?.point.x,1.57453,.0002,
    `${quality}: independent source thin upper skirt fascia`);
  assert.ok(!hit(detail,v(1.62142,.91,-1.0),v(0,0,1),.05),
    `${quality}: source lower modules do not falsely extend through upper course`);
  assert.ok(!hit(tank.root,v(0,1.20,-3.90),v(0,0,1),.23),
    `${quality}: actual source rear tray is open, not a solid exhaust box`);
  near(hit(tank.root,v(0,3,-3.76),v(0,-1,0))?.point.y,1.4269,.002,
    `${quality}: source positive thin upper rear sheet`);
  near(hit(detail,v(0,0,-3.76),v(0,1,0))?.point.y,.9144,.002,
    `${quality}: source positive thin lower rear sheet`);
  near(tank.root.getObjectByName('rig_hull').userData.runningGearReceipts[0].trackW,.486738,1e-9,
    `${quality}: source actual track width, not generic over-wide course`);
}

const XS=1.1366241623942464,YS=1.1366241623942464,YO=1.24758034095187,ZO=.25532557439914;

function steppedArmorAndCoax(tank,quality) {
  // Held-out complete-source roof rays use the unchanged uniform metre frame.
  for(const [x,z,y]of[
    [-1.2,.5,.660542],[1.2,.5,.656498],[-1.1,.5,.7191967],[1.1,.5,.7189915],
    [-1.1,0,.7962388],[1.1,0,.7960336],[-.8,1,.8074625],[.8,1.5,.752970],
    [-.8,1.6,.724141],[.8,1.6,.724141],[-.8,1.7,.615346],[.8,1.7,.610904],
    [.85,1.7,.558536],
  ])near(hit(tank.root,v(x*XS,2.5,z*YS+ZO),v(0,-1,0))?.point.y,y*YS+YO,.005,
    `${quality}: source raised-roof/lower-shelf facet ${x}/${z}`);
  for(const [x,y,z]of[
    [.3,.6,1.470889],[.3,.62,1.514855],[.34,.62,1.698721],
    [.4,.6,1.860769],[.26,.62,1.818756],[.32,.68,1.470086],
  ])near(hit(tank.root,v(x*XS,y*YS+YO,2.8),v(0,0,-1))?.point.z,z*YS+ZO,.002,
    `${quality}: complete-source coax backing/weapon/jamb ${x}/${y}`);
  assert.ok(!hit(tank.root,v(.3*XS,.60*YS+YO,2.60),v(0,0,-1),.50),
    `${quality}: actual coax aperture has deep front air, not painted black armor`);
}

function rearAntennaContact(tank,quality) {
  const detail=tank.root.getObjectByName('turretDetail');
  const shell=tank.root.getObjectByName('turret');
  near(hit(detail,v(.005*XS,2.32,-2.040*YS+ZO),v(0,-1,0))?.point.y,
    .871741088*YS+YO,.002,`${quality}: source lower mounting-stage crown`);
  near(hit(detail,v(.005*XS,2.40,-2.040*YS+ZO),v(0,-1,0))?.point.y,
    .954142328*YS+YO,.001,`${quality}: source cap crown under antenna base`);
  const rear=hit(shell,v(.022*XS,2.13,-2.20),v(0,0,1))?.point.z;
  const front=hit(detail,v(.022*XS,2.13,-1.98),v(0,0,-1))?.point.z;
  assert.ok(front-rear>.001&&front-rear<.004,
    `${quality}: actual folded foot overlaps permanent rear armor, ${front-rear}`);
  assert.ok(!hit(tank.root,v(.11,2.4,-2.06),v(0,-1,0),.25),
    `${quality}: the actual narrow mount leaves adjacent source air`);
  const rig=tank.root.getObjectByName('rig_turret');
  const pivot=v(...TYPE10_X_DATUMS.turretPivot);
  for(const yaw of [Math.PI/2,Math.PI]) {
    rig.rotation.y=yaw;tank.root.updateMatrixWorld(true);
    const rotation=new THREE.Matrix4().makeRotationY(yaw);
    const origin=v(.005*XS,2.40,-2.040*YS+ZO).sub(pivot).applyMatrix4(rotation).add(pivot);
    near(hit(detail,origin,v(0,-1,0))?.point.y,.954142328*YS+YO,.001,
      `${quality}: actual mounted cap retains yaw ownership`);
  }
  rig.rotation.y=0;tank.root.updateMatrixWorld(true);
}

function measuredWhipsAndWeapon(tank,quality) {
  // Held-out canonical Object_5 sections; radii are the actual stepped skin,
  // not a constant thin proxy with the correct endpoint alone.
  for(const [direction,z,x]of[[-1,-1.821,-1.36359287],[1,-2.229,1.36403246]])
    near(hit(tank.root,v(0,3.5,z),v(direction,0,0))?.point.x,x,.0015,
      `${quality}: actual stepped whip intermediate section`);
  for(const x of [-1.37605,1.37605]) {
    const z=x<0?-1.87914:-1.954;
    const base=hit(tank.root.getObjectByName('turretDetail'),v(x,2.38,z),v(0,-1,0))?.point.y;
    const rod=hit(tank.root.getObjectByName('turretDark'),v(x,2.30,z),v(0,1,0))?.point.y;
    assert.ok(base-rod>0&&base-rod<.021,`${quality}: measured whip physically seats on insulator ${base-rod}`);
  }
  for(const [x,z,y]of[[-.224478,.836727,3.002408],[-.224478,.36171,2.950278],
    [-.246,.36171,2.982153],[-.224478,.55,2.948460],[-.311927,.22,2.938328]])
    near(hit(tank.root,v(x,3.10,z),v(0,-1,0))?.point.y,y,.003,
      `${quality}: actual source weapon sight/receiver/grip crown`);
  assert.ok(!hit(tank.root,v(-.225,2.88,.22),v(0,0,1),.055),
    `${quality}: true air between the two separate rear grips`);
  assert.ok(!hit(tank.root,v(-.224478,2.9795,1),v(0,0,-1),.68),
    `${quality}: actual forward sight hoop and rear notch remain open`);
  const weapon=tank.root.getObjectByName('sourceMachineGun_turretDetail');
  const foot=hit(weapon,v(-.31,2.35,.50),v(0,1,0))?.point.y;
  const roof=hit(tank.root.getObjectByName('turretDetail'),v(-.31,2.44,.50),v(0,-1,0))?.point.y;
  assert.ok(roof-foot>.02&&roof-foot<.04,`${quality}: actual weapon foot engages retained cupola ${roof-foot}`);
}

function cradleAndMuzzleFittings(tank,quality) {
  // Source Object_5:112 has thin end/side walls with a genuinely open middle.
  for(const [x,z,y]of[[-.25,.85,2.687981],[-.20,1.02,2.5118644],[-.13,1.02,2.730804]])
    near(hit(tank.root,v(x,2.80,z),v(0,-1,0))?.point.y,y,.003,
      `${quality}: source folded cradle first sheet ${x}/${z}`);
  near(hit(tank.root,v(-.20,2.60,.85),v(0,0,1))?.point.z,.91172084,.001,
    `${quality}: actual rear cradle wall, not an invented solid ramp`);
  near(hit(tank.root,v(-.20,2.60,1.05),v(0,0,1))?.point.z,1.10603206,.001,
    `${quality}: actual forward cradle wall`);
  assert.ok(!hit(tank.root,v(-.28,2.59,1.0),v(1,0,0),.12),
    `${quality}: cradle centre stays genuinely open between separate sides`);
  for(const side of [-1,1]) {
    near(hit(tank.root,v(side*.11,2.1,5.50),v(0,-1,0))?.point.y,1.89615016,.001,
      `${quality}: source paired muzzle fitting surface`);
    assert.ok(!hit(tank.root,v(side*.14,2.1,5.55),v(0,-1,0),.35),
      `${quality}: measured tapered fitting leaves terminal corner air`);
  }
  const recoil=tank.root.getObjectByName('rig_recoil');
  recoil.position.z=-.08;tank.root.updateMatrixWorld(true);
  near(hit(tank.root,v(.11,2.1,5.42),v(0,-1,0))?.point.y,1.89615016,.001,
    `${quality}: paired fittings are genuinely recoil-owned`);
  recoil.position.z=0;tank.root.updateMatrixWorld(true);
}

function spareLinksAndBacking(tank,quality) {
  const hull=tank.root.getObjectByName('hull'),links=tank.root.getObjectByName('hullDark');
  for(const [y,z]of[[.50,2.98196192],[.65,3.20672755],[.80,3.36941431],[.95,3.47575998]])
    near(hit(hull,v(0,y,4),v(0,0,-1))?.point.z,z,.001,
      `${quality}: actual two-plane source lower bow ${y}`);
  for(const x of [-.731826,-.192168,.192171,.731828]) {
    near(hit(tank.root,v(x,.95,4),v(0,0,-1))?.point.z,3.54109783,.001,
      `${quality}: independently measured spare-link front plane`);
    const back=hit(links,v(x,.95,3.40),v(0,0,1))?.point.z;
    const front=hit(hull,v(x,.95,3.60),v(0,0,-1))?.point.z;
    assert.ok(front-back>.0005&&front-back<.003,
      `${quality}: actual source link positive permanent-skin engagement ${front-back}`);
  }
  for(const x of [0,-.45,.45]) {
    assert.ok(!hit(tank.root,v(x,.95,3.55),v(0,0,-1),.065),
      `${quality}: real deep approach air between separate lower-bow links`);
    near(hit(tank.root,v(x,.95,3.55),v(0,0,-1))?.point.z,3.47575998,.001,
      `${quality}: gaps retain the source permanent lower face`);
  }
  for(const [x,y,z]of[[.31525,.977979,3.58060010],[.24753,.91207,3.54389802],
    [.24753,.829137,3.48576446]])
    near(hit(tank.root,v(x,y,4),v(0,0,-1))?.point.z,z,.001,
      `${quality}: actual raised source pin fore surface`);
  // Held-out upper roof points preserve the former surfaces while only the
  // underlying nose facets and their real carried equipment are corrected.
  for(const [z,y]of[[2.8,1.3465853659],[3.2,1.3153658537],[3.5,1.2205762712]])
    near(hit(hull,v(0,2,z),v(0,-1,0))?.point.y,y,.00001,
      `${quality}: non-target upper bow roof unchanged`);
}

for(const quality of ['high','low']) {
  const tank=createTank('type10_x',null,{quality,geometryReceipt:true,batchStatic:false,proceduralOnly:true,camoSeed:4242});
  try {
    tank.root.updateMatrixWorld(true);
    envelopeAndOwnership(tank,quality);foldedGuard(tank,quality);sightAndRack(tank,quality);sourceRearAndCourses(tank,quality);
    steppedArmorAndCoax(tank,quality);rearAntennaContact(tank,quality);
    measuredWhipsAndWeapon(tank,quality);cradleAndMuzzleFittings(tank,quality);
    spareLinksAndBacking(tank,quality);
  } finally {tank.dispose();}
}
console.log('Type10 X: actual-ID high/low envelope, gear, source folds, roof facets/coax air, mounted antenna and ownership PASS');
