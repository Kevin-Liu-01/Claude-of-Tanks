import {buildT80UX} from './t80uX.ts';
import {KIT} from './kit.ts';
import {machinedRing} from '../machineGunGeometry.ts';
import {attachedCage,cheekEraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
export function buildT72Rys(P:TankBuilderPort):void {
  buildT80UX(P);
  // release 230 (fleetRenewalSpecs.ts T72_RYS_RING_RAISE_M): the casting rides the spec's raised ring, seated on a stationary
  // machined race bedded into the sloping T-80U roof (its foot 0.7-3.4 cm under the roof, inside the hull's 1.038 m
  // half-width), its top 2 mm under the casting's ring collar (cylY .994 at -.028 to .016 in the turret frame)
  const [px,py,pz]=P.spec.armor.turretPivot;
  P.turretG.position.set(px,py,pz);
  P.addEquipment('hullDetail',machinedRing(.90,1.01,py-.030-1.522,.004,P.q?32:20),px,1.522,pz);
  for(const side of [-1,1]){
    for(let i=0;i<3;i++)cheekEraCassette(P,`turret_era_${side<0?'L':'R'}`,
      [side*(.69+i*.27),.35,1.38-i*.22],[.25,.13,.38]);
    P.addEquipment('turretDetail',KIT.box(.24,.24,.58),side*1.23,.30,-.54);
    P.addEquipment('turretDetail',KIT.box(.27,.027,.61),side*1.23,.431,-.54);
  }
  supportedSensor(P,[.32,.91,-.51],.60);
  attachedCage(P,'turret',[0,.26,-2.01],2.02,.45,.43);
  strappedPack(P,'turret',[0,.36,-1.75],[1.03,.23,.32]);
  P.hullG.userData.familyRebuild={donor:'t80u',revision:1,variant:'polish-rys-concept'};
}
