import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { KIT } from './tankFactoryCore.ts';
import { resolveSuspensionDimensions, endpointAxialScale } from './suspensionDimensions.ts';

function hashArray(hash, values) {
  hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
}
function gearFingerprint(root) {
  const hash = createHash('sha256');
  root.traverse(object => {
    if (!object.name.startsWith('gear') || !object.geometry) return;
    hash.update(object.name);
    for (const key of Object.keys(object.geometry.attributes).sort()) {
      hash.update(key); hashArray(hash, object.geometry.attributes[key].array);
    }
    if (object.geometry.index) hashArray(hash, object.geometry.index.array);
    if (object.instanceMatrix) hashArray(hash, object.instanceMatrix.array);
  });
  return hash.digest('hex');
}

// Captured before introducing either optional road-station API. These cover
// real wheel, suspension, drum, band and shoe buffers AND instance matrices.
const ORIGINALS = {
  t90sm: ['16b07f4300c48d92cac8b85878ea10a67283ea03a79d86b1c481633ecd83dcdd',
    'd68a12e7b3cfcca7e2dae30f43038c3b8eff88675860722926e30f4cdcdd646f'],
  t90m: ['b876f7f80fc4a2de7a5d05358e861cc489343a25a80dc531a0dc3a1a0a73de78',
    '009065b7d3a36660ff4dee6cfa63cfa384ce7fdda16a07ffac06ef8422cd7f6d'],
  m1a2: ['cbb19f45efdbab97356bd7fc5f87235b6948e0696427ed845cdebdee1e55be99',
    '3868961745dac2ffef364704dd0f12eb5e78ceb379bece156a61dcc6be602016'],
  leo2a5: ['b79db24450e465bd0d110ea05938d3b7c83dcdc23ed4a4f427f7af40e98e55b1',
    '06ee2e4b13dd3efbe94eb3bc7d0a518eda520a6142c8170932ea909a09b01c79'],
};
for (const [id, hashes] of Object.entries(ORIGINALS)) {
  for (const [index, quality] of ['high', 'low'].entries()) {
    const tank = createTank(id, null, { proceduralOnly: true, quality,
      geometryReceipt: true, batchStatic: false });
    try { assert.equal(gearFingerprint(tank.root), hashes[index], `${id}/${quality}: no donor change`); }
    finally { tank.dispose(); }
  }
}

const BASE = {
  wheelR: .4, wheelW: .3, wheelZs: [-1, 0, 1], wheelY: .5, xc: 1.3,
  sprocket: { z: -2, y: .7, r: .3 }, idler: { z: 2, y: .7, r: .3 },
  trackW: .5, topY: 1,
};
function fixture(options = {}, high = true, batchStatic = false) {
  const material = new THREE.MeshStandardMaterial();
  const mats = Object.fromEntries(['hull', 'wheels', 'wheelsRecessed', 'rubber',
    'detail', 'dark', 'shadow', 'trackLink', 'spareTrack', 'burnt', 'trackL', 'trackR']
    .map(key => [key, material]));
  mats.trackTexL = new THREE.Texture(); mats.trackTexR = new THREE.Texture();
  const port = { spec: { id: 't90sm' }, disposables: [], mats,
    hullG: new THREE.Group(), geometryReceipt: true, q: high, batchStatic, add() {} };
  const gear = KIT.buildRunningGear(port, { ...BASE, ...options });
  gear.update(0, 0);
  return { gear, root: port.hullG, receipt: port.hullG.userData.runningGearReceipts[0],
    dispose() {
      const resources = new Set(port.disposables);
      port.hullG.traverse(object => {
        if (object.geometry) resources.add(object.geometry);
        for (const mat of [].concat(object.material || [])) resources.add(mat);
      });
      for (const resource of resources) resource.dispose();
      material.dispose(); mats.trackTexL.dispose(); mats.trackTexR.dispose();
    } };
}
function positions(mesh) {
  if (!mesh.isInstancedMesh) return [mesh.position.clone()];
  const matrix = new THREE.Matrix4(), result = [];
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    result.push(new THREE.Vector3().setFromMatrixPosition(matrix));
  }
  return result;
}
function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} vs ${expected}`);
}
function assertStations(model, heights, outset) {
  const tires = positions(model.root.getObjectByName('gearRoadWheelTires'));
  const joints = positions(model.root.getObjectByName('gearSuspensionJointBosses'));
  for (const wheel of tires) {
    const index = BASE.wheelZs.indexOf(wheel.z);
    close(wheel.y, heights[index], 'authored axle height');
    close(Math.abs(wheel.x), BASE.xc + outset, 'road-only lateral outset');
    assert.ok(joints.some(joint => Math.sign(joint.x) === Math.sign(wheel.x)
      && Math.abs(joint.y - wheel.y) < 1e-6 && Math.abs(joint.z - wheel.z) < 1e-6),
    'forged arm joint remains attached to the actual axle');
  }
}

for (const high of [true, false]) {
  const legacy = fixture({}, high);
  const uniform = fixture({ wheelYs: [.5, .5, .5], roadWheelOutsetM: 0 }, high);
  const heights = [.53, .5, .56];
  const shifted = fixture({ wheelYs: heights, roadWheelOutsetM: .02 }, high);
  try {
    assert.equal(gearFingerprint(legacy.root), gearFingerprint(uniform.root),
      'explicit uniform heights and zero outset preserve all original surfaces/poses');
    assert.equal(Object.hasOwn(legacy.receipt, 'wheelYs'), false);
    assert.deepEqual(shifted.receipt.wheelYs, heights);
    assert.equal(shifted.receipt.roadWheelOutsetM, .02);
    assertStations(shifted, heights, .02);
    for (const [index, z] of BASE.wheelZs.entries()) {
      const support = shifted.receipt.loopPoints.find(point => point[0] === z && point[1] > .8);
      close(support[1], heights[index] + .4 + .09 / 2 - .02, 'belt support follows station');
    }
    for (const model of [legacy, shifted]) {
      for (const child of model.root.children.filter(object => object.name === 'gearEndWheelBody')) {
        for (const point of positions(child)) close(Math.abs(point.x), 1.3, 'end drums do not move outward');
      }
      close(model.root.getObjectByName('gearTrackBandR').position.x, 1.3, 'track lane remains fixed');
    }
    heights[0] = 99;
    shifted.gear.update(.27, .19);
    assertStations(shifted, [.53, .5, .56], .02);
    const state = { pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0 };
    const before = positions(shifted.root.getObjectByName('gearRoadWheelTires'));
    for (let step = 0; step < 12; step++) {
      shifted.gear.conform(state, (x, z) => Math.abs(z) < .6 ? -.1 : .03, 0, 0, 1 / 30);
      shifted.gear.update(.27, .19, 1 / 30);
    }
    const after = positions(shifted.root.getObjectByName('gearRoadWheelTires'));
    assert.ok(after.some((point, index) => Math.abs(point.y - before[index].y) > .001));
    const movingJoints = positions(shifted.root.getObjectByName('gearSuspensionJointBosses'));
    for (const wheel of after) assert.ok(movingJoints.some(joint =>
      Math.sign(joint.x) === Math.sign(wheel.x) && Math.abs(joint.z - wheel.z) < 1e-6
      && Math.abs(joint.y - wheel.y) < 1e-6), 'moving arm follows offset axle');
    shifted.gear.resetPose(); assertStations(shifted, [.53, .5, .56], .02);
  } finally { legacy.dispose(); uniform.dispose(); shifted.dispose(); }
}

for (const invalid of [{ wheelYs: [] }, { wheelYs: [.5, NaN, .5] },
  { wheelYs: [.5, Infinity, .5] }, { wheelYs: new Array(3) }, { wheelYs: 'bad' },
  { roadWheelOutsetM: NaN }, { roadWheelOutsetM: Infinity }]) {
  assert.throws(() => KIT.buildRunningGear({ spec: {}, disposables: [], mats: {},
    hullG: new THREE.Group(), add() {} }, { ...BASE, ...invalid }), /Native road-wheel/);
}
const SOURCE_SUSPENSION = {
  armWidthM:.07720,armHeightM:.161706555,armAxleHeightM:.194965059, armCenterAbsXM:1.14535,
  anchorBossWidthM:.38471, anchorBossRadiusM:.066385, anchorBossCenterAbsXM:.92639,
  axleBossWidthM:.19207, axleBossRadiusM:.047265, axleBossCenterAbsXM:1.26208,
  anchorLiftM:.16946,
};
for (const key of Object.keys(SOURCE_SUSPENSION)) for (const bad of [NaN,Infinity,0,-.1,100]) {
  assert.throws(() => resolveSuspensionDimensions({...SOURCE_SUSPENSION,[key]:bad}), /Suspension dimension/);
}
for (const key of ['armCenterLeftAbsXM','armCenterRightAbsXM']) for(const bad of [NaN,Infinity,0,-.1,100]) {
  assert.throws(()=>resolveSuspensionDimensions({...SOURCE_SUSPENSION,[key]:bad}),/Suspension dimension/);
}
for(const key of ['armHeightM','armAxleHeightM'])for(const bad of [NaN,Infinity,0,-.1,100]) {
  assert.throws(()=>resolveSuspensionDimensions({...SOURCE_SUSPENSION,armHeightM:.16,armAxleHeightM:.195,[key]:bad}),/Suspension dimension/);
}
assert.throws(()=>resolveSuspensionDimensions({...SOURCE_SUSPENSION,armAxleHeightM:undefined}),/endpoint heights/);
for(const key of ['axialScaleLeft','axialScaleRight'])for(const bad of [NaN,Infinity,0,-.1,100]) {
  assert.throws(()=>endpointAxialScale({[key]:bad},key==='axialScaleLeft'?-1:1),/End-wheel axial scale/);
}
assert.throws(() => resolveSuspensionDimensions({}), /Suspension dimension/);

for(const high of [true,false]) {
  const ordinary=fixture({},high,true);
  const scaled=fixture({sprocket:{...BASE.sprocket,axialScaleLeft:.93,axialScaleRight:1.07}},high,true);
  try {
    for(const model of [ordinary,scaled])model.gear.update(.47,.61);
    const a=ordinary.root.getObjectByName('gearEndWheelBody'),b=scaled.root.getObjectByName('gearEndWheelBody');
    assert.ok(a.isBatchedMesh&&b.isBatchedMesh,'exercise actual batched native end drums');
    for(let i=0;i<4;i++) {
      const am=new THREE.Matrix4(),bm=new THREE.Matrix4();a.getMatrixAt(i,am);b.getMatrixAt(i,bm);
      const ab=a.getBoundingBoxAt(a.getGeometryIdAt(i),new THREE.Box3()).applyMatrix4(am);
      const bb=b.getBoundingBoxAt(b.getGeometryIdAt(i),new THREE.Box3()).applyMatrix4(bm);
      const ratio=i===0?.93:i===1?1.07:1;
      close(bb.max.x-bb.min.x,(ab.max.x-ab.min.x)*ratio,'batched source end casting axial scale');
      close(bb.max.y-bb.min.y,ab.max.y-ab.min.y,'batched radial geometry unchanged during spin');
      close(new THREE.Vector3().setFromMatrixPosition(am).distanceTo(new THREE.Vector3().setFromMatrixPosition(bm)),0,'batched axle lane/height/station unchanged');
    }
  }finally{ordinary.dispose();scaled.dispose();}
}

function assertMeasuredBosses(root) {
  const joints=root.getObjectByName('gearSuspensionJointBosses'),m=new THREE.Matrix4();
  const tires=positions(root.getObjectByName('gearRoadWheelTires'));
  const arm=root.getObjectByName('gearSuspensionLinks');
  arm.geometry.computeBoundingBox();
  close(arm.geometry.boundingBox.max.x-arm.geometry.boundingBox.min.x,.07720,'source forged arm axial width');
  joints.geometry.computeBoundingBox();
  for(let i=0;i<joints.count;i++) {
    joints.getMatrixAt(i,m);const point=new THREE.Vector3().setFromMatrixPosition(m);
    const bounds=joints.geometry.boundingBox.clone().applyMatrix4(m),axle=i%2===1;
    close(Math.abs(point.x),axle?1.26208:.92639,'independent source boss lateral seat');
    close(bounds.max.x-bounds.min.x,axle?.19207:.38471,'actual transformed source boss width');
    close(bounds.max.y-bounds.min.y,2*(axle?.047265:.066385),'actual source boss radial height');
    if(axle)assert.ok(tires.some(w=>Math.sign(w.x)===Math.sign(point.x)
      &&Math.abs(w.y-point.y)<1e-6&&Math.abs(w.z-point.z)<1e-6),'source-sized axle boss follows real wheel');
  }
}

function assertSourceArm(root){
  const mesh=root.getObjectByName('gearSuspensionLinks'),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  assert.notEqual(mesh.geometry.type,'BoxGeometry','source web retains real rounded endpoint forgings');
  for(const index of [2,3,4,5,6,7,8,9]){
    mesh.getMatrixAt(index,matrix);const bounds=new THREE.Box3();
    for(let i=0;i<mesh.geometry.attributes.position.count;i++)bounds.expandByPoint(point.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(matrix));
    assert.ok(Math.abs(bounds.min.y-.364789)<.003,'source low end forging envelope');
    assert.ok(Math.abs(bounds.max.y-.69952)<.003,'source raised end forging envelope');
  }
  for(const x of [-1.13,1.13])assert.equal(new THREE.Raycaster(new THREE.Vector3(x,.30,-.30),new THREE.Vector3(0,1,0),0,.45)
    .intersectObject(mesh,false).length,0,'real longitudinal air remains between individual arms');
}

for(const high of [true,false]) {
  const settings={...SOURCE_SUSPENSION},model=fixture({suspensionDimensions:settings},high);
  try {
    assertMeasuredBosses(model.root);
    const before=positions(model.root.getObjectByName('gearSuspensionJointBosses'));
    const uploadBefore=model.root.getObjectByName('gearSuspensionJointBosses').instanceMatrix.version;
    const armUploadBefore=model.root.getObjectByName('gearSuspensionLinks').instanceMatrix.version;
    settings.axleBossWidthM=99;
    const state={pos:new THREE.Vector3(),yaw:0,visualPitch:0,visualRoll:0};
    for(let i=0;i<12;i++) {
      model.gear.conform(state,(x,z)=>Math.abs(z)<.6?-.1:.03,0,0,1/30);
      model.gear.update(.27,.19,1/30);
    }
    assertMeasuredBosses(model.root);
    assert.ok(model.root.getObjectByName('gearSuspensionJointBosses').instanceMatrix.version>uploadBefore,'moving boss instance transforms are actually marked for GPU upload');
    assert.ok(model.root.getObjectByName('gearSuspensionLinks').instanceMatrix.version>armUploadBefore,'dimensioned source arm transforms are actually marked for GPU upload');
    const after=positions(model.root.getObjectByName('gearSuspensionJointBosses'));
    for(let i=0;i<before.length;i+=2)close(after[i].distanceTo(before[i]),0,'raised source hull boss stays fixed under load');
    assert.ok(after.some((p,i)=>i%2===1&&Math.abs(p.y-before[i].y)>.001),'source axle bosses actually move under load');
    const resetVersion=model.root.getObjectByName('gearSuspensionJointBosses').instanceMatrix.version;
    model.gear.resetPose();
    assert.ok(model.root.getObjectByName('gearSuspensionJointBosses').instanceMatrix.version>resetVersion,'reset boss instance transforms are actually marked for GPU upload');
  } finally {model.dispose();}
  const tank=createTank('t90sm_x',null,{proceduralOnly:true,quality:high?'high':'low',geometryReceipt:true,batchStatic:false});
  try {
    assertMeasuredBosses(tank.root);tank.root.updateMatrixWorld(true);
    assertSourceArm(tank.root);
    tank.root.traverse(o=>{
      if(o.name!=='gearEndWheelBody'||o.userData.runningGearEndKind!=='sprocket')return;
      const bounds=new THREE.Box3().setFromObject(o),left=o.position.x<0;
      close(left?bounds.min.x:bounds.max.x,left?-1.65821776:1.66204587,'actual independent source sprocket axial outer face');
    });
  } finally {tank.dispose();}
}
console.log('roadWheelRestHeights.selftest: measured axles/supports and independent moving suspension dimensions, fixed drum lanes, immutable inputs and eight original buffer snapshots pass');
