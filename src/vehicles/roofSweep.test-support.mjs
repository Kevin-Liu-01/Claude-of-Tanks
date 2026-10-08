import {Vector3} from 'three';
// Spatially index upward-facing real triangles. A swept bottom vertex must
// stay above the permanent roof and its mounted equipment, not a spec box.
export function topIndex(meshes,minimumY){
 const bins=new Map(),step=.12;
 for(const mesh of meshes){
  const g=mesh.geometry,p=g.attributes.position,n=g.index?.count??p.count;
  for(let i=0;i<n;i+=3){
   const v=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,g.index?g.index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
   const [a,b,c]=v,normal=b.clone().sub(a).cross(c.clone().sub(a));
   if(normal.y<=1e-8||Math.max(...v.map(p=>p.y))<minimumY)continue;
   const row={v,name:mesh.name};
   for(let x=Math.floor(Math.min(...v.map(p=>p.x))/step);x<=Math.floor(Math.max(...v.map(p=>p.x))/step);x++)
    for(let z=Math.floor(Math.min(...v.map(p=>p.z))/step);z<=Math.floor(Math.max(...v.map(p=>p.z))/step);z++){
     const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(row);
    }
  }
 }
 return p=>{
  let top=-Infinity,name='';
  for(const {v:[a,b,c],name:n} of bins.get(Math.floor(p.x/step)+','+Math.floor(p.z/step))??[]){
   const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
   const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den;
   const v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
   if(u>=0&&v>=0&&u+v<=1){const y=u*a.y+v*b.y+(1-u-v)*c.y;if(y>top){top=y;name=n;}}
  }
  return {top,name};
 };
}
