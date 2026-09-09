import * as THREE from 'three';

export type GearRadialStation = readonly [radiusM: number, axleXM: number];

/** Remove only zero-area axis/seam triangles emitted by a lathe/cylinder.
 * No vertex moves, normal changes, tolerance-driven decimation or hole fill. */
export function removeDegenerateGearTriangles(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = geometry.getAttribute('position'), source = geometry.index;
  const count = source?.count ?? p.count, indices: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const ia = source?.getX(i) ?? i, ib = source?.getX(i + 1) ?? i + 1, ic = source?.getX(i + 2) ?? i + 2;
    a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
    if (b.sub(a).cross(c.sub(a)).lengthSq() === 0) continue;
    indices.push(ia, ib, ic);
  }
  geometry.setIndex(indices);
  return geometry;
}

/** Parameterized closed first-party turned stock. The caller owns disposal. */
export function turnedGearStock(
  profile: readonly GearRadialStation[], segments: number, side = 1,
): THREE.BufferGeometry {
  if (!Number.isInteger(segments) || segments < 4 || segments > 128 || Math.abs(side) !== 1
    || profile.length < 3 || profile.some(p => p.length !== 2 || !p.every(Number.isFinite) || p[0] < 0)) {
    throw new RangeError('Invalid turned running-gear stock');
  }
  const geometry = new THREE.LatheGeometry(profile.map(([r, x]) => new THREE.Vector2(r, x)), segments);
  removeDegenerateGearTriangles(geometry);
  geometry.rotateZ(-Math.PI / 2);
  if (side < 0) geometry.rotateY(Math.PI);
  return geometry;
}

export function runningGearRadialSegments(high: boolean): number { return high ? 20 : 12; }

/** Low-order metal fastener, separate from any structural dish or aperture. */
export function gearFastener(radius: number, depth: number, high: boolean): THREE.BufferGeometry {
  const count=high?4:3,shape=new THREE.Shape(Array.from({length:count},(_,i)=>{
    const angle=i*Math.PI*2/count;
    return new THREE.Vector2(-Math.cos(angle)*radius,Math.sin(angle)*radius);
  }).reverse());
  // Triangulated cap polygons, not redundant center fans. The occupied
  // triangular/square cylinder stays identical to its same-segment cylinder.
  return new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:false})
    .translate(0,0,-depth/2).rotateY(Math.PI/2);
}

/** One real roller: the painted central hub is distinct from its rubber
 * contact stock. High retains both tire shoulders; low retains the exact
 * crown, broad contact width and complete hub/axle envelope. */
export function returnRollerStock(radius: number, width: number, high: boolean) {
  const tire = high ? turnedGearStock([
    [0,-width*.27],[radius*.92,-width*.27],[radius,-width*.25],
    [radius,width*.25],[radius*.92,width*.27],[0,width*.27],[0,-width*.27],
  ],8) : removeDegenerateGearTriangles(new THREE.CylinderGeometry(radius,radius,width*.50,8).rotateZ(-Math.PI/2));
  const disc=turnedGearStock([[0,-width*.345],[radius*.18,-width*.345],
    [radius*.76,-width*.285],[radius*.76,width*.285],
    [radius*.18,width*.345],[0,width*.345],[0,-width*.345]],high?8:4);
  return {tire,disc};
}

