import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sectionSolid } from './sectionSolid.ts';

type XY = readonly [number, number];

function foldedSheet(P: TankBuilderPort, rear: number, front: number, ring: readonly XY[], receivingRelief = 0): void {
  // Independent scalar cross sections of Object_32. Preserve the thin sheet
  // and its air on either side, rather than filling the entire end-guard box.
  const section=ring.map(([x,y])=>[x/.972,y] as [number,number]);
  const geometry=sectionSolid([{z:rear,ring:section},{z:front,ring:section}]);
  if(receivingRelief){
    // The source lower ends intersect its own track by31–34mm. A hidden
    // tapered receiving relief admits the complete scrolling shoe, retaining
    // the visible rear section and upper fold. It is not a source-data edit.
    const low=Math.min(...ring.map(point=>point[1])),high=Math.max(...ring.map(point=>point[1]));
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++)if(Math.abs(position.getZ(i)-front)<1e-6)
      position.setZ(i,front-receivingRelief*(high-position.getY(i))/(high-low));
    geometry.computeVertexNormals();
  }
  P.addEquipment('hullDetail',geometry);
}

export function addBarakRearGuards(P: TankBuilderPort): void {
  // These are asymmetric source parts, not mirrored dimensions. World-X
  // calipers are converted through this family's existing hull scale above.
  foldedSheet(P,-4.08168,-3.31463,[[-1.408022,.810493],[-1.397529,.809998],[-1.382285,1.052417],[-1.392877,1.053011]],.085);
  foldedSheet(P,-4.08138,-3.32552,[[-1.401389,1.013713],[-1.395153,1.013416],[-1.391986,1.055188],[-1.398222,1.055683]]);
  foldedSheet(P,-4.08138,-3.31364,[[-1.383869,1.019157],[-1.372980,1.019157],[-1.373376,1.066770],[-1.310421,1.236136],[-1.315568,1.245837],[-1.383869,1.070036]]);
  foldedSheet(P,-4.10098,-3.31750,[[1.265510,.810493],[1.276003,.809998],[1.290752,1.050338],[1.280160,1.051130]],.085);
  foldedSheet(P,-4.09059,-3.31780,[[1.272142,1.013713],[1.278378,1.013416],[1.281546,1.055188],[1.275310,1.055683]]);
  foldedSheet(P,-4.10128,-3.31780,[[1.289663,1.019157],[1.300552,1.019157],[1.300156,1.066770],[1.363111,1.236136],[1.357964,1.245837],[1.289663,1.070036]]);
}
