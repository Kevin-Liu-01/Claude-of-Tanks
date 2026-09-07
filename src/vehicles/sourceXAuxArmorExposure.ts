// Convex, first-party hit-face clipping only. A nested installed sheet keeps
// its donor protection family once, on the actually exposed outermost face.
import type {ArmorPlate} from './specHelpers.ts';
import {auxiliaryFace,type AuxPoint} from './sourceXAuxArmorPrimitives.ts';
type Plane=(point:Readonly<AuxPoint>)=>number;
type Face=AuxPoint[];
type Bounds=readonly [number,number,number,number];
interface Contour {
  face:Face;
  bounds:Bounds;
  area:number;
  depth:Plane;
  unitDepth:Plane;
  planes:Plane[];
}
type Contours=(face:Face)=>Contour;

function contourCache(side:number):Contours {
  // One construction invocation owns this cache. Faces are immutable while
  // clipping; newly created fragments get their own facts, never stale state.
  const cache=new WeakMap<Face,Contour>();
  return face=>{
    let entry=cache.get(face);
    if(!entry){
      const depth=outerDepth(face,side);
      entry={face,bounds:[Math.min(...face.map(p=>p[1])),Math.max(...face.map(p=>p[1])),
        Math.min(...face.map(p=>p[2])),Math.max(...face.map(p=>p[2]))],
      area:area(face),depth,unitDepth:outerDepth(face,1),planes:[...projectedPlanes(face),depth]};
      cache.set(face,entry);
    }
    return entry;
  };
}

function area(face:Face):number {
  return Math.abs(face.reduce((n,a,i)=>{const b=face[(i+1)%face.length];return n+a[1]*b[2]-a[2]*b[1];},0))/2;
}
function clean(face:Face):Face {
  const result=face.filter((a,i)=>Math.hypot(...a.map((v,k)=>v-face[(i+1)%face.length][k]))>1e-10);
  return result.filter((b,i)=>{
    const a=result[(i+result.length-1)%result.length],c=result[(i+1)%result.length];
    return Math.abs((b[1]-a[1])*(c[2]-b[2])-(b[2]-a[2])*(c[1]-b[1]))>1e-13;
  });
}
function clip(face:Face,plane:Plane,inside:boolean):Face {
  const out:Face=[];
  for(let i=0;i<face.length;i++){
    const a=face[i],b=face[(i+1)%face.length],da=plane(a),db=plane(b);
    const ia=inside?da>=0:da<=0,ib=inside?db>=0:db<=0;
    if(ia)out.push(a);
    if(ia!==ib)out.push(a.map((v,k)=>v+(b[k]-v)*da/(da-db)) as AuxPoint);
  }
  return clean(out);
}
function subtract(face:Face,planes:Plane[]):Face[] {
  let rest=face;const out:Face[]=[];
  for(const plane of planes){
    if(rest.length<3)break;
    const outside=clip(rest,plane,false);
    if(outside.length>=3&&area(outside)>1e-12)out.push(outside);
    rest=clip(rest,plane,true);
  }
  return out;
}
function projectedPlanes(face:Face):Plane[] {
  const signed=face.reduce((n,a,i)=>{const b=face[(i+1)%face.length];return n+a[1]*b[2]-a[2]*b[1];},0);
  return face.map((a,i)=>{const b=face[(i+1)%face.length];
    return(p:Readonly<AuxPoint>)=>Math.sign(signed)*((b[1]-a[1])*(p[2]-a[2])-(b[2]-a[2])*(p[1]-a[1]));});
}
function outerDepth(face:Face,side:number):Plane {
  const[a,b,c]=face,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  return p=>side*(a[0]-(n[1]*(p[1]-a[1])+n[2]*(p[2]-a[2]))/n[0]-p[0]);
}
function overlaps(a:Bounds,b:Bounds,margin=1e-10):boolean {
  return a[0]<b[1]-margin&&a[1]>b[0]+margin&&a[2]<b[3]-margin&&a[3]>b[2]+margin;
}
function hull(points:Face):Face {
  const sorted=[...points].sort((a,b)=>a[1]-b[1]||a[2]-b[2]);
  const cross=(a:AuxPoint,b:AuxPoint,c:AuxPoint)=>(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
  const half=(rows:Face)=>{const result:Face=[];for(const p of rows){
    while(result.length>1&&cross(result.at(-2)!,result.at(-1)!,p)<=1e-14)result.pop();
    result.push(p);
  }return result;};
  return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
function mergeFragments(faces:Face[],facts:Contours):Face[] {
  // Clipping a wide fascia against many ruled cells leaves coplanar pieces.
  // Merge only when their union is already convex: unchanged area and exact
  // original boundary, with no inset, missing sliver or artificial bridge.
  const result=[...faces];
  for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){
    const a=facts(result[i]),b=facts(result[j]);
    if(!b.face.every(p=>Math.abs(a.unitDepth(p))<1e-11))continue;
    const joined=hull([...result[i],...result[j]]);
    if(Math.abs(area(joined)-a.area-b.area)>1e-13)continue;
    result[i]=joined;result.splice(j,1);i=-1;break;
  }
  return result;
}
function planeKey(face:Face):string {
  const[a,b,c]=face,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...n),unit=n.map(q=>q/length);
  return [...unit,unit.reduce((sum,q,i)=>sum+q*a[i],0)].map(q=>q.toFixed(7)).join(',');
}
function coalesce(plates:ArmorPlate[],side:number,facts:Contours):ArmorPlate[] {
  const bins=new Map<string,{template:ArmorPlate;faces:Face[]}>();
  for(const plate of plates){
    const face=plate.verts as Face,key=`${plate.surfaceGroup}:${planeKey(face)}`;
    const bin=bins.get(key);
    if(bin)bin.faces.push(face);else bins.set(key,{template:plate,faces:[face]});
  }
  const out:ArmorPlate[]=[];
  for(const{template,faces}of bins.values())for(const face of mergeFragments(faces,facts))
    out.push(auxiliaryFace(template,template.surfaceGroup!,out.length,face,side));
  return out;
}
function coveredInterval(a:Readonly<AuxPoint>,b:Readonly<AuxPoint>,cover:Contour):number[] {
  const {depth,planes}=cover;
  let low=0,high=1;
  for(const plane of planes){
    const da=plane(a),db=plane(b);
    if(da<0&&db<0)return[];
    if(da<0)low=Math.max(low,da/(da-db));
    if(db<0)high=Math.min(high,da/(da-db));
  }
  if(high-low<1e-10)return[];
  const mid=a.map((v,k)=>v+(b[k]-v)*(low+high)/2) as AuxPoint;
  return depth(mid)>1e-10?[low,high]:[];
}
function cutEdgeSegments(face:Face,covers:Contour[]):Face {
  return face.flatMap((a,i)=>{
    const b=face[(i+1)%face.length],values=[0,1];
    const intervals=covers.map(c=>coveredInterval(a,b,c)).filter(r=>r.length).sort((x,y)=>x[0]-y[0]);
    const united:number[][]=[];
    for(const interval of intervals){
      const previous=united.at(-1);
      if(previous&&interval[0]<=previous[1]+1e-10)previous[1]=Math.max(previous[1],interval[1]);
      else united.push([...interval]);
    }
    // Internal boundaries between two covers do not change edge ownership.
    for(const interval of united)values.push(...interval);
    values.sort((x,y)=>x-y);
    return values.filter((n,j)=>n<1-1e-10&&(j===0||n-values[j-1]>1e-10))
      .map(t=>a.map((v,k)=>v+(b[k]-v)*t) as AuxPoint);
  });
}
function exposedPlate(template:ArmorPlate,face:Face,covers:Contour[],side:number,group:string,index:number):ArmorPlate {
  const plate=auxiliaryFace(template,group,index,cutEdgeSegments(face,covers),side);
  // The outer real face owns a closed cut edge. Only the strictly covered
  // backing edge is half-open; free sheet boundaries remain physically closed.
  const openEdges=plate.verts.flatMap((a,i)=>{
    const b=plate.verts[(i+1)%plate.verts.length];
    return covers.some(c=>coveredInterval(a,b,c).length>0)?[i]:[];
  });
  return openEdges.length?{...plate,openEdges}:plate;
}
/** Only the transverse exposure is partitioned. No edge is inset, no source
 * opening is filled, and the renderer is neither imported nor changed. */
export function exposedAuxiliaryCourse(input:ArmorPlate[],side:number,group:string):ArmorPlate[] {
  const facts=contourCache(side),plates=coalesce(input,side,facts);
  const contours=plates.map(p=>facts(p.verts as Face)),out:ArmorPlate[]=[];
  for(let i=0;i<plates.length;i++){
    const current=contours[i];let faces=[current.face];
    // Numeric projected interval culling retains original candidate order.
    // Cached planes use the exact previous arithmetic; no contour rounding.
    const covers=contours.filter((c,j)=>j!==i&&plates[i].surfaceGroup!==plates[j].surfaceGroup
      &&overlaps(current.bounds,c.bounds,-1e-10));
    for(const cover of covers){
      if(!faces.length)break;
      if(!overlaps(current.bounds,cover.bounds)||Math.max(...current.face.map(cover.depth))<=1e-10)continue;
      faces=faces.flatMap(face=>overlaps(facts(face).bounds,cover.bounds)?subtract(face,cover.planes):[face]);
    }
    for(const face of mergeFragments(faces,facts))out.push(exposedPlate(plates[i],face,covers,side,group,out.length));
  }
  return out;
}
