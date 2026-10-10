import assert from 'node:assert/strict';
import {shoulderCoverTop,T72B3M_DECK_FRONT_Z} from './t72b3mXSideMounts.ts';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {addT72B3MSideMounts} from './t72b3mXSideMounts.ts';
import { near } from '../../../tools/receipt-kit.test-support.mjs';

// The held-out per-mesh preservation ledger (docs/references/tanks/t72b3m_x.side-mount-preservation.json, rewritten by
// COT_UPDATE_LEDGER) is retired: whole-tank change detection of t72b3m_x is the fleet geometry ledger's. The marking
// validation, source surfaces/air, helper wiring and ERA-depleted attachment proofs stay.
function legacyAttributeNames(g){
  // Validate the semantic lamp-mask byte channel independently of the paint attributes.
  const a=g.getAttribute('nightEmissionMask');
  if(a){
    assert.ok(a.array instanceof Uint8Array,'night mask is byte-sized');
    assert.equal(a.itemSize,1);assert.equal(a.normalized,false);
    assert.equal(a.count,g.getAttribute('position').count,'one mask value per original vertex');
    assert.ok(a.array.every(v=>v===0||v===1||v===2),'only supported semantic lens values');
  }
  return Object.keys(g.attributes).filter(k=>k!=='nightEmissionMask');
}
function paintQuadSide(m,start){
  // 2026-09-14: the insignia pair may sit on the hull tub or, with the fender-to-skirt gap closed,
  // on the turret cheek. The quad is verified structurally: one 240 mm square with four distinct
  // corners, planar, all four normals equal and facing outward on its side of the tank.
  const p=m.geometry.attributes.position,normal=m.geometry.attributes.normal;
  const points=[0,1,2,3].map(j=>new T.Vector3().fromBufferAttribute(p,start+j).applyMatrix4(m.matrixWorld));
  const centre=points.reduce((c,v)=>c.add(v),new T.Vector3()).multiplyScalar(.25);
  const side=Math.sign(centre.x);
  assert.ok(side!==0&&Math.abs(centre.x)>.9,'paint sits on one side of the tank');
  const n0=new T.Vector3().fromBufferAttribute(normal,start).transformDirection(m.matrixWorld);
  assert.ok(n0.x*side>.15,'paint faces outward on its side (hull tub wall, or the raked turret cheek)');
  const corners=new Set();
  for(let j=0;j<4;j++){
    const v=points[j],d=v.clone().sub(centre);
    assert.ok(Math.abs(Math.abs(d.dot(n0)))<1e-4,'paint quad is planar on its seat');
    assert.ok(Math.abs(d.length()-.12*Math.SQRT2)<1e-3,'excluded paint is exactly the approved 240 mm marking square');
    // corner signature in the quad's own plane
    const up=new T.Vector3(0,1,0),ax=new T.Vector3().crossVectors(up,n0).normalize(),ay=new T.Vector3().crossVectors(n0,ax).normalize();
    corners.add(`${Math.sign(d.dot(ax))},${Math.sign(d.dot(ay))}`);
    const n=new T.Vector3().fromBufferAttribute(normal,start+j).transformDirection(m.matrixWorld);
    assert.ok(n.distanceTo(n0)<1e-6,'paint vertices share one outward normal');
  }
  assert.equal(corners.size,4,'paint has four distinct corners, not extra physical stock');
  return side;
}

function verifiedPaintBuffer(m){
  assert.equal(m.isInstancedMesh,undefined,'no physical instances may be excluded as paint');
  assert.deepEqual(legacyAttributeNames(m.geometry).sort(),['normal','position','uv']);
  const mask=m.geometry.getAttribute('nightEmissionMask');
  assert.ok(!mask||mask.array.every(v=>v===0),'authenticated paint cannot contain a glowing lamp face');
  const {position:p,normal,uv}=m.geometry.attributes,index=m.geometry.index;
  assert.ok(p.count===4||p.count===8,'only one or two complete marking quads may be excluded');
  assert.equal(p.itemSize,3);assert.equal(normal.itemSize,3);assert.equal(uv.itemSize,2);
  assert.equal(normal.count,p.count);assert.equal(uv.count,p.count);assert.equal(index?.count,p.count/4*6);
  const indices=[],uvs=[],sides=[];
  for(let start=0;start<p.count;start+=4){
    indices.push(...[0,2,1,2,3,1].map(i=>i+start));uvs.push(0,1,1,1,0,0,1,0);
    sides.push(paintQuadSide(m,start));
  }
  assert.deepEqual(Array.from(index.array),indices,'every excluded triangle is a marking-plane triangle');
  assert.deepEqual(Array.from(uv.array),uvs,'complete marking UVs, not a physical mixed batch');
  return sides;
}

function verifiedPaintMeshes(tank){
  const paint=new Set(),sides=[];
  tank.root.traverse(m=>{
    if(!m.isMesh||!m.userData.vehicleMarking)return;
    // 2026-09-14: with the fender-to-skirt gap closed the hull-side seat is no longer visible, so the
    // verified seat solver moves the insignia pair to the turret; either fixed body may carry it.
    assert.ok(m.parent.name==='rig_hull'||m.parent.name==='rig_turret','the deliberate pair belongs to a fixed body (hull or turret)');
    sides.push(...verifiedPaintBuffer(m));paint.add(m);
    // An otherwise exact paint quad with a live lens tag must not qualify.
    const changed=m.clone();changed.geometry=m.geometry.clone();
    try{
      const values=new Uint8Array(changed.geometry.attributes.position.count);values[0]=1;
      changed.geometry.setAttribute('nightEmissionMask',new T.BufferAttribute(values,1));
      assert.throws(()=>verifiedPaintBuffer(changed));
    }finally{changed.geometry.dispose();}
  });
  // 2026-09-14: the verified seats put the insignia and the designation on the turret; each quad is
  // validated structurally above, and the excluded set must be paint only (no physical stock).
  assert.ok(sides.length>=1&&sides.every(s=>s===1||s===-1),'excluded paint is the verified marking set, nothing else');
  return paint;
}

function markings(tank,quality){
  const paint=verifiedPaintMeshes(tank);
  // 2026-09-22 (owner: holes are added, not carved, to save triangles): the fleet fallback mouth is a
  // flat ring + disc, so at low quality the standalone Rim is the physical non-paint mesh the control uses.
  if(quality==='low'){
    let rim;tank.root.traverse(m=>{if(!rim&&m.isMesh&&!paint.has(m)&&m.userData.carvedBoreStock)rim=m;});
    assert.ok(rim,'physical non-paint control mesh exists');
    assert.throws(()=>verifiedPaintBuffer(rim),assert.AssertionError,
      'the complete original non-paint batch cannot qualify for the paint exclusion');
  }
}

const hits=(meshes,p,d=[0,-1,0],far=10)=>new T.Raycaster(new T.Vector3(...p),new T.Vector3(...d),0,far).intersectObjects(meshes,false);
const ray=(meshes,p,d,far)=>hits(meshes,p,d,far)[0];
function stocksAt(mesh,p){
  const material=new T.MeshBasicMaterial({side:T.DoubleSide}),probe=new T.Mesh(mesh.geometry,material);
  probe.matrixWorld.copy(mesh.matrixWorld);let count=0,last=-1,lastSign=0;
  try{
    for(const h of new T.Raycaster(new T.Vector3(...p),new T.Vector3(1,0,0),0,8).intersectObject(probe,false)){
      const nx=h.face.normal.clone().transformDirection(mesh.matrixWorld).x;if(Math.abs(nx)<1e-7)continue;
      const sign=Math.sign(nx);if(Math.abs(h.distance-last)<1e-7&&sign===lastSign)continue;
      count+=sign;last=h.distance;lastSign=sign;
    }
    return count;
  }finally{material.dispose();}
}

function physicalMeshes(root){
  const meshes=[];root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly&&!m.userData.vehicleMarking&&
    !/Proxy|procShadow/.test(m.name))meshes.push(m);});return meshes;
}

function sourceSurfaces(all){
  // 2026-09-14 owner ruling: the fender-to-skirt gaps are closed. Over the deck return the
  // shoulder cover's top follows the deck edge, capped by the skirt top (shoulderCoverTop);
  // the mounted source surfaces below it are covered, not moved.
  // 2026-10-03: the cover runs the whole deck fender, through the former front pocket (z 2.70-2.93, between the
  // last upper link and the front lower link) to the deck fender's front station.
  for(const side of [-1,1])for(const z of [-3.0,-2.5,-1.2,-.5,0,.2,1.01,1.05,1.9,2.35,2.6,2.75,2.80,2.85,2.90,3.00,
    T72B3M_DECK_FRONT_Z-.005])
    for(const x of [1.80,1.86,1.90,1.925])
      near(ray(all,[side*x,3,z])?.point.y,shoulderCoverTop(z),.003,`shoulder cover top at x ${x} z ${z}`);
  near(ray(all,[1.93,1.34,-.6],[0,0,1])?.point.z,-.547072,.001,'source outer-ear fore plane');
  // the cover sits over the deck return and stops at the skirt lane's inner face
  for(const side of [-1,1]){
    const hit=ray(all,[side*1.86,1.6,.6],[0,-1,0]);
    assert.ok(hit&&hit.object.name==='hullDetail','cover is permanent hullDetail stock');
    assert.equal(Boolean(ray(all,[side*1.975,shoulderCoverTop(.6)+.06,.6],[0,0,1],.05)),false,'no cover outside the skirt lane');
  }
}

function sourceAir(all){
  // The channel rays that used to prove the source's open air now prove the cover.
  for(const side of [-1,1])for(const z of [-.29,-.28,0,.60,1.30,2.80,2.85,2.90])
    assert.equal(Boolean(ray(all,[side*1.86,4,z])),true,'fender-to-skirt gap is closed (owner 2026-09-14)');
  // Control: in the former front pocket the cover is the only stock in plan. Every hit of a vertical ray there lies in
  // the cover slab, so a cover ending at the last rail-field station (z 2.702, until 2026-10-03) leaves open air.
  for(const side of [-1,1])for(const z of [2.80,2.85,2.90])for(const x of [1.80,1.86,1.90]){
    const top=shoulderCoverTop(z),found=hits(all,[side*x,4,z]);
    assert.ok(found.length>0&&found.every(h=>h.point.y<=top+.003&&h.point.y>=top-.024-.003),
      `the former front pocket at x ${x} z ${z} holds nothing but the cover (${found.map(h=>h.point.y.toFixed(4)).join(', ')})`);
  }
  for(const side of [-1,1]){
    assert.equal(Boolean(ray(all,[side*1.86,1.30,-.51])),false,'source air below inner clamp lip');
    assert.equal(Boolean(ray(all,[side*1.90,1.31,-.61],[0,0,1],.028)),false,'air outside the bounded lower jaw');
  }
  assert.equal(Boolean(ray(all,[1.96,1.37,-.6],[0,0,1],.10)),false,
    'source rounded outer-ear corner air, not a rectangular bounding-box tab');
  // the two rail fields between the ERA cassettes carry a backing sheet in the skirt lane
  for(const side of [-1,1])for(const z of [-2.40,-1.55])
    assert.ok(ray(all,[side*2.3,1.15,z],[-side,0,0])?.point.x!==undefined&&Math.abs(ray(all,[side*2.3,1.15,z],[-side,0,0]).point.x)>=1.93,'rail field is backed at the skirt lane');
}

function actualWiring(detail){
  const p=detail.geometry.attributes.position,v=new T.Vector3(),keys=new Set();
  const key=a=>a.map(x=>Math.round(Math.fround(x)*1e5)).join(',');
  for(let i=0;i<p.count;i++)keys.add(key(v.fromBufferAttribute(p,i).applyMatrix4(detail.matrixWorld).toArray()));
  let emitted=0;
  addT72B3MSideMounts({addEquipment(_bucket,g,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    const m=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(1,1,1));
    const a=g.attributes.position;
    for(let i=0;i<a.count;i++)assert.ok(keys.has(key(v.fromBufferAttribute(a,i).applyMatrix4(m).toArray())),
      `every independently authored support vertex is present in the actual high/low permanent owner: part${emitted} ${v.toArray()}`);
    emitted++;g.dispose();
  }});
  assert.ok(emitted>100,'full paired physical mounting helper is wired');
}

function attachment(tank,all){
  const hull=tank.root.getObjectByName('hull'),detail=tank.root.getObjectByName('hullDetail');
  for(const p of [[-1.762,1.506,0],[1.75,1.506,0]])
    assert.ok(stocksAt(hull,p)>0&&stocksAt(detail,p)>0,'actual source edge/case stock overlaps unchanged deck');
  for(const side of [-1,1])for(const z of [-1.23279,-.51285,.2065,.90944,1.64549,2.35716,2.99425]){
    const front=z>2.9,rise=front?.009465:z>2.3?.003645:0;
    const inner=(side>0?1.76887+.00061*z:1.76898-.00061*z)+(front?.00445:z>2.3?.00525:0);
    const station=z+(side<0?.002255:0),outerRise=front?.013497:0;
    for(const p of [[side*(inner+.002),1.3789+rise,station],
      [side*(inner+.157),z>2.3&&z<2.9?1.3390:1.3383+rise,station],
      [side*(inner+.149),1.32+outerRise,station-.02934]])
      assert.ok(stocksAt(detail,p)>=2,`positive web/lug, web/jaw and jaw/ear contact: ${p}`);
    const x=side>0?1.945:-1.948;
    assert.ok(stocksAt(detail,[x,1.33+outerRise,station-.02934])>=2,
      'outer ear remains seated in permanent side-armor backing after ERA depletion');
  }
  assert.ok(all.includes(detail));
}

for(const quality of ['high','low']){
  const tank=createTank('t72b3m_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try{
    tank.root.updateMatrixWorld(true);const all=physicalMeshes(tank.root),detail=tank.root.getObjectByName('hullDetail');
    sourceSurfaces(all);sourceAir(all);actualWiring(detail);markings(tank,quality);
    for(const plate of tank.root.userData.eraVisualBindingReceipt.plates)tank.stripEra(plate.name);
    attachment(tank,all);sourceAir(all);
    assert.equal(tank.resetEra(),true);sourceSurfaces(all);
  }finally{tank.dispose();}
}
console.log('t72b3mXSideMounts: high/low actual source surfaces, full helper wiring, permanent attachment after ERA stripping, shoulder cover closes the fender-to-skirt gap to the front fender, clamp air PASS');
