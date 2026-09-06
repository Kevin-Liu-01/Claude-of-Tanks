import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
const source=JSON.parse(readFileSync(new URL('../../../docs/references/tanks/t90a_x.smoke-fixtures.json',import.meta.url),'utf8'));

function hits(root,origin,direction,far) {
  return new THREE.Raycaster(origin,direction,0,far).intersectObject(root,true).filter(hit=>{
    for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
    return !/shadow/i.test(hit.object.name);
  });
}

for(const quality of ['high','low']) {
  const tank=createTank('t90a_x',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    tank.root.updateMatrixWorld(true);
    const turret=tank.root.getObjectByName('rig_turret');
    for(const row of source.caps) {
      const front=new THREE.Vector3(...row.front),back=new THREE.Vector3(...row.back);
      const dir=front.clone().sub(back).normalize();
      const hit=hits(turret,front.clone().addScaledVector(dir,.045),dir.clone().negate(),.09)[0];
      assert.ok(hit&&hit.point.distanceTo(front)<.001,
        `${quality}: ${row.sourceNode} cap ${hit?.point.toArray()} must match independent source ${front.toArray()}`);
      const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      assert.ok(normal.dot(dir)>.999,`${quality}: ${row.sourceNode} cap follows its own tube axis`);
    }
    for(const x of [-1.53,1.57]) {
      const hit=hits(turret,new THREE.Vector3(x,3,.15),new THREE.Vector3(0,-1,0),2)[0];
      assert.ok(!hit||hit.point.y<1.97,
        `${quality}: upper bank cannot project its former high caps outboard at ${x}`);
    }
  } finally { tank.dispose(); }
}
console.log('t90AXSmoke: twelve independent source cap axes, inboard upper bank and supported envelope pass high/low');
