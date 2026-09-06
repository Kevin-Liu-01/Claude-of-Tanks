// Local private reference diagnostic: only dimensions/part names are printed.
import fs from 'node:fs';
import * as THREE from 'three';
import {loadReferenceGlb} from './reference-glb-loader.ts';
import {WEST_X_REFERENCE_OVERRIDES} from './west-x-reference-overrides.ts';
import {TANK_SPECS} from '../src/vehicles/specs.ts';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {measureSlabBounds} from './section-slab-bounds.mjs';
if (!globalThis.ProgressEvent) globalThis.ProgressEvent=class {
  constructor(type,values) {this.type=type;Object.assign(this,values);}
};
const id='kf51_x',config=WEST_X_REFERENCE_OVERRIDES[id];
const bytes=fs.readFileSync(new URL(`../public${config.glb.path}`,import.meta.url));
const reference=await loadReferenceGlb({...config,glb:{...config.glb,
  path:`data:model/gltf-binary;base64,${bytes.toString('base64')}`}},id,TANK_SPECS[id]);
const procedural=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
for (const root of [reference.root,procedural.root]) root.traverse(o=>{
  if (o.isLOD) {o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0);}
});
const box=new THREE.Box3().setFromObject(reference.root.getObjectByName('rig_hull'));
const planes=Array.from({length:14},(_,i)=>[box.min.z+i/14*(box.max.z-box.min.z),box.min.z+(i+1)/14*(box.max.z-box.min.z)]);
const include=o=>!/^procShadow/.test(o.name) && !o.userData.geometryAuditIgnore;
try {
  const source=measureSlabBounds(reference.root,planes,include);
  const native=measureSlabBounds(procedural.root,planes,include);
  console.log(JSON.stringify(source.map((row,i)=>({i,source:row,native:native[i]})),null,2));
} finally {
  procedural.dispose();reference.root.traverse(o=>{
    o.geometry?.dispose();
    for (const m of Array.isArray(o.material)?o.material:[o.material]) m?.dispose();
  });
}
