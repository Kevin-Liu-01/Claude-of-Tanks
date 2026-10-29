// QA metrology for the second source-study fleet. A candidate never chooses
// its ruler or the reference's raster bins. Legacy published-dimension and
// historical-preservation policy are deliberately not changed.
import * as THREE from 'three';
import { SUPPLIED_SOURCE_COMPARISON_IDS } from './supplied-source-reference-overrides.mjs';

const IDS=new Set(['m1a2_abrams_sepv2','leo2a6','k1a1','amx30b','t62mv1','t72b_1987','t80u',
  'leclerc_xlr','amx56','chieftain_mk10','t72b3','jpz_e100','type10','type90',
  'amx40','t72b3m_2016','t72bu','t90','t90a_burlak','t90ms_tagil',
  'c1_ariete','challenger1_mk3','chieftain5','strv122', 'ares_apc', 'merkava4_trophy', 'merkava4_barak', 'namer_ifv', 'm48a5_patton', ...SUPPLIED_SOURCE_COMPARISON_IDS]);

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
