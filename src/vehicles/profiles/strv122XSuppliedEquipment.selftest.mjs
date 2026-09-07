import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';

const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,
  `${label}: ${a} vs independently measured ${b} ±${e}`);
const hit=(meshes,p,d,far=10)=>new T.Raycaster(new T.Vector3(...p),
  new T.Vector3(...d),0,far).intersectObjects(meshes,false)[0];

function containsClosedStock(mesh,p){
  assert.ok(mesh,'actual emitted stock mesh exists');
  const material=new T.MeshBasicMaterial({side:T.DoubleSide});
  const probe=new T.Mesh(mesh.geometry,material);probe.matrixWorld.copy(mesh.matrixWorld);
  try{
    // Merged equipment contains overlapping original closed pieces. A nearer
    // entry into another piece must not make an already occupied point empty.
    const rows=new T.Raycaster(new T.Vector3(...p),new T.Vector3(1,0,0),0,10)
      .intersectObject(probe,false);let winding=0,last=-1,lastSign=0;
    for(const h of rows){
      const nx=h.face.normal.clone().transformDirection(mesh.matrixWorld).x;
      if(Math.abs(nx)<1e-7)continue;const sign=Math.sign(nx);
      if(Math.abs(h.distance-last)<1e-7&&sign===lastSign)continue;
      winding+=sign;last=h.distance;lastSign=sign;
    }
    return winding>0;
  }finally{material.dispose();}
}

function roofSurfaces(all){
  for(const[x,z,y,e]of [[-.069,.279,2.509255,.001],[-.12,.33,2.675111,.002],
    [-.94,.84,2.527063,.002],[-.777,.927,2.545117,.002],
    [-.613,-1.3,2.825383,.003],[-.76,-.219,3.024400,.002],
    [-.276,-.349,2.958688,.001],[-.909,-.357,2.948268,.003],
    [-.64,-.48,2.906200,.001],[-.55,-.48,2.722023,.001]])
    near(hit(all,[x,4,z],[0,-1,0])?.point.y,y,e,'actual source roof/weapon crown');
  near(hit(all,[-.12,2.6,.6],[0,0,-1])?.point.z,.339369,.002,
    'source narrow post forward surface');
  assert.equal(Boolean(hit(all,[-.069,2.6,.6],[0,0,-1],.5)),false,
    'source air beside post is not an invented broad optical housing');
  near(hit(all,[-.777,2.47,1.09],[0,0,-1])?.point.z,1.014520,.001,
    'source-backed recessed front optical surface');
  assert.equal(Boolean(hit(all,[-.777,2.47,1.054],[0,0,-1],.030)),false,
    'left visor has genuine approach air');
  assert.ok(Boolean(hit(all,[-1.043,2.47,1.09],[0,0,-1],.04)),
    'left visor has positive outboard jamb stock');
  assert.equal(Boolean(hit(all,[1.055,2.459,1.1015],[0,0,-1],.018)),false,
    'small31mm sight has scaled walls/back rather than glass beyond its mouth');
}

function basketSurfaces(all){
  for(const[x,y,z]of [[0,2.214,-3.385790],[1.10,2.214,-3.369060],
    [1.18,2.214,-3.349736],[.6,2.107,-3.386446]])
    near(hit(all,[x,y,-4],[0,0,1])?.point.z,z,.004,'source rounded aft cage');
  near(hit(all,[2,2.214,-3.1],[-1,0,0])?.point.x,1.370593,.005,
    'source side return width, not old narrow basket');
  for(const y of [1.956,2.017,2.074,2.135,2.185,2.239])
    assert.equal(Boolean(hit(all,[0,y,-4],[0,0,1],.85)),false,
      'source intervals between all seven aft courses remain open');
  for(const y of [1.922,1.985,2.046,2.101,2.158,2.214,2.273])
    assert.ok(Boolean(hit(all,[0,y,-4],[0,0,1],.7)),
      'actual source course exists as positive cylindrical stock');
}

function antennaSeats(t,all){
  const armor=t.root.getObjectByName('turret');
  for(const[x,z,y]of [[.6801,-1.819,2.486],[.0136,-1.817,2.486],
    [1.0038,-2.4224,2.462],[-.9833,-2.4243,2.462]]){
    const p=[x+(x<0?.020:-.020),y,z];
    assert.ok(containsClosedStock(armor,p)
      &&all.some(m=>/turretDetail/.test(m.name)&&containsClosedStock(m,p)),
    `source antenna foot has positive roof contact, not the old26mm air gap: ${x},${z}`);
    assert.ok(all.some(m=>/turretDetail/.test(m.name)
      &&containsClosedStock(m,[p[0],2.505,z])),
    'the receiving foot has continuous closed stock up to the spindle');
  }
  // Held-out complete-source flange/neck rays: not candidate-derived bounds.
  for(const[x,z,y,e]of [[.7601,-1.809,2.531353,.002],
    [.6801,-1.719,2.527591,.002],[.1136,-1.717,2.559323,.002],
    [.1536,-1.817,2.559471,.002],[1.0638,-2.4224,2.482145,.003],
    [-1.0433,-2.4243,2.481231,.003],[1.0438,-2.4224,2.559620,.006]])
    near(hit(all,[x,3,z],[0,-1,0])?.point.y,y,e,'measured antenna receiver surface');
  for(const[x,z]of [[.1836,-1.817],[.1436,-1.687],[.6601,-1.699]])
    assert.equal(Boolean(hit(all,[x,2.55,z],[0,-1,0],.031)),false,
      'source air outside each circular foot is not filled by a square support');
  for(const[x,z,y]of [[.6801,-1.819,5.359131746953],
    [.0136,-1.817,3.105099245502],[1.0038,-2.4224,3.159506674405],
    [-.9833,-2.4243,2.921656993616]])
    near(hit(all,[x,6,z],[0,-1,0])?.point.y,y,.000002,'original source aerial tip is unchanged');
}

function smokeSurfaces(all){
  // Independent complete-source surface values, not rounded source AABBs.
  for(const[y,z,right,left]of [[2.32,-1.94,1.431344,-1.411743],
    [2.30,-1.94,1.445951,-1.425584],[2.30,-1.72,1.437698,-1.421959],
    [2.30,-1.50,1.472946,-1.449849],[2.08,-1.96,1.417741,-1.398186],
    [2.08,-1.77,1.442117,-1.421676],[2.08,-1.54,1.470295,-1.447863],
    [2.30,.40,1.558933,-1.534585],[2.26,.57,1.563853,-1.541056],
    [2.18,.35,1.670806,-1.641108],[2.13,-1.10,1.519280,-1.502744]]){
    near(hit(all,[2,y,z],[-1,0,0])?.point.x,right,.012,'right source canister/link surface');
    near(hit(all,[-2,y,z],[1,0,0])?.point.x,left,.012,'left source canister/link surface');
  }
  for(const side of [-1,1]){
    for(const[y,z,far]of [[2.317,-2.10,.40],[2.25,-1.84,.38],
      [2.17,-1.80,.40],[2.29,.475,.17],[2.18,-1.10,.15],[2.075,-1.10,.15]])
      assert.equal(Boolean(hit(all,[side*(z===-1.1?1.60:1.70),y,z],[-side,0,0],far)),false,
        'source air around discrete banks, individual tubes and separate side rod survives');
  }
}

function canisterStocks(t,all){
  const armor=t.root.getObjectByName('turret');
  for(const side of [-1,1])for(const[x,y,z]of [[1.410,2.304,-1.937],
    [1.411,2.299,-1.720],[1.443,2.298,-1.502],[1.388,2.074,-1.961],
    [1.412,2.076,-1.769],[1.441,2.073,-1.547],[1.519,2.290,.410],[1.517,2.254,.570]]){
    const direction=z>0?[-side*.61,.74,.29]:y>2.2?[side*.66,.75,.10]:[side*.62,.74,.25];
    const axis=new T.Vector3(...direction).normalize();
    const end=new T.Vector3(side===1?x:-x+.021,y,z);
    const ahead=end.clone().addScaledVector(axis,.08);
    assert.ok(Boolean(hit(all,ahead.toArray(),axis.clone().negate().toArray(),.066)),
      'all sixteen supplied capped canisters exist; no invented deep empty shell');
    const stock=end.clone().addScaledVector(axis,-.176);
    assert.ok(all.some(m=>/turretDetail/.test(m.name)&&containsClosedStock(m,stock.toArray())),
      `all sixteen actual tubes retain closed load-bearing rear stock: side${side}, end${end.toArray()}`);
    const wall=z>0?1.483:1.229+Math.max(0,stock.z+1.94)*.145;
    const root=[side===1?wall:-wall+.021,stock.y-(z>0?.027:.012),stock.z];
    // The forward web is a capped round bar. Use positive interior stock,
    // not its mathematically ambiguous end-cap boundary.
    if(z>0)root.splice(0,3,...new T.Vector3(...root).lerp(stock,.06).toArray());
    assert.ok(containsClosedStock(armor,root)
      &&all.some(m=>/turretDetail/.test(m.name)&&containsClosedStock(m,root)),
    `actual canister mount and permanent armor share stock: side${side}, end${end.toArray()}`);
  }
  for(const side of [-1,1])for(const z of [-2.015,-1.615,-.680,-.530]){
    const wall=1.225+(z+2.015)*.130,p=[(side===1?wall:-wall+.021)+side*.004,2.165,z];
    assert.ok(containsClosedStock(armor,p)
      &&all.some(m=>/turretDetail/.test(m.name)&&containsClosedStock(m,p)),
    `actual side-rail bracket has positive armor contact: ${side},${z}`);
  }
}

function weaponAndContact(t,all){
  const mg=t.root.getObjectByName('sourceMachineGun_turretDark');
  assert.ok(mg?.parent?.parent===t.root.getObjectByName('rig_turret'),
    'complete measured weapon remains recognized and yaw-owned');
  assert.equal(mg.parent.userData.sourceMeasuredMachineGun,true);
  assert.equal(mg.parent.userData.fittingExact,true);
  near(hit(all,[-.7385,2.866,.7],[0,0,-1])?.point.z,.533,.001,
    'source left narrow foretip reaches its actual terminal plane');
  assert.equal(Boolean(hit(all,[-.760,2.866,.527],[0,0,-1],.14)),false,
    'left mouth is real air before its concealed native blind stock');
  near(hit(all,[-.760,4,.40],[0,-1,0])?.point.y,2.896681,.002,
    'source wide sleeve station is retained before the narrow tip');
  near(hit(all,[-.760,4,.50],[0,-1,0])?.point.y,2.888391,.002,
    'source44mm narrow tip station, not an extended full collar');
  assert.equal(Boolean(hit(all,[-.624,2.785,-.324],[0,1,0],.018)),false,
    'center link stays separate above source cradle air');
  // Lower cradle overlaps its platform, and the upper bridge overlaps the
  // retained left receiver. These are actual wired surfaces, not helper-only.
  near(hit(all,[-.62,2.73,0],[0,0,-1])?.point.z,-.287206,.002,
    'source lower cradle front/contact frame');
  const detail=t.root.getObjectByName('sourceMachineGun_turretDetail');
  assert.ok(containsClosedStock(mg,[-.698,2.86,-.48])
    &&containsClosedStock(detail,[-.698,2.86,-.48]),
  'actual receiver and upper link share positive closed stock, not a floating near-contact');
  assert.ok(all.some(m=>/turretDetail/.test(m.name)&&containsClosedStock(m,[.91,1.922,-2.64]))
    &&all.some(m=>/turretOpenLattice/.test(m.name)&&containsClosedStock(m,[.91,1.922,-2.64])),
  'actual basket floor and permanent support share positive closed stock');
}

for(const quality of ['high','low']){
  const t=createTank('strv122_x',null,{quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false});
  try{
    t.root.updateMatrixWorld(true);const all=[];
    t.root.traverse(o=>{if(o.isMesh&&!o.userData.shadowOnly&&!o.userData.vehicleMarking
      &&!/Proxy|procShadow/.test(o.name))all.push(o);});
    roofSurfaces(all);basketSurfaces(all);antennaSeats(t,all);
    smokeSurfaces(all);canisterStocks(t,all);weaponAndContact(t,all);
  }finally{t.dispose();}
}
console.log('strv122XSuppliedEquipment: actual high/low measured roof, seven curved cage courses, 3+3 aft/separate forward canisters, source air, weapon sleeve/link and contact PASS');
