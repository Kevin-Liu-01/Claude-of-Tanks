// Local-only read-only source-frame audit. No WebGL and no source payload output.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadReferenceGlb } from './reference-glb-loader.ts';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { TANK_SPECS } from '../src/vehicles/specs.ts';
import { LEOPARD_X_REFERENCE_OVERRIDES } from './leopard-x-reference-overrides.ts';
import { T90_X_REFERENCE_OVERRIDES } from './t90-x-reference-overrides.ts';
import { WEST_X_REFERENCE_OVERRIDES } from './west-x-reference-overrides.ts';
import { SOURCE_WORLD_FRAMES, validateSourceWorldFrame } from './source-world-registration.mjs';
if (!globalThis.ProgressEvent) globalThis.ProgressEvent=class {
  constructor(type, values) { this.type=type;Object.assign(this,values); }
};
const configs={...LEOPARD_X_REFERENCE_OVERRIDES,...T90_X_REFERENCE_OVERRIDES,...WEST_X_REFERENCE_OVERRIDES};
const frame=visual=>{
  visual.root.updateMatrixWorld(true);
  const datum=name=>visual.root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray();
  return {rootMatrix:visual.root.matrixWorld.toArray(),hull:datum('rig_hull'),
    turret:datum('rig_turret'),gun:datum('rig_gun')};
};
for (const [id,certificate] of Object.entries(SOURCE_WORLD_FRAMES)) {
  const source=configs[id];
  const bytes=fs.readFileSync(new URL(`../public${source.glb.path}`,import.meta.url));
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const reference=await loadReferenceGlb({...source,glb:{...source.glb,
    path:`data:model/gltf-binary;base64,${bytes.toString('base64')}`}},id,TANK_SPECS[id]);
  const procedural=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
  const frames={reference:frame(reference),procedural:frame(procedural)};
  const result=validateSourceWorldFrame(certificate,sha256,frames);
  process.stdout.write(`${JSON.stringify({id,result,frames})}\n`);
  if (!result.passed) process.exitCode=1;
  procedural.dispose();
  reference.root.traverse(node=>{
    node.geometry?.dispose();
    for (const material of Array.isArray(node.material)?node.material:[node.material]) material?.dispose();
  });
}
