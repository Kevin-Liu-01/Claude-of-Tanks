// First-party rack collision, expressed by the same sparse manufacturing
// dimensions as the independently authored native rack. No source mesh,
// renderer, profile factory or sampled triangle payload enters spec boot.
import type { ArmorEnvelope, ArmorPlate } from './specHelpers.ts';
import { ABRAMS_SOURCE_X_FRAME } from './abramsSourceXDatums.ts';

type V2 = readonly [number, number];
type V3 = readonly [number, number, number];
interface StockFace { stock: string; verts: V3[]; excludedEdges?:number[] }
interface Section { z: number; ring: readonly V2[] }
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V3,b:V3):number=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function normal(verts:readonly V3[]):V3{
  const a=sub(verts[1],verts[0]),b=sub(verts[2],verts[0]);
  const n:V3=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const length=Math.hypot(...n);return[n[0]/length,n[1]/length,n[2]/length];
}
const cross2 = (a: V2, b: V2, c: V2): number =>
  (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function ccw(points: readonly V2[]): V2[] {
  const area=points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a[0]*b[1]-a[1]*b[0];},0);
  return area>0?[...points]:[...points].reverse();
}

/** Ear clipping only constructs native cap topology from a sparse authored
 * section; it never convexifies a concave hook, U frame, or folded sheet. */
function capTriangles(ring: readonly V2[]): number[][] {
  const remaining=ring.map((_,i)=>i),out:number[][]=[];
  while(remaining.length>3){
    let found=false;
    for(let j=0;j<remaining.length;j++){
      const a=remaining[(j+remaining.length-1)%remaining.length],b=remaining[j],c=remaining[(j+1)%remaining.length];
      if(cross2(ring[a],ring[b],ring[c])<=1e-14)continue;
      const occupied=remaining.some(i=>i!==a&&i!==b&&i!==c
        &&cross2(ring[a],ring[b],ring[i])>=-1e-14
        &&cross2(ring[b],ring[c],ring[i])>=-1e-14
        &&cross2(ring[c],ring[a],ring[i])>=-1e-14);
      if(occupied)continue;
      out.push([a,b,c]);remaining.splice(j,1);found=true;break;
    }
    if(!found)throw new Error('Rack cap is not a simple finite authored section');
  }
  out.push(remaining);return out;
}

function loft(out: StockFace[],stock: string,sections: readonly Section[],map: (p: V3)=>V3): void {
  const point=(s:number,i:number):V3=>map([...sections[s].ring[i],sections[s].z]);
  for(let s=0;s<sections.length-1;s++)for(let i=0;i<sections[s].ring.length;i++){
    const j=(i+1)%sections[s].ring.length;
    // Native ruled faces can be non-planar at tapered stations. Preserve the
    // authored diagonal rather than pretending each such face is a plane.
    const p=[point(s,i),point(s,j),point(s+1,j),point(s+1,i)],n=normal(p);
    if(Math.abs(dot(n,sub(p[3],p[0])))<1e-12)out.push({stock,verts:p});
    else out.push({stock,verts:p.slice(0,3)},{stock,verts:[p[0],p[2],p[3]]});
  }
  for(const s of[0,sections.length-1])for(const tri of capTriangles(sections[s].ring)){
    const indices=s===0?[...tri].reverse():tri;
    out.push({stock,verts:indices.map(i=>point(s,i))});
  }
}
function extrudeYZ(out: StockFace[],stock:string,left:number,right:number,yz:readonly V2[]):void{
  const ring=ccw(yz.map(([y,z])=>[-z,y]));
  loft(out,stock,[{z:left,ring},{z:right,ring}],([a,b,c])=>[c,b,-a]);
}
function box(out:StockFace[],stock:string,min:V3,max:V3):void{
  const [x,y,z]=min,[a,b,c]=max;
  const p:V3[]=[[x,y,z],[a,y,z],[a,b,z],[x,b,z],[x,y,c],[a,y,c],[a,b,c],[x,b,c]];
  for(const row of[[3,2,1,0],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[3,0,4,7]])
    out.push({stock,verts:row.map(i=>p[i])});
}
function round(out:StockFace[],stock:string,a:V3,b:V3,r:number,n=8):void{
  const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta);
  const [dx,dy,dz]=delta.map(v=>v/length),denom=1+dy;
  const u:V3=denom<1e-12?[1,0,0]:[1-dx*dx/denom,-dx,-dx*dz/denom];
  const v:V3=denom<1e-12?[0,0,-1]:[-dx*dz/denom,-dz,1-dz*dz/denom];
  const rings=[a,b].map(p=>Array.from({length:n},(_,i):V3=>{
    const s=r*Math.sin(i*2*Math.PI/n),c=r*Math.cos(i*2*Math.PI/n);
    return[p[0]+s*u[0]+c*v[0],p[1]+s*u[1]+c*v[1],p[2]+s*u[2]+c*v[2]];
  }));
  for(let i=0;i<n;i++){const j=(i+1)%n;out.push({stock,verts:[rings[0][i],rings[0][j],rings[1][j],rings[1][i]]});}
  out.push({stock,verts:[...rings[0]].reverse()},{stock,verts:rings[1]});
}
function uPath(left:number,right:number,rear:number,r:number,front:number):V2[]{
  const points:V2[]=[[left,-front],[left,-rear-r]];
  for(let i=1;i<=8;i++){const a=Math.PI-i*Math.PI/16;points.push([left+r+r*Math.cos(a),-rear-r+r*Math.sin(a)]);}
  points.push([right-r,-rear]);
  for(let i=1;i<=8;i++){const a=Math.PI/2-i*Math.PI/16;points.push([right-r+r*Math.cos(a),-rear-r+r*Math.sin(a)]);}
  points.push([right,-front]);return points;
}
function mainCourses(out:StockFace[]):void{
  const left=-1.5498,right=1.4209,rear=-2.7842,front=-2.2914,r=.19213;
  for(const[k,y]of[1.910915,2.029575,2.159575,2.28926].entries()){
    const p:V3[]=[[left,y,front],[left,y,rear+r]];
    for(let i=1;i<=4;i++){const a=Math.PI+i*Math.PI/8;p.push([left+r+r*Math.cos(a),y,rear+r+r*Math.sin(a)]);}
    p.push([right-r,y,rear]);
    for(let i=1;i<=4;i++){const a=-Math.PI/2+i*Math.PI/8;p.push([right-r+r*Math.cos(a),y,rear+r+r*Math.sin(a)]);}
    p.push([right,y,front]);
    for(let i=1;i<p.length;i++)round(out,`BasketCourse${k}_${i}`,p[i-1],p[i],.0103,12);
  }
}
function mainFrames(out:StockFace[]):void{
  const rows=[
    {name:'MainLowerStrip',outer:uPath(-1.56495,1.436,-2.799245,.20625,-2.291675),inner:uPath(-1.55997,1.43102,-2.794265,.20127,-2.291675),lo:1.912785,hi:2.028185},
    {name:'MainFloorFrame',outer:uPath(-1.54723,1.40885,-2.789785,.196,-2.291195),inner:uPath(-1.52672,1.38834,-2.769275,.17549,-2.311765),lo:1.91861,hi:1.92481},
  ];
  for(const row of rows){const ring=ccw([...row.outer,...row.inner.reverse()]);
    loft(out,row.name,[{z:row.lo,ring},{z:row.hi,ring}],([x,y,z])=>[x,z,-y]);}
  round(out,'MainFloorCrossRear',[-1.5267,1.910915,-2.615765],[1.39842,1.910915,-2.615765],.01033);
  round(out,'MainFloorCrossFore',[-1.09568,1.910915,-2.451645],[.958167,1.910915,-2.451645],.01033);
}
function mainRibs(out:StockFace[]):void{
  const rear:V2[]=[[1.859015,-2.736985],[1.861495,-2.760775],[1.873165,-2.781165],[1.892575,-2.794155],
    [1.914675,-2.795725],[2.310315,-2.795485],[2.318705,-2.790505],[2.320525,-2.779825],
    [2.313965,-2.768905],[2.299225,-2.763205],[1.926135,-2.735285],[1.922045,-2.733225],[1.920005,-2.729095]];
  const center:V2[]=[[1.919935,-2.211325],[1.914235,-2.190455],[1.898915,-2.175165],[1.877985,-2.169575],
    [1.857115,-2.175285],[1.841795,-2.190575],[1.836255,-2.211455]];
  const outer:V2[]=[[1.919935,-2.273475],[1.901915,-2.273475],[1.884765,-2.282815],[1.869515,-2.298235],[1.860175,-2.315345]];
  for(const[name,x]of[['Center',-.068828],['Left',-.585513],['Right',.447697]] as const)
    extrudeYZ(out,`MainReceiving${name}`,x-.00688,x+.00688,[...rear,...(name==='Center'?center:outer)]);
}
function upright(out:StockFace[],name:string,left:number,right:number,mirrored=false):void{
  const ring=(rear:number):V2[]=>ccw([[2.796095,1.888705],[2.796095,2.289595],[2.797185,2.293465],
    [2.801065,2.295065],[-rear,2.295065],[-rear,2.288105],[2.803495,2.288105],[2.803495,1.888705]]);
  const sections=mirrored?[{z:left,ring:ring(-2.808105)},{z:left+.01653,ring:ring(-2.826925)},{z:right,ring:ring(-2.826925)}]
    :[{z:left,ring:ring(-2.826925)},{z:right-.01653,ring:ring(-2.826925)},{z:right,ring:ring(-2.808105)}];
  loft(out,name,sections,([a,b,c])=>[c,b,-a]);
}
function receiver(out:StockFace[],name:string,x:number):void{
  const sections=[[-.01311,-2.815875],[-.01166,-2.809205],[-.0073,-2.805195],[0,-2.803855],
    [.0073,-2.805195],[.01166,-2.809205],[.01311,-2.815875]].map(([dx,tip])=>({z:x+dx,ring:ccw([
      [2.840395,2.062985],[2.847185,2.062985],[2.847185,2.277545],[2.845615,2.282795],
      [2.840395,2.284475],[-tip,2.284475],[-tip,2.277545],[2.840395,2.277545]])}));
  loft(out,name,sections,([a,b,c])=>[c,b,-a]);
}
function extendedRails(out:StockFace[]):void{
  box(out,'ExtensionRearSill',[-1.10333,1.886655,-3.306815],[.964417,1.931675,-3.301355]);
  box(out,'ExtensionRearBand',[-1.1089,1.930065,-3.311305],[.970056,1.992515,-3.306335]);
  for(const[i,x]of[-1.1008,.96195].entries()){
    box(out,`ExtensionSideSill${i}`,[x-.00265,1.886655,-3.306815],[x+.00265,1.931675,-2.800945]);
    box(out,`ExtensionRearStile${i}`,[x-.00265,1.930,-3.306815],[x+.00265,2.299885,-3.264095]);
    upright(out,`ExtensionForeStile${i}`,i===0?-1.12006:.942906,i===0?-1.08189:.981017,i===1);
    receiver(out,`ExtensionForeReceiver${i}`,i===0?-1.10097:.961997);
    for(const[j,y]of[2.076225,2.175815,2.267295].entries())round(out,`ExtensionSideCourse${i}_${j}`,[x,y,-3.285],[x,y,-2.844],.01295);
  }
  upright(out,'ExtensionForeCenterStile',-.088414,-.050303);
  for(const[i,[x,y0,y1]]of[[-1.100375,2.197295,2.288125],[-.069724,2.197305,2.288135],[.961396,2.197305,2.288135]].entries())
    round(out,`ExtensionForePin${i}`,[x,y0,-2.813995],[x,y1,-2.813995],.00516,6);
  for(const[i,y]of[2.07619,2.17567,2.26730].entries())round(out,`ExtensionRearCourse${i}`,[-1.1008,y,-3.284855],[.96195,y,-3.284855],.013);
  round(out,'ExtensionFloorCross',[-1.05885,1.90274,-3.12203],[.920277,1.90274,-3.12203],.01295);
  for(const[i,x0]of[-1.06489,-.031653].entries()){
    const x1=x0+.957567;
    box(out,`ExtensionInnerFore${i}`,[x0+.0237,1.88819,-2.803375],[x1-.0237,1.917445,-2.797305]);
    for(const[j,x]of[x0,x1-.0061].entries())box(out,`ExtensionInnerSide${i}_${j}`,[x,1.88819,-3.136415],[x+.0061,1.917445,-2.797305]);
  }
}
function extendedScreen(out:StockFace[]):void{
  const folds=[
    [1.827235,-3.320975,1.928425,-3.343915,1.931195,-3.318665],
    [1.929375,-3.319155,2.034725,-3.341725,2.037645,-3.316485],
    [2.033705,-3.317085,2.139855,-3.339665,2.142765,-3.314415],
    [2.139345,-3.315025,2.245055,-3.337605,2.247895,-3.312355],
    [2.244545,-3.312965,2.350185,-3.335535,2.353025,-3.310295],
  ];
  for(const[i,[a,b,c,d,e,f]]of folds.entries())extrudeYZ(out,`AftScreenFold${i}`,-.440649,.329981,[[a,b],[c,d],[e,f],[e,f+.0025],[c,d+.0025],[a,b+.0025]]);
  extrudeYZ(out,'AftScreenBacking',-.445899,.335291,[[1.824465,-3.346465],[1.823955,-3.321335],
    [2.458735,-3.308955],[2.458595,-3.303495],[1.814985,-3.316115],[1.815635,-3.351195],[1.833365,-3.350955],[1.833295,-3.346465]]);
  const profile:V2[]=[[1.987225,-3.314295],[1.987155,-3.309685],[2.259495,-3.304345],[2.269495,-3.299615],
    [2.272775,-3.289175],[2.267305,-3.279585],[2.256575,-3.277275],[2.255705,-3.272665],
    [2.270075,-3.275945],[2.277445,-3.288685],[2.272995,-3.302765],[2.259575,-3.308955]];
  for(const[i,[left,right]]of[[-.368759,-.332779],[-.073629,-.037649],[.221511,.257561]].entries())
    extrudeYZ(out,`AftScreenReceiver${i}`,left,right,profile);
}

interface Plane { n:V3; d:number }
function clipped(points:readonly V3[],plane:Plane,inside:boolean):V3[]{
  const out:V3[]=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=dot(plane.n,a)-plane.d,db=dot(plane.n,b)-plane.d;
    const keepA=inside?da<=0:da>=0,keepB=inside?db<=0:db>=0;
    if(keepA)out.push(a);
    if(keepA!==keepB){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),a[2]+t*(b[2]-a[2])]);}
  }
  return out.filter((p,i)=>Math.hypot(...sub(p,out[(i+1)%out.length]))>1e-12);
}
function area(points:readonly V3[]):number{
  if(points.length<3)return 0;
  let sum=0;
  for(let i=1;i<points.length-1;i++){
    const a=sub(points[i],points[0]),b=sub(points[i+1],points[0]);
    sum+=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2;
  }return sum;
}
function subtractInterior(points:V3[],planes:readonly Plane[]):V3[][]{
  const outside:V3[][]=[];let remaining=points;
  for(const plane of planes){
    const distances=remaining.map(p=>dot(plane.n,p)-plane.d);
    if(distances.every(d=>d>=-1e-12))return[points];
  }
  for(const plane of planes){
    const piece=clipped(remaining,plane,false);
    if(area(piece)>1e-14)outside.push(piece);
    remaining=clipped(remaining,plane,true);
    if(area(remaining)<=1e-14)break;
  }
  return outside;
}
function convexHull(points:readonly V3[],n:V3):V3[]{
  const drop=Math.abs(n[0])>Math.abs(n[1])?(Math.abs(n[0])>Math.abs(n[2])?0:2):(Math.abs(n[1])>Math.abs(n[2])?1:2);
  const axes=[0,1,2].filter(i=>i!==drop),project=(p:V3):V2=>[p[axes[0]],p[axes[1]]];
  const sorted=[...points].sort((a,b)=>a[axes[0]]-b[axes[0]]||a[axes[1]]-b[axes[1]])
    .filter((p,i,a)=>!i||Math.hypot(...sub(p,a[i-1]))>1e-11);
  const chain=(rows:readonly V3[]):V3[]=>{
    const out:V3[]=[];
    for(const p of rows){while(out.length>1&&cross2(project(out[out.length-2]),project(out[out.length-1]),project(p))<=1e-14)out.pop();out.push(p);}
    return out;
  };
  const a=chain(sorted),b=chain([...sorted].reverse());a.pop();b.pop();const hull=[...a,...b];
  return hull.length>=3&&dot(normal(hull),n)<0?hull.reverse():hull;
}
function mergePlanarFragments(fragments:V3[][],n:V3):V3[][]{
  let changed=true;
  while(changed){changed=false;
    outer:for(let i=0;i<fragments.length;i++)for(let j=i+1;j<fragments.length;j++){
      const hull=convexHull([...fragments[i],...fragments[j]],n);
      if(Math.abs(area(hull)-area(fragments[i])-area(fragments[j]))>1e-13)continue;
      fragments[i]=hull;fragments.splice(j,1);changed=true;break outer;
    }
  }
  return fragments;
}
function interiorCutEdges(points:V3[],adjacent:readonly Plane[][]):number[]{
  const edges:number[]=[];
  for(let i=0;i<points.length;i++){
    const endpoints=[points[i],points[(i+1)%points.length]];
    const covered=adjacent.some(planes=>endpoints.every(p=>planes.every(plane=>dot(plane.n,p)-plane.d<=1e-11)));
    if(covered)edges.push(i);
  }
  return edges;
}
/** Only adjacent pieces of one continuous U course overlap. Remove their
 * hidden caps/lateral portions at boot, leaving the exact occupied union's
 * exposed faces. Real separate-depth rail crossings remain separate armor. */
function exposedCourses(faces:StockFace[]):StockFace[]{
  const rods=new Map<string,Plane[]>();
  for(const face of faces)if(face.stock.startsWith('BasketCourse')){
    const n=normal(face.verts),p={n,d:dot(n,face.verts[0])};
    const planes=rods.get(face.stock)??[];planes.push(p);rods.set(face.stock,planes);
  }
  return faces.flatMap(face=>{
    if(!rods.has(face.stock))return[face];
    const [course,indexText]=face.stock.split('_'),index=Number(indexText);
    let fragments=[face.verts];
    const neighbors=[index-1,index+1].map(i=>rods.get(`${course}_${i}`)).filter((p):p is Plane[]=>!!p);
    for(const planes of neighbors){
      fragments=fragments.flatMap(points=>subtractInterior(points,planes));
    }
    const n=normal(face.verts);
    return mergePlanarFragments(fragments,n).map(verts=>({stock:face.stock,verts,excludedEdges:interiorCutEdges(verts,neighbors)}));
  });
}
const faceCache=new Map<boolean,StockFace[]>();
function copyFaces(faces:readonly StockFace[]):StockFace[]{
  return faces.map(face=>({...face,verts:face.verts.map(p=>[...p]),excludedEdges:face.excludedEdges?[...face.excludedEdges]:undefined}));
}
export function abramsSourceXRackStockFaces(extended:boolean):StockFace[]{
  const cached=faceCache.get(extended);if(cached)return copyFaces(cached);
  const out:StockFace[]=[];
  mainCourses(out);mainFrames(out);mainRibs(out);
  if(extended){extendedRails(out);extendedScreen(out);}
  const exposed=exposedCourses(out);faceCache.set(extended,exposed);return copyFaces(exposed);
}

/** Replace only the inherited exterior rack plane, retaining its protection
 * values and permanent turret frame. Different depths remain separate hits;
 * only coincident triangles of the same actual stock share a seam group. */
export function applyAbramsSourceXRackArmor(armor:ArmorEnvelope,options:{extended:boolean}):void{
  const donors=armor.turretPlates.filter(p=>p.name==='bustle_rack');
  if(donors.length!==1||donors[0].kind!=='external'||donors[0].gunFollow||donors[0].era)
    throw new Error('Abrams rack requires exactly one permanent donor exterior plate');
  const donor=donors[0],pivot=ABRAMS_SOURCE_X_FRAME.turret;
  const replacements=abramsSourceXRackStockFaces(options.extended).map((face,i):ArmorPlate=>({
    ...donor,name:`bustle_rack_${face.stock}_${i}`,convexPolygon:true,
    surfaceGroup:`abrams_source_rack:${face.stock.replace(/^(BasketCourse\d+)_\d+$/,'$1')}`,
    excludedEdges:face.excludedEdges ?? [],
    traceBounds:{
      min:[0,1,2].map(axis=>Math.min(...face.verts.map(v=>v[axis]))-pivot[axis]-1e-7) as [number,number,number],
      max:[0,1,2].map(axis=>Math.max(...face.verts.map(v=>v[axis]))-pivot[axis]+1e-7) as [number,number,number],
    },
    verts:face.verts.map(v=>[v[0]-pivot[0],v[1]-pivot[1],v[2]-pivot[2]]),
  }));
  armor.turretPlates=armor.turretPlates.flatMap(p=>p===donor?replacements:[p]);
}

