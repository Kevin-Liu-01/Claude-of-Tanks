import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90SMLeftLauncherShelf} from './t90SMXLauncherShelf.ts';

function first(root,x,z) {
  return new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0),0,2)
    .intersectObject(root,true).find(hit=>{
      for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
      return !/shadow/.test(hit.object.name);
    });
}
function near(actual,expected,tolerance,label) {
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
    `${label}: ${actual} versus independent source ${expected} ± ${tolerance}`);
}
for(const quality of ['high','low']) {
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  const helper=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  helper.position.set(.008,1.532,.359);
  addT90SMLeftLauncherShelf({addEquipment(bucket,geometry,x,y,z){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);helper.add(mesh);
  }});
  try {
    tank.root.updateMatrixWorld(true);helper.updateMatrixWorld(true);
    for(const [x,z,y]of [[-1.3,.1,2.07604],[-1.3,.18,2.09608],[-1.38,.20,2.109895],
      [-1.4,.05,2.075208],[-1.42,.1,2.090070],[-1.35,-.1,2.031790],
      [-1.249473,-.3,1.971371],[-1.05,-1.2,2.162947],[-1.5,.15,2.161580]]) {
      near(first(helper,x,z)?.point.y,y,.004,`${quality}: actual rear skin/drop/fore slope ${x}/${z}`);
    }
    for(const [x,z,y]of [[-1.3,.1,2.07604],[-1.3,.18,2.09608],[-1.3,.22,2.10416],
      [-1.3,.30,2.10942],[-1.38,.22,2.11121],[-1.38,.30,2.11647],
      [-1.50,.22,2.163283],[-1.52,.22,2.163750],[-1.54,.22,2.156004],
      [-1.50,.30,2.162194],[-1.55,.30,2.156601]]) {
      near(first(tank.root,x,z)?.point.y,y,.006,`${quality}: whole-model smoke support roof ${x}/${z}`);
    }
    const air=new THREE.Raycaster(new THREE.Vector3(-1.30,2.10,.1),new THREE.Vector3(0,1,0),0,.065);
    assert.equal(air.intersectObject(helper,true).length,0,
      `${quality}: no obsolete high sheet across the actual launcher approach air`);
    const underside=new THREE.Raycaster(new THREE.Vector3(-1.30,2.00,.1),new THREE.Vector3(0,1,0),0,.1)
      .intersectObject(helper,true)[0];
    near(underside?.point.y,2.06904,.004,`${quality}: closed 7 mm inclined sheet, not removed floor`);
    const end=new THREE.Box3().setFromObject(helper).max.z;
    assert.ok(end>.2087&&end<.210,`${quality}: narrow positive join to actual forward folded carrier`);
  } finally {
    tank.dispose();helper.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});material.dispose();
  }
}
console.log('t90SMXLauncherShelf: source diagonal drop, inclined closed floor, narrow outer lip and unobstructed approach pass high/low');
