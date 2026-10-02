// Twelve owner-authorized hull derivatives with separate national equipment layouts.
import {KIT,orientedSlab} from './kit.ts';
import {buildT80UXHull} from './t80uX.ts';
import {buildT72B3MXHull} from './t72b3mX.ts';
import {buildT72B3XHull} from './t72b3X.ts';
import {buildT90SMXTurret} from './t90X.ts';
import {attachedCage,eraCassette,supportedSensor,strappedPack} from './modernizationFittings.ts';
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import {NATIONAL_MODERNIZATION_CONFIG,type NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylY}=KIT;
function build(P:TankBuilderPort,c:NationalModernizationConfig):void {
  if(c.model===0)buildT80UXHull(P);else if(c.model===1)buildT72B3MXHull(P);else buildT72B3XHull(P);
  buildT90SMXTurret(P,true);P.turretG.position.set(.008,c.y,c.z);
  // The SM assembly's station root is classified as its gun's mount by
  // beginAuxiliaryStation().attachPitch, leaving the nested gun as the sole
  // weapon fitting (and keeping the remote-controlled articulation).
  const russian=c.package==='ru',polish=c.package==='pl',chinese=c.package==='cn';
  // A proper clipped bustle extends the load-bearing shell. The forward SM
  // aperture, gun, sights, hatch and remote station retain their working space.
  const end=c.model===0?-2.45:c.model===1?-2.70:-2.28;
  const half=polish?1.03:chinese?1.25:russian?1.38:1.14;
  P.add('turret',orientedSlab(
    [-.68,.20,-1.38],[.68,.20,-1.38],[half,.22,end],[-half,.22,end],
    [-.65,.64,-1.38],[.65,.64,-1.38],[half-.18,.62,end+.13],[-half+.18,.62,end+.13]));
  for(const side of [-1,1]) {
    // A continuous thin fender extension carries the new spaced skirt bank.
    // Its folded inner flange seats on the donor fender; the wheel bay below
    // remains open and the moving shoe envelope stays clear.
    P.addEquipment('hullDetail',box(.30,.028,5.20),side*1.865,1.44,-.05);
    P.addEquipment('hullDetail',box(.026,.095,5.20),side*1.73,1.407,-.05);
    if(c.model===1)P.addEquipment('hullDetail',box(.30,.028,.60),side*1.865,1.44,2.83);
    // Separate spaced side armor banks, bracketed to the donor fender. The
    // lower hem stays above the wheel course; no synthetic wheel-bay walls.
    const count=polish?7:russian?5:6;
    for(let i=0;i<count;i++){
      const z=-2.18+i*4.30/(count-1),x=side*(russian?2.00:1.95);
      P.addEquipment('hullDetail',box(.26,.045,.42),side*1.84,1.39,z);
      // Outboard drop joins the raised bridge to the cassette without
      // entering the moving track's inboard shoe envelope.
      P.addEquipment('hullDetail',box(.035,.13,.12),side*(russian?1.95:1.92),1.35,z);
      eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[x,1.10,z],[.13,.46,4.15/count]);
      if(russian)strappedPack(P,'hull',[x,.76,z],[.15,.22,.70]);
    }
    // National shoulder silhouette: Polish vertical tile stacks, Chinese
    // swept wedge rails, Ukrainian spaced flank screens, Russian deep pods.
    if(chinese){
      P.addExternalArmor('turret',orientedSlab(
        [side*.98,.20,.45],[side*1.43,.20,.35],[side*1.38,.20,-1.62],[side*.98,.20,-1.62],
        [side*1.02,.57,.39],[side*1.30,.57,.29],[side*1.21,.64,-1.55],[side*1.02,.64,-1.55]));
      P.addEquipment('turretDetail',box(.26,.18,.27),side*1.20,.69,-1.38);
      P.addModuleVisual('optics','turretGlass',box(.18,.08,.012),side*1.20,.70,-1.239);
    }else if(polish){
      for(let i=0;i<4;i++){
        const z=-.34-i*.31;
        P.addEquipment('turretDetail',box(.65,.055,.12),side*.90,.30,z);
        eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,[side*1.20,.30,z],[.10,.30,.27]);
      }
      strappedPack(P,'turret',[side*.72,.72,end+.40],[.36,.22,.52]);
    }else if(russian){
      P.addExternalArmor('turret',orientedSlab(
        [side*1.04,.05,-.40],[side*1.52,.05,-.52],[side*1.48,.12,end+.22],[side*1.04,.12,end+.22],
        [side*1.04,.52,-.40],[side*1.38,.52,-.52],[side*1.32,.61,end+.30],[side*1.04,.61,end+.30]));
      for(let i=0;i<3;i++)eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,[side*1.43,.30,-.75-i*.44],[.12,.36,.38]);
      P.addEquipment('turretDetail',box(.24,.055,.29),side*1.08,.615,end+.52);
      P.addEquipment('turretDetail',box(.30,.18,.33),side*1.08,.72,end+.52);
    }else{
      for(const z of [-.90,-1.40])P.addEquipment('turretDetail',box(.86,.04,.035),side*.90,.37,z);
      P.addEquipment('turretDetail',box(.025,.42,.98),side*1.32,.38,-1.16);
      strappedPack(P,'turret',[side*.73,.72,end+.38],[.48,.22,.44]);
    }
  }
  attachedCage(P,'turret',[0,.40,end-.23],half*2,.42,.36);
  if(c.model===1)supportedSensor(P,[0,.92,end+.37],.63);
  else {
    P.addEquipment('turretDetail',cylY(.055,.08,.11,12),0,.68,end+.35);
    P.addEquipment('turretDark',cylY(.009,.014,c.model===0?.75:.42,10),0,c.model===0?1.10:.94,end+.35);
  }
  if(c.package==='ua')addVehicleGhillieSuit(P,{
    id:c.id,seed:801+c.model,style:'leafy',density:.82,leafScale:.94,
    light:0x768452,dark:0x35462f,netColor:'rgba(40,55,32,0.8)',
    turret:{top:[{x0:-.58,x1:.58,z0:end+.18,z1:-1.55,nx:10,nz:12,yAt:()=>.65}]},
    hull:{side:[-1,1].map(side=>({side,z0:-2.30,z1:2.28,nz:26,ny:5,topAt:()=>1.34,bottomAt:()=>.90,outAt:()=>2.04}))},
  });
  P.hullG.userData.familyRebuild={donor:c.donor,turret:'t90sm_x',package:c.package,model:c.model,revision:1,concept:true};
}
export const NATIONAL_MODERNIZATION_PROFILES=Object.fromEntries(
  NATIONAL_MODERNIZATION_CONFIG.map(c=>[c.id,{build:(P:TankBuilderPort)=>build(P,c)}]));
