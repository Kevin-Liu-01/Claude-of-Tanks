// Physical seat contract of the four T-90M headlights reseated by 37de0b6aa (canted cassette apertures, real lens
// caps, hull ownership, downward road aim). 2026-10-01 (frozen pins retired): the source-digest authenticated
// pre-lamp inverse (withHistoricalT90MLamps) that reproduced the pre-X golden is gone; only the live contract remains.
import assert from 'node:assert/strict';
import * as T from 'three';
import {vehicleNightLightEmittersFor} from './vehicleNightLighting.ts';
import {NIGHT_EMISSION_ATTRIBUTE} from '../engine/nightEmissionMaterial.ts';

export function assertCurrentT90MLampSeats(tank){
  tank.root.updateMatrixWorld(true);
  const hull=tank.root.getObjectByName('hull'),owners=[];
  tank.root.traverse(m=>{for(const lamp of vehicleNightLightEmittersFor(m))if(lamp.kind==='headlight')owners.push({m,lamp});});
  assert.equal(owners.length,4,'Current T-90M retains all four physical registered headlights');
  const points=[],double=new T.Mesh(hull.geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
  double.matrixAutoUpdate=false;double.matrixWorld.copy(hull.matrixWorld);
  try{for(const {m,lamp} of owners){
    assert.equal(m.name,'hullGlass');
    const ancestors=[];for(let owner=m.parent;owner;owner=owner.parent)ancestors.push(owner.name);
    assert.ok(ancestors.includes('rig_hull')&&!ancestors.includes('rig_turret'),'Actual hull ownership through the native LOD group');
    const p=new T.Vector3(...lamp.position).applyMatrix4(m.matrixWorld);
    // Since 6468ee7bc the optical road beam is deliberately downward even
    // when the physical housing rakes upward. Measure the actual emitting
    // cap here; beam metadata is not the stock normal used for seating rays.
    const lens=new T.Mesh(m.geometry,double.material);
    lens.matrixAutoUpdate=false;lens.matrixWorld.copy(m.matrixWorld);
    const hit=new T.Raycaster(p.clone().add(new T.Vector3(0,0,.03)),new T.Vector3(0,0,-1),.001,.06)
      .intersectObject(lens,false).find(h=>h.point.distanceToSquared(p)<1e-10);
    assert.ok(hit?.face,'Emitter center lies on a real finite lens cap');
    const mask=m.geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
    assert.ok(mask&&[hit.face.a,hit.face.b,hit.face.c].every(i=>mask.getX(i)===1),
      'Measured cap is the actual tagged headlight aperture, not adjacent glass');
    const n=hit.face.normal.clone().transformDirection(m.matrixWorld);
    assert.ok(n.z>.95&&Math.abs(n.y)>.15&&Math.abs(n.x)>.15,'Aperture follows the real canted forward housing, not old upward discs');
    const beam=new T.Vector3(...lamp.direction).transformDirection(m.matrixWorld);
    assert.ok(Math.abs(beam.y/Math.hypot(beam.x,beam.z)+.08)<1e-6,'Optical beam retains its published downward road aim');
    // Cross-products reconstructed from ~47 mm caps at metre-scale Float32
    // coordinates have a few microradians of quantization (observed 3.4e-6).
    assert.ok(Math.abs(beam.x*n.z-beam.z*n.x)<2e-5&&beam.x*n.x+beam.z*n.z>0,
      `Road aim preserves the physical aperture azimuth: ${JSON.stringify({beam:beam.toArray(),cap:n.toArray(),cross:beam.x*n.z-beam.z*n.x})}`);
    const exposed=new T.Raycaster(p.clone().addScaledVector(n,.5),n.clone().negate(),.001,.498).intersectObject(hull,false);
    assert.equal(exposed.length,0,'No hull stock buries the real emitting aperture');
    const ranges=new T.Raycaster(p,n.clone().negate(),0,.08).intersectObject(double,false).map(h=>h.distance)
      .filter((d,i,a)=>!i||d-a[i-1]>1e-7);
    assert.ok(ranges.length>=1&&ranges[0]>.005&&ranges[0]<.025,'Aperture physically seats in the unchanged cassette');
    // The lens has 25 mm axial stock. A housing entry before its rear cap
    // establishes positive lap rather than an AABB/touching-plane claim.
    assert.ok(.025-ranges[0]>.004,'Finite rear lens stock enters the actual housing');
    points.push(p.toArray());
  }}finally{double.material.dispose();}
  return points;
}
