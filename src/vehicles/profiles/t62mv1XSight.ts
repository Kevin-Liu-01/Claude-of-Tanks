// Original closed sight housing from canonical source island 8180's planes.
// The supplied fused mesh depicts its window in the texture: no geometric
// cavity is claimed or invented. Scalar measurements, never source topology.
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const FRONT=.53319901,ROOF_START=.48849982,REAR=.41564566,TOP=2.15799975;
const PIVOT_Y=1.446436,PIVOT_Z=.3041853764;

export function addT62MV1Sight(P:TankBuilderPort):void {
  const section=(x:number,frontLow:number,rearLow:number)=>({z:x,ring:[
    [-FRONT,frontLow],[-REAR,rearLow],[-ROOF_START,TOP],[-FRONT,TOP],
  ] as readonly SectionPoint[]});
  const body=sectionSolid([section(.22312516,2.07311780,2.05514002),
    section(.41870609,2.07098354,2.05292368)]).rotateY(Math.PI/2);
  body.userData.t62mv1Sight='housing';
  P.addModuleVisual('optics','turretDetail',body,0,-PIVOT_Y,-PIVOT_Z);
  // Inset color face represents the source's painted/glazed atlas region.
  // Its 0.8 mm closed stock sits inside the housing, with only a 20 μm
  // anti-z-fighting offset. This is not a newly recessed source aperture.
  const face=KIT.box(.151,.048,.0008);
  face.userData.t62mv1Sight='windowFace';
  P.addModuleVisual('optics','turretDark',face,.32091563,2.117-PIVOT_Y,FRONT-.00038-PIVOT_Z);
}
