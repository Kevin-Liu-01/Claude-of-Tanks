// Finite L-section apron: a deck lip and skirt return, not a solid wheel bay.
import type {BufferGeometry} from 'three';
import {sectionSolid, type SectionPoint} from './sectionSolid.ts';

export interface FoldedShoulderLayout {
  readonly outerX: number;
  readonly skirtTop: number;
  readonly offsetZ: number;
  readonly offsetY: number;
  readonly rows: readonly (readonly [z: number, innerX: number, roofY: number])[];
}

export function foldedShoulderReturn(layout: FoldedShoulderLayout, side: number): BufferGeometry {
  return sectionSolid(layout.rows.map(([z, innerX, y]) => {
    const top=y+layout.offsetY, bottom=layout.skirtTop+layout.offsetY-.012;
    const outer=layout.outerX;
    const ring: SectionPoint[] = [[innerX,top-.016],[outer-.014,top-.016],
      [outer-.014,bottom],[outer,bottom],[outer,top],[innerX,top]];
    return {z:z+layout.offsetZ,ring:side<0?ring.map(([x,h])=>[-x,h] as SectionPoint).reverse():ring};
  }));
}
