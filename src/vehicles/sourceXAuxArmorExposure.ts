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
      // (boot-261) the extents without four mapped copies a contour: Math.min/max a point at a time is the same value
      let y0=Infinity,y1=-Infinity,z0=Infinity,z1=-Infinity;
      for(const p of face){y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);z0=Math.min(z0,p[2]);z1=Math.max(z1,p[2]);}
      entry={face,bounds:[y0,y1,z0,z1],
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
  const result=face.filter((a,i)=>{const b=face[(i+1)%face.length];return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])>1e-10;});
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
    if(ia!==ib)out.push([a[0]+(b[0]-a[0])*da/(da-db),a[1]+(b[1]-a[1])*da/(da-db),a[2]+(b[2]-a[2])*da/(da-db)]);
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
  // (boot-261) each edge's terms taken once: the same values the expression read from the points every call
  const sign=Math.sign(signed);
  return face.map((a,i)=>{const b=face[(i+1)%face.length],ey=b[1]-a[1],ez=b[2]-a[2],ay=a[1],az=a[2];
    return(p:Readonly<AuxPoint>)=>sign*(ey*(p[2]-az)-ez*(p[1]-ay));});
}
function outerDepth(face:Face,side:number):Plane {
  const[a,b,c]=face,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const ax=a[0],ay=a[1],az=a[2],nx=n[0],ny=n[1],nz=n[2];
  return p=>side*(ax-(ny*(p[1]-ay)+nz*(p[2]-az))/nx-p[0]);
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
  const join=(i:number,j:number):Face|null=>{
    const a=facts(result[i]),b=facts(result[j]);
    // (2026-10-26, the boot census) two faces apart by more than a micron can never join: their hull adds area far past
    // the test's 1e-13, so the hull below is skipped (it ran for every coplanar pair, the fleet chunk's evaluation)
    if(!overlaps(a.bounds,b.bounds,-1e-6))return null;
    if(!b.face.every(p=>Math.abs(a.unitDepth(p))<1e-11))return null;
    const joined=hull([...result[i],...result[j]]);
    return Math.abs(area(joined)-a.area-b.area)>1e-13?null:joined;
  };
  // Every merge takes the first joinable pair in (i, j) order, as a full rescan from the start after each merge would. A
  // pair of unchanged faces that failed stays failed, so after a merge into face i only the pairs (a, i) with a < i are
  // checked again before the scan goes on from i (2026-10-26, the boot census: the rescans were the evaluation's cost).
  let changed=-1,from=0;
  scan:for(;;){
    if(changed>=0){
      for(let a=0;a<changed;a++){
        const joined=join(a,changed);
        if(joined){result[a]=joined;result.splice(changed,1);changed=a;continue scan;}
      }
      from=changed;changed=-1;
    }
    for(let i=from;i<result.length;i++)for(let j=i+1;j<result.length;j++){
      const joined=join(i,j);
      if(joined){result[i]=joined;result.splice(j,1);changed=i;continue scan;}
    }
    return result;
  }
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
  const mid:AuxPoint=[a[0]+(b[0]-a[0])*(low+high)/2,a[1]+(b[1]-a[1])*(low+high)/2,a[2]+(b[2]-a[2])*(low+high)/2];
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
      .map((t):AuxPoint=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
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
/**
 * (2026-10-27, boot-261) The contours that can be a contour's covers, by strips of the course's length: each contour is
 * listed in every strip its z extent comes within a micron of, so any pair the cover test (bounds within 1e-10) passes
 * shares a strip. The test still decides, in index order; a non-finite or vast extent lists every contour. The Type 10's
 * course tested all 796 x 796 pairs, a third of the fleet chunk's armour evaluation.
 */
function coverCandidates(contours:Contour[]):(i:number)=>number[] {
  const strip=.25,pad=1e-6,strips=new Map<number,number[]>();
  const span=(b:Bounds):[number,number]=>[Math.floor((b[2]-pad)/strip),Math.floor((b[3]+pad)/strip)];
  const every=contours.map((_,j)=>j);
  for(const c of contours){
    const[lo,hi]=span(c.bounds);
    if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi-lo>4096)return()=>every;
  }
  contours.forEach((c,j)=>{
    const[lo,hi]=span(c.bounds);
    for(let k=lo;k<=hi;k++){let list=strips.get(k);if(!list)strips.set(k,list=[]);list.push(j);}
  });
  const seen=new Int32Array(contours.length).fill(-1);
  return i=>{
    const[lo,hi]=span(contours[i].bounds),found:number[]=[];
    for(let k=lo;k<=hi;k++)for(const j of strips.get(k)??[])if(seen[j]!==i){seen[j]=i;found.push(j);}
    return found.sort((a,b)=>a-b);
  };
}
/** Only the transverse exposure is partitioned. No edge is inset, no source
 * opening is filled, and the renderer is neither imported nor changed. */
export function exposedAuxiliaryCourse(input:ArmorPlate[],side:number,group:string):ArmorPlate[] {
  const facts=contourCache(side),plates=coalesce(input,side,facts);
  const contours=plates.map(p=>facts(p.verts as Face)),candidates=coverCandidates(contours),out:ArmorPlate[]=[];
  for(let i=0;i<plates.length;i++){
    const current=contours[i];let faces=[current.face];
    // Numeric projected interval culling retains original candidate order.
    // Cached planes use the exact previous arithmetic; no contour rounding.
    const covers=candidates(i).filter(j=>j!==i&&plates[i].surfaceGroup!==plates[j].surfaceGroup
      &&overlaps(current.bounds,contours[j].bounds,-1e-10)).map(j=>contours[j]);
    for(const cover of covers){
      if(!faces.length)break;
      if(!overlaps(current.bounds,cover.bounds))continue;
      let deepest=-Infinity;for(const p of current.face)deepest=Math.max(deepest,cover.depth(p));
      if(deepest<=1e-10)continue;
      faces=faces.flatMap(face=>overlaps(facts(face).bounds,cover.bounds)?subtract(face,cover.planes):[face]);
    }
    for(const face of mergeFragments(faces,facts))out.push(exposedPlate(plates[i],face,covers,side,group,out.length));
  }
  return out;
}
