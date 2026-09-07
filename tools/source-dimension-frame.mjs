// QA metrology for the second source-study fleet. A candidate never chooses
// its ruler or the reference's raster bins. Legacy published-dimension and
// historical-preservation policy are deliberately not changed.
import * as THREE from 'three';

const IDS=new Set(['leo2a6_x','k1a1_x','amx30_x','t62mv1_x','t72b_1987_x','t80u_x',
  'leclerc_x','leclerc_classic_x','chieftain_mk10_x','t72b3_x','jpz_e100_x','type10_x','type90_x',
  'amx40_x','t72b3m_x','t72bu_x','t90_x','t90a_burlak_x','t90ms_x',
  'ariete_c1_x','challenger1_x','chieftain5_x','strv122_x']);

export function usesSourceDimensionFrame(id,registration) {
  return IDS.has(id)&&registration?.passed===true&&registration.mode==='canonical-source-world';
}

export function sourceDimensionCamera(sourceBounds,direction) {
  const size=sourceBounds.getSize(new THREE.Vector3());
  if(!size.toArray().every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid source dimension frame');
  const center=sourceBounds.getCenter(new THREE.Vector3());
  const dir=direction.clone().normalize();
  const nominalUp=Math.abs(dir.y)>.9?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0);
  const right=new THREE.Vector3().crossVectors(nominalUp,dir).normalize();
  const up=new THREE.Vector3().crossVectors(dir,right).normalize();
  const radius=axis=>(Math.abs(axis.x)*size.x+Math.abs(axis.y)*size.y+Math.abs(axis.z)*size.z)/2;
  const half=Math.max(radius(right),radius(up),.5)*1.08;
  const camera=new THREE.OrthographicCamera(-half,half,half,-half,.1,200);
  camera.position.copy(center).addScaledVector(dir,60);
  camera.up.copy(up);camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  return camera;
}

export function sourceDimensionRows(reference,actual,referenceBounds,actualBounds) {
  const rows=[];
  const add=(name,a,r,method)=>{
    if(![a,r].every(v=>Number.isFinite(v)&&v>0))throw new Error(`Missing positive ${name} source measurement`);
    rows.push({name,actual:a,published:r,pct:Math.abs(a-r)/r*100,method});
  };
  for(const name of ['heightM','hullLengthM','overallLengthM','widthM']) {
    add(name,actual[name],reference[name],'paired identical masks in source-only fixed frame');
  }
  const r=referenceBounds.getSize(new THREE.Vector3()),a=actualBounds.getSize(new THREE.Vector3());
  for(const [name,key]of [['physicalWidthM','x'],['physicalHeightM','y'],['physicalOverallLengthM','z']]) {
    // Full 3D bounds deliberately do not inherit raster filtering or camera
    // clipping. An oversized/missing antenna, skirt or barrel still fails.
    add(name,a[key],r[key],'full visible physical envelope, no raster filtering');
  }
  return rows;
}
