import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {installCanvasFixture} from './canvasFixture.test-support.mjs';
import {FIXED_SOURCE_SKIRTS,verifyHistoricalFixedSkirtSource,withHistoricalFixedSkirtFinish} from './fixedSourceSkirtPaint.test-support.mjs';

const changed=new Set(['hullRubber','hullFixedPaintedBodywork']);
function geometryHash(g){const h=createHash('sha256');
  for(const name of Object.keys(g.attributes).sort()){const a=g.attributes[name];h.update(name).update(String(a.itemSize)).update(String(a.normalized));h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
  if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');}
function other(root){const rows=[];root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh||changed.has(o.name))return;
  rows.push([o.name,geometryHash(o.geometry),o.matrixWorld.elements,o.material.name,o.count??null,
    o.instanceMatrix?Array.from(o.instanceMatrix.array):null,o.userData.combatHitboxRole]);});return rows;}
function skinCloud(root){const rows=[];root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh||!changed.has(o.name))return;
  const p=o.geometry.attributes.position,ix=o.geometry.index;
  for(let i=0;i<(ix?.count??p.count);i+=3){const corners=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(o.matrixWorld).toArray().join(','));
    rows.push([0,1,2].map(j=>[corners[j],corners[(j+1)%3],corners[(j+2)%3]].join('|')).sort()[0]);}
  });return rows.sort();}
function paint(tank,id){const skin=tank.root.getObjectByName('hullFixedPaintedBodywork'),hull=tank.root.getObjectByName('hull');
  assert.ok(skin?.isMesh);assert.equal(skin.material,hull.material);assert.ok(skin.material.map?.isTexture);
  assert.equal(skin.parent.name,'rig_hull','retains the previous rubber skin full-distance coverage');
  assert.equal(skin.userData.combatHitboxRole,'nonArmor');assert.equal(skin.userData.appearanceRole,'armorPaint');
  assert.equal(skin.userData.materialOnlyPaintSourceBucket,'hullRubber');assert.equal(skin.userData.materialOnlyPaintMigration,true);
  const p=skin.geometry.attributes.position,n=skin.geometry.attributes.normal,uv=skin.geometry.attributes.uv,scale=getSpec(id).visual.camoScale??.34;
  for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    const u=ny>=nx&&ny>=nz?p.getX(i):nx>=nz?p.getZ(i):p.getX(i),v=ny>=nx&&ny>=nz?p.getZ(i):p.getY(i);
    assert.equal(uv.getX(i),Math.fround(u*scale));assert.equal(uv.getY(i),Math.fround(v*scale));}
  return skin;
}
const restore=installCanvasFixture();let checks=0;
try{for(const id of Object.keys(FIXED_SOURCE_SKIRTS)){
  verifyHistoricalFixedSkirtSource(id);
  for(const quality of ['high','low'])for(const camoPattern of ['factory','winter']){
    const build=()=>createTank(id,null,{quality,camoPattern,materialMode:'rendered',proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    const before=withHistoricalFixedSkirtFinish(id,build),after=build();
    try{
      const skin=paint(after,id);
      for(const yaw of [0,.73,-1.21]){
        for(const tank of [before,after]){
          for(const zone of [...new Set((tank.root.userData.eraVisualBindingReceipt?.plates??[]).filter(p=>p.registered).map(p=>p.name))])tank.stripEra(zone);
          tank.root.position.set(.3,.07,-.4);tank.root.rotation.set(.03,yaw,-.02);
          tank.root.getObjectByName('rig_turret').rotation.y=-yaw*.4;tank.root.getObjectByName('rig_gun').rotation.x=-.12;tank.root.updateMatrixWorld(true);
        }
        assert.deepEqual(skinCloud(after.root),skinCloud(before.root),'every actual skirt/flap triangle unchanged at posed/spent state');
        assert.deepEqual(other(after.root),other(before.root),'all other parts, track/wheel stock, materials and transforms unchanged');
        assert.ok(skin.visible,'fixed skirt survives ERA depletion');checks++;
      }
      const map=skin.material.map;skin.material.map=null;
      assert.throws(()=>paint(after,id),'a plain untextured painted bucket cannot pass');skin.material.map=map;
      console.log(`${id}/${quality}/${camoPattern}: ${FIXED_SOURCE_SKIRTS[id].count} camouflaged fixed sheets, immutable physical skin, all other buffers exact, permanent coverage PASS`);
    }finally{before.dispose();after.dispose();}
  }
}}finally{restore();}
console.log(`fixedSourceSkirtPaint: three authenticated source profiles, ${checks} posed/depleted whole-model differentials PASS; native visual review remains separate`);
