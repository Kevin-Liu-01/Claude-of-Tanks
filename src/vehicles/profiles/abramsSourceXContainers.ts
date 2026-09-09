// Four source81 containers. The handle is a real opening between separately
// closed molded stock, not a dark rectangle on a filled bounding box.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { closedSectionLoft, planeBoundedArmor, roundMember, type ArmorPlane, type XY, type XYZ } from './abramsSourceXGeometry.ts';

interface ContainerPart { name: string; geometry: THREE.BufferGeometry }
export const SOURCE_CONTAINER_SEATS = [
  [-1.288625, 1.879755, -2.375235, 0],
  [1.150562, 1.879755, -2.375235, 0],
  [-1.203210, 1.889645, -3.149505, -Math.PI / 2],
  [1.0643895, 1.889645, -3.149505, -Math.PI / 2],
] as const;

function roundedContour(ring: readonly XY[], high: boolean): XY[] {
  return ring.flatMap((p,i)=>{
    const previous=ring[(i+ring.length-1)%ring.length],next=ring[(i+1)%ring.length];
    const offset=(q:XY):XY=>{
      const t=Math.min(.22,.006/Math.hypot(q[0]-p[0],q[1]-p[1]));
      return[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
    };
    const a=offset(previous),b=offset(next);
    return (high ? [0,.25,.5,.75,1] : [0,.5,1]).map(t=>[
      (1-t)**2*a[0]+2*(1-t)*t*p[0]+t*t*b[0],
      (1-t)**2*a[1]+2*(1-t)*t*p[1]+t*t*b[1],
    ] as XY);
  });
}

function roundedStock(outline: readonly XY[], high: boolean, depth = .15244): THREE.BufferGeometry {
  // Low keeps every molded boundary and the same 6mm corner controls.
  // Only intermediate fillet samples and bevel depth rows are reduced.
  const ring=roundedContour(outline,high);
  const bevel = .009;
  const cx = ring.reduce((s,p)=>s+p[0],0)/ring.length;
  const cy = ring.reduce((s,p)=>s+p[1],0)/ring.length;
  const inset = ring.map(([x,y])=>[x+(cx-x)*.04,y+(cy-y)*.02] as XY);
  const half=ring.map(([x,y],i)=>[(x+inset[i][0])/2,(y+inset[i][1])/2] as XY);
  const geometry=closedSectionLoft(high ? [
    {z:-depth/2,ring:inset},{z:-depth/2+bevel*.25,ring:half},
    {z:-depth/2+bevel,ring}, {z:depth/2-bevel,ring},
    {z:depth/2-bevel*.25,ring:half},{z:depth/2,ring:inset},
  ] : [{z:-depth/2,ring:inset},{z:-depth/2+bevel,ring},
    {z:depth/2-bevel,ring},{z:depth/2,ring:inset}]);
  const smooth=toCreasedNormals(geometry,Math.PI/3);
  if(smooth!==geometry)geometry.dispose();
  return smooth;
}

function canBody(high: boolean): THREE.BufferGeometry {
  return roundedStock([[-.154,.00969],[.148,.00969],[.17112,.017],[.17112,.366],
    [.080,.411],[-.151,.411],[-.17112,.386],[-.17112,.017]],high);
}

function capParts(segments: number): ContainerPart[] {
  // Source cap assembly spans ~108mm vertically and122mm in thickness-axis
  // width. Its tilted socket meets the sloping container shoulder; the neck
  // and cap share one axis instead of independently angled cylinders.
  const axis = new THREE.Vector3(.544350,.838858,-.00008162).normalize();
  const center = new THREE.Vector3(.110195,.421530,.00054);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
  const part = (name: string, radius: number, height: number, offset: number) => {
    const g = new THREE.CylinderGeometry(radius,radius,height,segments);
    g.applyQuaternion(rotation).translate(...center.clone().addScaledVector(axis,offset).toArray());
    return {name,geometry:g};
  };
  return [part('Socket',.044,.045,-.030),part('Cap',.0612,.031,0),
    part('CapButton',.013,.009,.019)];
}

function containerParts(high: boolean, soleBottom: number): ContainerPart[] {
  return [{name:'Body',geometry:canBody(high)},
    // The source's central sole is recessed9.69mm. Two shallow molded feet
    // contact the tray; do not extend the whole body down into that real air.
    ...[-1,1].map(s=>({name:`Sole${s}`,geometry:new THREE.BoxGeometry(.294,.011-soleBottom,.026)
      .translate(0,(.011+soleBottom)/2,s*.052)})),
    {name:'HandleLeftLeg',geometry:roundedStock([[-.157,.405],[-.095,.405],[-.126,.467],[-.138,.479],[-.157,.460]],high,.12246)},
    {name:'HandleRightLeg',geometry:roundedStock([[.019,.405],[.063,.405],[.059,.464],[.048,.480],[.025,.478]],high,.12246)},
    {name:'HandleBar',geometry:roundMember([-.126,.469,0],[.040,.469,0],.013,high?16:12)},
    ...capParts(high?24:16)];
}

export function sourceContainers(high = true): ContainerPart[] {
  const parts: ContainerPart[] = [];
  for (const [i, [x,y,z,yaw]] of SOURCE_CONTAINER_SEATS.entries()) {
    const position: XYZ = [x,y,z];
    // Front source feet overlap their real tray by120µm. Rear source leaves
    // a370µm seam above107; extend only the native sole490µm to close that
    // submillimetre assembly seam, keeping body and recessed air unchanged.
    for(const part of containerParts(high,i<2?.00094:-.00049)) {
      part.geometry.rotateY(yaw).translate(...position);
      part.geometry.userData.sourceOwner = 'selectedOBJ:81';
      parts.push({name:`Container${i}${part.name}`,geometry:part.geometry});
    }
  }
  return parts;
}

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

