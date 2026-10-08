import {Ray,Triangle,Vector3} from 'three';
import {facetedSlab} from './facetedSlab.ts';

export const OPLOT_WING_TOP = [
  [.24,.40,2.10],[1.18,.56,1.24],[1.38,.845,.30],[.30,.845,.52],
] as const;
const bottom = [
  [.30,.02,2.36],[1.50,.02,1.30],[1.55,.02,.30],[.32,.02,.52],
] as const;

// Fifteen full-sized cassettes per wing, in staggered rows that fit its
// narrowing nose. Dimensions and total reactive-armor coverage are retained.
export const OPLOT_WING_ERA_SEATS = [
  [.55,.60],[.80,.60],[1.05,.60],
  [.44,.82],[.75,.82],[1.12,.82],
  [.43,1.04],[.72,1.04],[1.04,1.04],
  [.42,1.26],[.67,1.26],[.92,1.26],
  [.42,1.48],[.69,1.48],
  [.415,1.70],
] as const;

export function oplotWing(side: number) {
  return facetedSlab(bottom, OPLOT_WING_TOP, side);
}

export function oplotWingSeat(x: number, z: number, side: number) {
  const [a,b,c,d] = OPLOT_WING_TOP.map(p => new Vector3(...p));
  const ray = new Ray(new Vector3(x,2,z),new Vector3(0,-1,0));
  for (const triangle of [new Triangle(a,b,c),new Triangle(a,c,d)]) {
    const point = ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,new Vector3());
    if (!point) continue;
    const normal = triangle.getNormal(new Vector3());
    if (normal.y<0) normal.negate();
    point.x *= side; normal.x *= side;
    return {point,normal};
  }
  throw new Error(`Oplot ERA seat outside wing: ${x},${z}`);
}
