// Suspended field camouflage: physical leaves/net, with real supporting rails.
// 2026-10-21: re-seated on the T-64 shell (t64bvX.ts) when the Donbas left the T-72B3 study: the rails lie over the
// bustle locker, the service bins sit on its lid under the net, and the transom cages take the drums' place.
import {KIT} from './kit.ts';
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import {attachedCage} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
export function addDonbasFieldCover(P:TankBuilderPort):void {
  // Leave the forward sights, hatch circles and gun depression corridor open, and the right half of the locker lid
  // (the drone dock's pad): the two service bins and the net take its left half, a rail along each net edge.
  for(const x of [.22,.52])P.addEquipment('turretDetail',KIT.box(.28,.16,.30),x,.50,-1.47);
  for(const x of [-.12,.62]){
    // the rail runs out of the cast rear wall (z -0.90..-1.03 at this height) to a post on the locker lid
    P.addEquipment('turretDetail',KIT.box(.035,.035,1.00),x,.60,-1.20);
    P.addEquipment('turretDetail',KIT.box(.035,.18,.035),x,.51,-1.55);
  }
  for(const side of [-1,1])attachedCage(P,'hull',[side*.48,.90,-3.47],.76,.38,.40);
  addVehicleGhillieSuit(P,{
    id:P.spec.id,seed:640,style:'leafy',density:.94,leafScale:1.02,
    light:0x718147,dark:0x33462d,netColor:'rgba(38,54,29,0.76)',
    turret:{top:[{x0:-.12,x1:.72,z0:-1.86,z1:-1.00,nx:9,nz:14,
      yAt:()=>.62,seed:29}],side:[{side:1,z0:-1.86,z1:-1.10,nz:12,ny:6,
      topAt:()=>.62,bottomAt:()=>.20,outAt:()=>.76,seed:38}]},
    // hung from the fender edge (its underside at 1.36 m), outside the rubber skirt and its leading K-1 containers
    hull:{side:[-1,1].map(side=>({side,z0:-2.22,z1:2.08,nz:30,ny:7,
      topAt:()=>1.36,bottomAt:(z:number)=>.91+.035*Math.sin(z*3),
      outAt:(z:number)=>1.785+.075*Math.max(0,Math.min(1,(z-.85)/.25)),seed:10+side}))},
  });
  P.turretG.userData.fieldCover={supported:true,sightsOpen:true,hatchesOpen:true,revision:1};
}
