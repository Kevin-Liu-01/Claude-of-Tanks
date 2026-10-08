import * as THREE from 'three';

type Point=readonly [number,number,number];
type Ring=readonly [Point,Point,Point,Point];

/** Closed authored stock with an explicit roof diagonal. The caller owns
 * whether a roof is planar or intentionally faceted. Reflection reverses
 * triangle winding without choosing a different physical surface. */
export function facetedSlab(bottom:Ring,top:Ring,side=1,topDiagonal:'ac'|'bd'='ac'){
  const [a,b,c,d]=bottom,[e,f,g,h]=top,positions:number[]=[];
  const tri=(p:Point,q:Point,r:Point)=>{
    for(const v of side<0?[p,r,q]:[p,q,r])positions.push(side*v[0],v[1],v[2]);
  };
  const quad=(p:Point,q:Point,r:Point,s:Point)=>{tri(p,q,r);tri(p,r,s);};
  quad(a,b,f,e);quad(b,c,g,f);quad(c,d,h,g);quad(d,a,e,h);
  if(topDiagonal==='bd'){tri(e,f,h);tri(f,g,h);}else quad(e,f,g,h);
  quad(d,c,b,a);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
  geometry.computeVertexNormals();geometry.computeBoundingBox();
  return geometry;
}

/** Full-width stock with symmetric authored stations. Reflect the right
 * wall's actual triangles; reversing the left ring would swap its diagonal.
 * Reject asymmetric datums instead of silently erasing an intended offset. */
export function symmetricSlab(a:Point,b:Point,c:Point,d:Point,e:Point,f:Point,g:Point,h:Point) {
  for (const [left,right] of [[a,b],[d,c],[e,f],[h,g]]) {
    if (Math.abs(left[0]+right[0])>1e-8 || Math.abs(left[1]-right[1])>1e-8
      || Math.abs(left[2]-right[2])>1e-8) throw new Error('symmetricSlab requires mirrored stations');
  }
  const geometry=facetedSlab([a,b,c,d],[e,f,g,h]);
  const p=geometry.getAttribute('position');
  for(let triangle=0;triangle<2;triangle++)for(let corner=0;corner<3;corner++){
    const source=6+triangle*3+[0,2,1][corner],target=18+triangle*3+corner;
    p.setXYZ(target,-p.getX(source),p.getY(source),p.getZ(source));
  }
  geometry.computeVertexNormals();
  return geometry;
}
