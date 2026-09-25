import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { KIT, trackPatternWithDimensions } from './tankFactoryCore.ts';
import { TRACK_PATTERN_IDS, trackPatternFor } from './trackPatterns.ts';

// Russian X track standard 2026-09-12 (owner decision, applied to t90m_x too):
// the measured T-90M shoe carries the .036 pad and .018 web; horn, grouser,
// pin radius and pin centre are the source values.
const dimensions=Object.freeze({
  padHeight:.036,grouserHeight:.008,webHeight:.018,
  hornHeight:.054,pinRadius:.012,pinCentreY:0,
});

// An absent override is exactly the original immutable family object, for
// every family, not a widened set of replacement defaults.
for(const id of TRACK_PATTERN_IDS) {
  const original=trackPatternFor(null,null,id),snapshot=structuredClone(original);
  assert.equal(trackPatternWithDimensions(original),original);
  const measured=trackPatternWithDimensions(original,dimensions);
  assert.ok(Object.isFrozen(measured));
  assert.deepEqual(original,snapshot);
  for(const key of Object.keys(original)) {
    assert.equal(measured[key],Object.hasOwn(dimensions,key)?dimensions[key]:original[key]);
  }
}
const family=trackPatternFor({id:'t90m'});
for(const invalid of [{padHeight:0},{hornHeight:-.1},{pinRadius:NaN},
  {webHeight:Infinity},{grouserHeight:.51},{pinCentreY:.51},{surface:.1}]) {
  assert.throws(()=>trackPatternWithDimensions(family,invalid),/native track-shoe|Native track-shoe/);
}

function fingerprint(geometry) {
  const hash=createHash('sha256');
  for(const key of Object.keys(geometry.attributes).sort()) {
    hash.update(key);
    const values=geometry.attributes[key].array;
    hash.update(Buffer.from(values.buffer,values.byteOffset,values.byteLength));
  }
  if(geometry.index) {
    const values=geometry.index.array;
    hash.update(Buffer.from(values.buffer,values.byteOffset,values.byteLength));
  }
  return hash.digest('hex');
}

// Frozen immediately before the optional core API was introduced. These
// compare actual native geometry buffers, including normals/UVs/indices.
const DEFAULT_SHOE_HASHES={
// 2026-09-12 fleet track/wheel standard: Russian X bands .030 (pads .036, webs .018),
// the fleet .024 band on AMX-30 X / AMX-40 X / Chieftain 5 X (course datums re-seated),
// and the scheme-painted pressed dish (plate 0.82 r) move every affected digest;
// values below are repinned from the current build.
// 2026-09-25 FSP-03: t90m / t90a shoe digests re-pinned once — their upper runs ride three fitted return rollers
// again (the course re-samples its shoes); m1a2 and leo2a5 are untouched.
  t90m:'dbaf072016ba3a5817d34a6ec66439150a3f1c6b8831a7dc7bdae7c65427dfce',
  t90a:'1188aa853e99482e0a6c8779f898b358012af8220ca606da8fa9446646c95a2d',
  m1a2:'f3560a314db1253320a3bcba4f30583941afb8173bc631fbcb397ed6ecf56d04',
  leo2a5:'2eaee5604c73145eff5acd5b874b990151cbc3a4970b62ea39d810066e5eae87',
};
const DEFAULT_WHEEL_HASHES={
// 2026-09-22 nation wheel standard (owner: "standardize our wheels across NATIONS! then we can delete any wheels we dont use anymore"): t90m and t90a draw the Russia T-90M X pressed face over the
// fleet pressed disc (tires unchanged, discs/insets repinned) and leo2a5 the Germany Leopard 2A6 X paired dish
// (tires/discs repinned; the construction emits no gearRoadWheelInsets). m1a2 is a donor and did not move.
  t90m:['ee1267357b9821551acdc43bb28b13bb0552b074fd41564b086002ac19713c05','1c097b71ade6ffbe0e876c438766b19f46cc59cde2f2498c8e4ab7b76280a5ec','c7f4628483d7f6c3db60cd57f383ce9bf6011d24249c9cc7329acab8e5d74d50'],
  t90a:['8f3493bf9c592f0f519f567e09fdeeac88cc37f2e34af0f5afdcfa3a7d9b1e43','8b1be60aa0da4d158d34bcc0fe7e4ea1a7811931c38fb133f05ab1122f8f254e','89a0db99a3fdaa7fd63e239ea3b479bb21560d91c33431f747f99e09409bf08c'],
// 2026-09-13 wheel review: m1a2 draws the hollow paired road wheel (hollowRoadWheelStock.ts — two
// turned halves on a narrow axle, no separate inset ring), so tires/discs are repinned from the
// current build and the inset entry is null (the construction emits no gearRoadWheelInsets).
  m1a2:['c37665c53d90b9b8cdaa198bb2c710de51fae568191c9dfc57a74b044d81009f','8eca4e85ac692ef6d4544a395d15191ed33e2a31e72f79c0448cce5d713ce934',null],
  leo2a5:['c39380f0bd89539ac34aa3a771fceb189a37fe9d2f7e1cb871a2f44a61a40a89','791d4ae6cbc71a41244123637871b778b63d930d1bc8cfc32a8b32fb70cbd453',null],
};
for(const [id,expected] of Object.entries(DEFAULT_SHOE_HASHES)) {
  const tank=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  try {
    assert.equal(fingerprint(tank.root.getObjectByName('gearTrackPads').geometry),expected,id);
    for(const [i,name] of ['gearRoadWheelTires','gearRoadWheelDiscs','gearRoadWheelInsets'].entries()) {
      const mesh=tank.root.getObjectByName(name);
      if(DEFAULT_WHEEL_HASHES[id][i]===null) { assert.equal(mesh,undefined,`${id}/${name}: this wheel construction emits no such stock`); continue; }
      assert.equal(fingerprint(mesh.geometry),DEFAULT_WHEEL_HASHES[id][i],`${id}/${name}`);
    }
  }
  finally {tank.dispose();}
}

// Frozen before return-roller options were introduced: both actual default
// surfaces and all native instance transforms remain bit-identical.
{
  const visual=createTank('m60a1',null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  try {
    const tire=visual.root.getObjectByName('gearReturnRollerTires');
    const disc=visual.root.getObjectByName('gearReturnRollerDiscs');
    assert.equal(fingerprint(tire.geometry),'5d861b5efdce2f1e41d783aaf6c0063e04c3b67504ebfed2ecd314ab7942b3ba');
    assert.equal(fingerprint(disc.geometry),'a5560ea880426c7c1d40b8b9c4a21478a63bd582aefd409576d7f123750790bc');
    assert.equal(fingerprint({attributes:{instanceMatrix:tire.instanceMatrix}}),'776c27d8b0ced218eebf7b6008e2513582b46399a87223e895c1bf2ddf81d8f8');
  } finally {visual.dispose();}
}
for(const invalid of [{returnRollerWidthM:0},{returnRollerWidthM:NaN},{returnRollerWidthM:1.1},
  {returnRollerInsetM:-.01},{returnRollerInsetM:Infinity},{returnRollerInsetM:.51}]) {
  assert.throws(()=>KIT.buildRunningGear({spec:{},disposables:[],mats:{},hullG:new THREE.Group(),add(){}},
    {wheelR:.4,wheelW:.3,wheelZs:[-1,0,1],xc:1.3,sprocket:{z:-2,y:.7,r:.3},
      idler:{z:2,y:.7,r:.3},trackW:.5,topY:1,...invalid}),/Native return-roller/);
}

const tank=createTank('t90m_x',null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
try {
  const shoes=tank.root.getObjectByName('gearTrackPads');
  assert.ok(shoes?.isInstancedMesh&&shoes.count>=80);
  assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'),undefined);
  const geometry=shoes.geometry;
  geometry.computeBoundingBox();
  const bounds=geometry.boundingBox;
  // Canonical owner source: complete radial shoe/guide span .087072 m;
  // outer shoe only .03338 m. Russian X track standard 2026-09-12 (owner
  // decision: applied to t90m_x too): the .036 pad and .018 web raise the
  // complete span to .110 m while the guide horn and shoe width are unchanged.
  assert.ok(Math.abs(bounds.max.y-bounds.min.y-.110)<.005);
  assert.ok(Math.abs(bounds.max.x-bounds.min.x-.58976)<.002);
  const vertices=geometry.getAttribute('position');
  const outer=[];
  for(let i=0;i<vertices.count;i++)if(Math.abs(vertices.getX(i))>.13)outer.push(vertices.getY(i));
  assert.ok(Math.abs(Math.max(...outer)-Math.min(...outer)-.058)<.005); // outer shoe .058 under the .036 pad / .018 web standard
  assert.ok(bounds.min.y<Math.min(...outer)-.045,'a real projecting central guide remains');
  // Face-depth tuning leaves native tire depth/radius and the single shoe
  // untouched. The resulting hub remains inside the measured shoe face.
  const tires=tank.root.getObjectByName('gearRoadWheelTires').geometry;
  const discs=tank.root.getObjectByName('gearRoadWheelDiscs').geometry;
  tires.computeBoundingBox();discs.computeBoundingBox();
  assert.ok(Math.abs(tires.boundingBox.max.x-tires.boundingBox.min.x-.438*1.03)<.002);
  assert.ok(Math.abs(discs.boundingBox.max.x-.438*.74*.695)<.002);
  assert.ok(Math.abs(discs.boundingBox.max.z/discs.boundingBox.max.y-1.04465)<.04);
  assert.ok(discs.boundingBox.max.x<bounds.max.x);
  const expected=KIT.trackShoeGeometry(.608,.15,trackPatternWithDimensions(family,dimensions));
  try {
    expected.computeBoundingBox();
    assert.ok(Math.abs(expected.boundingBox.min.y-bounds.min.y)<.001);
  } finally {expected.dispose();}
} finally {tank.dispose();}

// Actual added faces remain on the original suspension entries. Source
// outboard tire/hub witnesses are independent local-oracle measurements;
// the wider shoe envelope is not used as a target for wheel-face growth.
for(const [id,sourceFaceX] of [['t90a_x',1.7089],['t90m_x',1.66133],['t90sm_x',1.6334]]) {
  const visual=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  try {
    const tire=visual.root.getObjectByName('gearRoadWheelTires');
    const names=['PressedFaces','Rims','Hubs','Bolts'];
    const layers=names.map(name=>visual.root.getObjectByName(`gearRoadWheelSource${name}`));
    for(const layer of layers) {
      assert.ok(layer?.isInstancedMesh&&layer.userData.dynamicWheelFace,`${id}: native dynamic wheel layer`);
      assert.equal(layer.count,12,`${id}: exactly one face per physical road wheel`);
      layer.geometry.computeBoundingBox();
      const matrix=new THREE.Matrix4(),box=new THREE.Box3();
      for(let i=0;i<layer.count;i++) {
        layer.getMatrixAt(i,matrix);
        box.copy(layer.geometry.boundingBox).applyMatrix4(matrix);
        assert.ok(Math.max(Math.abs(box.min.x),Math.abs(box.max.x))<sourceFaceX+(id==='t90sm_x'?.006:.037),
          `${id}: source-measured face stays within its small hardware-depth tolerance`);
      }
    }
    const before=layers.map(layer=>Array.from(layer.instanceMatrix.array));
    const state=createTankState(getSpec(id),new THREE.Vector3(),0);
    visual.setGroundSampler((x,z)=>Math.abs(z)<.6?-.12:0);
    state.trackScroll.l=.27;state.trackScroll.r=.16;
    for(let i=0;i<12;i++)visual.syncFromState(state,1/30,20);
    for(const [j,layer] of layers.entries()) {
      assert.notDeepEqual(Array.from(layer.instanceMatrix.array),before[j],`${id}: face follows running gear motion`);
      for(let i=0;i<layer.count;i++) {
        const faceMatrix=new THREE.Matrix4();layer.getMatrixAt(i,faceMatrix);
        const facePosition=new THREE.Vector3().setFromMatrixPosition(faceMatrix);
        let matched=false;
        for(let k=0;k<tire.count;k++) {
          const tireMatrix=new THREE.Matrix4();tire.getMatrixAt(k,tireMatrix);
          const tirePosition=new THREE.Vector3().setFromMatrixPosition(tireMatrix);
          if(Math.sign(facePosition.x)!==Math.sign(tirePosition.x)
            ||Math.abs(facePosition.z-tirePosition.z)>1e-6||Math.abs(facePosition.y-tirePosition.y)>1e-6)continue;
          matched=true;
          for(const index of [0,1,2,4,5,6,8,9,10])assert.ok(Math.abs(faceMatrix.elements[index]-tireMatrix.elements[index])<1e-6,
            `${id}: face shares the actual tire rotation and suspension transform`);
        }
        assert.ok(matched,`${id}: no independent floating cosmetic wheel station`);
      }
    }
  } finally {visual.dispose();}
}
// Independent straight-run source witnesses include the central guide, not
// just the outer pad skin. Optional casting dimensions do not rescale tires.
// Russian X track standard 2026-09-12: outer casting = pad .036 + web .018
// plus each class's grouser; the full span keeps each source guide horn.
for(const [id,outerSpan,fullSpan] of [
  ['t90a_x',.0630,.1610],['t90a_vladimir_x',.0650,.1880],
  ['t90m_x',.0580,.1100],['t90sm_x',.0635,.1468],
]) {
  const visual=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  try {
    const geometry=visual.root.getObjectByName('gearTrackPads').geometry;
    geometry.computeBoundingBox();
    const b=geometry.boundingBox,a=geometry.getAttribute('position'),outside=[];
    for(let i=0;i<a.count;i++)if(Math.abs(a.getX(i))>.13)outside.push(a.getY(i));
    assert.ok(Math.abs(b.max.y-b.min.y-fullSpan)<.005,`${id}: physical complete shoe/guide thickness`);
    assert.ok(Math.abs(Math.max(...outside)-Math.min(...outside)-outerSpan)<.004,`${id}: source outer casting thickness`);
    assert.ok(b.min.y<Math.min(...outside)-.045,`${id}: independent inward guide remains`);
  } finally {visual.dispose();}
}

// FSP-03 2026-09-25 (owner: rollers wherever the real vehicle has them): the T-72/T-90 family carries three return
// rollers per side (FAS T-72 entry; the T-90A X source `support wheels` node), so the round-46b rollerless assertion is
// reversed — the T-90A X and T-90A Vladimir X carry their six source-measured rollers again.
for(const id of ['t90a_x','t90a_vladimir_x']) {
  const visual=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  try {
    const discs=visual.root.getObjectByName('gearReturnRollerDiscs');
    assert.ok(discs?.isInstancedMesh&&discs.count===6,`${id}: three source-measured return rollers per side on a T-90 hull`);
  } finally {visual.dispose();}
}
console.log('trackShoeDimensions.selftest: pinned original geometry, four measured shoes/faces and native moving-wheel ownership pass');
