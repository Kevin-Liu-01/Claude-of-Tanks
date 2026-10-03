// Original Polish IFV modernization: raised angular turret, supported Spike
// pod, roof optics and connected armor carriers. Hull ancestry is retained.
import {KIT,muzzleBore} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {weaponAssembly} from './weaponStock.ts';
import {supportedSensor,strappedPack,attachedCage} from './modernizationFittings.ts';
import {addEscortFieldKit} from './escortFieldKit.ts';
import {ESCORT_FIELD_KITS} from '../escortFieldKitLayout.ts';
import {blindTube} from './measuredPrimitives.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ}=KIT;
export const UPIOR_LAUNCH_MOUTH=[1.10,.37,.83] as const;
export function buildUpiorUpgrade(P:TankBuilderPort):void {
  P.turretG.position.set(-.10,1.64,-.74);P.gunG.position.set(0,.35,.76);
  P.add('turret',cylY(.72,.79,.12,32),0,-.045,-.10);
  // Rear welded cell ends behind the pitch sweep; two separately closed
  // cheeks flank the moving cradle rather than occupying its channel.
  P.add('turret',sectionSolid([
    {z:-1.04,ring:[[-.79,.03],[.79,.03],[.89,.32],[.72,.59],[-.72,.59],[-.89,.32]]},
    {z:.17,ring:[[-.95,-.01],[.95,-.01],[1.02,.30],[.80,.62],[-.80,.62],[-1.02,.30]]},
  ]));
  for(const side of [-1,1]){
    const ring=(outer:number,top:number):[number,number][]=>{
      const r:[number,number][]=[[.275,.02],[outer,.02],[outer,.32],[outer-.16,top],[.275,top]];
      return side<0?r.map(([x,y])=>[-x,y] as [number,number]).reverse():r;
    };
    P.add('turret',sectionSolid([{z:.15,ring:ring(1.02,.62)},{z:.88,ring:ring(.65,.44)}]));
    P.addEquipment('turretDetail',box(.21,.16,.25),side*.61,.49,.29);
    P.addModuleVisual('optics','turretGlass',box(.15,.07,.014),side*.61,.50,.422);
    for(let i=0;i<3;i++)P.addEquipment('turretDark',cylZ(.04,.16,12),side*(.74+i*.09),.27,.31,-.40,side*.36,0);
    P.addEquipment('turretDetail',cylY(.055,.065,.11,12),side*.62,.64,-.80);
    P.addEquipment('turretDark',cylY(.009,.009,.67,8),side*.62,1.00,-.80);
  }
  P.add('gunMount',cylX(.205,.54,28),0,0,-.06);
  P.add('gunMount',sectionSolid([
    {z:-.46,ring:[[-.25,-.10],[.25,-.10],[.25,.18],[-.25,.18]]},
    {z:.22,ring:[[-.25,-.18],[.25,-.18],[.25,.19],[-.25,.19]]},
    {z:.50,ring:[[-.09,-.08],[.09,-.08],[.09,.08],[-.09,.08]]},
  ]));
  KIT.buildGun(P,{len:2.40,r:.035,sleeve:false,collar:true,baseR:.085});
  muzzleBore(P,{len:2.40,r:.035});
  supportedSensor(P,[-.44,.83,-.42],.59);
  // Single installed tube, with the firing mouth shared with the launcher
  // registry. The housing/supports are missile-rack module stock.
  weaponAssembly(P,()=>{
    P.addEquipment('turretDetail',box(.27,.14,.53),.98,.27,-.04);
    // Four housing walls surround a recessed bore; no cap crosses the mouth.
    for(const x of [.998,1.202])P.addEquipment('turretDetail',box(.018,.24,1.15),x,.37,.255);
    for(const y of [.259,.481])P.addEquipment('turretDetail',box(.186,.018,1.15),1.10,y,.255);
    P.addEquipment('turretDark',blindTube(.096,.073,1.15,1.10,24),1.10,.37,.255);
  });
  P.addEquipment('turretDetail',cylY(.11,.14,.13,16),.33,.675,-.51);
  P.addEquipment('turretDark',box(.12,.13,.36),.33,.79,-.42);
  P.addEquipment('turretDark',cylZ(.018,.54,12),.33,.80,.02);
  P.addEquipment('turretFittingPaint',box(.14,.17,.20),.46,.78,-.45);
  P.addEquipment('turretDetail',box(.28,.08,.13),0,.58,.18);
  P.addEquipment('turretGlass',markVehicleNightLens(box(.22,.04,.015),'headlight'),0,.59,.253);
  attachedCage(P,'turret',[0,.27,-1.25],1.59,.35,.24);
  strappedPack(P,'turret',[.30,.74,-.82],[.33,.20,.30]);
  addEscortFieldKit(P,ESCORT_FIELD_KITS.upior);
  P.topY=1.35;
  P.turretG.userData.upiorModernization={revision:'angular-escort-20261002',raisedPivotM:1.64};
}
