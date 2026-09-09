// Test-only inverse of the four lamps physically reseated by 37de0b6aa.
// Actual gameplay and physical-seat assertions always retain the new lamps.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {KIT,registerProfiledBuilders} from './tankFactoryCore.ts';
import {T90_PROFILES} from './profiles/t90.ts';
import {markVehicleNightLens,vehicleNightLightEmittersFor} from './vehicleNightLighting.ts';
import {NIGHT_EMISSION_ATTRIBUTE} from '../engine/nightEmissionMaterial.ts';

const hash=b=>createHash('sha256').update(b).digest('hex');
const BEFORE='a93e505c9c98e06ad45c4b189ec6228864472651f9c0b245d2cb4d6a51500e50';
const AFTER='db8279500f86e1165baf4b945d3607d621554f9dc75be720678fb3d80751d97f';
const added=`    // These existing discs faced upward. Seat their apertures in the actual
    // canted cassette front, with 5.5 mm of rear stock entering its housing.
    for (const dx of [-0.075, 0.075]) {
      const lens = markVehicleNightLens(cylY(0.047, 0.052, 0.025, 10).rotateX(Math.PI / 2), 'headlight');
      P.add('hullGlass', KIT.xform(lens, dx, 0.025, 0.132),
        s * 1.40, 1.29, 2.68, -0.18, -s * 0.18, 0);
    }
`;
const removed="    for (const dx of [-0.075, 0.075]) P.add('hullGlass', cylY(0.047, 0.052, 0.025, 10), s * 1.40 + dx, 1.36, 2.76);\n";
export function authenticateT90MLampHistory(source){
  assert.equal(hash(source),AFTER,'Complete published post-lamp profile must match, not an arbitrary recipe');
  assert.equal(source.split(added).length,2,'Exactly one published lamp block');
  const old=source.replace(added,removed).replace("import { markVehicleNightLens } from '../vehicleNightLighting.ts';\n",'');
  assert.equal(hash(old),BEFORE,'Exact independently committed pre-lamp source after only the declared inverse');
}
function bytes(g){
  const h=createHash('sha256');
  for(const name of Object.keys(g.attributes).sort()){
    const a=g.attributes[name];h.update(name).update(JSON.stringify([a.itemSize,a.normalized]));
    h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
  }
  if(g.index){const a=g.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
  h.update(JSON.stringify(g.userData));return h.digest('hex');
}
export function withHistoricalT90MLamps(build){
  authenticateT90MLampHistory(readFileSync(new URL('./profiles/t90.ts',import.meta.url),'utf8'));
  const original=T90_PROFILES.t90m.build,seen=[];
  registerProfiledBuilders({t90m:P=>original(new Proxy(P,{get(target,key){
    if(key!=='add')return Reflect.get(target,key);
    return (slot,g,...args)=>{
      if(slot==='hullGlass'&&Math.abs(args[0])===1.4&&args[1]===1.29&&args[2]===2.68){
        const side=Math.sign(args[0]);
        assert.deepEqual(args,[side*1.4,1.29,2.68,-.18,-side*.18,0],'Only the exact four canted-pod calls');
        const candidates=[-.075,.075].filter(dx=>{
          const reference=KIT.xform(markVehicleNightLens(KIT.cylY(.047,.052,.025,10)
            .rotateX(Math.PI/2),'headlight'),dx,.025,.132);
          try{return bytes(g)===bytes(reference);}finally{reference.dispose();}
        });
        assert.equal(candidates.length,1,'Actual incoming complete lens buffers/semantics match a published repair');
        const dx=candidates[0];seen.push([side,dx]);g.dispose();
        return target.add(slot,KIT.cylY(.047,.052,.025,10),side*1.4+dx,1.36,2.76);
      }
      return target.add(slot,g,...args);
    };
  }}))});
  try{
    const result=build();assert.deepEqual(seen,[[-1,-.075],[-1,.075],[1,-.075],[1,.075]],'All and only four original lamps');
    return result;
  }finally{registerProfiledBuilders({t90m:original});}
}

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
