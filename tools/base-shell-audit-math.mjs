// Read-only geometry diagnostics. Mirrored vertices alone cannot detect a
// twisted quad whose reflected side chose a different triangulation diagonal.
import {Vector3,Triangle,Box3} from 'three';
const key = p => p.map(n=>Math.round(n*1e5)).join(',');
const mirrored = p => [-p[0],p[1],p[2]];
export function shellPart(geometry, metadata={}) {
  const p=geometry.getAttribute('position'),index=geometry.index,triangles=[],unique=new Map();
  const point=i=>[p.getX(i),p.getY(i),p.getZ(i)];
  let area=0,volume=0;
  for(let i=0;i<(index?.count??p.count);i+=3){
    const points=[0,1,2].map(j=>point(index?index.getX(i+j):i+j));
    if(points.some(v=>v.some(n=>!Number.isFinite(n))))throw Error('Nonfinite shell vertex');
    points.forEach(v=>unique.set(key(v),v));
    const triangle=new Triangle(...points.map(v=>new Vector3(...v)));
    const a=triangle.getArea();area+=a;
    volume+=triangle.a.dot(new Vector3().crossVectors(triangle.b,triangle.c))/6;
    if(a>1e-9)triangles.push({points,triangle,area:a,bounds:new Box3().setFromPoints([triangle.a,triangle.b,triangle.c])});
  }
  const vertices=[...unique.values()],bounds=new Box3().setFromPoints(vertices.map(v=>new Vector3(...v))),size=bounds.getSize(new Vector3());
  return {...metadata,triangles,vertices,area,volume,bounds,size,
    signature:vertices.map(key).sort().join('|'),mirrorSignature:vertices.map(mirrored).map(key).sort().join('|')};
}
export function mirroredSurfaceError(part,other) {
  const sample=new Vector3(),closest=new Vector3();let max=0,sum=0,weight=0,witness=null;
  for(const t of part.triangles){
    // Samples inside each triangle, not just boundary corners.
    for(const b of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
      sample.set(0,0,0).addScaledVector(t.triangle.a,b[0]).addScaledVector(t.triangle.b,b[1]).addScaledVector(t.triangle.c,b[2]);sample.x=-sample.x;
      let best=Infinity;
      for(const candidate of other.triangles){
        if(candidate.bounds.distanceToPoint(sample)>=best)continue;
        candidate.triangle.closestPointToPoint(sample,closest);best=Math.min(best,closest.distanceTo(sample));
      }
      sum+=best*t.area;weight+=t.area;
      if(best>max){max=best;witness={point:sample.toArray(),sourceTriangle:t.points};}
    }
  }
  return {maxM:max,meanM:weight?sum/weight:0,witness};
}
export function slabWarps(part) {
  if(part.vertices.length!==8||part.triangles.length!==12)return [];
  const rows=[];
  for(let i=0;i<12;i+=2){
    const a=part.triangles[i],b=part.triangles[i+1];
    const shared=a.points.filter(p=>b.points.some(q=>key(p)===key(q)));
    if(shared.length!==2)continue;
    const n1=a.triangle.getNormal(new Vector3()),n2=b.triangle.getNormal(new Vector3());
    const angleDeg=Math.acos(Math.max(-1,Math.min(1,n1.dot(n2))))*180/Math.PI;
    const off=b.points.find(p=>!a.points.some(q=>key(p)===key(q)));
    const deviationM=Math.abs(n1.dot(new Vector3(...off).sub(a.triangle.a)));
    if(deviationM>.003&&angleDeg>3)rows.push({face:i/2,angleDeg,deviationM,areaM2:a.area+b.area,corners:[...a.points,off]});
  }
  return rows;
}
export function auditShellParts(parts){
  const index=new Map();for(const p of parts){const k=p.bucket+':'+p.signature;const rows=index.get(k)??[];rows.push(p);index.set(k,rows);}
  const mirroredPairs=[],unmatched=[],warpedSlabs=[];const seen=new Set();
  for(const p of parts){
    const warps=slabWarps(p);if(warps.length)warpedSlabs.push({part:p.ordinal,bucket:p.bucket,site:p.site,warps});
    if(seen.has(p.ordinal))continue;
    const candidates=index.get(p.bucket+':'+p.mirrorSignature)??[];
    if(!candidates.length){unmatched.push({part:p.ordinal,bucket:p.bucket,site:p.site,areaM2:p.area});continue;}
    const q=candidates[0];seen.add(p.ordinal);seen.add(q.ordinal);
    const forward=mirroredSurfaceError(p,q),backward=p===q?forward:mirroredSurfaceError(q,p);
    mirroredPairs.push({parts:[p.ordinal,q.ordinal],bucket:p.bucket,sites:[p.site,q.site],areaM2:p.area+q.area,
      ...(forward.maxM>=backward.maxM?forward:backward)});
  }
  return {primaryParts:parts.length,mirroredPairs:mirroredPairs.sort((a,b)=>b.maxM-a.maxM),unmatched,warpedSlabs};
}
