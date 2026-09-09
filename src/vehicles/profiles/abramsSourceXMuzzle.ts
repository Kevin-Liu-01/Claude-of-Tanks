// Source68 muzzle clamp and MRS mounting assembly: authored manufacturing
// sections, with the bore and the saddle's curved underside genuinely open.
import * as THREE from 'three';
import {closedSectionLoft,roundMember,type XY,type XYZ} from './abramsSourceXGeometry.ts';

interface MuzzlePart {name:string;geometry:THREE.BufferGeometry}
const part=(name:string,geometry:THREE.BufferGeometry):MuzzlePart=>({name:`SourceMuzzle${name}`,geometry});

/** The source nose has a machined planar annulus. Lathe's shared smooth
 * normals otherwise blend its light into the bore and imply a larger hole.
 * Only split terminal face vertices; occupied triangles and every other
 * normal remain identical. Ownership of the incoming geometry transfers. */
export function hardenSourceMuzzleRim(geometry:THREE.BufferGeometry):THREE.BufferGeometry{
  const flat=geometry.index?geometry.toNonIndexed():geometry;
  if(flat!==geometry)geometry.dispose();
  const position=flat.getAttribute('position'),normal=flat.getAttribute('normal');
  for(let i=0;i<position.count;i+=3){
    if([0,1,2].every(k=>Math.abs(position.getZ(i+k)-5.809425)<.0000005)){
      for(let k=0;k<3;k++)normal.setXYZ(i+k,0,0,1);
    }
  }
  normal.needsUpdate=true;
  return flat;
}
function ccw(ring:XY[]):XY[]{
  const area=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-p[1]*q[0];},0);
  return area>0?ring:ring.reverse();
}
function block(name:string,a:XYZ,b:XYZ):MuzzlePart{
  return part(name,new THREE.BoxGeometry(b[0]-a[0],b[1]-a[1],b[2]-a[2]).translate((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2));
}
function clampWing(side:number):MuzzlePart{
  // Rounded plan ends, with the source's small bevel toward both Y edges.
  // The inner68mm station overlaps the annular sleeve, never the bore.
  const ring=(inset:number):XY[]=>{
    const p:XY[]=[[side*.068,-5.574435],[side*(.090895-inset),-5.574435]];
    for(let i=1;i<=8;i++){
      const a=Math.PI/2-i*Math.PI/8;
      p.push([side*(.090895-inset+.0154*Math.cos(a)),-5.589855+.01542*Math.sin(a)]);
    }
    p.push([side*.068,-5.605275]);
    return ccw(p.map(([x,z])=>[x-.019933,z]));
  };
  return part(`ClampWing${side}`,closedSectionLoft([
    {z:1.801995,ring:ring(.00465)},{z:1.849085,ring:ring(0)},{z:1.896255,ring:ring(.00465)},
  ]).rotateX(-Math.PI/2));
}
function saddle():MuzzlePart{
  const angle=Math.acos(.05964/.07724);
  const seatEnd=1.849085+.07724*Math.sin(angle)-.00012;
  const ring:XY[]=[[-.079608,seatEnd],[-.079608,1.922005],[-.074938,1.926325],
    [-.049028,1.926325],[-.047218,1.931635],[.007353,1.931635],
    [.009173,1.926325],[.035073,1.926325],[.039672,1.922005],[.039672,seatEnd]];
  // Circle-derived underside tangent to the .07724m source nose. A tiny
  // 0.12mm receiving lap closes source's open bottom without a solid bridge.
  for(let i=1;i<16;i++){
    const a=angle+(Math.PI-2*angle)*i/16;
    ring.push([-.019968+.07724*Math.cos(a),1.849085+.07724*Math.sin(a)-.00012]);
  }
  const profile=ccw(ring);
  return part('MRSSaddle',closedSectionLoft([{z:5.629185,ring:profile},{z:5.731255,ring:profile}]));
}
const mrsAxis=(z:number):XY=>[-.0138+(z-5.704075)*.19372345,1.96435-(z-5.704075)*.08602887];
function mrsCradle(z:number,end:number,top:number):MuzzlePart{
  const section=(depth:number):XY[]=>{
    const [x,y]=mrsAxis(depth),radius=.0203;
    const points:XY[]=[[-.077418,1.941195],[.037262,1.941195],[.037262,top],[x+radius,top]];
    // The bottom semicircle carries the cylindrical MRS; it is not a box
    // rising through the cylinder or filling the well on either side.
    for(let i=0;i<=12;i++){
      const a=-i*Math.PI/12;
      points.push([x+radius*Math.cos(a),y+radius*Math.sin(a)]);
    }
    points.push([x-radius,top],[-.077418,top]);
    return ccw(points);
  };
  return part(`MRSCradle${z}`,closedSectionLoft([{z,ring:section(z)},{z:end,ring:section(end)}]));
}
function mrsTube():MuzzlePart{
  // Source68/3519 has an oblique, hollow mouth. Its 18 sparse lip planes
  // give this area-weighted trim plane; they are not source triangles.
  const n=[-.10014786,-.76199961,-.63962118],d=-5.07629994;
  const point=(z:number,r:number,a:number):XYZ=>{
    const [x,y]=mrsAxis(z);return [x+r*Math.cos(a),y+r*Math.sin(a),z];
  };
  const mouth=(r:number,a:number):XYZ=>{
    const p=point(0,r,a),den=n[0]*.19372345-n[1]*.08602887+n[2];
    const trim=(d-n[0]*p[0]-n[1]*p[1])/den;
    return point(Math.max(5.578,trim),r,a);
  };
  const outer=Array.from({length:32},(_,i)=>mouth(.0204,i*Math.PI/16));
  const inner=Array.from({length:32},(_,i)=>mouth(.0184,i*Math.PI/16));
  const rear=Array.from({length:32},(_,i)=>point(5.704075,.0204,i*Math.PI/16));
  const floor=Array.from({length:32},(_,i)=>point(5.628,.0184,i*Math.PI/16));
  const positions:number[]=[],tri=(a:XYZ,b:XYZ,c:XYZ)=>positions.push(...a,...b,...c);
  const quad=(a:XYZ,b:XYZ,c:XYZ,e:XYZ)=>{tri(a,b,c);tri(a,c,e);};
  for(let i=0;i<32;i++){
    const j=(i+1)%32;
    quad(outer[i],outer[j],rear[j],rear[i]);
    quad(outer[j],outer[i],inner[i],inner[j]);
    quad(inner[j],inner[i],floor[i],floor[j]);
    tri(point(5.704075,0,0),rear[i],rear[j]);
    tri(point(5.628,0,0),floor[j],floor[i]);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(positions.flatMap((_,i)=>i%3===0?[positions[i],positions[i+2]]:[]),2));
  g.computeVertexNormals();return part('MRSOpticTube',g);
}

export function sourceMuzzleAssembly():MuzzlePart[]{
  const pieces=[clampWing(-1),clampWing(1),saddle(),
    // The source base has a130µm seam over the center of its lower saddle.
    // Thin140µm receiving extension is concealed below the authored deck.
    block('MRSBase',[-.077418,1.926255,5.630395],[.037262,1.941195,5.730045]),
    mrsCradle(5.630395,5.634765,1.974055),mrsCradle(5.657225,5.661475,1.973395),
    mrsCradle(5.695455,5.704195,1.972325),mrsTube(),
    part('MRSTrunnion',roundMember([-.058818,1.953345,5.67913],[.018953,1.953345,5.67913],.00937,8)),
  ];
  // Measured four top hex fasteners and opposing clamp bolt heads.
  for(const x of[-.064323,.023733])for(const z of[5.646175,5.716815])pieces.push(part(`MRSBolt${x}_${z}`,
    new THREE.CylinderGeometry(.011055,.011055,.01036,6).rotateY(Math.PI/2).translate(x,1.945905,z)));
  for(const [x,y]of[[-.107113,1.796185],[.067102,1.9019]])pieces.push(part(`ClampBolt${x}`,
    new THREE.CylinderGeometry(.01153,.01153,.01164,6).rotateY(Math.PI/2).translate(x,y,5.589435)));
  const axis=new THREE.Vector3(.19372345,-.08602887,1).normalize();
  pieces.push(part('MRSRearBlock',new THREE.BoxGeometry(.046,.046,.034).applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis)).translate(-.01289,1.96174,5.7221)));
  pieces.push(part('MRSEndCap',roundMember([-.0101,1.9602,5.7365],[-.007,1.9589,5.7544],.0165,12)));
  return pieces;
}

