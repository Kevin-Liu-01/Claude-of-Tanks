import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Owner-directed mechanical repair: retain the outer armor stations but leave
// a genuine open-topped gun channel. Closed convex stock on either side gives
// physical reveal walls; there is no invisible cap across the cannon sweep.
function clip(points: THREE.Vector3[], distance:(v:THREE.Vector3)=>number):THREE.Vector3[] {
  const kept=points.filter(p=>distance(p)>=-1e-9);
  for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
    const a=distance(points[i]),b=distance(points[j]);
    if(a*b < -1e-12) kept.push(points[i].clone().lerp(points[j],a/(a-b)));
  }
  const unique=new Map<string,THREE.Vector3>();
  for(const p of kept) unique.set(`${p.x.toFixed(8)},${p.y.toFixed(8)},${p.z.toFixed(8)}`,p);
  return [...unique.values()];
}

export function addLeopardTurretWithGunOpening(P:TankBuilderPort,sections:readonly SolidSection[],gunX:number,gunZ:number):void {
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
  }
}

export function addLeopardMovingMantlet(P:TankBuilderPort):void {
  // The transverse trunnion and faceted shield pitch with rig_gun. The tube
  // and its sleeve retain their original independent recoil and muzzle datum.
  P.add('gunMount',KIT.cylX(.275,.72,32),0,0,0);
  P.add('gunMount',sectionSolid([
    {z:-.08,ring:[[-.30,-.20],[.30,-.20],[.34,-.13],[.34,.18],[.26,.27],[-.26,.27],[-.34,.18],[-.34,-.13]]},
    {z:.39,ring:[[-.27,-.18],[.27,-.18],[.31,-.11],[.31,.13],[.24,.22],[-.24,.22],[-.31,.13],[-.31,-.11]]},
    {z:.72,ring:[[-.17,-.16],[.17,-.16],[.21,-.10],[.21,.09],[.16,.17],[-.16,.17],[-.21,.09],[-.21,-.10]]},
  ]));
  P.add('gunMount',KIT.cylZ(.19,.19,32),0,0,.72);
  for(const side of [-1,1]) {
    P.add('turret',KIT.cylX(.19,.09,24),
      P.gunG.position.x+side*.397,P.gunG.position.y,P.gunG.position.z);
    P.addEquipment('gunMountDark',KIT.cylX(.105,.015,20),side*.366,0,0);
    P.addEquipment('gunMount',KIT.box(.026,.075,.32),side*.318,.075,.16);
  }
}
