import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const close=(actual,expected,tolerance,label)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${label}: ${actual}, expected ${expected}`);
function checkRunningGear(tank,quality) {
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  const tires=tank.root.getObjectByName('gearRoadWheelTires');
  assert.equal(tires.count,10,'exactly five original road stations per side');
  const stations=[];
  for(let i=0;i<tires.count;i++) {
    tires.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
    close(Math.abs(position.x),1.2548,1e-6,'original track/axle lateral station');
    close(position.y,.41638,1e-6,'original road axle height');
    stations.push(+position.z.toFixed(5));
  }
  assert.deepEqual([...new Set(stations)].sort((a,b)=>a-b),[-1.84635,-.86283,.07708,1.15022,2.09506]);
  const pads=tank.root.getObjectByName('gearTrackPads'),a=pads.geometry.attributes.position;
  assert.equal(pads.userData.trackRigidLinkChords,true);
  pads.geometry.computeBoundingBox();
  // Original Object_6/8 outer loaded tread edge span is .51772 m; its
  // beveled inner lip reaches .57152 m. These are independent source widths,
  // not the wheel envelope or a scale fitted to the comparison mask.
  close(pads.geometry.boundingBox.max.x-pads.geometry.boundingBox.min.x,.51772,.0015,'source outer tread width');
  const outer=[];
  for(let i=0;i<a.count;i++)if(Math.abs(a.getX(i))>.09)outer.push(a.getY(i));
  close(Math.max(...outer)-Math.min(...outer),.047,1e-6,'seated outer pad/web radial envelope');
  close(pads.geometry.boundingBox.min.y,-.1045,1e-6,'separate 85 mm guide above the web');
  let lowest=Infinity,flatIndex=-1;
  for(let i=0;i<pads.count;i++) {
    pads.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
    if(Math.abs(position.z)<1&&position.y<.1)flatIndex=i;
    for(let k=0;k<a.count;k++)lowest=Math.min(lowest,new THREE.Vector3().fromBufferAttribute(a,k).applyMatrix4(matrix).y);
  }
  close(lowest,0,.0001,`${quality} complete shoe remains grounded`);
  assert.ok(flatIndex>=0,'actual lower native shoe is present');
  pads.getMatrixAt(flatIndex,matrix);
  const webTop=new THREE.Vector3(0,-.0215,0).applyMatrix4(matrix).y;
  close(webTop,.047,1e-6,'loaded shoe/web first surface');
  assert.ok(webTop<.0509308-.003,'outer web stays below independently measured wheel bottoms');
  const band=tank.root.getObjectByName('gearTrackBandR');
  band.geometry.computeBoundingBox();
  close(band.geometry.boundingBox.min.y,.0375,1e-6,'one thin backing carrier seated within the shoe web');
  assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'),undefined,'no second decorative course');
}

function checkVisibleWheelFaces(tank, quality) {
  const tires = tank.root.getObjectByName('gearRoadWheelTires');
  const discs = tank.root.getObjectByName('gearRoadWheelDiscs');
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  // Cast from outside the complete native tank, rather than checking that a
  // hidden painted disk exists behind the rubber. Fixed witness radii are
  // inside even LOW's 12-sided aperture (303.3 mm inradius) and outside the
  // hub/fastener pattern; a 305 mm ray legitimately meets LOW's rubber edge.
  for (let i = 0; i < tires.count; i++) {
    tires.getMatrixAt(i, matrix);
    matrix.premultiply(tires.matrixWorld);
    const side = Math.sign(new THREE.Vector3().setFromMatrixPosition(matrix).x);
    direction.set(-side, 0, 0).transformDirection(tires.matrixWorld);
    for (const radial of [.275, .285, .295]) for (const angle of [.35, 1.10, 2.10, 2.90]) {
      point.set(side * .80, Math.sin(angle) * radial, Math.cos(angle) * radial).applyMatrix4(matrix);
      const hit = new THREE.Raycaster(point, direction, 0, 1).intersectObject(tank.root, true)
        .find(h => !h.object.userData.shadowOnly && !h.object.userData.authoredShadowProxy);
      assert.ok(hit?.object === discs, `${quality} wheel ${i}: painted face must be the first visible stock at r=${radial}; hit ${hit?.object.name ?? 'nothing'}`);
    }
  }
  // The tire remains a finite closed ring and is not recolored armor or an
  // invisible/open-ended cylinder. Its outer rolling radius stays unchanged.
  const p = tires.geometry.attributes.position;
  const radii = Array.from({length:p.count}, (_, i) => Math.hypot(p.getY(i), p.getZ(i)));
  close(Math.min(...radii), .314, 1e-6, 'physical tire opening');
  close(Math.max(...radii), .36545, 1e-6, 'unchanged rolling radius');
  const triangleCount = (tires.geometry.index?.count ?? p.count) / 3;
  assert.equal(triangleCount, 8 * (quality === 'high' ? 26 : 12),
    'the closed four-wall tire ring costs no more triangles than the two former capped cylinders');
  const edgeCounts = new Map();
  const vertex = i => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
  const index = tires.geometry.index;
  for (let i = 0; i < triangleCount * 3; i += 3) {
    const vertices = [0, 1, 2].map(j => vertex(index ? index.getX(i + j) : i + j));
    for (let j = 0; j < 3; j++) {
      const edge = [vertices[j], vertices[(j + 1) % 3]].sort().join('|');
      edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
    }
  }
  assert.ok([...edgeCounts.values()].every(count => count === 2), 'every physical tire-ring edge is closed');
  assert.equal(tires.userData.appearanceRole, 'wheelTire');
  assert.equal(discs.userData.appearanceRole, 'wheelDish');
}
for(const quality of ['high','low']) {
  const tank=createTank('amx30_x',null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    checkRunningGear(tank,quality);
    checkVisibleWheelFaces(tank,quality);
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    const recoil=tank.root.getObjectByName('rig_recoil'),muzzle=tank.root.getObjectByName('rig_muzzle');
    const ray=(origin,direction,far=12)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,far).intersectObject(tank.root,true)[0];
    close(turret.position.y,1.584,1e-6,'source bearing height');
    close(turret.position.z,.285,1e-6,'source bearing station');
    close(muzzle.getWorldPosition(new THREE.Vector3()).z,5.99439,1e-6,'physical metal muzzle');
    // Fixed independent witness coordinates, not copied from the builder.
    // Every ray tests the complete actual tank, so hidden stock cannot fill
    // the opening behind a decorative painted hole.
    // Fleet mouth standard (2026-09-11): the visible lining seats 0.3 mm ahead
    // of the tube edge; the blind 105 mm floor stays real metal behind it.
    const metal=[];tank.root.traverse(o=>{if(o.isMesh&&!/muzzleBoreShadowFallback/.test(o.name))metal.push(o);});
    const rayMetal=(origin,direction,far=12)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,far).intersectObjects(metal,false)[0];
    for(const [dx,dy] of [[0,0],[.030,0],[-.030,0],[0,.030],[0,-.030]]) {
      const mouth=ray([-.011+dx,1.87565+dy,6.15],[0,0,-1]);
      assert.equal(mouth?.object.name,'muzzleBoreShadowFallbackDisc','visible mouth is the fleet lining');
      close(mouth?.point.z,5.99439+.0003,.0005,'lining seats on the tube edge');
      const hit=rayMetal([-.011+dx,1.87565+dy,6.15],[0,0,-1]);
      close(hit?.point.z,5.680,.003,'continuous blind 105mm bore floor');
      assert.equal(rayMetal([-.011+dx,1.87565+dy,6.15],[0,0,-1],.45),undefined,'muzzle contains real air');
    }
    for(const [x,y,front,glass] of [[1.078,2.062,1.782,1.680],[-.89409,2.86170,.560235,.428235]]) {
      const hit=ray([x,y,front+.10],[0,0,-1]);
      assert.ok(hit.object.name.endsWith('Glass'),'first surface is recessed glazing, not solid housing');
      close(hit.point.z,glass,.003,'actual recessed optic surface');
      assert.equal(ray([x,y,front+.10],[0,0,-1],.18),undefined,'optic reveal remains empty');
    }
    close(ray([-.553,3,-.4],[0,-1,0])?.point.y,2.6385,.001,'hatch sits below the open cupola guard');
    assert.equal(ray([-.553,2.79,-.4],[0,-1,0],.12),undefined,'cupola negative space is physical');
    for(const yaw of [-.7,.7]) {
      turret.rotation.y=yaw;gun.rotation.x=-.15;tank.root.updateMatrixWorld(true);
      const before=muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z=-.10;tank.root.updateMatrixWorld(true);
      close(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())),.10,1e-6,'whole source-shaped tube recoils along posed bore');
      recoil.position.z=0;
    }
  } finally { tank.dispose(); }
}
console.log('amx30X: actual high/low source axle/tread datums, seated native shoes, bore, recessed optics, open cupola and moving ownership pass');
