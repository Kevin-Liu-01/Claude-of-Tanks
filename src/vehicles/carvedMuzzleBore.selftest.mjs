import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCarvedMuzzleBore, verifyCarvedMuzzleBore } from './carvedMuzzleBore.ts';

for (const shape of ['cylinder', 'box']) {
  const root = new THREE.Group(), frame = new THREE.Group();
  root.position.set(3, 1, -2); root.rotation.set(.2, .8, -.1);
  root.add(frame);
  const source = shape === 'cylinder'
    ? new THREE.CylinderGeometry(.08, .08, .4, 24).rotateX(Math.PI / 2).translate(0, 0, -.2)
    : new THREE.BoxGeometry(.2, .16, .4).translate(0, 0, -.2);
  const paint = new THREE.MeshBasicMaterial(), steel = new THREE.MeshBasicMaterial({color: 0x333333});
  const mesh = new THREE.Mesh(source, paint); root.add(mesh); root.updateMatrixWorld(true);
  const before = Array.from(source.getAttribute('position').array), owned = [];
  const cost = installCarvedMuzzleBore([root], frame, .045, .12, steel, owned);
  assert.ok(cost.removedTriangles > 0, 'native solid cap is actually cut');
  assert.deepEqual(Array.from(source.getAttribute('position').array), before, 'shared input geometry is immutable');
  const ray = new THREE.Raycaster();
  const hit = (x, y, z, direction) => {
    ray.set(frame.localToWorld(new THREE.Vector3(x,y,z)), direction.clone().transformDirection(frame.matrixWorld));
    const result = ray.intersectObject(root, true)[0];
    return result ? frame.worldToLocal(result.point.clone()) : null;
  };
  root.updateMatrixWorld(true);
  for (const [x,y] of [[.001,.002],[.022,.005],[-.015,.02]]) {
    assert.ok(Math.abs(hit(x,y,.02,new THREE.Vector3(0,0,-1)).z + .12) < 1e-6, 'opening reaches the recessed floor');
  }
  assert.ok(Math.abs(hit(.06,0,.02,new THREE.Vector3(0,0,-1)).z) < 1e-6, 'original rim remains on the native face');
  assert.ok(hit(0,0,-.06,new THREE.Vector3(1,0,0)).x > .043, 'inward-facing tube wall closes the aperture');
  assert.ok(cost.addedTriangles < 350, 'simple bore cannot explode into a dense boolean mesh');
  console.log(shape, cost);
  for (const geometry of [source,...owned]) geometry.dispose(); paint.dispose(); steel.dispose();
}
console.log('carved muzzle: real cap subtraction, preserved rim, inward wall, recessed floor and transformed frame PASS');

// A retained source cap exactly at the chosen backstop plane must not draw
// over the new floor. Touching stock outside the aperture remains legal.
{
  const root=new THREE.Group(),frame=new THREE.Group();root.add(frame);
  const material=new THREE.MeshBasicMaterial(),resources=[];
  const source=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.25).translate(0,0,-.25),material);
  root.add(source);root.updateMatrixWorld(true);
  installCarvedMuzzleBore([root],frame,.04,.125,material,resources);
  root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(.007,.004,.01),new THREE.Vector3(0,0,-1));
  const hits=ray.intersectObject(root,true).filter(h=>Math.abs(h.point.z+.125)<1e-7);
  assert.equal(hits.length,1,'exactly one visible floor occupies the backstop plane');
  resources.forEach(g=>g.dispose());source.geometry.dispose();material.dispose();
}
// Test the verifier with real obstructions and missing geometry, not only
// edited metadata. The intact stock is restored between negative controls.
{
  const root=new THREE.Group(),frame=new THREE.Group();root.add(frame);
  const material=new THREE.MeshBasicMaterial(),resources=[];
  const stock=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.4).translate(0,0,-.2),material);root.add(stock);
  root.updateMatrixWorld(true);installCarvedMuzzleBore([root],frame,.04,.125,material,resources);
  frame.userData.muzzleSeatReceipt={physicalInnerRadiusM:.04,physicalBoreDepthM:.125,supportOuterRadiusM:.1};
  assert.doesNotThrow(()=>verifyCarvedMuzzleBore(root,frame));
  const cap=new THREE.Mesh(new THREE.CircleGeometry(.04,12),material);frame.add(cap);
  assert.throws(()=>verifyCarvedMuzzleBore(root,frame),/capped/);frame.remove(cap);
  const lining=frame.getObjectByName('muzzleBoreInnerWallAndBackstop');lining.visible=false;
  assert.throws(()=>verifyCarvedMuzzleBore(root,frame),/floor/);lining.visible=true;
  stock.visible=false;assert.throws(()=>verifyCarvedMuzzleBore(root,frame),/rim/);stock.visible=true;
  assert.doesNotThrow(()=>verifyCarvedMuzzleBore(root,frame));
  cap.geometry.dispose();stock.geometry.dispose();resources.forEach(g=>g.dispose());material.dispose();
}
console.log('carved muzzle: duplicate floors, front caps, missing recesses and missing rims rejected');

// 252 (the owner: "weird squares/triangles at tips of guns around the holes"): weapon steel's crease wear is per triangle
// (weaponFinish.ts). The cut faces copied their parents' corners, so ring triangles round the bore read as crease and drew
// a dark square or triangle on the muzzle face. The cut stock carries one barycentric corner per vertex and no crease
// inside the face's annulus.
{
  const { bakeWeaponEdgeWear, WEAPON_EDGE_BARY, WEAPON_EDGE_INVH } = await import('./weaponFinish.ts');
  const root=new THREE.Group(),frame=new THREE.Group();root.add(frame);
  const source=new THREE.CylinderGeometry(.104,.104,.4,16).rotateX(Math.PI/2).translate(0,0,-.2).toNonIndexed();
  bakeWeaponEdgeWear(source);
  const material=new THREE.MeshBasicMaterial(),resources=[];
  const mesh=new THREE.Mesh(source,material);root.add(mesh);root.updateMatrixWorld(true);
  installCarvedMuzzleBore([root],frame,.055,.12,material,resources);
  const cut=mesh.geometry,position=cut.getAttribute('position'),bary=cut.getAttribute(WEAPON_EDGE_BARY),invH=cut.getAttribute(WEAPON_EDGE_INVH);
  assert.ok(cut!==source&&bary&&invH,'the carved weapon stock keeps its crease wear');
  let faceTriangles=0;
  for(let t=0;t<position.count;t+=3){
    const corners=[0,1,2].map(k=>[bary.getX(t+k),bary.getY(t+k),bary.getZ(t+k)]);
    assert.deepEqual(corners.map(c=>c.map(Math.round)).sort(),[[0,0,1],[0,1,0],[1,0,0]],'one barycentric corner per vertex of every cut triangle');
    const ps=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,t+k));
    if(ps.some(p=>Math.abs(p.z)>1e-6))continue;
    faceTriangles++;
    for(let e=0;e<3;e++){
      const [a,b]=[ps[(e+1)%3],ps[(e+2)%3]],ra=Math.hypot(a.x,a.y),rb=Math.hypot(b.x,b.y);
      const interior=r=>r>.055+1e-4&&r<.104*Math.cos(Math.PI/16)-1e-4;
      if(interior(ra)||interior(rb)||(ra>.0551&&rb>.0551&&ra<.1&&rb<.1))
        assert.equal([invH.getX(t),invH.getY(t),invH.getZ(t)][e],0,'no crease across the muzzle face round the bore');
    }
  }
  assert.ok(faceTriangles>=12,'the muzzle face ring is checked');
  resources.forEach(g=>g.dispose());source.dispose();material.dispose();
}
console.log('carved muzzle: weapon steel keeps per-triangle crease wear round the cut bore');
