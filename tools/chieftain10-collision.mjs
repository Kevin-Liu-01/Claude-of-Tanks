// Offline calibration of the Mk5-derived Mk10's independently closed stocks.
// Only first-party emitted geometry is read. No source model or live render
// buffer is changed, and disconnected cheeks never share a convex hull.
import * as THREE from 'three';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {registerProfiledBuilders} from '../src/vehicles/tankFactoryCore.ts';
import {buildChieftainMk10X} from '../src/vehicles/profiles/chieftain10X.ts';
import {KIT} from '../src/vehicles/profiles/kit.ts';

const ID='chieftain_mk10_x';
const key=p=>p.join(',');
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const average=points=>[0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length);
const unique=points=>[...new Map(points.map(p=>[key(p),p])).values()];

function bounds(vertices) {
  return {min:[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),
    max:[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])))};
}
function indexedHull(points,sourceStock) {
  const vertices=unique(points),hull=new ConvexHull().setFromPoints(vertices.map(p=>new THREE.Vector3(...p)));
  const mapped=[],indices=new Map(),faces=[];
  for(const face of hull.faces){
    const ring=[];let edge=face.edge;
    do {const p=edge.head().point.toArray(),k=key(p);
      if(!indices.has(k)){indices.set(k,mapped.length);mapped.push(p);}
      ring.push(indices.get(k));edge=edge.next;
    }while(edge!==face.edge);
    if(ring.length!==3)throw Error('Mk10 convex hull returned a non-triangle');
    faces.push(ring);
  }
  if(mapped.length<4||faces.length<4)throw Error('Mk10 stock has no closed volume');
  return {...bounds(mapped),vertices:mapped,faces,interiorPoint:average(mapped),sourceStock};
}
function volume(cell) {
  const c=cell.interiorPoint;
  return cell.faces.reduce((sum,face)=>{
    const [a,b,d]=face.map(i=>sub(cell.vertices[i],c));
    return sum+Math.abs(dot(a,cross(b,d)))/6;
  },0);
}
function plane(triangle) {
  if(triangle.stockPlane)return triangle.stockPlane;
  const[a,b,c]=triangle,n=cross(sub(b,a),sub(c,a)),length=Math.hypot(...n);
  return length>0?{normal:n.map(v=>v/length),point:a}:null;
}
const distance=(p,face)=>dot(sub(p,face.point),face.normal);
function kernelSlice(planes,vertices) {
  const {min,max}=bounds(vertices),z=(min[2]+max[2])/2;
  let ring=[[min[0],min[1],z],[max[0],min[1],z],[max[0],max[1],z],[min[0],max[1],z]];
  for(const face of planes){
    const next=[];
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],da=distance(a,face),db=distance(b,face);
      if(da<=0)next.push(a);
      if((da<0&&db>0)||(da>0&&db<0))next.push(a.map((v,k)=>v+(b[k]-v)*da/(da-db)));
    }
    ring=next;if(!ring.length)return null;
  }
  const p=average(ring);
  return planes.every(face=>distance(p,face)<1e-9)?p:null;
}
function hullEdges(cell) {
  const edges=new Map();
  for(const face of cell.faces)for(let i=0;i<face.length;i++){
    const a=face[i],b=face[(i+1)%face.length];
    edges.set([a,b].sort((x,y)=>x-y).join(','),[cell.vertices[a],cell.vertices[b]]);
  }
  return [...edges.values()];
}
function kernelPolytope(planes,vertices) {
  const {min,max}=bounds(vertices);
  let points=[0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[x?max[0]:min[0],y?max[1]:min[1],z?max[2]:min[2]])));
  for(const face of planes){
    const inside=points.filter(p=>distance(p,face)<=0);
    if(inside.length===points.length)continue;
    if(!inside.length)return null;
    const edges=hullEdges(indexedHull(points,'kernel-only'));
    for(const[a,b]of edges){
      const da=distance(a,face),db=distance(b,face);
      if((da<0&&db>0)||(da>0&&db<0))inside.push(a.map((v,i)=>v+(b[i]-v)*da/(da-db)));
    }
    points=unique(inside);
    if(points.length<4)return null;
  }
  const p=average(points);
  return planes.every(face=>distance(p,face)<1e-9)?p:null;
}
function kernel(triangles) {
  const planes=triangles.map(plane).filter(Boolean),vertices=unique(triangles.flat());
  const sliced=kernelSlice(planes,vertices);if(sliced)return sliced;
  const clipped=kernelPolytope(planes,vertices);if(clipped)return clipped;
  return null;
}
function isConvex(triangles) {
  const vertices=unique(triangles.flat());
  return triangles.map(plane).filter(Boolean).every(face=>vertices.every(p=>distance(p,face)<1e-8));
}

function tetrahedra(triangles,stock,center) {
  const out=[];
  for(const triangle of triangles){
    const[a,b,c]=triangle;
    if(Math.abs(dot(sub(a,center),cross(sub(b,center),sub(c,center))))<1e-18)continue;
    const cell=indexedHull([center,...triangle],stock);
    out.push({cell,volume:volume(cell),members:new Set([out.length])});
  }
  return out;
}
function adjacency(parts) {
  const faceOwners=new Map(),neighbors=parts.map(()=>new Set());
  for(let i=0;i<parts.length;i++)for(const face of parts[i].cell.faces){
    const k=face.map(j=>key(parts[i].cell.vertices[j])).sort().join('|');
    const other=faceOwners.get(k);
    if(other!==undefined){neighbors[i].add(other);neighbors[other].add(i);}
    else faceOwners.set(k,i);
  }
  return neighbors;
}
function mergeCandidate(a,b,stock) {
  const cell=indexedHull([...a.cell.vertices,...b.cell.vertices],stock);
  const sum=a.volume+b.volume,error=Math.abs(volume(cell)-sum);
  // Floating arithmetic only: 1e-13 m³ absolute / 1e-10 relative. No face
  // displacement, stock-size threshold, contour quantization or hole filling.
  if(error>Math.max(1e-13,sum*1e-10))return null;
  return {cell,volume:sum,members:new Set([...a.members,...b.members])};
}
function nextMerge(current,neighbors,owners,stock) {
  for(const[i,a]of current){
    const candidates=new Set([...a.members].flatMap(m=>[...neighbors[m]].map(n=>owners[n])));
    for(const j of candidates){
      if(j===i||!current.has(j))continue;
      const merged=mergeCandidate(a,current.get(j),stock);
      if(merged)return[i,j,merged];
    }
  }
  return null;
}
function coalesce(parts,stock) {
  const neighbors=adjacency(parts),owners=parts.map((_,i)=>i),current=new Map(parts.map((p,i)=>[i,p]));
  for(let match=nextMerge(current,neighbors,owners,stock);match;match=nextMerge(current,neighbors,owners,stock)){
    const[i,j,merged]=match;
    current.set(i,merged);current.delete(j);
    for(const member of merged.members)owners[member]=i;
  }
  return [...current.values()].map(p=>p.cell);
}
function touchingBounds(a,b) {
  return a.min.every((v,i)=>v<=b.max[i]+1e-12&&a.max[i]>=b.min[i]-1e-12);
}
function spatialMerge(parts,stock) {
  for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
    if(!touchingBounds(parts[i].cell,parts[j].cell))continue;
    const merged=mergeCandidate(parts[i],parts[j],stock);
    if(merged)return[i,j,merged];
  }
  return null;
}
function coalescePartitions(cells,stock) {
  const parts=cells.map((cell,i)=>({cell,volume:volume(cell),members:new Set([i])}));
  for(let match=spatialMerge(parts,stock);match;match=spatialMerge(parts,stock)){
    const[i,j,merged]=match;parts[i]=merged;parts.splice(j,1);
  }
  return parts.map(p=>p.cell);
}

function edgeIntersection(a,b,face) {
  // The same undirected mesh edge always computes the same intersection.
  // This is arithmetic canonicalization, never a coordinate grid/quantum.
  if(key(a)>key(b))[a,b]=[b,a];
  const da=distance(a,face),db=distance(b,face),t=da/(da-db);
  return a.map((v,i)=>v+(b[i]-v)*t);
}
function clippedTriangle(triangle,face,side) {
  const ds=triangle.map(p=>distance(p,face)*side),out=[];
  if(ds.every(d=>Math.abs(d)<1e-12)){
    const normal=plane(triangle)?.normal;
    return normal&&dot(normal,face.normal)*side>0?[triangle]:[];
  }
  for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],da=ds[i],db=ds[(i+1)%3];
    if(da<=1e-12)out.push(a);
    if((da< -1e-12&&db>1e-12)||(da>1e-12&&db< -1e-12))out.push(edgeIntersection(a,b,face));
  }
  const ring=unique(out),triangles=[];
  for(let i=1;i<ring.length-1;i++){
    const tri=[ring[0],ring[i],ring[i+1]];
    if(plane(tri)){tri.stockPlane=plane(triangle);triangles.push(tri);}
  }
  return triangles;
}
function boundaryEdges(triangles,face) {
  const edges=new Map();
  for(const triangle of triangles)for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],k=[key(a),key(b)].sort().join('|');
    if(edges.has(k))edges.delete(k);else edges.set(k,[a,b]);
  }
  for(const[a,b]of edges.values())if(Math.abs(distance(a,face))>1e-9||Math.abs(distance(b,face))>1e-9)
    throw Error(`Mk10 stock partition has a non-cap open edge ${JSON.stringify({a,b,distances:[distance(a,face),distance(b,face)]})}`);
  return [...edges.values()];
}
function boundaryLoops(edges) {
  const next=new Map();
  for(const[a,b]of edges){
    if(next.has(key(a)))throw Error('Mk10 stock partition has a branching cap boundary');
    next.set(key(a),[a,b]);
  }
  const loops=[];
  while(next.size){
    const first=next.values().next().value[0],loop=[];let p=first;
    do{
      const edge=next.get(key(p));if(!edge)throw Error('Mk10 stock partition cap does not close');
      loop.push(p);next.delete(key(p));p=edge[1];
    }while(key(p)!==key(first));
    loops.push(loop);
  }
  return loops;
}
function projectedRing(ring,normal) {
  const dropped=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  return ring.map(p=>new THREE.Vector2(...p.filter((_,i)=>i!==dropped)));
}
function contains2D(ring,p) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function conformCap(triangles,ring) {
  for(const p of ring){
    if(triangles.some(t=>t.some(v=>key(v)===key(p))))continue;
    let replaced=false;
    for(let i=0;i<triangles.length&&!replaced;i++)for(let e=0;e<3&&!replaced;e++){
      const t=triangles[i],a=t[e],b=t[(e+1)%3],c=t[(e+2)%3],ab=sub(b,a),ap=sub(p,a);
      const along=dot(ab,ap)/dot(ab,ab);
      if(along<=0||along>=1||Math.hypot(...cross(ab,ap))/Math.hypot(...ab)>1e-10)continue;
      const first=[a,p,c],second=[p,b,c];first.stockPlane=plane(t);second.stockPlane=plane(t);
      triangles.splice(i,1,first,second);replaced=true;
    }
    if(!replaced)throw Error(`Mk10 stock partition lost a cap boundary vertex ${JSON.stringify({p,ring,triangles})}`);
  }
  return triangles;
}
function closePartition(triangles,face,side) {
  const loops=boundaryLoops(boundaryEdges(triangles,face)),projected=loops.map(r=>projectedRing(r,face.normal));
  for(let i=0;i<loops.length;i++)for(let j=0;j<loops.length;j++)
    if(i!==j&&contains2D(projected[i],projected[j][0]))throw Error('Mk10 stock partition cap unexpectedly has nested holes');
  for(let i=0;i<loops.length;i++){
    const ring=loops[i];let caps=THREE.ShapeUtils.triangulateShape(projected[i],[]).map(t=>t.map(j=>ring[j]));
    caps=conformCap(caps,ring).map(t=>{
      const oriented=dot(plane(t).normal,face.normal)*side>0?t:[...t].reverse();
      oriented.stockPlane={normal:face.normal.map(v=>v*side),point:face.point};return oriented;
    });
    triangles.push(...caps);
  }
  return triangles;
}
function signedVolume(triangles) {
  const center=average(unique(triangles.flat()));
  return triangles.reduce((sum,[a,b,c])=>sum+dot(sub(a,center),cross(sub(b,center),sub(c,center)))/6,0);
}
function partition(triangles,face) {
  const parts=[1,-1].map(side=>closePartition(triangles.flatMap(t=>clippedTriangle(t,face,side)),face,side));
  const original=signedVolume(triangles),sum=parts.reduce((n,p)=>n+signedVolume(p),0);
  if(parts.some(p=>signedVolume(p)<=0)||Math.abs(original-sum)>Math.max(1e-12,Math.abs(original)*1e-10))
    throw Error(`Mk10 stock partition did not preserve signed occupied volume ${JSON.stringify({original,parts:parts.map(signedVolume),error:original-sum})}`);
  return parts;
}
function reflexPlane(triangles) {
  const points=unique(triangles.flat()),center=average(points);
  return triangles.map(plane).filter(Boolean)
    .filter(face=>points.some(p=>distance(p,face)>1e-8))
    .sort((a,b)=>distance(center,b)-distance(center,a))[0];
}
function decompose(triangles,stock,depth=0) {
  if(depth>24)throw Error('Mk10 exact stock partition recursion budget exceeded');
  if(isConvex(triangles))return[indexedHull(triangles.flat(),stock)];
  const center=kernel(triangles);
  if(center)return coalesce(tetrahedra(triangles,stock,center),stock);
  const face=reflexPlane(triangles);if(!face)throw Error('Mk10 non-convex stock has no reflex support plane');
  const cells=partition(triangles,face).flatMap(part=>decompose(part,stock,depth+1));
  if(cells.length>512)throw Error('Mk10 exact stock partition cell budget exceeded');
  return coalescePartitions(cells,stock);
}

function pointAt(position,index) {
  return [position.getX(index),position.getY(index),position.getZ(index)];
}
function quadAt(position,index) {
  const q=Array.from({length:6},(_,i)=>pointAt(position,index+i));
  if(key(q[0])!==key(q[3])||key(q[2])!==key(q[4]))return null;
  if(q[0][2]!==q[1][2]||q[2][2]!==q[5][2]||q[2][2]<=q[0][2])return null;
  return q;
}
function cap(ring,forward) {
  const triangles=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  if(triangles.length!==ring.length-2)throw Error('Mk10 station cap is not triangulatable');
  return triangles.map(indices=>(forward?indices:[...indices].reverse()).map(i=>ring[i]));
}
function loftSlabs(geometry) {
  if(geometry.index)throw Error('Mk10 section stock unexpectedly indexed');
  const position=geometry.attributes.position,slabs=[];let cursor=0;
  while(cursor+5<position.count){
    const first=quadAt(position,cursor);if(!first)break;
    const low=[],high=[],sides=[],z0=first[0][2],z1=first[2][2];
    for(;cursor+5<position.count;cursor+=6){
      const q=quadAt(position,cursor);
      if(!q||q[0][2]!==z0||q[2][2]!==z1)break;
      low.push(q[0]);high.push(q[5]);sides.push(q.slice(0,3),q.slice(3,6));
    }
    if(low.length<3)throw Error('Mk10 station has no closed contour');
    slabs.push([...sides,...cap(low,false),...cap(high,true)]);
  }
  if(!slabs.length)throw Error('Mk10 stock is neither an authored longitudinal loft nor convex cylinder');
  const z0=slabs[0][0][0][2],last=slabs.at(-1),z1=last[0][2][2];
  for(;cursor<position.count;cursor+=3){
    const triangle=[0,1,2].map(i=>pointAt(position,cursor+i));
    if(!triangle.every(p=>p[2]===z0)&&!triangle.every(p=>p[2]===z1))
      throw Error('Mk10 loft contains unrecognized non-cap geometry');
  }
  return slabs;
}
export function chieftain10StockCells(stock) {
  const geometry=stock.geometry,p=geometry.attributes.position;
  if(geometry.type==='CylinderGeometry')return[indexedHull(
    Array.from({length:p.count},(_,i)=>pointAt(p,i)),stock.name)];
  return loftSlabs(geometry).flatMap((triangles,index)=>{
    const name=`${stock.name}/station-${index}`;
    try {
      const cells=decompose(triangles,name);
      return cells.map(cell=>({...cell,sourceStock:stock.name,sourceStation:index}));
    } catch(error) { throw new Error(`${name}: ${error.message}`,{cause:error}); }
  });
}

/** createCallback is synchronous and constructs ONLY chieftain_mk10_x.
 * Import this module after enabling the generator's authoring-measurement
 * context. The returned stocks are private inspection clones; dispose owns
 * those clones and the actual tank, never a renderer-global resource. */
export function captureChieftain10Collision(createCallback) {
  const stocks=[];let tank;
  registerProfiledBuilders({[ID]:p=>buildChieftainMk10X(new Proxy(p,{
    get(target,method){
      if(method!=='add')return Reflect.get(target,method);
      return(bucket,geometry,...args)=>{
        if(bucket==='turret')stocks.push({name:geometry.userData.chieftain10Stillbrew
          ??geometry.userData.chieftain10Foundation??`structural-${stocks.length}`,
        geometry:KIT.xform(geometry.clone(),...args)});
        return target.add(bucket,geometry,...args);
      };
    },
  }))});
  try {tank=createCallback();}
  catch(error){stocks.forEach(s=>s.geometry.dispose());throw error;}
  finally {registerProfiledBuilders({[ID]:buildChieftainMk10X});}
  try {
    if(!tank?.root||!stocks.length)throw Error('Mk10 collision capture received no authored tank');
    const turretCollision=stocks.flatMap(chieftain10StockCells);
    return {tank,turretCollision,stocks,dispose(){tank.dispose();stocks.forEach(s=>s.geometry.dispose());}};
  }catch(error){tank?.dispose();stocks.forEach(s=>s.geometry.dispose());throw error;}
}
