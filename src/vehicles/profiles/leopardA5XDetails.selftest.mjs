import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} ±${tolerance}`);
const cast = (mesh, origin, direction, far = 8) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far)
  .intersectObject(mesh, false)[0];

// Independent held-out canonical-source rays: these are not the radial
// stations used by the new cover primitive, nor any candidate-derived fit.
const coverWitnesses = [
  ['Right',.70,-1.48,1.81869638], ['Right',.84,-1.24,1.80607933],
  ['Right',.97,-1.33,1.80930620], ['Right',.61,-1.58,1.79983345],
  ['Right',1.043,-1.42,1.79005166],
  ['Left',-.70,-1.46,1.81823575], ['Left',-.84,-1.22,1.80561720],
  ['Left',-.965,-1.32,1.80830276], ['Left',-.605,-1.56,1.80492200],
  ['Left',-1.035,-1.40,1.78940116],
];

// Captured before the A5-only repair at seed4242. The sole original merged
// turretDetail bucket contains the deliberately reshaped basket and is
// checked by independent floor/band/wall witnesses below. Every other old
// rendered mesh, including hull, shell, barrel and all instanced gear, stays
// pinned; newly named local fittings are the only additional meshes.
const retained = {
  high: [244010,'9d3f4c42760ca8b28ef878362195f1921396da4bdd7e586104799a5212eb3baf'],
  low: [231298,'da95e29da39d55c67c2d46c4dbc1124e7dcd0a4217c84f743fd2535270effb66'],
};
function retainedFingerprint(root) {
  const rows=[];
  root.traverse(o=>{
    if (!o.isMesh || o.name==='turretDetail' || o.userData.sourceA5FinalFitting
      || o.userData.vehicleMarking || o.userData.shadowOnly || o.userData.geometryAuditIgnore
      || /shadow/i.test(o.name)) return;
    for (let p=o; p; p=p.parent) if (!p.visible) return;
    const positions=o.geometry.attributes.position;
    for (let instance=0; instance<(o.isInstancedMesh ? o.count : 1); instance++) {
      const matrix=o.matrixWorld.clone();
      if (o.isInstancedMesh) { const local=new THREE.Matrix4(); o.getMatrixAt(instance,local); matrix.multiply(local); }
      for (let i=0; i<positions.count; i++) rows.push(new THREE.Vector3()
        .fromBufferAttribute(positions,i).applyMatrix4(matrix).toArray().map(v=>Math.round(v*1e6)).join(','));
    }
  });
  rows.sort();
  return [rows.length,crypto.createHash('sha256').update(rows.join('\n')).digest('hex')];
}

function basketChecks(mesh, quality) {
  const points=[],positions=mesh.geometry.attributes.position;
  for (let i=0; i<positions.count; i++) points.push(new THREE.Vector3()
    .fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));
  for (const y of [.8203,.84,1.025,1.515,1.71]) {
    const plane=points.filter(p=>Math.abs(p.y-y)<.000005);
    assert.ok(plane.length>24,`${quality}: actual floor, bands and wall-boundary vertices remain`);
    const box=new THREE.Box3().setFromPoints(plane);
    near(box.min.z,-.31457499,.000005,`${quality}: source elliptical basket rear edge`);
    near(box.max.z,1.63689363,.000005,`${quality}: source elliptical basket forward edge`);
    near(box.min.x,-.986,.000005,`${quality}: basket transverse radius unchanged`);
    near(box.max.x,.986,.000005,`${quality}: basket transverse radius unchanged`);
  }
  near(cast(mesh,[0,.5,.66115932],[0,1,0])?.point.y,.820291,.00002,'source basket floor height unchanged');
  near(cast(mesh,[1.2,1.25,.661],[ -1,0,0])?.point.x,-.28907,.015,
    'real cardinal basket window remains open to the unchanged divider');
}

function assertClosed(geometry) {
  const p = geometry.attributes.position, index = geometry.index, edges = new Map();
  let volume = 0;
  for (let i=0; i<(index?.count ?? p.count); i+=3) {
    const points = [0,1,2].map(k => new THREE.Vector3().fromBufferAttribute(p,index ? index.getX(i+k) : i+k));
    if (points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).lengthSq() < 1e-18) continue;
    volume += points[0].dot(points[1].clone().cross(points[2])) / 6;
    for (let k=0; k<3; k++) {
      const a=points[k].toArray().map(v=>v.toFixed(6)).join(',');
      const b=points[(k+1)%3].toArray().map(v=>v.toFixed(6)).join(',');
      const key=[a,b].sort().join('|'), row=edges.get(key) ?? [0,0];
      row[0]++; row[1]+=a<b ? 1 : -1; edges.set(key,row);
    }
  }
  assert.ok(volume>0 && volume<.04,'each fitting is a closed local fabrication, not a whole-hull fill');
  assert.ok([...edges.values()].every(([count,winding])=>count===2 && winding===0),'closed opposing triangle edges');
  assert.equal(geometry.attributes.uv.count,p.count,'first-party UVs cover every authored vertex');
}

const roofNames=['BridgeBase','BridgeArch','HoodTop','HoodForwardLeg','HoodRearLeg'];
function roofChecks(tank, quality) {
  const get=name=>tank.root.getObjectByName(name);
  const fixture=name=>get(`leo2a5_xSourceFixture_${name}`);
  const turret=get('rig_turret'), neutralInverse=turret.matrixWorld.clone().invert();
  for (const name of roofNames) {
    const mesh=fixture(name);
    assert.equal(mesh.parent,turret,`${quality}: ${name} is permanent turret equipment`);
    assert.equal(mesh.userData.combatHitboxRole,'equipment');
    assert.equal(mesh.userData.destructibleCluster,undefined,'not an ERA/ejectable assembly');
    assertClosed(mesh.geometry);
  }
  // Cast the same independent source-world witnesses after real turret yaw.
  // Both the permanent roof and separate equipment must retain the joint.
  for (const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI]) {
    turret.rotation.y=yaw;
    tank.root.updateMatrixWorld(true);
    const delta=turret.matrixWorld.clone().multiply(neutralInverse), inverse=delta.clone().invert();
    const hit=(name,origin,direction)=>{
      const o=new THREE.Vector3(...origin).applyMatrix4(delta);
      const d=new THREE.Vector3(...direction).transformDirection(delta);
      const mesh=name==='turret' ? get(name) : fixture(name);
      const result=cast(mesh,o.toArray(),d.toArray());
      return result?.point.clone().applyMatrix4(inverse);
    };
    for (const [z,y] of [[-1,2.540764],[-.92,2.540531],[-.8,2.540180]]) {
      near(hit('BridgeBase',[.05,3,z],[0,-1,0])?.y,y,.00002,'source bridge base plateau');
      near(hit('BridgeBase',[.1,3,z],[0,-1,0])?.y,2.521244+(z+1)*(-.00311),.001,
        'source low chamfered base perimeter');
    }
    for (const [z,top,bottom] of [[-.96,2.638407,2.590422],[-.92,2.649742,2.617697],
      [-.90,2.647320,2.612759],[-.88,2.639166,2.590289]]) {
      near(hit('BridgeArch',[.0477,3,z],[0,-1,0])?.y,top,.000002,'source arched lug crown');
      near(hit('BridgeArch',[.0477,2.55,z],[0,1,0])?.y,bottom,.000002,'source arch underside');
    }
    for (const z of [-.96,-.88]) near(hit('BridgeArch',[1,2.6,z],[-1,0,0])?.x,
      z===-.96 ? .068998 : .069010,.0003,'held-out real material below the crown');
    near(hit('BridgeArch',[1,2.63,-.92],[-1,0,0])?.x,.068748,.000002,'source narrow upper bridge');
    for (const [y,z] of [[2.575,-.96],[2.575,-.92],[2.61,-.92],[2.575,-.88]])
      for (const name of roofNames.slice(0,2)) assert.equal(hit(name,[1,y,z],[-1,0,0]),undefined,
        'source transverse lug eye is geometry-level air, not a dark surface');
    // Interior of each real foot, clear of the source baseplate end chamfer.
    for (const z of [-1.01,-.76]) {
      const archBottom=hit('BridgeArch',[.0477,2.4,z],[0,1,0])?.y;
      const baseTop=hit('BridgeBase',[.0477,3,z],[0,-1,0])?.y;
      assert.ok(archBottom<baseTop-.001,'actual arch feet overlap the source baseplate');
    }
    const baseBottom=hit('BridgeBase',[.0477,2.4,-.92],[0,1,0])?.y;
    const roofTop=hit('turret',[.0477,3,-.92],[0,-1,0])?.y;
    assert.ok(baseBottom<roofTop-.003,'actual measured baseplate overlaps permanent roof');
    for (const [x,z,top,bottom] of [[.74,.80,2.586292,2.580691],
      [.78,.80,2.586446,2.580559],[.70,.88,2.580001,2.574044]]) {
      near(hit('HoodTop',[x,3,z],[0,-1,0])?.y,top,.00003,'held-out source canted hood top');
      near(hit('HoodTop',[x,2.4,z],[0,1,0])?.y,bottom,.0004,'held-out thin hood underside');
    }
    for (const [name,z,outer,inner] of [['HoodForwardLeg',.74,.884707,.877113],
      ['HoodRearLeg',.86,.657538,.650702],['HoodRearLeg',.90,.692694,.685171]]) {
      near(hit(name,[2,2.53,z],[-1,0,0])?.x,outer,.0016,'source folded-leg outer face');
      near(hit(name,[0,2.53,z],[1,0,0])?.x,inner,.0016,'source folded-leg inner face');
    }
    for (const z of [.78,.82]) for (const y of [2.50,2.53,2.55,2.57])
      for (const name of roofNames.slice(2)) assert.equal(hit(name,[2,y,z],[-1,0,0]),undefined,
        'full hood assembly retains source through-air under the sheet');
    for (const [name,x,z,upperX] of [['HoodForwardLeg',.885,.74,.87263],
      ['HoodRearLeg',.6545,.86,.65545],['HoodRearLeg',.688,.90,.68913]]) {
      const bottom=hit(name,[x,2.4,z],[0,1,0])?.y;
      const roof=hit('turret',[x,3,z],[0,-1,0])?.y;
      assert.ok(bottom<roof-.001,'only narrow concealed leg roots positively overlap the retained roof');
      const top=hit(name,[upperX,3,z],[0,-1,0])?.y;
      const hoodBottom=hit('HoodTop',[upperX,2.55,z],[0,1,0])?.y;
      assert.ok(top>hoodBottom+.002,'folded leg joins the actual thin hood underside');
    }
  }
  turret.rotation.y=0;
  tank.root.updateMatrixWorld(true);
}

for (const quality of ['high','low']) {
  const tank=createTank('leo2a5_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  const disposed=new Map();
  try {
    tank.root.updateMatrixWorld(true);
    const get=name=>tank.root.getObjectByName(name);
    const fixture=name=>get(`leo2a5_xSourceFixture_${name}`);
    assert.deepEqual(retainedFingerprint(tank.root),retained[quality],`${quality}: every non-target original assembly stays fixed`);
    basketChecks(get('turretDetail'),quality);
    roofChecks(tank,quality);
    for (const name of [...roofNames,'ServiceCoverRight','ServiceCoverLeft']) {
      disposed.set(name,0);
      fixture(name).geometry.addEventListener('dispose',()=>disposed.set(name,disposed.get(name)+1));
    }
    for (const [side,x,z,y] of coverWitnesses)
      near(cast(fixture(`ServiceCover${side}`),[x,3,z],[0,-1,0])?.point.y,y,.004,
        `${quality}: held-out source rounded service-cover surface`);
    for (const [side,x,z] of [['Right',.776058,-1.378049],['Left',-.765934,-1.365959]]) {
      const cover=fixture(`ServiceCover${side}`);
      assert.equal(cover.parent,get('rig_hull'),'service covers stay on the permanent hull');
      assert.equal(cover.userData.combatHitboxRole,'equipment');
      assertClosed(cover.geometry);
      const deck=cast(get('hull'),[x,3,z],[0,-1,0]).point.y;
      const bottom=cast(cover,[x,1,z],[0,1,0]).point.y;
      const top=cast(cover,[x,3,z],[0,-1,0]).point.y;
      assert.ok(bottom<deck-.001 && top>deck+.09,'actual positive cover-to-deck overlap, without a pedestal');
      assert.equal(cast(cover,[x+.28,3,z+.22],[0,-1,0]),undefined,'source rounded plan corner stays air');
    }
  } finally { tank.dispose(); }
  assert.ok([...disposed.values()].every(count=>count===1),'every additional geometry is disposed once');
}
console.log('leopardA5XDetails: high/low source covers/basket/roof, real air, support, yaw, preservation and disposal pass');
