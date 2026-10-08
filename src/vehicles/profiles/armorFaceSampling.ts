// Bilinear sample of an authored armor face (round 46 cleanup,
// docs/CLEANUP-2026-09-22.md §4.3): the Italian, Japanese and Ukrainian packs
// carried this identical body under three names.
import * as THREE from 'three';

type ArmorFaceCorner = readonly [number, number, number];

export interface ArmorFaceSample {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  du: THREE.Vector3;
  dv: THREE.Vector3;
}

/** First finite hit on the emitted stock, for surface-mounted equipment. */
export function sampleArmorRay(surface: THREE.BufferGeometry, origin: THREE.Vector3,
  direction: THREE.Vector3): {point:THREE.Vector3;normal:THREE.Vector3} | null {
  const ray=new THREE.Ray(origin,direction.clone().normalize()),pos=surface.getAttribute('position'),index=surface.index;
  const triangle=new THREE.Triangle(),hit=new THREE.Vector3();
  let distance=Infinity,result:{point:THREE.Vector3;normal:THREE.Vector3}|null=null;
  for(let i=0;i<(index?.count??pos.count);i+=3){
    triangle.a.fromBufferAttribute(pos,index?.getX(i)??i);
    triangle.b.fromBufferAttribute(pos,index?.getX(i+1)??i+1);
    triangle.c.fromBufferAttribute(pos,index?.getX(i+2)??i+2);
    if(!ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit))continue;
    const d=hit.distanceTo(origin);
    if(d<distance){distance=d;result={point:hit.clone(),normal:triangle.getNormal(new THREE.Vector3())};}
  }
  return result;
}

/** Sample a quad face p00→p10→p11→p01 at (u, v); the normal is flipped toward outwardHint. */
export function sampleArmorFace(
  p00: ArmorFaceCorner,
  p10: ArmorFaceCorner,
  p11: ArmorFaceCorner,
  p01: ArmorFaceCorner,
  u: number,
  v: number,
  outwardHint: ArmorFaceCorner,
): ArmorFaceSample {
  const a = new THREE.Vector3(...p00);
  const b = new THREE.Vector3(...p10);
  const c = new THREE.Vector3(...p11);
  const d = new THREE.Vector3(...p01);
  const point = a.clone().multiplyScalar((1 - u) * (1 - v))
    .addScaledVector(b, u * (1 - v))
    .addScaledVector(c, u * v)
    .addScaledVector(d, (1 - u) * v);
  const du = b.clone().sub(a).multiplyScalar(1 - v)
    .add(c.clone().sub(d).multiplyScalar(v));
  const dv = d.clone().sub(a).multiplyScalar(1 - u)
    .add(c.clone().sub(b).multiplyScalar(u));
  const normal = new THREE.Vector3().crossVectors(du, dv).normalize();
  if (normal.dot(new THREE.Vector3(...outwardHint)) < 0) normal.negate();
  return { point, normal, du, dv };
}

/** Sample the actual two planar support facets of an outward convex quad.
 * Unlike a bilinear patch, this lies on the emitted welded stock, including
 * at mirrored cheek stations. The author still owns all four corners. */
export function sampleConvexArmorFace(
  p00: ArmorFaceCorner, p10: ArmorFaceCorner, p11: ArmorFaceCorner, p01: ArmorFaceCorner,
  u: number, v: number, outwardHint: ArmorFaceCorner,
): ArmorFaceSample {
  const a = new THREE.Vector3(...p00), b = new THREE.Vector3(...p10);
  const c = new THREE.Vector3(...p11), d = new THREE.Vector3(...p01);
  const orientation = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
  const sign = orientation.dot(new THREE.Vector3(...outwardHint)) < 0 ? -1 : 1;
  const bd = orientation.dot(d.clone().sub(a)) * sign > 1e-12;
  let point: THREE.Vector3, du: THREE.Vector3, dv: THREE.Vector3;
  if (bd && u + v <= 1) {
    du = b.clone().sub(a); dv = d.clone().sub(a);
    point = a.clone().addScaledVector(du,u).addScaledVector(dv,v);
  } else if (bd) {
    du = c.clone().sub(d); dv = c.clone().sub(b);
    point = c.clone().addScaledVector(du,u-1).addScaledVector(dv,v-1);
  } else if (u >= v) {
    du = b.clone().sub(a); dv = c.clone().sub(b);
    point = a.clone().addScaledVector(du,u).addScaledVector(dv,v);
  } else {
    du = c.clone().sub(d); dv = d.clone().sub(a);
    point = a.clone().addScaledVector(du,u).addScaledVector(dv,v);
  }
  const normal = new THREE.Vector3().crossVectors(du,dv).normalize();
  if (normal.dot(new THREE.Vector3(...outwardHint)) < 0) normal.negate();
  return {point, normal, du, dv};
}

/** Clip actual emitted facets and extrude a finite cover along one owner axis.
 * The limits must be linear within each source triangle. Keeping the native
 * facet boundaries closes bent covers without bridging over their carrier.
 * Extrusion is a shared direction, so adjacent faces cannot open mitre cracks. */
export function clippedArmorSkin(
  shell: THREE.BufferGeometry,
  accepts: (normal: THREE.Vector3) => boolean,
  limits: readonly ((point: THREE.Vector3) => number)[],
  direction: ArmorFaceCorner,
  backOffset: number,
  frontOffset: number,
): THREE.BufferGeometry {
  const p=shell.getAttribute('position'),index=shell.getIndex();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const polygons:THREE.Vector3[][]=[];
  for(let i=0;i<(index?.count??p.count);i+=3){
    a.fromBufferAttribute(p,index?.getX(i)??i);
    b.fromBufferAttribute(p,index?.getX(i+1)??i+1);
    c.fromBufferAttribute(p,index?.getX(i+2)??i+2);
    if(!accepts(new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize()))continue;
    let polygon=[a.clone(),b.clone(),c.clone()];
    for(const distance of limits){
      const output:THREE.Vector3[]=[];
      for(let j=0;j<polygon.length;j++){
        const v=polygon[j],w=polygon[(j+1)%polygon.length],dv=distance(v),dw=distance(w);
        if(dv>=-1e-9)output.push(v);
        if((dv<0&&dw>0)||(dv>0&&dw<0))output.push(v.clone().lerp(w,dv/(dv-dw)));
      }
      polygon=output.filter((v,j)=>v.distanceTo(output[(j+output.length-1)%output.length])>1e-8);
    }
    if(polygon.length>=3)polygons.push(polygon);
  }
  const positions:number[]=[],edges=new Map<string,{a:THREE.Vector3;b:THREE.Vector3;count:number}>();
  const key=(v:THREE.Vector3)=>v.toArray().map(n=>Math.round(n*1e7)).join(',');
  const vertex=(v:THREE.Vector3,offset:number)=>[
    v.x+direction[0]*offset,v.y+direction[1]*offset,v.z+direction[2]*offset];
  for(const polygon of polygons){
    for(let i=1;i<polygon.length-1;i++){
      positions.push(...vertex(polygon[0],frontOffset),...vertex(polygon[i],frontOffset),...vertex(polygon[i+1],frontOffset));
      positions.push(...vertex(polygon[i+1],backOffset),...vertex(polygon[i],backOffset),...vertex(polygon[0],backOffset));
    }
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const k=[key(a),key(b)].sort().join('|'),old=edges.get(k);
      if(old)old.count++;else edges.set(k,{a,b,count:1});
    }
  }
  for(const {a,b,count}of edges.values())if(count===1){
    positions.push(...vertex(a,backOffset),...vertex(b,backOffset),...vertex(b,frontOffset),
      ...vertex(a,backOffset),...vertex(b,frontOffset),...vertex(a,frontOffset));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const uv:number[]=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]+positions[i+1],positions[i+2]);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  return geometry;
}
