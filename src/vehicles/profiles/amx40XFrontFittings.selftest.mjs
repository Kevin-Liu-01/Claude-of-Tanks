import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
for(const quality of ['high','low']) {
  const tank=createTank('amx40_x',null,{quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('rig_hull');
    const ray=(p,d,far=10)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(hull,true)[0];
    // Independent complete-source first surfaces at the rolled apron. The
    // intermediate stations are not the authored loft's construction rows.
    for(const side of [-1,1])for(const [x,y,z]of [
      [1.04,1.1,3.412643706],[1.04,1.2,3.376018313],[1.3,1.1,3.395657615],
      [1.3,1.15,3.383253375],[1.3,1.25,3.327166716],[1.55,1.2,3.354795042],
      [1.55,1.277,3.279292849],
    ]) {
      const hit=ray([side*x,y,4],[0,0,-1],1);
      assert.ok(hit&&Math.abs(hit.point.z-z)<.003,`${quality} rolled apron ${side*x}/${y}: ${hit?.point.z}`);
    }
    // The apron's rear bearing actually intersects both sheet and shoulder.
    for(const side of [-1,1])for(const z of [3.17,3.19,3.215]) {
      const hit=ray([side*1.15,1.35,z],[0,-1,0],.1);
      assert.ok(hit&&hit.point.y>1.285,`${quality} front bearing ${side}/${z}`);
    }
    for(const side of [-1,1]) {
      assert.ok(!ray([side*1.3,1.14,3.3],[0,0,-1],.04),'open space behind the rolled apron');
      const light=ray([side*(side<0?1.2988:1.3076),1.40,3.3],[0,0,-1],.2);
      assert.ok(light&&light.point.z>3.195&&light.point.z<3.225,'recessed headlamp belongs on the front shoulder');
    }
    for(const side of [-1,1])for(const x of [.1722,.3384,.7781]) {
      for(const [y,z]of [[.68,3.0409689],[.75,3.1334448],[.85,3.2072947],[.94,3.2519103]]) {
        const hit=ray([side*x,y,3.5],[0,0,-1],.8);
        assert.ok(hit&&Math.abs(hit.point.z-z)<.003,`${quality} six bent mounting webs ${side*x}/${y}`);
      }
      assert.ok(!ray([side*x-.04,.7681,3.0987],[1,0,0],.08),'transverse pin bore is genuinely open');
      assert.ok(ray([side*x-.04,.801,3.0987],[1,0,0],.08),'pin bore retains surrounding mounting stock');
      assert.ok(ray([side*x,1.055,3.25],[0,-1,0],.05),'mounting web engages the folded crossbar');
    }
    assert.ok(!ray([.25,.85,3.20],[0,0,-1],.07),'air between front mounting webs stays open');
    // The rear transmission floor and central V bilge have different widths.
    // Keep measured end wheels fixed; the hidden wall is inset28.9mm for
    // clearance, so the tested oblique section allows a4mm construction error.
    for(const [x,z,y]of [[.83,-3,.470579],[.83,-2.7,.466891],[.83,-1.32125,.648175],
      [.83,-.4971,.646568],[.83,.2787,.645056]]) {
      const hit=ray([x,0,z],[0,1,0],1);
      assert.ok(hit&&Math.abs(hit.point.y-y)<.006,`${quality} true floor ${x}/${z}: ${hit?.point.y} vs ${y}`);
    }
  } finally { tank.dispose?.(); }
}
console.log('amx40XFrontFittings: high/low source apron, rooted fold, real air, forward lamps and distinct floor courses pass');
