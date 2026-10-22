// Suspended field camouflage: physical leaves/net, with real supporting rails.
import {KIT} from './kit.ts';
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import {attachedCage} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
export function addDonbasFieldCover(P:TankBuilderPort):void {
  // The rear cage already reaches z=-1.89. Rails support the net above it;
  // leave the forward sights, hatch circles and gun depression corridor open.
  for(const side of [-1,1]) {
    P.addEquipment('turretDetail',KIT.box(.035,.035,1.02),side*.68,.60,-1.18);
    for(const z of [-.76,-1.61])P.addEquipment('turretDetail',KIT.box(.035,.25,.035),side*.68,.48,z);
    attachedCage(P,'hull',[side*1.18,1.13,-3.46],.90,.42,.40);
  }
  addVehicleGhillieSuit(P,{
    id:P.spec.id,seed:640,style:'leafy',density:.94,leafScale:1.02,
    light:0x718147,dark:0x33462d,netColor:'rgba(38,54,29,0.76)',
    turret:{top:[{x0:-.72,x1:.72,z0:-1.86,z1:-.70,nx:14,nz:16,
      yAt:()=>.62,seed:29}],side:[-1,1].map(side=>({side,z0:-1.86,z1:-.72,nz:16,ny:6,
      topAt:()=>.62,bottomAt:()=>.20,outAt:()=>.74,seed:37+side}))},
    hull:{side:[-1,1].map(side=>({side,z0:-2.22,z1:2.08,nz:30,ny:7,
      topAt:()=>1.36,bottomAt:z=>.91+.035*Math.sin(z*3),outAt:()=>1.87,seed:10+side}))},
  });
  P.turretG.userData.fieldCover={supported:true,sightsOpen:true,hatchesOpen:true,revision:1};
}
