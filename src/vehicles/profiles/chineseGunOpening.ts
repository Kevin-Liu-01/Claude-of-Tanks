// Fitted Chinese gun stations: finite reveal walls surround a pitching cover.
// Cuts operate only on readable first-party stock, before bucket merging.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

/** Keep the positive half-space of a closed stock. These authored turret
 * sections have one convex intersection contour; original faces are retained. */
function halfStock(source:THREE.BufferGeometry,axis:0|2,sign:number,limit:number):THREE.BufferGeometry|null {
  const p=source.getAttribute('position'),index=source.index,points:number[]=[],rim=new Map<string,THREE.Vector3>();
  const distance=(v:THREE.Vector3)=>sign*v.getComponent(axis)-limit;
  const vertex=(i:number)=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i):i);
  const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>points.push(...a.toArray(),...b.toArray(),...c.toArray());
  for(let i=0;i<(index?.count??p.count);i+=3){
    const input=[vertex(i),vertex(i+1),vertex(i+2)],output:THREE.Vector3[]=[];
    for(let j=0;j<3;j++){
      const a=input[j],b=input[(j+1)%3],da=distance(a),db=distance(b);
      if(da>=-1e-7)output.push(a);
      if(Math.abs(da)<1e-7)rim.set(a.toArray().map(v=>v.toFixed(6)).join(','),a);
      if((da>1e-7&&db< -1e-7)||(da< -1e-7&&db>1e-7)){
        const hit=a.clone().lerp(b,da/(da-db));output.push(hit);
        rim.set(hit.toArray().map(v=>v.toFixed(6)).join(','),hit);
      }
    }
    for(let j=1;j+1<output.length;j++)triangle(output[0],output[j],output[j+1]);
  }
  if(points.length===0)return null;
  const cap=[...rim.values()];
  if(cap.length>=3){
    const center=cap.reduce((a,b)=>a.add(b),new THREE.Vector3()).divideScalar(cap.length);
    const u=axis===0?2:0,v=1;
    cap.sort((a,b)=>Math.atan2(a.getComponent(v)-center.getComponent(v),a.getComponent(u)-center.getComponent(u))
      -Math.atan2(b.getComponent(v)-center.getComponent(v),b.getComponent(u)-center.getComponent(u)));
    const normal=new THREE.Vector3().setComponent(axis,-sign);
    for(let i=0;i<cap.length;i++){
      const a=cap[i],b=cap[(i+1)%cap.length];
      const cross=a.clone().sub(center).cross(b.clone().sub(center));
      if(cross.lengthSq()<1e-18)continue;
      if(cross.dot(normal)>0)triangle(center,a,b);else triangle(center,b,a);
    }
  }
  const result=new THREE.BufferGeometry(),uv:number[]=[];
  for(let i=0;i<points.length;i+=3)uv.push(points[i],points[i+2]);
  result.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  result.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));result.computeVertexNormals();
  return result;
}

/** Remove the full-height center channel, including hidden stock behind the
 * old narrow sleeve. Each retained wall is capped, never a deleted-face hole. */
export function addChineseThroatStock(P:TankBuilderPort,stock:THREE.BufferGeometry,bucket='turret'):void {
  const rear=P.gunG.position.z-.58,half=.40;
  for(const [axis,sign,limit] of [[0,-1,half],[0,1,half]] as const){
    const wall=halfStock(stock,axis,sign,limit);if(wall)P.add(bucket,wall);
  }
  const centerLeft=halfStock(stock,0,1,-half);
  const center=centerLeft&&halfStock(centerLeft,0,-1,-half);
  if(center){const back=halfStock(center,2,-1,-rear);if(back)P.add(bucket,back);center.dispose();}
  centerLeft?.dispose();stock.dispose();
}

export function addChineseMovingMantlet(P:TankBuilderPort,crown:number,nose:number):void {
  const ring=(half:number,low:number,high:number):[number,number][]=>[
    [-half+.025,low],[half-.025,low],[half,low+.035],[half,high-.035],
    [half-.035,high],[-half+.035,high],[-half,high-.035],[-half,low+.035],
  ];
  P.add('gunMount',KIT.cylX(.24,.79,32),0,0,-.03);
  P.add('gunMount',sectionSolid([
    {z:-.55,ring:ring(.377,-.055,Math.min(crown,.14))},
    {z:-.35,ring:ring(.377,-.17,crown)},
    {z:.12,ring:ring(.377,-.22,crown)},
    {z:nose*.70,ring:ring(.369,-.19,.19)},
    {z:nose,ring:ring(.215,-.15,.15)},
  ]));
  P.add('gunMount',KIT.cylZ(.18,.14,32),0,0,nose+.025);
  P.add('gunMountDark',KIT.cylZ(.184,.022,32),0,0,nose+.085);
  for(const side of [-1,1]){
    P.add('turret',KIT.cylX(.16,.045,24),side*.416,P.gunG.position.y,P.gunG.position.z-.03);
    P.addEquipment('gunMountDark',KIT.cylX(.11,.012,24),side*.383,0,-.03);
  }
  P.gunG.userData.chineseMantletFit={channelHalfWidthM:.40,shieldHalfWidthM:.377,rearM:-.55,noseM:nose,articulated:true};
}
