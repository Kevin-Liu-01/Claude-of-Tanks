// Owner-directed T-84 concept rebuild: complete T-72B3M 2016 chassis,
// with a separate Ukrainian angular welded turret and fitted gun opening.
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import {KIT,muzzleBore} from './kit.ts';
import {buildT72B3MXHull} from './t72b3mX.ts';
import {sectionSolid} from './sectionSolid.ts';
import {supportedSensor,strappedPack,attachedCage,eraCassette} from './modernizationFittings.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {OPLOT_BUSTLE_FLANK as FLANK,OPLOT_FLANK_CASSETTE as FLANK_ERA,oplotFlankCassetteSeat} from '../oplotFlankLayout.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ}=KIT;
export const OPLOT_FRAME={turret:[.008,1.535,.114315],gun:[0,.35,1.02],barrel:4.26} as const;
export function buildOplotModern(P:TankBuilderPort):void {
  buildT72B3MXHull(P);
  P.turretG.position.set(...OPLOT_FRAME.turret);P.gunG.position.set(...OPLOT_FRAME.gun);
  P.add('turret',cylY(.91,.98,.11,40),0,-.025,-.08);
  const wall=FLANK.wallTopY;
  const ring=(w:number,y:number):[number,number][]=>[[-w,.02],[w,.02],[w,wall],[w-.17,y],[-w+.17,y],[-w,wall]];
  P.add('turret',sectionSolid([{z:FLANK.rearZ,ring:ring(FLANK.rearHalfWidthM,FLANK.rearRoofY)},
    {z:FLANK.shoulderZ,ring:ring(FLANK.shoulderHalfWidthM,FLANK.shoulderRoofY)},{z:.30,ring:ring(1.43,.73)}]));
  // Squared shoulders taper to the narrow opening. Each cheek is a closed
  // stock; the space between them remains free for the entire pitching cover.
  for(const side of [-1,1]){
    const cheek=(w:number,h:number):[number,number][]=>{
      const r:[number,number][]=[[.40,.015],[w,.015],[w,.30],[w-.17,h],[.40,h]];
      return side<0?r.map(([x,y])=>[-x,y] as [number,number]).reverse():r;
    };
    P.add('turret',sectionSolid([{z:.28,ring:cheek(1.43,.73)},{z:1.63,ring:cheek(1.09,.56)}]));
    for(let i=0;i<3;i++)eraCassette(P,'turret',side<0?'oplot_cheek_era_L':'oplot_cheek_era_R',
      [side*(.61+i*.225),.48,1.55-i*.055],[.205,.19,.17],[.25,side*.13,0]);
    // Flank cassettes seat on the tapering bustle wall (oplotFlankLayout.ts); none stands off the shell.
    for(let i=0;i<FLANK_ERA.stations.length;i++){
      const {center:[x,y,z],yaw}=oplotFlankCassetteSeat(i);
      eraCassette(P,'turret',side<0?'oplot_side_era_L':'oplot_side_era_R',[side*x,y,z],
        [FLANK_ERA.widthM,FLANK_ERA.heightM,FLANK_ERA.depthM],[0,side*yaw,0]);
    }
    // Paired mantlet-adjacent illuminators with hoods and supported bases.
    P.addEquipment('turretDetail',box(.25,.10,.24),side*.71,.62,1.08);
    P.addEquipment('turretDetail',cylZ(.115,.15,24),side*.71,.72,1.11);
    P.addEquipment('turretGlass',markVehicleNightLens(cylZ(.089,.018,24),'headlight'),side*.71,.72,1.192);
    for(let i=0;i<4;i++)P.addEquipment('turretDark',cylZ(.041,.19,12),side*(1.18+i*.065),.47,-.10-i*.12,-.52,side*.64,0);
    P.addEquipment('turretDetail',cylY(.058,.075,.10,16),side*.92,.72,-1.71);
    P.addEquipment('turretDark',cylY(.009,.009,.85,8),side*.92,1.18,-1.71);
  }
  P.add('gunMount',cylX(.235,.79,32),0,0,-.03);
  P.add('gunMount',sectionSolid([
    {z:-.54,ring:[[-.375,-.07],[.375,-.07],[.375,.19],[-.375,.19]]},
    {z:.10,ring:[[-.375,-.24],[.375,-.24],[.375,.30],[-.375,.30]]},
    {z:.71,ring:[[-.25,-.18],[.25,-.18],[.25,.19],[-.25,.19]]},
  ]));
  P.add('gunMount',cylZ(.19,.22,32),0,0,.73);
  KIT.buildGun(P,{len:OPLOT_FRAME.barrel,r:.104,sleeve:true,collar:true,baseR:.19});
  muzzleBore(P,{len:OPLOT_FRAME.barrel,r:.104});
  P.addCupola('turret',cylY(.27,.31,.13,24),.52,.78,-.73);
  P.addEquipment('turretDetail',cylY(.25,.27,.035,24),.52,.856,-.73);
  supportedSensor(P,[-.56,.96,-.30],.71);
  // Large roof MG cradle, ammunition box and short independent optic.
  P.addEquipment('turretDetail',cylY(.15,.19,.17,24),.52,.955,-.75);
  P.addEquipment('turretDetail',box(.31,.20,.27),.52,1.08,-.73);
  P.addEquipment('turretDark',box(.12,.13,.44),.52,1.20,-.61);
  P.addEquipment('turretDark',cylZ(.024,.72,16),.52,1.21,-.06);
  P.addEquipment('turretFittingPaint',box(.23,.22,.31),.76,1.11,-.68);
  P.addModuleVisual('optics','turretGlass',box(.075,.055,.012),.37,1.15,-.562);
  for(const x of [-.68,0,.68]){
    P.addEquipment('turretDetail',box(.60,.06,.61),x,.708,-1.72);
    strappedPack(P,'turret',[x,.83,-1.74],[.53,.20,.52]);
  }
  attachedCage(P,'turret',[0,.33,-2.43],2.38,.47,.30);
  addVehicleGhillieSuit(P);
  P.decal('turret','number','084',.24,[1.49,.34,-.94],Math.PI/2);
  P.topY=1.62;
  P.turretG.userData.oplotRebuild={donorHull:'t72b3m_x',revision:'angular-20261002',gunOpeningM:.80};
}
