import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
const witnesses=[
  [-1,-1.4,-1.18269320],[-1,-1,-1.30707748],[-1,-.7,-1.40006445],
  [-1,-.4,-1.49090863],[-1,-.1,-1.58466190],[-1,.2,-1.67782528],
  [1,-1.4,1.17650973],[1,-1,1.30147809],[1,-.7,1.39515730],
  [1,-.4,1.48885078],[1,-.1,1.58233326],[1,.2,1.65982083],
];
for(const quality of ['high','low']) {
  const tank=createTank('t90ms_x',null,{quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const turret=tank.root.getObjectByName('rig_turret');
    const cast=(p,d,far=3)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(turret,true)[0];
    // Independent source bearing-roof sections. These roofs were entirely
    // absent; a solid side box is not an acceptable replacement for8mm sheet.
    for(const [x,z,y]of [[-1.05,-1.2,2.063639714],[.85,-1.2,2.062057358],[1.05,-1.2,2.062409602]]) {
      const hit=cast([x,2.3,z],[0,-1,0],.3);
      assert.ok(hit&&Math.abs(hit.point.y-y)<.003,`${quality} source side bearing roof ${x}/${z}: ${hit?.point.y}`);
    }
    assert.ok(!cast([.95,1.99,-1.2],[0,-1,0],.05),'real air below the thin bearing roof');
    // Independent full-source outer-surface rays; the former wrong-signed
    // rotation misses these by up to 393 mm. These are not vertices or
    // self-comparisons of the newly authored construction.
    for(const [side,z,x]of witnesses) {
      const hit=cast([side*2.2,1.89,z],[-side,0,0]);
      assert.ok(hit&&Math.abs(hit.point.x-x)<.002,`${quality} side wall ${side}/${z}: ${hit?.point.x} vs ${x}`);
    }
    // Independent lower-chevron front surfaces, including both heights and
    // both sides. The old inset thin leaf ended roughly180 mm too early.
    for(const [x,y,z]of [[-1.7,1.8,.80554137],[-1.5,1.7,.76416002],[-1.5,1.8,1.00564135],
      [-1.3,1.7,.964281],[-1.3,1.8,1.20593711],[-1.1,1.7,1.16458984],[-1.1,1.8,1.40646340],
      [.9,1.7,1.36164063],[1.1,1.7,1.16145155],[1.1,1.8,1.40312640],
      [1.3,1.7,.96125496],[1.3,1.8,1.20264302],[1.5,1.7,.76105597],[1.5,1.8,1.00250071],[1.7,1.8,.80244696]]) {
      const hit=cast([x,y,3],[0,0,-1]);
      assert.ok(hit&&Math.abs(hit.point.z-z)<.001,`${quality} lower chevron ${x}/${y}: ${hit?.point.z} vs ${z}`);
    }
    // Former block volume outside the rearward-converging side panel.
    for(const [x,y,z]of [[-1.829,1.85,.77602902],[-1.8,1.85,.80504970],[-1.8,1.88,.77963163],
      [-1.7,1.865,.89234740],[-1.5,1.85,1.10518029],[-1.5,1.88,1.07975484],
      [1.5,1.85,1.10189513],[1.7,1.88,.87644790],[1.8,1.865,.78908645]]) {
      const hit=cast([x,y,3],[0,0,-1]);
      assert.ok(hit&&Math.abs(hit.point.z-z)<.0005,`${quality} separate source folded lip ${x}/${y}`);
    }
    assert.ok(!cast([1.50,1.89,-1.1],[0,0,1],.06),'aft outboard corner is air, not a broad reversed box');
    assert.ok(!cast([-1.50,1.89,-1.1],[0,0,1],.06),'port aft outboard corner is air');
    // Separate source left-aft case and a real gap beside the central bustle.
    assert.ok(cast([-1.01,2.4,-1.9],[0,-1,0],.4),'left aft case lid exists');
    assert.ok(!cast([-1.29,1.89,-1.9],[0,0,1],.12),'air outboard of the distinct aft case');
    const initial=cast([2.2,1.89,-.4],[-1,0,0]).point.clone();
    const local=turret.worldToLocal(initial.clone());
    turret.rotation.y=.67;tank.root.updateMatrixWorld(true);
    const expected=turret.localToWorld(local.clone());
    const direction=new THREE.Vector3(-1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),.67);
    const hit=new THREE.Raycaster(expected.clone().addScaledVector(direction,-.25),direction,0,.26).intersectObject(turret,true)[0];
    assert.ok(hit&&hit.point.distanceTo(expected)<.00002,'side assemblies retain actual turret ownership through yaw');
  } finally {tank.dispose();}
}
console.log('t90msXSideAssembly: high/low held-out surfaces, converging rake, distinct aft case, open spaces and yaw ownership pass');
