// Offline conservative added-stock audit. No renderer/material-side authority.
import * as T from 'three';
const EPS=1e-9;
const faces=[[0,1,2],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]];
/** Full triangle clipping, not sparse barycentric witnesses. Open sheets count.
 * The old end face alone is excluded; all genuinely added volume stays closed. */
function triangleInExtrusion(prism,triangle){
 let polygon=triangle.map(p=>p.clone());
 for(const {normal,constant}of prism.planes){
  const next=[];
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length],da=normal.dot(a)-constant,db=normal.dot(b)-constant;
   if(da<=EPS)next.push(a);
   if((da<0&&db>0)||(da>0&&db<0))next.push(a.clone().lerp(b,da/(da-db)));
  }
  polygon=next;if(!polygon.length)return null;
 }
 const added=polygon.filter(p=>prism.base.normal.dot(p)-prism.base.constant < -EPS);
 if(!added.length)return null;
 return added.reduce((sum,p)=>sum.add(p),new T.Vector3()).multiplyScalar(1/added.length);
}
const topologyCache=new WeakMap();
function triangleEdges(g){
 const p=g.attributes.position,triangles=[],edgeMap=new Map();
 for(let i=0;i<(g.index?.count??p.count);i+=3){
  const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,g.index?g.index.getX(i+k):i+k));
  // Only an exactly zero-area render triangle has no surface. Tiny actual
  // triangles remain in both contact and topology tests; a collapsed weld
  // therefore becomes indeterminate stock instead of disappearing as air.
  if(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq()===0)continue;
  // 1nm weld only repairs floating trigonometric closure (e.g. sin(2pi)).
  // This is three orders narrower than the rejected old 1um weld. Edges,
  // not individual vertices, still determine shell connectivity.
  const id=triangles.length,keys=v.map(x=>x.toArray().map(n=>Math.round(n*1e9)).join(','));triangles.push(v);
  for(let k=0;k<3;k++){const a=keys[k],b=keys[(k+1)%3],key=[a,b].sort().join('|');
  const entries=edgeMap.get(key)||[];entries.push({id,direction:a<b?1:-1,points:[v[k],v[(k+1)%3]]});edgeMap.set(key,entries);}
 }
 return{triangles,edgeMap};
}
function topology(g){
 if(topologyCache.has(g))return topologyCache.get(g);
 const {triangles,edgeMap}=triangleEdges(g);
 const parent=triangles.map((_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 // Never merge shells merely because they share a vertex. An edge with more
 // than two faces is ambiguous, not an excuse to combine parity volumes.
 for(const es of edgeMap.values())if(es.length===2)parent[find(es[0].id)]=find(es[1].id);
 const groups=new Map();
 triangles.forEach((triangle,i)=>{const id=find(i),group=groups.get(id)||{id,triangles:[],closed:true,boundaryExamples:[]};
  group.triangles.push(triangle);groups.set(id,group);});
 for(const es of edgeMap.values())if(es.length!==2||es[0].direction===es[1].direction)
  for(const e of es){const group=groups.get(find(e.id));group.closed=false;
   if(group.boundaryExamples.length<8)group.boundaryExamples.push({faces:es.length,points:e.points});}
 const result=[...groups.values()];topologyCache.set(g,result);return result;
}
function triangleTree(triangles){
 const box=new T.Box3();for(const t of triangles)box.union(t.box);
 if(triangles.length<=16)return{box,triangles};
 const size=box.getSize(new T.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
 triangles.sort((a,b)=>(a.box.min[axis]+a.box.max[axis])-(b.box.min[axis]+b.box.max[axis]));
 const mid=Math.floor(triangles.length/2);
 return{box,left:triangleTree(triangles.slice(0,mid)),right:triangleTree(triangles.slice(mid))};
}
function isPhysicalStock(o){
 if(!o.isMesh||/^gearTrack/.test(o.name)||o.userData.authoredShadowProxy||o.userData.vehicleMarking)return false;
 for(let p=o;p;p=p.parent)if(!p.visible)return false;
 return true;
}
function stockParts(o,world,geometries,index){
 const result=[];
 for(const [emission,geometry]of geometries.entries())for(const part of topology(geometry)){
  const triangles=part.triangles.map(t=>{const points=t.map(v=>v.clone().applyMatrix4(world));
   return{points,box:new T.Box3().setFromPoints(points)};});
  const tree=triangleTree(triangles);
  result.push({name:o.name,index,component:part.id,emission,closed:part.closed,triangles,tree,box:tree.box,
   transform:world.clone(),role:o.userData.appearanceRole,dynamicWheelFace:!!o.userData.dynamicWheelFace,
   spinRadius:o.userData.trackSpinRadiusM??null,
   endKind:o.userData.runningGearEndKind??null,toothCount:o.userData.sprocketToothCount??null,
   boundaryExamples:part.boundaryExamples.map(e=>({faces:e.faces,points:e.points.map(p=>p.clone().applyMatrix4(world).toArray())}))});
 }return result;
}
export function extrusionStock(root,expandGeometry=()=>null){
 const result=[],matrix=new T.Matrix4();root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(!isPhysicalStock(o))return;
  if(o.isBatchedMesh)throw new Error('Audit requires explicit unbatched stock');
  for(let i=0;i<(o.isInstancedMesh?o.count:1);i++){
   if(o.isInstancedMesh)o.getMatrixAt(i,matrix);else matrix.identity();
   const world=o.matrixWorld.clone().multiply(matrix);
   const geometries=expandGeometry(o)??[o.geometry];
   result.push(...stockParts(o,world,geometries,o.isInstancedMesh?i:null));
  }
 });return result;
}
function surfaceContact(node,prism){
 if(!node.box.intersectsBox(prism.box))return null;
 if(node.triangles){for(const t of node.triangles)if(t.box.intersectsBox(prism.box)){
  const hit=triangleInExtrusion(prism,t.points);if(hit)return hit;
 }return null;}
 return surfaceContact(node.left,prism)||surfaceContact(node.right,prism);
}
/** Generalized winding avoids axis-ray tangency and coplanar edge parity. A
 * non-integral winding is explicitly indeterminate, never a clear result. */
export function stockWinding(stock,p){
 if(!stock.box.containsPoint(p))return 0;
 if(!stock.closed)return null;
 let angle=0;
 for(const t of stock.triangles){
  const [a,b,c]=t.points.map(v=>v.clone().sub(p)),la=a.length(),lb=b.length(),lc=c.length();
  if(Math.min(la,lb,lc)<EPS)return null;
  angle+=2*Math.atan2(a.dot(b.clone().cross(c)),la*lb*lc+a.dot(b)*lc+b.dot(c)*la+c.dot(a)*lb);
 }
 const winding=Math.abs(angle)/(4*Math.PI);
 return Math.abs(winding-Math.round(winding))<1e-5?Math.round(winding):null;
}
