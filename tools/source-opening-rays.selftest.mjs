import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sourceOpeningRayProbe} from './source-opening-rays.mjs';

const material = options => new THREE.MeshBasicMaterial(options);
const root = new THREE.Group();
const make = (y, mat) => {const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,.1,2),mat);mesh.position.y=y;root.add(mesh);return mesh;};
const base=make(0,material());
const invisible=make(1,material({visible:false}));
const clear=make(2,material({transparent:true,opacity:0}));
const noColor=make(3,material({colorWrite:false}));
// Box top is group2; a visible side material must not certify its hidden top.
const mixed=make(4,[material(),material(),material({colorWrite:false}),material(),material(),material()]);
const hiddenParent=new THREE.Group();hiddenParent.visible=false;root.add(hiddenParent);
const hiddenChild=make(5,material());hiddenParent.add(hiddenChild);
const shadow=make(6,material());shadow.userData.shadowOnly=true;
const originals=new Map();root.traverse(o=>{if(o.isMesh)originals.set(o,o.material)});
const probe=sourceOpeningRayProbe(root);
assert.equal(probe.cast([0,10,0],[0,-1,0]).object,base,'non-rendered upper surfaces cannot satisfy stock witness');
assert.equal(probe.cast([3,4,0],[-1,0,0]).object,mixed,'visible side group remains finite stock');
base.visible=false;
assert.equal(probe.cast([0,10,0],[0,-1,0]),undefined,'no hidden surface can block an air witness');
base.visible=true;base.geometry.setDrawRange(0,0);
assert.equal(probe.cast([0,10,0],[0,-1,0]),undefined,'empty draw ranges contain no stock');
probe.dispose();
for(const[o,m]of originals)assert.equal(o.material,m,'restore original materials');
for(const[o,m]of originals){o.geometry.dispose();for(const v of(Array.isArray(m)?m:[m]))v.dispose();}
console.log('source-opening-rays: hidden, zero-alpha, no-color, grouped, parent-hidden and empty-draw stock rejected');
