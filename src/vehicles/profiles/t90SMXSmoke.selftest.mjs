import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addT90SMSmoke } from './t90SMXSmoke.ts';

const receipt=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90sm_x.smoke-source.json',import.meta.url),'utf8'));
assert.equal(receipt.measurements.length,12,'twelve independently identified source launchers');

function near(value,target,tolerance,label) {
  assert.ok(Number.isFinite(value)&&Math.abs(value-target)<=tolerance,
    `${label}: ${value} versus independent source ${target} ± ${tolerance}`);
}

function ray(root,origin,direction,far=.5) {
  return new THREE.Raycaster(origin,direction,0,far).intersectObject(root,true).find(hit=>{
    for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
    return !/shadow/.test(hit.object.name);
  });
}

function helperGeometry() {
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  root.position.set(.008,1.532,.359);
  addT90SMSmoke({addEquipment(bucket,geometry,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(geometry,material);mesh.name=bucket;mesh.position.set(x,y,z);root.add(mesh);
  }});
  root.updateMatrixWorld(true);
  return {root,material};
}

function checkMouth(root,m,label) {
  const axis=new THREE.Vector3(...m.axis),mouth=new THREE.Vector3(...m.mouth);
  const center=ray(root,mouth.clone().addScaledVector(axis,.08),axis.clone().negate());
  near(center?.distance,.08+m.floorDepth,.002,`${label}: blind bore center depth`);
  for(const held of m.heldOutRays) {
    const origin=new THREE.Vector3(...held.origin),direction=new THREE.Vector3(...held.direction);
    near(ray(root,origin,direction)?.distance,held.distance,.006,
      `${label}: held-out mouth/rim ${held.offsetUV}`);
    if(Math.max(...held.offsetUV.map(Math.abs))<.02) {
      assert.equal(ray(root,origin,direction,.135),undefined,
        `${label}: first 55 mm behind the lip is genuine air, never a painted cap`);
    }
  }
}

function checkClosedBody(root,m,index) {
  const bodies=root.children.filter(mesh=>mesh.geometry.type==='LatheGeometry');
  const body=bodies[index],axis=new THREE.Vector3(...m.axis),back=new THREE.Vector3(...m.back);
  const rear=ray(body,back.clone().addScaledVector(axis,-.04),axis,.08);
  near(rear?.distance,.040,.00002,`launcher ${m.island}: closed physical rear cap`);
  const meshBox=new THREE.Box3().setFromObject(body);
  assert.ok(meshBox.containsPoint(new THREE.Vector3(...m.mouth)),'measured mouth remains inside actual stock extent');
}

for(const quality of ['high','low']) {
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  const helper=helperGeometry();
  try {
    tank.root.updateMatrixWorld(true);
    assert.equal(helper.root.children.length,24,'12 closed bodies and 12 dark tips; both banks have separate measured brackets');
    for(const [index,m]of receipt.measurements.entries()) {
      checkMouth(helper.root,m,`${quality} isolated ${m.island}`);
      checkMouth(tank.root,m,`${quality} complete model ${m.island}`);
      checkClosedBody(helper.root,m,index);
    }
  } finally {
    tank.dispose();for(const mesh of helper.root.children)mesh.geometry.dispose();helper.material.dispose();
  }
}
console.log('t90SMXSmoke: 12 measured axes, 192 held-out rim/cone rays, genuine mouth air and closed stocks pass high/low');
