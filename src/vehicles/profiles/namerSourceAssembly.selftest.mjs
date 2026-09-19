import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {ensureInteriorFills,hasInteriorFills} from '../interiorFills.ts';
import {buildNamerIfv} from './merkavaX.ts';
import {KIT} from './kit.ts';

const id='namer_ifv', solid=new T.MeshBasicMaterial({side:T.DoubleSide});
function effective(object){
  for(let p=object;p;p=p.parent)if(!p.visible||p.userData.shadowOnly)return false;
  return true;
}
function first(root,origin,direction,far=10){
  return new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction),0,far)
    .intersectObject(root,true).find(hit=>effective(hit.object));
}
function near(actual,expected,tolerance,label){
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
    `${label}: ${actual} vs source ${expected} ±${tolerance}`);
}
function build(quality,omitBase=false){
  const parts=[];
  console.log("namerSourceAssembly build",quality,omitBase);
  registerProfiledBuilders({[id](P){
    const add=P.add;
    P.add=(bucket,g,...transform)=>{
      const local=KIT.xform(g.clone(),...transform);local.computeBoundingBox();
      const box=local.boundingBox;
      const base=bucket==='turretDetail'&&Math.abs(box.min.x+.12)<1e-5
        &&Math.abs(box.max.x-.12)<1e-5&&Math.abs(box.max.y-.458)<1e-5;
      if(omitBase&&base){local.dispose();g.dispose();return;}
      parts.push({bucket,local,parent:bucket.startsWith('hull')?P.hullG:P.turretG});
      add(bucket,g,...transform);
    };
    buildNamerIfv(P);
  }});
  let tank;
  try{tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242,batchStatic:false});}
  finally{registerProfiledBuilders({[id]:buildNamerIfv});}
  console.log("namerSourceAssembly built",quality,parts.length);
  tank.root.updateMatrixWorld(true);
  tank.root.traverse(o=>{
    if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0);}
    if(o.isMesh&&(/shadow|vehicleMarking/.test(o.name)||o.userData.shadowOnly))o.visible=false;
  });
  for(const p of parts){
    p.local.applyMatrix4(p.parent.matrixWorld);
    p.mesh=new T.Mesh(p.local,solid);p.mesh.updateMatrixWorld(true);
  }
  return {tank,parts,dispose(){tank.dispose();for(const p of parts)p.local.dispose();}};
}

// Independent complete-source calipers, canonical original SHA72afdec001c1….
// These withheld rays do not depend on the authored station list.
function sourceStock(b){
  for(const [x,z,y]of[[.33,1.47,1.84034862],[.61,2.19,1.670527],
    [1.24,2.61,1.577135],[.46,3.28,1.383642]])
    near(first(b.tank.root,[x,4,z],[0,-1,0])?.point.y,y,.006,'continuous source glacis');
  near(first(b.tank.root,[0,1,-4.2],[0,0,1])?.point.z,-2.193450,.004,'closed door at front of rear lane');
  for(const x of[-.7,.7]){
    near(first(b.tank.root,[x,1.5,-4.2],[0,0,1])?.point.z,-3.660024,.002,'real rear shoulder wall');
    near(first(b.tank.root,[x,4,-3.30],[0,-1,0])?.point.y,1.9124,.003,'rear shoulder roof');
  }
  for(const x of[-.208,.208])
    near(first(b.tank.root,[x,2.936,-3],[0,0,1])?.point.z,-2.590319,.008,'exposed round rear receiver');
  near(first(b.tank.root,[0,4,-2.55],[0,-1,0])?.point.y,3.119873,.002,'correct rising thin cover');
  for(const x of[-.567773444931954,.567773444931954])
    near(first(b.tank.root,[x,4,3.568515478829081],[0,-1,0])?.point.y,.8691259,.002,
      'source bent towing stock occupies actual continuity cell');
}
function realAir(b){
  for(const x of[-.25,0,.25])for(const z of[-3.4,-2.95,-2.8])
    assert.ok(!first(b.tank.root,[x,4,z],[0,-1,0]),`open rear lane, no fake outer door ${x}/${z}`);
  near(first(b.tank.root,[-.45,2.64,-1.8],[1,0,0])?.point.x,.30717155,.002,
    'generated fill retains source roof channel wall');
  for(const x of[-.5834,.5834])
    assert.ok(!first(b.tank.root,[x,.91,3.55],[0,0,1],.045),'forged hook retains upper throat');
  assert.ok(!first(b.tank.root,[-.25,2.82,-2.45],[1,0,0],.15),
    'air beside central support web');
}
function contains(mesh,point){
  const d=new T.Vector3(.973,.187,.129).normalize(),p=new T.Vector3(...point);
  const hits=new T.Raycaster(p.clone().addScaledVector(d,-8),d,0,16).intersectObject(mesh)
    .filter((h,i,a)=>i===0||Math.abs(h.distance-a[i-1].distance)>1e-7);
  const a=hits.filter(h=>h.distance<8-1e-6).at(-1),c=hits.find(h=>h.distance>8+1e-6);
  return !!a&&!!c&&a.face.normal.dot(d)<-1e-5&&c.face.normal.dot(d)>1e-5;
}
function supportPoint(x,v,u){
  const c=Math.cos(.09304),s=Math.sin(.09304);return [x,v*c+u*s,u*c-v*s];
}
function seats(b){
  const joints=[
    ['roof/base',[0,2.455,-2.30],['turret','turretDetail']],
    ['base/web',[0,2.555,-2.10],['turretDetail','turretDetail']],
    ['web/tray',supportPoint(0,3.071,-1.8),['turretDetail','turretDetail']],
    ...[-1,1].flatMap(side=>[
      ['tray/collar',supportPoint(side*.208,3.0715,-2.27),['turretDetail','turretDetail']],
      ['collar/body',supportPoint(side*.208,3.171,-2.257),['turretDetail','turretDetail']],
      ['body/saddle',supportPoint(side*.225,3.244,-1.8),['turretDetail','turretDetail']],
      ['saddle/rail',supportPoint(side*.23,3.280,-1.8),['turretDetail','turretDetail']],
      ['rail/tab',supportPoint(side*.286,3.293,-2.20),['turretDetail','turretDetail']],
      ['tab/cover',supportPoint(side*.286,3.329,-2.20),['turretDetail','turretDetail']],
    ]),
  ];
  for(const [label,point,buckets]of joints){
    const matches=b.parts.filter(p=>contains(p.mesh,point));
    for(const bucket of new Set(buckets))assert.ok(matches.filter(p=>p.bucket===bucket).length
      >=buckets.filter(v=>v===bucket).length,`${label}: finite stock overlaps at ${point}`);
  }
  return joints.length;
}
function insertedBox(b,size,point,fn,message){
  const geometry=new T.BoxGeometry(...size),mesh=new T.Mesh(geometry,solid);
  mesh.position.set(...point);b.tank.root.add(mesh);b.tank.root.updateMatrixWorld(true);
  try{assert.throws(()=>fn(b),message);}
  finally{mesh.removeFromParent();geometry.dispose();}
}
const report=[];
for(const filled of[false,true]){
  if(filled){await ensureInteriorFills([id]);assert.ok(hasInteriorFills(id));}
  for(const quality of['high','low']){
    const b=build(quality);
    try{
      sourceStock(b);console.log("source stock checked",quality,filled);realAir(b);const joints=seats(b);
      insertedBox(b,[.65,1.2,.10],[0,1.3,-3.35],realAir,/open rear lane/);
      // Replay the actual former broad-fill intruder: 24.5mm beyond the
      // source wall. A blanket visibility or bucket exception cannot pass.
      insertedBox(b,[.050,.12,.12],[.3075,2.64,-1.8],realAir,/roof channel/);
      insertedBox(b,[.628,.08,1.0],[0,3.155,-2.2],sourceStock,/thin cover/);
      report.push({quality,filled,joints});
    }finally{b.dispose();}
  }
}
const missing=build('high',true);
try{assert.throws(()=>seats(missing),/roof\/base|base\/web/);}
finally{missing.dispose();solid.dispose();}
console.log('namerSourceAssembly PASS',JSON.stringify(report));
