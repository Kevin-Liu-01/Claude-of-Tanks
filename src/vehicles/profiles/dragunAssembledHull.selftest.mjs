import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills,hasInteriorFills} from '../interiorFills.ts';
import {sourceOpeningRayProbe} from '../../../tools/source-opening-rays.mjs';
import { near } from '../../../tools/receipt-kit.test-support.mjs';

// Source-only Object_15/23 calipers in the original canonical frame; the
// accepted assembly changes only its detached door. No source mesh is loaded.
const id='bmp3m_dragun125_x';
await ensureInteriorFills([id]);
assert.ok(hasInteriorFills(id));
for(const quality of ['high','low']) {
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  // These fixed source calipers predate the owner-approved uniform resize.
  tank.root.scale.setScalar(1/.90);
  tank.root.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((level,i)=>level.object.visible=i===0);}});
  const probe=sourceOpeningRayProbe(tank.root);
  const y=(x,z,up=false)=>probe.cast([x,up ? .5 : 5,z],[0,up?1:-1,0])?.point.y;
  for(const x of [-.7883,-.2682,.2519,.7719])for(const [z,top,bottom]of [[4.04,1.52914,.98759],[4.16,1.47361,1.21234],[4.20,1.45510,1.33080]]) {
    near(y(x,z),top,.006,`${quality} front module top ${x}/${z}`);
    near(y(x,z,true),bottom,.002,`${quality} front module lower return ${x}/${z}`);
  }
  for(const x of [-1.2,1.2])near(y(x,-3.7),1.832,.001,`${quality} rear wing roof`);
  for(const x of [-.50,0,.50])assert.equal(probe.cast([x,5,-3.7],[0,-1,0]),undefined,'rear access recess remains exterior air');
  near(y(0,-2.80,true),.5239,.001,`${quality} real tub floor`);
  near(y(0,-3.10),1.85257,.001,`${quality} aft central deck slope`);
  // A broad rear filler must be detected instead of passing a bounds check.
  const filler=new THREE.Mesh(new THREE.BoxGeometry(1.2*.90,.10*.90,.30*.90),new THREE.MeshBasicMaterial());
  filler.position.set(0,1.5,-3.7).multiplyScalar(.90);tank.root.add(filler);filler.updateMatrixWorld(true);
  const filled=sourceOpeningRayProbe(tank.root);
  assert.ok(filled.cast([0,5,-3.7],[0,-1,0]),'filled-recess negative fixture is observable');
  filled.dispose();tank.root.remove(filler);filler.geometry.dispose();filler.material.dispose();
  probe.dispose();tank.dispose();
}
console.log('dragunAssembledHull: HIGH/LOW front stock, rear wings, deck/floor datums and open-recess negative pass');
