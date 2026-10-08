// First-party geometric primitive, not a vehicle/family template. Callers own
// every authored cross-section and all vehicle-specific measurements.
import * as THREE from 'three';
import { pushConvexQuad } from '../factoryGeometry.ts';

export type SectionPoint = readonly [number, number];
export interface SolidSection {
  readonly z: number;
  /** Counter-clockwise XY contour viewed from +Z; correspondence is explicit. */
  readonly ring: readonly SectionPoint[];
}

export interface SectionSolidOptions {
  /** Explicit welded facet split. Reversed mirrored contours use B-D to
   * retain the same physical surface as the original A-C split. Convex
   * selects the outward ridge independently on every welded panel. */
  readonly sideQuadDiagonal?: 'ac' | 'bd' | 'convex';
  /** Keep every collinear end-contour station in nondegenerate cap faces. */
  readonly preserveCapBoundary?: boolean;
  /** Rounded stock only: a bilinear center removes the arbitrary choice of
   * opposite diagonals on reflected contours. Welded plates stay planar. */
  readonly centeredSideQuads?: boolean;
  /** Contour edges that form one continuous casting. Caps and other edges
   * retain their face normals, including floors and gun-throat inner walls. */
  readonly smoothSideEdges?: readonly number[];
}

function validateContour(ring: readonly SectionPoint[], count: number): void {
  if (ring.length !== count) throw new Error('sectionSolid contour correspondence differs');
  let area2 = 0;
  for (let i = 0; i < count; i++) {
    const a = ring[i], b = ring[(i + 1) % count];
    if (!a.every(Number.isFinite)) throw new Error('sectionSolid contour must be finite');
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) {
      throw new Error('sectionSolid contour has a collapsed edge');
    }
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  if (area2 <= 1e-8) throw new Error('sectionSolid contour must be counter-clockwise');
}

function validateSections(sections: readonly SolidSection[], count: number): void {
  for (let s = 0; s < sections.length; s++) {
    const { z, ring } = sections[s];
    if (!Number.isFinite(z) || (s > 0 && z <= sections[s - 1].z)) {
      throw new Error('sectionSolid stations must be finite and strictly increasing');
    }
    validateContour(ring, count);
  }
}

/** Closed longitudinal loft with triangulated (including concave) end caps.
 * No source vertices, indices, or sampled source contours belong in callers.
 * This builds only at vehicle creation, never in the render/simulation loop. */
export function sectionSolid(sections: readonly SolidSection[], options: SectionSolidOptions = {}): THREE.BufferGeometry {
  if (sections.length < 2) throw new Error('sectionSolid needs at least two sections');
  const n = sections[0].ring.length;
  if (n < 3) throw new Error('sectionSolid needs at least three contour points');
  validateSections(sections, n);
  const positions: number[] = [];
  const smoothEdges=new Set(options.smoothSideEdges??[]);
  if([...smoothEdges].some(i=>!Number.isInteger(i)||i<0||i>=n))throw new Error('sectionSolid smoothing edge is outside contour');
  const smoothVertices:boolean[]=[];
  let smooth=false;
  const point = (s: number, i: number): readonly [number, number, number] =>
    [sections[s].ring[i][0], sections[s].ring[i][1], sections[s].z];
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => {
    positions.push(...a, ...b, ...c);
    smoothVertices.push(smooth,smooth,smooth);
  };
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      smooth=smoothEdges.has(i);
      const a=point(s,i),b=point(s,j),c=point(s+1,j),d=point(s+1,i);
      if(options.centeredSideQuads){
        const center=[0,1,2].map(k=>(a[k]+b[k]+c[k]+d[k])/4);
        tri(a,b,center);tri(b,c,center);tri(c,d,center);tri(d,a,center);
      }else if(options.sideQuadDiagonal==='convex'){
        pushConvexQuad(positions,a,b,c,d);
        smoothVertices.push(smooth,smooth,smooth,smooth,smooth,smooth);
      }else if(options.sideQuadDiagonal==='bd'){
        tri(a,b,d);tri(b,c,d);
      }else{
        tri(a,b,c);tri(a,c,d);
      }
    }
  }
  smooth=false;
  for (const s of [0, sections.length - 1]) {
    const contour = sections[s].ring.map(([x, y]) => new THREE.Vector2(x, y));
    const caps = THREE.ShapeUtils.triangulateShape(contour, []);
    if (options.preserveCapBoundary) {
      // Earcut can retain a datum only inside a zero-area triangle. Remove
      // those triangles, then split the real cap edge at the missing datum;
      // the cap and side wall must have the same boundary segmentation.
      for(let f=caps.length-1;f>=0;f--){
        const [a,b,c]=caps[f].map(i=>contour[i]);
        if(Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))<1e-12)caps.splice(f,1);
      }
      for(let v=0;v<n;v++){
        if(caps.some(face=>face.includes(v)))continue;
        let inserted=false;
        for(let f=0;f<caps.length&&!inserted;f++)for(let e=0;e<3;e++){
          const face=caps[f],ai=face[e],bi=face[(e+1)%3],ci=face[(e+2)%3];
          const a=contour[ai],b=contour[bi],p=contour[v],dx=b.x-a.x,dy=b.y-a.y;
          const along=((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy);
          if(along<=1e-8||along>=1-1e-8||Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))>1e-10)continue;
          caps.splice(f,1,[ai,v,ci],[v,bi,ci]);inserted=true;break;
        }
        if(!inserted)throw new Error('sectionSolid cap lost a boundary station');
      }
    }
    if (caps.length !== n - 2) throw new Error('sectionSolid end cap is not triangulatable');
    for (const [a, b, c] of caps) {
      if (s === 0) tri(point(s, c), point(s, b), point(s, a));
      else tri(point(s, a), point(s, b), point(s, c));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  if(smoothEdges.size){
    // Area-weighted normals across the authored curved courses only. The
    // actual surface is the centered tessellation, never a normal-only fix
    // for a reversed contour or warped welded armor plate.
    const p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
    const key=(i:number)=>`${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
    const sums=new Map<string,THREE.Vector3>();
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<p.count;i+=3){
      if(!smoothVertices[i])continue;
      a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);
      const weighted=b.cross(c);
      for(let j=0;j<3;j++){
        const k=key(i+j),sum=sums.get(k)??new THREE.Vector3();sum.add(weighted);sums.set(k,sum);
      }
    }
    for(const sum of sums.values())sum.normalize();
    for(let i=0;i<p.count;i++)if(smoothVertices[i]){
      const sum=sums.get(key(i))!;normal.setXYZ(i,sum.x,sum.y,sum.z);
    }
  }
  geometry.computeBoundingBox();
  return geometry;
}
