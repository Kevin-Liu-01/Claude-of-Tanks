import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT} from '../tankFactoryCore.ts';
import {trackPatternFor} from '../trackPatterns.ts';

const near=(v,w,e,label)=>assert.ok(Number.isFinite(v)&&Math.abs(v-w)<=e,`${label}: ${v} vs ${w}`);
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function geometryHash(g){
  const h=createHash('sha256');
  for(const key of Object.keys(g.attributes).sort()){
    h.update(key);const a=g.attributes[key].array;
    h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  }
  return h.digest('hex');
}
for(const[name,expected]of[
  ['trackShoeGeometry','da630d3f1193b2a107f9dba0f6ac8e9e8d6da81a880b9c8f3e92f3f6305f8f45'],
  ['simplifiedTrackShoeGeometry','a3636af03ba82c049683aefe2f7f917f5b29fdd5174781ab52321734b68e53fc'],
]){
  const g=KIT[name](.636079,.15,trackPatternFor({id:'leclerc'}));
  try{assert.equal(geometryHash(g),expected,'absent opt-in preserves every legacy attribute byte');}
  finally{g.dispose();}
}
const material=new THREE.MeshBasicMaterial();
const cast=(mesh,p,d,far=2)=>new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d),0,far).intersectObject(mesh,false)[0];
function checkLink(g){
  const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);
  g.computeBoundingBox();near(g.boundingBox.max.x-g.boundingBox.min.x,.636079,1e-7,'full source pin envelope');
  for(const side of[-1,1]){
    near(cast(mesh,[side,.0128,.06],[-side,0,0])?.point.x,side*.5253277/2,1e-7,
      'central pad has measured width independently of round connectors');
    assert.equal(cast(mesh,[side*.30,.04,.07],[0,-1,0],.1),undefined,
      'air beyond each connector is not a continuous wide pad');
    assert.equal(cast(mesh,[side*.30,-.04,0],[0,-1,0],.1),undefined,
      'under-connector air remains separate from narrow central web');
    for(const z of[-.0388075,.0388075]){
      near(cast(mesh,[side,-.0051314,z],[-side,0,0])?.point.x,side*.3180395,1e-7,
        'independent round outer pin face');
      near(cast(mesh,[side*.27,.0157686,z],[side,0,0])?.point.x,side*(.3180395-.0404054),1e-7,
        'cap has a closed inward crescent above the narrower forging');
    }
    near(cast(mesh,[side*.28,.1,0],[0,-1,0])?.point.y,.012123,1e-6,
      'source rectangular connector forging has its own roof');
    near(cast(mesh,[side*.28,-.1,0],[0,1,0])?.point.y,-.023506,1e-6,
      'source rectangular connector has a closed underside');
  }
}
try{
  for(const quality of['high','low']){
    const tank=createTank('leclerc_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
    try{
      const root=tank.root;root.updateMatrixWorld(true);
      for(const name of['gearTrackPads','gearTrackPadsSimplified']){
        const shoes=root.getObjectByName(name);
        const triangles=(shoes.geometry.index?.count??shoes.geometry.attributes.position.count)/3;
        if(name==='gearTrackPads'){
          checkLink(shoes.geometry);
          assert.ok(triangles<=276,
            `${quality}/${name}: closed pins must not restore the former 12-sided per-link cost (${triangles})`);
        }else{
          // Polygon budget 2026-09-12: the far course is the fleet shoe carrying the
          // same measured pad and rectangular connector forging (outer .3099674)
          // without the round pin caps, at 48 triangles instead of 174.
          shoes.geometry.computeBoundingBox();
          near(shoes.geometry.boundingBox.max.x-shoes.geometry.boundingBox.min.x,2*.3099674,1e-6,'far course keeps the measured connector envelope');
          assert.ok(triangles<=48,`${quality}/${name}: far fleet course stays within its 48-triangle budget (${triangles})`);
        }
        assert.equal(shoes.count,160,'unchanged 81-link native course per side');
        assert.equal(hash(shoes.instanceMatrix.array),'b97adf24e1cbca466fb0e0c20b767f4f13b87c87606374bf5bbfd5915e841507',
          'all original shoe positions and orientations are bit-identical');
        const m=new THREE.Matrix4();shoes.getMatrixAt(144,m);m.premultiply(shoes.matrixWorld);
        const pin=new THREE.Vector3(.3180395,-.0051314,.0388075).applyMatrix4(m);
        near(pin.x,1.5908368,1e-6,'complete-source outer cap X (shoe frame, both courses)');
        near(pin.y,.0316314,1e-6,'complete-source ground cap Y solved in live shoe frame');
      }
      if(quality==='high'){
        const expected={gearRoadWheelTires:'e45962ab33c93f70ea9c95ee68c225e9f8ad58dd327a32570ddceec17711e30d',
          gearRoadWheelDiscs:'1900b58d591d951a976fe0c89fa9f57ee3eb6643aa1419152e7ad2eda237685f',
          gearTrackBandL:'3e7e3673313970cbcbfe53eb3a2384b008d653c1cdb445a045657d6663fa10b1',
          gearTrackBandR:'3e7e3673313970cbcbfe53eb3a2384b008d653c1cdb445a045657d6663fa10b1'};
        for(const[name,value]of Object.entries(expected))assert.equal(hash(root.getObjectByName(name).geometry.attributes.position.array),value,
          `${name}: existing wheel/carrier shape remains bit-identical`);
      }
      const section=root.getObjectByName('rig_hull').userData.runningGearReceipts[0].trackLinkCrossSection;
      for(const bad of[{...section,padWidthM:0},{...section,connectorInnerM:1},
        {...section,pinCapLengthM:NaN},{...section,connectorDepthM:.5},{...section,pinHalfSpacingM:.1}])
        assert.throws(()=>KIT.trackShoeGeometry(.636079,.1642,trackPatternFor({id:'leclerc'}),.3180395,1,1,bad),
          /native track-link|Native track-link/);
      assert.ok(section.connectorInnerM<section.padWidthM/2-.004,'connector overlaps the physical pad');
      assert.ok(section.connectorOuterM>.3180395-section.pinCapLengthM+.03,'connector engages both pin-cap solids');
    }finally{tank.dispose();}
  }
  // Both independently authored Leclerc studies use the shared measured-pin
  // primitive. Keep this second scope explicit instead of testing only one
  // caller and claiming the whole optimization was verified.
  for(const quality of['high','low']){
    const tank=createTank('leclerc_classic_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
    try{
      for(const [name,budget]of[['gearTrackPads',276],['gearTrackPadsSimplified',174]]){
        const shoes=tank.root.getObjectByName(name);
        const triangles=(shoes.geometry.index?.count??shoes.geometry.attributes.position.count)/3;
        assert.equal(shoes.count,168,'Classic retains its own 84-link course per side');
        assert.ok(triangles<=budget,`Classic ${quality}/${name}: ${triangles} exceeds ${budget}`);
      }
    }finally{tank.dispose();}
  }
}finally{material.dispose();}
console.log('leclercXTrackLinks: measured pad/pin/forging/air, closed caps, unchanged courses and legacy buffers pass');
