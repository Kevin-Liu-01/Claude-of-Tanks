import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { KIT, trackPatternWithDimensions } from './tankFactoryCore.ts';
import { TRACK_PATTERN_IDS, trackPatternFor } from './trackPatterns.ts';

const dimensions=Object.freeze({
  padHeight:.018,grouserHeight:.008,webHeight:.012,
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
  t90m:'bda8b3949d239432af860ed0d00214b95803ecbaedbd5e62c0bf002b81c325f4',
  t90a:'870d3a3ba9415f3c7736d7ec183e27f9ad6af7b0d5ef623daa615236ae0bb0ee',
  m1a2:'c9d6ce76343d78e88d2e69de32e81ab32c33fcb74b982c164765618b4fd7f75d',
  leo2a5:'9770319bbc269e88d024b36ae390d7a27bad6b9a38b43972725d6bd6b3d854ca',
};
const DEFAULT_WHEEL_HASHES={
  t90m:['ee1267357b9821551acdc43bb28b13bb0552b074fd41564b086002ac19713c05','a5b9facdc1a64fb6bd465b2df3c8fe2b4cb322748bc16ed5afe27584fe7828f8','acdbaa171048c805e97fcbeb5dd2b575b4817caf964dc91ff5c21dc572272526'],
  t90a:['a54a43055f2861026b4ceab5d270317974edceb01e6dda725ca0d03b44339e73','3ffc5fa9cb6e1c387e5b637767a442503bc62a18dd37c9b28e0c256bb0a296c5','dc166f87b5e612e417532b37a3124c3d5ab0c775a3c8e40e71f53053b20e3599'],
  m1a2:['34257b15bdc31935cf0a4c2cb11261cca2a674690780f252477f3976fb44d949','87ed9df0bee59ae4b0b2467990a7e41586b9ce1142462d28e2fc65405bed2518','daf1e8d6766d235176312214a8791c5162fe252d0683265e1c604f1c2c387d5f'],
  leo2a5:['2a635e4bdc9b37093cf67f7f9aa5fac83aded77cb19094ea2a01143e5f8e30b8','c0836b759e64859f643819cc270d52dd0d3e3bc20f2016360f5f2206fa893635','5447ad96a8234a3e656dc9ca7d003dca1216b2bdd22a958e8210c955f3e61a8b'],
};
for(const [id,expected] of Object.entries(DEFAULT_SHOE_HASHES)) {
  const tank=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  try {
    assert.equal(fingerprint(tank.root.getObjectByName('gearTrackPads').geometry),expected,id);
    for(const [i,name] of ['gearRoadWheelTires','gearRoadWheelDiscs','gearRoadWheelInsets'].entries()) {
      assert.equal(fingerprint(tank.root.getObjectByName(name).geometry),DEFAULT_WHEEL_HASHES[id][i],`${id}/${name}`);
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
  // outer shoe only .03338 m. Independent native grammar retains both.
  assert.ok(Math.abs(bounds.max.y-bounds.min.y-.087072)<.005);
  assert.ok(Math.abs(bounds.max.x-bounds.min.x-.58976)<.002);
  const vertices=geometry.getAttribute('position');
  const outer=[];
  for(let i=0;i<vertices.count;i++)if(Math.abs(vertices.getX(i))>.13)outer.push(vertices.getY(i));
  assert.ok(Math.abs(Math.max(...outer)-Math.min(...outer)-.03338)<.005);
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
for(const [id,outerSpan,fullSpan] of [
  ['t90a_x',.0601,.1575],['t90a_vladimir_x',.0743,.1974],
  ['t90m_x',.03338,.087072],['t90sm_x',.0555,.1388],
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

for(const [id,width,y,r,zs,outboard] of [
  ['t90a_x',.1878,1.00456,.110695,[-1.6497,.3703,2.0961],1.42825],
  ['t90a_vladimir_x',.1172,.98969,.11452,[-1.55863,.39502,2.39302],1.40931],
]) {
  const visual=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  try {
    const rollers=visual.root.getObjectByName('gearReturnRollerDiscs');
    assert.equal(rollers.count,6,`${id}: native three-per-side source support count`);
    rollers.geometry.computeBoundingBox();
    const b=rollers.geometry.boundingBox;
    assert.ok(Math.abs(b.max.x-b.min.x-width)<.001,`${id}: measured full roller axial face width`);
    const tires=visual.root.getObjectByName('gearReturnRollerTires');
    tires.geometry.computeBoundingBox();
    assert.ok(Math.abs(tires.geometry.boundingBox.max.y-r)<.001,`${id}: measured roller radial size unchanged by axial override`);
    const matrix=new THREE.Matrix4(),p=new THREE.Vector3();
    for(let i=0;i<rollers.count;i++) {
      rollers.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);
      assert.ok(zs.some(z=>Math.abs(p.z-z)<1e-5)&&Math.abs(p.y-y)<1e-5,`${id}: source support centers`);
      const world=b.clone().applyMatrix4(matrix);
      assert.ok(Math.max(Math.abs(world.min.x),Math.abs(world.max.x))<=outboard+.018,
        `${id}: roller stays on the measured inward support axle`);
    }
  } finally {visual.dispose();}
}
console.log('trackShoeDimensions.selftest: pinned original geometry, four measured shoes/faces and native moving-wheel ownership pass');
