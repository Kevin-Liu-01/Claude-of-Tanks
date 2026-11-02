// Burlak's three source-measured detachable side cassettes, not a hull scale.
import type * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {addT90BurlakSkirtMounts} from './t90BurlakXSkirtMounts.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const COURSES:readonly(readonly[number,number,number,number,number,number])[]=[
  [.963430047,1.598630071,.927709997,1.430109978,1.831590056,1.906990051],
  [1.642080069,2.277279973,.880949974,1.383350015,1.831740022,1.905740023],
  [2.317560077,2.952759981,.827459991,1.329859972,1.829400063,1.904800057],
];
// 267 (S3, the 266 blind critics: "the side skirts read as plain slabs"): each cassette's cover is a welded container,
// as on the T-90 AW (the same source cassettes, t90AwXDetails.ts sideCassette): 10 mm chamfers round its face and ends,
// and three bolt heads along its upper and lower edges at high quality, 26 mm in from them, 3 mm into the face and 5
// mm proud (clear of the face-plane witnesses 40 mm in, t90BurlakXRear.selftest.mjs). Its face keeps the source's outer
// cassette plane and its back the 266 rim; its hit skin stays that face's two triangles (the chamfers are not armour).
function cover(side:number,shift:number,a:number,b:number,lo:number,hi:number,back:number,outside:number):THREE.BufferGeometry{
  const c=.010,face=outside+shift,rim=back+shift,ring=(inset:number):Array<readonly[number,number]>=>{
    const pts:Array<readonly[number,number]>=[[rim,lo+inset],[face-c-inset,lo+inset],[face-inset,lo+c+inset],
      [face-inset,hi-c-inset],[face-c-inset,hi-inset],[rim,hi-inset]];
    return side<0?pts.map(([x,y])=>[-x,y] as const).reverse():pts;
  };
  return sectionSolid([{z:a,ring:ring(c)},{z:a+c,ring:ring(0)},{z:b-c,ring:ring(0)},{z:b,ring:ring(c)}]);
}
export function addT90BurlakSkirtCassettes(P:TankBuilderPort):void{
  addT90BurlakSkirtMounts(P);
  for(const side of [-1,1])for(const[a,b,lo,hi,inside,outside]of COURSES){
    const shift=side<0?.0019:0,back=outside-.0388;
    P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(cover(side,shift,a,b,lo,hi,back,outside),[side,0,0],.95));
      if(P.q)P.addExternalArmor('hull',markEraFurniture(KIT.mergeAll([lo+.026,hi-.026].flatMap(y=>[-.24,0,.24].map(dz=>
        KIT.box(.008,.022,.022).translate(side*(outside+shift+.001),y,(a+b)/2+dz))))));
      // Original rear boss has a smaller footprint; its surrounding step is air.
      P.addExternalArmor('hull',markEraFurniture(KIT.box(back-inside,.4057,.5401)),
        side*((inside+back)/2+shift),lo+.25405,a+.31905);
    });
    // Source omits the hidden fasteners across its small mounting separation.
    // Two narrow inferred lugs engage the existing permanent fender; no slab
    // fills the cassette-to-skirt standoff or changes its gameplay protection.
    for(const z of [a+.11,b-.11])P.addEquipment('hullDetail',KIT.box(inside+shift-1.782+.002,.018,.036),
      side*((inside+shift+1.782)/2),hi-.042,z);
  }
}
