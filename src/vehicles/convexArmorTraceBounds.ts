// Optional acceleration data only. Exact polygon tracing owns every hit;
// ill-conditioned outlines deliberately receive no bound and use that path.
import type {ArmorPlate,Vec3Tuple} from './specHelpers.ts';
type Point=[number,number,number];
type Bounds=NonNullable<ArmorPlate['traceBounds']>;
const DISTANCE_EPSILON=1e-7;
const dot=(a:Vec3Tuple,b:Vec3Tuple):number=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a:Vec3Tuple,b:Vec3Tuple):Point=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:Vec3Tuple,b:Vec3Tuple):Point=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=(a:Vec3Tuple):number=>Math.sqrt(dot(a,a));

function planeNormal(verts:readonly Vec3Tuple[]):Point|undefined {
  if(verts.length<3||verts.length>128||verts.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))return;
  const normal=cross(sub(verts[1],verts[0]),sub(verts[2],verts[0])),size=length(normal);
  if(!Number.isFinite(size)||size<=1e-8)return;
  return normal.map(v=>v/size) as Point;
}
function projectedEdges(verts:readonly Vec3Tuple[],normal:Point,scale:number):{normals:Point[];epsilon:number}|undefined {
  const normals:Point[]=[];let epsilon=DISTANCE_EPSILON;
  for(let i=0;i<verts.length;i++){
    const a=verts[i],edge=sub(verts[(i+1)%verts.length],a),inward=cross(normal,edge);
    const edgeLength=length(edge),projectedLength=length(inward);
    if(!Number.isFinite(edgeLength)||!Number.isFinite(projectedLength)
      ||projectedLength<=1e-8||projectedLength<edgeLength*.999999)return;
    const unit=inward.map(v=>v/projectedLength) as Point;
    // A non-convex/uncertain contour cannot safely use adjacent intersections.
    if(verts.some(p=>dot(unit,sub(p,a))< -128*Number.EPSILON*scale))return;
    normals.push(unit);
    // The exact tracer uses 3-D edge length, not projected edge length.
    epsilon=Math.max(epsilon,DISTANCE_EPSILON*edgeLength/projectedLength);
  }
  return {normals,epsilon};
}
function expandedVertices(verts:readonly Vec3Tuple[],normal:Point,normals:Point[],epsilon:number,
  scale:number):Point[]|undefined {
  const out:Point[]=[];
  for(let i=0;i<verts.length;i++){
    const a=verts[i],u=normals[(i+verts.length-1)%verts.length],v=normals[i];
    const denominator=1+dot(u,v);
    // Acute/sliver corners amplify normal roundoff. Falling back is exact and
    // preferable to guessing an undersized box or imposing a geometry limit.
    if(!Number.isFinite(denominator)||denominator<=1e-6)return;
    const height=dot(normal,sub(a,verts[0]));
    if(!Number.isFinite(height)||Math.abs(height)>128*Number.EPSILON*scale)return;
    out.push(a.map((q,k)=>q-normal[k]*height-epsilon*(u[k]+v[k])/denominator) as Point);
  }
  return out;
}
/** Bounds the CLOSED tolerance-expanded polygon, a superset of any openEdges
 * variant. Inward unit edge normals u/v yield corner displacement
 * -epsilon*(u+v)/(1+u·v). Merely padding original vertices by epsilon would
 * incorrectly reject accepted points beyond acute corners. */
export function convexArmorTraceBounds(verts:readonly Vec3Tuple[]):Bounds|undefined {
  const normal=planeNormal(verts);
  if(!normal)return;
  const scale=Math.max(1,...verts.flatMap(p=>p.map(Math.abs)));
  const edges=projectedEdges(verts,normal,scale);
  if(!edges)return;
  const expanded=expandedVertices(verts,normal,edges.normals,edges.epsilon,scale);
  if(!expanded)return;
  // Conservative floating-point allowance after the conditioning checks above.
  // It is acceleration-only: the unchanged exact halfplanes reject extra air.
  const padding=1e-9*scale;
  const min=[0,1,2].map(k=>Math.min(...expanded.map(p=>p[k]),...verts.map(p=>p[k]))-padding) as Point;
  const max=[0,1,2].map(k=>Math.max(...expanded.map(p=>p[k]),...verts.map(p=>p[k]))+padding) as Point;
  if([...min,...max].some(v=>!Number.isFinite(v)))return;
  return {min,max};
}
