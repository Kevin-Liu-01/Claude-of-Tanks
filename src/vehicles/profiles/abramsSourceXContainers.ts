// The source81 container seats and their trays. The source cans themselves were replaced on 2026-10-14 by the fleet's
// pressed 20 L jerrycan on these seats (owner markup: their blank faces read as random blocks; abramsSourceXEquipment.ts
// bustleRackStowage); the trays and receivers stay the source's.
import * as THREE from 'three';
import { closedSectionLoft, planeBoundedArmor, type ArmorPlane, type XY } from './abramsSourceXGeometry.ts';

interface ContainerPart { name: string; geometry: THREE.BufferGeometry }
export const SOURCE_CONTAINER_SEATS = [
  [-1.288625, 1.879755, -2.375235, 0],
  [1.150562, 1.879755, -2.375235, 0],
  [-1.203210, 1.889645, -3.149505, -Math.PI / 2],
  [1.0643895, 1.889645, -3.149505, -Math.PI / 2],
] as const;

function trayOutline(x0: number, x1: number, z0: number, z1: number, corner: number): XY[] {
  // Counterclockwise in ground X/-Z. Eight independent chamfer stations,
  // not an imported source contour or a filled rack bounding rectangle.
  return [[x0+corner,-z1],[x1-corner,-z1],[x1,-z1+corner],[x1,-z0-corner],
    [x1-corner,-z0],[x0+corner,-z0],[x0,-z0-corner],[x0,-z1+corner]];
}

function trayFloor(ring: readonly XY[], top: number, thickness: number): THREE.BufferGeometry {
  return closedSectionLoft([{z:top-thickness,ring},{z:top,ring}]).rotateX(-Math.PI/2);
}

function foldedTray(ring: readonly XY[], top: number): ContainerPart[] {
  const thickness=.00394, rise=.00394;
  const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length;
  const cz=ring.reduce((s,p)=>s+p[1],0)/ring.length;
  const outer=ring.map(([x,z])=>[x+Math.sign(x-cx)*.0077,z+Math.sign(z-cz)*.0092] as XY);
  const parts=[{name:'Floor',geometry:trayFloor(ring,top,thickness)}];
  for(let i=0;i<ring.length;i++){
    const j=(i+1)%ring.length;
    const contour=[ring[i],outer[i],outer[j],ring[j]];
    const a=new THREE.Vector3(ring[i][0],top,-ring[i][1]);
    const b=new THREE.Vector3(outer[i][0],top+rise,-outer[i][1]);
    const c=new THREE.Vector3(ring[j][0],top,-ring[j][1]);
    const n=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if(n.y<0)n.negate();
    const d=n.dot(a),planes: ArmorPlane[]=[[n.x,n.y,n.z,d],[-n.x,-n.y,-n.z,-d+thickness*n.y]];
    for(let k=0;k<4;k++){
      const p=contour[k],q=contour[(k+1)%4];
      const dx=q[0]-p[0],dz=q[1]-p[1];
      planes.push([dz,0,dx,dz*p[0]-dx*p[1]]);
    }
    parts.push({name:`Fold${i}`,geometry:planeBoundedArmor(planes)});
  }
  return parts;
}

/** Actual source59 front folded trays and separate source107 rear floors.
 * The source107 floor is zero-thickness; a concealed 3.94mm underside closes
 * the first-party stock. Never raise the floor into the recessed can sole. */
export function sourceContainerReceivers(): ContainerPart[] {
  const parts: ContainerPart[]=[];
  for(const [i,x0]of [-1.46146,.978488].entries()){
    const ring=trayOutline(x0,x0+.3495,-2.461115,-2.302115,.015);
    for(const part of foldedTray(ring,1.880815+i*.00001)){
      part.geometry.userData.sourceOwner='selectedOBJ:59';
      parts.push({name:`ContainerTray${i}${part.name}`,geometry:part.geometry});
    }
  }
  for(const [i,[x0,x1]]of [[-1.30307,-1.10154],[.962497,1.16397]].entries()){
    const geometry=trayFloor(trayOutline(x0,x1,-3.331695,-2.950115,.006),1.889275+i*.00001,.00394);
    geometry.userData.sourceOwner='selectedOBJ:107';
    parts.push({name:`ContainerRearFloor${i}`,geometry});
    // Actual source59 perimeter receiver: thin stock around an open center.
    // The center remains the separate107 floor, never a40mm solid block.
    const outer=i===0?-1.30596:1.16699,inner=i===0?-1.10286:.963816;
    const low=1.888765,high=1.929185+i*.00001;
    for(const [name,width,depth,x,z]of [
      ['Outer',.00604,.32673,outer+(i===0?.00302:-.00302),-3.14078],
      ['Inner',.0051,.38158,inner+(i===0?-.00255:.00255),-3.140905],
      ['Rear',Math.abs(outer-inner)-.024,.0051,(outer+inner)/2,-3.331695],
      ['Fore',Math.abs(outer-inner)-.024,.0051,(outer+inner)/2,-2.950115],
    ] as const){
      const g=new THREE.BoxGeometry(width,high-low,depth).translate(x,(low+high)/2,z);
      g.userData.sourceOwner='selectedOBJ:59';
      parts.push({name:`ContainerRearRim${i}${name}`,geometry:g});
    }
  }
  return parts;
}

