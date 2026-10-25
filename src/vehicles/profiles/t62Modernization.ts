import {buildT62Obr1975Chassis} from './russia.ts';
import {buildT72B1987XTurret} from './t72b1987X.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {KIT,FITTINGS} from './kit.ts';
import {attachedCage,eraCassette,glacisEraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box}=KIT;
export function buildT62MV1Modern(P:TankBuilderPort):void {
  // VEH-13: the right aft course has no station on this variant's deck; its links ride the right rear fender
  buildT62Obr1975Chassis(P,{aftLinksRight:false});
  // (247, the coordinator: the gun blocked at every yaw at level) the 1987 turret sits ON the T-62's 1.54 m deck, not at
  // the T-62 dome's own 1.4804 seat: its trunnion drum (r 0.213, 0.217 m over the pivot, 1.30 m ahead of it) and mantlet
  // stood 6 cm into the deck round the whole traverse; at 1.570 (the spec's pivot too, fleetRenewalSpecs.ts) the drum
  // clears it by 26 mm through full elevation (its axis, 29 mm behind the trunnion, dips 7 mm at +14 deg) and the casting
  // keeps its own floor (the seat had trimmed it to 89 mm over the old pivot). The mantlet's rear section, inside the
  // gun port, ends 2.5 cm higher: at full elevation it dipped to the deck.
  buildT72B1987XTurret(P,{rearMantletBottom:-.155});
  P.turretG.position.set(0,1.570,.676);
  // The complete 1987 turret retains its Kontakt bank and gun articulation.
  for(const side of [-1,1]){
    for(let i=0;i<5;i++){
      const z=-1.85+i*.85;
      P.addEquipment('hullDetail',box(.13,.05,.70),side*1.65,1.35,z);
      eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[side*1.67,1.11,z],[.10,.43,.73],[0,0,side*.03]);
    }
    // (release 240, the owner: "make sure all tank turrets are clear of hulls": the row 0.11 m down the glacis; the inner
    // cassettes' rear crests (1.607, 1.55 m off the ring's axis) stood under the turret's side kit (1.599) as it turned)
    for(let i=0;i<4;i++)glacisEraCassette(P,`glacis_era_${side<0?'L':'R'}`,
      side*(.18+i*.30),2.50,[.27,.08,.41]);
  }
  supportedSensor(P,[-.43,1.04,.01],.675);
  attachedCage(P,'turret',[0,.23,-2.14],1.86,.42,.40);
  for(const side of [-1,1])P.addEquipment('turretDetail',beamBetween([side*.6696,.083,-1.74],[side*.30,.25,-1.62],.028));
  strappedPack(P,'turret',[0,.34,-1.92],[.96,.22,.28]);
  // VEH-13 (the owner's rule "fix how it's mounted, don't remove"): the right aft links as a two-link clamped course
  // flush on the right rear fender plate (0.374 x 0.40, top 1.425), along the hull, clear of the skirt ERA ahead of it
  const fenderLinks=FITTINGS.spareTrackLinks({mats:P.mats,links:2,width:.34,seed:23});
  fenderLinks.position.set(1.507,1.425+.0405,-3.02);
  P.hullG.add(fenderLinks);
  P.hullG.userData.familyRebuild={donor:'t62_1975',turret:'t72b_1987',revision:2,features:['kontakt-cheeks','glacis-era','side-era','thermal','rear-cage']};
}
