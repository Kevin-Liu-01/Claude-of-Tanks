// Original turned solids from scalar sections of both complete source wheels.
// The small hub, deep dish and rolled rim replace the generic proud star face.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
type Section=readonly[axial:number,radius:number];
function turned(rows:readonly Section[],segments=48):THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([x,r])=>new THREE.Vector2(r,x)),segments).rotateZ(-Math.PI/2);
}
function sideFace(side:number):THREE.BufferGeometry {
  // Outward coordinates are relative to the retained X1.3376 axle. The
  // original tire envelope differs from the source by only about4mm and stays
  // fixed. The hidden steel/tire root overlaps by1.1mm; no star plates remain.
  const bowl:readonly Section[]=[[-.0599,0],[-.0825,.2646],[-.1569,.2749],
    [-.189,.2936],[-.185,.2982],[.1811,.2982],[.1811,.2977],
    [.1485,.2715],[.0927,.2708],[.0696,.261],[.0603,.1789],[.0545,0]];
  const cap:readonly Section[]=[[.0485,0],[.0485,.09454],[.1442,.07268],
    [.164,.050275],[.1756,0]];
  const inboard:readonly Section[]=[[-.1678,0],[-.1678,.079],[-.0606,.085],[-.0606,0]];
  const parts=[turned(bowl),turned(cap,12).rotateX(Math.PI/12),turned(inboard,12)];
  const merged=mergeGeometries(parts,false);for(const p of parts)p.dispose();
  if(!merged)throw new Error('K1A1 original wheel solids require compatible attributes');
  if(side<0)merged.rotateY(Math.PI);
  return merged;
}
export function k1a1XWheelSolids():{core:THREE.BufferGeometry;left:THREE.BufferGeometry;right:THREE.BufferGeometry} {
  return {core:turned([[-.0599,0],[-.0599,.024],[.0545,.024],[.0545,0]],24),
    left:sideFace(-1),right:sideFace(1)};
}
