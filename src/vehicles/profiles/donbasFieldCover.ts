// Suspended field camouflage: physical leaves/net, with real supporting rails.
// 262: re-seated on the true T-64 (t64Foundation.ts): the rails stand on the cast crown and the rear box, the drapes
// hang outside the casting's own flanks and stop ahead of the leading skirt panels' Kontakt-1 row (z 0.20).
import {KIT} from './kit.ts';
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import {attachedCage} from './modernizationFittings.ts';
import {t64DomeHeight,T64_HULL} from './t64Foundation.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
/** The rear box's lid (t64bvK1.ts rearBox: x +-0.70, z -1.105..-1.555, top 0.55). */
const BOX_TOP=.55;
const crown=(x:number,z:number)=>Math.max(t64DomeHeight(x,z)??0,Math.abs(x)<=.70&&z<=-1.105&&z>=-1.555?BOX_TOP:0);
export function addDonbasFieldCover(P:TankBuilderPort):void {
  // Rails over the crown's rear and the box carry the net; the forward sights, hatch circles and gun corridor stay open.
  const railY=Math.max(crown(.68,-.76),crown(.68,-1.61),crown(.68,-1.2))+.10;
  for(const side of [-1,1]) {
    P.addEquipment('turretDetail',KIT.box(.035,.035,.92),side*.68,railY,-1.18);
    for(const z of [-.76,-1.61]){const foot=crown(side*.68,z)-.01;P.addEquipment('turretDetail',KIT.box(.035,railY-foot,.035),side*.68,(railY+foot)/2,z);}
    attachedCage(P,'hull',[side*1.12,1.10,T64_HULL.rearZ-.26],.86,.40,.36);
  }
  const domeHalf=(z:number)=>z<-1.25?.74:Math.min(1.24,.74+(z+1.25)*1.0);
  addVehicleGhillieSuit(P,{
    id:P.spec.id,seed:640,style:'leafy',density:.94,leafScale:1.02,
    light:0x718147,dark:0x33462d,netColor:'rgba(38,54,29,0.76)',
    turret:{top:[{x0:-.72,x1:.72,z0:-1.80,z1:-.70,nx:14,nz:16,
      yAt:(x,z)=>crown(x,z)+.10,seed:29}],side:[-1,1].map(side=>({side,z0:-1.80,z1:-.72,nz:16,ny:6,
      topAt:z=>crown(side*.70,z)+.04,bottomAt:()=>.12,outAt:z=>domeHalf(z)+.06,seed:37+side}))},
    // the drapes stop behind the leading skirt panels' Kontakt-1 row (its last container ends at z 0.03)
    hull:{side:[-1,1].map(side=>({side,z0:-2.22,z1:-.04,nz:20,ny:7,
      topAt:()=>T64_HULL.deckY-.04,bottomAt:z=>.91+.035*Math.sin(z*3),outAt:()=>1.82,seed:10+side}))},
  });
  P.turretG.userData.fieldCover={supported:true,sightsOpen:true,hatchesOpen:true,revision:2};
}
