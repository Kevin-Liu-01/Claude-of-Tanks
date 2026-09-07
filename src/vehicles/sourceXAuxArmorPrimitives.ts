// Boot-light first-party armor metadata. No renderer, source loader or runtime
// geometry is imported; every caller supplies its own measured panel planes.
import type {ArmorPlate} from './specHelpers.ts';
export type AuxPoint = [number, number, number];

export function auxiliaryFace(template: ArmorPlate, group: string, index: number,
  points: readonly AuxPoint[], side: number): ArmorPlate {
  const verts=points.map(p=>[...p] as AuxPoint);
  // A clipped convex outline can start with a very shallow corner. Keep its
  // exact boundary but start at the strongest consecutive triangle so the
  // planar contract does not depend on arbitrary clipping order.
  const strength=(i:number)=>{
    const [a,b,c]=[verts[i],verts[(i+1)%verts.length],verts[(i+2)%verts.length]];
    return Math.abs((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]));
  };
  const rotate=()=>{
    const start=verts.reduce((best,_,i)=>strength(i)>strength(best)?i:best,0);
    verts.push(...verts.splice(0,start));
  };
  rotate();
  const a=verts[0],b=verts[1],c=verts[2];
  const nx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
  if(nx*side<0){verts.reverse();rotate();}
  return {...template,name:`${template.name}_source_${group}_${index}`,verts,
    convexPolygon:true,surfaceGroup:group};
}

export function auxiliaryQuad(template: ArmorPlate, group: string, index: number,
  points: readonly AuxPoint[], side: number): ArmorPlate[] {
  const [a,b,c,d]=points;
  const u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const error=Math.abs(n.reduce((sum,q,i)=>sum+q*(d[i]-a[i]),0))/Math.hypot(...n);
  if(error<1e-9)return [auxiliaryFace(template,group,index,points,side)];
  return [auxiliaryFace(template,group,index*2,[a,b,c],side),
    auxiliaryFace(template,group,index*2+1,[a,c,d],side)];
}

export function auxiliaryRectangle(template: ArmorPlate, group: string,
  x: number, rear: number, front: number, bottom: number, top: number): ArmorPlate {
  return auxiliaryFace(template,group,0,[[x,bottom,front],[x,bottom,rear],
    [x,top,rear],[x,top,front]],Math.sign(x));
}
