import {sectionSolid,type SectionPoint} from './sectionSolid.ts';

export type FlankStation=readonly [z:number,inner:number,outer:number,bottom:number,top:number];

/** A welded housing whose corresponding contour edges stay parallel:
 * horizontal shelves, a vertical wall, and 45-degree bevels. Thus every
 * longitudinal quad is a plane even as width and height change by station. */
export function weldedFlankHousing(rows:readonly FlankStation[],side:number,maxBevel=.045){
  return sectionSolid(rows.map(([z,inner,outer,low,top])=>{
    if(!(top>low&&outer>inner&&maxBevel>0))throw new Error('Welded housing requires positive height, width and bevel');
    const bevel=Math.min(maxBevel,(top-low)*.25,(outer-inner)*.25);
    const ring:SectionPoint[]=[[inner,low],[outer-bevel,low],[outer,low+bevel],
      [outer,top-bevel],[outer-bevel,top],[inner,top]];
    return {z,ring:side>0?ring:ring.map(([x,y])=>[-x,y] as const).reverse()};
  }));
}
