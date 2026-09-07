import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

for(const quality of ['high','low']) {
  const tank=createTank('t90ms_x',null,{quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const turret=tank.root.getObjectByName('rig_turret');
    const cast=(p,d,far=.5)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(turret,true)[0];
    // Independent source first surfaces, including the glass rather than
    // a retaining block accidentally projecting ahead of an oblique pane.
    for(const y of [2.20,2.25])for(const [x,z]of [[.60,.19621146],[.69,.20981349],[.78,.20063736]]) {
      const hit=cast([x,y,.35],[0,0,-1]);
      assert.ok(hit&&hit.object.name==='turretGlass',`${quality} exposed glass at ${x}/${y}`);
      assert.ok(Math.abs(hit.point.z-z)<.0005,`${quality} source pane depth at ${x}/${y}`);
      assert.ok(!cast([x,y,.242],[0,0,-1],.02),'window contains genuine recessed air');
    }
    for(const [x,z]of [[.60,.23046548],[.69,.25548742],[.78,.23125615]]) {
      const hit=cast([x,2.4,.35],[0,0,-1]);
      assert.ok(hit&&Math.abs(hit.point.z-z)<.0005,`${quality} source upper faceted casing at ${x}`);
    }
    for(const x of [.55,.61,.69,.78,.84]) {
      const hit=cast([x,2.6,.05],[0,-1,0]);
      assert.ok(hit&&Math.abs(hit.point.y-2.42778993)<.00001,'actual source crown height');
    }
    // This narrow adjacent socket must reach the existing cupola and
    // retain air beside it, instead of becoming another broad roof box.
    for(let i=0;i<=160;i++)assert.ok(cast([1.05,2.16+i*.002,-.40681],[-1,0,0],.16),'continuous adjacent socket');
    assert.ok(!cast([1.02,2.32,-.40681],[0,0,1],.04),'air beside narrow socket');
    const first=cast([.69,2.25,.35],[0,0,-1]).point.clone();
    const local=turret.worldToLocal(first.clone());
    turret.rotation.y=.61;tank.root.updateMatrixWorld(true);
    const expected=turret.localToWorld(local);
    const direction=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),.61);
    const hit=new THREE.Raycaster(expected.clone().addScaledVector(direction,-.02),direction,0,.025).intersectObject(turret,true)[0];
    assert.ok(hit&&hit.point.distanceTo(expected)<.00002&&hit.object.name==='turretGlass','optical assembly follows turret yaw');
  } finally {tank.dispose();}
}
console.log('t90msXOpticalHead: high/low source panes, faceted crown, recessed air, socket contact and yaw pass');
