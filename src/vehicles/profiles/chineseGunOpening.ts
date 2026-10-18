// Fitted Chinese gun stations: finite reveal walls surround a pitching cover.
// Cuts operate only on readable first-party stock, before bucket merging.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

/** The cut contour as one closed chain of rim keys, or null when the segments do not form exactly one simple loop. */
function contourLoop(links:Map<string,string[]>):string[]|null {
  if(links.size<3)return null;
  for(const next of links.values())if(next.length!==2)return null;
  const start=links.keys().next().value as string,loop=[start];
  let previous=start,current=links.get(start)![0];
  while(current!==start){
    if(loop.length>links.size)return null;
    loop.push(current);
    const [a,b]=links.get(current)!;const next=a===previous?b:a;previous=current;current=next;
  }
  return loop.length===links.size?loop:null;
}

/** Whether two key cycles visit the same keys in the same cyclic order, in either direction. */
function sameCycle(a:readonly string[],b:readonly string[]):boolean {
  if(a.length!==b.length)return false;
  const at=b.indexOf(a[0]);if(at<0)return false;
  const n=a.length;let forward=true,backward=true;
  for(let i=0;i<n;i++){
    if(a[i]!==b[(at+i)%n])forward=false;
    if(a[i]!==b[(at-i+n)%n])backward=false;
  }
  return forward||backward;
}

/** Keep the positive half-space of a closed stock; original faces are retained. The cut is capped by a fan round the
 * contour's centroid when the contour is star-shaped from it (the authored turret sections); otherwise the chained
 * contour is ear-clipped. 227 gun-gaps r3: an ERA cassette is a thin chevron skin whose cut at the gun channel's wall
 * is an arrow-shaped band; the angle-sorted fan zig-zagged between its outer and inner lines and left a sawtooth of
 * open notches along the channel wall beside the gun (the census's off-axis slivers on t72b3_qilin, ztz99a2, vt4a1). */
function halfStock(source:THREE.BufferGeometry,axis:0|2,sign:number,limit:number):THREE.BufferGeometry|null {
  const p=source.getAttribute('position'),index=source.index,points:number[]=[],rim=new Map<string,THREE.Vector3>();
  const rimKey=(v:THREE.Vector3)=>v.toArray().map(n=>n.toFixed(6)).join(','),links=new Map<string,string[]>();
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
    // the clipped polygon's edges lying on the cut plane are the contour's segments
    for(let j=0;j<output.length;j++){
      const a=output[j],b=output[(j+1)%output.length];
      if(Math.abs(distance(a))>=1e-7||Math.abs(distance(b))>=1e-7)continue;
      const ka=rimKey(a),kb=rimKey(b);if(ka===kb)continue;
      if(!links.has(ka))links.set(ka,[]);if(!links.has(kb))links.set(kb,[]);
      links.get(ka)!.push(kb);links.get(kb)!.push(ka);
    }
  }
  if(points.length===0)return null;
  const cap=[...rim.values()];
  const loop=contourLoop(links);
  if(cap.length>=3){
    const center=cap.reduce((a,b)=>a.add(b),new THREE.Vector3()).divideScalar(cap.length);
    const u=axis===0?2:0,v=1;
    cap.sort((a,b)=>Math.atan2(a.getComponent(v)-center.getComponent(v),a.getComponent(u)-center.getComponent(u))
      -Math.atan2(b.getComponent(v)-center.getComponent(v),b.getComponent(u)-center.getComponent(u)));
    const normal=new THREE.Vector3().setComponent(axis,-sign);
    const fanOrder=cap.map(rimKey);
    if(loop&&loop.length===cap.length&&!sameCycle(loop,fanOrder)){
      const ring=loop.map(k=>rim.get(k)!);
      const faces=THREE.ShapeUtils.triangulateShape(ring.map(q=>new THREE.Vector2(q.getComponent(u),q.getComponent(v))),[]);
      for(const [i,j,k] of faces){
        const a=ring[i],b=ring[j],c=ring[k];
        if(b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)>0)triangle(a,b,c);else triangle(a,c,b);
      }
    }else for(let i=0;i<cap.length;i++){
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
