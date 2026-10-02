import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Owner-directed mechanical repair: retain the outer armor stations but leave
// a genuine open-topped gun channel. Closed convex stock on either side gives
// physical reveal walls; there is no invisible cap across the cannon sweep.
function clip(points: THREE.Vector3[], distance:(v:THREE.Vector3)=>number):THREE.Vector3[] {
  if(points.length<4)return [];
  const distances=points.map(distance);
  if(distances.every(d=>d>=-1e-9))return points;
  if(distances.every(d=>d<=1e-9))return [];
  // Only intersect actual boundary edges. Intersecting every pair of points
  // introduced interior diagonals, which grew exponentially on successive cuts.
  const hull=new ConvexHull().setFromPoints(points);
  const unique=new Map<string,THREE.Vector3>();
  const keep=(p:THREE.Vector3)=>unique.set(
    `${p.x.toFixed(8)},${p.y.toFixed(8)},${p.z.toFixed(8)}`,p);
  for(const face of hull.faces) {
    let edge=face.edge;
    do {
      const from=edge.tail()!.point,to=edge.head().point;
      const a=distance(from),b=distance(to);
      if(a>=-1e-9)keep(from);
      if(a*b < -1e-12)keep(from.clone().lerp(to,a/(a-b)));
      edge=edge.next;
    }while(edge!==face.edge);
  }
  return [...unique.values()];
}

export function addLeopardTurretWithGunOpening(P:TankBuilderPort,sections:readonly SolidSection[],gunX:number,gunY:number,gunZ:number):void {
  const back=gunZ-.70,half=.40;
  if(sections.at(-1)!.z<=back) {P.add('turret',sectionSolid(sections));return;}
  const emit=(points:THREE.Vector3[])=>{
    if(points.length<4)return;
    const bounds=new THREE.Box3().setFromPoints(points),size=bounds.getSize(new THREE.Vector3());
    if(Math.min(size.x,size.y,size.z)<1e-7)return;
    const geometry=new ConvexGeometry(points),uv:number[]=[];
    const p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)uv.push(p.getX(i),p.getZ(i));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    P.add('turret',geometry);
  };
  for(let i=1;i<sections.length;i++) {
    const pair=[sections[i-1],sections[i]];
    if(pair[1].z<=back){P.add('turret',sectionSolid(pair));continue;}
    const points=pair.flatMap(s=>s.ring.map(([x,y])=>new THREE.Vector3(x,y,s.z)));
    if(pair[0].z<back)emit(clip(points,p=>back-p.z));
    const front=clip(points,p=>p.z-back);
    emit(clip(front,p=>gunX-half-p.x));
    emit(clip(front,p=>p.x-gunX-half));
    // The rear receiver follows the mantlet's circular swept envelope. A
    // vertical back wall left a conspicuous trench behind the smaller shield.
    // These finite armor returns join the original shell and leave 40 mm
    // radial running clearance around the 660 mm pitching drum.
    const center=clip(clip(front,p=>p.x-gunX+half),p=>gunX+half-p.x);
    for(let step=-16;step<16;step++) {
      const a=step*Math.PI/36,b=(step+1)*Math.PI/36;
      const y0=.70*Math.sin(a),y1=.70*Math.sin(b);
      const z0=-.70*Math.cos(a),z1=-.70*Math.cos(b);
      const band=clip(clip(center,p=>p.y-gunY-y0),p=>gunY+y1-p.y);
      emit(clip(band,p=>gunZ+z0+(p.y-gunY-y0)*(z1-z0)/(y1-y0)-p.z));
    }
  }
}

export interface LeopardMantletFit {
  readonly crown: number;
  readonly noseZ: number;
  readonly noseRoof: number;
}

export function addLeopardMovingMantlet(P:TankBuilderPort,fit:LeopardMantletFit):void {
  // The bearing stays on the trunnion; the broad rocker and long upper cover
  // pitch together. The cannon slides independently inside its receiving sleeve.
  P.add('gunMount',KIT.cylX(.275,.76,32),0,0,0);
  const ring=(half:number,bottom:number,top:number):[number,number][]=>[
    [-half+.026,bottom],[half-.026,bottom],[half,bottom+.045],
    [half,top-.028],[half-.025,top],[-half+.025,top],
    [-half,top-.028],[-half,bottom+.045],
  ];
  // The underside rises toward the breech so elevation clears the turret
  // bearing ring below it; a full-depth rear drum intersected that ring.
  const rear=[-.62,-.56,-.48,-.38,-.25,0].map(z=>{
    const radius=Math.sqrt(.66*.66-z*z);
    return {z,ring:ring(.376,Math.max(-.22,-.15-.40*z),Math.min(fit.crown,radius))};
  });
  P.add('gunMount',sectionSolid([
    ...rear,
    {z:.38,ring:ring(.376,-.205,fit.crown*.82)},
    {z:.80,ring:ring(.365,-.185,Math.max(.19,fit.noseRoof+.10))},
    {z:fit.noseZ,ring:ring(.205,-.155,fit.noseRoof)},
  ]));
  P.add('gunMount',KIT.cylZ(.195,.26,32),0,0,fit.noseZ-.035);
  for(const side of [-1,1]) {
    P.add('turret',KIT.cylX(.19,.09,24),
      P.gunG.position.x+side*.397,P.gunG.position.y,P.gunG.position.z);
    P.addEquipment('gunMountDark',KIT.cylX(.105,.015,20),side*.378,0,0);
    // Fitted panel edges / lifting ears, kept inside the 800 mm opening.
    P.addEquipment('gunMount',KIT.box(.024,.026,.11),side*.306,fit.crown+.012,.05);
    P.addEquipment('gunMount',KIT.box(.025,.026,.09),side*.305,fit.crown*.82+.010,.34);
  }
}
