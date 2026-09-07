// Generic first-party solid mathematics. No vehicle dimensions or source
// topology live here; each independent profile owns its scalar construction.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid, type SolidSection} from './sectionSolid.ts';

export type Point3 = readonly [number,number,number];
export type BoxStation = readonly [z:number,half:number,top:number,bottom:number];
export type CastStation = readonly [z:number,left:number,right:number,top:number,bottom:number,shoulder:number];

export function boxSections(rows:readonly BoxStation[]):THREE.BufferGeometry {
  return sectionSolid(rows.map(([z,w,t,b])=>({z,ring:[[-w,b],[w,b],[w,t],[-w,t]]})));
}

/** Rounded transverse casting, with separate chin and upper shoulder arcs. */
export function castSections(rows:readonly CastStation[],origin:Point3):THREE.BufferGeometry {
  const sections:SolidSection[]=rows.map(([z,l,r,t,b,shoulder])=>{
    const ring:Array<readonly[number,number]>=[[-l*.88,b],[r*.88,b],[r,b+(shoulder-b)*.52],[r,shoulder]];
    for(let i=1;i<12;i++) {
      const angle=i*Math.PI/12,x=Math.cos(angle),width=x>=0?r:l;
      ring.push([x*width,shoulder+(t-shoulder)*Math.sin(angle)**.56]);
    }
    ring.push([-l,shoulder],[-l,b+(shoulder-b)*.52]);
    return {z:z-origin[2],ring:ring.map(([x,y])=>[x-origin[0],y-origin[1]] as const)};
  });
  return sectionSolid(sections);
}

/** Positive skin over a longitudinally varying, laterally inclined surface. */
export function roofSheet(rows:readonly(readonly[z:number,left:number,right:number,leftY:number,rightY:number])[],thickness:number):THREE.BufferGeometry {
  if(!(thickness>0))throw new Error('roofSheet needs positive thickness');
  return sectionSolid(rows.map(([z,l,r,yl,yr])=>({z,ring:[[l,yl-thickness],[r,yr-thickness],[r,yr],[l,yl]]})));
}

/** Original beam aligned between two measured physical endpoints. */
export function beamBetween(a:Point3,b:Point3,radius:number,segments=10):THREE.BufferGeometry {
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  const geometry=KIT.cylY(radius,radius,delta.length(),segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  return geometry.translate(...from.add(to).multiplyScalar(.5).toArray());
}

/** Closed annular stock along +Z, including a recessed blind bore floor. */
export function blindTube(radius:number,bore:number,length:number,depth:number,segments=28):THREE.BufferGeometry {
  if(!(radius>bore&&bore>0&&length>depth&&depth>0))throw new Error('blindTube dimensions are invalid');
  const profile=[new THREE.Vector2(0,-length/2),new THREE.Vector2(radius,-length/2),
    new THREE.Vector2(radius,length/2),new THREE.Vector2(bore,length/2),
    new THREE.Vector2(bore,length/2-depth),new THREE.Vector2(0,length/2-depth)];
  return new THREE.LatheGeometry(profile,segments).rotateX(Math.PI/2);
}
