import assert from 'node:assert/strict';
import * as THREE from 'three';
import {closedSectionLoft,planeBoundedArmor,profiledTube,roundMember} from './profiles/abramsSourceXGeometry.ts';

const ring = [[-1,0],[1,0],[1,.4],[2,.4],[2,1],[-2,1],[-2,.4],[-1,.4]];
const loft = closedSectionLoft([{z:-2,ring},{z:2,ring}]);
const p = loft.attributes.position;
const edges = new Map();let volume = 0;
const key = v => v.toArray().map(n=>n.toFixed(6)).join(',');
for (let i=0;i<p.count;i+=3) {
  const vs=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j));
  volume += vs[0].dot(vs[1].clone().cross(vs[2]))/6;
  for (let j=0;j<3;j++) {
    const a=key(vs[j]),b=key(vs[(j+1)%3]);const k=[a,b].sort().join('|');
    const prior=edges.get(k)||{count:0,balance:0};prior.count++;prior.balance+=a<b?1:-1;edges.set(k,prior);
  }
}
assert.ok(volume>0,'closed loft is outward-facing');
for (const e of edges.values()) assert.deepEqual(e,{count:2,balance:0},'watertight caps and side joins');
assert.throws(()=>closedSectionLoft([{z:1,ring},{z:0,ring}]),/ascend/);
assert.throws(()=>closedSectionLoft([{z:0,ring:ring.toReversed()},{z:1,ring:ring.toReversed()}]),/counterclockwise/);

const tube=profiledTube([{z:0,r:.15},{z:1,r:.12},{z:2,r:.1}],.06);
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const mesh=new THREE.Mesh(tube,material);mesh.updateMatrixWorld(true);
const ray=new THREE.Raycaster(new THREE.Vector3(0,0,3),new THREE.Vector3(0,0,-1));
assert.equal(ray.intersectObject(mesh).length,0,'muzzle center is real open geometry');
ray.ray.origin.x=.08;
assert.ok(ray.intersectObject(mesh).length>0,'muzzle annular rim exists');
const strut=roundMember([0,1,0],[1,2,3],.02);strut.computeBoundingBox();
assert.ok(strut.boundingBox.min.y<1.02&&strut.boundingBox.max.z>2.99);
const planes=[[1,0,0,1],[-1,0,0,1],[0,1,0,2],[0,-1,0,0],
  [0,0,1,2],[0,0,-1,1],[0,1,1,3]];
const armor=planeBoundedArmor(planes);
const ap=armor.getAttribute('position');let armorVolume=0;
for(let i=0;i<ap.count;i+=3){
  const vs=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(ap,i+j));
  armorVolume+=vs[0].dot(vs[1].clone().cross(vs[2]))/6;
  for(const v of vs)for(const [x,y,z,d]of planes)assert.ok(x*v.x+y*v.y+z*v.z<=d+1e-6);
}
assert.ok(Math.abs(armorVolume-11)<1e-6,'plane intersection solid has exact clipped volume and outward winding');
assert.throws(()=>planeBoundedArmor([[1,0,0,0]]),/four to sixteen/);
assert.throws(()=>planeBoundedArmor([[1,0,0,0],[-1,0,0,-1],[0,1,0,1],[0,0,1,1]]),/enclose/);
for(const g of [loft,tube,strut,armor])g.dispose();material.dispose();
console.log('Abrams X construction: outward watertight concave loft, real open bore and attached round member PASS');
