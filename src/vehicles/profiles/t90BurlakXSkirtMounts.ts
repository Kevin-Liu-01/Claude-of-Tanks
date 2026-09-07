// Independent scalar reconstruction of Object19's discrete skirt carriers.
// The cassette standoff remains air; no full-length sheet closes the channel.
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

function carrier(P:TankBuilderPort,side:number,z:number):void{
  const shift=side<0?.0019:0;
  const x=(v:number)=>side*(v+shift);
  // Solid rectangular receiver with its shorter, low projecting flange.
  // The upper/outboard space above the flange is deliberately empty.
  P.addEquipment('hullDetail',KIT.box(.0723,.1104,.167),x(1.7637),1.2427,z);
  P.addEquipment('hullDetail',KIT.box(.028,.028,.167),x(1.814),1.2015,z);
  const profile:[number,number][]=[[1.671,1.314],[1.719,1.314],
    [1.818,1.274],[1.827,1.283],[1.820,1.297],[1.719,1.3398],[1.671,1.3398]];
  const ring=profile.map(([px,y])=>[x(px),y]as[number,number]);
  if(side<0)ring.reverse();
  P.addEquipment('hullDetail',sectionSolid([{z:z-.018,ring},{z:z+.018,ring}]));
}

function hinge(P:TankBuilderPort,side:number,z:number):void{
  const shift=side<0?.0019:0,x=side*(1.8164+shift);
  P.addEquipment('hullDetail',KIT.cylZ(.021,.0156,20),x,1.3208,z);
  P.addEquipment('hullDetail',KIT.cylZ(.0115,.084,12),x,1.3208,z);
  // A9mm-radius concealed receiving pin joins the source-sized boss to the
  // permanent native fender; it does not close the visible cassette channel.
  P.addEquipment('hullDetail',KIT.cylX(.009,.040,16),side*(1.798+shift),1.3208,z);
}

export function addT90BurlakSkirtMounts(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    for(const z of [1.74315,2.29935])carrier(P,side,z);
    for(const z of [1.62205,2.17835])hinge(P,side,z);
  }
}
