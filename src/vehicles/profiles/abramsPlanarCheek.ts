import * as THREE from 'three';

type Point = readonly [number, number, number];
type Corners = readonly [Point, Point, Point, Point];

/** M1A3 welded cheek: one flat front, a transverse roof knee, and the
 * original aft roof datum. Reflect triangles, not corner-ring order: the
 * latter silently selects a different diagonal on the opposite side. */
export function abramsPlanarCheek(bottom: Corners, top: Corners, side: number): THREE.BufferGeometry {
  const [a,b,c,d]=bottom, [oldE,f,g,h]=top;
  const normal=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a))
    .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...f),new THREE.Vector3(...a)));
  if(Math.abs(normal.z)<1e-8)throw new Error('Abrams cheek front requires a forward-facing plane');
  const e:Point=[oldE[0],oldE[1],a[2]-(normal.x*(oldE[0]-a[0])+normal.y*(oldE[1]-a[1]))/normal.z];
  const knee:Point=[e[0],f[1],f[2]];
  const positions:number[]=[];
  const tri=(p:Point,q:Point,r:Point)=>{
    for(const v of side<0?[p,r,q]:[p,q,r])positions.push(side*v[0],v[1],v[2]);
  };
  const quad=(p:Point,q:Point,r:Point,s:Point)=>{tri(p,q,r);tri(p,r,s);};
  quad(a,b,f,e); // single front armor plane
  quad(b,c,g,f);
  quad(c,d,h,g);
  tri(d,a,e);tri(d,e,knee);tri(d,knee,h); // inner wall follows the roof knee
  tri(e,f,knee);quad(knee,f,g,h); // two deliberate planar roof courses
  quad(d,c,b,a);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const uv:number[]=[];
  for(let i=0;i<positions.length;i+=3)uv.push(positions[i],positions[i+2]);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
