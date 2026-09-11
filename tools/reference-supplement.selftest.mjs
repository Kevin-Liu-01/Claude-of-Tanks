import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial,DataTexture,RGBAFormat} from 'three';
import {supplementSnapshot,supplementDigest,verifySupplement} from './reference-supplement.mjs';
const declaration={group:'photoAssembly',parent:'rig_turret',metadata:{reference:'photo',fittingRoot:true},reference:'https://example.invalid/approved-photo'};
const fixture=()=>{const root=new Group(),turret=new Group(),gun=new Group();turret.name='rig_turret';gun.name='photoAssembly';Object.assign(gun.userData,declaration.metadata);root.add(turret);turret.add(gun);gun.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));return {root,turret,gun,mesh:gun.children[0]}};
const makeReceipt=async(root)=>({arrangementAccepted:true,reference:declaration.reference,geometryPoseSha256:await supplementDigest(supplementSnapshot(root,declaration))});
const base=fixture(),receipt=await makeReceipt(base.root);
assert.equal((await verifySupplement(base.root,declaration,receipt)).arrangementAccepted,true);
for(const change of [
 f=>f.mesh.geometry.attributes.position.setX(0,.7),f=>f.mesh.geometry.index.setX(0,4),
 f=>f.mesh.position.setX(.1),f=>f.turret.position.setY(.1),f=>f.gun.visible=false,
 f=>f.root.visible=false,f=>f.mesh.material.opacity=.1,f=>f.mesh.material.side=2,
 f=>f.gun.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial())),
 f=>{const duplicate=new Group();duplicate.name=declaration.group;f.root.add(duplicate)},
 f=>f.gun.userData.reference='wrong',f=>f.turret.name='rig_hull',
 f=>f.mesh.material.visible=false,f=>f.mesh.layers.disableAll(),f=>f.turret.layers.disableAll(),
 f=>f.mesh.material.alphaTest=.9,f=>f.mesh.material.colorWrite=false,f=>f.mesh.material.depthTest=false,
 f=>{const impostor=new Group();impostor.name='rig_turret';f.root.add(impostor);impostor.add(f.gun)},
 f=>f.mesh.geometry.setDrawRange(0,3),f=>f.mesh.geometry.attributes.normal.setY(0,.5),
]){const f=fixture();change(f);await assert.rejects(verifySupplement(f.root,declaration,receipt));}
await assert.rejects(verifySupplement(base.root,declaration,{...receipt,arrangementAccepted:false}));
await assert.rejects(verifySupplement(base.root,declaration,{...receipt,reference:'another photo'}));
const textured=fixture();textured.mesh.material.map=new DataTexture(new Uint8Array([255,127,3,255]),1,1,RGBAFormat);
const tr=await makeReceipt(textured.root);await verifySupplement(textured.root,declaration,tr);
textured.mesh.material.map.image.data[0]=0;await assert.rejects(verifySupplement(textured.root,declaration,tr));
console.log('photo supplement: accepted exact stock; geometry/index/normals/pose/ancestor/visibility/material/texture/ownership changes reject');
