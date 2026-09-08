import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders,KIT} from '../tankFactoryCore.ts';
import {buildMerkava3DX,buildMerkava4X} from './merkavaX.ts';
import {createTankState} from '../../sim/movement.ts';
import {getSpec} from '../specs.ts';

const material=new T.MeshBasicMaterial({side:T.FrontSide});
const vec=a=>new T.Vector3(...a);
const hits=(meshes,p,d,far)=>new T.Raycaster(vec(p),vec(d).normalize(),0,far).intersectObjects(meshes,false);
const records=[
  {id:'merkava4_x',build:buildMerkava4X,inner:1.73,outer:1.8384,skirt:1.25,roof:1.604,z:0,
    stations:[[-2.980,1.73,1.587512],[-2.700,1.73,1.610190],[-2.670,1.73,1.612620],
      [-2.640,1.73,1.601641],[-2,1.73,1.604],[1.963,1.73,1.604],
      [2.8,1.73,1.347],[3.002,1.308686,1.31064]],
    panels:Array.from({length:8},(_,i)=>-2.98+i*.75+.366)},
  {id:'merkava3d_x',build:buildMerkava3DX,inner:1.825,outer:1.92,skirt:1.43634,roof:1.70734,z:0,
    stations:[[-3.49,1.805,1.651233],[-2.96,1.825,1.734],[-2.21,1.825,1.687],
      [.58,1.825,1.687],[2.18,1.825,1.49],[2.69,1.825,1.44],[2.976,1.825,1.428327]]
      .map(([z,x,y])=>[z+.2258175,x,y+.02034]),
    panels:Array.from({length:10},(_,i)=>-3.49+i*.648+.317+.2258175)},
];
let counterexamples=0,contacts=0,builds=0,phases=0,seamSamples=0;
function closed(geometry) {
  const p=geometry.attributes.position,edges=new Map();let volume=0;
  for(let i=0;i<p.count;i+=3){
    const v=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,i+j));
    volume+=v[0].dot(v[1].clone().cross(v[2]))/6;
    const keys=v.map(q=>q.toArray().map(n=>Math.round(n*1e6)).join(','));
    for(let j=0;j<3;j++){const key=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}
  }
  assert.ok(volume>0,'Outward finite folded stock, not reversed faces');
  assert.ok([...edges.values()].every(count=>count===2),'Every edge has two faces, including concave caps');
}
function contactChecks(record,old,added) {
  const {inner,outer,skirt,roof,z}=record;
  for(const side of [-1,1]){
    const x=side*(inner+outer)/2;
    assert.equal(hits(old,[x,roof+.1,z],[0,-1,0],.13).length,0,'Old upper-skin gap (lower hangers are not a deck closure)');
    assert.ok(hits(added,[x,roof+.1,z],[0,-1,0],.13).length,'Actual folded top closes trench');counterexamples++;
    const lap=hits(old,[side*(inner+.004),roof+.05,z],[0,-1,0],.09)[0];
    assert.ok(lap&&lap.point.y>roof-.016,'Inner top return penetrates existing deck stock');contacts++;
    // At Z=0 the Mk4 panel is only 2 mm from its chamfered end. Test
    // independent panel centres for actual receiving stock, and the seam
    // above for the continuous return rather than mistaking a seam for a seat.
    for(const panelZ of record.panels){
      const outerHit=hits(old,[side*(outer+.07),skirt-.006,panelZ],[-side,0,0],.11)[0];
      assert.ok(outerHit&&side*outerHit.point.x>outer-.014,`Lower leg seats within actual skirt stock ${JSON.stringify({id:record.id,side,outer,skirt,panelZ,hit:outerHit?.point.toArray()})}`);contacts++;
    }
    assert.equal(hits(added,[side*(outer+.08),.60,z],[-side,0,0],.30).length,0,'Lower wheel faces remain open');
    for(let i=1;i<record.stations.length;i++){
      const a=record.stations[i-1],b=record.stations[i];
      for(const t of [.05,.25,.5,.75,.95]){
        const [stationZ,stationX,stationY]=a.map((v,j)=>v+(b[j]-v)*t);
        const contact=hits(old,[side*(stationX+.004),stationY+.05,stationZ],[0,-1,0],.09)[0];
        assert.ok(contact&&contact.point.y>stationY-.016,
          `Entire inner deck lap must receive actual body stock ${JSON.stringify({id:record.id,side,stationZ,stationX,stationY,hit:contact?.point.toArray()})}`);
        assert.ok(hits(added,[side*(stationX+outer)/2,stationY+.05,stationZ],[0,-1,0],.09).length,
          'Every longitudinal section has a physical top skin');
        seamSamples++;
      }
    }
  }
}
function gearClearance(tank,added) {
  const rig=tank.root.getObjectByName('rig_hull'),inverse=rig.matrixWorld.clone().invert();
  const targets=added.map(m=>({mesh:m,box:new T.Box3().setFromObject(m)}));
  const matrix=new T.Matrix4(),p=new T.Vector3();
  let intersections=0;
  rig.traverse(mesh=>{
    if(!mesh.isInstancedMesh||!(/gearTrack|gearRoadWheel|gearIdler|gearSprocket|gearReturn/.test(mesh.name)))return;
    for(let instance=0;instance<mesh.count;instance++){
      mesh.getMatrixAt(instance,matrix);matrix.premultiply(mesh.matrixWorld).premultiply(inverse);
      const box=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(matrix);
      for(const target of targets){
        if(!box.intersectsBox(target.box))continue;
        const a=mesh.geometry.attributes.position;
        for(let i=0;i<a.count;i++){
          p.fromBufferAttribute(a,i).applyMatrix4(matrix);
          if(!target.box.containsPoint(p))continue;
          // Closed target: odd double-sided intersections imply real interior.
          const double=new T.Mesh(target.mesh.geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
          const raw=hits([double],p.toArray(),[.872,.317,.374],2);
          double.material.dispose();
          const distances=raw.map(h=>h.distance).filter((d,k,a)=>!k||d-a[k-1]>.000001);
          if(distances.length%2&&distances[0]>.00002)intersections++;
        }
      }
    }
  });
  assert.equal(intersections,0,'Actual emitted moving gear vertices must not penetrate new shoulder stock');
}
for(const record of records)for(const quality of ['high','low']){
  const old=[],added=[];
  registerProfiledBuilders({[record.id]:P=>record.build(new Proxy(P,{get(target,key){
    if(key!=='add')return Reflect.get(target,key);
    return (slot,g,...args)=>{
      if(slot==='hull'){
        const mesh=new T.Mesh(KIT.xform(g.clone(),...args),material);mesh.updateMatrixWorld(true);
        (g.userData.merkavaUpperShoulderReturn||g.userData.sourceXDeckReturn?added:old).push(mesh);
      }
      return target.add(slot,g,...args);
    };
  }}))});
  let tank;
  try{
    tank=createTank(record.id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    assert.equal(added.length,2,'Both physical folded returns');
    added.forEach(m=>closed(m.geometry));contactChecks(record,old,added);
    const state=createTankState(getSpec(record.id),vec([0,0,0]),0);
    for(let phase=0;phase<12;phase++){
      state.trackScroll.l=phase*.017;state.trackScroll.r=-phase*.019;
      tank.syncFromState(state,1/60,10);tank.root.updateMatrixWorld(true);gearClearance(tank,added);phases++;
    }
    for(const name of tank.root.userData.eraClusterNames??[])tank.stripEra(name);
    const hull=tank.root.getObjectByName('hull'),rig=tank.root.getObjectByName('rig_hull');
    for(const side of [-1,1]){
      const p=rig.localToWorld(vec([side*(record.inner+record.outer)/2,record.roof+.1,record.z]));
      assert.ok(new T.Raycaster(p,vec([0,-1,0]),0,.15).intersectObject(hull,false).length,'Merged visible permanent closure survives ERA removal');
    }
    tank.resetEra();builds++;
  }finally{tank?.dispose();[...old,...added].forEach(m=>m.geometry.dispose());registerProfiledBuilders({[record.id]:record.build});}
}
material.dispose();
console.log(JSON.stringify({pass:true,builds,counterexamples,contacts,phases,seamSamples,
  limitation:'Physical sheet and receiver contacts plus emitted gear-vertex phase samples; not a full terrain suspension or arbitrary triangle intersection certificate.'}));
