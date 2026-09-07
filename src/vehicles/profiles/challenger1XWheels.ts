// Original photo-led turned wheel. AESP Fig20 and The Tank Museum's Flying
// Fox photograph show a recessed pressed face with local fasteners, not long
// radial star spokes. Hidden depths and fastener dimensions are estimates.
import * as THREE from 'three';
import {mergeGeometries}from 'three/addons/utils/BufferGeometryUtils.js';

export function challenger1PhotoWheelSolids():{core:THREE.BufferGeometry;shoulder:THREE.BufferGeometry} {
 const face=[[0,.219],[.055,.219],[.076,.211],[.100,.168],[.120,.119],
   [.180,.110],[.250,.127],[.312,.160],[.347,.191],[.363,.202],[.371,.202]];
 const profile=[...face.map(([r,x])=>new THREE.Vector2(r,-x)),
   ...[...face].reverse().map(([r,x])=>new THREE.Vector2(r,x))];
 const parts:THREE.BufferGeometry[]=[new THREE.LatheGeometry(profile,48).rotateZ(-Math.PI/2)];
 for(const side of [-1,1])for(let i=0;i<10;i++) {
   const a=i*Math.PI/5;
   parts.push(new THREE.CylinderGeometry(.011,.011,.028,6).rotateZ(Math.PI/2)
     .translate(side*.120,Math.cos(a)*.142,Math.sin(a)*.142));
 }
 const core=mergeGeometries(parts,false);for(const p of parts)p.dispose();
 if(!core)throw new Error('Challenger original wheel solids require compatible attributes');
 // The native rubber envelope and the former secondary shoulder are retained;
 // only their hidden filled center opens around the actual metal bowl.
 const shoulder=new THREE.LatheGeometry([[.369,-.20085],[.3713,-.20085],
   [.3713,.20085],[.369,.20085],[.369,-.20085]].map(([r,x])=>new THREE.Vector2(r,x)),48)
   .rotateZ(-Math.PI/2);
 return{core,shoulder};
}
