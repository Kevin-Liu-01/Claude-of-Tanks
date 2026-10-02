// Fitted, pitching receiver covers for the twelve cast-core national concepts.
// Every country retains its turret and weapon datums; the cover follows its
// own armor nose instead of stopping at the same short barrel sleeve.
import {KIT,convexSlab} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {nationalModernizationDesign} from '../nationalModernizationDesign.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const noses={ua:[.96,.98,.87],pl:[.68,.72,.61],cn:[.61,.68,.50],ru:[.81,.96,.78]} as const;

/** Actual permanent receiver stock behind the moving shield. The circular
 * surface keeps a 30 mm radial gap through elevation, unlike a flat bulkhead. */
export function addNationalReceiver(P:TankBuilderPort,roof:number):void {
  for(let step=-16;step<16;step++) {
    const low=Math.max(.10,.43+.55*Math.sin(step*Math.PI/36));
    const high=Math.min(roof-.015,.43+.55*Math.sin((step+1)*Math.PI/36));
    if(high-low<1e-6)continue;
    const a=.90-Math.sqrt(.55*.55-(low-.43)**2);
    const b=.90-Math.sqrt(.55*.55-(high-.43)**2);
    P.add('turret',convexSlab(
      [-.38,low,.32],[.38,low,.32],[.38,low,a],[-.38,low,a],
      [-.38,high,.32],[.38,high,.32],[.38,high,b],[-.38,high,b],
    ));
  }
}

export function addNationalMantlet(P:TankBuilderPort,c:NationalModernizationConfig):void {
  const crown=nationalModernizationDesign(c).roofY-.442,nose=noses[c.package][c.model];
  const bevel=c.package==='cn'?.065:c.package==='pl'?.040:.025;
  const ring=(width:number,lo:number,hi:number):SectionPoint[]=>[
    [-width+bevel,lo],[width-bevel,lo],[width,lo+.035],
    [width,hi-bevel],[width-bevel,hi],[-width+bevel,hi],
    [-width,hi-bevel],[-width,lo+.035],
  ];
  const rear=[-.49,-.44,-.36,-.24,0].map(z=>({z,
    ring:ring(.371,Math.max(-.26,-.20-.35*z),Math.min(crown,Math.sqrt(.52*.52-z*z))),
  }));
  P.add('gunMount',KIT.cylX(.245,.84,32),0,0,-.06);
  P.add('gunMount',sectionSolid([...rear,
    {z:nose*.52,ring:ring(.371,-.25,crown*.82)},
    {z:nose*.83,ring:ring(.365,-.21,.19)},
    {z:nose,ring:ring(c.package==='ru'?.245:.215,-.17,.17)},
  ]));
  for(const side of [-1,1]) {
    P.add('gunMountDark',KIT.cylX(.276,.020,32),side*.367,0,-.04);
    // Flush fasteners on the moving face, kept out of the cheek seam.
    for(const y of [-.10,.10])P.addEquipment('gunMountDark',KIT.cylZ(.013,.009,8),side*.17,y,nose+.005);
  }
  P.add('gunMountDark',KIT.cylZ(.181,.035,32),0,0,nose+.013);
  if(c.package==='ru')P.add('gunMount',KIT.cylZ(.225,.105,32),0,0,nose-.015);
  else {
    // Country-specific service covers sit on the upper receiving surface.
    const length=c.package==='ua'?.18:.13,z=nose*.25;
    const y=crown*(1-.18*z/(nose*.52));
    P.addEquipment('gunMount',KIT.box(c.package==='pl'?.47:.31,.018,length),0,y+.004,z,
      Math.atan(.18*crown/(nose*.52)),0,0);
  }
}
