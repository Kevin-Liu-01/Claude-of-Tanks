// Burlak's three source-measured detachable side cassettes, not a hull scale.
import {KIT} from './kit.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {addT90BurlakSkirtMounts} from './t90BurlakXSkirtMounts.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const COURSES:readonly(readonly[number,number,number,number,number,number])[]=[
  [.963430047,1.598630071,.927709997,1.430109978,1.831590056,1.906990051],
  [1.642080069,2.277279973,.880949974,1.383350015,1.831740022,1.905740023],
  [2.317560077,2.952759981,.827459991,1.329859972,1.829400063,1.904800057],
];
export function addT90BurlakSkirtCassettes(P:TankBuilderPort):void{
  addT90BurlakSkirtMounts(P);
  for(const side of [-1,1])for(const[a,b,lo,hi,inside,outside]of COURSES){
    const shift=side<0?.0019:0,back=outside-.0388,x=side*((back+outside)/2+shift);
    P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(KIT.box(.0388,hi-lo,b-a),[side,0,0]),x,(lo+hi)/2,(a+b)/2);
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
