import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { KIT } from './tankFactoryCore.ts';
import { resolveSuspensionDimensions, endpointAxialScale, endpointAxleOutset, sourceToothTip } from './suspensionDimensions.ts';
import { measuredTireBands,validateMeasuredWheelCore } from './measuredWheelGeometry.ts';

function hashArray(hash, values) {
  hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
}
function originalGearAttributeNames(geometry) {
  // M1A2 gear can share a masked lamp material, requiring an all-zero vertex
  // channel even though these parts contain no lamp. Preserve all eight
  // original shape snapshots; validate that new metadata independently.
  const mask = geometry.getAttribute('nightEmissionMask');
  if (mask) {
    assert.ok(mask.array instanceof Uint8Array, 'night mask is byte-sized');
    assert.equal(mask.itemSize, 1); assert.equal(mask.normalized, false);
    assert.equal(mask.count, geometry.getAttribute('position').count, 'one mask value per original vertex');
    assert.ok(mask.array.every(v => v === 0), 'inherited gear masks must never emit light');
  }
  return Object.keys(geometry.attributes).filter(k => k !== 'nightEmissionMask');
}
function gearFingerprint(root) {
  const hash = createHash('sha256');
  root.traverse(object => {
    if (!object.name.startsWith('gear') || !object.geometry) return;
    hash.update(object.name);
    for (const key of originalGearAttributeNames(object.geometry).sort()) {
      hash.update(key); hashArray(hash, object.geometry.attributes[key].array);
    }
    if (object.geometry.index) hashArray(hash, object.geometry.index.array);
    if (object.instanceMatrix) hashArray(hash, object.instanceMatrix.array);
  });
  return hash.digest('hex');
}

{
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1], 2)); geometry.setIndex([0,1,2]);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1); mesh.name = 'gearFixture';
  const measure = () => gearFingerprint(mesh), original = measure();
  geometry.setAttribute('nightEmissionMask', new THREE.Uint8BufferAttribute([0,0,0], 1));
  assert.equal(measure(), original, 'an inherited unlit channel preserves all original gear bytes');
  for (const invalid of [new THREE.Float32BufferAttribute([0,0,0], 1), new THREE.Uint8BufferAttribute([0,0,0], 3),
    new THREE.Uint8BufferAttribute([0,0], 1), new THREE.Uint8BufferAttribute([0,0,0], 1, true),
    new THREE.Uint8BufferAttribute([0,1,0], 1), new THREE.Uint8BufferAttribute([0,2,0], 1), new THREE.Uint8BufferAttribute([0,3,0], 1)]) {
    geometry.setAttribute('nightEmissionMask', invalid); assert.throws(measure);
  }
  geometry.setAttribute('nightEmissionMask', new THREE.Uint8BufferAttribute([0,0,0], 1));
  geometry.setAttribute('unrecognizedSemanticChannel', new THREE.Uint8BufferAttribute([0,0,0], 1));
  assert.notEqual(measure(), original, 'unknown attributes remain hashed'); geometry.deleteAttribute('unrecognizedSemanticChannel');
  for (const a of [geometry.attributes.position, geometry.attributes.normal, geometry.attributes.uv, geometry.index, mesh.instanceMatrix]) {
    const old = a.array[0]; a.array[0] = old + 1;
    assert.notEqual(measure(), original, 'original position/normal/UV/index/instance bytes remain guarded'); a.array[0] = old;
  }
  mesh.name = 'gearChanged'; assert.notEqual(measure(), original, 'gear identity remains guarded'); mesh.name = 'gearFixture';
  assert.equal(measure(), original); geometry.dispose(); mesh.material.dispose();
}

// Captured before introducing either optional road-station API. These cover
// real wheel, suspension, drum, band and shoe buffers AND instance matrices.
const ORIGINALS = {
  t90sm: ['34b2ebe686e96f1a0906d6d7702c1a15de231d0b3da200631e0008d891f9be64',
    '4829abde5789b92e6e5458bc944c3bb0c1e37a4f66287fe42a880290c4eda08c'],
  t90m: ['8b2c403655ba1913d0f184a3841c741957d0ca2e02d2f04e9b73116c08c4be3a',
    '00f4cae94dd2b1bfa96e6319dc6293cbbce6d52ef9f7154bb70c4387f8286271'],
  m1a2: ['cbb19f45efdbab97356bd7fc5f87235b6948e0696427ed845cdebdee1e55be99',
    '3868961745dac2ffef364704dd0f12eb5e78ceb379bece156a61dcc6be602016'],
  leo2a5: ['08efd1106a79835d3b0ad6c4ffe8a502faea5212ee785c1f84b790d331d8846f',
    '011e249a2d5f6d555a8b8fada08e53c7a92cc7aed15035782bb6110c7b057f6c'],
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

for(const high of[true,false]) {
  const left=[-1.038,-.038,.962],right=[-.962,.038,1.038];
  const model=fixture({wheelZsLeftM:left,wheelZsRightM:right},high);
  try {
    left[0]=99;model.gear.update(.42,-.37);
    for(const wheel of positions(model.root.getObjectByName('gearRoadWheelTires'))) {
      const expected=wheel.x<0?[-1.038,-.038,.962]:right;
      assert.ok(expected.some(z=>Math.abs(z-wheel.z)<1e-6),'side axle stagger survives independent spinning');
      close(wheel.y,.5,'stagger does not move wheel heights');
      const joints=positions(model.root.getObjectByName('gearSuspensionJointBosses'));
      assert.ok(joints.some(p=>Math.sign(p.x)===Math.sign(wheel.x)&&Math.abs(p.z-wheel.z)<1e-6&&Math.abs(p.y-wheel.y)<1e-6),
        'source stagger carries its physical suspension axle');
    }
    close(model.root.getObjectByName('gearTrackBandR').position.x,BASE.xc,'stagger leaves lane fixed');
    assert.deepEqual(model.receipt.wheelZsLeftM,[-1.038,-.038,.962]);
    assert.deepEqual(model.gear.roadWheelLayout.wheelZsRightM,right);
    for(const body of model.root.children.filter(o=>o.name==='gearEndWheelBody'))
      assert.ok(Math.abs(body.position.z)===2,'stagger leaves end drums fixed');
  }finally{model.dispose();}
}
for(const bad of[[],[0,1],[0,NaN,2],new Array(3),'bad'])
  assert.throws(()=>fixture({wheelZsLeftM:bad}),/Native road-wheel/);

for(const high of[true,false]) {
  const core=new THREE.CylinderGeometry(.08,.08,.30,20).rotateZ(Math.PI/2);
  const bandDefs=[{centerM:-.1,widthM:.1,innerRadiusM:.3},{centerM:.1,widthM:.1,innerRadiusM:.3}];
  const model=fixture({wheelTireBands:bandDefs,wheelCoreGeometry:{disc:core}},high);
  try {
    model.root.updateMatrixWorld(true);
    const tire=model.root.getObjectByName('gearRoadWheelTires');
    const hit=(x,r)=>new THREE.Raycaster(new THREE.Vector3(x,.5+r,-1.8),new THREE.Vector3(0,0,1),0,1.6).intersectObject(tire,false);
    assert.equal(hit(1.3,.35).length,0,'true 100mm inter-tire air, no rubber bridge');
    assert.ok(hit(1.20,.35).length&&hit(1.40,.35).length,'both physical rubber rings exist');
    const ray=new THREE.Raycaster(new THREE.Vector3(1.20,.5,-1),new THREE.Vector3(0,1,0),0,.29);
    assert.equal(ray.intersectObject(tire,false).length,0,'rubber does not fill steel-dish cavity');
    close(model.root.getObjectByName('gearRoadWheelDiscs').geometry.boundingBox?.max.y??.08,.08,'measured core has no injected full-radius disc');
    const steel=new THREE.MeshBasicMaterial();
    model.gear.addRoadWheelLayer(new THREE.BoxGeometry(.02,.1,.1),steel,{side:-1,name:'gearRoadWheelMeasuredLeft'});
    model.gear.update(.35,-.65);model.root.updateMatrixWorld(true);
    const faces=positions(model.root.getObjectByName('gearRoadWheelMeasuredLeft'));
    assert.equal(faces.length,3);assert.ok(faces.every(p=>p.x<0),'left face cannot be duplicated on right');
    assert.throws(()=>model.gear.addRoadWheelLayer(new THREE.BoxGeometry(.01,.1,.1),steel,{side:0}),/face side/);
    assert.deepEqual(model.receipt.wheelTireBands,bandDefs);
  }finally{model.dispose();}
}
for(const bands of[[],[{centerM:0,widthM:.1,innerRadiusM:0}],
  [{centerM:0,widthM:2,innerRadiusM:.2}],[{centerM:NaN,widthM:.1,innerRadiusM:.2}],
  [{centerM:0,widthM:.15,innerRadiusM:.2},{centerM:.05,widthM:.15,innerRadiusM:.2}]])
  assert.throws(()=>measuredTireBands(bands,.4,.3,20),/Measured tire bands/);
assert.throws(()=>validateMeasuredWheelCore(new THREE.BufferGeometry()),/Measured wheel core/);
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
  if (key === 'anchorLiftM' && bad === 0) {
    assert.equal(resolveSuspensionDimensions({...SOURCE_SUSPENSION,anchorLiftM:0}).anchorLiftM, 0,
      'horizontal measured arms preserve zero lift; other dimensions still reject zero');
    continue;
  }
  assert.throws(() => resolveSuspensionDimensions({...SOURCE_SUSPENSION,[key]:bad}), /Suspension dimension/);
}
for (const key of ['armCenterLeftAbsXM','armCenterRightAbsXM']) for(const bad of [NaN,Infinity,0,-.1,100]) {
  assert.throws(()=>resolveSuspensionDimensions({...SOURCE_SUSPENSION,[key]:bad}),/Suspension dimension/);
}
for(const key of ['armHeightM','armAxleHeightM','anchorTrailM'])for(const bad of [NaN,Infinity,0,-.1,100]) {
  assert.throws(()=>resolveSuspensionDimensions({...SOURCE_SUSPENSION,armHeightM:.16,armAxleHeightM:.195,[key]:bad}),/Suspension dimension/);
}
assert.throws(()=>resolveSuspensionDimensions({...SOURCE_SUSPENSION,armAxleHeightM:undefined}),/endpoint heights/);
for(const key of ['axialScaleLeft','axialScaleRight'])for(const bad of [NaN,Infinity,0,-.1,100]) {
  assert.throws(()=>endpointAxialScale({[key]:bad},key==='axialScaleLeft'?-1:1),/End-wheel axial scale/);
}
assert.throws(() => resolveSuspensionDimensions({}), /Suspension dimension/);
for(const value of [NaN,Infinity,-Infinity,.51,-.51])assert.throws(()=>endpointAxleOutset({axleOutsetM:value}),/axle outset/);
for(const side of[-1,1])for(const value of[NaN,Infinity,.51,-.51])
  assert.throws(()=>endpointAxleOutset({[side<0?'axleOutsetLeftM':'axleOutsetRightM']:value},side),/axle outset/);
assert.equal(endpointAxleOutset({axleOutsetM:.02,axleOutsetLeftM:.03},-1),.03);
assert.equal(endpointAxleOutset({axleOutsetM:.02,axleOutsetLeftM:.03},1),.02);
for(const value of [NaN,Infinity,0,-1,2])assert.throws(()=>sourceToothTip({toothTipRadiusM:value},.4),/tooth tip/);
assert.equal(sourceToothTip({},.44),.44);
assert.equal(sourceToothTip({toothTipRadiusM:.36207},.44),.35607);

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
for(const high of[true,false])for(const batch of[true,false]) {
  const model=fixture({roadWheelOutsetLeftM:.019,roadWheelOutsetRightM:-.021,
    sprocket:{...BASE.sprocket,axleOutsetLeftM:.031,axleOutsetRightM:-.027},
    idler:{...BASE.idler,axleOutsetLeftM:.019,axleOutsetRightM:-.021}},high,batch);
  try {
    model.gear.update(.19,-.37);
    for(const wheel of positions(model.root.getObjectByName('gearRoadWheelTires'))) {
      close(wheel.x,wheel.x<0?-(BASE.xc+.019):BASE.xc-.021,'independent side road datum survives spinning');
      close(wheel.y,BASE.wheelY,'asymmetric axial adjustment does not alter height');
    }
    for(const side of[-1,1]) {
      const band=model.root.getObjectByName(side<0?'gearTrackBandL':'gearTrackBandR');
      close(band.position.x,side*BASE.xc,'belt lane remains unchanged');
    }
    const verify=(p,kind)=>{
      const left=p.x<0,delta=kind==='sprocket'?(left?.031:-.027):(left?.019:-.021);
      close(Math.abs(p.x),BASE.xc+delta,'independent endpoint datum survives spinning');
    };
    if(batch) {
      const mesh=model.root.getObjectByName('gearEndWheelBody');
      for(let i=0;i<4;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);verify(new THREE.Vector3().setFromMatrixPosition(m),i<2?'sprocket':'idler');}
    } else model.root.traverse(o=>{if(o.name==='gearEndWheelBody')verify(o.position,o.userData.runningGearEndKind);});
    assert.equal(model.receipt.roadWheelOutsetLeftM,.019);
    assert.equal(model.receipt.roadWheelOutsetRightM,-.021);
    assert.equal(model.gear.roadWheelLayout.roadWheelOutsetRightM,-.021);
  } finally {model.dispose();}
}
for(const high of [true,false])for(const batch of [true,false]) {
  const model=fixture({idler:{...BASE.idler,axleOutsetM:-.0631}},high,batch);
  try {
    model.gear.update(.17,.21);
    if(batch) {
      const mesh=model.root.getObjectByName('gearEndWheelBody');
      for(const i of [2,3]){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);
        close(Math.abs(new THREE.Vector3().setFromMatrixPosition(m).x),BASE.xc-.0631,'batched measured idler axle, independent of belt');}
    } else model.root.traverse(o=>{
      if(o.name==='gearEndWheelBody'&&o.userData.runningGearEndKind==='idler')close(Math.abs(o.position.x),BASE.xc-.0631,'unbatched measured idler axle');
    });
    close(Math.abs(model.root.getObjectByName('gearTrackBandL').position.x),BASE.xc,'axle correction never moves band');
  } finally {model.dispose();}
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
for(const high of [true,false]) {
  const model=fixture({suspensionDimensions:{...SOURCE_SUSPENSION,anchorTrailM:.485275}},high);
  try {
    const bosses=positions(model.root.getObjectByName('gearSuspensionJointBosses'));
    for(let i=0;i<bosses.length;i+=2) {
      close(bosses[i].z-bosses[i+1].z,.485275,'source longitudinal arm anchor, not generic wheel-radius ratio');
    }
    model.gear.resetPose();
    const reset=positions(model.root.getObjectByName('gearSuspensionJointBosses'));
    for(let i=0;i<reset.length;i++)close(reset[i].distanceTo(bosses[i]),0,'source arm datum survives reset');
  } finally { model.dispose(); }
}
console.log('roadWheelRestHeights.selftest: measured axles/supports and independent moving suspension dimensions, fixed drum lanes, immutable inputs and eight original buffer snapshots pass');
