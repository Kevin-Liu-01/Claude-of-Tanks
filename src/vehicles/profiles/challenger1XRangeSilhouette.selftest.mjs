// 264c: the TOGS barbette is turret equipment (out of the turret shell's hit cells) that opts in to rangeSilhouette
// (tankFactoryCore): it merges in a mesh of its own, stands past LOD1 like the shells and casts with the turret's
// shadow proxy as a hull of its own, joined into that proxy's one draw. Fleet byte-identity of the ids without the flag
// is the fleet geometry ledger's (docs/references/fleet-geometry-ledger.json).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const insetM=.05;
for(const id of ['challenger1_mk1','challenger1_mk2','challenger1_mk3'])for(const quality of ['high','low']){
 const t=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality});
 try{
  t.root.updateMatrixWorld(true);
  const turret=t.root.getObjectByName('rig_turret');
  const flagged=[];
  t.root.traverse(o=>{if(o.isMesh&&o.userData.rangeSilhouette)flagged.push(o);});
  assert.equal(flagged.length,1,`${id}/${quality}: one rangeSilhouette mesh (the TOGS barbette)`);
  const [barbette]=flagged;
  assert.equal(barbette.name,'turretEquipment',`${id}/${quality}: the barbette keeps the equipment bucket`);
  assert.equal(barbette.userData.combatHitboxRole,'equipment',`${id}/${quality}: and its equipment hit role`);
  for(let n=barbette.parent;n&&n!==t.root;n=n.parent)assert.ok(!n.isLOD,`${id}/${quality}: the barbette stands past LOD1`);
  const proxy=turret.getObjectByName('procShadow_turret');
  assert.equal(proxy.geometry.userData.shadowHulls,2,`${id}/${quality}: the turret proxy joins the shell's hull and the barbette's`);
  const inTurret=o=>{const b=new THREE.Box3().setFromObject(o);return b.applyMatrix4(new THREE.Matrix4().copy(turret.matrixWorld).invert());};
  const box=inTurret(barbette),caster=inTurret(proxy);
  assert.ok(Math.abs(caster.max.y-(box.max.y-insetM))<.002,
   `${id}/${quality}: the proxy reaches the barbette's top less the inset (${caster.max.y} vs ${box.max.y})`);
  assert.ok(caster.min.x<=box.min.x+insetM+.002,`${id}/${quality}: and its outer side`);
 }finally{t.dispose();}
}
console.log('challenger1XRangeSilhouette: the TOGS barbette is one rangeSilhouette equipment mesh past LOD1, with its own hull in the turret shadow proxy, on all three marks at HIGH and LOW');
