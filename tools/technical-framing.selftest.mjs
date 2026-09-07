import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {createTank} from '../src/vehicles/tankFactory.ts';

const page=fs.readFileSync(new URL('./icons-page.html',import.meta.url),'utf8');
const extract=name=>{
  const start=page.indexOf(`function ${name}(`),end=page.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start,`${name}: actual committed HTML function exists`);
  return page.slice(start,end);
};
const context=vm.createContext({THREE,MARGIN:1.07});
vm.runInContext(['orthoCam','sideInspectionCamera','technicalInspectionCamera'].map(extract).join('\n'),context);
const INSET_IDS=[
  'merkava3d_x','merkava4_x','leo2a7v_x','leo2a6m_x','leo2a4m_x','leo2a5_x',
  'k2_x','kf51_x','t14_x','t90a_x','t90a_vladimir_x','t90m_x','t90sm_x',
];
const LEGACY_IDS=INSET_IDS.map(id=>id.slice(0,-2));

function pixelBounds(box,camera) {
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
    const p=new THREE.Vector3(x,y,z).project(camera),px=(p.x+1)*256,py=(1-p.y)*128;
    bounds.left=Math.min(bounds.left,px);bounds.right=Math.max(bounds.right,px);
    bounds.top=Math.min(bounds.top,py);bounds.bottom=Math.max(bounds.bottom,py);
  }return bounds;
}
function verifySafeContent(bounds,label) {
  assert.ok(bounds.left>=100-1e-6&&bounds.right<=412+1e-6,`${label}: complete silhouette clear of 92/420 label gutters`);
  assert.ok(bounds.top>=51-1e-6&&bounds.bottom<=215+1e-6,`${label}: complete silhouette clear of header and footer`);
  assert.ok(224-bounds.bottom>=9-1e-6,`${label}: lowest track has at least 9px footer clearance`);
}
function verifyOriginalOverlap(bounds,id,label) {
  assert.ok(bounds.right>420,`${label}: original full gun extends into the right label gutter`);
  if(id==='merkava3d_x'||id==='merkava4_x') {
    assert.ok(bounds.bottom>224,`${label}: original lowest track enters the footer`);
  }
  if(id==='leo2a7v_x'||id==='kf51_x') {
    assert.ok(bounds.top<43,`${label}: original whip crosses the opaque header edge`);
  }
  if(id==='t14_x') {
    assert.ok(bounds.left<92,`${label}: original stern enters the left label gutter`);
  }
}
function verifyLegacyCameras(center,size,extentZ,box,old) {
  for(const unaffected of [...LEGACY_IDS,'leo2_revolution','leo2_revolution_proto_ix','not_a_source_x']) {
    const same=context.technicalInspectionCamera(unaffected,center,size,extentZ,box);
    assert.deepEqual(same.projectionMatrix.elements,old.projectionMatrix.elements,`${unaffected}: old zoom unchanged`);
    assert.deepEqual(same.matrixWorld.elements,old.matrixWorld.elements,`${unaffected}: old camera/anchor unchanged`);
  }
}
for(const id of INSET_IDS)for(const quality of ['high','low']) {
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4100});
  try {
    tank.root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(tank.root),size=box.getSize(new THREE.Vector3());
    const center=box.getCenter(new THREE.Vector3()),anchor=tank.assetPresentationAnchor||tank.presentationAnchor;
    center.x=anchor.xM;center.z=anchor.zM;
    const before=center.clone(),beforeBox=box.clone(),extentZ=Math.max(center.z-box.min.z,box.max.z-center.z);
    const old=context.sideInspectionCamera(center,size,extentZ);
    verifyOriginalOverlap(pixelBounds(box,old),id,`${id}/${quality}`);
    const camera=context.technicalInspectionCamera(id,center,size,extentZ,box);
    verifySafeContent(pixelBounds(box,camera),`${id}/${quality}`);
    assert.ok(center.equals(before)&&box.equals(beforeBox),'layout never mutates dimensions or presentation anchor');
    verifyLegacyCameras(center,size,extentZ,box,old);
  }finally{tank.dispose();}
}
assert.match(page,/const sideCam = technicalInspectionCamera\(id, center, size, extentZ, box\)/,
  'actual technical render branch uses the tested layout');
assert.match(page,/if \(wants\('side'\) \|\| wants\('sideSilhouette'\)\) \{\s*const sideCam = sideInspectionCamera/,
  'ordinary side rendering retains the legacy camera');
console.log('technical-framing: all 13 source X models high/low fit complete silhouettes inside gutters with 9px footer clearance; original fleet cameras/anchors unchanged');
